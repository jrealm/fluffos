import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { apply } from '../../src/runtime/apply.mjs';
import { mkInt, mkString } from '../../src/vm/svalue.mjs';

describe('integration — boot a minimal mudlib', () => {
  function createDriver() {
    const files = {
      '/master.c': 'string mud_name() { return "TestMud"; }\nvoid create() { }',
      '/simul_efun.c': 'void create() { }',
      '/std/object.c': 'int value = 0;\nvoid create() { value = 1; }\nint get_value() { return value; }\nvoid set_value(int v) { value = v; }',
      '/std/room.c': 'inherit "/std/object";\nstring desc = "empty";\nvoid create() { ::create(); }\nstring get_desc() { return desc; }',
    };

    return new Driver(
      { 'name': 'TestMud', 'mudlib directory': '/', 'master file': '/master', 'simulated efun file': '/simul_efun' },
      { readFile: (path) => files[path] ?? files[path + '.c'] ?? files[path.replace(/\.c$/, '')] ?? null },
    );
  }

  it('loads master object', () => {
    const driver = createDriver();
    const master = driver.objects.load('/master.c');
    const result = apply('mud_name', master, []);
    assert.equal(result.value, 'TestMud');
  });

  it('loads object with create()', () => {
    const driver = createDriver();
    const obj = driver.objects.load('/std/object.c');
    assert.equal(apply('get_value', obj, []).value, 1);
  });

  it('clones an object with independent variables', () => {
    const driver = createDriver();
    const clone = driver.objects.clone('/std/object.c');
    assert.equal(apply('get_value', clone, []).value, 1);

    apply('set_value', clone, [mkInt(99)]);
    assert.equal(apply('get_value', clone, []).value, 99);

    const master = driver.objects.load('/std/object.c');
    assert.equal(apply('get_value', master, []).value, 1);
  });

  it('loads object with inheritance', () => {
    const driver = createDriver();
    const room = driver.objects.load('/std/room.c');
    assert.equal(apply('get_value', room, []).value, 1);
  });

  it('destruct removes object', () => {
    const driver = createDriver();
    const obj = driver.objects.load('/std/object.c');
    driver.objects.destruct(obj);
    assert.ok(obj.isDestructed());
  });

  it('efuns work inside LPC code', () => {
    const files = {
      '/test.c': 'string f() { return capitalize("hello") + " " + to_string(sizeof(({ 1, 2, 3 }))); }',
    };
    const driver = new Driver(
      { 'name': 'Test', 'mudlib directory': '/' },
      { readFile: (path) => files[path] ?? null },
    );
    const obj = driver.objects.load('/test.c');
    assert.equal(apply('f', obj, []).value, 'Hello 3');
  });
});
