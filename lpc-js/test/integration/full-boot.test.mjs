import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_INT, T_OBJECT } from '../../src/vm/svalue.mjs';
import { apply } from '../../src/runtime/apply.mjs';

describe('Integration — full boot sequence', () => {
  it('boots with master, simul_efun, epilog, preload', () => {
    const files = {
      '/master.c': `
        void create() {}
        string get_simul_efun() { return "/obj/simul_efun"; }
        string *epilog() { return ({ "/obj/daemon" }); }
        void preload(string path) { load_object(path); }
        void error_handler(mapping err, int caught) {}
        mixed valid_read(string path, object ob, string func) { return 1; }
        mixed valid_write(string path, object ob, string func) { return 1; }
      `,
      '/obj/simul_efun.c': `
        void create() {}
        int is_wizard(object ob) { return 1; }
      `,
      '/obj/daemon.c': `
        int booted;
        void create() { booted = 1; }
      `,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'time to reset': '1800',
        'time to clean up': '900',
        'max call outs': '1000',
      },
      {
        readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        },
      }
    );

    driver.boot();

    // Verify master loaded
    assert.ok(driver.master);
    assert.ok(!driver.master.isDestructed());

    // Verify simul_efun loaded
    assert.ok(driver.simulEfunObject);
    assert.ok(driver.simulEfunNames.has('is_wizard'));

    // Verify daemon was loaded
    const daemon = driver.objects.find('/obj/daemon.c') || driver.objects.find('/obj/daemon');
    assert.ok(daemon, 'daemon should be loaded via preload');
  });

  it('heart_beat errors trigger error_handler and removal', () => {
    const files = {
      '/master.c': `
        int error_count;
        void create() { error_count = 0; }
        void error_handler(mapping err, int caught) {
          error_count = error_count + 1;
        }
      `,
      '/obj/buggy.c': `
        void create() { set_heart_beat(1); }
        void heart_beat() { throw("crash!"); }
      `,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'max heart beat errors': '2',
      },
      {
        readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        },
      }
    );
    driver.master = driver.objects.load('/master');
    const buggy = driver.objects.load('/obj/buggy');

    driver.heartBeatTick();
    driver.heartBeatTick();

    assert.ok(!driver.heartBeatList.has(buggy));
    assert.equal(buggy.heartBeatErrors, 2);
  });

  it('mainLoop runs all ticks without error', () => {
    const files = {
      '/master.c': `
        void create() {}
        void error_handler(mapping err, int caught) {}
      `,
      '/obj/room.c': `
        void create() {}
        void reset() {}
        int clean_up() { return 0; }
      `,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'time to reset': '1',
        'time to clean up': '1',
      },
      {
        readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        },
      }
    );
    driver.master = driver.objects.load('/master');
    driver.objects.load('/obj/room');

    // Should not throw
    driver.mainLoop();
    driver.mainLoop();
    assert.ok(true);
  });

  it('call_out limit works within driver context', () => {
    const files = {
      '/master.c': `void create() {}`,
    };

    const driver = new Driver(
      {
        'name': 'TestMUD',
        'mudlib directory': '/test',
        'master file': '/master',
        'max call outs': '3',
      },
      {
        readFile: (p) => {
          const key = p.endsWith('.c') ? p : p + '.c';
          if (files[key]) return files[key];
          throw new Error(`Not found: ${key}`);
        },
      }
    );
    driver.master = driver.objects.load('/master');

    assert.equal(driver.callOuts.maxCallOuts, 3);
  });
});
