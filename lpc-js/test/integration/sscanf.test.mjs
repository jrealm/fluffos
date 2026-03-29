import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkString, mkInt, T_INT } from '../../src/vm/svalue.mjs';

describe('sscanf efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('parses %d — returns integer count of assignments', () => {
    const v = mkInt(0);
    const result = reg.call('sscanf', [mkString('42'), mkString('%d'), v]);
    assert.equal(result.type, T_INT);
    assert.equal(result.value, 1);
    assert.equal(v.value, 42);
  });

  it('parses %s', () => {
    const v = mkInt(0);
    const result = reg.call('sscanf', [mkString('hello world'), mkString('%s world'), v]);
    assert.equal(result.value, 1);
    assert.equal(v.value, 'hello');
  });

  it('parses multiple fields', () => {
    const v1 = mkInt(0), v2 = mkInt(0);
    const result = reg.call('sscanf', [mkString('Alice 30'), mkString('%s %d'), v1, v2]);
    assert.equal(result.value, 2);
    assert.equal(v1.value, 'Alice');
    assert.equal(v2.value, 30);
  });

  it('parses with literal prefix', () => {
    const v = mkInt(0);
    const result = reg.call('sscanf', [mkString('age: 25'), mkString('age: %d'), v]);
    assert.equal(result.value, 1);
    assert.equal(v.value, 25);
  });

  it('returns 0 on no match', () => {
    const v = mkInt(0);
    const result = reg.call('sscanf', [mkString('hello'), mkString('%d'), v]);
    assert.equal(result.value, 0);
  });

  it('returns 1 for suppressed %*s (matched but not assigned)', () => {
    // %*s matches and counts toward matchCount even though no variable is assigned.
    // This matches FluffOS behavior: if(sscanf(str, "prefix%*s")) tests prefix match.
    const result = reg.call('sscanf', [mkString('/log/USAGE'), mkString('/log/%*s')]);
    assert.equal(result.type, T_INT);
    assert.equal(result.value, 1);
  });
});
