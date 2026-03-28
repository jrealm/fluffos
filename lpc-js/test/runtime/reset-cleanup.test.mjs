import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_INT } from '../../src/vm/svalue.mjs';
import { apply } from '../../src/runtime/apply.mjs';

function makeDriver(config, files) {
  return new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': '/test',
      'master file': '/master',
      ...config,
    },
    {
      readFile: (p) => {
        const key = p.endsWith('.c') ? p : p + '.c';
        if (files[key]) return files[key];
        throw new Error(`Not found: ${key}`);
      },
    }
  );
}

describe('Reset scheduling', () => {
  it('calls reset() on objects after reset interval', () => {
    const driver = makeDriver({ 'time to reset': '1' }, {
      '/master.c': `void create() {}`,
      '/obj/room.c': `
        int reset_count;
        void create() { reset_count = 0; }
        void reset() { reset_count = reset_count + 1; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const room = driver.objects.load('/obj/room');

    // Simulate: object was recently accessed and reset is due
    room.lastAccess = Date.now();
    room.nextReset = Date.now() - 1000;

    driver.resetTick();

    const resetCount = room.variables[0];
    assert.equal(resetCount.value, 1, 'reset should have been called once');
  });

  it('skips objects not recently accessed', () => {
    const driver = makeDriver({ 'time to reset': '100' }, {
      '/master.c': `void create() {}`,
      '/obj/room.c': `
        int reset_count;
        void create() { reset_count = 0; }
        void reset() { reset_count = reset_count + 1; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const room = driver.objects.load('/obj/room');

    // Object was accessed long ago
    room.lastAccess = 0;
    room.nextReset = Date.now() - 1000;

    driver.resetTick();

    const resetCount = room.variables[0];
    assert.equal(resetCount.value, 0, 'reset should NOT have been called');
  });

  it('skips objects whose nextReset is in the future', () => {
    const driver = makeDriver({ 'time to reset': '1' }, {
      '/master.c': `void create() {}`,
      '/obj/room.c': `
        int reset_count;
        void create() { reset_count = 0; }
        void reset() { reset_count = reset_count + 1; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const room = driver.objects.load('/obj/room');

    room.lastAccess = Date.now();
    room.nextReset = Date.now() + 999999; // Far in the future

    driver.resetTick();

    const resetCount = room.variables[0];
    assert.equal(resetCount.value, 0);
  });

  it('reschedules nextReset after firing', () => {
    const driver = makeDriver({ 'time to reset': '10' }, {
      '/master.c': `void create() {}`,
      '/obj/room.c': `
        int reset_count;
        void create() { reset_count = 0; }
        void reset() { reset_count = reset_count + 1; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const room = driver.objects.load('/obj/room');

    room.lastAccess = Date.now();
    room.nextReset = Date.now() - 1;

    driver.resetTick();

    // nextReset should be rescheduled to the future
    assert.ok(room.nextReset > Date.now(), 'nextReset should be in the future');
  });
});

describe('Clean_up scheduling', () => {
  it('calls clean_up on idle non-interactive objects', () => {
    const driver = makeDriver({ 'time to clean up': '1' }, {
      '/master.c': `void create() {}`,
      '/obj/item.c': `
        int cleaned;
        void create() { cleaned = 0; }
        int clean_up() { cleaned = 1; return 1; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const item = driver.objects.load('/obj/item');

    // Make object idle
    item.lastAccess = 0;

    driver.cleanUpTick();

    const cleaned = item.variables[0];
    assert.equal(cleaned.value, 1, 'clean_up should have been called');
  });

  it('skips interactive objects', () => {
    const driver = makeDriver({ 'time to clean up': '1' }, {
      '/master.c': `void create() {}`,
      '/obj/player.c': `
        int cleaned;
        void create() { cleaned = 0; }
        int clean_up() { cleaned = 1; return 1; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const player = driver.objects.load('/obj/player');
    player.interactive = {}; // Mark as interactive
    player.lastAccess = 0;

    driver.cleanUpTick();

    const cleaned = player.variables[0];
    assert.equal(cleaned.value, 0, 'clean_up should NOT be called on interactive objects');
  });

  it('delays next check when clean_up returns 0', () => {
    const driver = makeDriver({ 'time to clean up': '1' }, {
      '/master.c': `void create() {}`,
      '/obj/keeper.c': `
        int cleaned;
        void create() { cleaned = 0; }
        int clean_up() { return 0; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const keeper = driver.objects.load('/obj/keeper');
    keeper.lastAccess = 0;

    const before = Date.now();
    driver.cleanUpTick();

    // lastAccess should be updated to now (delaying next check)
    assert.ok(keeper.lastAccess >= before, 'lastAccess should be updated');
  });

  it('skips objects with heartbeat', () => {
    const driver = makeDriver({ 'time to clean up': '1' }, {
      '/master.c': `void create() {}`,
      '/obj/npc.c': `
        int cleaned;
        void create() { cleaned = 0; set_heart_beat(1); }
        int clean_up() { cleaned = 1; return 1; }
      `,
    });
    driver.master = driver.objects.load('/master');
    const npc = driver.objects.load('/obj/npc');
    npc.lastAccess = 0;

    driver.cleanUpTick();

    const cleaned = npc.variables[0];
    assert.equal(cleaned.value, 0, 'clean_up should NOT be called on heart_beat objects');
  });
});
