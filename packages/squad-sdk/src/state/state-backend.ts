/**
 * StateBackend — Interface for Squad state persistence.
 *
 * Squad state (.squad/) can live in different backends:
 * - Working tree (current default — fragile, destroyed by branch switches)
 * - Orphan branch (immune to branch switches — this POC)
 * - External directory (~/.squad/projects/ — for contributor mode)
 *
 * This interface abstracts the read/write operations so the rest of
 * Squad doesn't need to know where state lives.
 */

export interface StateBackend {
  /** Human-readable name for diagnostics (e.g., "orphan-branch", "filesystem") */
  readonly name: string;

  /** Read a file from state. Returns null if not found. */
  read(path: string): Promise<string | null>;

  /** Write a file to state. Creates parent directories as needed. */
  write(path: string, content: string): Promise<void>;

  /** Check if a file exists in state. */
  exists(path: string): Promise<boolean>;

  /** List files in a directory within state. Returns relative paths. */
  list(dir: string): Promise<string[]>;

  /** Delete a file from state. */
  remove(path: string): Promise<void>;

  /** Validate that the backend is healthy and accessible. */
  doctor(): Promise<StateBackendHealth>;
}

export interface StateBackendHealth {
  healthy: boolean;
  backend: string;
  message: string;
  details?: Record<string, string>;
}
