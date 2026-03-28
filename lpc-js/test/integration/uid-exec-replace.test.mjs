import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';
import { apply } from '../../src/runtime/apply.mjs';
import { mkString, mkInt, T_OBJECT, T_STRING } from '../../src/vm/svalue.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';
import { Program } from '../../src/vm/program.mjs';
import { Connection } from '../../src/net/connection.mjs';
import { EventEmitter } from 'node:events';

function mockSocket() {
  const sock = new EventEmitter();
  sock.written = [];
  sock.write = (data) => sock.written.push(data);
  sock.end = () => {};
  sock.remoteAddress = '127.0.0.1';
  sock.remotePort = 12345;
  return sock;
}

describe('UID permission system', () => {
  function createDriver() {
    const files = {
      '/master.c': 'void create() { }',
      '/adm/test.c': 'void create() { }',
      '/std/object.c': 'void create() { }',
    };
    return new Driver(
      { 'name': 'Test', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (p) => files[p] ?? files[p + '.c'] ?? files[p.replace(/\.c$/, '')] ?? null },
    );
  }

  it('getuid returns object uid', () => {
    const d = createDriver();
    const obj = d.objects.load('/adm/test.c');
    const result = d.efuns.call('getuid', [{ type: T_OBJECT, value: obj }]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'adm');
  });

  it('geteuid returns object euid', () => {
    const d = createDriver();
    const obj = d.objects.load('/adm/test.c');
    assert.equal(d.efuns.call('geteuid', [{ type: T_OBJECT, value: obj }]).value, 'adm');
  });

  it('seteuid changes euid', () => {
    const d = createDriver();
    const obj = d.objects.load('/adm/test.c');
    d.currentObject = obj;
    d.efuns.call('seteuid', [mkString('new_euid')]);
    assert.equal(obj.euid, 'new_euid');
    d.currentObject = null;
  });

  it('clone inherits uid from master', () => {
    const d = createDriver();
    const clone = d.objects.clone('/adm/test.c');
    assert.equal(clone.uid, 'adm');
  });
});

describe('exec() socket transfer', () => {
  it('transfers interactive connection', () => {
    const d = new Driver(
      { 'name': 'Test', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (p) => p.includes('master') ? 'void create() {}' : null },
    );
    d.objects.load('/master.c');

    const prog = new Program('/a.c');
    const from = new LpcObject('/a.c', prog);
    const to = new LpcObject('/b.c', prog);

    const conn = new Connection(mockSocket());
    from.interactive = conn;
    conn.object = from;

    const result = d.efuns.call('exec', [
      { type: T_OBJECT, value: to },
      { type: T_OBJECT, value: from },
    ]);
    assert.equal(result.value, 1);
    assert.equal(to.interactive, conn);
    assert.equal(from.interactive, null);
    assert.equal(conn.object, to);
  });
});

describe('replace_program', () => {
  it('schedules program replacement', () => {
    const files = {
      '/master.c': 'void create() { }',
      '/base.c': 'int get_val() { return 1; }\nvoid create() { }',
      '/replacement.c': 'int get_val() { return 99; }\nvoid create() { }',
    };
    const d = new Driver(
      { 'name': 'Test', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (p) => files[p] ?? files[p + '.c'] ?? files[p.replace(/\.c$/, '')] ?? null },
    );
    d.objects.load('/master.c');
    const obj = d.objects.load('/base.c');

    // Before replacement
    assert.equal(apply('get_val', obj, []).value, 1);

    // Schedule replacement
    d.currentObject = obj;
    d.efuns.call('replace_program', [mkString('/replacement')]);
    d.currentObject = null;

    assert.ok(obj.replaceProgramPending);

    // Apply via mainLoop
    d.mainLoop();

    // After replacement
    assert.equal(apply('get_val', obj, []).value, 99);
  });
});

describe('extra efuns', () => {
  function createDriver() {
    const files = {
      '/master.c': 'void create() { }',
      '/player.c': 'void create() { }\nvoid logon() { }',
    };
    return new Driver(
      { 'name': 'Test', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (p) => files[p] ?? files[p + '.c'] ?? files[p.replace(/\.c$/, '')] ?? null },
    );
  }

  it('users returns empty when no interactive', () => {
    const d = createDriver();
    d.objects.load('/master.c');
    const result = d.efuns.call('users', []);
    assert.equal(result.value.length, 0);
  });

  it('find_living finds by living name', () => {
    const d = createDriver();
    d.objects.load('/master.c');
    const obj = d.objects.load('/player.c');
    obj.livingName = 'testplayer';
    const result = d.efuns.call('find_living', [mkString('testplayer')]);
    assert.equal(result.type, T_OBJECT);
    assert.equal(result.value, obj);
  });

  it('find_living returns 0 for unknown', () => {
    const d = createDriver();
    d.objects.load('/master.c');
    assert.equal(d.efuns.call('find_living', [mkString('nobody')]).value, 0);
  });

  it('inherits checks inheritance', () => {
    const files = {
      '/master.c': 'void create() { }',
      '/parent.c': 'void create() { }',
      '/child.c': 'inherit "/parent";\nvoid create() { }',
    };
    const d = new Driver(
      { 'name': 'Test', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (p) => files[p] ?? files[p + '.c'] ?? files[p.replace(/\.c$/, '')] ?? null },
    );
    d.objects.load('/master.c');
    const child = d.objects.load('/child.c');
    assert.equal(d.efuns.call('inherits', [mkString('/parent.c'), { type: T_OBJECT, value: child }]).value, 1);
    assert.equal(d.efuns.call('inherits', [mkString('/nope.c'), { type: T_OBJECT, value: child }]).value, 0);
  });

  it('log_file appends to log', () => {
    // Just verify it doesn't crash
    const d = createDriver();
    d.objects.load('/master.c');
    d.efuns.call('log_file', [mkString('test.log'), mkString('test message\n')]);
  });
});
