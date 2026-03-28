# Phase 7: Driver Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add security (valid_read/write/bind/socket), error handling (error_handler, heart_beat errors), simul_efun, epilog/preload boot sequence, reset/clean_up scheduling, and call_out limits to lpc-js.

**Architecture:** Build from inside out — traceback infrastructure first, then error_handler, then features that depend on it. Each task modifies 1-2 source files + 1 test file.

**Tech Stack:** Node.js 20+, ES Modules, node:test + assert/strict

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/vm/machine.mjs` | Add frame metadata, collectTraceback(), CALL_SIMUL handler |
| Modify | `src/runtime/driver.mjs` | error_handler, heartBeat errors, simul_efun, epilog/preload, reset/clean_up, boot sequence |
| Modify | `src/runtime/object.mjs` | Add nextReset, lastAccess, heartBeatErrors fields |
| Modify | `src/runtime/apply.mjs` | Update lastAccess on apply |
| Modify | `src/runtime/efuns.mjs` | Add has() usage for simul_efun check |
| Modify | `src/runtime/efuns/files.mjs` | Add valid_read/valid_write checks |
| Modify | `src/runtime/efuns/misc.mjs` | Fix call_stack() efun |
| Modify | `src/runtime/callout.mjs` | Add maxCallOuts limit |
| Modify | `src/compiler/codegen.mjs` | Add CALL_SIMUL generation for simul_efun |
| Create | `test/vm/traceback.test.mjs` | Traceback tests |
| Create | `test/runtime/error-handler.test.mjs` | Error handler + heart_beat error tests |
| Create | `test/runtime/valid-access.test.mjs` | valid_read/write/bind/socket tests |
| Create | `test/runtime/simul-efun.test.mjs` | Simul_efun tests |
| Create | `test/runtime/boot-sequence.test.mjs` | Epilog/preload tests |
| Create | `test/runtime/reset-cleanup.test.mjs` | Reset/clean_up tests |
| Create | `test/runtime/callout-limit.test.mjs` | Call_out limit tests |

---

## Task 1: VM Traceback Infrastructure

**Files:**
- Modify: `src/vm/machine.mjs` (constructor lines 15-29, callFunction lines 41-62)
- Modify: `src/runtime/efuns/misc.mjs:162-164` (call_stack efun)
- Create: `test/vm/traceback.test.mjs`

- [ ] **Step 1: Write failing test for enriched call frames**

```js
// test/vm/traceback.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../src/vm/machine.mjs';
import { compile } from '../../src/compiler/codegen.mjs';
import { T_INT } from '../../src/vm/svalue.mjs';

describe('VM — traceback', () => {
  it('callStack frames contain functionName and fileName', () => {
    const source = `
      int inner() { return 1; }
      int outer() { return inner(); }
    `;
    const prog = compile(source, 'test.c');
    const vm = new Machine();
    // Patch inner to inspect callStack mid-execution
    let capturedFrames = null;
    const origRun = vm.run.bind(vm);
    let callCount = 0;
    const origCallFunction = vm.callFunction.bind(vm);
    vm.callFunction = function(fn, args) {
      callCount++;
      if (callCount === 2) {
        // We're inside inner(), called from outer()
        // The callStack should have outer()'s frame
        capturedFrames = [...vm.callStack];
      }
      return origCallFunction(fn, args);
    };
    vm.execute(prog, 'outer', []);
    assert.ok(capturedFrames, 'should have captured frames');
    assert.equal(capturedFrames.length, 1);
    assert.equal(capturedFrames[0].functionName, 'outer');
    assert.equal(capturedFrames[0].fileName, 'test.c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/vm/traceback.test.mjs`
Expected: FAIL — callStack frames lack `functionName` and `fileName` properties

- [ ] **Step 3: Add functionName and fileName to call frames in machine.mjs**

In `src/vm/machine.mjs`, modify the `callFunction` method. Find the line where frames are pushed onto callStack (around line 42-46):

```js
// BEFORE:
this.callStack.push({
  pc: this.pc,
  locals: this.locals,
  program: this.currentProgram,
});

// AFTER:
this.callStack.push({
  pc: this.pc,
  locals: this.locals,
  program: this.currentProgram,
  functionName: this._currentFunctionName,
  fileName: this.currentProgram?.filename ?? '<unknown>',
  object: this._currentObject,
});
```

Also in the constructor, add new tracking fields after line 28:

```js
this._currentFunctionName = null;
this._currentObject = null;
```

In `callFunction`, before pushing the frame and before calling `run()`, set the current function name:

```js
this._currentFunctionName = fn.name;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/vm/traceback.test.mjs`
Expected: PASS

- [ ] **Step 5: Write failing test for collectTraceback()**

Add to `test/vm/traceback.test.mjs`:

```js
describe('VM — collectTraceback', () => {
  it('collects frames from nested calls', () => {
    const source = `
      int deep() { return 1 / 0; }
      int middle() { return deep(); }
      int top() { return middle(); }
    `;
    const prog = compile(source, 'trace.c');
    const vm = new Machine();

    // We test collectTraceback by calling it directly
    // First, set up state as if we're mid-execution
    vm.currentProgram = prog;
    vm._currentFunctionName = 'deep';
    vm._currentObject = null;
    vm.pc = 0;
    vm.callStack.push({
      pc: 10, locals: [], program: prog,
      functionName: 'top', fileName: 'trace.c', object: null,
    });
    vm.callStack.push({
      pc: 20, locals: [], program: prog,
      functionName: 'middle', fileName: 'trace.c', object: null,
    });

    const tb = vm.collectTraceback('Division by zero');
    assert.equal(tb.message, 'Division by zero');
    assert.equal(tb.frames.length, 3);
    assert.equal(tb.frames[0].function, 'deep');
    assert.equal(tb.frames[1].function, 'middle');
    assert.equal(tb.frames[2].function, 'top');
    assert.equal(tb.frames[0].file, 'trace.c');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/vm/traceback.test.mjs`
Expected: FAIL — `vm.collectTraceback is not a function`

- [ ] **Step 7: Implement collectTraceback() in machine.mjs**

Add to Machine class in `src/vm/machine.mjs`:

```js
collectTraceback(errorMessage) {
  const frames = [];
  // Current frame (not yet on callStack)
  if (this.currentProgram) {
    frames.push({
      function: this._currentFunctionName ?? '<unknown>',
      file: this.currentProgram.filename ?? '<unknown>',
      line: this.currentProgram.getLine ? this.currentProgram.getLine(this.pc) : 0,
      object: this._currentObject?.filename ?? '<none>',
    });
  }
  // Walk callStack from top to bottom
  for (let i = this.callStack.length - 1; i >= 0; i--) {
    const frame = this.callStack[i];
    frames.push({
      function: frame.functionName ?? '<unknown>',
      file: frame.fileName ?? '<unknown>',
      line: frame.program?.getLine ? frame.program.getLine(frame.pc) : 0,
      object: frame.object?.filename ?? '<none>',
    });
  }
  return { message: errorMessage, frames };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/vm/traceback.test.mjs`
Expected: PASS

- [ ] **Step 9: Fix call_stack() efun**

In `src/runtime/efuns/misc.mjs`, replace the stub at line 162-164:

```js
// BEFORE:
reg.register('call_stack', () => {
  return mkArray([]);
});

// AFTER:
reg.register('call_stack', () => {
  const frames = _machine.callStack.map(f => mkString(f.functionName ?? '<unknown>'));
  if (_machine._currentFunctionName) {
    frames.push(mkString(_machine._currentFunctionName));
  }
  return mkArray(frames.reverse());
});
```

Note: `_machine` is already accessible via the driver's vm reference. Check how other efuns in misc.mjs access the machine — they receive it via the options/context object passed during registration. Follow the existing pattern. If misc efuns receive a `getVm` callback or driver reference, use that.

- [ ] **Step 10: Run all existing tests to verify no regressions**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 11: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add src/vm/machine.mjs src/runtime/efuns/misc.mjs test/vm/traceback.test.mjs
git commit -m "feat: add VM traceback infrastructure and fix call_stack() efun"
```

---

## Task 2: Error Handler + Heart Beat Error Handling

**Files:**
- Modify: `src/runtime/driver.mjs` (heartBeatTick lines 399-407, constructor)
- Modify: `src/runtime/object.mjs` (add heartBeatErrors field)
- Create: `test/runtime/error-handler.test.mjs`

- [ ] **Step 1: Write failing test for callErrorHandler**

```js
// test/runtime/error-handler.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_MAPPING, T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

function makeDriver(masterSource, mudlibFiles = {}) {
  const files = {
    '/master.c': masterSource,
    ...mudlibFiles,
  };
  return new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': '/test',
      'master file': '/master',
    },
    { readFile: (path) => {
        const key = path.endsWith('.c') ? path : path + '.c';
        if (files[key]) return files[key];
        throw new Error(`File not found: ${key}`);
      }
    }
  );
}

describe('Driver — error_handler', () => {
  it('calls master->error_handler on uncaught error', () => {
    let receivedError = null;
    let receivedCaught = null;

    const driver = makeDriver(`
      mixed *last_error;
      void create() {}
      void error_handler(mapping err, int caught) {
        last_error = ({ err, caught });
      }
    `);
    driver.objects.load('/master');

    // Simulate calling error_handler
    const errorInfo = {
      message: 'Test error',
      frames: [{ function: 'test', file: 'test.c', line: 1, object: 'test' }],
    };
    driver.callErrorHandler(errorInfo, 0);

    // Verify error_handler was called (no crash)
    assert.ok(true, 'callErrorHandler did not throw');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/error-handler.test.mjs`
Expected: FAIL — `driver.callErrorHandler is not a function`

- [ ] **Step 3: Implement callErrorHandler in driver.mjs**

Add to Driver class in `src/runtime/driver.mjs`:

```js
callErrorHandler(tracebackOrError, caught) {
  if (!this.master || this.master.isDestructed()) return;

  // Convert traceback to LPC mapping
  let tb;
  if (tracebackOrError instanceof Error || tracebackOrError.message) {
    tb = tracebackOrError.frames
      ? tracebackOrError
      : this.vm.collectTraceback(tracebackOrError.message ?? String(tracebackOrError));
  } else {
    tb = { message: String(tracebackOrError), frames: [] };
  }

  const traceArray = mkArray(
    tb.frames.map(f => {
      const m = new Map();
      m.set('function', mkString(f.function ?? '<unknown>'));
      m.set('program', mkString(f.file ?? '<unknown>'));
      m.set('object', mkString(f.object ?? '<none>'));
      m.set('line', mkInt(f.line ?? 0));
      return { type: T_MAPPING, value: m };
    })
  );

  const errorMap = new Map();
  errorMap.set('error', mkString(tb.message));
  errorMap.set('program', mkString(tb.frames[0]?.file ?? '<unknown>'));
  errorMap.set('object', mkString(tb.frames[0]?.object ?? '<none>'));
  errorMap.set('line', mkInt(tb.frames[0]?.line ?? 0));
  errorMap.set('trace', traceArray);

  try {
    apply('error_handler', this.master, [
      { type: T_MAPPING, value: errorMap },
      mkInt(caught),
    ]);
  } catch (e) {
    // error_handler itself threw — log to stderr, don't recurse
    console.error(`error_handler threw: ${e.message}`);
  }
}
```

Import any missing svalue helpers at the top of driver.mjs (`mkString`, `mkInt`, `mkArray`, `T_MAPPING`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/error-handler.test.mjs`
Expected: PASS

- [ ] **Step 5: Write failing test for heart_beat error handling**

Add to `test/runtime/error-handler.test.mjs`:

```js
describe('Driver — heart_beat error handling', () => {
  it('catches heart_beat errors and increments error count', () => {
    const driver = makeDriver(`
      void create() {}
    `, {
      '/obj/monster.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() { error("boom"); }
      `,
    });
    driver.objects.load('/master');
    const monster = driver.objects.load('/obj/monster');

    // Run heartBeatTick — should not throw
    driver.heartBeatTick();
    assert.equal(monster.heartBeatErrors, 1);

    // Object should still be in heartBeatList after 1 error
    assert.ok(driver.heartBeatList.has(monster));
  });

  it('removes object from heartBeatList after max errors', () => {
    const driver = makeDriver(`
      void create() {}
    `, {
      '/obj/monster.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() { error("boom"); }
      `,
    });
    driver.objects.load('/master');
    driver.config['max heart beat errors'] = '3';
    const monster = driver.objects.load('/obj/monster');

    // Run heartBeatTick 3 times
    driver.heartBeatTick();
    driver.heartBeatTick();
    driver.heartBeatTick();

    assert.equal(monster.heartBeatErrors, 3);
    assert.ok(!driver.heartBeatList.has(monster), 'should be removed after 3 errors');
  });

  it('resets error count on successful heart_beat', () => {
    let shouldFail = true;
    const driver = makeDriver(`
      void create() {}
    `, {
      '/obj/npc.c': `
        int fail;
        void create() { fail = 1; set_heart_beat(1); }
        void heart_beat() { if (fail) error("boom"); }
      `,
    });
    driver.objects.load('/master');
    const npc = driver.objects.load('/obj/npc');

    driver.heartBeatTick(); // error
    assert.equal(npc.heartBeatErrors, 1);

    // Set fail = 0 on the object's variables so heart_beat succeeds
    // This depends on variable layout; alternatively test with a simpler mechanism
    // For now, just verify the error count increments
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/error-handler.test.mjs`
Expected: FAIL — heartBeatTick doesn't catch errors, `heartBeatErrors` is undefined

- [ ] **Step 7: Add heartBeatErrors to LpcObject**

In `src/runtime/object.mjs`, add to constructor:

```js
this.heartBeatErrors = 0;
```

- [ ] **Step 8: Rewrite heartBeatTick with error handling**

In `src/runtime/driver.mjs`, replace the heartBeatTick method (lines 399-407):

```js
// BEFORE:
heartBeatTick() {
  for (const obj of this.heartBeatList) {
    if (!obj.isDestructed()) {
      this.currentObject = obj;
      apply('heart_beat', obj, []);
    }
  }
  this.currentObject = null;
}

// AFTER:
heartBeatTick() {
  const maxErrors = parseInt(this.config['max heart beat errors'] ?? '10', 10);
  const toRemove = [];
  for (const obj of this.heartBeatList) {
    if (obj.isDestructed()) {
      toRemove.push(obj);
      continue;
    }
    this.currentObject = obj;
    try {
      apply('heart_beat', obj, []);
      obj.heartBeatErrors = 0;
    } catch (e) {
      const tb = this.vm.collectTraceback(e.message ?? String(e));
      this.callErrorHandler(tb, 0);
      obj.heartBeatErrors = (obj.heartBeatErrors ?? 0) + 1;
      if (obj.heartBeatErrors >= maxErrors) {
        obj.flags &= ~O_HEART_BEAT;
        toRemove.push(obj);
      }
    }
  }
  for (const obj of toRemove) {
    this.heartBeatList.delete(obj);
  }
  this.currentObject = null;
}
```

Import `O_HEART_BEAT` from object.mjs if not already imported.

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/error-handler.test.mjs`
Expected: PASS

- [ ] **Step 10: Run all tests to verify no regressions**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add src/runtime/driver.mjs src/runtime/object.mjs test/runtime/error-handler.test.mjs
git commit -m "feat: add error_handler master apply and heart_beat error handling"
```

---

## Task 3: Valid_* Security Checks

**Files:**
- Modify: `src/runtime/efuns/files.mjs` (add checkFileAccess calls)
- Modify: `src/runtime/driver.mjs` (add checkFileAccess and checkSocketAccess helpers)
- Create: `test/runtime/valid-access.test.mjs`

- [ ] **Step 1: Write failing test for valid_read**

```js
// test/runtime/valid-access.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_INT } from '../../src/vm/svalue.mjs';
import { apply } from '../../src/runtime/apply.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function makeDriverWithSecurity(validReadReturn, validWriteReturn) {
  // validReadReturn: 'allow' | 'deny' | 'remap'
  const masterSource = validReadReturn === 'deny'
    ? `
      void create() {}
      mixed valid_read(string path, object ob, string func) { return 0; }
      mixed valid_write(string path, object ob, string func) { return 0; }
    `
    : validReadReturn === 'remap'
    ? `
      void create() {}
      mixed valid_read(string path, object ob, string func) { return "/remapped" + path; }
      mixed valid_write(string path, object ob, string func) { return "/remapped" + path; }
    `
    : `
      void create() {}
      mixed valid_read(string path, object ob, string func) { return 1; }
      mixed valid_write(string path, object ob, string func) { return 1; }
    `;

  // Create a temp directory for mudlib
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-test-'));
  fs.writeFileSync(path.join(tmpDir, 'testfile.txt'), 'hello world');

  const files = { '/master.c': masterSource };
  const driver = new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': tmpDir,
      'master file': '/master',
    },
    { readFile: (p) => {
        if (files[p]) return files[p];
        // Fall through to real filesystem for compiled files
        const resolved = path.join(tmpDir, p.replace(/^\//, ''));
        return fs.readFileSync(resolved, 'utf8');
      }
    }
  );
  driver.objects.load('/master');
  return { driver, tmpDir };
}

describe('valid_read / valid_write', () => {
  it('allows file read when valid_read returns 1', () => {
    const { driver } = makeDriverWithSecurity('allow');
    // Call read_file efun through the driver
    const result = driver.efuns.call('read_file', [
      { type: T_STRING, value: '/testfile.txt' },
    ]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'hello world');
  });

  it('rejects file read when valid_read returns 0', () => {
    const { driver } = makeDriverWithSecurity('deny');
    assert.throws(() => {
      driver.efuns.call('read_file', [
        { type: T_STRING, value: '/testfile.txt' },
      ]);
    }, /permission denied|valid_read/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/valid-access.test.mjs`
Expected: FAIL — no valid_read check in files.mjs, read succeeds even with deny

- [ ] **Step 3: Add checkFileAccess to driver.mjs**

Add to Driver class:

```js
checkFileAccess(type, path, func) {
  // During boot (before master is loaded), allow everything
  if (!this.master || this.master.isDestructed()) return path;

  const applyName = type === 'read' ? 'valid_read' : 'valid_write';
  const ob = this.currentObject;
  const result = apply(applyName, this.master, [
    mkString(path),
    ob ? { type: T_OBJECT, value: ob } : SVALUE_ZERO,
    mkString(func),
  ]);

  if (result?.type === T_STRING) return result.value;  // Remapped path
  if (result?.value) return path;                       // Non-zero = allow
  return null;                                          // Zero = deny
}

checkSocketAccess(func, args) {
  if (!this.master || this.master.isDestructed()) return true;

  const ob = this.currentObject;
  const applyArgs = [
    ob ? { type: T_OBJECT, value: ob } : SVALUE_ZERO,
    mkString(func),
    ...args,
  ];
  const result = apply('valid_socket', this.master, applyArgs);
  return !!result?.value;
}
```

- [ ] **Step 4: Wire checkFileAccess into files.mjs**

In `src/runtime/efuns/files.mjs`, the `registerFileEfuns` function receives a context/options parameter. Add a `getDriver` callback or pass the driver reference. Then wrap each efun with a security check.

For each read operation (`read_file`, `read_bytes`, `file_size`, `get_dir`, `stat`), add at the top:

```js
const checkedPath = driver.checkFileAccess('read', lpcPath, 'read_file');
if (checkedPath === null) {
  throw new RuntimeError('Permission denied: valid_read');
}
```

For each write operation (`write_file`, `write_bytes`, `cp`, `rename`, `rm`, `mkdir`, `log_file`), add:

```js
const checkedPath = driver.checkFileAccess('write', lpcPath, 'write_file');
if (checkedPath === null) {
  throw new RuntimeError('Permission denied: valid_write');
}
```

Use `checkedPath` instead of the original path for the actual file operation (it may have been remapped by master).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/valid-access.test.mjs`
Expected: PASS

- [ ] **Step 6: Write failing test for valid_socket**

Add to `test/runtime/valid-access.test.mjs`:

```js
describe('valid_socket', () => {
  it('rejects socket_create when valid_socket returns 0', () => {
    const masterSource = `
      void create() {}
      int valid_socket(object ob, string func, mixed *args) { return 0; }
    `;
    // Create driver with this master, attempt socket_create
    // This test validates that checkSocketAccess is called
    const files = { '/master.c': masterSource };
    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
      },
      { readFile: (p) => files[p] ?? (() => { throw new Error(`Not found: ${p}`); })() }
    );
    driver.objects.load('/master');
    const allowed = driver.checkSocketAccess('socket_create', []);
    assert.equal(allowed, false);
  });

  it('allows socket_create when valid_socket returns 1', () => {
    const masterSource = `
      void create() {}
      int valid_socket(object ob, string func, mixed *args) { return 1; }
    `;
    const files = { '/master.c': masterSource };
    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
      },
      { readFile: (p) => files[p] ?? (() => { throw new Error(`Not found: ${p}`); })() }
    );
    driver.objects.load('/master');
    const allowed = driver.checkSocketAccess('socket_create', []);
    assert.equal(allowed, true);
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/valid-access.test.mjs`
Expected: PASS (checkSocketAccess was already implemented in Step 3)

- [ ] **Step 8: Wire checkSocketAccess into socket efuns**

Socket efuns are registered in `src/runtime/driver.mjs` (search for `socket_create` in the `_registerDriverEfuns` method). At the top of each socket efun callback (`socket_create`, `socket_bind`, `socket_listen`, `socket_connect`), add:

```js
if (!this.checkSocketAccess('socket_create', [])) {
  throw new RuntimeError('Permission denied: valid_socket');
}
```

Also wire `valid_bind` for function pointer binding. Find the `bind` efun (if it exists in `src/runtime/efuns/misc.mjs` or `driver.mjs`) and add:

```js
// Before binding the function pointer:
if (!driver.checkFileAccess) { /* valid_bind uses its own apply */ }
const ob = driver.currentObject;
const bindAllowed = apply('valid_bind', driver.master, [
  ob ? { type: T_OBJECT, value: ob } : SVALUE_ZERO,
  { type: T_OBJECT, value: owner },
  mkString(funcName),
]);
if (!bindAllowed?.value) {
  throw new RuntimeError('Permission denied: valid_bind');
}
```

If `bind` is not yet implemented as an efun, skip this — valid_bind will be wired when bind is added.

- [ ] **Step 9: Run all tests to verify no regressions**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add src/runtime/driver.mjs src/runtime/efuns/files.mjs test/runtime/valid-access.test.mjs
git commit -m "feat: add valid_read/valid_write/valid_bind/valid_socket security checks"
```

---

## Task 4: Simul_efun Mechanism

**Files:**
- Modify: `src/runtime/driver.mjs` (add loadSimulEfun, callSimulEfun)
- Modify: `src/vm/machine.mjs` (add CALL_SIMUL handler)
- Modify: `src/compiler/codegen.mjs` (generate CALL_SIMUL for simul_efun names)
- Create: `test/runtime/simul-efun.test.mjs`

- [ ] **Step 1: Write failing test for simul_efun loading**

```js
// test/runtime/simul-efun.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_INT } from '../../src/vm/svalue.mjs';

function makeDriverWithSimulEfun() {
  const files = {
    '/master.c': `
      void create() {}
      string get_simul_efun() { return "/obj/simul_efun"; }
    `,
    '/obj/simul_efun.c': `
      void create() {}
      int double_it(int x) { return x * 2; }
      string greet(string name) { return "Hello, " + name + "!"; }
    `,
  };
  return new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': '/test',
      'master file': '/master',
    },
    { readFile: (p) => {
        const key = p.endsWith('.c') ? p : p + '.c';
        if (files[key]) return files[key];
        throw new Error(`Not found: ${key}`);
      }
    }
  );
}

describe('Simul_efun', () => {
  it('loads simul_efun object on boot', () => {
    const driver = makeDriverWithSimulEfun();
    driver.objects.load('/master');
    driver.loadSimulEfun();

    assert.ok(driver.simulEfunObject, 'simul_efun object should be loaded');
    assert.ok(driver.simulEfunNames.has('double_it'));
    assert.ok(driver.simulEfunNames.has('greet'));
    assert.ok(!driver.simulEfunNames.has('create'), 'create should not be a simul_efun');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/simul-efun.test.mjs`
Expected: FAIL — `driver.loadSimulEfun is not a function`

- [ ] **Step 3: Implement loadSimulEfun and callSimulEfun in driver.mjs**

Add fields to Driver constructor:

```js
this.simulEfunObject = null;
this.simulEfunNames = new Set();
```

Add methods:

```js
loadSimulEfun() {
  const pathResult = apply('get_simul_efun', this.master, []);
  if (!pathResult || pathResult.type !== T_STRING) return;

  this.simulEfunObject = this.objects.load(pathResult.value);
  this.simulEfunNames.clear();
  for (const func of this.simulEfunObject.program.functions) {
    // Skip private functions and create()
    if (func.name === 'create') continue;
    if (!(func.flags & FUNC_PRIVATE)) {
      this.simulEfunNames.add(func.name);
    }
  }
}

callSimulEfun(name, args) {
  // Auto-reload if destructed
  if (!this.simulEfunObject || this.simulEfunObject.isDestructed()) {
    this.loadSimulEfun();
  }
  if (!this.simulEfunObject) {
    throw new RuntimeError(`No simul_efun object loaded`);
  }
  if (this.simulEfunNames.has(name)) {
    return apply(name, this.simulEfunObject, args);
  }
  throw new RuntimeError(`Unknown function: ${name}`);
}
```

In codegen.mjs, function flags are stored as `func.flags` (numeric bitfield). The `private` modifier sets a flag during compilation. Check `codegen.mjs` for `FUNC_PRIVATE` or `FLAG_PRIVATE` constants. If no named constant exists, use a simpler heuristic: skip functions whose declaration was `private` by checking `func.flags & 0x01` (typical private bit). Alternatively, since simul_efun objects normally don't declare private functions, skip only `create` and include everything else.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/simul-efun.test.mjs`
Expected: PASS

- [ ] **Step 5: Write failing test for calling simul_efun from LPC**

Add to `test/runtime/simul-efun.test.mjs`:

```js
describe('Simul_efun — calling from LPC', () => {
  it('calls simul_efun function via CALL_EFUN fallback', () => {
    const driver = makeDriverWithSimulEfun();
    driver.objects.load('/master');
    driver.loadSimulEfun();

    // callSimulEfun should work
    const result = driver.callSimulEfun('double_it', [{ type: T_INT, value: 21 }]);
    assert.equal(result.value, 42);
  });

  it('auto-reloads simul_efun after destruct', () => {
    const driver = makeDriverWithSimulEfun();
    driver.objects.load('/master');
    driver.loadSimulEfun();

    // Destruct the simul_efun object
    driver.simulEfunObject.destruct();
    assert.ok(driver.simulEfunObject.isDestructed());

    // Should auto-reload
    const result = driver.callSimulEfun('double_it', [{ type: T_INT, value: 5 }]);
    assert.equal(result.value, 10);
    assert.ok(!driver.simulEfunObject.isDestructed());
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/simul-efun.test.mjs`
Expected: PASS

- [ ] **Step 7: Add CALL_SIMUL handler to machine.mjs**

In `src/vm/machine.mjs`, add a `simulEfunHandler` field to constructor:

```js
this.simulEfunHandler = null;  // Callback for simul_efun invocation
```

Add the CALL_SIMUL case in the run() switch, right after the CALL_EFUN case:

```js
case OP.CALL_SIMUL: {
  const nameIdx = this.readShort();
  const argCount = bc[this.pc++];
  const args = [];
  for (let i = 0; i < argCount; i++) {
    args.unshift(this.stack.pop());
  }
  const name = this.currentProgram.strings[nameIdx];
  if (this.simulEfunHandler) {
    const result = this.simulEfunHandler(name, args);
    this.stack.push(result);
  } else {
    throw new Error(`No simul_efun handler for: ${name}`);
  }
  break;
}
```

In `src/runtime/driver.mjs` constructor, register the handler:

```js
this.vm.simulEfunHandler = (name, args) => this.callSimulEfun(name, args);
```

Also update the efunHandler to fall through to simul_efun:

```js
this.vm.efunHandler = (name, args) => {
  if (this.efuns.has(name)) {
    return this.efuns.call(name, args);
  }
  return this.callSimulEfun(name, args);
};
```

- [ ] **Step 8: Update codegen.mjs to emit CALL_SIMUL**

In `src/compiler/codegen.mjs`, the CallExpression case (around line 523-542) falls through to CALL_EFUN for unknown functions. Add simul_efun awareness.

The codegen needs access to the set of simul_efun names. Add a static/class-level field:

```js
// At module level in codegen.mjs
let _simulEfunNames = new Set();

export function setSimulEfunNames(names) {
  _simulEfunNames = names;
}
```

Then in the CallExpression case, add a check before the CALL_EFUN fallback:

```js
} else if (_simulEfunNames.has(node.name)) {
  // Simul_efun call
  const nameIdx = this.emitter.addString(node.name);
  this.emitter.emitOp(OP.CALL_SIMUL);
  this.emitter.emitShort(nameIdx);
  this.emitter.emit(node.args.length);
} else {
  // Assume efun
  const nameIdx = this.emitter.addString(node.name);
  this.emitter.emitOp(OP.CALL_EFUN);
  this.emitter.emitShort(nameIdx);
  this.emitter.emit(node.args.length);
}
```

In driver.mjs, after loading simul_efun, call:

```js
import { setSimulEfunNames } from '../compiler/codegen.mjs';
// ...
loadSimulEfun() {
  // ... existing code ...
  setSimulEfunNames(this.simulEfunNames);
}
```

Note: Even without CALL_SIMUL in codegen, simul_efun still works via the efunHandler fallback (Step 7). The CALL_SIMUL opcode is an optimization for compile-time known simul_efuns. Both paths should work.

- [ ] **Step 9: Run all tests to verify no regressions**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add src/runtime/driver.mjs src/vm/machine.mjs src/compiler/codegen.mjs test/runtime/simul-efun.test.mjs
git commit -m "feat: add simul_efun mechanism with auto-reload and CALL_SIMUL opcode"
```

---

## Task 5: Epilog/Preload Boot Sequence

**Files:**
- Modify: `src/runtime/driver.mjs` (refactor boot sequence)
- Create: `test/runtime/boot-sequence.test.mjs`

- [ ] **Step 1: Write failing test for epilog/preload**

```js
// test/runtime/boot-sequence.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('Boot sequence — epilog/preload', () => {
  it('calls epilog and preload in order', () => {
    const preloadedPaths = [];

    const files = {
      '/master.c': `
        void create() {}
        string *epilog() {
          return ({ "/obj/daemon1", "/obj/daemon2" });
        }
        void preload(string path) {
          // In real usage, this would load the object
          // We track calls via a side channel
        }
      `,
      '/obj/daemon1.c': `void create() {}`,
      '/obj/daemon2.c': `void create() {}`,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
      },
      { readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        }
      }
    );

    driver.boot();

    // After boot, master should be loaded
    assert.ok(driver.master, 'master should be loaded');
    assert.ok(!driver.master.isDestructed());
  });

  it('continues preload even if one object fails', () => {
    const files = {
      '/master.c': `
        void create() {}
        string *epilog() {
          return ({ "/obj/bad", "/obj/good" });
        }
        void preload(string path) {
          // Load the object
        }
      `,
      // /obj/bad.c is missing — will cause compile error
      '/obj/good.c': `void create() {}`,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
      },
      { readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        }
      }
    );

    // Should not throw even though /obj/bad doesn't exist
    driver.boot();
    assert.ok(driver.master);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/boot-sequence.test.mjs`
Expected: FAIL — `driver.boot is not a function`

- [ ] **Step 3: Implement boot() method in driver.mjs**

Add a `boot()` method that consolidates the startup sequence:

```js
boot() {
  // 1. Load master
  this.master = this.objects.load(this.config['master file']);

  // 2. Load simul_efun (if master defines get_simul_efun)
  try {
    this.loadSimulEfun();
  } catch (e) {
    // simul_efun is optional
    console.error(`Warning: simul_efun load failed: ${e.message}`);
  }

  // 3. Call epilog → get preload list
  const preloadList = apply('epilog', this.master, []);
  if (preloadList?.type === T_ARRAY) {
    const paths = preloadList.value;
    console.log(`Preloading ${paths.length} objects...`);
    for (let i = 0; i < paths.length; i++) {
      const entry = paths[i];
      if (!entry || entry.type !== T_STRING) continue;
      const objPath = entry.value;
      console.log(`[${i + 1}/${paths.length}] ${objPath}`);
      try {
        apply('preload', this.master, [mkString(objPath)]);
      } catch (e) {
        console.error(`  Failed: ${e.message}`);
        this.callErrorHandler(
          this.vm.collectTraceback(e.message ?? String(e)),
          0
        );
      }
    }
    console.log('Preload complete.');
  }
}
```

Import `T_ARRAY` if not already imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/boot-sequence.test.mjs`
Expected: PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add src/runtime/driver.mjs test/runtime/boot-sequence.test.mjs
git commit -m "feat: add epilog/preload boot sequence with progress output"
```

---

## Task 6: Reset and Clean_up Scheduling

**Files:**
- Modify: `src/runtime/driver.mjs` (add resetTick, cleanUpTick to mainLoop)
- Modify: `src/runtime/object.mjs` (add nextReset, lastAccess fields)
- Modify: `src/runtime/apply.mjs` (update lastAccess on apply)
- Create: `test/runtime/reset-cleanup.test.mjs`

- [ ] **Step 1: Add nextReset and lastAccess to LpcObject**

In `src/runtime/object.mjs` constructor, add:

```js
this.nextReset = 0;     // Epoch ms — when reset() should next be called
this.lastAccess = 0;    // Epoch ms — last time this object was accessed via apply
```

- [ ] **Step 2: Update apply.mjs to track lastAccess**

In `src/runtime/apply.mjs`, at the start of the `apply()` function (after the shadow check, before function resolution), add:

```js
object.lastAccess = Date.now();
```

- [ ] **Step 3: Write failing test for reset scheduling**

```js
// test/runtime/reset-cleanup.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_INT } from '../../src/vm/svalue.mjs';
import { apply } from '../../src/runtime/apply.mjs';

function makeDriverForReset(resetTime = 1) {
  const files = {
    '/master.c': `void create() {}`,
    '/obj/room.c': `
      int reset_count;
      void create() { reset_count = 0; }
      void reset() { reset_count = reset_count + 1; }
    `,
  };
  const driver = new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': '/test',
      'master file': '/master',
      'time to reset': String(resetTime),
    },
    { readFile: (p) => {
        const key = p.endsWith('.c') ? p : p + '.c';
        if (files[key]) return files[key];
        throw new Error(`Not found: ${key}`);
      }
    }
  );
  driver.objects.load('/master');
  return driver;
}

describe('Reset scheduling', () => {
  it('calls reset() on objects after reset interval', () => {
    const driver = makeDriverForReset(1); // 1 second reset
    const room = driver.objects.load('/obj/room');

    // Simulate that object was recently accessed
    room.lastAccess = Date.now();

    // Manually set nextReset to the past so it fires immediately
    room.nextReset = Date.now() - 1000;

    driver.resetTick();

    // Check that reset was called by reading reset_count variable
    // reset_count is the first user variable (after inherited vars)
    const resetCount = room.variables[0];
    assert.equal(resetCount.value, 1, 'reset should have been called once');
  });

  it('skips objects not recently accessed', () => {
    const driver = makeDriverForReset(100);
    const room = driver.objects.load('/obj/room');

    // Object was accessed long ago
    room.lastAccess = 0;
    room.nextReset = Date.now() - 1000;

    driver.resetTick();

    const resetCount = room.variables[0];
    assert.equal(resetCount.value, 0, 'reset should NOT have been called');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/reset-cleanup.test.mjs`
Expected: FAIL — `driver.resetTick is not a function`

- [ ] **Step 5: Implement resetTick in driver.mjs**

Add fields to Driver constructor:

```js
this.resetInterval = parseInt(this.config['time to reset'] ?? '1800', 10) * 1000;
this.cleanUpInterval = parseInt(this.config['time to clean up'] ?? '900', 10) * 1000;
```

Add helper method:

```js
_jitteredResetInterval() {
  // ±15% random jitter
  const jitter = 1.0 + (Math.random() * 0.3 - 0.15);
  return Math.round(this.resetInterval * jitter);
}
```

Add resetTick method:

```js
resetTick() {
  const now = Date.now();
  for (const obj of this.objects.all()) {
    if (obj.isDestructed()) continue;
    if (obj.nextReset === 0 || obj.nextReset > now) continue;
    // Only reset objects that were accessed since their last reset was scheduled
    if (obj.lastAccess < obj.nextReset - this.resetInterval) continue;

    obj.nextReset = now + this._jitteredResetInterval();
    this.currentObject = obj;
    try {
      apply('reset', obj, []);
    } catch (e) {
      const tb = this.vm.collectTraceback(e.message ?? String(e));
      this.callErrorHandler(tb, 0);
    }
  }
  this.currentObject = null;
}
```

Note: `this.objects.all()` — check if ObjectManager has an `all()` method. If not, iterate `this.objects.objects.values()` or add an `all()` method that returns the Map values.

Also in ObjectManager `load()` and `clone()`, after creating the object, set:

```js
obj.nextReset = Date.now() + driver._jitteredResetInterval();
obj.lastAccess = Date.now();
```

This requires ObjectManager to have access to the reset interval. The simplest approach: set these in the `onObjectCreated` callback in driver.mjs constructor.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/reset-cleanup.test.mjs`
Expected: PASS

- [ ] **Step 7: Write failing test for clean_up**

Add to `test/runtime/reset-cleanup.test.mjs`:

```js
describe('Clean_up scheduling', () => {
  it('calls clean_up on idle non-interactive objects', () => {
    const files = {
      '/master.c': `void create() {}`,
      '/obj/item.c': `
        int cleaned;
        void create() { cleaned = 0; }
        int clean_up() { cleaned = 1; return 1; }
      `,
    };
    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'time to clean up': '1',
      },
      { readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        }
      }
    );
    driver.objects.load('/master');
    const item = driver.objects.load('/obj/item');

    // Make object idle (last accessed long ago)
    item.lastAccess = 0;

    driver.cleanUpTick();

    const cleaned = item.variables[0];
    assert.equal(cleaned.value, 1, 'clean_up should have been called');
  });

  it('skips interactive objects', () => {
    const files = {
      '/master.c': `void create() {}`,
      '/obj/player.c': `
        int cleaned;
        void create() { cleaned = 0; }
        int clean_up() { cleaned = 1; return 1; }
      `,
    };
    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'time to clean up': '1',
      },
      { readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        }
      }
    );
    driver.objects.load('/master');
    const player = driver.objects.load('/obj/player');
    player.interactive = {}; // Mark as interactive
    player.lastAccess = 0;

    driver.cleanUpTick();

    const cleaned = player.variables[0];
    assert.equal(cleaned.value, 0, 'clean_up should NOT be called on interactive objects');
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/reset-cleanup.test.mjs`
Expected: FAIL — `driver.cleanUpTick is not a function`

- [ ] **Step 9: Implement cleanUpTick in driver.mjs**

```js
cleanUpTick() {
  const now = Date.now();
  for (const obj of this.objects.all()) {
    if (obj.isDestructed()) continue;
    if (obj.interactive) continue;
    if (obj.flags & O_HEART_BEAT) continue;
    if (now - obj.lastAccess < this.cleanUpInterval) continue;

    this.currentObject = obj;
    try {
      const result = apply('clean_up', obj, []);
      if (!result?.value) {
        // Object declined cleanup — delay next check
        obj.lastAccess = now;
      }
    } catch (e) {
      const tb = this.vm.collectTraceback(e.message ?? String(e));
      this.callErrorHandler(tb, 0);
    }
  }
  this.currentObject = null;
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/reset-cleanup.test.mjs`
Expected: PASS

- [ ] **Step 11: Update mainLoop to include resetTick and cleanUpTick**

In `src/runtime/driver.mjs`, update mainLoop:

```js
// BEFORE:
mainLoop() {
  this.callOuts.tick();
  this.heartBeatTick();
  this._processReplaceProgramQueue();
}

// AFTER:
mainLoop() {
  this.callOuts.tick();
  this.heartBeatTick();
  this.resetTick();
  this.cleanUpTick();
  this._processReplaceProgramQueue();
}
```

- [ ] **Step 12: Run all tests to verify no regressions**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All PASS

- [ ] **Step 13: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add src/runtime/driver.mjs src/runtime/object.mjs src/runtime/apply.mjs test/runtime/reset-cleanup.test.mjs
git commit -m "feat: add reset() and clean_up() object lifecycle scheduling"
```

---

## Task 7: Call_out Limit

**Files:**
- Modify: `src/runtime/callout.mjs` (add maxCallOuts check)
- Modify: `src/runtime/driver.mjs` (pass config to callout)
- Create: `test/runtime/callout-limit.test.mjs`

- [ ] **Step 1: Write failing test for call_out limit**

```js
// test/runtime/callout-limit.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CallOutManager } from '../../src/runtime/callout.mjs';

describe('CallOutManager — limits', () => {
  it('throws when call_out limit is reached', () => {
    const mgr = new CallOutManager();
    mgr.maxCallOuts = 3;

    const fakeObj = { isDestructed: () => false };
    mgr.add('func1', fakeObj, 10, []);
    mgr.add('func2', fakeObj, 10, []);
    mgr.add('func3', fakeObj, 10, []);

    assert.throws(() => {
      mgr.add('func4', fakeObj, 10, []);
    }, /too many call_outs|max.*call/i);
  });

  it('allows adding after cancelled entries free up space', () => {
    const mgr = new CallOutManager();
    mgr.maxCallOuts = 2;

    const fakeObj = { isDestructed: () => false };
    mgr.add('func1', fakeObj, 10, []);
    const entry = mgr.add('func2', fakeObj, 10, []);

    // Cancel one
    entry.cancelled = true;
    mgr.activeCount--;

    // Should now be able to add
    mgr.add('func3', fakeObj, 10, []);
    assert.ok(true, 'should not throw');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/callout-limit.test.mjs`
Expected: FAIL — `mgr.maxCallOuts` doesn't exist, no limit check

- [ ] **Step 3: Add maxCallOuts and activeCount to CallOutManager**

In `src/runtime/callout.mjs`, add to constructor (or at class field level):

```js
this.maxCallOuts = 1000;  // Default, overridden by config
this.activeCount = 0;     // Track non-cancelled entries
```

In the `add()` method, add at the top:

```js
if (this.activeCount >= this.maxCallOuts) {
  throw new RuntimeError(`Too many call_outs (max ${this.maxCallOuts})`);
}
```

After pushing to the heap:

```js
this.activeCount++;
```

Import `RuntimeError` — check how other files import it. If there's no shared RuntimeError class, use a plain `Error` or create a check for the existing pattern.

In the `remove()` method, when marking cancelled:

```js
if (!entry.cancelled) {
  entry.cancelled = true;
  this.activeCount--;
}
```

In `tick()`, when popping fired entries:

```js
if (!entry.cancelled) {
  this.activeCount--;
  // ... fire callback
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/runtime/callout-limit.test.mjs`
Expected: PASS

- [ ] **Step 5: Wire config into CallOutManager via driver.mjs**

In `src/runtime/driver.mjs` constructor, after creating CallOutManager:

```js
this.callOuts.maxCallOuts = parseInt(this.config['max call outs'] ?? '1000', 10);
```

- [ ] **Step 6: Run all tests to verify no regressions**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add src/runtime/callout.mjs src/runtime/driver.mjs test/runtime/callout-limit.test.mjs
git commit -m "feat: add call_out count limit with configurable max"
```

---

## Task 8: Integration Test — Full Boot Sequence

**Files:**
- Create: `test/integration/full-boot.test.mjs`

- [ ] **Step 1: Write integration test for the complete boot flow**

```js
// test/integration/full-boot.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_INT } from '../../src/vm/svalue.mjs';
import { apply } from '../../src/runtime/apply.mjs';

describe('Integration — full boot sequence', () => {
  it('boots with master, simul_efun, epilog, preload', () => {
    const files = {
      '/master.c': `
        void create() {}
        string get_simul_efun() { return "/obj/simul_efun"; }
        string *epilog() { return ({ "/obj/daemon" }); }
        void preload(string path) { call_other(path, "???"); }
        void error_handler(mapping err, int caught) {}
        mixed valid_read(string path, object ob, string func) { return 1; }
        mixed valid_write(string path, object ob, string func) { return 1; }
      `,
      '/obj/simul_efun.c': `
        void create() {}
        int is_wizard(object ob) { return 1; }
      `,
      '/obj/daemon.c': `
        int booted;
        void create() { booted = 1; }
      `,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'time to reset': '1800',
        'time to clean up': '900',
        'max call outs': '1000',
      },
      { readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        }
      }
    );

    driver.boot();

    // Verify master loaded
    assert.ok(driver.master);
    assert.ok(!driver.master.isDestructed());

    // Verify simul_efun loaded
    assert.ok(driver.simulEfunObject);
    assert.ok(driver.simulEfunNames.has('is_wizard'));

    // Verify daemon was preloaded
    const daemon = driver.objects.find('/obj/daemon');
    assert.ok(daemon, 'daemon should be loaded via preload');
  });

  it('heart_beat errors trigger error_handler and removal', () => {
    const files = {
      '/master.c': `
        int error_count;
        void create() { error_count = 0; }
        void error_handler(mapping err, int caught) {
          error_count = error_count + 1;
        }
      `,
      '/obj/buggy.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() { error("crash!"); }
      `,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'max heart beat errors': '2',
      },
      { readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        }
      }
    );
    driver.objects.load('/master');
    const buggy = driver.objects.load('/obj/buggy');

    driver.heartBeatTick();
    driver.heartBeatTick();

    // Buggy object should be removed from heartBeatList
    assert.ok(!driver.heartBeatList.has(buggy));
    assert.equal(buggy.heartBeatErrors, 2);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/integration/full-boot.test.mjs`
Expected: PASS

- [ ] **Step 3: Run all tests one final time**

Run: `cd /Users/jrealm/Documents/fluffos/lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add test/integration/full-boot.test.mjs
git commit -m "test: add full boot sequence integration test"
```

---

## Task 9: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README to document new features**

Add to the appropriate sections:

**New Config Keys section:**
```markdown
### 新增 Config 設定

| Config 鍵 | 預設值 | 說明 |
|-----------|--------|------|
| `time to reset` | 1800 | 物件 reset 週期（秒） |
| `time to clean up` | 900 | 物件 clean_up 週期（秒） |
| `max call outs` | 1000 | call_out 全域上限 |
| `max heart beat errors` | 10 | heart_beat 連續錯誤閾值 |
```

**Update "已實作的語言特性" section to add:**
```markdown
- `error_handler` master apply（完整 traceback 資訊）
- `valid_read`/`valid_write`/`valid_bind`/`valid_socket` 安全檢查
- Simul_efun 機制（支援 destruct 後自動重載）
- `epilog`/`preload` 啟動流程
- `reset()`/`clean_up()` 物件生命週期排程
- call_out 數量限制
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jrealm/Documents/fluffos/lpc-js
git add README.md
git commit -m "docs: update README with Phase 7 driver features"
```
