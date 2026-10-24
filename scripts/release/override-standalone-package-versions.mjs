#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.env.PACKAGE_VERSION;
const supported = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-insider\.(0|[1-9]\d*)$/;
if (!supported.test(version ?? '')) {
  throw new Error(`package_version must be an insider version such as 0.14.0-insider.1; got '${version}'`);
}

for (const file of [
  'package.json',
  'packages/squad-sdk/package.json',
  'packages/squad-cli/package.json',
]) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = version;
  if (file === 'packages/squad-cli/package.json') {
    pkg.dependencies['@bradygaster/squad-sdk'] = version;
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
