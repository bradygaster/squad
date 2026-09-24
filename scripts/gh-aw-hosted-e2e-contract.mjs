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
      || typeof entry.destination !== 'string'
      || typeof entry.lock !== 'string'
      || typeof entry.source_sha256 !== 'string') {
      throw new Error(`${CANONICAL_MANIFEST_PATH} contains an invalid workflow entry`);
    }
    return {
      name: entry.name,
      source: entry.source,
      destination: entry.destination,
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
      source: entry.source ?? `workflows/${entry.path}`,
      packageDestination: entry.package_destination ?? entry.destination,
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
    minimumGhAwVersion: manifest.minimum_gh_aw_version,
    workflows,
    runtime,
    triggerProbe,
    digest(path) {
      return sha256(resolve(root, path));
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
      source: `workflows/${name}.md`,
      destination: `.github/workflows/${name}.md`,
      lock: `.github/workflows/${name}.lock.yml`,
    })),
    runtime: FALLBACK_RUNTIME.map((path) => ({
      path,
      source: `workflows/${path}`,
      packageDestination: `.github/workflows/${path}`,
      destination: `.github/workflows/${path}`,
    })),
    triggerProbe: 'shared/squad-install-verifier.mjs',
    digest(path) {
      return sha256(resolve(root, path));
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
