/**
 * StorageProvider — abstract I/O interface for the Squad SDK.
 *
 * Wave 1: defines the contract. FSStorageProvider is the default.
 * Wave 2: call-site migration will retire the sync methods.
 */

/**
 * Options passed to StorageProvider implementations.
 * Reserved for future use (e.g. base directory scoping, encoding).
 */
export interface StorageProviderOptions {
  /** Optional root directory to resolve relative paths against. */
  baseDir?: string;
}

/**
 * Core storage abstraction used by the Squad SDK.
 *
 * Async methods are preferred for all new code.
 * Sync methods exist for legacy compatibility and will be deprecated after Wave 2.
 */
export interface StorageProvider {
  // -------------------------------------------------------------------------
  // Async (preferred — use for new code)
  // -------------------------------------------------------------------------

  /** Read the full contents of a file. Throws if the file does not exist. */
  read(path: string): Promise<string>;

  /** Write content to a file, creating parent directories as needed. */
  write(path: string, content: string): Promise<void>;

  /** Append content to a file. Creates the file (and parent dirs) if missing. */
  append(path: string, content: string): Promise<void>;

  /** Return true if the path exists on the filesystem. */
  exists(path: string): Promise<boolean>;

  /** List the names of entries directly inside a directory. */
  list(dir: string): Promise<string[]>;

  /** Delete a file. No-op if the file does not exist. */
  delete(path: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Sync (legacy — deprecated after Wave 2 migration)
  // -------------------------------------------------------------------------

  /**
   * Read the full contents of a file synchronously.
   * @deprecated Use {@link read} (async) instead. Will be removed after Wave 2.
   */
  readSync(path: string): string;

  /**
   * Write content to a file synchronously, creating parent directories as needed.
   * @deprecated Use {@link write} (async) instead. Will be removed after Wave 2.
   */
  writeSync(path: string, content: string): void;

  /**
   * Return true if the path exists synchronously.
   * @deprecated Use {@link exists} (async) instead. Will be removed after Wave 2.
   */
  existsSync(path: string): boolean;
}
