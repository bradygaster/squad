/**
 * CLI Module Tests — Upgrade & Copilot Install
 * (M4-4, M4-5, M4-6 — Issues #103, #104, #106)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

import {
  parseVersion,
  compareVersions,
  isNewer,
  checkForUpdate,
  performUpgrade,
  getLatestVersion,
  upgradeSDK,
  setVersionFetcher,
  setPackageJsonReader,
  setPackageJsonWriter,
} from '@bradygaster/squad-cli/upgrade';
import type {
  UpdateInfo,
  UpgradeOptions,
  SDKUpgradeOptions,
  ReleaseChannel,
} from '@bradygaster/squad-cli/upgrade';
import { MigrationRegistry } from '@bradygaster/squad-sdk/config';
import {
  detectCopilotEnvironment,
  getInstallInstructions,
  installFromCopilot,
} from '@bradygaster/squad-cli/copilot-install';
import type {
  CopilotEnvironment,
  InstallConfig,
  EnvironmentIndicators,
} from '@bradygaster/squad-cli/copilot-install';

// ============================================================================
// Upgrade — version parsing & comparison
// ============================================================================

describe('parseVersion', () => {
  it('parses a simple semver string', () => {
    const v = parseVersion('1.2.3');
    expect(v.major).toBe(1);
    expect(v.minor).toBe(2);
    expect(v.patch).toBe(3);
    expect(v.prerelease).toBe('');
  });

  it('parses version with prerelease suffix', () => {
    const v = parseVersion('0.6.0-alpha.0');
    expect(v.major).toBe(0);
    expect(v.minor).toBe(6);
    expect(v.patch).toBe(0);
    expect(v.prerelease).toBe('alpha.0');
  });

  it('throws on invalid version', () => {
    expect(() => parseVersion('not-a-version')).toThrow('Invalid version');
  });

  it('throws on partial version', () => {
    expect(() => parseVersion('1.2')).toThrow('Invalid version');
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('compares major versions', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('compares minor versions', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0);
  });

  it('compares patch versions', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0);
  });

  it('release > prerelease for same version', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0);
  });

  it('compares prerelease strings lexicographically', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0-alpha.1')).toBeGreaterThan(0);
  });
});

describe('isNewer', () => {
  it('returns true when candidate is newer', () => {
    expect(isNewer('1.0.0', '1.0.1')).toBe(true);
  });

  it('returns false when candidate is older', () => {
    expect(isNewer('1.0.1', '1.0.0')).toBe(false);
  });

  it('returns false when versions are equal', () => {
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
  });
});

// ============================================================================
// Upgrade — checkForUpdate / performUpgrade
// ============================================================================

describe('checkForUpdate', () => {
  beforeEach(() => {
    setVersionFetcher(async (_ch: ReleaseChannel) => '2.0.0');
  });

  it('returns UpdateInfo when newer version available', async () => {
    const info = await checkForUpdate('1.0.0');
    expect(info).not.toBeNull();
    expect(info!.newVersion).toBe('2.0.0');
    expect(info!.releaseUrl).toContain('v2.0.0');
  });

  it('returns null when already on latest', async () => {
    const info = await checkForUpdate('2.0.0');
    expect(info).toBeNull();
  });

  it('returns null when on newer version', async () => {
    const info = await checkForUpdate('3.0.0');
    expect(info).toBeNull();
  });
});

describe('getLatestVersion', () => {
  it('delegates to version fetcher', async () => {
    setVersionFetcher(async (ch) => (ch === 'preview' ? '2.1.0-beta.1' : '2.0.0'));
    expect(await getLatestVersion('preview')).toBe('2.1.0-beta.1');
    expect(await getLatestVersion('stable')).toBe('2.0.0');
  });
});

describe('performUpgrade', () => {
  const info: UpdateInfo = {
    newVersion: '2.0.0',
    releaseUrl: 'https://example.com',
    changelog: 'stuff',
  };

  it('succeeds for a valid upgrade', async () => {
    const result = await performUpgrade(info, '1.0.0');
    expect(result.success).toBe(true);
    expect(result.fromVersion).toBe('1.0.0');
    expect(result.toVersion).toBe('2.0.0');
  });

  it('returns dry-run result', async () => {
    const result = await performUpgrade(info, '1.0.0', { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.changes[0]).toContain('dry-run');
  });

  it('refuses upgrade when already on latest unless forced', async () => {
    const result = await performUpgrade(info, '2.0.0');
    expect(result.success).toBe(false);
  });

  it('forces upgrade when force option is set', async () => {
    const result = await performUpgrade(info, '2.0.0', { force: true });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// SDK upgrade (--sdk flag)
// ============================================================================

describe('upgradeSDK', () => {
  beforeEach(() => {
    setVersionFetcher(async () => '2.0.0');
    setPackageJsonReader(async () => ({
      version: '1.0.0',
      dependencies: { '@bradygaster/squad': '^1.0.0' },
    }));
    setPackageJsonWriter(async () => {});
  });

  it('upgrades SDK dependency when newer version available', async () => {
    const result = await upgradeSDK('/fake');
    expect(result.success).toBe(true);
    expect(result.fromVersion).toBe('1.0.0');
    expect(result.toVersion).toBe('2.0.0');
  });

  it('reports already on latest', async () => {
    setVersionFetcher(async () => '1.0.0');
    const result = await upgradeSDK('/fake');
    expect(result.success).toBe(true);
    expect(result.changes[0]).toContain('already on latest');
  });

  it('handles missing SDK dependency', async () => {
    setPackageJsonReader(async () => ({ version: '1.0.0', dependencies: {} }));
    const result = await upgradeSDK('/fake');
    expect(result.success).toBe(false);
    expect(result.changes[0]).toContain('not found');
  });

  it('runs config migrations when registry provided', async () => {
    const registry = new MigrationRegistry();
    registry.register({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      migrate: (c) => ({ ...c, migrated: true }),
      description: 'Upgrade config schema v1→v2',
    });

    const result = await upgradeSDK('/fake', { migrationRegistry: registry });
    expect(result.migrationSteps).toContain('Upgrade config schema v1→v2');
  });

  it('dry-run does not call writer', async () => {
    let written = false;
    setPackageJsonWriter(async () => { written = true; });
    await upgradeSDK('/fake', { dryRun: true });
    expect(written).toBe(false);
  });

  it('force upgrades even when on latest', async () => {
    setVersionFetcher(async () => '1.0.0');
    const result = await upgradeSDK('/fake', { force: true });
    expect(result.success).toBe(true);
    expect(result.toVersion).toBe('1.0.0');
  });
});

// ============================================================================
// Copilot Install — environment detection
// ============================================================================

describe('detectCopilotEnvironment', () => {
  it('detects vscode via VSCODE_PID', () => {
    const ind: EnvironmentIndicators = { env: { VSCODE_PID: '1234' }, argv: [] };
    expect(detectCopilotEnvironment(ind)).toBe('vscode');
  });

  it('detects vscode via VSCODE_IPC_HOOK', () => {
    const ind: EnvironmentIndicators = { env: { VSCODE_IPC_HOOK: '/tmp/x' }, argv: [] };
    expect(detectCopilotEnvironment(ind)).toBe('vscode');
  });

  it('detects web via CODESPACES', () => {
    const ind: EnvironmentIndicators = { env: { CODESPACES: 'true' }, argv: [] };
    expect(detectCopilotEnvironment(ind)).toBe('web');
  });

  it('detects web via GITHUB_CODESPACE_TOKEN', () => {
    const ind: EnvironmentIndicators = { env: { GITHUB_CODESPACE_TOKEN: 'tok' }, argv: [] };
    expect(detectCopilotEnvironment(ind)).toBe('web');
  });

  it('detects cli via COPILOT_CLI env', () => {
    const ind: EnvironmentIndicators = { env: { COPILOT_CLI: '1' }, argv: [] };
    expect(detectCopilotEnvironment(ind)).toBe('cli');
  });

  it('detects cli via --copilot-cli argv', () => {
    const ind: EnvironmentIndicators = { env: {}, argv: ['node', 'squad', '--copilot-cli'] };
    expect(detectCopilotEnvironment(ind)).toBe('cli');
  });

  it('returns unknown when no indicators match', () => {
    const ind: EnvironmentIndicators = { env: {}, argv: [] };
    expect(detectCopilotEnvironment(ind)).toBe('unknown');
  });
});

// ============================================================================
// Copilot Install — getInstallInstructions
// ============================================================================

describe('getInstallInstructions', () => {
  it('returns cli-specific steps', () => {
    const steps = getInstallInstructions('cli');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some((s) => s.command?.includes('npm install -g'))).toBe(true);
  });

  it('returns vscode-specific steps', () => {
    const steps = getInstallInstructions('vscode');
    expect(steps.some((s) => s.description.toLowerCase().includes('vs code'))).toBe(true);
  });

  it('returns web-specific steps', () => {
    const steps = getInstallInstructions('web');
    expect(steps.some((s) => s.description.toLowerCase().includes('codespace'))).toBe(true);
  });

  it('returns generic steps for unknown', () => {
    const steps = getInstallInstructions('unknown');
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Copilot Install — installFromCopilot
// ============================================================================

let INSTALL_TEST_ROOT: string;

describe('installFromCopilot', () => {
  beforeEach(async () => {
    INSTALL_TEST_ROOT = await mkdtemp(join(tmpdir(), 'squad-copilot-install-'));
  });

  afterEach(async () => {
    if (existsSync(INSTALL_TEST_ROOT)) {
      await rm(INSTALL_TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('creates scaffolding for cli environment', async () => {
    const result = await installFromCopilot('cli', INSTALL_TEST_ROOT, {
      projectName: 'test-proj',
      agents: ['lead'],
    });
    expect(result.success).toBe(true);
    expect(result.environment).toBe('cli');
    expect(result.createdFiles.length).toBeGreaterThan(0);
  });

  it('creates scaffolding for vscode environment', async () => {
    const result = await installFromCopilot('vscode', INSTALL_TEST_ROOT, {
      projectName: 'vscode-proj',
      agents: ['lead', 'developer'],
    });
    expect(result.success).toBe(true);
    expect(result.createdFiles.length).toBeGreaterThan(0);
  });

  it('uses json config for web environment', async () => {
    const result = await installFromCopilot('web', INSTALL_TEST_ROOT, {
      projectName: 'web-proj',
    });
    expect(result.success).toBe(true);
    // Default for web is json
    const hasJson = result.createdFiles.some((f) => f.endsWith('.json'));
    expect(hasJson).toBe(true);
  });

  it('uses defaults when no config provided', async () => {
    const result = await installFromCopilot('unknown', INSTALL_TEST_ROOT);
    expect(result.success).toBe(true);
    expect(result.createdFiles.length).toBeGreaterThan(0);
  });

  it('returns failure with message on error', async () => {
    // non-writable dir would fail, but simpler: pass empty agents which initSquad rejects
    const result = await installFromCopilot('cli', INSTALL_TEST_ROOT, {
      projectName: 'fail-proj',
      agents: [],
    });
    expect(result.success).toBe(false);
    expect(result.instructions[0]).toContain('failed');
  });
});
