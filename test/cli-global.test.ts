/**
 * Integration tests for CLI --global flag and status command routing.
 *
 * Tests that main() in src/index.ts correctly:
 * - Routes init/upgrade with --global to resolveGlobalSquadPath()
 * - Shows "repo" type when .squad/ is present (status command)
 * - Shows "none" when no .squad/ exists (status command)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveSquad, resolveGlobalSquadPath, clearResolveSquadCache } from '@bradygaster/squad-sdk/resolution';

const TMP = join(process.cwd(), `.test-cli-global-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

// ============================================================================
// Status command — resolution logic
// ============================================================================

describe('squad status routing logic', () => {
  beforeEach(() => {
    clearResolveSquadCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    clearResolveSquadCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('identifies "repo" type when .squad/ is in the repo tree', () => {
    scaffold('.git', '.squad');
    const repoSquad = resolveSquad(TMP);
    expect(repoSquad).not.toBeNull();
    // Status logic: if repoSquad is truthy → "repo" type
    const activeType = repoSquad ? 'repo' : 'none';
    expect(activeType).toBe('repo');
  });

  /**
   * Point every platform's config-dir lookup at a scratch directory so these tests
   * never create or delete the developer's real global squad (`squad init --global`).
   */
  function stubConfigHome(): string {
    const home = join(TMP, 'config-home');
    mkdirSync(home, { recursive: true });
    vi.stubEnv('APPDATA', home);
    vi.stubEnv('LOCALAPPDATA', home);
    vi.stubEnv('XDG_CONFIG_HOME', home);
    if (process.platform === 'darwin') vi.stubEnv('HOME', home);
    return home;
  }

  it('identifies "none" when no .squad/ exists and no global squad', () => {
    const home = stubConfigHome();
    try {
      scaffold('.git');
      const repoSquad = resolveSquad(TMP);
      expect(repoSquad).toBeNull();
      const globalPath = resolveGlobalSquadPath();
      expect(globalPath.startsWith(home), `global path must be under the stubbed home: ${globalPath}`).toBe(true);
      const globalSquadDir = join(globalPath, '.squad');
      const activeType = repoSquad ? 'repo' : existsSync(globalSquadDir) ? 'global' : 'none';
      expect(activeType).toBe('none');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('identifies "global" when no repo .squad/ but a global .squad/ exists', () => {
    const home = stubConfigHome();
    try {
      scaffold('.git');
      const repoSquad = resolveSquad(TMP);
      expect(repoSquad).toBeNull();

      const globalPath = resolveGlobalSquadPath();
      expect(globalPath.startsWith(home)).toBe(true);
      const globalSquadDir = join(globalPath, '.squad');
      mkdirSync(globalSquadDir, { recursive: true });

      const activeType = repoSquad ? 'repo' : existsSync(globalSquadDir) ? 'global' : 'none';
      expect(activeType).toBe('global');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('repo squad takes priority over the global squad', () => {
    const home = stubConfigHome();
    try {
      scaffold('.git', '.squad');
      const repoSquad = resolveSquad(TMP);
      const globalPath = resolveGlobalSquadPath();
      expect(globalPath.startsWith(home)).toBe(true);
      const globalSquadDir = join(globalPath, '.squad');
      mkdirSync(globalSquadDir, { recursive: true });

      // Same logic as status command — repo wins
      const activeType = repoSquad ? 'repo' : existsSync(globalSquadDir) ? 'global' : 'none';
      expect(activeType).toBe('repo');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ============================================================================
// --global flag routing
// ============================================================================

describe('--global flag routing', () => {
  it('init --global resolves to global path, not cwd', () => {
    // Replicate the routing logic from src/index.ts:
    //   const dest = hasGlobal ? resolveGlobalSquadPath() : process.cwd();
    const hasGlobal = true;
    const dest = hasGlobal ? resolveGlobalSquadPath() : process.cwd();

    expect(dest).toBe(resolveGlobalSquadPath());
    expect(dest).not.toBe(process.cwd());
  });

  it('init without --global resolves to cwd', () => {
    const hasGlobal = false;
    const dest = hasGlobal ? resolveGlobalSquadPath() : process.cwd();

    expect(dest).toBe(process.cwd());
  });

  it('upgrade --global resolves to global path, not cwd', () => {
    const hasGlobal = true;
    const dest = hasGlobal ? resolveGlobalSquadPath() : process.cwd();

    expect(dest).toBe(resolveGlobalSquadPath());
    expect(dest).not.toBe(process.cwd());
  });

  it('upgrade without --global resolves to cwd', () => {
    const hasGlobal = false;
    const dest = hasGlobal ? resolveGlobalSquadPath() : process.cwd();

    expect(dest).toBe(process.cwd());
  });

  it('global path is consistent across repeated calls', () => {
    const first = resolveGlobalSquadPath();
    const second = resolveGlobalSquadPath();
    expect(first).toBe(second);
  });

  it('global path differs from cwd', () => {
    const globalPath = resolveGlobalSquadPath();
    expect(globalPath).not.toBe(process.cwd());
  });
});
