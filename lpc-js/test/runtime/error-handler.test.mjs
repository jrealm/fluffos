import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_MAPPING, T_INT, T_STRING } from '../../src/vm/svalue.mjs';

function makeDriver(masterSource, mudlibFiles = {}) {
  const files = {
    '/master.c': masterSource,
    ...mudlibFiles,
  };
  return new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': '/test',
      'master file': '/master',
    },
    {
      readFile: (path) => {
        const key = path.endsWith('.c') ? path : path + '.c';
        if (files[key]) return files[key];
        throw new Error(`File not found: ${key}`);
      },
    }
  );
}

describe('Driver — callErrorHandler', () => {
  it('calls master->error_handler without crashing', () => {
    const driver = makeDriver(`
      void create() {}
      void error_handler(mapping err, int caught) {}
    `);
    driver.master = driver.objects.load('/master');

    const tb = {
      message: 'Test error',
      frames: [{ function: 'test_func', file: 'test.c', line: 1, object: '/obj/test' }],
    };
    driver.callErrorHandler(tb, 0);
    assert.ok(true, 'callErrorHandler did not throw');
  });

  it('does not crash when master has no error_handler', () => {
    const driver = makeDriver(`void create() {}`);
    driver.master = driver.objects.load('/master');

    const tb = { message: 'err', frames: [] };
    driver.callErrorHandler(tb, 0);
    assert.ok(true, 'should not throw');
  });

  it('does not crash when master is null', () => {
    const driver = makeDriver(`void create() {}`);
    driver.master = null;

    driver.callErrorHandler({ message: 'err', frames: [] }, 0);
    assert.ok(true);
  });
});

describe('Driver — heart_beat error handling', () => {
  it('catches heart_beat errors and increments error count', () => {
    const driver = makeDriver(`void create() {}`, {
      '/obj/monster.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() { throw("boom"); }
      `,
    });
    driver.master = driver.objects.load('/master');
    const monster = driver.objects.load('/obj/monster');

    driver.heartBeatTick();
    assert.equal(monster.heartBeatErrors, 1);
    assert.ok(driver.heartBeatList.has(monster));
  });

  it('removes object from heartBeatList after max errors', () => {
    const driver = makeDriver(`void create() {}`, {
      '/obj/monster.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() { throw("boom"); }
      `,
    });
    driver.master = driver.objects.load('/master');
    driver.config['max heart beat errors'] = '3';
    const monster = driver.objects.load('/obj/monster');

    driver.heartBeatTick();
    driver.heartBeatTick();
    driver.heartBeatTick();

    assert.equal(monster.heartBeatErrors, 3);
    assert.ok(!driver.heartBeatList.has(monster), 'should be removed after 3 errors');
  });

  it('resets error count on successful heart_beat', () => {
    const driver = makeDriver(`void create() {}`, {
      '/obj/npc.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() {}
      `,
    });
    driver.master = driver.objects.load('/master');
    const npc = driver.objects.load('/obj/npc');

    // Manually set error count
    npc.heartBeatErrors = 5;

    driver.heartBeatTick();
    assert.equal(npc.heartBeatErrors, 0, 'should reset on success');
  });

  it('skips destructed objects', () => {
    const driver = makeDriver(`void create() {}`, {
      '/obj/thing.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() {}
      `,
    });
    driver.master = driver.objects.load('/master');
    const thing = driver.objects.load('/obj/thing');
    thing.destruct();

    driver.heartBeatTick();
    assert.ok(!driver.heartBeatList.has(thing), 'destructed object should be removed');
  });
});
