"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const index_1 = require("../src/irc/index");
(0, node_test_1.describe)('IRC Parser', () => {
    (0, node_test_1.describe)('parseLine', () => {
        (0, node_test_1.it)('parses simple command with no params', () => {
            const msg = (0, index_1.parseLine)('PING');
            node_assert_1.default.strictEqual(msg.command, 'PING');
            node_assert_1.default.deepStrictEqual(msg.params, []);
            node_assert_1.default.strictEqual(msg.prefix, undefined);
        });
        (0, node_test_1.it)('parses command with single trailing param', () => {
            const msg = (0, index_1.parseLine)('PING :server.irc.net');
            node_assert_1.default.strictEqual(msg.command, 'PING');
            node_assert_1.default.deepStrictEqual(msg.params, ['server.irc.net']);
        });
        (0, node_test_1.it)('parses command with multiple middle params', () => {
            const msg = (0, index_1.parseLine)('NICK newnick');
            node_assert_1.default.strictEqual(msg.command, 'NICK');
            node_assert_1.default.deepStrictEqual(msg.params, ['newnick']);
        });
        (0, node_test_1.it)('parses user prefix with nick!user@host', () => {
            const msg = (0, index_1.parseLine)(':john!john@example.com PRIVMSG #chan :Hello world');
            node_assert_1.default.strictEqual(msg.command, 'PRIVMSG');
            node_assert_1.default.strictEqual(msg.prefix?.nick, 'john');
            node_assert_1.default.strictEqual(msg.prefix?.user, 'john');
            node_assert_1.default.strictEqual(msg.prefix?.host, 'example.com');
            node_assert_1.default.deepStrictEqual(msg.params, ['#chan', 'Hello world']);
        });
        (0, node_test_1.it)('parses server prefix', () => {
            const msg = (0, index_1.parseLine)(':irc.server.net 001 mynick :Welcome to IRC');
            node_assert_1.default.strictEqual(msg.command, '001');
            node_assert_1.default.strictEqual(msg.prefix?.server, 'irc.server.net');
            node_assert_1.default.deepStrictEqual(msg.params, ['mynick', 'Welcome to IRC']);
        });
        (0, node_test_1.it)('parses numeric reply', () => {
            const msg = (0, index_1.parseLine)(':server 375 nick :- server Message of the Day -');
            node_assert_1.default.strictEqual(msg.command, '375');
            node_assert_1.default.deepStrictEqual(msg.params, ['nick', '- server Message of the Day -']);
        });
        (0, node_test_1.it)('parses JOIN command', () => {
            const msg = (0, index_1.parseLine)(':nick!user@host JOIN #channel');
            node_assert_1.default.strictEqual(msg.command, 'JOIN');
            node_assert_1.default.strictEqual(msg.prefix?.nick, 'nick');
            node_assert_1.default.deepStrictEqual(msg.params, ['#channel']);
        });
        (0, node_test_1.it)('parses QUIT with reason', () => {
            const msg = (0, index_1.parseLine)(':nick!user@host QUIT :Leaving');
            node_assert_1.default.strictEqual(msg.command, 'QUIT');
            node_assert_1.default.deepStrictEqual(msg.params, ['Leaving']);
        });
        (0, node_test_1.it)('parses MODE command', () => {
            const msg = (0, index_1.parseLine)(':nick MODE #channel +o user');
            node_assert_1.default.strictEqual(msg.command, 'MODE');
            node_assert_1.default.deepStrictEqual(msg.params, ['#channel', '+o', 'user']);
        });
        (0, node_test_1.it)('handles empty trailing parameter', () => {
            const msg = (0, index_1.parseLine)('TOPIC #channel :');
            node_assert_1.default.strictEqual(msg.command, 'TOPIC');
            node_assert_1.default.deepStrictEqual(msg.params, ['#channel', '']);
        });
        (0, node_test_1.it)('parses WHOIS reply', () => {
            const msg = (0, index_1.parseLine)(':server 311 nick target targetuser host.com * :Real Name');
            node_assert_1.default.strictEqual(msg.command, '311');
            node_assert_1.default.deepStrictEqual(msg.params, ['nick', 'target', 'targetuser', 'host.com', '*', 'Real Name']);
        });
        (0, node_test_1.it)('converts command to uppercase', () => {
            const msg = (0, index_1.parseLine)('privmsg #chan :hi');
            node_assert_1.default.strictEqual(msg.command, 'PRIVMSG');
        });
        (0, node_test_1.it)('throws on empty line', () => {
            node_assert_1.default.throws(() => (0, index_1.parseLine)(''), index_1.IrcParseError);
        });
        (0, node_test_1.it)('throws on prefix without command', () => {
            node_assert_1.default.throws(() => (0, index_1.parseLine)(':nick'), index_1.IrcParseError);
        });
        (0, node_test_1.it)('throws on invalid command characters', () => {
            node_assert_1.default.throws(() => (0, index_1.parseLine)('P1NG'), index_1.IrcParseError);
        });
        (0, node_test_1.it)('preserves raw field', () => {
            const raw = ':nick!u@h PRIVMSG #c :msg';
            const msg = (0, index_1.parseLine)(raw);
            node_assert_1.default.strictEqual(msg.raw, raw);
        });
    });
    (0, node_test_1.describe)('parseBuffer', () => {
        (0, node_test_1.it)('parses multiple complete messages', () => {
            const data = 'PING :server\r\nNICK new\r\n';
            const { messages, remainder } = (0, index_1.parseBuffer)(data);
            node_assert_1.default.strictEqual(messages.length, 2);
            node_assert_1.default.strictEqual(remainder, '');
        });
        (0, node_test_1.it)('returns partial line as remainder', () => {
            const data = 'PING :server\r\n:P';
            const { messages, remainder } = (0, index_1.parseBuffer)(data);
            node_assert_1.default.strictEqual(messages.length, 1);
            node_assert_1.default.strictEqual(remainder, ':P');
        });
        (0, node_test_1.it)('handles empty buffer', () => {
            const { messages, remainder } = (0, index_1.parseBuffer)('');
            node_assert_1.default.strictEqual(messages.length, 0);
            node_assert_1.default.strictEqual(remainder, '');
        });
        (0, node_test_1.it)('skips empty lines gracefully', () => {
            const data = 'PING :a\r\n\r\nPONG :b\r\n';
            const { messages, remainder } = (0, index_1.parseBuffer)(data);
            node_assert_1.default.strictEqual(messages.length, 2);
        });
    });
    (0, node_test_1.describe)('serializeMessage', () => {
        (0, node_test_1.it)('serializes simple command', () => {
            const msg = (0, index_1.makeMessage)('PING', 'server.irc.net');
            node_assert_1.default.strictEqual((0, index_1.serializeMessage)(msg), 'PING server.irc.net\r\n');
        });
        (0, node_test_1.it)('serializes command with trailing param', () => {
            const msg = (0, index_1.makeMessage)('PRIVMSG', '#chan', 'Hello world');
            node_assert_1.default.strictEqual((0, index_1.serializeMessage)(msg), 'PRIVMSG #chan :Hello world\r\n');
        });
        (0, node_test_1.it)('serializes command with prefix', () => {
            const msg = {
                prefix: { raw: 'nick!user@host' },
                command: 'PRIVMSG',
                params: ['#chan', 'Hello'],
            };
            node_assert_1.default.strictEqual((0, index_1.serializeMessage)(msg), ':nick!user@host PRIVMSG #chan :Hello\r\n');
        });
        (0, node_test_1.it)('serializes empty trailing param with colon', () => {
            const msg = (0, index_1.makeMessage)('TOPIC', '#chan', '');
            node_assert_1.default.strictEqual((0, index_1.serializeMessage)(msg), 'TOPIC #chan :\r\n');
        });
        (0, node_test_1.it)('serializes no params', () => {
            const msg = (0, index_1.makeMessage)('QUIT');
            node_assert_1.default.strictEqual((0, index_1.serializeMessage)(msg), 'QUIT\r\n');
        });
        (0, node_test_1.it)('throws on middle param with space', () => {
            const msg = (0, index_1.makeMessage)('TEST', 'has space', 'last');
            node_assert_1.default.throws(() => (0, index_1.serializeMessage)(msg), /Middle parameter cannot contain spaces/);
        });
        (0, node_test_1.it)('round-trips parse and serialize', () => {
            const original = ':nick!user@host PRIVMSG #channel :Hello everyone!';
            const msg = (0, index_1.parseLine)(original);
            const serialized = (0, index_1.serializeMessage)(msg);
            node_assert_1.default.strictEqual(serialized, `${original}\r\n`);
        });
    });
    (0, node_test_1.describe)('makeTargetMessage', () => {
        (0, node_test_1.it)('creates PRIVMSG to channel', () => {
            const msg = (0, index_1.makeTargetMessage)('PRIVMSG', '#general', 'Hello');
            node_assert_1.default.strictEqual(msg.command, 'PRIVMSG');
            node_assert_1.default.deepStrictEqual(msg.params, ['#general', 'Hello']);
        });
        (0, node_test_1.it)('creates NOTICE to user', () => {
            const msg = (0, index_1.makeTargetMessage)('NOTICE', 'nick', 'Be careful');
            node_assert_1.default.strictEqual(msg.command, 'NOTICE');
            node_assert_1.default.deepStrictEqual(msg.params, ['nick', 'Be careful']);
        });
    });
});
