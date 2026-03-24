import { posix } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import type { StorageProvider } from './storage-provider.js';

// sql.js types — loaded dynamically
type SqlJsStatic = typeof import('sql.js');
type Database = import('sql.js').Database;

const DEFAULT_DB_PATH = '.squad/squad.db';

/**
 * SQLiteStorageProvider — cross-platform SQLite-backed StorageProvider using sql.js (WASM).
 *
 * Schema: `files(path TEXT PRIMARY KEY, content TEXT, updated_at TEXT)`
 *
 * sql.js runs SQLite entirely in WASM — no native compilation required.
 * Works on win/linux/mac/mac-silicon without platform-specific binaries.
 *
 * The WASM bundle is loaded lazily via dynamic `import('sql.js')` so it
 * only impacts startup when this provider is actually instantiated.
 *
 * Sync methods work because sql.js operations are synchronous under the
 * hood (WASM, not network). The DB must be initialized before sync calls.
 */
export class SQLiteStorageProvider implements StorageProvider {
  private readonly dbPath: string;
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
  }

  // ── Initialization ──────────────────────────────────────────────────────

  /**
   * Lazily initialize the database. Safe to call multiple times;
   * subsequent calls return the same promise.
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const initSqlJs: SqlJsStatic = (await import('sql.js')).default;
    const SQL = await initSqlJs();

    if (existsSync(this.dbPath)) {
      const fileBuffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        path       TEXT PRIMARY KEY,
        content    TEXT,
        updated_at TEXT
      )
    `);
  }

  /** Throws if the DB has not been initialized (for sync methods). */
  private ensureDb(): Database {
    if (!this.db) {
      throw new Error(
        'SQLiteStorageProvider is not initialized. Call init() before using sync methods.',
      );
    }
    return this.db;
  }

  /** Ensure the DB is ready (for async methods). */
  private async ready(): Promise<Database> {
    await this.init();
    return this.ensureDb();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Normalize a path to forward-slash POSIX form with no trailing slash. */
  private norm(p: string): string {
    return posix.normalize(p.replace(/\\/g, '/')).replace(/\/+$/, '');
  }

  /** Escape SQL LIKE wildcards so user-supplied paths are matched literally. */
  private escapeLike(value: string): string {
    return value.replace(/[%_]/g, char => `\\${char}`);
  }

  /** Persist the in-memory DB to disk (atomic write-then-rename). */
  private persist(): void {
    const db = this.ensureDb();
    const data = db.export();
    const buffer = Buffer.from(data);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    const tmpPath = this.dbPath + '.tmp';
    writeFileSync(tmpPath, buffer);
    renameSync(tmpPath, this.dbPath);
  }

  private now(): string {
    return new Date().toISOString();
  }

  // ── Async interface ─────────────────────────────────────────────────────

  async read(filePath: string): Promise<string | undefined> {
    await this.ready();
    return this.readSync(filePath);
  }

  async write(filePath: string, data: string): Promise<void> {
    await this.ready();
    this.writeSync(filePath, data);
  }

  async append(filePath: string, data: string): Promise<void> {
    await this.ready();
    const key = this.norm(filePath);
    const existing = this.readSync(filePath) ?? '';
    this.internalWrite(key, existing + data);
  }

  async exists(filePath: string): Promise<boolean> {
    await this.ready();
    return this.existsSync(filePath);
  }

  async list(dirPath: string): Promise<string[]> {
    await this.ready();
    return this.listSync(dirPath);
  }

  async delete(filePath: string): Promise<void> {
    await this.ready();
    const db = this.ensureDb();
    const key = this.norm(filePath);
    db.run('DELETE FROM files WHERE path = ?', [key]);
    this.persist();
  }

  async deleteDir(dirPath: string): Promise<void> {
    await this.ready();
    const db = this.ensureDb();
    const dir = this.norm(dirPath);
    db.run('DELETE FROM files WHERE path = ? OR path LIKE ? ESCAPE \'\\\'', [dir, `${this.escapeLike(dir)}/%`]);
    this.persist();
  }

  // ── Sync interface ──────────────────────────────────────────────────────

  readSync(filePath: string): string | undefined {
    const db = this.ensureDb();
    const key = this.norm(filePath);
    const stmt = db.prepare('SELECT content FROM files WHERE path = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as { content: string };
      stmt.free();
      return row.content;
    }
    stmt.free();
    return undefined;
  }

  writeSync(filePath: string, data: string): void {
    const key = this.norm(filePath);
    this.internalWrite(key, data);
  }

  existsSync(filePath: string): boolean {
    const db = this.ensureDb();
    const key = this.norm(filePath);
    // Exact file match OR directory prefix match
    const stmt = db.prepare(
      'SELECT 1 FROM files WHERE path = ? OR path LIKE ? ESCAPE \'\\\' LIMIT 1',
    );
    stmt.bind([key, `${this.escapeLike(key)}/%`]);
    const found = stmt.step();
    stmt.free();
    return found;
  }

  listSync(dirPath: string): string[] {
    const db = this.ensureDb();
    const dir = this.norm(dirPath);
    const prefix = dir + '/';
    const stmt = db.prepare('SELECT path FROM files WHERE path LIKE ? ESCAPE \'\\\'');
    stmt.bind([`${this.escapeLike(dir)}/%`]);
    const entries = new Set<string>();
    while (stmt.step()) {
      const row = stmt.getAsObject() as { path: string };
      const rest = row.path.slice(prefix.length);
      const name = rest.split('/')[0]!;
      entries.add(name);
    }
    stmt.free();
    return [...entries];
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private internalWrite(normalizedPath: string, data: string): void {
    const db = this.ensureDb();
    db.run(
      `INSERT INTO files (path, content, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      [normalizedPath, data, this.now()],
    );
    this.persist();
  }
}
