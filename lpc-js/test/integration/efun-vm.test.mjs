import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';

function runWithEfuns(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  const efuns = new EfunRegistry();
  efuns.loadDefaults();
  vm.efunHandler = (name, args) => efuns.call(name, args);
  return vm.execute(prog, funcName);
}

describe('integration — efuns in LPC', () => {
  it('capitalize efun', () => {
    assert.equal(runWithEfuns('string f() { return capitalize("hello"); }').value, 'Hello');
  });

  it('strlen efun', () => {
    assert.equal(runWithEfuns('int f() { return strlen("abcde"); }').value, 5);
  });

  it('sizeof on array', () => {
    assert.equal(runWithEfuns('int f() { return sizeof(({ 1, 2, 3 })); }').value, 3);
  });

  it('explode and implode', () => {
    assert.equal(runWithEfuns('string f() { return implode(explode("a-b-c", "-"), "/"); }').value, 'a/b/c');
  });

  it('typeof efun', () => {
    assert.equal(runWithEfuns('string f() { return typeof(42); }').value, 'int');
  });

  it('to_string and to_int', () => {
    assert.equal(runWithEfuns('int f() { return to_int(to_string(42)); }').value, 42);
  });

  it('replace_string', () => {
    assert.equal(runWithEfuns('string f() { return replace_string("hello world", "world", "LPC"); }').value, 'hello LPC');
  });

  it('sort_array', () => {
    const result = runWithEfuns('mixed f() { return sort_array(({ 3, 1, 2 })); }');
    assert.equal(result.value[0].value, 1);
    assert.equal(result.value[2].value, 3);
  });

  it('sprintf', () => {
    assert.equal(runWithEfuns('string f() { return sprintf("x=%d", 42); }').value, 'x=42');
  });
});
