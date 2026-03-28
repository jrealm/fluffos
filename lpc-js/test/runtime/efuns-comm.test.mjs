import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';
import { registerInteractiveEfuns } from '../../src/runtime/efuns/interactive.mjs';
import { mkInt, mkString, mkArray, SVALUE_ZERO, T_OBJECT } from '../../src/vm/svalue.mjs';

function makeObj(name, interactive = null) {
  return {
    objectId: name, filename: name,
    livingName: null, interactive,
    environment: null, inventory: new Set(),
    isDestructed: () => false,
    commandsEnabled: false,
  };
}

function makeConn() {
  const sent = [];
  return {
    send(data) { sent.push(data); },
    sent,
    object: null,
    lastInputTime: Date.now(),
    charMode: false, charCallback: null,
    snoopedBy: null, snooping: null,
    setInputTo(cb) { this.inputToCallback = cb; },
    inputToCallback: null,
    remoteAddress: '127.0.0.1',
  };
}

describe('communication efuns', () => {
  let reg, driver, room, player, npc, conn;

  beforeEach(() => {
    conn = makeConn();
    player = makeObj('player', conn);
    conn.object = player;
    npc = makeObj('npc');
    room = makeObj('room');

    room.inventory = new Set([player, npc]);
    player.environment = room;
    npc.environment = room;

    driver = {
      currentObject: player, currentPlayer: player,
      efuns: new EfunRegistry(),
      commands: { getSearchList: () => [] },
      _notifyFailMsg: null, _currentVerb: null,
      objects: { objects: new Map([['player', player], ['npc', npc], ['room', room]]) },
      apply: () => SVALUE_ZERO,
    };

    reg = new EfunRegistry();
    reg.loadDefaults();
    registerInteractiveEfuns(reg, driver);
  });

  it('say sends to room except self', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('say', [mkString('Hello!')]);
    assert.equal(conn.sent.length, 0);
    assert.equal(npcConn.sent.length, 1);
    assert.equal(npcConn.sent[0], 'Hello!');
  });

  it('say with exclude array', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('say', [mkString('Hello!'), mkArray([{ type: T_OBJECT, value: npc }])]);
    assert.equal(conn.sent.length, 0);
    assert.equal(npcConn.sent.length, 0);
  });

  it('tell_room sends to all in room', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('tell_room', [{ type: T_OBJECT, value: room }, mkString('Boom!')]);
    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0], 'Boom!');
    assert.equal(npcConn.sent.length, 1);
  });

  it('shout sends to all interactive objects', () => {
    const npcConn = makeConn();
    npc.interactive = npcConn;
    npcConn.object = npc;

    reg.call('shout', [mkString('Alert!')]);
    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0], 'Alert!');
    assert.equal(npcConn.sent.length, 1);
  });

  it('receive sends directly to connection', () => {
    driver.currentObject = player;
    reg.call('receive', [mkString('raw data')]);
    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0], 'raw data');
  });

  it('query_ip_number returns IP', () => {
    const result = reg.call('query_ip_number', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.value, '127.0.0.1');
  });

  it('query_idle returns seconds', () => {
    conn.lastInputTime = Date.now() - 5000;
    const result = reg.call('query_idle', [{ type: T_OBJECT, value: player }]);
    assert.ok(result.value >= 4 && result.value <= 6);
  });
});
