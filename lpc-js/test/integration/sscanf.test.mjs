import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkString, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('sscanf efun', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('parses %d', () => {
    const result = reg.call('sscanf', [mkString('42'), mkString('%d')]);
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value[0].value, 42);
  });

  it('parses %s', () => {
    const result = reg.call('sscanf', [mkString('hello world'), mkString('%s world')]);
    assert.equal(result.value[0].value, 'hello');
  });

  it('parses multiple fields', () => {
    const result = reg.call('sscanf', [mkString('Alice 30'), mkString('%s %d')]);
    assert.equal(result.value.length, 2);
    assert.equal(result.value[0].value, 'Alice');
    assert.equal(result.value[1].value, 30);
  });

  it('parses with literal prefix', () => {
    const result = reg.call('sscanf', [mkString('age: 25'), mkString('age: %d')]);
    assert.equal(result.value[0].value, 25);
  });

  it('returns empty array on no match', () => {
    const result = reg.call('sscanf', [mkString('hello'), mkString('%d')]);
    assert.equal(result.value.length, 0);
  });
});
