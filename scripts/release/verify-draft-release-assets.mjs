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

export function parseChecksumManifest(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length) throw new Error('Checksum manifest is empty');
  const entries = new Map();
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/);
    if (!match) throw new Error(`Malformed checksum entry at line ${index + 1}: '${line}'`);
    const [, sha256, filename] = match;
    if (filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
      throw new Error(`Unsafe checksum filename '${filename}'`);
    }
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
    if (path.basename(entry.filename) !== entry.filename) {
      throw new Error(`Unsafe npm checksum filename '${entry.filename}'`);
    }
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
  const expectedDraftFiles = new Set(['SHA256SUMS.txt', ...STANDALONE_ASSETS]);
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
