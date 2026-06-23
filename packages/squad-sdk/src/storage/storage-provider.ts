/**
 * StorageProvider — abstract I/O contract for squad-sdk.
 *
 * All persistent storage operations flow through this interface so that
 * runtimes (Node fs, in-memory, cloud) can be swapped without touching
 * business logic.
 *
 * Wave 1 ships FSStorageProvider (Node.js fs wrapper).
 * Wave 2 will remove the synchronous methods; callers should migrate now.
 *
 * **Error handling note:** FSStorageProvider wraps OS errors in `StorageError`
 * (with typed `.code` and `.operation`). InMemoryStorageProvider and
 * SQLiteStorageProvider throw plain `Error` for invalid operations. Callers
 * that need provider-agnostic error handling should catch `Error` and inspect
 * `.code` only when the value is a `StorageError`.
 */

/** Metadata returned by stat(). */
export interface StorageStats {
  /** File size in bytes. 0 for directories in virtual providers. */
  size: number;
  /** Last modification time as ms since epoch. */
  mtimeMs: number;
  /** True if the path is a directory. */
  isDirectory: boolean;
}

export interface StorageProvider {
  /**
   * Read the full contents of a file as a UTF-8 string.
   * Returns `undefined` if the file does not exist (ENOENT).
   */
  read(filePath: string): Promise<string | undefined>;

  /**
   * Write data to a file, creating parent directories as needed.
   * Overwrites any existing content.
   */
  write(filePath: string, data: string): Promise<void>;

  /**
   * Append data to a file, creating it (and parent dirs) if it does not exist.
   */
  append(filePath: string, data: string): Promise<void>;

  /**
   * Return `true` if the path exists (file or directory).
   *
   * ⚠️ TOCTOU WARNING: Do not use exists() as a guard before read/write.
   * Between the exists() check and the subsequent operation, the file can
   * be deleted, replaced, or swapped by another process. Instead, call
   * read() directly and handle `undefined` (ENOENT) in the result.
   */
  exists(filePath: string): Promise<boolean>;

  /**
   * Return the names (not full paths) of entries directly inside `dirPath`.
   * Returns an empty array if the directory is empty or does not exist.
   */
  list(dirPath: string): Promise<string[]>;

  /**
   * Delete a file. No-op if the file does not exist (ENOENT).
   */
  delete(filePath: string): Promise<void>;

  /**
   * Recursively delete a directory and all its contents.
   * No-op if the directory does not exist (ENOENT).
   */
  deleteDir(dirPath: string): Promise<void>;

  // ── Phase 3 Wave 1 additions ────────────────────────────────────────────

  /**
   * Return `true` if the path exists and is a directory.
   * Returns `false` for files or non-existent paths.
   */
  isDirectory(targetPath: string): Promise<boolean>;

  /**
   * Create a directory. When `options.recursive` is true, creates parent
   * directories as needed (like `mkdir -p`). No-op if the directory
   * already exists.
   */
  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Atomically rename/move a file or directory.
   * Throws StorageError if the source does not exist.
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Copy a file from `srcPath` to `destPath`.
   * Creates parent directories for `destPath` as needed.
   * Overwrites `destPath` if it already exists.
   * Throws StorageError if `srcPath` does not exist.
   */
  copy(srcPath: string, destPath: string): Promise<void>;

  /**
   * Return file/directory metadata, or `undefined` if the path does not exist.
   */
  stat(targetPath: string): Promise<StorageStats | undefined>;

  // ── Synchronous variants (Wave 1 compat) ────────────────────────────────
  // These exist so callers that cannot be made async in Wave 1 still work.
  // They will be removed in Wave 2; migrate to the async versions now.

  /**
   * Synchronous read. Returns `undefined` on ENOENT.
   * @deprecated Use read() instead. Migration: replace `const data = provider.readSync(path)` with `const data = await provider.read(path)`. Will be removed in Wave 2.
   */
  readSync(filePath: string): string | undefined;

  /**
   * Synchronous write with recursive mkdir.
   * @deprecated Use write() instead. Migration: replace `provider.writeSync(path, data)` with `await provider.write(path, data)`. Will be removed in Wave 2.
   */
  writeSync(filePath: string, data: string): void;

  /**
   * Synchronous exists check.
   * @deprecated Use exists() instead. Migration: replace `if (provider.existsSync(path))` with `if (await provider.exists(path))`. Will be removed in Wave 2.
   *
   * TOCTOU: Same race condition warning as exists(). Prefer read()
   * with undefined check over exists() then read() patterns.
   */
  existsSync(filePath: string): boolean;

  /**
   * Synchronous directory listing.
   * Returns entry names directly inside dirPath.
   * Returns empty array if directory does not exist.
   * @deprecated Use list() instead. Migration: replace `const entries = provider.listSync(dir)` with `const entries = await provider.list(dir)`. Will be removed in Wave 2.
   */
  listSync(dirPath: string): string[];

  /**
   * Synchronous directory check.
   * @deprecated Use isDirectory() instead. Migration: replace `if (provider.isDirectorySync(path))` with `if (await provider.isDirectory(path))`. Will be removed in Wave 2.
   */
  isDirectorySync(targetPath: string): boolean;

  /**
   * Synchronous directory creation.
   * @deprecated Use mkdir() instead. Migration: replace `provider.mkdirSync(dir, { recursive: true })` with `await provider.mkdir(dir, { recursive: true })`. Will be removed in Wave 2.
   */
  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void;

  /**
   * Synchronous stat. Returns undefined on ENOENT.
   * @deprecated Use stat() instead. Migration: replace `const s = provider.statSync(path)` with `const s = await provider.stat(path)`. Will be removed in Wave 2.
   */
  statSync(targetPath: string): StorageStats | undefined;

  /**
   * Synchronous append with recursive mkdir.
   * @deprecated Use append() instead. Migration: replace `provider.appendSync(path, data)` with `await provider.append(path, data)`. Will be removed in Wave 2.
   */
  appendSync(filePath: string, data: string): void;

  /**
   * Synchronous delete. No-op if file does not exist (ENOENT).
   * @deprecated Use delete() instead. Migration: replace `provider.deleteSync(path)` with `await provider.delete(path)`. Will be removed in Wave 2.
   */
  deleteSync(filePath: string): void;

  /**
   * Synchronous rename/move.
   * @deprecated Use rename() instead. Migration: replace `provider.renameSync(old, new)` with `await provider.rename(old, new)`. Will be removed in Wave 2.
   */
  renameSync(oldPath: string, newPath: string): void;

  /**
   * Synchronous file copy with recursive mkdir for dest.
   * @deprecated Use copy() instead. Migration: replace `provider.copySync(src, dest)` with `await provider.copy(src, dest)`. Will be removed in Wave 2.
   */
  copySync(srcPath: string, destPath: string): void;

  /**
   * Synchronous recursive directory delete. No-op if dir does not exist (ENOENT).
   * @deprecated Use deleteDir() instead. Migration: replace `provider.deleteDirSync(dir)` with `await provider.deleteDir(dir)`. Will be removed in Wave 2.
   */
  deleteDirSync(dirPath: string): void;
}
