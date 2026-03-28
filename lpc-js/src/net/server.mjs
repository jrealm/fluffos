import net from 'node:net';
import { Connection } from './connection.mjs';

export class Server {
  constructor() {
    this.server = null;
    this.port = 0;
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
    if (this.server) {
      for (const conn of this.connections) {
        conn.close();
      }
      this.server.close();
      this.server = null;
    }
  }
}
