import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

function makeDriverForBoot(files) {
  return new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': '/test',
      'master file': '/master',
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

describe('Boot sequence — epilog/preload', () => {
  it('boots with master and calls epilog', () => {
    const driver = makeDriverForBoot({
      '/master.c': `
        int epilog_called;
        void create() { epilog_called = 0; }
        string *epilog() {
          epilog_called = 1;
          return ({ "/obj/daemon" });
        }
        void preload(string path) {
          load_object(path);
        }
      `,
      '/obj/daemon.c': `
        int booted;
        void create() { booted = 1; }
      `,
    });

    driver.boot();

    assert.ok(driver.master, 'master should be loaded');
    assert.ok(!driver.master.isDestructed());
  });

  it('boots with simul_efun', () => {
    const driver = makeDriverForBoot({
      '/master.c': `
        void create() {}
        string get_simul_efun() { return "/obj/simul"; }
        string *epilog() { return ({}); }
      `,
      '/obj/simul.c': `
        void create() {}
        int helper() { return 42; }
      `,
    });

    driver.boot();

    assert.ok(driver.simulEfunObject);
    assert.ok(driver.simulEfunNames.has('helper'));
  });

  it('continues preload when one object fails', () => {
    let preloadCount = 0;
    const driver = makeDriverForBoot({
      '/master.c': `
        int preload_count;
        void create() { preload_count = 0; }
        string *epilog() {
          return ({ "/obj/bad", "/obj/good" });
        }
        void preload(string path) {
          preload_count = preload_count + 1;
          load_object(path);
        }
      `,
      // /obj/bad.c intentionally missing — will fail
      '/obj/good.c': `void create() {}`,
    });

    // Should not throw even though /obj/bad doesn't exist
    driver.boot();
    assert.ok(driver.master);
  });

  it('handles master with no epilog', () => {
    const driver = makeDriverForBoot({
      '/master.c': `void create() {}`,
    });

    driver.boot();
    assert.ok(driver.master);
  });

  it('handles epilog returning empty array', () => {
    const driver = makeDriverForBoot({
      '/master.c': `
        void create() {}
        string *epilog() { return ({}); }
      `,
    });

    driver.boot();
    assert.ok(driver.master);
  });
});
