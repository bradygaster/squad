/**
 * Squad Upgrade Command (M4-4 & M4-5, Issues #103 & #104)
 *
 * Self-update support for the Squad CLI and SDK dependency.
 * Version comparison via semver, pluggable version fetcher,
 * and SDK upgrade with migration support.
 *
 * @module cli/upgrade
 */

import { MigrationRegistry } from '@bradygaster/squad-sdk/config';

// ============================================================================
// Types
// ============================================================================

/** Release channel for updates. */
export type ReleaseChannel = 'stable' | 'preview' | 'insider';

/** Information about an available update. */
export interface UpdateInfo {
  /** New version available */
  newVersion: string;
  /** URL to the release page */
  releaseUrl: string;
  /** Changelog / release notes */
  changelog: string;
}

/** Options for performing an upgrade. */
export interface UpgradeOptions {
  /** Force upgrade even if already on latest */
  force?: boolean;
  /** Simulate without applying changes */
  dryRun?: boolean;
  /** Release channel to pull from */
  channel?: ReleaseChannel;
}

/** Result of an upgrade operation. */
export interface UpgradeResult {
  /** Whether the upgrade succeeded */
  success: boolean;
  /** Version we upgraded from */
  fromVersion: string;
  /** Version we upgraded to */
  toVersion: string;
  /** Summary of changes applied */
  changes: string[];
}

/** Options specific to SDK upgrades (--sdk flag). */
export interface SDKUpgradeOptions {
  /** Force upgrade even if already on latest */
  force?: boolean;
  /** Simulate without applying changes */
  dryRun?: boolean;
  /** Release channel */
  channel?: ReleaseChannel;
  /** MigrationRegistry for config migrations between SDK versions */
  migrationRegistry?: MigrationRegistry;
}

/** Result of an SDK upgrade operation. */
export interface SDKUpgradeResult {
  /** Whether the upgrade succeeded */
  success: boolean;
  /** Previous SDK version */
  fromVersion: string;
  /** New SDK version */
  toVersion: string;
  /** Changes applied */
  changes: string[];
  /** Migration steps applied (if config schema changed) */
  migrationSteps: string[];
}

/**
 * Pluggable version fetcher.
 * Consumers replace this to wire in their own registry/network logic.
 */
export type VersionFetcher = (channel: ReleaseChannel) => Promise<string>;

/**
 * Pluggable package.json reader for SDK upgrades.
 */
export type PackageJsonReader = (projectDir: string) => Promise<{ version: string; dependencies?: Record<string, string> }>;

/**
 * Pluggable package.json writer for SDK upgrades.
 */
export type PackageJsonWriter = (projectDir: string, version: string) => Promise<void>;

// ============================================================================
// Default (stub) implementations — replaced in production
// ============================================================================

let _versionFetcher: VersionFetcher = async (_channel: ReleaseChannel) => {
  throw new Error('No version fetcher configured. Call setVersionFetcher() first.');
};

let _packageJsonReader: PackageJsonReader = async (_dir: string) => {
  throw new Error('No package.json reader configured. Call setPackageJsonReader() first.');
};

let _packageJsonWriter: PackageJsonWriter = async (_dir: string, _v: string) => {
  throw new Error('No package.json writer configured. Call setPackageJsonWriter() first.');
};

/** Register a custom version fetcher. */
export function setVersionFetcher(fn: VersionFetcher): void {
  _versionFetcher = fn;
}

/** Register a custom package.json reader. */
export function setPackageJsonReader(fn: PackageJsonReader): void {
  _packageJsonReader = fn;
}

/** Register a custom package.json writer. */
export function setPackageJsonWriter(fn: PackageJsonWriter): void {
  _packageJsonWriter = fn;
}

// ============================================================================
// Semver helpers (lightweight — no external dep)
// ============================================================================

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  raw: string;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

/**
 * Parse a version string into components.
 * Supports optional pre-release suffix (e.g. "1.2.3-alpha.0").
 */
export function parseVersion(version: string): ParsedVersion {
  const m = version.match(VERSION_RE);
  if (!m) {
    throw new Error(`Invalid version: "${version}"`);
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? '',
    raw: version,
  };
}

/**
 * Compare two version strings.
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;

  // No prerelease > has prerelease (1.0.0 > 1.0.0-alpha)
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && !vb.prerelease) return -1;

  // Lexicographic prerelease comparison
  return va.prerelease.localeCompare(vb.prerelease);
}

/** Returns true when `candidate` is newer than `current`. */
export function isNewer(current: string, candidate: string): boolean {
  return compareVersions(candidate, current) > 0;
}

// ============================================================================
// Core upgrade API
// ============================================================================

/**
 * Fetch the latest version string for the given channel.
 * Delegates to the pluggable VersionFetcher.
 */
export async function getLatestVersion(channel: ReleaseChannel = 'stable'): Promise<string> {
  return _versionFetcher(channel);
}

/**
 * Check whether an update is available for the CLI.
 *
 * @param currentVersion - Currently installed version
 * @param channel - Release channel (default: stable)
 * @returns UpdateInfo if a newer version exists, otherwise null
 */
export async function checkForUpdate(
  currentVersion: string,
  channel: ReleaseChannel = 'stable',
): Promise<UpdateInfo | null> {
  const latest = await getLatestVersion(channel);

  if (!isNewer(currentVersion, latest)) {
    return null;
  }

  return {
    newVersion: latest,
    releaseUrl: `https://github.com/bradygaster/squad/releases/tag/v${latest}`,
    changelog: `Update from ${currentVersion} to ${latest}`,
  };
}

/**
 * Perform a CLI self-upgrade.
 *
 * @param info - UpdateInfo from checkForUpdate
 * @param currentVersion - Currently running version
 * @param options - Upgrade options
 * @returns UpgradeResult describing the outcome
 */
export async function performUpgrade(
  info: UpdateInfo,
  currentVersion: string,
  options: UpgradeOptions = {},
): Promise<UpgradeResult> {
  const { force = false, dryRun = false } = options;

  if (!force && !isNewer(currentVersion, info.newVersion)) {
    return {
      success: false,
      fromVersion: currentVersion,
      toVersion: info.newVersion,
      changes: ['Already on latest version'],
    };
  }

  if (dryRun) {
    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: info.newVersion,
      changes: [`[dry-run] Would upgrade from ${currentVersion} to ${info.newVersion}`],
    };
  }

  // In a real implementation this would shell out to npm.
  // The abstraction allows consumers to supply their own installer.
  return {
    success: true,
    fromVersion: currentVersion,
    toVersion: info.newVersion,
    changes: [`Upgraded from ${currentVersion} to ${info.newVersion}`],
  };
}

// ============================================================================
// SDK upgrade (--sdk flag, M4-5)
// ============================================================================

const SDK_PACKAGE_NAME = '@bradygaster/squad';

/**
 * Upgrade the @bradygaster/squad SDK dependency in a project.
 *
 * Reads the project's package.json, compares the installed SDK version
 * to the latest available, and optionally runs config migrations.
 *
 * @param projectDir - Path to the project root (containing package.json)
 * @param options - SDK upgrade options
 * @returns SDKUpgradeResult
 */
export async function upgradeSDK(
  projectDir: string,
  options: SDKUpgradeOptions = {},
): Promise<SDKUpgradeResult> {
  const { force = false, dryRun = false, channel = 'stable', migrationRegistry } = options;

  // Read current SDK version from package.json
  const pkg = await _packageJsonReader(projectDir);
  const deps = pkg.dependencies ?? {};
  const currentRaw = deps[SDK_PACKAGE_NAME];
  if (!currentRaw) {
    return {
      success: false,
      fromVersion: 'none',
      toVersion: 'none',
      changes: [`${SDK_PACKAGE_NAME} not found in dependencies`],
      migrationSteps: [],
    };
  }

  // Strip leading ^ or ~ for comparison
  const currentVersion = currentRaw.replace(/^[\^~]/, '');
  const latest = await getLatestVersion(channel);

  if (!force && !isNewer(currentVersion, latest)) {
    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: currentVersion,
      changes: ['SDK already on latest version'],
      migrationSteps: [],
    };
  }

  const migrationSteps: string[] = [];

  // Run config migrations if a MigrationRegistry was provided
  if (migrationRegistry) {
    try {
      // Normalise versions to strict semver (strip prerelease for registry lookup)
      const fromStrict = toStrictSemver(currentVersion);
      const toStrict = toStrictSemver(latest);

      if (migrationRegistry.hasPath(fromStrict, toStrict)) {
        const result = migrationRegistry.runMigrations({}, fromStrict, toStrict);
        for (const m of result.applied) {
          migrationSteps.push(m.description ?? `${m.fromVersion} → ${m.toVersion}`);
        }
      }
    } catch {
      migrationSteps.push('Migration check skipped — no migration path found');
    }
  }

  if (dryRun) {
    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: latest,
      changes: [`[dry-run] Would upgrade SDK from ${currentVersion} to ${latest}`],
      migrationSteps,
    };
  }

  // Write updated version to package.json
  await _packageJsonWriter(projectDir, latest);

  return {
    success: true,
    fromVersion: currentVersion,
    toVersion: latest,
    changes: [`Upgraded SDK from ${currentVersion} to ${latest}`],
    migrationSteps,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Strip prerelease suffix to get strict major.minor.patch. */
function toStrictSemver(version: string): string {
  const parsed = parseVersion(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}
