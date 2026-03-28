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
    assert.equal(result.value.get('1:a').value.value, 1); // key = T_STRING(1):a
  });

  it('array index', () => {
    assert.equal(run('int f() { mixed arr = ({ 10, 20, 30 }); return arr[1]; }').value, 20);
  });
});

describe('VM — short-circuit logical operators', () => {
  it('&& short-circuits on falsy left', () => {
    const result = run('int f() { int x = 0; if (0 && (x = 5)) {} return x; }');
    assert.equal(result.value, 0);
  });

  it('&& evaluates right when left is truthy', () => {
    const result = run('int f() { int x = 0; if (1 && (x = 5)) {} return x; }');
    assert.equal(result.value, 5);
  });

  it('|| short-circuits on truthy left', () => {
    const result = run('int f() { int x = 0; if (1 || (x = 5)) {} return x; }');
    assert.equal(result.value, 0);
  });

  it('|| evaluates right when left is falsy', () => {
    const result = run('int f() { int x = 0; if (0 || (x = 5)) {} return x; }');
    assert.equal(result.value, 5);
  });

  it('&& returns left value when falsy', () => {
    assert.equal(run('int f() { return 0 && 42; }').value, 0);
  });

  it('&& returns right value when left is truthy', () => {
    assert.equal(run('int f() { return 3 && 42; }').value, 42);
  });

  it('|| returns left value when truthy', () => {
    assert.equal(run('int f() { return 3 || 42; }').value, 3);
  });

  it('|| returns right value when left is falsy', () => {
    assert.equal(run('int f() { return 0 || 42; }').value, 42);
  });
});

describe('VM — continue in for loop', () => {
  it('continue skips to update in for loop', () => {
    const result = run(`
      int f() {
        int sum = 0;
        for (int i = 0; i < 10; i += 1) {
          if (i % 2 == 0) { continue; }
          sum += i;
        }
        return sum;
      }
    `);
    assert.equal(result.value, 25);
  });

  it('continue in while loop still works', () => {
    const result = run(`
      int f() {
        int i = 0;
        int sum = 0;
        while (i < 10) {
          i += 1;
          if (i % 2 == 0) { continue; }
          sum += i;
        }
        return sum;
      }
    `);
    assert.equal(result.value, 25);
  });
});

describe('VM — catch restores program context', () => {
  it('catch inside local function call restores state', () => {
    const result = run(`
      void thrower() { throw("oops"); }
      mixed f() { return catch(thrower()); }
    `);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'oops');
  });

  it('catch preserves locals after cross-function throw', () => {
    const result = run(`
      int inner() { throw("fail"); return 0; }
      int f() {
        int x = 10;
        mixed dummy;
        dummy = catch(inner());
        return x;
      }
    `);
    assert.equal(result.value, 10);
  });
});

describe('VM — switch statement', () => {
  it('switch with break does not leak stack', () => {
    const result = run(`
      int f() {
        int x = 0;
        switch (1) {
          case 1: x = 10; break;
          case 2: x = 20; break;
        }
        return x;
      }
    `);
    assert.equal(result.value, 10);
  });

  it('switch with default', () => {
    const result = run(`
      int f() {
        int x = 0;
        switch (99) {
          case 1: x = 10; break;
          default: x = 42; break;
        }
        return x;
      }
    `);
    assert.equal(result.value, 42);
  });

  it('switch fall-through', () => {
    const result = run(`
      int f() {
        int x = 0;
        switch (1) {
          case 1: x += 10;
          case 2: x += 20; break;
        }
        return x;
      }
    `);
    assert.equal(result.value, 30);
  });

  it('switch followed by more code', () => {
    const result = run(`
      int f() {
        int a = 0;
        int b = 0;
        switch (2) {
          case 1: a = 1; break;
          case 2: a = 2; break;
        }
        b = a + 100;
        return b;
      }
    `);
    assert.equal(result.value, 102);
  });

  it('multiple switches do not corrupt stack', () => {
    const result = run(`
      int f() {
        int a = 0;
        switch (1) { case 1: a = 10; break; }
        switch (2) { case 2: a += 20; break; }
        switch (3) { case 3: a += 30; break; }
        return a;
      }
    `);
    assert.equal(result.value, 60);
  });
});

describe('VM — mapping type-safe keys', () => {
  it('int and float keys are distinct', () => {
    const result = run(`
      mixed f() {
        mapping m = ([ 1: "int", 1.0: "float" ]);
        return m;
      }
    `);
    assert.equal(result.type, T_MAPPING);
    assert.equal(result.value.size, 2);
  });

  it('int key lookup works', () => {
    const result = run('mixed f() { mapping m = ([ 1: "one", 2: "two" ]); return m[1]; }');
    assert.equal(result.value, 'one');
  });

  it('string key lookup works', () => {
    const result = run('mixed f() { mapping m = ([ "a": 10, "b": 20 ]); return m["b"]; }');
    assert.equal(result.value, 20);
  });
});
