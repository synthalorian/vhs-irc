import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { MessageBuffer } from '../src/bouncer/buffer';
import { BouncerManager } from '../src/bouncer/manager';
import { NetworkRepository, DatabaseConnection, resetDatabase } from '../src/db/index';
import { unlinkSync } from 'fs';
import { IrcMessage } from '../src/irc/types';

const TEST_DB = './data/test-bouncer.db';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('MessageBuffer', () => {
  let buffer: MessageBuffer;

  beforeEach(() => {
    buffer = new MessageBuffer(100);
  });

  it('buffers messages for a client', () => {
    const msg: IrcMessage = { command: 'PRIVMSG', params: ['#general', 'Hello'] };
    buffer.bufferForClient('client1', 1, 'libera', msg);

    const undelivered = buffer.getUndelivered('client1');
    assert.strictEqual(undelivered.length, 1);
    assert.strictEqual(undelivered[0].networkId, 1);
    assert.strictEqual(undelivered[0].networkName, 'libera');
    assert.strictEqual(undelivered[0].message.command, 'PRIVMSG');
  });

  it('marks messages as delivered', () => {
    const msg: IrcMessage = { command: 'PRIVMSG', params: ['#general', 'Hello'] };
    buffer.bufferForClient('client1', 1, 'libera', msg);

    const undelivered = buffer.getUndelivered('client1');
    buffer.markDelivered('client1', [undelivered[0].id]);

    assert.strictEqual(buffer.getUndelivered('client1').length, 0);
  });

  it('marks all messages as delivered', () => {
    buffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', 'hi'] });
    buffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#b', 'hey'] });

    buffer.markAllDelivered('client1');
    assert.strictEqual(buffer.getUndelivered('client1').length, 0);
  });

  it('clears client buffer', () => {
    buffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', 'hi'] });
    buffer.clearClient('client1');
    assert.strictEqual(buffer.getBufferSize('client1'), 0);
  });

  it('tracks buffer size per client', () => {
    buffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', 'hi'] });
    buffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#b', 'hey'] });
    assert.strictEqual(buffer.getBufferSize('client1'), 2);
    assert.strictEqual(buffer.getBufferSize('client2'), 0);
  });

  it('tracks total buffer size', () => {
    buffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', 'hi'] });
    buffer.bufferForClient('client2', 1, 'libera', { command: 'PRIVMSG', params: ['#b', 'hey'] });
    assert.strictEqual(buffer.getTotalSize(), 2);
  });

  it('enforces max buffer size', () => {
    const smallBuffer = new MessageBuffer(2);
    smallBuffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', '1'] });
    smallBuffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', '2'] });
    smallBuffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', '3'] });

    assert.strictEqual(smallBuffer.getBufferSize('client1'), 2);
  });

  it('prunes old delivered messages', () => {
    buffer.bufferForClient('client1', 1, 'libera', { command: 'PRIVMSG', params: ['#a', 'hi'] });
    buffer.markAllDelivered('client1');

    buffer.pruneDelivered(0); // Immediate prune
    assert.strictEqual(buffer.getBufferSize('client1'), 0);
  });
});

describe('BouncerManager', () => {
  let db: DatabaseConnection;
  let networks: NetworkRepository;
  let bouncer: BouncerManager;

  beforeEach(async () => {
    resetDatabase();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
    db = new DatabaseConnection(TEST_DB);
    await db.init();
    networks = new NetworkRepository(db);
    bouncer = new BouncerManager({ networkRepository: networks });
  });

  afterEach(async () => {
    await bouncer.shutdown();
    await db.close();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  it('initializes with auto-connect networks', async () => {
    await networks.create({
      name: 'testnet',
      host: 'localhost',
      port: 6667,
      nick: 'testuser',
      autoConnect: true,
    });

    await bouncer.init();
    const statuses = bouncer.getNetworkStatuses();
    assert.strictEqual(statuses.length, 1);
    assert.strictEqual(statuses[0].name, 'testnet');
  });

  it('does not auto-connect when autoConnect is false', async () => {
    await networks.create({
      name: 'manualnet',
      host: 'localhost',
      port: 6667,
      nick: 'testuser',
      autoConnect: false,
    });

    await bouncer.init();
    const statuses = bouncer.getNetworkStatuses();
    assert.strictEqual(statuses.length, 0);
  });

  it('adds and removes networks', async () => {
    const network = await networks.create({
      name: 'addnet',
      host: 'localhost',
      port: 6667,
      nick: 'testuser',
    });

    await bouncer.addNetwork(network);
    assert.strictEqual(bouncer.getNetworkStatuses().length, 1);

    const removed = bouncer.removeNetwork(network.id);
    assert.strictEqual(removed, true);
    assert.strictEqual(bouncer.getNetworkStatuses().length, 0);
  });

  it('gets network by name', async () => {
    const network = await networks.create({
      name: 'namednet',
      host: 'localhost',
      port: 6667,
      nick: 'testuser',
    });

    await bouncer.addNetwork(network);
    const found = bouncer.getNetworkByName('namednet');
    assert.ok(found);
    assert.strictEqual(found!.name, 'namednet');
  });

  it('returns undefined for non-existent network', () => {
    assert.strictEqual(bouncer.getNetworkByName('nonexistent'), undefined);
    assert.strictEqual(bouncer.getNetwork(999), undefined);
  });

  it('handles client messages with NETWORK command', async () => {
    let handlerCalled = false;
    let receivedNetworkId: number | null = null;

    bouncer.onClientMessage((_clientId, networkId, _msg) => {
      handlerCalled = true;
      receivedNetworkId = networkId;
    });

    const network = await networks.create({
      name: 'cmdnet',
      host: 'localhost',
      port: 6667,
      nick: 'testuser',
    });
    await bouncer.addNetwork(network);

    bouncer.handleClientMessage('client1', {
      command: 'NETWORK',
      params: ['cmdnet', 'PRIVMSG', '#general', 'Hello'],
    });

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(receivedNetworkId, network.id);
  });

  it('handles client messages without network context', async () => {
    let receivedNetworkId: number | null = -1;

    bouncer.onClientMessage((_clientId, networkId, _msg) => {
      receivedNetworkId = networkId;
    });

    const network = await networks.create({
      name: 'singlenet',
      host: 'localhost',
      port: 6667,
      nick: 'testuser',
    });
    await bouncer.addNetwork(network);

    // Simulate connected state for routing
    const conn = bouncer.getNetwork(network.id);
    if (conn) {
      // Force state to connected for test
      (conn as any).state = 'registered';
    }

    bouncer.handleClientMessage('client1', {
      command: 'PRIVMSG',
      params: ['#general', 'Hello'],
    });

    assert.strictEqual(receivedNetworkId, network.id);
  });

  it('broadcasts messages to clients', () => {
    let broadcastReceived: IrcMessage | null = null;

    bouncer.setBroadcastFn((msg) => {
      broadcastReceived = msg;
    });

    bouncer.broadcastToClients(1, {
      command: 'TEST',
      params: ['hello'],
    });

    assert.ok(broadcastReceived);
    assert.strictEqual((broadcastReceived as IrcMessage).command, 'TEST');
  });

  it('returns network statuses with correct structure', async () => {
    const network = await networks.create({
      name: 'statusnet',
      host: 'localhost',
      port: 6667,
      nick: 'testuser',
    });
    await bouncer.addNetwork(network);

    const statuses = bouncer.getNetworkStatuses();
    assert.strictEqual(statuses.length, 1);
    assert.ok('id' in statuses[0]);
    assert.ok('name' in statuses[0]);
    assert.ok('state' in statuses[0]);
    assert.ok('nick' in statuses[0]);
    assert.ok('channels' in statuses[0]);
  });
});

describe('NetworkRepository', () => {
  let db: DatabaseConnection;
  let networks: NetworkRepository;

  beforeEach(async () => {
    resetDatabase();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
    db = new DatabaseConnection(TEST_DB);
    await db.init();
    networks = new NetworkRepository(db);
  });

  afterEach(async () => {
    await db.close();
    try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  it('creates a network', async () => {
    const network = await networks.create({
      name: 'libera',
      host: 'irc.libera.chat',
      port: 6667,
      nick: 'testuser',
    });

    assert.strictEqual(network.name, 'libera');
    assert.strictEqual(network.host, 'irc.libera.chat');
    assert.strictEqual(network.port, 6667);
    assert.strictEqual(network.nick, 'testuser');
    assert.strictEqual(network.tls, 0);
    assert.strictEqual(network.auto_connect, 1);
    assert.ok(network.id > 0);
  });

  it('creates a network with TLS and password', async () => {
    const network = await networks.create({
      name: 'secure',
      host: 'irc.example.com',
      port: 6697,
      tls: true,
      nick: 'secureuser',
      password: 'secret',
    });

    assert.strictEqual(network.tls, 1);
    assert.strictEqual(network.password, 'secret');
  });

  it('finds network by id', async () => {
    const created = await networks.create({
      name: 'findme',
      host: 'localhost',
      port: 6667,
      nick: 'test',
    });

    const found = await networks.findById(created.id);
    assert.ok(found);
    assert.strictEqual(found!.name, 'findme');
  });

  it('finds network by name', async () => {
    await networks.create({
      name: 'byname',
      host: 'localhost',
      port: 6667,
      nick: 'test',
    });

    const found = await networks.findByName('byname');
    assert.ok(found);
    assert.strictEqual(found!.name, 'byname');
  });

  it('finds all networks', async () => {
    await networks.create({ name: 'a', host: 'localhost', port: 6667, nick: 'test' });
    await networks.create({ name: 'b', host: 'localhost', port: 6667, nick: 'test' });

    const all = await networks.findAll();
    assert.strictEqual(all.length, 2);
  });

  it('finds auto-connect networks', async () => {
    await networks.create({ name: 'auto', host: 'localhost', port: 6667, nick: 'test', autoConnect: true });
    await networks.create({ name: 'manual', host: 'localhost', port: 6667, nick: 'test', autoConnect: false });

    const auto = await networks.findAutoConnect();
    assert.strictEqual(auto.length, 1);
    assert.strictEqual(auto[0].name, 'auto');
  });

  it('updates network fields', async () => {
    const created = await networks.create({
      name: 'updatable',
      host: 'localhost',
      port: 6667,
      nick: 'test',
    });

    const updated = await networks.update(created.id, {
      nick: 'newnick',
      port: 6697,
    });

    assert.strictEqual(updated!.nick, 'newnick');
    assert.strictEqual(updated!.port, 6697);
    assert.strictEqual(updated!.name, 'updatable');
  });

  it('deletes network by id', async () => {
    const network = await networks.create({
      name: 'deletable',
      host: 'localhost',
      port: 6667,
      nick: 'test',
    });

    await networks.deleteById(network.id);
    assert.strictEqual(await networks.findById(network.id), undefined);
  });

  it('counts networks', async () => {
    assert.strictEqual(await networks.count(), 0);
    await networks.create({ name: 'a', host: 'localhost', port: 6667, nick: 'test' });
    assert.strictEqual(await networks.count(), 1);
  });
});
