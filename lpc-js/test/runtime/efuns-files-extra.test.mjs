import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerFileEfuns } from '../../src/runtime/efuns/files.mjs';
import { mkInt, mkString, T_STRING } from '../../src/vm/svalue.mjs';

describe('file efuns extra', () => {
  let reg, tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-test-'));
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerFileEfuns(reg, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('read_bytes and write_bytes', () => {
    it('read bytes at offset', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.dat'), 'Hello World');
      const result = reg.call('read_bytes', [mkString('/test.dat'), mkInt(6), mkInt(5)]);
      assert.equal(result.type, T_STRING);
      assert.equal(result.value, 'World');
    });

    it('read_bytes from start', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.dat'), 'ABCDE');
      const result = reg.call('read_bytes', [mkString('/test.dat'), mkInt(0), mkInt(3)]);
      assert.equal(result.value, 'ABC');
    });

    it('write_bytes at offset', () => {
      fs.writeFileSync(path.join(tmpDir, 'test.dat'), 'Hello World');
      reg.call('write_bytes', [mkString('/test.dat'), mkInt(6), mkString('LPC!!')]);
      const content = fs.readFileSync(path.join(tmpDir, 'test.dat'), 'utf8');
      assert.equal(content, 'Hello LPC!!');
    });
  });

  describe('cp', () => {
    it('copies a file', () => {
      fs.writeFileSync(path.join(tmpDir, 'src.txt'), 'copy me');
      const result = reg.call('cp', [mkString('/src.txt'), mkString('/dst.txt')]);
      assert.equal(result.value, 0);
      assert.equal(fs.readFileSync(path.join(tmpDir, 'dst.txt'), 'utf8'), 'copy me');
    });

    it('returns -1 for missing source', () => {
      const result = reg.call('cp', [mkString('/nope.txt'), mkString('/dst.txt')]);
      assert.equal(result.value, -1);
    });
  });

  describe('rename', () => {
    it('renames a file', () => {
      fs.writeFileSync(path.join(tmpDir, 'old.txt'), 'data');
      const result = reg.call('rename', [mkString('/old.txt'), mkString('/new.txt')]);
      assert.equal(result.value, 0);
      assert.ok(!fs.existsSync(path.join(tmpDir, 'old.txt')));
      assert.equal(fs.readFileSync(path.join(tmpDir, 'new.txt'), 'utf8'), 'data');
    });

    it('returns -1 for missing source', () => {
      const result = reg.call('rename', [mkString('/nope.txt'), mkString('/dst.txt')]);
      assert.equal(result.value, -1);
    });
  });
});
