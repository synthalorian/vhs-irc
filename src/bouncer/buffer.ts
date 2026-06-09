import { IrcMessage } from '../irc/types';

export interface BufferedMessage {
  id: string;
  networkId: number;
  networkName: string;
  message: IrcMessage;
  timestamp: number;
  delivered: boolean;
}

export class MessageBuffer {
  private buffers = new Map<string, BufferedMessage[]>();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Buffer a message for a specific client.
   */
  bufferForClient(
    clientId: string,
    networkId: number,
    networkName: string,
    message: IrcMessage
  ): void {
    let clientBuffer = this.buffers.get(clientId);
    if (!clientBuffer) {
      clientBuffer = [];
      this.buffers.set(clientId, clientBuffer);
    }

    const buffered: BufferedMessage = {
      id: `${networkId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      networkId,
      networkName,
      message,
      timestamp: Date.now(),
      delivered: false,
    };

    clientBuffer.push(buffered);

    // Trim if exceeding max size
    if (clientBuffer.length > this.maxSize) {
      clientBuffer.splice(0, clientBuffer.length - this.maxSize);
    }
  }

  /**
   * Get all undelivered messages for a client.
   */
  getUndelivered(clientId: string): BufferedMessage[] {
    const clientBuffer = this.buffers.get(clientId);
    if (!clientBuffer) return [];

    return clientBuffer.filter((m) => !m.delivered);
  }

  /**
   * Mark messages as delivered for a client.
   */
  markDelivered(clientId: string, messageIds: string[]): void {
    const clientBuffer = this.buffers.get(clientId);
    if (!clientBuffer) return;

    const idSet = new Set(messageIds);
    for (const msg of clientBuffer) {
      if (idSet.has(msg.id)) {
        msg.delivered = true;
      }
    }
  }

  /**
   * Mark all undelivered messages as delivered for a client.
   */
  markAllDelivered(clientId: string): void {
    const clientBuffer = this.buffers.get(clientId);
    if (!clientBuffer) return;

    for (const msg of clientBuffer) {
      msg.delivered = true;
    }
  }

  /**
   * Clear all buffered messages for a client.
   */
  clearClient(clientId: string): void {
    this.buffers.delete(clientId);
  }

  /**
   * Get buffer size for a client.
   */
  getBufferSize(clientId: string): number {
    return this.buffers.get(clientId)?.length || 0;
  }

  /**
   * Get total buffer size across all clients.
   */
  getTotalSize(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.length;
    }
    return total;
  }

  /**
   * Clear old delivered messages to free memory.
   */
  pruneDelivered(maxAgeMs = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [clientId, buffer] of this.buffers.entries()) {
      const filtered = buffer.filter(
        (m) => !m.delivered || m.timestamp > cutoff
      );
      if (filtered.length === 0) {
        this.buffers.delete(clientId);
      } else {
        this.buffers.set(clientId, filtered);
      }
    }
  }
}
