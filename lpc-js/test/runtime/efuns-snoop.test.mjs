import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerSnoopEfuns } from '../../src/runtime/efuns/snoop.mjs';
import { mkInt, SVALUE_ZERO, T_OBJECT } from '../../src/vm/svalue.mjs';
import { EfunRegistry } from '../../src/runtime/efuns.mjs';

function makeConn() {
  const sent = [];
  return {
    send(data) { sent.push(data); },
    sent,
    object: null,
    snoopedBy: null,
    snooping: null,
    lastInputTime: Date.now(),
    charMode: false, charCallback: null,
    remoteAddress: '127.0.0.1',
    state: 1, socket: { write() {} },
    setInputTo() {},
  };
}

function makeObj(name) {
  const conn = makeConn();
  const obj = {
    objectId: name, filename: name,
    interactive: conn, livingName: null,
    environment: null, inventory: new Set(),
    isDestructed: () => false,
  };
  conn.object = obj;
  return obj;
}

describe('snoop efuns', () => {
  let reg, driver, wizard, player;

  beforeEach(() => {
    wizard = makeObj('wizard');
    player = makeObj('player');
    driver = { currentObject: wizard };
    reg = new EfunRegistry();
    registerSnoopEfuns(reg, driver);
  });

  it('snoop establishes link', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    assert.equal(player.interactive.snoopedBy, wizard.interactive);
    assert.equal(wizard.interactive.snooping, player.interactive);
  });

  it('query_snoop returns snooper', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    const result = reg.call('query_snoop', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.type, T_OBJECT);
    assert.equal(result.value, wizard);
  });

  it('query_snooping returns target', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    const result = reg.call('query_snooping', [{ type: T_OBJECT, value: wizard }]);
    assert.equal(result.type, T_OBJECT);
    assert.equal(result.value, player);
  });

  it('snoop with no target stops snooping', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }]);
    assert.equal(player.interactive.snoopedBy, null);
    assert.equal(wizard.interactive.snooping, null);
  });

  it('prevents circular snoop', () => {
    reg.call('snoop', [{ type: T_OBJECT, value: wizard }, { type: T_OBJECT, value: player }]);
    driver.currentObject = player;
    const result = reg.call('snoop', [{ type: T_OBJECT, value: player }, { type: T_OBJECT, value: wizard }]);
    assert.equal(result.value, 0);
  });

  it('query_snoop returns 0 when not snooped', () => {
    const result = reg.call('query_snoop', [{ type: T_OBJECT, value: player }]);
    assert.equal(result.value, 0);
  });
});
