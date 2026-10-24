#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.2', 'preview-tarball-matrix.json');
const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/fold-preview-tarball-matrix.mjs <results.json>');
  process.exit(2);
}
const matrix = JSON.parse(fs.readFileSync(MATRIX, 'utf8'));
const run = JSON.parse(fs.readFileSync(file, 'utf8'));
const hex = (v, n) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(v);
if (!['linux', 'win32'].includes(run.platform) || !Array.isArray(run.results)) throw new Error('result must contain a linux/win32 platform and results[]');
if (!hex(run.targetSha, 40) || !hex(run.harnessHash, 64)) throw new Error('result must pin targetSha and harnessHash');
for (const name of ['cli', 'sdk']) {
  const artifact = run.tarballs?.[name];
  if (!artifact || !hex(artifact.sha256, 64) || !Number.isInteger(artifact.size) || artifact.size <= 0) throw new Error(`result must pin ${name} tarball filename, sha256 and size`);
}
const others = matrix.runs.filter((item) => item.platform !== run.platform);
for (const other of others) {
  if (other.targetSha !== run.targetSha) throw new Error(`${run.platform} targetSha differs from ${other.platform}`);
  if (other.harnessHash !== run.harnessHash) throw new Error(`${run.platform} harnessHash differs from ${other.platform}`);
  for (const name of ['cli', 'sdk']) {
    if (other.tarballs[name].sha256 !== run.tarballs[name].sha256 || other.tarballs[name].size !== run.tarballs[name].size) {
      throw new Error(`${run.platform} ${name} tarball differs from ${other.platform}`);
    }
  }
}
matrix.runs = [...others, run].sort((a, b) => a.platform.localeCompare(b.platform));
fs.writeFileSync(MATRIX, JSON.stringify(matrix, null, 2) + '\n');
console.log(`folded ${run.platform} preview tarball results into ${path.relative(ROOT, MATRIX)}`);
