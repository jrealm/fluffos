import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CallOutManager } from '../../src/runtime/callout.mjs';

describe('CallOutManager', () => {
  it('adds a call_out entry', () => {
    const mgr = new CallOutManager();
    const entry = mgr.add('test_func', { id: 'obj1' }, 0, ['arg1']);
    assert.equal(entry.cancelled, false);
    assert.equal(entry.func, 'test_func');
  });

  it('tick fires expired entries', () => {
    const mgr = new CallOutManager();
    const fired = [];
    mgr.onFire = (func, obj, args) => fired.push({ func, obj, args });
    mgr.add('func_a', { id: 'obj1' }, 0, []);
    mgr.add('func_b', { id: 'obj2' }, 0, []);
    mgr.tick();
    assert.equal(fired.length, 2);
    assert.equal(fired[0].func, 'func_a');
    assert.equal(fired[1].func, 'func_b');
  });

  it('does not fire future entries', () => {
    const mgr = new CallOutManager();
    const fired = [];
    mgr.onFire = (func) => fired.push(func);
    mgr.add('now', {}, 0, []);
    mgr.add('later', {}, 10, []);
    mgr.tick();
    assert.equal(fired.length, 1);
    assert.equal(fired[0], 'now');
  });

  it('remove cancels an entry', () => {
    const mgr = new CallOutManager();
    const fired = [];
    mgr.onFire = (func) => fired.push(func);
    const entry = mgr.add('func', {}, 0, []);
    mgr.remove(entry);
    mgr.tick();
    assert.equal(fired.length, 0);
  });

  it('findCallOut finds by object and func', () => {
    const mgr = new CallOutManager();
    const obj = { id: 'test' };
    mgr.add('func_a', obj, 5, []);
    mgr.add('func_b', obj, 10, []);
    assert.ok(mgr.findCallOut(obj, 'func_b'));
    assert.equal(mgr.findCallOut(obj, 'func_c'), null);
  });
});
