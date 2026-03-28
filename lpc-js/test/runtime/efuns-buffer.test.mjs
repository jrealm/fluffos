import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString,
         T_INT, T_BUFFER, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('Phase 11.2: Buffer efuns', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  describe('read_buffer', () => {
    it('reads a slice of a buffer', () => {
      const buf = reg.call('allocate_buffer', [mkInt(10)]);
      buf.value[3] = 42;
      buf.value[4] = 99;
      const slice = reg.call('read_buffer', [buf, mkInt(3), mkInt(2)]);
      assert.equal(slice.type, T_BUFFER);
      assert.equal(slice.value.length, 2);
      assert.equal(slice.value[0], 42);
      assert.equal(slice.value[1], 99);
    });

    it('reads entire buffer with defaults', () => {
      const buf = reg.call('allocate_buffer', [mkInt(5)]);
      const slice = reg.call('read_buffer', [buf]);
      assert.equal(slice.value.length, 5);
    });
  });

  describe('write_buffer', () => {
    it('writes integer byte to buffer', () => {
      const buf = reg.call('allocate_buffer', [mkInt(5)]);
      reg.call('write_buffer', [buf, mkInt(2), mkInt(0xAB)]);
      assert.equal(buf.value[2], 0xAB);
    });

    it('writes string to buffer', () => {
      const buf = reg.call('allocate_buffer', [mkInt(10)]);
      reg.call('write_buffer', [buf, mkInt(0), mkString('Hi')]);
      assert.equal(buf.value[0], 72); // 'H'
      assert.equal(buf.value[1], 105); // 'i'
    });

    it('writes buffer to buffer', () => {
      const src = reg.call('allocate_buffer', [mkInt(3)]);
      src.value[0] = 1; src.value[1] = 2; src.value[2] = 3;
      const dst = reg.call('allocate_buffer', [mkInt(5)]);
      reg.call('write_buffer', [dst, mkInt(1), src]);
      assert.equal(dst.value[1], 1);
      assert.equal(dst.value[2], 2);
      assert.equal(dst.value[3], 3);
    });
  });

  describe('allocate_buffer bounds', () => {
    it('rejects negative size', () => {
      const result = reg.call('allocate_buffer', [mkInt(-1)]);
      assert.equal(result.value, 0);
    });

    it('rejects size over 65536', () => {
      const result = reg.call('allocate_buffer', [mkInt(100000)]);
      assert.equal(result.value, 0);
    });
  });
});

describe('Phase 12: compress/uncompress', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('compress and uncompress round-trips', () => {
    const original = mkString('Hello, World! This is a test of compression.');
    const compressed = reg.call('compress', [original]);
    assert.equal(compressed.type, T_BUFFER);
    assert.ok(compressed.value.length > 0);

    const decompressed = reg.call('uncompress', [compressed]);
    assert.equal(decompressed.type, T_BUFFER);
    assert.equal(decompressed.value.toString(), 'Hello, World! This is a test of compression.');
  });

  it('compress returns buffer', () => {
    const result = reg.call('compress', [mkString('test')]);
    assert.equal(result.type, T_BUFFER);
  });
});
