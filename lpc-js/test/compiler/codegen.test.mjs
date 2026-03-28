import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { OP } from '../../src/vm/opcodes.mjs';

function compileFn(src, funcName) {
  const prog = compile(src);
  const fn = prog.findFunction(funcName);
  assert.ok(fn, `function ${funcName} not found`);
  return { prog, fn };
}

function hasOpcode(bytecode, start, opcode) {
  for (let i = start; i < bytecode.length; i++) {
    if (bytecode[i] === opcode) return true;
  }
  return false;
}

describe('codegen', () => {
  it('compiles empty void function', () => {
    const { prog, fn } = compileFn('void f() { }', 'f');
    assert.ok(prog.bytecode.length > 0);
    assert.equal(prog.bytecode[fn.offset], OP.RETURN_ZERO);
  });

  it('compiles return integer literal', () => {
    const { prog, fn } = compileFn('int f() { return 42; }', 'f');
    assert.equal(prog.bytecode[fn.offset], OP.PUSH_INT);
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.RETURN));
  });

  it('compiles return 0 as PUSH_0', () => {
    const { prog, fn } = compileFn('int f() { return 0; }', 'f');
    assert.equal(prog.bytecode[fn.offset], OP.PUSH_0);
  });

  it('compiles addition', () => {
    const { prog, fn } = compileFn('int f() { return 1 + 2; }', 'f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.ADD));
  });

  it('compiles local variable', () => {
    const { prog, fn } = compileFn('int f() { int x = 5; return x; }', 'f');
    assert.equal(fn.numLocals, 1);
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.STORE_LOCAL));
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.LOAD_LOCAL));
  });

  it('compiles function with parameters', () => {
    const { fn } = compileFn('int add(int a, int b) { return a + b; }', 'add');
    assert.equal(fn.numArgs, 2);
  });

  it('compiles if statement', () => {
    const { prog, fn } = compileFn('int f(int x) { if (x) { return 1; } return 0; }', 'f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.JUMP_IF_ZERO));
  });

  it('compiles while loop', () => {
    const { prog, fn } = compileFn('void f() { int i = 0; while (i < 10) { i += 1; } }', 'f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.JUMP));
  });

  it('compiles string constant', () => {
    const { prog, fn } = compileFn('string f() { return "hello"; }', 'f');
    assert.ok(prog.strings.includes('hello'));
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.PUSH_STRING));
  });

  it('compiles multiple functions', () => {
    const prog = compile('int a() { return 1; } int b() { return 2; }');
    assert.equal(prog.functions.length, 2);
    assert.ok(prog.findFunction('a'));
    assert.ok(prog.findFunction('b'));
  });

  it('compiles comparison operators', () => {
    const { prog, fn } = compileFn('int f(int a, int b) { return a < b; }', 'f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.LT));
  });

  it('compiles negation', () => {
    const { prog, fn } = compileFn('int f(int x) { return -x; }', 'f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.NEGATE));
  });

  it('compiles array literal', () => {
    const { prog, fn } = compileFn('mixed f() { return ({ 1, 2, 3 }); }', 'f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.MAKE_ARRAY));
  });

  it('compiles mapping literal', () => {
    const { prog, fn } = compileFn('mixed f() { return ([ "a": 1 ]); }', 'f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.MAKE_MAPPING));
  });

  it('compiles local function call', () => {
    const prog = compile('int helper() { return 1; } int f() { return helper(); }');
    const fn = prog.findFunction('f');
    assert.ok(hasOpcode(prog.bytecode, fn.offset, OP.CALL_LOCAL));
  });
});
