# Phase 6B：網路功能

## 概述

為 lpc-js 新增完整的網路功能：LPC Socket API（TCP + UDP + MUD mode）、WebSocket 玩家連線、GMCP 和 MXP 協議支援。完成後 lpc-js 將具備與 FluffOS 2.28 相當的網路能力。

## 設計決策

- **架構方案：** 按協議層拆分為三個獨立模組 — Socket API、WebSocket、MUD 協議。每層獨立可測試，依序實作。
- **WebSocket：** 作為 Telnet 的替代方案，與 Telnet 共用 Connection 抽象，走相同 `master->connect()` 流程。LPC 層無感。
- **WebSocket 實作：** 使用 `ws` npm 套件（輕量、零依賴、battle-tested）。
- **GMCP：** 完整支援協商、收發 JSON 資料。
- **MXP：** 基本啟用（`has_mxp`、`act_mxp`），mudlib 自行在輸出中嵌入 MXP 標記，驅動器不解析 tag。

## §1 LPC Socket API

新建 `src/net/lpc-socket.mjs`（Socket 管理器）和 `src/runtime/efuns/sockets.mjs`（efun 註冊）。

### Socket 模式

| 模式 | 常數 | 協議 | 說明 |
|------|------|------|------|
| `MUD` | 0 | TCP | FluffOS 專有：4 byte 長度標頭（network byte order）+ 序列化 svalue |
| `STREAM` | 1 | TCP | 標準 TCP stream，收發字串 |
| `DATAGRAM` | 2 | UDP | UDP datagram，無連線 |
| `STREAM_BINARY` | 3 | TCP | 同 STREAM 但強制 binary（buffer 型別） |
| `DATAGRAM_BINARY` | 4 | UDP | 同 DATAGRAM 但強制 binary |

### Socket 狀態機

```
CLOSED → UNBOUND → BOUND → LISTEN (server)
                         → DATA_XFER (client/accepted)
```

| 狀態 | 常數 | 說明 |
|------|------|------|
| `CLOSED` | 0 | 未使用或已關閉 |
| `UNBOUND` | 1 | 已建立但未綁定 |
| `BOUND` | 2 | 已綁定位址 |
| `LISTEN` | 3 | 監聽中（TCP server） |
| `DATA_XFER` | 4 | 資料傳輸中（已連線） |

### LpcSocketManager

```javascript
class LpcSocketManager {
  sockets;    // Map<number, LpcSocket> — fd → socket
  nextFd;     // 下一個可用 fd

  create(mode, owner, readCb, closeCb)  // → fd
  bind(fd, port, addr?)
  listen(fd, listenCb)
  accept(fd, readCb, writeCb)           // → new fd
  connect(fd, addr, readCb, writeCb)
  write(fd, data, addr?)
  close(fd)
  address(fd)                            // → "ip port" 字串
}
```

### LpcSocket 結構

```javascript
class LpcSocket {
  fd;           // 分配的 fd 編號
  mode;         // Socket 模式
  state;        // 當前狀態
  owner;        // 擁有此 socket 的 LpcObject
  handle;       // Node.js net.Socket 或 dgram.Socket
  server;       // Node.js net.Server（僅 listen 時）
  readCb;       // read callback 名稱或 closure
  writeCb;      // write callback 名稱或 closure
  closeCb;      // close callback 名稱或 closure
  rBuf;         // 接收緩衝區（MUD mode 用）
  rExpected;    // MUD mode 預期的資料長度
}
```

### Efun 清單

| Efun | 簽名 | 說明 |
|------|------|------|
| `socket_create` | `socket_create(int mode, string\|function read_cb, string\|function close_cb?)` | 建立 socket，回傳 fd（>= 0）或負數錯誤碼 |
| `socket_bind` | `socket_bind(int fd, int port, string addr?)` | 綁定位址。addr 省略用 `0.0.0.0` |
| `socket_listen` | `socket_listen(int fd, string\|function listen_cb)` | 開始監聽。DATAGRAM 不可用 |
| `socket_accept` | `socket_accept(int fd, string\|function read_cb, string\|function write_cb?)` | 接受連線，回傳新 fd |
| `socket_connect` | `socket_connect(int fd, string addr, string\|function read_cb, string\|function write_cb?)` | 連線到遠端。addr 格式 `"ip port"` |
| `socket_write` | `socket_write(int fd, mixed msg, string addr?)` | 發送資料。MUD mode 可發任意 svalue |
| `socket_close` | `socket_close(int fd)` | 關閉 socket |
| `socket_address` | `socket_address(int fd)` | 回傳遠端位址 `"ip port"` |
| `socket_error` | `socket_error(int errcode)` | 錯誤碼轉可讀字串 |

### 錯誤碼

| 常數 | 值 | 說明 |
|------|------|------|
| `EESUCCESS` | 0 | 成功 |
| `EESOCKET` | -1 | socket 建立失敗 |
| `EEFDRANGE` | -2 | fd 超出範圍 |
| `EEBADF` | -3 | 無效的 fd |
| `EESECURITY` | -4 | 非 socket 擁有者 |
| `EEISBOUND` | -5 | 已綁定 |
| `EEADDRINUSE` | -6 | 位址已被使用 |
| `EEBIND` | -7 | 綁定失敗 |
| `EEMODENOTSUPP` | -8 | 模式不支援此操作 |
| `EENOADDR` | -9 | 未綁定位址 |
| `EEISCONN` | -10 | 已連線 |
| `EELISTEN` | -11 | 監聽失敗 |
| `EENOTLISTN` | -12 | 非監聽狀態 |
| `EEWOULDBLOCK` | -13 | 會阻塞 |
| `EECONNREFUSED` | -14 | 連線被拒 |
| `EECONNECT` | -15 | 連線失敗 |
| `EENOTCONN` | -16 | 未連線 |
| `EESEND` | -17 | 發送失敗 |
| `EEBADADDR` | -18 | 無效位址格式 |
| `EEBADDATA` | -19 | 資料格式錯誤 |

### Callback 簽名

| 場景 | 簽名 | 說明 |
|------|------|------|
| MUD read | `read_cb(int fd, mixed value)` | 反序列化的 LPC 值 |
| STREAM read | `read_cb(int fd, string data)` | 字串資料 |
| DATAGRAM read | `read_cb(int fd, string data, string addr)` | 資料 + 來源位址 |
| Listen | `listen_cb(int fd)` | 有新連線，呼叫 `socket_accept` |
| Write | `write_cb(int fd)` | socket 可寫 |
| Close | `close_cb(int fd)` | socket 關閉 |

### MUD Mode 封包格式

```
[4 bytes: network byte order length][serialized svalue data]
```

- 發送：用 `serializeValue()` 序列化，prepend 4 byte 長度
- 接收：先讀 4 byte header 得長度，再讀完整資料，用 `deserializeValue()` 反序列化
- 使用已有的 `save.mjs` 中的序列化函數

## §2 WebSocket 支援

新建 `src/net/websocket.mjs`，使用 `ws` npm 套件。

### Server 擴充

`src/net/server.mjs` 新增 `listenWebSocket(port)` 方法：

```javascript
async listenWebSocket(port) {
  const wss = new WebSocketServer({ port });
  wss.on('connection', (ws, req) => {
    const conn = new Connection(ws, 'websocket');
    this.onConnection(conn);
  });
}
```

### Connection 擴充

`Connection` 新增 `protocol` 屬性：

- `'telnet'`：現有行為，經過 TelnetParser
- `'websocket'`：直接收文字 message，不需 Telnet 協議層

```javascript
class Connection {
  constructor(socket, protocol = 'telnet') {
    this.protocol = protocol;
    if (protocol === 'telnet') {
      // 現有 Telnet 初始化
    } else {
      // WebSocket 初始化：監聽 'message'、'close' 事件
    }
  }

  send(data) {
    if (this.protocol === 'websocket') {
      this.socket.send(data);
    } else {
      this.socket.write(data);
    }
    // snoop 轉發（現有邏輯）
  }
}
```

### 新增 Efun

| Efun | 簽名 | 說明 |
|------|------|------|
| `websocket` | `websocket(object?)` | 回傳 1 如果連線是 WebSocket，0 如果是 Telnet |

### 連線流程

1. WebSocket client 連入
2. `ws` 處理握手
3. 建立 `Connection(ws, 'websocket')`
4. 走相同 `master->connect()` → `logon()` 流程
5. 之後的 `write()`、`tell_object()` 等走 `Connection.send()`，自動用 `ws.send()`

### 配置

runtime config 新增：
- `websocket port number`：WebSocket 監聽 port（省略則不啟用）

## §3 GMCP + MXP 協議

新建 `src/net/protocols.mjs` 處理協議邏輯，修改 `src/net/telnet.mjs` 擴充發送能力。

### Telnet 層改動

`TelnetParser` 新增：
- `sendCommand(socket, cmd, option)` — 發送 `IAC cmd option`（如 `IAC WILL GMCP`）
- `sendSubnegotiation(socket, option, data)` — 發送 `IAC SB option data IAC SE`
- `negotiatedOptions` — `Map<number, boolean>` 追蹤已啟用的選項

`Connection` 新增：
- `gmcpEnabled: false`
- `mxpEnabled: false`
- `sendTelnetCommand(cmd, option)` — 委派給 TelnetParser
- `sendSubnegotiation(option, data)` — 委派給 TelnetParser

### GMCP（Telnet option 201）

**協商：**
1. 新連線時，server 送 `IAC WILL 201`
2. Client 回 `IAC DO 201` → `conn.gmcpEnabled = true`
3. Client 回 `IAC DONT 201` → GMCP 不可用

**發送 GMCP：**
```
IAC SB 201 <package.message> <JSON> IAC SE
```

例：`send_gmcp("Char.Vitals", (["hp": 100, "mp": 50]))`
→ `IAC SB 201 Char.Vitals {"hp":100,"mp":50} IAC SE`

**接收 GMCP：**
當收到 `IAC SB 201 ... IAC SE` 時：
1. 解析 package.message 和 JSON data
2. 在玩家物件上呼叫 `receive_gmcp(message_string, data_value)` apply

**新增 efun：**

| Efun | 簽名 | 說明 |
|------|------|------|
| `has_gmcp` | `has_gmcp(object?)` | 回傳 1 如果 client 支援 GMCP |
| `send_gmcp` | `send_gmcp(string msg, mixed data?)` | 發送 GMCP 訊息 |

### MXP（Telnet option 91）

**協商：**
1. Server 送 `IAC WILL 91`
2. Client 回 `IAC DO 91` → `conn.mxpEnabled = true`

**啟用：** `act_mxp()` 送 `IAC SB 91 IAC SE` 切換到 MXP mode。

之後 mudlib 在輸出中自行嵌入 MXP 標記（如 `<send>look</send>`），驅動器不解析。

**新增 efun：**

| Efun | 簽名 | 說明 |
|------|------|------|
| `has_mxp` | `has_mxp(object?)` | 回傳 1 如果 client 支援 MXP |
| `act_mxp` | `act_mxp()` | 對當前連線啟用 MXP mode |

### WebSocket + GMCP

WebSocket 連線不走 Telnet，所以 GMCP 用獨立格式：

- `send_gmcp` 對 WebSocket 連線送 JSON frame：`{"gmcp": "Char.Vitals", "data": {"hp": 100}}`
- WebSocket client 送來的 JSON 若含 `gmcp` 欄位，視為 GMCP 訊息，觸發 `receive_gmcp` apply
- `has_gmcp` 對 WebSocket 連線永遠回傳 1（WebSocket 天生支援結構化資料）

MXP 對 WebSocket 不適用（MXP 是 Telnet 專有），`has_mxp` 對 WebSocket 回傳 0。

## §4 測試策略

- **Socket API：** 建立 TCP server/client 對測，UDP 收發測試，MUD mode 序列化/反序列化測試
- **WebSocket：** 用 `ws` client 連入測試完整流程（connect → logon → command → response）
- **GMCP：** 模擬 Telnet 協商，測試 send/receive GMCP 訊息
- **MXP：** 測試協商和 has_mxp/act_mxp
- **整合：** 確保 Telnet 和 WebSocket 並行工作

## §5 檔案變更清單

| 操作 | 檔案 | 說明 |
|------|------|------|
| 新建 | `src/net/lpc-socket.mjs` | LpcSocketManager + LpcSocket 類別 |
| 新建 | `src/runtime/efuns/sockets.mjs` | socket_create/bind/listen/accept/connect/write/close/address/error efun |
| 新建 | `src/net/websocket.mjs` | WebSocket server 包裝 |
| 新建 | `src/net/protocols.mjs` | GMCP + MXP 協議邏輯 |
| 修改 | `src/net/telnet.mjs` | 新增 sendCommand/sendSubnegotiation、選項追蹤 |
| 修改 | `src/net/connection.mjs` | 新增 protocol、gmcpEnabled、mxpEnabled、WebSocket 支援 |
| 修改 | `src/net/server.mjs` | 新增 listenWebSocket() |
| 修改 | `src/runtime/driver.mjs` | 註冊 socket efun、啟動 WebSocket、GMCP/MXP 協商、receive_gmcp apply |
| 修改 | `src/runtime/efuns/interactive.mjs` | 新增 has_gmcp、send_gmcp、has_mxp、act_mxp、websocket efun |
| 修改 | `package.json` | 新增 `ws` 依賴 |
| 新建 | `test/net/lpc-socket.test.mjs` | Socket API 測試 |
| 新建 | `test/net/websocket.test.mjs` | WebSocket 測試 |
| 新建 | `test/net/protocols.test.mjs` | GMCP/MXP 測試 |
