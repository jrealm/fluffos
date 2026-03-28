import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LpcSocketManager, SOCKET_MODE, SOCKET_STATE, EESUCCESS, EEBADF, EEMODENOTSUPP, EENOTCONN, EENOADDR } from '../../src/net/lpc-socket.mjs';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerSocketEfuns } from '../../src/runtime/efuns/sockets.mjs';
import { mkInt, mkString, SVALUE_ZERO } from '../../src/vm/svalue.mjs';

describe('LpcSocketManager', () => {
  let mgr;
  beforeEach(() => { mgr = new LpcSocketManager(); });
  afterEach(() => { mgr.closeAll(); });

  describe('create', () => {
    it('creates a STREAM socket and returns fd >= 0', () => {
      const fd = mgr.create(SOCKET_MODE.STREAM, null, 'read_cb', 'close_cb');
      assert.ok(fd >= 0);
      const sock = mgr.get(fd);
      assert.equal(sock.mode, SOCKET_MODE.STREAM);
      assert.equal(sock.state, SOCKET_STATE.UNBOUND);
    });

    it('creates multiple sockets with unique fds', () => {
      const fd1 = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      const fd2 = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      assert.notEqual(fd1, fd2);
    });
  });

  describe('bind', () => {
    it('binds to a port', () => {
      const fd = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      const result = mgr.bind(fd, 0);
      assert.equal(result, EESUCCESS);
      assert.equal(mgr.get(fd).state, SOCKET_STATE.BOUND);
    });

    it('returns error for invalid fd', () => {
      assert.equal(mgr.bind(999, 0), EEBADF);
    });
  });

  describe('TCP server/client roundtrip', () => {
    it('listen, connect, write, read', async () => {
      const serverFd = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      mgr.bind(serverFd, 0);

      let acceptedFd = -1;
      let receivedData = null;

      mgr.listen(serverFd, (fd) => {
        acceptedFd = mgr.accept(fd, (afd, data) => {
          receivedData = data;
        }, null);
      });

      await new Promise(r => setTimeout(r, 50));
      const port = mgr.get(serverFd).localPort;

      const clientFd = mgr.create(SOCKET_MODE.STREAM, null, () => {}, 'c');
      await new Promise((resolve) => {
        mgr.connect(clientFd, `127.0.0.1 ${port}`, () => {}, () => {
          mgr.write(clientFd, 'hello from client');
          setTimeout(resolve, 100);
        });
      });

      assert.ok(acceptedFd >= 0);
      assert.equal(receivedData, 'hello from client');
    });
  });

  describe('MUD mode', () => {
    it('sends and receives framed data', async () => {
      let receivedData = null;

      const serverFd = mgr.create(SOCKET_MODE.MUD, null, 'r', 'c');
      mgr.bind(serverFd, 0);
      mgr.listen(serverFd, (fd) => {
        mgr.accept(fd, (afd, data) => { receivedData = data; }, null);
      });

      await new Promise(r => setTimeout(r, 50));
      const port = mgr.get(serverFd).localPort;

      const clientFd = mgr.create(SOCKET_MODE.MUD, null, () => {}, 'c');
      await new Promise((resolve) => {
        mgr.connect(clientFd, `127.0.0.1 ${port}`, () => {}, () => {
          mgr.write(clientFd, 'mud payload');
          setTimeout(resolve, 100);
        });
      });

      assert.equal(receivedData, 'mud payload');
    });
  });

  describe('close', () => {
    it('closes a socket', () => {
      const fd = mgr.create(SOCKET_MODE.STREAM, null, 'r', 'c');
      assert.equal(mgr.close(fd), EESUCCESS);
      assert.equal(mgr.get(fd), null);
    });

    it('returns error for invalid fd', () => {
      assert.equal(mgr.close(999), EEBADF);
    });
  });

  describe('error', () => {
    it('converts error code to string', () => {
      const msg = mgr.errorString(EEBADF);
      assert.equal(typeof msg, 'string');
      assert.ok(msg.length > 0);
    });
  });
});

describe('UDP DATAGRAM', () => {
  let mgr;
  beforeEach(() => { mgr = new LpcSocketManager(); });
  afterEach(() => { mgr.closeAll(); });

  it('send and receive UDP datagram', async () => {
    let receivedData = null;
    let receivedAddr = null;

    const recvFd = mgr.create(SOCKET_MODE.DATAGRAM, null, (fd, data, addr) => {
      receivedData = data;
      receivedAddr = addr;
    }, null);
    mgr.bind(recvFd, 0);
    await mgr.bindDatagram(mgr.get(recvFd));

    const recvPort = mgr.get(recvFd).localPort;

    const sendFd = mgr.create(SOCKET_MODE.DATAGRAM, null, () => {}, null);
    mgr.bind(sendFd, 0);
    await mgr.bindDatagram(mgr.get(sendFd));

    mgr.write(sendFd, 'hello udp', `127.0.0.1 ${recvPort}`);

    await new Promise(r => setTimeout(r, 100));

    assert.equal(receivedData, 'hello udp');
    assert.ok(receivedAddr.includes('127.0.0.1'));
  });

  it('listen returns EEMODENOTSUPP for DATAGRAM', () => {
    const fd = mgr.create(SOCKET_MODE.DATAGRAM, null, () => {}, null);
    mgr.bind(fd, 0);
    assert.equal(mgr.listen(fd, () => {}), EEMODENOTSUPP);
  });
});

describe('socket efuns', () => {
  let reg, mgr, driver;
  beforeEach(() => {
    mgr = new LpcSocketManager();
    driver = {
      currentObject: { objectId: 'test' },
      sockets: mgr,
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerSocketEfuns(reg, driver);
  });
  afterEach(() => { mgr.closeAll(); });

  it('socket_create returns fd >= 0', () => {
    const result = reg.call('socket_create', [mkInt(1), mkString('read_cb'), mkString('close_cb')]);
    assert.ok(result.value >= 0);
  });

  it('socket_bind succeeds', () => {
    const fd = reg.call('socket_create', [mkInt(1), mkString('r'), mkString('c')]);
    const result = reg.call('socket_bind', [fd, mkInt(0)]);
    assert.equal(result.value, EESUCCESS);
  });

  it('socket_close succeeds', () => {
    const fd = reg.call('socket_create', [mkInt(1), mkString('r'), mkString('c')]);
    const result = reg.call('socket_close', [fd]);
    assert.equal(result.value, EESUCCESS);
  });

  it('socket_error returns string', () => {
    const result = reg.call('socket_error', [mkInt(EEBADF)]);
    assert.ok(result.value.length > 0);
  });
});
