import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../src/vm/machine.mjs';
import { compile } from '../../src/compiler/codegen.mjs';
import { T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING } from '../../src/vm/svalue.mjs';

function run(source, funcName = 'f', args = []) {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName, args);
}

describe('VM — basic operations', () => {
  it('returns integer literal', () => {
    const result = run('int f() { return 42; }');
    assert.equal(result.type, T_INT);
    assert.equal(result.value, 42);
  });

  it('returns 0', () => {
    assert.equal(run('int f() { return 0; }').value, 0);
  });

  it('returns 1', () => {
    assert.equal(run('int f() { return 1; }').value, 1);
  });

  it('returns string literal', () => {
    const result = run('string f() { return "hello"; }');
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'hello');
  });

  it('returns float literal', () => {
    const result = run('float f() { return 3.14; }');
    assert.equal(result.type, T_FLOAT);
    assert.ok(Math.abs(result.value - 3.14) < 0.001);
  });

  it('void function returns 0', () => {
    const result = run('void f() { }');
    assert.equal(result.type, T_INT);
    assert.equal(result.value, 0);
  });
});

describe('VM — arithmetic', () => {
  it('adds two integers', () => {
    assert.equal(run('int f() { return 3 + 4; }').value, 7);
  });

  it('subtracts', () => {
    assert.equal(run('int f() { return 10 - 3; }').value, 7);
  });

  it('multiplies', () => {
    assert.equal(run('int f() { return 6 * 7; }').value, 42);
  });

  it('divides (integer)', () => {
    assert.equal(run('int f() { return 10 / 3; }').value, 3);
  });

  it('modulo', () => {
    assert.equal(run('int f() { return 10 % 3; }').value, 1);
  });

  it('negation', () => {
    assert.equal(run('int f() { return -5; }').value, -5);
  });

  it('complex expression', () => {
    assert.equal(run('int f() { return (2 + 3) * 4 - 1; }').value, 19);
  });

  it('string concatenation', () => {
    assert.equal(run('string f() { return "hello" + " " + "world"; }').value, 'hello world');
  });
});

describe('VM — comparison and logic', () => {
  it('equal true', () => { assert.equal(run('int f() { return 5 == 5; }').value, 1); });
  it('equal false', () => { assert.equal(run('int f() { return 5 == 3; }').value, 0); });
  it('less than', () => { assert.equal(run('int f() { return 3 < 5; }').value, 1); });
  it('not equal', () => { assert.equal(run('int f() { return 3 != 5; }').value, 1); });
  it('logical not', () => { assert.equal(run('int f() { return !0; }').value, 1); });
});

describe('VM — variables', () => {
  it('local variable', () => {
    assert.equal(run('int f() { int x = 10; return x; }').value, 10);
  });

  it('local variable arithmetic', () => {
    assert.equal(run('int f() { int a = 3; int b = 4; return a + b; }').value, 7);
  });

  it('compound assignment', () => {
    assert.equal(run('int f() { int x = 10; x += 5; return x; }').value, 15);
  });

  it('parameters', () => {
    assert.equal(run(
      'int add(int a, int b) { return a + b; } int f() { return add(3, 4); }',
    ).value, 7);
  });
});

describe('VM — control flow', () => {
  it('if true branch', () => {
    assert.equal(run('int f() { if (1) { return 10; } return 20; }').value, 10);
  });

  it('if false branch', () => {
    assert.equal(run('int f() { if (0) { return 10; } return 20; }').value, 20);
  });

  it('if/else', () => {
    assert.equal(run('int f() { if (0) { return 10; } else { return 20; } }').value, 20);
  });

  it('while loop', () => {
    assert.equal(run('int f() { int i = 0; int sum = 0; while (i < 5) { sum += i; i += 1; } return sum; }').value, 10);
  });

  it('for loop', () => {
    assert.equal(run('int f() { int sum = 0; for (int i = 1; i <= 10; i += 1) { sum += i; } return sum; }').value, 55);
  });

  it('ternary expression', () => {
    assert.equal(run('int f() { return 1 ? 10 : 20; }').value, 10);
  });

  it('nested function calls', () => {
    assert.equal(run('int double(int x) { return x * 2; } int f() { return double(double(3)); }').value, 12);
  });

  it('recursive function', () => {
    assert.equal(run('int fact(int n) { if (n <= 1) { return 1; } return n * fact(n - 1); } int f() { return fact(5); }').value, 120);
  });
});

describe('VM — collections', () => {
  it('array literal', () => {
    const result = run('mixed f() { return ({ 1, 2, 3 }); }');
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 1);
  });

  it('mapping literal', () => {
    const result = run('mixed f() { return ([ "a": 1, "b": 2 ]); }');
    assert.equal(result.type, T_MAPPING);
    assert.equal(result.value.get('a').value, 1);
  });

  it('array index', () => {
    assert.equal(run('int f() { mixed arr = ({ 10, 20, 30 }); return arr[1]; }').value, 20);
  });
});
