import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTRACT_DESTINATION,
  CONTRACT_SOURCE,
  validateContract,
  verifyCanonicalManifest,
} from '../workflows/shared/squad-install-verifier.mjs';

export const CANONICAL_MANIFEST_PATH = CONTRACT_SOURCE;
export const INSTALLED_MANIFEST_PATH = CONTRACT_DESTINATION;

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function load(root, path, source) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  } catch (error) {
    throw new Error(`${source} is missing or invalid: ${error.message}`);
  }
  validateContract(manifest);
  return {
    source,
    package: manifest.package,
    minimumGhAwVersion: manifest.minimum_gh_aw_version,
    workflows: manifest.workflows,
    runtime: manifest.shared_runtime.map((entry) => ({
      path: entry.path,
      source: entry.source,
      packageDestination: entry.package_destination,
      destination: entry.destination,
      owner: entry.ownership,
      sha256: entry.sha256,
    })),
    skills: manifest.skills,
    triggerProbe: manifest.bootstrap.trigger_probe,
    digest(relativePath) {
      return sha256(resolve(root, relativePath));
    },
  };
}

export function loadBundleContract(root) {
  return load(root, CANONICAL_MANIFEST_PATH, CANONICAL_MANIFEST_PATH);
}

export function loadInstalledBundleContract(root) {
  return load(root, INSTALLED_MANIFEST_PATH, INSTALLED_MANIFEST_PATH);
}

export function assertInstalledManifestIdentity(sourceRoot, installedRoot) {
  verifyCanonicalManifest(sourceRoot, installedRoot);
}
