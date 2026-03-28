import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { CommandManager } from '../../src/runtime/commands.mjs';
import { Program } from '../../src/vm/program.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { registerMappingEfuns } from '../../src/runtime/efuns/mappings.mjs';
import { registerMiscEfuns } from '../../src/runtime/efuns/misc.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, mappingKey,
         T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

function mkMap(pairs) {
  const m = new Map();
  for (const [k, v] of pairs) { m.set(mappingKey(k), { key: k, value: v }); }
  return mkMapping(m);
}

describe('Phase 8: match_path', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    registerMappingEfuns(reg);
  });

  it('matches longest prefix path', () => {
    const mapping = mkMap([
      [mkString('/obj'), mkInt(1)],
      [mkString('/obj/monster'), mkInt(2)],
    ]);
    const result = reg.call('match_path', [mapping, mkString('/obj/monster/goblin')]);
    assert.equal(result.value, 2);
  });

  it('matches shorter prefix if no longer match', () => {
    const mapping = mkMap([
      [mkString('/obj'), mkInt(1)],
      [mkString('/obj/monster'), mkInt(2)],
    ]);
    const result = reg.call('match_path', [mapping, mkString('/obj/weapon/sword')]);
    assert.equal(result.value, 1);
  });

  it('returns 0 if no prefix matches', () => {
    const mapping = mkMap([
      [mkString('/obj'), mkInt(1)],
    ]);
    const result = reg.call('match_path', [mapping, mkString('/room/start')]);
    assert.equal(result.value, 0);
  });

  it('exact path match', () => {
    const mapping = mkMap([
      [mkString('/obj/foo'), mkInt(42)],
    ]);
    const result = reg.call('match_path', [mapping, mkString('/obj/foo')]);
    assert.equal(result.value, 42);
  });

  it('does not match partial directory names', () => {
    const mapping = mkMap([
      [mkString('/obj'), mkInt(1)],
    ]);
    // /objects starts with /obj but is NOT a child of /obj
    const result = reg.call('match_path', [mapping, mkString('/objects/foo')]);
    assert.equal(result.value, 0);
  });
});

describe('Phase 8: bind', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    registerMiscEfuns(reg);
  });

  it('creates a new function pointer with boundObj', () => {
    const prog = new Program('test.c');
    const fp = mkFunction({ kind: 'named', name: 'foo', partialArgs: [], program: prog });
    const obj = { filename: 'target.c', program: prog };

    const result = reg.call('bind', [fp, { type: T_OBJECT, value: obj }]);
    assert.equal(result.type, T_FUNCTION);
    assert.equal(result.value.boundObj, obj);
    assert.equal(result.value.name, 'foo');
  });

  it('preserves original function pointer properties', () => {
    const prog = new Program('test.c');
    const fp = mkFunction({ kind: 'named', name: 'bar', partialArgs: [mkInt(1)], program: prog });
    const obj = { filename: 'target.c' };

    const result = reg.call('bind', [fp, { type: T_OBJECT, value: obj }]);
    assert.equal(result.value.name, 'bar');
    assert.equal(result.value.partialArgs.length, 1);
    assert.equal(result.value.kind, 'named');
  });

  it('returns 0 for non-function first arg', () => {
    const obj = { filename: 'target.c' };
    const result = reg.call('bind', [mkInt(42), { type: T_OBJECT, value: obj }]);
    assert.equal(result.value, 0);
  });
});

describe('Phase 8: CommandManager.removeAction', () => {
  let cm;
  beforeEach(() => { cm = new CommandManager(); });

  it('removes a specific action by verb', () => {
    const obj = {};
    cm.addAction(obj, 'do_say', 'say', 0);
    cm.addAction(obj, 'do_look', 'look', 0);
    assert.equal(cm.getActions(obj).length, 2);

    cm.removeAction(obj, 'say');
    assert.equal(cm.getActions(obj).length, 1);
    assert.equal(cm.getActions(obj)[0].verb, 'look');
  });

  it('does nothing for non-existent verb', () => {
    const obj = {};
    cm.addAction(obj, 'do_say', 'say', 0);
    cm.removeAction(obj, 'nonexistent');
    assert.equal(cm.getActions(obj).length, 1);
  });

  it('does nothing for object with no actions', () => {
    const obj = {};
    cm.removeAction(obj, 'say');
    assert.equal(cm.getActions(obj).length, 0);
  });
});

describe('Phase 8: deep/shallow inherit list logic', () => {
  it('shallow_inherit_list returns direct inherits only', () => {
    const grandparentProg = new Program('/std/base.c');
    const parentProg = new Program('/std/object.c');
    parentProg.inherits = [{ program: grandparentProg, varOffset: 0 }];
    const childProg = new Program('/obj/monster.c');
    childProg.inherits = [{ program: parentProg, varOffset: 0 }];

    const shallowResult = childProg.inherits.map(inh => inh.program.filename);
    assert.deepEqual(shallowResult, ['/std/object.c']);
  });

  it('deep_inherit_list collects all ancestors', () => {
    const grandparentProg = new Program('/std/base.c');
    const parentProg = new Program('/std/object.c');
    parentProg.inherits = [{ program: grandparentProg, varOffset: 0 }];
    const childProg = new Program('/obj/monster.c');
    childProg.inherits = [{ program: parentProg, varOffset: 0 }];

    const result = [];
    function collect(program) {
      for (const inh of program.inherits) {
        result.push(inh.program.filename);
        collect(inh.program);
      }
    }
    collect(childProg);

    assert.deepEqual(result, ['/std/object.c', '/std/base.c']);
  });

  it('handles multiple inheritance', () => {
    const base1 = new Program('/std/base1.c');
    const base2 = new Program('/std/base2.c');
    const childProg = new Program('/obj/test.c');
    childProg.inherits = [
      { program: base1, varOffset: 0 },
      { program: base2, varOffset: 0 },
    ];

    const result = [];
    function collect(program) {
      for (const inh of program.inherits) {
        result.push(inh.program.filename);
        collect(inh.program);
      }
    }
    collect(childProg);

    assert.deepEqual(result, ['/std/base1.c', '/std/base2.c']);
  });
});

describe('Phase 8: eval cost control', () => {
  it('Machine has evalCost and maxEvalCost properties', () => {
    const vm = new Machine();
    assert.equal(vm.evalCost, 0);
    assert.equal(vm.maxEvalCost, 1_000_000);
  });

  it('evalCost can be reset', () => {
    const vm = new Machine();
    vm.evalCost = 500;
    assert.equal(vm.evalCost, 500);
    vm.evalCost = 0;
    assert.equal(vm.evalCost, 0);
  });

  it('maxEvalCost can be set to Infinity for unlimited', () => {
    const vm = new Machine();
    vm.maxEvalCost = Infinity;
    assert.equal(vm.maxEvalCost, Infinity);
  });

  it('maxEvalCost can be restored to a number', () => {
    const vm = new Machine();
    vm.maxEvalCost = Infinity;
    vm.maxEvalCost = 500_000;
    assert.equal(vm.maxEvalCost, 500_000);
  });
});
