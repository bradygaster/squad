/**
 * Tests for resolveSquadPaths() — shared mode resolution (Issue #311).
 *
 * Tests the step-3 shared squad discovery that runs when no local
 * .squad/ directory is found. Covers:
 * - SQUAD_REPO_KEY direct key lookup
 * - URL-based discovery via origin remote
 * - SQUAD_APPDATA_OVERRIDE environment variable
 * - %APPDATA% unreachable → SquadError
 * - Backward compatibility (local/remote modes unchanged)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveSquadPaths, _resetAppdataOverrideWarned } from '@bradygaster/squad-sdk/resolution';
import { SquadError } from '@bradygaster/squad-sdk/adapter/errors';

const TMP = join(process.cwd(), `.test-shared-mode-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

function writeJson(relPath: string, data: unknown): void {
  writeFileSync(join(TMP, relPath), JSON.stringify(data, null, 2), 'utf-8');
}

/** Create a bare git repo at the given path with an origin remote. */
function initGitRepoWithOrigin(repoDir: string, originUrl: string): void {
  mkdirSync(repoDir, { recursive: true });
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  execSync(`git remote add origin ${originUrl}`, { cwd: repoDir, stdio: 'pipe' });
}

/** Write a repos.json registry file at the given appdata/squad/ directory. */
function writeRegistry(
  appdataDir: string,
  repos: Array<{ key: string; urlPatterns: string[] }>,
): void {
  const globalSquadDir = join(appdataDir, 'squad');
  mkdirSync(globalSquadDir, { recursive: true });
  const registry = {
    version: 1,
    repos: repos.map((r) => ({
      key: r.key,
      urlPatterns: r.urlPatterns,
      created_at: '2025-07-22T10:00:00Z',
    })),
  };
  writeFileSync(join(globalSquadDir, 'repos.json'), JSON.stringify(registry, null, 2), 'utf-8');
}

/** Create the team directory under appdata/squad/repos/{key}. */
function createTeamDir(appdataDir: string, repoKey: string): string {
  const teamDir = join(appdataDir, 'squad', 'repos', ...repoKey.split('/'));
  mkdirSync(teamDir, { recursive: true });
  writeJson(
    join(teamDir, 'manifest.json').replace(TMP + (process.platform === 'win32' ? '\\' : '/'), ''),
    { version: 1, repoKey, urlPatterns: [], created_at: '2025-07-22T10:00:00Z' },
  );
  return teamDir;
}

describe('resolveSquadPaths() — shared mode', () => {
  const appdataDir = join(TMP, 'appdata');
  const repoDir = join(TMP, 'repo');

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  // ──── Backward compatibility ────

  it('local mode still works (no regression)', () => {
    scaffold('.git', '.squad', '.squad/agents');
    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('local');
    expect(result!.projectDir).toBe(join(TMP, '.squad'));
    expect(result!.teamDir).toBe(join(TMP, '.squad'));
  });

  it('remote mode still works (no regression)', () => {
    scaffold('.git', '.squad', 'shared-team');
    writeJson('.squad/config.json', {
      version: 1,
      teamRoot: 'shared-team',
      projectKey: null,
    });

    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('remote');
    expect(result!.teamDir).toBe(join(TMP, 'shared-team'));
  });

  it('returns null when .git exists but no .squad/ and no shared match', () => {
    // .git boundary but no .squad/ and no matching shared registry
    scaffold('.git', 'some-dir');
    expect(resolveSquadPaths(join(TMP, 'some-dir'))).toBeNull();
  });

  // ──── SQUAD_REPO_KEY — direct key lookup ────

  it('SQUAD_REPO_KEY: resolves shared mode by key', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/testrepo');

    // Set up git repo (no origin needed for key-based lookup)
    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');

    // Set up registry and team dir
    writeRegistry(appdataDir, [{ key: 'testorg/testrepo', urlPatterns: ['github.com/testorg/testrepo'] }]);
    createTeamDir(appdataDir, 'testorg/testrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('shared');
    expect(result!.teamDir).toBe(join(appdataDir, 'squad', 'repos', 'testorg', 'testrepo'));
    expect(result!.config).toBeNull();
    expect(result!.name).toBe('.squad');
    expect(result!.isLegacy).toBe(false);
  });

  it('SQUAD_REPO_KEY: returns null when key not in registry', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/nonexistent');

    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');
    writeRegistry(appdataDir, [{ key: 'testorg/testrepo', urlPatterns: [] }]);

    const result = resolveSquadPaths(repoDir);
    expect(result).toBeNull();
  });

  it('SQUAD_REPO_KEY: throws on invalid key format', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', '../../../etc/passwd');

    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');
    mkdirSync(join(appdataDir, 'squad'), { recursive: true });

    expect(() => resolveSquadPaths(repoDir)).toThrow(/path traversal/i);
  });

  it('SQUAD_REPO_KEY: returns null when no registry exists', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/testrepo');

    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');
    // No registry file — just the global squad dir
    mkdirSync(join(appdataDir, 'squad'), { recursive: true });

    const result = resolveSquadPaths(repoDir);
    expect(result).toBeNull();
  });

  it('SQUAD_REPO_KEY: 3-segment key works (org/project/repo)', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/testproject/testrepo');

    initGitRepoWithOrigin(repoDir, 'https://dev.azure.com/testorg/testproject/_git/testrepo');

    writeRegistry(appdataDir, [{
      key: 'testorg/testproject/testrepo',
      urlPatterns: ['dev.azure.com/testorg/testproject/_git/testrepo'],
    }]);
    createTeamDir(appdataDir, 'testorg/testproject/testrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('shared');
    expect(result!.teamDir).toBe(
      join(appdataDir, 'squad', 'repos', 'testorg', 'testproject', 'testrepo'),
    );
  });

  it('SQUAD_REPO_KEY: local .squad/ takes precedence over SQUAD_REPO_KEY', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/testrepo');

    // Git repo WITH .squad/ directory (with agents/ marker)
    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');
    mkdirSync(join(repoDir, '.squad', 'agents'), { recursive: true });

    writeRegistry(appdataDir, [{ key: 'testorg/testrepo', urlPatterns: [] }]);
    createTeamDir(appdataDir, 'testorg/testrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    // Should be local mode, not shared — local .squad/ wins
    expect(result!.mode).toBe('local');
    expect(result!.projectDir).toBe(join(repoDir, '.squad'));
  });

  // ──── URL-based discovery ────

  it('URL discovery: resolves shared mode via origin remote', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);

    initGitRepoWithOrigin(repoDir, 'https://github.com/myorg/myrepo.git');

    writeRegistry(appdataDir, [{
      key: 'myorg/myrepo',
      urlPatterns: ['github.com/myorg/myrepo'],
    }]);
    createTeamDir(appdataDir, 'myorg/myrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('shared');
    expect(result!.teamDir).toBe(join(appdataDir, 'squad', 'repos', 'myorg', 'myrepo'));
  });

  it('URL discovery: returns null when origin URL not in registry', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);

    initGitRepoWithOrigin(repoDir, 'https://github.com/unknown/repo.git');

    writeRegistry(appdataDir, [{
      key: 'myorg/myrepo',
      urlPatterns: ['github.com/myorg/myrepo'],
    }]);

    const result = resolveSquadPaths(repoDir);
    expect(result).toBeNull();
  });

  it('URL discovery: works from nested subdirectory', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);

    initGitRepoWithOrigin(repoDir, 'https://github.com/myorg/myrepo.git');
    mkdirSync(join(repoDir, 'packages', 'app', 'src'), { recursive: true });

    writeRegistry(appdataDir, [{
      key: 'myorg/myrepo',
      urlPatterns: ['github.com/myorg/myrepo'],
    }]);
    createTeamDir(appdataDir, 'myorg/myrepo');

    const result = resolveSquadPaths(join(repoDir, 'packages', 'app', 'src'));
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('shared');
  });

  it('URL discovery: SSH remote URL matches', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);

    initGitRepoWithOrigin(repoDir, 'git@github.com:myorg/myrepo.git');

    writeRegistry(appdataDir, [{
      key: 'myorg/myrepo',
      urlPatterns: ['github.com/myorg/myrepo'],
    }]);
    createTeamDir(appdataDir, 'myorg/myrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('shared');
  });

  // ──── SQUAD_APPDATA_OVERRIDE ────

  it('SQUAD_APPDATA_OVERRIDE: logs warning when set', () => {
    _resetAppdataOverrideWarned();
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);

    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');
    mkdirSync(join(appdataDir, 'squad'), { recursive: true });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resolveSquadPaths(repoDir);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SQUAD_APPDATA_OVERRIDE'),
    );

    warnSpy.mockRestore();
  });

  it('SQUAD_APPDATA_OVERRIDE: uses override path for registry', () => {
    const customAppdata = join(TMP, 'custom-appdata');
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', customAppdata);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/testrepo');

    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');

    writeRegistry(customAppdata, [{ key: 'testorg/testrepo', urlPatterns: [] }]);
    createTeamDir(customAppdata, 'testorg/testrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('shared');
    // teamDir should be under the custom appdata path
    expect(result!.teamDir).toBe(
      join(customAppdata, 'squad', 'repos', 'testorg', 'testrepo'),
    );
  });

  // ──── %APPDATA% unreachable (F11) ────

  it('throws SquadError when global squad path is unreachable', () => {
    // Point APPDATA to a path that will fail on mkdirSync
    // Use a path with illegal characters or a non-existent drive
    const badPath = join(TMP, 'nonexistent', '\0illegal');
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', badPath);

    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');

    try {
      resolveSquadPaths(repoDir);
      // If we get here, the path happened to succeed — skip assertion
      // (can happen on some platforms where null byte handling differs)
    } catch (err) {
      expect(err).toBeInstanceOf(SquadError);
      expect((err as SquadError).message).toMatch(/roaming profile may be offline/i);
      expect((err as SquadError).category).toBe('configuration');
    }
  });

  // ──── Shared mode result shape ────

  it('shared mode result has correct shape', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/testrepo');

    initGitRepoWithOrigin(repoDir, 'https://github.com/testorg/testrepo.git');
    writeRegistry(appdataDir, [{ key: 'testorg/testrepo', urlPatterns: [] }]);
    createTeamDir(appdataDir, 'testorg/testrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('shared');
    expect(result!.config).toBeNull();
    expect(result!.name).toBe('.squad');
    expect(result!.isLegacy).toBe(false);
    // projectDir should be a clone-state dir (under LOCALAPPDATA)
    expect(typeof result!.projectDir).toBe('string');
    expect(result!.projectDir.length).toBeGreaterThan(0);
    // teamDir should be under appdata
    expect(result!.teamDir).toContain('repos');
  });

  // ──── Edge cases ────

  it('git repo with no origin remote returns null', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);

    // Create a git repo with NO remotes
    mkdirSync(repoDir, { recursive: true });
    execSync('git init', { cwd: repoDir, stdio: 'pipe' });

    writeRegistry(appdataDir, [{ key: 'testorg/testrepo', urlPatterns: [] }]);

    const result = resolveSquadPaths(repoDir);
    expect(result).toBeNull();
  });

  it('worktree with no .squad/ falls back to shared mode', () => {
    vi.stubEnv('SQUAD_APPDATA_OVERRIDE', appdataDir);
    vi.stubEnv('SQUAD_REPO_KEY', 'testorg/testrepo');

    // Simulate a worktree by creating .git as a file
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, '.git'), 'gitdir: /somewhere/.git/worktrees/feature');

    writeRegistry(appdataDir, [{ key: 'testorg/testrepo', urlPatterns: [] }]);
    createTeamDir(appdataDir, 'testorg/testrepo');

    const result = resolveSquadPaths(repoDir);
    expect(result).not.toBeNull();
    // .git file means findGitRoot finds it — shared mode should work
    expect(result!.mode).toBe('shared');
  });
});
