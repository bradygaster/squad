#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNodeSecurityFloor,
  parseNodeVersion,
} from './node-security-floor.mjs';

export const EXPECTED_TARGETS = [
  'darwin-x64',
  'darwin-arm64',
  'linux-x64',
  'linux-arm64',
  'win32-x64',
  'win32-arm64',
];

const ARCHIVE_BY_TARGET = Object.fromEntries(
  EXPECTED_TARGETS.map((target) => [
    target,
    `squad-${target}.${target.startsWith('win32-') ? 'zip' : 'tar.gz'}`,
  ]),
);
const SHA256 = /^[0-9a-f]{64}$/;
const SOURCE_SHA = /^[0-9a-f]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:preview|insider)\.(0|[1-9]\d*))?$/;

function fail(message) {
  throw new Error(`Standalone checksum binding failed: ${message}`);
}

function exactNames(actual, expected, kind) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (
    actualSorted.length !== expectedSorted.length
    || actualSorted.some((name, index) => name !== expectedSorted[index])
  ) {
    fail(
      `${kind} must be exactly [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`,
    );
  }
}

function parseChecksums(checksumsPath) {
  const lines = readFileSync(checksumsPath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length !== EXPECTED_TARGETS.length) {
    fail(`SHA256SUMS must contain exactly ${EXPECTED_TARGETS.length} non-empty lines`);
  }

  const entries = new Map();
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  (squad-[A-Za-z0-9._-]+\.(?:tar\.gz|zip))$/);
    if (!match) fail(`malformed SHA256SUMS line ${JSON.stringify(line)}`);
    const [, sha256, name] = match;
    if (entries.has(name)) fail(`duplicate SHA256SUMS entry for ${name}`);
    entries.set(name, sha256);
  }
  exactNames(entries.keys(), Object.values(ARCHIVE_BY_TARGET), 'SHA256SUMS archives');
  return entries;
}

function readValidation(validationPath, expectedTarget) {
  let validation;
  try {
    validation = JSON.parse(readFileSync(validationPath, 'utf8'));
  } catch (error) {
    fail(
      `${path.basename(validationPath)} is malformed JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
    fail(`${path.basename(validationPath)} must contain a JSON object`);
  }
  if (validation.schemaVersion !== 1) fail(`${expectedTarget} has unsupported validation schema`);
  if (validation.execution !== 'EXECUTED') fail(`${expectedTarget} status is not EXECUTED`);
  if (validation.target !== expectedTarget) {
    fail(`${path.basename(validationPath)} records target ${JSON.stringify(validation.target)}`);
  }
  return validation;
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyStandaloneChecksums({
  artifactsDir,
  checksumsPath,
  expectedSourceSha,
  expectedCliVersion,
  expectedNodeVersion,
  outputPath,
}) {
  const resolvedArtifacts = path.resolve(artifactsDir);
  const resolvedChecksums = path.resolve(checksumsPath);
  const resolvedOutput = path.resolve(outputPath);
  if (existsSync(resolvedOutput)) unlinkSync(resolvedOutput);
  if (!SOURCE_SHA.test(expectedSourceSha)) fail('expected source SHA must be lowercase 40-hex');
  if (!VERSION.test(expectedCliVersion)) fail(`invalid expected Squad version ${expectedCliVersion}`);

  const normalizedNode = parseNodeVersion(expectedNodeVersion).normalized;
  const floor = assertNodeSecurityFloor(normalizedNode);
  if (!existsSync(resolvedArtifacts)) fail(`missing artifacts directory ${resolvedArtifacts}`);
  if (!existsSync(resolvedChecksums)) fail(`missing SHA256SUMS file ${resolvedChecksums}`);

  const names = readdirSync(resolvedArtifacts);
  const archiveNames = names.filter((name) => /^squad-.+\.(?:tar\.gz|zip)$/.test(name));
  const validationNames = names.filter((name) => /^squad-.+-validation\.json$/.test(name));
  const expectedArchiveNames = Object.values(ARCHIVE_BY_TARGET);
  const expectedValidationNames = EXPECTED_TARGETS.map(
    (target) => `squad-${target}-validation.json`,
  );
  exactNames(archiveNames, expectedArchiveNames, 'archives');
  exactNames(validationNames, expectedValidationNames, 'validation records');

  const checksums = parseChecksums(resolvedChecksums);
  const targets = [];
  for (const target of EXPECTED_TARGETS) {
    const archiveName = ARCHIVE_BY_TARGET[target];
    const archivePath = path.join(resolvedArtifacts, archiveName);
    const validationName = `squad-${target}-validation.json`;
    const validation = readValidation(path.join(resolvedArtifacts, validationName), target);

    if (validation.sourceSha !== expectedSourceSha) {
      fail(`${target} sourceSha ${JSON.stringify(validation.sourceSha)} does not match expected SHA`);
    }
    if (validation.squadVersion !== expectedCliVersion) {
      fail(
        `${target} Squad version ${JSON.stringify(validation.squadVersion)} does not match ${
          expectedCliVersion
        }`,
      );
    }
    if (validation.processVersion !== `v${normalizedNode}`) {
      fail(
        `${target} processVersion ${JSON.stringify(validation.processVersion)} does not match vendored v${
          normalizedNode
        }`,
      );
    }
    assertNodeSecurityFloor(validation.processVersion);
    if (
      !validation.archive
      || validation.archive.name !== archiveName
      || !SHA256.test(validation.archive.sha256 ?? '')
    ) {
      fail(`${target} has malformed archive validation metadata`);
    }

    const computedSha256 = await hashFile(archivePath);
    const manifestSha256 = checksums.get(archiveName);
    if (
      computedSha256 !== validation.archive.sha256
      || computedSha256 !== manifestSha256
    ) {
      fail(
        `${target} SHA-256 mismatch: computed=${computedSha256} validation=${
          validation.archive.sha256
        } SHA256SUMS=${manifestSha256}`,
      );
    }
    targets.push({
      target,
      archive: archiveName,
      validation: validationName,
      sha256: computedSha256,
      execution: validation.execution,
      processVersion: validation.processVersion,
      squadVersion: validation.squadVersion,
    });
  }

  const report = {
    schemaVersion: 1,
    status: 'VERIFIED',
    sourceSha: expectedSourceSha,
    squadVersion: expectedCliVersion,
    nodeVersion: normalizedNode,
    nodeSecurityFloor: floor.minimum,
    checksums: {
      name: path.basename(resolvedChecksums),
      sha256: await hashFile(resolvedChecksums),
    },
    targets,
  };
  writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (!value) throw new Error(`Missing required ${name}`);
  return value;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await verifyStandaloneChecksums({
    artifactsDir: arg('--artifacts'),
    checksumsPath: arg('--checksums'),
    expectedSourceSha: arg('--expected-source-sha'),
    expectedCliVersion: arg('--expected-cli'),
    expectedNodeVersion: arg('--expected-node'),
    outputPath: arg('--output'),
  });
  console.log(
    `VERIFIED ${report.targets.length} standalone archives at ${report.sourceSha}: `
    + `Squad ${report.squadVersion}, Node v${report.nodeVersion}`,
  );
}
