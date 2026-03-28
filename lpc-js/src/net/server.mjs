import net from 'node:net';
import { WebSocketServer } from 'ws';
import { Connection } from './connection.mjs';

export class Server {
  constructor() {
    this.server = null;
    this.wsServer = null;
    this.port = 0;
    this.wsPort = 0;
    this.connections = new Set();
    this.onConnection = null;
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this._handleSocket(socket));
      this.server.on('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  listenWebSocket(port) {
    return new Promise((resolve, reject) => {
      this.wsServer = new WebSocketServer({ port, host: '127.0.0.1' });
      this.wsServer.on('error', reject);
      this.wsServer.on('listening', () => {
        this.wsPort = this.wsServer.address().port;
        resolve(this.wsPort);
      });
      this.wsServer.on('connection', (ws) => {
        const conn = new Connection(ws, 'websocket');
        this.connections.add(conn);
        conn.onClose = () => { this.connections.delete(conn); };
        if (this.onConnection) this.onConnection(conn);
      });
    });
  }

  _handleSocket(socket) {
    const conn = new Connection(socket);
    this.connections.add(conn);
    conn.onClose = () => {
      this.connections.delete(conn);
    };
    if (this.onConnection) {
      this.onConnection(conn);
    }
  }

  close() {
    for (const conn of this.connections) {
      conn.close();
    }
    if (this.server) { this.server.close(); this.server = null; }
    if (this.wsServer) { this.wsServer.close(); this.wsServer = null; }
  }
}
