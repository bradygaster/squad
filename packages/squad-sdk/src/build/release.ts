/**
 * M6-13: Release candidate build & validation
 * Handles release manifest creation, validation, and release notes generation.
 *
 * @module build/release
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { CommitInfo } from './versioning.js';
import { parseConventionalCommit } from './versioning.js';

const storage = new FSStorageProvider();

// ============================================================================
// Types
// ============================================================================

/** Release channel. */
export type ReleaseChannel = 'stable' | 'rc' | 'beta' | 'alpha';

/**
 * Configuration for creating a release.
 */
export interface ReleaseConfig {
  /** Semver version string (e.g. "1.0.0", "1.0.0-rc.1") */
  version: string;
  /** Release channel */
  channel: ReleaseChannel;
  /** Whether this is a prerelease */
  prerelease: boolean;
  /** Git tag name (e.g. "v1.0.0-rc.1") */
  tag: string;
}

/**
 * An artifact included in a release.
 */
export interface ReleaseArtifact {
  /** Display name */
  name: string;
  /** File path */
  path: string;
  /** File size in bytes */
  size: number;
  /** SHA-256 hash */
  sha256: string;
}

/**
 * Release manifest describing a complete release.
 */
export interface ReleaseManifest {
  /** Semver version */
  version: string;
  /** Release channel */
  channel: ReleaseChannel;
  /** Build artifacts */
  artifacts: ReleaseArtifact[];
  /** ISO timestamp of the release */
  timestamp: string;
  /** Changelog markdown for this release */
  changelog: string;
}

/**
 * A validation error found in a release manifest.
 */
export interface ReleaseValidationError {
  /** Field that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** Severity */
  severity: 'error' | 'warning';
}

/**
 * A checklist item for the release process.
 */
export interface ReleaseChecklistItem {
  /** Human-readable name */
  name: string;
  /** Function that checks this item (returns true if passing) */
  check: () => boolean;
  /** Whether this item is required for release */
  required: boolean;
  /** Current status */
  status: 'pass' | 'fail' | 'skip';
}

// ============================================================================
// Release creation
// ============================================================================

/**
 * Compute the SHA-256 hash of a buffer or string.
 */
export function computeSha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Build a ReleaseArtifact from a file path.
 * Returns null if the file does not exist.
 */
export function buildArtifact(name: string, filePath: string): ReleaseArtifact | null {
  if (!storage.existsSync(filePath)) return null;

  const content = readFileSync(filePath); // Buffer-based read for correct binary hashing
  const size = storage.statSync(filePath)?.size ?? 0;

  return {
    name,
    path: filePath,
    size,
    sha256: computeSha256(content),
  };
}

/**
 * Create a release manifest from a ReleaseConfig.
 *
 * @param config - Release configuration
 * @param artifactPaths - Optional map of artifact name → file path
 * @returns Release manifest
 */
export function createRelease(
  config: ReleaseConfig,
  artifactPaths?: Record<string, string>,
): ReleaseManifest {
  const artifacts: ReleaseArtifact[] = [];

  if (artifactPaths) {
    for (const [name, filePath] of Object.entries(artifactPaths)) {
      const artifact = buildArtifact(name, filePath);
      if (artifact) {
        artifacts.push(artifact);
      }
    }
  }

  return {
    version: config.version,
    channel: config.channel,
    artifacts,
    timestamp: new Date().toISOString(),
    changelog: '',
  };
}

// ============================================================================
// Validation
// ============================================================================

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)?$/;

/**
 * Validate a release manifest for correctness.
 *
 * @param manifest - Release manifest to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateRelease(manifest: ReleaseManifest): ReleaseValidationError[] {
  const errors: ReleaseValidationError[] = [];

  // Version
  if (!manifest.version) {
    errors.push({ field: 'version', message: 'Version is required', severity: 'error' });
  } else if (!SEMVER_RE.test(manifest.version)) {
    errors.push({ field: 'version', message: `Invalid semver version: ${manifest.version}`, severity: 'error' });
  }

  // Channel
  const validChannels: ReleaseChannel[] = ['stable', 'rc', 'beta', 'alpha'];
  if (!manifest.channel) {
    errors.push({ field: 'channel', message: 'Channel is required', severity: 'error' });
  } else if (!validChannels.includes(manifest.channel)) {
    errors.push({ field: 'channel', message: `Invalid channel: ${manifest.channel}`, severity: 'error' });
  }

  // Channel / version consistency
  if (manifest.channel === 'stable' && manifest.version.includes('-')) {
    errors.push({
      field: 'version',
      message: 'Stable releases must not have prerelease suffixes',
      severity: 'error',
    });
  }
  if (manifest.channel !== 'stable' && !manifest.version.includes('-')) {
    errors.push({
      field: 'version',
      message: `Non-stable channel "${manifest.channel}" should have a prerelease suffix`,
      severity: 'warning',
    });
  }

  // Timestamp
  if (!manifest.timestamp) {
    errors.push({ field: 'timestamp', message: 'Timestamp is required', severity: 'error' });
  } else if (isNaN(Date.parse(manifest.timestamp))) {
    errors.push({ field: 'timestamp', message: 'Timestamp is not a valid ISO date', severity: 'error' });
  }

  // Artifacts
  if (!Array.isArray(manifest.artifacts)) {
    errors.push({ field: 'artifacts', message: 'Artifacts must be an array', severity: 'error' });
  } else {
    for (let i = 0; i < manifest.artifacts.length; i++) {
      const a = manifest.artifacts[i]!;
      if (!a.name) {
        errors.push({ field: `artifacts[${i}].name`, message: 'Artifact name is required', severity: 'error' });
      }
      if (!a.path) {
        errors.push({ field: `artifacts[${i}].path`, message: 'Artifact path is required', severity: 'error' });
      }
      if (typeof a.size !== 'number' || a.size < 0) {
        errors.push({ field: `artifacts[${i}].size`, message: 'Artifact size must be a non-negative number', severity: 'error' });
      }
      if (!a.sha256 || !/^[a-f0-9]{64}$/.test(a.sha256)) {
        errors.push({ field: `artifacts[${i}].sha256`, message: 'Artifact sha256 must be a valid 64-char hex string', severity: 'error' });
      }
    }

    // Duplicate names
    const names = manifest.artifacts.map((a) => a.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      errors.push({ field: 'artifacts', message: `Duplicate artifact names: ${[...new Set(dupes)].join(', ')}`, severity: 'warning' });
    }
  }

  // Changelog (warning only)
  if (!manifest.changelog) {
    errors.push({ field: 'changelog', message: 'Changelog is empty', severity: 'warning' });
  }

  return errors;
}

// ============================================================================
// Release notes generation
// ============================================================================

/**
 * Generate release notes markdown from a manifest and commit list.
 */
export function generateReleaseNotes(
  manifest: ReleaseManifest,
  commits: CommitInfo[],
): string {
  const lines: string[] = [];
  const date = manifest.timestamp ? manifest.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);

  lines.push(`# ${manifest.version} (${date})`);
  lines.push('');

  if (manifest.channel !== 'stable') {
    lines.push(`> **${manifest.channel.toUpperCase()}** release — not recommended for production use.`);
    lines.push('');
  }

  // Group commits by type
  const groups: Record<string, { description: string; sha: string }[]> = {};
  const breaking: string[] = [];

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit.message);
    if (parsed.breaking) {
      breaking.push(`- ${parsed.description} (${commit.sha.slice(0, 7)})`);
    }
    const key = parsed.type;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ description: parsed.description, sha: commit.sha });
  }

  if (breaking.length > 0) {
    lines.push('## ⚠ Breaking Changes');
    lines.push('');
    lines.push(...breaking);
    lines.push('');
  }

  const headings: Record<string, string> = {
    feat: '## Features',
    fix: '## Bug Fixes',
    perf: '## Performance',
    refactor: '## Refactoring',
    docs: '## Documentation',
    chore: '## Chores',
    test: '## Tests',
    ci: '## CI',
  };

  for (const [type, heading] of Object.entries(headings)) {
    const items = groups[type];
    if (!items || items.length === 0) continue;
    lines.push(heading);
    lines.push('');
    for (const item of items) {
      lines.push(`- ${item.description} (${item.sha.slice(0, 7)})`);
    }
    lines.push('');
  }

  // Artifacts section
  if (manifest.artifacts.length > 0) {
    lines.push('## Artifacts');
    lines.push('');
    lines.push('| Name | Size | SHA-256 |');
    lines.push('|------|------|---------|');
    for (const a of manifest.artifacts) {
      const sizeKb = (a.size / 1024).toFixed(1);
      lines.push(`| ${a.name} | ${sizeKb} KB | \`${a.sha256.slice(0, 12)}…\` |`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ============================================================================
// Release checklist
// ============================================================================

/**
 * Get the release checklist with default items.
 * Each item's check function can be evaluated to determine pass/fail.
 */
export function getReleaseChecklist(manifest?: ReleaseManifest): ReleaseChecklistItem[] {
  const items: ReleaseChecklistItem[] = [
    {
      name: 'Version is valid semver',
      check: () => manifest ? SEMVER_RE.test(manifest.version) : false,
      required: true,
      status: 'skip',
    },
    {
      name: 'Channel is set',
      check: () => manifest ? !!manifest.channel : false,
      required: true,
      status: 'skip',
    },
    {
      name: 'Timestamp is present',
      check: () => manifest ? !!manifest.timestamp && !isNaN(Date.parse(manifest.timestamp)) : false,
      required: true,
      status: 'skip',
    },
    {
      name: 'At least one artifact',
      check: () => manifest ? manifest.artifacts.length > 0 : false,
      required: false,
      status: 'skip',
    },
    {
      name: 'Changelog is non-empty',
      check: () => manifest ? !!manifest.changelog : false,
      required: false,
      status: 'skip',
    },
    {
      name: 'All artifact hashes are valid',
      check: () => {
        if (!manifest) return false;
        return manifest.artifacts.every((a) => /^[a-f0-9]{64}$/.test(a.sha256));
      },
      required: true,
      status: 'skip',
    },
    {
      name: 'No duplicate artifact names',
      check: () => {
        if (!manifest) return false;
        const names = manifest.artifacts.map((a) => a.name);
        return new Set(names).size === names.length;
      },
      required: true,
      status: 'skip',
    },
    {
      name: 'Version matches channel',
      check: () => {
        if (!manifest) return false;
        if (manifest.channel === 'stable') return !manifest.version.includes('-');
        return manifest.version.includes('-');
      },
      required: false,
      status: 'skip',
    },
  ];

  // Evaluate checks
  for (const item of items) {
    try {
      item.status = item.check() ? 'pass' : 'fail';
    } catch {
      item.status = 'fail';
    }
  }

  return items;
}
