import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Driver } from '../../src/runtime/driver.mjs';

describe('integration — network', () => {
  let driver;

  afterEach(() => {
    if (driver) driver.stopServer();
  });

  function createDriver(files) {
    driver = new Driver(
      { 'name': 'TestMud', 'mudlib directory': '/', 'master file': '/master' },
      { readFile: (path) => files[path] ?? files[path + '.c'] ?? files[path.replace(/\.c$/, '')] ?? null },
    );
    driver.objects.load('/master.c');
    return driver;
  }

  it('accepts a connection and sends welcome', async () => {
    const d = createDriver({
      '/master.c': 'object connect() { return clone_object("/login"); }\nvoid create() { }',
      '/login.c': 'void logon() { write("Welcome!\\n"); }\nvoid create() { }',
    });
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
    const d = createDriver({
      '/master.c': 'object connect() { return clone_object("/login"); }\nvoid create() { }',
      '/login.c': 'void logon() { write("Ready.\\n"); }\nvoid create() { }',
    });
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
    const d = createDriver({
      '/master.c': 'object connect() { return clone_object("/player"); }\nvoid create() { }',
      '/player.c': 'void create() { add_action("do_say", "say"); }\nvoid logon() { write("Ready.\\n"); }\nint do_say(string arg) { write("You say: " + arg + "\\n"); return 1; }',
    });
    const port = await d.startServer(0);

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
