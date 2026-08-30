import { basename } from 'path';

/**
 * Thrown by `createIfAbsent` when the key already exists in the target backend.
 *
 * Exactly one concurrent creator receives `void`; every other concurrent caller
 * receives this error. Content under the key is never overwritten.
 *
 * @example
 * ```ts
 * try {
 *   await storage.createIfAbsent('sessions/retro.md', content);
 * } catch (err) {
 *   if (err instanceof StateKeyConflictError) {
 *     // Another process already created this key; read the winner's content.
 *   }
 * }
 * ```
 */
export class StateKeyConflictError extends Error {
  readonly name = 'StateKeyConflictError';
  constructor(public readonly key: string) {
    super(`State key already exists: ${key}`);
  }
}

/**
 * Thrown by `createIfAbsent` when the backend cannot determine with certainty
 * whether the key was created or not (e.g. write failed after exclusive open,
 * or CAS retry exhausted with key still absent).
 *
 * Distinct from {@link StateKeyConflictError}: that error means the key
 * definitely existed; this error means the outcome is unknown. Callers should
 * NOT assume success and should treat the operation as failed.
 */
export class StateBackendUncertaintyError extends Error {
  readonly name = 'StateBackendUncertaintyError';
  constructor(
    public readonly operation: string,
    public readonly reason: string,
  ) {
    super(`State backend uncertainty on '${operation}': ${reason}`);
  }
}

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
