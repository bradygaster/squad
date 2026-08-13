/**
 * `squad update-check` — expose cached CLI update status for tooling.
 *
 * Reads the update-check cache maintained by self-update.ts and reports it
 * as human-readable text or structured JSON (--json). This gives editor
 * extensions, coordinator instructions, and CI scripts a stable interface
 * to query update status without replicating OS-specific cache path
 * resolution or TTL freshness checks themselves.
 *
 * @module cli/commands/update-check
 */

import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { type CacheData, getCachePath, fetchLatestVersion, writeCache } from '../self-update.js';
import { parseVersion, isNewer, type ReleaseChannel } from '../upgrade.js';
import { getPackageVersion } from '../core/version.js';

const storage = new FSStorageProvider();

export interface UpdateCheckResult {
  current: string;
  channel: ReleaseChannel;
  latest: string | null;
  updateAvailable: boolean;
  cacheAge: string | null;
  checkedAt: string | null;
  error?: string;
}

/** Detect release channel from a version's prerelease tag (e.g. "insider.2" → "insider"). */
export function detectChannel(version: string): ReleaseChannel {
  const { prerelease } = parseVersion(version);
  if (prerelease.startsWith('insider')) return 'insider';
  if (prerelease.startsWith('preview')) return 'preview';
  return 'stable';
}

/** Format a millisecond duration as an ISO 8601 duration string (e.g. "PT2H15M"). */
export function formatCacheAge(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let result = 'PT';
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0) result += `${minutes}M`;
  if (seconds > 0 || result === 'PT') result += `${seconds}S`;
  return result;
}

/** Read the raw update-check cache, regardless of TTL freshness. */
function readRawCache(): CacheData | null {
  try {
    const raw = storage.readSync(getCachePath());
    if (!raw) return null;
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

/**
 * Build the update-check result for the given current version.
 *
 * Without `refresh`, only reads the existing cache — never makes a network
 * call. With `refresh`, always re-fetches from the npm registry and updates
 * the cache.
 */
export async function runUpdateCheck(
  currentVersion: string,
  options: { refresh?: boolean } = {},
): Promise<UpdateCheckResult> {
  const channel = detectChannel(currentVersion);

  if (options.refresh) {
    const latest = await fetchLatestVersion();
    if (!latest) {
      return {
        current: currentVersion,
        channel,
        latest: null,
        updateAvailable: false,
        cacheAge: null,
        checkedAt: null,
        error: 'Failed to reach the npm registry',
      };
    }
    const checkedAt = Date.now();
    writeCache({ latestVersion: latest, checkedAt });
    return {
      current: currentVersion,
      channel,
      latest,
      updateAvailable: isNewer(currentVersion, latest),
      cacheAge: formatCacheAge(0),
      checkedAt: new Date(checkedAt).toISOString(),
    };
  }

  const cached = readRawCache();
  if (!cached) {
    return {
      current: currentVersion,
      channel,
      latest: null,
      updateAvailable: false,
      cacheAge: null,
      checkedAt: null,
    };
  }

  return {
    current: currentVersion,
    channel,
    latest: cached.latestVersion,
    updateAvailable: isNewer(currentVersion, cached.latestVersion),
    cacheAge: formatCacheAge(Date.now() - cached.checkedAt),
    checkedAt: new Date(cached.checkedAt).toISOString(),
  };
}

/** Print the result in human-readable form. */
function printHuman(result: UpdateCheckResult): void {
  if (result.error) {
    console.error(`❌ ${result.error}`);
    return;
  }
  console.log(`Current: ${result.current} (${result.channel} channel)`);
  if (!result.latest) {
    console.log('No cached update status yet. Run `squad update-check --refresh` to check now.');
    return;
  }
  console.log(`Latest:  ${result.latest}`);
  if (result.updateAvailable) {
    console.log('Update available. Run `squad upgrade --self` to install.');
  } else {
    console.log('Up to date.');
  }
}

/**
 * CLI entry point for `squad update-check`.
 * @returns the process exit code: 0 (up to date / no cache yet),
 *   1 (update available), 2 (transport failure during --refresh).
 */
export async function runUpdateCheckCommand(args: string[]): Promise<number> {
  const json = args.includes('--json');

  // Respect the same opt-out as the background startup check.
  if (process.env.SQUAD_NO_UPDATE_CHECK === '1') {
    if (json) console.log('{}');
    return 0;
  }

  const refresh = args.includes('--refresh');
  const result = await runUpdateCheck(getPackageVersion(), { refresh });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (result.error) return 2;
  return result.updateAvailable ? 1 : 0;
}
