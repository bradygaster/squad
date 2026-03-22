#!/usr/bin/env node
/**
 * sync-whatsnew-version.mjs
 *
 * Keeps the "## v{X} — Current Release" heading in whatsnew.md in sync with
 * the version in package.json. Strips any -build.N or other pre-release suffix
 * to produce a clean major.minor.patch version string.
 *
 * Usage:
 *   node scripts/sync-whatsnew-version.mjs
 *
 * Safe to run multiple times (idempotent). Writes the file only when changed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PKG_PATH = join(root, 'package.json');
const WHATSNEW_PATH = join(root, 'docs', 'src', 'content', 'docs', 'whatsnew.md');

const CURRENT_RELEASE_RE = /^## v\d+\.\d+\.\d+[\w.-]* — Current Release$/m;

function cleanVersion(raw) {
  // Strip -build.N, -preview.N, or any other pre-release suffix
  return raw.replace(/-.*$/, '');
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
} catch (err) {
  console.error(`❌ Could not read package.json at ${PKG_PATH}: ${err.message}`);
  process.exit(1);
}

if (typeof pkg.version !== 'string' || !pkg.version) {
  console.error(`❌ package.json has no valid version field (got: ${JSON.stringify(pkg.version)})`);
  process.exit(1);
}

const version = cleanVersion(pkg.version);
const expected = `## v${version} — Current Release`;

let original;
try {
  original = readFileSync(WHATSNEW_PATH, 'utf8');
} catch (err) {
  console.error(`❌ Could not read whatsnew.md at ${WHATSNEW_PATH}: ${err.message}`);
  process.exit(1);
}

const match = original.match(CURRENT_RELEASE_RE);

if (!match) {
  console.warn('⚠️  No "## v{version} — Current Release" heading found in whatsnew.md — skipping.');
  process.exit(0);
}

if (match[0] === expected) {
  console.log(`✅ whatsnew.md already reflects v${version} — no change needed.`);
  process.exit(0);
}

const updated = original.replace(CURRENT_RELEASE_RE, expected);
try {
  writeFileSync(WHATSNEW_PATH, updated, 'utf8');
} catch (err) {
  console.error(`❌ Could not write whatsnew.md at ${WHATSNEW_PATH}: ${err.message}`);
  process.exit(1);
}
console.log(`✏️  Updated whatsnew.md: "${match[0]}" → "${expected}"`);
