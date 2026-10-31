#!/usr/bin/env node
// Binds every standalone archive that is about to be attached to a draft
// release to the in-run execution record produced for it by
// validate-standalone-bundle.mjs and to its SHA256SUMS.txt entry. Any missing,
// duplicate, extra, malformed or mismatched record fails closed so unverified
// bytes never reach a release.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STANDALONE_ASSETS, parseChecksumManifest } from './verify-draft-release-assets.mjs';

export const STANDALONE_TARGETS = STANDALONE_ASSETS.map((asset) => {
  const match = asset.match(/^squad-((linux|darwin|win32)-(x64|arm64))\.(?:tar\.gz|zip)$/);
  if (!match) throw new Error(`Unrecognized standalone asset ${asset}`);
  return { target: match[1], platform: match[2], arch: match[3], asset };
});

export const validationFileName = (target) => `squad-${target}-validation.json`;

const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function difference(left, right) {
  return [...left].filter((item) => !right.has(item));
}

export function verifyStandaloneValidationBinding({
  artifactsDir,
  checksumsPath,
  sourceSha,
  cliVersion,
  nodeVersion,
}) {
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '')) {
    throw new Error(`Invalid source SHA ${JSON.stringify(sourceSha)}`);
  }
  if (typeof cliVersion !== 'string' || !cliVersion.trim()) {
    throw new Error('Missing expected CLI version');
  }
  const expectedNode = String(nodeVersion ?? '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(expectedNode)) {
    throw new Error(`Invalid expected Node version ${JSON.stringify(nodeVersion)}`);
  }

  const entries = readdirSync(artifactsDir, { withFileTypes: true });
  const expectedValidation = new Set(STANDALONE_TARGETS.map(({ target }) => validationFileName(target)));
  const validationEntries = entries.filter((entry) => entry.name.endsWith('-validation.json'));
  const actualValidation = new Set(validationEntries.map((entry) => entry.name));
  const missingValidation = difference(expectedValidation, actualValidation);
  const extraValidation = difference(actualValidation, expectedValidation);
  const nonFileValidation = validationEntries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (missingValidation.length || extraValidation.length || nonFileValidation.length) {
    throw new Error(
      `Standalone validation records differ; missing=${missingValidation.join(',') || '<none>'}; `
      + `extra=${extraValidation.join(',') || '<none>'}; nonFiles=${nonFileValidation.join(',') || '<none>'}`,
    );
  }

  const checksums = parseChecksumManifest(readFileSync(checksumsPath, 'utf8'));
  const expectedChecksumFiles = new Set(STANDALONE_ASSETS);
  const actualChecksumFiles = new Set(checksums.keys());
  const missingChecksums = difference(expectedChecksumFiles, actualChecksumFiles);
  const extraChecksums = difference(actualChecksumFiles, expectedChecksumFiles);
  if (missingChecksums.length || extraChecksums.length) {
    throw new Error(
      `Standalone checksum entries differ; missing=${missingChecksums.join(',') || '<none>'}; `
      + `extra=${extraChecksums.join(',') || '<none>'}`,
    );
  }

  const bindings = [];
  for (const { target, platform, arch, asset } of STANDALONE_TARGETS) {
    const archiveEntry = entries.find((entry) => entry.name === asset);
    if (!archiveEntry?.isFile()) throw new Error(`Standalone archive ${asset} is missing`);

    const recordName = validationFileName(target);
    let report;
    try {
      report = JSON.parse(readFileSync(path.join(artifactsDir, recordName), 'utf8'));
    } catch (error) {
      throw new Error(`${recordName} is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const fail = (detail) => { throw new Error(`${recordName}: ${detail}`); };
    if (report?.schemaVersion !== 1) fail(`unsupported schemaVersion ${JSON.stringify(report?.schemaVersion)}`);
    if (report.execution !== 'EXECUTED') fail(`execution is ${JSON.stringify(report.execution)}, expected EXECUTED`);
    if (report.target !== target) fail(`target is ${JSON.stringify(report.target)}, expected ${target}`);
    if (report.runner?.platform !== platform || report.runner?.arch !== arch) {
      fail(`runner is ${JSON.stringify(report.runner)}, expected ${platform}-${arch}`);
    }
    if (report.sourceSha !== sourceSha) fail(`sourceSha is ${JSON.stringify(report.sourceSha)}, expected ${sourceSha}`);
    if (report.squadVersion !== cliVersion) fail(`squadVersion is ${JSON.stringify(report.squadVersion)}, expected ${cliVersion}`);
    if (report.processVersion !== `v${expectedNode}`) {
      fail(`processVersion is ${JSON.stringify(report.processVersion)}, expected v${expectedNode}`);
    }
    if (report.lifecycle?.toolsListed !== true || report.lifecycle?.teardownWithinGrace !== true) {
      fail('bridge lifecycle smoke did not pass');
    }
    if (report.archive?.name !== asset) fail(`archive.name is ${JSON.stringify(report.archive?.name)}, expected ${asset}`);
    if (!/^[0-9a-f]{64}$/.test(report.archive?.sha256 ?? '')) fail('archive.sha256 is malformed');

    const actual = sha256File(path.join(artifactsDir, asset));
    if (actual !== report.archive.sha256) {
      throw new Error(
        `${asset} sha256 ${actual} differs from executed validation record ${report.archive.sha256}; `
        + 'if it was reused from an earlier attempt\'s draft upload, delete that draft asset and re-run',
      );
    }
    if (actual !== checksums.get(asset)) {
      throw new Error(`${asset} sha256 ${actual} differs from SHA256SUMS.txt entry ${checksums.get(asset)}`);
    }
    bindings.push({ target, asset, sha256: actual });
  }
  return { bindings };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] ?? '' : '';
  };
  const required = (name) => {
    const value = arg(name);
    if (!value) throw new Error(`Missing required ${name}`);
    return value;
  };
  const cliPackageJson = arg('--cli-package-json');
  const cliVersion = arg('--cli-version')
    || (cliPackageJson ? JSON.parse(readFileSync(cliPackageJson, 'utf8')).version : '');
  const { bindings } = verifyStandaloneValidationBinding({
    artifactsDir: required('--artifacts-dir'),
    checksumsPath: required('--checksums'),
    sourceSha: required('--source-sha'),
    cliVersion,
    nodeVersion: required('--node-version'),
  });
  for (const { target, asset, sha256 } of bindings) {
    console.log(`BOUND ${target}: ${asset} sha256=${sha256} = validation record = SHA256SUMS.txt`);
  }
  console.log(`Verified ${bindings.length} standalone archives against executed validation records and SHA256SUMS.txt.`);
}
