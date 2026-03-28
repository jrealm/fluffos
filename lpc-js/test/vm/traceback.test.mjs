import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../src/vm/machine.mjs';
import { compile } from '../../src/compiler/codegen.mjs';
import { T_INT, SVALUE_ZERO, mkString } from '../../src/vm/svalue.mjs';

describe('VM — traceback', () => {
  it('callStack frames contain functionName and fileName during execution', () => {
    const source = `
      void middle() { spy(); }
      void top() { middle(); }
    `;
    const prog = compile(source, 'test.c');
    const vm = new Machine();
    let spyCallStack = null;
    let spyCurrentFn = null;
    vm.efunHandler = (name, args) => {
      if (name === 'spy') {
        spyCallStack = vm.callStack.map(f => ({ ...f }));
        spyCurrentFn = vm._currentFunctionName;
        return SVALUE_ZERO;
      }
      throw new Error(`Unknown efun: ${name}`);
    };
    vm.execute(prog, 'top', []);

    assert.ok(spyCallStack, 'spy should have captured frames');
    assert.equal(spyCurrentFn, 'middle');
    // callStack[0]: execute entry frame (null)
    // callStack[1]: frame from top calling middle
    assert.equal(spyCallStack.length, 2);
    assert.equal(spyCallStack[1].functionName, 'top');
    assert.equal(spyCallStack[1].fileName, 'test.c');
  });

  it('restores _currentFunctionName after call returns', () => {
    const source = `
      int inner() { return 1; }
      int outer() { return inner(); }
    `;
    const prog = compile(source, 'test.c');
    const vm = new Machine();
    vm.execute(prog, 'outer', []);
    // After full execution, _currentFunctionName should be restored
    assert.equal(vm._currentFunctionName, null);
  });
});

describe('VM — collectTraceback', () => {
  it('collects frames from nested calls', () => {
    const source = `
      int deep() { return 1; }
      int middle() { return deep(); }
      int top() { return middle(); }
    `;
    const prog = compile(source, 'trace.c');
    const vm = new Machine();

    // Set up state as if mid-execution in deep()
    vm.currentProgram = prog;
    vm._currentFunctionName = 'deep';
    vm._currentObject = null;
    vm.pc = 0;
    vm.callStack.push({
      pc: 10, locals: [], program: prog,
      functionName: 'top', fileName: 'trace.c', object: null,
    });
    vm.callStack.push({
      pc: 20, locals: [], program: prog,
      functionName: 'middle', fileName: 'trace.c', object: null,
    });

    const tb = vm.collectTraceback('Division by zero');
    assert.equal(tb.message, 'Division by zero');
    assert.equal(tb.frames.length, 3);
    assert.equal(tb.frames[0].function, 'deep');
    assert.equal(tb.frames[1].function, 'middle');
    assert.equal(tb.frames[2].function, 'top');
    assert.equal(tb.frames[0].file, 'trace.c');
  });

  it('collects traceback during live execution via efun', () => {
    const source = `
      void inner() { capture_trace(); }
      void outer() { inner(); }
    `;
    const prog = compile(source, 'live.c');
    const vm = new Machine();
    let captured = null;
    vm.efunHandler = (name, args) => {
      if (name === 'capture_trace') {
        captured = vm.collectTraceback('test error');
        return SVALUE_ZERO;
      }
      throw new Error(`Unknown efun: ${name}`);
    };
    vm.execute(prog, 'outer', []);

    assert.ok(captured);
    assert.equal(captured.message, 'test error');
    // Frames: inner (current), outer, <entry>
    assert.ok(captured.frames.length >= 2);
    assert.equal(captured.frames[0].function, 'inner');
    assert.equal(captured.frames[1].function, 'outer');
  });
});
