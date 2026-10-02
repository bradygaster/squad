import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  CONTRACT_DESTINATION,
  OWNERSHIP_DESTINATION,
  UNOWNED_MUTABLE_ROUTER_SKILL,
  materializeRuntime,
  verifyInstall,
  verifyStagedInstall,
} from '../workflows/shared/squad-install-verifier.mjs';
import { createFirstInstallFixture } from './helpers/gh-aw-install-fixture.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

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

function seedUnownedMutableRouter(root: string): void {
  write(root, UNOWNED_MUTABLE_ROUTER_SKILL, [
    '---',
    'name: agentic-workflows',
    '---',
    '',
    'Load mutable prompts from the current github/gh-aw repository.',
    '',
  ].join('\n'));
}

afterEach(() => {
  vi.clearAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('gh-aw: verified ownership staging under consumer ignore rules', () => {
  it('bounds staged reads to required paths in a large unrelated consumer tree', () => {
    const root = consumer();
    const unrelated = 'consumer-data';
    for (let index = 0; index < 20_000; index += 1) {
      write(root, `${unrelated}/ordinary-file-${index.toString().padStart(5, '0')}.txt`, 'consumer content\n');
    }
    git(root, 'add', '--', unrelated);
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'large consumer baseline');
    write(root, `${unrelated}/ordinary-file-00000.txt`, 'unstaged consumer edit\n');
    write(root, `${unrelated}/untracked.txt`, 'untracked consumer content\n');
    const before = stagedPaths(root);
    const tree = git(root, 'write-tree').trim();
    const unbounded = spawnSync('git', ['ls-tree', '-r', '-z', tree], { cwd: root });
    expect(unbounded.error).toMatchObject({ code: 'ENOBUFS' });
    const manifest = JSON.parse(readFileSync(join(root, CONTRACT_DESTINATION), 'utf8'));
    const required = [
      CONTRACT_DESTINATION,
      OWNERSHIP_DESTINATION,
      ...manifest.workflows.flatMap((entry: { destination: string; lock: string }) =>
        [entry.destination, entry.lock]),
      ...manifest.shared_runtime.flatMap((entry: { package_destination: string; destination: string }) =>
        [entry.package_destination, entry.destination]),
      ...manifest.skills.map((entry: { destination: string }) => entry.destination),
    ];
    const spawn = vi.mocked(spawnSync);
    spawn.mockClear();
    expect(verifyStagedInstall(root, { expectedRevision: revision, stageOwnership: true }).failures).toEqual([]);
    const queries = spawn.mock.calls.filter(([command, args]) => command === 'git' && args?.[0] === 'ls-tree');
    expect(queries).toHaveLength(1);
    expect(queries[0][1]).toEqual([
      'ls-tree', '-z', expect.any(String), '--', ...new Set(required), UNOWNED_MUTABLE_ROUTER_SKILL,
    ]);
    const unrelatedObject = git(root, 'rev-parse', `HEAD:${unrelated}/ordinary-file-00000.txt`).trim();
    const blobReads = spawn.mock.calls.filter(([command, args]) => command === 'git' && args?.[0] === 'cat-file');
    expect(blobReads).toHaveLength(new Set(required).size);
    expect(blobReads.some(([, args]) => args?.includes(unrelatedObject))).toBe(false);
    expect(stagedPaths(root)).toEqual([...before, OWNERSHIP_DESTINATION].sort());
    expect(git(root, 'diff', '--cached', '--name-only').trim()).toBe(OWNERSHIP_DESTINATION);
    expect(git(root, 'diff', '--name-only').trim()).toBe(`${unrelated}/ordinary-file-00000.txt`);
    expect(readFileSync(join(root, unrelated, 'untracked.txt'), 'utf8')).toBe('untracked consumer content\n');
  }, 30_000);

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

  it('rejects the clean-install gh-aw router until it is removed, then accepts the exact Squad skill', () => {
    const root = consumer();
    seedUnownedMutableRouter(root);
    const args = [verifier, '--verify-install', '--source-revision', revision];
    const rejected = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain(
      `Unowned mutable gh-aw router skill must be removed: ${UNOWNED_MUTABLE_ROUTER_SKILL}`,
    );

    rmSync(join(root, UNOWNED_MUTABLE_ROUTER_SKILL));
    const accepted = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(readFileSync(join(root, '.github/skills/gh-aw-enlistment/SKILL.md')))
      .toEqual(readFileSync(resolve('workflows/skills/gh-aw-enlistment/SKILL.md')));
  });

  it('accepts an explicitly staged router deletion and rejects an unstaged retained index entry', () => {
    const root = consumer();
    seedUnownedMutableRouter(root);
    git(root, 'add', '--', UNOWNED_MUTABLE_ROUTER_SKILL);
    git(root, 'add', '--force', '--', OWNERSHIP_DESTINATION);
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'pre-existing gh-aw scaffold');

    rmSync(join(root, UNOWNED_MUTABLE_ROUTER_SKILL));
    expect(verifyInstall(root).failures).toEqual([]);
    expect(verifyStagedInstall(root).failures.join('\n')).toContain(
      `Unowned mutable gh-aw router skill remains in staged tree: ${UNOWNED_MUTABLE_ROUTER_SKILL}`,
    );

    git(root, 'add', '--', UNOWNED_MUTABLE_ROUTER_SKILL);
    expect(verifyStagedInstall(root).failures).toEqual([]);
    expect(git(root, 'diff', '--cached', '--diff-filter=D', '--name-only').trim())
      .toBe(UNOWNED_MUTABLE_ROUTER_SKILL);
    expect(stagedPaths(root)).not.toContain(UNOWNED_MUTABLE_ROUTER_SKILL);
    expect(stagedPaths(root)).toContain('.github/skills/gh-aw-enlistment/SKILL.md');
  });

  it('rejects a mutated Squad-owned enlistment skill after removing the tool-owned router', () => {
    const root = consumer();
    write(root, '.github/skills/gh-aw-enlistment/SKILL.md', 'mutated\n');
    expect(verifyInstall(root).failures.join('\n')).toContain(
      'Installed digest mismatch for .github/skills/gh-aw-enlistment/SKILL.md',
    );
  });

  it('fails clearly when Git cannot force-stage the required ignored metadata', () => {
    const root = consumer();
    write(root, '.git/index.lock', 'locked\n');
    const result = verifyStagedInstall(root, { stageOwnership: true });
    expect(result.failures.join('\n')).toMatch(/git failed:[\s\S]*index\.lock/);
    expect(stagedPaths(root)).not.toContain(OWNERSHIP_DESTINATION);
  });

  it('fails closed when the verified index cannot be snapshotted', () => {
    const root = consumer();
    expect(verifyStagedInstall(root, { stageOwnership: true }).failures).toEqual([]);
    write(root, '.git/index.lock', 'locked\n');
    expect(verifyStagedInstall(root).failures.join('\n')).toMatch(/git failed:[\s\S]*index\.lock/);
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

  it('rejects a required path replaced by an index directory without reading its descendants', () => {
    const root = consumer();
    expect(verifyStagedInstall(root, { stageOwnership: true }).failures).toEqual([]);
    const path = '.github/workflows/squad.md';
    const object = git(root, 'rev-parse', `:${path}`).trim();
    git(root, 'update-index', '--force-remove', '--', path);
    git(root, 'update-index', '--add', '--cacheinfo', `100644,${object},${path}/unexpected.txt`);
    expect(verifyInstall(root).failures).toEqual([]);
    expect(verifyStagedInstall(root).failures.join('\n'))
      .toContain(`Required staged path is not a regular file: ${path}`);
  });
});
