/**
 * Watch config loader.
 *
 * Priority: CLI flag > .squad/config.json "watch" section > defaults.
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

/** Fully-resolved watch configuration. */
export interface WatchConfig {
  interval: number;
  execute: boolean;
  maxConcurrent: number;
  timeout: number;
  copilotFlags?: string;
  /** Hidden — fully override the agent command. */
  agentCmd?: string;
  /** Per-capability config: `true` / `false` / object with sub-options. */
  capabilities: Record<string, boolean | Record<string, unknown>>;
  // ── Watch parity flags (#743) ──────────────────────────────────
  /** Webhook URL for failure alerts. */
  webhookUrl?: string;
  /** Consecutive failures before webhook alert (default: 3). */
  alertThreshold?: number;
  /** Max issues to execute per round (default: 5). */
  maxBudget?: number;
  /** Explicit machine capabilities list (e.g., ["gpu", "docker"]). */
  machineCapabilities?: string[];
  /** Cooperative rate pool settings for multi-instance coordination. */
  ratePool?: {
    /** Max API calls per interval window (default: 50). */
    maxCallsPerInterval: number;
    /** Interval window in seconds (default: 600). */
    intervalSeconds: number;
  };
}

const DEFAULTS: WatchConfig = {
  interval: 10,
  execute: false,
  maxConcurrent: 1,
  timeout: 30,
  capabilities: {},
  alertThreshold: 3,
  maxBudget: 5,
  ratePool: {
    maxCallsPerInterval: 50,
    intervalSeconds: 600,
  },
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
    capabilities: {
      ...DEFAULTS.capabilities,
      ...(fileConfig.capabilities ?? {}),
      ...(cliOverrides.capabilities ?? {}),
    },
    // Watch parity fields (#743)
    webhookUrl: cliOverrides.webhookUrl ?? fileConfig.webhookUrl ?? DEFAULTS.webhookUrl,
    alertThreshold: cliOverrides.alertThreshold ?? fileConfig.alertThreshold ?? DEFAULTS.alertThreshold,
    maxBudget: cliOverrides.maxBudget ?? fileConfig.maxBudget ?? DEFAULTS.maxBudget,
    machineCapabilities: cliOverrides.machineCapabilities ?? fileConfig.machineCapabilities ?? DEFAULTS.machineCapabilities,
    ratePool: {
      maxCallsPerInterval:
        cliOverrides.ratePool?.maxCallsPerInterval
        ?? fileConfig.ratePool?.maxCallsPerInterval
        ?? DEFAULTS.ratePool!.maxCallsPerInterval,
      intervalSeconds:
        cliOverrides.ratePool?.intervalSeconds
        ?? fileConfig.ratePool?.intervalSeconds
        ?? DEFAULTS.ratePool!.intervalSeconds,
    },
  };

  // Wire webhook-alerts capability config from top-level flags
  if (merged.webhookUrl && !merged.capabilities['webhook-alerts']) {
    merged.capabilities['webhook-alerts'] = {
      webhookUrl: merged.webhookUrl,
      alertThreshold: merged.alertThreshold ?? 3,
    };
  }

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

  // Watch parity fields (#743)
  if (typeof raw['webhookUrl'] === 'string') result.webhookUrl = raw['webhookUrl'];
  if (typeof raw['alertThreshold'] === 'number') result.alertThreshold = raw['alertThreshold'];
  if (typeof raw['maxBudget'] === 'number') result.maxBudget = raw['maxBudget'];
  if (Array.isArray(raw['machineCapabilities'])) {
    result.machineCapabilities = raw['machineCapabilities'] as string[];
  }

  // Rate pool sub-object
  if (typeof raw['ratePool'] === 'object' && raw['ratePool'] !== null && !Array.isArray(raw['ratePool'])) {
    const rp = raw['ratePool'] as Record<string, unknown>;
    result.ratePool = {
      maxCallsPerInterval: typeof rp['maxCallsPerInterval'] === 'number' ? rp['maxCallsPerInterval'] : 50,
      intervalSeconds: typeof rp['intervalSeconds'] === 'number' ? rp['intervalSeconds'] : 600,
    };
  }

  // Everything else is a capability key
  const caps: Record<string, boolean | Record<string, unknown>> = {};
  const reserved = new Set([
    'interval', 'execute', 'maxConcurrent', 'timeout', 'copilotFlags', 'agentCmd',
    'webhookUrl', 'alertThreshold', 'maxBudget', 'machineCapabilities', 'ratePool',
  ]);
  for (const [key, value] of Object.entries(raw)) {
    if (reserved.has(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'object' && value !== null && !Array.isArray(value))) {
      caps[key] = value as boolean | Record<string, unknown>;
    }
  }
  if (Object.keys(caps).length > 0) result.capabilities = caps;

  return result;
}
