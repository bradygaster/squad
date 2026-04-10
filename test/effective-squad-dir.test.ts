/**
 * Tests for effective-squad-dir: resolveStateDir() and effectiveSquadDir()
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveStateDir, effectiveSquadDir } from '../packages/squad-cli/src/cli/core/effective-squad-dir.js';
import { resolveGlobalSquadPath } from '@bradygaster/squad-sdk/resolution';

const TMP = join(process.cwd(), `.test-effective-squad-dir-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

function writeConfig(squadDir: string, config: Record<string, unknown>): void {
  writeFileSync(join(squadDir, 'config.json'), JSON.stringify(config, null, 2));
}

describe('resolveStateDir()', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns local path when no config.json exists', () => {
    scaffold('.squad');
    const squadDir = join(TMP, '.squad');
    expect(resolveStateDir(squadDir)).toBe(squadDir);
  });

  it('returns local path when stateLocation is not external', () => {
    scaffold('.squad');
    const squadDir = join(TMP, '.squad');
    writeConfig(squadDir, { version: 1, teamRoot: '.' });
    expect(resolveStateDir(squadDir)).toBe(squadDir);
  });

  it('returns external path when stateLocation is external', () => {
    scaffold('.squad');
    const squadDir = join(TMP, '.squad');
    const projectKey = `test-external-${randomBytes(4).toString('hex')}`;
    writeConfig(squadDir, {
      version: 1,
      teamRoot: '.',
      projectKey,
      stateLocation: 'external',
    });

    const result = resolveStateDir(squadDir);
    const globalDir = resolveGlobalSquadPath();
    const expected = join(globalDir, 'projects', projectKey);
    expect(result).toBe(expected);

    // Cleanup external dir
    if (existsSync(expected)) rmSync(expected, { recursive: true, force: true });
  });

  it('returns local path when stateLocation is external but projectKey is missing', () => {
    scaffold('.squad');
    const squadDir = join(TMP, '.squad');
    writeConfig(squadDir, {
      version: 1,
      teamRoot: '.',
      stateLocation: 'external',
    });
    expect(resolveStateDir(squadDir)).toBe(squadDir);
  });
});

describe('effectiveSquadDir()', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns local for both when state is not externalized', () => {
    scaffold('.squad');
    const { local, stateDir } = effectiveSquadDir(TMP);
    expect(local.path).toBe(join(TMP, '.squad'));
    expect(stateDir).toBe(join(TMP, '.squad'));
  });

  it('returns external stateDir when state is externalized', () => {
    scaffold('.squad');
    const squadDir = join(TMP, '.squad');
    const projectKey = `test-effective-${randomBytes(4).toString('hex')}`;
    writeConfig(squadDir, {
      version: 1,
      teamRoot: '.',
      projectKey,
      stateLocation: 'external',
    });

    const { local, stateDir } = effectiveSquadDir(TMP);
    expect(local.path).toBe(squadDir);

    const globalDir = resolveGlobalSquadPath();
    expect(stateDir).toBe(join(globalDir, 'projects', projectKey));

    // Cleanup
    const extDir = join(globalDir, 'projects', projectKey);
    if (existsSync(extDir)) rmSync(extDir, { recursive: true, force: true });
  });

  it('preserves SquadDirInfo metadata in local field', () => {
    scaffold('.squad');
    const { local } = effectiveSquadDir(TMP);
    expect(local.name).toBe('.squad');
    expect(local.isLegacy).toBe(false);
  });
});
