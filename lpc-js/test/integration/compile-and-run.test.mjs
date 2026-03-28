import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

function run(source, funcName, args = []) {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName, args);
}

describe('integration — compile and run LPC programs', () => {
  it('fibonacci', () => {
    const result = run(`
      int fib(int n) {
        if (n <= 1) { return n; }
        return fib(n - 1) + fib(n - 2);
      }
    `, 'fib', [{ type: 0, value: 10 }]);
    assert.equal(result.value, 55);
  });

  it('iterative factorial', () => {
    const result = run(`
      int factorial(int n) {
        int result = 1;
        for (int i = 2; i <= n; i += 1) {
          result *= i;
        }
        return result;
      }
    `, 'factorial', [{ type: 0, value: 6 }]);
    assert.equal(result.value, 720);
  });

  it('string building', () => {
    const result = run(`
      string greet(string name) {
        return "Hello, " + name + "!";
      }
    `, 'greet', [{ type: 1, value: 'World' }]);
    assert.equal(result.value, 'Hello, World!');
  });

  it('array operations', () => {
    const result = run(`
      int sum_array() {
        mixed arr = ({ 10, 20, 30, 40 });
        int total = 0;
        int i = 0;
        while (i < 4) {
          total += arr[i];
          i += 1;
        }
        return total;
      }
    `, 'sum_array');
    assert.equal(result.value, 100);
  });

  it('nested if-else', () => {
    const result = run(`
      string classify(int n) {
        if (n < 0) { return "negative"; }
        else if (n == 0) { return "zero"; }
        else { return "positive"; }
      }
    `, 'classify', [{ type: 0, value: -5 }]);
    assert.equal(result.value, 'negative');
  });

  it('multiple functions calling each other', () => {
    const result = run(`
      int square(int x) { return x * x; }
      int sum_of_squares(int a, int b) {
        return square(a) + square(b);
      }
    `, 'sum_of_squares', [{ type: 0, value: 3 }, { type: 0, value: 4 }]);
    assert.equal(result.value, 25);
  });

  it('do-while loop', () => {
    const result = run(`
      int count_digits(int n) {
        int digits = 0;
        do {
          digits += 1;
          n = n / 10;
        } while (n > 0);
        return digits;
      }
    `, 'count_digits', [{ type: 0, value: 12345 }]);
    assert.equal(result.value, 5);
  });

  it('ternary in expression', () => {
    const result = run(`
      int abs(int x) {
        return x >= 0 ? x : -x;
      }
    `, 'abs', [{ type: 0, value: -42 }]);
    assert.equal(result.value, 42);
  });

  it('mapping creation and lookup', () => {
    const result = run(`
      mixed make_map() {
        return ([ "one": 1, "two": 2, "three": 3 ]);
      }
    `, 'make_map');
    assert.equal(result.value.get('two').value, 2);
  });

  it('eval cost limit prevents infinite loops', () => {
    const prog = compile(`
      void infinite() {
        while (1) { }
      }
    `);
    const vm = new Machine();
    vm.maxEvalCost = 100;
    assert.throws(() => vm.execute(prog, 'infinite'), /Too long evaluation/);
  });
});
