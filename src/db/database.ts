import { Database } from 'sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export class DatabaseConnection {
  private db: Database;
  private initialized = false;

  constructor(dbPath: string = './data/vhs-irc.db') {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.run(`
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        topic TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nick TEXT NOT NULL UNIQUE,
        username TEXT,
        hostname TEXT,
        realname TEXT,
        password_hash TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT,
        nick TEXT NOT NULL,
        content TEXT NOT NULL,
        command TEXT NOT NULL DEFAULT 'PRIVMSG',
        timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (channel) REFERENCES channels(name) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel)
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_nick ON messages(nick)
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        uploaded_by TEXT,
        channel TEXT,
        uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_uploads_channel ON uploads(channel)
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at)
    `);

    this.initialized = true;
  }

  run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

let globalDb: DatabaseConnection | null = null;

export function getDatabase(dbPath?: string): DatabaseConnection {
  if (!globalDb) {
    globalDb = new DatabaseConnection(dbPath);
  }
  return globalDb;
}

export function resetDatabase(): void {
  globalDb = null;
}
