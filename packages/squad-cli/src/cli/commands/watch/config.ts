/**
 * Watch config loader.
 *
 * Priority: CLI flag > .squad/config.json "watch" section > defaults.
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import type { SquadStateContext, StateBackendType } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

/** Dispatch strategy for issue execution. */
export type DispatchMode = 'task' | 'fleet' | 'hybrid';

/** Fully-resolved watch configuration. */
export interface WatchConfig {
  interval: number;
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
 * @param teamRoot   - Root directory containing `.squad/`.
 * @param cliOverrides - Values from CLI flag parsing (only set keys win).
 */
export function loadWatchConfig(
  teamRoot: string,
  cliOverrides: Partial<WatchConfig>,
): WatchConfig {
  let fileConfig: Partial<WatchConfig> = {};

  try {
    const configPath = path.join(teamRoot, '.squad', 'config.json');
    const raw = storage.readSync(configPath);
    if (raw) {
      const parsed = JSON.parse(raw) as { watch?: Record<string, unknown> };
      if (parsed.watch) {
        fileConfig = normalizeFileConfig(parsed.watch);
      }
    }
  } catch {
    // No config file or parse error — use defaults
  }

  // Merge: defaults < file < CLI
  const merged: WatchConfig = {
    interval: cliOverrides.interval ?? fileConfig.interval ?? DEFAULTS.interval,
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
  };

  return merged;
}

/** Normalise the raw JSON "watch" object into a typed Partial<WatchConfig>. */
function normalizeFileConfig(raw: Record<string, unknown>): Partial<WatchConfig> {
  const result: Partial<WatchConfig> = {};

  if (typeof raw['interval'] === 'number') result.interval = raw['interval'];
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
    const validBackends = ['local', 'worktree', 'git-notes', 'orphan', 'two-layer', 'external'] as const; // worktree/git-notes accepted for backward compat
    if ((validBackends as readonly string[]).includes(backend)) {
      // Map legacy names to current SDK types
      result.stateBackend =
        backend === 'worktree' ? 'local'
        : backend === 'git-notes' ? 'two-layer'
        : backend as StateBackendType;
    }
  }

  // Everything else is a capability key
  const caps: Record<string, boolean | Record<string, unknown>> = {};
  const reserved = new Set(['interval', 'execute', 'maxConcurrent', 'timeout', 'copilotFlags', 'agentCmd', 'verbose', 'dispatchMode', 'logFile', 'authUser', 'notifyLevel', 'overnightStart', 'overnightEnd', 'sentinelFile', 'stateBackend']);
  for (const [key, value] of Object.entries(raw)) {
    if (reserved.has(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'object' && value !== null && !Array.isArray(value))) {
      caps[key] = value as boolean | Record<string, unknown>;
    }
  }
  if (Object.keys(caps).length > 0) result.capabilities = caps;

  return result;
}
