import { basename } from 'path';

/**
 * Sanitized storage error that strips internal filesystem paths from error messages.
 *
 * When a StorageProvider operation fails, the underlying OS error often contains
 * absolute filesystem paths (e.g. `/home/user/.squad/data/file.txt`). Exposing
 * these in logs or user-facing output leaks server internals. StorageError
 * replaces the full path with just the basename so callers see *what* failed
 * and *why* (the errno code) without revealing *where* on disk.
 *
 * @example
 * ```ts
 * // Thrown automatically by FSStorageProvider on failure:
 * // StorageError: Storage read failed for "file.txt": ENOENT
 * ```
 */
export class StorageError extends Error {
  /** The errno code from the underlying OS/system error (e.g. `ENOENT`, `EACCES`, `UNKNOWN`). */
  readonly code: string;
  /** The storage operation that failed (e.g. `read`, `write`, `delete`, `rename`). */
  readonly operation: string;

  /**
   * @param operation - The storage operation that failed (e.g. `read`, `write`).
   * @param filePath  - The original file path; only its basename is included in the message.
   * @param cause     - The underlying Node.js filesystem error.
   */
  constructor(operation: string, filePath: string, cause: NodeJS.ErrnoException) {
    super(`Storage ${operation} failed for "${basename(filePath)}": ${cause.code ?? 'UNKNOWN'}`);
    this.name = 'StorageError';
    this.code = cause.code ?? 'UNKNOWN';
    this.operation = operation;
    this.cause = cause;
  }
}
