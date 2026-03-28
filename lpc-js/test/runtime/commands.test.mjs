import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandManager, FLAG_EXACT, FLAG_PREFIX } from '../../src/runtime/commands.mjs';
import { Program } from '../../src/vm/program.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';

describe('CommandManager', () => {
  function makeObj(filename) {
    return new LpcObject(filename, new Program(filename));
  }

  it('registers and finds an action', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    assert.equal(mgr.getActions(obj).length, 1);
    assert.equal(mgr.getActions(obj)[0].verb, 'slash');
  });

  it('exact match', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    assert.ok(mgr.matchVerb('slash', mgr.getActions(obj)[0]));
    assert.ok(!mgr.matchVerb('slas', mgr.getActions(obj)[0]));
    assert.ok(!mgr.matchVerb('slasher', mgr.getActions(obj)[0]));
  });

  it('prefix match', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'sla', FLAG_PREFIX);
    assert.ok(mgr.matchVerb('slash', mgr.getActions(obj)[0]));
    assert.ok(mgr.matchVerb('sla', mgr.getActions(obj)[0]));
    assert.ok(!mgr.matchVerb('sl', mgr.getActions(obj)[0]));
  });

  it('getSearchList returns player + env + env.inventory', () => {
    const mgr = new CommandManager();
    const room = makeObj('/room.c');
    const player = makeObj('/player.c');
    const npc = makeObj('/npc.c');
    player.moveTo(room);
    npc.moveTo(room);
    const list = mgr.getSearchList(player);
    assert.ok(list.includes(player));
    assert.ok(list.includes(room));
    assert.ok(list.includes(npc));
  });

  it('removeActions clears actions for an object', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    mgr.removeActions(obj);
    assert.equal(mgr.getActions(obj).length, 0);
  });

  it('dispatch calls matching action', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    const dispatched = [];
    mgr.dispatch('slash the dragon', (func, actionObj, arg) => {
      dispatched.push({ func, obj: actionObj, arg });
      return true;
    }, [obj]);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].func, 'do_slash');
    assert.equal(dispatched[0].arg, 'the dragon');
  });

  it('dispatch returns false when no match', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    assert.equal(mgr.dispatch('look around', () => true, [obj]), false);
  });
});
