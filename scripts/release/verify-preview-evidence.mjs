#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = [
  ['@bradygaster/squad-cli', 'cli'],
  ['@bradygaster/squad-sdk', 'sdk'],
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual ?? '<missing>'}`);
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new Error(`Missing required ${name}`);
  return value;
}

export function verifyPreviewEvidence(options) {
  const evidenceDir = path.resolve(required(options, 'evidenceDir'));
  const targetSha = required(options, 'targetSha');
  if (!/^[0-9a-f]{40}$/.test(targetSha)) throw new Error(`target SHA must be lowercase 40-hex: ${targetSha}`);

  const expectedArtifact = `release-evidence-${targetSha}`;
  requireEqual(required(options, 'evidenceArtifact'), expectedArtifact, 'evidence artifact name');

  const sourceManifests = {
    '@bradygaster/squad-cli': readJson(required(options, 'cliPackageJson')),
    '@bradygaster/squad-sdk': readJson(required(options, 'sdkPackageJson')),
  };
  const expectedVersion = sourceManifests['@bradygaster/squad-cli'].version;
  requireEqual(sourceManifests['@bradygaster/squad-sdk'].version, expectedVersion, 'target source package versions');
  const sourceSdkDependency = sourceManifests['@bradygaster/squad-cli'].dependencies?.['@bradygaster/squad-sdk'];
  if (![expectedVersion, `>=${expectedVersion}`].includes(sourceSdkDependency)) {
    throw new Error(`target source CLI SDK dependency: expected ${expectedVersion} or >=${expectedVersion}, got ${sourceSdkDependency ?? '<missing>'}`);
  }

  const pack = readJson(path.join(evidenceDir, 'pack-evidence.json'));
  if (pack.ok !== true) throw new Error('pack-evidence.json does not report ok=true');

  const provenance = readJson(path.join(evidenceDir, 'provenance.json'));
  requireEqual(provenance.commit, targetSha, 'provenance commit');
  const expectedManifestName = `squad-2.0-verification-manifest-${targetSha.slice(0, 8)}.json`;
  requireEqual(provenance.manifest?.file, expectedManifestName, 'provenance manifest name');
  if (path.basename(provenance.manifest.file) !== provenance.manifest.file) {
    throw new Error('provenance manifest file must be a basename');
  }
  const manifestPath = path.join(evidenceDir, provenance.manifest.file);
  const manifestBytes = readFileSync(manifestPath);
  requireEqual(sha256(manifestBytes), provenance.manifest.sha256, 'verification manifest sha256');
  requireEqual(statSync(manifestPath).size, provenance.manifest.bytes, 'verification manifest byte count');

  const manifest = JSON.parse(manifestBytes);
  requireEqual(manifest.target?.commit, targetSha, 'verification manifest target commit');
  requireEqual(manifest.target?.version, expectedVersion, 'verification manifest target version');

  const tarballs = {};
  for (const [name, shortName] of PACKAGES) {
    const source = sourceManifests[name];
    requireEqual(source.name, name, `${name} target source package name`);
    requireEqual(source.version, expectedVersion, `${name} target source version`);

    const packed = pack.packages?.[name];
    const manifested = manifest.packages?.[name];
    if (!packed || !manifested) throw new Error(`${name} is missing from release evidence`);
    requireEqual(packed.name, name, `${name} pack name`);
    requireEqual(packed.manifest?.name, name, `${name} packed manifest name`);
    requireEqual(packed.manifest?.version, expectedVersion, `${name} packed version`);
    requireEqual(manifested.version, expectedVersion, `${name} verification manifest version`);
    if (name === '@bradygaster/squad-cli') {
      requireEqual(packed.manifest?.sdkDependency, expectedVersion, `${name} packed SDK dependency`);
      requireEqual(manifested.sdkDependency, sourceSdkDependency, `${name} verification manifest SDK dependency`);
    }
    requireEqual(manifested.tarball?.filename, packed.filename, `${name} tarball filename`);
    requireEqual(manifested.tarball?.sha256, packed.sha256, `${name} manifest-to-pack sha256`);

    const tarballPath = path.join(evidenceDir, packed.filename);
    if (path.basename(packed.filename) !== packed.filename) throw new Error(`${name} tarball filename must be a basename`);
    const actualSha256 = sha256(readFileSync(tarballPath));
    const inputSha256 = required(options, `${shortName}Sha256`);
    if (!/^[0-9a-f]{64}$/.test(inputSha256)) throw new Error(`${shortName} SHA-256 must be lowercase 64-hex`);
    requireEqual(actualSha256, packed.sha256, `${name} tarball-to-pack sha256`);
    requireEqual(actualSha256, inputSha256, `${name} tarball-to-input sha256`);
    tarballs[shortName] = {
      path: tarballPath,
      filename: packed.filename,
      sha256: actualSha256,
      bytes: statSync(tarballPath).size,
    };
  }

  return {
    targetSha,
    expectedVersion,
    evidenceArtifact: expectedArtifact,
    manifest: provenance.manifest.file,
    tarballs,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = verifyPreviewEvidence({
    evidenceDir: argument('--evidence-dir'),
    evidenceArtifact: argument('--evidence-artifact'),
    targetSha: argument('--target-sha'),
    cliSha256: argument('--cli-sha256'),
    sdkSha256: argument('--sdk-sha256'),
    cliPackageJson: argument('--cli-package-json'),
    sdkPackageJson: argument('--sdk-package-json'),
  });
  const githubEnv = argument('--github-env');
  if (githubEnv) {
    appendFileSync(githubEnv, [
      `SQUAD_PREVIEW_CLI_TARBALL=${result.tarballs.cli.path}`,
      `SQUAD_PREVIEW_SDK_TARBALL=${result.tarballs.sdk.path}`,
      `SQUAD_PREVIEW_EXPECTED_VERSION=${result.expectedVersion}`,
      '',
    ].join('\n'));
  }
  console.log(JSON.stringify(result, null, 2));
}
