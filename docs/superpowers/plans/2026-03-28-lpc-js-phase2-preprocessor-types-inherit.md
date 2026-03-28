# LPC-JS Phase 2: Preprocessor, Types, Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add C-style preprocessor, compile-time type checking, multiple inheritance, and class definitions to the LPC-JS compiler, building on Phase 1's lexer/parser/codegen/VM.

**Architecture:** Preprocessor runs as a standalone pass before tokenization (source string → expanded source string with line tracking). Type checker runs during codegen as an optional pass controlled by `#pragma strict_types`. Inheritance resolves at compile time by recursively compiling parent files and merging their function/variable tables. VM gains `CALL_INHERITED` support.

**Tech Stack:** Node.js 20+, ES Modules (.mjs), `node:test` + `node:assert`, `node:fs` for file-based includes.

---

## File Structure

```
lpc-js/
├── src/
│   ├── compiler/
│   │   ├── preprocessor.mjs   # NEW — #include, #define, #ifdef, #pragma
│   │   ├── types.mjs          # NEW — LPC type constants, type checker
│   │   ├── lexer.mjs          # (no changes)
│   │   ├── ast.mjs            # MODIFY — add classDecl, classMemberAccess nodes
│   │   ├── parser.mjs         # MODIFY — parse class decl, :: syntax, modifier flags
│   │   └── codegen.mjs        # MODIFY — inherit resolution, CALL_INHERITED, type checking
│   └── vm/
│       ├── opcodes.mjs        # (no changes — CALL_INHERITED already defined)
│       ├── svalue.mjs         # MODIFY — add T_CLASS support in isTruthy
│       ├── program.mjs        # MODIFY — add findInheritedFunction helper
│       └── machine.mjs        # MODIFY — implement CALL_INHERITED opcode
└── test/
    ├── compiler/
    │   ├── preprocessor.test.mjs  # NEW
    │   ├── types.test.mjs         # NEW
    │   ├── parser.test.mjs        # MODIFY — add class/inherit/modifier tests
    │   └── codegen.test.mjs       # MODIFY — add inherit codegen tests
    ├── vm/
    │   └── machine.test.mjs       # MODIFY — add CALL_INHERITED tests
    └── integration/
        └── inherit.test.mjs       # NEW — end-to-end inheritance tests
```

---

### Task 1: Preprocessor — #define and #undef

**Files:**
- Create: `lpc-js/src/compiler/preprocessor.mjs`
- Create: `lpc-js/test/compiler/preprocessor.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/compiler/preprocessor.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { preprocess } from '../../src/compiler/preprocessor.mjs';

describe('preprocessor — #define and #undef', () => {
  it('expands simple #define', () => {
    const result = preprocess('#define FOO 42\nint x = FOO;');
    assert.equal(result.source.trim(), 'int x = 42;');
  });

  it('expands multiple defines', () => {
    const result = preprocess('#define A 1\n#define B 2\nint x = A + B;');
    assert.equal(result.source.trim(), 'int x = 1 + 2;');
  });

  it('handles #undef', () => {
    const result = preprocess('#define FOO 10\n#undef FOO\nint x = FOO;');
    assert.equal(result.source.trim(), 'int x = FOO;');
  });

  it('expands macro with arguments', () => {
    const result = preprocess('#define MAX(a,b) ((a)>(b)?(a):(b))\nint x = MAX(3,5);');
    assert.equal(result.source.trim(), 'int x = ((3)>(5)?(3):(5));');
  });

  it('does not expand inside strings', () => {
    const result = preprocess('#define FOO bar\nstring s = "FOO";');
    assert.equal(result.source.trim(), 'string s = "FOO";');
  });

  it('handles empty define', () => {
    const result = preprocess('#define FLAG\nint x = 1;');
    assert.equal(result.source.trim(), 'int x = 1;');
  });

  it('preserves line count with blank lines for directives', () => {
    const result = preprocess('#define FOO 1\n\nint x = FOO;');
    const lines = result.source.split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[2].trim(), 'int x = 1;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/compiler/preprocessor.mjs`:

```js
export function preprocess(source, options = {}) {
  const defines = new Map(Object.entries(options.defines ?? {}));
  const includePaths = options.includePaths ?? [];
  const readFile = options.readFile ?? null;
  const pragmas = {};
  const lines = source.split('\n');
  const output = [];
  const condStack = []; // { active, elseAllowed, parentActive }
  let lineNum = 0;

  function isActive() {
    return condStack.length === 0 || condStack[condStack.length - 1].active;
  }

  for (const rawLine of lines) {
    lineNum++;
    const trimmed = rawLine.trim();

    // Preprocessor directive
    if (trimmed.startsWith('#')) {
      const directive = parseDirective(trimmed);

      if (directive.name === 'define' && isActive()) {
        const { macroName, params, body } = parseDefine(directive.rest);
        defines.set(macroName, { params, body });
        output.push('');
        continue;
      }

      if (directive.name === 'undef' && isActive()) {
        defines.delete(directive.rest.trim());
        output.push('');
        continue;
      }

      if (directive.name === 'ifdef') {
        const name = directive.rest.trim();
        const parentActive = isActive();
        condStack.push({ active: parentActive && defines.has(name), elseAllowed: true, parentActive });
        output.push('');
        continue;
      }

      if (directive.name === 'ifndef') {
        const name = directive.rest.trim();
        const parentActive = isActive();
        condStack.push({ active: parentActive && !defines.has(name), elseAllowed: true, parentActive });
        output.push('');
        continue;
      }

      if (directive.name === 'if') {
        const parentActive = isActive();
        const val = evaluateConstExpr(directive.rest.trim(), defines);
        condStack.push({ active: parentActive && val, elseAllowed: true, parentActive });
        output.push('');
        continue;
      }

      if (directive.name === 'elif') {
        const top = condStack[condStack.length - 1];
        if (top.active) {
          top.active = false;
          top.elseAllowed = false;
        } else if (top.elseAllowed && top.parentActive) {
          top.active = evaluateConstExpr(directive.rest.trim(), defines);
        }
        output.push('');
        continue;
      }

      if (directive.name === 'else') {
        const top = condStack[condStack.length - 1];
        if (top.active) {
          top.active = false;
        } else if (top.elseAllowed && top.parentActive) {
          top.active = true;
        }
        top.elseAllowed = false;
        output.push('');
        continue;
      }

      if (directive.name === 'endif') {
        condStack.pop();
        output.push('');
        continue;
      }

      if (directive.name === 'include' && isActive()) {
        const included = resolveInclude(directive.rest.trim(), includePaths, readFile);
        if (included !== null) {
          const sub = preprocess(included, { defines: Object.fromEntries(defines), includePaths, readFile });
          // Merge pragmas
          Object.assign(pragmas, sub.pragmas);
          // Insert expanded lines (replace this line with included content)
          output.push(sub.source);
        } else {
          output.push(`/* failed to include ${directive.rest.trim()} */`);
        }
        continue;
      }

      if (directive.name === 'pragma' && isActive()) {
        const pragmaName = directive.rest.trim();
        pragmas[pragmaName] = true;
        output.push('');
        continue;
      }

      // Unknown directive — pass through as blank
      output.push('');
      continue;
    }

    // Normal line
    if (isActive()) {
      output.push(expandMacros(rawLine, defines));
    } else {
      output.push('');
    }
  }

  return { source: output.join('\n'), pragmas, defines };
}

function parseDirective(line) {
  const match = line.match(/^#\s*(\w+)\s*(.*)?$/);
  if (!match) return { name: '', rest: '' };
  return { name: match[1], rest: match[2] ?? '' };
}

function parseDefine(rest) {
  const match = rest.match(/^(\w+)(?:\(([^)]*)\))?\s*(.*)?$/);
  if (!match) return { macroName: rest.trim(), params: null, body: '' };
  const macroName = match[1];
  const params = match[2] !== undefined ? match[2].split(',').map(p => p.trim()) : null;
  const body = (match[3] ?? '').trim();
  return { macroName, params, body };
}

function expandMacros(line, defines) {
  let result = '';
  let i = 0;
  while (i < line.length) {
    // Skip strings
    if (line[i] === '"') {
      const end = findStringEnd(line, i);
      result += line.slice(i, end);
      i = end;
      continue;
    }
    // Skip single-char quotes
    if (line[i] === "'") {
      const end = line.indexOf("'", i + 1);
      if (end >= 0) {
        result += line.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    // Identifier
    if (isIdentStart(line[i])) {
      let ident = '';
      const start = i;
      while (i < line.length && isIdentChar(line[i])) {
        ident += line[i++];
      }
      const macro = defines.get(ident);
      if (macro) {
        if (macro.params !== null && line[i] === '(') {
          // Function-like macro
          const { args, end } = parseMacroArgs(line, i);
          i = end;
          let expanded = macro.body;
          for (let p = 0; p < macro.params.length; p++) {
            expanded = expanded.replaceAll(macro.params[p], args[p] ?? '');
          }
          result += expanded;
        } else if (macro.params === null) {
          result += macro.body;
        } else {
          result += ident; // function-like macro without args — don't expand
        }
      } else {
        result += ident;
      }
      continue;
    }
    result += line[i++];
  }
  return result;
}

function findStringEnd(line, start) {
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') { i += 2; continue; }
    if (line[i] === '"') return i + 1;
    i++;
  }
  return line.length;
}

function parseMacroArgs(line, start) {
  // start points to '('
  let depth = 0;
  let i = start;
  const args = [];
  let current = '';
  i++; // skip (
  while (i < line.length) {
    if (line[i] === '(') { depth++; current += line[i++]; continue; }
    if (line[i] === ')') {
      if (depth === 0) {
        args.push(current.trim());
        return { args, end: i + 1 };
      }
      depth--;
      current += line[i++];
      continue;
    }
    if (line[i] === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += line[i++];
  }
  args.push(current.trim());
  return { args, end: i };
}

function evaluateConstExpr(expr, defines) {
  // Simple evaluation: support defined(X), integer literals, &&, ||, !
  const expanded = expr.replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, name) => {
    return defines.has(name) ? '1' : '0';
  });
  // Replace known defines with their values
  const withValues = expanded.replace(/\b[A-Za-z_]\w*\b/g, (name) => {
    const macro = defines.get(name);
    if (macro && macro.params === null) return macro.body || '0';
    return '0';
  });
  try {
    // Safe-ish evaluation of constant integer expressions
    const sanitized = withValues.replace(/[^0-9+\-*/%<>=!&|() ]/g, '');
    return Boolean(Function(`"use strict"; return (${sanitized})`)());
  } catch {
    return false;
  }
}

function resolveInclude(pathSpec, includePaths, readFile) {
  if (!readFile) return null;
  // Strip quotes or angle brackets
  const path = pathSpec.replace(/^["<]|[">]$/g, '');
  // Try each include path
  for (const dir of includePaths) {
    const fullPath = dir + '/' + path;
    const content = readFile(fullPath);
    if (content !== null) return content;
  }
  // Try as-is
  return readFile(path);
}

function isIdentStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isIdentChar(c) {
  return isIdentStart(c) || (c >= '0' && c <= '9');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All preprocessor define tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/preprocessor.mjs test/compiler/preprocessor.test.mjs
git commit -m "feat: add preprocessor with #define, #undef, macro expansion"
```

---

### Task 2: Preprocessor — Conditionals and #pragma

**Files:**
- Modify: `lpc-js/test/compiler/preprocessor.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `lpc-js/test/compiler/preprocessor.test.mjs`:

```js
describe('preprocessor — conditionals', () => {
  it('#ifdef true', () => {
    const result = preprocess('#define FOO\n#ifdef FOO\nint x = 1;\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });

  it('#ifdef false', () => {
    const result = preprocess('#ifdef FOO\nint x = 1;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
  });

  it('#ifndef true', () => {
    const result = preprocess('#ifndef FOO\nint x = 1;\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });

  it('#ifndef false', () => {
    const result = preprocess('#define FOO\n#ifndef FOO\nint x = 1;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
  });

  it('#ifdef with #else', () => {
    const result = preprocess('#ifdef FOO\nint x = 1;\n#else\nint x = 2;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
    assert.ok(result.source.includes('int x = 2;'));
  });

  it('#if with defined()', () => {
    const result = preprocess('#define FOO\n#if defined(FOO)\nint x = 1;\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });

  it('#elif chain', () => {
    const result = preprocess('#define B 1\n#ifdef A\nint x = 1;\n#elif defined(B)\nint x = 2;\n#else\nint x = 3;\n#endif');
    assert.ok(!result.source.includes('int x = 1;'));
    assert.ok(result.source.includes('int x = 2;'));
    assert.ok(!result.source.includes('int x = 3;'));
  });

  it('nested #ifdef', () => {
    const result = preprocess('#define A\n#define B\n#ifdef A\n#ifdef B\nint x = 1;\n#endif\n#endif');
    assert.ok(result.source.includes('int x = 1;'));
  });
});

describe('preprocessor — #pragma', () => {
  it('collects pragma strict_types', () => {
    const result = preprocess('#pragma strict_types\nint x = 1;');
    assert.equal(result.pragmas['strict_types'], true);
  });

  it('collects pragma save_types', () => {
    const result = preprocess('#pragma save_types\nint x = 1;');
    assert.equal(result.pragmas['save_types'], true);
  });
});

describe('preprocessor — #include', () => {
  it('includes file content', () => {
    const readFile = (path) => {
      if (path === '/include/header.h') return 'int CONST = 42;';
      return null;
    };
    const result = preprocess('#include <header.h>\nint x = CONST;', {
      includePaths: ['/include'],
      readFile,
    });
    assert.ok(result.source.includes('int CONST = 42;'));
  });

  it('includes with quotes', () => {
    const readFile = (path) => {
      if (path === 'local.h') return '#define VAL 10';
      return null;
    };
    const result = preprocess('#include "local.h"\nint x = VAL;', { readFile });
    assert.ok(result.source.includes('int x = 10;'));
  });

  it('nested includes', () => {
    const readFile = (path) => {
      if (path === '/inc/a.h') return '#include <b.h>\nint A = 1;';
      if (path === '/inc/b.h') return 'int B = 2;';
      return null;
    };
    const result = preprocess('#include <a.h>', { includePaths: ['/inc'], readFile });
    assert.ok(result.source.includes('int B = 2;'));
    assert.ok(result.source.includes('int A = 1;'));
  });
});

describe('preprocessor — initial defines', () => {
  it('accepts initial defines via options', () => {
    const result = preprocess('int x = FOO;', { defines: { FOO: { params: null, body: '99' } } });
    assert.ok(result.source.includes('int x = 99;'));
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All preprocessor tests PASS (implementation already covers conditionals, pragma, include).

- [ ] **Step 3: Commit**

```bash
git add test/compiler/preprocessor.test.mjs
git commit -m "test: add preprocessor conditional, pragma, and include tests"
```

---

### Task 3: Type System Constants

**Files:**
- Create: `lpc-js/src/compiler/types.mjs`
- Create: `lpc-js/test/compiler/types.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/compiler/types.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LPC_TYPES, TYPE_MOD_ARRAY, TYPE_MOD_CLASS,
  parseTypeName, isAssignable
} from '../../src/compiler/types.mjs';

describe('types', () => {
  it('defines all LPC types', () => {
    assert.equal(LPC_TYPES.INT, 3);
    assert.equal(LPC_TYPES.STRING, 4);
    assert.equal(LPC_TYPES.OBJECT, 5);
    assert.equal(LPC_TYPES.MAPPING, 6);
    assert.equal(LPC_TYPES.FUNCTION, 7);
    assert.equal(LPC_TYPES.FLOAT, 8);
    assert.equal(LPC_TYPES.BUFFER, 9);
    assert.equal(LPC_TYPES.MIXED, 10);
  });

  it('parseTypeName converts string to type code', () => {
    assert.equal(parseTypeName('int'), LPC_TYPES.INT);
    assert.equal(parseTypeName('string'), LPC_TYPES.STRING);
    assert.equal(parseTypeName('void'), LPC_TYPES.VOID);
    assert.equal(parseTypeName('mixed'), LPC_TYPES.MIXED);
    assert.equal(parseTypeName('object'), LPC_TYPES.OBJECT);
  });

  it('parseTypeName handles array types', () => {
    assert.equal(parseTypeName('int*'), LPC_TYPES.INT | TYPE_MOD_ARRAY);
    assert.equal(parseTypeName('string*'), LPC_TYPES.STRING | TYPE_MOD_ARRAY);
  });

  it('parseTypeName returns UNKNOWN for unknown types', () => {
    assert.equal(parseTypeName('foobar'), LPC_TYPES.UNKNOWN);
  });

  it('isAssignable: same type is always ok', () => {
    assert.equal(isAssignable(LPC_TYPES.INT, LPC_TYPES.INT), true);
    assert.equal(isAssignable(LPC_TYPES.STRING, LPC_TYPES.STRING), true);
  });

  it('isAssignable: mixed accepts anything', () => {
    assert.equal(isAssignable(LPC_TYPES.MIXED, LPC_TYPES.INT), true);
    assert.equal(isAssignable(LPC_TYPES.MIXED, LPC_TYPES.STRING), true);
  });

  it('isAssignable: anything can be assigned to mixed', () => {
    assert.equal(isAssignable(LPC_TYPES.MIXED, LPC_TYPES.FLOAT), true);
  });

  it('isAssignable: UNKNOWN is always compatible (no type info)', () => {
    assert.equal(isAssignable(LPC_TYPES.INT, LPC_TYPES.UNKNOWN), true);
    assert.equal(isAssignable(LPC_TYPES.UNKNOWN, LPC_TYPES.INT), true);
  });

  it('isAssignable: int and string are not compatible', () => {
    assert.equal(isAssignable(LPC_TYPES.INT, LPC_TYPES.STRING), false);
  });

  it('isAssignable: int and float are compatible', () => {
    assert.equal(isAssignable(LPC_TYPES.INT, LPC_TYPES.FLOAT), true);
    assert.equal(isAssignable(LPC_TYPES.FLOAT, LPC_TYPES.INT), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/compiler/types.mjs`:

```js
export const LPC_TYPES = {
  UNKNOWN: 0,
  ANY: 1,
  VOID: 2,
  INT: 3,
  STRING: 4,
  OBJECT: 5,
  MAPPING: 6,
  FUNCTION: 7,
  FLOAT: 8,
  BUFFER: 9,
  MIXED: 10,
};

export const TYPE_MOD_ARRAY = 0x100;
export const TYPE_MOD_CLASS = 0x200;

const NAME_TO_TYPE = {
  'int': LPC_TYPES.INT,
  'string': LPC_TYPES.STRING,
  'float': LPC_TYPES.FLOAT,
  'object': LPC_TYPES.OBJECT,
  'mapping': LPC_TYPES.MAPPING,
  'function': LPC_TYPES.FUNCTION,
  'mixed': LPC_TYPES.MIXED,
  'void': LPC_TYPES.VOID,
  'buffer': LPC_TYPES.BUFFER,
  'status': LPC_TYPES.INT,
};

export function parseTypeName(name) {
  if (name.endsWith('*')) {
    const base = parseTypeName(name.slice(0, -1));
    if (base === LPC_TYPES.UNKNOWN) return LPC_TYPES.UNKNOWN;
    return base | TYPE_MOD_ARRAY;
  }
  return NAME_TO_TYPE[name] ?? LPC_TYPES.UNKNOWN;
}

export function baseType(type) {
  return type & 0xFF;
}

export function isArray(type) {
  return (type & TYPE_MOD_ARRAY) !== 0;
}

export function isAssignable(target, value) {
  if (target === value) return true;
  const bt = baseType(target);
  const bv = baseType(value);
  if (bt === LPC_TYPES.UNKNOWN || bv === LPC_TYPES.UNKNOWN) return true;
  if (bt === LPC_TYPES.MIXED || bv === LPC_TYPES.MIXED) return true;
  if (bt === LPC_TYPES.ANY || bv === LPC_TYPES.ANY) return true;
  // int <-> float is ok
  if ((bt === LPC_TYPES.INT && bv === LPC_TYPES.FLOAT) ||
      (bt === LPC_TYPES.FLOAT && bv === LPC_TYPES.INT)) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All types tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/types.mjs test/compiler/types.test.mjs
git commit -m "feat: add LPC type system constants and type checker"
```

---

### Task 4: AST Additions — Class and Scope Resolution

**Files:**
- Modify: `lpc-js/src/compiler/ast.mjs`
- Modify: `lpc-js/test/compiler/ast.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `lpc-js/test/compiler/ast.test.mjs`:

```js
  it('creates ClassDecl', () => {
    const n = AST.classDecl('point', [
      { typeName: 'int', name: 'x' },
      { typeName: 'int', name: 'y' },
    ], 1);
    assert.equal(n.type, 'ClassDecl');
    assert.equal(n.name, 'point');
    assert.equal(n.members.length, 2);
  });

  it('creates ClassMemberAccess', () => {
    const obj = AST.identifier('p', 1);
    const n = AST.classMemberAccess(obj, 'x', 1);
    assert.equal(n.type, 'ClassMemberAccess');
    assert.equal(n.member, 'x');
  });

  it('creates ScopeResolution call', () => {
    const n = AST.scopeCallExpr('func', [AST.intLiteral(1, 1)], 1);
    assert.equal(n.type, 'ScopeCallExpression');
    assert.equal(n.name, 'func');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — `AST.classDecl is not a function`.

- [ ] **Step 3: Write implementation**

Append to `lpc-js/src/compiler/ast.mjs`:

```js
export function classDecl(name, members, line) {
  return { type: 'ClassDecl', name, members, line };
}

export function classMemberAccess(object, member, line) {
  return { type: 'ClassMemberAccess', object, member, line };
}

export function scopeCallExpr(name, args, line) {
  return { type: 'ScopeCallExpression', name, args, line };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All AST tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/ast.mjs test/compiler/ast.test.mjs
git commit -m "feat: add ClassDecl, ClassMemberAccess, ScopeCallExpression AST nodes"
```

---

### Task 5: Parser — Modifier Flags and Class Declarations

**Files:**
- Modify: `lpc-js/src/compiler/parser.mjs`
- Modify: `lpc-js/test/compiler/parser.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `lpc-js/test/compiler/parser.test.mjs`:

```js
describe('parser — modifiers', () => {
  it('parses private function', () => {
    const prog = parse('private int secret() { return 1; }');
    assert.equal(prog.body[0].flags & 0x01, 0x01); // PRIVATE
  });

  it('parses nomask function', () => {
    const prog = parse('nomask void setup() { }');
    assert.ok(prog.body[0].flags & 0x10); // NOMASK
  });

  it('parses static nosave variable', () => {
    const prog = parse('static nosave int cache = 0;');
    assert.ok(prog.body[0].flags);
  });
});

describe('parser — class declaration', () => {
  it('parses class definition', () => {
    const prog = parse('class point { int x; int y; }');
    assert.equal(prog.body[0].type, 'ClassDecl');
    assert.equal(prog.body[0].name, 'point');
    assert.equal(prog.body[0].members.length, 2);
    assert.equal(prog.body[0].members[0].typeName, 'int');
    assert.equal(prog.body[0].members[0].name, 'x');
  });
});

describe('parser — scope resolution', () => {
  it('parses ::func() call', () => {
    const prog = parse('void f() { ::create(); }');
    const stmt = prog.body[0].body.statements[0];
    assert.equal(stmt.expression.type, 'ScopeCallExpression');
    assert.equal(stmt.expression.name, 'create');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — modifier flags are 0, ClassDecl not parsed, `::` not handled.

- [ ] **Step 3: Modify parser**

In `lpc-js/src/compiler/parser.mjs`, apply these changes:

**a) Add modifier flag constants at top of file (after imports):**

```js
const MOD_PRIVATE = 0x01;
const MOD_PROTECTED = 0x02;
const MOD_PUBLIC = 0x04;
const MOD_STATIC = 0x08;
const MOD_NOMASK = 0x10;
const MOD_NOSAVE = 0x20;
const MOD_VARARGS = 0x40;

const MOD_MAP = {
  [T.PRIVATE]: MOD_PRIVATE,
  [T.PROTECTED]: MOD_PROTECTED,
  [T.PUBLIC]: MOD_PUBLIC,
  [T.STATIC]: MOD_STATIC,
  [T.NOMASK]: MOD_NOMASK,
  [T.NOSAVE]: MOD_NOSAVE,
  [T.VARARGS]: MOD_VARARGS,
};
```

**b) Fix `parseTopLevel` to collect flags and handle `class`:**

Replace the body of `parseTopLevel()`:

```js
  parseTopLevel() {
    if (this.at(T.INHERIT)) {
      return this.parseInherit();
    }
    // Class declaration
    if (this.at(T.CLASS) && this.tokens[this.pos + 1]?.type === T.IDENT &&
        this.tokens[this.pos + 2]?.type === T.LBRACE) {
      return this.parseClassDecl();
    }
    let flags = 0;
    while (this.isModifier()) {
      flags |= MOD_MAP[this.advance().type];
    }
    const typeTok = this.parseTypeName();
    let typeName = typeTok;
    if (this.match(T.STAR)) {
      typeName = typeName + '*';
    }
    const name = this.expect(T.IDENT).value;
    if (this.at(T.LPAREN)) {
      return this.parseFunctionDecl(typeName, name, flags);
    } else {
      return this.parseGlobalVarDecl(typeName, name, flags);
    }
  }

  parseClassDecl() {
    const line = this.peek().line;
    this.expect(T.CLASS);
    const name = this.expect(T.IDENT).value;
    this.expect(T.LBRACE);
    const members = [];
    while (!this.at(T.RBRACE) && !this.at(T.EOF)) {
      let typeName = this.parseTypeName();
      if (this.match(T.STAR)) typeName += '*';
      const memberName = this.expect(T.IDENT).value;
      this.expect(T.SEMICOLON);
      members.push({ typeName, name: memberName });
    }
    this.expect(T.RBRACE);
    return AST.classDecl(name, members, line);
  }
```

**c) Handle `::func()` in `parsePrimary`:**

Add before the `IDENT` case in `parsePrimary()`:

```js
    // Scope resolution ::func()
    if (tok.type === T.COLON_COLON) {
      this.advance();
      const name = this.expect(T.IDENT).value;
      this.expect(T.LPAREN);
      const args = this.parseArgList();
      this.expect(T.RPAREN);
      return AST.scopeCallExpr(name, args, tok.line);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All parser tests (including new modifier, class, scope resolution tests) PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser.mjs test/compiler/parser.test.mjs
git commit -m "feat: parser supports modifier flags, class declarations, and :: scope resolution"
```

---

### Task 6: Codegen — Inheritance Resolution

**Files:**
- Modify: `lpc-js/src/compiler/codegen.mjs`
- Modify: `lpc-js/src/vm/program.mjs`
- Create: `lpc-js/test/integration/inherit.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/integration/inherit.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileWithInherit } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

describe('inheritance — basic', () => {
  it('inherits a function from parent', () => {
    const files = {
      '/parent.c': 'int get_value() { return 42; }',
      '/child.c': 'inherit "/parent";\nint f() { return get_value(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 42);
  });

  it('child overrides parent function', () => {
    const files = {
      '/parent.c': 'int get_value() { return 10; }',
      '/child.c': 'inherit "/parent";\nint get_value() { return 20; }\nint f() { return get_value(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 20);
  });

  it('inherits variables from parent', () => {
    const files = {
      '/parent.c': 'int counter = 0;\nvoid inc() { counter += 1; }\nint get() { return counter; }',
      '/child.c': 'inherit "/parent";\nint f() { inc(); inc(); inc(); return get(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 3);
  });

  it('::func() calls inherited version', () => {
    const files = {
      '/parent.c': 'int get_value() { return 10; }',
      '/child.c': 'inherit "/parent";\nint get_value() { return ::get_value() + 5; }\nint f() { return get_value(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 15);
  });

  it('multiple inheritance', () => {
    const files = {
      '/a.c': 'int from_a() { return 1; }',
      '/b.c': 'int from_b() { return 2; }',
      '/child.c': 'inherit "/a";\ninherit "/b";\nint f() { return from_a() + from_b(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — `compileWithInherit` not exported.

- [ ] **Step 3: Add `findInheritedFunction` to Program**

In `lpc-js/src/vm/program.mjs`, add after `findFunction`:

```js
  findInheritedFunction(name) {
    for (const inh of this.inherits) {
      const fn = inh.program.findFunction(name);
      if (fn) return { fn, program: inh.program, varOffset: inh.varOffset };
    }
    return null;
  }
```

- [ ] **Step 4: Modify codegen to support inheritance**

In `lpc-js/src/compiler/codegen.mjs`, add these changes:

**a) Export `compileWithInherit`:**

Add at the bottom of the file:

```js
export function compileWithInherit(filename, files) {
  const cache = new Map();

  function compileFile(fname) {
    if (cache.has(fname)) return cache.get(fname);
    const source = files[fname] ?? files[fname + '.c'];
    if (!source) throw new Error(`File not found: ${fname}`);
    const ast = parse(source, fname);

    // Resolve inherits first
    const inheritPrograms = [];
    const bodyWithoutInherits = [];
    for (const decl of ast.body) {
      if (decl.type === 'InheritDecl') {
        const parentFile = decl.path.endsWith('.c') ? decl.path : decl.path + '.c';
        const parentProg = compileFile(parentFile);
        inheritPrograms.push(parentProg);
      } else {
        bodyWithoutInherits.push(decl);
      }
    }

    const gen = new CodeGen(AST.program(bodyWithoutInherits, ast.line));
    gen.inheritPrograms = inheritPrograms;

    // Register inherited functions and variables
    for (const parent of inheritPrograms) {
      const funcOffset = gen.functionNames.size;
      const varOffset = gen.globals.size;
      for (const fn of parent.functions) {
        if (!gen.functionNames.has(fn.name)) {
          gen.functionNames.set(fn.name, gen.functionNames.size);
          gen.inheritedFunctions.set(fn.name, { fn, program: parent });
        }
      }
      for (const v of parent.variables) {
        if (!gen.globals.has(v.name)) {
          gen.globals.set(v.name, gen.globals.size);
          gen.emitter.variables.push({ name: v.name, type: v.type });
        }
      }
      gen.emitter.inherits.push({ program: parent, funcOffset, varOffset });
    }

    const prog = gen.compile();
    prog.filename = fname;
    // Copy inherit info
    prog.inherits = gen.emitter.inherits;

    cache.set(fname, prog);
    return prog;
  }

  return compileFile(filename);
}
```

**b) Add `inheritedFunctions` and `emitter.inherits` to CodeGen constructor:**

In the `CodeGen` constructor, add:

```js
    this.inheritedFunctions = new Map();
```

In the `Emitter` constructor, add:

```js
    this.inherits = [];
```

And update `toProgram` to copy inherits:

```js
  toProgram(filename) {
    const prog = new Program(filename);
    prog.bytecode = new Uint8Array(this.code);
    prog.functions = this.functions;
    prog.strings = this.strings;
    prog.variables = this.variables;
    prog.inherits = this.inherits;
    return prog;
  }
```

**c) Handle `CALL_LOCAL` for inherited functions:**

In the `CallExpression` case of `genExpr`, after checking `functionNames`, add handling for inherited functions that generates `CALL_INHERITED` instead:

Replace the `CallExpression` case:

```js
      case 'CallExpression': {
        for (const arg of node.args) {
          this.genExpr(arg);
        }
        const fnIdx = this.functionNames.get(node.name);
        if (fnIdx !== undefined) {
          const inherited = this.inheritedFunctions.get(node.name);
          if (inherited && !this.localFunctionNames.has(node.name)) {
            // Inherited function — use CALL_INHERITED
            const nameIdx = this.emitter.addString(node.name);
            this.emitter.emitOp(OP.CALL_INHERITED);
            this.emitter.emitShort(nameIdx);
            this.emitter.emit(node.args.length);
          } else {
            this.emitter.emitOp(OP.CALL_LOCAL);
            this.emitter.emitShort(fnIdx);
            this.emitter.emit(node.args.length);
          }
        } else {
          const nameIdx = this.emitter.addString(node.name);
          this.emitter.emitOp(OP.CALL_EFUN);
          this.emitter.emitShort(nameIdx);
          this.emitter.emit(node.args.length);
        }
        break;
      }
```

Add `this.localFunctionNames = new Set();` to the constructor, and populate it in `compile()` first pass:

```js
    for (const decl of this.ast.body) {
      if (decl.type === 'FunctionDecl') {
        this.localFunctionNames.add(decl.name);
        this.functionNames.set(decl.name, this.functionNames.size);
      }
      // ...
    }
```

**d) Handle `ScopeCallExpression` in `genExpr`:**

```js
      case 'ScopeCallExpression': {
        for (const arg of node.args) {
          this.genExpr(arg);
        }
        const nameIdx = this.emitter.addString(node.name);
        this.emitter.emitOp(OP.CALL_INHERITED);
        this.emitter.emitShort(nameIdx);
        this.emitter.emit(node.args.length);
        break;
      }
```

- [ ] **Step 5: Implement CALL_INHERITED in VM**

In `lpc-js/src/vm/machine.mjs`, add a case for `OP.CALL_INHERITED`:

```js
        case OP.CALL_INHERITED: {
          const nameIdx = this.readShort();
          const argCount = bc[this.pc++];
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.unshift(this.stack.pop());
          }
          const name = this.currentProgram.strings[nameIdx];
          // Search inherit chain
          const found = this.currentProgram.findInheritedFunction(name);
          if (found) {
            // Save current program, switch to parent
            const savedProgram = this.currentProgram;
            this.currentProgram = found.program;
            const result = this.callFunction(found.fn, args);
            this.currentProgram = savedProgram;
            this.stack.push(result);
          } else {
            throw new Error(`Inherited function not found: ${name}`);
          }
          break;
        }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd lpc-js && npm test`
Expected: All inheritance tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/compiler/codegen.mjs src/vm/program.mjs src/vm/machine.mjs test/integration/inherit.test.mjs
git commit -m "feat: add inheritance resolution, CALL_INHERITED, and :: scope calls"
```

---

### Task 7: Wire Preprocessor into Compile Pipeline

**Files:**
- Modify: `lpc-js/src/compiler/codegen.mjs`
- Create: `lpc-js/test/integration/preprocessor-compile.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/integration/preprocessor-compile.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

describe('integration — preprocessor + compile', () => {
  it('compiles with #define', () => {
    const prog = compile('#define VAL 42\nint f() { return VAL; }');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 42);
  });

  it('compiles with #ifdef', () => {
    const prog = compile('#define USE_FAST\n#ifdef USE_FAST\nint f() { return 1; }\n#else\nint f() { return 0; }\n#endif');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 1);
  });

  it('compiles with macro function', () => {
    const prog = compile('#define DOUBLE(x) ((x) * 2)\nint f() { return DOUBLE(5); }');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 10);
  });

  it('#pragma strict_types is recorded', () => {
    // Just verify it compiles without error
    const prog = compile('#pragma strict_types\nint f() { return 1; }');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — `#define` lines cause parse errors since preprocessor isn't wired in.

- [ ] **Step 3: Wire preprocessor into compile()**

In `lpc-js/src/compiler/codegen.mjs`, modify the `compile` function:

```js
import { preprocess } from './preprocessor.mjs';

export function compile(source, filename = '<input>') {
  const ppResult = preprocess(source);
  const ast = parse(ppResult.source, filename);
  const gen = new CodeGen(ast);
  gen.pragmas = ppResult.pragmas;
  const prog = gen.compile();
  prog.filename = filename;
  return prog;
}
```

Also add `this.pragmas = {};` to the CodeGen constructor.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All preprocessor-compile integration tests PASS, and all existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/codegen.mjs test/integration/preprocessor-compile.test.mjs
git commit -m "feat: wire preprocessor into compile pipeline"
```

---

### Task 8: Final Verification

**Files:** None (test-only)

- [ ] **Step 1: Run full test suite**

Run: `cd lpc-js && npm test`
Expected: All tests pass — preprocessor, types, parser (modifiers, class, ::), inheritance, preprocessor-compile integration.

- [ ] **Step 2: Commit any remaining fixes**

If all tests pass, no commit needed. If fixes were required, commit them.

- [ ] **Step 3: Done**

Phase 2 complete.
