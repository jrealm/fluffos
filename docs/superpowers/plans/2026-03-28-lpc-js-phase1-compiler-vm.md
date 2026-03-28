# LPC-JS Phase 1: Core Compiler + VM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an LPC compiler and stack-based VM in pure JavaScript (ESM) that can compile and execute LPC programs with arithmetic, variables, functions, control flow, strings, arrays, and mappings.

**Architecture:** Hand-written lexer → recursive descent parser → AST → bytecode codegen → stack-based VM with `Uint8Array` bytecode and a `switch`-dispatch main loop. All code in pure JS ESM, tested with Node.js built-in test runner.

**Tech Stack:** Node.js 20+, ES Modules (.mjs), `node:test` + `node:assert` for testing.

---

## File Structure

```
lpc-js/
├── package.json
├── src/
│   ├── compiler/
│   │   ├── lexer.mjs       # Tokenizer: source string → token array
│   │   ├── ast.mjs         # AST node factory functions
│   │   ├── parser.mjs      # Recursive descent parser: tokens → AST
│   │   └── codegen.mjs     # AST → Program (bytecode)
│   └── vm/
│       ├── opcodes.mjs     # Opcode constants and names
│       ├── svalue.mjs      # Runtime value constructors and type constants
│       ├── program.mjs     # Program class (bytecode + metadata)
│       └── machine.mjs     # Stack-based VM execution engine
└── test/
    ├── compiler/
    │   ├── lexer.test.mjs
    │   ├── parser.test.mjs
    │   └── codegen.test.mjs
    ├── vm/
    │   ├── machine.test.mjs
    │   └── svalue.test.mjs
    └── integration/
        └── compile-and-run.test.mjs
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `lpc-js/package.json`

- [ ] **Step 1: Create project directory and package.json**

```bash
mkdir -p lpc-js
```

Write `lpc-js/package.json`:

```json
{
  "name": "lpc-js",
  "version": "0.1.0",
  "description": "FluffOS 2.28 compatible LPC compiler and VM in JavaScript",
  "type": "module",
  "scripts": {
    "test": "node --test test/**/*.test.mjs test/**/**/*.test.mjs"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p lpc-js/src/compiler lpc-js/src/vm lpc-js/test/compiler lpc-js/test/vm lpc-js/test/integration
```

- [ ] **Step 3: Verify test runner works**

Write `lpc-js/test/smoke.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('smoke test', () => {
  it('should pass', () => {
    assert.equal(1 + 1, 2);
  });
});
```

Run: `cd lpc-js && npm test`
Expected: 1 test passed.

- [ ] **Step 4: Commit**

```bash
cd lpc-js && git add -A && git commit -m "chore: scaffold lpc-js project with test runner"
```

---

### Task 2: svalue — Runtime Value System

**Files:**
- Create: `lpc-js/src/vm/svalue.mjs`
- Create: `lpc-js/test/vm/svalue.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/vm/svalue.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING,
  mkInt, mkString, mkFloat, mkArray, mkMapping,
  SVALUE_ZERO, SVALUE_ONE,
  isTruthy
} from '../../src/vm/svalue.mjs';

describe('svalue', () => {
  it('creates integer values', () => {
    const v = mkInt(42);
    assert.equal(v.type, T_INT);
    assert.equal(v.value, 42);
  });

  it('creates string values', () => {
    const v = mkString('hello');
    assert.equal(v.type, T_STRING);
    assert.equal(v.value, 'hello');
  });

  it('creates float values', () => {
    const v = mkFloat(3.14);
    assert.equal(v.type, T_FLOAT);
    assert.equal(v.value, 3.14);
  });

  it('creates array values', () => {
    const v = mkArray([mkInt(1), mkInt(2)]);
    assert.equal(v.type, T_ARRAY);
    assert.equal(v.value.length, 2);
    assert.equal(v.value[0].value, 1);
  });

  it('creates mapping values', () => {
    const m = new Map();
    m.set('key', mkInt(10));
    const v = mkMapping(m);
    assert.equal(v.type, T_MAPPING);
    assert.equal(v.value.get('key').value, 10);
  });

  it('provides SVALUE_ZERO and SVALUE_ONE constants', () => {
    assert.equal(SVALUE_ZERO.type, T_INT);
    assert.equal(SVALUE_ZERO.value, 0);
    assert.equal(SVALUE_ONE.type, T_INT);
    assert.equal(SVALUE_ONE.value, 1);
  });

  it('isTruthy: 0 is falsy, nonzero is truthy', () => {
    assert.equal(isTruthy(mkInt(0)), false);
    assert.equal(isTruthy(mkInt(1)), true);
    assert.equal(isTruthy(mkInt(-5)), true);
  });

  it('isTruthy: empty string is falsy, non-empty is truthy', () => {
    assert.equal(isTruthy(mkString('')), false);
    assert.equal(isTruthy(mkString('a')), true);
  });

  it('isTruthy: empty array is falsy, non-empty is truthy', () => {
    assert.equal(isTruthy(mkArray([])), false);
    assert.equal(isTruthy(mkArray([mkInt(1)])), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module `../../src/vm/svalue.mjs` not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/vm/svalue.mjs`:

```js
export const T_INT = 0;
export const T_STRING = 1;
export const T_FLOAT = 2;
export const T_ARRAY = 3;
export const T_MAPPING = 4;
export const T_OBJECT = 5;
export const T_FUNCTION = 6;
export const T_BUFFER = 7;
export const T_CLASS = 8;

export function mkInt(value) {
  return { type: T_INT, value };
}

export function mkString(value) {
  return { type: T_STRING, value };
}

export function mkFloat(value) {
  return { type: T_FLOAT, value };
}

export function mkArray(value) {
  return { type: T_ARRAY, value };
}

export function mkMapping(value) {
  return { type: T_MAPPING, value };
}

export const SVALUE_ZERO = Object.freeze(mkInt(0));
export const SVALUE_ONE = Object.freeze(mkInt(1));

export function isTruthy(sv) {
  switch (sv.type) {
    case T_INT:
      return sv.value !== 0;
    case T_STRING:
      return sv.value.length > 0;
    case T_FLOAT:
      return sv.value !== 0.0;
    case T_ARRAY:
      return sv.value.length > 0;
    case T_MAPPING:
      return sv.value.size > 0;
    default:
      return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All svalue tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/svalue.mjs test/vm/svalue.test.mjs && git commit -m "feat: add svalue runtime value system"
```

---

### Task 3: Opcodes

**Files:**
- Create: `lpc-js/src/vm/opcodes.mjs`

- [ ] **Step 1: Write the failing test**

Append to `lpc-js/test/vm/svalue.test.mjs` (reuse file for quick opcode sanity check) — actually, opcodes are just constants, a quick import check suffices. Write `lpc-js/test/vm/opcodes.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OP, opName } from '../../src/vm/opcodes.mjs';

describe('opcodes', () => {
  it('defines unique opcode values', () => {
    const values = Object.values(OP);
    const unique = new Set(values);
    assert.equal(values.length, unique.size, 'all opcodes must be unique');
  });

  it('opName returns name for known opcode', () => {
    assert.equal(opName(OP.PUSH_INT), 'PUSH_INT');
    assert.equal(opName(OP.ADD), 'ADD');
    assert.equal(opName(OP.RETURN), 'RETURN');
  });

  it('opName returns UNKNOWN for bad opcode', () => {
    assert.equal(opName(255), 'UNKNOWN(255)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/vm/opcodes.mjs`:

```js
export const OP = {
  // Push constants
  PUSH_INT:     0x01,
  PUSH_STRING:  0x02,
  PUSH_FLOAT:   0x03,
  PUSH_0:       0x04,
  PUSH_1:       0x05,

  // Variables
  LOAD_LOCAL:   0x10,
  STORE_LOCAL:  0x11,
  LOAD_GLOBAL:  0x12,
  STORE_GLOBAL: 0x13,

  // Arithmetic
  ADD:          0x20,
  SUB:          0x21,
  MUL:          0x22,
  DIV:          0x23,
  MOD:          0x24,
  NEGATE:       0x25,

  // Comparison
  EQ:           0x30,
  NE:           0x31,
  LT:           0x32,
  LE:           0x33,
  GT:           0x34,
  GE:           0x35,

  // Bitwise
  BITAND:       0x38,
  BITOR:        0x39,
  BITXOR:       0x3A,
  LSH:          0x3B,
  RSH:          0x3C,
  BITNOT:       0x3D,

  // Logical
  NOT:          0x3E,

  // Jump
  JUMP:             0x40,
  JUMP_IF_ZERO:     0x41,
  JUMP_IF_NONZERO:  0x42,

  // Function
  CALL_LOCAL:   0x50,
  CALL_EFUN:    0x51,
  CALL_OTHER:   0x52,
  CALL_SIMUL:   0x53,
  RETURN:       0x54,
  RETURN_ZERO:  0x55,

  // Compound assignment
  ADD_EQ:       0x60,
  SUB_EQ:       0x61,
  MUL_EQ:       0x62,
  DIV_EQ:       0x63,
  MOD_EQ:       0x64,
  INC:          0x65,
  DEC:          0x66,

  // Collections
  INDEX:        0x70,
  INDEX_LVALUE: 0x71,
  RANGE:        0x72,
  MAKE_ARRAY:   0x73,
  MAKE_MAPPING: 0x74,

  // Object
  CALL_INHERITED: 0x80,
  THIS_OBJECT:    0x81,

  // Loops
  FOREACH_INIT: 0x90,
  FOREACH_NEXT: 0x91,
  FOREACH_END:  0x92,

  // Special
  CATCH:        0xA0,
  END_CATCH:    0xA1,
  SWITCH:       0xA2,
  POP:          0xB0,
  DUP:          0xB1,
};

const nameMap = new Map(Object.entries(OP).map(([k, v]) => [v, k]));

export function opName(code) {
  return nameMap.get(code) ?? `UNKNOWN(${code})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All opcodes tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/opcodes.mjs test/vm/opcodes.test.mjs && git commit -m "feat: add opcode definitions"
```

---

### Task 4: Program Structure

**Files:**
- Create: `lpc-js/src/vm/program.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/vm/program.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Program } from '../../src/vm/program.mjs';

describe('Program', () => {
  it('constructs with filename and empty defaults', () => {
    const prog = new Program('test.c');
    assert.equal(prog.filename, 'test.c');
    assert.ok(prog.bytecode instanceof Uint8Array);
    assert.equal(prog.bytecode.length, 0);
    assert.deepEqual(prog.functions, []);
    assert.deepEqual(prog.strings, []);
    assert.deepEqual(prog.variables, []);
    assert.deepEqual(prog.inherits, []);
    assert.deepEqual(prog.classes, []);
  });

  it('findFunction returns function entry by name', () => {
    const prog = new Program('test.c');
    prog.functions.push({ name: 'add', numArgs: 2, numLocals: 0, offset: 0, flags: 0, type: 0 });
    prog.functions.push({ name: 'main', numArgs: 0, numLocals: 1, offset: 10, flags: 0, type: 0 });
    const f = prog.findFunction('main');
    assert.equal(f.name, 'main');
    assert.equal(f.offset, 10);
  });

  it('findFunction returns null for unknown function', () => {
    const prog = new Program('test.c');
    assert.equal(prog.findFunction('nope'), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/vm/program.mjs`:

```js
export class Program {
  constructor(filename) {
    this.filename = filename;
    this.bytecode = new Uint8Array(0);
    this.functions = [];
    this.strings = [];
    this.variables = [];
    this.inherits = [];
    this.classes = [];
    this.lineNumbers = [];
    this.argumentTypes = [];
  }

  findFunction(name) {
    return this.functions.find(f => f.name === name) ?? null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All Program tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/program.mjs test/vm/program.test.mjs && git commit -m "feat: add Program structure"
```

---

### Task 5: Lexer

**Files:**
- Create: `lpc-js/src/compiler/lexer.mjs`
- Create: `lpc-js/test/compiler/lexer.test.mjs`

- [ ] **Step 1: Write the failing test — basic tokens**

Write `lpc-js/test/compiler/lexer.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, T } from '../../src/compiler/lexer.mjs';

describe('lexer', () => {
  it('tokenizes integers', () => {
    const tokens = tokenize('42');
    assert.equal(tokens.length, 2); // INT_LIT + EOF
    assert.equal(tokens[0].type, T.INT_LIT);
    assert.equal(tokens[0].value, 42);
    assert.equal(tokens[1].type, T.EOF);
  });

  it('tokenizes negative as unary minus + int', () => {
    const tokens = tokenize('-5');
    assert.equal(tokens[0].type, T.MINUS);
    assert.equal(tokens[1].type, T.INT_LIT);
    assert.equal(tokens[1].value, 5);
  });

  it('tokenizes hex literals', () => {
    const tokens = tokenize('0xff');
    assert.equal(tokens[0].type, T.INT_LIT);
    assert.equal(tokens[0].value, 255);
  });

  it('tokenizes float literals', () => {
    const tokens = tokenize('3.14');
    assert.equal(tokens[0].type, T.FLOAT_LIT);
    assert.equal(tokens[0].value, 3.14);
  });

  it('tokenizes string literals', () => {
    const tokens = tokenize('"hello world"');
    assert.equal(tokens[0].type, T.STRING_LIT);
    assert.equal(tokens[0].value, 'hello world');
  });

  it('tokenizes string with escape sequences', () => {
    const tokens = tokenize('"a\\nb\\t"');
    assert.equal(tokens[0].value, 'a\nb\t');
  });

  it('tokenizes identifiers', () => {
    const tokens = tokenize('foo bar_baz');
    assert.equal(tokens[0].type, T.IDENT);
    assert.equal(tokens[0].value, 'foo');
    assert.equal(tokens[1].type, T.IDENT);
    assert.equal(tokens[1].value, 'bar_baz');
  });

  it('tokenizes keywords', () => {
    const tokens = tokenize('if else while for return int string');
    assert.equal(tokens[0].type, T.IF);
    assert.equal(tokens[1].type, T.ELSE);
    assert.equal(tokens[2].type, T.WHILE);
    assert.equal(tokens[3].type, T.FOR);
    assert.equal(tokens[4].type, T.RETURN);
    assert.equal(tokens[5].type, T.TYPE_INT);
    assert.equal(tokens[6].type, T.TYPE_STRING);
  });

  it('tokenizes operators', () => {
    const tokens = tokenize('+ - * / % == != < <= > >= && || !');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.PLUS, T.MINUS, T.STAR, T.SLASH, T.PERCENT,
      T.EQ_EQ, T.BANG_EQ, T.LT, T.LT_EQ, T.GT, T.GT_EQ,
      T.AMP_AMP, T.PIPE_PIPE, T.BANG
    ]);
  });

  it('tokenizes compound assignment', () => {
    const tokens = tokenize('+= -= *= /= %=');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.PLUS_EQ, T.MINUS_EQ, T.STAR_EQ, T.SLASH_EQ, T.PERCENT_EQ
    ]);
  });

  it('tokenizes increment/decrement', () => {
    const tokens = tokenize('++ --');
    assert.equal(tokens[0].type, T.PLUS_PLUS);
    assert.equal(tokens[1].type, T.MINUS_MINUS);
  });

  it('tokenizes bitwise operators', () => {
    const tokens = tokenize('& | ^ ~ << >>');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [T.AMP, T.PIPE, T.CARET, T.TILDE, T.LT_LT, T.GT_GT]);
  });

  it('tokenizes delimiters', () => {
    const tokens = tokenize('( ) { } [ ] ; , . ::');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.LPAREN, T.RPAREN, T.LBRACE, T.RBRACE,
      T.LBRACKET, T.RBRACKET, T.SEMICOLON, T.COMMA, T.DOT,
      T.COLON_COLON
    ]);
  });

  it('tokenizes arrow operator', () => {
    const tokens = tokenize('obj->func');
    assert.equal(tokens[0].type, T.IDENT);
    assert.equal(tokens[1].type, T.ARROW);
    assert.equal(tokens[2].type, T.IDENT);
  });

  it('tokenizes LPC array/mapping literals', () => {
    const tokens = tokenize('({ }) ([ ])');
    assert.equal(tokens[0].type, T.ARRAY_OPEN);
    assert.equal(tokens[1].type, T.ARRAY_CLOSE);
    assert.equal(tokens[2].type, T.MAPPING_OPEN);
    assert.equal(tokens[3].type, T.MAPPING_CLOSE);
  });

  it('tokenizes function pointer syntax', () => {
    const tokens = tokenize('(: :)');
    assert.equal(tokens[0].type, T.FP_OPEN);
    assert.equal(tokens[1].type, T.FP_CLOSE);
  });

  it('tokenizes ternary and assignment', () => {
    const tokens = tokenize('? : =');
    assert.equal(tokens[0].type, T.QUESTION);
    assert.equal(tokens[1].type, T.COLON);
    assert.equal(tokens[2].type, T.EQ);
  });

  it('tokenizes range operator', () => {
    const tokens = tokenize('..');
    assert.equal(tokens[0].type, T.DOT_DOT);
  });

  it('skips single-line comments', () => {
    const tokens = tokenize('42 // comment\n7');
    assert.equal(tokens[0].type, T.INT_LIT);
    assert.equal(tokens[0].value, 42);
    assert.equal(tokens[1].type, T.INT_LIT);
    assert.equal(tokens[1].value, 7);
  });

  it('skips block comments', () => {
    const tokens = tokenize('1 /* block */ 2');
    assert.equal(tokens[0].value, 1);
    assert.equal(tokens[1].value, 2);
  });

  it('tracks line numbers', () => {
    const tokens = tokenize('a\nb\nc');
    assert.equal(tokens[0].line, 1);
    assert.equal(tokens[1].line, 2);
    assert.equal(tokens[2].line, 3);
  });

  it('tokenizes varargs ellipsis', () => {
    const tokens = tokenize('...');
    assert.equal(tokens[0].type, T.ELLIPSIS);
  });

  it('tokenizes a simple function', () => {
    const tokens = tokenize('int add(int a, int b) { return a + b; }');
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      T.TYPE_INT, T.IDENT, T.LPAREN, T.TYPE_INT, T.IDENT, T.COMMA,
      T.TYPE_INT, T.IDENT, T.RPAREN, T.LBRACE,
      T.RETURN, T.IDENT, T.PLUS, T.IDENT, T.SEMICOLON,
      T.RBRACE
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/compiler/lexer.mjs`:

```js
export const T = {
  // Literals
  INT_LIT: 'INT_LIT',
  FLOAT_LIT: 'FLOAT_LIT',
  STRING_LIT: 'STRING_LIT',
  IDENT: 'IDENT',

  // Keywords
  IF: 'IF', ELSE: 'ELSE', WHILE: 'WHILE', DO: 'DO', FOR: 'FOR',
  FOREACH: 'FOREACH', IN: 'IN',
  SWITCH: 'SWITCH', CASE: 'CASE', DEFAULT: 'DEFAULT',
  RETURN: 'RETURN', BREAK: 'BREAK', CONTINUE: 'CONTINUE',
  INHERIT: 'INHERIT', CLASS: 'CLASS',
  PRIVATE: 'PRIVATE', PROTECTED: 'PROTECTED', PUBLIC: 'PUBLIC',
  STATIC: 'STATIC', NOMASK: 'NOMASK', NOSAVE: 'NOSAVE',
  VARARGS: 'VARARGS',

  // Type keywords
  TYPE_INT: 'TYPE_INT', TYPE_STRING: 'TYPE_STRING', TYPE_FLOAT: 'TYPE_FLOAT',
  TYPE_OBJECT: 'TYPE_OBJECT', TYPE_MAPPING: 'TYPE_MAPPING',
  TYPE_MIXED: 'TYPE_MIXED', TYPE_VOID: 'TYPE_VOID', TYPE_BUFFER: 'TYPE_BUFFER',
  TYPE_FUNCTION: 'TYPE_FUNCTION', TYPE_STATUS: 'TYPE_STATUS',

  // Operators
  PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH', PERCENT: 'PERCENT',
  EQ: 'EQ', EQ_EQ: 'EQ_EQ', BANG: 'BANG', BANG_EQ: 'BANG_EQ',
  LT: 'LT', LT_EQ: 'LT_EQ', GT: 'GT', GT_EQ: 'GT_EQ',
  AMP: 'AMP', AMP_AMP: 'AMP_AMP', PIPE: 'PIPE', PIPE_PIPE: 'PIPE_PIPE',
  CARET: 'CARET', TILDE: 'TILDE', LT_LT: 'LT_LT', GT_GT: 'GT_GT',
  PLUS_EQ: 'PLUS_EQ', MINUS_EQ: 'MINUS_EQ', STAR_EQ: 'STAR_EQ',
  SLASH_EQ: 'SLASH_EQ', PERCENT_EQ: 'PERCENT_EQ',
  AMP_EQ: 'AMP_EQ', PIPE_EQ: 'PIPE_EQ', CARET_EQ: 'CARET_EQ',
  LT_LT_EQ: 'LT_LT_EQ', GT_GT_EQ: 'GT_GT_EQ',
  PLUS_PLUS: 'PLUS_PLUS', MINUS_MINUS: 'MINUS_MINUS',
  ARROW: 'ARROW', QUESTION: 'QUESTION',

  // Delimiters
  LPAREN: 'LPAREN', RPAREN: 'RPAREN', LBRACE: 'LBRACE', RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET',
  SEMICOLON: 'SEMICOLON', COMMA: 'COMMA', DOT: 'DOT', DOT_DOT: 'DOT_DOT',
  ELLIPSIS: 'ELLIPSIS',
  COLON: 'COLON', COLON_COLON: 'COLON_COLON',

  // LPC special
  ARRAY_OPEN: 'ARRAY_OPEN', ARRAY_CLOSE: 'ARRAY_CLOSE',
  MAPPING_OPEN: 'MAPPING_OPEN', MAPPING_CLOSE: 'MAPPING_CLOSE',
  FP_OPEN: 'FP_OPEN', FP_CLOSE: 'FP_CLOSE',

  // Control
  EOF: 'EOF',
};

const KEYWORDS = {
  'if': T.IF, 'else': T.ELSE, 'while': T.WHILE, 'do': T.DO, 'for': T.FOR,
  'foreach': T.FOREACH, 'in': T.IN,
  'switch': T.SWITCH, 'case': T.CASE, 'default': T.DEFAULT,
  'return': T.RETURN, 'break': T.BREAK, 'continue': T.CONTINUE,
  'inherit': T.INHERIT, 'class': T.CLASS,
  'private': T.PRIVATE, 'protected': T.PROTECTED, 'public': T.PUBLIC,
  'static': T.STATIC, 'nomask': T.NOMASK, 'nosave': T.NOSAVE,
  'varargs': T.VARARGS,
  'int': T.TYPE_INT, 'string': T.TYPE_STRING, 'float': T.TYPE_FLOAT,
  'object': T.TYPE_OBJECT, 'mapping': T.TYPE_MAPPING,
  'mixed': T.TYPE_MIXED, 'void': T.TYPE_VOID, 'buffer': T.TYPE_BUFFER,
  'function': T.TYPE_FUNCTION, 'status': T.TYPE_STATUS,
};

const ESCAPE = { 'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '"': '"', '0': '\0' };

function token(type, value, line, file) {
  return { type, value, line, file };
}

export function tokenize(source, file = '<input>') {
  const tokens = [];
  let pos = 0;
  let line = 1;

  function ch() { return source[pos]; }
  function peek(offset = 1) { return source[pos + offset]; }
  function advance() { const c = source[pos++]; if (c === '\n') line++; return c; }
  function match(expected) { if (source[pos] === expected) { advance(); return true; } return false; }
  function at(s) { return source.startsWith(s, pos); }

  while (pos < source.length) {
    // Whitespace
    if (ch() === ' ' || ch() === '\t' || ch() === '\r' || ch() === '\n') {
      advance();
      continue;
    }

    // Single-line comment
    if (at('//')) {
      while (pos < source.length && ch() !== '\n') advance();
      continue;
    }

    // Block comment
    if (at('/*')) {
      advance(); advance();
      while (pos < source.length && !at('*/')) advance();
      if (pos < source.length) { advance(); advance(); }
      continue;
    }

    const startLine = line;

    // String literal
    if (ch() === '"') {
      advance();
      let str = '';
      while (pos < source.length && ch() !== '"') {
        if (ch() === '\\') {
          advance();
          str += ESCAPE[ch()] ?? ch();
          advance();
        } else {
          str += advance();
        }
      }
      if (pos < source.length) advance(); // closing "
      tokens.push(token(T.STRING_LIT, str, startLine, file));
      continue;
    }

    // Number literal (int or float)
    if (ch() >= '0' && ch() <= '9') {
      let num = '';
      if (ch() === '0' && (peek() === 'x' || peek() === 'X')) {
        num += advance(); num += advance(); // 0x
        while (pos < source.length && /[0-9a-fA-F]/.test(ch())) num += advance();
        tokens.push(token(T.INT_LIT, parseInt(num, 16), startLine, file));
      } else {
        while (pos < source.length && ch() >= '0' && ch() <= '9') num += advance();
        if (ch() === '.' && peek() !== '.') {
          num += advance(); // .
          while (pos < source.length && ch() >= '0' && ch() <= '9') num += advance();
          tokens.push(token(T.FLOAT_LIT, parseFloat(num), startLine, file));
        } else {
          tokens.push(token(T.INT_LIT, parseInt(num, 10), startLine, file));
        }
      }
      continue;
    }

    // Identifier or keyword
    if ((ch() >= 'a' && ch() <= 'z') || (ch() >= 'A' && ch() <= 'Z') || ch() === '_') {
      let ident = '';
      while (pos < source.length && ((ch() >= 'a' && ch() <= 'z') || (ch() >= 'A' && ch() <= 'Z') || (ch() >= '0' && ch() <= '9') || ch() === '_')) {
        ident += advance();
      }
      const kw = KEYWORDS[ident];
      tokens.push(token(kw ?? T.IDENT, kw ? ident : ident, startLine, file));
      continue;
    }

    // Two-char and LPC special tokens starting with (
    if (ch() === '(') {
      if (peek() === '{') { advance(); advance(); tokens.push(token(T.ARRAY_OPEN, '({', startLine, file)); continue; }
      if (peek() === '[') { advance(); advance(); tokens.push(token(T.MAPPING_OPEN, '([', startLine, file)); continue; }
      if (peek() === ':') { advance(); advance(); tokens.push(token(T.FP_OPEN, '(:', startLine, file)); continue; }
      advance(); tokens.push(token(T.LPAREN, '(', startLine, file)); continue;
    }

    // Closing LPC specials
    if (ch() === '}' && peek() === ')') { advance(); advance(); tokens.push(token(T.ARRAY_CLOSE, '})', startLine, file)); continue; }
    if (ch() === ']' && peek() === ')') { advance(); advance(); tokens.push(token(T.MAPPING_CLOSE, '])', startLine, file)); continue; }
    if (ch() === ':' && peek() === ')') { advance(); advance(); tokens.push(token(T.FP_CLOSE, ':)', startLine, file)); continue; }

    // Operators and delimiters
    const c = advance();
    switch (c) {
      case ')': tokens.push(token(T.RPAREN, ')', startLine, file)); break;
      case '{': tokens.push(token(T.LBRACE, '{', startLine, file)); break;
      case '}': tokens.push(token(T.RBRACE, '}', startLine, file)); break;
      case '[': tokens.push(token(T.LBRACKET, '[', startLine, file)); break;
      case ']': tokens.push(token(T.RBRACKET, ']', startLine, file)); break;
      case ';': tokens.push(token(T.SEMICOLON, ';', startLine, file)); break;
      case ',': tokens.push(token(T.COMMA, ',', startLine, file)); break;
      case '~': tokens.push(token(T.TILDE, '~', startLine, file)); break;
      case '?': tokens.push(token(T.QUESTION, '?', startLine, file)); break;

      case '.':
        if (match('.')) {
          if (match('.')) { tokens.push(token(T.ELLIPSIS, '...', startLine, file)); }
          else { tokens.push(token(T.DOT_DOT, '..', startLine, file)); }
        } else { tokens.push(token(T.DOT, '.', startLine, file)); }
        break;

      case ':':
        if (match(':')) { tokens.push(token(T.COLON_COLON, '::', startLine, file)); }
        else { tokens.push(token(T.COLON, ':', startLine, file)); }
        break;

      case '+':
        if (match('+')) { tokens.push(token(T.PLUS_PLUS, '++', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.PLUS_EQ, '+=', startLine, file)); }
        else { tokens.push(token(T.PLUS, '+', startLine, file)); }
        break;

      case '-':
        if (match('-')) { tokens.push(token(T.MINUS_MINUS, '--', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.MINUS_EQ, '-=', startLine, file)); }
        else if (match('>')) { tokens.push(token(T.ARROW, '->', startLine, file)); }
        else { tokens.push(token(T.MINUS, '-', startLine, file)); }
        break;

      case '*':
        if (match('=')) { tokens.push(token(T.STAR_EQ, '*=', startLine, file)); }
        else { tokens.push(token(T.STAR, '*', startLine, file)); }
        break;

      case '/':
        if (match('=')) { tokens.push(token(T.SLASH_EQ, '/=', startLine, file)); }
        else { tokens.push(token(T.SLASH, '/', startLine, file)); }
        break;

      case '%':
        if (match('=')) { tokens.push(token(T.PERCENT_EQ, '%=', startLine, file)); }
        else { tokens.push(token(T.PERCENT, '%', startLine, file)); }
        break;

      case '=':
        if (match('=')) { tokens.push(token(T.EQ_EQ, '==', startLine, file)); }
        else { tokens.push(token(T.EQ, '=', startLine, file)); }
        break;

      case '!':
        if (match('=')) { tokens.push(token(T.BANG_EQ, '!=', startLine, file)); }
        else { tokens.push(token(T.BANG, '!', startLine, file)); }
        break;

      case '<':
        if (match('<')) {
          if (match('=')) { tokens.push(token(T.LT_LT_EQ, '<<=', startLine, file)); }
          else { tokens.push(token(T.LT_LT, '<<', startLine, file)); }
        }
        else if (match('=')) { tokens.push(token(T.LT_EQ, '<=', startLine, file)); }
        else { tokens.push(token(T.LT, '<', startLine, file)); }
        break;

      case '>':
        if (match('>')) {
          if (match('=')) { tokens.push(token(T.GT_GT_EQ, '>>=', startLine, file)); }
          else { tokens.push(token(T.GT_GT, '>>', startLine, file)); }
        }
        else if (match('=')) { tokens.push(token(T.GT_EQ, '>=', startLine, file)); }
        else { tokens.push(token(T.GT, '>', startLine, file)); }
        break;

      case '&':
        if (match('&')) { tokens.push(token(T.AMP_AMP, '&&', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.AMP_EQ, '&=', startLine, file)); }
        else { tokens.push(token(T.AMP, '&', startLine, file)); }
        break;

      case '|':
        if (match('|')) { tokens.push(token(T.PIPE_PIPE, '||', startLine, file)); }
        else if (match('=')) { tokens.push(token(T.PIPE_EQ, '|=', startLine, file)); }
        else { tokens.push(token(T.PIPE, '|', startLine, file)); }
        break;

      case '^':
        if (match('=')) { tokens.push(token(T.CARET_EQ, '^=', startLine, file)); }
        else { tokens.push(token(T.CARET, '^', startLine, file)); }
        break;

      default:
        throw new Error(`Unexpected character '${c}' at ${file}:${startLine}`);
    }
  }

  tokens.push(token(T.EOF, null, line, file));
  return tokens;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lpc-js && npm test`
Expected: All lexer tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/lexer.mjs test/compiler/lexer.test.mjs && git commit -m "feat: add LPC lexer"
```

---

### Task 6: AST Node Definitions

**Files:**
- Create: `lpc-js/src/compiler/ast.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/compiler/ast.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as AST from '../../src/compiler/ast.mjs';

describe('AST nodes', () => {
  it('creates IntLiteral', () => {
    const n = AST.intLiteral(42, 1);
    assert.equal(n.type, 'IntLiteral');
    assert.equal(n.value, 42);
    assert.equal(n.line, 1);
  });

  it('creates BinaryExpression', () => {
    const left = AST.intLiteral(1, 1);
    const right = AST.intLiteral(2, 1);
    const n = AST.binaryExpr('+', left, right, 1);
    assert.equal(n.type, 'BinaryExpression');
    assert.equal(n.operator, '+');
    assert.equal(n.left.value, 1);
    assert.equal(n.right.value, 2);
  });

  it('creates FunctionDecl', () => {
    const body = AST.block([], 1);
    const n = AST.functionDecl('add', 'int', [{ typeName: 'int', name: 'a' }], body, 0, 1);
    assert.equal(n.type, 'FunctionDecl');
    assert.equal(n.name, 'add');
    assert.equal(n.returnType, 'int');
    assert.equal(n.params.length, 1);
  });

  it('creates IfStatement', () => {
    const cond = AST.intLiteral(1, 1);
    const then = AST.block([], 1);
    const n = AST.ifStatement(cond, then, null, 1);
    assert.equal(n.type, 'IfStatement');
    assert.equal(n.alternate, null);
  });

  it('creates CallExpression', () => {
    const n = AST.callExpr('write', [AST.stringLiteral('hi', 1)], 1);
    assert.equal(n.type, 'CallExpression');
    assert.equal(n.name, 'write');
    assert.equal(n.args.length, 1);
  });

  it('creates AssignExpression', () => {
    const left = AST.identifier('x', 1);
    const right = AST.intLiteral(5, 1);
    const n = AST.assignExpr('=', left, right, 1);
    assert.equal(n.type, 'AssignExpression');
    assert.equal(n.operator, '=');
  });

  it('creates VarDecl', () => {
    const n = AST.varDecl('int', 'x', AST.intLiteral(0, 1), 0, 1);
    assert.equal(n.type, 'VarDecl');
    assert.equal(n.varType, 'int');
    assert.equal(n.name, 'x');
  });

  it('creates ReturnStatement', () => {
    const n = AST.returnStatement(AST.intLiteral(1, 1), 1);
    assert.equal(n.type, 'ReturnStatement');
    assert.equal(n.value.value, 1);
  });

  it('creates WhileStatement', () => {
    const n = AST.whileStatement(AST.intLiteral(1, 1), AST.block([], 1), 1);
    assert.equal(n.type, 'WhileStatement');
  });

  it('creates ForStatement', () => {
    const n = AST.forStatement(null, AST.intLiteral(1, 1), null, AST.block([], 1), 1);
    assert.equal(n.type, 'ForStatement');
  });

  it('creates ArrayLiteral', () => {
    const n = AST.arrayLiteral([AST.intLiteral(1, 1)], 1);
    assert.equal(n.type, 'ArrayLiteral');
    assert.equal(n.elements.length, 1);
  });

  it('creates MappingLiteral', () => {
    const n = AST.mappingLiteral([{ key: AST.stringLiteral('a', 1), value: AST.intLiteral(1, 1) }], 1);
    assert.equal(n.type, 'MappingLiteral');
    assert.equal(n.entries.length, 1);
  });

  it('creates IndexExpression', () => {
    const n = AST.indexExpr(AST.identifier('arr', 1), AST.intLiteral(0, 1), 1);
    assert.equal(n.type, 'IndexExpression');
  });

  it('creates CallOther', () => {
    const n = AST.callOther(AST.identifier('obj', 1), 'func', [AST.intLiteral(1, 1)], 1);
    assert.equal(n.type, 'CallOther');
    assert.equal(n.method, 'func');
  });

  it('creates Program', () => {
    const n = AST.program([AST.functionDecl('main', 'void', [], AST.block([], 1), 0, 1)], 1);
    assert.equal(n.type, 'Program');
    assert.equal(n.body.length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/compiler/ast.mjs`:

```js
export function program(body, line) {
  return { type: 'Program', body, line };
}

export function functionDecl(name, returnType, params, body, flags, line) {
  return { type: 'FunctionDecl', name, returnType, params, body, flags, line };
}

export function varDecl(varType, name, init, flags, line) {
  return { type: 'VarDecl', varType, name, init, flags, line };
}

export function block(statements, line) {
  return { type: 'Block', statements, line };
}

export function ifStatement(condition, consequent, alternate, line) {
  return { type: 'IfStatement', condition, consequent, alternate, line };
}

export function whileStatement(condition, body, line) {
  return { type: 'WhileStatement', condition, body, line };
}

export function doWhileStatement(condition, body, line) {
  return { type: 'DoWhileStatement', condition, body, line };
}

export function forStatement(init, condition, update, body, line) {
  return { type: 'ForStatement', init, condition, update, body, line };
}

export function foreachStatement(varType, varName, expr, body, line) {
  return { type: 'ForeachStatement', varType, varName, expr, body, line };
}

export function switchStatement(discriminant, cases, line) {
  return { type: 'SwitchStatement', discriminant, cases, line };
}

export function switchCase(test, body, line) {
  return { type: 'SwitchCase', test, body, line };
}

export function returnStatement(value, line) {
  return { type: 'ReturnStatement', value, line };
}

export function breakStatement(line) {
  return { type: 'BreakStatement', line };
}

export function continueStatement(line) {
  return { type: 'ContinueStatement', line };
}

export function expressionStatement(expression, line) {
  return { type: 'ExpressionStatement', expression, line };
}

export function binaryExpr(operator, left, right, line) {
  return { type: 'BinaryExpression', operator, left, right, line };
}

export function unaryExpr(operator, operand, prefix, line) {
  return { type: 'UnaryExpression', operator, operand, prefix, line };
}

export function updateExpr(operator, operand, prefix, line) {
  return { type: 'UpdateExpression', operator, operand, prefix, line };
}

export function assignExpr(operator, left, right, line) {
  return { type: 'AssignExpression', operator, left, right, line };
}

export function ternaryExpr(condition, consequent, alternate, line) {
  return { type: 'TernaryExpression', condition, consequent, alternate, line };
}

export function callExpr(name, args, line) {
  return { type: 'CallExpression', name, args, line };
}

export function callOther(object, method, args, line) {
  return { type: 'CallOther', object, method, args, line };
}

export function scopeResolution(name, line) {
  return { type: 'ScopeResolution', name, line };
}

export function indexExpr(object, index, line) {
  return { type: 'IndexExpression', object, index, line };
}

export function rangeExpr(object, from, to, line) {
  return { type: 'RangeExpression', object, from, to, line };
}

export function identifier(name, line) {
  return { type: 'Identifier', name, line };
}

export function intLiteral(value, line) {
  return { type: 'IntLiteral', value, line };
}

export function floatLiteral(value, line) {
  return { type: 'FloatLiteral', value, line };
}

export function stringLiteral(value, line) {
  return { type: 'StringLiteral', value, line };
}

export function arrayLiteral(elements, line) {
  return { type: 'ArrayLiteral', elements, line };
}

export function mappingLiteral(entries, line) {
  return { type: 'MappingLiteral', entries, line };
}

export function inheritDecl(path, flags, line) {
  return { type: 'InheritDecl', path, flags, line };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All AST tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/ast.mjs test/compiler/ast.test.mjs && git commit -m "feat: add AST node definitions"
```

---

### Task 7: Parser — Expressions

**Files:**
- Create: `lpc-js/src/compiler/parser.mjs`
- Create: `lpc-js/test/compiler/parser.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/compiler/parser.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../src/compiler/parser.mjs';

// Helper: parse a single expression from a function body
function parseExpr(src) {
  const prog = parse(`mixed __test__() { return ${src}; }`);
  const func = prog.body[0];
  const ret = func.body.statements[0];
  return ret.value;
}

describe('parser — expressions', () => {
  it('parses integer literal', () => {
    const e = parseExpr('42');
    assert.equal(e.type, 'IntLiteral');
    assert.equal(e.value, 42);
  });

  it('parses float literal', () => {
    const e = parseExpr('3.14');
    assert.equal(e.type, 'FloatLiteral');
    assert.equal(e.value, 3.14);
  });

  it('parses string literal', () => {
    const e = parseExpr('"hello"');
    assert.equal(e.type, 'StringLiteral');
    assert.equal(e.value, 'hello');
  });

  it('parses identifier', () => {
    const e = parseExpr('foo');
    assert.equal(e.type, 'Identifier');
    assert.equal(e.name, 'foo');
  });

  it('parses binary arithmetic', () => {
    const e = parseExpr('1 + 2');
    assert.equal(e.type, 'BinaryExpression');
    assert.equal(e.operator, '+');
    assert.equal(e.left.value, 1);
    assert.equal(e.right.value, 2);
  });

  it('respects precedence: * before +', () => {
    const e = parseExpr('1 + 2 * 3');
    assert.equal(e.operator, '+');
    assert.equal(e.right.operator, '*');
  });

  it('parses parenthesized expression', () => {
    const e = parseExpr('(1 + 2) * 3');
    assert.equal(e.operator, '*');
    assert.equal(e.left.operator, '+');
  });

  it('parses comparison operators', () => {
    const e = parseExpr('a > b');
    assert.equal(e.operator, '>');
  });

  it('parses equality operators', () => {
    const e = parseExpr('a == b');
    assert.equal(e.operator, '==');
  });

  it('parses logical and/or', () => {
    const e = parseExpr('a && b || c');
    assert.equal(e.operator, '||');
    assert.equal(e.left.operator, '&&');
  });

  it('parses unary minus', () => {
    const e = parseExpr('-x');
    assert.equal(e.type, 'UnaryExpression');
    assert.equal(e.operator, '-');
    assert.equal(e.operand.name, 'x');
  });

  it('parses unary not', () => {
    const e = parseExpr('!x');
    assert.equal(e.type, 'UnaryExpression');
    assert.equal(e.operator, '!');
  });

  it('parses bitwise not', () => {
    const e = parseExpr('~x');
    assert.equal(e.type, 'UnaryExpression');
    assert.equal(e.operator, '~');
  });

  it('parses ternary expression', () => {
    const e = parseExpr('a ? 1 : 2');
    assert.equal(e.type, 'TernaryExpression');
  });

  it('parses function call', () => {
    const e = parseExpr('write(1, 2)');
    assert.equal(e.type, 'CallExpression');
    assert.equal(e.name, 'write');
    assert.equal(e.args.length, 2);
  });

  it('parses index expression', () => {
    const e = parseExpr('arr[0]');
    assert.equal(e.type, 'IndexExpression');
    assert.equal(e.object.name, 'arr');
    assert.equal(e.index.value, 0);
  });

  it('parses call_other arrow syntax', () => {
    const e = parseExpr('obj->func(1)');
    assert.equal(e.type, 'CallOther');
    assert.equal(e.object.name, 'obj');
    assert.equal(e.method, 'func');
    assert.equal(e.args.length, 1);
  });

  it('parses assignment expression', () => {
    const e = parseExpr('x = 5');
    assert.equal(e.type, 'AssignExpression');
    assert.equal(e.operator, '=');
    assert.equal(e.left.name, 'x');
    assert.equal(e.right.value, 5);
  });

  it('parses compound assignment', () => {
    const e = parseExpr('x += 3');
    assert.equal(e.type, 'AssignExpression');
    assert.equal(e.operator, '+=');
  });

  it('parses prefix increment', () => {
    const e = parseExpr('++x');
    assert.equal(e.type, 'UpdateExpression');
    assert.equal(e.operator, '++');
    assert.equal(e.prefix, true);
  });

  it('parses postfix increment', () => {
    const e = parseExpr('x++');
    assert.equal(e.type, 'UpdateExpression');
    assert.equal(e.operator, '++');
    assert.equal(e.prefix, false);
  });

  it('parses array literal', () => {
    const e = parseExpr('({ 1, 2, 3 })');
    assert.equal(e.type, 'ArrayLiteral');
    assert.equal(e.elements.length, 3);
  });

  it('parses mapping literal', () => {
    const e = parseExpr('([ "a": 1, "b": 2 ])');
    assert.equal(e.type, 'MappingLiteral');
    assert.equal(e.entries.length, 2);
    assert.equal(e.entries[0].key.value, 'a');
    assert.equal(e.entries[0].value.value, 1);
  });

  it('parses bitwise operators', () => {
    const e = parseExpr('a & b | c ^ d');
    // | is lowest: (a & b) | (c ^ d)
    assert.equal(e.operator, '|');
  });

  it('parses shift operators', () => {
    const e = parseExpr('a << 2');
    assert.equal(e.operator, '<<');
  });

  it('parses range expression', () => {
    const e = parseExpr('arr[1..3]');
    assert.equal(e.type, 'RangeExpression');
    assert.equal(e.from.value, 1);
    assert.equal(e.to.value, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/compiler/parser.mjs`:

```js
import { tokenize, T } from './lexer.mjs';
import * as AST from './ast.mjs';

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  advance() { return this.tokens[this.pos++]; }

  at(type) { return this.peek().type === type; }

  expect(type) {
    const tok = this.advance();
    if (tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok.type} ('${tok.value}') at ${tok.file}:${tok.line}`);
    }
    return tok;
  }

  match(type) {
    if (this.at(type)) { this.advance(); return true; }
    return false;
  }

  // ---- Top-Level ----

  parseProgram() {
    const body = [];
    while (!this.at(T.EOF)) {
      body.push(this.parseTopLevel());
    }
    return AST.program(body, 1);
  }

  parseTopLevel() {
    // inherit declaration
    if (this.at(T.INHERIT)) {
      return this.parseInherit();
    }
    // Collect modifiers
    let flags = 0;
    while (this.isModifier()) {
      this.advance();
    }
    // Must be a type
    const typeTok = this.parseTypeName();
    // Check if array type: int*
    let typeName = typeTok;
    if (this.match(T.STAR)) {
      typeName = typeName + '*';
    }
    const name = this.expect(T.IDENT).value;
    // Function or variable
    if (this.at(T.LPAREN)) {
      return this.parseFunctionDecl(typeName, name, flags);
    } else {
      return this.parseGlobalVarDecl(typeName, name, flags);
    }
  }

  isModifier() {
    const t = this.peek().type;
    return t === T.PRIVATE || t === T.PROTECTED || t === T.PUBLIC ||
           t === T.STATIC || t === T.NOMASK || t === T.NOSAVE || t === T.VARARGS;
  }

  isType() {
    const t = this.peek().type;
    return t === T.TYPE_INT || t === T.TYPE_STRING || t === T.TYPE_FLOAT ||
           t === T.TYPE_OBJECT || t === T.TYPE_MAPPING || t === T.TYPE_MIXED ||
           t === T.TYPE_VOID || t === T.TYPE_BUFFER || t === T.TYPE_FUNCTION ||
           t === T.TYPE_STATUS;
  }

  parseTypeName() {
    const tok = this.advance();
    return tok.value;
  }

  parseInherit() {
    const line = this.peek().line;
    this.expect(T.INHERIT);
    const path = this.expect(T.STRING_LIT).value;
    this.expect(T.SEMICOLON);
    return AST.inheritDecl(path, 0, line);
  }

  parseFunctionDecl(returnType, name, flags) {
    const line = this.peek().line;
    this.expect(T.LPAREN);
    const params = this.parseParamList();
    this.expect(T.RPAREN);
    // Prototype (just semicolon) or full body
    if (this.match(T.SEMICOLON)) {
      return AST.functionDecl(name, returnType, params, null, flags, line);
    }
    const body = this.parseBlock();
    return AST.functionDecl(name, returnType, params, body, flags, line);
  }

  parseParamList() {
    const params = [];
    if (this.at(T.RPAREN) || this.at(T.TYPE_VOID)) {
      if (this.at(T.TYPE_VOID)) this.advance();
      return params;
    }
    do {
      if (this.at(T.ELLIPSIS)) {
        this.advance();
        params.push({ typeName: '...', name: null });
        break;
      }
      let typeName = this.parseTypeName();
      if (this.match(T.STAR)) typeName += '*';
      if (this.at(T.ELLIPSIS)) {
        this.advance();
        params.push({ typeName: typeName + '...', name: null });
        break;
      }
      const name = this.expect(T.IDENT).value;
      params.push({ typeName, name });
    } while (this.match(T.COMMA));
    return params;
  }

  parseGlobalVarDecl(typeName, name, flags) {
    const line = this.peek().line;
    let init = null;
    if (this.match(T.EQ)) {
      init = this.parseExpression();
    }
    this.expect(T.SEMICOLON);
    return AST.varDecl(typeName, name, init, flags, line);
  }

  // ---- Statements ----

  parseBlock() {
    const line = this.peek().line;
    this.expect(T.LBRACE);
    const stmts = [];
    while (!this.at(T.RBRACE) && !this.at(T.EOF)) {
      stmts.push(this.parseStatement());
    }
    this.expect(T.RBRACE);
    return AST.block(stmts, line);
  }

  parseStatement() {
    const tok = this.peek();

    if (tok.type === T.LBRACE) return this.parseBlock();
    if (tok.type === T.IF) return this.parseIf();
    if (tok.type === T.WHILE) return this.parseWhile();
    if (tok.type === T.DO) return this.parseDoWhile();
    if (tok.type === T.FOR) return this.parseFor();
    if (tok.type === T.FOREACH) return this.parseForeach();
    if (tok.type === T.SWITCH) return this.parseSwitch();
    if (tok.type === T.RETURN) return this.parseReturn();
    if (tok.type === T.BREAK) { this.advance(); this.expect(T.SEMICOLON); return AST.breakStatement(tok.line); }
    if (tok.type === T.CONTINUE) { this.advance(); this.expect(T.SEMICOLON); return AST.continueStatement(tok.line); }

    // Local variable declaration: type name ...
    if (this.isType()) {
      return this.parseLocalVarDecl();
    }

    // Expression statement
    const expr = this.parseExpression();
    this.expect(T.SEMICOLON);
    return AST.expressionStatement(expr, tok.line);
  }

  parseLocalVarDecl() {
    const line = this.peek().line;
    let typeName = this.parseTypeName();
    if (this.match(T.STAR)) typeName += '*';
    const name = this.expect(T.IDENT).value;
    let init = null;
    if (this.match(T.EQ)) {
      init = this.parseExpression();
    }
    this.expect(T.SEMICOLON);
    return AST.varDecl(typeName, name, init, 0, line);
  }

  parseIf() {
    const line = this.peek().line;
    this.expect(T.IF);
    this.expect(T.LPAREN);
    const cond = this.parseExpression();
    this.expect(T.RPAREN);
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.match(T.ELSE)) {
      alternate = this.parseStatement();
    }
    return AST.ifStatement(cond, consequent, alternate, line);
  }

  parseWhile() {
    const line = this.peek().line;
    this.expect(T.WHILE);
    this.expect(T.LPAREN);
    const cond = this.parseExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.whileStatement(cond, body, line);
  }

  parseDoWhile() {
    const line = this.peek().line;
    this.expect(T.DO);
    const body = this.parseStatement();
    this.expect(T.WHILE);
    this.expect(T.LPAREN);
    const cond = this.parseExpression();
    this.expect(T.RPAREN);
    this.expect(T.SEMICOLON);
    return AST.doWhileStatement(cond, body, line);
  }

  parseFor() {
    const line = this.peek().line;
    this.expect(T.FOR);
    this.expect(T.LPAREN);
    let init = null;
    if (!this.at(T.SEMICOLON)) {
      if (this.isType()) {
        const typeName = this.parseTypeName();
        const name = this.expect(T.IDENT).value;
        let varInit = null;
        if (this.match(T.EQ)) varInit = this.parseExpression();
        init = AST.varDecl(typeName, name, varInit, 0, line);
      } else {
        init = this.parseExpression();
      }
    }
    this.expect(T.SEMICOLON);
    let cond = null;
    if (!this.at(T.SEMICOLON)) cond = this.parseExpression();
    this.expect(T.SEMICOLON);
    let update = null;
    if (!this.at(T.RPAREN)) update = this.parseExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.forStatement(init, cond, update, body, line);
  }

  parseForeach() {
    const line = this.peek().line;
    this.expect(T.FOREACH);
    this.expect(T.LPAREN);
    let varType = this.parseTypeName();
    const varName = this.expect(T.IDENT).value;
    this.expect(T.IN);
    const expr = this.parseExpression();
    this.expect(T.RPAREN);
    const body = this.parseStatement();
    return AST.foreachStatement(varType, varName, expr, body, line);
  }

  parseSwitch() {
    const line = this.peek().line;
    this.expect(T.SWITCH);
    this.expect(T.LPAREN);
    const disc = this.parseExpression();
    this.expect(T.RPAREN);
    this.expect(T.LBRACE);
    const cases = [];
    while (!this.at(T.RBRACE) && !this.at(T.EOF)) {
      if (this.match(T.CASE)) {
        const test = this.parseExpression();
        this.expect(T.COLON);
        const body = [];
        while (!this.at(T.CASE) && !this.at(T.DEFAULT) && !this.at(T.RBRACE) && !this.at(T.EOF)) {
          body.push(this.parseStatement());
        }
        cases.push(AST.switchCase(test, body, test.line));
      } else if (this.match(T.DEFAULT)) {
        this.expect(T.COLON);
        const body = [];
        while (!this.at(T.CASE) && !this.at(T.DEFAULT) && !this.at(T.RBRACE) && !this.at(T.EOF)) {
          body.push(this.parseStatement());
        }
        cases.push(AST.switchCase(null, body, line));
      }
    }
    this.expect(T.RBRACE);
    return AST.switchStatement(disc, cases, line);
  }

  parseReturn() {
    const line = this.peek().line;
    this.expect(T.RETURN);
    if (this.match(T.SEMICOLON)) {
      return AST.returnStatement(null, line);
    }
    const value = this.parseExpression();
    this.expect(T.SEMICOLON);
    return AST.returnStatement(value, line);
  }

  // ---- Expressions (precedence climbing) ----

  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    const left = this.parseTernary();
    if (this.at(T.EQ) || this.at(T.PLUS_EQ) || this.at(T.MINUS_EQ) ||
        this.at(T.STAR_EQ) || this.at(T.SLASH_EQ) || this.at(T.PERCENT_EQ) ||
        this.at(T.AMP_EQ) || this.at(T.PIPE_EQ) || this.at(T.CARET_EQ) ||
        this.at(T.LT_LT_EQ) || this.at(T.GT_GT_EQ)) {
      const op = this.advance();
      const right = this.parseAssignment();
      return AST.assignExpr(op.value, left, right, op.line);
    }
    return left;
  }

  parseTernary() {
    let expr = this.parseLogicalOr();
    if (this.match(T.QUESTION)) {
      const consequent = this.parseAssignment();
      this.expect(T.COLON);
      const alternate = this.parseAssignment();
      return AST.ternaryExpr(expr, consequent, alternate, expr.line);
    }
    return expr;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match(T.PIPE_PIPE)) {
      const right = this.parseLogicalAnd();
      left = AST.binaryExpr('||', left, right, left.line);
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseBitwiseOr();
    while (this.match(T.AMP_AMP)) {
      const right = this.parseBitwiseOr();
      left = AST.binaryExpr('&&', left, right, left.line);
    }
    return left;
  }

  parseBitwiseOr() {
    let left = this.parseBitwiseXor();
    while (this.match(T.PIPE)) {
      const right = this.parseBitwiseXor();
      left = AST.binaryExpr('|', left, right, left.line);
    }
    return left;
  }

  parseBitwiseXor() {
    let left = this.parseBitwiseAnd();
    while (this.match(T.CARET)) {
      const right = this.parseBitwiseAnd();
      left = AST.binaryExpr('^', left, right, left.line);
    }
    return left;
  }

  parseBitwiseAnd() {
    let left = this.parseEquality();
    while (this.match(T.AMP)) {
      const right = this.parseEquality();
      left = AST.binaryExpr('&', left, right, left.line);
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.at(T.EQ_EQ) || this.at(T.BANG_EQ)) {
      const op = this.advance();
      const right = this.parseComparison();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseComparison() {
    let left = this.parseShift();
    while (this.at(T.LT) || this.at(T.LT_EQ) || this.at(T.GT) || this.at(T.GT_EQ)) {
      const op = this.advance();
      const right = this.parseShift();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseShift() {
    let left = this.parseAdditive();
    while (this.at(T.LT_LT) || this.at(T.GT_GT)) {
      const op = this.advance();
      const right = this.parseAdditive();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.at(T.PLUS) || this.at(T.MINUS)) {
      const op = this.advance();
      const right = this.parseMultiplicative();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.at(T.STAR) || this.at(T.SLASH) || this.at(T.PERCENT)) {
      const op = this.advance();
      const right = this.parseUnary();
      left = AST.binaryExpr(op.value, left, right, left.line);
    }
    return left;
  }

  parseUnary() {
    if (this.at(T.MINUS) || this.at(T.BANG) || this.at(T.TILDE)) {
      const op = this.advance();
      const operand = this.parseUnary();
      return AST.unaryExpr(op.value, operand, true, op.line);
    }
    if (this.at(T.PLUS_PLUS) || this.at(T.MINUS_MINUS)) {
      const op = this.advance();
      const operand = this.parsePostfix();
      return AST.updateExpr(op.value, operand, true, op.line);
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.at(T.LBRACKET)) {
        this.advance();
        const index = this.parseExpression();
        if (this.match(T.DOT_DOT)) {
          const to = this.parseExpression();
          this.expect(T.RBRACKET);
          expr = AST.rangeExpr(expr, index, to, expr.line);
        } else {
          this.expect(T.RBRACKET);
          expr = AST.indexExpr(expr, index, expr.line);
        }
      } else if (this.at(T.ARROW)) {
        this.advance();
        const method = this.expect(T.IDENT).value;
        this.expect(T.LPAREN);
        const args = this.parseArgList();
        this.expect(T.RPAREN);
        expr = AST.callOther(expr, method, args, expr.line);
      } else if (this.at(T.PLUS_PLUS) || this.at(T.MINUS_MINUS)) {
        const op = this.advance();
        expr = AST.updateExpr(op.value, expr, false, op.line);
      } else {
        break;
      }
    }
    return expr;
  }

  parsePrimary() {
    const tok = this.peek();

    // Integer
    if (tok.type === T.INT_LIT) {
      this.advance();
      return AST.intLiteral(tok.value, tok.line);
    }

    // Float
    if (tok.type === T.FLOAT_LIT) {
      this.advance();
      return AST.floatLiteral(tok.value, tok.line);
    }

    // String
    if (tok.type === T.STRING_LIT) {
      this.advance();
      return AST.stringLiteral(tok.value, tok.line);
    }

    // Array literal ({  })
    if (tok.type === T.ARRAY_OPEN) {
      this.advance();
      const elements = [];
      if (!this.at(T.ARRAY_CLOSE)) {
        do { elements.push(this.parseExpression()); } while (this.match(T.COMMA));
      }
      this.expect(T.ARRAY_CLOSE);
      return AST.arrayLiteral(elements, tok.line);
    }

    // Mapping literal ([  ])
    if (tok.type === T.MAPPING_OPEN) {
      this.advance();
      const entries = [];
      if (!this.at(T.MAPPING_CLOSE)) {
        do {
          const key = this.parseExpression();
          this.expect(T.COLON);
          const value = this.parseExpression();
          entries.push({ key, value });
        } while (this.match(T.COMMA));
      }
      this.expect(T.MAPPING_CLOSE);
      return AST.mappingLiteral(entries, tok.line);
    }

    // Parenthesized expression
    if (tok.type === T.LPAREN) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(T.RPAREN);
      return expr;
    }

    // Identifier or function call
    if (tok.type === T.IDENT) {
      this.advance();
      if (this.at(T.LPAREN)) {
        this.advance();
        const args = this.parseArgList();
        this.expect(T.RPAREN);
        return AST.callExpr(tok.value, args, tok.line);
      }
      return AST.identifier(tok.value, tok.line);
    }

    throw new Error(`Unexpected token ${tok.type} ('${tok.value}') at ${tok.file}:${tok.line}`);
  }

  parseArgList() {
    const args = [];
    if (this.at(T.RPAREN)) return args;
    do { args.push(this.parseExpression()); } while (this.match(T.COMMA));
    return args;
  }
}

export function parse(source, file = '<input>') {
  const tokens = tokenize(source, file);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lpc-js && npm test`
Expected: All parser expression tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser.mjs test/compiler/parser.test.mjs && git commit -m "feat: add recursive descent parser with expression support"
```

---

### Task 8: Parser — Statements and Declarations

**Files:**
- Modify: `lpc-js/test/compiler/parser.test.mjs`

- [ ] **Step 1: Write the failing test — statements**

Append to `lpc-js/test/compiler/parser.test.mjs`:

```js
describe('parser — statements', () => {
  // Helper: parse a full program and return the first function's body statements
  function parseBody(funcSrc) {
    const prog = parse(funcSrc);
    return prog.body[0].body.statements;
  }

  it('parses variable declaration', () => {
    const stmts = parseBody('void f() { int x = 5; }');
    assert.equal(stmts[0].type, 'VarDecl');
    assert.equal(stmts[0].name, 'x');
    assert.equal(stmts[0].init.value, 5);
  });

  it('parses if/else', () => {
    const stmts = parseBody('void f() { if (x) { return 1; } else { return 2; } }');
    assert.equal(stmts[0].type, 'IfStatement');
    assert.notEqual(stmts[0].alternate, null);
  });

  it('parses while loop', () => {
    const stmts = parseBody('void f() { while (x > 0) { x -= 1; } }');
    assert.equal(stmts[0].type, 'WhileStatement');
  });

  it('parses for loop', () => {
    const stmts = parseBody('void f() { for (int i = 0; i < 10; i++) { write(i); } }');
    assert.equal(stmts[0].type, 'ForStatement');
    assert.equal(stmts[0].init.type, 'VarDecl');
  });

  it('parses do-while', () => {
    const stmts = parseBody('void f() { do { x++; } while (x < 10); }');
    assert.equal(stmts[0].type, 'DoWhileStatement');
  });

  it('parses switch', () => {
    const stmts = parseBody('void f() { switch(x) { case 1: return 1; default: return 0; } }');
    assert.equal(stmts[0].type, 'SwitchStatement');
    assert.equal(stmts[0].cases.length, 2);
    assert.equal(stmts[0].cases[1].test, null); // default
  });

  it('parses break and continue', () => {
    const stmts = parseBody('void f() { while(1) { break; continue; } }');
    const body = stmts[0].body.statements;
    assert.equal(body[0].type, 'BreakStatement');
    assert.equal(body[1].type, 'ContinueStatement');
  });

  it('parses return with no value', () => {
    const stmts = parseBody('void f() { return; }');
    assert.equal(stmts[0].type, 'ReturnStatement');
    assert.equal(stmts[0].value, null);
  });

  it('parses expression statement', () => {
    const stmts = parseBody('void f() { write("hi"); }');
    assert.equal(stmts[0].type, 'ExpressionStatement');
    assert.equal(stmts[0].expression.type, 'CallExpression');
  });
});

describe('parser — declarations', () => {
  it('parses function declaration', () => {
    const prog = parse('int add(int a, int b) { return a + b; }');
    const func = prog.body[0];
    assert.equal(func.type, 'FunctionDecl');
    assert.equal(func.name, 'add');
    assert.equal(func.returnType, 'int');
    assert.equal(func.params.length, 2);
    assert.equal(func.params[0].typeName, 'int');
    assert.equal(func.params[0].name, 'a');
  });

  it('parses function prototype', () => {
    const prog = parse('void setup(string name);');
    assert.equal(prog.body[0].type, 'FunctionDecl');
    assert.equal(prog.body[0].body, null);
  });

  it('parses global variable', () => {
    const prog = parse('int counter = 0;');
    assert.equal(prog.body[0].type, 'VarDecl');
    assert.equal(prog.body[0].name, 'counter');
  });

  it('parses inherit declaration', () => {
    const prog = parse('inherit "/std/object";');
    assert.equal(prog.body[0].type, 'InheritDecl');
    assert.equal(prog.body[0].path, '/std/object');
  });

  it('parses multiple functions', () => {
    const prog = parse('void a() { } void b() { }');
    assert.equal(prog.body.length, 2);
    assert.equal(prog.body[0].name, 'a');
    assert.equal(prog.body[1].name, 'b');
  });

  it('parses array type parameter', () => {
    const prog = parse('void f(string* arr) { }');
    assert.equal(prog.body[0].params[0].typeName, 'string*');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd lpc-js && npm test`
Expected: All parser statement and declaration tests PASS (implementation already exists in Task 7).

- [ ] **Step 3: Commit**

```bash
git add test/compiler/parser.test.mjs && git commit -m "test: add parser statement and declaration tests"
```

---

### Task 9: Code Generator

**Files:**
- Create: `lpc-js/src/compiler/codegen.mjs`
- Create: `lpc-js/test/compiler/codegen.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/compiler/codegen.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { OP } from '../../src/vm/opcodes.mjs';

// Helper: compile source, find function bytecode
function compileFn(src, funcName) {
  const prog = compile(src);
  const fn = prog.findFunction(funcName);
  assert.ok(fn, `function ${funcName} not found`);
  return { prog, fn };
}

// Helper: extract opcodes from bytecode starting at offset
function readOps(bytecode, start, count) {
  const ops = [];
  let pc = start;
  for (let i = 0; i < count && pc < bytecode.length; i++) {
    ops.push(bytecode[pc++]);
  }
  return ops;
}

describe('codegen', () => {
  it('compiles empty void function', () => {
    const { prog, fn } = compileFn('void f() { }', 'f');
    assert.ok(prog.bytecode.length > 0);
    // Should end with RETURN_ZERO
    assert.equal(prog.bytecode[fn.offset], OP.RETURN_ZERO);
  });

  it('compiles return integer literal', () => {
    const { prog, fn } = compileFn('int f() { return 42; }', 'f');
    // PUSH_INT 42, RETURN
    assert.equal(prog.bytecode[fn.offset], OP.PUSH_INT);
    // Find RETURN
    let foundReturn = false;
    for (let i = fn.offset; i < prog.bytecode.length; i++) {
      if (prog.bytecode[i] === OP.RETURN) { foundReturn = true; break; }
    }
    assert.ok(foundReturn);
  });

  it('compiles return 0 and 1 as PUSH_0/PUSH_1', () => {
    const { prog, fn } = compileFn('int f() { return 0; }', 'f');
    assert.equal(prog.bytecode[fn.offset], OP.PUSH_0);
  });

  it('compiles addition', () => {
    const { prog, fn } = compileFn('int f() { return 1 + 2; }', 'f');
    // Should contain PUSH_1, PUSH_INT(2), ADD, RETURN
    const bc = prog.bytecode;
    let found = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.ADD) { found = true; break; }
    }
    assert.ok(found, 'ADD opcode not found');
  });

  it('compiles local variable', () => {
    const { prog, fn } = compileFn('int f() { int x = 5; return x; }', 'f');
    assert.equal(fn.numLocals, 1);
    const bc = prog.bytecode;
    let hasStoreLocal = false;
    let hasLoadLocal = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.STORE_LOCAL) hasStoreLocal = true;
      if (bc[i] === OP.LOAD_LOCAL) hasLoadLocal = true;
    }
    assert.ok(hasStoreLocal, 'STORE_LOCAL not found');
    assert.ok(hasLoadLocal, 'LOAD_LOCAL not found');
  });

  it('compiles function with parameters', () => {
    const { fn } = compileFn('int add(int a, int b) { return a + b; }', 'add');
    assert.equal(fn.numArgs, 2);
  });

  it('compiles if statement', () => {
    const { prog, fn } = compileFn('int f(int x) { if (x) { return 1; } return 0; }', 'f');
    const bc = prog.bytecode;
    let hasJumpIfZero = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.JUMP_IF_ZERO) { hasJumpIfZero = true; break; }
    }
    assert.ok(hasJumpIfZero, 'JUMP_IF_ZERO not found');
  });

  it('compiles while loop', () => {
    const { prog, fn } = compileFn('void f() { int i = 0; while (i < 10) { i += 1; } }', 'f');
    const bc = prog.bytecode;
    let hasJump = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.JUMP) { hasJump = true; break; }
    }
    assert.ok(hasJump, 'JUMP not found (for loop back-edge)');
  });

  it('compiles string constant', () => {
    const { prog, fn } = compileFn('string f() { return "hello"; }', 'f');
    assert.ok(prog.strings.includes('hello'));
    const bc = prog.bytecode;
    let hasPushString = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.PUSH_STRING) { hasPushString = true; break; }
    }
    assert.ok(hasPushString, 'PUSH_STRING not found');
  });

  it('compiles multiple functions', () => {
    const prog = compile('int a() { return 1; } int b() { return 2; }');
    assert.equal(prog.functions.length, 2);
    assert.ok(prog.findFunction('a'));
    assert.ok(prog.findFunction('b'));
  });

  it('compiles comparison operators', () => {
    const { prog, fn } = compileFn('int f(int a, int b) { return a < b; }', 'f');
    const bc = prog.bytecode;
    let hasLT = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.LT) { hasLT = true; break; }
    }
    assert.ok(hasLT, 'LT not found');
  });

  it('compiles negation', () => {
    const { prog, fn } = compileFn('int f(int x) { return -x; }', 'f');
    const bc = prog.bytecode;
    let hasNegate = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.NEGATE) { hasNegate = true; break; }
    }
    assert.ok(hasNegate);
  });

  it('compiles array literal', () => {
    const { prog, fn } = compileFn('mixed f() { return ({ 1, 2, 3 }); }', 'f');
    const bc = prog.bytecode;
    let hasMakeArray = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.MAKE_ARRAY) { hasMakeArray = true; break; }
    }
    assert.ok(hasMakeArray);
  });

  it('compiles mapping literal', () => {
    const { prog, fn } = compileFn('mixed f() { return ([ "a": 1 ]); }', 'f');
    const bc = prog.bytecode;
    let hasMakeMapping = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.MAKE_MAPPING) { hasMakeMapping = true; break; }
    }
    assert.ok(hasMakeMapping);
  });

  it('compiles local function call', () => {
    const prog = compile('int helper() { return 1; } int f() { return helper(); }');
    const bc = prog.bytecode;
    const fn = prog.findFunction('f');
    let hasCallLocal = false;
    for (let i = fn.offset; i < bc.length; i++) {
      if (bc[i] === OP.CALL_LOCAL) { hasCallLocal = true; break; }
    }
    assert.ok(hasCallLocal);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/compiler/codegen.mjs`:

```js
import { parse } from './parser.mjs';
import { Program } from '../vm/program.mjs';
import { OP } from '../vm/opcodes.mjs';

class Emitter {
  constructor() {
    this.code = [];
    this.strings = [];
    this.functions = [];
    this.variables = [];
  }

  emit(byte) { this.code.push(byte); }
  emitOp(op) { this.code.push(op); }

  emitShort(value) {
    this.code.push((value >> 8) & 0xFF);
    this.code.push(value & 0xFF);
  }

  readShortAt(offset) {
    return (this.code[offset] << 8) | this.code[offset + 1];
  }

  patchShort(offset, value) {
    this.code[offset] = (value >> 8) & 0xFF;
    this.code[offset + 1] = value & 0xFF;
  }

  currentOffset() { return this.code.length; }

  addString(s) {
    let idx = this.strings.indexOf(s);
    if (idx === -1) { idx = this.strings.length; this.strings.push(s); }
    return idx;
  }

  toProgram(filename) {
    const prog = new Program(filename);
    prog.bytecode = new Uint8Array(this.code);
    prog.functions = this.functions;
    prog.strings = this.strings;
    prog.variables = this.variables;
    return prog;
  }
}

class CodeGen {
  constructor(ast) {
    this.ast = ast;
    this.emitter = new Emitter();
    this.locals = null;    // current function's locals: Map<name, index>
    this.params = null;    // current function's params: Map<name, index>
    this.globals = new Map();
    this.functionNames = new Map(); // name → index in functions array
    this.breakStack = [];
    this.continueStack = [];
  }

  compile() {
    // First pass: register all function names and global variables
    for (const decl of this.ast.body) {
      if (decl.type === 'FunctionDecl') {
        this.functionNames.set(decl.name, this.functionNames.size);
      } else if (decl.type === 'VarDecl') {
        const idx = this.globals.size;
        this.globals.set(decl.name, idx);
        this.emitter.variables.push({ name: decl.name, type: decl.varType });
      }
    }

    // Second pass: generate code
    for (const decl of this.ast.body) {
      if (decl.type === 'FunctionDecl' && decl.body) {
        this.compileFunction(decl);
      } else if (decl.type === 'FunctionDecl' && !decl.body) {
        // Prototype — register but no code
        this.emitter.functions.push({
          name: decl.name,
          numArgs: decl.params.length,
          numLocals: 0,
          offset: -1,
          flags: 0,
          type: 0,
        });
      }
    }

    return this.emitter.toProgram('<input>');
  }

  compileFunction(decl) {
    this.params = new Map();
    this.locals = new Map();

    for (let i = 0; i < decl.params.length; i++) {
      this.params.set(decl.params[i].name, i);
    }

    const offset = this.emitter.currentOffset();

    // Count locals (scan body for VarDecl statements)
    this.scanLocals(decl.body);

    // Generate body
    this.genBlock(decl.body);

    // Implicit return
    if (decl.returnType === 'void') {
      this.emitter.emitOp(OP.RETURN_ZERO);
    } else {
      // If function doesn't end with return, add return 0
      const lastOp = this.emitter.code[this.emitter.currentOffset() - 1];
      if (lastOp !== OP.RETURN && lastOp !== OP.RETURN_ZERO) {
        this.emitter.emitOp(OP.PUSH_0);
        this.emitter.emitOp(OP.RETURN);
      }
    }

    this.emitter.functions.push({
      name: decl.name,
      numArgs: decl.params.length,
      numLocals: this.locals.size,
      offset,
      flags: 0,
      type: 0,
    });

    this.params = null;
    this.locals = null;
  }

  scanLocals(node) {
    if (!node) return;
    if (node.type === 'Block') {
      for (const s of node.statements) this.scanLocals(s);
    } else if (node.type === 'VarDecl') {
      if (!this.locals.has(node.name)) {
        this.locals.set(node.name, this.params.size + this.locals.size);
      }
    } else if (node.type === 'IfStatement') {
      this.scanLocals(node.consequent);
      this.scanLocals(node.alternate);
    } else if (node.type === 'WhileStatement' || node.type === 'DoWhileStatement') {
      this.scanLocals(node.body);
    } else if (node.type === 'ForStatement') {
      this.scanLocals(node.init);
      this.scanLocals(node.body);
    } else if (node.type === 'SwitchStatement') {
      for (const c of node.cases) {
        for (const s of c.body) this.scanLocals(s);
      }
    }
  }

  resolveVar(name) {
    if (this.params && this.params.has(name)) {
      return { scope: 'local', index: this.params.get(name) };
    }
    if (this.locals && this.locals.has(name)) {
      return { scope: 'local', index: this.locals.get(name) };
    }
    if (this.globals.has(name)) {
      return { scope: 'global', index: this.globals.get(name) };
    }
    return null;
  }

  // ---- Statement generation ----

  genBlock(node) {
    for (const s of node.statements) {
      this.genStatement(s);
    }
  }

  genStatement(node) {
    switch (node.type) {
      case 'Block': this.genBlock(node); break;
      case 'VarDecl': this.genVarDecl(node); break;
      case 'ExpressionStatement':
        this.genExpr(node.expression);
        this.emitter.emitOp(OP.POP);
        break;
      case 'ReturnStatement': this.genReturn(node); break;
      case 'IfStatement': this.genIf(node); break;
      case 'WhileStatement': this.genWhile(node); break;
      case 'DoWhileStatement': this.genDoWhile(node); break;
      case 'ForStatement': this.genFor(node); break;
      case 'SwitchStatement': this.genSwitch(node); break;
      case 'BreakStatement': this.genBreak(); break;
      case 'ContinueStatement': this.genContinue(); break;
      default:
        throw new Error(`Unknown statement type: ${node.type}`);
    }
  }

  genVarDecl(node) {
    if (node.init) {
      this.genExpr(node.init);
    } else {
      this.emitter.emitOp(OP.PUSH_0);
    }
    const v = this.resolveVar(node.name);
    if (v.scope === 'local') {
      this.emitter.emitOp(OP.STORE_LOCAL);
      this.emitter.emit(v.index);
    } else {
      this.emitter.emitOp(OP.STORE_GLOBAL);
      this.emitter.emitShort(v.index);
    }
  }

  genReturn(node) {
    if (node.value) {
      this.genExpr(node.value);
      this.emitter.emitOp(OP.RETURN);
    } else {
      this.emitter.emitOp(OP.RETURN_ZERO);
    }
  }

  genIf(node) {
    this.genExpr(node.condition);
    this.emitter.emitOp(OP.JUMP_IF_ZERO);
    const elseHole = this.emitter.currentOffset();
    this.emitter.emitShort(0); // placeholder

    this.genStatement(node.consequent);

    if (node.alternate) {
      this.emitter.emitOp(OP.JUMP);
      const endHole = this.emitter.currentOffset();
      this.emitter.emitShort(0);

      this.emitter.patchShort(elseHole, this.emitter.currentOffset());
      this.genStatement(node.alternate);
      this.emitter.patchShort(endHole, this.emitter.currentOffset());
    } else {
      this.emitter.patchShort(elseHole, this.emitter.currentOffset());
    }
  }

  genWhile(node) {
    const loopStart = this.emitter.currentOffset();

    this.breakStack.push([]);
    this.continueStack.push(loopStart);

    this.genExpr(node.condition);
    this.emitter.emitOp(OP.JUMP_IF_ZERO);
    const exitHole = this.emitter.currentOffset();
    this.emitter.emitShort(0);

    this.genStatement(node.body);

    this.emitter.emitOp(OP.JUMP);
    this.emitter.emitShort(loopStart);

    const exitAddr = this.emitter.currentOffset();
    this.emitter.patchShort(exitHole, exitAddr);

    // Patch breaks
    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
    this.continueStack.pop();
  }

  genDoWhile(node) {
    const loopStart = this.emitter.currentOffset();

    this.breakStack.push([]);
    this.continueStack.push(loopStart);

    this.genStatement(node.body);

    this.genExpr(node.condition);
    this.emitter.emitOp(OP.JUMP_IF_NONZERO);
    this.emitter.emitShort(loopStart);

    const exitAddr = this.emitter.currentOffset();
    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
    this.continueStack.pop();
  }

  genFor(node) {
    if (node.init) {
      if (node.init.type === 'VarDecl') {
        this.genVarDecl(node.init);
      } else {
        this.genExpr(node.init);
        this.emitter.emitOp(OP.POP);
      }
    }

    const loopStart = this.emitter.currentOffset();
    this.breakStack.push([]);

    let exitHole = -1;
    if (node.condition) {
      this.genExpr(node.condition);
      this.emitter.emitOp(OP.JUMP_IF_ZERO);
      exitHole = this.emitter.currentOffset();
      this.emitter.emitShort(0);
    }

    const continueTarget = this.emitter.currentOffset();
    this.continueStack.push(-1); // will be updated

    this.genStatement(node.body);

    // Continue target is just before the update
    const updateStart = this.emitter.currentOffset();
    this.continueStack[this.continueStack.length - 1] = updateStart;

    if (node.update) {
      this.genExpr(node.update);
      this.emitter.emitOp(OP.POP);
    }

    this.emitter.emitOp(OP.JUMP);
    this.emitter.emitShort(loopStart);

    const exitAddr = this.emitter.currentOffset();
    if (exitHole >= 0) {
      this.emitter.patchShort(exitHole, exitAddr);
    }

    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
    this.continueStack.pop();
  }

  genSwitch(node) {
    this.genExpr(node.discriminant);
    this.breakStack.push([]);

    // Emit jump table: for each case, DUP + push test + EQ + JUMP_IF_NONZERO
    const caseHoles = [];
    let defaultHole = -1;

    for (const c of node.cases) {
      if (c.test) {
        this.emitter.emitOp(OP.DUP);
        this.genExpr(c.test);
        this.emitter.emitOp(OP.EQ);
        this.emitter.emitOp(OP.JUMP_IF_NONZERO);
        caseHoles.push({ hole: this.emitter.currentOffset(), caseNode: c });
        this.emitter.emitShort(0);
      } else {
        defaultHole = caseHoles.length;
        caseHoles.push({ hole: -1, caseNode: c });
      }
    }

    // Jump to default or end
    this.emitter.emitOp(OP.JUMP);
    const defaultJumpHole = this.emitter.currentOffset();
    this.emitter.emitShort(0);

    // Emit case bodies
    for (let i = 0; i < caseHoles.length; i++) {
      const entry = caseHoles[i];
      const addr = this.emitter.currentOffset();
      if (entry.hole >= 0) {
        this.emitter.patchShort(entry.hole, addr);
      }
      if (i === defaultHole) {
        this.emitter.patchShort(defaultJumpHole, addr);
      }
      // POP discriminant before first statement
      if (i === 0 || entry.caseNode.test) {
        // Only pop once at entry (fall-through doesn't re-push)
      }
      for (const s of entry.caseNode.body) {
        this.genStatement(s);
      }
    }

    // If no default, jump past all cases
    if (defaultHole < 0) {
      this.emitter.patchShort(defaultJumpHole, this.emitter.currentOffset());
    }

    // Pop discriminant
    this.emitter.emitOp(OP.POP);

    const exitAddr = this.emitter.currentOffset();
    for (const hole of this.breakStack.pop()) {
      this.emitter.patchShort(hole, exitAddr);
    }
  }

  genBreak() {
    this.emitter.emitOp(OP.JUMP);
    this.breakStack[this.breakStack.length - 1].push(this.emitter.currentOffset());
    this.emitter.emitShort(0);
  }

  genContinue() {
    this.emitter.emitOp(OP.JUMP);
    const target = this.continueStack[this.continueStack.length - 1];
    if (target >= 0) {
      this.emitter.emitShort(target);
    } else {
      // Will be patched (for loops where continue target isn't known yet)
      // For simplicity, emit direct jump — genFor patches continueStack before body
      this.emitter.emitShort(0);
    }
  }

  // ---- Expression generation ----

  genExpr(node) {
    switch (node.type) {
      case 'IntLiteral':
        if (node.value === 0) { this.emitter.emitOp(OP.PUSH_0); }
        else if (node.value === 1) { this.emitter.emitOp(OP.PUSH_1); }
        else {
          this.emitter.emitOp(OP.PUSH_INT);
          this.emitInt32(node.value);
        }
        break;

      case 'FloatLiteral':
        this.emitter.emitOp(OP.PUSH_FLOAT);
        this.emitFloat64(node.value);
        break;

      case 'StringLiteral': {
        const idx = this.emitter.addString(node.value);
        this.emitter.emitOp(OP.PUSH_STRING);
        this.emitter.emitShort(idx);
        break;
      }

      case 'Identifier': {
        const v = this.resolveVar(node.name);
        if (!v) throw new Error(`Undefined variable: ${node.name} at line ${node.line}`);
        if (v.scope === 'local') {
          this.emitter.emitOp(OP.LOAD_LOCAL);
          this.emitter.emit(v.index);
        } else {
          this.emitter.emitOp(OP.LOAD_GLOBAL);
          this.emitter.emitShort(v.index);
        }
        break;
      }

      case 'BinaryExpression':
        this.genExpr(node.left);
        this.genExpr(node.right);
        this.emitBinaryOp(node.operator);
        break;

      case 'UnaryExpression':
        this.genExpr(node.operand);
        if (node.operator === '-') this.emitter.emitOp(OP.NEGATE);
        else if (node.operator === '!') this.emitter.emitOp(OP.NOT);
        else if (node.operator === '~') this.emitter.emitOp(OP.BITNOT);
        break;

      case 'UpdateExpression': {
        const uv = this.resolveVar(node.operand.name);
        if (!uv) throw new Error(`Undefined variable: ${node.operand.name}`);
        if (node.prefix) {
          // ++x: load, push 1, add, store, (value on stack)
          if (uv.scope === 'local') {
            this.emitter.emitOp(OP.LOAD_LOCAL); this.emitter.emit(uv.index);
          } else {
            this.emitter.emitOp(OP.LOAD_GLOBAL); this.emitter.emitShort(uv.index);
          }
          this.emitter.emitOp(OP.PUSH_1);
          this.emitter.emitOp(node.operator === '++' ? OP.ADD : OP.SUB);
          this.emitter.emitOp(OP.DUP);
          if (uv.scope === 'local') {
            this.emitter.emitOp(OP.STORE_LOCAL); this.emitter.emit(uv.index);
          } else {
            this.emitter.emitOp(OP.STORE_GLOBAL); this.emitter.emitShort(uv.index);
          }
        } else {
          // x++: load (this is the result), then inc/store
          if (uv.scope === 'local') {
            this.emitter.emitOp(OP.LOAD_LOCAL); this.emitter.emit(uv.index);
          } else {
            this.emitter.emitOp(OP.LOAD_GLOBAL); this.emitter.emitShort(uv.index);
          }
          this.emitter.emitOp(OP.DUP);
          this.emitter.emitOp(OP.PUSH_1);
          this.emitter.emitOp(node.operator === '++' ? OP.ADD : OP.SUB);
          if (uv.scope === 'local') {
            this.emitter.emitOp(OP.STORE_LOCAL); this.emitter.emit(uv.index);
          } else {
            this.emitter.emitOp(OP.STORE_GLOBAL); this.emitter.emitShort(uv.index);
          }
        }
        break;
      }

      case 'AssignExpression': {
        this.genExpr(node.right);
        if (node.operator !== '=') {
          // Compound: load current, apply op, then store
          const av = this.resolveVar(node.left.name);
          if (av.scope === 'local') {
            this.emitter.emitOp(OP.LOAD_LOCAL); this.emitter.emit(av.index);
          } else {
            this.emitter.emitOp(OP.LOAD_GLOBAL); this.emitter.emitShort(av.index);
          }
          // Swap: stack has [right, left], we need [left, right] for binary op
          // Actually let's reorder: emit left first, then right, then op
          // Redo: for compound assign, load left first
        }
        // Simpler approach: for compound assignment, gen left + right + op + dup + store
        if (node.operator !== '=') {
          // Re-emit properly
          this.emitter.code.length -= this.lastExprSize; // can't do this easily
        }
        // Let's use a cleaner approach:
        this.genAssign(node);
        break;
      }

      case 'TernaryExpression':
        this.genExpr(node.condition);
        this.emitter.emitOp(OP.JUMP_IF_ZERO);
        const elseHole = this.emitter.currentOffset();
        this.emitter.emitShort(0);
        this.genExpr(node.consequent);
        this.emitter.emitOp(OP.JUMP);
        const endHole = this.emitter.currentOffset();
        this.emitter.emitShort(0);
        this.emitter.patchShort(elseHole, this.emitter.currentOffset());
        this.genExpr(node.alternate);
        this.emitter.patchShort(endHole, this.emitter.currentOffset());
        break;

      case 'CallExpression': {
        // Push arguments
        for (const arg of node.args) {
          this.genExpr(arg);
        }
        const fnIdx = this.functionNames.get(node.name);
        if (fnIdx !== undefined) {
          this.emitter.emitOp(OP.CALL_LOCAL);
          this.emitter.emitShort(fnIdx);
          this.emitter.emit(node.args.length);
        } else {
          // Assume efun
          const nameIdx = this.emitter.addString(node.name);
          this.emitter.emitOp(OP.CALL_EFUN);
          this.emitter.emitShort(nameIdx);
          this.emitter.emit(node.args.length);
        }
        break;
      }

      case 'CallOther': {
        this.genExpr(node.object);
        const methodIdx = this.emitter.addString(node.method);
        for (const arg of node.args) {
          this.genExpr(arg);
        }
        this.emitter.emitOp(OP.CALL_OTHER);
        this.emitter.emitShort(methodIdx);
        this.emitter.emit(node.args.length);
        break;
      }

      case 'IndexExpression':
        this.genExpr(node.object);
        this.genExpr(node.index);
        this.emitter.emitOp(OP.INDEX);
        break;

      case 'RangeExpression':
        this.genExpr(node.object);
        this.genExpr(node.from);
        this.genExpr(node.to);
        this.emitter.emitOp(OP.RANGE);
        break;

      case 'ArrayLiteral':
        for (const el of node.elements) {
          this.genExpr(el);
        }
        this.emitter.emitOp(OP.MAKE_ARRAY);
        this.emitter.emitShort(node.elements.length);
        break;

      case 'MappingLiteral':
        for (const entry of node.entries) {
          this.genExpr(entry.key);
          this.genExpr(entry.value);
        }
        this.emitter.emitOp(OP.MAKE_MAPPING);
        this.emitter.emitShort(node.entries.length);
        break;

      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  genAssign(node) {
    // Remove the previously emitted right-side (we'll re-emit properly)
    // Actually, let's just handle assignment from scratch
    // Reset: this method is called instead of the broken path in genExpr
    const av = this.resolveVar(node.left.name);
    if (!av) throw new Error(`Undefined variable: ${node.left.name}`);

    if (node.operator === '=') {
      this.genExpr(node.right);
    } else {
      // Compound: left OP right
      if (av.scope === 'local') {
        this.emitter.emitOp(OP.LOAD_LOCAL); this.emitter.emit(av.index);
      } else {
        this.emitter.emitOp(OP.LOAD_GLOBAL); this.emitter.emitShort(av.index);
      }
      this.genExpr(node.right);
      const opMap = { '+=': OP.ADD, '-=': OP.SUB, '*=': OP.MUL, '/=': OP.DIV, '%=': OP.MOD,
                      '&=': OP.BITAND, '|=': OP.BITOR, '^=': OP.BITXOR,
                      '<<=': OP.LSH, '>>=': OP.RSH };
      this.emitter.emitOp(opMap[node.operator]);
    }

    this.emitter.emitOp(OP.DUP); // assignment is an expression, leaves value on stack
    if (av.scope === 'local') {
      this.emitter.emitOp(OP.STORE_LOCAL); this.emitter.emit(av.index);
    } else {
      this.emitter.emitOp(OP.STORE_GLOBAL); this.emitter.emitShort(av.index);
    }
  }

  emitBinaryOp(op) {
    const map = {
      '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD,
      '==': OP.EQ, '!=': OP.NE, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE,
      '&': OP.BITAND, '|': OP.BITOR, '^': OP.BITXOR, '<<': OP.LSH, '>>': OP.RSH,
      '&&': OP.BITAND, '||': OP.BITOR, // Note: logical && || should short-circuit
      // For now using bitwise; short-circuit will be added as an optimization
    };
    const opcode = map[op];
    if (opcode === undefined) throw new Error(`Unknown binary operator: ${op}`);
    this.emitter.emitOp(opcode);
  }

  emitInt32(value) {
    this.emitter.emit((value >> 24) & 0xFF);
    this.emitter.emit((value >> 16) & 0xFF);
    this.emitter.emit((value >> 8) & 0xFF);
    this.emitter.emit(value & 0xFF);
  }

  emitFloat64(value) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value);
    const bytes = new Uint8Array(buf);
    for (const b of bytes) this.emitter.emit(b);
  }
}

export function compile(source, filename = '<input>') {
  const ast = parse(source, filename);
  const gen = new CodeGen(ast);
  const prog = gen.compile();
  prog.filename = filename;
  return prog;
}
```

Note: The `AssignExpression` case in `genExpr` has a broken compound-assignment path. Replace the entire `case 'AssignExpression'` block in `genExpr` with:

```js
      case 'AssignExpression':
        this.genAssign(node);
        break;
```

(Remove the incorrect partial implementation and keep only the delegation to `genAssign`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lpc-js && npm test`
Expected: All codegen tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/codegen.mjs test/compiler/codegen.test.mjs && git commit -m "feat: add bytecode code generator"
```

---

### Task 10: VM — Stack Machine

**Files:**
- Create: `lpc-js/src/vm/machine.mjs`
- Create: `lpc-js/test/vm/machine.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/vm/machine.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../src/vm/machine.mjs';
import { compile } from '../../src/compiler/codegen.mjs';
import { T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING } from '../../src/vm/svalue.mjs';

function run(source, funcName = 'f', args = []) {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName, args);
}

describe('VM — basic operations', () => {
  it('returns integer literal', () => {
    const result = run('int f() { return 42; }');
    assert.equal(result.type, T_INT);
    assert.equal(result.value, 42);
  });

  it('returns 0', () => {
    const result = run('int f() { return 0; }');
    assert.equal(result.value, 0);
  });

  it('returns 1', () => {
    const result = run('int f() { return 1; }');
    assert.equal(result.value, 1);
  });

  it('returns string literal', () => {
    const result = run('string f() { return "hello"; }');
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'hello');
  });

  it('returns float literal', () => {
    const result = run('float f() { return 3.14; }');
    assert.equal(result.type, T_FLOAT);
    assert.ok(Math.abs(result.value - 3.14) < 0.001);
  });

  it('void function returns 0', () => {
    const result = run('void f() { }');
    assert.equal(result.type, T_INT);
    assert.equal(result.value, 0);
  });
});

describe('VM — arithmetic', () => {
  it('adds two integers', () => {
    const result = run('int f() { return 3 + 4; }');
    assert.equal(result.value, 7);
  });

  it('subtracts', () => {
    const result = run('int f() { return 10 - 3; }');
    assert.equal(result.value, 7);
  });

  it('multiplies', () => {
    const result = run('int f() { return 6 * 7; }');
    assert.equal(result.value, 42);
  });

  it('divides', () => {
    const result = run('int f() { return 10 / 3; }');
    assert.equal(result.value, 3); // integer division
  });

  it('modulo', () => {
    const result = run('int f() { return 10 % 3; }');
    assert.equal(result.value, 1);
  });

  it('negation', () => {
    const result = run('int f() { return -5; }');
    assert.equal(result.value, -5);
  });

  it('complex expression', () => {
    const result = run('int f() { return (2 + 3) * 4 - 1; }');
    assert.equal(result.value, 19);
  });

  it('string concatenation', () => {
    const result = run('string f() { return "hello" + " " + "world"; }');
    assert.equal(result.value, 'hello world');
  });
});

describe('VM — comparison and logic', () => {
  it('equal true', () => {
    const result = run('int f() { return 5 == 5; }');
    assert.equal(result.value, 1);
  });

  it('equal false', () => {
    const result = run('int f() { return 5 == 3; }');
    assert.equal(result.value, 0);
  });

  it('less than', () => {
    const result = run('int f() { return 3 < 5; }');
    assert.equal(result.value, 1);
  });

  it('not equal', () => {
    const result = run('int f() { return 3 != 5; }');
    assert.equal(result.value, 1);
  });

  it('logical not', () => {
    const result = run('int f() { return !0; }');
    assert.equal(result.value, 1);
  });
});

describe('VM — variables', () => {
  it('local variable', () => {
    const result = run('int f() { int x = 10; return x; }');
    assert.equal(result.value, 10);
  });

  it('local variable arithmetic', () => {
    const result = run('int f() { int a = 3; int b = 4; return a + b; }');
    assert.equal(result.value, 7);
  });

  it('compound assignment', () => {
    const result = run('int f() { int x = 10; x += 5; return x; }');
    assert.equal(result.value, 15);
  });

  it('parameters', () => {
    const result = run(
      'int add(int a, int b) { return a + b; } int f() { return add(3, 4); }',
    );
    assert.equal(result.value, 7);
  });
});

describe('VM — control flow', () => {
  it('if true branch', () => {
    const result = run('int f() { if (1) { return 10; } return 20; }');
    assert.equal(result.value, 10);
  });

  it('if false branch', () => {
    const result = run('int f() { if (0) { return 10; } return 20; }');
    assert.equal(result.value, 20);
  });

  it('if/else', () => {
    const result = run('int f() { if (0) { return 10; } else { return 20; } }');
    assert.equal(result.value, 20);
  });

  it('while loop', () => {
    const result = run('int f() { int i = 0; int sum = 0; while (i < 5) { sum += i; i += 1; } return sum; }');
    assert.equal(result.value, 10); // 0+1+2+3+4
  });

  it('for loop', () => {
    const result = run('int f() { int sum = 0; for (int i = 1; i <= 10; i += 1) { sum += i; } return sum; }');
    assert.equal(result.value, 55);
  });

  it('ternary expression', () => {
    const result = run('int f() { return 1 ? 10 : 20; }');
    assert.equal(result.value, 10);
  });

  it('nested function calls', () => {
    const result = run('int double(int x) { return x * 2; } int f() { return double(double(3)); }');
    assert.equal(result.value, 12);
  });

  it('recursive function', () => {
    const result = run('int fact(int n) { if (n <= 1) { return 1; } return n * fact(n - 1); } int f() { return fact(5); }');
    assert.equal(result.value, 120);
  });
});

describe('VM — collections', () => {
  it('array literal', () => {
    const result = run('mixed f() { return ({ 1, 2, 3 }); }');
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 1);
  });

  it('mapping literal', () => {
    const result = run('mixed f() { return ([ "a": 1, "b": 2 ]); }');
    assert.equal(result.type, T_MAPPING);
    assert.equal(result.value.get('a').value, 1);
  });

  it('array index', () => {
    const result = run('int f() { mixed arr = ({ 10, 20, 30 }); return arr[1]; }');
    assert.equal(result.value, 20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/vm/machine.mjs`:

```js
import { OP } from './opcodes.mjs';
import {
  T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING,
  mkInt, mkString, mkFloat, mkArray, mkMapping,
  SVALUE_ZERO, SVALUE_ONE, isTruthy
} from './svalue.mjs';

export class Machine {
  constructor() {
    this.stack = [];
    this.callStack = [];
    this.pc = 0;
    this.currentProgram = null;
    this.locals = null;
    this.globals = null;
    this.maxEvalCost = 1_000_000;
    this.evalCost = 0;
  }

  execute(program, functionName, args = []) {
    this.currentProgram = program;
    this.globals = new Array(program.variables.length).fill(SVALUE_ZERO);

    const fn = program.findFunction(functionName);
    if (!fn) throw new Error(`Function '${functionName}' not found in ${program.filename}`);

    return this.callFunction(fn, args);
  }

  callFunction(fn, args) {
    // Save state
    this.callStack.push({
      pc: this.pc,
      locals: this.locals,
      program: this.currentProgram,
    });

    // Set up locals: [params..., locals...]
    const localCount = fn.numArgs + fn.numLocals;
    this.locals = new Array(localCount).fill(SVALUE_ZERO);
    for (let i = 0; i < args.length && i < fn.numArgs; i++) {
      this.locals[i] = args[i];
    }

    this.pc = fn.offset;
    const result = this.run();

    // Restore state
    const frame = this.callStack.pop();
    this.pc = frame.pc;
    this.locals = frame.locals;

    return result;
  }

  run() {
    const bc = this.currentProgram.bytecode;

    while (this.pc < bc.length) {
      if (++this.evalCost > this.maxEvalCost) {
        throw new Error('Too long evaluation. Execution aborted.');
      }

      const op = bc[this.pc++];

      switch (op) {
        // ---- Push constants ----
        case OP.PUSH_0:
          this.stack.push(SVALUE_ZERO);
          break;

        case OP.PUSH_1:
          this.stack.push(SVALUE_ONE);
          break;

        case OP.PUSH_INT: {
          const val = this.readInt32();
          this.stack.push(mkInt(val));
          break;
        }

        case OP.PUSH_FLOAT: {
          const val = this.readFloat64();
          this.stack.push(mkFloat(val));
          break;
        }

        case OP.PUSH_STRING: {
          const idx = this.readShort();
          this.stack.push(mkString(this.currentProgram.strings[idx]));
          break;
        }

        // ---- Variables ----
        case OP.LOAD_LOCAL: {
          const idx = bc[this.pc++];
          this.stack.push(this.locals[idx]);
          break;
        }

        case OP.STORE_LOCAL: {
          const idx = bc[this.pc++];
          this.locals[idx] = this.stack.pop();
          break;
        }

        case OP.LOAD_GLOBAL: {
          const idx = this.readShort();
          this.stack.push(this.globals[idx]);
          break;
        }

        case OP.STORE_GLOBAL: {
          const idx = this.readShort();
          this.globals[idx] = this.stack.pop();
          break;
        }

        // ---- Arithmetic ----
        case OP.ADD: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (a.type === T_STRING || b.type === T_STRING) {
            const as = a.type === T_STRING ? a.value : String(a.value);
            const bs = b.type === T_STRING ? b.value : String(b.value);
            this.stack.push(mkString(as + bs));
          } else if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value + b.value));
          } else if (a.type === T_ARRAY && b.type === T_ARRAY) {
            this.stack.push(mkArray([...a.value, ...b.value]));
          } else {
            this.stack.push(mkInt(a.value + b.value));
          }
          break;
        }

        case OP.SUB: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value - b.value));
          } else {
            this.stack.push(mkInt(a.value - b.value));
          }
          break;
        }

        case OP.MUL: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value * b.value));
          } else {
            this.stack.push(mkInt(a.value * b.value));
          }
          break;
        }

        case OP.DIV: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (b.value === 0) throw new Error('Division by zero');
          if (a.type === T_FLOAT || b.type === T_FLOAT) {
            this.stack.push(mkFloat(a.value / b.value));
          } else {
            this.stack.push(mkInt(Math.trunc(a.value / b.value)));
          }
          break;
        }

        case OP.MOD: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          if (b.value === 0) throw new Error('Modulo by zero');
          this.stack.push(mkInt(a.value % b.value));
          break;
        }

        case OP.NEGATE: {
          const a = this.stack.pop();
          if (a.type === T_FLOAT) this.stack.push(mkFloat(-a.value));
          else this.stack.push(mkInt(-a.value));
          break;
        }

        // ---- Comparison ----
        case OP.EQ: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value === b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.NE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value !== b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.LT: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value < b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.LE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value <= b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.GT: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value > b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        case OP.GE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a.value >= b.value ? SVALUE_ONE : SVALUE_ZERO);
          break;
        }

        // ---- Bitwise ----
        case OP.BITAND: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value & b.value)); break; }
        case OP.BITOR:  { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value | b.value)); break; }
        case OP.BITXOR: { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value ^ b.value)); break; }
        case OP.LSH:    { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value << b.value)); break; }
        case OP.RSH:    { const b = this.stack.pop(); const a = this.stack.pop(); this.stack.push(mkInt(a.value >> b.value)); break; }
        case OP.BITNOT: { const a = this.stack.pop(); this.stack.push(mkInt(~a.value)); break; }

        // ---- Logical ----
        case OP.NOT: {
          const a = this.stack.pop();
          this.stack.push(isTruthy(a) ? SVALUE_ZERO : SVALUE_ONE);
          break;
        }

        // ---- Jump ----
        case OP.JUMP: {
          this.pc = this.readShort();
          break;
        }

        case OP.JUMP_IF_ZERO: {
          const target = this.readShort();
          const val = this.stack.pop();
          if (!isTruthy(val)) this.pc = target;
          break;
        }

        case OP.JUMP_IF_NONZERO: {
          const target = this.readShort();
          const val = this.stack.pop();
          if (isTruthy(val)) this.pc = target;
          break;
        }

        // ---- Function calls ----
        case OP.CALL_LOCAL: {
          const fnIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const fn = this.currentProgram.functions[fnIdx];
          const result = this.callFunction(fn, args);
          this.stack.push(result);
          break;
        }

        case OP.CALL_EFUN: {
          const nameIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const name = this.currentProgram.strings[nameIdx];
          if (this.efunHandler) {
            const result = this.efunHandler(name, args);
            this.stack.push(result);
          } else {
            throw new Error(`Unknown efun: ${name}`);
          }
          break;
        }

        case OP.CALL_OTHER: {
          const methodIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const obj = this.stack.pop();
          const method = this.currentProgram.strings[methodIdx];
          if (this.callOtherHandler) {
            const result = this.callOtherHandler(obj, method, args);
            this.stack.push(result);
          } else {
            throw new Error(`call_other not available: ${method}`);
          }
          break;
        }

        // ---- Return ----
        case OP.RETURN: {
          return this.stack.pop();
        }

        case OP.RETURN_ZERO: {
          return SVALUE_ZERO;
        }

        // ---- Stack ops ----
        case OP.POP:
          this.stack.pop();
          break;

        case OP.DUP:
          this.stack.push(this.stack[this.stack.length - 1]);
          break;

        // ---- Collections ----
        case OP.MAKE_ARRAY: {
          const count = this.readShort();
          const elements = [];
          for (let i = 0; i < count; i++) {
            elements.unshift(this.stack.pop());
          }
          this.stack.push(mkArray(elements));
          break;
        }

        case OP.MAKE_MAPPING: {
          const count = this.readShort();
          const map = new Map();
          const pairs = [];
          for (let i = 0; i < count; i++) {
            const value = this.stack.pop();
            const key = this.stack.pop();
            pairs.unshift({ key, value });
          }
          for (const { key, value } of pairs) {
            map.set(key.value, value);
          }
          this.stack.push(mkMapping(map));
          break;
        }

        case OP.INDEX: {
          const index = this.stack.pop();
          const obj = this.stack.pop();
          if (obj.type === T_ARRAY) {
            const idx = index.value;
            if (idx < 0 || idx >= obj.value.length) {
              throw new Error(`Array index out of bounds: ${idx}`);
            }
            this.stack.push(obj.value[idx]);
          } else if (obj.type === T_MAPPING) {
            const result = obj.value.get(index.value);
            this.stack.push(result ?? SVALUE_ZERO);
          } else if (obj.type === T_STRING) {
            const idx = index.value;
            this.stack.push(mkInt(obj.value.charCodeAt(idx)));
          } else {
            throw new Error(`Cannot index type ${obj.type}`);
          }
          break;
        }

        case OP.RANGE: {
          const to = this.stack.pop();
          const from = this.stack.pop();
          const obj = this.stack.pop();
          if (obj.type === T_ARRAY) {
            this.stack.push(mkArray(obj.value.slice(from.value, to.value + 1)));
          } else if (obj.type === T_STRING) {
            this.stack.push(mkString(obj.value.slice(from.value, to.value + 1)));
          } else {
            throw new Error(`Cannot range type ${obj.type}`);
          }
          break;
        }

        default:
          throw new Error(`Unknown opcode: 0x${op.toString(16)} at pc=${this.pc - 1}`);
      }
    }

    return SVALUE_ZERO;
  }

  readShort() {
    const bc = this.currentProgram.bytecode;
    const val = (bc[this.pc] << 8) | bc[this.pc + 1];
    this.pc += 2;
    return val;
  }

  readInt32() {
    const bc = this.currentProgram.bytecode;
    const val = (bc[this.pc] << 24) | (bc[this.pc + 1] << 16) | (bc[this.pc + 2] << 8) | bc[this.pc + 3];
    this.pc += 4;
    return val;
  }

  readFloat64() {
    const bc = this.currentProgram.bytecode;
    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) view[i] = bc[this.pc + i];
    this.pc += 8;
    return new DataView(buf).getFloat64(0);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lpc-js && npm test`
Expected: All VM tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/machine.mjs test/vm/machine.test.mjs && git commit -m "feat: add stack-based VM execution engine"
```

---

### Task 11: Integration Test — Compile and Run

**Files:**
- Create: `lpc-js/test/integration/compile-and-run.test.mjs`

- [ ] **Step 1: Write the integration test**

Write `lpc-js/test/integration/compile-and-run.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

function run(source, funcName, args = []) {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName, args);
}

describe('integration — compile and run LPC programs', () => {
  it('fibonacci', () => {
    const result = run(`
      int fib(int n) {
        if (n <= 1) { return n; }
        return fib(n - 1) + fib(n - 2);
      }
    `, 'fib', [{ type: 0, value: 10 }]);
    assert.equal(result.value, 55);
  });

  it('iterative factorial', () => {
    const result = run(`
      int factorial(int n) {
        int result = 1;
        for (int i = 2; i <= n; i += 1) {
          result *= i;
        }
        return result;
      }
    `, 'factorial', [{ type: 0, value: 6 }]);
    assert.equal(result.value, 720);
  });

  it('string building', () => {
    const result = run(`
      string greet(string name) {
        return "Hello, " + name + "!";
      }
    `, 'greet', [{ type: 1, value: 'World' }]);
    assert.equal(result.value, 'Hello, World!');
  });

  it('array operations', () => {
    const result = run(`
      int sum_array() {
        mixed arr = ({ 10, 20, 30, 40 });
        int total = 0;
        int i = 0;
        while (i < 4) {
          total += arr[i];
          i += 1;
        }
        return total;
      }
    `, 'sum_array');
    assert.equal(result.value, 100);
  });

  it('nested if-else', () => {
    const result = run(`
      string classify(int n) {
        if (n < 0) { return "negative"; }
        else if (n == 0) { return "zero"; }
        else { return "positive"; }
      }
    `, 'classify', [{ type: 0, value: -5 }]);
    assert.equal(result.value, 'negative');
  });

  it('multiple functions calling each other', () => {
    const result = run(`
      int square(int x) { return x * x; }
      int sum_of_squares(int a, int b) {
        return square(a) + square(b);
      }
    `, 'sum_of_squares', [{ type: 0, value: 3 }, { type: 0, value: 4 }]);
    assert.equal(result.value, 25);
  });

  it('do-while loop', () => {
    const result = run(`
      int count_digits(int n) {
        int digits = 0;
        do {
          digits += 1;
          n = n / 10;
        } while (n > 0);
        return digits;
      }
    `, 'count_digits', [{ type: 0, value: 12345 }]);
    assert.equal(result.value, 5);
  });

  it('ternary in expression', () => {
    const result = run(`
      int abs(int x) {
        return x >= 0 ? x : -x;
      }
    `, 'abs', [{ type: 0, value: -42 }]);
    assert.equal(result.value, 42);
  });

  it('mapping creation and lookup', () => {
    const result = run(`
      mixed make_map() {
        return ([ "one": 1, "two": 2, "three": 3 ]);
      }
    `, 'make_map');
    assert.equal(result.value.get('two').value, 2);
  });

  it('eval cost limit prevents infinite loops', () => {
    const prog = compile(`
      void infinite() {
        while (1) { }
      }
    `);
    const vm = new Machine();
    vm.maxEvalCost = 100;
    assert.throws(() => vm.execute(prog, 'infinite'), /Too long evaluation/);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd lpc-js && npm test`
Expected: All integration tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/integration/compile-and-run.test.mjs && git commit -m "test: add integration tests for compile-and-run pipeline"
```

---

### Task 12: Clean Up and Final Verification

**Files:**
- Remove: `lpc-js/test/smoke.test.mjs`

- [ ] **Step 1: Remove smoke test**

Delete `lpc-js/test/smoke.test.mjs` (no longer needed).

- [ ] **Step 2: Run full test suite**

Run: `cd lpc-js && npm test`
Expected: All tests pass — svalue, opcodes, program, lexer, AST, parser, codegen, VM, integration.

- [ ] **Step 3: Commit**

```bash
git rm test/smoke.test.mjs && git commit -m "chore: remove smoke test, phase 1 complete"
```
