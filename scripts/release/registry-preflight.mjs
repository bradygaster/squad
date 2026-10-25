#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_KEYS } from './classify-npm-registry.mjs';

const TAGS = ['insider', 'preview', 'latest'];

function diagnostic(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}`.trim();
}

function isNotFound(text) {
  return /\bE404\b|404 Not Found|HTTP 404/i.test(text);
}

function spawnNpm(args, spawn) {
  return process.platform === 'win32'
    ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], { encoding: 'utf8' })
    : spawn('npm', args, { encoding: 'utf8' });
}

export function classifyPackageVersion({ name, version, registry, localIntegrity, spawn = spawnSync }) {
  const result = spawnNpm([
    'view',
    `${name}@${version}`,
    'version',
    'dist.integrity',
    '--json',
    `--registry=${registry}`,
  ], spawn);
  const detail = diagnostic(result);
  if (result.status !== 0) {
    return isNotFound(detail)
      ? { state: '404', diagnostic: detail.slice(-500) }
      : { state: 'UNKNOWN', diagnostic: detail.slice(-500) || `npm view exited ${String(result.status)}` };
  }
  try {
    const data = JSON.parse(result.stdout || '{}');
    if (data.version !== version || typeof data['dist.integrity'] !== 'string') {
      return { state: 'UNKNOWN', diagnostic: `unexpected registry response ${JSON.stringify(data)}` };
    }
    return {
      state: 'present',
      version: data.version,
      integrity: data['dist.integrity'],
      ...(localIntegrity ? { localIntegrity, integrityMatches: data['dist.integrity'] === localIntegrity } : {}),
    };
  } catch (error) {
    return { state: 'UNKNOWN', diagnostic: `invalid npm view JSON: ${error}` };
  }
}

export function readDistTags({ name, registry, spawn = spawnSync }) {
  const result = spawnNpm([
    'view',
    name,
    'dist-tags',
    '--json',
    `--registry=${registry}`,
  ], spawn);
  const detail = diagnostic(result);
  if (result.status !== 0) {
    return {
      state: 'UNKNOWN',
      values: Object.fromEntries(TAGS.map((tag) => [tag, null])),
      diagnostic: detail.slice(-500) || `npm view exited ${String(result.status)}`,
    };
  }
  try {
    const data = JSON.parse(result.stdout || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        state: 'UNKNOWN',
        values: Object.fromEntries(TAGS.map((tag) => [tag, null])),
        diagnostic: `unexpected dist-tags response ${JSON.stringify(data)}`,
      };
    }
    return {
      state: 'present',
      values: Object.fromEntries(TAGS.map((tag) => [tag, data[tag] ?? null])),
    };
  } catch (error) {
    return {
      state: 'UNKNOWN',
      values: Object.fromEntries(TAGS.map((tag) => [tag, null])),
      diagnostic: `invalid npm dist-tags JSON: ${error}`,
    };
  }
}

export function classifyGithubRelease({ repository, tag, spawn = spawnSync }) {
  const result = spawn('gh', [
    'api',
    '--method',
    'GET',
    `repos/${repository}/releases/tags/${tag}`,
  ], { encoding: 'utf8' });
  const detail = diagnostic(result);
  if (result.status !== 0) {
    return isNotFound(detail)
      ? { state: '404', tag, diagnostic: detail.slice(-500) }
      : { state: 'UNKNOWN', tag, diagnostic: detail.slice(-500) || `gh api exited ${String(result.status)}` };
  }
  try {
    const data = JSON.parse(result.stdout || '{}');
    return {
      state: 'present',
      tag,
      id: data.id ?? null,
      url: data.html_url ?? null,
      draft: data.draft ?? null,
      prerelease: data.prerelease ?? null,
    };
  } catch (error) {
    return { state: 'UNKNOWN', tag, diagnostic: `invalid gh api JSON: ${error}` };
  }
}

export function classifyGitRemoteTag({ tag, spawn = spawnSync }) {
  const ref = `refs/tags/${tag}`;
  const result = spawn('git', ['ls-remote', '--tags', 'origin', ref], { encoding: 'utf8' });
  const detail = diagnostic(result);
  if (result.status !== 0) {
    return { state: 'UNKNOWN', tag, ref, diagnostic: detail.slice(-500) || `git ls-remote exited ${String(result.status)}` };
  }
  const lines = (result.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { state: 'absent', tag, ref };
  if (lines.length !== 1) return { state: 'UNKNOWN', tag, ref, diagnostic: `unexpected git ls-remote response ${JSON.stringify(lines)}` };
  const match = lines[0].match(/^([0-9a-f]{40})\s+(.+)$/);
  if (!match || match[2] !== ref) {
    return { state: 'UNKNOWN', tag, ref, diagnostic: `unexpected git ls-remote response ${JSON.stringify(lines[0])}` };
  }
  return { state: 'present', tag, ref, oid: match[1] };
}

export function classifyGithubTagRef({ repository, tag, spawn = spawnSync }) {
  const ref = `refs/tags/${tag}`;
  const result = spawn('gh', [
    'api',
    '--method',
    'GET',
    `repos/${repository}/git/ref/tags/${tag}`,
  ], { encoding: 'utf8' });
  const detail = diagnostic(result);
  if (result.status !== 0) {
    return isNotFound(detail)
      ? { state: '404', tag, ref, diagnostic: detail.slice(-500) }
      : { state: 'UNKNOWN', tag, ref, diagnostic: detail.slice(-500) || `gh api exited ${String(result.status)}` };
  }
  try {
    const data = JSON.parse(result.stdout || '{}');
    if (data.ref !== ref || typeof data.object?.sha !== 'string') {
      return { state: 'UNKNOWN', tag, ref, diagnostic: `unexpected GitHub tag-ref response ${JSON.stringify(data)}` };
    }
    return { state: 'present', tag, ref, oid: data.object.sha, objectType: data.object.type ?? null };
  } catch (error) {
    return { state: 'UNKNOWN', tag, ref, diagnostic: `invalid GitHub tag-ref JSON: ${error}` };
  }
}

export function classifyGitTag({ repository, tag, spawn = spawnSync }) {
  const remote = classifyGitRemoteTag({ tag, spawn });
  const githubRef = classifyGithubTagRef({ repository, tag, spawn });
  const state = remote.state === 'absent' && githubRef.state === '404'
    ? 'absent'
    : remote.state === 'UNKNOWN' || githubRef.state === 'UNKNOWN'
      ? 'UNKNOWN'
      : remote.state === 'present' || githubRef.state === 'present'
        ? 'present'
        : 'UNKNOWN';
  return { state, tag, remote, githubRef };
}

function tarExecutable() {
  if (process.platform !== 'win32') return 'tar';
  const systemTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  return systemTar;
}

export function readTarballVersion(tarball, spawn = spawnSync) {
  const result = spawn(tarExecutable(), [
    '-xOf',
    path.basename(tarball),
    'package/package.json',
  ], { cwd: path.dirname(path.resolve(tarball)), encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`could not read package/package.json from ${tarball}: ${diagnostic(result).slice(-500)}`);
  }
  const manifest = JSON.parse(result.stdout);
  if (typeof manifest.version !== 'string' || !manifest.version) {
    throw new Error(`${tarball} package.json has no version`);
  }
  return manifest.version;
}

function tarballIntegrity(tarball) {
  return `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
}

export function runRegistryPreflight({
  version,
  registry,
  repository,
  proposedTag = `v${version}`,
  local = {},
  out,
  spawn = spawnSync,
}) {
  const packages = Object.fromEntries(PACKAGE_KEYS.map(([, name]) => [
    name,
    {
      version: classifyPackageVersion({
        name,
        version,
        registry,
        localIntegrity: local[name]?.integrity,
        spawn,
      }),
      distTags: readDistTags({ name, registry, spawn }),
    },
  ]));
  const versionStates = PACKAGE_KEYS.map(([, name]) => packages[name].version.state);
  const versionState = versionStates.every((state) => state === 'present')
    ? 'published'
    : versionStates.every((state) => state === '404')
      ? 'unpublished'
      : 'UNKNOWN';
  const evidence = {
    schema: 'squad-registry-preflight/v1',
    generatedAt: new Date().toISOString(),
    registry,
    version,
    proposedTag,
    packages,
    aggregate: { versionState },
    gitTag: classifyGitTag({ repository, tag: proposedTag, spawn }),
    githubRelease: classifyGithubRelease({ repository, tag: proposedTag, spawn }),
  };
  writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
  for (const [, name] of PACKAGE_KEYS) {
    const item = packages[name];
    console.log(`${name}@${version}: ${item.version.state}; insider=${item.distTags.values.insider ?? 'null'} preview=${item.distTags.values.preview ?? 'null'} latest=${item.distTags.values.latest ?? 'null'}`);
  }
  console.log(`Git tag ${proposedTag}: ${evidence.gitTag.state} (ls-remote=${evidence.gitTag.remote.state}; GitHub ref=${evidence.gitTag.githubRef.state})`);
  console.log(`GitHub release ${proposedTag}: ${evidence.githubRelease.state}`);
  console.log(`Candidate registry state: ${versionState}`);
  return evidence;
}

export function assertRegistryPreflight(evidence, { requireAbsence = false } = {}) {
  const unknown = [];
  for (const [, name] of PACKAGE_KEYS) {
    if (evidence.packages[name].version.state === 'UNKNOWN') unknown.push(`${name} version`);
    if (evidence.packages[name].distTags.state === 'UNKNOWN') unknown.push(`${name} dist-tags`);
  }
  if (evidence.gitTag.state === 'UNKNOWN') unknown.push(`Git tag ${evidence.proposedTag}`);
  if (evidence.githubRelease.state === 'UNKNOWN') unknown.push(`GitHub release ${evidence.proposedTag}`);
  if (unknown.length) throw new Error(`Registry preflight UNKNOWN: ${unknown.join(', ')}`);
  if (requireAbsence) {
    const present = [];
    if (evidence.aggregate.versionState !== 'unpublished') present.push(`npm packages=${evidence.aggregate.versionState}`);
    if (evidence.gitTag.state !== 'absent') present.push(`Git tag=${evidence.gitTag.state}`);
    if (evidence.githubRelease.state !== '404') present.push(`GitHub release=${evidence.githubRelease.state}`);
    if (present.length) throw new Error(`Release identity is not absent: ${present.join(', ')}`);
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = argument('--out');
  const registry = argument('--registry') ?? 'https://registry.npmjs.org/';
  const repository = argument('--repository') ?? process.env.GITHUB_REPOSITORY;
  const cliTarball = argument('--cli-tarball');
  const sdkTarball = argument('--sdk-tarball');
  const packEvidence = argument('--pack-evidence');
  if (!out) throw new Error('Missing required --out');
  if (!repository) throw new Error('Missing required --repository or GITHUB_REPOSITORY');

  let version = argument('--version');
  const local = {};
  if (packEvidence) {
    const packed = JSON.parse(readFileSync(packEvidence, 'utf8'));
    for (const [, name] of PACKAGE_KEYS) {
      if (packed.packages?.[name]?.integrity) local[name] = { integrity: packed.packages[name].integrity };
    }
    version ??= packed.packages?.['@bradygaster/squad-cli']?.manifest?.version;
  }
  if (cliTarball || sdkTarball) {
    if (!cliTarball || !sdkTarball) throw new Error('--cli-tarball and --sdk-tarball must be supplied together');
    const cliVersion = readTarballVersion(cliTarball);
    const sdkVersion = readTarballVersion(sdkTarball);
    if (cliVersion !== sdkVersion) throw new Error(`CLI tarball version ${cliVersion} != SDK tarball version ${sdkVersion}`);
    if (version && version !== cliVersion) throw new Error(`requested version ${version} != tarball version ${cliVersion}`);
    version = cliVersion;
    local['@bradygaster/squad-cli'] = { integrity: tarballIntegrity(cliTarball) };
    local['@bradygaster/squad-sdk'] = { integrity: tarballIntegrity(sdkTarball) };
  }
  if (!version) throw new Error('Missing --version, --pack-evidence, or exact tarball pair');

  const evidence = runRegistryPreflight({
    version,
    registry,
    repository,
    proposedTag: argument('--tag') ?? `v${version}`,
    local,
    out,
  });
  assertRegistryPreflight(evidence, { requireAbsence: process.argv.includes('--require-absence') });
}
