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
    parser.feed(Buffer.from([0x68, 0x69, IAC, WILL, 0x01, 0x6C, 0x6F]));
    assert.equal(Buffer.concat(chunks).toString(), 'hilo');
    assert.equal(commands.length, 1);
    assert.equal(commands[0].cmd, WILL);
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
