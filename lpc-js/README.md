# LPC-JS

FluffOS 2.28 相容的 LPC MUD 驅動器，用純 JavaScript (ES Modules) 在 Node.js 上實作。

## 需求

- Node.js 20+
- Yarn 4+

## 快速開始

```bash
yarn install  # 安裝依賴
yarn test     # 執行所有測試
```

## 架構

```
原始碼 → Preprocessor → Lexer → Parser → AST → Codegen → Bytecode → VM
```

### 編譯器 (`src/compiler/`)

| 檔案 | 說明 |
|------|------|
| `preprocessor.mjs` | C 風格預處理器（`#define`、`#include`、`#ifdef`、`#pragma`） |
| `lexer.mjs` | 手寫詞法分析器，支援所有 LPC 語法（`({`/`})`、`->`、`(:`/`:)` 等） |
| `parser.mjs` | 遞迴下降語法分析器，產出 AST |
| `ast.mjs` | AST 節點工廠函數 |
| `codegen.mjs` | AST → 位元碼產生器，支援繼承解析 |
| `types.mjs` | LPC 型別常數與相容性檢查 |

### 虛擬機 (`src/vm/`)

| 檔案 | 說明 |
|------|------|
| `machine.mjs` | 堆疊式 VM 主迴圈（switch dispatch） |
| `opcodes.mjs` | Opcode 定義（50+ 指令） |
| `program.mjs` | 編譯後的程式結構（位元碼 + 函數表 + 字串池 + 繼承表） |
| `svalue.mjs` | 運行時值型別（int、string、float、array、mapping、object） |

### 運行時 (`src/runtime/`)

| 檔案 | 說明 |
|------|------|
| `driver.mjs` | 驅動器主入口，整合所有子系統 |
| `object.mjs` | LpcObject（clone、moveTo、destruct） |
| `object-manager.mjs` | 物件載入/複製/銷毀，自動呼叫 `create()` |
| `apply.mjs` | Apply 機制（在物件上呼叫 LPC 函數） |
| `efuns.mjs` | Efun 註冊表 |
| `efuns/*.mjs` | 內建函數實作（strings、arrays、mappings、misc、interactive） |
| `callout.mjs` | 時間輪（最小堆），管理 `call_out` |
| `commands.mjs` | `add_action` 命令系統 |
| `config.mjs` | FluffOS 格式設定檔解析 |

### 網路 (`src/net/`)

| 檔案 | 說明 |
|------|------|
| `server.mjs` | TCP 伺服器（Node.js `net` 模組） |
| `connection.mjs` | 玩家連線（行緩衝、`input_to`） |
| `telnet.mjs` | Telnet IAC 協議解析器 |

## 已實作的 Efun (~95 個)

**字串：** `capitalize`、`lower_case`、`upper_case`、`strlen`、`implode`、`explode`、`replace_string`、`trim`、`strsrch`、`sscanf`、`sprintf`

**陣列：** `sizeof`、`member_array`、`sort_array`、`unique_array`、`allocate`、`filter_array`、`map_array`

**映射：** `keys`、`values`、`map_delete`、`allocate_mapping`

**型別謂詞：** `typeof`、`to_int`、`to_string`、`to_float`、`intp`、`stringp`、`floatp`、`arrayp`、`mapp`、`objectp`、`functionp`、`undefinedp`、`clonep`、`userp`、`living`

**物件：** `this_object`、`clone_object`、`destruct`、`find_object`、`move_object`、`environment`、`object_name`、`base_name`、`file_name`、`all_inventory`、`deep_inventory`、`present`、`load_object`、`children`、`find_living`、`find_player`、`inherits`、`users`

**互動：** `write`、`tell_object`、`message`、`input_to`、`interactive`、`add_action`、`notify_fail`、`this_player`、`query_verb`、`enable_commands`、`disable_commands`、`command`

**計時：** `call_out`、`remove_call_out`、`set_heart_beat`、`query_heart_beat`

**權限：** `getuid`、`geteuid`、`seteuid`、`export_uid`

**函數指標：** `evaluate`、`functionp`

**檔案 I/O：** `read_file`、`write_file`、`file_size`、`mkdir`、`rm`、`get_dir`、`stat`、`log_file`

**持久化：** `save_object`、`restore_object`

**正規表達式：** `regexp`、`reg_assoc`、`pcre_match`

**進階：** `exec`、`replace_program`、`shadow`、`query_shadowing`、`error`、`catch`、`throw`

**雜湊/加密：** `hash`、`crypt`

**時間：** `random`、`time`、`localtime`

**資料庫：** `db_connect`、`db_exec`、`db_close`、`db_fetch`

## 已實作的語言特性

- Lambda/閉包 `(: func :)`、`(: $1 + 1 :)`
- catch/throw 異常處理
- Heredoc 字串 `@TAG...TAG`
- 負索引 `arr[<1]`、反向範圍 `str[0..<2]`
- foreach mapping `foreach(k, v in mapping)`
- class 宣告與 `new(class X)` 實例化
- `::func()` 繼承呼叫
- 多重繼承
- Shadow 物件攔截
- replace_program

## 使用範例

```js
import { Driver } from './src/runtime/driver.mjs';

const driver = new Driver(
  {
    'name': 'MyMUD',
    'mudlib directory': '/path/to/mudlib',
    'master file': '/obj/master',
    'port number': '4000',
  },
  {
    readFile: (path) => fs.readFileSync(path, 'utf8'),
  }
);

// 載入 master 物件
driver.objects.load('/obj/master.c');

// 啟動 Telnet 伺服器
await driver.startServer(4000);

// 主迴圈（call_out + heart_beat）
setInterval(() => driver.mainLoop(), 100);
```

## 連線流程

1. 玩家 Telnet 連入
2. `master->connect()` 回傳 login 物件
3. `logon()` 被呼叫
4. 玩家輸入 → `process_input()` → `add_action` 命令匹配
5. 輸出 → `write()` / `tell_object()` → 寫入 socket

## 設計文件

- [設計規格](../docs/superpowers/specs/2026-03-28-lpc-js-driver-design.md)
