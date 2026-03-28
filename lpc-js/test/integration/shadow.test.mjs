import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { apply } from '../../src/runtime/apply.mjs';

describe('shadow mechanism', () => {
  function createDriver() {
    const files = {
      '/master.c': 'int valid_shadow(object ob) { return 1; }\nvoid create() { }',
      '/base.c': 'string get_name() { return "base"; }\nvoid create() { }',
      '/shadow_obj.c': 'string get_name() { return "shadowed"; }\nvoid create() { }',
    };
    return new Driver(
      { 'name': 'Test', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (p) => files[p] ?? files[p + '.c'] ?? files[p.replace(/\.c$/, '')] ?? null },
    );
  }

  it('shadow overrides function call', () => {
    const d = createDriver();
    d.objects.load('/master.c');
    const base = d.objects.load('/base.c');
    const shadow = d.objects.load('/shadow_obj.c');
    shadow.shadowTarget = base;
    base.shadowedBy = shadow;

    const result = apply('get_name', base, []);
    assert.equal(result.value, 'shadowed');
  });

  it('non-shadowed function calls normally', () => {
    const d = createDriver();
    d.objects.load('/master.c');
    const base = d.objects.load('/base.c');
    assert.equal(apply('get_name', base, []).value, 'base');
  });

  it('query_shadowing returns shadow object', () => {
    const d = createDriver();
    d.objects.load('/master.c');
    const base = d.objects.load('/base.c');
    const shadow = d.objects.load('/shadow_obj.c');
    shadow.shadowTarget = base;
    base.shadowedBy = shadow;

    assert.equal(d.efuns.call('query_shadowing', [{ type: 5, value: base }]).value, shadow);
  });
});
