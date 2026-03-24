import { basename } from 'path';

/**
 * Sanitized storage error — strips internal filesystem paths from the public message.
 * Callers see the operation that failed and the storage-relative path, not the absolute OS path.
 */
export class StorageError extends Error {
  readonly code: string;
  readonly operation: string;

  constructor(operation: string, filePath: string, cause: NodeJS.ErrnoException) {
    super(`Storage ${operation} failed for "${basename(filePath)}": ${cause.code}`);
    this.name = 'StorageError';
    this.code = cause.code ?? 'UNKNOWN';
    this.operation = operation;
    this.cause = cause;
  }
}
