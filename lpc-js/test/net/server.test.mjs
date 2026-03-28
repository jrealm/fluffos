import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Server } from '../../src/net/server.mjs';

describe('Server', () => {
  let server;
  afterEach(() => { if (server) server.close(); });

  it('listens on a port', async () => {
    server = new Server();
    await server.listen(0);
    assert.ok(server.port > 0);
  });

  it('accepts connections', async () => {
    server = new Server();
    const connections = [];
    server.onConnection = (conn) => connections.push(conn);
    await server.listen(0);

    const client = net.createConnection(server.port, '127.0.0.1');
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(connections.length, 1);
    client.end();
  });

  it('receives data from client', async () => {
    server = new Server();
    const lines = [];
    server.onConnection = (conn) => { conn.onLine = (line) => lines.push(line); };
    await server.listen(0);

    const client = net.createConnection(server.port, '127.0.0.1');
    await new Promise((resolve) => client.on('connect', resolve));
    client.write('hello\n');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(lines[0], 'hello');
    client.end();
  });

  it('sends data to client', async () => {
    server = new Server();
    server.onConnection = (conn) => { conn.send('Welcome!\n'); };
    await server.listen(0);

    const client = net.createConnection(server.port, '127.0.0.1');
    const received = [];
    client.on('data', (data) => received.push(data.toString()));
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(received.join('').includes('Welcome!'));
    client.end();
  });
});
