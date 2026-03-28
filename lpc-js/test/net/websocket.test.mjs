import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Server } from '../../src/net/server.mjs';
import { CONN_LOGGED_IN } from '../../src/net/connection.mjs';

describe('WebSocket support', () => {
  let server;
  afterEach(() => { if (server) server.close(); });

  it('accepts WebSocket connections', async () => {
    server = new Server();
    let connectedConn = null;
    server.onConnection = (conn) => { connectedConn = conn; };

    const wsPort = await server.listenWebSocket(0);

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    await new Promise(r => setTimeout(r, 50));

    assert.ok(connectedConn, 'Should have received connection');
    assert.equal(connectedConn.protocol, 'websocket');

    ws.close();
  });

  it('receives messages from WebSocket client', async () => {
    server = new Server();
    let received = null;
    server.onConnection = (conn) => {
      conn.state = CONN_LOGGED_IN;
      conn.onLine = (line) => { received = line; };
    };

    const wsPort = await server.listenWebSocket(0);

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise(r => { ws.on('open', r); });
    await new Promise(r => setTimeout(r, 50));

    ws.send('hello from ws');
    await new Promise(r => setTimeout(r, 50));

    assert.equal(received, 'hello from ws');
    ws.close();
  });

  it('sends messages to WebSocket client', async () => {
    server = new Server();
    let conn;
    server.onConnection = (c) => { conn = c; };

    const wsPort = await server.listenWebSocket(0);

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise(r => { ws.on('open', r); });
    await new Promise(r => setTimeout(r, 50));

    const msgPromise = new Promise(r => { ws.on('message', (data) => r(data.toString())); });
    conn.send('hello from server');
    const msg = await msgPromise;
    assert.equal(msg, 'hello from server');

    ws.close();
  });

  it('gmcpEnabled is true for WebSocket connections', async () => {
    server = new Server();
    let conn;
    server.onConnection = (c) => { conn = c; };

    const wsPort = await server.listenWebSocket(0);

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await new Promise(r => { ws.on('open', r); });
    await new Promise(r => setTimeout(r, 50));

    assert.equal(conn.gmcpEnabled, true);
    ws.close();
  });
});
