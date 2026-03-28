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

  it('isAssignable: UNKNOWN is always compatible', () => {
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
