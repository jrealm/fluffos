import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileWithInherit } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

describe('inheritance — basic', () => {
  it('inherits a function from parent', () => {
    const files = {
      '/parent.c': 'int get_value() { return 42; }',
      '/child.c': 'inherit "/parent";\nint f() { return get_value(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 42);
  });

  it('child overrides parent function', () => {
    const files = {
      '/parent.c': 'int get_value() { return 10; }',
      '/child.c': 'inherit "/parent";\nint get_value() { return 20; }\nint f() { return get_value(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 20);
  });

  it('inherits variables from parent', () => {
    const files = {
      '/parent.c': 'int counter = 0;\nvoid inc() { counter += 1; }\nint get() { return counter; }',
      '/child.c': 'inherit "/parent";\nint f() { inc(); inc(); inc(); return get(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 3);
  });

  it('::func() calls inherited version', () => {
    const files = {
      '/parent.c': 'int get_value() { return 10; }',
      '/child.c': 'inherit "/parent";\nint get_value() { return ::get_value() + 5; }\nint f() { return get_value(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 15);
  });

  it('multiple inheritance', () => {
    const files = {
      '/a.c': 'int from_a() { return 1; }',
      '/b.c': 'int from_b() { return 2; }',
      '/child.c': 'inherit "/a";\ninherit "/b";\nint f() { return from_a() + from_b(); }',
    };
    const prog = compileWithInherit('/child.c', files);
    const vm = new Machine();
    const result = vm.execute(prog, 'f');
    assert.equal(result.value, 3);
  });
});
