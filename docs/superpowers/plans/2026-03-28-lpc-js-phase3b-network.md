# LPC-JS Phase 3B: Network Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telnet server, connection management, Telnet IAC protocol, player input processing (input_to, add_action/CommandManager), and output efuns (write, tell_object, message) so the LPC-JS driver can accept player connections and run a MUD.

**Architecture:** `Server` wraps Node.js `net.createServer` and creates `Connection` objects per socket. Each `Connection` has a Telnet IAC state machine that strips protocol bytes and buffers line-oriented input. On connection, Driver calls `master->connect()` to get a login object, then `logon()`. Player input routes through `input_to` callbacks first, then `CommandManager.dispatch()` which searches add_action verbs. Output efuns write to the connection's socket.

**Tech Stack:** Node.js 20+, ES Modules (.mjs), `node:test` + `node:assert`, `node:net` for TCP.

---

## File Structure

```
lpc-js/
├── src/
│   ├── net/
│   │   ├── telnet.mjs         # NEW — Telnet IAC constants and protocol parser
│   │   ├── connection.mjs     # NEW — Connection class (socket, buffers, state)
│   │   └── server.mjs         # NEW — TCP server wrapper
│   ├── runtime/
│   │   ├── commands.mjs       # NEW — CommandManager (add_action/dispatch)
│   │   ├── driver.mjs         # MODIFY — add network efuns, connection handling
│   │   └── efuns/
│   │       └── interactive.mjs # NEW — write, tell_object, message, input_to efuns
│   └── ...
└── test/
    ├── net/
    │   ├── telnet.test.mjs
    │   ├── connection.test.mjs
    │   └── server.test.mjs
    ├── runtime/
    │   └── commands.test.mjs
    └── integration/
        └── network.test.mjs
```

---

### Task 1: Telnet Protocol Parser

**Files:**
- Create: `lpc-js/src/net/telnet.mjs`
- Create: `lpc-js/test/net/telnet.test.mjs`

- [ ] **Step 1: Write the failing test**

```bash
mkdir -p lpc-js/src/net lpc-js/test/net
```

Write `lpc-js/test/net/telnet.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TelnetParser, IAC, WILL, WONT, DO, DONT, SB, SE } from '../../src/net/telnet.mjs';

describe('TelnetParser', () => {
  it('passes through plain text', () => {
    const parser = new TelnetParser();
    const chunks = [];
    parser.onData = (buf) => chunks.push(buf);
    parser.feed(Buffer.from('hello'));
    assert.equal(Buffer.concat(chunks).toString(), 'hello');
  });

  it('strips IAC WILL sequences', () => {
    const parser = new TelnetParser();
    const chunks = [];
    const commands = [];
    parser.onData = (buf) => chunks.push(buf);
    parser.onCommand = (cmd, opt) => commands.push({ cmd, opt });
    // "hi" + IAC WILL 1 + "lo"
    parser.feed(Buffer.from([0x68, 0x69, IAC, WILL, 0x01, 0x6C, 0x6F]));
    assert.equal(Buffer.concat(chunks).toString(), 'hilo');
    assert.equal(commands.length, 1);
    assert.equal(commands[0].cmd, WILL);
    assert.equal(commands[0].opt, 0x01);
  });

  it('strips IAC WONT sequences', () => {
    const parser = new TelnetParser();
    const commands = [];
    parser.onData = () => {};
    parser.onCommand = (cmd, opt) => commands.push({ cmd, opt });
    parser.feed(Buffer.from([IAC, WONT, 0x03]));
    assert.equal(commands[0].cmd, WONT);
  });

  it('strips IAC DO/DONT', () => {
    const parser = new TelnetParser();
    const commands = [];
    parser.onData = () => {};
    parser.onCommand = (cmd, opt) => commands.push({ cmd, opt });
    parser.feed(Buffer.from([IAC, DO, 0x18, IAC, DONT, 0x20]));
    assert.equal(commands.length, 2);
    assert.equal(commands[0].cmd, DO);
    assert.equal(commands[1].cmd, DONT);
  });

  it('handles IAC SB ... SE subnegotiation', () => {
    const parser = new TelnetParser();
    const subs = [];
    parser.onData = () => {};
    parser.onSubnegotiation = (opt, data) => subs.push({ opt, data: Buffer.from(data) });
    // SB 31 (NAWS) 0x00 0x50 0x00 0x18 SE
    parser.feed(Buffer.from([IAC, SB, 31, 0x00, 0x50, 0x00, 0x18, IAC, SE]));
    assert.equal(subs.length, 1);
    assert.equal(subs[0].opt, 31);
    assert.equal(subs[0].data.length, 4);
  });

  it('handles IAC IAC as escaped 0xFF byte', () => {
    const parser = new TelnetParser();
    const chunks = [];
    parser.onData = (buf) => chunks.push(buf);
    parser.feed(Buffer.from([0x41, IAC, IAC, 0x42]));
    const result = Buffer.concat(chunks);
    assert.equal(result[0], 0x41);
    assert.equal(result[1], 0xFF);
    assert.equal(result[2], 0x42);
  });

  it('handles split across multiple feeds', () => {
    const parser = new TelnetParser();
    const chunks = [];
    const commands = [];
    parser.onData = (buf) => chunks.push(buf);
    parser.onCommand = (cmd, opt) => commands.push({ cmd, opt });
    // Split IAC WILL 0x01 across two feeds
    parser.feed(Buffer.from([0x68, 0x69, IAC]));
    parser.feed(Buffer.from([WILL, 0x01, 0x6C, 0x6F]));
    assert.equal(Buffer.concat(chunks).toString(), 'hilo');
    assert.equal(commands.length, 1);
  });

  it('strips CR from CRLF', () => {
    const parser = new TelnetParser();
    const chunks = [];
    parser.onData = (buf) => chunks.push(buf);
    parser.feed(Buffer.from('hello\r\nworld\r\n'));
    assert.equal(Buffer.concat(chunks).toString(), 'hello\nworld\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/net/telnet.mjs`:

```js
export const IAC  = 255;
export const DONT = 254;
export const DO   = 253;
export const WONT = 252;
export const WILL = 251;
export const SB   = 250;
export const SE   = 240;

const STATE_DATA = 0;
const STATE_IAC = 1;
const STATE_WILL = 2;
const STATE_WONT = 3;
const STATE_DO = 4;
const STATE_DONT = 5;
const STATE_SB = 6;
const STATE_SB_DATA = 7;
const STATE_SB_IAC = 8;

export class TelnetParser {
  constructor() {
    this.state = STATE_DATA;
    this.sbOption = 0;
    this.sbBuffer = [];
    this.onData = null;
    this.onCommand = null;
    this.onSubnegotiation = null;
  }

  feed(buffer) {
    let dataStart = -1;

    const flushData = (end) => {
      if (dataStart >= 0 && dataStart < end) {
        if (this.onData) this.onData(buffer.subarray(dataStart, end));
        dataStart = -1;
      }
    };

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];

      switch (this.state) {
        case STATE_DATA:
          if (byte === IAC) {
            flushData(i);
            this.state = STATE_IAC;
          } else if (byte === 0x0D) {
            // Strip CR (will be followed by LF typically)
            flushData(i);
            dataStart = -1;
          } else {
            if (dataStart < 0) dataStart = i;
          }
          break;

        case STATE_IAC:
          if (byte === IAC) {
            // Escaped 0xFF
            if (this.onData) this.onData(Buffer.from([0xFF]));
            this.state = STATE_DATA;
          } else if (byte === WILL) { this.state = STATE_WILL; }
          else if (byte === WONT) { this.state = STATE_WONT; }
          else if (byte === DO) { this.state = STATE_DO; }
          else if (byte === DONT) { this.state = STATE_DONT; }
          else if (byte === SB) { this.state = STATE_SB; }
          else {
            this.state = STATE_DATA;
          }
          break;

        case STATE_WILL:
          if (this.onCommand) this.onCommand(WILL, byte);
          this.state = STATE_DATA;
          break;

        case STATE_WONT:
          if (this.onCommand) this.onCommand(WONT, byte);
          this.state = STATE_DATA;
          break;

        case STATE_DO:
          if (this.onCommand) this.onCommand(DO, byte);
          this.state = STATE_DATA;
          break;

        case STATE_DONT:
          if (this.onCommand) this.onCommand(DONT, byte);
          this.state = STATE_DATA;
          break;

        case STATE_SB:
          this.sbOption = byte;
          this.sbBuffer = [];
          this.state = STATE_SB_DATA;
          break;

        case STATE_SB_DATA:
          if (byte === IAC) {
            this.state = STATE_SB_IAC;
          } else {
            this.sbBuffer.push(byte);
          }
          break;

        case STATE_SB_IAC:
          if (byte === SE) {
            if (this.onSubnegotiation) {
              this.onSubnegotiation(this.sbOption, this.sbBuffer);
            }
            this.state = STATE_DATA;
          } else {
            this.sbBuffer.push(byte);
            this.state = STATE_SB_DATA;
          }
          break;
      }
    }

    flushData(buffer.length);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All TelnetParser tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/telnet.mjs test/net/telnet.test.mjs
git commit -m "feat: add Telnet IAC protocol parser"
```

---

### Task 2: Connection Class

**Files:**
- Create: `lpc-js/src/net/connection.mjs`
- Create: `lpc-js/test/net/connection.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/net/connection.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Connection, CONN_CONNECTED, CONN_LOGGED_IN, CONN_CLOSING } from '../../src/net/connection.mjs';
import { EventEmitter } from 'node:events';

// Mock socket
function mockSocket() {
  const sock = new EventEmitter();
  sock.written = [];
  sock.write = (data) => sock.written.push(data);
  sock.end = () => { sock.ended = true; };
  sock.destroy = () => { sock.destroyed = true; };
  sock.remoteAddress = '127.0.0.1';
  sock.remotePort = 12345;
  return sock;
}

describe('Connection', () => {
  it('constructs with socket', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    assert.equal(conn.state, CONN_CONNECTED);
    assert.equal(conn.object, null);
    assert.equal(conn.remoteAddress, '127.0.0.1');
  });

  it('buffers lines from socket data', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('hello\n'));
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'hello');
  });

  it('handles partial lines across data events', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('hel'));
    assert.equal(lines.length, 0);
    sock.emit('data', Buffer.from('lo\n'));
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'hello');
  });

  it('handles multiple lines in one data event', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('a\nb\nc\n'));
    assert.equal(lines.length, 3);
    assert.deepEqual(lines, ['a', 'b', 'c']);
  });

  it('strips telnet IAC from data', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    // "hi" + IAC WILL 1 + "\n"
    sock.emit('data', Buffer.from([0x68, 0x69, 255, 251, 1, 0x0A]));
    assert.equal(lines[0], 'hi');
  });

  it('send writes to socket', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    conn.send('Hello!\n');
    assert.equal(sock.written.length, 1);
    assert.equal(sock.written[0], 'Hello!\n');
  });

  it('close ends connection', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    conn.close();
    assert.equal(conn.state, CONN_CLOSING);
    assert.ok(sock.ended);
  });

  it('input_to sets callback', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const results = [];
    conn.setInputTo((line) => results.push(line));
    const lines = [];
    conn.onLine = (line) => lines.push(line);
    sock.emit('data', Buffer.from('test\n'));
    // inputTo should have captured it
    assert.equal(results.length, 1);
    assert.equal(results[0], 'test');
    assert.equal(lines.length, 0); // onLine not called when inputTo active
  });

  it('input_to is consumed after one call', () => {
    const sock = mockSocket();
    const conn = new Connection(sock);
    const results = [];
    conn.setInputTo((line) => results.push(line));
    sock.emit('data', Buffer.from('first\n'));
    sock.emit('data', Buffer.from('second\n'));
    // Only first line goes to inputTo
    assert.equal(results.length, 1);
    assert.equal(results[0], 'first');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/net/connection.mjs`:

```js
import { TelnetParser } from './telnet.mjs';

export const CONN_CONNECTED = 0;
export const CONN_LOGGED_IN = 1;
export const CONN_CLOSING = 2;

export class Connection {
  constructor(socket) {
    this.socket = socket;
    this.state = CONN_CONNECTED;
    this.object = null;
    this.inputBuffer = '';
    this.inputToCallback = null;
    this.onLine = null;
    this.onClose = null;
    this.remoteAddress = socket.remoteAddress;
    this.remotePort = socket.remotePort;

    this.telnet = new TelnetParser();
    this.telnet.onData = (buf) => this._onTelnetData(buf);
    this.telnet.onCommand = () => {}; // ignore commands for now

    socket.on('data', (data) => this.telnet.feed(data));
    socket.on('end', () => this._onSocketEnd());
    socket.on('error', () => this._onSocketEnd());
  }

  _onTelnetData(buf) {
    this.inputBuffer += buf.toString('utf8');
    this._processLines();
  }

  _processLines() {
    let idx;
    while ((idx = this.inputBuffer.indexOf('\n')) >= 0) {
      const line = this.inputBuffer.slice(0, idx);
      this.inputBuffer = this.inputBuffer.slice(idx + 1);

      if (this.inputToCallback) {
        const cb = this.inputToCallback;
        this.inputToCallback = null;
        cb(line);
      } else if (this.onLine) {
        this.onLine(line);
      }
    }
  }

  _onSocketEnd() {
    this.state = CONN_CLOSING;
    if (this.onClose) this.onClose(this);
  }

  send(data) {
    if (this.state !== CONN_CLOSING && this.socket) {
      this.socket.write(data);
    }
  }

  close() {
    this.state = CONN_CLOSING;
    if (this.socket) {
      this.socket.end();
    }
  }

  setInputTo(callback) {
    this.inputToCallback = callback;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All Connection tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/connection.mjs test/net/connection.test.mjs
git commit -m "feat: add Connection with Telnet parsing, line buffering, input_to"
```

---

### Task 3: CommandManager (add_action)

**Files:**
- Create: `lpc-js/src/runtime/commands.mjs`
- Create: `lpc-js/test/runtime/commands.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/runtime/commands.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandManager, FLAG_EXACT, FLAG_PREFIX, FLAG_SPACE } from '../../src/runtime/commands.mjs';
import { Program } from '../../src/vm/program.mjs';
import { LpcObject } from '../../src/runtime/object.mjs';

describe('CommandManager', () => {
  function makeObj(filename) {
    return new LpcObject(filename, new Program(filename));
  }

  it('registers and finds an action', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    const actions = mgr.getActions(obj);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].verb, 'slash');
  });

  it('exact match', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    assert.ok(mgr.matchVerb('slash', mgr.getActions(obj)[0]));
    assert.ok(!mgr.matchVerb('slas', mgr.getActions(obj)[0]));
    assert.ok(!mgr.matchVerb('slasher', mgr.getActions(obj)[0]));
  });

  it('prefix match', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'sla', FLAG_PREFIX);
    assert.ok(mgr.matchVerb('slash', mgr.getActions(obj)[0]));
    assert.ok(mgr.matchVerb('sla', mgr.getActions(obj)[0]));
    assert.ok(!mgr.matchVerb('sl', mgr.getActions(obj)[0]));
  });

  it('getSearchList returns player + env + env.inventory', () => {
    const mgr = new CommandManager();
    const room = makeObj('/room.c');
    const player = makeObj('/player.c');
    const npc = makeObj('/npc.c');
    player.moveTo(room);
    npc.moveTo(room);

    const list = mgr.getSearchList(player);
    assert.ok(list.includes(player));
    assert.ok(list.includes(room));
    assert.ok(list.includes(npc));
  });

  it('removeActions clears actions for an object', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);
    mgr.removeActions(obj);
    assert.equal(mgr.getActions(obj).length, 0);
  });

  it('dispatch calls matching action function name', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);

    const dispatched = [];
    const result = mgr.dispatch('slash the dragon', (func, actionObj, arg) => {
      dispatched.push({ func, obj: actionObj, arg });
      return true; // handled
    }, [obj]);

    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].func, 'do_slash');
    assert.equal(dispatched[0].arg, 'the dragon');
    assert.equal(result, true);
  });

  it('dispatch returns false when no match', () => {
    const mgr = new CommandManager();
    const obj = makeObj('/sword.c');
    mgr.addAction(obj, 'do_slash', 'slash', FLAG_EXACT);

    const result = mgr.dispatch('look around', () => true, [obj]);
    assert.equal(result, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/runtime/commands.mjs`:

```js
export const FLAG_EXACT = 0;
export const FLAG_PREFIX = 1;
export const FLAG_SPACE = 2;

export class CommandManager {
  constructor() {
    this.actions = new Map();
  }

  addAction(object, func, verb, flag) {
    if (!this.actions.has(object)) this.actions.set(object, []);
    this.actions.get(object).push({ verb, func, flag });
  }

  removeActions(object) {
    this.actions.delete(object);
  }

  getActions(object) {
    return this.actions.get(object) ?? [];
  }

  matchVerb(input, action) {
    switch (action.flag) {
      case FLAG_EXACT:
        return input === action.verb;
      case FLAG_PREFIX:
        return input.startsWith(action.verb) && input.length >= action.verb.length;
      case FLAG_SPACE:
        return input === action.verb || input.startsWith(action.verb + ' ');
      default:
        return input === action.verb;
    }
  }

  getSearchList(player) {
    const list = [player];
    if (player.environment) {
      list.push(player.environment);
      for (const obj of player.environment.inventory) {
        if (obj !== player) list.push(obj);
      }
    }
    return list;
  }

  dispatch(input, handler, searchList) {
    const spaceIdx = input.indexOf(' ');
    const verb = spaceIdx >= 0 ? input.slice(0, spaceIdx) : input;
    const arg = spaceIdx >= 0 ? input.slice(spaceIdx + 1) : '';

    for (const obj of searchList) {
      for (const action of this.getActions(obj)) {
        if (this.matchVerb(verb, action)) {
          const handled = handler(action.func, obj, arg);
          if (handled) return true;
        }
      }
    }
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All CommandManager tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/commands.mjs test/runtime/commands.test.mjs
git commit -m "feat: add CommandManager with add_action, prefix match, dispatch"
```

---

### Task 4: TCP Server

**Files:**
- Create: `lpc-js/src/net/server.mjs`
- Create: `lpc-js/test/net/server.test.mjs`

- [ ] **Step 1: Write the failing test**

Write `lpc-js/test/net/server.test.mjs`:

```js
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Server } from '../../src/net/server.mjs';

describe('Server', () => {
  let server;

  afterEach(() => {
    if (server) server.close();
  });

  it('listens on a port', async () => {
    server = new Server();
    await server.listen(0); // random port
    assert.ok(server.port > 0);
  });

  it('accepts connections', async () => {
    server = new Server();
    const connections = [];
    server.onConnection = (conn) => connections.push(conn);
    await server.listen(0);

    const client = net.createConnection(server.port, '127.0.0.1');
    await new Promise((resolve) => client.on('connect', resolve));

    // Give server time to fire
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(connections.length, 1);
    assert.equal(connections[0].remoteAddress, '127.0.0.1');

    client.end();
  });

  it('receives data from client', async () => {
    server = new Server();
    const lines = [];
    server.onConnection = (conn) => {
      conn.onLine = (line) => lines.push(line);
    };
    await server.listen(0);

    const client = net.createConnection(server.port, '127.0.0.1');
    await new Promise((resolve) => client.on('connect', resolve));
    client.write('hello\n');

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'hello');

    client.end();
  });

  it('sends data to client', async () => {
    server = new Server();
    server.onConnection = (conn) => {
      conn.send('Welcome!\n');
    };
    await server.listen(0);

    const client = net.createConnection(server.port, '127.0.0.1');
    const received = [];
    client.on('data', (data) => received.push(data.toString()));
    await new Promise((resolve) => client.on('connect', resolve));

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(received.join('').includes('Welcome!'));

    client.end();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lpc-js && npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write `lpc-js/src/net/server.mjs`:

```js
import net from 'node:net';
import { Connection } from './connection.mjs';

export class Server {
  constructor() {
    this.server = null;
    this.port = 0;
    this.connections = new Set();
    this.onConnection = null;
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this._handleSocket(socket));
      this.server.on('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  _handleSocket(socket) {
    const conn = new Connection(socket);
    this.connections.add(conn);
    conn.onClose = () => {
      this.connections.delete(conn);
    };
    if (this.onConnection) {
      this.onConnection(conn);
    }
  }

  close() {
    if (this.server) {
      for (const conn of this.connections) {
        conn.close();
      }
      this.server.close();
      this.server = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lpc-js && npm test`
Expected: All Server tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/server.mjs test/net/server.test.mjs
git commit -m "feat: add TCP Server with Connection creation"
```

---

### Task 5: Interactive Efuns and Driver Network Integration

**Files:**
- Create: `lpc-js/src/runtime/efuns/interactive.mjs`
- Modify: `lpc-js/src/runtime/driver.mjs`
- Create: `lpc-js/test/integration/network.test.mjs`

- [ ] **Step 1: Write interactive efuns**

Write `lpc-js/src/runtime/efuns/interactive.mjs`:

```js
import { mkInt, mkString, SVALUE_ZERO, T_OBJECT, T_STRING } from '../../vm/svalue.mjs';

export function registerInteractiveEfuns(reg, driver) {
  reg.register('write', (args) => {
    const text = args[0].type === T_STRING ? args[0].value : String(args[0].value);
    if (driver.currentObject && driver.currentObject.interactive) {
      driver.currentObject.interactive.send(text);
    }
    return SVALUE_ZERO;
  });

  reg.register('tell_object', (args) => {
    const obj = args[0].type === T_OBJECT ? args[0].value : null;
    const msg = args[1].type === T_STRING ? args[1].value : String(args[1].value);
    if (obj && obj.interactive) {
      obj.interactive.send(msg);
    }
    return SVALUE_ZERO;
  });

  reg.register('message', (args) => {
    // message(type, msg, targets, exclude)
    const msg = args[1].type === T_STRING ? args[1].value : String(args[1].value);
    const targets = args[2];
    if (targets.type === T_OBJECT) {
      const obj = targets.value;
      if (obj.interactive) obj.interactive.send(msg);
    }
    return SVALUE_ZERO;
  });

  reg.register('input_to', (args) => {
    const funcName = args[0].value;
    if (driver.currentObject && driver.currentObject.interactive) {
      const obj = driver.currentObject;
      const conn = obj.interactive;
      const { apply: applyFn } = driver;
      conn.setInputTo((line) => {
        applyFn(funcName, obj, [mkString(line)]);
      });
    }
    return SVALUE_ZERO;
  });

  reg.register('interactive', (args) => {
    const obj = args.length > 0 && args[0].type === T_OBJECT ? args[0].value : driver.currentObject;
    return mkInt(obj && obj.interactive ? 1 : 0);
  });

  reg.register('add_action', (args) => {
    const func = args[0].value;
    const verb = args[1].value;
    const flag = args.length > 2 ? args[2].value : 0;
    if (driver.currentObject) {
      driver.commands.addAction(driver.currentObject, func, verb, flag);
    }
    return SVALUE_ZERO;
  });

  reg.register('notify_fail', (args) => {
    if (driver.currentObject && driver.currentObject.interactive) {
      driver._notifyFailMsg = args[0].value;
    }
    return SVALUE_ZERO;
  });

  reg.register('this_player', () => {
    if (driver.currentPlayer) {
      return { type: T_OBJECT, value: driver.currentPlayer };
    }
    return SVALUE_ZERO;
  });
}
```

- [ ] **Step 2: Modify Driver to integrate network**

In `lpc-js/src/runtime/driver.mjs`, add imports and wiring:

Add at the top:

```js
import { Server } from '../net/server.mjs';
import { CommandManager } from './commands.mjs';
import { registerInteractiveEfuns } from './efuns/interactive.mjs';
import { CONN_LOGGED_IN } from '../net/connection.mjs';
```

In the constructor, after `this.callOuts.onFire = ...`:

```js
    this.commands = new CommandManager();
    this.server = null;
    this.currentPlayer = null;
    this._notifyFailMsg = null;
    this.apply = apply; // expose for interactive efuns

    registerInteractiveEfuns(this.efuns, this);
```

Add methods to Driver:

```js
  async startServer(port) {
    this.server = new Server();
    this.server.onConnection = (conn) => this._handleNewConnection(conn);
    await this.server.listen(port);
    return this.server.port;
  }

  _handleNewConnection(conn) {
    // Ask master for login object
    const master = this.objects.find(this.config['master file'] + '.c')
                || this.objects.find(this.config['master file']);
    if (!master) {
      conn.send('No master object.\n');
      conn.close();
      return;
    }

    const loginResult = apply('connect', master, []);
    if (!loginResult || loginResult.value === 0) {
      conn.send('Connection refused.\n');
      conn.close();
      return;
    }

    const loginObj = loginResult.type === 5 ? loginResult.value : null; // T_OBJECT = 5
    if (!loginObj) {
      conn.send('Connection refused.\n');
      conn.close();
      return;
    }

    loginObj.interactive = conn;
    conn.object = loginObj;
    conn.state = CONN_LOGGED_IN;

    // Call logon() on the login object
    this.currentObject = loginObj;
    this.currentPlayer = loginObj;
    apply('logon', loginObj, []);
    this.currentObject = null;
    this.currentPlayer = null;

    // Wire up input handling
    conn.onLine = (line) => this._handleInput(conn, line);
    conn.onClose = () => this._handleDisconnect(conn);
  }

  _handleInput(conn, line) {
    const player = conn.object;
    if (!player || player.isDestructed()) return;

    this.currentObject = player;
    this.currentPlayer = player;
    this._notifyFailMsg = null;

    // Try process_input first
    const piResult = apply('process_input', player, [mkString(line)]);
    if (piResult && piResult.value === 1) {
      this.currentObject = null;
      this.currentPlayer = null;
      return;
    }

    // Try command dispatch
    const searchList = this.commands.getSearchList(player);
    const handled = this.commands.dispatch(line, (func, obj, arg) => {
      this.currentObject = obj;
      const result = apply(func, obj, [mkString(arg)]);
      return result && result.value;
    }, searchList);

    if (!handled && this._notifyFailMsg) {
      conn.send(this._notifyFailMsg);
    } else if (!handled) {
      conn.send('What?\n');
    }

    this.currentObject = null;
    this.currentPlayer = null;
  }

  _handleDisconnect(conn) {
    const obj = conn.object;
    if (obj) {
      obj.interactive = null;
      conn.object = null;
    }
  }

  stopServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
```

- [ ] **Step 3: Write the integration test**

Write `lpc-js/test/integration/network.test.mjs`:

```js
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Driver } from '../../src/runtime/driver.mjs';

describe('integration — network', () => {
  let driver;

  afterEach(() => {
    if (driver) driver.stopServer();
  });

  function createDriver() {
    const files = {
      '/master.c': `
        object connect() {
          return clone_object("/login");
        }
        void create() { }
      `,
      '/login.c': `
        void logon() {
          write("Welcome!\\n");
        }
        void create() { }
      `,
    };

    driver = new Driver(
      { 'name': 'TestMud', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (path) => files[path] ?? files[path + '.c'] ?? files[path.replace(/\\.c$/, '')] ?? null },
    );
    // Pre-load master
    driver.objects.load('/master.c');
    return driver;
  }

  it('accepts a connection and sends welcome', async () => {
    const d = createDriver();
    const port = await d.startServer(0);

    const client = net.createConnection(port, '127.0.0.1');
    const received = [];
    client.on('data', (data) => received.push(data.toString()));
    await new Promise((resolve) => client.on('connect', resolve));

    await new Promise((resolve) => setTimeout(resolve, 100));
    const output = received.join('');
    assert.ok(output.includes('Welcome!'), `Expected Welcome! but got: ${output}`);

    client.end();
  });

  it('handles player input with default What? response', async () => {
    const d = createDriver();
    const port = await d.startServer(0);

    const client = net.createConnection(port, '127.0.0.1');
    const received = [];
    client.on('data', (data) => received.push(data.toString()));
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    client.write('nonsense\n');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const output = received.join('');
    assert.ok(output.includes('What?'), `Expected What? but got: ${output}`);

    client.end();
  });

  it('handles add_action commands', async () => {
    const files = {
      '/master.c': `
        object connect() {
          return clone_object("/player");
        }
        void create() { }
      `,
      '/player.c': `
        void create() {
          add_action("do_say", "say");
        }
        void logon() {
          write("Ready.\\n");
        }
        int do_say(string arg) {
          write("You say: " + arg + "\\n");
          return 1;
        }
      `,
    };

    driver = new Driver(
      { 'name': 'TestMud', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (path) => files[path] ?? files[path + '.c'] ?? files[path.replace(/\\.c$/, '')] ?? null },
    );
    driver.objects.load('/master.c');
    const port = await driver.startServer(0);

    const client = net.createConnection(port, '127.0.0.1');
    const received = [];
    client.on('data', (data) => received.push(data.toString()));
    await new Promise((resolve) => client.on('connect', resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    client.write('say hello world\n');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const output = received.join('');
    assert.ok(output.includes('You say: hello world'), `Expected 'You say: hello world' but got: ${output}`);

    client.end();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd lpc-js && npm test`
Expected: All network integration tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/efuns/interactive.mjs src/runtime/driver.mjs src/net/server.mjs test/integration/network.test.mjs
git commit -m "feat: add network layer with Telnet server, interactive efuns, and add_action"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd lpc-js && npm test`
Expected: All tests pass.

- [ ] **Step 2: Done**

Phase 3B complete.
