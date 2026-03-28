import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../../src/runtime/config.mjs';

const SAMPLE = `
# name of this mud
name : TestMud
port number : 4000
mudlib directory : /home/mud/lib
binary directory : /home/mud/bin
log directory : /log
include directories : /include:/sys
master file : /obj/master
simulated efun file : /obj/simul_efun
default error message : What?
max eval cost : 500000
heart beat interval : 2
reset time : 3600
`;

describe('parseConfig', () => {
  it('parses name', () => { assert.equal(parseConfig(SAMPLE)['name'], 'TestMud'); });
  it('parses port number', () => { assert.equal(parseConfig(SAMPLE)['port number'], '4000'); });
  it('parses mudlib directory', () => { assert.equal(parseConfig(SAMPLE)['mudlib directory'], '/home/mud/lib'); });
  it('parses include directories', () => { assert.equal(parseConfig(SAMPLE)['include directories'], '/include:/sys'); });
  it('parses master file', () => { assert.equal(parseConfig(SAMPLE)['master file'], '/obj/master'); });
  it('ignores comments and blank lines', () => {
    const cfg = parseConfig('# comment\n\nname : Test');
    assert.equal(cfg['name'], 'Test');
    assert.equal(Object.keys(cfg).length, 1);
  });
});
