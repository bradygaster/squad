#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const pkg = JSON.parse(readFileSync('packages/squad-sdk/package.json', 'utf8'));
const failures = [];
let passed = 0;
for (const [subpath, targets] of Object.entries(pkg.exports ?? {})) {
  const importPath = subpath === '.' ? '@bradygaster/squad-sdk' : `@bradygaster/squad-sdk/${subpath.slice(2)}`;
  const filePath = typeof targets === 'string' ? targets : (targets.import ?? targets.default);
  if (!filePath) {
    failures.push({ subpath, importPath, error: 'No import target defined' });
    continue;
  }
  const resolvedPath = path.resolve('packages/squad-sdk', filePath);
  if (!existsSync(resolvedPath)) {
    failures.push({ subpath, importPath, filePath, error: `File not found: ${resolvedPath}` });
    continue;
  }
  try {
    await import(pathToFileURL(resolvedPath).href);
    passed += 1;
    console.log(`  ✅ ${importPath} → ${filePath}`);
  } catch (error) {
    failures.push({ subpath, importPath, filePath, error: `import() failed: ${error.message}` });
  }
}
if (failures.length) {
  console.error(`::error::EXPORT SMOKE TEST FAILED — ${failures.length} subpath export(s) broken.`);
  for (const failure of failures) console.error(`  ❌ ${failure.importPath ?? failure.subpath}: ${failure.error}`);
  process.exit(1);
}
console.log(`✅ All ${passed} subpath exports resolve and import successfully`);
