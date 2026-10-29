#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_POLICY_PATH = path.join(SCRIPT_DIR, 'node-security-floor.json');
const STABLE_VERSION = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseNodeVersion(input) {
  if (typeof input !== 'string') {
    throw new Error(`Node version must be a string, got ${typeof input}`);
  }
  const match = input.match(STABLE_VERSION);
  if (!match) {
    throw new Error(`Invalid Node version '${input}'; expected a stable X.Y.Z version`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    normalized: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
  };
}

export function compareNodeVersions(left, right) {
  const a = parseNodeVersion(left);
  const b = parseNodeVersion(right);
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}

export function loadNodeSecurityFloor(policyPath = DEFAULT_POLICY_PATH) {
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  if (
    policy.schemaVersion !== 1 ||
    typeof policy.advisory !== 'string' ||
    typeof policy.releaseNotes !== 'string'
  ) {
    throw new Error(`Invalid Node security floor policy at ${policyPath}`);
  }
  parseNodeVersion(policy.standaloneDefault);
  for (const [major, minimum] of Object.entries(policy.minimumByMajor ?? {})) {
    const parsed = parseNodeVersion(minimum);
    if (String(parsed.major) !== major) {
      throw new Error(`Node security floor major ${major} points to ${minimum}`);
    }
  }
  const keys = policy.releaseKeys;
  if (
    typeof keys?.repository !== 'string' ||
    !/^[0-9a-f]{40}$/.test(keys?.commit ?? '') ||
    typeof keys?.path !== 'string' ||
    !/^[0-9a-f]{64}$/.test(keys?.sha256 ?? '')
  ) {
    throw new Error(`Invalid pinned Node release keyring in ${policyPath}`);
  }
  return policy;
}

export function assertNodeSecurityFloor(version, policy = loadNodeSecurityFloor()) {
  const parsed = parseNodeVersion(version);
  const minimum = policy.minimumByMajor?.[String(parsed.major)];
  if (!minimum) {
    throw new Error(
      `Node ${parsed.normalized} is not an approved vendored major; approved floors are ${
        Object.entries(policy.minimumByMajor).map(([major, floor]) => `${major}.x >= ${floor}`).join(', ')
      }. See ${policy.advisory}`,
    );
  }
  if (compareNodeVersions(parsed.normalized, minimum) < 0) {
    throw new Error(
      `Node ${parsed.normalized} is below the ${parsed.major}.x security floor ${minimum}. See ${policy.advisory}`,
    );
  }
  return { version: parsed.normalized, minimum, advisory: policy.advisory };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const index = process.argv.indexOf('--version');
  const version = index >= 0 ? process.argv[index + 1] : process.version;
  if (!version) throw new Error('Missing value for --version');
  const result = assertNodeSecurityFloor(version);
  console.log(`Node ${result.version} satisfies security floor ${result.minimum}.`);
}
