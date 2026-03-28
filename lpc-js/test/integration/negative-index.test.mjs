import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

function run(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName);
}

describe('negative indexing', () => {
  it('arr[<1] returns last element', () => {
    assert.equal(run('int f() { mixed a = ({ 10, 20, 30 }); return a[<1]; }').value, 30);
  });

  it('arr[<2] returns second-to-last', () => {
    assert.equal(run('int f() { mixed a = ({ 10, 20, 30 }); return a[<2]; }').value, 20);
  });

  it('str[<1] returns last character code', () => {
    assert.equal(run('int f() { string s = "abc"; return s[<1]; }').value, 99);
  });

  it('arr[0..<2] returns all but last element', () => {
    const result = run('mixed f() { return ({ 10, 20, 30, 40 })[0..<2]; }');
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 10);
    assert.equal(result.value[2].value, 30);
  });

  it('str[0..<2] returns all but last char', () => {
    assert.equal(run('string f() { return "hello"[0..<2]; }').value, 'hell');
  });

  it('arr[1..<1] returns from index 1 to last', () => {
    const result = run('mixed f() { return ({ 10, 20, 30, 40 })[1..<1]; }');
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 20);
    assert.equal(result.value[2].value, 40);
  });
});
