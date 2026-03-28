# Phase 6A：語言完整度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊 lpc-js 與 FluffOS 2.28 之間的語言功能差距 — sprintf 完整實作、常用 efun 補齊、bit 字串操作。

**Architecture:** 新增 3 個 efun 模組（`sprintf.mjs`、`bits.mjs`、`snoop.mjs`），擴充 6 個現有模組（`misc.mjs`、`interactive.mjs`、`objects.mjs`、`files.mjs`、`save.mjs`、`commands.mjs`），在 `driver.mjs` 新增系統級 efun，修改 `connection.mjs` 支援 idle 追蹤、snoop、get_char。所有 efun 遵循現有模式：`export function registerXxxEfuns(reg, driver?)` + `reg.register(name, fn)`。

**Tech Stack:** Node.js 20+, ES Modules, `node:test` + `node:assert/strict`

**Spec:** `docs/superpowers/specs/2026-03-28-lpc-js-phase6a-language-completeness.md`

**Testing:** `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`

---

## File Structure

### 新增檔案

| 檔案 | 職責 |
|------|------|
| `src/runtime/efuns/sprintf.mjs` | sprintf 完整實作（格式解析、格式化、column/table mode、`%O`） |
| `src/runtime/efuns/bits.mjs` | bit 字串操作（set_bit、clear_bit、test_bit、next_bit） |
| `src/runtime/efuns/snoop.mjs` | snoop 系統（snoop、query_snoop、query_snooping） |
| `test/runtime/efuns-sprintf.test.mjs` | sprintf 測試 |
| `test/runtime/efuns-bits.test.mjs` | bit 操作測試 |
| `test/runtime/efuns-snoop.test.mjs` | snoop 測試 |
| `test/runtime/efuns-comm.test.mjs` | say/tell_room/shout 測試 |
| `test/runtime/efuns-query.test.mjs` | 查詢類 efun 測試 |
| `test/runtime/efuns-system.test.mjs` | 系統控制類 efun 測試 |
| `test/runtime/efuns-files-extra.test.mjs` | read_bytes/write_bytes/cp/rename 測試 |

### 修改檔案

| 檔案 | 修改內容 |
|------|----------|
| `src/runtime/efuns/misc.mjs` | 移除舊 sprintf，新增 ctime、uptime、call_stack、origin、memory_info、mud_status、query_host_name |
| `src/runtime/efuns/interactive.mjs` | 新增 say、tell_room、shout、receive、get_char、query_ip_number、query_ip_name、query_idle |
| `src/runtime/efuns/objects.mjs` | 新增 function_exists、first_inventory、next_inventory |
| `src/runtime/efuns/files.mjs` | 新增 read_bytes、write_bytes、cp、rename |
| `src/runtime/efuns/save.mjs` | 新增 save_variable、restore_variable（利用已有的 serializeValue/deserializeValue） |
| `src/runtime/efuns.mjs` | import 並載入 sprintf、bits 模組 |
| `src/runtime/driver.mjs` | 新增 objects、livings、shutdown、call_out_info efun；加 bootTime；import/載入 snoop |
| `src/runtime/commands.mjs` | 新增 getCommandsForObject() 方法 |
| `src/net/connection.mjs` | 新增 lastInputTime、snoopedBy、snooping、charMode 屬性 |

---

## Task 1: sprintf 核心 — 基本格式規範符

**Files:**
- Create: `lpc-js/src/runtime/efuns/sprintf.mjs`
- Create: `lpc-js/test/runtime/efuns-sprintf.test.mjs`
- Modify: `lpc-js/src/runtime/efuns/misc.mjs:49-59`
- Modify: `lpc-js/src/runtime/efuns.mjs`

- [ ] **Step 1: Write failing tests for basic specifiers**

```javascript
// test/runtime/efuns-sprintf.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('sprintf', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  describe('basic specifiers', () => {
    it('%s formats string', () => {
      assert.equal(reg.call('sprintf', [mkString('Hello %s'), mkString('World')]).value, 'Hello World');
    });

    it('%s with null prints (nil)', () => {
      assert.equal(reg.call('sprintf', [mkString('%s'), mkInt(0)]).value, '0');
    });

    it('%d formats integer', () => {
      assert.equal(reg.call('sprintf', [mkString('%d'), mkInt(42)]).value, '42');
    });

    it('%d with negative', () => {
      assert.equal(reg.call('sprintf', [mkString('%d'), mkInt(-7)]).value, '-7');
    });

    it('%i is same as %d', () => {
      assert.equal(reg.call('sprintf', [mkString('%i'), mkInt(99)]).value, '99');
    });

    it('%f formats float', () => {
      assert.equal(reg.call('sprintf', [mkString('%f'), mkFloat(3.14)]).value, '3.140000');
    });

    it('%f with precision', () => {
      assert.equal(reg.call('sprintf', [mkString('%.2f'), mkFloat(3.14159)]).value, '3.14');
    });

    it('%c formats character', () => {
      assert.equal(reg.call('sprintf', [mkString('%c'), mkInt(65)]).value, 'A');
    });

    it('%o formats octal', () => {
      assert.equal(reg.call('sprintf', [mkString('%o'), mkInt(8)]).value, '10');
    });

    it('%x formats lowercase hex', () => {
      assert.equal(reg.call('sprintf', [mkString('%x'), mkInt(255)]).value, 'ff');
    });

    it('%X formats uppercase hex', () => {
      assert.equal(reg.call('sprintf', [mkString('%X'), mkInt(255)]).value, 'FF');
    });

    it('%% outputs literal percent', () => {
      assert.equal(reg.call('sprintf', [mkString('100%%')]).value, '100%');
    });

    it('multiple specifiers', () => {
      assert.equal(
        reg.call('sprintf', [mkString('%s is %d years old'), mkString('Bob'), mkInt(30)]).value,
        'Bob is 30 years old'
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-sprintf.test.mjs`
Expected: Most tests FAIL (only basic %s/%d might pass with old implementation)

- [ ] **Step 3: Create sprintf module with basic specifiers**

```javascript
// src/runtime/efuns/sprintf.mjs
import { mkString, T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, T_BUFFER, T_CLASS, SVALUE_ZERO } from '../../vm/svalue.mjs';

export function registerSprintfEfuns(reg) {
  reg.register('sprintf', (args) => {
    return mkString(lpcSprintf(args));
  });
}

function lpcSprintf(args) {
  const fmt = args[0].value;
  let argIdx = 1;
  let result = '';
  let i = 0;

  while (i < fmt.length) {
    if (fmt[i] !== '%') {
      result += fmt[i++];
      continue;
    }
    i++; // skip %

    if (i >= fmt.length) break;
    if (fmt[i] === '%') { result += '%'; i++; continue; }

    // Parse format spec
    const spec = parseFormatSpec(fmt, i);
    i = spec.end;

    if (spec.starWidth) spec.width = args[argIdx++]?.value ?? 0;
    if (spec.starPrec) spec.precision = args[argIdx++]?.value ?? 0;

    if (spec.arrayMode) {
      const arr = args[argIdx++];
      if (arr && arr.type === T_ARRAY) {
        const parts = arr.value.map(item => formatValue(spec, item));
        result += parts.join('');
      }
    } else {
      result += formatValue(spec, args[argIdx++] ?? SVALUE_ZERO);
    }
  }

  return result;
}

function parseFormatSpec(fmt, pos) {
  const spec = {
    leftAlign: false, center: false, padZero: false,
    plusSign: false, spaceSign: false,
    columnMode: false, tableMode: false, arrayMode: false,
    padChar: ' ', width: 0, precision: -1,
    specifier: '', end: pos,
    starWidth: false, starPrec: false,
  };

  let i = pos;

  // Parse flags
  let parsingFlags = true;
  while (i < fmt.length && parsingFlags) {
    switch (fmt[i]) {
      case '-': spec.leftAlign = true; i++; break;
      case '|': spec.center = true; i++; break;
      case '+': spec.plusSign = true; i++; break;
      case ' ': spec.spaceSign = true; i++; break;
      case '0': spec.padZero = true; spec.padChar = '0'; i++; break;
      case '=': spec.columnMode = true; i++; break;
      case '#': spec.tableMode = true; i++; break;
      case '@': spec.arrayMode = true; i++; break;
      case "'":
        i++; // skip opening quote
        spec.padChar = '';
        while (i < fmt.length && fmt[i] !== "'") {
          if (fmt[i] === '\\') { i++; spec.padChar += fmt[i] ?? ''; }
          else spec.padChar += fmt[i];
          i++;
        }
        if (i < fmt.length) i++; // skip closing quote
        break;
      default: parsingFlags = false;
    }
  }

  // Parse width
  if (i < fmt.length && fmt[i] === '*') {
    spec.starWidth = true; i++;
  } else {
    let w = '';
    while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') w += fmt[i++];
    if (w) spec.width = parseInt(w, 10);
  }

  // Parse precision or colon
  if (i < fmt.length && fmt[i] === '.') {
    i++;
    if (i < fmt.length && fmt[i] === '*') {
      spec.starPrec = true; i++;
    } else {
      let p = '';
      while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') p += fmt[i++];
      spec.precision = p ? parseInt(p, 10) : 0;
    }
  } else if (i < fmt.length && fmt[i] === ':') {
    i++;
    if (i < fmt.length && fmt[i] === '*') {
      spec.starWidth = true; spec.starPrec = true; i++;
    } else {
      let p = '';
      while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') p += fmt[i++];
      if (p) { spec.width = parseInt(p, 10); spec.precision = spec.width; }
    }
  }

  // Parse specifier
  if (i < fmt.length) {
    spec.specifier = fmt[i];
    i++;
  }
  spec.end = i;
  return spec;
}

function formatValue(spec, sv) {
  let str;

  switch (spec.specifier) {
    case 's':
      str = sv.type === T_STRING ? sv.value : String(sv.value ?? '');
      if (spec.precision >= 0 && str.length > spec.precision) {
        str = str.slice(0, spec.precision);
      }
      if (spec.columnMode && spec.width > 0) return formatColumn(str, spec.width);
      if (spec.tableMode && spec.width > 0) return formatTable(str, spec.width, spec.precision >= 0 ? spec.precision : -1);
      break;

    case 'd': case 'i': {
      const n = sv.type === T_FLOAT ? Math.trunc(sv.value) : Number(sv.value ?? 0);
      str = String(Math.trunc(n));
      if (n >= 0 && spec.plusSign) str = '+' + str;
      else if (n >= 0 && spec.spaceSign) str = ' ' + str;
      if (spec.precision > str.replace(/[-+ ]/, '').length) {
        const digits = str.replace(/^[-+ ]*/, '');
        const prefix = str.slice(0, str.length - digits.length);
        str = prefix + digits.padStart(spec.precision, '0');
      }
      break;
    }

    case 'f': {
      const f = Number(sv.value ?? 0);
      const prec = spec.precision >= 0 ? spec.precision : 6;
      str = f.toFixed(prec);
      if (f >= 0 && spec.plusSign) str = '+' + str;
      else if (f >= 0 && spec.spaceSign) str = ' ' + str;
      break;
    }

    case 'c':
      str = String.fromCharCode(Number(sv.value ?? 0));
      break;

    case 'o':
      str = (Number(sv.value ?? 0) >>> 0).toString(8);
      break;

    case 'x':
      str = (Number(sv.value ?? 0) >>> 0).toString(16);
      break;

    case 'X':
      str = (Number(sv.value ?? 0) >>> 0).toString(16).toUpperCase();
      break;

    case 'O':
      str = svalueToString(sv, 0);
      break;

    default:
      str = '';
  }

  return padString(str, spec);
}

function padString(str, spec) {
  if (spec.width <= 0 || str.length >= spec.width) return str;
  const pad = spec.width - str.length;
  const padStr = spec.padChar.repeat(Math.ceil(pad / spec.padChar.length)).slice(0, pad);

  if (spec.center) {
    const left = Math.floor(pad / 2);
    const right = pad - left;
    const lp = spec.padChar.repeat(Math.ceil(left / spec.padChar.length)).slice(0, left);
    const rp = spec.padChar.repeat(Math.ceil(right / spec.padChar.length)).slice(0, right);
    return lp + str + rp;
  }
  if (spec.leftAlign) return str + padStr;

  // For zero-padded numbers, put pad after sign
  if (spec.padChar === '0' && (str[0] === '-' || str[0] === '+' || str[0] === ' ')) {
    return str[0] + padStr + str.slice(1);
  }
  return padStr + str;
}

function formatColumn(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine === '') {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= width) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.map(l => l.padEnd(width)).join('\n');
}

function formatTable(text, width, numCols) {
  const items = text.split(/[\s\n]+/).filter(Boolean);
  if (items.length === 0) return '';

  if (numCols <= 0) {
    // Auto-calculate: find widest item, fit as many columns as possible
    const maxItemWidth = Math.max(...items.map(s => s.length));
    numCols = Math.max(1, Math.floor(width / (maxItemWidth + 2)));
  }

  // Adjust columns so last row is full (or close)
  while (numCols > 1 && items.length % numCols !== 0 && items.length < numCols) {
    numCols--;
  }

  const colWidth = Math.floor(width / numCols);
  const rows = Math.ceil(items.length / numCols);
  const lines = [];

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < numCols; c++) {
      const idx = r * numCols + c;
      if (idx < items.length) {
        const item = items[idx];
        line += c < numCols - 1 ? item.padEnd(colWidth) : item;
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function svalueToString(sv, indent) {
  if (indent > 20) return '...';
  const pad = ' '.repeat(indent);

  switch (sv.type) {
    case T_INT: return String(sv.value);
    case T_FLOAT: return String(sv.value);
    case T_STRING: return '"' + sv.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    case T_ARRAY: {
      if (sv.value.length === 0) return '({ })';
      const items = sv.value.map(v => pad + '  ' + svalueToString(v, indent + 2) + ',\n');
      return `({ /* sizeof() == ${sv.value.length} */\n${items.join('')}${pad}})`;
    }
    case T_MAPPING: {
      if (sv.value.size === 0) return '([ ])';
      const entries = [];
      for (const [k, v] of sv.value) {
        entries.push(`${pad}  "${k}" : ${svalueToString(v, indent + 2)},\n`);
      }
      return `([ /* sizeof() == ${sv.value.size} */\n${entries.join('')}${pad}])`;
    }
    case T_OBJECT: return sv.value?.objectId ?? '(destructed)';
    case T_FUNCTION: return '(: <function> :)';
    case T_BUFFER: return '<buffer>';
    case T_CLASS: {
      const members = sv.value?.members ?? [];
      return `CLASS( ${members.length} elements)`;
    }
    default: return '0';
  }
}

export { lpcSprintf, svalueToString };
```

- [ ] **Step 4: Remove old sprintf from misc.mjs**

In `src/runtime/efuns/misc.mjs`, delete lines 49-59 (the old sprintf register block):

```javascript
  // DELETE this block:
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
```

- [ ] **Step 5: Register sprintf in efuns.mjs**

Add to `src/runtime/efuns.mjs`:

```javascript
import { registerSprintfEfuns } from './efuns/sprintf.mjs';
```

And in `loadDefaults()`, add after `registerRegexEfuns(this);`:

```javascript
    registerSprintfEfuns(this);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-sprintf.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All existing tests PASS (old sprintf tests in efuns.test.mjs still work)

- [ ] **Step 7: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/sprintf.mjs src/runtime/efuns/misc.mjs src/runtime/efuns.mjs test/runtime/efuns-sprintf.test.mjs
git commit -m "feat: add complete sprintf implementation with all format specifiers, column/table mode, %O"
```

---

## Task 2: sprintf 進階 — width/precision/flags/`%O` 測試

**Files:**
- Modify: `lpc-js/test/runtime/efuns-sprintf.test.mjs`

- [ ] **Step 1: Add tests for width, precision, flags, alignment, %O**

Append to `test/runtime/efuns-sprintf.test.mjs` inside the `describe('sprintf')` block:

```javascript
  describe('width and alignment', () => {
    it('right-align with width', () => {
      assert.equal(reg.call('sprintf', [mkString('%10s'), mkString('hi')]).value, '        hi');
    });

    it('left-align with -', () => {
      assert.equal(reg.call('sprintf', [mkString('%-10s'), mkString('hi')]).value, 'hi        ');
    });

    it('center with |', () => {
      assert.equal(reg.call('sprintf', [mkString('%|10s'), mkString('hi')]).value, '    hi    ');
    });

    it('zero-pad integer', () => {
      assert.equal(reg.call('sprintf', [mkString('%05d'), mkInt(42)]).value, '00042');
    });

    it('zero-pad negative', () => {
      assert.equal(reg.call('sprintf', [mkString('%05d'), mkInt(-7)]).value, '-0007');
    });

    it('+ flag on positive', () => {
      assert.equal(reg.call('sprintf', [mkString('%+d'), mkInt(42)]).value, '+42');
    });

    it('space flag on positive', () => {
      assert.equal(reg.call('sprintf', [mkString('% d'), mkInt(42)]).value, ' 42');
    });

    it('precision on string truncates', () => {
      assert.equal(reg.call('sprintf', [mkString('%.3s'), mkString('hello')]).value, 'hel');
    });

    it('width and precision combined', () => {
      assert.equal(reg.call('sprintf', [mkString('%10.3s'), mkString('hello')]).value, '       hel');
    });

    it('* width from argument', () => {
      assert.equal(reg.call('sprintf', [mkString('%*s'), mkInt(10), mkString('hi')]).value, '        hi');
    });

    it('custom pad char', () => {
      assert.equal(reg.call('sprintf', [mkString("%'.'10s"), mkString('hi')]).value, '........hi');
    });
  });

  describe('array mode @', () => {
    it('applies format to each element', () => {
      const arr = mkArray([mkString('a'), mkString('b'), mkString('c')]);
      assert.equal(reg.call('sprintf', [mkString('%@s'), arr]).value, 'abc');
    });

    it('applies format with width to each element', () => {
      const arr = mkArray([mkInt(1), mkInt(2), mkInt(3)]);
      assert.equal(reg.call('sprintf', [mkString('%@3d'), arr]).value, '  1  2  3');
    });
  });

  describe('column mode =', () => {
    it('wraps text to width', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const result = reg.call('sprintf', [mkString('%=20s'), mkString(text)]).value;
      const lines = result.split('\n');
      for (const line of lines) {
        assert.ok(line.length <= 20, `Line "${line}" exceeds width 20`);
      }
    });
  });

  describe('table mode #', () => {
    it('arranges items in table', () => {
      const items = 'alpha beta gamma delta epsilon zeta';
      const result = reg.call('sprintf', [mkString('%#30s'), mkString(items)]).value;
      assert.ok(result.includes('alpha'));
      assert.ok(result.includes('zeta'));
      // Should have fewer lines than items
      assert.ok(result.split('\n').length < 6);
    });

    it('respects column count in precision', () => {
      const items = 'a b c d e f';
      const result = reg.call('sprintf', [mkString('%#30.3s'), mkString(items)]).value;
      // 3 columns, 2 rows
      assert.equal(result.split('\n').length, 2);
    });
  });

  describe('%O recursive printing', () => {
    it('prints integer', () => {
      assert.equal(reg.call('sprintf', [mkString('%O'), mkInt(42)]).value, '42');
    });

    it('prints string with quotes', () => {
      assert.equal(reg.call('sprintf', [mkString('%O'), mkString('hi')]).value, '"hi"');
    });

    it('prints float', () => {
      assert.equal(reg.call('sprintf', [mkString('%O'), mkFloat(3.14)]).value, '3.14');
    });

    it('prints empty array', () => {
      assert.equal(reg.call('sprintf', [mkString('%O'), mkArray([])]).value, '({ })');
    });

    it('prints array with elements', () => {
      const result = reg.call('sprintf', [mkString('%O'), mkArray([mkInt(1), mkString('hi')])]).value;
      assert.ok(result.includes('sizeof() == 2'));
      assert.ok(result.includes('1,'));
      assert.ok(result.includes('"hi"'));
    });

    it('prints empty mapping', () => {
      assert.equal(reg.call('sprintf', [mkString('%O'), mkMapping(new Map())]).value, '([ ])');
    });

    it('prints mapping with entries', () => {
      const m = new Map(); m.set('key', mkInt(42));
      const result = reg.call('sprintf', [mkString('%O'), mkMapping(m)]).value;
      assert.ok(result.includes('sizeof() == 1'));
      assert.ok(result.includes('"key"'));
      assert.ok(result.includes('42'));
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-sprintf.test.mjs`
Expected: All tests PASS

- [ ] **Step 3: Fix any failing tests**

If any advanced tests fail, fix the implementation in `src/runtime/efuns/sprintf.mjs`. Run tests again until all pass.

- [ ] **Step 4: Commit**

```bash
cd lpc-js && git add test/runtime/efuns-sprintf.test.mjs src/runtime/efuns/sprintf.mjs
git commit -m "test: add comprehensive sprintf tests for width/precision/flags/column/table/%O"
```

---

## Task 3: bit 字串操作

**Files:**
- Create: `lpc-js/src/runtime/efuns/bits.mjs`
- Create: `lpc-js/test/runtime/efuns-bits.test.mjs`
- Modify: `lpc-js/src/runtime/efuns.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// test/runtime/efuns-bits.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString } from '../../src/vm/svalue.mjs';

describe('bit string efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  describe('set_bit and test_bit', () => {
    it('set bit 0', () => {
      const result = reg.call('set_bit', [mkString(''), mkInt(0)]);
      assert.equal(reg.call('test_bit', [result, mkInt(0)]).value, 1);
    });

    it('set bit 5 (last bit of first char)', () => {
      const result = reg.call('set_bit', [mkString(''), mkInt(5)]);
      assert.equal(reg.call('test_bit', [result, mkInt(5)]).value, 1);
      assert.equal(reg.call('test_bit', [result, mkInt(0)]).value, 0);
    });

    it('set bit 6 (first bit of second char)', () => {
      const result = reg.call('set_bit', [mkString(''), mkInt(6)]);
      assert.equal(result.value.length, 2);
      assert.equal(reg.call('test_bit', [result, mkInt(6)]).value, 1);
    });

    it('set multiple bits', () => {
      let bs = reg.call('set_bit', [mkString(''), mkInt(0)]);
      bs = reg.call('set_bit', [bs, mkInt(3)]);
      bs = reg.call('set_bit', [bs, mkInt(7)]);
      assert.equal(reg.call('test_bit', [bs, mkInt(0)]).value, 1);
      assert.equal(reg.call('test_bit', [bs, mkInt(3)]).value, 1);
      assert.equal(reg.call('test_bit', [bs, mkInt(7)]).value, 1);
      assert.equal(reg.call('test_bit', [bs, mkInt(1)]).value, 0);
    });

    it('test_bit on empty string returns 0', () => {
      assert.equal(reg.call('test_bit', [mkString(''), mkInt(0)]).value, 0);
    });

    it('test_bit beyond string length returns 0', () => {
      const bs = reg.call('set_bit', [mkString(''), mkInt(0)]);
      assert.equal(reg.call('test_bit', [bs, mkInt(100)]).value, 0);
    });
  });

  describe('clear_bit', () => {
    it('clears a set bit', () => {
      let bs = reg.call('set_bit', [mkString(''), mkInt(3)]);
      assert.equal(reg.call('test_bit', [bs, mkInt(3)]).value, 1);
      bs = reg.call('clear_bit', [bs, mkInt(3)]);
      assert.equal(reg.call('test_bit', [bs, mkInt(3)]).value, 0);
    });

    it('clearing unset bit is no-op', () => {
      const bs = reg.call('set_bit', [mkString(''), mkInt(0)]);
      const result = reg.call('clear_bit', [bs, mkInt(1)]);
      assert.equal(reg.call('test_bit', [result, mkInt(0)]).value, 1);
    });
  });

  describe('next_bit', () => {
    it('finds next set bit', () => {
      let bs = reg.call('set_bit', [mkString(''), mkInt(3)]);
      bs = reg.call('set_bit', [bs, mkInt(7)]);
      assert.equal(reg.call('next_bit', [bs, mkInt(0)]).value, 3);
      assert.equal(reg.call('next_bit', [bs, mkInt(4)]).value, 7);
    });

    it('returns -1 when no more bits', () => {
      const bs = reg.call('set_bit', [mkString(''), mkInt(3)]);
      assert.equal(reg.call('next_bit', [bs, mkInt(4)]).value, -1);
    });

    it('returns -1 on empty string', () => {
      assert.equal(reg.call('next_bit', [mkString(''), mkInt(0)]).value, -1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-bits.test.mjs`
Expected: FAIL with "Unknown efun: set_bit"

- [ ] **Step 3: Implement bits.mjs**

```javascript
// src/runtime/efuns/bits.mjs
import { mkInt, mkString } from '../../vm/svalue.mjs';

const BASE = 0x30; // '0' = 0

export function registerBitEfuns(reg) {
  reg.register('set_bit', (args) => {
    const str = args[0].value;
    const bit = args[1].value;
    const charIdx = Math.floor(bit / 6);
    const bitIdx = bit % 6;

    // Expand string if needed
    let chars = [...str];
    while (chars.length <= charIdx) chars.push(String.fromCharCode(BASE));

    const val = chars[charIdx].charCodeAt(0) - BASE;
    chars[charIdx] = String.fromCharCode((val | (1 << bitIdx)) + BASE);
    return mkString(chars.join(''));
  });

  reg.register('clear_bit', (args) => {
    const str = args[0].value;
    const bit = args[1].value;
    const charIdx = Math.floor(bit / 6);
    const bitIdx = bit % 6;

    if (charIdx >= str.length) return mkString(str);
    let chars = [...str];
    const val = chars[charIdx].charCodeAt(0) - BASE;
    chars[charIdx] = String.fromCharCode((val & ~(1 << bitIdx)) + BASE);
    return mkString(chars.join(''));
  });

  reg.register('test_bit', (args) => {
    const str = args[0].value;
    const bit = args[1].value;
    const charIdx = Math.floor(bit / 6);
    const bitIdx = bit % 6;

    if (charIdx >= str.length) return mkInt(0);
    const val = str.charCodeAt(charIdx) - BASE;
    return mkInt((val >> bitIdx) & 1);
  });

  reg.register('next_bit', (args) => {
    const str = args[0].value;
    const start = args[1].value;

    for (let bit = start; ; bit++) {
      const charIdx = Math.floor(bit / 6);
      if (charIdx >= str.length) return mkInt(-1);
      const val = str.charCodeAt(charIdx) - BASE;
      const bitIdx = bit % 6;
      if ((val >> bitIdx) & 1) return mkInt(bit);
    }
  });
}
```

- [ ] **Step 4: Register in efuns.mjs**

Add to `src/runtime/efuns.mjs`:

```javascript
import { registerBitEfuns } from './efuns/bits.mjs';
```

In `loadDefaults()`, add after `registerSprintfEfuns(this);`:

```javascript
    registerBitEfuns(this);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-bits.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/bits.mjs src/runtime/efuns.mjs test/runtime/efuns-bits.test.mjs
git commit -m "feat: add bit string efuns (set_bit, clear_bit, test_bit, next_bit)"
```

---

## Task 4: 通訊類 efun — say, tell_room, shout, receive, get_char

**Files:**
- Modify: `lpc-js/src/runtime/efuns/interactive.mjs`
- Modify: `lpc-js/src/net/connection.mjs`
- Create: `lpc-js/test/runtime/efuns-comm.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// test/runtime/efuns-comm.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerInteractiveEfuns } from '../../src/runtime/efuns/interactive.mjs';
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT } from '../../src/vm/svalue.mjs';

function makeObj(name, interactive = null) {
  return {
    objectId: name,
    filename: name,
    livingName: null,
    interactive,
    environment: null,
    inventory: new Set(),
    isDestructed: () => false,
    commandsEnabled: false,
  };
}

function makeConn() {
  const sent = [];
  return {
    send(data) { sent.push(data); },
    sent,
    object: null,
    lastInputTime: Date.now(),
    charMode: false,
    snoopedBy: null,
    snooping: null,
    setInputTo(cb) { this.inputToCallback = cb; },
    inputToCallback: null,
  };
}

describe('communication efuns', () => {
  let reg, driver, room, player, npc, conn;

  beforeEach(() => {
    conn = makeConn();
    player = makeObj('player', conn);
    conn.object = player;
    npc = makeObj('npc');
    room = makeObj('room');

    // Set up environment
    room.inventory = new Set([player, npc]);
    player.environment = room;
    npc.environment = room;

    driver = {
      currentObject: player,
      currentPlayer: player,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null,
      _currentVerb: null,
      objects: { objects: new Map([['player', player], ['npc', npc], ['room', room]]) },
      apply: (func, obj, args) => SVALUE_ZERO,
    };

    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('say sends to room except self', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('say', [mkString('Hello!')]);
    // Player should NOT receive (they are this_object)
    assert.equal(conn.sent.length, 0);
    // NPC should receive
    assert.equal(npcConn.sent.length, 1);
    assert.equal(npcConn.sent[0], 'Hello!');
  });

  it('say with exclude array', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('say', [mkString('Hello!'), mkArray([{ type: T_OBJECT, value: npc }])]);
    // Both excluded
    assert.equal(conn.sent.length, 0);
    assert.equal(npcConn.sent.length, 0);
  });

  it('tell_room sends to all in room', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('tell_room', [{ type: T_OBJECT, value: room }, mkString('Boom!')]);
    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0], 'Boom!');
    assert.equal(npcConn.sent.length, 1);
  });

  it('shout sends to all interactive objects', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('shout', [mkString('Alert!')]);
    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0], 'Alert!');
    assert.equal(npcConn.sent.length, 1);
  });

  it('receive sends directly to connection', () => {
    driver.currentObject = player;
    reg.call('receive', [mkString('raw data')]);
    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0], 'raw data');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-comm.test.mjs`
Expected: FAIL with "Unknown efun: say"

- [ ] **Step 3: Add lastInputTime, snoopedBy, snooping, charMode to Connection**

In `src/net/connection.mjs`, add to constructor after `this.remotePort = socket.remotePort;`:

```javascript
    this.lastInputTime = Date.now();
    this.snoopedBy = null;    // Connection that is snooping this one
    this.snooping = null;     // Connection that this one is snooping
    this.charMode = false;    // For get_char
    this.charCallback = null; // For get_char
```

In `_onTelnetData`, add at the start of the method:

```javascript
    this.lastInputTime = Date.now();
```

In `_processLines`, add a char mode branch before the line processing `while` loop:

```javascript
    if (this.charMode && this.charCallback && this.inputBuffer.length > 0) {
      const ch = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);
      const cb = this.charCallback;
      this.charMode = false;
      this.charCallback = null;
      cb(ch);
      return;
    }
```

- [ ] **Step 4: Implement say, tell_room, shout, receive, get_char in interactive.mjs**

Add these registrations at the end of `registerInteractiveEfuns` in `src/runtime/efuns/interactive.mjs`, before the closing `}`:

```javascript
  reg.register('say', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    const env = driver.currentObject?.environment;
    if (!env) return SVALUE_ZERO;

    // Build exclude set
    const excludeSet = new Set();
    excludeSet.add(driver.currentObject);
    if (args[1]) {
      if (args[1].type === T_ARRAY) {
        for (const sv of args[1].value) {
          if (sv.type === T_OBJECT) excludeSet.add(sv.value);
        }
      } else if (args[1].type === T_OBJECT) {
        excludeSet.add(args[1].value);
      }
    }

    for (const obj of env.inventory) {
      if (!excludeSet.has(obj) && obj.interactive) {
        obj.interactive.send(msg);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('tell_room', (args) => {
    const room = args[0].type === T_OBJECT ? args[0].value : null;
    if (!room) return SVALUE_ZERO;
    const msg = args[1].type === T_STRING ? args[1].value : String(args[1].value);

    const excludeSet = new Set();
    if (args[2]) {
      if (args[2].type === T_ARRAY) {
        for (const sv of args[2].value) {
          if (sv.type === T_OBJECT) excludeSet.add(sv.value);
        }
      } else if (args[2].type === T_OBJECT) {
        excludeSet.add(args[2].value);
      }
    }

    for (const obj of room.inventory) {
      if (!excludeSet.has(obj) && obj.interactive) {
        obj.interactive.send(msg);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('shout', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    for (const [, obj] of driver.objects.objects) {
      if (obj.interactive && !obj.isDestructed()) {
        obj.interactive.send(msg);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('receive', (args) => {
    const msg = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    if (driver.currentObject?.interactive) {
      driver.currentObject.interactive.send(msg);
    }
    return SVALUE_ZERO;
  });

  reg.register('get_char', (args) => {
    const funcName = args[0].value;
    if (driver.currentObject?.interactive) {
      const obj = driver.currentObject;
      const conn = obj.interactive;
      conn.charMode = true;
      conn.charCallback = (ch) => {
        driver.apply(funcName, obj, [mkString(ch)]);
      };
    }
    return SVALUE_ZERO;
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-comm.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/interactive.mjs src/net/connection.mjs test/runtime/efuns-comm.test.mjs
git commit -m "feat: add say, tell_room, shout, receive, get_char efuns"
```

---

## Task 5: 查詢類 efun — query_ip_number, query_idle, function_exists, first/next_inventory 等

**Files:**
- Modify: `lpc-js/src/runtime/efuns/interactive.mjs`
- Modify: `lpc-js/src/runtime/efuns/objects.mjs`
- Modify: `lpc-js/src/runtime/efuns/misc.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Modify: `lpc-js/src/runtime/commands.mjs`
- Create: `lpc-js/test/runtime/efuns-query.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// test/runtime/efuns-query.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerInteractiveEfuns } from '../../src/runtime/efuns/interactive.mjs';
import { registerObjectEfuns } from '../../src/runtime/efuns/objects.mjs';
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

function makeObj(name, interactive = null) {
  return {
    objectId: name, filename: name + '.c',
    livingName: null, interactive,
    environment: null, inventory: new Set(),
    isDestructed: () => false,
    commandsEnabled: false,
    program: {
      filename: name + '.c',
      functions: [
        { name: 'create', numArgs: 0, numLocals: 0, offset: 0, flags: 0 },
        { name: 'test_func', numArgs: 1, numLocals: 0, offset: 10, flags: 0 },
      ],
      variables: [],
      inherits: [],
    },
  };
}

describe('query efuns', () => {
  let reg, driver, player, npc, room;

  beforeEach(() => {
    const conn = {
      send() {}, remoteAddress: '192.168.1.100', lastInputTime: Date.now() - 5000,
      snoopedBy: null, snooping: null, charMode: false, charCallback: null,
      object: null, setInputTo() {},
    };
    player = makeObj('player', conn);
    conn.object = player;
    player.livingName = 'bob';

    npc = makeObj('npc');
    npc.livingName = 'guard';
    room = makeObj('room');
    room.inventory = new Set([player, npc]);
    player.environment = room;
    npc.environment = room;

    driver = {
      currentObject: player, currentPlayer: player,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [], getActions: () => [], getCommandsForObject: (obj) => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map([['player', player], ['npc', npc], ['room', room]]) },
      apply: () => SVALUE_ZERO,
      config: { 'mud name': 'TestMUD' },
      bootTime: Date.now() - 60000,
      callOuts: { getInfo: () => [] },
      livingNames: new Map([['bob', player], ['guard', npc]]),
    };

    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
    registerObjectEfuns(reg);
  });

  it('query_ip_number returns IP', () => {
    const result = reg.call('query_ip_number', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.value, '192.168.1.100');
  });

  it('query_ip_name returns IP (simplified)', () => {
    const result = reg.call('query_ip_name', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.value, '192.168.1.100');
  });

  it('query_idle returns seconds', () => {
    const result = reg.call('query_idle', [{ type: T_OBJECT, value: player }]);
    assert.ok(result.value >= 4 && result.value <= 6);
  });

  it('function_exists finds function', () => {
    driver.currentObject = player;
    const result = reg.call('function_exists', [mkString('test_func'), { type: T_OBJECT, value: player }]);
    assert.equal(result.type, T_STRING);
    assert.ok(result.value.includes('player'));
  });

  it('function_exists returns 0 for missing', () => {
    const result = reg.call('function_exists', [mkString('nonexistent'), { type: T_OBJECT, value: player }]);
    assert.equal(result.value, 0);
  });

  it('first_inventory returns first item', () => {
    const result = reg.call('first_inventory', [{ type: T_OBJECT, value: room }]);
    assert.equal(result.type, T_OBJECT);
  });

  it('first_inventory of empty returns 0', () => {
    const empty = makeObj('empty');
    assert.equal(reg.call('first_inventory', [{ type: T_OBJECT, value: empty }]).value, 0);
  });

  it('next_inventory returns sibling', () => {
    const first = reg.call('first_inventory', [{ type: T_OBJECT, value: room }]);
    const next = reg.call('next_inventory', [first]);
    assert.equal(next.type, T_OBJECT);
    assert.notEqual(first.value, next.value);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-query.test.mjs`
Expected: FAIL

- [ ] **Step 3: Add query_ip_number, query_ip_name, query_idle to interactive.mjs**

Add to the end of `registerInteractiveEfuns` in `src/runtime/efuns/interactive.mjs`:

```javascript
  reg.register('query_ip_number', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      const addr = obj.interactive.remoteAddress ?? '';
      // Strip IPv6 prefix if present (::ffff:1.2.3.4 → 1.2.3.4)
      return mkString(addr.replace(/^::ffff:/, ''));
    }
    return SVALUE_ZERO;
  });

  reg.register('query_ip_name', (args) => {
    // Simplified: same as query_ip_number (no DNS reverse lookup)
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    if (obj?.interactive) {
      const addr = obj.interactive.remoteAddress ?? '';
      return mkString(addr.replace(/^::ffff:/, ''));
    }
    return SVALUE_ZERO;
  });

  reg.register('query_idle', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    if (obj?.interactive) {
      return mkInt(Math.floor((Date.now() - obj.interactive.lastInputTime) / 1000));
    }
    return SVALUE_ZERO;
  });
```

- [ ] **Step 4: Add function_exists, first_inventory, next_inventory to objects.mjs**

Add to the end of `registerObjectEfuns` in `src/runtime/efuns/objects.mjs`:

```javascript
  reg.register('function_exists', (args) => {
    const funcName = args[0].value;
    const obj = args[1]?.type === T_OBJECT ? args[1].value : null;
    if (!obj?.program) return SVALUE_ZERO;
    for (const f of obj.program.functions) {
      if (f.name === funcName) return mkString(obj.program.filename);
    }
    // Check inherited programs
    for (const inh of (obj.program.inherits ?? [])) {
      for (const f of inh.program.functions) {
        if (f.name === funcName) return mkString(inh.program.filename);
      }
    }
    return SVALUE_ZERO;
  });

  reg.register('first_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    const inv = args[0].value.inventory;
    const first = inv.values().next();
    if (first.done) return SVALUE_ZERO;
    return { type: T_OBJECT, value: first.value };
  });

  reg.register('next_inventory', (args) => {
    if (args[0].type !== T_OBJECT) return SVALUE_ZERO;
    const obj = args[0].value;
    const env = obj.environment;
    if (!env) return SVALUE_ZERO;
    const iter = env.inventory.values();
    let found = false;
    for (const item of iter) {
      if (found) return { type: T_OBJECT, value: item };
      if (item === obj) found = true;
    }
    return SVALUE_ZERO;
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-query.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/interactive.mjs src/runtime/efuns/objects.mjs test/runtime/efuns-query.test.mjs
git commit -m "feat: add query_ip_number, query_ip_name, query_idle, function_exists, first/next_inventory efuns"
```

---

## Task 6: 系統控制類 efun — shutdown, objects, livings, call_out_info, uptime, ctime 等

**Files:**
- Modify: `lpc-js/src/runtime/driver.mjs`
- Modify: `lpc-js/src/runtime/efuns/misc.mjs`
- Modify: `lpc-js/src/runtime/commands.mjs`
- Create: `lpc-js/test/runtime/efuns-system.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// test/runtime/efuns-system.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerMiscEfuns } from '../../src/runtime/efuns/misc.mjs';
import { mkInt, mkString, T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('system efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  describe('ctime', () => {
    it('converts timestamp to string', () => {
      // 2024-01-01 00:00:00 UTC
      const result = reg.call('ctime', [mkInt(1704067200)]);
      assert.equal(result.type, T_STRING);
      assert.ok(result.value.includes('2024') || result.value.includes('Jan'));
    });

    it('without arg uses current time', () => {
      const result = reg.call('ctime', []);
      assert.equal(result.type, T_STRING);
      assert.ok(result.value.length > 10);
    });
  });

  describe('query_host_name', () => {
    it('returns a string', () => {
      const result = reg.call('query_host_name', []);
      assert.equal(result.type, T_STRING);
      assert.ok(result.value.length > 0);
    });
  });

  describe('origin', () => {
    it('returns a string', () => {
      const result = reg.call('origin', []);
      assert.equal(result.type, T_STRING);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-system.test.mjs`
Expected: FAIL with "Unknown efun: ctime"

- [ ] **Step 3: Add ctime, query_host_name, uptime, memory_info, mud_status, call_stack, origin to misc.mjs**

Add `import { hostname } from 'node:os';` at the top of `src/runtime/efuns/misc.mjs`.

Add these registrations at the end of `registerMiscEfuns`, before the closing `}`:

```javascript
  reg.register('ctime', (args) => {
    const ts = args.length > 0 ? args[0].value * 1000 : Date.now();
    return mkString(new Date(ts).toString());
  });

  reg.register('query_host_name', () => {
    return mkString(hostname());
  });

  reg.register('origin', () => {
    return mkString('efun');
  });

  reg.register('memory_info', () => {
    return mkInt(process.memoryUsage().heapUsed);
  });

  reg.register('mud_status', () => {
    return mkString('Running');
  });

  reg.register('call_stack', (args) => {
    // Simplified: return empty array (full implementation needs VM call stack access)
    return mkArray([]);
  });
```

- [ ] **Step 4: Add bootTime, objects, livings, shutdown, call_out_info, uptime, commands to driver.mjs**

In `src/runtime/driver.mjs` constructor, add after `this.currentObject = null;`:

```javascript
    this.bootTime = Date.now();
```

In `_registerDriverEfuns()`, add at the end before the closing `}`:

```javascript
    this.efuns.register('objects', (args) => {
      const result = [];
      for (const [, obj] of driver.objects.objects) {
        if (!obj.isDestructed()) result.push({ type: T_OBJECT, value: obj });
      }
      return mkArray(result);
    });

    this.efuns.register('livings', () => {
      const result = [];
      for (const [, obj] of driver.objects.objects) {
        if (obj.livingName && !obj.isDestructed()) {
          result.push({ type: T_OBJECT, value: obj });
        }
      }
      return mkArray(result);
    });

    this.efuns.register('shutdown', (args) => {
      const code = args.length > 0 ? args[0].value : 0;
      driver.stopServer();
      process.exit(code);
    });

    this.efuns.register('call_out_info', () => {
      const result = [];
      for (const entry of driver.callOuts.getAll()) {
        if (!entry.cancelled) {
          const remaining = Math.max(0, Math.floor((entry.expireAt - Date.now()) / 1000));
          result.push(mkArray([
            { type: T_OBJECT, value: entry.object },
            mkString(entry.func),
            mkInt(remaining),
            ...entry.args,
          ]));
        }
      }
      return mkArray(result);
    });

    this.efuns.register('uptime', () => {
      return mkInt(Math.floor((Date.now() - driver.bootTime) / 1000));
    });

    this.efuns.register('commands', () => {
      if (!driver.currentObject) return mkArray([]);
      const result = [];
      const searchList = driver.commands.getSearchList(driver.currentObject);
      for (const obj of searchList) {
        for (const action of driver.commands.getActions(obj)) {
          result.push(mkArray([
            mkString(action.verb),
            mkString(action.func),
            { type: T_OBJECT, value: obj },
            mkInt(action.flag),
          ]));
        }
      }
      return mkArray(result);
    });
```

- [ ] **Step 5: Add getAll() to CallOutManager**

Check if `callout.mjs` has a `getAll()` method. If not, add it. Read the file first, then add:

```javascript
  getAll() {
    return this.queue;
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-system.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/misc.mjs src/runtime/driver.mjs src/runtime/callout.mjs test/runtime/efuns-system.test.mjs
git commit -m "feat: add ctime, query_host_name, origin, objects, livings, shutdown, call_out_info, uptime, commands efuns"
```

---

## Task 7: 檔案操作類 efun — read_bytes, write_bytes, cp, rename

**Files:**
- Modify: `lpc-js/src/runtime/efuns/files.mjs`
- Create: `lpc-js/test/runtime/efuns-files-extra.test.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// test/runtime/efuns-files-extra.test.mjs
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerFileEfuns } from '../../src/runtime/efuns/files.mjs';
import { mkInt, mkString, T_STRING } from '../../src/vm/svalue.mjs';

describe('file efuns extra', () => {
  let reg, tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-test-'));
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerFileEfuns(reg, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('read_bytes and write_bytes', () => {
    it('write then read bytes', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.dat'), 'Hello World');
      const result = reg.call('read_bytes', [mkString('/test.dat'), mkInt(6), mkInt(5)]);
      assert.equal(result.type, T_STRING);
      assert.equal(result.value, 'World');
    });

    it('read_bytes without offset reads from start', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.dat'), 'ABCDE');
      const result = reg.call('read_bytes', [mkString('/test.dat'), mkInt(0), mkInt(3)]);
      assert.equal(result.value, 'ABC');
    });

    it('write_bytes at offset', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.dat'), 'Hello World');
      reg.call('write_bytes', [mkString('/test.dat'), mkInt(6), mkString('LPC!!')]);
      const content = fs.readFileSync(path.join(tmpDir, 'test.dat'), 'utf8');
      assert.equal(content, 'Hello LPC!!');
    });
  });

  describe('cp', () => {
    it('copies a file', () => {
      fs.writeFileSync(path.join(tmpDir, 'src.txt'), 'copy me');
      const result = reg.call('cp', [mkString('/src.txt'), mkString('/dst.txt')]);
      assert.equal(result.value, 0);
      assert.equal(fs.readFileSync(path.join(tmpDir, 'dst.txt'), 'utf8'), 'copy me');
    });

    it('returns -1 for missing source', () => {
      const result = reg.call('cp', [mkString('/nope.txt'), mkString('/dst.txt')]);
      assert.equal(result.value, -1);
    });
  });

  describe('rename', () => {
    it('renames a file', () => {
      fs.writeFileSync(path.join(tmpDir, 'old.txt'), 'data');
      const result = reg.call('rename', [mkString('/old.txt'), mkString('/new.txt')]);
      assert.equal(result.value, 0);
      assert.ok(!fs.existsSync(path.join(tmpDir, 'old.txt')));
      assert.equal(fs.readFileSync(path.join(tmpDir, 'new.txt'), 'utf8'), 'data');
    });

    it('returns -1 for missing source', () => {
      const result = reg.call('rename', [mkString('/nope.txt'), mkString('/dst.txt')]);
      assert.equal(result.value, -1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-files-extra.test.mjs`
Expected: FAIL with "Unknown efun: read_bytes"

- [ ] **Step 3: Add read_bytes, write_bytes, cp, rename to files.mjs**

Add at the end of `registerFileEfuns` in `src/runtime/efuns/files.mjs`, before the closing `}`:

```javascript
  reg.register('read_bytes', (args) => {
    try {
      const fd = fs.openSync(resolve(args[0].value), 'r');
      const start = args[1]?.value ?? 0;
      const length = args[2]?.value ?? 0;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      fs.closeSync(fd);
      return mkString(buf.toString('utf8'));
    } catch { return SVALUE_ZERO; }
  });

  reg.register('write_bytes', (args) => {
    try {
      const fullPath = resolve(args[0].value);
      const start = args[1].value;
      const data = args[2].value;
      const fd = fs.openSync(fullPath, 'r+');
      fs.writeSync(fd, data, start);
      fs.closeSync(fd);
      return mkInt(1);
    } catch { return SVALUE_ZERO; }
  });

  reg.register('cp', (args) => {
    try {
      fs.copyFileSync(resolve(args[0].value), resolve(args[1].value));
      return mkInt(0);
    } catch { return mkInt(-1); }
  });

  reg.register('rename', (args) => {
    try {
      fs.renameSync(resolve(args[0].value), resolve(args[1].value));
      return mkInt(0);
    } catch { return mkInt(-1); }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-files-extra.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/files.mjs test/runtime/efuns-files-extra.test.mjs
git commit -m "feat: add read_bytes, write_bytes, cp, rename file efuns"
```

---

## Task 8: 序列化類 efun — save_variable, restore_variable

**Files:**
- Modify: `lpc-js/src/runtime/efuns/save.mjs`

- [ ] **Step 1: Write failing tests**

Add to `test/runtime/efuns-save.test.mjs` (read existing file first to append):

```javascript
// Append these tests inside the existing describe block
describe('save_variable / restore_variable', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    reg.loadDefaults();
    // Register save efuns with a minimal driver mock
    registerSaveEfuns(reg, { currentObject: null, efuns: reg });
  });

  it('serializes and restores integer', () => {
    const saved = reg.call('save_variable', [mkInt(42)]);
    assert.equal(saved.type, T_STRING);
    const restored = reg.call('restore_variable', [saved]);
    assert.equal(restored.value, 42);
  });

  it('serializes and restores string', () => {
    const saved = reg.call('save_variable', [mkString('hello')]);
    const restored = reg.call('restore_variable', [saved]);
    assert.equal(restored.value, 'hello');
  });

  it('serializes and restores array', () => {
    const arr = mkArray([mkInt(1), mkString('two'), mkInt(3)]);
    const saved = reg.call('save_variable', [arr]);
    const restored = reg.call('restore_variable', [saved]);
    assert.equal(restored.type, T_ARRAY);
    assert.equal(restored.value.length, 3);
    assert.equal(restored.value[1].value, 'two');
  });

  it('serializes and restores mapping', () => {
    const m = new Map(); m.set('key', mkInt(99));
    const saved = reg.call('save_variable', [mkMapping(m)]);
    const restored = reg.call('restore_variable', [saved]);
    assert.equal(restored.type, T_MAPPING);
    assert.equal(restored.value.get('key').value, 99);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-save.test.mjs`
Expected: FAIL with "Unknown efun: save_variable"

- [ ] **Step 3: Add save_variable and restore_variable to save.mjs**

Export `serializeValue` and `deserializeValue` from save.mjs (change from `function` to `export function`).

Then add at the end of `registerSaveEfuns`, before the closing `}`:

```javascript
  reg.register('save_variable', (args) => {
    return mkString(serializeValue(args[0]));
  });

  reg.register('restore_variable', (args) => {
    return deserializeValue(args[0].value);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-save.test.mjs`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/save.mjs test/runtime/efuns-save.test.mjs
git commit -m "feat: add save_variable and restore_variable efuns"
```

---

## Task 9: Snoop 系統

**Files:**
- Create: `lpc-js/src/runtime/efuns/snoop.mjs`
- Create: `lpc-js/test/runtime/efuns-snoop.test.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Modify: `lpc-js/src/net/connection.mjs`

- [ ] **Step 1: Write failing tests**

```javascript
// test/runtime/efuns-snoop.test.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerSnoopEfuns } from '../../src/runtime/efuns/snoop.mjs';
import { mkInt, mkString, SVALUE_ZERO, T_OBJECT } from '../../src/vm/svalue.mjs';

function makeConn() {
  const sent = [];
  return {
    send(data) { sent.push(data); },
    sent,
    object: null,
    snoopedBy: null,
    snooping: null,
    lastInputTime: Date.now(),
    charMode: false,
    charCallback: null,
    setInputTo() {},
    remoteAddress: '127.0.0.1',
  };
}

function makeObj(name) {
  const conn = makeConn();
  const obj = {
    objectId: name, filename: name,
    interactive: conn, livingName: null,
    environment: null, inventory: new Set(),
    isDestructed: () => false,
  };
  conn.object = obj;
  return obj;
}

describe('snoop efuns', () => {
  let reg, driver, wizard, player;

  beforeEach(() => {
    wizard = makeObj('wizard');
    player = makeObj('player');
    driver = { currentObject: wizard };
    reg = new EfunRegistry();
    registerSnoopEfuns(reg, driver);
  });

  it('snoop establishes link', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    assert.equal(player.interactive.snoopedBy, wizard.interactive);
    assert.equal(wizard.interactive.snooping, player.interactive);
  });

  it('query_snoop returns snooper', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    const result = reg.call('query_snoop', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.type, T_OBJECT);
    assert.equal(result.value, wizard);
  });

  it('query_snooping returns target', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    const result = reg.call('query_snooping', [{ type: T_OBJECT, value: wizard }]);
    assert.equal(result.type, T_OBJECT);
    assert.equal(result.value, player);
  });

  it('snoop with no target stops snooping', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }]);
    assert.equal(player.interactive.snoopedBy, null);
    assert.equal(wizard.interactive.snooping, null);
  });

  it('prevents circular snoop', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    // Player tries to snoop wizard — would be circular
    driver.currentObject = player;
    const result = reg.call('snoop', [{ type: T_OBJECT, value: player }, { type: T_OBJECT, value: wizard }]);
    assert.equal(result.value, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd lpc-js && node --test test/runtime/efuns-snoop.test.mjs`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement snoop.mjs**

```javascript
// src/runtime/efuns/snoop.mjs
import { mkInt, SVALUE_ZERO, T_OBJECT } from '../../vm/svalue.mjs';

export function registerSnoopEfuns(reg, driver) {
  reg.register('snoop', (args) => {
    const snooper = args[0]?.type === T_OBJECT ? args[0].value : null;
    const target = args[1]?.type === T_OBJECT ? args[1].value : null;

    if (!snooper?.interactive) return SVALUE_ZERO;

    // Stop current snoop if any
    if (snooper.interactive.snooping) {
      snooper.interactive.snooping.snoopedBy = null;
      snooper.interactive.snooping = null;
    }

    if (!target) return mkInt(1); // Just stop snooping

    if (!target.interactive) return SVALUE_ZERO;

    // Prevent circular: walk the snoop chain from target
    let check = target.interactive;
    while (check.snooping) {
      if (check.snooping === snooper.interactive) return SVALUE_ZERO;
      check = check.snooping;
    }

    // If target is already snooped, disconnect old snooper
    if (target.interactive.snoopedBy) {
      target.interactive.snoopedBy.snooping = null;
    }

    target.interactive.snoopedBy = snooper.interactive;
    snooper.interactive.snooping = target.interactive;
    return mkInt(1);
  });

  reg.register('query_snoop', (args) => {
    const obj = args[0]?.type === T_OBJECT ? args[0].value : null;
    if (obj?.interactive?.snoopedBy?.object) {
      return { type: T_OBJECT, value: obj.interactive.snoopedBy.object };
    }
    return SVALUE_ZERO;
  });

  reg.register('query_snooping', (args) => {
    const obj = args[0]?.type === T_OBJECT ? args[0].value : null;
    if (obj?.interactive?.snooping?.object) {
      return { type: T_OBJECT, value: obj.interactive.snooping.object };
    }
    return SVALUE_ZERO;
  });
}
```

- [ ] **Step 4: Register snoop in driver.mjs**

Add to the imports in `src/runtime/driver.mjs`:

```javascript
import { registerSnoopEfuns } from './efuns/snoop.mjs';
```

In the constructor, add after `registerDatabaseEfuns(this.efuns);`:

```javascript
    registerSnoopEfuns(this.efuns, this);
```

- [ ] **Step 5: Add snoop forwarding to Connection.send()**

In `src/net/connection.mjs`, modify the `send()` method:

```javascript
  send(data) {
    if (this.state !== CONN_CLOSING && this.socket) {
      this.socket.write(data);
    }
    // Forward to snooper
    if (this.snoopedBy && this.snoopedBy.object?.interactive) {
      const snoopConn = this.snoopedBy;
      if (snoopConn.state !== CONN_CLOSING && snoopConn.socket) {
        snoopConn.socket.write('% ' + data);
      }
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd lpc-js && node --test test/runtime/efuns-snoop.test.mjs`
Expected: All tests PASS

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd lpc-js && git add src/runtime/efuns/snoop.mjs src/runtime/driver.mjs src/net/connection.mjs test/runtime/efuns-snoop.test.mjs
git commit -m "feat: add snoop system (snoop, query_snoop, query_snooping)"
```

---

## Task 10: 最終整合測試與清理

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `cd lpc-js && node --test test/**/*.test.mjs test/**/**/*.test.mjs`
Expected: All tests PASS (including all 393+ existing tests plus new tests)

- [ ] **Step 2: Fix any failures**

If any tests fail, diagnose and fix. Common issues:
- Import path errors
- Missing `export` on serialization functions in save.mjs
- Registry loading order conflicts

- [ ] **Step 3: Update README.md**

Update `lpc-js/README.md` to reflect new efuns:
- Add new efuns to the "已實作的 Efun" section
- Update the count (~95 → ~130+)
- Add `set_bit`/`clear_bit`/`test_bit`/`next_bit` to a new "Bit 操作" category
- Add `say`/`tell_room`/`shout`/`receive`/`get_char` to "互動" category
- Add `query_ip_number`/`query_ip_name`/`query_idle` to "互動" category
- Add `function_exists`/`first_inventory`/`next_inventory`/`livings`/`objects` to "物件" category
- Add `shutdown`/`uptime`/`ctime`/`call_out_info`/`mud_status`/`memory_info` to a new "系統" category
- Add `read_bytes`/`write_bytes`/`cp`/`rename` to "檔案 I/O" category
- Add `save_variable`/`restore_variable` to "持久化" category
- Add `snoop`/`query_snoop`/`query_snooping` to a new "監控" category
- Note sprintf is now fully FluffOS-compatible

- [ ] **Step 4: Commit**

```bash
cd lpc-js && git add -A
git commit -m "docs: update README with Phase 6A efuns and features"
```
