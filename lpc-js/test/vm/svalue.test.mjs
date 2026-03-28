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
