/**
 * Cross-Squad Orchestration — discovery, delegation, and manifest support.
 *
 * Enables squads to discover each other via manifests, delegate work
 * across repository boundaries, and track cross-squad issue completion.
 *
 * @module runtime/cross-squad
 */

import { join } from 'path';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';

// ============================================================================
// Types
// ============================================================================

/** Contact information for reaching a squad. */
export interface SquadContact {
  /** GitHub repository in "owner/repo" format. */
  repo: string;
  /** Labels to apply when creating issues for this squad. */
  labels?: string[];
}

/** Work types a squad accepts from other squads. */
export type AcceptedWorkType = 'issues' | 'prs';

/**
 * Squad manifest — the public contract a squad exposes for discovery.
 * Stored at `.squad/manifest.json` in a squad's repository.
 */
export interface SquadManifest {
  /** Human-readable squad name (e.g., "platform-squad"). */
  name: string;
  /** Schema version for forward compatibility. */
  version?: string;
  /** One-line description of this squad's purpose. */
  description?: string;
  /** Capability tags (e.g., ["kubernetes", "helm", "monitoring"]). */
  capabilities: string[];
  /** How to reach this squad (repo + labels). */
  contact: SquadContact;
  /** Work types this squad accepts from other squads. */
  accepts: AcceptedWorkType[];
  /** Named skills this squad offers. */
  skills?: string[];
}

/** A discovered squad with its manifest and source location. */
export interface DiscoveredSquad {
  /** Manifest data. */
  manifest: SquadManifest;
  /** How this squad was discovered. */
  source: 'upstream' | 'registry' | 'local';
  /** Upstream name or registry path (for provenance). */
  sourceRef: string;
}

/** Options for creating a cross-squad issue. */
export interface CrossSquadIssueOptions {
  /** Target repo in "owner/repo" format. */
  targetRepo: string;
  /** Issue title (will be prefixed with [cross-squad]). */
  title: string;
  /** Issue body with context and acceptance criteria. */
  body: string;
  /** Labels to apply (squad labels are added automatically). */
  labels?: string[];
}

/** Result of creating a cross-squad issue. */
export interface CrossSquadIssueResult {
  /** Whether the issue was successfully created. */
  success: boolean;
  /** Issue URL if created, or error message if not. */
  url?: string;
  /** Error message if creation failed. */
  error?: string;
}

/** Status of a tracked cross-squad issue. */
export interface CrossSquadWorkStatus {
  /** Issue URL being tracked. */
  url: string;
  /** Current state. */
  state: 'open' | 'closed' | 'unknown';
  /** Issue title (from last poll). */
  title?: string;
  /** Error message if status check failed. */
  error?: string;
}

// ============================================================================
// Manifest Operations
// ============================================================================

/** Validate a manifest object has all required fields. */
export function validateManifest(data: unknown): data is SquadManifest {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj['name'] !== 'string' || obj['name'].length === 0) return false;
  if (!Array.isArray(obj['capabilities'])) return false;
  if (!Array.isArray(obj['accepts'])) return false;
  if (typeof obj['contact'] !== 'object' || obj['contact'] === null) return false;
  const contact = obj['contact'] as Record<string, unknown>;
  if (typeof contact['repo'] !== 'string' || contact['repo'].length === 0) return false;
  // Validate accepts values
  const validAccepts = new Set(['issues', 'prs']);
  for (const a of obj['accepts'] as unknown[]) {
    if (typeof a !== 'string' || !validAccepts.has(a)) return false;
  }
  return true;
}

/**
 * Read and parse a squad manifest from a directory path.
 * Looks for `.squad/manifest.json` relative to the given root.
 */
export function readManifest(
  repoPath: string,
  storage: StorageProvider = new FSStorageProvider(),
): SquadManifest | null {
  const manifestPath = join(repoPath, '.squad', 'manifest.json');
  if (!storage.existsSync(manifestPath)) return null;
  try {
    const raw = storage.readSync(manifestPath);
    if (raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!validateManifest(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// Discovery
// ============================================================================

/**
 * Upstream entry — minimal shape we need from upstream.json.
 * Re-declared here to avoid circular dependency with upstream module.
 */
interface UpstreamEntry {
  name: string;
  type: string;
  source: string;
}

interface UpstreamJsonFile {
  upstreams: UpstreamEntry[];
}

/**
 * Discover squads from upstream sources.
 * Reads `.squad/upstream.json` and checks each upstream for a manifest.
 */
export function discoverFromUpstreams(
  squadDir: string,
  storage: StorageProvider = new FSStorageProvider(),
): DiscoveredSquad[] {
  const upstreamPath = join(squadDir, 'upstream.json');
  if (!storage.existsSync(upstreamPath)) return [];

  let config: UpstreamJsonFile;
  try {
    const raw = storage.readSync(upstreamPath);
    if (raw === undefined) return [];
    config = JSON.parse(raw) as UpstreamJsonFile;
  } catch {
    return [];
  }

  if (!Array.isArray(config.upstreams)) return [];

  const discovered: DiscoveredSquad[] = [];
  for (const upstream of config.upstreams) {
    if (upstream.type === 'local' && upstream.source) {
      const manifest = readManifest(upstream.source, storage);
      if (manifest) {
        discovered.push({
          manifest,
          source: 'upstream',
          sourceRef: upstream.name,
        });
      }
    } else if (upstream.type === 'git') {
      // For git upstreams, check the cached clone directory
      const cloneDir = join(squadDir, '_upstream_repos', upstream.name);
      const manifest = readManifest(cloneDir, storage);
      if (manifest) {
        discovered.push({
          manifest,
          source: 'upstream',
          sourceRef: upstream.name,
        });
      }
    }
  }

  return discovered;
}

/**
 * Discover squads from a registry file.
 * A registry is a JSON file listing repo paths to check for manifests.
 */
export function discoverFromRegistry(
  registryPath: string,
  storage: StorageProvider = new FSStorageProvider(),
): DiscoveredSquad[] {
  if (!storage.existsSync(registryPath)) return [];

  let entries: Array<{ name: string; path: string }>;
  try {
    const raw = storage.readSync(registryPath);
    if (raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    entries = parsed as Array<{ name: string; path: string }>;
  } catch {
    return [];
  }

  const discovered: DiscoveredSquad[] = [];
  for (const entry of entries) {
    if (typeof entry.path === 'string') {
      const manifest = readManifest(entry.path, storage);
      if (manifest) {
        discovered.push({
          manifest,
          source: 'registry',
          sourceRef: entry.name || entry.path,
        });
      }
    }
  }

  return discovered;
}

/**
 * Discover all squads from all available sources.
 * Checks upstreams first, then a registry file if present.
 */
export function discoverSquads(
  squadDir: string,
  storage: StorageProvider = new FSStorageProvider(),
): DiscoveredSquad[] {
  const fromUpstreams = discoverFromUpstreams(squadDir, storage);
  const registryPath = join(squadDir, 'squad-registry.json');
  const fromRegistry = discoverFromRegistry(registryPath, storage);

  // Deduplicate by manifest name (upstreams take priority)
  const seen = new Set(fromUpstreams.map(d => d.manifest.name));
  const merged = [...fromUpstreams];
  for (const d of fromRegistry) {
    if (!seen.has(d.manifest.name)) {
      seen.add(d.manifest.name);
      merged.push(d);
    }
  }

  return merged;
}

// ============================================================================
// Delegation
// ============================================================================

/**
 * Build the CLI args for creating a cross-squad issue via `gh issue create`.
 * Returns the argument array (does not execute — callers run the command).
 */
export function buildDelegationArgs(options: CrossSquadIssueOptions): string[] {
  const title = options.title.startsWith('[cross-squad]')
    ? options.title
    : `[cross-squad] ${options.title}`;

  const args = [
    'issue', 'create',
    '--repo', options.targetRepo,
    '--title', title,
    '--body', options.body,
  ];

  const labels = [...(options.labels || [])];
  if (!labels.includes('squad:cross-squad')) {
    labels.push('squad:cross-squad');
  }
  for (const label of labels) {
    args.push('--label', label);
  }

  return args;
}

/**
 * Build the CLI args for checking a cross-squad issue status via `gh`.
 * Parses an issue URL into --repo and issue number.
 */
export function buildStatusCheckArgs(issueUrl: string): string[] | null {
  // Parse GitHub issue URL: https://github.com/owner/repo/issues/123
  const match = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/.exec(issueUrl);
  if (!match) return null;
  const repo = match[1]!;
  const number = match[2]!;
  return ['issue', 'view', '--repo', repo, number, '--json', 'state,title'];
}

/**
 * Parse the JSON output from `gh issue view --json state,title`.
 */
export function parseIssueStatus(jsonOutput: string, issueUrl: string): CrossSquadWorkStatus {
  try {
    const data = JSON.parse(jsonOutput) as { state: string; title: string };
    return {
      url: issueUrl,
      state: data.state === 'CLOSED' ? 'closed' : data.state === 'OPEN' ? 'open' : 'unknown',
      title: data.title,
    };
  } catch {
    return { url: issueUrl, state: 'unknown', error: 'Failed to parse issue status' };
  }
}

// ============================================================================
// Display Helpers
// ============================================================================

/** Format discovered squads for terminal display. */
export function formatDiscoveryTable(squads: DiscoveredSquad[]): string {
  if (squads.length === 0) {
    return 'No squads discovered. Add upstreams with "squad upstream add" or create a squad-registry.json.';
  }

  const lines: string[] = ['\nDiscovered squads:\n'];
  for (const s of squads) {
    const caps = s.manifest.capabilities.slice(0, 5).join(', ');
    const capsSuffix = s.manifest.capabilities.length > 5 ? `, +${s.manifest.capabilities.length - 5} more` : '';
    const accepts = s.manifest.accepts.join(', ');
    lines.push(`  ${s.manifest.name}  →  ${s.manifest.contact.repo}  (${caps}${capsSuffix})`);
    lines.push(`    Accepts: ${accepts}  |  Source: ${s.source} (${s.sourceRef})`);
    if (s.manifest.description) {
      lines.push(`    ${s.manifest.description}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Find a squad by name from a list of discovered squads. */
export function findSquadByName(squads: DiscoveredSquad[], name: string): DiscoveredSquad | undefined {
  return squads.find(s => s.manifest.name === name);
}
