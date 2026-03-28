import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkFloat, mkArray, mkMapping, mappingKey, T_INT, T_STRING, T_ARRAY } from '../../src/vm/svalue.mjs';

function mkMap(pairs) {
  const m = new Map();
  for (const [k, v] of pairs) { m.set(mappingKey(k), { key: k, value: v }); }
  return mkMapping(m);
}

describe('EfunRegistry', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); });

  it('registers and calls an efun', () => {
    reg.register('double', (args) => mkInt(args[0].value * 2));
    assert.equal(reg.call('double', [mkInt(5)]).value, 10);
  });

  it('throws for unknown efun', () => {
    assert.throws(() => reg.call('nope', []), /Unknown efun: nope/);
  });
});

describe('string efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('capitalize', () => { assert.equal(reg.call('capitalize', [mkString('hello')]).value, 'Hello'); });
  it('lower_case', () => { assert.equal(reg.call('lower_case', [mkString('HELLO')]).value, 'hello'); });
  it('upper_case', () => { assert.equal(reg.call('upper_case', [mkString('hello')]).value, 'HELLO'); });
  it('strlen', () => { assert.equal(reg.call('strlen', [mkString('abc')]).value, 3); });

  it('implode', () => {
    const arr = mkArray([mkString('a'), mkString('b'), mkString('c')]);
    assert.equal(reg.call('implode', [arr, mkString(',')]).value, 'a,b,c');
  });

  it('explode', () => {
    const result = reg.call('explode', [mkString('a,b,c'), mkString(',')]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 3);
    assert.equal(result.value[0].value, 'a');
  });

  it('replace_string', () => {
    assert.equal(reg.call('replace_string', [mkString('hello world'), mkString('world'), mkString('LPC')]).value, 'hello LPC');
  });

  it('trim', () => { assert.equal(reg.call('trim', [mkString('  hi  ')]).value, 'hi'); });
});

describe('array efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('sizeof on array', () => { assert.equal(reg.call('sizeof', [mkArray([mkInt(1), mkInt(2)])]).value, 2); });
  it('sizeof on mapping', () => {
    const mv = mkMap([[mkString('a'), mkInt(1)]]);
    assert.equal(reg.call('sizeof', [mv]).value, 1);
  });
  it('sizeof on string', () => { assert.equal(reg.call('sizeof', [mkString('abc')]).value, 3); });

  it('member_array', () => {
    const arr = mkArray([mkInt(10), mkInt(20), mkInt(30)]);
    assert.equal(reg.call('member_array', [arr, mkInt(20)]).value, 1);
    assert.equal(reg.call('member_array', [arr, mkInt(99)]).value, -1);
  });

  it('sort_array', () => {
    const arr = mkArray([mkInt(3), mkInt(1), mkInt(2)]);
    const result = reg.call('sort_array', [arr]);
    assert.equal(result.value[0].value, 1);
    assert.equal(result.value[2].value, 3);
  });

  it('unique_array', () => {
    const arr = mkArray([mkInt(1), mkInt(2), mkInt(1), mkInt(3)]);
    assert.equal(reg.call('unique_array', [arr]).value.length, 3);
  });
});

describe('mapping efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('keys', () => {
    const mv = mkMap([[mkString('a'), mkInt(1)], [mkString('b'), mkInt(2)]]);
    assert.equal(reg.call('keys', [mv]).value.length, 2);
  });

  it('values', () => {
    const mv = mkMap([[mkString('a'), mkInt(1)], [mkString('b'), mkInt(2)]]);
    assert.equal(reg.call('values', [mv]).value.length, 2);
  });

  it('map_delete', () => {
    const mv = mkMap([[mkString('a'), mkInt(1)], [mkString('b'), mkInt(2)]]);
    reg.call('map_delete', [mv, mkString('a')]);
    assert.equal(mv.value.size, 1);
  });
});

describe('misc efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('typeof', () => {
    assert.equal(reg.call('typeof', [mkInt(1)]).value, 'int');
    assert.equal(reg.call('typeof', [mkString('')]).value, 'string');
    assert.equal(reg.call('typeof', [mkFloat(1.0)]).value, 'float');
    assert.equal(reg.call('typeof', [mkArray([])]).value, 'array');
  });

  it('to_int', () => {
    assert.equal(reg.call('to_int', [mkString('42')]).value, 42);
    assert.equal(reg.call('to_int', [mkFloat(3.7)]).value, 3);
  });

  it('to_string', () => { assert.equal(reg.call('to_string', [mkInt(42)]).value, '42'); });

  it('to_float', () => {
    assert.equal(reg.call('to_float', [mkInt(5)]).value, 5.0);
    assert.equal(reg.call('to_float', [mkString('3.14')]).value, 3.14);
  });

  it('random returns int in range', () => {
    const result = reg.call('random', [mkInt(100)]);
    assert.equal(result.type, T_INT);
    assert.ok(result.value >= 0 && result.value < 100);
  });

  it('time returns current timestamp', () => {
    const result = reg.call('time', []);
    assert.ok(result.value > 1000000000);
  });

  it('sprintf basic', () => {
    const result = reg.call('sprintf', [mkString('Hello %s, you are %d'), mkString('World'), mkInt(42)]);
    assert.equal(result.value, 'Hello World, you are 42');
  });
});
