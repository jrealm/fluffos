import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, mappingKey, T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('sprintf', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  describe('basic specifiers', () => {
    it('%s formats string', () => {
      assert.equal(reg.call('sprintf', [mkString('Hello %s'), mkString('World')]).value, 'Hello World');
    });

    it('%s with int prints number', () => {
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
      assert.ok(result.split('\n').length < 6);
    });

    it('respects column count in precision', () => {
      const items = 'a b c d e f';
      const result = reg.call('sprintf', [mkString('%#30.3s'), mkString(items)]).value;
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
      const key = mkString('key');
      const m = new Map(); m.set(mappingKey(key), { key, value: mkInt(42) });
      const result = reg.call('sprintf', [mkString('%O'), mkMapping(m)]).value;
      assert.ok(result.includes('sizeof() == 1'));
      assert.ok(result.includes('"key"'));
      assert.ok(result.includes('42'));
    });
  });
});
