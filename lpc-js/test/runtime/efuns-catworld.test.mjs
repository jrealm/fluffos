import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { mkInt, mkString, mkArray,
         T_INT, T_STRING, T_BUFFER, T_ARRAY, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('CatWorld blocker fixes: base64_encode / base64_decode', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('base64_encode encodes a string', () => {
    const result = reg.call('base64_encode', [mkString('Hello')]);
    assert.equal(result.value, 'SGVsbG8=');
  });

  it('base64_encode encodes binary data', () => {
    const buf = reg.call('allocate_buffer', [mkInt(3)]);
    buf.value[0] = 0x01; buf.value[1] = 0x02; buf.value[2] = 0x03;
    const result = reg.call('base64_encode', [buf]);
    assert.equal(result.type, T_STRING);
    assert.equal(result.value, 'AQID');
  });

  it('base64_decode returns buffer', () => {
    const result = reg.call('base64_decode', [mkString('SGVsbG8=')]);
    assert.equal(result.type, T_BUFFER);
    assert.equal(result.value.toString(), 'Hello');
  });

  it('round-trips correctly', () => {
    const original = 'CatWorld MUD 2026';
    const encoded = reg.call('base64_encode', [mkString(original)]);
    const decoded = reg.call('base64_decode', [encoded]);
    assert.equal(decoded.value.toString(), original);
  });
});

describe('CatWorld blocker fixes: sha1', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('sha1 returns 20-byte buffer', () => {
    const result = reg.call('sha1', [mkString('test')]);
    assert.equal(result.type, T_BUFFER);
    assert.equal(result.value.length, 20);
  });

  it('sha1 produces correct digest', () => {
    // SHA1 of empty string = da39a3ee5e6b4b0d3255bfef95601890afd80709
    const result = reg.call('sha1', [mkString('')]);
    assert.equal(result.value.toString('hex'), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('sha1 works with WebSocket key pattern', () => {
    // Simulates login.c WebSocket handshake
    const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const result = reg.call('sha1', [mkString(clientKey + magic)]);
    assert.equal(result.type, T_BUFFER);
    assert.equal(result.value.length, 20);
    // Encode the sha1 result in base64
    const b64 = reg.call('base64_encode', [result]);
    assert.equal(b64.value, 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });
});

describe('CatWorld blocker fixes: current_time_millis', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('returns millisecond timestamp', () => {
    const before = Date.now();
    const result = reg.call('current_time_millis', []);
    const after = Date.now();
    assert.equal(result.type, T_INT);
    assert.ok(result.value >= before);
    assert.ok(result.value <= after);
  });

  it('is more precise than time()', () => {
    const millis = reg.call('current_time_millis', []).value;
    const seconds = reg.call('time', []).value;
    assert.ok(millis >= seconds * 1000);
    assert.ok(millis < (seconds + 1) * 1000);
  });
});

describe('CatWorld blocker fixes: filter/map generic', () => {
  let reg;
  beforeEach(() => { reg = new EfunRegistry(); reg.loadDefaults(); });

  it('filter is registered', () => {
    assert.ok(reg.has('filter'));
  });

  it('map is registered', () => {
    assert.ok(reg.has('map'));
  });
});

describe('CatWorld blocker fixes: new() syntax', () => {
  it('parser converts new() to clone_object() call', async () => {
    const { parse } = await import('../../src/compiler/parser.mjs');
    const ast = parse('object f() { return new("/obj/test"); }');
    const stmts = ast.body[0].body.statements;
    const callExpr = stmts[0].value;
    assert.equal(callExpr.type, 'CallExpression');
    assert.equal(callExpr.name, 'clone_object');
    assert.equal(callExpr.args[0].value, '/obj/test');
  });

  it('parser handles new() with arguments', async () => {
    const { parse } = await import('../../src/compiler/parser.mjs');
    const ast = parse('object f() { return new("/obj/test", 1, "arg"); }');
    const stmts = ast.body[0].body.statements;
    const callExpr = stmts[0].value;
    assert.equal(callExpr.name, 'clone_object');
    assert.equal(callExpr.args.length, 3);
  });

  it('new(class X) produces NewClassExpression', async () => {
    const { parse } = await import('../../src/compiler/parser.mjs');
    const ast = parse('void f() { new(class Foo); }');
    const stmts = ast.body[0].body.statements;
    const expr = stmts[0].expression;
    assert.equal(expr.type, 'NewClassExpression');
  });
});
