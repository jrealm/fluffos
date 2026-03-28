import { TelnetParser } from './telnet.mjs';

export const CONN_CONNECTED = 0;
export const CONN_LOGGED_IN = 1;
export const CONN_CLOSING = 2;

export class Connection {
  constructor(socket, protocol = 'telnet') {
    this.socket = socket;
    this.protocol = protocol;
    this.state = CONN_CONNECTED;
    this.object = null;
    this.inputBuffer = '';
    this.inputToCallback = null;
    this.onLine = null;
    this.onClose = null;
    this.lastInputTime = Date.now();
    this.snoopedBy = null;
    this.snooping = null;
    this.charMode = false;
    this.charCallback = null;
    this.gmcpEnabled = false;
    this.mxpEnabled = false;
    this.onGmcp = null;

    if (protocol === 'telnet') {
      this.remoteAddress = socket.remoteAddress;
      this.remotePort = socket.remotePort;
      this.telnet = new TelnetParser();
      this.telnet.onData = (buf) => this._onTelnetData(buf);
      this.telnet.onCommand = () => {};
      this.telnet.onSubnegotiation = (option, data) => this._onSubnegotiation(option, data);

      socket.on('data', (data) => this.telnet.feed(data));
      socket.on('end', () => this._onSocketEnd());
      socket.on('error', () => this._onSocketEnd());
    } else {
      // WebSocket
      this.remoteAddress = socket._socket?.remoteAddress ?? '0.0.0.0';
      this.remotePort = socket._socket?.remotePort ?? 0;
      this.telnet = null;
      this.gmcpEnabled = true; // WebSocket always supports structured data

      socket.on('message', (data) => {
        this.lastInputTime = Date.now();
        const msg = data.toString();

        // Check for GMCP JSON frame
        try {
          const parsed = JSON.parse(msg);
          if (parsed.gmcp && this.onGmcp) {
            this.onGmcp(parsed.gmcp, parsed.data);
            return;
          }
        } catch {}

        this.inputBuffer += msg;
        this._processLines();
      });

      socket.on('close', () => this._onSocketEnd());
      socket.on('error', () => this._onSocketEnd());
    }
  }

  _onTelnetData(buf) {
    this.lastInputTime = Date.now();
    this.inputBuffer += buf.toString('utf8');
    this._processLines();
  }

  _onSubnegotiation(option, data) {
    // GMCP = 201
    if (option === 201 && this.gmcpEnabled && this.onGmcp) {
      const str = Buffer.from(data).toString('utf8');
      const spaceIdx = str.indexOf(' ');
      if (spaceIdx >= 0) {
        const msg = str.slice(0, spaceIdx);
        let parsed;
        try { parsed = JSON.parse(str.slice(spaceIdx + 1)); } catch { parsed = str.slice(spaceIdx + 1); }
        this.onGmcp(msg, parsed);
      } else {
        this.onGmcp(str, null);
      }
    }
  }

  _processLines() {
    if (this.charMode && this.charCallback && this.inputBuffer.length > 0) {
      const ch = this.inputBuffer[0];
      this.inputBuffer = this.inputBuffer.slice(1);
      const cb = this.charCallback;
      this.charMode = false;
      this.charCallback = null;
      cb(ch);
      return;
    }

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

    // WebSocket messages may not end with \n
    if (this.protocol === 'websocket' && this.inputBuffer.length > 0 && !this.inputBuffer.includes('\n')) {
      const line = this.inputBuffer;
      this.inputBuffer = '';
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
    if (this.state === CONN_CLOSING) return;
    if (this.protocol === 'websocket') {
      if (this.socket.readyState === 1) this.socket.send(data);
    } else {
      if (this.socket) this.socket.write(data);
    }
    // Forward to snooper
    if (this.snoopedBy && this.snoopedBy.state !== CONN_CLOSING) {
      if (this.snoopedBy.protocol === 'websocket') {
        if (this.snoopedBy.socket.readyState === 1) this.snoopedBy.socket.send('% ' + data);
      } else if (this.snoopedBy.socket) {
        this.snoopedBy.socket.write('% ' + data);
      }
    }
  }

  sendGmcp(msg, data) {
    if (!this.gmcpEnabled) return;
    if (this.protocol === 'websocket') {
      const frame = JSON.stringify({ gmcp: msg, data });
      if (this.socket.readyState === 1) this.socket.send(frame);
    } else {
      const payload = data != null ? `${msg} ${JSON.stringify(data)}` : msg;
      this.sendSubnegotiation(201, payload);
    }
  }

  sendTelnetCommand(cmd, option) {
    if (this.protocol !== 'telnet' || !this.socket) return;
    this.socket.write(Buffer.from([255, cmd, option]));
  }

  sendSubnegotiation(option, data) {
    if (this.protocol !== 'telnet' || !this.socket) return;
    const payload = Buffer.from(data, 'utf8');
    const buf = Buffer.alloc(5 + payload.length);
    buf[0] = 255; // IAC
    buf[1] = 250; // SB
    buf[2] = option;
    payload.copy(buf, 3);
    buf[3 + payload.length] = 255; // IAC
    buf[4 + payload.length] = 240; // SE
    this.socket.write(buf);
  }

  close() {
    this.state = CONN_CLOSING;
    if (this.protocol === 'websocket') {
      if (this.socket.readyState === 1) this.socket.close();
    } else {
      if (this.socket) this.socket.end();
    }
  }

  setInputTo(callback) {
    this.inputToCallback = callback;
  }
}
