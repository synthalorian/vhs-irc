import { WebSocket } from 'ws';
import { IrcMessage } from '../irc/types';
import { MessageRepository } from '../db/messages';
import { UploadRepository } from '../db/uploads';

export interface ClientConnection {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  nick?: string;
  channels: Set<string>;
}

export interface ConnectionManagerOptions {
  messageRepository?: MessageRepository;
  uploadRepository?: UploadRepository;
}

export class ConnectionManager {
  private clients = new Map<string, ClientConnection>();
  private messageHandlers: ((clientId: string, msg: IrcMessage) => void)[] = [];
  private messageRepository?: MessageRepository;
  private uploadRepository?: UploadRepository;

  constructor(options?: ConnectionManagerOptions) {
    this.messageRepository = options?.messageRepository;
    this.uploadRepository = options?.uploadRepository;
  }

  addClient(socket: WebSocket): string {
    const id = this.generateId();
    const client: ClientConnection = {
      id,
      socket,
      connectedAt: new Date(),
      channels: new Set(),
    };
    this.clients.set(id, client);

    socket.on('close', () => this.removeClient(id));
    socket.on('message', (data) => this.handleMessage(id, data));

    return id;
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.socket.close();
      this.clients.delete(id);
    }
  }

  getClient(id: string): ClientConnection | undefined {
    return this.clients.get(id);
  }

  getAllClients(): ClientConnection[] {
    return Array.from(this.clients.values());
  }

  broadcast(msg: IrcMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data);
      }
    }
  }

  sendTo(clientId: string, msg: IrcMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: (clientId: string, msg: IrcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private async handleMessage(clientId: string, data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    try {
      const text = data.toString();
      const msg = JSON.parse(text) as IrcMessage;

      if (this.messageRepository && msg.command === 'PRIVMSG') {
        const channel = msg.params[0]?.startsWith('#') ? msg.params[0] : undefined;
        const content = msg.params[1] || '';
        const client = this.clients.get(clientId);
        const nick = client?.nick || 'unknown';

        try {
          await this.messageRepository.create({
            channel,
            nick,
            content,
            command: msg.command,
          });
        } catch (err) {
          console.error('Failed to persist message:', err);
        }
      }

      for (const handler of this.messageHandlers) {
        handler(clientId, msg);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private generateId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
