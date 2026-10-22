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
  InheritedSkill,
  InheritedDocument,
  EffectiveUpstreamContext,
} from './types.js';

export {
  DEFAULT_UPSTREAM_MAX_DEPTH,
  DEFAULT_UPSTREAM_STALE_DAYS,
  UPSTREAM_REPORT_MAX_CHARS,
  readUpstreamConfig,
  resolveUpstreams,
  upstreamProvenance,
  buildEffectiveUpstreamContext,
  formatUpstreamReport,
  buildInheritedContextBlock,
  buildSessionDisplay,
} from './resolver.js';