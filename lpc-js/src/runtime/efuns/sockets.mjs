import { mkInt, mkString, SVALUE_ZERO, T_STRING, T_FUNCTION } from '../../vm/svalue.mjs';
import { serializeValue, deserializeValue } from './save.mjs';

export function registerSocketEfuns(reg, driver) {
  const mgr = driver.sockets;

  reg.register('socket_create', (args) => {
    const mode = args[0].value;
    const readCb = args[1]?.value ?? null;
    const closeCb = args[2]?.value ?? null;
    const owner = driver.currentObject;
    const fd = mgr.create(mode, owner, wrapCb(driver, owner, readCb), wrapCb(driver, owner, closeCb));
    return mkInt(fd);
  });

  reg.register('socket_bind', (args) => {
    const fd = args[0].value;
    const port = args[1].value;
    const addr = args[2]?.value ?? null;
    return mkInt(mgr.bind(fd, port, addr));
  });

  reg.register('socket_listen', (args) => {
    const fd = args[0].value;
    const listenCb = args[1]?.value ?? null;
    const owner = driver.currentObject;
    return mkInt(mgr.listen(fd, wrapCb(driver, owner, listenCb)));
  });

  reg.register('socket_accept', (args) => {
    const fd = args[0].value;
    const readCb = args[1]?.value ?? null;
    const writeCb = args[2]?.value ?? null;
    const owner = driver.currentObject;
    return mkInt(mgr.accept(fd, wrapCb(driver, owner, readCb), wrapCb(driver, owner, writeCb)));
  });

  reg.register('socket_connect', (args) => {
    const fd = args[0].value;
    const addr = args[1].value;
    const readCb = args[2]?.value ?? null;
    const writeCb = args[3]?.value ?? null;
    const owner = driver.currentObject;
    return mkInt(mgr.connect(fd, addr, wrapCb(driver, owner, readCb), wrapCb(driver, owner, writeCb)));
  });

  reg.register('socket_write', (args) => {
    const fd = args[0].value;
    const msg = args[1];
    const addr = args[2]?.value ?? null;
    const sock = mgr.get(fd);
    if (!sock) return mkInt(-3);

    let data;
    if (sock.mode === 0) { // MUD mode — serialize svalue
      data = serializeValue(msg);
    } else {
      data = msg.type === T_STRING ? msg.value : String(msg.value);
    }
    return mkInt(mgr.write(fd, data, addr));
  });

  reg.register('socket_close', (args) => {
    return mkInt(mgr.close(args[0].value));
  });

  reg.register('socket_address', (args) => {
    return mkString(mgr.address(args[0].value));
  });

  reg.register('socket_error', (args) => {
    return mkString(mgr.errorString(args[0].value));
  });
}

function wrapCb(driver, owner, cb) {
  if (!cb) return null;
  if (typeof cb === 'function') return cb;
  return (...args) => {
    const svalueArgs = args.map(a => {
      if (typeof a === 'number') return mkInt(a);
      if (typeof a === 'string') return mkString(a);
      return a;
    });
    driver.apply(cb, owner, svalueArgs);
  };
}
