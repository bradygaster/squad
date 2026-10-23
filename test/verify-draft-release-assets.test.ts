import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STANDALONE_ASSETS,
  parseChecksumManifest,
  validateDraftReleaseAssetNames,
  verifyDraftReleaseAssets,
} from '../scripts/release/verify-draft-release-assets.mjs';

const CACHE = path.resolve(__dirname, '..', 'node_modules', '.cache');
const VERSION = '2.0.0-preview.1';
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

function fixture() {
  mkdirSync(CACHE, { recursive: true });
  const root = mkdtempSync(path.join(CACHE, 'draft-release-assets-'));
  const draftAssetsDir = path.join(root, 'draft');
  mkdirSync(draftAssetsDir);
  const files = new Map<string, Buffer>();
  for (const filename of STANDALONE_ASSETS) {
    const content = Buffer.from(`archive:${filename}`);
    files.set(filename, content);
    writeFileSync(path.join(draftAssetsDir, filename), content);
  }
  const sdk = {
    filename: `bradygaster-squad-sdk-${VERSION}.tgz`,
    sha256: sha256('sdk'),
  };
  const cli = {
    filename: `bradygaster-squad-cli-${VERSION}.tgz`,
    sha256: sha256('cli'),
  };
  const checksums = [
    `${cli.sha256}  ${cli.filename}`,
    `${sdk.sha256}  ${sdk.filename}`,
    ...[...files].map(([filename, content]) => `${sha256(content)}  ${filename}`),
  ].join('\n') + '\n';
  const immutableChecksumsPath = path.join(root, 'immutable-SHA256SUMS.txt');
  const packEvidencePath = path.join(root, 'pack-evidence.json');
  writeFileSync(immutableChecksumsPath, checksums);
  writeFileSync(path.join(draftAssetsDir, 'SHA256SUMS.txt'), checksums);
  writeFileSync(packEvidencePath, JSON.stringify({
    packages: {
      '@bradygaster/squad-sdk': sdk,
      '@bradygaster/squad-cli': cli,
    },
  }));
  return {
    root,
    draftAssetsDir,
    immutableChecksumsPath,
    packEvidencePath,
    checksums,
  };
}

describe('draft release asset verification', () => {
  it('requires exactly seven unique, safe, allowlisted GitHub release asset names', () => {
    const expected = ['SHA256SUMS.txt', ...STANDALONE_ASSETS];
    expect(() => validateDraftReleaseAssetNames(expected)).not.toThrow();
    expect(() => validateDraftReleaseAssetNames([...expected, expected[1]]))
      .toThrow(/Duplicate draft release asset names/);
    expect(() => validateDraftReleaseAssetNames(expected.slice(1)))
      .toThrow(/missing=SHA256SUMS\.txt/);
    expect(() => validateDraftReleaseAssetNames([...expected.slice(0, -1), 'extra.zip']))
      .toThrow(/extra=extra\.zip/);
    for (const malformed of ['../squad-linux-x64.tar.gz', 'nested/asset.zip', 'nested\\asset.zip', '', 'bad name.zip']) {
      expect(() => validateDraftReleaseAssetNames([...expected.slice(0, -1), malformed]))
        .toThrow(/Unsafe or malformed draft asset filename/);
    }
  });

  it('binds the exact six archives, draft checksum asset, and two npm tarball hashes', () => {
    const item = fixture();
    try {
      expect(verifyDraftReleaseAssets(item)).toEqual({ standaloneAssets: 6, npmTarballs: 2 });
    } finally {
      rmSync(item.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it.each([
    ['duplicate', `${'a'.repeat(64)}  duplicate.zip\n${'b'.repeat(64)}  duplicate.zip\n`, /Duplicate checksum entry/],
    ['path', `${'a'.repeat(64)}  nested\/asset.zip\n`, /Malformed checksum entry|Unsafe checksum filename/],
    ['backslash path', `${'a'.repeat(64)}  nested\\asset.zip\n`, /Malformed checksum entry|Unsafe checksum filename/],
    ['malformed hash', `not-a-hash  asset.zip\n`, /Malformed checksum entry/],
    ['malformed separator', `${'a'.repeat(64)} asset.zip\n`, /Malformed checksum entry/],
  ])('rejects a %s checksum manifest', (_name, content, expected) => {
    expect(() => parseChecksumManifest(content)).toThrow(expected);
  });

  it('fails closed on a non-identical draft checksum asset', () => {
    const item = fixture();
    try {
      writeFileSync(path.join(item.draftAssetsDir, 'SHA256SUMS.txt'), `${item.checksums}tampered`);
      expect(() => verifyDraftReleaseAssets(item)).toThrow(/not byte-identical/);
    } finally {
      rmSync(item.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it.each([
    ['missing asset', (item: ReturnType<typeof fixture>) => rmSync(path.join(item.draftAssetsDir, STANDALONE_ASSETS[0]))],
    ['extra asset', (item: ReturnType<typeof fixture>) => writeFileSync(path.join(item.draftAssetsDir, 'extra.zip'), 'extra')],
    ['archive mismatch', (item: ReturnType<typeof fixture>) => writeFileSync(path.join(item.draftAssetsDir, STANDALONE_ASSETS[0]), 'tampered')],
  ])('fails closed on %s', (_name, mutate) => {
    const item = fixture();
    try {
      mutate(item);
      expect(() => verifyDraftReleaseAssets(item)).toThrow();
    } finally {
      rmSync(item.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('rejects missing, extra, and mismatched npm checksum bindings', () => {
    for (const mutate of [
      (text: string) => text.replace(/^.+bradygaster-squad-cli.+\n/m, ''),
      (text: string) => `${text}${'a'.repeat(64)}  unexpected.tgz\n`,
      (text: string) => text.replace(/^[0-9a-f]{64}(  bradygaster-squad-sdk)/m, `${'f'.repeat(64)}$1`),
    ]) {
      const item = fixture();
      try {
        const changed = mutate(item.checksums);
        writeFileSync(item.immutableChecksumsPath, changed);
        writeFileSync(path.join(item.draftAssetsDir, 'SHA256SUMS.txt'), changed);
        expect(() => verifyDraftReleaseAssets(item)).toThrow();
      } finally {
        rmSync(item.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    }
  });
});
