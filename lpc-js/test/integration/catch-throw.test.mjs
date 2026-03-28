import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { T_STRING } from '../../src/vm/svalue.mjs';

function run(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName);
}

describe('catch/throw', () => {
  it('catch returns 0 on success', () => {
    const result = run('mixed f() { return catch(1 + 1); }');
    assert.equal(result.value, 0);
  });

  it('catch returns error string on division by zero', () => {
    const result = run('mixed f() { return catch(1 / 0); }');
    assert.equal(result.type, T_STRING);
    assert.ok(result.value.includes('Division by zero'));
  });

  it('throw raises error caught by catch', () => {
    const result = run('mixed f() { return catch(throw("oops")); }');
    assert.equal(result.type, T_STRING);
    assert.ok(result.value.includes('oops'));
  });

  it('catch does not affect normal flow', () => {
    const result = run('int f() { catch(1 + 1); return 42; }');
    assert.equal(result.value, 42);
  });

  it('throw without catch propagates error', () => {
    assert.throws(() => run('void f() { throw("error"); }'), /error/);
  });

  it('catch with function call that throws', () => {
    const result = run(`
      void bad() { throw("inner error"); }
      mixed f() { return catch(bad()); }
    `);
    assert.equal(result.type, T_STRING);
    assert.ok(result.value.includes('inner error'));
  });
});
