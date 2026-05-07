/**
 * Local SDK compatibility barrel for CLI builds.
 *
 * The CLI consumes symbols that may land in the SDK before the published root
 * barrel catches up. Importing from the sibling SDK dist keeps workspace builds
 * and runtime aligned without broad package-manager changes.
 */

export { FSStorageProvider } from '../../../squad-sdk/dist/storage/index.js';
export { SquadState } from '../../../squad-sdk/dist/state/index.js';
export {
  resolveGlobalSquadPath,
  resolvePersonalSquadDir,
  ensurePersonalSquadDir,
  deriveProjectKey,
  resolveExternalStateDir,
  resolveSquadHome,
  ensureSquadHome,
  resolvePresetsDir,
  resolveSquadState,
  resolveSquad,
} from '../../../squad-sdk/dist/resolution.js';
export { initSquad, cleanupOrphanInitPrompt } from '../../../squad-sdk/dist/config/index.js';
export type { InitOptions } from '../../../squad-sdk/dist/config/index.js';
export type { SquadStateContext } from '../../../squad-sdk/dist/resolution.js';
export type { StateBackendType } from '../../../squad-sdk/dist/state-backend.js';
export { parseRoutingRules, parseModuleOwnership, parseRoster, triageIssue } from '../../../squad-sdk/dist/ralph/triage.js';
export { RalphMonitor, PredictiveCircuitBreaker, getTrafficLight } from '../../../squad-sdk/dist/ralph/index.js';
export { EventBus } from '../../../squad-sdk/dist/runtime/event-bus.js';
export { createPlatformAdapter } from '../../../squad-sdk/dist/platform/index.js';
export type { TriageIssue } from '../../../squad-sdk/dist/ralph/triage.js';
export type { MachineCapabilities } from '../../../squad-sdk/dist/ralph/capabilities.js';
export type { PlatformAdapter, WorkItem, PullRequest as SdkPullRequest } from '../../../squad-sdk/dist/platform/index.js';
