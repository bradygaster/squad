/**
 * Session persistence — re-export shim.
 * Canonical implementation lives in @bradygaster/squad-sdk.
 */
export {
  createSession,
  saveSession,
  listSessions,
  loadLatestSession,
  loadSessionById,
} from '@bradygaster/squad-sdk/runtime/session-store';
export type { SessionData, SessionSummary } from '@bradygaster/squad-sdk/runtime/session-store';
