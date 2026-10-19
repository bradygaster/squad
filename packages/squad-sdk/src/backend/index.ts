/**
 * Experimental Squad 2.0 conversation & harness backend subpath (`@bradygaster/squad-sdk/backend`).
 *
 * @experimental This surface is exported only from the `./backend` subpath and is not re-exported
 * from the root `@bradygaster/squad-sdk` barrel.
 * @module backend
 */

import { DurableHttpSquadBackend } from './durable-http-backend.js';
import { createFileStateStore, LocalSquadBackend } from './local-backend.js';
import type { BackendConfig, SquadBackend } from './types.js';

export * from './types.js';
export * from './harness-registry.js';
export { LocalSquadBackend, MemoryStateStore, createFileStateStore } from './local-backend.js';
export type { LocalSquadBackendOptions, FileStateStoreOptions } from './local-backend.js';
export { createStateBackendStore } from './state-backend-store.js';
export type { StateBackendLike, StateBackendStoreOptions } from './state-backend-store.js';
export { DurableHttpSquadBackend, validateBaseUrl } from './durable-http-backend.js';
export type { DurableHttpOptions } from './durable-http-backend.js';

/**
 * Build a backend for `"local"`, `"mcp"` (in-process; shares the local contract) or `"durable-http"`.
 * @experimental
 */
export function createSquadBackend(config: BackendConfig): SquadBackend {
  switch (config.kind) {
    case 'local':
    case 'mcp':
      return new LocalSquadBackend({
        kind: config.kind,
        state: config.state ?? createFileStateStore(config.squadDir),
        harnesses: config.harnesses,
      });
    case 'durable-http':
      return new DurableHttpSquadBackend(config);
    default:
      throw new Error(`Unknown backend kind: ${(config as { kind: string }).kind}`);
  }
}
