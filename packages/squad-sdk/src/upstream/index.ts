/**
 * Upstream module — public API.
 *
 * @module upstream
 */

export type {
  UpstreamType,
  UpstreamSource,
  UpstreamConfig,
  ResolvedUpstream,
  UpstreamResolution,
} from './types.js';

export {
  readUpstreamConfig,
  resolveUpstreams,
  buildInheritedContextBlock,
  buildSessionDisplay,
} from './resolver.js';

export type {
  UpstreamSyncConfig,
  UpstreamChangeDetection,
  WatchCycleResult,
  UpstreamProposeScope,
  UpstreamProposeConfig,
  ProposePackage,
} from './sync-types.js';

export {
  DEFAULT_SYNC_CONFIG,
  DEFAULT_PROPOSE_CONFIG,
} from './sync-types.js';

export {
  hashFile,
  collectFileHashes,
  diffHashes,
  resolveUpstreamSquadPath,
  getGitHeadSha,
  pullGitUpstream,
  createWatchState,
  checkUpstreamForChanges,
  runWatchCycle,
  parseSyncConfig,
} from './watcher.js';
export type { WatchState } from './watcher.js';

export {
  parseProposeConfig,
  collectProposalFiles,
  buildProposalSummary,
  packageProposal,
} from './proposer.js';
