import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseLine,
  parseBuffer,
  serializeMessage,
  makeMessage,
  makeTargetMessage,
  IrcParseError,
} from '../src/irc/index';

describe('IRC Parser', () => {
  describe('parseLine', () => {
    it('parses simple command with no params', () => {
      const msg = parseLine('PING');
      assert.strictEqual(msg.command, 'PING');
      assert.deepStrictEqual(msg.params, []);
      assert.strictEqual(msg.prefix, undefined);
    });

    it('parses command with single trailing param', () => {
      const msg = parseLine('PING :server.irc.net');
      assert.strictEqual(msg.command, 'PING');
      assert.deepStrictEqual(msg.params, ['server.irc.net']);
    });

    it('parses command with multiple middle params', () => {
      const msg = parseLine('NICK newnick');
      assert.strictEqual(msg.command, 'NICK');
      assert.deepStrictEqual(msg.params, ['newnick']);
    });

    it('parses user prefix with nick!user@host', () => {
      const msg = parseLine(':john!john@example.com PRIVMSG #chan :Hello world');
      assert.strictEqual(msg.command, 'PRIVMSG');
      assert.strictEqual(msg.prefix?.nick, 'john');
      assert.strictEqual(msg.prefix?.user, 'john');
      assert.strictEqual(msg.prefix?.host, 'example.com');
      assert.deepStrictEqual(msg.params, ['#chan', 'Hello world']);
    });

    it('parses server prefix', () => {
      const msg = parseLine(':irc.server.net 001 mynick :Welcome to IRC');
      assert.strictEqual(msg.command, '001');
      assert.strictEqual(msg.prefix?.server, 'irc.server.net');
      assert.deepStrictEqual(msg.params, ['mynick', 'Welcome to IRC']);
    });

    it('parses numeric reply', () => {
      const msg = parseLine(':server 375 nick :- server Message of the Day -');
      assert.strictEqual(msg.command, '375');
      assert.deepStrictEqual(msg.params, ['nick', '- server Message of the Day -']);
    });

    it('parses JOIN command', () => {
      const msg = parseLine(':nick!user@host JOIN #channel');
      assert.strictEqual(msg.command, 'JOIN');
      assert.strictEqual(msg.prefix?.nick, 'nick');
      assert.deepStrictEqual(msg.params, ['#channel']);
    });

    it('parses QUIT with reason', () => {
      const msg = parseLine(':nick!user@host QUIT :Leaving');
      assert.strictEqual(msg.command, 'QUIT');
      assert.deepStrictEqual(msg.params, ['Leaving']);
    });

    it('parses MODE command', () => {
      const msg = parseLine(':nick MODE #channel +o user');
      assert.strictEqual(msg.command, 'MODE');
      assert.deepStrictEqual(msg.params, ['#channel', '+o', 'user']);
    });

    it('handles empty trailing parameter', () => {
      const msg = parseLine('TOPIC #channel :');
      assert.strictEqual(msg.command, 'TOPIC');
      assert.deepStrictEqual(msg.params, ['#channel', '']);
    });

    it('parses WHOIS reply', () => {
      const msg = parseLine(':server 311 nick target targetuser host.com * :Real Name');
      assert.strictEqual(msg.command, '311');
      assert.deepStrictEqual(msg.params, ['nick', 'target', 'targetuser', 'host.com', '*', 'Real Name']);
    });

    it('converts command to uppercase', () => {
      const msg = parseLine('privmsg #chan :hi');
      assert.strictEqual(msg.command, 'PRIVMSG');
    });

    it('throws on empty line', () => {
      assert.throws(() => parseLine(''), IrcParseError);
    });

    it('throws on prefix without command', () => {
      assert.throws(() => parseLine(':nick'), IrcParseError);
    });

    it('throws on invalid command characters', () => {
      assert.throws(() => parseLine('P1NG'), IrcParseError);
    });

    it('preserves raw field', () => {
      const raw = ':nick!u@h PRIVMSG #c :msg';
      const msg = parseLine(raw);
      assert.strictEqual(msg.raw, raw);
    });
  });

  describe('parseBuffer', () => {
    it('parses multiple complete messages', () => {
      const data = 'PING :server\r\nNICK new\r\n';
      const { messages, remainder } = parseBuffer(data);
      assert.strictEqual(messages.length, 2);
      assert.strictEqual(remainder, '');
    });

    it('returns partial line as remainder', () => {
      const data = 'PING :server\r\n:P';
      const { messages, remainder } = parseBuffer(data);
      assert.strictEqual(messages.length, 1);
      assert.strictEqual(remainder, ':P');
    });

    it('handles empty buffer', () => {
      const { messages, remainder } = parseBuffer('');
      assert.strictEqual(messages.length, 0);
      assert.strictEqual(remainder, '');
    });

    it('skips empty lines gracefully', () => {
      const data = 'PING :a\r\n\r\nPONG :b\r\n';
      const { messages, remainder } = parseBuffer(data);
      assert.strictEqual(messages.length, 2);
    });
  });

  describe('serializeMessage', () => {
    it('serializes simple command', () => {
      const msg = makeMessage('PING', 'server.irc.net');
      assert.strictEqual(serializeMessage(msg), 'PING server.irc.net\r\n');
    });

    it('serializes command with trailing param', () => {
      const msg = makeMessage('PRIVMSG', '#chan', 'Hello world');
      assert.strictEqual(serializeMessage(msg), 'PRIVMSG #chan :Hello world\r\n');
    });

    it('serializes command with prefix', () => {
      const msg = {
        prefix: { raw: 'nick!user@host' },
        command: 'PRIVMSG',
        params: ['#chan', 'Hello world'],
      };
      assert.strictEqual(serializeMessage(msg), ':nick!user@host PRIVMSG #chan :Hello world\r\n');
    });

    it('serializes empty trailing param with colon', () => {
      const msg = makeMessage('TOPIC', '#chan', '');
      assert.strictEqual(serializeMessage(msg), 'TOPIC #chan :\r\n');
    });

    it('serializes no params', () => {
      const msg = makeMessage('QUIT');
      assert.strictEqual(serializeMessage(msg), 'QUIT\r\n');
    });

    it('throws on middle param with space', () => {
      const msg = makeMessage('TEST', 'has space', 'last');
      assert.throws(() => serializeMessage(msg), /Middle parameter cannot contain spaces/);
    });

    it('round-trips parse and serialize', () => {
      const original = ':nick!user@host PRIVMSG #channel :Hello everyone!';
      const msg = parseLine(original);
      const serialized = serializeMessage(msg);
      assert.strictEqual(serialized, `${original}\r\n`);
    });
  });

  describe('makeTargetMessage', () => {
    it('creates PRIVMSG to channel', () => {
      const msg = makeTargetMessage('PRIVMSG', '#general', 'Hello');
      assert.strictEqual(msg.command, 'PRIVMSG');
      assert.deepStrictEqual(msg.params, ['#general', 'Hello']);
    });

    it('creates NOTICE to user', () => {
      const msg = makeTargetMessage('NOTICE', 'nick', 'Be careful');
      assert.strictEqual(msg.command, 'NOTICE');
      assert.deepStrictEqual(msg.params, ['nick', 'Be careful']);
    });
  });
});
