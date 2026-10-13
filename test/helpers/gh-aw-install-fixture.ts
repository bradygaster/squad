import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import {
  CONTRACT_DESTINATION,
  CONTRACT_SOURCE,
  PACKAGE_NAME,
  compileWithPinnedActions,
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
    compileWithPinnedActions(scratch);
    for (const entry of manifest.workflows as WorkflowEntry[]) {
      consumerFiles.set(entry.lock, readFileSync(resolve(scratch, entry.lock)));
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
        installer: 'gh-aw v0.91.5 test',
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
