#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const releaseDir = path.resolve('scripts', 'release');
for (const file of readdirSync(releaseDir).filter((name) => name.endsWith('.mjs')).sort()) {
  execFileSync(process.execPath, ['--check', path.join(releaseDir, file)], { stdio: 'inherit' });
}

const workflowDir = path.resolve('.github', 'workflows');
const violations = [];
for (const file of readdirSync(workflowDir).filter((name) => name.endsWith('.yml')).sort()) {
  const text = readFileSync(path.join(workflowDir, file), 'utf8');
  if (/\bnode\s+(?:-\s+)?<<['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/.test(text)) {
    violations.push(`${file}: inline node heredoc`);
  }
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (/\bnode\s+(?:--input-type=\S+\s+)?-e\s+(['"])\s*$/.test(lines[index])) {
      violations.push(`${file}:${index + 1}: multi-line node -e`);
    }
  }
}
if (violations.length) {
  throw new Error(`Workflow JavaScript must live in scripts/release/*.mjs:\n${violations.join('\n')}`);
}
console.log(`Checked ${readdirSync(releaseDir).filter((name) => name.endsWith('.mjs')).length} release scripts; no inline workflow JavaScript found.`);
