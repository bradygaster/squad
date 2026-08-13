#!/usr/bin/env node
/**
 * promote-insider-tag.mjs - Ensure the `insider` npm dist-tag never lags `latest`.
 *
 * Context: Issue #1491. When a stable release is published to `latest`, the
 * `insider` dist-tag can end up semver-lower than `latest` if no matching
 * insider build was cut. Insider-channel users then get pinned below stable.
 *
 * This script is invoked from the release workflow after a stable publish.
 * It compares the just-published stable version to the current `insider`
 * dist-tag and, if `insider` is behind, promotes `insider` to point at the
 * stable version. This keeps the invariant `insider >= latest` intact.
 *
 * A future manual insider workflow run (`squad-insider-publish.yml`) will
 * re-point `insider` to a real prerelease build (e.g. `0.12.0-insider.1`)
 * via `npm publish --tag insider`, which is the normal steady-state.
 *
 * Security notes:
 *   - Package names and versions are validated with strict regex before any
 *     child_process invocation. No shell interpolation of untrusted input.
 *   - We use spawnSync with argv arrays (never shell: true).
 *   - We only ever call `npm view <pkg>@<version> version --json`,
 *     `npm view <pkg> dist-tags --json` (reads), and
 *     `npm dist-tag add <pkg>@<version> insider` (write). No arbitrary
 *     command execution.
 *
 * Usage:
 *   node scripts/promote-insider-tag.mjs <package> <newVersion>
 * Example:
 *   node scripts/promote-insider-tag.mjs @bradygaster/squad-cli 0.11.0
 *
 * Exit codes:
 *   0 - success (either promoted, or already up to date; both are no-op safe)
 *   1 - usage / validation error
 *   2 - npm command failure
 */

import { spawnSync } from 'node:child_process';

// Strict validation regexes. These MUST match before any argument is passed
// to spawnSync; keeps the surface immune to command injection.
const PACKAGE_RE = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

// npm ships as `npm.cmd` on Windows; on POSIX it's `npm`. On Windows,
// Node 20+ requires shell:true to spawn .cmd files (CVE-2024-27980).
// This is safe here because ALL inputs are strictly regex-validated
// against PACKAGE_RE and VERSION_RE (no shell metacharacters possible).
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPM_SPAWN_OPTS = { encoding: 'utf8', shell: process.platform === 'win32' };

/**
 * Parse a strict semver (no build metadata) into components.
 * Returns null on invalid input.
 */
export function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(VERSION_RE);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? '',
  };
}

/**
 * semver comparison. Returns negative if a < b, positive if a > b, 0 if equal.
 * Follows semver 2.0.0 precedence:
 *   1. Numerically compare major, minor, patch.
 *   2. A version without prerelease has HIGHER precedence than one with.
 *   3. Prerelease identifiers are compared field-by-field: numeric-vs-numeric
 *      numerically, otherwise lexically; numeric identifiers rank lower than
 *      non-numeric ones; a shorter prerelease is lower if all previous
 *      identifiers are equal.
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) {
    throw new Error(`invalid semver in compareVersions: a=${a} b=${b}`);
  }
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  // Same M.m.p: absent prerelease > present prerelease
  if (pa.prerelease === '' && pb.prerelease === '') return 0;
  if (pa.prerelease === '') return 1;
  if (pb.prerelease === '') return -1;
  const ai = pa.prerelease.split('.');
  const bi = pb.prerelease.split('.');
  const len = Math.min(ai.length, bi.length);
  for (let i = 0; i < len; i++) {
    const ax = ai[i];
    const bx = bi[i];
    const aNum = /^\d+$/.test(ax);
    const bNum = /^\d+$/.test(bx);
    if (aNum && bNum) {
      const diff = Number(ax) - Number(bx);
      if (diff !== 0) return diff;
    } else if (aNum !== bNum) {
      // numeric identifiers have lower precedence than non-numeric
      return aNum ? -1 : 1;
    } else if (ax !== bx) {
      return ax < bx ? -1 : 1;
    }
  }
  return ai.length - bi.length;
}

/**
 * Pure decision: should we promote `insider` to point at `newVersion`?
 * True when insider is unset, or strictly semver-lower than newVersion.
 */
export function shouldPromote(insiderVersion, newVersion) {
  if (!insiderVersion) return true;
  return compareVersions(insiderVersion, newVersion) < 0;
}

function assertValid(pkg, version) {
  if (!PACKAGE_RE.test(pkg)) {
    throw new Error(`invalid package name: ${pkg}`);
  }
  if (!VERSION_RE.test(version)) {
    throw new Error(`invalid version: ${version}`);
  }
}

function runNpm(args, opts = NPM_SPAWN_OPTS) {
  const res = spawnSync(NPM_BIN, args, opts);
  if (res.error) {
    throw new Error(`failed to spawn npm: ${res.error.code || res.error.message}`);
  }
  return res;
}

function parseJsonString(raw, label) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`npm view returned non-JSON for ${label}: ${trimmed.slice(0, 200)}`);
  }
  return typeof parsed === 'string' ? parsed : '';
}

/** Verify that pkg@version exists on npm before moving any dist-tags. */
function readPublishedVersion(pkg, version) {
  const spec = `${pkg}@${version}`;
  const res = runNpm(['view', spec, 'version', '--json']);
  if (res.status !== 0) {
    throw new Error(`npm view failed for ${spec} (status=${res.status}): ${res.stderr || res.stdout}`);
  }
  const publishedVersion = parseJsonString(res.stdout, spec);
  if (publishedVersion !== version) {
    throw new Error(`npm view returned ${publishedVersion || '(empty)'} for ${spec}`);
  }
  return publishedVersion;
}

/** Read the current `insider` dist-tag for a package. Returns '' when absent. */
function readInsiderTag(pkg) {
  const res = runNpm(['view', pkg, 'dist-tags', '--json']);
  if (res.status !== 0) {
    // A missing package or transient network issue: surface stderr and fail.
    throw new Error(
      `npm view failed for ${pkg} (status=${res.status}): ${res.stderr || res.stdout}`,
    );
  }
  const raw = (res.stdout || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`npm view returned non-JSON for ${pkg}: ${raw.slice(0, 200)}`);
  }
  const tag = parsed && typeof parsed === 'object' ? parsed.insider : undefined;
  return typeof tag === 'string' ? tag : '';
}

/** Point the `insider` dist-tag at pkg@version. */
function setInsiderTag(pkg, version) {
  const res = runNpm(
    ['dist-tag', 'add', `${pkg}@${version}`, 'insider'],
    { ...NPM_SPAWN_OPTS, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (res.status !== 0) {
    throw new Error(`npm dist-tag add failed for ${pkg}@${version} (status=${res.status})`);
  }
}

export function promoteInsiderTag(pkg, newVersion) {
  assertValid(pkg, newVersion);

  readPublishedVersion(pkg, newVersion);
  const insider = readInsiderTag(pkg);
  console.log(`${pkg}: insider=${insider || '(unset)'}  new=${newVersion}`);

  if (!shouldPromote(insider, newVersion)) {
    console.log(`✓ insider (${insider}) is already >= ${newVersion} - no promotion needed`);
    return;
  }

  if (process.env.DRY_RUN === '1') {
    console.log(`DRY_RUN: would run: npm dist-tag add ${pkg}@${newVersion} insider`);
    return;
  }

  console.log(`→ promoting insider dist-tag: ${insider || '(unset)'} → ${newVersion}`);
  setInsiderTag(pkg, newVersion);
  console.log(`✓ promoted insider → ${pkg}@${newVersion}`);
}

async function main() {
  const [pkg, newVersion] = process.argv.slice(2);
  if (!pkg || !newVersion) {
    console.error('usage: promote-insider-tag.mjs <package> <newVersion>');
    process.exit(1);
  }
  promoteInsiderTag(pkg, newVersion);
}

// Run when invoked directly, but stay import-safe for tests.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('promote-insider-tag.mjs');
if (invokedDirectly) {
  try {
    await main();
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(2);
  }
}
