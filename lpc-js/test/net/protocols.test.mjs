import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerInteractiveEfuns } from '../../src/runtime/efuns/interactive.mjs';
import { mkInt, mkString, SVALUE_ZERO, T_OBJECT } from '../../src/vm/svalue.mjs';

function makeConn(protocol = 'telnet') {
  const sent = [];
  const written = [];
  return {
    send(data) { sent.push(data); },
    sendGmcp(msg, data) { sent.push({ gmcp: msg, data }); },
    sendTelnetCommand(cmd, option) { written.push({ cmd, option }); },
    sendSubnegotiation(option, data) { written.push({ sb: option, data }); },
    sent, written,
    object: null, protocol,
    gmcpEnabled: protocol === 'websocket',
    mxpEnabled: false,
    lastInputTime: Date.now(),
    snoopedBy: null, snooping: null,
    charMode: false, charCallback: null,
    remoteAddress: '127.0.0.1',
    setInputTo() {},
    socket: protocol === 'websocket' ? { readyState: 1, send() {} } : { write() {} },
    state: 1, onGmcp: null,
  };
}

function makeObj(name, protocol = 'telnet') {
  const conn = makeConn(protocol);
  const obj = {
    objectId: name, filename: name,
    interactive: conn, livingName: null,
    environment: null, inventory: new Set(),
    isDestructed: () => false, commandsEnabled: false,
  };
  conn.object = obj;
  return obj;
}

describe('GMCP efuns', () => {
  let reg, driver, player;

  beforeEach(() => {
    player = makeObj('player');
    player.interactive.gmcpEnabled = true;
    driver = {
      currentObject: player, currentPlayer: player,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map([['player', player]]) },
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('has_gmcp returns 1 when enabled', () => {
    assert.equal(reg.call('has_gmcp', [{ type: T_OBJECT, value: player }]).value, 1);
  });

  it('has_gmcp returns 0 when disabled', () => {
    player.interactive.gmcpEnabled = false;
    assert.equal(reg.call('has_gmcp', [{ type: T_OBJECT, value: player }]).value, 0);
  });

  it('send_gmcp calls connection.sendGmcp', () => {
    reg.call('send_gmcp', [mkString('Char.Vitals'), mkString('{"hp":100}')]);
    assert.equal(player.interactive.sent.length, 1);
    assert.equal(player.interactive.sent[0].gmcp, 'Char.Vitals');
  });
});

describe('MXP efuns', () => {
  let reg, driver, player;

  beforeEach(() => {
    player = makeObj('player');
    player.interactive.mxpEnabled = true;
    driver = {
      currentObject: player, currentPlayer: player,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map([['player', player]]) },
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('has_mxp returns 1 when enabled', () => {
    assert.equal(reg.call('has_mxp', [{ type: T_OBJECT, value: player }]).value, 1);
  });

  it('has_mxp returns 0 for websocket', () => {
    const wsPlayer = makeObj('ws', 'websocket');
    assert.equal(reg.call('has_mxp', [{ type: T_OBJECT, value: wsPlayer }]).value, 0);
  });

  it('act_mxp sends subnegotiation', () => {
    driver.currentObject = player;
    reg.call('act_mxp', []);
    assert.ok(player.interactive.written.some(w => w.sb === 91));
  });
});

describe('websocket efun', () => {
  let reg, driver;

  beforeEach(() => {
    driver = {
      currentObject: null, currentPlayer: null,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map() },
      apply: () => SVALUE_ZERO,
    };
    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('websocket returns 1 for ws connection', () => {
    const wsPlayer = makeObj('ws', 'websocket');
    assert.equal(reg.call('websocket', [{ type: T_OBJECT, value: wsPlayer }]).value, 1);
  });

  it('websocket returns 0 for telnet connection', () => {
    const telnetPlayer = makeObj('tn', 'telnet');
    assert.equal(reg.call('websocket', [{ type: T_OBJECT, value: telnetPlayer }]).value, 0);
  });
});
