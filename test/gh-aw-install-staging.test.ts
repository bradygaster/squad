import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  CONTRACT_DESTINATION,
  OWNERSHIP_DESTINATION,
  materializeRuntime,
  verifyInstall,
  verifyStagedInstall,
} from '../workflows/shared/squad-install-verifier.mjs';
import { createFirstInstallFixture } from './helpers/gh-aw-install-fixture.js';

const revision = 'a'.repeat(40);
const roots: string[] = [];
const verifier = resolve('workflows/shared/squad-install-verifier.mjs');

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function write(root: string, path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function consumer(): string {
  const root = mkdtempSync(join(tmpdir(), 'squad-install-staging-'));
  roots.push(root);
  git(root, 'init', '--quiet');
  git(root, 'config', 'core.autocrlf', 'false');
  const fixture = createFirstInstallFixture(revision, 'package');
  for (const [path, content] of fixture.consumerFiles) write(root, path, content);
  write(root, OWNERSHIP_DESTINATION, `${JSON.stringify(fixture.provenance, null, 2)}\n`);
  write(root, '.gitattributes', '* -text\n');
  write(root, '.gitignore', 'packages/\nlogs/\n*.local\n');
  write(root, '.github/aw/packages/unrelated.json', '{"private":true}\n');
  write(root, 'packages/unrelated.txt', 'ignored consumer file\n');
  write(root, '.github/aw/logs/private.log', 'ignored diagnostic\n');
  write(root, '.github/skills/secret.local', 'ignored local file\n');
  materializeRuntime(root);
  git(root, 'add', '--', '.gitattributes', '.github/aw/', '.github/workflows/', '.github/skills/');
  return root;
}

function stagedPaths(root: string): string[] {
  return git(root, 'ls-files', '-z').split('\0').filter(Boolean).sort();
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('gh-aw: verified ownership staging under consumer ignore rules', () => {
  it('reproduces the silent omission, then force-stages only the exact required JSON', () => {
    const root = consumer();
    expect(verifyInstall(root, { expectedRevision: revision }).failures).toEqual([]);
    const before = stagedPaths(root);
    expect(before).not.toContain(OWNERSHIP_DESTINATION);
    expect(verifyStagedInstall(root).failures.join('\n')).toContain(
      `Required file is missing from staged tree: ${OWNERSHIP_DESTINATION}`,
    );

    expect(verifyStagedInstall(root, { expectedRevision: revision, stageOwnership: true }).failures).toEqual([]);
    expect(stagedPaths(root)).toEqual([...before, OWNERSHIP_DESTINATION].sort());
    expect(git(root, 'show', `:${OWNERSHIP_DESTINATION}`))
      .toBe(readFileSync(join(root, OWNERSHIP_DESTINATION), 'utf8'));
    for (const path of [
      '.github/aw/packages/unrelated.json', 'packages/unrelated.txt',
      '.github/aw/logs/private.log', '.github/skills/secret.local',
    ]) expect(stagedPaths(root)).not.toContain(path);
    expect(verifyStagedInstall(root, { stageOwnership: true }).failures).toEqual([]);

    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture install');
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('');
    expect(verifyStagedInstall(root).failures).toEqual([]);
  });

  it('runs the shipped CLI gate successfully and returns nonzero when metadata is missing', () => {
    const root = consumer();
    const args = [verifier, '--verify-staged-install', '--stage-ownership', '--source-revision', revision];
    expect(spawnSync(process.execPath, args, { cwd: root }).status).toBe(0);
    rmSync(join(root, OWNERSHIP_DESTINATION));
    const failed = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('do not commit/push');
    expect(failed.stderr).toMatch(/ownership record|ownership metadata/);
  });

  it('fails clearly when Git cannot force-stage the required ignored metadata', () => {
    const root = consumer();
    write(root, '.git/index.lock', 'locked\n');
    const result = verifyStagedInstall(root, { stageOwnership: true });
    expect(result.failures.join('\n')).toMatch(/git failed:[\s\S]*index\.lock/);
    expect(stagedPaths(root)).not.toContain(OWNERSHIP_DESTINATION);
  });

  it.each([
    CONTRACT_DESTINATION,
    '.github/workflows/squad.md',
    '.github/workflows/squad.lock.yml',
    '.github/workflows/shared/squad.md',
    '.github/aw/squad/runtime/shared/squad.md',
    '.github/skills/gh-aw-enlistment/SKILL.md',
  ])('rejects an omitted required artifact without force-adding it: %s', (path) => {
    const root = consumer();
    git(root, 'update-index', '--force-remove', '--', path);
    write(root, '.gitignore', `packages/\nlogs/\n*.local\n/${path}\n`);
    const result = verifyStagedInstall(root, { stageOwnership: true });
    expect(result.failures.join('\n')).toContain(`Required file is missing from staged tree: ${path}`);
    expect(stagedPaths(root)).not.toContain(path);
  });

  it.each([OWNERSHIP_DESTINATION, '.github/workflows/squad.lock.yml'])(
    'rejects stale staged bytes even when working-tree verification succeeds: %s', (path) => {
      const root = consumer();
      expect(verifyStagedInstall(root, { stageOwnership: true }).failures).toEqual([]);
      const original = readFileSync(join(root, path));
      write(root, path, 'stale staged contents\n');
      git(root, 'add', '--force', '--', path);
      write(root, path, original);
      expect(verifyInstall(root).failures).toEqual([]);
      expect(verifyStagedInstall(root, { stageOwnership: true }).failures.join('\n'))
        .toContain(`Staged digest mismatch for ${path}`);
    },
  );

  it('rejects a symlink staged in place of a required regular file', () => {
    const root = consumer();
    expect(verifyStagedInstall(root, { stageOwnership: true }).failures).toEqual([]);
    const path = '.github/workflows/squad.md';
    const object = git(root, 'rev-parse', `:${path}`).trim();
    git(root, 'update-index', '--cacheinfo', `120000,${object},${path}`);
    expect(verifyStagedInstall(root).failures.join('\n'))
      .toContain(`Required staged path is not a regular file: ${path}`);
  });
});
