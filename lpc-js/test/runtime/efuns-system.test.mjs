import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('system efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  describe('ctime', () => {
    it('converts timestamp to string', () => {
      const result = reg.call('ctime', [mkInt(1704067200)]);
      assert.equal(result.type, T_STRING);
      assert.ok(result.value.length > 10);
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

  describe('memory_info', () => {
    it('returns positive integer', () => {
      const result = reg.call('memory_info', []);
      assert.equal(result.type, T_INT);
      assert.ok(result.value > 0);
    });
  });

  describe('call_stack', () => {
    it('returns array', () => {
      const result = reg.call('call_stack', []);
      assert.equal(result.type, T_ARRAY);
    });
  });
});
