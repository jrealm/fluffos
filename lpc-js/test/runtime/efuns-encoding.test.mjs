import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkArray,
         T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('Phase 10.2: encoding efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  describe('str_to_arr', () => {
    it('converts ASCII string to codepoints', () => {
      const result = reg.call('str_to_arr', [mkString('ABC')]);
      assert.equal(result.type, T_ARRAY);
      assert.equal(result.value.length, 3);
      assert.equal(result.value[0].value, 65);
      assert.equal(result.value[1].value, 66);
      assert.equal(result.value[2].value, 67);
    });

    it('converts CJK characters to codepoints', () => {
      const result = reg.call('str_to_arr', [mkString('你好')]);
      assert.equal(result.value.length, 2);
      assert.equal(result.value[0].value, 0x4F60); // 你
      assert.equal(result.value[1].value, 0x597D); // 好
    });

    it('handles emoji (surrogate pairs)', () => {
      const result = reg.call('str_to_arr', [mkString('😀')]);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0].value, 0x1F600);
    });

    it('returns empty array for empty string', () => {
      const result = reg.call('str_to_arr', [mkString('')]);
      assert.equal(result.value.length, 0);
    });
  });

  describe('arr_to_str', () => {
    it('converts codepoints back to string', () => {
      const arr = mkArray([mkInt(65), mkInt(66), mkInt(67)]);
      assert.equal(reg.call('arr_to_str', [arr]).value, 'ABC');
    });

    it('converts CJK codepoints', () => {
      const arr = mkArray([mkInt(0x4F60), mkInt(0x597D)]);
      assert.equal(reg.call('arr_to_str', [arr]).value, '你好');
    });

    it('converts emoji codepoint', () => {
      const arr = mkArray([mkInt(0x1F600)]);
      assert.equal(reg.call('arr_to_str', [arr]).value, '😀');
    });

    it('round-trips with str_to_arr', () => {
      const original = '測試 test 123';
      const arr = reg.call('str_to_arr', [mkString(original)]);
      const result = reg.call('arr_to_str', [arr]);
      assert.equal(result.value, original);
    });
  });

  describe('strwidth', () => {
    it('ASCII characters are width 1', () => {
      assert.equal(reg.call('strwidth', [mkString('hello')]).value, 5);
    });

    it('CJK characters are width 2', () => {
      assert.equal(reg.call('strwidth', [mkString('你好')]).value, 4);
    });

    it('mixed ASCII and CJK', () => {
      assert.equal(reg.call('strwidth', [mkString('Hi你好')]).value, 6); // 2 + 4
    });

    it('fullwidth forms are width 2', () => {
      assert.equal(reg.call('strwidth', [mkString('Ａ')]).value, 2); // FF21 fullwidth A
    });

    it('empty string is width 0', () => {
      assert.equal(reg.call('strwidth', [mkString('')]).value, 0);
    });

    it('Japanese characters are width 2', () => {
      assert.equal(reg.call('strwidth', [mkString('日本語')]).value, 6);
    });
  });

  describe('to_utf8 / utf8_to', () => {
    it('to_utf8 passes through UTF-8 string', () => {
      const result = reg.call('to_utf8', [mkString('hello'), mkString('utf-8')]);
      assert.equal(result.value, 'hello');
    });

    it('utf8_to passes through UTF-8 string', () => {
      const result = reg.call('utf8_to', [mkString('hello'), mkString('utf-8')]);
      assert.equal(result.type, T_STRING);
    });
  });

  describe('set_encoding', () => {
    it('does not crash without driver', () => {
      // In standalone mode (no driver), should just return 0
      const result = reg.call('set_encoding', [mkString('utf-8')]);
      assert.equal(result.value, 0);
    });
  });
});
