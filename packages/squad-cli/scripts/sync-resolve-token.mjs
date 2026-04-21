#!/usr/bin/env node
// -- zero dependencies --
//
// sync-resolve-token.mjs — Propagate the canonical resolve-token.mjs to every
// template directory that ships it.
//
// Canonical source: packages/squad-cli/scripts/resolve-token.source.mjs
//
// The source file carries a 2-line CANONICAL banner that this script strips,
// then prepends a GENERATED header that points operators back here. The body
// of the script (role aliases, JWT signing, token resolution, CLI entry) is
// copied verbatim so runtime behavior is identical across every copy.
//
// Usage:
//   node packages/squad-cli/scripts/sync-resolve-token.mjs          # write
//   node packages/squad-cli/scripts/sync-resolve-token.mjs --check  # CI guard

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

const SOURCE_REL = 'packages/squad-cli/scripts/resolve-token.source.mjs';
const SOURCE_ABS = join(ROOT, SOURCE_REL);

const TARGETS = [
  'packages/squad-cli/templates/scripts/resolve-token.mjs',
  'packages/squad-sdk/templates/scripts/resolve-token.mjs',
  'templates/scripts/resolve-token.mjs',
  '.squad-templates/scripts/resolve-token.mjs',
];

const CANONICAL_BANNER_LINES = 2;
const GENERATED_HEADER =
  `// GENERATED FILE — DO NOT EDIT. Source: ${SOURCE_REL}\n` +
  `// Run \`npm run sync:resolve-token\` at the repo root to regenerate.\n`;

function buildExpectedOutput() {
  if (!existsSync(SOURCE_ABS)) {
    console.error(`❌ Canonical source missing: ${SOURCE_REL}`);
    process.exit(1);
  }
  const sourceText = readFileSync(SOURCE_ABS, 'utf8');
  const lines = sourceText.split('\n');
  const body = lines.slice(CANONICAL_BANNER_LINES).join('\n');
  return GENERATED_HEADER + body;
}

function readIfExists(absPath) {
  return existsSync(absPath) ? readFileSync(absPath, 'utf8') : null;
}

function main() {
  const checkMode = process.argv.includes('--check');
  const expected = buildExpectedOutput();

  const drifted = [];
  const missing = [];
  const written = [];

  for (const rel of TARGETS) {
    const abs = join(ROOT, rel);
    const current = readIfExists(abs);
    if (current === null) {
      missing.push(rel);
      if (!checkMode) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, expected);
        written.push(rel);
      }
      continue;
    }
    if (current !== expected) {
      drifted.push(rel);
      if (!checkMode) {
        writeFileSync(abs, expected);
        written.push(rel);
      }
    }
  }

  if (checkMode) {
    if (drifted.length === 0 && missing.length === 0) {
      console.log(`✅ resolve-token.mjs: all ${TARGETS.length} copies match canonical source.`);
      process.exit(0);
    }
    console.error('❌ resolve-token.mjs copies are out of sync with canonical source.');
    console.error(`   Canonical: ${SOURCE_REL}`);
    for (const rel of missing) console.error(`   missing:  ${rel}`);
    for (const rel of drifted) console.error(`   drifted:  ${rel}`);
    console.error('\n   Run: npm run sync:resolve-token');
    process.exit(1);
  }

  if (written.length === 0) {
    console.log(`✅ resolve-token.mjs: all ${TARGETS.length} copies already in sync.`);
  } else {
    console.log(`✅ resolve-token.mjs: wrote ${written.length}/${TARGETS.length} copies from ${SOURCE_REL}`);
    for (const rel of written) console.log(`   → ${rel}`);
  }
}

main();
