import { WebSocket } from 'ws';
import { IrcMessage } from '../irc/types';

export interface ClientConnection {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  nick?: string;
  channels: Set<string>;
}

export class ConnectionManager {
  private clients = new Map<string, ClientConnection>();
  private messageHandlers: ((clientId: string, msg: IrcMessage) => void)[] = [];

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

  private handleMessage(clientId: string, data: Buffer | ArrayBuffer | Buffer[]): void {
    try {
      const text = data.toString();
      const msg = JSON.parse(text) as IrcMessage;
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
