import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/compiler/codegen.mjs';
import { Machine } from '../../src/vm/machine.mjs';

function run(source, funcName = 'f') {
  const prog = compile(source);
  const vm = new Machine();
  return vm.execute(prog, funcName);
}

describe('foreach over mapping', () => {
  it('iterates mapping keys and values', () => {
    const result = run(`
      int f() {
        mapping m = ([ "a": 1, "b": 2, "c": 3 ]);
        int total = 0;
        foreach (string k, int v in m) {
          total += v;
        }
        return total;
      }
    `);
    assert.equal(result.value, 6);
  });

  it('foreach over array still works', () => {
    const result = run(`
      int f() {
        int total = 0;
        foreach (int x in ({ 10, 20, 30 })) {
          total += x;
        }
        return total;
      }
    `);
    assert.equal(result.value, 60);
  });
});
