import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, T_OBJECT, SVALUE_ZERO } from '../../src/vm/svalue.mjs';
import { LpcObject, O_CLONE } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';

describe('type predicate efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('intp', () => {
    assert.equal(reg.call('intp', [mkInt(1)]).value, 1);
    assert.equal(reg.call('intp', [mkString('x')]).value, 0);
  });
  it('stringp', () => {
    assert.equal(reg.call('stringp', [mkString('x')]).value, 1);
    assert.equal(reg.call('stringp', [mkInt(1)]).value, 0);
  });
  it('floatp', () => {
    assert.equal(reg.call('floatp', [mkFloat(1.0)]).value, 1);
    assert.equal(reg.call('floatp', [mkInt(1)]).value, 0);
  });
  it('arrayp', () => {
    assert.equal(reg.call('arrayp', [mkArray([])]).value, 1);
    assert.equal(reg.call('arrayp', [mkInt(1)]).value, 0);
  });
  it('mapp', () => {
    assert.equal(reg.call('mapp', [mkMapping(new Map())]).value, 1);
    assert.equal(reg.call('mapp', [mkInt(1)]).value, 0);
  });
  it('objectp', () => {
    const obj = new LpcObject('/test.c', new Program('/test.c'));
    assert.equal(reg.call('objectp', [{ type: T_OBJECT, value: obj }]).value, 1);
    assert.equal(reg.call('objectp', [mkInt(1)]).value, 0);
  });
  it('functionp', () => {
    assert.equal(reg.call('functionp', [mkFunction({ kind: 'named', name: 'f' })]).value, 1);
    assert.equal(reg.call('functionp', [mkInt(1)]).value, 0);
  });
  it('undefinedp', () => {
    assert.equal(reg.call('undefinedp', [SVALUE_ZERO]).value, 1);
    assert.equal(reg.call('undefinedp', [mkInt(1)]).value, 0);
  });
  it('clonep', () => {
    const prog = new Program('/test.c');
    const master = new LpcObject('/test.c', prog);
    const clone = master.clone(1);
    assert.equal(reg.call('clonep', [{ type: T_OBJECT, value: clone }]).value, 1);
    assert.equal(reg.call('clonep', [{ type: T_OBJECT, value: master }]).value, 0);
  });
});
