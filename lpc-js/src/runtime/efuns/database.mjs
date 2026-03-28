import { mkInt, mkString, mkArray, mkMapping, SVALUE_ZERO } from '../../vm/svalue.mjs';

export class DatabaseManager {
  constructor() {
    this.connections = new Map();
    this.nextHandle = 1;
    this._createClient = null;
  }

  connect(host, database, user, password) {
    const handle = this.nextHandle++;
    const client = this._createClient
      ? this._createClient(host, database, user, password)
      : null;
    if (!client) return SVALUE_ZERO;

    this.connections.set(handle, { client, connected: false, lastResult: null });
    client.connect().then(() => {
      const conn = this.connections.get(handle);
      if (conn) conn.connected = true;
    }).catch(() => {});

    return mkInt(handle);
  }

  close(handle) {
    const conn = this.connections.get(handle);
    if (!conn) return SVALUE_ZERO;
    conn.client.end().catch(() => {});
    this.connections.delete(handle);
    return mkInt(1);
  }

  exec(handle, sql) {
    const conn = this.connections.get(handle);
    if (!conn) return SVALUE_ZERO;
    try {
      const queryResult = conn.client.query(sql);
      if (queryResult && queryResult.then) {
        conn.pendingQuery = queryResult;
        queryResult.then(r => { conn.lastResult = r; conn.pendingQuery = null; }).catch(() => { conn.lastResult = null; conn.pendingQuery = null; });
        return mkInt(1);
      }
      if (queryResult && queryResult.rows) {
        conn.lastResult = queryResult;
        return this._rowsToArray(queryResult.rows);
      }
    } catch { return SVALUE_ZERO; }
    return SVALUE_ZERO;
  }

  fetch(handle) {
    const conn = this.connections.get(handle);
    if (!conn || !conn.lastResult) return SVALUE_ZERO;
    return this._rowsToArray(conn.lastResult.rows);
  }

  _rowsToArray(rows) {
    return mkArray(rows.map(row => {
      const m = new Map();
      for (const [k, v] of Object.entries(row)) {
        m.set(k, typeof v === 'number' ? mkInt(v) : mkString(String(v ?? '')));
      }
      return mkMapping(m);
    }));
  }
}

export function registerDatabaseEfuns(reg) {
  const dbm = new DatabaseManager();

  reg.register('db_connect', (args) => {
    return dbm.connect(args[0].value, args[1].value, args[2].value, args[3]?.value ?? '');
  });

  reg.register('db_exec', (args) => {
    return dbm.exec(args[0].value, args[1].value);
  });

  reg.register('db_close', (args) => {
    return dbm.close(args[0].value);
  });

  reg.register('db_fetch', (args) => {
    return dbm.fetch(args[0].value);
  });

  return dbm;
}
