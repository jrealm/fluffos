import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerObjectEfuns } from '../../src/runtime/efuns/objects.mjs';
import { mkInt, mkString, SVALUE_ZERO, T_OBJECT, T_STRING } from '../../src/vm/svalue.mjs';

function makeObj(name) {
  return {
    objectId: name, filename: name + '.c',
    livingName: null, interactive: null,
    environment: null, inventory: new Set(),
    isDestructed: () => false,
    program: {
      filename: name + '.c',
      functions: [
        { name: 'create', numArgs: 0, numLocals: 0, offset: 0, flags: 0 },
        { name: 'test_func', numArgs: 1, numLocals: 0, offset: 10, flags: 0 },
      ],
      variables: [],
      inherits: [],
    },
  };
}

describe('query efuns', () => {
  let reg, player, npc, room;

  beforeEach(() => {
    player = makeObj('player');
    npc = makeObj('npc');
    room = makeObj('room');
    room.inventory = new Set([player, npc]);
    player.environment = room;
    npc.environment = room;

    reg = new EfunRegistry();
    reg.loadDefaults();
    registerObjectEfuns(reg);
  });

  describe('function_exists', () => {
    it('finds function', () => {
      const result = reg.call('function_exists', [mkString('test_func'), { type: T_OBJECT, value: player }]);
      assert.equal(result.type, T_STRING);
      assert.ok(result.value.includes('player'));
    });

    it('returns 0 for missing function', () => {
      const result = reg.call('function_exists', [mkString('nonexistent'), { type: T_OBJECT, value: player }]);
      assert.equal(result.value, 0);
    });
  });

  describe('first_inventory / next_inventory', () => {
    it('first_inventory returns first item', () => {
      const result = reg.call('first_inventory', [{ type: T_OBJECT, value: room }]);
      assert.equal(result.type, T_OBJECT);
    });

    it('first_inventory of empty returns 0', () => {
      const empty = makeObj('empty');
      assert.equal(reg.call('first_inventory', [{ type: T_OBJECT, value: empty }]).value, 0);
    });

    it('next_inventory returns sibling', () => {
      const first = reg.call('first_inventory', [{ type: T_OBJECT, value: room }]);
      const next = reg.call('next_inventory', [first]);
      assert.equal(next.type, T_OBJECT);
      assert.notEqual(first.value, next.value);
    });

    it('next_inventory of last returns 0', () => {
      const first = reg.call('first_inventory', [{ type: T_OBJECT, value: room }]);
      const second = reg.call('next_inventory', [first]);
      const third = reg.call('next_inventory', [second]);
      assert.equal(third.value, 0);
    });
  });
});
