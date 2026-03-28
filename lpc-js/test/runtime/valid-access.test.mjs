import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { T_STRING, T_INT } from '../../src/vm/svalue.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function makeDriverWithSecurity(mode, extraFiles = {}) {
  const masterSource = mode === 'deny'
    ? `
      void create() {}
      mixed valid_read(string p, object ob, string func) { return 0; }
      mixed valid_write(string p, object ob, string func) { return 0; }
    `
    : mode === 'remap'
    ? `
      void create() {}
      mixed valid_read(string p, object ob, string func) { return "/alt" + p; }
      mixed valid_write(string p, object ob, string func) { return "/alt" + p; }
    `
    : `
      void create() {}
      mixed valid_read(string p, object ob, string func) { return 1; }
      mixed valid_write(string p, object ob, string func) { return 1; }
    `;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-valid-'));
  fs.writeFileSync(path.join(tmpDir, 'testfile.txt'), 'hello world');

  const files = { '/master.c': masterSource, ...extraFiles };
  const driver = new Driver(
    {
      'name': 'TestMUD',
      'mudlib directory': tmpDir,
      'master file': '/master',
    },
    {
      readFile: (p) => {
        const key = p.endsWith('.c') ? p : p + '.c';
        if (files[key]) return files[key];
        const resolved = path.join(tmpDir, p.replace(/^\//, ''));
        return fs.readFileSync(resolved, 'utf8');
      },
    }
  );
  driver.master = driver.objects.load('/master');
  return { driver, tmpDir };
}

describe('valid_read / valid_write', () => {
  it('allows file read when valid_read returns 1', () => {
    const { driver } = makeDriverWithSecurity('allow');
    const result = driver.efuns.call('read_file', [
      { type: T_STRING, value: '/testfile.txt' },
    ]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'hello world');
  });

  it('rejects file read when valid_read returns 0', () => {
    const { driver } = makeDriverWithSecurity('deny');
    assert.throws(() => {
      driver.efuns.call('read_file', [
        { type: T_STRING, value: '/testfile.txt' },
      ]);
    }, /permission denied|valid_read/i);
  });

  it('rejects write_file when valid_write returns 0', () => {
    const { driver } = makeDriverWithSecurity('deny');
    assert.throws(() => {
      driver.efuns.call('write_file', [
        { type: T_STRING, value: '/newfile.txt' },
        { type: T_STRING, value: 'data' },
      ]);
    }, /permission denied|valid_write/i);
  });

  it('rejects rm when valid_write returns 0', () => {
    const { driver } = makeDriverWithSecurity('deny');
    assert.throws(() => {
      driver.efuns.call('rm', [
        { type: T_STRING, value: '/testfile.txt' },
      ]);
    }, /permission denied|valid_write/i);
  });

  it('rejects file_size when valid_read returns 0', () => {
    const { driver } = makeDriverWithSecurity('deny');
    assert.throws(() => {
      driver.efuns.call('file_size', [
        { type: T_STRING, value: '/testfile.txt' },
      ]);
    }, /permission denied|valid_read/i);
  });
});

describe('checkSocketAccess', () => {
  it('rejects when valid_socket returns 0', () => {
    const { driver } = makeDriverWithSecurity('allow', {
      '/master.c': `
        void create() {}
        mixed valid_read(string p, object ob, string func) { return 1; }
        mixed valid_write(string p, object ob, string func) { return 1; }
        int valid_socket(object ob, string func) { return 0; }
      `,
    });
    const allowed = driver.checkSocketAccess('socket_create', []);
    assert.equal(allowed, false);
  });

  it('allows when valid_socket returns 1', () => {
    const { driver } = makeDriverWithSecurity('allow', {
      '/master.c': `
        void create() {}
        mixed valid_read(string p, object ob, string func) { return 1; }
        mixed valid_write(string p, object ob, string func) { return 1; }
        int valid_socket(object ob, string func) { return 1; }
      `,
    });
    const allowed = driver.checkSocketAccess('socket_create', []);
    assert.equal(allowed, true);
  });

  it('allows when master is not loaded yet', () => {
    const { driver } = makeDriverWithSecurity('deny');
    driver.master = null;
    const allowed = driver.checkSocketAccess('socket_create', []);
    assert.equal(allowed, true);
  });
});
