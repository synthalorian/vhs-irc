import { DatabaseConnection } from './database';

export interface MessageRecord {
  id: number;
  channel: string | null;
  nick: string;
  content: string;
  command: string;
  timestamp: number;
}

export interface CreateMessageInput {
  channel?: string;
  nick: string;
  content: string;
  command?: string;
  timestamp?: number;
}

export class MessageRepository {
  constructor(private db: DatabaseConnection) {}

  async create(input: CreateMessageInput): Promise<MessageRecord> {
    const command = input.command || 'PRIVMSG';
    const timestamp = input.timestamp || Math.floor(Date.now() / 1000);
    const channel = input.channel || null;

    await this.db.run(
      `INSERT INTO messages (channel, nick, content, command, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [channel, input.nick, input.content, command, timestamp]
    );

    const row = await this.db.get<MessageRecord>(
      `SELECT * FROM messages WHERE rowid = last_insert_rowid()`
    );

    if (!row) {
      throw new Error('Failed to retrieve created message');
    }

    return row;
  }

  async findById(id: number): Promise<MessageRecord | undefined> {
    return this.db.get<MessageRecord>(
      `SELECT * FROM messages WHERE id = ?`,
      [id]
    );
  }

  async findByChannel(channel: string, limit = 100, offset = 0): Promise<MessageRecord[]> {
    return this.db.all<MessageRecord>(
      `SELECT * FROM messages WHERE channel = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
      [channel, limit, offset]
    );
  }

  async findByNick(nick: string, limit = 100, offset = 0): Promise<MessageRecord[]> {
    return this.db.all<MessageRecord>(
      `SELECT * FROM messages WHERE nick = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [nick, limit, offset]
    );
  }

  async findRecent(limit = 100): Promise<MessageRecord[]> {
    return this.db.all<MessageRecord>(
      `SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
  }

  async search(query: string, limit = 50): Promise<MessageRecord[]> {
    return this.db.all<MessageRecord>(
      `SELECT * FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?`,
      [`%${query}%`, limit]
    );
  }

  async deleteById(id: number): Promise<void> {
    await this.db.run(`DELETE FROM messages WHERE id = ?`, [id]);
  }

  async deleteByChannel(channel: string): Promise<void> {
    await this.db.run(`DELETE FROM messages WHERE channel = ?`, [channel]);
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM messages`);
    return row?.count || 0;
  }

  async countByChannel(channel: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM messages WHERE channel = ?`,
      [channel]
    );
    return row?.count || 0;
  }
}
