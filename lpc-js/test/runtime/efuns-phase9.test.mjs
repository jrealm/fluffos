import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { Program } from '../../src/vm/program.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, mkFunction, mappingKey,
         T_INT, T_STRING, T_FLOAT, T_ARRAY, T_MAPPING, T_OBJECT, T_FUNCTION, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

function mkMap(pairs) {
  const m = new Map();
  for (const [k, v] of pairs) { m.set(mappingKey(k), { key: k, value: v }); }
  return mkMapping(m);
}

describe('Phase 9: contrib — data operations', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('copy creates deep copy of array', () => {
    const original = mkArray([mkInt(1), mkArray([mkInt(2), mkInt(3)])]);
    const copied = reg.call('copy', [original]);
    assert.equal(copied.type, T_ARRAY);
    assert.equal(copied.value.length, 2);
    // Modify original nested array — copy should not change
    original.value[1].value.push(mkInt(99));
    assert.equal(copied.value[1].value.length, 2);
  });

  it('copy creates deep copy of mapping', () => {
    const original = mkMap([[mkString('a'), mkArray([mkInt(1)])]]);
    const copied = reg.call('copy', [original]);
    assert.equal(copied.type, T_MAPPING);
    // Modify original — copy should not change
    const entry = [...original.value.values()][0];
    entry.value.value.push(mkInt(99));
    const copiedEntry = [...copied.value.values()][0];
    assert.equal(copiedEntry.value.value.length, 1);
  });

  it('copy returns primitives unchanged', () => {
    assert.equal(reg.call('copy', [mkInt(42)]).value, 42);
    assert.equal(reg.call('copy', [mkString('hi')]).value, 'hi');
  });

  it('flatten flattens nested arrays', () => {
    const nested = mkArray([mkInt(1), mkArray([mkInt(2), mkArray([mkInt(3)])])]);
    const result = reg.call('flatten', [nested]);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 1);
    assert.equal(result.value[1].value, 2);
    assert.equal(result.value[2].value, 3);
  });

  it('flatten on flat array is no-op', () => {
    const flat = mkArray([mkInt(1), mkInt(2)]);
    const result = reg.call('flatten', [flat]);
    assert.equal(result.value.length, 2);
  });

  it('shuffle returns same elements in different order', () => {
    const arr = mkArray([mkInt(1), mkInt(2), mkInt(3), mkInt(4), mkInt(5)]);
    const result = reg.call('shuffle', [arr]);
    assert.equal(result.value.length, 5);
    const sorted = result.value.map(v => v.value).sort();
    assert.deepEqual(sorted, [1, 2, 3, 4, 5]);
  });

  it('element_of returns an element from the array', () => {
    const arr = mkArray([mkInt(10), mkInt(20), mkInt(30)]);
    const result = reg.call('element_of', [arr]);
    assert.ok([10, 20, 30].includes(result.value));
  });

  it('element_of on empty array returns 0', () => {
    const result = reg.call('element_of', [mkArray([])]);
    assert.equal(result.value, 0);
  });

  it('max returns largest value', () => {
    const arr = mkArray([mkInt(3), mkInt(7), mkInt(1), mkInt(5)]);
    assert.equal(reg.call('max', [arr]).value, 7);
  });

  it('min returns smallest value', () => {
    const arr = mkArray([mkInt(3), mkInt(7), mkInt(1), mkInt(5)]);
    assert.equal(reg.call('min', [arr]).value, 1);
  });

  it('max/min on empty array returns 0', () => {
    assert.equal(reg.call('max', [mkArray([])]).value, 0);
    assert.equal(reg.call('min', [mkArray([])]).value, 0);
  });

  it('abs on positive int', () => {
    assert.equal(reg.call('abs', [mkInt(5)]).value, 5);
  });

  it('abs on negative int', () => {
    assert.equal(reg.call('abs', [mkInt(-5)]).value, 5);
  });

  it('abs on negative float', () => {
    const result = reg.call('abs', [mkFloat(-3.14)]);
    assert.equal(result.type, T_FLOAT);
    assert.ok(Math.abs(result.value - 3.14) < 0.001);
  });
});

describe('Phase 9: contrib — string tools', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('repeat_string repeats n times', () => {
    assert.equal(reg.call('repeat_string', [mkString('ab'), mkInt(3)]).value, 'ababab');
  });

  it('repeat_string with 0 returns empty', () => {
    assert.equal(reg.call('repeat_string', [mkString('ab'), mkInt(0)]).value, '');
  });

  it('repeat_string with negative returns empty', () => {
    assert.equal(reg.call('repeat_string', [mkString('x'), mkInt(-1)]).value, '');
  });

  it('strcmp returns -1, 0, or 1', () => {
    assert.equal(reg.call('strcmp', [mkString('abc'), mkString('def')]).value, -1);
    assert.equal(reg.call('strcmp', [mkString('hello'), mkString('hello')]).value, 0);
    assert.equal(reg.call('strcmp', [mkString('xyz'), mkString('abc')]).value, 1);
  });

  it('terminal_colour replaces %^TAG%^ with mapping values', () => {
    const mapping = mkMap([
      [mkString('RED'), mkString('\x1b[31m')],
      [mkString('RESET'), mkString('\x1b[0m')],
    ]);
    const result = reg.call('terminal_colour', [
      mkString('This is %^RED%^red text%^RESET%^.'),
      mapping,
    ]);
    assert.equal(result.value, 'This is \x1b[31mred text\x1b[0m.');
  });

  it('terminal_colour with unknown tag removes it', () => {
    const mapping = mkMap([]);
    const result = reg.call('terminal_colour', [
      mkString('Hello %^UNKNOWN%^world'),
      mapping,
    ]);
    assert.equal(result.value, 'Hello world');
  });

  it('terminal_colour with wrap', () => {
    const mapping = mkMap([]);
    const result = reg.call('terminal_colour', [
      mkString('abcdefghij'),
      mapping,
      mkInt(5),
    ]);
    assert.equal(result.value, 'abcde\nfghij');
  });
});

describe('Phase 9: contrib — object reflection', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('functions lists object functions', () => {
    const prog = new Program('test.c');
    prog.functions = [{ name: 'create' }, { name: 'foo' }, { name: 'bar' }];
    prog.inherits = [];
    const obj = { program: prog };

    const result = reg.call('functions', [{ type: T_OBJECT, value: obj }]);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 'create');
    assert.equal(result.value[1].value, 'foo');
  });

  it('functions with flag includes inherited', () => {
    const parentProg = new Program('parent.c');
    parentProg.functions = [{ name: 'parent_func' }];
    parentProg.inherits = [];

    const prog = new Program('test.c');
    prog.functions = [{ name: 'local_func' }];
    prog.inherits = [{ program: parentProg, varOffset: 0 }];
    const obj = { program: prog };

    // flag=0: include inherited (default), return simple string names
    const result = reg.call('functions', [{ type: T_OBJECT, value: obj }, mkInt(0)]);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].value, 'local_func');
    assert.equal(result.value[1].value, 'parent_func');
  });

  it('variables lists object variables', () => {
    const prog = new Program('test.c');
    prog.variables = [{ name: 'hp' }, { name: 'name' }];
    const obj = { program: prog };

    const result = reg.call('variables', [{ type: T_OBJECT, value: obj }]);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].value, 'hp');
    assert.equal(result.value[1].value, 'name');
  });
});

describe('Phase 10: math efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('sin/cos/tan', () => {
    const sin = reg.call('sin', [mkFloat(Math.PI / 2)]);
    assert.ok(Math.abs(sin.value - 1.0) < 0.0001);

    const cos = reg.call('cos', [mkFloat(0)]);
    assert.ok(Math.abs(cos.value - 1.0) < 0.0001);

    const tan = reg.call('tan', [mkFloat(0)]);
    assert.ok(Math.abs(tan.value) < 0.0001);
  });

  it('asin/acos/atan', () => {
    const asin = reg.call('asin', [mkFloat(1.0)]);
    assert.ok(Math.abs(asin.value - Math.PI / 2) < 0.0001);

    const acos = reg.call('acos', [mkFloat(1.0)]);
    assert.ok(Math.abs(acos.value) < 0.0001);

    const atan = reg.call('atan', [mkFloat(0)]);
    assert.ok(Math.abs(atan.value) < 0.0001);
  });

  it('sqrt on float', () => {
    const result = reg.call('sqrt', [mkFloat(9.0)]);
    assert.equal(result.type, T_FLOAT);
    assert.ok(Math.abs(result.value - 3.0) < 0.0001);
  });

  it('sqrt on int truncates', () => {
    const result = reg.call('sqrt', [mkInt(10)]);
    assert.equal(result.type, T_INT);
    assert.equal(result.value, 3);
  });

  it('pow', () => {
    assert.equal(reg.call('pow', [mkInt(2), mkInt(10)]).value, 1024);
    const result = reg.call('pow', [mkFloat(2.0), mkFloat(0.5)]);
    assert.ok(Math.abs(result.value - Math.SQRT2) < 0.0001);
  });

  it('log/log10/log2/exp', () => {
    assert.ok(Math.abs(reg.call('log', [mkFloat(Math.E)]).value - 1.0) < 0.0001);
    assert.ok(Math.abs(reg.call('log10', [mkFloat(100)]).value - 2.0) < 0.0001);
    assert.ok(Math.abs(reg.call('log2', [mkFloat(8)]).value - 3.0) < 0.0001);
    assert.ok(Math.abs(reg.call('exp', [mkFloat(0)]).value - 1.0) < 0.0001);
  });

  it('floor/ceil/round', () => {
    assert.equal(reg.call('floor', [mkFloat(3.7)]).value, 3);
    assert.equal(reg.call('ceil', [mkFloat(3.2)]).value, 4);
    assert.equal(reg.call('round', [mkFloat(3.5)]).value, 4);
    assert.equal(reg.call('round', [mkFloat(3.4)]).value, 3);
  });

  it('norm calculates vector magnitude', () => {
    const vec = mkArray([mkFloat(3), mkFloat(4)]);
    const result = reg.call('norm', [vec]);
    assert.ok(Math.abs(result.value - 5.0) < 0.0001);
  });

  it('dotprod', () => {
    const a = mkArray([mkInt(1), mkInt(2), mkInt(3)]);
    const b = mkArray([mkInt(4), mkInt(5), mkInt(6)]);
    const result = reg.call('dotprod', [a, b]);
    assert.equal(result.value, 32); // 1*4 + 2*5 + 3*6
  });

  it('distance between two points', () => {
    const a = mkArray([mkFloat(0), mkFloat(0)]);
    const b = mkArray([mkFloat(3), mkFloat(4)]);
    const result = reg.call('distance', [a, b]);
    assert.ok(Math.abs(result.value - 5.0) < 0.0001);
  });

  it('angle between vectors', () => {
    const a = mkArray([mkFloat(1), mkFloat(0)]);
    const b = mkArray([mkFloat(0), mkFloat(1)]);
    const result = reg.call('angle', [a, b]);
    assert.ok(Math.abs(result.value - Math.PI / 2) < 0.0001);
  });

  it('angle between parallel vectors is 0', () => {
    const a = mkArray([mkFloat(1), mkFloat(0)]);
    const b = mkArray([mkFloat(2), mkFloat(0)]);
    const result = reg.call('angle', [a, b]);
    assert.ok(Math.abs(result.value) < 0.0001);
  });
});
