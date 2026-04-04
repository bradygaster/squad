/**
 * Watch config loader.
 *
 * Priority: CLI flag > .squad/config.json "watch" section > defaults.
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

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
  /** State storage backend: worktree | external | git-notes | orphan */
  stateBackend?: string;
  /** Per-capability config: `true` / `false` / object with sub-options. */
  capabilities: Record<string, boolean | Record<string, unknown>>;
  /**
   * Controls how verbose watch round reporting is.
   * - 'all'       — print every round (current behavior)
   * - 'important' — only print rounds with actual work (default)
   * - 'none'      — suppress all round reporting
   */
  notifyLevel?: 'all' | 'important' | 'none';
  /** Verbose diagnostics (--verbose flag). */
  verbose?: boolean;
}

const DEFAULTS: WatchConfig = {
  interval: 10,
  execute: false,
  maxConcurrent: 1,
  timeout: 30,
  notifyLevel: 'important',
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
    stateBackend: cliOverrides.stateBackend ?? fileConfig.stateBackend ?? DEFAULTS.stateBackend,
    capabilities: {
      ...DEFAULTS.capabilities,
      ...(fileConfig.capabilities ?? {}),
      ...(cliOverrides.capabilities ?? {}),
    },
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
  if (typeof raw['stateBackend'] === 'string') result.stateBackend = raw['stateBackend'];
  if (raw['notifyLevel'] === 'all' || raw['notifyLevel'] === 'important' || raw['notifyLevel'] === 'none') {
    result.notifyLevel = raw['notifyLevel'];
  }
  if (typeof raw['verbose'] === 'boolean') result.verbose = raw['verbose'];
  if (typeof raw['overnightStart'] === 'string') result.overnightStart = raw['overnightStart'];
  if (typeof raw['overnightEnd'] === 'string') result.overnightEnd = raw['overnightEnd'];
  if (typeof raw['sentinelFile'] === 'string') result.sentinelFile = raw['sentinelFile'];
  if (typeof raw['authUser'] === 'string') result.authUser = raw['authUser'];
  if (typeof raw['logFile'] === 'string') result.logFile = raw['logFile'];

  // Everything else is a capability key
  const caps: Record<string, boolean | Record<string, unknown>> = {};
  const reserved = new Set(['interval', 'execute', 'maxConcurrent', 'timeout', 'copilotFlags', 'agentCmd', 'stateBackend', 'notifyLevel', 'verbose', 'overnightStart', 'overnightEnd', 'sentinelFile', 'authUser', 'logFile', 'dispatchMode']);
  for (const [key, value] of Object.entries(raw)) {
    if (reserved.has(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'object' && value !== null && !Array.isArray(value))) {
      caps[key] = value as boolean | Record<string, unknown>;
    }
  }
  if (Object.keys(caps).length > 0) result.capabilities = caps;

  return result;
}
