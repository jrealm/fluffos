import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Driver } from '../../src/runtime/driver.mjs';

describe('Driver', () => {
  it('constructs with config', () => {
    const driver = new Driver({
      'name': 'TestMud',
      'mudlib directory': '/tmp/mud',
      'port number': '4000',
      'master file': '/obj/master',
      'heart beat interval': '2',
      'max eval cost': '100000',
    });
    assert.equal(driver.config['name'], 'TestMud');
    assert.ok(driver.vm);
    assert.ok(driver.efuns);
    assert.ok(driver.callOuts);
    assert.ok(driver.objects);
  });

  it('registers call_out efun', () => {
    const driver = new Driver({ 'name': 'TestMud', 'mudlib directory': '/tmp/mud', 'master file': '/obj/master' });
    assert.ok(driver.efuns.has('call_out'));
    assert.ok(driver.efuns.has('remove_call_out'));
  });

  it('provides this_object efun', () => {
    const driver = new Driver({ 'name': 'TestMud', 'mudlib directory': '/tmp/mud', 'master file': '/obj/master' });
    const result = driver.efuns.call('this_object', []);
    assert.equal(result.value, 0);
  });
});
