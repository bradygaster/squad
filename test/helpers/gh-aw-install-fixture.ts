import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import {
  CONTRACT_DESTINATION,
  CONTRACT_SOURCE,
  PACKAGE_NAME,
  normalizeCompiledLock,
} from '../../workflows/shared/squad-install-verifier.mjs';

interface ContractEntry {
  source: string;
  destination: string;
  sha256: string;
}

interface WorkflowEntry extends ContractEntry {
  name: string;
  lock: string;
  source_sha256: string;
  lock_sha256: string;
  package_lock_sha256: string;
}

interface RuntimeEntry extends ContractEntry {
  path: string;
  package_destination: string;
  ownership: string;
}

interface SkillEntry extends ContractEntry {
  name: string;
}

export interface InstallFixture {
  manifest: {
    workflows: WorkflowEntry[];
    shared_runtime: RuntimeEntry[];
    skills: SkillEntry[];
  };
  provenance: {
    schemaVersion: number;
    package: string;
    source: string;
    resolvedCommit: string;
    installer: string;
    files: ContractEntry[];
  };
  consumerFiles: Map<string, Buffer>;
  canonicalFiles: Map<string, Buffer>;
}

const fixtureCache = new Map<string, InstallFixture>();

function cloneFixture(fixture: InstallFixture): InstallFixture {
  return {
    manifest: structuredClone(fixture.manifest),
    provenance: structuredClone(fixture.provenance),
    consumerFiles: new Map([...fixture.consumerFiles].map(
      ([path, content]) => [path, Buffer.from(content)],
    )),
    canonicalFiles: new Map([...fixture.canonicalFiles].map(
      ([path, content]) => [path, Buffer.from(content)],
    )),
  };
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function withSource(content: Buffer, source: string, revision: string): Buffer {
  const text = content.toString('utf8');
  const marker = '\n---\n';
  const end = text.indexOf(marker, 4);
  if (!text.startsWith('---\n') || end < 0) throw new Error(`Invalid workflow source: ${source}`);
  return Buffer.from(
    `${text.slice(0, end)}\nsource: bradygaster/squad/${source}@${revision}${text.slice(end)}`,
  );
}

export function githubFile(content: Buffer): {
  type: string;
  encoding: string;
  size: number;
  content: string;
} {
  return {
    type: 'file',
    encoding: 'base64',
    size: content.length,
    content: content.toString('base64'),
  };
}

export function createFirstInstallFixture(
  revision: string,
  sourceBinding: 'workflow' | 'package' | 'mixed' = 'workflow',
): InstallFixture {
  const cacheKey = `${revision}:${sourceBinding}`;
  const cached = fixtureCache.get(cacheKey);
  if (cached) return cloneFixture(cached);
  const root = process.cwd();
  const manifestBytes = readFileSync(resolve(root, CONTRACT_SOURCE));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const consumerFiles = new Map<string, Buffer>([[CONTRACT_DESTINATION, manifestBytes]]);
  const canonicalFiles = new Map<string, Buffer>([[CONTRACT_SOURCE, manifestBytes]]);
  const scratch = mkdtempSync(resolve(root, '.squad-install-fixture-'));
  try {
    const workflowRoot = resolve(scratch, '.github/workflows');
    mkdirSync(workflowRoot, { recursive: true });
    cpSync(resolve(root, 'workflows/shared'), resolve(workflowRoot, 'shared'), { recursive: true });

    for (const [index, entry] of (manifest.workflows as WorkflowEntry[]).entries()) {
      const canonical = readFileSync(resolve(root, entry.source));
      canonicalFiles.set(entry.source, canonical);
      const source = sourceBinding === 'package' || (sourceBinding === 'mixed' && index % 2 === 0)
        ? 'workflows' : entry.source;
      const installed = withSource(canonical, source, revision);
      consumerFiles.set(entry.destination, installed);
      const path = resolve(scratch, entry.destination);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, installed);
    }
    execFileSync('git', ['init', '--quiet'], { cwd: scratch });
    execFileSync('gh', ['aw', 'compile', '--strict', '--no-check-update'], {
      cwd: scratch,
      stdio: 'pipe',
      timeout: 120_000,
    });
    let reportedMismatch = false;
    for (const entry of manifest.workflows as WorkflowEntry[]) {
      const lock = readFileSync(resolve(scratch, entry.lock));
      consumerFiles.set(entry.lock, lock);
      const annotation = `source: ${PACKAGE_NAME}@${revision}`;
      if (process.env.GITHUB_ACTIONS !== 'true' || reportedMismatch
        || !consumerFiles.get(entry.destination)!.toString('utf8').includes(`\n${annotation}\n`)) continue;
      const actual = normalizeCompiledLock(lock, revision);
      const observed = sha256(Buffer.from(actual));
      if (observed === entry.package_lock_sha256) continue;
      reportedMismatch = true;
      const baseline = createFirstInstallFixture(revision, 'workflow').consumerFiles.get(entry.lock)!;
      const expected = normalizeCompiledLock(baseline, revision)
        .replaceAll(`bradygaster/squad/${entry.source}`, PACKAGE_NAME)
        .replaceAll(`/blob/${'f'.repeat(40)}/${entry.source}`, `/blob/${'f'.repeat(40)}/workflows`);
      const baselineDigest = sha256(Buffer.from(expected));
      const evidence = [
        `Compiled fixture mismatch: ${entry.name}`,
        annotation,
        `Expected SHA: ${entry.package_lock_sha256}`,
        `Observed SHA: ${observed}`,
        `Reference SHA: ${baselineDigest}`,
      ];
      if (baselineDigest === entry.package_lock_sha256) {
        writeFileSync(resolve(scratch, 'expected.normalized.yml'), expected);
        writeFileSync(resolve(scratch, 'actual.normalized.yml'), actual);
        const diff = spawnSync('git', [
          'diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv',
          '--', 'expected.normalized.yml', 'actual.normalized.yml',
        ], { cwd: scratch, encoding: 'utf8' });
        if (diff.error || (diff.status !== 0 && diff.status !== 1)) {
          throw diff.error ?? new Error(`Fixture diagnostic diff failed: ${diff.stderr}`);
        }
        evidence.push(diff.stdout.slice(0, 16_000));
      } else {
        evidence.push('Reference compilation did not match the committed digest; no trusted byte diff is available.');
      }
      console.error(evidence.join('\n'));
    }

    for (const entry of manifest.shared_runtime as RuntimeEntry[]) {
      const canonical = readFileSync(resolve(root, entry.source));
      canonicalFiles.set(entry.source, canonical);
      consumerFiles.set(entry.package_destination, canonical);
    }
    for (const entry of manifest.skills as SkillEntry[]) {
      const canonical = readFileSync(resolve(root, entry.source));
      canonicalFiles.set(entry.source, canonical);
      consumerFiles.set(entry.destination, canonical);
    }

    const owned = [
      ...(manifest.workflows as WorkflowEntry[]).map(
        ({ source, destination }) => ({ source, destination }),
      ),
      ...(manifest.shared_runtime as RuntimeEntry[]).map(
        ({ source, package_destination: destination }) => ({ source, destination }),
      ),
      { source: CONTRACT_SOURCE, destination: CONTRACT_DESTINATION },
    ].sort((left, right) => left.destination.localeCompare(right.destination));
    const files = owned.map(entry => ({
      ...entry,
      sha256: sha256(consumerFiles.get(entry.destination)!),
    }));
    const fixture = {
      manifest,
      provenance: {
        schemaVersion: 1,
        package: PACKAGE_NAME,
        source: `${PACKAGE_NAME}@${revision}`,
        resolvedCommit: revision,
        installer: 'gh-aw v0.89.21 test',
        files,
      },
      consumerFiles,
      canonicalFiles,
    };
    fixtureCache.set(cacheKey, fixture);
    return cloneFixture(fixture);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
