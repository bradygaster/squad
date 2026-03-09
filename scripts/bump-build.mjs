#!/usr/bin/env node
/**
 * bump-build.mjs — Auto-increment build number before each build.
 *
 * Version format: major.minor.patch-prerelease.build  (valid semver)
 *   e.g. 0.8.6-preview.1 → 0.8.6-preview.2
 *
 * If no build number exists (e.g. 0.8.6-preview), starts at 1.
 * Non-prerelease versions use: major.minor.patch-build.N  (valid semver)
 * Updates all 3 package.json files (root + both workspaces) in lockstep.
 *
 * Skip this script by setting SKIP_BUILD_BUMP=1 (used in CI/CD publish).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Skip build bump if SKIP_BUILD_BUMP is set (e.g., CI/CD publish)
if (process.env.SKIP_BUILD_BUMP === '1' || process.env.CI === 'true') {
  console.log('⏭️  Skipping build bump (CI mode)');
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PACKAGE_PATHS = [
  join(root, 'package.json'),
  join(root, 'packages', 'squad-sdk', 'package.json'),
  join(root, 'packages', 'squad-cli', 'package.json'),
];

// Parse version: "major.minor.patch-prerelease.build" or "major.minor.patch.build"
// Non-prerelease bumps now produce "major.minor.patch-build.N" (valid semver)
function parseVersion(version) {
  // Try prerelease format: "1.2.3-tag" or "1.2.3-tag.N"
  let match = version.match(/^(\d+\.\d+\.\d+)(-[a-zA-Z][a-zA-Z0-9-]*)(?:\.(\d+))?$/);
  if (match) {
    return {
      base: match[1],
      prerelease: match[2],  // e.g. "-preview"
      build: match[3] ? parseInt(match[3], 10) : 0,
    };
  }
  // Non-prerelease format: "1.2.3" or "1.2.3.N"
  match = version.match(/^(\d+\.\d+\.\d+)(?:\.(\d+))?$/);
  if (match) {
    return {
      base: match[1],
      prerelease: '',
      build: match[2] ? parseInt(match[2], 10) : 0,
    };
  }
  throw new Error(`Cannot parse version: ${version}`);
}

function formatVersion({ base, build, prerelease }) {
  if (prerelease) {
    return `${base}${prerelease}.${build}`;
  }
  // Use prerelease tag for valid semver (npm rejects 4-part versions like 0.8.25.4)
  return `${base}-build.${build}`;
}

// Read the canonical version from root package.json
const rootPkg = JSON.parse(readFileSync(PACKAGE_PATHS[0], 'utf8'));
const parsed = parseVersion(rootPkg.version);
parsed.build += 1;
const newVersion = formatVersion(parsed);

// Update all package.json files
for (const pkgPath of PACKAGE_PATHS) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

console.log(`Build ${parsed.build}: ${rootPkg.version} → ${newVersion}`);
