import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CallOutManager } from '../../src/runtime/callout.mjs';

describe('CallOutManager — limits', () => {
  it('throws when call_out limit is reached', () => {
    const mgr = new CallOutManager();
    mgr.maxCallOuts = 3;

    const fakeObj = { isDestructed: () => false };
    mgr.add('func1', fakeObj, 10, []);
    mgr.add('func2', fakeObj, 10, []);
    mgr.add('func3', fakeObj, 10, []);

    assert.throws(() => {
      mgr.add('func4', fakeObj, 10, []);
    }, /too many call_outs/i);
  });

  it('tracks activeCount correctly', () => {
    const mgr = new CallOutManager();
    mgr.maxCallOuts = 10;

    const fakeObj = { isDestructed: () => false };
    const e1 = mgr.add('func1', fakeObj, 10, []);
    const e2 = mgr.add('func2', fakeObj, 10, []);
    assert.equal(mgr.activeCount, 2);

    mgr.remove(e1);
    assert.equal(mgr.activeCount, 1);

    // Double remove should not decrement again
    mgr.remove(e1);
    assert.equal(mgr.activeCount, 1);
  });

  it('decrements activeCount when entries fire', () => {
    const mgr = new CallOutManager();
    mgr.maxCallOuts = 10;
    let fired = 0;
    mgr.onFire = () => { fired++; };

    const fakeObj = { isDestructed: () => false };
    mgr.add('func1', fakeObj, 0, []);  // expires immediately
    mgr.add('func2', fakeObj, 0, []);
    assert.equal(mgr.activeCount, 2);

    mgr.tick();
    assert.equal(fired, 2);
    assert.equal(mgr.activeCount, 0);
  });

  it('allows adding after entries are removed', () => {
    const mgr = new CallOutManager();
    mgr.maxCallOuts = 2;

    const fakeObj = { isDestructed: () => false };
    const e1 = mgr.add('func1', fakeObj, 10, []);
    mgr.add('func2', fakeObj, 10, []);

    assert.throws(() => {
      mgr.add('func3', fakeObj, 10, []);
    });

    mgr.remove(e1);

    // Should now succeed
    mgr.add('func3', fakeObj, 10, []);
    assert.equal(mgr.activeCount, 2);
  });
});
