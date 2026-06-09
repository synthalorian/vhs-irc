import { DatabaseConnection } from './database';

export interface UploadRecord {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string | null;
  channel: string | null;
  uploaded_at: number;
}

export interface CreateUploadInput {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy?: string;
  channel?: string;
}

export class UploadRepository {
  constructor(private db: DatabaseConnection) {}

  async create(input: CreateUploadInput): Promise<UploadRecord> {
    const uploadedAt = Math.floor(Date.now() / 1000);
    const uploadedBy = input.uploadedBy || null;
    const channel = input.channel || null;

    await this.db.run(
      `INSERT INTO uploads (filename, original_name, mime_type, size, uploaded_by, channel, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.filename, input.originalName, input.mimeType, input.size, uploadedBy, channel, uploadedAt]
    );

    const row = await this.db.get<UploadRecord>(
      `SELECT * FROM uploads WHERE rowid = last_insert_rowid()`
    );

    if (!row) {
      throw new Error('Failed to retrieve created upload');
    }

    return row;
  }

  async findById(id: number): Promise<UploadRecord | undefined> {
    return this.db.get<UploadRecord>(
      `SELECT * FROM uploads WHERE id = ?`,
      [id]
    );
  }

  async findByFilename(filename: string): Promise<UploadRecord | undefined> {
    return this.db.get<UploadRecord>(
      `SELECT * FROM uploads WHERE filename = ?`,
      [filename]
    );
  }

  async findByChannel(channel: string, limit = 100, offset = 0): Promise<UploadRecord[]> {
    return this.db.all<UploadRecord>(
      `SELECT * FROM uploads WHERE channel = ? ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`,
      [channel, limit, offset]
    );
  }

  async findRecent(limit = 100): Promise<UploadRecord[]> {
    return this.db.all<UploadRecord>(
      `SELECT * FROM uploads ORDER BY uploaded_at DESC LIMIT ?`,
      [limit]
    );
  }

  async deleteById(id: number): Promise<void> {
    await this.db.run(`DELETE FROM uploads WHERE id = ?`, [id]);
  }

  async count(): Promise<number> {
    const row = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM uploads`);
    return row?.count || 0;
  }

  async countByChannel(channel: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM uploads WHERE channel = ?`,
      [channel]
    );
    return row?.count || 0;
  }
}
