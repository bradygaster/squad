import { posix } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync as fsMkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import type { StorageProvider, StorageStats } from './storage-provider.js';

// sql.js types — loaded dynamically
type SqlJsStatic = typeof import('sql.js');
type Database = import('sql.js').Database;

const DEFAULT_DB_PATH = '.squad/squad.db';

/**
 * SQLiteStorageProvider -- cross-platform SQLite-backed StorageProvider using sql.js (WASM).
 *
 * Use this provider when you need a single-file, portable storage backend that
 * works identically across Windows, Linux, and macOS without native compilation.
 * It is ideal for desktop tools and CLI applications that need durable storage
 * without external database dependencies.
 *
 * **Initialization:** You MUST call {@link init} before performing any read or
 * write operations. Calling `init()` is safe to call multiple times; subsequent
 * calls are no-ops that return the same initialization promise.
 *
 * **Concurrency:** This provider is designed for single-process access. Running
 * multiple processes against the same database file simultaneously may cause
 * data corruption because sql.js loads the entire DB into memory and persists
 * it atomically on every write. Use file-level locking or a dedicated process
 * if concurrent access is required.
 *
 * **Database location:** The database file defaults to `.squad/squad.db`
 * relative to the working directory. The file and parent directories are
 * created automatically on first write. Callers are responsible for deleting
 * the file when it is no longer needed (e.g. in test cleanup).
 *
 * Schema: `files(path TEXT PRIMARY KEY, content TEXT, updated_at TEXT)`
 *
 * sql.js runs SQLite entirely in WASM -- no native compilation required.
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
   * Initialize the SQLite database, loading the WASM bundle and creating the
   * schema if needed. **Must be called before any read/write operation.**
   *
   * Safe to call multiple times -- the first call performs initialization and
   * subsequent calls return the same resolved promise (no extra work).
   *
   * If the database file already exists on disk it is loaded into memory;
   * otherwise a fresh in-memory database is created and will be persisted on
   * the first write.
   *
   * @throws If the sql.js WASM bundle cannot be loaded (e.g. missing dependency).
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
    fsMkdirSync(dirname(this.dbPath), { recursive: true });
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

  // ── Phase 3 Wave 1 additions ────────────────────────────────────────────

  async isDirectory(targetPath: string): Promise<boolean> {
    await this.ready();
    return this.isDirectorySync(targetPath);
  }

  async mkdir(_dirPath: string, _options?: { recursive?: boolean }): Promise<void> {
    // SQLite provider stores files in a virtual tree — directories are implicit.
    await this.ready();
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.ready();
    const db = this.ensureDb();
    const oldKey = this.norm(oldPath);
    const newKey = this.norm(newPath);
    const prefix = oldKey + '/';

    // Collect rows to move
    const stmt = db.prepare('SELECT path, content, updated_at FROM files WHERE path = ? OR path LIKE ? ESCAPE \'\\\'');
    stmt.bind([oldKey, `${this.escapeLike(oldKey)}/%`]);
    const rows: Array<{ path: string; content: string; updated_at: string }> = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as { path: string; content: string; updated_at: string });
    }
    stmt.free();

    if (rows.length === 0) {
      const err = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }

    // Delete old, insert new
    for (const row of rows) {
      const renamedPath = row.path === oldKey
        ? newKey
        : newKey + row.path.slice(oldKey.length);
      db.run('DELETE FROM files WHERE path = ?', [row.path]);
      db.run(
        'INSERT INTO files (path, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at',
        [renamedPath, row.content, this.now()],
      );
    }
    this.persist();
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    await this.ready();
    const srcKey = this.norm(srcPath);
    const content = this.readSync(srcPath);
    if (content === undefined) {
      const err = new Error(`ENOENT: no such file or directory, copy '${srcPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    this.internalWrite(this.norm(destPath), content);
  }

  async stat(targetPath: string): Promise<StorageStats | undefined> {
    await this.ready();
    const db = this.ensureDb();
    const key = this.norm(targetPath);

    // Check for exact file match
    const stmt = db.prepare('SELECT content, updated_at FROM files WHERE path = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as { content: string; updated_at: string };
      stmt.free();
      return {
        size: Buffer.byteLength(row.content, 'utf-8'),
        mtimeMs: new Date(row.updated_at).getTime(),
        isDirectory: false,
      };
    }
    stmt.free();

    // Check if it's a directory (has children)
    const dirStmt = db.prepare('SELECT 1 FROM files WHERE path LIKE ? ESCAPE \'\\\' LIMIT 1');
    dirStmt.bind([`${this.escapeLike(key)}/%`]);
    const isDir = dirStmt.step();
    dirStmt.free();

    if (isDir) {
      return { size: 0, mtimeMs: 0, isDirectory: true };
    }

    return undefined;
  }

  isDirectorySync(targetPath: string): boolean {
    const db = this.ensureDb();
    const key = this.norm(targetPath);
    // A path is a directory if it's not a file but has children
    const fileStmt = db.prepare('SELECT 1 FROM files WHERE path = ?');
    fileStmt.bind([key]);
    const isFile = fileStmt.step();
    fileStmt.free();
    if (isFile) return false;

    const dirStmt = db.prepare('SELECT 1 FROM files WHERE path LIKE ? ESCAPE \'\\\' LIMIT 1');
    dirStmt.bind([`${this.escapeLike(key)}/%`]);
    const isDir = dirStmt.step();
    dirStmt.free();
    return isDir;
  }

  mkdirSync(_dirPath: string, _options?: { recursive?: boolean }): void {
    // SQLite provider stores files in a virtual tree — directories are implicit.
    this.ensureDb();
  }

  statSync(targetPath: string): StorageStats | undefined {
    const db = this.ensureDb();
    const key = this.norm(targetPath);

    // Check for exact file match
    const stmt = db.prepare('SELECT content, updated_at FROM files WHERE path = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as { content: string; updated_at: string };
      stmt.free();
      return {
        size: Buffer.byteLength(row.content, 'utf-8'),
        mtimeMs: new Date(row.updated_at).getTime(),
        isDirectory: false,
      };
    }
    stmt.free();

    // Check if it's a directory (has children)
    const dirStmt = db.prepare('SELECT 1 FROM files WHERE path LIKE ? ESCAPE \'\\\' LIMIT 1');
    dirStmt.bind([`${this.escapeLike(key)}/%`]);
    const isDir = dirStmt.step();
    dirStmt.free();

    if (isDir) {
      return { size: 0, mtimeMs: 0, isDirectory: true };
    }

    return undefined;
  }

  appendSync(filePath: string, data: string): void {
    const key = this.norm(filePath);
    const existing = this.readSync(filePath) ?? '';
    this.internalWrite(key, existing + data);
  }

  deleteSync(filePath: string): void {
    const db = this.ensureDb();
    const key = this.norm(filePath);
    db.run('DELETE FROM files WHERE path = ?', [key]);
    this.persist();
  }

  renameSync(oldPath: string, newPath: string): void {
    const db = this.ensureDb();
    const oldKey = this.norm(oldPath);
    const newKey = this.norm(newPath);
    const prefix = oldKey + '/';

    // Collect rows to move
    const stmt = db.prepare('SELECT path, content, updated_at FROM files WHERE path = ? OR path LIKE ? ESCAPE \'\\\'');
    stmt.bind([oldKey, `${this.escapeLike(oldKey)}/%`]);
    const rows: Array<{ path: string; content: string; updated_at: string }> = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as { path: string; content: string; updated_at: string });
    }
    stmt.free();

    if (rows.length === 0) {
      const err = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }

    // Delete old, insert new
    for (const row of rows) {
      const renamedPath = row.path === oldKey
        ? newKey
        : newKey + row.path.slice(oldKey.length);
      db.run('DELETE FROM files WHERE path = ?', [row.path]);
      db.run(
        'INSERT INTO files (path, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at',
        [renamedPath, row.content, this.now()],
      );
    }
    this.persist();
  }

  copySync(srcPath: string, destPath: string): void {
    const content = this.readSync(srcPath);
    if (content === undefined) {
      const err = new Error(`ENOENT: no such file or directory, copy '${srcPath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    this.internalWrite(this.norm(destPath), content);
  }

  deleteDirSync(dirPath: string): void {
    const db = this.ensureDb();
    const dir = this.norm(dirPath);
    db.run('DELETE FROM files WHERE path = ? OR path LIKE ? ESCAPE \'\\\'', [dir, `${this.escapeLike(dir)}/%`]);
    this.persist();
  }

  // ── Internal────────────────────────────────────────────────────────────

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
