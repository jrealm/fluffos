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
});
