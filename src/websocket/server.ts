import { WebSocketServer, WebSocket, RawData } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import { IrcMessage } from '../irc/types';
import { ConnectionManager } from '../connection/manager';
import { MessageRepository } from '../db/messages';
import { UploadRepository } from '../db/uploads';
import { BouncerManager } from '../bouncer/manager';
import { OAuth2Provider, parseBearerTokenFromUrl } from '../auth';

export interface WebSocketServerOptions {
  httpServer: HttpServer;
  path?: string;
  messageRepository?: MessageRepository;
  uploadRepository?: UploadRepository;
  bouncerManager?: BouncerManager;
  authProvider?: OAuth2Provider;
  requireAuth?: boolean;
}

export class IrcWebSocketServer {
  private wss: WebSocketServer;
  public readonly connections: ConnectionManager;
  private bouncer?: BouncerManager;
  private authProvider?: OAuth2Provider;
  private requireAuth: boolean;

  constructor(options: WebSocketServerOptions) {
    this.connections = new ConnectionManager({
      messageRepository: options.messageRepository,
      uploadRepository: options.uploadRepository,
    });
    this.bouncer = options.bouncerManager;
    this.authProvider = options.authProvider;
    this.requireAuth = options.requireAuth ?? false;

    if (this.bouncer) {
      this.bouncer.setBroadcastFn((msg) => this.broadcast(msg));
    }

    this.wss = new WebSocketServer({
      server: options.httpServer,
      path: options.path || '/ws',
      verifyClient: (info, cb) => this.verifyClient(info, cb),
    });

    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      const token = this.extractToken(request);
      const clientId = this.connections.addClient(socket);

      const client = this.connections.getClient(clientId);
      if (client && token) {
        const record = this.authProvider?.lookupAccessToken(token);
        if (record) {
          client.nick = record.userId;
        }
      }

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

  private extractToken(req: IncomingMessage): string | undefined {
    const auth = req.headers.authorization;
    if (auth) {
      const parts = auth.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
      }
    }
    if (req.url) {
      return parseBearerTokenFromUrl(req.url);
    }
    return undefined;
  }

  private verifyClient(
    info: { req: IncomingMessage },
    cb: (result: boolean, code?: number, message?: string) => void
  ): void {
    if (!this.authProvider || !this.requireAuth) {
      cb(true);
      return;
    }
    const token = this.extractToken(info.req);
    if (!token) {
      cb(false, 401, 'Missing Bearer token');
      return;
    }
    const record = this.authProvider.lookupAccessToken(token);
    if (!record) {
      cb(false, 401, 'Invalid or expired token');
      return;
    }
    cb(true);
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
