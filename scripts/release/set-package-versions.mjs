#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.env.PACKAGE_VERSION;
const files = (process.env.PACKAGE_FILES ?? 'package.json,packages/squad-sdk/package.json,packages/squad-cli/package.json')
  .split(',')
  .map((file) => file.trim())
  .filter(Boolean);
if (!version) throw new Error('PACKAGE_VERSION is required');
for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = version;
  if (file === 'packages/squad-cli/package.json' && process.env.PIN_SDK_DEPENDENCY === 'true') {
    pkg.dependencies['@bradygaster/squad-sdk'] = version;
    console.log(`  pinned @bradygaster/squad-sdk dep → ${version}`);
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${file} → ${version}`);
}
