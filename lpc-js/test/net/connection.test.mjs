import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Connection, CONN_CONNECTED, CONN_CLOSING } from '../../src/net/connection.mjs';
import { EventEmitter } from 'node:events';

function mockSocket() {
  const sock = new EventEmitter();
  sock.written = [];
  sock.write = (data) => sock.written.push(data);
  sock.end = () => { sock.ended = true; };
  sock.destroy = () => { sock.destroyed = true; };
  sock.remoteAddress = '127.0.0.1';
  sock.remotePort = 12345;
  return sock;
}

describe('Connection', () => {
  it('constructs with socket', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    assert.equal(conn.state, CONN_CONNECTED);
    assert.equal(conn.object, null);
    assert.equal(conn.remoteAddress, '127.0.0.1');
  });

  it('buffers lines from socket data', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('hello\n'));
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'hello');
  });

  it('handles partial lines across data events', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('hel'));
    assert.equal(lines.length, 0);
    sock.emit('data', Buffer.from('lo\n'));
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'hello');
  });

  it('handles multiple lines in one data event', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('a\nb\nc\n'));
    assert.deepEqual(lines, ['a', 'b', 'c']);
  });

  it('strips telnet IAC from data', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from([0x68, 0x69, 255, 251, 1, 0x0A]));
    assert.equal(lines[0], 'hi');
  });

  it('send writes to socket', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    conn.send('Hello!\n');
    assert.equal(sock.written.length, 1);
    assert.equal(sock.written[0], 'Hello!\n');
  });

  it('close ends connection', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    conn.close();
    assert.equal(conn.state, CONN_CLOSING);
    assert.ok(sock.ended);
  });

  it('input_to sets callback', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const results = [];
    conn.setInputTo((line) => results.push(line));
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('test\n'));
    assert.equal(results.length, 1);
    assert.equal(results[0], 'test');
    assert.equal(lines.length, 0);
  });

  it('input_to is consumed after one call', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const results = [];
    conn.setInputTo((line) => results.push(line));
    sock.emit('data', Buffer.from('first\n'));
    sock.emit('data', Buffer.from('second\n'));
    assert.equal(results.length, 1);
    assert.equal(results[0], 'first');
  });
});
