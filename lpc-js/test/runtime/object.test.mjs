import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LpcObject, O_CLONE, O_DESTRUCTED } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';
import { SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('LpcObject', () => {
  it('constructs with filename and program', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const obj = new LpcObject('/test.c', prog);
    assert.equal(obj.filename, '/test.c');
    assert.equal(obj.program, prog);
    assert.equal(obj.variables.length, 1);
    assert.equal(obj.variables[0], SVALUE_ZERO);
    assert.equal(obj.flags, 0);
    assert.equal(obj.cloneNumber, 0);
    assert.equal(obj.environment, null);
    assert.equal(obj.inventory.size, 0);
    assert.equal(obj.interactive, null);
  });

  it('clone creates independent variable copy', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const master = new LpcObject('/test.c', prog);
    const clone = master.clone(1);
    assert.equal(clone.filename, '/test.c');
    assert.equal(clone.cloneNumber, 1);
    assert.ok(clone.flags & O_CLONE);
    assert.equal(clone.program, prog);
    assert.notEqual(clone.variables, master.variables);
  });

  it('move_object changes environment and inventory', () => {
    const prog = new Program('/room.c');
    const room = new LpcObject('/room.c', prog);
    const item = new LpcObject('/item.c', prog);
    item.moveTo(room);
    assert.equal(item.environment, room);
    assert.ok(room.inventory.has(item));
    item.moveTo(null);
    assert.equal(item.environment, null);
    assert.ok(!room.inventory.has(item));
  });

  it('destruct sets flag', () => {
    const prog = new Program('/test.c');
    const obj = new LpcObject('/test.c', prog);
    obj.destruct();
    assert.ok(obj.flags & O_DESTRUCTED);
  });

  it('isDestructed returns correct value', () => {
    const prog = new Program('/test.c');
    const obj = new LpcObject('/test.c', prog);
    assert.equal(obj.isDestructed(), false);
    obj.destruct();
    assert.equal(obj.isDestructed(), true);
  });
});
