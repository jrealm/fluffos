import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('smoke test', () => {
  it('should pass', () => {
    assert.equal(1 + 1, 2);
  });
});
