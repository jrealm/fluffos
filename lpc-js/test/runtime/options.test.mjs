import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LpcOptions } from '../../src/runtime/options.mjs';

describe('LpcOptions', () => {
  it('provides default values', () => {
    const opts = new LpcOptions();
    assert.equal(opts.get('NO_ADD_ACTION'), false);
    assert.equal(opts.get('NO_SHADOWS'), false);
    assert.equal(opts.get('SENSIBLE_MODIFIERS'), true);
    assert.equal(opts.get('MAX_EVAL_COST'), 1_000_000);
    assert.equal(opts.get('MAX_BUFFER_SIZE'), 65536);
  });

  it('accepts overrides', () => {
    const opts = new LpcOptions({ NO_ADD_ACTION: true, MAX_EVAL_COST: 500_000 });
    assert.equal(opts.get('NO_ADD_ACTION'), true);
    assert.equal(opts.get('MAX_EVAL_COST'), 500_000);
    assert.equal(opts.get('NO_SHADOWS'), false); // unchanged
  });

  it('ignores unknown keys', () => {
    const opts = new LpcOptions({ UNKNOWN_OPTION: true });
    assert.equal(opts.has('UNKNOWN_OPTION'), false);
  });

  it('fromConfig parses FluffOS config', () => {
    const config = {
      'no add_action': '1',
      'no shadows': 'true',
      'max eval cost': '2000000',
      'sensible modifiers': '0',
    };
    const opts = LpcOptions.fromConfig(config);
    assert.equal(opts.get('NO_ADD_ACTION'), true);
    assert.equal(opts.get('NO_SHADOWS'), true);
    assert.equal(opts.get('MAX_EVAL_COST'), 2000000);
    assert.equal(opts.get('SENSIBLE_MODIFIERS'), false);
  });

  it('fromConfig with empty config uses defaults', () => {
    const opts = LpcOptions.fromConfig({});
    assert.equal(opts.get('NO_ADD_ACTION'), false);
    assert.equal(opts.get('MAX_EVAL_COST'), 1_000_000);
  });

  it('toDefines generates preprocessor defines', () => {
    const opts = new LpcOptions({ NO_ADD_ACTION: true, MAX_EVAL_COST: 500_000 });
    const defines = opts.toDefines();
    assert.equal(defines['__NO_ADD_ACTION__'], '1');
    assert.equal(defines['__SENSIBLE_MODIFIERS__'], '1'); // true by default
    assert.equal(defines['__MAX_EVAL_COST__'], '500000');
    // false options should NOT be defined
    assert.equal(defines['__NO_SHADOWS__'], undefined);
  });

  it('set and has work', () => {
    const opts = new LpcOptions();
    assert.equal(opts.has('NO_ADD_ACTION'), true);
    opts.set('NO_ADD_ACTION', true);
    assert.equal(opts.get('NO_ADD_ACTION'), true);
  });
});
