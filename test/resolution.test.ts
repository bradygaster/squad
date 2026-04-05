/**
 * Tests for `resolveSquadInDir()` and `resolveGlobalSquadPath()`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  deriveProjectKey,
  ensurePersonalSquadDir,
  ensureSquadPath,
  resolveExternalStateDir,
  resolveGlobalSquadPath,
  resolvePersonalSquadDir,
  resolveSquadInDir,
  resolveSquadPaths,
} from '@bradygaster/squad-sdk/resolution';

const TMP = join(process.cwd(), `.test-resolution-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

describe('resolveSquadInDir()', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns path when .squad/ exists at startDir', () => {
    scaffold('.git', '.squad');
    expect(resolveSquadInDir(TMP)).toBe(join(TMP, '.squad'));
  });

  it('returns null when no .squad/ exists and .git is at startDir', () => {
    scaffold('.git');
    expect(resolveSquadInDir(TMP)).toBeNull();
  });

  it('walks up and finds .squad/ in parent', () => {
    scaffold('.git', '.squad', 'packages', 'packages/app');
    expect(resolveSquadInDir(join(TMP, 'packages', 'app'))).toBe(join(TMP, '.squad'));
  });

  it('stops at .git boundary and does not walk above repo root', () => {
    // outer has .squad, inner is its own repo without .squad
    scaffold('outer/.squad', 'outer/inner/.git');
    expect(resolveSquadInDir(join(TMP, 'outer', 'inner'))).toBeNull();
  });

  it('handles .git worktree file (not directory)', () => {
    scaffold('repo');
    // .git as a file (worktree pointer)
    writeFileSync(join(TMP, 'repo', '.git'), 'gitdir: /somewhere/.git/worktrees/repo');
    mkdirSync(join(TMP, 'repo', 'src'), { recursive: true });
    expect(resolveSquadInDir(join(TMP, 'repo', 'src'))).toBeNull();
  });

  it('finds .squad in worktree that has it', () => {
    scaffold('repo/.squad', 'repo/src');
    writeFileSync(join(TMP, 'repo', '.git'), 'gitdir: /somewhere/.git/worktrees/repo');
    expect(resolveSquadInDir(join(TMP, 'repo', 'src'))).toBe(join(TMP, 'repo', '.squad'));
  });

  it('falls back to main checkout .squad/ when worktree has none', () => {
    // main checkout: TMP/main with .git dir + .squad dir
    mkdirSync(join(TMP, 'main', '.git'), { recursive: true });
    mkdirSync(join(TMP, 'main', '.squad'), { recursive: true });
    // worktree: TMP/main/.worktrees/feature with .git FILE
    mkdirSync(join(TMP, 'main', '.worktrees', 'feature', 'src'), { recursive: true });
    writeFileSync(
      join(TMP, 'main', '.worktrees', 'feature', '.git'),
      'gitdir: ../../.git/worktrees/feature',
    );
    // Starting from worktree src/, should find main checkout's .squad/
    expect(resolveSquadInDir(join(TMP, 'main', '.worktrees', 'feature', 'src')))
      .toBe(join(TMP, 'main', '.squad'));
  });

  it('prefers worktree-local .squad/ over main checkout when both exist', () => {
    // main checkout with .squad/
    mkdirSync(join(TMP, 'main', '.git'), { recursive: true });
    mkdirSync(join(TMP, 'main', '.squad'), { recursive: true });
    // worktree with its own .squad/
    mkdirSync(join(TMP, 'main', '.worktrees', 'feature', '.squad'), { recursive: true });
    mkdirSync(join(TMP, 'main', '.worktrees', 'feature', 'src'), { recursive: true });
    writeFileSync(
      join(TMP, 'main', '.worktrees', 'feature', '.git'),
      'gitdir: ../../.git/worktrees/feature',
    );
    // Worktree-local .squad/ wins
    expect(resolveSquadInDir(join(TMP, 'main', '.worktrees', 'feature', 'src')))
      .toBe(join(TMP, 'main', '.worktrees', 'feature', '.squad'));
  });

  it('defaults to cwd when no argument given', () => {
    // Just verify it doesn't throw
    const result = resolveSquadInDir();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('finds .squad/ at root from a deeply nested directory (3+ levels)', () => {
    scaffold('.git', '.squad', 'a/b/c/d');
    expect(resolveSquadInDir(join(TMP, 'a', 'b', 'c', 'd'))).toBe(join(TMP, '.squad'));
  });

  it('finds the nearest .squad/ when multiple exist', () => {
    scaffold('.git', '.squad', 'packages/.squad', 'packages/app');
    // Starting from packages/app, the nearest .squad/ is packages/.squad
    expect(resolveSquadInDir(join(TMP, 'packages', 'app'))).toBe(join(TMP, 'packages', '.squad'));
  });

  it('finds root .squad/ when no closer one exists', () => {
    scaffold('.git', '.squad', 'packages/app/src');
    expect(resolveSquadInDir(join(TMP, 'packages', 'app', 'src'))).toBe(join(TMP, '.squad'));
  });

  it('follows symlinked .squad/ directory', function () {
    if (process.platform === 'win32') {
      // Symlinks on Windows require elevated privileges
      return;
    }
    const { symlinkSync } = require('node:fs') as typeof import('node:fs');
    scaffold('.git', 'real-squad', 'project/src');
    symlinkSync(join(TMP, 'real-squad'), join(TMP, 'project', '.squad'));
    expect(resolveSquadInDir(join(TMP, 'project', 'src'))).toBe(join(TMP, 'project', '.squad'));
  });
});

describe('resolver tracing', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(TMP, 'repo', 'src'), { recursive: true });
    mkdirSync(join(TMP, 'repo', '.git'), { recursive: true });
    mkdirSync(join(TMP, 'repo', '.squad'), { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('emits trace lines for the resolver helpers', () => {
    vi.stubEnv('HOME', TMP);
    if (process.platform === 'win32') {
      vi.stubEnv('APPDATA', join(TMP, 'AppData', 'Roaming'));
    } else {
      vi.stubEnv('XDG_CONFIG_HOME', join(TMP, '.config'));
    }

    const lines: string[] = [];
    const nestedStart = join(TMP, 'repo', 'src');

    expect(resolveSquadInDir(nestedStart, (line: string) => lines.push(line))).toBe(join(TMP, 'repo', '.squad'));
    expect(resolveSquadPaths(nestedStart, (line: string) => lines.push(line))?.mode).toBe('local');
    expect(resolveGlobalSquadPath((line: string) => lines.push(line))).toContain('squad');
    expect(resolvePersonalSquadDir((line: string) => lines.push(line))).toBeNull();
    expect(resolveExternalStateDir('trace-project', false, undefined, (line: string) => lines.push(line))).toContain('trace-project');
    expect(deriveProjectKey(TMP, (line: string) => lines.push(line))).toBeTruthy();

    expect(lines.some((line) => line.includes('[resolveSquadInDir]'))).toBe(true);
    expect(lines.some((line) => line.includes('[findSquadDir]'))).toBe(true);
    expect(lines.some((line) => line.includes('[loadDirConfig]'))).toBe(true);
    expect(lines.some((line) => line.includes('[resolveSquadPaths]'))).toBe(true);
    expect(lines.some((line) => line.includes('[resolveGlobalSquadPath]'))).toBe(true);
    expect(lines.some((line) => line.includes('[resolvePersonalSquadDir]'))).toBe(true);
    expect(lines.some((line) => line.includes('[resolveExternalStateDir]'))).toBe(true);
    expect(lines.some((line) => line.includes('[deriveProjectKey]'))).toBe(true);
  });
});

describe('resolveGlobalSquadPath()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a string path', () => {
    const result = resolveGlobalSquadPath();
    expect(typeof result).toBe('string');
    expect(result.endsWith('squad')).toBe(true);
  });

  it('creates the directory if missing', () => {
    const result = resolveGlobalSquadPath();
    expect(existsSync(result)).toBe(true);
  });

  it('respects XDG_CONFIG_HOME on Linux', () => {
    if (process.platform === 'win32' || process.platform === 'darwin') return;

    const customXdg = join(TMP, 'xdg');
    mkdirSync(customXdg, { recursive: true });

    vi.stubEnv('XDG_CONFIG_HOME', customXdg);
    const result = resolveGlobalSquadPath();
    expect(result).toBe(join(customXdg, 'squad'));
    expect(existsSync(result)).toBe(true);
  });

  it('uses APPDATA on Windows', () => {
    if (process.platform !== 'win32') return;

    const appdata = process.env['APPDATA'];
    if (!appdata) return; // APPDATA should always be set on Windows
    const result = resolveGlobalSquadPath();
    expect(result).toBe(join(appdata, 'squad'));
  });
});

describe('ensureSquadPath()', () => {
  const squadRoot = join(TMP, '.squad');

  it('allows a path inside .squad/', () => {
    const p = join(squadRoot, 'agents', 'fenster', 'scratch.md');
    expect(ensureSquadPath(p, squadRoot)).toBe(p);
  });

  it('allows .squad/ root itself', () => {
    expect(ensureSquadPath(squadRoot, squadRoot)).toBe(squadRoot);
  });

  it('allows a path inside the system temp directory', () => {
    const p = join(tmpdir(), 'squad-temp-file.txt');
    expect(ensureSquadPath(p, squadRoot)).toBe(p);
  });

  it('rejects a path at the repo root', () => {
    const repoRoot = join(TMP, 'issue1.txt');
    expect(() => ensureSquadPath(repoRoot, squadRoot)).toThrow(/outside the \.squad\/ directory/);
  });

  it('rejects an arbitrary absolute path', () => {
    const arbitrary = join(TMP, 'some', 'other', 'dir', 'file.txt');
    expect(() => ensureSquadPath(arbitrary, squadRoot)).toThrow(/outside the \.squad\/ directory/);
  });

  it('rejects path traversal that escapes .squad/ via ..', () => {
    const traversal = join(squadRoot, '..', 'evil.txt');
    expect(() => ensureSquadPath(traversal, squadRoot)).toThrow(/outside the \.squad\/ directory/);
  });
});

describe('ensurePersonalSquadDir()', () => {
  beforeEach(() => {
    vi.stubEnv('HOME', TMP);
    if (process.platform === 'win32') {
      vi.stubEnv('APPDATA', join(TMP, 'AppData', 'Roaming'));
    } else {
      vi.stubEnv('XDG_CONFIG_HOME', join(TMP, '.config'));
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates personal-squad/agents/ and config.json', () => {
    const dir = ensurePersonalSquadDir();
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, 'agents'))).toBe(true);
    expect(existsSync(join(dir, 'config.json'))).toBe(true);

    const config = JSON.parse(
      require('node:fs').readFileSync(join(dir, 'config.json'), 'utf-8'),
    );
    expect(config.defaultModel).toBe('auto');
    expect(config.ghostProtocol).toBe(true);
  });

  it('is idempotent — does not overwrite existing config', () => {
    const dir = ensurePersonalSquadDir();
    const configPath = join(dir, 'config.json');

    // Write custom config
    const custom = { defaultModel: 'gpt-4', ghostProtocol: true, custom: true };
    require('node:fs').writeFileSync(configPath, JSON.stringify(custom), 'utf-8');

    // Call again — should not overwrite
    ensurePersonalSquadDir();
    const config = JSON.parse(
      require('node:fs').readFileSync(configPath, 'utf-8'),
    );
    expect(config.custom).toBe(true);
    expect(config.defaultModel).toBe('gpt-4');
  });

  it('returns path inside resolveGlobalSquadPath()', () => {
    const globalDir = resolveGlobalSquadPath();
    const personalDir = ensurePersonalSquadDir();
    expect(personalDir).toBe(join(globalDir, 'personal-squad'));
  });
});
