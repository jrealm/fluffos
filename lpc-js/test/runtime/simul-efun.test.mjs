import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_INT } from '../../src/vm/svalue.mjs';

function makeDriverWithSimulEfun(extraFiles = {}) {
  const files = {
    '/master.c': `
      void create() {}
      string get_simul_efun() { return "/obj/simul_efun"; }
    `,
    '/obj/simul_efun.c': `
      void create() {}
      int double_it(int x) { return x * 2; }
      string greet(string name) { return "Hello, " + name + "!"; }
    `,
    ...extraFiles,
  };
  const driver = new Driver(
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
  driver.master = driver.objects.load('/master');
  return driver;
}

describe('Simul_efun', () => {
  it('loads simul_efun object on boot', () => {
    const driver = makeDriverWithSimulEfun();
    driver.loadSimulEfun();

    assert.ok(driver.simulEfunObject, 'simul_efun object should be loaded');
    assert.ok(driver.simulEfunNames.has('double_it'));
    assert.ok(driver.simulEfunNames.has('greet'));
    assert.ok(!driver.simulEfunNames.has('create'), 'create should not be a simul_efun');
  });

  it('calls simul_efun via callSimulEfun', () => {
    const driver = makeDriverWithSimulEfun();
    driver.loadSimulEfun();

    const result = driver.callSimulEfun('double_it', [{ type: T_INT, value: 21 }]);
    assert.equal(result.value, 42);
  });

  it('auto-reloads simul_efun after destruct', () => {
    const driver = makeDriverWithSimulEfun();
    driver.loadSimulEfun();

    driver.simulEfunObject.destruct();
    assert.ok(driver.simulEfunObject.isDestructed());

    const result = driver.callSimulEfun('double_it', [{ type: T_INT, value: 5 }]);
    assert.equal(result.value, 10);
    assert.ok(!driver.simulEfunObject.isDestructed());
  });

  it('throws for unknown simul_efun function', () => {
    const driver = makeDriverWithSimulEfun();
    driver.loadSimulEfun();

    assert.throws(() => {
      driver.callSimulEfun('nonexistent', []);
    }, /unknown function/i);
  });

  it('falls through from efunHandler to simul_efun', () => {
    const driver = makeDriverWithSimulEfun();
    driver.loadSimulEfun();

    // The efunHandler should try built-in efuns first, then simul_efun
    const result = driver.vm.efunHandler('double_it', [{ type: T_INT, value: 3 }]);
    assert.equal(result.value, 6);
  });
});
