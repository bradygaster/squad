/**
 * Tests for the mcp-spec helper.
 *
 * Iter-7 simplified the resolver to 2 tiers:
 *   1. Pinned version published on npm  → npx -y <pkg>@<version>
 *   2. Anything else                     → npx -y <pkg>@insider
 *
 * The iter-6 local-install path and the hard-error fallback were deleted;
 * smoke data-30/data-32 confirmed `@insider` is always reachable in practice
 * and tier-3 never fired.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock(
  '../packages/squad-cli/src/cli/core/npm-registry.js',
  () => ({
    isSquadCliVersionPublished: vi.fn(),
  }),
);

import {
  resolveSquadStateMcpSpec,
  detectStandaloneLauncher,
  STANDALONE_HOME_ENV,
  _resetMcpSpecCache,
} from '../packages/squad-cli/src/cli/core/mcp-spec.js';
import { describeMcpSpec } from '../packages/squad-cli/src/cli/core/upgrade.js';
import { isSquadCliVersionPublished } from '../packages/squad-cli/src/cli/core/npm-registry.js';

const mockIsPublished = vi.mocked(isSquadCliVersionPublished);

describe('resolveSquadStateMcpSpec (iter-7: 2-tier resolver)', () => {
  beforeEach(() => {
    mockIsPublished.mockReset();
    _resetMcpSpecCache();
  });

  it('returns a pinned npx spec when the version is published on npm', async () => {
    const spec = await resolveSquadStateMcpSpec('0.9.6-preview.42', {
      publishedCheck: async () => true,
    });
    expect(spec.source).toBe('pinned');
    expect(spec.command).toBe('npx');
    expect(spec.args).toEqual([
      '-y',
      '@bradygaster/squad-cli@0.9.6-preview.42',
      'state-mcp',
    ]);
  });

  it('falls back to @insider when the version is NOT published', async () => {
    const spec = await resolveSquadStateMcpSpec('0.9.6-preview.99999', {
      publishedCheck: async () => false,
    });
    expect(spec.source).toBe('insider');
    expect(spec.command).toBe('npx');
    expect(spec.args).toEqual(['-y', '@bradygaster/squad-cli@insider', 'state-mcp']);
  });

  it('short-circuits the registry check for the placeholder 0.0.0 version (returns @insider)', async () => {
    const spec = await resolveSquadStateMcpSpec('0.0.0', {
      publishedCheck: async () => {
        throw new Error('publishedCheck should not be called for 0.0.0');
      },
    });
    expect(spec.source).toBe('insider');
    expect(spec.args[1]).toBe('@bradygaster/squad-cli@insider');
  });

  it('short-circuits the registry check for empty version (returns @insider)', async () => {
    const spec = await resolveSquadStateMcpSpec('', {
      publishedCheck: async () => {
        throw new Error('publishedCheck should not be called for empty version');
      },
    });
    expect(spec.source).toBe('insider');
  });

  it('never throws — always returns a usable spec (no hard-error tier in iter-7)', async () => {
    const spec = await resolveSquadStateMcpSpec('0.9.6-preview.99999', {
      publishedCheck: async () => false,
    });
    expect(spec).toBeDefined();
    expect(spec.command).toBe('npx');
  });

  it('short-circuits for versions with build metadata (+ suffix) — returns @insider (#1204)', async () => {
    const spec = await resolveSquadStateMcpSpec('0.10.0+local.1234', {
      publishedCheck: async () => {
        throw new Error('publishedCheck should not be called for build metadata version');
      },
    });
    expect(spec.source).toBe('insider');
    expect(spec.args[1]).toBe('@bradygaster/squad-cli@insider');
  });

  it('uses the real npm-registry probe by default when publishedCheck is not injected', async () => {
    mockIsPublished.mockResolvedValue(false);
    const spec = await resolveSquadStateMcpSpec('0.9.6-preview.99999');
    expect(mockIsPublished).toHaveBeenCalledWith('0.9.6-preview.99999');
    expect(spec.source).toBe('insider');
  });
});

describe('resolveSquadStateMcpSpec — standalone bundle tier (#1593)', () => {
  beforeEach(() => {
    mockIsPublished.mockReset();
    _resetMcpSpecCache();
  });

  it('spawns the bundle launcher by absolute path instead of npx', async () => {
    const launcher = '/opt/squad/squad';
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => launcher,
    });
    expect(spec.source).toBe('standalone');
    expect(spec.command).toBe(launcher);
    expect(spec.args).toEqual(['state-mcp']);
  });

  it('never touches the npm registry when running from a bundle', async () => {
    // The whole point: a machine installed from a bundle may have no route to
    // registry.npmjs.org at all, so the probe must not fire.
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => '/opt/squad/squad',
      publishedCheck: async () => {
        throw new Error('publishedCheck must not run in standalone mode');
      },
    });
    expect(spec.source).toBe('standalone');
    expect(mockIsPublished).not.toHaveBeenCalled();
  });

  it('takes precedence over a published pinned version', async () => {
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => '/opt/squad/squad',
      publishedCheck: async () => true,
    });
    expect(spec.source).toBe('standalone');
    expect(spec.command).not.toBe('npx');
  });

  it('falls through to the npx tiers when not running from a bundle', async () => {
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => null,
      publishedCheck: async () => true,
    });
    expect(spec.source).toBe('pinned');
    expect(spec.command).toBe('npx');
  });

  it('emits a spec Copilot can spawn without PATH or env help', async () => {
    // Copilot launches the MCP server in its own environment, so the written
    // command has to be self-sufficient — no bare `squad`, no env expansion.
    const spec = await resolveSquadStateMcpSpec('0.11.0', {
      standaloneCheck: () => '/opt/squad/squad',
    });
    expect(path.isAbsolute(spec.command)).toBe(true);
    expect(spec.command).not.toContain('$');
    expect(spec.command).not.toContain('%');
  });
});

describe('detectStandaloneLauncher (#1593)', () => {
  const ORIGINAL = process.env[STANDALONE_HOME_ENV];

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env[STANDALONE_HOME_ENV];
    else process.env[STANDALONE_HOME_ENV] = ORIGINAL;
  });

  it('returns null when the env var is unset (normal npm install)', () => {
    delete process.env[STANDALONE_HOME_ENV];
    expect(detectStandaloneLauncher()).toBeNull();
  });

  it('returns null when the env var points at a directory with no launcher', () => {
    process.env[STANDALONE_HOME_ENV] = mkdtempSync(path.join(tmpdir(), 'squad-nolauncher-'));
    expect(detectStandaloneLauncher()).toBeNull();
  });

  it('finds the launcher when the env var points at a real bundle', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'squad-bundle-'));
    const name = process.platform === 'win32' ? 'squad.cmd' : 'squad';
    writeFileSync(path.join(dir, name), '#!/bin/sh\n');
    process.env[STANDALONE_HOME_ENV] = dir;
    expect(detectStandaloneLauncher()).toBe(path.join(dir, name));
  });
});

describe('describeMcpSpec — standalone specs (#1593)', () => {
  it('reports the launcher path rather than <unknown>', () => {
    // Standalone specs have no package name at args[1]; the describer must
    // not fall through to the npx-shaped branch.
    const described = describeMcpSpec({
      command: '/opt/squad/squad',
      args: ['state-mcp'],
      source: 'standalone',
    });
    expect(described).toContain('/opt/squad/squad');
    expect(described).not.toContain('<unknown>');
  });
});

describe('init.ts uses resolveSquadStateMcpSpec (asymmetry fix)', () => {
  // Source-level architectural check: init.ts must reference the shared
  // resolver to keep the npm-registry fallback consistent with upgrade.ts.
  it('packages/squad-cli/src/cli/core/init.ts imports and calls resolveSquadStateMcpSpec', () => {
    const initPath = path.join(
      process.cwd(),
      'packages',
      'squad-cli',
      'src',
      'cli',
      'core',
      'init.ts',
    );
    const src = readFileSync(initPath, 'utf-8');
    expect(src).toMatch(/resolveSquadStateMcpSpec/);
    expect(src).toMatch(/from ['"]\.\/mcp-spec\.js['"]/);
  });

  it('upgrade.ts re-exports resolveSquadStateMcpSpec from mcp-spec (compat)', () => {
    const upgradePath = path.join(
      process.cwd(),
      'packages',
      'squad-cli',
      'src',
      'cli',
      'core',
      'upgrade.ts',
    );
    const src = readFileSync(upgradePath, 'utf-8');
    expect(src).toMatch(/from ['"]\.\/mcp-spec\.js['"]/);
  });
});

describe('isLocalOrUnpublishedVersion guard (#1204)', () => {
  // Import the guard function directly
  let isLocalOrUnpublishedVersion: (version: string) => boolean;

  beforeEach(async () => {
    const mod = await import('../packages/squad-cli/src/cli/core/upgrade.js');
    isLocalOrUnpublishedVersion = mod.isLocalOrUnpublishedVersion;
  });

  it('returns true for empty string', () => {
    expect(isLocalOrUnpublishedVersion('')).toBe(true);
  });

  it('returns true for 0.0.0 placeholder', () => {
    expect(isLocalOrUnpublishedVersion('0.0.0')).toBe(true);
  });

  it('returns true for 0.0.0-development sentinel', () => {
    expect(isLocalOrUnpublishedVersion('0.0.0-development')).toBe(true);
  });

  it('returns true for versions with + build metadata (local builds)', () => {
    expect(isLocalOrUnpublishedVersion('0.10.0+local.1234')).toBe(true);
    expect(isLocalOrUnpublishedVersion('1.0.0+build.42')).toBe(true);
  });

  it('returns false for normal published versions', () => {
    expect(isLocalOrUnpublishedVersion('0.10.0')).toBe(false);
    expect(isLocalOrUnpublishedVersion('0.9.6-preview.42')).toBe(false);
    expect(isLocalOrUnpublishedVersion('1.0.0-rc.1')).toBe(false);
  });
});
