import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Program } from '../../src/vm/program.mjs';

describe('Program', () => {
  it('constructs with filename and empty defaults', () => {
    const prog = new Program('test.c');
    assert.equal(prog.filename, 'test.c');
    assert.ok(prog.bytecode instanceof Uint8Array);
    assert.equal(prog.bytecode.length, 0);
    assert.deepEqual(prog.functions, []);
    assert.deepEqual(prog.strings, []);
    assert.deepEqual(prog.variables, []);
    assert.deepEqual(prog.inherits, []);
    assert.deepEqual(prog.classes, []);
  });

  it('findFunction returns function entry by name', () => {
    const prog = new Program('test.c');
    prog.functions.push({ name: 'add', numArgs: 2, numLocals: 0, offset: 0, flags: 0, type: 0 });
    prog.functions.push({ name: 'main', numArgs: 0, numLocals: 1, offset: 10, flags: 0, type: 0 });
    const f = prog.findFunction('main');
    assert.equal(f.name, 'main');
    assert.equal(f.offset, 10);
  });

  it('findFunction returns null for unknown function', () => {
    const prog = new Program('test.c');
    assert.equal(prog.findFunction('nope'), null);
  });
});
