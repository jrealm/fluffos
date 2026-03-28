# LPC-JS Phase 4B: Missing Efuns & File I/O Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~40 missing efuns (file I/O, type predicates, object info, array higher-order functions, save/restore) to close the compatibility gap with the CAT MudLib.

**Architecture:** Each efun group lives in its own file under `src/runtime/efuns/`. File I/O wraps Node.js `fs` module. save_object/restore_object serialize svalues to FluffOS-compatible text format. Driver-context efuns (previous_object, query_verb, etc.) are registered by Driver and reference its state. All efuns follow the existing pattern: `register(name, (args) => svalue)`.

**Tech Stack:** Node.js 20+, ES Modules (.mjs), `node:test` + `node:assert`, `node:fs` + `node:crypto`.

---

## File Structure

```
lpc-js/
├── src/runtime/efuns/
│   ├── files.mjs       # NEW — read_file, write_file, file_size, mkdir, rm, get_dir, stat
│   ├── save.mjs        # NEW — save_object, restore_object
│   ├── types.mjs       # NEW — objectp, stringp, intp, floatp, arrayp, mapp, functionp, undefinedp, living, clonep, userp
│   ├── objects.mjs     # NEW — object_name, base_name, file_name, children, all_inventory, deep_inventory, present, load_object
│   ├── arrays.mjs      # MODIFY — add allocate, filter_array, map_array
│   ├── strings.mjs     # MODIFY — add strsrch
│   └── misc.mjs        # MODIFY — add allocate_mapping, localtime, crypt, hash
└── test/runtime/
    ├── efuns-files.test.mjs    # NEW
    ├── efuns-save.test.mjs     # NEW
    ├── efuns-types.test.mjs    # NEW
    ├── efuns-objects.test.mjs  # NEW
    └── efuns-extra.test.mjs    # NEW — filter_array, map_array, allocate, strsrch, localtime
```

Driver modifications: register `previous_object`, `query_verb`, `enable_commands`, `disable_commands`, `command`, `load_object`, `children` efuns that require driver context.

---

### Task 1: Type Predicate Efuns

**Files:**
- Create: `lpc-js/src/runtime/efuns/types.mjs`
- Modify: `lpc-js/src/runtime/efuns.mjs`
- Create: `lpc-js/test/runtime/efuns-types.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/efuns-types.test.mjs`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, T_INT, T_OBJECT, SVALUE_ZERO } from '../../src/vm/svalue.mjs';
import { LpcObject, O_CLONE } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';

describe('type predicate efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('intp', () => {
    assert.equal(reg.call('intp', [mkInt(1)]).value, 1);
    assert.equal(reg.call('intp', [mkString('x')]).value, 0);
  });

  it('stringp', () => {
    assert.equal(reg.call('stringp', [mkString('x')]).value, 1);
    assert.equal(reg.call('stringp', [mkInt(1)]).value, 0);
  });

  it('floatp', () => {
    assert.equal(reg.call('floatp', [mkFloat(1.0)]).value, 1);
    assert.equal(reg.call('floatp', [mkInt(1)]).value, 0);
  });

  it('arrayp', () => {
    assert.equal(reg.call('arrayp', [mkArray([])]).value, 1);
    assert.equal(reg.call('arrayp', [mkInt(1)]).value, 0);
  });

  it('mapp', () => {
    assert.equal(reg.call('mapp', [mkMapping(new Map())]).value, 1);
    assert.equal(reg.call('mapp', [mkInt(1)]).value, 0);
  });

  it('objectp', () => {
    const obj = new LpcObject('/test.c', new Program('/test.c'));
    assert.equal(reg.call('objectp', [{ type: T_OBJECT, value: obj }]).value, 1);
    assert.equal(reg.call('objectp', [mkInt(1)]).value, 0);
  });

  it('functionp', () => {
    assert.equal(reg.call('functionp', [mkFunction({ kind: 'named', name: 'f' })]).value, 1);
    assert.equal(reg.call('functionp', [mkInt(1)]).value, 0);
  });

  it('undefinedp', () => {
    assert.equal(reg.call('undefinedp', [SVALUE_ZERO]).value, 1);
    assert.equal(reg.call('undefinedp', [mkInt(1)]).value, 0);
  });

  it('clonep', () => {
    const prog = new Program('/test.c');
    const master = new LpcObject('/test.c', prog);
    const clone = master.clone(1);
    assert.equal(reg.call('clonep', [{ type: T_OBJECT, value: clone }]).value, 1);
    assert.equal(reg.call('clonep', [{ type: T_OBJECT, value: master }]).value, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — efuns not registered.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/efuns/types.mjs`:

```js
import { mkInt, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, SVALUE_ZERO } from '../../vm/svalue.mjs';
import { O_CLONE } from '../object.mjs';

export function registerTypeEfuns(reg) {
  reg.register('intp', (args) => mkInt(args[0].type === T_INT ? 1 : 0));
  reg.register('stringp', (args) => mkInt(args[0].type === T_STRING ? 1 : 0));
  reg.register('floatp', (args) => mkInt(args[0].type === T_FLOAT ? 1 : 0));
  reg.register('arrayp', (args) => mkInt(args[0].type === T_ARRAY ? 1 : 0));
  reg.register('mapp', (args) => mkInt(args[0].type === T_MAPPING ? 1 : 0));
  reg.register('objectp', (args) => mkInt(args[0].type === T_OBJECT ? 1 : 0));
  reg.register('functionp', (args) => mkInt(args[0].type === T_FUNCTION ? 1 : 0));

  reg.register('undefinedp', (args) => {
    return mkInt(args[0].type === T_INT && args[0].value === 0 ? 1 : 0);
  });

  reg.register('clonep', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt((args[0].value.flags & O_CLONE) ? 1 : 0);
  });

  reg.register('userp', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt(args[0].value.interactive ? 1 : 0);
  });

  reg.register('living', (args) => {
    if (args[0].type !== T_OBJECT) return mkInt(0);
    return mkInt(args[0].value.livingName ? 1 : 0);
  });
}
```

Add to `lpc-js/src/runtime/efuns.mjs`:

```js
import { registerTypeEfuns } from './efuns/types.mjs';
```

And in `loadDefaults()`:

```js
    registerTypeEfuns(this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All type predicate tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/efuns/types.mjs src/runtime/efuns.mjs test/runtime/efuns-types.test.mjs
git commit -m "feat: add type predicate efuns (intp, stringp, objectp, clonep, etc.)"
```

---

### Task 2: File I/O Efuns

**Files:**
- Create: `lpc-js/src/runtime/efuns/files.mjs`
- Modify: `lpc-js/src/runtime/efuns.mjs`
- Create: `lpc-js/test/runtime/efuns-files.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/efuns-files.test.mjs`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkString, mkInt, T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('file I/O efuns', () => {
  let reg, tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpcjs-'));
    reg = new EfunRegistry();
    reg.loadDefaults({ mudlibDir: tmpDir });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  it('write_file creates and appends', () => {
    reg.call('write_file', [mkString('/test.txt'), mkString('hello\n')]);
    reg.call('write_file', [mkString('/test.txt'), mkString('world\n')]);
    const content = fs.readFileSync(path.join(tmpDir, 'test.txt'), 'utf8');
    assert.equal(content, 'hello\nworld\n');
  });

  it('read_file reads content', () => {
    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'line1\nline2\nline3\n');
    const result = reg.call('read_file', [mkString('/data.txt')]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'line1\nline2\nline3\n');
  });

  it('read_file returns 0 for missing file', () => {
    const result = reg.call('read_file', [mkString('/nope.txt')]);
    assert.equal(result.value, 0);
  });

  it('file_size returns size', () => {
    fs.writeFileSync(path.join(tmpDir, 'sized.txt'), '12345');
    const result = reg.call('file_size', [mkString('/sized.txt')]);
    assert.equal(result.value, 5);
  });

  it('file_size returns -1 for missing', () => {
    assert.equal(reg.call('file_size', [mkString('/nope')]).value, -1);
  });

  it('file_size returns -2 for directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'subdir'));
    assert.equal(reg.call('file_size', [mkString('/subdir')]).value, -2);
  });

  it('mkdir creates directory', () => {
    reg.call('mkdir', [mkString('/newdir')]);
    assert.ok(fs.statSync(path.join(tmpDir, 'newdir')).isDirectory());
  });

  it('rm removes file', () => {
    fs.writeFileSync(path.join(tmpDir, 'del.txt'), 'x');
    reg.call('rm', [mkString('/del.txt')]);
    assert.ok(!fs.existsSync(path.join(tmpDir, 'del.txt')));
  });

  it('get_dir lists files', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.c'), '');
    fs.writeFileSync(path.join(tmpDir, 'b.c'), '');
    fs.writeFileSync(path.join(tmpDir, 'c.h'), '');
    const result = reg.call('get_dir', [mkString('/*.c')]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — efuns not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/efuns/files.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_STRING } from '../../vm/svalue.mjs';

export function registerFileEfuns(reg, mudlibDir) {
  function resolve(lpcPath) {
    const p = lpcPath.startsWith('/') ? lpcPath.slice(1) : lpcPath;
    return path.join(mudlibDir, p);
  }

  reg.register('read_file', (args) => {
    try {
      const content = fs.readFileSync(resolve(args[0].value), 'utf8');
      return mkString(content);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('write_file', (args) => {
    try {
      const fullPath = resolve(args[0].value);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(fullPath, args[1].value);
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('file_size', (args) => {
    try {
      const stat = fs.statSync(resolve(args[0].value));
      if (stat.isDirectory()) return mkInt(-2);
      return mkInt(stat.size);
    } catch { return mkInt(-1); }
  });

  reg.register('mkdir', (args) => {
    try {
      fs.mkdirSync(resolve(args[0].value), { recursive: true });
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('rm', (args) => {
    try {
      fs.unlinkSync(resolve(args[0].value));
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('get_dir', (args) => {
    try {
      const pattern = args[0].value;
      const dir = path.dirname(resolve(pattern));
      const glob = path.basename(pattern);
      const files = fs.readdirSync(dir);
      const regex = new RegExp('^' + glob.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const matched = files.filter(f => regex.test(f));
      return mkArray(matched.map(f => mkString(f)));
    } catch { return mkArray([]); }
  });

  reg.register('stat', (args) => {
    try {
      const s = fs.statSync(resolve(args[0].value));
      return mkArray([mkInt(s.size), mkInt(Math.floor(s.mtimeMs / 1000))]);
    } catch { return SVALUE_ZERO; }
  });
}
```

Update `lpc-js/src/runtime/efuns.mjs` — change `loadDefaults` to accept options:

```js
import { registerFileEfuns } from './efuns/files.mjs';
import { registerTypeEfuns } from './efuns/types.mjs';

// In loadDefaults:
  loadDefaults(options = {}) {
    registerStringEfuns(this);
    registerArrayEfuns(this);
    registerMappingEfuns(this);
    registerMiscEfuns(this);
    registerTypeEfuns(this);
    if (options.mudlibDir) {
      registerFileEfuns(this, options.mudlibDir);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All file I/O tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/efuns/files.mjs src/runtime/efuns.mjs test/runtime/efuns-files.test.mjs
git commit -m "feat: add file I/O efuns (read_file, write_file, file_size, mkdir, rm, get_dir)"
```

---

### Task 3: save_object / restore_object

**Files:**
- Create: `lpc-js/src/runtime/efuns/save.mjs`
- Create: `lpc-js/test/runtime/efuns-save.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/efuns-save.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { serializeObject, deserializeObject } from '../../src/runtime/efuns/save.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, T_INT, T_STRING, T_ARRAY, T_MAPPING } from '../../src/vm/svalue.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';

describe('save_object / restore_object', () => {
  it('serializes int variable', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkInt(42);
    const text = serializeObject(obj);
    assert.ok(text.includes('x 42'));
  });

  it('serializes string variable', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'name', type: 'string' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkString('hello world');
    const text = serializeObject(obj);
    assert.ok(text.includes('name hello world'));
  });

  it('serializes array variable', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'arr', type: 'mixed' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkArray([mkInt(1), mkInt(2), mkInt(3)]);
    const text = serializeObject(obj);
    assert.ok(text.includes('arr'));
  });

  it('round-trips int', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkInt(99);
    const text = serializeObject(obj);

    const obj2 = new LpcObject('/test.c', prog);
    deserializeObject(obj2, text);
    assert.equal(obj2.variables[0].value, 99);
  });

  it('round-trips string', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'name', type: 'string' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkString('test value');
    const text = serializeObject(obj);

    const obj2 = new LpcObject('/test.c', prog);
    deserializeObject(obj2, text);
    assert.equal(obj2.variables[0].value, 'test value');
  });

  it('round-trips multiple variables', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'a', type: 'int' });
    prog.variables.push({ name: 'b', type: 'string' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkInt(7);
    obj.variables[1] = mkString('hi');
    const text = serializeObject(obj);

    const obj2 = new LpcObject('/test.c', prog);
    deserializeObject(obj2, text);
    assert.equal(obj2.variables[0].value, 7);
    assert.equal(obj2.variables[1].value, 'hi');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/efuns/save.mjs`:

```js
import { mkInt, mkString, mkFloat, mkArray, mkMapping, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function serializeObject(obj) {
  const lines = [];
  for (let i = 0; i < obj.program.variables.length; i++) {
    const v = obj.program.variables[i];
    const sv = obj.variables[i];
    lines.push(`${v.name} ${serializeValue(sv)}`);
  }
  return lines.join('\n') + '\n';
}

export function deserializeObject(obj, text) {
  const varMap = new Map();
  for (let i = 0; i < obj.program.variables.length; i++) {
    varMap.set(obj.program.variables[i].name, i);
  }
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const name = line.slice(0, spaceIdx);
    const valueStr = line.slice(spaceIdx + 1);
    const idx = varMap.get(name);
    if (idx !== undefined) {
      obj.variables[idx] = deserializeValue(valueStr);
    }
  }
}

function serializeValue(sv) {
  switch (sv.type) {
    case T_INT: return String(sv.value);
    case T_STRING: return JSON.stringify(sv.value);
    case T_FLOAT: return String(sv.value);
    case T_ARRAY: return '({' + sv.value.map(v => serializeValue(v)).join(',') + '})';
    case T_MAPPING: {
      const pairs = [];
      for (const [k, v] of sv.value) {
        pairs.push(serializeValue(mkString(String(k))) + ':' + serializeValue(v));
      }
      return '([' + pairs.join(',') + '])';
    }
    default: return '0';
  }
}

function deserializeValue(str) {
  str = str.trim();
  if (str.startsWith('"')) {
    try { return mkString(JSON.parse(str)); } catch { return mkString(str.slice(1, -1)); }
  }
  if (str.startsWith('({') && str.endsWith('})')) {
    const inner = str.slice(2, -2);
    if (inner === '') return mkArray([]);
    return mkArray(splitTopLevel(inner).map(s => deserializeValue(s)));
  }
  if (str.startsWith('([') && str.endsWith('])')) {
    const inner = str.slice(2, -2);
    if (inner === '') return mkMapping(new Map());
    const m = new Map();
    for (const pair of splitTopLevel(inner)) {
      const colonIdx = findTopLevelColon(pair);
      if (colonIdx >= 0) {
        const k = deserializeValue(pair.slice(0, colonIdx));
        const v = deserializeValue(pair.slice(colonIdx + 1));
        m.set(k.value, v);
      }
    }
    return mkMapping(m);
  }
  if (str.includes('.')) {
    const f = parseFloat(str);
    if (!isNaN(f)) return mkFloat(f);
  }
  const n = parseInt(str, 10);
  if (!isNaN(n)) return mkInt(n);
  return SVALUE_ZERO;
}

function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      current += ch;
      if (ch === '\\') { current += str[++i] ?? ''; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; current += ch; continue; }
    if (ch === '(' || ch === '[') { depth++; current += ch; continue; }
    if (ch === ')' || ch === ']') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findTopLevelColon(str) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '(' || ch === '[') { depth++; continue; }
    if (ch === ')' || ch === ']') { depth--; continue; }
    if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

export function registerSaveEfuns(reg, driver) {
  reg.register('save_object', (args) => {
    if (!driver.currentObject) return SVALUE_ZERO;
    const filePath = args[0].value;
    const text = serializeObject(driver.currentObject);
    // Use driver's file writing mechanism
    const writeFile = driver.efuns.registry.get('write_file');
    if (writeFile) {
      // Clear file first, then write
      try {
        const rm = driver.efuns.registry.get('rm');
        if (rm) rm([mkString(filePath)]);
      } catch {}
      writeFile([mkString(filePath), mkString(text)]);
    }
    return mkInt(1);
  });

  reg.register('restore_object', (args) => {
    if (!driver.currentObject) return SVALUE_ZERO;
    const filePath = args[0].value;
    const readFile = driver.efuns.registry.get('read_file');
    if (readFile) {
      const content = readFile([mkString(filePath)]);
      if (content.type === T_STRING) {
        deserializeObject(driver.currentObject, content.value);
        return mkInt(1);
      }
    }
    return SVALUE_ZERO;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All save/restore tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/efuns/save.mjs test/runtime/efuns-save.test.mjs
git commit -m "feat: add save_object/restore_object with serialization"
```

---

### Task 4: Object Info Efuns + Driver Context Efuns

**Files:**
- Create: `lpc-js/src/runtime/efuns/objects.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Create: `lpc-js/test/runtime/efuns-objects.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/efuns-objects.test.mjs`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkString, mkInt, T_OBJECT, T_STRING, T_ARRAY, SVALUE_ZERO } from '../../src/vm/svalue.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';

describe('object info efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  function makeObj(filename) {
    return new LpcObject(filename, new Program(filename));
  }

  it('object_name returns filename', () => {
    const obj = makeObj('/std/object.c');
    assert.equal(reg.call('object_name', [{ type: T_OBJECT, value: obj }]).value, '/std/object.c');
  });

  it('object_name for clone includes #N', () => {
    const obj = makeObj('/std/object.c');
    const clone = obj.clone(5);
    assert.equal(reg.call('object_name', [{ type: T_OBJECT, value: clone }]).value, '/std/object.c#5');
  });

  it('base_name strips clone number', () => {
    const obj = makeObj('/std/object.c');
    const clone = obj.clone(5);
    assert.equal(reg.call('base_name', [{ type: T_OBJECT, value: clone }]).value, '/std/object.c');
  });

  it('file_name returns filename without .c', () => {
    const obj = makeObj('/std/object.c');
    assert.equal(reg.call('file_name', [{ type: T_OBJECT, value: obj }]).value, '/std/object');
  });

  it('all_inventory returns objects in container', () => {
    const room = makeObj('/room.c');
    const a = makeObj('/a.c');
    const b = makeObj('/b.c');
    a.moveTo(room);
    b.moveTo(room);
    const result = reg.call('all_inventory', [{ type: T_OBJECT, value: room }]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 2);
  });

  it('deep_inventory returns all nested', () => {
    const room = makeObj('/room.c');
    const player = makeObj('/player.c');
    const sword = makeObj('/sword.c');
    player.moveTo(room);
    sword.moveTo(player);
    const result = reg.call('deep_inventory', [{ type: T_OBJECT, value: room }]);
    assert.equal(result.value.length, 2); // player + sword
  });

  it('present finds by filename', () => {
    const room = makeObj('/room.c');
    const item = makeObj('/sword.c');
    item.moveTo(room);
    const result = reg.call('present', [mkString('/sword.c'), { type: T_OBJECT, value: room }]);
    assert.equal(result.type, T_OBJECT);
    assert.equal(result.value, item);
  });

  it('present returns 0 for not found', () => {
    const room = makeObj('/room.c');
    const result = reg.call('present', [mkString('/nope.c'), { type: T_OBJECT, value: room }]);
    assert.equal(result.value, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — efuns not registered.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/efuns/objects.mjs`:

```js
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT, T_STRING } from '../../vm/svalue.mjs';

export function registerObjectEfuns(reg) {
  reg.register('object_name', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    return mkString(args[0].value.objectId);
  });

  reg.register('base_name', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    return mkString(args[0].value.filename);
  });

  reg.register('file_name', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    const fname = args[0].value.filename;
    return mkString(fname.endsWith('.c') ? fname.slice(0, -2) : fname);
  });

  reg.register('all_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return mkArray([]);
    const items = [...args[0].value.inventory].map(o => ({ type: T_OBJECT, value: o }));
    return mkArray(items);
  });

  reg.register('deep_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return mkArray([]);
    const result = [];
    function collect(obj) {
      for (const item of obj.inventory) {
        result.push({ type: T_OBJECT, value: item });
        collect(item);
      }
    }
    collect(args[0].value);
    return mkArray(result);
  });

  reg.register('present', (args) => {
    const name = args[0].type === T_STRING ? args[0].value : null;
    const container = args[1]?.type === T_OBJECT ? args[1].value : null;
    if (!name || !container) return SVALUE_ZERO;
    for (const item of container.inventory) {
      if (item.filename === name || item.objectId === name) {
        return { type: T_OBJECT, value: item };
      }
    }
    return SVALUE_ZERO;
  });
}
```

Add to `lpc-js/src/runtime/efuns.mjs`:

```js
import { registerObjectEfuns } from './efuns/objects.mjs';

// In loadDefaults():
    registerObjectEfuns(this);
```

- [ ] **Step 4: Add Driver context efuns**

In `lpc-js/src/runtime/driver.mjs`, add in `_registerDriverEfuns()`:

```js
    this.efuns.register('previous_object', () => {
      // Simplified: return current object (full implementation needs call stack tracking)
      return driver.currentObject ? { type: T_OBJECT, value: driver.currentObject } : SVALUE_ZERO;
    });

    this.efuns.register('query_verb', () => {
      return driver._currentVerb ? mkString(driver._currentVerb) : SVALUE_ZERO;
    });

    this.efuns.register('enable_commands', () => {
      if (driver.currentObject) driver.currentObject.commandsEnabled = true;
      return SVALUE_ZERO;
    });

    this.efuns.register('disable_commands', () => {
      if (driver.currentObject) driver.currentObject.commandsEnabled = false;
      return SVALUE_ZERO;
    });

    this.efuns.register('set_living_name', (args) => {
      if (driver.currentObject) driver.currentObject.livingName = args[0].value;
      return SVALUE_ZERO;
    });

    this.efuns.register('load_object', (args) => {
      const path = args[0].value;
      const obj = driver.objects.load(path.endsWith('.c') ? path : path + '.c');
      return { type: T_OBJECT, value: obj };
    });

    this.efuns.register('children', (args) => {
      const fname = args[0].value;
      const result = [];
      for (const [, obj] of driver.objects.objects) {
        if (obj.filename === fname || obj.filename === fname + '.c') {
          result.push({ type: T_OBJECT, value: obj });
        }
      }
      return mkArray(result);
    });

    this.efuns.register('command', (args) => {
      const cmd = args[0].value;
      if (driver.currentObject && driver.currentObject.interactive) {
        driver._handleInput(driver.currentObject.interactive, cmd);
        return mkInt(1);
      }
      return SVALUE_ZERO;
    });
```

Also add `this._currentVerb = null;` to the constructor and set it in `_handleInput` before dispatch:

In `_handleInput`:
```js
    this._currentVerb = verb; // before dispatch
    // ... after dispatch ...
    this._currentVerb = null;
```

- [ ] **Step 5: Run tests**

Run: `cd lpc-js && npm test`
Expected: All object info tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/efuns/objects.mjs src/runtime/efuns.mjs src/runtime/driver.mjs test/runtime/efuns-objects.test.mjs
git commit -m "feat: add object info efuns and driver context efuns"
```

---

### Task 5: Array Higher-Order Functions and Extra Efuns

**Files:**
- Modify: `lpc-js/src/runtime/efuns/arrays.mjs`
- Modify: `lpc-js/src/runtime/efuns/strings.mjs`
- Modify: `lpc-js/src/runtime/efuns/misc.mjs`
- Create: `lpc-js/test/runtime/efuns-extra.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/efuns-extra.test.mjs`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, T_INT, T_STRING, T_ARRAY, T_MAPPING, SVALUE_ZERO } from '../../src/vm/svalue.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { setMachine } from '../../src/runtime/apply.mjs';
import { compile } from '../../src/compiler/codegen.mjs';

describe('extra array efuns', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    const vm = new Machine();
    setMachine(vm);
    reg.loadDefaults();
    vm.efunHandler = (name, args) => reg.call(name, args);
  });

  it('allocate creates zeroed array', () => {
    const result = reg.call('allocate', [mkInt(3)]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 0);
  });

  it('allocate_mapping creates empty mapping', () => {
    const result = reg.call('allocate_mapping', [mkInt(0)]);
    assert.equal(result.type, T_MAPPING);
    assert.equal(result.value.size, 0);
  });

  it('filter_array with function pointer', () => {
    const prog = compile('int is_positive(int x) { return x > 0; }');
    const vm = new Machine();
    setMachine(vm);
    vm.efunHandler = (name, args) => reg.call(name, args);
    vm.currentProgram = prog;
    const fp = mkFunction({ kind: 'named', name: 'is_positive', partialArgs: [], program: prog });
    const arr = mkArray([mkInt(-1), mkInt(2), mkInt(-3), mkInt(4)]);
    const result = reg.call('filter_array', [arr, fp]);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].value, 2);
    assert.equal(result.value[1].value, 4);
  });

  it('map_array with function pointer', () => {
    const prog = compile('int double(int x) { return x * 2; }');
    const vm = new Machine();
    setMachine(vm);
    vm.efunHandler = (name, args) => reg.call(name, args);
    vm.currentProgram = prog;
    const fp = mkFunction({ kind: 'named', name: 'double', partialArgs: [], program: prog });
    const arr = mkArray([mkInt(1), mkInt(2), mkInt(3)]);
    const result = reg.call('map_array', [arr, fp]);
    assert.equal(result.value[0].value, 2);
    assert.equal(result.value[1].value, 4);
    assert.equal(result.value[2].value, 6);
  });
});

describe('extra string efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('strsrch forward', () => {
    assert.equal(reg.call('strsrch', [mkString('hello world'), mkString('world')]).value, 6);
  });

  it('strsrch not found', () => {
    assert.equal(reg.call('strsrch', [mkString('hello'), mkString('xyz')]).value, -1);
  });

  it('strsrch with offset', () => {
    assert.equal(reg.call('strsrch', [mkString('abcabc'), mkString('abc'), mkInt(1)]).value, 3);
  });
});

describe('extra misc efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('localtime returns array', () => {
    const result = reg.call('localtime', [mkInt(Math.floor(Date.now() / 1000))]);
    assert.equal(result.type, T_ARRAY);
    assert.ok(result.value.length >= 9);
  });

  it('hash md5', () => {
    const result = reg.call('hash', [mkString('md5'), mkString('hello')]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value.length, 32);
  });

  it('hash sha1', () => {
    const result = reg.call('hash', [mkString('sha1'), mkString('hello')]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value.length, 40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — efuns not found.

- [ ] **Step 3: Add to arrays.mjs**

In `lpc-js/src/runtime/efuns/arrays.mjs`, add at the end of `registerArrayEfuns`:

```js
  reg.register('allocate', (args) => {
    const size = args[0].value;
    return mkArray(new Array(size).fill(SVALUE_ZERO));
  });

  reg.register('filter_array', (args) => {
    const arr = args[0].value;
    const fp = args[1];
    const vm = getMachine();
    const result = [];
    for (const item of arr) {
      const r = vm._callFunctionPtr(fp.value, [item]);
      if (r && r.value) result.push(item);
    }
    return mkArray(result);
  });

  reg.register('map_array', (args) => {
    const arr = args[0].value;
    const fp = args[1];
    const vm = getMachine();
    return mkArray(arr.map(item => vm._callFunctionPtr(fp.value, [item])));
  });
```

Add imports at top:

```js
import { getMachine } from '../apply.mjs';
import { SVALUE_ZERO } from '../../vm/svalue.mjs';
```

- [ ] **Step 4: Add strsrch to strings.mjs**

In `lpc-js/src/runtime/efuns/strings.mjs`, add:

```js
  reg.register('strsrch', (args) => {
    const str = args[0].value;
    const substr = args[1].value;
    const offset = args[2]?.value ?? 0;
    return mkInt(str.indexOf(substr, offset));
  });
```

- [ ] **Step 5: Add allocate_mapping, localtime, hash to misc.mjs**

In `lpc-js/src/runtime/efuns/misc.mjs`, add (before the closing `}`):

```js
  reg.register('allocate_mapping', (args) => {
    return mkMapping(new Map());
  });

  reg.register('localtime', (args) => {
    const ts = args[0].value * 1000;
    const d = new Date(ts);
    return mkArray([
      mkInt(d.getSeconds()),  // 0: sec
      mkInt(d.getMinutes()),  // 1: min
      mkInt(d.getHours()),    // 2: hour
      mkInt(d.getDate()),     // 3: mday
      mkInt(d.getMonth()),    // 4: mon (0-11)
      mkInt(d.getFullYear() - 1900), // 5: year
      mkInt(d.getDay()),      // 6: wday
      mkInt(Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000)), // 7: yday
      mkInt(0),               // 8: isdst
    ]);
  });

  reg.register('hash', (args) => {
    const algo = args[0].value;
    const data = args[1].value;
    const { createHash } = await import('node:crypto');
    return mkString(createHash(algo).update(data).digest('hex'));
  });
```

Note: `hash` uses dynamic import for `node:crypto`. Since efuns are sync, change to top-level import:

Add at top of `misc.mjs`:

```js
import { createHash } from 'node:crypto';
```

And the efun:

```js
  reg.register('hash', (args) => {
    const algo = args[0].value;
    const data = args[1].value;
    return mkString(createHash(algo).update(data).digest('hex'));
  });
```

- [ ] **Step 6: Run tests**

Run: `cd lpc-js && npm test`
Expected: All extra efun tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/runtime/efuns/arrays.mjs src/runtime/efuns/strings.mjs src/runtime/efuns/misc.mjs test/runtime/efuns-extra.test.mjs
git commit -m "feat: add filter_array, map_array, allocate, strsrch, localtime, hash efuns"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd lpc-js && npm test`
Expected: All tests pass.

- [ ] **Step 2: Done**

Phase 4B complete.
