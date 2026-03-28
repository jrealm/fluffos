import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { T_CLASS } from '../../src/vm/svalue.mjs';

function run(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName);
}

describe('class instantiation', () => {
  it('new(class X) creates class instance', () => {
    const result = run(`
      class point { int x; int y; }
      mixed f() { return new(class point); }
    `);
    assert.equal(result.type, T_CLASS);
    assert.ok(result.value instanceof Map);
  });

  it('set and get class members', () => {
    const result = run(`
      class point { int x; int y; }
      int f() {
        class point p = new(class point);
        p->x = 10;
        p->y = 20;
        return p->x + p->y;
      }
    `);
    assert.equal(result.value, 30);
  });

  it('class members default to 0', () => {
    const result = run(`
      class point { int x; int y; }
      int f() {
        class point p = new(class point);
        return p->x;
      }
    `);
    assert.equal(result.value, 0);
  });

  it('class as function return value', () => {
    const result = run(`
      class point { int x; int y; }
      class point make(int a, int b) {
        class point p = new(class point);
        p->x = a;
        p->y = b;
        return p;
      }
      int f() {
        class point p = make(3, 4);
        return p->x * p->x + p->y * p->y;
      }
    `);
    assert.equal(result.value, 25);
  });
});
