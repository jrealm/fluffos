import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

function run(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName);
}

describe('heredoc strings', () => {
  it('parses single-line heredoc', () => {
    const src = 'string f() { return @END\nhello world\nEND; }';
    assert.equal(run(src).value, 'hello world\n');
  });

  it('parses multi-line heredoc', () => {
    const src = 'string f() { return @TEXT\nline one\nline two\nline three\nTEXT; }';
    assert.equal(run(src).value, 'line one\nline two\nline three\n');
  });

  it('heredoc preserves inner whitespace', () => {
    const src = 'string f() { return @END\n  indented\n    more\nEND; }';
    assert.equal(run(src).value, '  indented\n    more\n');
  });
});
