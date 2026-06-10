import { Socket, connect } from 'net';
import { IrcMessage } from '../irc/types';
import { parseBuffer, serializeMessage } from '../irc/index';

export type NetworkConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'registered'
  | 'reconnecting';

export interface NetworkConfig {
  id: number;
  name: string;
  host: string;
  port: number;
  tls: boolean;
  nick: string;
  username?: string;
  realname?: string;
  password?: string;
}

export interface NetworkConnectionEvents {
  onConnect: () => void;
  onDisconnect: () => void;
  onMessage: (msg: IrcMessage) => void;
  onError: (err: Error) => void;
  onRawLine: (line: string) => void;
}

export class NetworkConnection {
  private socket: Socket | null = null;
  private state: NetworkConnectionState = 'disconnected';
  private buffer = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30000;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentNick: string;
  public readonly channels = new Set<string>();

  constructor(
    public readonly config: NetworkConfig,
    private events: NetworkConnectionEvents
  ) {
    this.currentNick = config.nick;
  }

  get id(): number {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get nick(): string {
    return this.currentNick;
  }

  get connectionState(): NetworkConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === 'connected' || this.state === 'registered';
  }

  get isRegistered(): boolean {
    return this.state === 'registered';
  }

  connect(): void {
    if (this.state === 'connecting' || this.state === 'connected' || this.state === 'registered') {
      return;
    }

    this.state = 'connecting';
    this.buffer = '';

    this.socket = connect({
      host: this.config.host,
      port: this.config.port,
    });

    this.socket.setEncoding('utf8');

    // Connection timeout for tests: destroy socket if not connected within 2s
    this.connectTimeout = setTimeout(() => {
      if (this.socket && this.state === 'connecting') {
        this.socket.destroy();
        this.socket = null;
        this.state = 'disconnected';
      }
    }, 2000);

    this.socket.on('connect', () => {
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }
      this.state = 'connected';
      this.reconnectAttempts = 0;
      this.events.onConnect();
      this.sendRegistration();
      this.startPingTimer();
    });

    this.socket.on('data', (data: string) => {
      this.handleData(data);
    });

    this.socket.on('close', () => {
      this.cleanup();
      this.state = 'disconnected';
      this.events.onDisconnect();
      this.scheduleReconnect();
    });

    this.socket.on('error', (err: Error) => {
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }
      this.events.onError(err);
    });
  }

  disconnect(): void {
    this.clearReconnect();
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.cleanup();
    this.state = 'disconnected';
  }

  send(msg: IrcMessage): void {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    const line = serializeMessage(msg);
    this.socket.write(line);
    this.events.onRawLine(`> ${line.trimEnd()}`);
  }

  sendRaw(line: string): void {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    this.socket.write(line + '\r\n');
    this.events.onRawLine(`> ${line}`);
  }

  join(channel: string): void {
    this.send({ command: 'JOIN', params: [channel] });
    this.channels.add(channel);
  }

  part(channel: string, reason?: string): void {
    const params = reason ? [channel, reason] : [channel];
    this.send({ command: 'PART', params });
    this.channels.delete(channel);
  }

  privmsg(target: string, text: string): void {
    this.send({ command: 'PRIVMSG', params: [target, text] });
  }

  setNick(nick: string): void {
    this.currentNick = nick;
    this.send({ command: 'NICK', params: [nick] });
  }

  private sendRegistration(): void {
    const { password, nick, username, realname } = this.config;

    if (password) {
      this.send({ command: 'PASS', params: [password] });
    }

    this.send({ command: 'NICK', params: [nick] });
    this.send({
      command: 'USER',
      params: [username || nick, '0', '*', realname || nick],
    });
  }

  private handleData(data: string): void {
    this.buffer += data;
    const { messages, remainder } = parseBuffer(this.buffer);
    this.buffer = remainder;

    for (const msg of messages) {
      this.events.onRawLine(`< ${msg.raw || serializeMessage(msg).trimEnd()}`);
      this.handleMessage(msg);
      this.events.onMessage(msg);
    }
  }

  private handleMessage(msg: IrcMessage): void {
    // Track registration completion
    if (msg.command === '001' || msg.command === '002' || msg.command === '003' || msg.command === '004') {
      this.state = 'registered';
    }

    // Handle nick changes
    if (msg.command === 'NICK' && msg.prefix?.nick === this.currentNick) {
      this.currentNick = msg.params[0] || msg.params[msg.params.length - 1];
    }

    // Handle PING
    if (msg.command === 'PING') {
      this.send({ command: 'PONG', params: msg.params });
    }

    // Handle channel joins/parts from server
    if (msg.command === 'JOIN' && msg.prefix?.nick === this.currentNick) {
      const channel = msg.params[0];
      if (channel) this.channels.add(channel);
    }
    if (msg.command === 'PART' && msg.prefix?.nick === this.currentNick) {
      const channel = msg.params[0];
      if (channel) this.channels.delete(channel);
    }

    // Handle forced nick change on collision
    if (msg.command === '433' || msg.command === '436') {
      // Nickname is already in use
      this.currentNick = `${this.config.nick}_`;
      this.send({ command: 'NICK', params: [this.currentNick] });
    }
  }

  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({ command: 'PING', params: [this.config.host] });
      }
    }, 60000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.state = 'reconnecting';

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanup(): void {
    this.buffer = '';
    this.clearReconnect();
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
