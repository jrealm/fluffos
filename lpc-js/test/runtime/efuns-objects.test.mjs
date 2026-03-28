import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkString, T_OBJECT, T_ARRAY, SVALUE_ZERO } from '../../src/vm/svalue.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';

describe('object info efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });
  function makeObj(f) { return new LpcObject(f, new Program(f)); }

  it('object_name', () => {
    assert.equal(reg.call('object_name', [{ type: T_OBJECT, value: makeObj('/std/object.c') }]).value, '/std/object.c');
  });
  it('object_name for clone', () => {
    const clone = makeObj('/std/object.c').clone(5);
    assert.equal(reg.call('object_name', [{ type: T_OBJECT, value: clone }]).value, '/std/object.c#5');
  });
  it('base_name', () => {
    const clone = makeObj('/std/object.c').clone(5);
    assert.equal(reg.call('base_name', [{ type: T_OBJECT, value: clone }]).value, '/std/object.c');
  });
  it('file_name', () => {
    assert.equal(reg.call('file_name', [{ type: T_OBJECT, value: makeObj('/std/object.c') }]).value, '/std/object');
  });
  it('all_inventory', () => {
    const room = makeObj('/room.c');
    makeObj('/a.c').moveTo(room);
    makeObj('/b.c').moveTo(room);
    assert.equal(reg.call('all_inventory', [{ type: T_OBJECT, value: room }]).value.length, 2);
  });
  it('deep_inventory', () => {
    const room = makeObj('/room.c');
    const player = makeObj('/player.c');
    const sword = makeObj('/sword.c');
    player.moveTo(room);
    sword.moveTo(player);
    assert.equal(reg.call('deep_inventory', [{ type: T_OBJECT, value: room }]).value.length, 2);
  });
  it('present finds item', () => {
    const room = makeObj('/room.c');
    const item = makeObj('/sword.c');
    item.moveTo(room);
    assert.equal(reg.call('present', [mkString('/sword.c'), { type: T_OBJECT, value: room }]).type, T_OBJECT);
  });
  it('present returns 0 for not found', () => {
    const room = makeObj('/room.c');
    assert.equal(reg.call('present', [mkString('/nope'), { type: T_OBJECT, value: room }]).value, 0);
  });
});
