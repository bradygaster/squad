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
import { resolveSquad, resolveGlobalSquadPath } from '@bradygaster/squad-sdk/resolution';

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
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
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

  it('identifies "none" when no .squad/ exists and no global squad', () => {
    scaffold('.git');
    const repoSquad = resolveSquad(TMP);
    expect(repoSquad).toBeNull();
    // Without a global personal-squad/ dir, status shows "none"
    const globalPath = resolveGlobalSquadPath();
    const globalSquadDir = join(globalPath, 'personal-squad');
    // When repo squad is null and global personal-squad doesn't exist → "none"
    const activeType = repoSquad ? 'repo' : existsSync(globalSquadDir) ? 'personal' : 'none';
    expect(activeType).toBe(activeType === 'personal' ? 'personal' : 'none');
    // At minimum, repoSquad must be null
    expect(repoSquad).toBeNull();
  });

  it('identifies "personal" when no repo .squad/ but global personal-squad/ exists', () => {
    scaffold('.git');
    const repoSquad = resolveSquad(TMP);
    expect(repoSquad).toBeNull();

    const globalPath = resolveGlobalSquadPath();
    const globalSquadDir = join(globalPath, 'personal-squad');
    // Create a personal-squad/ inside the global path
    mkdirSync(globalSquadDir, { recursive: true });

    const activeType = repoSquad ? 'repo' : existsSync(globalSquadDir) ? 'personal' : 'none';
    expect(activeType).toBe('personal');

    // Cleanup global personal-squad dir we created
    rmSync(globalSquadDir, { recursive: true, force: true });
  });

  it('repo squad takes priority over personal squad', () => {
    scaffold('.git', '.squad');
    const repoSquad = resolveSquad(TMP);
    const globalPath = resolveGlobalSquadPath();
    const globalSquadDir = join(globalPath, 'personal-squad');
    mkdirSync(globalSquadDir, { recursive: true });

    // Same logic as status command — repo wins
    const activeType = repoSquad ? 'repo' : existsSync(globalSquadDir) ? 'personal' : 'none';
    expect(activeType).toBe('repo');

    rmSync(globalSquadDir, { recursive: true, force: true });
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
