/**
 * Tests for resolveSquadPaths() — dual-root path resolution (Issue #311)
 * Design ported from @spboyer (Shayne Boyer)'s PR bradygaster/squad#131.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';

const TMP = join(process.cwd(), `.test-dual-root-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
    // resolveSquad() requires team.md, agents/, or config.json to recognize a squad dir
    if (d === '.squad' || d === '.ai-team') {
      writeFileSync(join(TMP, d, 'team.md'), '# Team\n');
    }
  }
}

function writeJson(relPath: string, data: unknown): void {
  writeFileSync(join(TMP, relPath), JSON.stringify(data), 'utf-8');
}

describe('resolveSquadPaths()', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  // ---- Local mode ----

  it('returns local mode when no config.json exists', () => {
    scaffold('.git', '.squad');
    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('local');
    expect(result!.projectDir).toBe(join(TMP, '.squad'));
    expect(result!.teamDir).toBe(join(TMP, '.squad'));
    expect(result!.config).toBeNull();
    expect(result!.name).toBe('.squad');
    expect(result!.isLegacy).toBe(false);
  });

  it('returns null when no squad directory is found', () => {
    scaffold('.git');
    expect(resolveSquadPaths(TMP)).toBeNull();
  });

  // ---- Remote mode ----

  it('returns remote mode when config.json has valid teamRoot', () => {
    scaffold('.git', '.squad', 'shared-team');
    writeJson('.squad/config.json', {
      version: 1,
      teamRoot: 'shared-team',
      projectKey: 'my-project',
    });

    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('remote');
    expect(result!.projectDir).toBe(join(TMP, '.squad'));
    expect(result!.teamDir).toBe(join(TMP, 'shared-team'));
    expect(result!.config).toEqual({
      version: 1,
      teamRoot: 'shared-team',
      projectKey: 'my-project',
    });
  });

  it('resolves relative teamRoot with ../ correctly', () => {
    // Project at TMP/project, team at TMP/team-identity
    scaffold('project/.git', 'project/.squad', 'team-identity');
    writeJson('project/.squad/config.json', {
      version: 1,
      teamRoot: '../team-identity',
      projectKey: null,
    });

    const result = resolveSquadPaths(join(TMP, 'project'));
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('remote');
    expect(result!.projectDir).toBe(join(TMP, 'project', '.squad'));
    // teamRoot is resolved relative to project root (parent of .squad/)
    expect(result!.teamDir).toBe(join(TMP, 'team-identity'));
  });

  // ---- Broken config fallback ----

  it('falls back to local mode on malformed JSON', () => {
    scaffold('.git', '.squad');
    writeFileSync(join(TMP, '.squad', 'config.json'), '{ not valid json }}}', 'utf-8');

    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('local');
    expect(result!.projectDir).toBe(result!.teamDir);
    expect(result!.config).toBeNull();
  });

  it('falls back to local mode when teamRoot field is missing', () => {
    scaffold('.git', '.squad');
    writeJson('.squad/config.json', { version: 1, projectKey: 'x' });

    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('local');
    expect(result!.config).toBeNull();
  });

  it('falls back to local mode when teamRoot is not a string', () => {
    scaffold('.git', '.squad');
    writeJson('.squad/config.json', { version: 1, teamRoot: 42 });

    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('local');
    expect(result!.config).toBeNull();
  });

  // ---- Legacy .ai-team fallback ----

  it('detects .ai-team/ as legacy fallback', () => {
    scaffold('.git', '.ai-team');
    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('local');
    expect(result!.name).toBe('.ai-team');
    expect(result!.isLegacy).toBe(true);
    expect(result!.projectDir).toBe(join(TMP, '.ai-team'));
  });

  it('prefers .squad/ over .ai-team/ when both exist', () => {
    scaffold('.git', '.squad', '.ai-team');
    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('.squad');
    expect(result!.isLegacy).toBe(false);
  });

  it('supports remote mode from legacy .ai-team/ with config.json', () => {
    scaffold('.git', '.ai-team', 'team-shared');
    writeJson('.ai-team/config.json', {
      version: 1,
      teamRoot: 'team-shared',
      projectKey: null,
    });

    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('remote');
    expect(result!.isLegacy).toBe(true);
    expect(result!.teamDir).toBe(join(TMP, 'team-shared'));
  });

  // ---- Walk-up behavior ----

  it('walks up from nested dir to find .squad/', () => {
    scaffold('.git', '.squad', 'packages/app/src');
    const result = resolveSquadPaths(join(TMP, 'packages', 'app', 'src'));
    expect(result).not.toBeNull();
    expect(result!.projectDir).toBe(join(TMP, '.squad'));
  });

  // ---- projectKey handling ----

  it('sets projectKey to null when field is missing from config', () => {
    scaffold('.git', '.squad');
    writeJson('.squad/config.json', { version: 1, teamRoot: '.' });

    const result = resolveSquadPaths(TMP);
    expect(result).not.toBeNull();
    expect(result!.config!.projectKey).toBeNull();
  });
});
