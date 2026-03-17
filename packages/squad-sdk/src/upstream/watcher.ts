/**
 * Upstream watcher — polls parent repos for changes in their .squad/ directory.
 *
 * Phase 1 of bidirectional sync: parent → child auto-propagation.
 * Detects changes by comparing file hashes of the upstream's .squad/ contents.
 *
 * @module upstream/watcher
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { UpstreamConfig, UpstreamSource } from './types.js';
import type {
  UpstreamChangeDetection,
  WatchCycleResult,
  UpstreamSyncConfig,
} from './sync-types.js';
import { DEFAULT_SYNC_CONFIG } from './sync-types.js';
import { readUpstreamConfig } from './resolver.js';

/** Hash a file's content for change detection. */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/** Recursively collect all files under a directory with their hashes. */
export function collectFileHashes(dir: string): Map<string, string> {
  const hashes = new Map<string, string>();
  if (!fs.existsSync(dir)) return hashes;

  function walk(current: string, prefix: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // Skip _upstream_repos and .git
        if (entry.name === '_upstream_repos' || entry.name === '.git') continue;
        walk(fullPath, relPath);
      } else {
        hashes.set(relPath, hashFile(fullPath));
      }
    }
  }

  walk(dir, '');
  return hashes;
}

/** Compare two sets of file hashes and return changed file paths. */
export function diffHashes(
  previous: Map<string, string>,
  current: Map<string, string>,
): string[] {
  const changed: string[] = [];

  // Files added or modified
  for (const [file, hash] of current) {
    if (!previous.has(file) || previous.get(file) !== hash) {
      changed.push(file);
    }
  }

  // Files removed
  for (const file of previous.keys()) {
    if (!current.has(file)) {
      changed.push(file);
    }
  }

  return changed.sort();
}

/**
 * Resolve the .squad/ directory path for an upstream source.
 * For local upstreams: source/.squad/
 * For git upstreams: squadDir/_upstream_repos/{name}/.squad/
 */
export function resolveUpstreamSquadPath(
  upstream: UpstreamSource,
  squadDir: string,
): string | null {
  if (upstream.type === 'local') {
    const squadPath = path.join(upstream.source, '.squad');
    return fs.existsSync(squadPath) ? squadPath : null;
  }
  if (upstream.type === 'git') {
    const cloneDir = path.join(squadDir, '_upstream_repos', upstream.name);
    const squadPath = path.join(cloneDir, '.squad');
    return fs.existsSync(squadPath) ? squadPath : null;
  }
  return null;
}

/** Get the current git HEAD SHA for a cloned upstream repo. */
export function getGitHeadSha(repoDir: string): string | null {
  try {
    return execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {
      stdio: 'pipe',
      timeout: 10000,
    }).toString().trim();
  } catch {
    return null;
  }
}

/** Pull latest changes for a git upstream repo. Returns new HEAD SHA or null on failure. */
export function pullGitUpstream(repoDir: string): string | null {
  try {
    execFileSync('git', ['-C', repoDir, 'pull', '--ff-only'], {
      stdio: 'pipe',
      timeout: 60000,
    });
    return getGitHeadSha(repoDir);
  } catch {
    return null;
  }
}

/** State store for tracking previous file hashes between poll cycles. */
export interface WatchState {
  /** Per-upstream file hash snapshots from last successful check. */
  snapshots: Map<string, Map<string, string>>;
}

/** Create a fresh watch state. */
export function createWatchState(): WatchState {
  return { snapshots: new Map() };
}

/**
 * Check a single upstream for changes.
 */
export function checkUpstreamForChanges(
  upstream: UpstreamSource,
  squadDir: string,
  state: WatchState,
): UpstreamChangeDetection {
  const result: UpstreamChangeDetection = {
    name: upstream.name,
    hasChanges: false,
    changedFiles: [],
    newSha: null,
    previousSha: null,
  };

  // For git upstreams, pull first
  if (upstream.type === 'git') {
    const cloneDir = path.join(squadDir, '_upstream_repos', upstream.name);
    if (fs.existsSync(path.join(cloneDir, '.git'))) {
      result.previousSha = getGitHeadSha(cloneDir);
      const newSha = pullGitUpstream(cloneDir);
      result.newSha = newSha;
    }
  }

  // Resolve the .squad/ path
  const upstreamSquadPath = resolveUpstreamSquadPath(upstream, squadDir);
  if (!upstreamSquadPath) return result;

  // Collect current file hashes
  const currentHashes = collectFileHashes(upstreamSquadPath);
  const previousHashes = state.snapshots.get(upstream.name) ?? new Map<string, string>();

  // Diff
  const changedFiles = diffHashes(previousHashes, currentHashes);
  result.hasChanges = changedFiles.length > 0;
  result.changedFiles = changedFiles;

  // Update state
  state.snapshots.set(upstream.name, currentHashes);

  return result;
}

/**
 * Run a single poll cycle — check all configured upstreams for changes.
 */
export function runWatchCycle(
  squadDir: string,
  state: WatchState,
): WatchCycleResult {
  const config = readUpstreamConfig(squadDir);
  if (!config) {
    return {
      timestamp: new Date().toISOString(),
      detections: [],
      hasAnyChanges: false,
    };
  }

  const detections: UpstreamChangeDetection[] = [];
  for (const upstream of config.upstreams) {
    detections.push(checkUpstreamForChanges(upstream, squadDir, state));
  }

  return {
    timestamp: new Date().toISOString(),
    detections,
    hasAnyChanges: detections.some(d => d.hasChanges),
  };
}

/**
 * Parse sync configuration from upstream-config.json, merged with defaults.
 */
export function parseSyncConfig(squadDir: string): UpstreamSyncConfig {
  const configPath = path.join(squadDir, 'upstream-config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_SYNC_CONFIG };

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<{
      sync: Partial<UpstreamSyncConfig>;
    }>;
    return {
      interval: raw.sync?.interval ?? DEFAULT_SYNC_CONFIG.interval,
      autoPr: raw.sync?.autoPr ?? DEFAULT_SYNC_CONFIG.autoPr,
      branchPrefix: raw.sync?.branchPrefix ?? DEFAULT_SYNC_CONFIG.branchPrefix,
    };
  } catch {
    return { ...DEFAULT_SYNC_CONFIG };
  }
}
