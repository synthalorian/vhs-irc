import { DatabaseConnection } from './database';

export interface UserRecord {
  id: number;
  nick: string;
  username: string | null;
  hostname: string | null;
  realname: string | null;
  password_hash: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateUserInput {
  nick: string;
  username?: string;
  hostname?: string;
  realname?: string;
  password_hash?: string;
}

export interface UpdateUserInput {
  username?: string;
  hostname?: string;
  realname?: string;
  password_hash?: string;
}

export class UserRepository {
  constructor(private db: DatabaseConnection) {}

  async create(input: CreateUserInput): Promise<UserRecord> {
    const now = Math.floor(Date.now() / 1000);

    await this.db.run(
      `INSERT INTO users (nick, username, hostname, realname, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.nick,
        input.username || null,
        input.hostname || null,
        input.realname || null,
        input.password_hash || null,
        now,
        now,
      ]
    );

    const row = await this.db.get<UserRecord>(
      `SELECT * FROM users WHERE rowid = last_insert_rowid()`
    );

    if (!row) {
      throw new Error('Failed to retrieve created user');
    }

    return row;
  }

  async findById(id: number): Promise<UserRecord | undefined> {
    return this.db.get<UserRecord>(
      `SELECT * FROM users WHERE id = ?`,
      [id]
    );
  }

  async findByNick(nick: string): Promise<UserRecord | undefined> {
    return this.db.get<UserRecord>(
      `SELECT * FROM users WHERE nick = ?`,
      [nick]
    );
  }

  async findAll(): Promise<UserRecord[]> {
    return this.db.all<UserRecord>(
      `SELECT * FROM users ORDER BY nick ASC`
    );
  }

  async update(id: number, input: UpdateUserInput): Promise<UserRecord | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.username !== undefined) {
      sets.push('username = ?');
      params.push(input.username);
    }

    if (input.hostname !== undefined) {
      sets.push('hostname = ?');
      params.push(input.hostname);
    }

    if (input.realname !== undefined) {
      sets.push('realname = ?');
      params.push(input.realname);
    }

    if (input.password_hash !== undefined) {
      sets.push('password_hash = ?');
      params.push(input.password_hash);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    sets.push('updated_at = ?');
    params.push(Math.floor(Date.now() / 1000));
    params.push(id);

    await this.db.run(
      `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  async updateByNick(nick: string, input: UpdateUserInput): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.username !== undefined) {
      sets.push('username = ?');
      params.push(input.username);
    }

    if (input.hostname !== undefined) {
      sets.push('hostname = ?');
      params.push(input.hostname);
    }

    if (input.realname !== undefined) {
      sets.push('realname = ?');
      params.push(input.realname);
    }

    if (input.password_hash !== undefined) {
      sets.push('password_hash = ?');
      params.push(input.password_hash);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(Math.floor(Date.now() / 1000));
    params.push(nick);

    await this.db.run(
      `UPDATE users SET ${sets.join(', ')} WHERE nick = ?`,
      params
    );
  }

  async deleteById(id: number): Promise<void> {
    await this.db.run(`DELETE FROM users WHERE id = ?`, [id]);
  }

  async deleteByNick(nick: string): Promise<void> {
    await this.db.run(`DELETE FROM users WHERE nick = ?`, [nick]);
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM users`);
    return row?.count || 0;
  }
}
