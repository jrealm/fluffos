# Phase 6A：語言完整度

## 概述

補齊 lpc-js 與 FluffOS 2.28 之間的語言功能差距。包含三大區塊：sprintf 完整實作、常用 efun 補齊、bit 字串操作。完成後 lpc-js 將具備運行真實 mudlib 所需的大部分語言功能。

## 設計決策

- **方案選擇：** Phase 6 拆為 6A（語言完整度）和 6B（網路功能），先語言後網路。語言改動獨立可測試，且網路功能可能依賴尚未補齊的 efun。
- **efun 範圍：** 補齊常用 efun，跳過冷門功能（ed 編輯器、opcprof、debug 系列）。
- **sprintf：** 完整相容 FluffOS，包含 `%O`、column/table mode、所有旗標。

## §1 sprintf 完整實作

目前的 sprintf 只支援 `%s`/`%d`/`%%`（`src/runtime/efuns/misc.mjs:49-59`），用簡單的 regex replace 實作。需完全重寫為獨立模組 `src/runtime/efuns/sprintf.mjs`，手寫解析器逐字元處理格式字串。

### 格式規範符

| 規範符 | 型別 | 說明 |
|--------|------|------|
| `%s` | 字串 | 字串輸出，null 印 `(nil)`。可搭配 column mode（`=`）或 table mode（`#`） |
| `%d` / `%i` | 整數 | 十進位整數 |
| `%f` | 浮點 | 浮點數，精度控制小數位數 |
| `%c` | 字元 | 單一字元（從整數值轉換） |
| `%o` | 八進位 | 八進位整數 |
| `%x` | 十六進位 | 小寫 a-f |
| `%X` | 十六進位 | 大寫 A-F |
| `%O` | LPC 值 | 遞迴列印任意 LPC 值，深度上限 20 層 |
| `%%` | 字面 | 輸出 `%` 字元 |

### 旗標與修飾符

| 旗標 | 說明 |
|------|------|
| `-` | 左對齊（預設右對齊） |
| `\|` | 置中對齊 |
| `+` | 正數前顯示 `+` 號 |
| ` `（空格） | 正數前留空格 |
| `0` | 零填充（數字型別） |
| `=` | Column mode — 對 `%s` 做自動斷行，在空格處折行。需指定寬度 |
| `#` | Table mode — 對 `%s` 將空格/換行分隔的字串排列成表格。精度可指定欄數 |
| `@` | Array mode — 對陣列每個元素分別套用格式規範 |
| `'X'` | 自訂填充字元，`X` 為任意字元，支援 `\'` 和 `\\` 跳脫 |

### 寬度與精度

格式：`%[flags][width][.precision]specifier`

| 元素 | 語法 | 行為 |
|------|------|------|
| 寬度 | `n` 或 `*` | 欄位大小（字元數）。`*` 從下一個參數讀取 |
| 精度 | `.n` 或 `.*` | 字串：最大字元數。整數：最少位數（零填充）。浮點：小數位數。表格：欄數 |
| 冒號 | `:n` 或 `:*` | 同時設定寬度和精度為相同值 |

### `%O` 遞迴列印

對不同型別的輸出格式：
- `T_INT`：十進位數字
- `T_FLOAT`：浮點數
- `T_STRING`：雙引號包裹
- `T_ARRAY`：`({ /* sizeof() == N */` + 縮排元素 + `})`
- `T_MAPPING`：`([ /* sizeof() == N */` + 縮排 key: value + `])`
- `T_OBJECT`：物件名稱
- `T_CLASS`：`CLASS( N elements` 格式
- `T_FUNCTION`：函數/閉包描述
- 深度超過 20 層印 `...`

### Column Mode（`=`）

搭配寬度使用（如 `%=30s`）：
- 將字串自動斷行以符合欄位寬度
- 在空格處折行
- 輸出包含換行符
- 需指定寬度，否則報錯

### Table Mode（`#`）

搭配寬度使用（如 `%#40s`）：
- 將空格或換行分隔的字串排列成表格
- 欄位寬度平分給各欄
- 精度可指定欄數（如 `%#40.3s` = 3 欄），省略則自動計算
- 自動平衡以填滿最後一列

### 實作架構

新建 `src/runtime/efuns/sprintf.mjs`：
- `efun_sprintf(args)` — 主入口
- `parseFormatSpec(fmt, pos)` — 解析單一格式規範（旗標、寬度、精度、規範符）
- `formatValue(spec, value)` — 依規範符格式化單一值
- `formatColumn(text, width)` — column mode 斷行
- `formatTable(text, width, numCols)` — table mode 排列
- `svalueToString(svalue, indent)` — `%O` 遞迴列印

在 `misc.mjs` 中移除舊的 sprintf 註冊，改為匯入新模組。

## §2 常用 efun 補齊

### 通訊類（加到 `interactive.mjs`）

| Efun | 簽名 | 說明 |
|------|------|------|
| `say` | `say(string msg, object\|object* exclude?)` | 向同房間所有物件呼叫 `receive_message()`（排除自己或指定物件） |
| `tell_room` | `tell_room(object room, string msg, object\|object* exclude?)` | 向指定房間所有物件發送訊息 |
| `shout` | `shout(string msg)` | 向所有 interactive 物件廣播 |
| `receive` | `receive(string msg)` | 直接送入玩家 socket 輸出（不經 `receive_message` apply） |
| `get_char` | `get_char(string\|function callback, int flag?)` | 讀取單一字元輸入（類似 `input_to` 但不等換行） |

**say 實作細節：**
- 取得 `this_object()` 的 `environment()`
- 遍歷 `all_inventory(env)` + env 本身
- 排除 `this_object()` 和 `exclude` 參數指定的物件
- 對每個物件呼叫 `receive_message("say", msg, obj)`

**tell_room 實作細節：**
- 類似 `say` 但指定房間物件
- 遍歷 `all_inventory(room)` + room 本身
- 排除 `exclude` 指定的物件

### 查詢類

| Efun | 歸屬檔案 | 簽名 | 說明 |
|------|----------|------|------|
| `query_ip_number` | interactive.mjs | `query_ip_number(object?)` | 回傳連線的 IP 位址字串。從 `connection.socket.remoteAddress` 取得 |
| `query_ip_name` | interactive.mjs | `query_ip_name(object?)` | 同 `query_ip_number`（簡化實作，不做 DNS 反查） |
| `query_idle` | interactive.mjs | `query_idle(object)` | 回傳閒置秒數。需在 Connection 加 `lastInputTime` 追蹤 |
| `query_host_name` | misc.mjs | `query_host_name()` | 回傳 MUD 主機名（從 config 或 `os.hostname()` 取得） |
| `function_exists` | objects.mjs | `function_exists(string func, object obj?, int flag?)` | 檢查函數是否存在於物件的 program 中。回傳定義該函數的檔名，不存在回傳 0 |
| `call_stack` | misc.mjs | `call_stack(int type?)` | type=0: 函數名陣列。type=1: program 名陣列。type=2: 物件陣列。type=3: origin 陣列 |
| `objects` | driver.mjs | `objects(string func?, object obj?)` | 無參數：回傳所有物件陣列。有 func：回傳 func(obj) 為真的物件 |
| `first_inventory` | objects.mjs | `first_inventory(object)` | 回傳容器中第一個物件 |
| `next_inventory` | objects.mjs | `next_inventory(object)` | 回傳同容器中的下一個物件。需在 inventory 加順序支援 |
| `livings` | driver.mjs | `livings()` | 回傳所有設定了 living name 的物件陣列 |
| `commands` | commands.mjs | `commands()` | 回傳當前物件可用的 `({ verb, func, obj })` 陣列 |
| `origin` | misc.mjs | `origin()` | 回傳呼叫來源類型字串（`"driver"`/`"efun"`/`"local"`/`"call_other"` 等） |

### 系統控制類

| Efun | 歸屬檔案 | 簽名 | 說明 |
|------|----------|------|------|
| `shutdown` | driver.mjs | `shutdown(int exit_code?)` | 關閉伺服器、清理所有連線，呼叫 `process.exit()` |
| `call_out_info` | driver.mjs | `call_out_info()` | 回傳所有 pending call_out 的陣列，每項為 `({ obj, func, delay, args... })` |
| `memory_info` | misc.mjs | `memory_info(object?)` | 回傳 `process.memoryUsage()` 的 heapUsed。有 object 參數則估算該物件大小 |
| `mud_status` | misc.mjs | `mud_status(int verbose?)` | 回傳 MUD 狀態字串（物件數、連線數、uptime 等） |
| `uptime` | misc.mjs | `uptime()` | 回傳驅動器運行秒數（`Date.now() - bootTime`） |
| `ctime` | misc.mjs | `ctime(int timestamp?)` | 時間戳轉可讀字串（類似 C 的 ctime 格式） |

### 檔案操作類（加到 `files.mjs`）

| Efun | 簽名 | 說明 |
|------|------|------|
| `read_bytes` | `read_bytes(string file, int start?, int length?)` | 讀取位元組，回傳 buffer |
| `write_bytes` | `write_bytes(string file, int start, string data)` | 從指定位置寫入位元組 |
| `cp` | `cp(string src, string dst)` | 複製檔案。回傳 0 成功，-1 失敗 |
| `rename` | `rename(string old, string new)` | 重新命名/移動檔案。回傳 0 成功，-1 失敗 |

### 序列化類（加到 `save.mjs`）

| Efun | 簽名 | 說明 |
|------|------|------|
| `save_variable` | `save_variable(mixed value)` | 將任意 LPC 值序列化為字串（使用與 `save_object` 相同的格式） |
| `restore_variable` | `restore_variable(string data)` | 將序列化字串反序列化為 LPC 值 |

### Snoop 系統（新建 `src/runtime/efuns/snoop.mjs`）

| Efun | 簽名 | 說明 |
|------|------|------|
| `snoop` | `snoop(object snooper, object target?)` | 讓 snooper 監聽 target 的所有 I/O。無 target 則停止監聽 |
| `query_snoop` | `query_snoop(object)` | 回傳誰在監聽此物件（或 0） |
| `query_snooping` | `query_snooping(object)` | 回傳此物件正在監聽誰（或 0） |

**Snoop 實作細節：**
- 在 Connection 上加 `snoopedBy` 和 `snooping` 屬性
- 當被監聽物件收到輸入時，複製一份給監聽者（加前綴 `% `）
- 當被監聽物件有輸出時，複製一份給監聽者
- 巢狀監聽（A snoop B, B snoop C）需防止循環

## §3 Bit 字串操作

新建 `src/runtime/efuns/bits.mjs`。

FluffOS 用字串來儲存 bit array，每個字元存 6 bits，使用 base 63 編碼（字元 ASCII 值 - 0x30，即 `'0'` = 0）。

| Efun | 簽名 | 說明 |
|------|------|------|
| `set_bit` | `set_bit(string bitstr, int bit)` | 設定指定位元為 1，回傳新字串 |
| `clear_bit` | `clear_bit(string bitstr, int bit)` | 清除指定位元為 0，回傳新字串 |
| `test_bit` | `test_bit(string bitstr, int bit)` | 測試指定位元，回傳 0 或 1 |
| `next_bit` | `next_bit(string bitstr, int start)` | 從 start 開始找下一個為 1 的位元位置，無則回傳 -1 |

**編碼規則：**
- Bit N 存在 `str[N / 6]` 的第 `N % 6` 個 bit
- 字元值 = `str.charCodeAt(pos) - 0x30`
- 設定 bit：`char | (1 << (N % 6))`，再加回 0x30
- 字串長度按需自動擴展，不足時用 `'0'`（值 0）填充

## §4 測試策略

每個新增功能都需配套測試：

- **sprintf：** 每個格式規範符獨立測試 + 組合測試（旗標 × 寬度 × 精度）。特別針對 column mode、table mode、`%O`、array mode 做邊界測試
- **efun：** 每個新增 efun 至少 3-5 個測試案例，涵蓋正常路徑和錯誤路徑
- **bit 操作：** 邊界測試（bit 0、跨字元邊界、空字串、大 bit 位置）

測試檔案放在 `test/` 目錄下，與現有測試結構一致。

## §5 檔案變更清單

| 操作 | 檔案 | 說明 |
|------|------|------|
| 新建 | `src/runtime/efuns/sprintf.mjs` | sprintf 完整實作 |
| 新建 | `src/runtime/efuns/bits.mjs` | bit 字串操作 |
| 新建 | `src/runtime/efuns/snoop.mjs` | snoop 系統 |
| 修改 | `src/runtime/efuns/misc.mjs` | 移除舊 sprintf，新增 ctime/uptime/call_stack/origin/memory_info/mud_status/query_host_name |
| 修改 | `src/runtime/efuns/interactive.mjs` | 新增 say/tell_room/shout/receive/get_char/query_ip_*/query_idle |
| 修改 | `src/runtime/efuns/objects.mjs` | 新增 function_exists/first_inventory/next_inventory |
| 修改 | `src/runtime/efuns/files.mjs` | 新增 read_bytes/write_bytes/cp/rename |
| 修改 | `src/runtime/efuns/save.mjs` | 新增 save_variable/restore_variable |
| 修改 | `src/runtime/driver.mjs` | 新增 objects/livings/shutdown/call_out_info，加 bootTime 追蹤 |
| 修改 | `src/runtime/commands.mjs` | 新增 commands() efun 支援 |
| 修改 | `src/runtime/efuns.mjs` | 註冊所有新 efun |
| 修改 | `src/net/connection.mjs` | 新增 lastInputTime/snoop 屬性、get_char 支援 |
| 新建 | `test/efuns/sprintf.test.mjs` | sprintf 測試 |
| 新建 | `test/efuns/bits.test.mjs` | bit 操作測試 |
| 新建 | `test/efuns/snoop.test.mjs` | snoop 測試 |
| 新建 | `test/efuns/communication.test.mjs` | say/tell_room/shout 測試 |
| 新建 | `test/efuns/query.test.mjs` | 查詢類 efun 測試 |
| 新建 | `test/efuns/system.test.mjs` | 系統控制類 efun 測試 |
