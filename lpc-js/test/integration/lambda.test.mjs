import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { setMachine } from '../../src/runtime/apply.mjs';
import { T_FUNCTION } from '../../src/vm/svalue.mjs';

function runWithEfuns(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  setMachine(vm);
  const efuns = new EfunRegistry();
  efuns.loadDefaults();
  vm.efunHandler = (name, args) => efuns.call(name, args);
  return vm.execute(prog, funcName);
}

describe('lambda / function pointers', () => {
  it('(: func_name :) creates a function pointer', () => {
    const result = runWithEfuns('int double(int x) { return x * 2; }\nmixed f() { return (: double :); }');
    assert.equal(result.type, T_FUNCTION);
  });

  it('evaluate calls a function pointer', () => {
    const result = runWithEfuns('int double(int x) { return x * 2; }\nint f() { return evaluate((: double :), 5); }');
    assert.equal(result.value, 10);
  });

  it('function pointer with partial args', () => {
    const result = runWithEfuns('int add(int a, int b) { return a + b; }\nint f() { return evaluate((: add, 10 :), 20); }');
    assert.equal(result.value, 30);
  });

  it('inline lambda with $1', () => {
    const result = runWithEfuns('int f() { mixed fp = (: $1 + 1 :); return evaluate(fp, 41); }');
    assert.equal(result.value, 42);
  });

  it('inline lambda with $1 and $2', () => {
    const result = runWithEfuns('int f() { mixed fp = (: $1 * $2 :); return evaluate(fp, 6, 7); }');
    assert.equal(result.value, 42);
  });

  it('functionp returns 1 for function pointer', () => {
    const result = runWithEfuns('int double(int x) { return x * 2; }\nint f() { return functionp((: double :)); }');
    assert.ok(result.value > 0);
  });

  it('functionp returns 0 for non-function', () => {
    const result = runWithEfuns('int f() { return functionp(42); }');
    assert.equal(result.value, 0);
  });
});
