/**
 * Watch config loader.
 *
 * Priority: CLI flag > .squad/config.json "watch" section > defaults.
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import type { SquadStateContext, StateBackendType } from '@bradygaster/squad-sdk';
import {
  DEFAULT_CLAIM_SKEW_MARGIN_MS,
  DEFAULT_CLAIM_TTL_MS,
  claimTimingError,
} from '@bradygaster/squad-sdk/ralph/claims';

const storage = new FSStorageProvider();

/** Dispatch strategy for issue execution. */
export type DispatchMode = 'task' | 'fleet' | 'hybrid';

/** Work claim providers selectable for `squad watch` (ADR-002). */
export const WATCH_CLAIM_PROVIDERS = ['none', 'git-ref'] as const;
export type WatchClaimProviderName = typeof WATCH_CLAIM_PROVIDERS[number];

/** Invalid watch configuration that must not silently fall back to defaults. */
export class WatchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchConfigError';
  }
}

/**
 * `watch.claims` in `.squad/config.json`: either a provider name or an object
 * with tuning options. `--claims <none|git-ref>` overrides `provider` only.
 */
export interface WatchClaimsConfig {
  provider: WatchClaimProviderName;
  ttlMs?: number;
  skewMarginMs?: number;
  /** Shared remote for `git-ref` claims. Default `origin`. */
  remote?: string;
  /** Claim ref namespace for `git-ref`. */
  refPrefix?: string;
}

export function isWatchClaimProviderName(value: unknown): value is WatchClaimProviderName {
  return typeof value === 'string' && (WATCH_CLAIM_PROVIDERS as readonly string[]).includes(value);
}

const WATCH_CLAIMS_KEYS = new Set(['provider', 'ttlMs', 'skewMarginMs', 'remote', 'refPrefix']);

/**
 * Parse a raw `watch.claims` value. Returns an error string instead of
 * silently falling back, so a typo never quietly disables claims. Lease
 * timing must satisfy `claimTimingError` (30 s ≤ ttlMs ≤ 24 h,
 * skewMarginMs ≤ 1 h, ttlMs > 2 × skewMarginMs, defaults filled in). Unknown
 * keys are reported in `warnings` and ignored.
 */
export function parseWatchClaimsConfig(raw: unknown): { config?: WatchClaimsConfig; error?: string; warnings?: string[] } {
  if (raw === undefined || raw === null) return {};
  if (typeof raw === 'string') {
    return isWatchClaimProviderName(raw)
      ? { config: { provider: raw } }
      : { error: `unknown provider "${raw}" (valid: ${WATCH_CLAIM_PROVIDERS.join(', ')})` };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'must be a provider name or an object with a "provider" field' };
  }
  const obj = raw as Record<string, unknown>;
  if (!isWatchClaimProviderName(obj['provider'])) {
    return { error: `unknown provider "${String(obj['provider'])}" (valid: ${WATCH_CLAIM_PROVIDERS.join(', ')})` };
  }
  const config: WatchClaimsConfig = { provider: obj['provider'] };
  if (obj['ttlMs'] !== undefined) {
    const ttl = obj['ttlMs'];
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0) {
      return { error: 'ttlMs must be a positive number of milliseconds' };
    }
    config.ttlMs = ttl;
  }
  if (obj['skewMarginMs'] !== undefined) {
    const skew = obj['skewMarginMs'];
    if (typeof skew !== 'number' || !Number.isFinite(skew) || skew < 0) {
      return { error: 'skewMarginMs must be a non-negative number of milliseconds' };
    }
    config.skewMarginMs = skew;
  }
  if (config.ttlMs !== undefined || config.skewMarginMs !== undefined) {
    const timing = claimTimingError({
      ttlMs: config.ttlMs ?? DEFAULT_CLAIM_TTL_MS,
      skewMarginMs: config.skewMarginMs ?? DEFAULT_CLAIM_SKEW_MARGIN_MS,
    });
    if (timing) return { error: timing };
  }
  for (const field of ['remote', 'refPrefix'] as const) {
    if (obj[field] === undefined) continue;
    const value = obj[field];
    if (typeof value !== 'string' || value.trim() === '') {
      return { error: `${field} must be a non-empty string` };
    }
    config[field] = value;
  }
  const unknown = Object.keys(obj).filter(k => !WATCH_CLAIMS_KEYS.has(k));
  return unknown.length > 0
    ? { config, warnings: unknown.map(k => `unknown key "${k}" ignored (valid: ${[...WATCH_CLAIMS_KEYS].join(', ')})`) }
    : { config };
}

/** Merge file and CLI claim settings: the CLI provider wins; file tuning is kept. */
export function mergeWatchClaimsConfig(
  file: WatchClaimsConfig | undefined,
  cli: WatchClaimsConfig | undefined,
): WatchClaimsConfig | undefined {
  if (!cli) return file;
  return { ...(file ?? {}), ...cli };
}

/** Fully-resolved watch configuration. */
export interface WatchConfig {
  interval: number;
  /** Stop after this many completed watch rounds. Unset means unbounded. */
  maxRounds?: number;
  /** Wall-clock run limit, for example "8h". Unset means unbounded. */
  maxDuration?: string;
  execute: boolean;
  maxConcurrent: number;
  timeout: number;
  copilotFlags?: string;
  /** Hidden — fully override the agent command. */
  agentCmd?: string;
  /** Dispatch mode: 'task' (default 1:1), 'fleet' (batch read-only), 'hybrid' (auto-classify). */
  dispatchMode?: DispatchMode;
  /** Optional path to a log file. When set, console output is tee'd to the file with timestamps. */
  logFile?: string;
  /** Per-capability config: `true` / `false` / object with sub-options. */
  capabilities: Record<string, boolean | Record<string, unknown>>;
  /** Enable verbose diagnostic output for debugging. */
  verbose?: boolean;
  /** Preferred auth user for platform operations (e.g. gh auth switch --user). */
  authUser?: string;
  /** Notification level for watch events. */
  notifyLevel?: 'all' | 'important' | 'none';
  /** Hour to begin overnight mode (e.g. "22:00"). */
  overnightStart?: string;
  /** Hour to end overnight mode (e.g. "08:00"). */
  overnightEnd?: string;
  /** Path to a sentinel file — watch shuts down gracefully when removed. */
  sentinelFile?: string;
  /** State persistence backend. */
  stateBackend?: StateBackendType;
  /** Pre-resolved state context from CLI entry (avoids redundant resolution). */
  stateContext?: SquadStateContext | null;
  /** Work claim provider for execute/fleet-dispatch (ADR-002). Default: none. */
  claims?: WatchClaimsConfig;
}

const DEFAULTS: WatchConfig = {
  interval: 10,
  execute: false,
  maxConcurrent: 1,
  timeout: 30,
  dispatchMode: undefined,
  capabilities: {},
};

/**
 * Load watch config from `.squad/config.json` then merge CLI overrides.
 *
 * A missing config file means defaults. A config file that exists but is not
 * valid JSON throws {@link WatchConfigError} (fail closed: a typo must not
 * silently drop `watch.claims` and run without exclusion).
 *
 * @param teamRoot   - Root directory containing `.squad/`.
 * @param cliOverrides - Values from CLI flag parsing (only set keys win).
 * @param opts.warn  - Receives non-fatal config warnings. Default `console.warn`.
 */
export function loadWatchConfig(
  teamRoot: string,
  cliOverrides: Partial<WatchConfig>,
  opts: { warn?: (message: string) => void } = {},
): WatchConfig {
  let fileConfig: Partial<WatchConfig> = {};
  const warn = opts.warn ?? ((message: string) => console.warn(message));

  const configPath = path.join(teamRoot, '.squad', 'config.json');
  let raw: string | undefined;
  try {
    raw = storage.readSync(configPath);
  } catch (err) {
    throw new WatchConfigError(`Could not read .squad/config.json: ${(err as Error).message}`);
  }
  if (raw !== undefined) {
    let parsed: { watch?: Record<string, unknown> } | null;
    try {
      parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as { watch?: Record<string, unknown> } | null;
    } catch (err) {
      throw new WatchConfigError(`.squad/config.json is not valid JSON: ${(err as Error).message}`);
    }
    const watch = parsed?.watch;
    if (watch && typeof watch === 'object' && !Array.isArray(watch)) {
      fileConfig = normalizeFileConfig(watch, warn);
    }
  }

  // Merge: defaults < file < CLI
  const merged: WatchConfig = {
    interval: cliOverrides.interval ?? fileConfig.interval ?? DEFAULTS.interval,
    maxRounds: cliOverrides.maxRounds ?? fileConfig.maxRounds,
    maxDuration: cliOverrides.maxDuration ?? fileConfig.maxDuration,
    execute: cliOverrides.execute ?? fileConfig.execute ?? DEFAULTS.execute,
    maxConcurrent: cliOverrides.maxConcurrent ?? fileConfig.maxConcurrent ?? DEFAULTS.maxConcurrent,
    timeout: cliOverrides.timeout ?? fileConfig.timeout ?? DEFAULTS.timeout,
    copilotFlags: cliOverrides.copilotFlags ?? fileConfig.copilotFlags ?? DEFAULTS.copilotFlags,
    agentCmd: cliOverrides.agentCmd ?? fileConfig.agentCmd ?? DEFAULTS.agentCmd,
    dispatchMode: cliOverrides.dispatchMode ?? fileConfig.dispatchMode ?? DEFAULTS.dispatchMode,
    logFile: cliOverrides.logFile ?? fileConfig.logFile ?? DEFAULTS.logFile,
    capabilities: {
      ...DEFAULTS.capabilities,
      ...(fileConfig.capabilities ?? {}),
      ...(cliOverrides.capabilities ?? {}),
    },
    verbose: cliOverrides.verbose ?? fileConfig.verbose ?? false,
    authUser: cliOverrides.authUser ?? fileConfig.authUser,
    notifyLevel: cliOverrides.notifyLevel ?? fileConfig.notifyLevel,
    overnightStart: cliOverrides.overnightStart ?? fileConfig.overnightStart,
    overnightEnd: cliOverrides.overnightEnd ?? fileConfig.overnightEnd,
    sentinelFile: cliOverrides.sentinelFile ?? fileConfig.sentinelFile,
    stateBackend: cliOverrides.stateBackend ?? fileConfig.stateBackend,
    stateContext: cliOverrides.stateContext,
    claims: mergeWatchClaimsConfig(fileConfig.claims, cliOverrides.claims),
  };

  // Default to --yolo when execute mode is active and no flags were set.
  // Copilot CLI hangs in non-interactive (-p) mode without permission flags.
  if (merged.execute && !merged.copilotFlags && !merged.agentCmd) {
    merged.copilotFlags = '--yolo';
  }

  return merged;
}

/** Normalise the raw JSON "watch" object into a typed Partial<WatchConfig>. */
function normalizeFileConfig(raw: Record<string, unknown>, warn: (message: string) => void): Partial<WatchConfig> {
  const result: Partial<WatchConfig> = {};

  if (typeof raw['interval'] === 'number') result.interval = raw['interval'];
  if ('maxRounds' in raw) {
    if (typeof raw['maxRounds'] !== 'number') throw new Error('watch.maxRounds must be a positive integer');
    result.maxRounds = raw['maxRounds'];
  }
  if ('maxDuration' in raw) {
    if (typeof raw['maxDuration'] !== 'string') throw new Error('watch.maxDuration must be a duration such as "8h"');
    result.maxDuration = raw['maxDuration'];
  }
  if (typeof raw['execute'] === 'boolean') result.execute = raw['execute'];
  if (typeof raw['maxConcurrent'] === 'number') result.maxConcurrent = raw['maxConcurrent'];
  if (typeof raw['timeout'] === 'number') result.timeout = raw['timeout'];
  if (typeof raw['copilotFlags'] === 'string') result.copilotFlags = raw['copilotFlags'];
  if (typeof raw['agentCmd'] === 'string') result.agentCmd = raw['agentCmd'];
  if (typeof raw['verbose'] === 'boolean') result.verbose = raw['verbose'];
  if (typeof raw['dispatchMode'] === 'string') {
    const mode = raw['dispatchMode'] as string;
    if (mode === 'fleet' || mode === 'task' || mode === 'hybrid') {
      result.dispatchMode = mode;
    }
  }
  if (typeof raw['logFile'] === 'string') result.logFile = raw['logFile'];
  if (typeof raw['authUser'] === 'string') result.authUser = raw['authUser'];
  if (typeof raw['notifyLevel'] === 'string') {
    const level = raw['notifyLevel'];
    if (level === 'all' || level === 'important' || level === 'none') {
      result.notifyLevel = level;
    }
  }
  if (typeof raw['overnightStart'] === 'string') result.overnightStart = raw['overnightStart'];
  if (typeof raw['overnightEnd'] === 'string') result.overnightEnd = raw['overnightEnd'];
  if (typeof raw['sentinelFile'] === 'string') result.sentinelFile = raw['sentinelFile'];
  if (typeof raw['stateBackend'] === 'string') {
    const backend = raw['stateBackend'];
    const validBackends = ['local', 'orphan', 'two-layer', 'external', 'external-stub'] as const;
    if ((validBackends as readonly string[]).includes(backend)) {
      result.stateBackend = (backend === 'external' ? 'external-stub' : backend) as StateBackendType;
    }
  }

  if (raw['claims'] !== undefined) {
    const parsed = parseWatchClaimsConfig(raw['claims']);
    if (parsed.error) {
      throw new WatchConfigError(`.squad/config.json watch.claims: ${parsed.error}`);
    }
    for (const w of parsed.warnings ?? []) warn(`⚠️ .squad/config.json watch.claims: ${w}`);
    if (parsed.config) result.claims = parsed.config;
  }

  // Everything else is a capability key
  const caps: Record<string, boolean | Record<string, unknown>> = {};
  const reserved = new Set(['interval', 'maxRounds', 'maxDuration', 'execute', 'maxConcurrent', 'timeout', 'copilotFlags', 'agentCmd', 'verbose', 'dispatchMode', 'logFile', 'authUser', 'notifyLevel', 'overnightStart', 'overnightEnd', 'sentinelFile', 'stateBackend', 'claims']);
  for (const [key, value] of Object.entries(raw)) {
    if (reserved.has(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'object' && value !== null && !Array.isArray(value))) {
      caps[key] = value as boolean | Record<string, unknown>;
    }
  }
  if (Object.keys(caps).length > 0) result.capabilities = caps;

  return result;
}
