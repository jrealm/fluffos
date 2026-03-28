# Phase 6B：網路功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 lpc-js 新增 LPC Socket API（TCP + UDP + MUD mode）、WebSocket 玩家連線、GMCP 和 MXP 協議支援。

**Architecture:** 三個獨立模組依序實作：(1) LPC Socket API — `lpc-socket.mjs` 管理 socket 生命週期，`sockets.mjs` 註冊 efun；(2) WebSocket — 擴充 Connection 支援雙協議，用 `ws` 套件；(3) GMCP/MXP — 擴充 TelnetParser 加發送能力和選項追蹤。所有 efun 遵循現有 `reg.register(name, fn)` 模式。

**Tech Stack:** Node.js 20+, ES Modules, `node:net`, `node:dgram`, `ws` npm 套件, `node:test`

**Spec:** `docs/superpowers/specs/2026-03-28-lpc-js-phase6b-network.md`

**Testing:** `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`

---

## File Structure

### 新增檔案

| 檔案 | 職責 |
|------|------|
| `src/net/lpc-socket.mjs` | LpcSocketManager + LpcSocket — socket 生命週期管理 |
| `src/runtime/efuns/sockets.mjs` | socket_create/bind/listen/accept/connect/write/close/address/error efun |
| `src/net/protocols.mjs` | GMCP + MXP 協議邏輯 |
| `test/net/lpc-socket.test.mjs` | Socket API 測試 |
| `test/net/websocket.test.mjs` | WebSocket 測試 |
| `test/net/protocols.test.mjs` | GMCP/MXP 測試 |

### 修改檔案

| 檔案 | 修改內容 |
|------|----------|
| `src/net/telnet.mjs` | 新增靜態 sendCommand/sendSubnegotiation 方法 |
| `src/net/connection.mjs` | 新增 protocol 屬性、WebSocket 支援、gmcpEnabled/mxpEnabled、sendTelnetCommand/sendSubnegotiation |
| `src/net/server.mjs` | 新增 listenWebSocket() 方法 |
| `src/runtime/driver.mjs` | 註冊 socket/protocol efun、啟動 WebSocket、GMCP/MXP 協商 |
| `src/runtime/efuns/interactive.mjs` | 新增 websocket、has_gmcp、send_gmcp、has_mxp、act_mxp efun |
| `package.json` | 新增 `ws` 依賴 |

---

## Task 1: LPC Socket 管理器 — STREAM mode (TCP)

**Files:**
- Create: `lpc-js/src/net/lpc-socket.mjs`
- Create: `lpc-js/test/net/lpc-socket.test.mjs`

- [ ] **Step 1: Write failing tests for TCP STREAM socket**

```javascript
// test/net/lpc-socket.test.mjs
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LpcSocketManager, SOCKET_MODE, SOCKET_STATE, EESUCCESS, EEBADF, EEMODENOTSUPP, EENOTCONN } from '../../src/net/lpc-socket.mjs';

describe('LpcSocketManager', () => {
  let mgr;
  beforeEach(() => { mgr = new LpcSocketManager(); });
  afterEach(() => { mgr.closeAll(); });

  describe('create', () => {
    it('creates a STREAM socket and returns fd >= 0', () => {
      const fd = mgr.create(SOCKET_MODE.STREAM, null, 'read_cb', 'close_cb');
      assert.ok(fd >= 0);
      const sock = mgr.get(fd);
      assert.equal(sock.mode, SOCKET_MODE.STREAM);
      assert.equal(sock.state, SOCKET_STATE.UNBOUND);
    });

    it('creates multiple sockets with unique fds', () => {
      const fd1 = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      const fd2 = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      assert.notEqual(fd1, fd2);
    });
  });

  describe('bind', () => {
    it('binds to a port', () => {
      const fd = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      const result = mgr.bind(fd, 0);
      assert.equal(result, EESUCCESS);
      assert.equal(mgr.get(fd).state, SOCKET_STATE.BOUND);
    });

    it('returns error for invalid fd', () => {
      assert.equal(mgr.bind(999, 0), EEBADF);
    });
  });

  describe('TCP server/client', () => {
    it('listen, connect, write, read roundtrip', async () => {
      // Server side
      const serverFd = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      mgr.bind(serverFd, 0);

      let acceptedFd = -1;
      let receivedData = null;

      const listenResult = await new Promise((resolve) => {
        const result = mgr.listen(serverFd, (fd) => {
          // Accept the connection
          acceptedFd = mgr.accept(fd, (afd, data) => {
            receivedData = data;
          }, null);
        });
        // Give the server time to start
        setTimeout(() => resolve(result), 50);
      });
      assert.equal(listenResult, EESUCCESS);

      const port = mgr.get(serverFd).localPort;

      // Client side
      const clientFd = mgr.create(SOCKET_MODE.STREAM, null, (fd, data) => {}, 'c');

      await new Promise((resolve) => {
        mgr.connect(clientFd, `127.0.0.1 ${port}`, (fd, data) => {}, () => {
          // Connected — write data
          mgr.write(clientFd, 'hello from client');
          setTimeout(resolve, 100);
        });
      });

      assert.ok(acceptedFd >= 0, 'should have accepted a connection');
      assert.equal(receivedData, 'hello from client');

      mgr.close(clientFd);
      mgr.close(acceptedFd);
      mgr.close(serverFd);
    });
  });

  describe('close', () => {
    it('closes a socket', () => {
      const fd = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      assert.equal(mgr.close(fd), EESUCCESS);
      assert.equal(mgr.get(fd), null);
    });

    it('returns error for invalid fd', () => {
      assert.equal(mgr.close(999), EEBADF);
    });
  });

  describe('address', () => {
    it('returns address string after connect', async () => {
      const serverFd = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      mgr.bind(serverFd, 0);
      mgr.listen(serverFd, (fd) => { mgr.accept(fd, () => {}, null); });

      await new Promise(r => setTimeout(r, 50));
      const port = mgr.get(serverFd).localPort;

      const clientFd = mgr.create(SOCKET_MODE.STREAM, null, () => {}, 'c');
      await new Promise((resolve) => {
        mgr.connect(clientFd, `127.0.0.1 ${port}`, () => {}, resolve);
      });

      const addr = mgr.address(clientFd);
      assert.ok(addr.includes('127.0.0.1'), `Expected address to contain 127.0.0.1, got: ${addr}`);

      mgr.closeAll();
    });
  });

  describe('error', () => {
    it('converts error code to string', () => {
      const msg = mgr.errorString(EEBADF);
      assert.equal(typeof msg, 'string');
      assert.ok(msg.length > 0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/net/lpc-socket.test.mjs`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement LpcSocketManager**

```javascript
// src/net/lpc-socket.mjs
import net from 'node:net';
import dgram from 'node:dgram';

export const SOCKET_MODE = {
  MUD: 0, STREAM: 1, DATAGRAM: 2, STREAM_BINARY: 3, DATAGRAM_BINARY: 4,
};

export const SOCKET_STATE = {
  CLOSED: 0, UNBOUND: 1, BOUND: 2, LISTEN: 3, DATA_XFER: 4,
};

export const EESUCCESS = 0;
export const EESOCKET = -1;
export const EEFDRANGE = -2;
export const EEBADF = -3;
export const EESECURITY = -4;
export const EEISBOUND = -5;
export const EEADDRINUSE = -6;
export const EEBIND = -7;
export const EEMODENOTSUPP = -8;
export const EENOADDR = -9;
export const EEISCONN = -10;
export const EELISTEN = -11;
export const EENOTLISTN = -12;
export const EEWOULDBLOCK = -13;
export const EECONNREFUSED = -14;
export const EECONNECT = -15;
export const EENOTCONN = -16;
export const EESEND = -17;
export const EEBADADDR = -18;
export const EEBADDATA = -19;

const ERROR_MESSAGES = {
  [EESUCCESS]: 'Success',
  [EESOCKET]: 'Problem creating socket',
  [EEFDRANGE]: 'Descriptor out of range',
  [EEBADF]: 'Bad file descriptor',
  [EESECURITY]: 'Security violation',
  [EEISBOUND]: 'Socket already bound',
  [EEADDRINUSE]: 'Address already in use',
  [EEBIND]: 'Problem with bind',
  [EEMODENOTSUPP]: 'Socket mode not supported',
  [EENOADDR]: 'Socket not bound to an address',
  [EEISCONN]: 'Socket is already connected',
  [EELISTEN]: 'Problem with listen',
  [EENOTLISTN]: 'Socket is not listening',
  [EEWOULDBLOCK]: 'Operation would block',
  [EECONNREFUSED]: 'Connection refused',
  [EECONNECT]: 'Problem with connect',
  [EENOTCONN]: 'Socket not connected',
  [EESEND]: 'Problem sending data',
  [EEBADADDR]: 'Bad address format',
  [EEBADDATA]: 'Bad data',
};

class LpcSocket {
  constructor(fd, mode, owner, readCb, closeCb) {
    this.fd = fd;
    this.mode = mode;
    this.state = SOCKET_STATE.UNBOUND;
    this.owner = owner;
    this.handle = null;     // net.Socket, dgram.Socket, or null
    this.server = null;     // net.Server (listen mode only)
    this.readCb = readCb;
    this.writeCb = null;
    this.closeCb = closeCb;
    this.localPort = 0;
    this.localAddr = '0.0.0.0';
    this.remoteAddr = '';
    this.remotePort = 0;
    this.rBuf = Buffer.alloc(0);  // receive buffer (MUD mode)
    this.rExpected = -1;          // MUD mode expected length (-1 = reading header)
  }
}

export class LpcSocketManager {
  constructor() {
    this.sockets = new Map();
    this.nextFd = 0;
  }

  get(fd) {
    return this.sockets.get(fd) ?? null;
  }

  create(mode, owner, readCb, closeCb) {
    const fd = this.nextFd++;
    const sock = new LpcSocket(fd, mode, owner, readCb, closeCb);
    this.sockets.set(fd, sock);
    return fd;
  }

  bind(fd, port, addr) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.state !== SOCKET_STATE.UNBOUND) return EEISBOUND;

    sock.localPort = port;
    sock.localAddr = addr ?? '0.0.0.0';
    sock.state = SOCKET_STATE.BOUND;
    return EESUCCESS;
  }

  listen(fd, listenCb) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.state !== SOCKET_STATE.BOUND) return EENOADDR;
    if (sock.mode === SOCKET_MODE.DATAGRAM || sock.mode === SOCKET_MODE.DATAGRAM_BINARY) {
      return EEMODENOTSUPP;
    }

    sock.readCb = listenCb;
    sock.server = net.createServer((clientSocket) => {
      if (typeof sock.readCb === 'function') sock.readCb(fd);
      // Store pending socket for accept
      if (!sock._pendingClients) sock._pendingClients = [];
      sock._pendingClients.push(clientSocket);
    });

    sock.server.listen(sock.localPort, sock.localAddr, () => {
      sock.localPort = sock.server.address().port;
    });

    sock.state = SOCKET_STATE.LISTEN;
    return EESUCCESS;
  }

  accept(fd, readCb, writeCb) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.state !== SOCKET_STATE.LISTEN) return EENOTLISTN;

    const clientSocket = sock._pendingClients?.shift();
    if (!clientSocket) return EEWOULDBLOCK;

    const newFd = this.nextFd++;
    const newSock = new LpcSocket(newFd, sock.mode, sock.owner, readCb, sock.closeCb);
    newSock.writeCb = writeCb;
    newSock.handle = clientSocket;
    newSock.state = SOCKET_STATE.DATA_XFER;
    newSock.remoteAddr = clientSocket.remoteAddress?.replace(/^::ffff:/, '') ?? '';
    newSock.remotePort = clientSocket.remotePort ?? 0;

    this._setupDataHandler(newSock);
    this.sockets.set(newFd, newSock);
    return newFd;
  }

  connect(fd, addrStr, readCb, writeCb) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.mode === SOCKET_MODE.DATAGRAM || sock.mode === SOCKET_MODE.DATAGRAM_BINARY) {
      return EEMODENOTSUPP;
    }

    const parts = addrStr.split(' ');
    if (parts.length !== 2) return EEBADADDR;
    const [host, portStr] = parts;
    const port = parseInt(portStr, 10);
    if (isNaN(port)) return EEBADADDR;

    sock.readCb = readCb;
    sock.writeCb = writeCb;

    sock.handle = net.createConnection({ host, port }, () => {
      sock.state = SOCKET_STATE.DATA_XFER;
      sock.remoteAddr = host;
      sock.remotePort = port;
      if (typeof sock.writeCb === 'function') sock.writeCb(fd);
    });

    sock.handle.on('error', () => {
      if (typeof sock.closeCb === 'function') sock.closeCb(fd);
    });

    this._setupDataHandler(sock);
    return EESUCCESS;
  }

  write(fd, data, addr) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;

    if (sock.mode === SOCKET_MODE.DATAGRAM || sock.mode === SOCKET_MODE.DATAGRAM_BINARY) {
      if (!sock.handle) return EENOTCONN;
      if (!addr) return EEBADADDR;
      const parts = addr.split(' ');
      if (parts.length !== 2) return EEBADADDR;
      sock.handle.send(data, parseInt(parts[1], 10), parts[0]);
      return EESUCCESS;
    }

    if (sock.state !== SOCKET_STATE.DATA_XFER) return EENOTCONN;
    if (!sock.handle) return EENOTCONN;

    if (sock.mode === SOCKET_MODE.MUD) {
      // Serialize and prepend 4-byte length header
      const payload = Buffer.from(typeof data === 'string' ? data : String(data), 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length, 0);
      sock.handle.write(Buffer.concat([header, payload]));
    } else {
      sock.handle.write(typeof data === 'string' ? data : String(data));
    }
    return EESUCCESS;
  }

  close(fd) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;

    if (sock.server) { sock.server.close(); sock.server = null; }
    if (sock.handle) {
      if (sock.handle.end) sock.handle.end();
      else if (sock.handle.close) sock.handle.close();
      sock.handle = null;
    }
    sock.state = SOCKET_STATE.CLOSED;
    this.sockets.delete(fd);
    return EESUCCESS;
  }

  address(fd) {
    const sock = this.sockets.get(fd);
    if (!sock) return '';
    return `${sock.remoteAddr} ${sock.remotePort}`;
  }

  errorString(code) {
    return ERROR_MESSAGES[code] ?? `Unknown error: ${code}`;
  }

  closeAll() {
    for (const [fd] of this.sockets) {
      this.close(fd);
    }
  }

  _setupDataHandler(sock) {
    if (!sock.handle) return;

    if (sock.mode === SOCKET_MODE.MUD) {
      sock.handle.on('data', (buf) => this._handleMudData(sock, buf));
    } else {
      sock.handle.on('data', (buf) => {
        if (typeof sock.readCb === 'function') {
          sock.readCb(sock.fd, buf.toString('utf8'));
        }
      });
    }

    sock.handle.on('end', () => {
      if (typeof sock.closeCb === 'function') sock.closeCb(sock.fd);
      this.close(sock.fd);
    });

    sock.handle.on('error', () => {
      if (typeof sock.closeCb === 'function') sock.closeCb(sock.fd);
      this.close(sock.fd);
    });
  }

  _handleMudData(sock, buf) {
    sock.rBuf = Buffer.concat([sock.rBuf, buf]);

    while (sock.rBuf.length >= 4) {
      if (sock.rExpected < 0) {
        sock.rExpected = sock.rBuf.readUInt32BE(0);
        sock.rBuf = sock.rBuf.subarray(4);
      }

      if (sock.rBuf.length < sock.rExpected) break;

      const payload = sock.rBuf.subarray(0, sock.rExpected).toString('utf8');
      sock.rBuf = sock.rBuf.subarray(sock.rExpected);
      sock.rExpected = -1;

      if (typeof sock.readCb === 'function') {
        sock.readCb(sock.fd, payload);
      }
    }
  }

  // UDP support
  createDatagram(fd, sock) {
    sock.handle = dgram.createSocket('udp4');
    sock.handle.on('message', (msg, rinfo) => {
      const addr = `${rinfo.address} ${rinfo.port}`;
      if (typeof sock.readCb === 'function') {
        sock.readCb(sock.fd, msg.toString('utf8'), addr);
      }
    });
    sock.handle.on('error', () => {
      if (typeof sock.closeCb === 'function') sock.closeCb(sock.fd);
    });
  }

  bindDatagram(sock) {
    return new Promise((resolve) => {
      sock.handle.bind(sock.localPort, sock.localAddr, () => {
        sock.localPort = sock.handle.address().port;
        resolve();
      });
    });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd lpc-js && node --test test/net/lpc-socket.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd lpc-js && git add src/net/lpc-socket.mjs test/net/lpc-socket.test.mjs
git commit -m "feat: add LPC Socket manager with TCP STREAM and MUD mode support"
```

---

## Task 2: Socket Efuns — socket_create through socket_error

**Files:**
- Create: `lpc-js/src/runtime/efuns/sockets.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`

- [ ] **Step 1: Write failing test**

```javascript
// Append to test/net/lpc-socket.test.mjs
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerSocketEfuns } from '../../src/runtime/efuns/sockets.mjs';
import { mkInt, mkString, SVALUE_ZERO, T_INT } from '../../src/vm/svalue.mjs';

describe('socket efuns', () => {
  let reg, mgr, driver;

  beforeEach(() => {
    mgr = new LpcSocketManager();
    driver = {
      currentObject: { objectId: 'test' },
      sockets: mgr,
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerSocketEfuns(reg, driver);
  });

  afterEach(() => { mgr.closeAll(); });

  it('socket_create returns fd >= 0', () => {
    const result = reg.call('socket_create', [mkInt(1), mkString('read_cb'), mkString('close_cb')]);
    assert.ok(result.value >= 0);
  });

  it('socket_bind succeeds', () => {
    const fd = reg.call('socket_create', [mkInt(1), mkString('r'), mkString('c')]);
    const result = reg.call('socket_bind', [fd, mkInt(0)]);
    assert.equal(result.value, EESUCCESS);
  });

  it('socket_close succeeds', () => {
    const fd = reg.call('socket_create', [mkInt(1), mkString('r'), mkString('c')]);
    const result = reg.call('socket_close', [fd]);
    assert.equal(result.value, EESUCCESS);
  });

  it('socket_error returns string', () => {
    const result = reg.call('socket_error', [mkInt(EEBADF)]);
    assert.ok(result.value.length > 0);
  });
});
```

- [ ] **Step 2: Implement socket efuns**

```javascript
// src/runtime/efuns/sockets.mjs
import { mkInt, mkString, SVALUE_ZERO, T_INT, T_STRING, T_FUNCTION } from '../../vm/svalue.mjs';
import { serializeValue, deserializeValue } from './save.mjs';

export function registerSocketEfuns(reg, driver) {
  const mgr = driver.sockets;

  reg.register('socket_create', (args) => {
    const mode = args[0].value;
    const readCb = args[1]?.value ?? null;
    const closeCb = args[2]?.value ?? null;

    const owner = driver.currentObject;
    const fd = mgr.create(mode, owner, wrapCallback(driver, owner, readCb), wrapCallback(driver, owner, closeCb));
    return mkInt(fd);
  });

  reg.register('socket_bind', (args) => {
    const fd = args[0].value;
    const port = args[1].value;
    const addr = args[2]?.value ?? null;
    return mkInt(mgr.bind(fd, port, addr));
  });

  reg.register('socket_listen', (args) => {
    const fd = args[0].value;
    const listenCb = args[1]?.value ?? null;
    const owner = driver.currentObject;
    const sock = mgr.get(fd);
    if (!sock) return mkInt(-3); // EEBADF

    return mkInt(mgr.listen(fd, wrapCallback(driver, owner, listenCb)));
  });

  reg.register('socket_accept', (args) => {
    const fd = args[0].value;
    const readCb = args[1]?.value ?? null;
    const writeCb = args[2]?.value ?? null;
    const owner = driver.currentObject;

    return mkInt(mgr.accept(fd, wrapCallback(driver, owner, readCb), wrapCallback(driver, owner, writeCb)));
  });

  reg.register('socket_connect', (args) => {
    const fd = args[0].value;
    const addr = args[1].value;
    const readCb = args[2]?.value ?? null;
    const writeCb = args[3]?.value ?? null;
    const owner = driver.currentObject;

    return mkInt(mgr.connect(fd, addr, wrapCallback(driver, owner, readCb), wrapCallback(driver, owner, writeCb)));
  });

  reg.register('socket_write', (args) => {
    const fd = args[0].value;
    const msg = args[1];
    const addr = args[2]?.value ?? null;

    const sock = mgr.get(fd);
    if (!sock) return mkInt(-3);

    // MUD mode: serialize svalue
    let data;
    if (sock.mode === 0) { // MUD
      data = serializeValue(msg);
    } else {
      data = msg.type === T_STRING ? msg.value : String(msg.value);
    }

    return mkInt(mgr.write(fd, data, addr));
  });

  reg.register('socket_close', (args) => {
    return mkInt(mgr.close(args[0].value));
  });

  reg.register('socket_address', (args) => {
    return mkString(mgr.address(args[0].value));
  });

  reg.register('socket_error', (args) => {
    return mkString(mgr.errorString(args[0].value));
  });
}

function wrapCallback(driver, owner, cb) {
  if (!cb) return null;
  if (typeof cb === 'function') return cb;
  // cb is a string function name — wrap as apply
  return (...args) => {
    const svalueArgs = args.map(a => {
      if (typeof a === 'number') return mkInt(a);
      if (typeof a === 'string') return mkString(a);
      return a;
    });
    driver.apply(cb, owner, svalueArgs);
  };
}
```

- [ ] **Step 3: Register socket efuns in driver.mjs**

Add to imports in `src/runtime/driver.mjs`:

```javascript
import { registerSocketEfuns } from './efuns/sockets.mjs';
import { LpcSocketManager } from '../net/lpc-socket.mjs';
```

In constructor, after `this.bootTime = Date.now();`:

```javascript
    this.sockets = new LpcSocketManager();
```

After `registerSnoopEfuns(this.efuns, this);`:

```javascript
    registerSocketEfuns(this.efuns, this);
```

- [ ] **Step 4: Run tests**

Run: `cd lpc-js && node --test test/net/lpc-socket.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/sockets.mjs src/runtime/driver.mjs test/net/lpc-socket.test.mjs
git commit -m "feat: add socket efuns (socket_create/bind/listen/accept/connect/write/close/address/error)"
```

---

## Task 3: UDP Datagram 支援

**Files:**
- Modify: `lpc-js/src/net/lpc-socket.mjs`
- Modify: `lpc-js/test/net/lpc-socket.test.mjs`

- [ ] **Step 1: Write failing tests for UDP**

Append to `test/net/lpc-socket.test.mjs`:

```javascript
describe('UDP DATAGRAM', () => {
  let mgr;
  beforeEach(() => { mgr = new LpcSocketManager(); });
  afterEach(() => { mgr.closeAll(); });

  it('send and receive UDP datagram', async () => {
    let receivedData = null;
    let receivedAddr = null;

    // Receiver
    const recvFd = mgr.create(SOCKET_MODE.DATAGRAM, null, (fd, data, addr) => {
      receivedData = data;
      receivedAddr = addr;
    }, null);
    mgr.bind(recvFd, 0);
    mgr.createDatagram(recvFd, mgr.get(recvFd));
    await mgr.bindDatagram(mgr.get(recvFd));

    const recvPort = mgr.get(recvFd).localPort;

    // Sender
    const sendFd = mgr.create(SOCKET_MODE.DATAGRAM, null, () => {}, null);
    mgr.bind(sendFd, 0);
    mgr.createDatagram(sendFd, mgr.get(sendFd));
    await mgr.bindDatagram(mgr.get(sendFd));

    mgr.write(sendFd, 'hello udp', `127.0.0.1 ${recvPort}`);

    await new Promise(r => setTimeout(r, 100));

    assert.equal(receivedData, 'hello udp');
    assert.ok(receivedAddr.includes('127.0.0.1'));
  });

  it('listen returns EEMODENOTSUPP for DATAGRAM', () => {
    const fd = mgr.create(SOCKET_MODE.DATAGRAM, null, () => {}, null);
    mgr.bind(fd, 0);
    assert.equal(mgr.listen(fd, () => {}), EEMODENOTSUPP);
  });
});
```

- [ ] **Step 2: Run tests — verify UDP tests pass**

The UDP logic is already in the LpcSocketManager from Task 1. If `createDatagram`/`bindDatagram` aren't being called for `socket_create` with DATAGRAM mode, update `create()` to auto-initialize:

In `create()`, add after `this.sockets.set(fd, sock);`:

```javascript
    if (mode === SOCKET_MODE.DATAGRAM || mode === SOCKET_MODE.DATAGRAM_BINARY) {
      this.createDatagram(fd, sock);
    }
```

Run: `cd lpc-js && node --test test/net/lpc-socket.test.mjs`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd lpc-js && git add src/net/lpc-socket.mjs test/net/lpc-socket.test.mjs
git commit -m "feat: add UDP datagram support to LPC socket system"
```

---

## Task 4: WebSocket 支援

**Files:**
- Modify: `lpc-js/package.json`
- Modify: `lpc-js/src/net/connection.mjs`
- Modify: `lpc-js/src/net/server.mjs`
- Modify: `lpc-js/src/runtime/efuns/interactive.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Create: `lpc-js/test/net/websocket.test.mjs`

- [ ] **Step 1: Add ws dependency**

```bash
cd lpc-js && yarn add ws
```

- [ ] **Step 2: Write failing tests**

```javascript
// test/net/websocket.test.mjs
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Server } from '../../src/net/server.mjs';
import { CONN_LOGGED_IN } from '../../src/net/connection.mjs';

describe('WebSocket support', () => {
  let server;
  afterEach(() => { if (server) server.close(); });

  it('accepts WebSocket connections', async () => {
    server = new Server();
    let connectedConn = null;
    server.onConnection = (conn) => {
      connectedConn = conn;
    };

    const wsPort = await server.listenWebSocket(0);

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Wait for server to process
    await new Promise(r => setTimeout(r, 50));

    assert.ok(connectedConn, 'Should have received connection');
    assert.equal(connectedConn.protocol, 'websocket');

    ws.close();
  });

  it('receives messages from WebSocket client', async () => {
    server = new Server();
    let received = null;
    server.onConnection = (conn) => {
      conn.state = CONN_LOGGED_IN;
      conn.onLine = (line) => { received = line; };
    };

    const wsPort = await server.listenWebSocket(0);

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise(r => { ws.on('open', r); });

    await new Promise(r => setTimeout(r, 50));

    ws.send('hello from ws');
    await new Promise(r => setTimeout(r, 50));

    assert.equal(received, 'hello from ws');
    ws.close();
  });

  it('sends messages to WebSocket client', async () => {
    server = new Server();
    let conn;
    server.onConnection = (c) => { conn = c; };

    const wsPort = await server.listenWebSocket(0);

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise(r => { ws.on('open', r); });
    await new Promise(r => setTimeout(r, 50));

    const msgPromise = new Promise(r => { ws.on('message', (data) => r(data.toString())); });
    conn.send('hello from server');
    const msg = await msgPromise;
    assert.equal(msg, 'hello from server');

    ws.close();
  });
});
```

- [ ] **Step 3: Modify Connection to support WebSocket**

Rewrite `src/net/connection.mjs`:

```javascript
import { TelnetParser } from './telnet.mjs';

export const CONN_CONNECTED = 0;
export const CONN_LOGGED_IN = 1;
export const CONN_CLOSING = 2;

export class Connection {
  constructor(socket, protocol = 'telnet') {
    this.socket = socket;
    this.protocol = protocol;
    this.state = CONN_CONNECTED;
    this.object = null;
    this.inputBuffer = '';
    this.inputToCallback = null;
    this.onLine = null;
    this.onClose = null;
    this.lastInputTime = Date.now();
    this.snoopedBy = null;
    this.snooping = null;
    this.charMode = false;
    this.charCallback = null;
    this.gmcpEnabled = false;
    this.mxpEnabled = false;
    this.onGmcp = null;

    if (protocol === 'telnet') {
      this.remoteAddress = socket.remoteAddress;
      this.remotePort = socket.remotePort;
      this.telnet = new TelnetParser();
      this.telnet.onData = (buf) => this._onTelnetData(buf);
      this.telnet.onCommand = () => {};
      this.telnet.onSubnegotiation = (option, data) => this._onSubnegotiation(option, data);

      socket.on('data', (data) => this.telnet.feed(data));
      socket.on('end', () => this._onSocketEnd());
      socket.on('error', () => this._onSocketEnd());
    } else {
      // WebSocket
      this.remoteAddress = socket._socket?.remoteAddress ?? '0.0.0.0';
      this.remotePort = socket._socket?.remotePort ?? 0;
      this.telnet = null;
      this.gmcpEnabled = true; // WebSocket always supports structured data

      socket.on('message', (data) => {
        this.lastInputTime = Date.now();
        const msg = data.toString();

        // Check for GMCP JSON frame
        try {
          const parsed = JSON.parse(msg);
          if (parsed.gmcp && this.onGmcp) {
            this.onGmcp(parsed.gmcp, parsed.data);
            return;
          }
        } catch {}

        // Regular text message
        this.inputBuffer += msg;
        this._processLines();
      });

      socket.on('close', () => this._onSocketEnd());
      socket.on('error', () => this._onSocketEnd());
    }
  }

  _onTelnetData(buf) {
    this.lastInputTime = Date.now();
    this.inputBuffer += buf.toString('utf8');
    this._processLines();
  }

  _onSubnegotiation(option, data) {
    // GMCP = 201
    if (option === 201 && this.gmcpEnabled && this.onGmcp) {
      const str = Buffer.from(data).toString('utf8');
      const spaceIdx = str.indexOf(' ');
      if (spaceIdx >= 0) {
        const msg = str.slice(0, spaceIdx);
        let parsed;
        try { parsed = JSON.parse(str.slice(spaceIdx + 1)); } catch { parsed = str.slice(spaceIdx + 1); }
        this.onGmcp(msg, parsed);
      } else {
        this.onGmcp(str, null);
      }
    }
  }

  _processLines() {
    if (this.charMode && this.charCallback && this.inputBuffer.length > 0) {
      const ch = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);
      const cb = this.charCallback;
      this.charMode = false;
      this.charCallback = null;
      cb(ch);
      return;
    }

    let idx;
    while ((idx = this.inputBuffer.indexOf('\n')) >= 0) {
      const line = this.inputBuffer.slice(0, idx);
      this.inputBuffer = this.inputBuffer.slice(idx + 1);

      if (this.inputToCallback) {
        const cb = this.inputToCallback;
        this.inputToCallback = null;
        cb(line);
      } else if (this.onLine) {
        this.onLine(line);
      }
    }

    // WebSocket messages may not end with \n — process remaining buffer
    if (this.protocol === 'websocket' && this.inputBuffer.length > 0 && !this.inputBuffer.includes('\n')) {
      const line = this.inputBuffer;
      this.inputBuffer = '';
      if (this.inputToCallback) {
        const cb = this.inputToCallback;
        this.inputToCallback = null;
        cb(line);
      } else if (this.onLine) {
        this.onLine(line);
      }
    }
  }

  _onSocketEnd() {
    this.state = CONN_CLOSING;
    if (this.onClose) this.onClose(this);
  }

  send(data) {
    if (this.state === CONN_CLOSING) return;
    if (this.protocol === 'websocket') {
      if (this.socket.readyState === 1) this.socket.send(data);
    } else {
      if (this.socket) this.socket.write(data);
    }
    // Forward to snooper
    if (this.snoopedBy && this.snoopedBy.state !== CONN_CLOSING) {
      if (this.snoopedBy.protocol === 'websocket') {
        if (this.snoopedBy.socket.readyState === 1) this.snoopedBy.socket.send('% ' + data);
      } else if (this.snoopedBy.socket) {
        this.snoopedBy.socket.write('% ' + data);
      }
    }
  }

  sendGmcp(msg, data) {
    if (!this.gmcpEnabled) return;
    if (this.protocol === 'websocket') {
      const frame = JSON.stringify({ gmcp: msg, data });
      if (this.socket.readyState === 1) this.socket.send(frame);
    } else {
      // Telnet GMCP subnegotiation
      const payload = data != null ? `${msg} ${JSON.stringify(data)}` : msg;
      this.sendSubnegotiation(201, payload);
    }
  }

  sendTelnetCommand(cmd, option) {
    if (this.protocol !== 'telnet' || !this.socket) return;
    this.socket.write(Buffer.from([255, cmd, option])); // IAC cmd option
  }

  sendSubnegotiation(option, data) {
    if (this.protocol !== 'telnet' || !this.socket) return;
    const payload = Buffer.from(data, 'utf8');
    const buf = Buffer.alloc(5 + payload.length);
    buf[0] = 255; // IAC
    buf[1] = 250; // SB
    buf[2] = option;
    payload.copy(buf, 3);
    buf[3 + payload.length] = 255; // IAC
    buf[4 + payload.length] = 240; // SE
    this.socket.write(buf);
  }

  close() {
    this.state = CONN_CLOSING;
    if (this.protocol === 'websocket') {
      if (this.socket.readyState === 1) this.socket.close();
    } else {
      if (this.socket) this.socket.end();
    }
  }

  setInputTo(callback) {
    this.inputToCallback = callback;
  }
}
```

- [ ] **Step 4: Add listenWebSocket to Server**

Modify `src/net/server.mjs`:

```javascript
import net from 'node:net';
import { WebSocketServer } from 'ws';
import { Connection } from './connection.mjs';

export class Server {
  constructor() {
    this.server = null;
    this.wsServer = null;
    this.port = 0;
    this.wsPort = 0;
    this.connections = new Set();
    this.onConnection = null;
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this._handleSocket(socket));
      this.server.on('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  listenWebSocket(port) {
    return new Promise((resolve, reject) => {
      this.wsServer = new WebSocketServer({ port, host: '127.0.0.1' });
      this.wsServer.on('error', reject);
      this.wsServer.on('listening', () => {
        this.wsPort = this.wsServer.address().port;
        resolve(this.wsPort);
      });
      this.wsServer.on('connection', (ws) => {
        const conn = new Connection(ws, 'websocket');
        this.connections.add(conn);
        conn.onClose = () => { this.connections.delete(conn); };
        if (this.onConnection) this.onConnection(conn);
      });
    });
  }

  _handleSocket(socket) {
    const conn = new Connection(socket);
    this.connections.add(conn);
    conn.onClose = () => {
      this.connections.delete(conn);
    };
    if (this.onConnection) {
      this.onConnection(conn);
    }
  }

  close() {
    for (const conn of this.connections) {
      conn.close();
    }
    if (this.server) { this.server.close(); this.server = null; }
    if (this.wsServer) { this.wsServer.close(); this.wsServer = null; }
  }
}
```

- [ ] **Step 5: Add websocket efun to interactive.mjs**

Add at the end of `registerInteractiveEfuns`, before the closing `}`:

```javascript
  reg.register('websocket', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      return mkInt(obj.interactive.protocol === 'websocket' ? 1 : 0);
    }
    return SVALUE_ZERO;
  });
```

- [ ] **Step 6: Update driver.mjs to start WebSocket server**

In `startServer()`, add after `await this.server.listen(port);`:

```javascript
    const wsPort = this.config['websocket port number'];
    if (wsPort) {
      await this.server.listenWebSocket(parseInt(wsPort, 10));
    }
```

- [ ] **Step 7: Run tests**

Run: `cd lpc-js && node --test test/net/websocket.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
cd lpc-js && git add package.json yarn.lock src/net/connection.mjs src/net/server.mjs src/runtime/efuns/interactive.mjs src/runtime/driver.mjs test/net/websocket.test.mjs
git commit -m "feat: add WebSocket support with shared Connection abstraction"
```

---

## Task 5: GMCP + MXP 協議

**Files:**
- Modify: `lpc-js/src/runtime/efuns/interactive.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Create: `lpc-js/test/net/protocols.test.mjs`

- [ ] **Step 1: Write tests for GMCP and MXP efuns**

```javascript
// test/net/protocols.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerInteractiveEfuns } from '../../src/runtime/efuns/interactive.mjs';
import { mkInt, mkString, mkMapping, SVALUE_ZERO, T_OBJECT, T_STRING } from '../../src/vm/svalue.mjs';

function makeConn(protocol = 'telnet') {
  const sent = [];
  const written = [];
  return {
    send(data) { sent.push(data); },
    sendGmcp(msg, data) { sent.push({ gmcp: msg, data }); },
    sendTelnetCommand(cmd, option) { written.push({ cmd, option }); },
    sendSubnegotiation(option, data) { written.push({ sb: option, data }); },
    sent, written,
    object: null,
    protocol,
    gmcpEnabled: protocol === 'websocket',
    mxpEnabled: false,
    lastInputTime: Date.now(),
    snoopedBy: null, snooping: null,
    charMode: false, charCallback: null,
    remoteAddress: '127.0.0.1',
    setInputTo() {},
    socket: protocol === 'websocket' ? { readyState: 1, send() {} } : { write() {} },
    state: 1,
  };
}

function makeObj(name, protocol = 'telnet') {
  const conn = makeConn(protocol);
  const obj = {
    objectId: name, filename: name,
    interactive: conn, livingName: null,
    environment: null, inventory: new Set(),
    isDestructed: () => false,
    commandsEnabled: false,
  };
  conn.object = obj;
  return obj;
}

describe('GMCP efuns', () => {
  let reg, driver, player;

  beforeEach(() => {
    player = makeObj('player');
    player.interactive.gmcpEnabled = true;
    driver = {
      currentObject: player, currentPlayer: player,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map([['player', player]]) },
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('has_gmcp returns 1 when enabled', () => {
    const result = reg.call('has_gmcp', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.value, 1);
  });

  it('has_gmcp returns 0 when disabled', () => {
    player.interactive.gmcpEnabled = false;
    const result = reg.call('has_gmcp', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.value, 0);
  });

  it('send_gmcp calls connection.sendGmcp', () => {
    reg.call('send_gmcp', [mkString('Char.Vitals'), mkString('{"hp":100}')]);
    assert.equal(player.interactive.sent.length, 1);
    assert.equal(player.interactive.sent[0].gmcp, 'Char.Vitals');
  });
});

describe('MXP efuns', () => {
  let reg, driver, player;

  beforeEach(() => {
    player = makeObj('player');
    player.interactive.mxpEnabled = true;
    driver = {
      currentObject: player, currentPlayer: player,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map([['player', player]]) },
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('has_mxp returns 1 when enabled', () => {
    const result = reg.call('has_mxp', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.value, 1);
  });

  it('has_mxp returns 0 for websocket', () => {
    const wsPlayer = makeObj('ws_player', 'websocket');
    const result = reg.call('has_mxp', [{ type: T_OBJECT, value: wsPlayer }]);
    assert.equal(result.value, 0);
  });

  it('act_mxp sends subnegotiation', () => {
    driver.currentObject = player;
    reg.call('act_mxp', []);
    // Should have sent IAC SB 91 IAC SE
    assert.ok(player.interactive.written.some(w => w.sb === 91));
  });
});

describe('websocket efun', () => {
  let reg, driver;

  beforeEach(() => {
    driver = {
      currentObject: null, currentPlayer: null,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map() },
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('websocket returns 1 for ws connection', () => {
    const wsPlayer = makeObj('ws', 'websocket');
    const result = reg.call('websocket', [{ type: T_OBJECT, value: wsPlayer }]);
    assert.equal(result.value, 1);
  });

  it('websocket returns 0 for telnet connection', () => {
    const telnetPlayer = makeObj('telnet', 'telnet');
    const result = reg.call('websocket', [{ type: T_OBJECT, value: telnetPlayer }]);
    assert.equal(result.value, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/net/protocols.test.mjs`
Expected: FAIL with "Unknown efun: has_gmcp"

- [ ] **Step 3: Add GMCP, MXP, websocket efuns to interactive.mjs**

Add at the end of `registerInteractiveEfuns`, before the closing `}` (after the `websocket` efun from Task 4):

```javascript
  reg.register('has_gmcp', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      return mkInt(obj.interactive.gmcpEnabled ? 1 : 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('send_gmcp', (args) => {
    const msg = args[0].value;
    let data = args[1]?.value ?? null;
    // Try to parse string data as JSON for structured GMCP
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch {}
    }
    if (driver.currentObject?.interactive) {
      driver.currentObject.interactive.sendGmcp(msg, data);
    }
    return SVALUE_ZERO;
  });

  reg.register('has_mxp', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      // MXP is Telnet-only
      if (obj.interactive.protocol === 'websocket') return mkInt(0);
      return mkInt(obj.interactive.mxpEnabled ? 1 : 0);
    }
    return SVALUE_ZERO;
  });

  reg.register('act_mxp', () => {
    if (driver.currentObject?.interactive) {
      const conn = driver.currentObject.interactive;
      if (conn.protocol === 'telnet' && conn.mxpEnabled) {
        conn.sendSubnegotiation(91, '');
      }
    }
    return SVALUE_ZERO;
  });
```

- [ ] **Step 4: Add GMCP/MXP negotiation to driver._handleNewConnection**

In `src/runtime/driver.mjs`, in `_handleNewConnection()`, after `conn.onLine = ...`:

```javascript
    // Set up GMCP receive handler
    conn.onGmcp = (msg, data) => {
      if (loginObj && !loginObj.isDestructed()) {
        this.currentObject = loginObj;
        this.currentPlayer = loginObj;
        apply('receive_gmcp', loginObj, [mkString(msg), data != null ? mkString(JSON.stringify(data)) : SVALUE_ZERO]);
        this.currentObject = null;
        this.currentPlayer = null;
      }
    };

    // Negotiate GMCP and MXP for Telnet connections
    if (conn.protocol === 'telnet') {
      conn.sendTelnetCommand(251, 201); // IAC WILL GMCP
      conn.sendTelnetCommand(251, 91);  // IAC WILL MXP

      conn.telnet.onCommand = (cmd, option) => {
        if (cmd === 253 && option === 201) conn.gmcpEnabled = true;  // DO GMCP
        if (cmd === 254 && option === 201) conn.gmcpEnabled = false; // DONT GMCP
        if (cmd === 253 && option === 91) conn.mxpEnabled = true;    // DO MXP
        if (cmd === 254 && option === 91) conn.mxpEnabled = false;   // DONT MXP
      };
    }
```

- [ ] **Step 5: Run tests**

Run: `cd lpc-js && node --test test/net/protocols.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/interactive.mjs src/runtime/driver.mjs src/net/connection.mjs test/net/protocols.test.mjs
git commit -m "feat: add GMCP and MXP protocol support with has_gmcp, send_gmcp, has_mxp, act_mxp efuns"
```

---

## Task 6: 最終整合測試與 README 更新

**Files:**
- All modified files
- Modify: `lpc-js/README.md`

- [ ] **Step 1: Run full test suite**

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 2: Fix any failures**

Diagnose and fix. Common issues:
- Import path errors after Connection rewrite
- `ws` module not found (ensure `yarn add ws` was run)
- Existing telnet tests may need updated Connection constructor call

- [ ] **Step 3: Update README.md**

Add to the efun list in `lpc-js/README.md`:

**Socket API:**
- `socket_create`、`socket_bind`、`socket_listen`、`socket_accept`、`socket_connect`、`socket_write`、`socket_close`、`socket_address`、`socket_error`

**WebSocket:**
- `websocket`

**MUD 協議：**
- `has_gmcp`、`send_gmcp`、`has_mxp`、`act_mxp`

Update the count (~130 → ~145+).

Add a "WebSocket 支援" section describing:
- Telnet 和 WebSocket 並行監聽
- 共用 Connection 抽象
- GMCP over WebSocket 使用 JSON frame

- [ ] **Step 4: Commit**

```bash
cd lpc-js && git add -A
git commit -m "docs: update README with Phase 6B network features (~145 efuns)"
```
