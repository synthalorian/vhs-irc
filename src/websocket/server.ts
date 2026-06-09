import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { IrcMessage } from '../irc/types';
import { ConnectionManager } from '../connection/manager';
import { MessageRepository } from '../db/messages';

export interface WebSocketServerOptions {
  httpServer: HttpServer;
  path?: string;
  messageRepository?: MessageRepository;
}

export class IrcWebSocketServer {
  private wss: WebSocketServer;
  public readonly connections: ConnectionManager;

  constructor(options: WebSocketServerOptions) {
    this.connections = new ConnectionManager({
      messageRepository: options.messageRepository,
    });
    this.wss = new WebSocketServer({
      server: options.httpServer,
      path: options.path || '/ws',
    });

    this.wss.on('connection', (socket: WebSocket) => {
      const clientId = this.connections.addClient(socket);

      this.connections.sendTo(clientId, {
        command: 'WELCOME',
        params: ['Connected to vhs-irc WebSocket server'],
      });
    });
  }

  broadcast(msg: IrcMessage): void {
    this.connections.broadcast(msg);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.connections.getAllClients()) {
        client.socket.close();
      }
      this.wss.close(() => resolve());
    });
  }

  get clientsCount(): number {
    return this.connections.getAllClients().length;
  }
}
