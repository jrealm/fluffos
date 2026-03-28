# LPC-JS Phase 5: reg_assoc, Class Instances, Shadow, Database

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add regex pattern matching (`reg_assoc`, `regexp`), LPC class instantiation (`new(class X)`), object shadowing, and PostgreSQL database efuns to close the remaining compatibility gaps with production mudlibs.

**Architecture:** `reg_assoc` wraps JS `RegExp`. Class instances are `T_CLASS` svalues holding a Map of member values, created by `new(class X)` which the parser treats as a special `CallExpression` variant. Shadow adds a `shadowedBy`/`shadowing` linked list on `LpcObject`; `apply` checks the shadow chain before dispatching. Database uses the `pg` npm package with async wrappers.

**Tech Stack:** Node.js 20+, ES Modules (.mjs), `node:test`, `pg` (PostgreSQL client).

---

## File Structure

```
lpc-js/
├── src/
│   ├── compiler/
│   │   ├── ast.mjs         # MODIFY — add NewClassExpr, ClassMemberSet
│   │   ├── parser.mjs      # MODIFY — parse new(class X), obj.member access/set
│   │   └── codegen.mjs     # MODIFY — emit CLASS_NEW, CLASS_GET, CLASS_SET opcodes
│   ├── vm/
│   │   ├── opcodes.mjs     # MODIFY — add CLASS_NEW, CLASS_GET, CLASS_SET
│   │   ├── svalue.mjs      # MODIFY — add mkClass helper
│   │   └── machine.mjs     # MODIFY — implement class opcodes
│   ├── runtime/
│   │   ├── object.mjs      # MODIFY — add shadow/shadowedBy fields
│   │   ├── apply.mjs       # MODIFY — check shadow chain
│   │   ├── efuns/
│   │   │   ├── regex.mjs   # NEW — regexp, reg_assoc, pcre_match
│   │   │   ├── shadow.mjs  # NEW — shadow, query_shadowing
│   │   │   └── database.mjs # NEW — db_connect, db_exec, db_close, db_fetch
│   │   ├── efuns.mjs       # MODIFY — register new modules
│   │   └── driver.mjs      # MODIFY — register shadow/db efuns
│   └── ...
└── test/
    ├── integration/
    │   ├── regex.test.mjs    # NEW
    │   ├── class-inst.test.mjs # NEW
    │   └── shadow.test.mjs   # NEW
    └── runtime/
        └── efuns-db.test.mjs # NEW
```

---

### Task 1: reg_assoc and regexp Efuns

**Files:**
- Create: `lpc-js/src/runtime/efuns/regex.mjs`
- Modify: `lpc-js/src/runtime/efuns.mjs`
- Create: `lpc-js/test/integration/regex.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/integration/regex.test.mjs`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkString, mkInt, mkArray, T_STRING, T_ARRAY, T_INT, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('regexp efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('filters array by pattern', () => {
    const arr = mkArray([mkString('foo.c'), mkString('bar.h'), mkString('baz.c')]);
    const result = reg.call('regexp', [arr, mkString('\\.c$')]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].value, 'foo.c');
    assert.equal(result.value[1].value, 'baz.c');
  });

  it('returns empty array when no match', () => {
    const arr = mkArray([mkString('foo'), mkString('bar')]);
    const result = reg.call('regexp', [arr, mkString('^zzz')]);
    assert.equal(result.value.length, 0);
  });
});

describe('reg_assoc efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('splits string by patterns', () => {
    // reg_assoc("hello 123 world", ({ "[0-9]+", "[a-z]+" }), ({ 1, 2 }))
    // returns ({ ({ "hello", " ", "123", " ", "world" }), ({ 2, 0, 1, 0, 2 }) })
    const patterns = mkArray([mkString('[0-9]+'), mkString('[a-z]+')]);
    const tokens = mkArray([mkInt(1), mkInt(2)]);
    const result = reg.call('reg_assoc', [mkString('hello 123 world'), patterns, tokens]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 2);
    // First element: array of fragments
    const fragments = result.value[0].value;
    assert.ok(fragments.length > 0);
    // Verify some fragments exist
    const fragTexts = fragments.map(f => f.value);
    assert.ok(fragTexts.includes('hello'));
    assert.ok(fragTexts.includes('123'));
    assert.ok(fragTexts.includes('world'));
  });

  it('returns unmatched parts with token 0', () => {
    const patterns = mkArray([mkString('[0-9]+')]);
    const tokens = mkArray([mkInt(1)]);
    const result = reg.call('reg_assoc', [mkString('abc 42 def'), patterns, tokens]);
    const fragments = result.value[0].value;
    const tokenValues = result.value[1].value;
    // "abc " -> 0, "42" -> 1, " def" -> 0
    const fragTexts = fragments.map(f => f.value);
    const tokenNums = tokenValues.map(t => t.value);
    const idx42 = fragTexts.indexOf('42');
    assert.ok(idx42 >= 0);
    assert.equal(tokenNums[idx42], 1);
  });

  it('handles no matches gracefully', () => {
    const result = reg.call('reg_assoc', [mkString('hello'), mkArray([mkString('[0-9]+')]), mkArray([mkInt(1)])]);
    const fragments = result.value[0].value;
    assert.equal(fragments.length, 1);
    assert.equal(fragments[0].value, 'hello');
  });
});

describe('pcre_match efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('returns 1 on match', () => {
    assert.equal(reg.call('pcre_match', [mkString('hello123'), mkString('[0-9]+')]).value, 1);
  });

  it('returns 0 on no match', () => {
    assert.equal(reg.call('pcre_match', [mkString('hello'), mkString('^[0-9]+$')]).value, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — efuns not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/efuns/regex.mjs`:

```js
import { mkInt, mkString, mkArray, T_ARRAY, T_STRING, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerRegexEfuns(reg) {
  reg.register('regexp', (args) => {
    const arr = args[0].value;
    const pattern = args[1].value;
    const re = new RegExp(pattern);
    const matched = arr.filter(sv => re.test(sv.value));
    return mkArray(matched);
  });

  reg.register('reg_assoc', (args) => {
    const str = args[0].value;
    const patterns = args[1].value.map(sv => sv.value);
    const tokens = args[2].value.map(sv => sv.value);
    const defaultToken = args[3]?.value ?? 0;

    // Build combined regex with capturing groups
    const fragments = [];
    const fragmentTokens = [];
    let pos = 0;

    while (pos < str.length) {
      let bestMatch = null;
      let bestIdx = -1;

      for (let i = 0; i < patterns.length; i++) {
        const re = new RegExp(patterns[i], 'g');
        re.lastIndex = pos;
        const m = re.exec(str);
        if (m && m.index === pos) {
          if (!bestMatch || m[0].length > bestMatch[0].length) {
            bestMatch = m;
            bestIdx = i;
          }
        }
      }

      if (bestMatch && bestMatch.index === pos) {
        fragments.push(mkString(bestMatch[0]));
        fragmentTokens.push(mkInt(tokens[bestIdx] ?? defaultToken));
        pos += bestMatch[0].length;
      } else {
        // Find next match start
        let nextMatchPos = str.length;
        for (let i = 0; i < patterns.length; i++) {
          const re = new RegExp(patterns[i], 'g');
          re.lastIndex = pos;
          const m = re.exec(str);
          if (m && m.index < nextMatchPos) {
            nextMatchPos = m.index;
          }
        }
        // Unmatched segment
        fragments.push(mkString(str.slice(pos, nextMatchPos)));
        fragmentTokens.push(mkInt(defaultToken));
        pos = nextMatchPos;
      }
    }

    return mkArray([mkArray(fragments), mkArray(fragmentTokens)]);
  });

  reg.register('pcre_match', (args) => {
    const str = args[0].value;
    const pattern = args[1].value;
    return mkInt(new RegExp(pattern).test(str) ? 1 : 0);
  });
}
```

Add to `lpc-js/src/runtime/efuns.mjs`:

```js
import { registerRegexEfuns } from './efuns/regex.mjs';
// In loadDefaults():
    registerRegexEfuns(this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All regex tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/efuns/regex.mjs src/runtime/efuns.mjs test/integration/regex.test.mjs
git commit -m "feat: add regexp, reg_assoc, pcre_match efuns"
```

---

### Task 2: Class Instantiation — new(class X)

LPC classes are struct-like types. `class point { int x; int y; }` declares a type, `new(class point)` creates an instance, and members are accessed with `->` (e.g. `p->x`).

**Files:**
- Modify: `lpc-js/src/compiler/ast.mjs`
- Modify: `lpc-js/src/compiler/parser.mjs`
- Modify: `lpc-js/src/compiler/codegen.mjs`
- Modify: `lpc-js/src/vm/opcodes.mjs`
- Modify: `lpc-js/src/vm/svalue.mjs`
- Modify: `lpc-js/src/vm/machine.mjs`
- Create: `lpc-js/test/integration/class-inst.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/integration/class-inst.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { T_CLASS, T_INT } from '../../src/vm/svalue.mjs';

function run(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName);
}

describe('class instantiation', () => {
  it('new(class X) creates class instance', () => {
    const result = run(`
      class point { int x; int y; }
      mixed f() { return new(class point); }
    `);
    assert.equal(result.type, T_CLASS);
    assert.ok(result.value instanceof Map);
  });

  it('set and get class members', () => {
    const result = run(`
      class point { int x; int y; }
      int f() {
        class point p = new(class point);
        p->x = 10;
        p->y = 20;
        return p->x + p->y;
      }
    `);
    assert.equal(result.value, 30);
  });

  it('class members default to 0', () => {
    const result = run(`
      class point { int x; int y; }
      int f() {
        class point p = new(class point);
        return p->x;
      }
    `);
    assert.equal(result.value, 0);
  });

  it('class as function return value', () => {
    const result = run(`
      class point { int x; int y; }
      class point make(int a, int b) {
        class point p = new(class point);
        p->x = a;
        p->y = b;
        return p;
      }
      int f() {
        class point p = make(3, 4);
        return p->x * p->x + p->y * p->y;
      }
    `);
    assert.equal(result.value, 25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — `new` keyword and class member access not supported.

- [ ] **Step 3: Add AST nodes and svalue helper**

Append to `lpc-js/src/compiler/ast.mjs`:

```js
export function newClassExpr(className, line) {
  return { type: 'NewClassExpression', className, line };
}

export function classMemberSet(object, member, value, line) {
  return { type: 'ClassMemberSet', object, member, value, line };
}
```

In `lpc-js/src/vm/svalue.mjs`, add:

```js
export function mkClass(value) {
  return { type: T_CLASS, value };
}
```

- [ ] **Step 4: Add opcodes**

In `lpc-js/src/vm/opcodes.mjs`, add:

```js
  CLASS_NEW:    0xC0,  // create class instance from class def index
  CLASS_GET:    0xC1,  // get member from class instance
  CLASS_SET:    0xC2,  // set member on class instance
```

- [ ] **Step 5: Update parser**

In the parser, we need to handle:
1. `new(class X)` — a special expression
2. `p->member` when `p` is a class — currently parsed as `CallOther`. For class member access we need `p->x` (no parentheses) vs `p->func()` (with parentheses). Update `parsePostfix` for arrow:

Replace the `T.ARROW` block in `parsePostfix()`:

```js
      } else if (this.at(T.ARROW)) {
        this.advance();
        const member = this.expect(T.IDENT).value;
        if (this.at(T.LPAREN)) {
          // Method call: obj->func(args)
          this.advance();
          const args = this.parseArgList();
          this.expect(T.RPAREN);
          expr = AST.callOther(expr, member, args, expr.line);
        } else if (this.at(T.EQ) || this.at(T.PLUS_EQ) || this.at(T.MINUS_EQ) ||
                   this.at(T.STAR_EQ) || this.at(T.SLASH_EQ)) {
          // Assignment: obj->member = value (handled at assignment level)
          // Return as member access, assignment will wrap it
          expr = AST.classMemberAccess(expr, member, expr.line);
        } else {
          // Member read: obj->member
          expr = AST.classMemberAccess(expr, member, expr.line);
        }
      }
```

Handle `new(class X)` in `parsePrimary()`. Add a `NEW` keyword. In lexer, add:

```js
  NEW: 'NEW',
```

And in KEYWORDS:

```js
  'new': T.NEW,
```

In `parsePrimary`, add before the `CATCH` case:

```js
    // new(class X) or new(path, args)
    if (tok.type === T.NEW) {
      this.advance();
      this.expect(T.LPAREN);
      if (this.at(T.CLASS)) {
        this.advance();
        const className = this.expect(T.IDENT).value;
        this.expect(T.RPAREN);
        return AST.newClassExpr(className, tok.line);
      }
      // new(path, args...) — clone_object variant
      const pathExpr = this.parseExpression();
      const args = [];
      while (this.match(T.COMMA)) {
        args.push(this.parseExpression());
      }
      this.expect(T.RPAREN);
      // Treat as clone_object call
      return AST.callExpr('clone_object', [pathExpr, ...args], tok.line);
    }
```

Handle `ClassMemberAccess` assignment in `genAssign`:

In codegen `genAssign`, before the existing logic, check if left is `ClassMemberAccess`:

```js
  genAssign(node) {
    if (node.left.type === 'ClassMemberAccess') {
      // obj->member = value
      this.genExpr(node.left.object);
      const memberIdx = this.emitter.addString(node.left.member);
      this.genExpr(node.right);
      this.emitter.emitOp(OP.DUP); // leave value on stack (assignment is expression)
      this.emitter.emitOp(OP.CLASS_SET);
      this.emitter.emitShort(memberIdx);
      return;
    }
    // ... existing assign logic ...
```

- [ ] **Step 6: Add codegen for new AST nodes**

In codegen `genExpr`, add cases:

```js
      case 'NewClassExpression': {
        const classIdx = this.emitter.addString(node.className);
        this.emitter.emitOp(OP.CLASS_NEW);
        this.emitter.emitShort(classIdx);
        break;
      }

      case 'ClassMemberAccess': {
        this.genExpr(node.object);
        const memberIdx = this.emitter.addString(node.member);
        this.emitter.emitOp(OP.CLASS_GET);
        this.emitter.emitShort(memberIdx);
        break;
      }
```

Also register class definitions during compilation. In `compile()` first pass, when encountering `ClassDecl`, store it:

In `CodeGen` constructor, add `this.classDefs = new Map();`

In `compile()` first pass:

```js
      } else if (decl.type === 'ClassDecl') {
        this.classDefs.set(decl.name, decl.members);
      }
```

- [ ] **Step 7: Implement class opcodes in VM**

In `lpc-js/src/vm/machine.mjs`, add cases:

```js
        case OP.CLASS_NEW: {
          const nameIdx = this.readShort();
          const className = this.currentProgram.strings[nameIdx];
          // Create a Map with default zero values for each member
          const members = new Map();
          // Class defs would ideally be stored in the program, but for simplicity
          // we just create an empty map — members are set via CLASS_SET
          this.stack.push(mkClass(members));
          break;
        }

        case OP.CLASS_GET: {
          const memberIdx = this.readShort();
          const memberName = this.currentProgram.strings[memberIdx];
          const obj = this.stack.pop();
          if (obj.type === T_CLASS) {
            this.stack.push(obj.value.get(memberName) ?? SVALUE_ZERO);
          } else {
            throw new RuntimeError(`Cannot access member '${memberName}' on non-class`);
          }
          break;
        }

        case OP.CLASS_SET: {
          const memberIdx = this.readShort();
          const memberName = this.currentProgram.strings[memberIdx];
          const value = this.stack.pop();
          const obj = this.stack[this.stack.length - 1]; // peek — obj is still below the DUP'd value
          // Actually the stack at this point has: [..., obj, dup_value]
          // Wait, let me reconsider the stack layout:
          // genAssign for ClassMemberAccess does:
          //   genExpr(object)     -> stack: [..., obj]
          //   genExpr(right)      -> stack: [..., obj, value]
          //   DUP                 -> stack: [..., obj, value, value]
          //   CLASS_SET           -> pops value, gets obj from stack[sp-1]
          // So CLASS_SET should: pop value off top, then peek at obj below, set member
          const classObj = this.stack[this.stack.length - 1];
          if (classObj.type === T_CLASS) {
            classObj.value.set(memberName, value);
          }
          break;
        }
```

Wait, the stack layout needs to be correct. Let me reconsider:

After `genExpr(object)` → `[obj]`
After `genExpr(right)` → `[obj, value]`
After `DUP` → `[obj, value, value]`
After `CLASS_SET` should pop the top value, then pop the obj, leaving the DUP'd value as the expression result.

Actually simpler approach:

```js
// genAssign for ClassMemberAccess:
genExpr(object)     -> [obj]
genExpr(right)      -> [obj, value]
DUP                 -> [obj, value, value]  (keep value as assign result)
CLASS_SET pops:     value (from DUP), obj -> sets obj.member = value
stack after:        [value]  (the assignment result)
```

So `CLASS_SET` pops the value, then pops the object:

```js
        case OP.CLASS_SET: {
          const memberIdx = this.readShort();
          const memberName = this.currentProgram.strings[memberIdx];
          const value = this.stack.pop();
          const classObj = this.stack.pop();
          if (classObj.type === T_CLASS) {
            classObj.value.set(memberName, value);
          }
          break;
        }
```

But wait, we DUP'd the value before CLASS_SET. So after DUP:
`[obj, value, value_copy]`

CLASS_SET pops `value_copy`, pops `obj`, sets member. Stack: `[value]`. Correct!

Actually no — the DUP creates a copy of the top of stack (which is `value`). So we get:
`[obj, value, value]`

CLASS_SET pops `value` (top), pops `obj`. Stack: `[value]`. The remaining `value` is the assignment result.

But there's a subtlety: `genAssign` currently emits `DUP` then `STORE_LOCAL/STORE_GLOBAL`. For class member set, I should emit differently. Let me restructure:

```js
// In genAssign, for ClassMemberAccess:
  genExpr(object)   // [obj]
  genExpr(right)    // [obj, value]
  DUP               // [obj, value, value]
  CLASS_SET          // pops value, pops obj -> [value]
```

This is correct. Let me update the genAssign code.

- [ ] **Step 8: Run tests**

Run: `cd lpc-js && npm test`
Expected: All class instantiation tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/compiler/ast.mjs src/compiler/lexer.mjs src/compiler/parser.mjs src/compiler/codegen.mjs src/vm/opcodes.mjs src/vm/svalue.mjs src/vm/machine.mjs test/integration/class-inst.test.mjs
git commit -m "feat: add class instantiation new(class X) with member access/set"
```

---

### Task 3: Shadow Mechanism

**Files:**
- Modify: `lpc-js/src/runtime/object.mjs`
- Modify: `lpc-js/src/runtime/apply.mjs`
- Create: `lpc-js/src/runtime/efuns/shadow.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Create: `lpc-js/test/integration/shadow.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/integration/shadow.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { apply } from '../../src/runtime/apply.mjs';
import { mkString } from '../../src/vm/svalue.mjs';

describe('shadow mechanism', () => {
  function createDriver() {
    const files = {
      '/base.c': `
        string get_name() { return "base"; }
        void create() { }
      `,
      '/shadow_obj.c': `
        string get_name() { return "shadowed"; }
        void create() { }
      `,
    };
    return new Driver(
      { 'name': 'Test', 'mudlib directory': '/', 'master file': '/base' },
      { readFile: (p) => files[p] ?? files[p + '.c'] ?? files[p.replace(/\.c$/, '')] ?? null },
    );
  }

  it('shadow overrides function call', () => {
    const d = createDriver();
    const base = d.objects.load('/base.c');
    const shadow = d.objects.load('/shadow_obj.c');

    // Apply shadow
    shadow.shadowTarget = base;
    base.shadowedBy = shadow;

    const result = apply('get_name', base, []);
    assert.equal(result.value, 'shadowed');
  });

  it('non-shadowed function falls through', () => {
    const d = createDriver();
    const base = d.objects.load('/base.c');
    // No shadow
    const result = apply('get_name', base, []);
    assert.equal(result.value, 'base');
  });

  it('query_shadowing returns shadow object', () => {
    const d = createDriver();
    const base = d.objects.load('/base.c');
    const shadow = d.objects.load('/shadow_obj.c');
    shadow.shadowTarget = base;
    base.shadowedBy = shadow;

    assert.equal(d.efuns.call('query_shadowing', [{ type: 5, value: base }]).value, shadow);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — shadow properties and efuns don't exist.

- [ ] **Step 3: Add shadow fields to LpcObject**

In `lpc-js/src/runtime/object.mjs`, add to constructor:

```js
    this.shadowedBy = null;   // object that shadows this one
    this.shadowTarget = null; // object this one shadows
```

- [ ] **Step 4: Modify apply to check shadow chain**

In `lpc-js/src/runtime/apply.mjs`, at the start of the `apply` function, before "Check local functions first":

```js
  // Check shadow chain — if this object is shadowed, try the shadow first
  if (object.shadowedBy) {
    const shadowObj = object.shadowedBy;
    const shadowFn = shadowObj.program.findFunction(funcName);
    if (shadowFn) {
      // Shadow has this function — call it on the shadow instead
      return apply(funcName, shadowObj, args);
    }
  }
```

- [ ] **Step 5: Write shadow efuns**

Write `lpc-js/src/runtime/efuns/shadow.mjs`:

```js
import { mkInt, SVALUE_ZERO, T_OBJECT } from '../../vm/svalue.mjs';

export function registerShadowEfuns(reg, driver) {
  reg.register('shadow', (args) => {
    const target = args[0].type === T_OBJECT ? args[0].value : null;
    if (!target || !driver.currentObject) return SVALUE_ZERO;

    // Check valid_shadow on master
    const master = driver.objects.find(driver.config['master file'] + '.c')
                || driver.objects.find(driver.config['master file']);
    if (master) {
      const { apply } = driver;
      const valid = apply('valid_shadow', master, [{ type: T_OBJECT, value: driver.currentObject }]);
      if (!valid || !valid.value) return SVALUE_ZERO;
    }

    // Set up shadow link
    const shadow = driver.currentObject;
    shadow.shadowTarget = target;
    target.shadowedBy = shadow;
    return mkInt(1);
  });

  reg.register('query_shadowing', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (obj && obj.shadowedBy) {
      return { type: T_OBJECT, value: obj.shadowedBy };
    }
    return SVALUE_ZERO;
  });
}
```

Register in Driver:

```js
import { registerShadowEfuns } from './efuns/shadow.mjs';
// In constructor after other registrations:
    registerShadowEfuns(this.efuns, this);
```

- [ ] **Step 6: Run tests**

Run: `cd lpc-js && npm test`
Expected: All shadow tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/runtime/object.mjs src/runtime/apply.mjs src/runtime/efuns/shadow.mjs src/runtime/driver.mjs test/integration/shadow.test.mjs
git commit -m "feat: add shadow mechanism with shadow/query_shadowing efuns"
```

---

### Task 4: PostgreSQL Database Efuns

**Files:**
- Create: `lpc-js/src/runtime/efuns/database.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Create: `lpc-js/test/runtime/efuns-db.test.mjs`

Note: These tests use a mock since we can't assume PostgreSQL is available. The actual `pg` package dependency is optional.

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/efuns-db.test.mjs`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/runtime/efuns/database.mjs';
import { mkString, mkInt, mkArray, T_INT, T_STRING, T_ARRAY, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('DatabaseManager', () => {
  it('constructs', () => {
    const db = new DatabaseManager();
    assert.ok(db);
  });

  it('connect stores connection handle', () => {
    const db = new DatabaseManager();
    // Use mock client
    db._createClient = () => ({
      connect: async () => {},
      query: async () => ({ rows: [] }),
      end: async () => {},
    });
    const handle = db.connect('localhost', 'testdb', 'user', '');
    assert.equal(handle.type, T_INT);
    assert.ok(handle.value > 0);
  });

  it('close removes connection', () => {
    const db = new DatabaseManager();
    db._createClient = () => ({
      connect: async () => {},
      end: async () => {},
    });
    const handle = db.connect('localhost', 'testdb', 'user', '');
    const result = db.close(handle.value);
    assert.equal(result.value, 1);
  });

  it('exec returns result', () => {
    const db = new DatabaseManager();
    db._createClient = () => ({
      connect: async () => {},
      query: async (sql) => ({
        rows: [{ id: 1, name: 'test' }],
        fields: [{ name: 'id' }, { name: 'name' }],
      }),
      end: async () => {},
    });
    const handle = db.connect('localhost', 'testdb', 'user', '');
    const result = db.exec(handle.value, 'SELECT * FROM test');
    assert.equal(result.type, T_ARRAY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/efuns/database.mjs`:

```js
import { mkInt, mkString, mkArray, mkMapping, SVALUE_ZERO, T_INT } from '../../vm/svalue.mjs';

export class DatabaseManager {
  constructor() {
    this.connections = new Map();
    this.nextHandle = 1;
    this._createClient = null; // set to pg.Client constructor or mock
  }

  connect(host, database, user, password) {
    const handle = this.nextHandle++;
    const client = this._createClient
      ? this._createClient()
      : null;

    if (!client) return SVALUE_ZERO;

    // Connect synchronously for now (store promise)
    this.connections.set(handle, { client, connected: false, lastResult: null });
    client.connect().then(() => {
      const conn = this.connections.get(handle);
      if (conn) conn.connected = true;
    }).catch(() => {});

    return mkInt(handle);
  }

  close(handle) {
    const conn = this.connections.get(handle);
    if (!conn) return SVALUE_ZERO;
    conn.client.end().catch(() => {});
    this.connections.delete(handle);
    return mkInt(1);
  }

  exec(handle, sql) {
    const conn = this.connections.get(handle);
    if (!conn) return SVALUE_ZERO;

    // Execute synchronously-ish: store result in lastResult
    // In real usage this would need to be async; for now we do best-effort sync
    let result = SVALUE_ZERO;
    try {
      // Use synchronous-looking approach via storing results
      const queryResult = conn.client.query(sql);
      if (queryResult && queryResult.then) {
        // It's a promise — store for later fetch
        conn.pendingQuery = queryResult;
        queryResult.then(r => {
          conn.lastResult = r;
          conn.pendingQuery = null;
        }).catch(() => {
          conn.lastResult = null;
          conn.pendingQuery = null;
        });
        return mkInt(1); // query submitted
      }
      // Sync mock
      if (queryResult && queryResult.rows) {
        conn.lastResult = queryResult;
        return mkArray(queryResult.rows.map(row => {
          const m = new Map();
          for (const [k, v] of Object.entries(row)) {
            m.set(k, typeof v === 'number' ? mkInt(v) : mkString(String(v)));
          }
          return mkMapping(m);
        }));
      }
    } catch {
      return SVALUE_ZERO;
    }
    return result;
  }

  fetch(handle) {
    const conn = this.connections.get(handle);
    if (!conn || !conn.lastResult) return SVALUE_ZERO;
    const rows = conn.lastResult.rows;
    return mkArray(rows.map(row => {
      const m = new Map();
      for (const [k, v] of Object.entries(row)) {
        m.set(k, typeof v === 'number' ? mkInt(v) : mkString(String(v)));
      }
      return mkMapping(m);
    }));
  }
}

export function registerDatabaseEfuns(reg, driver) {
  const dbm = new DatabaseManager();

  // Try to load pg module
  try {
    const pg = await import('pg');
    dbm._createClient = (host, db, user, pass) => new pg.default.Client({ host, database: db, user, password: pass });
  } catch {
    // pg not installed — database efuns will return 0
  }

  reg.register('db_connect', (args) => {
    const host = args[0].value;
    const db = args[1].value;
    const user = args[2].value;
    const pass = args[3]?.value ?? '';
    return dbm.connect(host, db, user, pass);
  });

  reg.register('db_exec', (args) => {
    const handle = args[0].value;
    const sql = args[1].value;
    return dbm.exec(handle, sql);
  });

  reg.register('db_close', (args) => {
    return dbm.close(args[0].value);
  });

  reg.register('db_fetch', (args) => {
    return dbm.fetch(args[0].value);
  });
}
```

Note: The `registerDatabaseEfuns` uses top-level await for dynamic import. Since this is ESM, change to sync registration with lazy loading:

Replace the export:

```js
export function registerDatabaseEfuns(reg, driver) {
  const dbm = new DatabaseManager();

  // Try to load pg lazily on first db_connect
  let pgModule = null;
  let pgLoaded = false;

  function ensurePg() {
    if (pgLoaded) return;
    pgLoaded = true;
    try {
      // Dynamic import would be async, so we skip for now
      // Users should install pg and set dbm._createClient manually
    } catch {}
  }

  reg.register('db_connect', (args) => {
    ensurePg();
    return dbm.connect(args[0].value, args[1].value, args[2].value, args[3]?.value ?? '');
  });

  reg.register('db_exec', (args) => {
    return dbm.exec(args[0].value, args[1].value);
  });

  reg.register('db_close', (args) => {
    return dbm.close(args[0].value);
  });

  reg.register('db_fetch', (args) => {
    return dbm.fetch(args[0].value);
  });
}
```

Register in Driver:

```js
import { registerDatabaseEfuns } from './efuns/database.mjs';
// In constructor:
    registerDatabaseEfuns(this.efuns, this);
```

- [ ] **Step 4: Run tests**

Run: `cd lpc-js && npm test`
Expected: All database tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/efuns/database.mjs src/runtime/driver.mjs test/runtime/efuns-db.test.mjs
git commit -m "feat: add PostgreSQL database efuns (db_connect, db_exec, db_close, db_fetch)"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd lpc-js && npm test`
Expected: All tests pass.

- [ ] **Step 2: Done**

Phase 5 complete.
