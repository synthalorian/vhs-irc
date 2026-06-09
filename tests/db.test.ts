import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseConnection, MessageRepository, ChannelRepository, UserRepository, resetDatabase } from '../src/db/index';
import { unlinkSync } from 'fs';

const TEST_DB = './data/test-vhs-irc.db';

describe('Database', () => {
  let db: DatabaseConnection;

  beforeEach(async () => {
    resetDatabase();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
    db = new DatabaseConnection(TEST_DB);
    await db.init();
  });

  afterEach(async () => {
    await db.close();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  describe('initialization', () => {
    it('creates tables on init', async () => {
      const tables = await db.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('messages', 'channels', 'users')`
      );
      const names = tables.map(t => t.name).sort();
      assert.deepStrictEqual(names, ['channels', 'messages', 'users']);
    });

    it('creates indexes on init', async () => {
      const indexes = await db.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_messages_%'`
      );
      assert.strictEqual(indexes.length, 3);
    });

    it('is idempotent', async () => {
      await db.init();
      await db.init();
      const count = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'`);
      assert.ok(count && count.count >= 3);
    });
  });
});

describe('MessageRepository', () => {
  let db: DatabaseConnection;
  let messages: MessageRepository;

  beforeEach(async () => {
    resetDatabase();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
    db = new DatabaseConnection(TEST_DB);
    await db.init();
    messages = new MessageRepository(db);
  });

  afterEach(async () => {
    await db.close();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  it('creates a message', async () => {
    const msg = await messages.create({
      channel: '#general',
      nick: 'alice',
      content: 'Hello world',
    });

    assert.strictEqual(msg.nick, 'alice');
    assert.strictEqual(msg.content, 'Hello world');
    assert.strictEqual(msg.channel, '#general');
    assert.strictEqual(msg.command, 'PRIVMSG');
    assert.ok(msg.id > 0);
    assert.ok(msg.timestamp > 0);
  });

  it('creates a message without channel', async () => {
    const msg = await messages.create({
      nick: 'bob',
      content: 'Direct message',
    });

    assert.strictEqual(msg.channel, null);
    assert.strictEqual(msg.nick, 'bob');
  });

  it('finds message by id', async () => {
    const created = await messages.create({
      channel: '#test',
      nick: 'charlie',
      content: 'Test message',
    });

    const found = await messages.findById(created.id);
    assert.ok(found);
    assert.strictEqual(found!.content, 'Test message');
  });

  it('finds messages by channel', async () => {
    await messages.create({ channel: '#general', nick: 'a', content: 'msg1' });
    await messages.create({ channel: '#general', nick: 'b', content: 'msg2' });
    await messages.create({ channel: '#other', nick: 'c', content: 'msg3' });

    const general = await messages.findByChannel('#general');
    assert.strictEqual(general.length, 2);
    assert.strictEqual(general[0].content, 'msg1');
    assert.strictEqual(general[1].content, 'msg2');
  });

  it('finds messages by nick', async () => {
    await messages.create({ channel: '#general', nick: 'alice', content: 'msg1' });
    await messages.create({ channel: '#general', nick: 'alice', content: 'msg2' });
    await messages.create({ channel: '#general', nick: 'bob', content: 'msg3' });

    const aliceMsgs = await messages.findByNick('alice');
    assert.strictEqual(aliceMsgs.length, 2);
  });

  it('finds recent messages', async () => {
    await messages.create({ nick: 'a', content: 'old' });
    await messages.create({ nick: 'b', content: 'new' });

    const recent = await messages.findRecent(1);
    assert.strictEqual(recent.length, 1);
  });

  it('searches messages by content', async () => {
    await messages.create({ nick: 'a', content: 'hello world' });
    await messages.create({ nick: 'b', content: 'goodbye world' });
    await messages.create({ nick: 'c', content: 'something else' });

    const results = await messages.search('world');
    assert.strictEqual(results.length, 2);
  });

  it('deletes message by id', async () => {
    const msg = await messages.create({ nick: 'a', content: 'delete me' });
    await messages.deleteById(msg.id);
    const found = await messages.findById(msg.id);
    assert.strictEqual(found, undefined);
  });

  it('deletes messages by channel', async () => {
    await messages.create({ channel: '#general', nick: 'a', content: 'msg1' });
    await messages.create({ channel: '#general', nick: 'b', content: 'msg2' });
    await messages.create({ channel: '#other', nick: 'c', content: 'msg3' });

    await messages.deleteByChannel('#general');
    assert.strictEqual(await messages.count(), 1);
  });

  it('counts messages', async () => {
    assert.strictEqual(await messages.count(), 0);
    await messages.create({ nick: 'a', content: 'msg' });
    assert.strictEqual(await messages.count(), 1);
  });

  it('counts messages by channel', async () => {
    await messages.create({ channel: '#general', nick: 'a', content: 'msg1' });
    await messages.create({ channel: '#general', nick: 'b', content: 'msg2' });
    await messages.create({ channel: '#other', nick: 'c', content: 'msg3' });

    assert.strictEqual(await messages.countByChannel('#general'), 2);
    assert.strictEqual(await messages.countByChannel('#other'), 1);
  });
});

describe('ChannelRepository', () => {
  let db: DatabaseConnection;
  let channels: ChannelRepository;

  beforeEach(async () => {
    resetDatabase();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
    db = new DatabaseConnection(TEST_DB);
    await db.init();
    channels = new ChannelRepository(db);
  });

  afterEach(async () => {
    await db.close();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  it('creates a channel', async () => {
    const ch = await channels.create({ name: '#general' });
    assert.strictEqual(ch.name, '#general');
    assert.ok(ch.id > 0);
    assert.ok(ch.created_at > 0);
  });

  it('creates a channel with topic', async () => {
    const ch = await channels.create({ name: '#general', topic: 'General chat' });
    assert.strictEqual(ch.topic, 'General chat');
  });

  it('finds channel by id', async () => {
    const created = await channels.create({ name: '#test' });
    const found = await channels.findById(created.id);
    assert.ok(found);
    assert.strictEqual(found!.name, '#test');
  });

  it('finds channel by name', async () => {
    await channels.create({ name: '#general' });
    const found = await channels.findByName('#general');
    assert.ok(found);
    assert.strictEqual(found!.name, '#general');
  });

  it('finds all channels', async () => {
    await channels.create({ name: '#alpha' });
    await channels.create({ name: '#beta' });

    const all = await channels.findAll();
    assert.strictEqual(all.length, 2);
  });

  it('updates channel topic', async () => {
    const created = await channels.create({ name: '#general' });
    const updated = await channels.update(created.id, { topic: 'New topic' });
    assert.strictEqual(updated!.topic, 'New topic');
  });

  it('updates topic by name', async () => {
    await channels.create({ name: '#general' });
    await channels.updateTopic('#general', 'Updated topic');
    const found = await channels.findByName('#general');
    assert.strictEqual(found!.topic, 'Updated topic');
  });

  it('deletes channel by id', async () => {
    const ch = await channels.create({ name: '#temp' });
    await channels.deleteById(ch.id);
    assert.strictEqual(await channels.findById(ch.id), undefined);
  });

  it('deletes channel by name', async () => {
    await channels.create({ name: '#temp' });
    await channels.deleteByName('#temp');
    assert.strictEqual(await channels.findByName('#temp'), undefined);
  });

  it('counts channels', async () => {
    assert.strictEqual(await channels.count(), 0);
    await channels.create({ name: '#general' });
    assert.strictEqual(await channels.count(), 1);
  });
});

describe('UserRepository', () => {
  let db: DatabaseConnection;
  let users: UserRepository;

  beforeEach(async () => {
    resetDatabase();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
    db = new DatabaseConnection(TEST_DB);
    await db.init();
    users = new UserRepository(db);
  });

  afterEach(async () => {
    await db.close();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  it('creates a user', async () => {
    const user = await users.create({ nick: 'alice' });
    assert.strictEqual(user.nick, 'alice');
    assert.ok(user.id > 0);
    assert.ok(user.created_at > 0);
  });

  it('creates a user with all fields', async () => {
    const user = await users.create({
      nick: 'alice',
      username: 'aliceuser',
      hostname: 'example.com',
      realname: 'Alice Smith',
      password_hash: 'hash123',
    });

    assert.strictEqual(user.username, 'aliceuser');
    assert.strictEqual(user.hostname, 'example.com');
    assert.strictEqual(user.realname, 'Alice Smith');
    assert.strictEqual(user.password_hash, 'hash123');
  });

  it('finds user by id', async () => {
    const created = await users.create({ nick: 'bob' });
    const found = await users.findById(created.id);
    assert.ok(found);
    assert.strictEqual(found!.nick, 'bob');
  });

  it('finds user by nick', async () => {
    await users.create({ nick: 'charlie' });
    const found = await users.findByNick('charlie');
    assert.ok(found);
    assert.strictEqual(found!.nick, 'charlie');
  });

  it('finds all users', async () => {
    await users.create({ nick: 'alice' });
    await users.create({ nick: 'bob' });

    const all = await users.findAll();
    assert.strictEqual(all.length, 2);
  });

  it('updates user fields', async () => {
    const created = await users.create({ nick: 'alice' });
    const updated = await users.update(created.id, {
      realname: 'Alice Updated',
      hostname: 'newhost.com',
    });

    assert.strictEqual(updated!.realname, 'Alice Updated');
    assert.strictEqual(updated!.hostname, 'newhost.com');
  });

  it('updates user by nick', async () => {
    await users.create({ nick: 'alice' });
    await users.updateByNick('alice', { realname: 'Updated Name' });
    const found = await users.findByNick('alice');
    assert.strictEqual(found!.realname, 'Updated Name');
  });

  it('deletes user by id', async () => {
    const user = await users.create({ nick: 'temp' });
    await users.deleteById(user.id);
    assert.strictEqual(await users.findById(user.id), undefined);
  });

  it('deletes user by nick', async () => {
    await users.create({ nick: 'temp' });
    await users.deleteByNick('temp');
    assert.strictEqual(await users.findByNick('temp'), undefined);
  });

  it('counts users', async () => {
    assert.strictEqual(await users.count(), 0);
    await users.create({ nick: 'alice' });
    assert.strictEqual(await users.count(), 1);
  });
});

describe('Integration', () => {
  let db: DatabaseConnection;
  let messages: MessageRepository;
  let channels: ChannelRepository;
  let users: UserRepository;

  beforeEach(async () => {
    resetDatabase();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
    db = new DatabaseConnection(TEST_DB);
    await db.init();
    messages = new MessageRepository(db);
    channels = new ChannelRepository(db);
    users = new UserRepository(db);
  });

  afterEach(async () => {
    await db.close();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  it('persists full IRC workflow', async () => {
    // User joins channel
    const user = await users.create({
      nick: 'alice',
      username: 'aliceuser',
      hostname: 'example.com',
      realname: 'Alice Smith',
    });

    const channel = await channels.create({
      name: '#general',
      topic: 'General discussion',
    });

    // Messages are sent
    const msg1 = await messages.create({
      channel: channel.name,
      nick: user.nick,
      content: 'Hello everyone!',
      command: 'PRIVMSG',
    });

    const msg2 = await messages.create({
      channel: channel.name,
      nick: 'bob',
      content: 'Hi alice!',
      command: 'PRIVMSG',
    });

    // Query history
    const history = await messages.findByChannel('#general');
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].content, 'Hello everyone!');
    assert.strictEqual(history[1].content, 'Hi alice!');

    // Verify counts
    assert.strictEqual(await messages.count(), 2);
    assert.strictEqual(await channels.count(), 1);
    assert.strictEqual(await users.count(), 1);

    // Channel messages are deleted when channel is deleted
    await channels.deleteByName('#general');
    assert.strictEqual(await channels.count(), 0);
  });
});
