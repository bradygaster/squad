/**
 * Upstream module — public API.
 *
 * @module upstream
 */

export type {
  UpstreamType,
  UpstreamSource,
  UpstreamConfig,
  UpstreamStatus,
  ResolvedUpstream,
  UpstreamResolution,
  ResolveUpstreamsOptions,
  UpstreamReadLimits,
  UpstreamReadHook,
  InheritedSkill,
  InheritedDocument,
  EffectiveUpstreamContext,
} from './types.js';

export {
  DEFAULT_UPSTREAM_MAX_DEPTH,
  DEFAULT_UPSTREAM_STALE_DAYS,
  UPSTREAM_REPORT_MAX_CHARS,
  UPSTREAM_MAX_FILE_BYTES,
  DEFAULT_UPSTREAM_READ_LIMITS,
  readUpstreamConfig,
  resolveUpstreams,
  upstreamProvenance,
  buildEffectiveUpstreamContext,
  formatUpstreamReport,
  buildInheritedContextBlock,
  buildSessionDisplay,
} from './resolver.js';