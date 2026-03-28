# LPC-JS Phase 3A: Runtime Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the LPC runtime: object system (load/clone/destruct), efun registry with core efuns, apply mechanism, config parser, call_out timing wheel, and a Driver entry point that can boot a minimal mudlib from the filesystem.

**Architecture:** ObjectManager loads `.c` files via `node:fs`, compiles them with `compileWithInherit`, and wraps them in LpcObject instances. Efuns are JS functions registered in a Map and dispatched by the VM's `efunHandler`. CallOutManager uses a min-heap driven by a single `setInterval`. Driver ties everything together and boots by loading master + simul_efun objects.

**Tech Stack:** Node.js 20+, ES Modules (.mjs), `node:test` + `node:assert`, `node:fs` for file I/O.

---

## File Structure

```
lpc-js/
├── src/
│   ├── compiler/          # (existing, no changes)
│   ├── vm/
│   │   └── machine.mjs    # MODIFY — wire efunHandler
│   └── runtime/
│       ├── object.mjs     # NEW — LpcObject class
│       ├── object-manager.mjs # NEW — load/clone/destruct, object table
│       ├── efuns.mjs       # NEW — efun registry
│       ├── efuns/
│       │   ├── strings.mjs # NEW — string efuns
│       │   ├── arrays.mjs  # NEW — array efuns
│       │   ├── mappings.mjs # NEW — mapping efuns
│       │   ├── objects.mjs # NEW — object efuns (this_object, clone_object, etc.)
│       │   └── misc.mjs    # NEW — typeof, sizeof, write, etc.
│       ├── apply.mjs       # NEW — apply(funcName, object, args)
│       ├── callout.mjs     # NEW — CallOutManager (min-heap timer)
│       ├── config.mjs      # NEW — FluffOS config file parser
│       └── driver.mjs      # NEW — Driver main entry point
└── test/
    └── runtime/
        ├── object.test.mjs
        ├── efuns.test.mjs
        ├── apply.test.mjs
        ├── callout.test.mjs
        ├── config.test.mjs
        └── driver.test.mjs
```

---

### Task 1: LpcObject and Object Flags

**Files:**
- Create: `lpc-js/src/runtime/object.mjs`
- Create: `lpc-js/test/runtime/object.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/object.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LpcObject, O_CLONE, O_DESTRUCTED, O_HEART_BEAT } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';
import { SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('LpcObject', () => {
  it('constructs with filename and program', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const obj = new LpcObject('/test.c', prog);
    assert.equal(obj.filename, '/test.c');
    assert.equal(obj.program, prog);
    assert.equal(obj.variables.length, 1);
    assert.equal(obj.variables[0], SVALUE_ZERO);
    assert.equal(obj.flags, 0);
    assert.equal(obj.cloneNumber, 0);
    assert.equal(obj.environment, null);
    assert.equal(obj.inventory.size, 0);
    assert.equal(obj.interactive, null);
  });

  it('clone creates independent variable copy', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const master = new LpcObject('/test.c', prog);
    const clone = master.clone(1);
    assert.equal(clone.filename, '/test.c');
    assert.equal(clone.cloneNumber, 1);
    assert.ok(clone.flags & O_CLONE);
    assert.equal(clone.program, prog); // shared
    assert.notEqual(clone.variables, master.variables); // independent
  });

  it('move_object changes environment and inventory', () => {
    const prog = new Program('/room.c');
    const room = new LpcObject('/room.c', prog);
    const item = new LpcObject('/item.c', prog);

    item.moveTo(room);
    assert.equal(item.environment, room);
    assert.ok(room.inventory.has(item));

    item.moveTo(null);
    assert.equal(item.environment, null);
    assert.ok(!room.inventory.has(item));
  });

  it('destruct sets flag', () => {
    const prog = new Program('/test.c');
    const obj = new LpcObject('/test.c', prog);
    obj.destruct();
    assert.ok(obj.flags & O_DESTRUCTED);
  });

  it('isDestructed returns correct value', () => {
    const prog = new Program('/test.c');
    const obj = new LpcObject('/test.c', prog);
    assert.equal(obj.isDestructed(), false);
    obj.destruct();
    assert.equal(obj.isDestructed(), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```bash
mkdir -p lpc-js/src/runtime lpc-js/test/runtime
```

Write `lpc-js/src/runtime/object.mjs`:

```js
import { SVALUE_ZERO } from '../vm/svalue.mjs';

export const O_HEART_BEAT  = 0x01;
export const O_CLONE       = 0x02;
export const O_DESTRUCTED  = 0x04;
export const O_RESET       = 0x08;

export class LpcObject {
  constructor(filename, program) {
    this.filename = filename;
    this.program = program;
    this.variables = new Array(program.variables.length).fill(SVALUE_ZERO);
    this.flags = 0;
    this.cloneNumber = 0;
    this.environment = null;
    this.inventory = new Set();
    this.interactive = null;
  }

  clone(cloneNumber) {
    const obj = new LpcObject(this.filename, this.program);
    obj.cloneNumber = cloneNumber;
    obj.flags |= O_CLONE;
    return obj;
  }

  moveTo(dest) {
    if (this.environment) {
      this.environment.inventory.delete(this);
    }
    this.environment = dest;
    if (dest) {
      dest.inventory.add(this);
    }
  }

  destruct() {
    this.flags |= O_DESTRUCTED;
    if (this.environment) {
      this.environment.inventory.delete(this);
      this.environment = null;
    }
  }

  isDestructed() {
    return (this.flags & O_DESTRUCTED) !== 0;
  }

  get objectId() {
    return this.cloneNumber > 0
      ? `${this.filename}#${this.cloneNumber}`
      : this.filename;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All LpcObject tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/object.mjs test/runtime/object.test.mjs
git commit -m "feat: add LpcObject with clone, moveTo, destruct"
```

---

### Task 2: Apply Mechanism

**Files:**
- Create: `lpc-js/src/runtime/apply.mjs`
- Create: `lpc-js/test/runtime/apply.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/apply.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apply, setMachine } from '../../src/runtime/apply.mjs';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';
import { mkInt, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('apply', () => {
  it('calls a function on an object', () => {
    const prog = compile('int get_value() { return 42; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);

    const result = apply('get_value', obj, []);
    assert.equal(result.value, 42);
  });

  it('passes arguments to the function', () => {
    const prog = compile('int add(int a, int b) { return a + b; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);

    const result = apply('add', obj, [mkInt(3), mkInt(4)]);
    assert.equal(result.value, 7);
  });

  it('returns SVALUE_ZERO for missing function', () => {
    const prog = compile('int foo() { return 1; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);

    const result = apply('nonexistent', obj, []);
    assert.equal(result, SVALUE_ZERO);
  });

  it('uses object variables as globals', () => {
    const prog = compile('int counter = 0;\nvoid inc() { counter += 1; }\nint get() { return counter; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);

    apply('inc', obj, []);
    apply('inc', obj, []);
    const result = apply('get', obj, []);
    assert.equal(result.value, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/apply.mjs`:

```js
import { SVALUE_ZERO } from '../vm/svalue.mjs';

let _machine = null;

export function setMachine(vm) {
  _machine = vm;
}

export function getMachine() {
  return _machine;
}

export function apply(funcName, object, args) {
  if (!object || object.isDestructed()) return SVALUE_ZERO;
  const fn = object.program.findFunction(funcName);
  if (!fn) return SVALUE_ZERO;

  // Execute with the object's variables as globals
  const vm = _machine;
  const savedProgram = vm.currentProgram;
  const savedGlobals = vm.globals;

  vm.currentProgram = object.program;
  vm.globals = object.variables;

  let result;
  try {
    result = vm.callFunction(fn, args);
  } finally {
    // Write back modified globals to object
    object.variables = vm.globals;
    vm.currentProgram = savedProgram;
    vm.globals = savedGlobals;
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All apply tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/apply.mjs test/runtime/apply.test.mjs
git commit -m "feat: add apply mechanism for calling LPC functions on objects"
```

---

### Task 3: Efun Registry and Core Efuns

**Files:**
- Create: `lpc-js/src/runtime/efuns.mjs`
- Create: `lpc-js/src/runtime/efuns/strings.mjs`
- Create: `lpc-js/src/runtime/efuns/arrays.mjs`
- Create: `lpc-js/src/runtime/efuns/mappings.mjs`
- Create: `lpc-js/src/runtime/efuns/misc.mjs`
- Create: `lpc-js/test/runtime/efuns.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/efuns.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, T_INT, T_STRING, T_ARRAY, T_MAPPING, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('EfunRegistry', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); });

  it('registers and calls an efun', () => {
    reg.register('double', (args) => mkInt(args[0].value * 2));
    const result = reg.call('double', [mkInt(5)]);
    assert.equal(result.value, 10);
  });

  it('throws for unknown efun', () => {
    assert.throws(() => reg.call('nope', []), /Unknown efun: nope/);
  });
});

describe('string efuns', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    reg.loadDefaults();
  });

  it('capitalize', () => {
    assert.equal(reg.call('capitalize', [mkString('hello')]).value, 'Hello');
  });

  it('lower_case', () => {
    assert.equal(reg.call('lower_case', [mkString('HELLO')]).value, 'hello');
  });

  it('upper_case', () => {
    assert.equal(reg.call('upper_case', [mkString('hello')]).value, 'HELLO');
  });

  it('strlen', () => {
    assert.equal(reg.call('strlen', [mkString('abc')]).value, 3);
  });

  it('implode', () => {
    const arr = mkArray([mkString('a'), mkString('b'), mkString('c')]);
    assert.equal(reg.call('implode', [arr, mkString(',')]).value, 'a,b,c');
  });

  it('explode', () => {
    const result = reg.call('explode', [mkString('a,b,c'), mkString(',')]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 'a');
  });

  it('replace_string', () => {
    assert.equal(reg.call('replace_string', [mkString('hello world'), mkString('world'), mkString('LPC')]).value, 'hello LPC');
  });

  it('trim', () => {
    assert.equal(reg.call('trim', [mkString('  hi  ')]).value, 'hi');
  });
});

describe('array efuns', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    reg.loadDefaults();
  });

  it('sizeof on array', () => {
    assert.equal(reg.call('sizeof', [mkArray([mkInt(1), mkInt(2)])]).value, 2);
  });

  it('sizeof on mapping', () => {
    const m = new Map(); m.set('a', mkInt(1));
    assert.equal(reg.call('sizeof', [mkMapping(m)]).value, 1);
  });

  it('sizeof on string', () => {
    assert.equal(reg.call('sizeof', [mkString('abc')]).value, 3);
  });

  it('member_array', () => {
    const arr = mkArray([mkInt(10), mkInt(20), mkInt(30)]);
    assert.equal(reg.call('member_array', [arr, mkInt(20)]).value, 1);
    assert.equal(reg.call('member_array', [arr, mkInt(99)]).value, -1);
  });

  it('sort_array', () => {
    const arr = mkArray([mkInt(3), mkInt(1), mkInt(2)]);
    const result = reg.call('sort_array', [arr]);
    assert.equal(result.value[0].value, 1);
    assert.equal(result.value[1].value, 2);
    assert.equal(result.value[2].value, 3);
  });

  it('unique_array', () => {
    const arr = mkArray([mkInt(1), mkInt(2), mkInt(1), mkInt(3)]);
    const result = reg.call('unique_array', [arr]);
    assert.equal(result.value.length, 3);
  });
});

describe('mapping efuns', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    reg.loadDefaults();
  });

  it('keys', () => {
    const m = new Map(); m.set('a', mkInt(1)); m.set('b', mkInt(2));
    const result = reg.call('keys', [mkMapping(m)]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 2);
  });

  it('values', () => {
    const m = new Map(); m.set('a', mkInt(1)); m.set('b', mkInt(2));
    const result = reg.call('values', [mkMapping(m)]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 2);
  });

  it('map_delete', () => {
    const m = new Map(); m.set('a', mkInt(1)); m.set('b', mkInt(2));
    const mv = mkMapping(m);
    reg.call('map_delete', [mv, mkString('a')]);
    assert.equal(mv.value.size, 1);
    assert.ok(!mv.value.has('a'));
  });
});

describe('misc efuns', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    reg.loadDefaults();
  });

  it('typeof', () => {
    assert.equal(reg.call('typeof', [mkInt(1)]).value, 'int');
    assert.equal(reg.call('typeof', [mkString('')]).value, 'string');
    assert.equal(reg.call('typeof', [mkFloat(1.0)]).value, 'float');
    assert.equal(reg.call('typeof', [mkArray([])]).value, 'array');
  });

  it('to_int', () => {
    assert.equal(reg.call('to_int', [mkString('42')]).value, 42);
    assert.equal(reg.call('to_int', [mkFloat(3.7)]).value, 3);
  });

  it('to_string', () => {
    assert.equal(reg.call('to_string', [mkInt(42)]).value, '42');
  });

  it('to_float', () => {
    assert.equal(reg.call('to_float', [mkInt(5)]).value, 5.0);
    assert.equal(reg.call('to_float', [mkString('3.14')]).value, 3.14);
  });

  it('random returns int in range', () => {
    const result = reg.call('random', [mkInt(100)]);
    assert.equal(result.type, T_INT);
    assert.ok(result.value >= 0 && result.value < 100);
  });

  it('time returns current timestamp', () => {
    const result = reg.call('time', []);
    assert.equal(result.type, T_INT);
    assert.ok(result.value > 1000000000);
  });

  it('sprintf basic', () => {
    const result = reg.call('sprintf', [mkString('Hello %s, you are %d'), mkString('World'), mkInt(42)]);
    assert.equal(result.value, 'Hello World, you are 42');
  });
});

import { beforeEach } from 'node:test';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write efun registry**

```bash
mkdir -p lpc-js/src/runtime/efuns
```

Write `lpc-js/src/runtime/efuns.mjs`:

```js
import { registerStringEfuns } from './efuns/strings.mjs';
import { registerArrayEfuns } from './efuns/arrays.mjs';
import { registerMappingEfuns } from './efuns/mappings.mjs';
import { registerMiscEfuns } from './efuns/misc.mjs';

export class EfunRegistry {
  constructor() {
    this.registry = new Map();
  }

  register(name, fn) {
    this.registry.set(name, fn);
  }

  call(name, args) {
    const fn = this.registry.get(name);
    if (!fn) throw new Error(`Unknown efun: ${name}`);
    return fn(args);
  }

  has(name) {
    return this.registry.has(name);
  }

  loadDefaults() {
    registerStringEfuns(this);
    registerArrayEfuns(this);
    registerMappingEfuns(this);
    registerMiscEfuns(this);
  }
}
```

Write `lpc-js/src/runtime/efuns/strings.mjs`:

```js
import { mkString, mkInt, mkArray, T_STRING } from '../../vm/svalue.mjs';

export function registerStringEfuns(reg) {
  reg.register('capitalize', (args) => {
    const s = args[0].value;
    return mkString(s.charAt(0).toUpperCase() + s.slice(1));
  });

  reg.register('lower_case', (args) => mkString(args[0].value.toLowerCase()));
  reg.register('upper_case', (args) => mkString(args[0].value.toUpperCase()));
  reg.register('strlen', (args) => mkInt(args[0].value.length));

  reg.register('implode', (args) => {
    const arr = args[0].value.map(sv => sv.value);
    return mkString(arr.join(args[1].value));
  });

  reg.register('explode', (args) => {
    const parts = args[0].value.split(args[1].value);
    return mkArray(parts.map(p => mkString(p)));
  });

  reg.register('replace_string', (args) => {
    const str = args[0].value;
    const from = args[1].value;
    const to = args[2].value;
    return mkString(str.replaceAll(from, to));
  });

  reg.register('trim', (args) => mkString(args[0].value.trim()));
}
```

Write `lpc-js/src/runtime/efuns/arrays.mjs`:

```js
import { mkInt, mkArray, T_ARRAY, T_MAPPING, T_STRING } from '../../vm/svalue.mjs';

export function registerArrayEfuns(reg) {
  reg.register('sizeof', (args) => {
    const sv = args[0];
    if (sv.type === T_ARRAY) return mkInt(sv.value.length);
    if (sv.type === T_MAPPING) return mkInt(sv.value.size);
    if (sv.type === T_STRING) return mkInt(sv.value.length);
    return mkInt(0);
  });

  reg.register('member_array', (args) => {
    const arr = args[0].value;
    const target = args[1].value;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].value === target) return mkInt(i);
    }
    return mkInt(-1);
  });

  reg.register('sort_array', (args) => {
    const arr = [...args[0].value];
    arr.sort((a, b) => {
      if (a.value < b.value) return -1;
      if (a.value > b.value) return 1;
      return 0;
    });
    return mkArray(arr);
  });

  reg.register('unique_array', (args) => {
    const seen = new Set();
    const result = [];
    for (const sv of args[0].value) {
      const key = JSON.stringify(sv.value);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(sv);
      }
    }
    return mkArray(result);
  });
}
```

Write `lpc-js/src/runtime/efuns/mappings.mjs`:

```js
import { mkArray, mkString, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerMappingEfuns(reg) {
  reg.register('keys', (args) => {
    const entries = [];
    for (const key of args[0].value.keys()) {
      entries.push(mkString(String(key)));
    }
    return mkArray(entries);
  });

  reg.register('values', (args) => {
    const entries = [];
    for (const val of args[0].value.values()) {
      entries.push(val);
    }
    return mkArray(entries);
  });

  reg.register('map_delete', (args) => {
    args[0].value.delete(args[1].value);
    return SVALUE_ZERO;
  });
}
```

Write `lpc-js/src/runtime/efuns/misc.mjs`:

```js
import { mkInt, mkString, mkFloat, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER, SVALUE_ZERO } from '../../vm/svalue.mjs';

const TYPE_NAMES = {
  [T_INT]: 'int',
  [T_STRING]: 'string',
  [T_FLOAT]: 'float',
  [T_ARRAY]: 'array',
  [T_MAPPING]: 'mapping',
  [T_OBJECT]: 'object',
  [T_FUNCTION]: 'function',
  [T_BUFFER]: 'buffer',
};

export function registerMiscEfuns(reg) {
  reg.register('typeof', (args) => {
    return mkString(TYPE_NAMES[args[0].type] ?? 'unknown');
  });

  reg.register('to_int', (args) => {
    const sv = args[0];
    if (sv.type === T_STRING) return mkInt(parseInt(sv.value, 10) || 0);
    if (sv.type === T_FLOAT) return mkInt(Math.trunc(sv.value));
    if (sv.type === T_INT) return sv;
    return mkInt(0);
  });

  reg.register('to_string', (args) => {
    return mkString(String(args[0].value));
  });

  reg.register('to_float', (args) => {
    const sv = args[0];
    if (sv.type === T_INT) return mkFloat(sv.value);
    if (sv.type === T_STRING) return mkFloat(parseFloat(sv.value) || 0);
    if (sv.type === T_FLOAT) return sv;
    return mkFloat(0);
  });

  reg.register('random', (args) => {
    return mkInt(Math.floor(Math.random() * args[0].value));
  });

  reg.register('time', () => {
    return mkInt(Math.floor(Date.now() / 1000));
  });

  reg.register('sprintf', (args) => {
    let fmt = args[0].value;
    let argIdx = 1;
    const result = fmt.replace(/%[sd%]/g, (match) => {
      if (match === '%%') return '%';
      if (match === '%s') return String(args[argIdx++]?.value ?? '');
      if (match === '%d') return String(Number(args[argIdx++]?.value ?? 0));
      return match;
    });
    return mkString(result);
  });

  reg.register('write', (args) => {
    // In test mode, this is a no-op. Driver will override.
    return SVALUE_ZERO;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All efun tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/efuns.mjs src/runtime/efuns/ test/runtime/efuns.test.mjs
git commit -m "feat: add efun registry with string, array, mapping, and misc efuns"
```

---

### Task 4: CallOutManager

**Files:**
- Create: `lpc-js/src/runtime/callout.mjs`
- Create: `lpc-js/test/runtime/callout.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/callout.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CallOutManager } from '../../src/runtime/callout.mjs';

describe('CallOutManager', () => {
  it('adds and fires a call_out', () => {
    const mgr = new CallOutManager();
    const calls = [];
    const entry = mgr.add('test_func', { id: 'obj1' }, 0, ['arg1']);
    assert.equal(entry.cancelled, false);
    assert.equal(entry.func, 'test_func');
  });

  it('tick fires expired entries', () => {
    const mgr = new CallOutManager();
    const fired = [];
    mgr.onFire = (func, obj, args) => fired.push({ func, obj, args });
    mgr.add('func_a', { id: 'obj1' }, 0, []);
    mgr.add('func_b', { id: 'obj2' }, 0, []);

    mgr.tick();
    assert.equal(fired.length, 2);
    assert.equal(fired[0].func, 'func_a');
    assert.equal(fired[1].func, 'func_b');
  });

  it('does not fire future entries', () => {
    const mgr = new CallOutManager();
    const fired = [];
    mgr.onFire = (func, obj, args) => fired.push(func);
    mgr.add('now', {}, 0, []);
    mgr.add('later', {}, 10, []);

    mgr.tick();
    assert.equal(fired.length, 1);
    assert.equal(fired[0], 'now');
  });

  it('remove cancels an entry', () => {
    const mgr = new CallOutManager();
    const fired = [];
    mgr.onFire = (func, obj, args) => fired.push(func);
    const entry = mgr.add('func', {}, 0, []);
    mgr.remove(entry);
    assert.equal(entry.cancelled, true);

    mgr.tick();
    assert.equal(fired.length, 0);
  });

  it('findCallOut finds by object and func', () => {
    const mgr = new CallOutManager();
    const obj = { id: 'test' };
    mgr.add('func_a', obj, 5, []);
    mgr.add('func_b', obj, 10, []);

    const found = mgr.findCallOut(obj, 'func_b');
    assert.ok(found);
    assert.equal(found.func, 'func_b');

    const notFound = mgr.findCallOut(obj, 'func_c');
    assert.equal(notFound, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/callout.mjs`:

```js
export class CallOutManager {
  constructor() {
    this.queue = []; // min-heap by expireAt
    this.onFire = null; // callback: (func, object, args) => void
  }

  add(func, object, delaySec, args) {
    const entry = {
      func,
      object,
      args,
      expireAt: Date.now() + delaySec * 1000,
      cancelled: false,
    };
    this._heapPush(entry);
    return entry;
  }

  remove(entry) {
    entry.cancelled = true;
  }

  findCallOut(object, func) {
    for (const entry of this.queue) {
      if (!entry.cancelled && entry.object === object && entry.func === func) {
        return entry;
      }
    }
    return null;
  }

  tick() {
    const now = Date.now();
    while (this.queue.length > 0 && this.queue[0].expireAt <= now) {
      const entry = this._heapPop();
      if (!entry.cancelled && this.onFire) {
        this.onFire(entry.func, entry.object, entry.args);
      }
    }
  }

  // --- Min-heap operations ---

  _heapPush(entry) {
    this.queue.push(entry);
    this._bubbleUp(this.queue.length - 1);
  }

  _heapPop() {
    const top = this.queue[0];
    const last = this.queue.pop();
    if (this.queue.length > 0) {
      this.queue[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.queue[i].expireAt < this.queue[parent].expireAt) {
        [this.queue[i], this.queue[parent]] = [this.queue[parent], this.queue[i]];
        i = parent;
      } else break;
    }
  }

  _sinkDown(i) {
    const n = this.queue.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.queue[left].expireAt < this.queue[smallest].expireAt) smallest = left;
      if (right < n && this.queue[right].expireAt < this.queue[smallest].expireAt) smallest = right;
      if (smallest !== i) {
        [this.queue[i], this.queue[smallest]] = [this.queue[smallest], this.queue[i]];
        i = smallest;
      } else break;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All CallOutManager tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/callout.mjs test/runtime/callout.test.mjs
git commit -m "feat: add CallOutManager with min-heap timing wheel"
```

---

### Task 5: Config Parser

**Files:**
- Create: `lpc-js/src/runtime/config.mjs`
- Create: `lpc-js/test/runtime/config.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/config.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../../src/runtime/config.mjs';

const SAMPLE_CONFIG = `
# name of this mud
name : TestMud

# port
port number : 4000

mudlib directory : /home/mud/lib

binary directory : /home/mud/bin

log directory : /log

include directories : /include:/sys

master file : /obj/master

simulated efun file : /obj/simul_efun

default error message : What?

max eval cost : 500000

heart beat interval : 2

reset time : 3600
`;

describe('parseConfig', () => {
  it('parses name', () => {
    const cfg = parseConfig(SAMPLE_CONFIG);
    assert.equal(cfg['name'], 'TestMud');
  });

  it('parses port number', () => {
    const cfg = parseConfig(SAMPLE_CONFIG);
    assert.equal(cfg['port number'], '4000');
  });

  it('parses mudlib directory', () => {
    const cfg = parseConfig(SAMPLE_CONFIG);
    assert.equal(cfg['mudlib directory'], '/home/mud/lib');
  });

  it('parses include directories', () => {
    const cfg = parseConfig(SAMPLE_CONFIG);
    assert.equal(cfg['include directories'], '/include:/sys');
  });

  it('parses master file', () => {
    const cfg = parseConfig(SAMPLE_CONFIG);
    assert.equal(cfg['master file'], '/obj/master');
  });

  it('parses simulated efun file', () => {
    const cfg = parseConfig(SAMPLE_CONFIG);
    assert.equal(cfg['simulated efun file'], '/obj/simul_efun');
  });

  it('ignores comments and blank lines', () => {
    const cfg = parseConfig('# comment\n\nname : Test');
    assert.equal(cfg['name'], 'Test');
    assert.equal(Object.keys(cfg).length, 1);
  });

  it('parses numeric values', () => {
    const cfg = parseConfig(SAMPLE_CONFIG);
    assert.equal(cfg['max eval cost'], '500000');
    assert.equal(cfg['heart beat interval'], '2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/config.mjs`:

```js
export function parseConfig(source) {
  const config = {};
  const lines = source.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    config[key] = value;
  }
  return config;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All config tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/config.mjs test/runtime/config.test.mjs
git commit -m "feat: add FluffOS-compatible config file parser"
```

---

### Task 6: ObjectManager

**Files:**
- Create: `lpc-js/src/runtime/object-manager.mjs`
- Create: `lpc-js/test/runtime/object-manager.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/object-manager.test.mjs`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectManager } from '../../src/runtime/object-manager.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { setMachine } from '../../src/runtime/apply.mjs';

describe('ObjectManager', () => {
  let mgr, vm;

  beforeEach(() => {
    vm = new Machine();
    setMachine(vm);
    const efuns = new EfunRegistry();
    efuns.loadDefaults();
    vm.efunHandler = (name, args) => efuns.call(name, args);

    mgr = new ObjectManager({
      readFile: (path) => {
        const files = {
          '/simple.c': 'int value = 10;\nint get_value() { return value; }',
          '/parent.c': 'int base() { return 1; }',
          '/child.c': 'inherit "/parent";\nint get() { return base() + 1; }',
          '/with_create.c': 'int ready = 0;\nvoid create() { ready = 1; }\nint is_ready() { return ready; }',
        };
        return files[path] ?? null;
      },
      includePaths: [],
    });
  });

  it('loads an object from file', () => {
    const obj = mgr.load('/simple.c');
    assert.equal(obj.filename, '/simple.c');
    assert.ok(obj.program);
  });

  it('loaded object has correct variables', () => {
    const obj = mgr.load('/simple.c');
    assert.equal(obj.program.variables.length, 1);
  });

  it('returns cached object on second load', () => {
    const obj1 = mgr.load('/simple.c');
    const obj2 = mgr.load('/simple.c');
    assert.equal(obj1, obj2);
  });

  it('loads object with inheritance', () => {
    const obj = mgr.load('/child.c');
    assert.ok(obj.program.inherits.length > 0);
  });

  it('clones an object', () => {
    const clone = mgr.clone('/simple.c');
    assert.ok(clone.cloneNumber > 0);
    assert.equal(clone.filename, '/simple.c');
  });

  it('clone has independent variables', () => {
    const clone1 = mgr.clone('/simple.c');
    const clone2 = mgr.clone('/simple.c');
    assert.notEqual(clone1.variables, clone2.variables);
    assert.notEqual(clone1.cloneNumber, clone2.cloneNumber);
  });

  it('destruct removes from object table', () => {
    const obj = mgr.load('/simple.c');
    mgr.destruct(obj);
    assert.ok(obj.isDestructed());
    // Next load creates a fresh object
    const obj2 = mgr.load('/simple.c');
    assert.notEqual(obj, obj2);
  });

  it('find returns object by filename', () => {
    const obj = mgr.load('/simple.c');
    assert.equal(mgr.find('/simple.c'), obj);
    assert.equal(mgr.find('/nope.c'), null);
  });

  it('calls create() on load', () => {
    const obj = mgr.load('/with_create.c');
    // create() sets ready = 1
    assert.equal(obj.variables[0].value, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/object-manager.mjs`:

```js
import { LpcObject } from './object.mjs';
import { apply } from './apply.mjs';
import { compileWithInherit } from '../compiler/codegen.mjs';
import { SVALUE_ZERO } from '../vm/svalue.mjs';

export class ObjectManager {
  constructor(options = {}) {
    this.readFile = options.readFile ?? null;
    this.includePaths = options.includePaths ?? [];
    this.objects = new Map();    // filename → master LpcObject
    this.cloneCounter = 0;
    this.programCache = new Map(); // filename → Program
  }

  load(filename) {
    // Return cached if not destructed
    const existing = this.objects.get(filename);
    if (existing && !existing.isDestructed()) return existing;

    const prog = this._compile(filename);
    const obj = new LpcObject(filename, prog);
    this.objects.set(filename, obj);

    // Call create() if it exists
    apply('create', obj, []);

    return obj;
  }

  clone(filename) {
    // Ensure master is loaded (for program)
    const master = this.load(filename);
    this.cloneCounter++;
    const clone = master.clone(this.cloneCounter);
    const cloneId = `${filename}#${this.cloneCounter}`;
    this.objects.set(cloneId, clone);

    apply('create', clone, []);

    return clone;
  }

  destruct(obj) {
    obj.destruct();
    // Remove from object table
    this.objects.delete(obj.objectId);
    if (obj.cloneNumber === 0) {
      this.objects.delete(obj.filename);
    }
  }

  find(filename) {
    return this.objects.get(filename) ?? null;
  }

  _compile(filename) {
    if (this.programCache.has(filename)) return this.programCache.get(filename);

    const self = this;
    const files = {};

    // Build a virtual file system for compileWithInherit
    function collectFile(fname) {
      if (files[fname] !== undefined) return;
      const source = self.readFile(fname);
      if (source === null) throw new Error(`File not found: ${fname}`);
      files[fname] = source;

      // Scan for inherit directives to pre-load
      const inheritPattern = /inherit\s+"([^"]+)"\s*;/g;
      let match;
      while ((match = inheritPattern.exec(source)) !== null) {
        let path = match[1];
        if (!path.endsWith('.c')) path += '.c';
        collectFile(path);
      }
    }

    collectFile(filename);
    const prog = compileWithInherit(filename, files);
    this.programCache.set(filename, prog);
    return prog;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All ObjectManager tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/object-manager.mjs test/runtime/object-manager.test.mjs
git commit -m "feat: add ObjectManager with load, clone, destruct, and create() apply"
```

---

### Task 7: Wire Efuns into VM

**Files:**
- Modify: `lpc-js/src/vm/machine.mjs`
- Create: `lpc-js/test/integration/efun-vm.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/integration/efun-vm.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';

function runWithEfuns(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  const efuns = new EfunRegistry();
  efuns.loadDefaults();
  vm.efunHandler = (name, args) => efuns.call(name, args);
  return vm.execute(prog, funcName);
}

describe('integration — efuns in LPC', () => {
  it('capitalize efun', () => {
    const result = runWithEfuns('string f() { return capitalize("hello"); }');
    assert.equal(result.value, 'Hello');
  });

  it('strlen efun', () => {
    const result = runWithEfuns('int f() { return strlen("abcde"); }');
    assert.equal(result.value, 5);
  });

  it('sizeof on array', () => {
    const result = runWithEfuns('int f() { return sizeof(({ 1, 2, 3 })); }');
    assert.equal(result.value, 3);
  });

  it('explode and implode', () => {
    const result = runWithEfuns('string f() { return implode(explode("a-b-c", "-"), "/"); }');
    assert.equal(result.value, 'a/b/c');
  });

  it('typeof efun', () => {
    const result = runWithEfuns('string f() { return typeof(42); }');
    assert.equal(result.value, 'int');
  });

  it('to_string and to_int', () => {
    const result = runWithEfuns('int f() { return to_int(to_string(42)); }');
    assert.equal(result.value, 42);
  });

  it('replace_string', () => {
    const result = runWithEfuns('string f() { return replace_string("hello world", "world", "LPC"); }');
    assert.equal(result.value, 'hello LPC');
  });

  it('sort_array', () => {
    const result = runWithEfuns('mixed f() { return sort_array(({ 3, 1, 2 })); }');
    assert.equal(result.value[0].value, 1);
    assert.equal(result.value[2].value, 3);
  });

  it('sprintf', () => {
    const result = runWithEfuns('string f() { return sprintf("x=%d", 42); }');
    assert.equal(result.value, 'x=42');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd lpc-js && npm test`
Expected: All efun-VM integration tests PASS (VM already has `efunHandler` support from Phase 1).

- [ ] **Step 3: Commit**

```bash
git add test/integration/efun-vm.test.mjs
git commit -m "test: add efun-VM integration tests"
```

---

### Task 8: Driver Skeleton

**Files:**
- Create: `lpc-js/src/runtime/driver.mjs`
- Create: `lpc-js/test/runtime/driver.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/driver.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';

describe('Driver', () => {
  it('constructs with config', () => {
    const driver = new Driver({
      'name': 'TestMud',
      'mudlib directory': '/tmp/mud',
      'port number': '4000',
      'master file': '/obj/master',
      'simulated efun file': '/obj/simul_efun',
      'heart beat interval': '2',
      'max eval cost': '100000',
    });
    assert.equal(driver.config['name'], 'TestMud');
    assert.ok(driver.vm);
    assert.ok(driver.efuns);
    assert.ok(driver.callOuts);
    assert.ok(driver.objects);
  });

  it('registers call_out efun', () => {
    const driver = new Driver({
      'name': 'TestMud',
      'mudlib directory': '/tmp/mud',
      'master file': '/obj/master',
    });
    assert.ok(driver.efuns.has('call_out'));
    assert.ok(driver.efuns.has('remove_call_out'));
  });

  it('provides this_object efun that returns SVALUE_ZERO without context', () => {
    const driver = new Driver({
      'name': 'TestMud',
      'mudlib directory': '/tmp/mud',
      'master file': '/obj/master',
    });
    const result = driver.efuns.call('this_object', []);
    assert.equal(result.value, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/driver.mjs`:

```js
import { Machine } from '../vm/machine.mjs';
import { EfunRegistry } from './efuns.mjs';
import { ObjectManager } from './object-manager.mjs';
import { CallOutManager } from './callout.mjs';
import { apply, setMachine } from './apply.mjs';
import { mkInt, mkString, SVALUE_ZERO, T_OBJECT } from '../vm/svalue.mjs';

export class Driver {
  constructor(config, options = {}) {
    this.config = config;
    this.vm = new Machine();
    this.efuns = new EfunRegistry();
    this.callOuts = new CallOutManager();
    this.heartBeatList = new Set();
    this.currentObject = null;

    // Set up efuns
    this.efuns.loadDefaults();
    this._registerDriverEfuns();

    // Wire VM
    this.vm.efunHandler = (name, args) => this.efuns.call(name, args);
    this.vm.maxEvalCost = parseInt(config['max eval cost'] ?? '1000000', 10);
    setMachine(this.vm);

    // Set up object manager
    const readFile = options.readFile ?? null;
    this.objects = new ObjectManager({
      readFile,
      includePaths: (config['include directories'] ?? '').split(':').filter(Boolean),
    });

    // Set up call_out firing
    this.callOuts.onFire = (func, obj, args) => {
      apply(func, obj, args);
    };
  }

  _registerDriverEfuns() {
    const driver = this;

    this.efuns.register('this_object', () => {
      if (driver.currentObject) {
        return { type: T_OBJECT, value: driver.currentObject };
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('call_out', (args) => {
      const func = args[0].value;
      const delay = args[1].value;
      const extraArgs = args.slice(2);
      if (driver.currentObject) {
        driver.callOuts.add(func, driver.currentObject, delay, extraArgs);
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('remove_call_out', (args) => {
      const func = args[0].value;
      if (driver.currentObject) {
        const entry = driver.callOuts.findCallOut(driver.currentObject, func);
        if (entry) {
          driver.callOuts.remove(entry);
          return mkInt(1);
        }
      }
      return mkInt(-1);
    });

    this.efuns.register('clone_object', (args) => {
      const path = args[0].value;
      const obj = driver.objects.clone(path);
      return { type: T_OBJECT, value: obj };
    });

    this.efuns.register('destruct', (args) => {
      const obj = args[0].type === T_OBJECT ? args[0].value : null;
      if (obj) driver.objects.destruct(obj);
      return SVALUE_ZERO;
    });

    this.efuns.register('find_object', (args) => {
      const obj = driver.objects.find(args[0].value);
      if (obj) return { type: T_OBJECT, value: obj };
      return SVALUE_ZERO;
    });

    this.efuns.register('move_object', (args) => {
      const dest = args[0].type === T_OBJECT ? args[0].value : null;
      if (driver.currentObject && dest) {
        driver.currentObject.moveTo(dest);
      }
      return SVALUE_ZERO;
    });

    this.efuns.register('environment', (args) => {
      const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
      if (obj && obj.environment) return { type: T_OBJECT, value: obj.environment };
      return SVALUE_ZERO;
    });

    this.efuns.register('set_heart_beat', (args) => {
      if (driver.currentObject) {
        if (args[0].value) {
          driver.heartBeatList.add(driver.currentObject);
        } else {
          driver.heartBeatList.delete(driver.currentObject);
        }
      }
      return SVALUE_ZERO;
    });
  }

  mainLoop() {
    this.callOuts.tick();
    this.heartBeatTick();
  }

  heartBeatTick() {
    for (const obj of this.heartBeatList) {
      if (!obj.isDestructed()) {
        this.currentObject = obj;
        apply('heart_beat', obj, []);
      }
    }
    this.currentObject = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All Driver tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/driver.mjs test/runtime/driver.test.mjs
git commit -m "feat: add Driver skeleton with call_out, clone_object, and heart_beat efuns"
```

---

### Task 9: End-to-End Boot Test

**Files:**
- Create: `lpc-js/test/integration/boot.test.mjs`

- [ ] **Step 1: Write the integration test**

Write `lpc-js/test/integration/boot.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { apply } from '../../src/runtime/apply.mjs';
import { mkInt, mkString } from '../../src/vm/svalue.mjs';

describe('integration — boot a minimal mudlib', () => {
  function createDriver() {
    const files = {
      '/master.c': `
        string mud_name() { return "TestMud"; }
        void create() { }
      `,
      '/simul_efun.c': `
        void create() { }
      `,
      '/std/object.c': `
        int value = 0;
        void create() { value = 1; }
        int get_value() { return value; }
        void set_value(int v) { value = v; }
      `,
      '/std/room.c': `
        inherit "/std/object";
        string desc = "empty";
        void create() { ::create(); }
        string get_desc() { return desc; }
      `,
    };

    const config = {
      'name': 'TestMud',
      'mudlib directory': '/',
      'master file': '/master',
      'simulated efun file': '/simul_efun',
    };

    return new Driver(config, {
      readFile: (path) => files[path] ?? files[path + '.c'] ?? files[path.replace(/\.c$/, '')] ?? null,
    });
  }

  it('loads master object', () => {
    const driver = createDriver();
    const master = driver.objects.load('/master.c');
    const result = apply('mud_name', master, []);
    assert.equal(result.value, 'TestMud');
  });

  it('loads object with create()', () => {
    const driver = createDriver();
    const obj = driver.objects.load('/std/object.c');
    const result = apply('get_value', obj, []);
    assert.equal(result.value, 1); // create() set value = 1
  });

  it('clones an object', () => {
    const driver = createDriver();
    const clone = driver.objects.clone('/std/object.c');
    const result = apply('get_value', clone, []);
    assert.equal(result.value, 1);

    // Modify clone, master unaffected
    apply('set_value', clone, [mkInt(99)]);
    assert.equal(apply('get_value', clone, []).value, 99);

    const master = driver.objects.load('/std/object.c');
    assert.equal(apply('get_value', master, []).value, 1);
  });

  it('loads object with inheritance', () => {
    const driver = createDriver();
    const room = driver.objects.load('/std/room.c');
    const result = apply('get_value', room, []);
    assert.equal(result.value, 1); // inherited from /std/object, create() was called
  });

  it('destruct removes object', () => {
    const driver = createDriver();
    const obj = driver.objects.load('/std/object.c');
    assert.ok(!obj.isDestructed());
    driver.objects.destruct(obj);
    assert.ok(obj.isDestructed());
  });

  it('efuns work inside LPC code', () => {
    const files = {
      '/test.c': `
        string f() { return capitalize("hello") + " " + to_string(sizeof(({ 1, 2, 3 }))); }
      `,
    };
    const driver = new Driver({ 'name': 'Test', 'mudlib directory': '/' }, {
      readFile: (path) => files[path] ?? null,
    });
    const obj = driver.objects.load('/test.c');
    const result = apply('f', obj, []);
    assert.equal(result.value, 'Hello 3');
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd lpc-js && npm test`
Expected: All boot integration tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/integration/boot.test.mjs
git commit -m "test: add end-to-end boot integration test with minimal mudlib"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd lpc-js && npm test`
Expected: All tests pass.

- [ ] **Step 2: Done**

Phase 3A complete.
