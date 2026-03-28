import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

describe('integration — preprocessor + compile', () => {
  it('compiles with #define', () => {
    const prog = compile('#define VAL 42\nint f() { return VAL; }');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 42);
  });

  it('compiles with #ifdef', () => {
    const prog = compile('#define USE_FAST\n#ifdef USE_FAST\nint f() { return 1; }\n#else\nint f() { return 0; }\n#endif');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 1);
  });

  it('compiles with macro function', () => {
    const prog = compile('#define DOUBLE(x) ((x) * 2)\nint f() { return DOUBLE(5); }');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 10);
  });

  it('#pragma strict_types compiles without error', () => {
    const prog = compile('#pragma strict_types\nint f() { return 1; }');
    const vm = new Machine();
    assert.equal(vm.execute(prog, 'f').value, 1);
  });
});
