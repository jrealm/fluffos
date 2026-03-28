import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../../src/runtime/efuns/database.mjs';
import { T_INT, T_ARRAY } from '../../src/vm/svalue.mjs';

describe('DatabaseManager', () => {
  it('constructs', () => {
    const db = new DatabaseManager();
    assert.ok(db);
  });

  it('connect stores connection handle', () => {
    const db = new DatabaseManager();
    db._createClient = () => ({
      connect: async () => {},
      query: async () => ({ rows: [] }),
      end: async () => {},
    });
    const handle = db.connect('localhost', 'testdb', 'user', '');
    assert.equal(handle.type, T_INT);
    assert.ok(handle.value > 0);
  });

  it('close removes connection', () => {
    const db = new DatabaseManager();
    db._createClient = () => ({
      connect: async () => {},
      end: async () => {},
    });
    const handle = db.connect('localhost', 'testdb', 'user', '');
    const result = db.close(handle.value);
    assert.equal(result.value, 1);
  });

  it('exec with sync mock returns result', () => {
    const db = new DatabaseManager();
    db._createClient = () => ({
      connect: async () => {},
      query: (sql) => ({
        rows: [{ id: 1, name: 'test' }],
      }),
      end: async () => {},
    });
    const handle = db.connect('localhost', 'testdb', 'user', '');
    const result = db.exec(handle.value, 'SELECT * FROM test');
    assert.equal(result.type, T_ARRAY);
    assert.equal(result.value.length, 1);
  });
});
