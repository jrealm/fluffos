import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkArray, mkFunction, T_INT, T_STRING, T_ARRAY, T_MAPPING, SVALUE_ZERO } from '../../src/vm/svalue.mjs';
import { Machine } from '../../src/vm/machine.mjs';
import { setMachine } from '../../src/runtime/apply.mjs';
import { compile } from '../../src/compiler/codegen.mjs';

describe('extra array efuns', () => {
  let reg;
  beforeEach(() => {
    reg = new EfunRegistry();
    const vm = new Machine();
    setMachine(vm);
    reg.loadDefaults();
    vm.efunHandler = (name, args) => reg.call(name, args);
  });

  it('allocate creates zeroed array', () => {
    const result = reg.call('allocate', [mkInt(3)]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 0);
  });

  it('allocate_mapping creates empty mapping', () => {
    const result = reg.call('allocate_mapping', [mkInt(0)]);
    assert.equal(result.type, T_MAPPING);
    assert.equal(result.value.size, 0);
  });

  it('filter_array with function pointer', () => {
    const prog = compile('int is_positive(int x) { return x > 0; }');
    const vm = new Machine();
    setMachine(vm);
    vm.efunHandler = (name, args) => reg.call(name, args);
    vm.currentProgram = prog;
    const fp = mkFunction({ kind: 'named', name: 'is_positive', partialArgs: [], program: prog });
    const result = reg.call('filter_array', [mkArray([mkInt(-1), mkInt(2), mkInt(-3), mkInt(4)]), fp]);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].value, 2);
  });

  it('map_array with function pointer', () => {
    const prog = compile('int double(int x) { return x * 2; }');
    const vm = new Machine();
    setMachine(vm);
    vm.efunHandler = (name, args) => reg.call(name, args);
    vm.currentProgram = prog;
    const fp = mkFunction({ kind: 'named', name: 'double', partialArgs: [], program: prog });
    const result = reg.call('map_array', [mkArray([mkInt(1), mkInt(2), mkInt(3)]), fp]);
    assert.equal(result.value[0].value, 2);
    assert.equal(result.value[2].value, 6);
  });
});

describe('extra string efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('strsrch forward', () => {
    assert.equal(reg.call('strsrch', [mkString('hello world'), mkString('world')]).value, 6);
  });
  it('strsrch not found', () => {
    assert.equal(reg.call('strsrch', [mkString('hello'), mkString('xyz')]).value, -1);
  });
  it('strsrch with offset', () => {
    assert.equal(reg.call('strsrch', [mkString('abcabc'), mkString('abc'), mkInt(1)]).value, 3);
  });
});

describe('extra misc efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('localtime returns array', () => {
    const result = reg.call('localtime', [mkInt(Math.floor(Date.now() / 1000))]);
    assert.equal(result.type, T_ARRAY);
    assert.ok(result.value.length >= 9);
  });
  it('hash md5', () => {
    const result = reg.call('hash', [mkString('md5'), mkString('hello')]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value.length, 32);
  });
  it('hash sha1', () => {
    const result = reg.call('hash', [mkString('sha1'), mkString('hello')]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value.length, 40);
  });
});
