import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FALLBACK_WORKFLOWS = [
  'squad',
  'squad-implement-worker',
  'squad-review',
  'squad-deps-worker',
  'squad-retro',
  'squad-improvement-worker',
  'squad-bootstrap',
];

const FALLBACK_RUNTIME = [
  'shared/squad-cast-validator.mjs',
  'shared/squad-bootstrap-validator.mjs',
  'shared/squad-improvement-gate.mjs',
  'shared/squad-retro-evidence.mjs',
  'shared/squad-retro-provenance.mjs',
];

export const CANONICAL_MANIFEST_PATH = 'workflows/squad-workflows.manifest.json';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function normalizeManifest(root, manifest) {
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.workflows)) {
    throw new Error(`${CANONICAL_MANIFEST_PATH} must use schema_version 1 and declare workflows`);
  }

  const workflows = manifest.workflows.map((entry) => {
    if (typeof entry === 'string') {
      return {
        name: entry,
        source: `${entry}.md`,
        lock: `${entry}.lock.yml`,
      };
    }
    if (!entry || typeof entry.name !== 'string') {
      throw new Error(`${CANONICAL_MANIFEST_PATH} contains an invalid workflow entry`);
    }
    return {
      name: entry.name,
      source: entry.source ?? `${entry.name}.md`,
      lock: entry.lock ?? `${entry.name}.lock.yml`,
      source_sha256: entry.source_sha256,
      lock_sha256: entry.lock_sha256,
    };
  });

  const runtime = (manifest.shared_runtime ?? []).map((entry) => {
    if (typeof entry === 'string') return { path: entry };
    if (!entry || typeof entry.path !== 'string') {
      throw new Error(`${CANONICAL_MANIFEST_PATH} contains an invalid shared_runtime entry`);
    }
    return { path: entry.path, sha256: entry.sha256 };
  });

  const triggerProbe = manifest.bootstrap?.trigger_probe
    ?? 'shared/builtins/scribe-charter.md';

  return {
    source: CANONICAL_MANIFEST_PATH,
    workflows,
    runtime,
    triggerProbe,
    digest(path) {
      return sha256(resolve(root, 'workflows', path));
    },
  };
}

export function loadBundleContract(root) {
  const manifestPath = resolve(root, CANONICAL_MANIFEST_PATH);
  if (existsSync(manifestPath)) {
    return normalizeManifest(root, JSON.parse(readFileSync(manifestPath, 'utf8')));
  }

  return {
    source: 'hosted-e2e fallback adapter',
    workflows: FALLBACK_WORKFLOWS.map((name) => ({
      name,
      source: `${name}.md`,
      lock: `${name}.lock.yml`,
    })),
    runtime: FALLBACK_RUNTIME.map((path) => ({ path })),
    triggerProbe: 'shared/builtins/scribe-charter.md',
    digest(path) {
      return sha256(resolve(root, 'workflows', path));
    },
  };
}

