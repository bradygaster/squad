#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyPublishEvidence({
  evidenceDir,
  publishDir,
  version,
  sourceSha,
  tag,
  verifyRunId = '',
  evidenceArtifact,
  workflowSha,
  dispatchSha,
  recoverySha = '',
}) {
  if (verifyRunId && !/^[0-9a-f]{40}$/.test(recoverySha)) {
    throw new Error(`recoverySha must be a full lowercase 40-hex SHA, got '${recoverySha}'`);
  }
  if (verifyRunId && (recoverySha !== workflowSha || recoverySha !== dispatchSha)) {
    throw new Error('recoverySha must equal workflowSha and dispatchSha');
  }
  const report = JSON.parse(readFileSync(path.join(evidenceDir, 'pack-evidence.json'), 'utf8'));
  if (!report.ok) throw new Error('pack-evidence.json does not report ok=true');
  const expected = ['@bradygaster/squad-sdk', '@bradygaster/squad-cli'];
  const tgzs = readdirSync(evidenceDir).filter((file) => file.endsWith('.tgz')).sort();
  if (tgzs.length !== 2) throw new Error(`evidence must contain exactly two tarballs, found ${tgzs.join(', ')}`);
  const local = {};
  for (const name of expected) {
    const entry = report.packages?.[name];
    if (!entry) throw new Error(`missing evidence for ${name}`);
    if (entry.manifest?.version !== version) throw new Error(`${name} evidence version ${entry.manifest?.version} != ${version}`);
    if (name.endsWith('squad-cli') && entry.manifest?.sdkDependency !== version) {
      throw new Error(`CLI evidence does not pin SDK exactly to ${version}`);
    }
    if (!entry.privacy?.denyPatterns?.includes('email-upn')) throw new Error(`${name} evidence lacks the email-upn privacy rule`);
    if (entry.privacy?.hits?.length !== 0) throw new Error(`${name} evidence has privacy hits`);
    const tarball = path.join(evidenceDir, entry.filename);
    if (!existsSync(tarball)) throw new Error(`missing ${entry.filename}`);
    const actual = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    if (actual !== entry.sha256) throw new Error(`${name} sha256 ${actual} != evidence ${entry.sha256}`);
    const sum = readFileSync(`${tarball}.sha256`, 'utf8').trim();
    if (sum !== `${entry.sha256}  ${entry.filename}`) throw new Error(`${entry.filename}.sha256 does not match`);
    copyFileSync(tarball, path.join(publishDir, entry.filename));
    local[name] = {
      filename: entry.filename,
      bytes: entry.bytes,
      sha256: entry.sha256,
      integrity: entry.integrity,
      shasum: entry.shasum,
      files: entry.files,
      sdkDependency: entry.manifest?.sdkDependency ?? null,
    };
  }
  copyFileSync(path.join(evidenceDir, 'pack-evidence.json'), path.join(publishDir, 'pack-evidence.json'));
  writeFileSync(path.join(publishDir, 'local-packs.json'), `${JSON.stringify(local, null, 2)}\n`);
  const identity = {
    sourceSha,
    tag,
    verifyRunId: verifyRunId || null,
    evidenceArtifact,
    recoverySha: recoverySha || null,
    workflowSha,
    dispatchSha,
    packages: Object.fromEntries(expected.map((name) => [name, {
      filename: local[name].filename,
      bytes: local[name].bytes,
      sha256: local[name].sha256,
      integrity: local[name].integrity,
    }])),
  };
  writeFileSync(path.join(publishDir, 'release-identity.json'), `${JSON.stringify(identity, null, 2)}\n`);
  return { local, identity };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required ${name}`);
    return value;
  };
  const { local } = verifyPublishEvidence({
    evidenceDir: required('EVIDENCE_DIR'),
    publishDir: required('PUBLISH_DIR'),
    version: required('VERSION'),
    sourceSha: required('SOURCE_SHA'),
    tag: required('TAG'),
    verifyRunId: process.env.VERIFY_RUN_ID ?? '',
    evidenceArtifact: required('EVIDENCE_ARTIFACT'),
    recoverySha: process.env.RECOVERY_SHA ?? '',
    workflowSha: required('WORKFLOW_SHA'),
    dispatchSha: required('DISPATCH_SHA'),
  });
  console.log(JSON.stringify(Object.fromEntries(
    Object.entries(local).map(([name, entry]) => [name, entry.sha256]),
  ), null, 2));
}
