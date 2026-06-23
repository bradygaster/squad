#!/usr/bin/env node
// check-exports-map.mjs -- Verify package.json exports match barrel files.
// Exit 0 if all barrels are mapped, exit 1 with details if any are missing.
// Uses only Node.js built-ins (fs, path).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, '..', 'packages', 'squad-sdk');
const SRC_DIR = join(SDK_ROOT, 'src');
const PKG_PATH = join(SDK_ROOT, 'package.json');

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
const exportsMap = pkg.exports || {};

const srcEntries = readdirSync(SRC_DIR, { withFileTypes: true });
const barrelDirs = srcEntries
  .filter((entry) => entry.isDirectory())
  .filter((entry) => existsSync(join(SRC_DIR, entry.name, 'index.ts')))
  .map((entry) => entry.name)
  .sort();

const missing = [];

for (const dir of barrelDirs) {
  const exportKey = `./${dir}`;
  if (!exportsMap[exportKey]) {
    missing.push({ dir, expectedKey: exportKey });
  }
}

if (missing.length === 0) {
  console.log(`Exports map check passed: all ${barrelDirs.length} barrel directories have export entries.`);
  process.exit(0);
} else {
  console.error(`Exports map check FAILED: ${missing.length} barrel(s) missing from package.json exports.`);
  console.error(`This is by design -- new barrel directories must have matching export entries.\n`);
  for (const { dir, expectedKey } of missing) {
    console.error(`  MISSING: "${expectedKey}" (has src/${dir}/index.ts but no export entry)`);
  }
  console.error(`\nTo fix: add export entries to packages/squad-sdk/package.json "exports" for each missing barrel.`);
  console.error('To skip: add the "skip-exports-check" label to your PR to bypass this gate.');
  process.exit(1);
}