#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const violations = [];
const versions = [];
for (const entry of readdirSync('packages', { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const packagePath = path.join('packages', entry.name, 'package.json');
  if (!existsSync(packagePath)) continue;
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (pkg.version) versions.push(`${pkg.name}@${pkg.version}`);
  if (pkg.version && !/^\d+\.\d+\.\d+(-(preview|insider)(\.\d+)?)?$/.test(pkg.version)) {
    violations.push({ name: pkg.name, version: pkg.version, path: packagePath });
  }
}
if (violations.length) {
  console.error('::error::UNSANCTIONED PRERELEASE VERSION DETECTED — cannot merge to dev/main.');
  for (const item of violations) console.error(`  ${item.name}@${item.version} (${item.path})`);
  console.error('Fix: use X.Y.Z, X.Y.Z-preview, X.Y.Z-preview.N, or X.Y.Z-insider.N. Skip: add "skip-version-check" label.');
  process.exit(1);
}
console.log('✅ All package versions are release versions');
for (const version of versions) console.log(`  ${version}`);
