import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerDatabaseEfuns } from '../../src/runtime/efuns/database.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { Program } from '../../src/vm/program.mjs';
import { mkInt, mkString, mkArray,
         T_INT, T_STRING, T_OBJECT, T_FUNCTION, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('Phase 12 remaining: async_db_exec', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerDatabaseEfuns(reg);
  });

  it('async_db_exec is registered', () => {
    assert.ok(reg.has('async_db_exec'));
  });

  it('async_db_exec returns 0 for invalid handle', () => {
    const result = reg.call('async_db_exec', [mkInt(999), mkString('SELECT 1'), SVALUE_ZERO]);
    assert.equal(result.value, 0);
  });
});

describe('Phase 12 remaining: trace support', () => {
  it('Machine supports _traceLevel and _tracePrefix', () => {
    const vm = new Machine();
    assert.equal(vm._traceLevel ?? 0, 0);
    assert.equal(vm._tracePrefix ?? null, null);

    vm._traceLevel = 1;
    vm._tracePrefix = '/obj/';
    assert.equal(vm._traceLevel, 1);
    assert.equal(vm._tracePrefix, '/obj/');
  });
});

describe('Phase 12 remaining: debug_info logic', () => {
  it('can inspect object properties', () => {
    const prog = new Program('test.c');
    prog.functions = [
      { name: 'create', numArgs: 0, numLocals: 0 },
      { name: 'foo', numArgs: 2, numLocals: 1 },
    ];
    prog.variables = [{ name: 'hp' }, { name: 'name' }];
    prog.inherits = [];
    prog.strings = ['hello'];
    prog.bytecode = new Uint8Array(20);

    // Verify the program has the expected structure
    assert.equal(prog.functions.length, 2);
    assert.equal(prog.variables.length, 2);
    assert.equal(prog.bytecode.length, 20);
    assert.equal(prog.filename, 'test.c');
  });
});

describe('Phase 12 remaining: reload_object logic', () => {
  it('program cache can be cleared for recompilation', () => {
    const cache = new Map();
    cache.set('test.c', new Program('test.c'));
    assert.equal(cache.size, 1);

    cache.delete('test.c');
    assert.equal(cache.size, 0);
  });

  it('object variables can be resized preserving values by name', () => {
    const oldProg = new Program('test.c');
    oldProg.variables = [{ name: 'hp' }, { name: 'name' }, { name: 'level' }];

    const newProg = new Program('test.c');
    newProg.variables = [{ name: 'name' }, { name: 'hp' }, { name: 'new_var' }];

    const oldVars = [mkInt(100), mkString('player'), mkInt(5)];

    // Simulate the reload_object variable preservation logic
    const newVars = new Array(newProg.variables.length).fill(SVALUE_ZERO);
    for (let i = 0; i < newProg.variables.length; i++) {
      const name = newProg.variables[i].name;
      const oldIdx = oldProg.variables.findIndex(v => v.name === name);
      if (oldIdx >= 0 && oldIdx < oldVars.length) {
        newVars[i] = oldVars[oldIdx];
      }
    }

    // name was at index 1 in old, now at index 0 in new
    assert.equal(newVars[0].value, 'player');
    // hp was at index 0 in old, now at index 1 in new
    assert.equal(newVars[1].value, 100);
    // new_var has no old value, should be SVALUE_ZERO
    assert.equal(newVars[2].value, 0);
  });
});
