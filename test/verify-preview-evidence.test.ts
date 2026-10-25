import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyPreviewEvidence } from '../scripts/release/verify-preview-evidence.mjs';

const TARGET_SHA = '6901635cc29b661a30684bdd05f8e0533210a8d3';
const VERSION = '2.0.0-preview.2';

function sha256(bytes: Buffer | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixture() {
  const cache = path.resolve(__dirname, '..', 'node_modules', '.cache');
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(path.join(cache, 'preview-evidence-'));
  const evidenceDir = path.join(root, 'evidence');
  mkdirSync(evidenceDir);
  const cliPackageJson = path.join(root, 'cli-package.json');
  const sdkPackageJson = path.join(root, 'sdk-package.json');
  writeFileSync(cliPackageJson, JSON.stringify({
    name: '@bradygaster/squad-cli',
    version: VERSION,
    dependencies: { '@bradygaster/squad-sdk': VERSION },
  }));
  writeFileSync(sdkPackageJson, JSON.stringify({ name: '@bradygaster/squad-sdk', version: VERSION }));

  const packages: Record<string, Record<string, unknown>> = {};
  const manifestPackages: Record<string, Record<string, unknown>> = {};
  for (const [name, shortName] of [
    ['@bradygaster/squad-cli', 'cli'],
    ['@bradygaster/squad-sdk', 'sdk'],
  ]) {
    const filename = `bradygaster-squad-${shortName}-${VERSION}.tgz`;
    const bytes = Buffer.from(`${name} exact tarball bytes`);
    const digest = sha256(bytes);
    writeFileSync(path.join(evidenceDir, filename), bytes);
    const sdkDependency = name === '@bradygaster/squad-cli' ? VERSION : null;
    packages[name] = { name, filename, sha256: digest, manifest: { name, version: VERSION, sdkDependency } };
    manifestPackages[name] = { version: VERSION, sdkDependency, tarball: { filename, sha256: digest } };
  }
  writeFileSync(path.join(evidenceDir, 'pack-evidence.json'), JSON.stringify({ ok: true, packages }));
  const manifestName = `squad-2.0-verification-manifest-${TARGET_SHA.slice(0, 8)}.json`;
  const manifestBytes = Buffer.from(JSON.stringify({
    target: { commit: TARGET_SHA, version: VERSION },
    packages: manifestPackages,
  }));
  writeFileSync(path.join(evidenceDir, manifestName), manifestBytes);
  writeFileSync(path.join(evidenceDir, 'provenance.json'), JSON.stringify({
    commit: TARGET_SHA,
    manifest: { file: manifestName, sha256: sha256(manifestBytes), bytes: manifestBytes.length },
  }));

  const pack = JSON.parse(readFileSync(path.join(evidenceDir, 'pack-evidence.json'), 'utf8'));
  return {
    root,
    evidenceDir,
    cliPackageJson,
    sdkPackageJson,
    cliSha256: pack.packages['@bradygaster/squad-cli'].sha256,
    sdkSha256: pack.packages['@bradygaster/squad-sdk'].sha256,
  };
}

describe('preview evidence binding', () => {
  it('binds artifact, provenance, manifest, source versions, recorded hashes, and tarball bytes', () => {
    const item = fixture();
    try {
      expect(verifyPreviewEvidence({
        ...item,
        evidenceArtifact: `release-evidence-${TARGET_SHA}`,
        targetSha: TARGET_SHA,
      })).toMatchObject({
        targetSha: TARGET_SHA,
        expectedVersion: VERSION,
        tarballs: {
          cli: { sha256: item.cliSha256 },
          sdk: { sha256: item.sdkSha256 },
        },
      });
    } finally {
      rmSync(item.root, { recursive: true, force: true });
    }
  });

  it('fails closed when an input hash does not match the recorded and actual tarball hash', () => {
    const item = fixture();
    try {
      expect(() => verifyPreviewEvidence({
        ...item,
        evidenceArtifact: `release-evidence-${TARGET_SHA}`,
        targetSha: TARGET_SHA,
        cliSha256: '0'.repeat(64),
      })).toThrow(/tarball-to-input sha256/);
    } finally {
      rmSync(item.root, { recursive: true, force: true });
    }
  });

  it('fails closed when provenance names a different target commit', () => {
    const item = fixture();
    try {
      const provenancePath = path.join(item.evidenceDir, 'provenance.json');
      const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
      provenance.commit = '1'.repeat(40);
      writeFileSync(provenancePath, JSON.stringify(provenance));
      expect(() => verifyPreviewEvidence({
        ...item,
        evidenceArtifact: `release-evidence-${TARGET_SHA}`,
        targetSha: TARGET_SHA,
      })).toThrow(/provenance commit/);
    } finally {
      rmSync(item.root, { recursive: true, force: true });
    }
  });
});
