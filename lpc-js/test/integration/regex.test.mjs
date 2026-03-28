import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkString, mkInt, mkArray, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('regexp efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('filters array by pattern', () => {
    const arr = mkArray([mkString('foo.c'), mkString('bar.h'), mkString('baz.c')]);
    const result = reg.call('regexp', [arr, mkString('\\.c$')]);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].value, 'foo.c');
  });

  it('returns empty array when no match', () => {
    const result = reg.call('regexp', [mkArray([mkString('foo')]), mkString('^zzz')]);
    assert.equal(result.value.length, 0);
  });
});

describe('reg_assoc efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('splits string by patterns', () => {
    const result = reg.call('reg_assoc', [
      mkString('hello 123 world'),
      mkArray([mkString('[0-9]+'), mkString('[a-z]+')]),
      mkArray([mkInt(1), mkInt(2)]),
    ]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 2);
    const fragTexts = result.value[0].value.map(f => f.value);
    assert.ok(fragTexts.includes('hello'));
    assert.ok(fragTexts.includes('123'));
    assert.ok(fragTexts.includes('world'));
  });

  it('returns unmatched parts with token 0', () => {
    const result = reg.call('reg_assoc', [
      mkString('abc 42 def'),
      mkArray([mkString('[0-9]+')]),
      mkArray([mkInt(1)]),
    ]);
    const fragTexts = result.value[0].value.map(f => f.value);
    const tokenNums = result.value[1].value.map(t => t.value);
    const idx42 = fragTexts.indexOf('42');
    assert.ok(idx42 >= 0);
    assert.equal(tokenNums[idx42], 1);
  });

  it('handles no matches', () => {
    const result = reg.call('reg_assoc', [
      mkString('hello'),
      mkArray([mkString('[0-9]+')]),
      mkArray([mkInt(1)]),
    ]);
    assert.equal(result.value[0].value.length, 1);
    assert.equal(result.value[0].value[0].value, 'hello');
  });
});

describe('pcre_match efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('returns 1 on match', () => {
    assert.equal(reg.call('pcre_match', [mkString('hello123'), mkString('[0-9]+')]).value, 1);
  });
  it('returns 0 on no match', () => {
    assert.equal(reg.call('pcre_match', [mkString('hello'), mkString('^[0-9]+$')]).value, 0);
  });
});
