import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OP, opName } from '../../src/vm/opcodes.mjs';

describe('opcodes', () => {
  it('defines unique opcode values', () => {
    const values = Object.values(OP);
    const unique = new Set(values);
    assert.equal(values.length, unique.size, 'all opcodes must be unique');
  });

  it('opName returns name for known opcode', () => {
    assert.equal(opName(OP.PUSH_INT), 'PUSH_INT');
    assert.equal(opName(OP.ADD), 'ADD');
    assert.equal(opName(OP.RETURN), 'RETURN');
  });

  it('opName returns UNKNOWN for bad opcode', () => {
    assert.equal(opName(255), 'UNKNOWN(255)');
  });
});
