import { IrcMessage } from '../irc/types';
import { NetworkConnection, NetworkConfig, NetworkConnectionState } from './network-connection';
import { MessageBuffer } from './buffer';
import { NetworkRepository, NetworkRecord } from '../db/networks';
import { MessageRepository } from '../db/messages';
import { ChannelRepository } from '../db/channels';

export interface BouncerOptions {
  networkRepository: NetworkRepository;
  messageRepository?: MessageRepository;
  channelRepository?: ChannelRepository;
}

export interface NetworkStatus {
  id: number;
  name: string;
  state: NetworkConnectionState;
  nick: string;
  channels: string[];
}

export type BouncerMessageHandler = (
  clientId: string,
  networkId: number | null,
  msg: IrcMessage
) => void;

export class BouncerManager {
  private networks = new Map<number, NetworkConnection>();
  private clientHandlers: BouncerMessageHandler[] = [];
  private buffer = new MessageBuffer();
  private options: BouncerOptions;
  private pruneInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: BouncerOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    // Load auto-connect networks from database
    const networks = await this.options.networkRepository.findAutoConnect();
    for (const network of networks) {
      await this.addNetwork(network);
    }

    // Start buffer pruning
    this.pruneInterval = setInterval(() => {
      this.buffer.pruneDelivered();
    }, 60 * 60 * 1000); // Every hour
  }

  async shutdown(): Promise<void> {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }

    for (const network of this.networks.values()) {
      network.disconnect();
    }
    this.networks.clear();
  }

  async addNetwork(record: NetworkRecord): Promise<NetworkConnection> {
    const config: NetworkConfig = {
      id: record.id,
      name: record.name,
      host: record.host,
      port: record.port,
      tls: record.tls === 1,
      nick: record.nick,
      username: record.username || undefined,
      realname: record.realname || undefined,
      password: record.password || undefined,
    };

    const network = new NetworkConnection(config, {
      onConnect: () => {
        console.log(`[${config.name}] Connected`);
        this.broadcastToClients(null, {
          command: 'NETWORK_STATUS',
          params: [config.name, 'connected'],
        });
      },
      onDisconnect: () => {
        console.log(`[${config.name}] Disconnected`);
        this.broadcastToClients(null, {
          command: 'NETWORK_STATUS',
          params: [config.name, 'disconnected'],
        });
      },
      onMessage: (msg) => {
        this.handleNetworkMessage(config.id, config.name, msg);
      },
      onError: (err) => {
        console.error(`[${config.name}] Error:`, err.message);
        this.broadcastToClients(null, {
          command: 'NETWORK_ERROR',
          params: [config.name, err.message],
        });
      },
      onRawLine: (line) => {
        // Debug logging - can be disabled in production
        if (process.env.DEBUG_IRC) {
          console.log(`[${config.name}] ${line}`);
        }
      },
    });

    this.networks.set(config.id, network);
    network.connect();
    return network;
  }

  removeNetwork(networkId: number): boolean {
    const network = this.networks.get(networkId);
    if (!network) return false;

    network.disconnect();
    this.networks.delete(networkId);
    return true;
  }

  getNetwork(networkId: number): NetworkConnection | undefined {
    return this.networks.get(networkId);
  }

  getNetworkByName(name: string): NetworkConnection | undefined {
    for (const network of this.networks.values()) {
      if (network.name === name) return network;
    }
    return undefined;
  }

  getAllNetworks(): NetworkConnection[] {
    return Array.from(this.networks.values());
  }

  getNetworkStatuses(): NetworkStatus[] {
    return Array.from(this.networks.values()).map((n) => ({
      id: n.id,
      name: n.name,
      state: n.connectionState,
      nick: n.nick,
      channels: Array.from(n.channels),
    }));
  }

  connectNetwork(networkId: number): void {
    const network = this.networks.get(networkId);
    if (network) {
      network.connect();
    }
  }

  disconnectNetwork(networkId: number): void {
    const network = this.networks.get(networkId);
    if (network) {
      network.disconnect();
    }
  }

  /**
   * Handle a message from a WebSocket client.
   */
  handleClientMessage(clientId: string, msg: IrcMessage): void {
    // Extract network from message if present
    // Format: NETWORK <name> <command> [params...]
    // Or: command with network context in params[0]

    let networkId: number | null = null;
    let networkName: string | null = null;
    let actualMsg = msg;

    // Check if this is a network-routed message
    if (msg.command === 'NETWORK') {
      networkName = msg.params[0];
      const network = networkName ? this.getNetworkByName(networkName) : undefined;
      if (network) {
        networkId = network.id;
        actualMsg = {
          command: msg.params[1] || 'UNKNOWN',
          params: msg.params.slice(2),
        };
      }
    } else {
      // Try to find network from context or default to first connected
      const connected = Array.from(this.networks.values()).filter((n) => n.isConnected);
      if (connected.length === 1) {
        networkId = connected[0].id;
        networkName = connected[0].name;
      }
    }

    // Persist and route
    if (networkId !== null && actualMsg.command === 'PRIVMSG') {
      const channel = actualMsg.params[0]?.startsWith('#') ? actualMsg.params[0] : undefined;
      const content = actualMsg.params[1] || '';

      if (this.options.messageRepository) {
        this.options.messageRepository
          .create({
            networkId,
            channel,
            nick: 'me',
            content,
            command: 'PRIVMSG',
          })
          .catch((err) => console.error('Failed to persist message:', err));
      }
    }

    // Send to IRC network
    if (networkId !== null) {
      const network = this.networks.get(networkId);
      if (network && network.isConnected) {
        network.send(actualMsg);
      }
    }

    // Notify handlers
    for (const handler of this.clientHandlers) {
      handler(clientId, networkId, actualMsg);
    }
  }

  /**
   * Handle a message received from an IRC network.
   */
  private handleNetworkMessage(networkId: number, networkName: string, msg: IrcMessage): void {
    // Persist to database
    if (this.options.messageRepository && msg.command === 'PRIVMSG') {
      const channel = msg.params[0]?.startsWith('#') ? msg.params[0] : undefined;
      const content = msg.params[1] || '';
      const nick = msg.prefix?.nick || 'unknown';

      this.options.messageRepository
        .create({
          networkId,
          channel,
          nick,
          content,
          command: 'PRIVMSG',
        })
        .catch((err) => console.error('Failed to persist message:', err));
    }

    // Update channel state
    if (this.options.channelRepository && msg.command === 'TOPIC') {
      const channel = msg.params[0];
      const topic = msg.params[1] || '';
      if (channel) {
        this.options.channelRepository
          .updateTopic(networkId, channel, topic)
          .catch(() => {});
      }
    }

    // Buffer for offline clients and broadcast to connected clients
    const wrappedMsg: IrcMessage = {
      command: 'NETWORK_MSG',
      params: [networkName, msg.command, ...msg.params],
      prefix: msg.prefix,
    };

    this.broadcastToClients(networkId, wrappedMsg);
  }

  /**
   * Broadcast a message to all connected WebSocket clients.
   * If networkId is provided, also buffer for offline clients.
   */
  broadcastToClients(networkId: number | null, msg: IrcMessage): void {
    // This will be set by the WebSocket server integration
    if (this._broadcastFn) {
      this._broadcastFn(msg);
    }
  }

  private _broadcastFn: ((msg: IrcMessage) => void) | null = null;

  setBroadcastFn(fn: (msg: IrcMessage) => void): void {
    this._broadcastFn = fn;
  }

  onClientMessage(handler: BouncerMessageHandler): void {
    this.clientHandlers.push(handler);
  }

  /**
   * Get replay messages for a client that just connected.
   */
  getReplayMessages(clientId: string): IrcMessage[] {
    const buffered = this.buffer.getUndelivered(clientId);
    return buffered.map((b) => ({
      command: 'NETWORK_MSG',
      params: [b.networkName, b.message.command, ...b.message.params],
      prefix: b.message.prefix,
    }));
  }

  /**
   * Mark replay messages as delivered.
   */
  markReplayDelivered(clientId: string): void {
    this.buffer.markAllDelivered(clientId);
  }

  /**
   * Client disconnected - start buffering messages for them.
   */
  clientDisconnected(clientId: string): void {
    // Messages will automatically be buffered for this client
  }
}
