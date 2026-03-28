import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerDatabaseEfuns } from '../../src/runtime/efuns/database.mjs';
import { mkInt, mkString, mkFloat, mkArray,
         T_INT, T_STRING, T_BUFFER, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('Phase 11: bufferp and allocate_buffer', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('allocate_buffer creates a T_BUFFER', () => {
    const result = reg.call('allocate_buffer', [mkInt(10)]);
    assert.equal(result.type, T_BUFFER);
    assert.ok(Buffer.isBuffer(result.value));
    assert.equal(result.value.length, 10);
  });

  it('allocate_buffer zeroes memory', () => {
    const result = reg.call('allocate_buffer', [mkInt(5)]);
    for (let i = 0; i < 5; i++) {
      assert.equal(result.value[i], 0);
    }
  });

  it('bufferp returns 1 for buffer', () => {
    const buf = reg.call('allocate_buffer', [mkInt(5)]);
    assert.equal(reg.call('bufferp', [buf]).value, 1);
  });

  it('bufferp returns 0 for non-buffer', () => {
    assert.equal(reg.call('bufferp', [mkInt(42)]).value, 0);
    assert.equal(reg.call('bufferp', [mkString('hello')]).value, 0);
    assert.equal(reg.call('bufferp', [mkArray([])]).value, 0);
  });
});

describe('Phase 12: db_commit, db_rollback, db_status', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); registerDatabaseEfuns(reg); });

  it('db_status returns status string', () => {
    // Without any connections, should report 0
    const result = reg.call('db_status', []);
    assert.equal(result.type, T_STRING);
    assert.ok(result.value.includes('0'));
  });
});
