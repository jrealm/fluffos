import net from 'node:net';
import dgram from 'node:dgram';

export const SOCKET_MODE = {
  MUD: 0, STREAM: 1, DATAGRAM: 2, STREAM_BINARY: 3, DATAGRAM_BINARY: 4,
};

export const SOCKET_STATE = {
  CLOSED: 0, UNBOUND: 1, BOUND: 2, LISTEN: 3, DATA_XFER: 4,
};

export const EESUCCESS = 0;
export const EESOCKET = -1;
export const EEFDRANGE = -2;
export const EEBADF = -3;
export const EESECURITY = -4;
export const EEISBOUND = -5;
export const EEADDRINUSE = -6;
export const EEBIND = -7;
export const EEMODENOTSUPP = -8;
export const EENOADDR = -9;
export const EEISCONN = -10;
export const EELISTEN = -11;
export const EENOTLISTN = -12;
export const EEWOULDBLOCK = -13;
export const EECONNREFUSED = -14;
export const EECONNECT = -15;
export const EENOTCONN = -16;
export const EESEND = -17;
export const EEBADADDR = -18;
export const EEBADDATA = -19;

const ERROR_MESSAGES = {
  [EESUCCESS]: 'Success',
  [EESOCKET]: 'Problem creating socket',
  [EEFDRANGE]: 'Descriptor out of range',
  [EEBADF]: 'Bad file descriptor',
  [EESECURITY]: 'Security violation',
  [EEISBOUND]: 'Socket already bound',
  [EEADDRINUSE]: 'Address already in use',
  [EEBIND]: 'Problem with bind',
  [EEMODENOTSUPP]: 'Socket mode not supported',
  [EENOADDR]: 'Socket not bound to an address',
  [EEISCONN]: 'Socket is already connected',
  [EELISTEN]: 'Problem with listen',
  [EENOTLISTN]: 'Socket is not listening',
  [EEWOULDBLOCK]: 'Operation would block',
  [EECONNREFUSED]: 'Connection refused',
  [EECONNECT]: 'Problem with connect',
  [EENOTCONN]: 'Socket not connected',
  [EESEND]: 'Problem sending data',
  [EEBADADDR]: 'Bad address format',
  [EEBADDATA]: 'Bad data',
};

class LpcSocket {
  constructor(fd, mode, owner, readCb, closeCb) {
    this.fd = fd;
    this.mode = mode;
    this.state = SOCKET_STATE.UNBOUND;
    this.owner = owner;
    this.handle = null;
    this.server = null;
    this.readCb = readCb;
    this.writeCb = null;
    this.closeCb = closeCb;
    this.localPort = 0;
    this.localAddr = '0.0.0.0';
    this.remoteAddr = '';
    this.remotePort = 0;
    this.rBuf = Buffer.alloc(0);
    this.rExpected = -1;
    this._pendingClients = [];
  }
}

export class LpcSocketManager {
  constructor() {
    this.sockets = new Map();
    this.nextFd = 0;
  }

  get(fd) {
    return this.sockets.get(fd) ?? null;
  }

  create(mode, owner, readCb, closeCb) {
    const fd = this.nextFd++;
    const sock = new LpcSocket(fd, mode, owner, readCb, closeCb);
    this.sockets.set(fd, sock);

    if (mode === SOCKET_MODE.DATAGRAM || mode === SOCKET_MODE.DATAGRAM_BINARY) {
      this._initDatagram(sock);
    }

    return fd;
  }

  bind(fd, port, addr) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.state !== SOCKET_STATE.UNBOUND) return EEISBOUND;

    sock.localPort = port;
    sock.localAddr = addr ?? '0.0.0.0';
    sock.state = SOCKET_STATE.BOUND;
    return EESUCCESS;
  }

  listen(fd, listenCb) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.state !== SOCKET_STATE.BOUND) return EENOADDR;
    if (sock.mode === SOCKET_MODE.DATAGRAM || sock.mode === SOCKET_MODE.DATAGRAM_BINARY) {
      return EEMODENOTSUPP;
    }

    sock.readCb = listenCb;
    sock.server = net.createServer((clientSocket) => {
      sock._pendingClients.push(clientSocket);
      if (typeof sock.readCb === 'function') sock.readCb(fd);
    });

    sock.server.listen(sock.localPort, sock.localAddr, () => {
      sock.localPort = sock.server.address().port;
    });

    sock.state = SOCKET_STATE.LISTEN;
    return EESUCCESS;
  }

  accept(fd, readCb, writeCb) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.state !== SOCKET_STATE.LISTEN) return EENOTLISTN;

    const clientSocket = sock._pendingClients.shift();
    if (!clientSocket) return EEWOULDBLOCK;

    const newFd = this.nextFd++;
    const newSock = new LpcSocket(newFd, sock.mode, sock.owner, readCb, sock.closeCb);
    newSock.writeCb = writeCb;
    newSock.handle = clientSocket;
    newSock.state = SOCKET_STATE.DATA_XFER;
    newSock.remoteAddr = clientSocket.remoteAddress?.replace(/^::ffff:/, '') ?? '';
    newSock.remotePort = clientSocket.remotePort ?? 0;

    this._setupDataHandler(newSock);
    this.sockets.set(newFd, newSock);
    return newFd;
  }

  connect(fd, addrStr, readCb, writeCb) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;
    if (sock.mode === SOCKET_MODE.DATAGRAM || sock.mode === SOCKET_MODE.DATAGRAM_BINARY) {
      return EEMODENOTSUPP;
    }

    const parts = addrStr.split(' ');
    if (parts.length !== 2) return EEBADADDR;
    const [host, portStr] = parts;
    const port = parseInt(portStr, 10);
    if (isNaN(port)) return EEBADADDR;

    sock.readCb = readCb;
    sock.writeCb = writeCb;

    sock.handle = net.createConnection({ host, port }, () => {
      sock.state = SOCKET_STATE.DATA_XFER;
      sock.remoteAddr = host;
      sock.remotePort = port;
      if (typeof sock.writeCb === 'function') sock.writeCb(fd);
    });

    sock.handle.on('error', () => {
      if (typeof sock.closeCb === 'function') sock.closeCb(fd);
    });

    this._setupDataHandler(sock);
    return EESUCCESS;
  }

  write(fd, data, addr) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;

    if (sock.mode === SOCKET_MODE.DATAGRAM || sock.mode === SOCKET_MODE.DATAGRAM_BINARY) {
      if (!sock.handle) return EENOTCONN;
      if (!addr) return EEBADADDR;
      const parts = addr.split(' ');
      if (parts.length !== 2) return EEBADADDR;
      const buf = Buffer.from(typeof data === 'string' ? data : String(data), 'utf8');
      sock.handle.send(buf, parseInt(parts[1], 10), parts[0]);
      return EESUCCESS;
    }

    if (sock.state !== SOCKET_STATE.DATA_XFER) return EENOTCONN;
    if (!sock.handle) return EENOTCONN;

    if (sock.mode === SOCKET_MODE.MUD) {
      const payload = Buffer.from(typeof data === 'string' ? data : String(data), 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length, 0);
      sock.handle.write(Buffer.concat([header, payload]));
    } else {
      sock.handle.write(typeof data === 'string' ? data : String(data));
    }
    return EESUCCESS;
  }

  close(fd) {
    const sock = this.sockets.get(fd);
    if (!sock) return EEBADF;

    if (sock.server) { sock.server.close(); sock.server = null; }
    if (sock.handle) {
      if (sock.handle.end) sock.handle.end();
      else if (sock.handle.close) sock.handle.close();
      sock.handle = null;
    }
    sock.state = SOCKET_STATE.CLOSED;
    this.sockets.delete(fd);
    return EESUCCESS;
  }

  address(fd) {
    const sock = this.sockets.get(fd);
    if (!sock) return '';
    return `${sock.remoteAddr} ${sock.remotePort}`;
  }

  errorString(code) {
    return ERROR_MESSAGES[code] ?? `Unknown error: ${code}`;
  }

  closeAll() {
    for (const [fd] of this.sockets) {
      this.close(fd);
    }
  }

  _setupDataHandler(sock) {
    if (!sock.handle) return;

    if (sock.mode === SOCKET_MODE.MUD) {
      sock.handle.on('data', (buf) => this._handleMudData(sock, buf));
    } else {
      sock.handle.on('data', (buf) => {
        if (typeof sock.readCb === 'function') {
          sock.readCb(sock.fd, buf.toString('utf8'));
        }
      });
    }

    sock.handle.on('end', () => {
      if (typeof sock.closeCb === 'function') sock.closeCb(sock.fd);
    });

    sock.handle.on('error', () => {});
  }

  _handleMudData(sock, buf) {
    sock.rBuf = Buffer.concat([sock.rBuf, buf]);

    while (sock.rBuf.length >= 4) {
      if (sock.rExpected < 0) {
        sock.rExpected = sock.rBuf.readUInt32BE(0);
        sock.rBuf = sock.rBuf.subarray(4);
      }

      if (sock.rBuf.length < sock.rExpected) break;

      const payload = sock.rBuf.subarray(0, sock.rExpected).toString('utf8');
      sock.rBuf = sock.rBuf.subarray(sock.rExpected);
      sock.rExpected = -1;

      if (typeof sock.readCb === 'function') {
        sock.readCb(sock.fd, payload);
      }
    }
  }

  _initDatagram(sock) {
    sock.handle = dgram.createSocket('udp4');
    sock.handle.on('message', (msg, rinfo) => {
      const addr = `${rinfo.address} ${rinfo.port}`;
      if (typeof sock.readCb === 'function') {
        sock.readCb(sock.fd, msg.toString('utf8'), addr);
      }
    });
    sock.handle.on('error', () => {
      if (typeof sock.closeCb === 'function') sock.closeCb(sock.fd);
    });
  }

  bindDatagram(sock) {
    return new Promise((resolve) => {
      sock.handle.bind(sock.localPort, sock.localAddr, () => {
        sock.localPort = sock.handle.address().port;
        resolve();
      });
    });
  }
}
