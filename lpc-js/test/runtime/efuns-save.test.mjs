import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { serializeObject, deserializeObject } from '../../src/runtime/efuns/save.mjs';
import { mkInt, mkString } from '../../src/vm/svalue.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';

describe('save_object / restore_object', () => {
  it('serializes int variable', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkInt(42);
    assert.ok(serializeObject(obj).includes('x 42'));
  });

  it('serializes string variable', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'name', type: 'string' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkString('hello world');
    assert.ok(serializeObject(obj).includes('name "hello world"'));
  });

  it('round-trips int', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'x', type: 'int' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkInt(99);
    const text = serializeObject(obj);
    const obj2 = new LpcObject('/test.c', prog);
    deserializeObject(obj2, text);
    assert.equal(obj2.variables[0].value, 99);
  });

  it('round-trips string', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'name', type: 'string' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkString('test value');
    const text = serializeObject(obj);
    const obj2 = new LpcObject('/test.c', prog);
    deserializeObject(obj2, text);
    assert.equal(obj2.variables[0].value, 'test value');
  });

  it('round-trips multiple variables', () => {
    const prog = new Program('/test.c');
    prog.variables.push({ name: 'a', type: 'int' });
    prog.variables.push({ name: 'b', type: 'string' });
    const obj = new LpcObject('/test.c', prog);
    obj.variables[0] = mkInt(7);
    obj.variables[1] = mkString('hi');
    const text = serializeObject(obj);
    const obj2 = new LpcObject('/test.c', prog);
    deserializeObject(obj2, text);
    assert.equal(obj2.variables[0].value, 7);
    assert.equal(obj2.variables[1].value, 'hi');
  });
});
