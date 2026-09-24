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
  'shared/squad-install-verifier.mjs',
  'shared/squad-improvement-gate.mjs',
  'shared/squad-retro-evidence.mjs',
  'shared/squad-retro-provenance.mjs',
];

export const CANONICAL_MANIFEST_PATH = 'workflows/squad-workflows.manifest.json';
export const INSTALLED_MANIFEST_PATH = '.github/aw/squad-workflows.manifest.json';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function normalizeManifest(root, manifest, source) {
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.workflows)) {
    throw new Error(`${CANONICAL_MANIFEST_PATH} must use schema_version 1 and declare workflows`);
  }

  const workflows = manifest.workflows.map((entry) => {
    if (!entry
      || typeof entry.name !== 'string'
      || typeof entry.source !== 'string'
      || typeof entry.lock !== 'string'
      || typeof entry.source_sha256 !== 'string') {
      throw new Error(`${CANONICAL_MANIFEST_PATH} contains an invalid workflow entry`);
    }
    return {
      name: entry.name,
      source: entry.source,
      lock: entry.lock,
      source_sha256: entry.source_sha256,
    };
  });

  const runtime = (manifest.shared_runtime ?? []).map((entry) => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      throw new Error(`${CANONICAL_MANIFEST_PATH} contains an invalid shared_runtime entry`);
    }
    return {
      path: entry.path,
      destination: entry.destination ?? entry.path,
      owner: entry.owner ?? entry.ownership,
      sha256: entry.sha256,
    };
  });

  const triggerProbe = manifest.bootstrap?.trigger_probe;
  if (triggerProbe !== 'shared/squad-install-verifier.mjs') {
    throw new Error(
      `${CANONICAL_MANIFEST_PATH} bootstrap.trigger_probe must be shared/squad-install-verifier.mjs`,
    );
  }

  return {
    source,
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
    return normalizeManifest(
      root,
      JSON.parse(readFileSync(manifestPath, 'utf8')),
      CANONICAL_MANIFEST_PATH,
    );
  }

  return {
    source: 'hosted-e2e fallback adapter',
    workflows: FALLBACK_WORKFLOWS.map((name) => ({
      name,
      source: `${name}.md`,
      lock: `${name}.lock.yml`,
    })),
    runtime: FALLBACK_RUNTIME.map((path) => ({ path, destination: path })),
    triggerProbe: 'shared/squad-install-verifier.mjs',
    digest(path) {
      return sha256(resolve(root, 'workflows', path));
    },
  };
}

export function loadInstalledBundleContract(root) {
  const manifestPath = resolve(root, INSTALLED_MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    throw new Error(`Installed bundle manifest is missing: ${INSTALLED_MANIFEST_PATH}`);
  }
  return normalizeManifest(
    root,
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    INSTALLED_MANIFEST_PATH,
  );
}
