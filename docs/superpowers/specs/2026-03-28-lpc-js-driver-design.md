# LPC-JS: FluffOS 2.28 相容 LPC 驅動器 (JavaScript 實作)

## 概述

用純 JavaScript (ES Modules) 在 Node.js 上重新實作完整相容 FluffOS 2.28 的 LPC MUD 驅動器。採用傳統編譯管線架構：Preprocessor → Lexer → Parser → AST → Bytecode → Stack-based VM。

## 設計決策

- **方案選擇：** 編譯到自訂位元碼 + JS 虛擬機（而非轉譯為 JS 或 AST 直譯），因為與 FluffOS 行為最容易 1:1 相容，MUD 場景是 I/O 密集而非 CPU 密集，轉譯的效能優勢不是瓶頸。
- **語言：** 純 JavaScript (ESM)，無 TypeScript，無編譯步驟。
- **運行時策略：** 編譯器 + VM 為核心，I/O 和網路用 Node.js 原生能力薄包裝（fs、net、timers）。

## 專案結構

```
lpc-js/
├── src/
│   ├── compiler/
│   │   ├── lexer.mjs          # 詞法分析器
│   │   ├── preprocessor.mjs   # #include, #define, #ifdef, #pragma
│   │   ├── parser.mjs         # Recursive descent parser → AST
│   │   ├── ast.mjs            # AST 節點型別定義
│   │   ├── codegen.mjs        # AST → 位元碼
│   │   ├── optimizer.mjs      # AST 層級最佳化（常數摺疊等）
│   │   └── types.mjs          # 型別系統（檢查、推導）
│   ├── vm/
│   │   ├── machine.mjs        # 堆疊式 VM 主迴圈
│   │   ├── opcodes.mjs        # Opcode 定義與編碼
│   │   ├── program.mjs        # Program 結構（對應 program_t）
│   │   ├── svalue.mjs         # 運行時值（對應 svalue_t）
│   │   └── stack.mjs          # 值堆疊與呼叫堆疊
│   ├── runtime/
│   │   ├── object.mjs         # LPC 物件生命週期（load/clone/destruct）
│   │   ├── efuns.mjs          # 內建函數註冊表
│   │   ├── efuns/             # 各類 efun 實作（按類別分檔）
│   │   │   ├── strings.mjs
│   │   │   ├── arrays.mjs
│   │   │   ├── mappings.mjs
│   │   │   ├── objects.mjs
│   │   │   ├── files.mjs
│   │   │   ├── sockets.mjs
│   │   │   └── ...
│   │   ├── master.mjs         # Master 物件介面
│   │   ├── simul_efun.mjs     # Simulated efun 載入
│   │   └── apply.mjs          # Apply 機制（call_other, heart_beat 等）
│   ├── net/
│   │   ├── server.mjs         # Telnet/TCP 監聽
│   │   ├── connection.mjs     # 玩家連線管理
│   │   └── websocket.mjs      # WebSocket 支援
│   ├── driver.mjs             # 主入口：啟動、事件迴圈、config 載入
│   └── config.mjs             # 執行時設定檔解析（相容 FluffOS Config 格式）
├── test/
│   └── ...
└── package.json
```

## §1 編譯器前端

### Preprocessor

獨立的預處理階段（與 lexer 解耦，提高可測試性），處理：

- `#include "file"` 和 `#include <file>` — 支援巢狀 include，配合 config 的 `include directories`
- `#define` / `#undef` — 支援帶參數的巨集 `#define MAX(a,b) ((a)>(b)?(a):(b))`
- `#ifdef` / `#ifndef` / `#if` / `#else` / `#elif` / `#endif` — 條件編譯
- `#pragma` — `strict_types`、`save_types`、`optimize`、`warnings` 等
- FluffOS 特有：`options.h` 中的 `#define FOO` 在 LPC 中可見為 `__FOO__`

輸入：檔案路徑 + include 搜尋路徑。
輸出：展開後的原始碼串流，附帶檔案/行號追蹤資訊（用於錯誤報告）。

### Lexer

手寫 lexer，逐字元掃描產生 token：

- **Token 類型：** 關鍵字（`if`、`while`、`return`、`inherit`、`string`、`mapping`、...）、識別符、整數、浮點數、字串字面量、運算子、分隔符
- **特殊語法：** `::` (scope resolution)、`->` (call_other)、`({`/`})` (array literal)、`([`/`])` (mapping literal)、`(:`/`:)` (function pointer)
- 每個 token 攜帶 `{ type, value, line, file }`

### Parser (Recursive Descent)

手寫遞迴下降解析器，對照 FluffOS `grammar.y` 實作相同語法規則，產出 AST。

**運算子優先序（低到高）：** 逗號 → 賦值 (`=`, `+=`, ...) → 三元 `?:` → `||` → `&&` → `|` → `^` → `&` → 相等 → 比較 → 位移 → 加減 → 乘除模 → 一元 → 後綴 → 主要

**語法結構：**
- **宣告：** `inherit "file"`、全域變數、函數定義/原型、class 定義
- **陳述：** `if`/`else`、`while`、`do-while`、`for`、`foreach`、`switch`/`case`、`return`、`break`/`continue`
- **表達式：** 算術、比較、邏輯、賦值、call_other (`obj->func()`)、function pointer (`(: func :)`)、array/mapping 字面量、index `[]`、range `[i..j]`

### AST 節點

```js
// 範例：x = foo->bar(1, "hello");
{
  type: "AssignExpression",
  operator: "=",
  left: { type: "Identifier", name: "x" },
  right: {
    type: "CallOther",
    object: { type: "Identifier", name: "foo" },
    method: "bar",
    args: [
      { type: "IntLiteral", value: 1 },
      { type: "StringLiteral", value: "hello" }
    ]
  }
}
```

## §2 位元碼與 VM

### Opcode 設計

語義等價於 FluffOS 但針對 JS 優化的位元碼格式。用 `Uint8Array` 儲存，每條指令 1 byte opcode + 可變長度運算元。

| 類別 | 指令 | 說明 |
|------|------|------|
| 推值 | `PUSH_INT`, `PUSH_STRING`, `PUSH_FLOAT`, `PUSH_0`, `PUSH_1` | 常數壓堆疊 |
| 變數 | `LOAD_LOCAL`, `STORE_LOCAL`, `LOAD_GLOBAL`, `STORE_GLOBAL` | 變數存取 |
| 算術 | `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `NEGATE` | 彈值運算後壓回 |
| 比較 | `EQ`, `NE`, `LT`, `LE`, `GT`, `GE` | 結果為 0/1 |
| 位元 | `BITAND`, `BITOR`, `BITXOR`, `LSH`, `RSH`, `BITNOT` | |
| 跳轉 | `JUMP`, `JUMP_IF_ZERO`, `JUMP_IF_NONZERO` | 2 byte offset |
| 函數 | `CALL_LOCAL`, `CALL_EFUN`, `CALL_OTHER`, `CALL_SIMUL`, `RETURN` | 附帶 arg count |
| 複合賦值 | `ADD_EQ`, `SUB_EQ`, `MUL_EQ`, `DIV_EQ` 等 | 對 lvalue 操作 |
| 集合 | `INDEX`, `INDEX_LVALUE`, `RANGE`, `MAKE_ARRAY`, `MAKE_MAPPING` | |
| 物件 | `CALL_INHERITED`, `THIS_OBJECT` | 繼承呼叫 |
| 迴圈 | `FOREACH_INIT`, `FOREACH_NEXT`, `FOREACH_END` | |
| 特殊 | `CATCH`, `END_CATCH`, `SWITCH`, `POP`, `DUP` | |

### Program 結構

```js
class Program {
  filename;         // 來源檔名
  bytecode;         // Uint8Array
  functions;        // Array<{ name, numArgs, numLocals, offset, flags, type }>
  strings;          // Array<string> — 字串常數池
  inherits;         // Array<{ program, funcOffset, varOffset, typeMod }>
  variables;        // Array<{ name, type }>
  classes;          // Array<{ name, members: [{ name, type }] }>
  lineNumbers;      // 位元碼偏移 → 原始碼行號映射
  argumentTypes;    // 每個函數的參數型別資訊
}
```

### svalue（運行時值）

```js
{ type: T_INT,      value: 42 }
{ type: T_STRING,   value: "hello" }
{ type: T_ARRAY,    value: [svalue, ...] }
{ type: T_MAPPING,  value: Map }
{ type: T_OBJECT,   value: LpcObject }
{ type: T_FLOAT,    value: 3.14 }
{ type: T_FUNCTION, value: { obj, prog, offset } }
{ type: T_BUFFER,   value: Uint8Array }
{ type: T_CLASS,    value: { def, members: [] } }
```

後續可優化：`T_INT` 和 `T_STRING` 直接用 JS 原生值在堆疊上傳遞，僅在需要型別判斷時包裝。

### VM 主迴圈

```js
class Machine {
  stack;          // 值堆疊 (Array of svalue)
  callStack;      // 呼叫堆疊 (Array of { pc, program, fp, locals })
  pc;             // 程式計數器
  currentProgram; // 當前 Program

  execute(program, functionName, args) {
    // 查找函數 → 設定 frame → 進入主迴圈
  }

  run() {
    while (true) {
      const op = this.currentProgram.bytecode[this.pc++];
      switch (op) {
        case OP.PUSH_INT:   /* ... */ break;
        case OP.ADD:        /* ... */ break;
        case OP.CALL_LOCAL: /* ... */ break;
        case OP.RETURN:     /* ... */ break;
        // ...
      }
    }
  }
}
```

**eval cost 機制：** 每執行一條指令遞減計數器，歸零時拋出 RuntimeError，對應 FluffOS 的 `max_eval_cost`。

## §3 運行時系統

### LPC 物件

```js
class LpcObject {
  filename;         // 物件路徑（身份識別）
  program;          // 編譯後的 Program
  variables;        // Array<svalue> — 全域變數值
  flags;            // O_HEART_BEAT, O_CLONE, O_DESTRUCTED, ...
  cloneNumber;      // 0 = master copy, >0 = clone
  environment;      // 所在容器物件
  inventory;        // Set<LpcObject>
  interactive;      // 若為玩家，關聯的 Connection
}
```

**物件管理器：**
- **load：** 讀取 `.c` → 編譯 → 建立 master copy → 呼叫 `create()`
- **clone：** 共用 Program，獨立 variables → 呼叫 `create()`
- **destruct：** 標記 `O_DESTRUCTED`，從環境移除，下個 tick 清理
- **物件表：** `Map<string, LpcObject>` 按 filename 索引，clone 用 `filename#N`
- **inherit 解析：** 編譯時遇到 `inherit "path"` → 遞迴載入編譯

### Efun 系統

統一註冊介面，每個 efun 是一個 JS 函數：

```js
// efuns/strings.mjs
export function efun_capitalize(sv) {
  assertType(sv, T_STRING);
  const s = sv.value;
  return mkString(s.charAt(0).toUpperCase() + s.slice(1));
}

// efuns.mjs
const registry = new Map();
export function register(name, fn, minArgs, maxArgs, returnType) { ... }
export function lookup(name) { return registry.get(name); }
```

完整實作 FluffOS `func_spec.c` 中定義的所有 efun。I/O 相關包裝 Node.js `fs`，socket 相關包裝 `net`。

### Apply 機制

```js
function apply(funcName, object, args) {
  // 在 object.program 中查找函數
  // 找到 → VM.execute(object, funcName, args)
  // 未找到 → 靜默返回 0
}
```

**關鍵 apply：**
- Master：`connect()`、`valid_read()`、`valid_write()`、`compile_object()`、`error_handler()`
- 一般物件：`create()`、`init()`、`heart_beat()`、`clean_up()`、`reset()`
- 互動物件：`receive_message()`、`logon()`、`process_input()`

## §4 事件迴圈與計時

### 集中式時間輪

避免大量 `setTimeout` 造成精度漂移和 GC 壓力。用單一 `setInterval` 驅動時間輪：

```js
class CallOutManager {
  queue;         // 最小堆（按到期時間排序）
  tickInterval;  // 例如 100ms

  start() {
    this.timer = setInterval(() => this.tick(), this.tickInterval);
  }

  tick() {
    const now = Date.now();
    while (this.queue.length > 0 && this.queue.peek().expireAt <= now) {
      const entry = this.queue.pop();
      if (!entry.cancelled) {
        apply(entry.func, entry.object, entry.args);
      }
    }
  }

  add(func, object, delaySec, args) {
    const entry = {
      func, object, args,
      expireAt: Date.now() + delaySec * 1000,
      cancelled: false
    };
    this.queue.push(entry);
    return entry;
  }

  remove(object, func) {
    const entry = this.find(object, func);
    if (entry) entry.cancelled = true; // lazy deletion
  }
}
```

### 主迴圈

整個驅動器只用一個主 tick 計時器：

```js
class Driver {
  start(configPath) {
    this.config = parseConfig(configPath);
    this.objects = new ObjectManager(this);
    this.vm = new Machine(this);
    this.master = this.objects.load(this.config.masterFile);
    this.simulEfun = this.objects.load(this.config.simulEfunFile);
    this.server = new Server(this.config.port, this.onConnection.bind(this));

    setInterval(() => this.mainLoop(), 100);
  }

  mainLoop() {
    this.callOuts.tick();
    this.heartBeatTick();
    this.resetTick();
  }
}
```

## §5 網路層

### Connection

```js
class Connection {
  socket;          // Node.js net.Socket
  object;          // 關聯的 LpcObject
  inputBuffer;     // 未處理的輸入緩衝
  outputBuffer;    // 輸出緩衝（批次寫入）
  state;           // CONNECTED, LOGGED_IN, CLOSING
  telnetState;     // Telnet IAC 狀態機
}
```

### 連線流程

1. TCP 連入 → 建立 Connection
2. `master->connect()` → 回傳 login 物件
3. `logon()` apply
4. 玩家輸入 → `process_input()` 或 `input_to()` 回呼
5. 輸出 → `receive_message()` / `write()` → 寫入 socket

### Telnet 協議

基本 Telnet IAC 命令序列解析：`WILL/WONT/DO/DONT` 選項協商、`SB...SE` 子選項（NAWS 等）。過濾控制碼，純文字傳給 LPC 層。

### 命令系統 (add_action)

```js
class CommandManager {
  actions = new Map(); // object → [{ verb, func, flag }]

  addAction(object, func, verb, flag) { ... }

  dispatch(player, input) {
    const [verb, ...rest] = input.split(' ');
    const arg = rest.join(' ');
    // 搜尋：player + environment + environment.inventory
    for (const obj of this.getSearchList(player)) {
      for (const action of (this.actions.get(obj) || [])) {
        if (this.matchVerb(verb, action)) {
          const result = apply(action.func, obj, [arg]);
          if (result?.value) return;
        }
      }
    }
    // 未匹配 → notify_fail
  }
}
```

### WebSocket

用 `ws` 套件或類似方案，與 Telnet 共用 Connection 抽象。WebSocket 連入走相同 `master->connect()` 流程，不需 Telnet 協議解析。

## §6 繼承、型別系統與錯誤處理

### 多重繼承

```js
class InheritResolver {
  resolve(currentProgram, inheritPath, typeMod) {
    const parent = compiler.compile(inheritPath);
    const funcOffset = currentProgram.functions.length;
    for (const func of parent.functions) {
      if (func.flags & FUNC_PRIVATE) continue;
      currentProgram.functions.push({
        ...func, flags: func.flags | FUNC_INHERITED
      });
    }
    const varOffset = currentProgram.variables.length;
    for (const v of parent.variables) {
      if (v.flags & VAR_PRIVATE) continue;
      currentProgram.variables.push(v);
    }
    currentProgram.inherits.push({ program: parent, funcOffset, varOffset, typeMod });
  }
}
```

- `::func()` → `CALL_INHERITED` opcode，VM 根據 inherit 表查找
- `replace_program` → 標記待替換，下一個主迴圈 tick 安全時執行

### 型別系統

可選的編譯時型別檢查（`#pragma strict_types` 啟用）：

```js
const LPC_TYPES = {
  UNKNOWN: 0, ANY: 1, VOID: 2, INT: 3, STRING: 4,
  OBJECT: 5, MAPPING: 6, FUNCTION: 7, FLOAT: 8, BUFFER: 9, MIXED: 10
};
const TYPE_MOD_ARRAY = 0x100;
const TYPE_MOD_CLASS = 0x200;
```

- strict 模式下檢查賦值和函數參數型別相容性
- `mixed` 型別接受任何值
- 運行時：某些運算隱式轉型（如 `string + int` → 串接），依照 FluffOS 行為

### 錯誤處理

**編譯時：** `CompileError { message, file, line }` — 編譯失敗呼叫 `master->error_handler()`

**運行時：** `RuntimeError { message, object, tracebacks }` — 包含呼叫堆疊追蹤

**LPC catch 機制：**

```js
case OP.CATCH: {
  const endOffset = this.readShort();
  const savedSp = this.stack.length;
  const savedCsp = this.callStack.length;
  try {
    // 繼續執行到 END_CATCH
  } catch (e) {
    if (e instanceof RuntimeError) {
      this.stack.length = savedSp;
      this.callStack.length = savedCsp;
      this.push(mkString(e.message));
      this.pc = endOffset;
    } else throw e;
  }
  break;
}
```

未捕獲錯誤 → `master->error_handler(error, caught)` 由 mudlib 處理。
