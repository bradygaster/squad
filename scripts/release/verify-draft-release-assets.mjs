#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STANDALONE_ASSETS = [
  'squad-linux-x64.tar.gz',
  'squad-linux-arm64.tar.gz',
  'squad-darwin-x64.tar.gz',
  'squad-darwin-arm64.tar.gz',
  'squad-win32-x64.zip',
  'squad-win32-arm64.zip',
];
export const DRAFT_RELEASE_ASSETS = ['SHA256SUMS.txt', ...STANDALONE_ASSETS];

function validateSafeFilename(filename, context) {
  if (typeof filename !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename)
    || path.basename(filename) !== filename
    || filename === '.'
    || filename === '..') {
    throw new Error(`Unsafe or malformed ${context} filename '${String(filename)}'`);
  }
}

export function validateDraftReleaseAssetNames(names) {
  if (!Array.isArray(names)) throw new Error('Draft release assets must be an array');
  for (const name of names) validateSafeFilename(name, 'draft asset');
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([name]) => name);
  if (duplicates.length) throw new Error(`Duplicate draft release asset names: ${duplicates.join(',')}`);
  const expected = new Set(DRAFT_RELEASE_ASSETS);
  const actual = new Set(names);
  const missing = [...expected].filter((name) => !actual.has(name));
  const extra = [...actual].filter((name) => !expected.has(name));
  if (names.length !== DRAFT_RELEASE_ASSETS.length || missing.length || extra.length) {
    throw new Error(`Draft release asset names differ; count=${names.length}; missing=${missing.join(',') || '<none>'}; extra=${extra.join(',') || '<none>'}`);
  }
}

export function parseChecksumManifest(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length) throw new Error('Checksum manifest is empty');
  const entries = new Map();
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/);
    if (!match) throw new Error(`Malformed checksum entry at line ${index + 1}: '${line}'`);
    const [, sha256, filename] = match;
    validateSafeFilename(filename, 'checksum');
    if (entries.has(filename)) throw new Error(`Duplicate checksum entry for ${filename}`);
    entries.set(filename, sha256);
  }
  return entries;
}

export function verifyDraftReleaseAssets({
  immutableChecksumsPath,
  draftAssetsDir,
  packEvidencePath,
}) {
  const immutableBytes = readFileSync(immutableChecksumsPath);
  const draftChecksumPath = path.join(draftAssetsDir, 'SHA256SUMS.txt');
  const draftBytes = readFileSync(draftChecksumPath);
  if (!immutableBytes.equals(draftBytes)) {
    throw new Error('Draft SHA256SUMS.txt is not byte-identical to the immutable checksum artifact');
  }

  const checksums = parseChecksumManifest(immutableBytes.toString('utf8'));
  const packEvidence = JSON.parse(readFileSync(packEvidencePath, 'utf8'));
  const npmEntries = [
    packEvidence.packages?.['@bradygaster/squad-sdk'],
    packEvidence.packages?.['@bradygaster/squad-cli'],
  ];
  for (const entry of npmEntries) {
    if (!entry?.filename || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
      throw new Error('pack-evidence.json has an invalid npm package checksum entry');
    }
    validateSafeFilename(entry.filename, 'npm checksum');
  }

  const expectedChecksumFiles = new Set([
    ...npmEntries.map((entry) => entry.filename),
    ...STANDALONE_ASSETS,
  ]);
  const actualChecksumFiles = new Set(checksums.keys());
  const missingChecksums = [...expectedChecksumFiles].filter((file) => !actualChecksumFiles.has(file));
  const extraChecksums = [...actualChecksumFiles].filter((file) => !expectedChecksumFiles.has(file));
  if (missingChecksums.length || extraChecksums.length) {
    throw new Error(`Checksum manifest entries differ; missing=${missingChecksums.join(',') || '<none>'}; extra=${extraChecksums.join(',') || '<none>'}`);
  }

  for (const entry of npmEntries) {
    if (checksums.get(entry.filename) !== entry.sha256) {
      throw new Error(`${entry.filename} checksum differs from pack-evidence.json`);
    }
  }

  const draftEntries = readdirSync(draftAssetsDir, { withFileTypes: true });
  const expectedDraftFiles = new Set(DRAFT_RELEASE_ASSETS);
  const actualDraftFiles = new Set(draftEntries.map((entry) => entry.name));
  const missingAssets = [...expectedDraftFiles].filter((file) => !actualDraftFiles.has(file));
  const extraAssets = [...actualDraftFiles].filter((file) => !expectedDraftFiles.has(file));
  const nonFiles = draftEntries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (missingAssets.length || extraAssets.length || nonFiles.length) {
    throw new Error(`Draft assets differ; missing=${missingAssets.join(',') || '<none>'}; extra=${extraAssets.join(',') || '<none>'}; nonFiles=${nonFiles.join(',') || '<none>'}`);
  }

  for (const filename of STANDALONE_ASSETS) {
    const actual = createHash('sha256').update(readFileSync(path.join(draftAssetsDir, filename))).digest('hex');
    if (actual !== checksums.get(filename)) {
      throw new Error(`${filename} sha256 ${actual} differs from immutable checksum ${checksums.get(filename)}`);
    }
  }
  return {
    standaloneAssets: STANDALONE_ASSETS.length,
    npmTarballs: npmEntries.length,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const releaseJsonIndex = process.argv.indexOf('--release-json');
  if (releaseJsonIndex >= 0) {
    const releaseJsonPath = process.argv[releaseJsonIndex + 1];
    if (!releaseJsonPath) throw new Error('Missing value for --release-json');
    const release = JSON.parse(readFileSync(releaseJsonPath, 'utf8'));
    validateDraftReleaseAssetNames(release.assets?.map((asset) => asset.name));
    console.log(`Verified ${DRAFT_RELEASE_ASSETS.length} unique safe draft release asset names.`);
    process.exit(0);
  }
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required ${name}`);
    return value;
  };
  const result = verifyDraftReleaseAssets({
    immutableChecksumsPath: required('IMMUTABLE_CHECKSUMS'),
    draftAssetsDir: required('DRAFT_ASSETS_DIR'),
    packEvidencePath: required('PACK_EVIDENCE'),
  });
  console.log(`Verified ${result.standaloneAssets} standalone assets and ${result.npmTarballs} npm checksum bindings.`);
}
