#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, required = true) => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (required && !value) throw new Error(`Missing required ${name}`);
  return value;
};

const sourceSha = arg('--source-sha');
const dispatchSha = arg('--dispatch-sha');
const workflowSha = arg('--workflow-sha');
const tag = arg('--tag');
const evidenceDir = arg('--evidence-dir', false);
const repo = arg('--repo', false) || process.cwd();

if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error(`Invalid source SHA '${sourceSha}'`);
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(preview|insider)\.(0|[1-9]\d*))?$/.test(tag)) {
  throw new Error(`Invalid release tag '${tag}'`);
}

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');
const directRef = `refs/tags/${tag}`;
const peeledRef = `${directRef}^{}`;
const remoteRefs = git('ls-remote', '--exit-code', '--tags', 'origin', directRef, peeledRef)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [sha, ref, ...extra] = line.trim().split(/\s+/);
    if (!/^[0-9a-f]{40}$/.test(sha ?? '') || !ref || extra.length) {
      throw new Error(`Invalid git ls-remote output for ${tag}: '${line}'`);
    }
    return [ref, sha];
  });
const byRef = new Map(remoteRefs);
const remoteTag = byRef.get(peeledRef) ?? byRef.get(directRef);
if (!remoteTag) throw new Error(`Remote tag ${tag} did not resolve to a commit`);
for (const [name, value] of [
  ['dispatch SHA', dispatchSha],
  ['workflow definition SHA', workflowSha],
  ['checkout HEAD', head],
  [`remote tag ${tag}`, remoteTag],
]) {
  if (value !== sourceSha) throw new Error(`${name} is ${value}, expected ${sourceSha}`);
}

if (evidenceDir) {
  const reportPath = path.join(evidenceDir, 'pack-evidence.json');
  if (!existsSync(reportPath)) throw new Error(`Missing ${reportPath}`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const name of ['@bradygaster/squad-sdk', '@bradygaster/squad-cli']) {
    const entry = report.packages?.[name];
    if (!entry?.filename || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
      throw new Error(`Invalid evidence entry for ${name}`);
    }
    const tarball = path.join(evidenceDir, entry.filename);
    if (!existsSync(tarball)) throw new Error(`Missing verified tarball ${tarball}`);
    const actual = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    if (actual !== entry.sha256) throw new Error(`${name} sha256 ${actual} differs from evidence ${entry.sha256}`);
  }
}

console.log(`Release identity verified at ${sourceSha}: ${tag}${evidenceDir ? ' and exact evidence tarballs' : ''}.`);
