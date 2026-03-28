import { TelnetParser } from './telnet.mjs';

export const CONN_CONNECTED = 0;
export const CONN_LOGGED_IN = 1;
export const CONN_CLOSING = 2;

export class Connection {
  constructor(socket) {
    this.socket = socket;
    this.state = CONN_CONNECTED;
    this.object = null;
    this.inputBuffer = '';
    this.inputToCallback = null;
    this.onLine = null;
    this.onClose = null;
    this.remoteAddress = socket.remoteAddress;
    this.remotePort = socket.remotePort;

    this.telnet = new TelnetParser();
    this.telnet.onData = (buf) => this._onTelnetData(buf);
    this.telnet.onCommand = () => {};

    socket.on('data', (data) => this.telnet.feed(data));
    socket.on('end', () => this._onSocketEnd());
    socket.on('error', () => this._onSocketEnd());
  }

  _onTelnetData(buf) {
    this.inputBuffer += buf.toString('utf8');
    this._processLines();
  }

  _processLines() {
    let idx;
    while ((idx = this.inputBuffer.indexOf('\n')) >= 0) {
      const line = this.inputBuffer.slice(0, idx);
      this.inputBuffer = this.inputBuffer.slice(idx + 1);

      if (this.inputToCallback) {
        const cb = this.inputToCallback;
        this.inputToCallback = null;
        cb(line);
      } else if (this.onLine) {
        this.onLine(line);
      }
    }
  }

  _onSocketEnd() {
    this.state = CONN_CLOSING;
    if (this.onClose) this.onClose(this);
  }

  send(data) {
    if (this.state !== CONN_CLOSING && this.socket) {
      this.socket.write(data);
    }
  }

  close() {
    this.state = CONN_CLOSING;
    if (this.socket) this.socket.end();
  }

  setInputTo(callback) {
    this.inputToCallback = callback;
  }
}
