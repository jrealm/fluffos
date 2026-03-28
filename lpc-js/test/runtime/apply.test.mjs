import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apply, setMachine } from '../../src/runtime/apply.mjs';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';
import { mkInt, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('apply', () => {
  it('calls a function on an object', () => {
    const prog = compile('int get_value() { return 42; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);
    const result = apply('get_value', obj, []);
    assert.equal(result.value, 42);
  });

  it('passes arguments to the function', () => {
    const prog = compile('int add(int a, int b) { return a + b; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);
    const result = apply('add', obj, [mkInt(3), mkInt(4)]);
    assert.equal(result.value, 7);
  });

  it('returns SVALUE_ZERO for missing function', () => {
    const prog = compile('int foo() { return 1; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);
    const result = apply('nonexistent', obj, []);
    assert.equal(result, SVALUE_ZERO);
  });

  it('uses object variables as globals', () => {
    const prog = compile('int counter = 0;\nvoid inc() { counter += 1; }\nint get() { return counter; }');
    const obj = new LpcObject('/test.c', prog);
    const vm = new Machine();
    setMachine(vm);
    apply('inc', obj, []);
    apply('inc', obj, []);
    const result = apply('get', obj, []);
    assert.equal(result.value, 2);
  });
});
