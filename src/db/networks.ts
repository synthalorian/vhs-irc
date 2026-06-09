import { DatabaseConnection } from './database';

export interface NetworkRecord {
  id: number;
  name: string;
  host: string;
  port: number;
  tls: number; // 0 or 1
  nick: string;
  username: string | null;
  realname: string | null;
  password: string | null;
  auto_connect: number; // 0 or 1
  created_at: number;
  updated_at: number;
}

export interface CreateNetworkInput {
  name: string;
  host: string;
  port: number;
  tls?: boolean;
  nick: string;
  username?: string;
  realname?: string;
  password?: string;
  autoConnect?: boolean;
}

export interface UpdateNetworkInput {
  name?: string;
  host?: string;
  port?: number;
  tls?: boolean;
  nick?: string;
  username?: string;
  realname?: string;
  password?: string;
  autoConnect?: boolean;
}

export class NetworkRepository {
  constructor(private db: DatabaseConnection) {}

  async create(input: CreateNetworkInput): Promise<NetworkRecord> {
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO networks (name, host, port, tls, nick, username, realname, password, auto_connect, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.host,
        input.port,
        input.tls ? 1 : 0,
        input.nick,
        input.username || null,
        input.realname || null,
        input.password || null,
        input.autoConnect !== false ? 1 : 0,
        now,
        now,
      ]
    );

    const row = await this.db.get<NetworkRecord>(
      `SELECT * FROM networks WHERE rowid = last_insert_rowid()`
    );

    if (!row) {
      throw new Error('Failed to retrieve created network');
    }

    return row;
  }

  async findById(id: number): Promise<NetworkRecord | undefined> {
    return this.db.get<NetworkRecord>(
      `SELECT * FROM networks WHERE id = ?`,
      [id]
    );
  }

  async findByName(name: string): Promise<NetworkRecord | undefined> {
    return this.db.get<NetworkRecord>(
      `SELECT * FROM networks WHERE name = ?`,
      [name]
    );
  }

  async findAll(): Promise<NetworkRecord[]> {
    return this.db.all<NetworkRecord>(
      `SELECT * FROM networks ORDER BY name ASC`
    );
  }

  async findAutoConnect(): Promise<NetworkRecord[]> {
    return this.db.all<NetworkRecord>(
      `SELECT * FROM networks WHERE auto_connect = 1 ORDER BY name ASC`
    );
  }

  async update(id: number, input: UpdateNetworkInput): Promise<NetworkRecord | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      sets.push('name = ?');
      params.push(input.name);
    }
    if (input.host !== undefined) {
      sets.push('host = ?');
      params.push(input.host);
    }
    if (input.port !== undefined) {
      sets.push('port = ?');
      params.push(input.port);
    }
    if (input.tls !== undefined) {
      sets.push('tls = ?');
      params.push(input.tls ? 1 : 0);
    }
    if (input.nick !== undefined) {
      sets.push('nick = ?');
      params.push(input.nick);
    }
    if (input.username !== undefined) {
      sets.push('username = ?');
      params.push(input.username);
    }
    if (input.realname !== undefined) {
      sets.push('realname = ?');
      params.push(input.realname);
    }
    if (input.password !== undefined) {
      sets.push('password = ?');
      params.push(input.password);
    }
    if (input.autoConnect !== undefined) {
      sets.push('auto_connect = ?');
      params.push(input.autoConnect ? 1 : 0);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    sets.push('updated_at = ?');
    params.push(Math.floor(Date.now() / 1000));
    params.push(id);

    await this.db.run(
      `UPDATE networks SET ${sets.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  async deleteById(id: number): Promise<void> {
    await this.db.run(`DELETE FROM networks WHERE id = ?`, [id]);
  }

  async deleteByName(name: string): Promise<void> {
    await this.db.run(`DELETE FROM networks WHERE name = ?`, [name]);
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM networks`);
    return row?.count || 0;
  }
}
