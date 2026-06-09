import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { IrcMessage } from '../irc/types';
import { ConnectionManager } from '../connection/manager';
import { MessageRepository } from '../db/messages';
import { UploadRepository } from '../db/uploads';
import { BouncerManager } from '../bouncer/manager';

export interface WebSocketServerOptions {
  httpServer: HttpServer;
  path?: string;
  messageRepository?: MessageRepository;
  uploadRepository?: UploadRepository;
  bouncerManager?: BouncerManager;
}

export class IrcWebSocketServer {
  private wss: WebSocketServer;
  public readonly connections: ConnectionManager;
  private bouncer?: BouncerManager;

  constructor(options: WebSocketServerOptions) {
    this.connections = new ConnectionManager({
      messageRepository: options.messageRepository,
      uploadRepository: options.uploadRepository,
    });
    this.bouncer = options.bouncerManager;

    if (this.bouncer) {
      this.bouncer.setBroadcastFn((msg) => this.broadcast(msg));
    }

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

      // Send network statuses
      if (this.bouncer) {
        const statuses = this.bouncer.getNetworkStatuses();
        for (const status of statuses) {
          this.connections.sendTo(clientId, {
            command: 'NETWORK_STATUS',
            params: [status.name, status.state, status.nick, ...status.channels],
          });
        }
      }

      // Handle messages from client through bouncer
      this.connections.onMessage((cid, msg) => {
        if (this.bouncer) {
          this.bouncer.handleClientMessage(cid, msg);
        }
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
