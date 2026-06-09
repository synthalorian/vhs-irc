import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { WebSocket } from 'ws';
import { createServer, Server } from 'http';
import { IrcWebSocketServer } from '../src/websocket/server';
import { ConnectionManager } from '../src/connection/manager';
import { IrcMessage } from '../src/irc/types';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForMessage(ws: WebSocket, timeout = 1000): Promise<IrcMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForOpen(ws: WebSocket, timeout = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  it('adds a client and returns an id', () => {
    const mockSocket = { close() {}, on() {}, readyState: 1 } as unknown as WebSocket;
    const id = manager.addClient(mockSocket);
    assert.ok(id.startsWith('client_'));
    assert.strictEqual(manager.getAllClients().length, 1);
  });

  it('removes a client', () => {
    const mockSocket = { close() {}, on() {}, readyState: 1 } as unknown as WebSocket;
    const id = manager.addClient(mockSocket);
    manager.removeClient(id);
    assert.strictEqual(manager.getAllClients().length, 0);
  });

  it('sends message to specific client', async () => {
    const msg: IrcMessage = { command: 'PING', params: ['test'] };
    let receivedData: string | null = null;

    const mockSocket = {
      close() {},
      on() {},
      readyState: 1,
      send(data: string) {
        receivedData = data;
      },
    } as unknown as WebSocket;

    const id = manager.addClient(mockSocket);
    manager.sendTo(id, msg);

    await wait(50);
    assert.ok(receivedData);
    const parsed = JSON.parse(receivedData);
    assert.strictEqual(parsed.command, 'PING');
  });

  it('broadcasts message to all clients', async () => {
    const msg: IrcMessage = { command: 'PONG', params: ['test'] };
    const received: string[] = [];

    const createMockSocket = () =>
      ({
        close() {},
        on() {},
        readyState: 1,
        send(data: string) {
          received.push(data);
        },
      } as unknown as WebSocket);

    manager.addClient(createMockSocket());
    manager.addClient(createMockSocket());
    manager.broadcast(msg);

    await wait(50);
    assert.strictEqual(received.length, 2);
    for (const data of received) {
      const parsed = JSON.parse(data);
      assert.strictEqual(parsed.command, 'PONG');
    }
  });

  it('calls message handlers on incoming message', async () => {
    const msg: IrcMessage = { command: 'PRIVMSG', params: ['#chan', 'hello'] };
    let handlerCalled = false;
    let receivedMsg: IrcMessage | null = null;

    const mockSocket = {
      close() {},
      on(event: string, handler: (data: Buffer) => void) {
        if (event === 'message') {
          setTimeout(() => handler(Buffer.from(JSON.stringify(msg))), 10);
        }
      },
      readyState: 1,
    } as unknown as WebSocket;

    manager.onMessage((clientId, received) => {
      handlerCalled = true;
      receivedMsg = received;
    });

    manager.addClient(mockSocket);
    await wait(100);

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(receivedMsg!.command, 'PRIVMSG');
  });
});

describe('IrcWebSocketServer', () => {
  let httpServer: Server;
  let wsServer: IrcWebSocketServer;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as { port: number }).port;
        wsServer = new IrcWebSocketServer({ httpServer, path: '/ws' });
        resolve();
      });
    });
  });

  afterEach(async () => {
    await wsServer.close();
    httpServer.close();
  });

  it('accepts WebSocket connections', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(ws);
    assert.strictEqual(ws.readyState, WebSocket.OPEN);
    ws.close();
  });

  it('sends welcome message on connect', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const msg = await waitForMessage(ws);
    assert.strictEqual(msg.command, 'WELCOME');
    ws.close();
  });

  it('tracks connected clients', async () => {
    assert.strictEqual(wsServer.clientsCount, 0);
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForOpen(ws);
    assert.strictEqual(wsServer.clientsCount, 1);
    ws.close();
  });

  it('broadcasts messages to all clients', async () => {
    const msg: IrcMessage = { command: 'NOTICE', params: ['#general', 'Hello all'] };

    const ws1 = new WebSocket(`ws://localhost:${port}/ws`);
    const ws2 = new WebSocket(`ws://localhost:${port}/ws`);

    await waitForMessage(ws1);
    await waitForMessage(ws2);

    wsServer.broadcast(msg);

    const [received1, received2] = await Promise.all([
      waitForMessage(ws1),
      waitForMessage(ws2),
    ]);

    assert.deepStrictEqual(received1.params, msg.params);
    assert.deepStrictEqual(received2.params, msg.params);

    ws1.close();
    ws2.close();
  });

  it('receives messages from clients', async () => {
    const msg: IrcMessage = { command: 'PRIVMSG', params: ['#general', 'Hi'] };
    let receivedMsg: IrcMessage | null = null;

    wsServer.connections.onMessage((clientId, received) => {
      receivedMsg = received;
    });

    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await waitForMessage(ws);
    ws.send(JSON.stringify(msg));

    await wait(100);
    assert.strictEqual(receivedMsg!.command, 'PRIVMSG');
    assert.deepStrictEqual(receivedMsg!.params, msg.params);
    ws.close();
  });
});
