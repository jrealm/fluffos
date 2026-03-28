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
