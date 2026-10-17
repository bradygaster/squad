import { DurableHttpSquadBackend } from './durable-http-backend.js';
import { createFileStateStore, LocalSquadBackend } from './local-backend.js';
import type { BackendConfig, SquadBackend } from './types.js';

export * from './types.js';
export * from './harness-registry.js';
export { LocalSquadBackend, MemoryStateStore, createFileStateStore } from './local-backend.js';
export type { LocalSquadBackendOptions } from './local-backend.js';
export { DurableHttpSquadBackend } from './durable-http-backend.js';
export type { DurableHttpOptions } from './durable-http-backend.js';

/** Build a backend for `"local"`, `"mcp"` (in-process; shares the local contract) or `"durable-http"`. */
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
