# Phase 7: 驅動器安全、穩定性與 Mudlib 啟動流程

## 概述

為 lpc-js 補齊 FluffOS 2.28 相容的驅動器功能，涵蓋安全檢查、錯誤處理、simul_efun、物件生命週期排程、資源限制，以及完整的 mudlib 啟動流程。

**實作策略：** 由內而外——先做基礎設施（traceback），再逐層建構依賴它的功能。

**實作順序：**
1. VM Traceback 基礎設施
2. Error Handler + Heart Beat 錯誤處理
3. Valid_* 安全檢查
4. Simul_efun 機制
5. Epilog/Preload 啟動流程
6. Reset/Clean_up 排程
7. Call_out 數量限制

---

## §1 VM Traceback 基礎設施

### 問題

目前 `machine.mjs` 的 callStack 只存 `{ pc, program, fp, locals }`，無法產生有意義的堆疊追蹤。`call_stack()` efun 回傳空陣列。

### 設計

擴充每個 call frame 記錄：

```js
{
  pc, program, fp, locals,
  functionName,   // 當前執行的函數名
  fileName,       // program.filename
  object,         // 執行此函數的 LpcObject
}
```

新增 traceback 收集方法：

```js
// machine.mjs
collectTraceback(errorMessage) {
  const frames = [];
  // 當前正在執行的 frame（尚未 push 到 callStack）
  if (this.currentProgram) {
    frames.push({
      function: this.currentFunction,
      file: this.currentProgram.filename,
      line: this.currentProgram.getLine(this.pc),
      object: this.currentObject?.filename ?? '<none>',
    });
  }
  // callStack 中的呼叫鏈（從頂端往下）
  for (let i = this.callStack.length - 1; i >= 0; i--) {
    const frame = this.callStack[i];
    const line = frame.program.getLine(frame.pc);
    frames.push({
      function: frame.functionName,
      file: frame.fileName,
      line,
      object: frame.object?.filename ?? '<none>',
    });
  }
  return { message: errorMessage, frames };
}
```

修正 `call_stack()` efun：從 `machine.callStack` 讀取真實資料，回傳函數名陣列（FluffOS 相容格式）。

---

## §2 Error Handler 與 Heart Beat 錯誤處理

### error_handler Master Apply

當未捕獲的 RuntimeError 發生時，driver 呼叫 `master->error_handler(error_info, caught)`。

`error_info` 是 LPC mapping：

```
([
  "error":   "Index out of range",
  "program": "/obj/monster.c",
  "object":  "/obj/monster#42",
  "line":    37,
  "trace":   ({
    ([ "function": "attack", "program": "/obj/monster.c",
       "object": "/obj/monster#42", "line": 37 ]),
    ([ "function": "heart_beat", "program": "/obj/monster.c",
       "object": "/obj/monster#42", "line": 12 ]),
  })
])
```

`caught` 參數：`0` 表示完全未捕獲，`1` 表示在 catch 區塊內。

呼叫點：`machine.mjs` 的 `execute()` 外層 try-catch，以及所有 driver 層級的 apply 呼叫點（heart_beat、call_out、input 處理等）。

### Heart Beat 錯誤處理

```js
heartBeatTick() {
  for (const obj of this.heartBeatList) {
    if (obj.isDestructed()) continue;
    this.currentObject = obj;
    try {
      apply('heart_beat', obj, []);
      obj.heartBeatErrors = 0; // 成功 → 重置計數
    } catch (e) {
      this.callErrorHandler(e, 0);
      obj.heartBeatErrors = (obj.heartBeatErrors ?? 0) + 1;
      if (obj.heartBeatErrors >= this.config.maxHeartBeatErrors) {
        obj.flags &= ~O_HEART_BEAT;
        this.heartBeatList.delete(obj);
      }
    }
  }
  this.currentObject = null;
}
```

連續錯誤閾值預設 10 次（可透過 config `max heart beat errors` 設定）。

---

## §3 Valid_* 安全檢查

### 四個 Valid Applies

| Master Apply | 觸發時機 | 參數 | 回傳 |
|---|---|---|---|
| `valid_read(path, ob, func)` | `read_file`、`read_bytes`、`file_size`、`get_dir`、`stat` | 檔案路徑、發起物件、efun 名 | 字串（允許的路徑）或 `0`（拒絕） |
| `valid_write(path, ob, func)` | `write_file`、`write_bytes`、`cp`、`rename`、`rm`、`mkdir`、`log_file` | 同上 | 同上 |
| `valid_bind(ob, owner, func)` | `bind()` 函數指標 | 物件、擁有者、函數名 | `1`（允許）或 `0` |
| `valid_socket(ob, func, args...)` | `socket_create`、`socket_bind`、`socket_listen`、`socket_connect` | 發起物件、操作名、操作特定參數 | `1`（允許）或 `0` |

### 共用檢查函數

```js
function checkFileAccess(driver, type, path, func) {
  const ob = driver.currentObject;
  const applyName = type === 'read' ? 'valid_read' : 'valid_write';
  const result = apply(applyName, driver.master, [
    mkString(path), ob ?? mkInt(0), mkString(func)
  ]);
  if (result?.type === T_STRING) return result.value; // 允許，回傳可能修改的路徑
  if (result?.value) return path;                      // 非零 → 用原路徑
  return null;                                         // 0 → 拒絕
}
```

拒絕時拋出 RuntimeError（經由 error_handler 回報）。

Master 尚未載入時（啟動階段）暫時允許所有操作，與 FluffOS 行為一致。

---

## §4 Simul_efun 機制

### 啟動載入

Master 載入後呼叫 `master->get_simul_efun()` 取得檔案路徑，載入該物件，掃描所有 public 函數並註冊。

優先級：內建 efun > simul_efun（simul_efun 不覆蓋內建 efun）。

### 自動重載

呼叫 simul_efun 時若物件已 destruct，自動重新載入：

```js
class Driver {
  simulEfunObject = null;
  simulEfunNames = new Set();

  loadSimulEfun() {
    const path = apply('get_simul_efun', this.master, []);
    if (!path || path.type !== T_STRING) return;
    this.simulEfunObject = this.objects.load(path.value);
    this.simulEfunNames.clear();
    for (const func of this.simulEfunObject.program.functions) {
      if (!(func.flags & FUNC_PRIVATE)) {
        this.simulEfunNames.add(func.name);
      }
    }
  }

  callSimulEfun(name, args) {
    if (!this.simulEfunObject || this.simulEfunObject.isDestructed()) {
      this.loadSimulEfun();
    }
    if (this.simulEfunNames.has(name)) {
      return apply(name, this.simulEfunObject, args);
    }
    throw new RuntimeError(`Unknown efun: ${name}`);
  }
}
```

### 編譯器整合

Codegen 遇到未知函數呼叫時查 `driver.simulEfunNames`，命中則生成 `CALL_SIMUL` opcode。

---

## §5 Epilog/Preload 啟動流程

### 完整啟動順序

```
1. 解析 config
2. 載入 master 物件 → 呼叫 master->create()
3. 呼叫 master->get_simul_efun() → 載入 simul_efun
4. 呼叫 master->epilog() → 回傳字串陣列（預載物件路徑）
5. 對每個路徑呼叫 master->preload(path)，印出進度
6. 啟動網路監聽
7. 進入主迴圈
```

### Preload 進度輸出

```js
async boot() {
  // ... 載入 master、simul_efun ...

  const preloadList = apply('epilog', this.master, []);
  if (preloadList?.type === T_ARRAY) {
    const paths = preloadList.value;
    console.log(`Preloading ${paths.length} objects...`);
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path?.type !== T_STRING) continue;
      console.log(`[${i + 1}/${paths.length}] ${path.value}`);
      try {
        apply('preload', this.master, [path]);
      } catch (e) {
        console.error(`  Failed: ${e.message}`);
        this.callErrorHandler(e, 0);
      }
    }
    console.log('Preload complete.');
  }

  await this.startServer(this.config.port);
}
```

單個 preload 失敗不阻斷其他物件載入。失敗透過 error_handler 回報。

---

## §6 Reset 與 Clean_up 排程

### reset()

每個物件追蹤時間戳：

```js
class LpcObject {
  nextReset;   // 下次 reset 時間（epoch ms）
  lastAccess;  // 最後被存取的時間（epoch ms）
}
```

- 載入/clone 時設定 `nextReset = now + resetInterval`（config `time to reset`，預設 1800 秒）
- 加入隨機偏移（±15%）避免同時 reset
- `lastAccess` 在每次 apply 時更新
- 只 reset 最近被存取過的物件（`lastAccess >= nextReset - resetInterval`）

```js
resetTick() {
  const now = Date.now();
  for (const obj of this.objects.all()) {
    if (obj.isDestructed()) continue;
    if (obj.nextReset > now) continue;
    if (obj.lastAccess < obj.nextReset - this.resetInterval) continue;

    obj.nextReset = now + this.jitteredResetInterval();
    try {
      apply('reset', obj, []);
    } catch (e) {
      this.callErrorHandler(e, 0);
    }
  }
}
```

### clean_up()

- 獨立週期（config `time to clean up`，預設 900 秒）
- 針對長時間無存取、非 interactive、無 heart_beat 的物件
- `clean_up()` 回傳 `1` 表示已處理，`0` 表示不清理（延後下次檢查）

```js
cleanUpTick() {
  const now = Date.now();
  for (const obj of this.objects.all()) {
    if (obj.isDestructed()) continue;
    if (obj.interactive) continue;
    if (obj.flags & O_HEART_BEAT) continue;
    if (now - obj.lastAccess < this.cleanUpInterval) continue;

    try {
      const result = apply('clean_up', obj, []);
      if (!result?.value) {
        obj.lastAccess = now; // 不清理，延後
      }
    } catch (e) {
      this.callErrorHandler(e, 0);
    }
  }
}
```

主迴圈更新：

```js
mainLoop() {
  this.callOuts.tick();
  this.heartBeatTick();
  this.resetTick();
  this.cleanUpTick();
  this._processReplaceProgramQueue();
}
```

效能：先用簡單全遍歷，物件數量大時可改分桶掃描。

---

## §7 Call_out 數量限制

### 限制

| 限制 | Config 鍵 | 預設值 |
|------|-----------|--------|
| 全域上限 | `max call outs` | 1000 |

FluffOS 不做單物件限制，我們也不做。

### 實作

```js
// callout.mjs
add(func, object, delaySec, args) {
  if (this.queue.size >= this.maxCallOuts) {
    throw new RuntimeError(
      `Too many call_outs (max ${this.maxCallOuts})`
    );
  }
  // ... 現有邏輯 ...
}
```

`maxCallOuts` 從 config 讀取，未設定則預設 1000。

---

## 新增 Config 鍵

| Config 鍵 | 預設值 | 說明 |
|-----------|--------|------|
| `time to reset` | 1800 | 物件 reset 週期（秒） |
| `time to clean up` | 900 | 物件 clean_up 週期（秒） |
| `max call outs` | 1000 | call_out 全域上限 |
| `max heart beat errors` | 10 | heart_beat 連續錯誤閾值 |

---

## 測試策略

每個功能模組獨立測試：

1. **Traceback** — 建構多層呼叫，驗證 frame 資訊正確
2. **Error handler** — 觸發未捕獲錯誤，驗證 master 收到正確 error_info
3. **Heart beat 錯誤** — 模擬連續錯誤，驗證物件被移除
4. **Valid_*** — 模擬 master 回傳允許/拒絕，驗證檔案操作對應行為
5. **Simul_efun** — 載入、呼叫、destruct 後重載
6. **Epilog/preload** — 驗證啟動順序和進度輸出
7. **Reset/clean_up** — 用假時鐘驗證排程觸發條件
8. **Call_out 限制** — 超限時拋出錯誤
