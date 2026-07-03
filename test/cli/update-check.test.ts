/**
 * `squad update-check` — cached update status for tooling (#1170)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../packages/squad-cli/src/cli/self-update.js', () => ({
  getCachePath: vi.fn(),
  fetchLatestVersion: vi.fn(),
  writeCache: vi.fn(),
}));

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as selfUpdate from '../../packages/squad-cli/src/cli/self-update.js';
import {
  detectChannel,
  formatCacheAge,
  runUpdateCheck,
  runUpdateCheckCommand,
} from '../../packages/squad-cli/src/cli/commands/update-check.js';

describe('detectChannel()', () => {
  it('returns stable for a clean release version', () => {
    expect(detectChannel('0.11.0')).toBe('stable');
  });

  it('returns insider for an insider prerelease', () => {
    expect(detectChannel('0.11.0-insider.3')).toBe('insider');
  });

  it('returns preview for a preview prerelease', () => {
    expect(detectChannel('0.11.0-preview.1')).toBe('preview');
  });

  it('returns preview for a bare preview tag with no iteration number', () => {
    expect(detectChannel('0.11.0-preview')).toBe('preview');
  });

  it('falls back to stable for an unrecognized prerelease tag', () => {
    expect(detectChannel('0.11.0-build.1')).toBe('stable');
  });
});

describe('formatCacheAge()', () => {
  it('formats a zero duration', () => {
    expect(formatCacheAge(0)).toBe('PT0S');
  });

  it('formats seconds only', () => {
    expect(formatCacheAge(45_000)).toBe('PT45S');
  });

  it('formats minutes only', () => {
    expect(formatCacheAge(15 * 60 * 1000)).toBe('PT15M');
  });

  it('formats hours and minutes together', () => {
    expect(formatCacheAge(2 * 3600 * 1000 + 15 * 60 * 1000)).toBe('PT2H15M');
  });

  it('formats an exact hour with no trailing minutes/seconds', () => {
    expect(formatCacheAge(3600 * 1000)).toBe('PT1H');
  });
});

describe('runUpdateCheck()', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'squad-update-check-'));
  const cachePath = join(cacheDir, 'update-check.json');

  beforeEach(() => {
    vi.mocked(selfUpdate.getCachePath).mockReturnValue(cachePath);
    vi.mocked(selfUpdate.fetchLatestVersion).mockReset();
    vi.mocked(selfUpdate.writeCache).mockReset();
  });

  afterEach(() => {
    try { rmSync(cachePath); } catch { /* no cache file written this test */ }
  });

  it('reports no cache without making a network call', async () => {
    const result = await runUpdateCheck('0.11.0');
    expect(result).toEqual({
      current: '0.11.0',
      channel: 'stable',
      latest: null,
      updateAvailable: false,
      cacheAge: null,
      checkedAt: null,
    });
    expect(selfUpdate.fetchLatestVersion).not.toHaveBeenCalled();
  });

  it('reads an existing cache and reports an available update', async () => {
    const checkedAt = Date.now() - 5 * 60 * 1000;
    writeFileSync(cachePath, JSON.stringify({ latestVersion: '0.12.0', checkedAt }));

    const result = await runUpdateCheck('0.11.0');

    expect(result.latest).toBe('0.12.0');
    expect(result.updateAvailable).toBe(true);
    expect(result.cacheAge).toBe('PT5M');
    expect(result.checkedAt).toBe(new Date(checkedAt).toISOString());
    expect(selfUpdate.fetchLatestVersion).not.toHaveBeenCalled();
  });

  it('reports updateAvailable: false when already on the cached latest version', async () => {
    writeFileSync(cachePath, JSON.stringify({ latestVersion: '0.11.0', checkedAt: Date.now() }));

    const result = await runUpdateCheck('0.11.0');

    expect(result.updateAvailable).toBe(false);
  });

  it('bypasses a stale cache and fetches fresh data with refresh: true', async () => {
    writeFileSync(cachePath, JSON.stringify({ latestVersion: '0.10.0', checkedAt: Date.now() - 999_999 }));
    vi.mocked(selfUpdate.fetchLatestVersion).mockResolvedValue('0.13.0');

    const result = await runUpdateCheck('0.11.0', { refresh: true });

    expect(selfUpdate.fetchLatestVersion).toHaveBeenCalledTimes(1);
    expect(result.latest).toBe('0.13.0');
    expect(result.updateAvailable).toBe(true);
    expect(result.cacheAge).toBe('PT0S');
    expect(selfUpdate.writeCache).toHaveBeenCalledWith(
      expect.objectContaining({ latestVersion: '0.13.0' }),
    );
  });

  it('returns an error result when refresh cannot reach the registry', async () => {
    vi.mocked(selfUpdate.fetchLatestVersion).mockResolvedValue(null);

    const result = await runUpdateCheck('0.11.0', { refresh: true });

    expect(result.error).toBeTruthy();
    expect(result.latest).toBeNull();
    expect(selfUpdate.writeCache).not.toHaveBeenCalled();
  });
});

describe('runUpdateCheckCommand()', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'squad-update-check-cmd-'));
  const cachePath = join(cacheDir, 'update-check.json');
  const originalEnv = process.env.SQUAD_NO_UPDATE_CHECK;

  beforeEach(() => {
    vi.mocked(selfUpdate.getCachePath).mockReturnValue(cachePath);
    vi.mocked(selfUpdate.fetchLatestVersion).mockReset();
    vi.mocked(selfUpdate.writeCache).mockReset();
  });

  afterEach(() => {
    try { rmSync(cachePath); } catch { /* no cache file written this test */ }
    if (originalEnv === undefined) delete process.env.SQUAD_NO_UPDATE_CHECK;
    else process.env.SQUAD_NO_UPDATE_CHECK = originalEnv;
  });

  it('exits 0 and prints nothing when SQUAD_NO_UPDATE_CHECK=1 (text mode)', async () => {
    process.env.SQUAD_NO_UPDATE_CHECK = '1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runUpdateCheckCommand([]);

    expect(exitCode).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(selfUpdate.fetchLatestVersion).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('exits 0 and prints an empty JSON object when SQUAD_NO_UPDATE_CHECK=1 (--json)', async () => {
    process.env.SQUAD_NO_UPDATE_CHECK = '1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runUpdateCheckCommand(['--json']);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('{}');
    logSpy.mockRestore();
  });

  it('exits 1 when a cached update is available', async () => {
    writeFileSync(cachePath, JSON.stringify({ latestVersion: '99.0.0', checkedAt: Date.now() }));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runUpdateCheckCommand([]);

    expect(exitCode).toBe(1);
    vi.restoreAllMocks();
  });

  it('exits 0 when there is no cache yet', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runUpdateCheckCommand([]);

    expect(exitCode).toBe(0);
    vi.restoreAllMocks();
  });

  it('exits 2 when --refresh cannot reach the registry', async () => {
    vi.mocked(selfUpdate.fetchLatestVersion).mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await runUpdateCheckCommand(['--refresh']);

    expect(exitCode).toBe(2);
    vi.restoreAllMocks();
  });

  it('emits parseable JSON matching the documented schema with --json', async () => {
    writeFileSync(cachePath, JSON.stringify({ latestVersion: '0.12.0', checkedAt: Date.now() }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runUpdateCheckCommand(['--json']);

    const printed = logSpy.mock.calls.map((call) => call[0]).join('');
    const parsed = JSON.parse(printed);
    expect(parsed).toMatchObject({
      current: expect.any(String),
      channel: expect.stringMatching(/^(stable|preview|insider)$/),
      latest: '0.12.0',
      updateAvailable: expect.any(Boolean),
      cacheAge: expect.any(String),
      checkedAt: expect.any(String),
    });
    logSpy.mockRestore();
  });
});
