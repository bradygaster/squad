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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock(
  '../packages/squad-cli/src/cli/core/npm-registry.js',
  () => ({
    isSquadCliVersionPublished: vi.fn(),
  }),
);

import {
  resolveSquadStateMcpSpec,
  _resetMcpSpecCache,
} from '../packages/squad-cli/src/cli/core/mcp-spec.js';
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
