import { DatabaseConnection } from './database';

export interface ChannelRecord {
  id: number;
  name: string;
  topic: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateChannelInput {
  name: string;
  topic?: string;
}

export interface UpdateChannelInput {
  topic?: string;
}

export class ChannelRepository {
  constructor(private db: DatabaseConnection) {}

  async create(input: CreateChannelInput): Promise<ChannelRecord> {
    const now = Math.floor(Date.now() / 1000);
    const topic = input.topic || null;

    await this.db.run(
      `INSERT INTO channels (name, topic, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [input.name, topic, now, now]
    );

    const row = await this.db.get<ChannelRecord>(
      `SELECT * FROM channels WHERE rowid = last_insert_rowid()`
    );

    if (!row) {
      throw new Error('Failed to retrieve created channel');
    }

    return row;
  }

  async findById(id: number): Promise<ChannelRecord | undefined> {
    return this.db.get<ChannelRecord>(
      `SELECT * FROM channels WHERE id = ?`,
      [id]
    );
  }

  async findByName(name: string): Promise<ChannelRecord | undefined> {
    return this.db.get<ChannelRecord>(
      `SELECT * FROM channels WHERE name = ?`,
      [name]
    );
  }

  async findAll(): Promise<ChannelRecord[]> {
    return this.db.all<ChannelRecord>(
      `SELECT * FROM channels ORDER BY name ASC`
    );
  }

  async update(id: number, input: UpdateChannelInput): Promise<ChannelRecord | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.topic !== undefined) {
      sets.push('topic = ?');
      params.push(input.topic);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    sets.push('updated_at = ?');
    params.push(Math.floor(Date.now() / 1000));
    params.push(id);

    await this.db.run(
      `UPDATE channels SET ${sets.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  async updateTopic(name: string, topic: string): Promise<void> {
    await this.db.run(
      `UPDATE channels SET topic = ?, updated_at = ? WHERE name = ?`,
      [topic, Math.floor(Date.now() / 1000), name]
    );
  }

  async deleteById(id: number): Promise<void> {
    await this.db.run(`DELETE FROM channels WHERE id = ?`, [id]);
  }

  async deleteByName(name: string): Promise<void> {
    await this.db.run(`DELETE FROM channels WHERE name = ?`, [name]);
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM channels`);
    return row?.count || 0;
  }
}
