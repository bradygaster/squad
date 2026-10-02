import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  CONTRACT_DESTINATION,
  OWNERSHIP_DESTINATION,
  PACKAGE_NAME,
} from '../workflows/shared/squad-install-verifier.mjs';
import { createFirstInstallFixture } from './helpers/gh-aw-install-fixture.js';

const revision = 'a'.repeat(40);
const verifier = resolve('workflows/shared/squad-install-verifier.mjs');
const workspaceRoot = resolve('.test-workspaces');
const roots: string[] = [];
const workflowMutations: ReadonlyArray<
  readonly [string, (text: string, source: string) => string]
> = [
  ['owner', (text, source) =>
    text.replace(source, source.replace('bradygaster/', 'attacker/'))],
  ['repo', (text, source) =>
    text.replace(source, source.replace('/squad/', '/other/'))],
  ['workflow', (text, source) =>
    text.replace(source, source.replace('squad-review.md', 'squad.md'))],
  ['revision', (text, source) =>
    text.replace(source, source.replace(revision, 'b'.repeat(40)))],
  ['suffix', (text, source) => text.replace(source, `${source}/extra`)],
  ['missing', (text, source) => text.replace(`${source}\n`, '')],
  ['duplicate', (text, source) => text.replace(source, `${source}\n${source}`)],
  ['misplaced', (text, source) =>
    text.replace(`${source}\n---\n`, `---\n${source}\n`)],
  ['content', text => text.replace('Squad Review', 'Tampered Squad Review')],
];

function write(root: string, path: string, content: string | Buffer): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function makeConsumer(sourceBinding: 'workflow' | 'package' = 'workflow'): string {
  mkdirSync(workspaceRoot, { recursive: true });
  const root = mkdtempSync(join(workspaceRoot, 'gh-aw-verify-resource-'));
  roots.push(root);
  const fixture = createFirstInstallFixture(revision, sourceBinding);
  for (const [path, content] of fixture.consumerFiles) write(root, path, content);
  write(root, OWNERSHIP_DESTINATION, `${JSON.stringify(fixture.provenance, null, 2)}\n`);
  return root;
}

function runVerify(root: string, destination: string) {
  return spawnSync(process.execPath, [
    verifier,
    '--root', root,
    '--verify-resource', destination,
  ], { encoding: 'utf8' });
}

function updateOwnedDigest(root: string, destination: string): void {
  const ownershipPath = join(root, OWNERSHIP_DESTINATION);
  const ownership = JSON.parse(readFileSync(ownershipPath, 'utf8'));
  const entry = ownership.files.find(
    (candidate: { destination: string }) => candidate.destination === destination,
  );
  if (!entry) throw new Error(`Missing ownership entry for ${destination}`);
  entry.sha256 = createHash('sha256').update(readFileSync(join(root, destination))).digest('hex');
  writeFileSync(ownershipPath, `${JSON.stringify(ownership, null, 2)}\n`);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('gh-aw: consumer resource verification', () => {
  it.each(['workflow', 'package'] as const)(
    'exercises the shipped --verify-resource CLI against a clean %s-bound install',
    sourceBinding => {
      const root = makeConsumer(sourceBinding);
      const destination = '.github/workflows/squad-review.md';
      const result = runVerify(root, destination);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it('accepts only the documented final-newline variation', () => {
    const root = makeConsumer();
    const destination = '.github/workflows/squad-review.md';
    const original = readFileSync(join(root, destination), 'utf8');
    expect(original.endsWith('\n')).toBe(true);
    writeFileSync(join(root, destination), original.slice(0, -1));
    updateOwnedDigest(root, destination);
    const result = runVerify(root, destination);
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(workflowMutations)('rejects %s workflow resource mutation through the CLI', (label, mutate) => {
    const root = makeConsumer();
    const destination = '.github/workflows/squad-review.md';
    const source = `source: ${PACKAGE_NAME}/package/squad-review.md@${revision}`;
    const original = readFileSync(join(root, destination), 'utf8');
    const modified = mutate(original, source);
    expect(modified, label).not.toBe(original);
    writeFileSync(join(root, destination), modified);
    updateOwnedDigest(root, destination);
    const result = runVerify(root, destination);
    expect(result.status, `${label}: ${result.stdout}${result.stderr}`).toBe(1);
    expect(result.stderr, label).toMatch(/source binding|digest mismatch/);
  });

  it.each([
    ['shared runtime', '.github/workflows/shared/squad-review-guard.mjs'],
    ['skill', '.github/skills/gh-aw-enlistment/SKILL.md'],
  ] as const)('verifies %s by raw exact digest without ownership metadata', (_label, destination) => {
    const root = makeConsumer();
    rmSync(join(root, OWNERSHIP_DESTINATION));
    expect(runVerify(root, destination).status).toBe(0);
    writeFileSync(join(root, destination), Buffer.concat([
      readFileSync(join(root, destination)),
      Buffer.from('\n'),
    ]));
    const result = runVerify(root, destination);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Squad resource digest mismatch for ${destination}.`);
  });

  it('fails closed when installed provenance does not bind the installed revision', () => {
    const root = makeConsumer();
    const ownershipPath = join(root, OWNERSHIP_DESTINATION);
    const ownership = JSON.parse(readFileSync(ownershipPath, 'utf8'));
    ownership.source = `${PACKAGE_NAME}@${'b'.repeat(40)}`;
    writeFileSync(ownershipPath, `${JSON.stringify(ownership, null, 2)}\n`);
    const result = runVerify(root, '.github/workflows/squad-review.md');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Package ownership source must be ${PACKAGE_NAME}@${revision}.`);
  });

  it('fails closed when the installed contract is absent', () => {
    const root = makeConsumer();
    rmSync(join(root, CONTRACT_DESTINATION));
    const result = runVerify(root, '.github/workflows/squad-review.md');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Required file is missing: ${CONTRACT_DESTINATION}`);
  });
});
