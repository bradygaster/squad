#!/usr/bin/env node
// This module is loaded only from the executing workflow's immutable checkout.
// Provider code, policy and credentials are never inputs supplied by the model.
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { classifySquadCommand } from './squad-command-contract.mjs';

export const DESCRIPTOR = '.squad/cao-evidence-provider.json';
export const RUNTIME_ROOT = '.squad/cao-evidence-runtime';
export const RUNTIME_ENTRY = `${RUNTIME_ROOT}/activity/squad-wave-evidence.mjs`;
export const RUNTIME_FILES = Object.freeze([
  `${RUNTIME_ROOT}/activity/squad-wave-evidence.mjs`,
  `${RUNTIME_ROOT}/activity/squad-farm.mjs`,
  `${RUNTIME_ROOT}/activity/authentication.mjs`,
  `${RUNTIME_ROOT}/.github/workflows/shared/policy.mjs`,
  `${RUNTIME_ROOT}/.github/workflows/shared/setup-github-apps.mjs`,
].sort());
export const POLICY = '.github/workflows/cao.json';
export const BUNDLE = '/tmp/gh-aw/agent/cao-farm';
export const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENTS = 256;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POSITIVE = /^[1-9][0-9]*$/;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function requireThat(condition, reason) {
  if (!condition) throw new Error(`Squad evidence: ${reason}`);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value, expected, label) {
  requireThat(record(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(','),
    `${label} has unsupported or missing fields`);
}

export function safeRelative(path) {
  requireThat(typeof path === 'string' && /^[A-Za-z0-9_./-]+$/.test(path) &&
    !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..'),
  'unsafe relative path');
  return path;
}

function safeSourcePath(path) {
  requireThat(typeof path === 'string' && !/[\0\\]/.test(path) &&
    !/^(?:\/|[A-Za-z]:)/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..'),
  'unsafe relative source path');
}

/** Reject links in every component, including a missing descriptor's parent. */
export function trustedPath(root, relative, optional = false) {
  const base = realpathSync(root);
  let current = base;
  for (const part of safeRelative(relative).split('/')) {
    current = join(current, part);
    if (!existsSync(current)) {
      // existsSync follows broken symlinks; lstat must still reject one.
      try {
        lstatSync(current);
        throw new Error('Squad evidence: symbolic links are forbidden');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (optional) return null;
      throw new Error('Squad evidence: required file is missing');
    }
    requireThat(!lstatSync(current).isSymbolicLink(), 'symbolic links are forbidden');
  }
  requireThat(realpathSync(current).startsWith(`${base}${sep}`), 'path escaped trusted root');
  return current;
}

function readBounded(path, limit) {
  const stat = lstatSync(path);
  requireThat(stat.isFile() && stat.size <= limit, 'file is not regular or exceeds size limit');
  return readFileSync(path);
}

function walk(root, relative = '') {
  const directory = relative ? trustedPath(root, relative) : realpathSync(root);
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = relative ? `${relative}/${name}` : name;
    const absolute = trustedPath(root, path);
    const stat = lstatSync(absolute);
    requireThat(stat.isFile() || stat.isDirectory(), 'nonregular bundle entry');
    if (stat.isDirectory()) files.push(...walk(root, path));
    else files.push(path);
    requireThat(files.length <= MAX_DOCUMENTS + 1, 'too many files');
  }
  return files;
}

/** Absence is the sole no-op. A present but invalid descriptor always fails. */
export function readProvider(root) {
  const path = trustedPath(root, DESCRIPTOR, true);
  if (!path) return null;
  const descriptor = JSON.parse(readBounded(path, 16 * 1024));
  keys(descriptor, ['schema', 'kind', 'runtime', 'runtime_files'], 'provider descriptor');
  requireThat(descriptor.schema === 'squad-evidence-provider/v1' &&
    descriptor.kind === 'cao-farm-v1' && descriptor.runtime === RUNTIME_ENTRY,
  'unsupported provider');
  requireThat(record(descriptor.runtime_files) &&
    JSON.stringify(Object.keys(descriptor.runtime_files).sort()) === JSON.stringify(RUNTIME_FILES),
    'provider must pin the complete five-module runtime');
  const declared = Object.keys(descriptor.runtime_files).sort();
  for (const name of declared) {
    safeRelative(name);
    requireThat(name.endsWith('.mjs') && SHA256.test(descriptor.runtime_files[name]),
      'invalid runtime module hash');
    const file = trustedPath(root, name);
    requireThat(digest(readBounded(file, 512 * 1024)) === descriptor.runtime_files[name],
      'runtime module hash mismatch');
  }
  const actual = walk(trustedPath(root, RUNTIME_ROOT)).map(name => `${RUNTIME_ROOT}/${name}`).sort();
  requireThat(JSON.stringify(actual) === JSON.stringify(declared), 'runtime contains unpinned files');
  return descriptor;
}

export function policyDigests(root) {
  const bytes = readBounded(trustedPath(root, POLICY), 1024 * 1024);
  const policy = JSON.parse(bytes);
  requireThat(record(policy['control-plane']) && record(policy['control-plane'].scope),
    'missing trusted CAO enrollment');
  return {
    policy_sha256: digest(bytes),
    enrollment_sha256: digest(JSON.stringify(policy['control-plane'].scope)),
  };
}

export function runContext(env = process.env) {
  const context = {
    control_repository: env.GITHUB_REPOSITORY,
    workflow_revision: env.SQUAD_WORKFLOW_SHA,
    issue_number: Number(env.SQUAD_ISSUE_NUMBER),
    run_id: env.GITHUB_RUN_ID,
    run_attempt: env.GITHUB_RUN_ATTEMPT,
  };
  requireThat(REPOSITORY.test(context.control_repository || '') &&
    REVISION.test(context.workflow_revision || '') &&
    Number.isSafeInteger(context.issue_number) && context.issue_number > 0 &&
    POSITIVE.test(context.run_id || '') && POSITIVE.test(context.run_attempt || ''),
  'invalid immutable workflow/run/issue context');
  return context;
}

function timestamp(value) {
  requireThat(typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)), 'invalid capture/expiry timestamp');
  return Date.parse(value);
}

/** Validate exact identity, freshness, hashes, regular paths and total bounds. */
export function validateBundle(directory, expected, now = Date.now()) {
  const manifestBytes = readBounded(trustedPath(directory, 'manifest.json'), 256 * 1024);
  const manifest = JSON.parse(manifestBytes);
  keys(manifest, [
    'schema', 'control_repository', 'workflow_revision', 'policy_sha256', 'enrollment_sha256',
    'issue_number', 'run_id', 'run_attempt', 'captured_at', 'expires_at', 'repositories', 'documents',
  ], 'bundle manifest');
  requireThat(manifest.schema === 'cao-squad-wave-evidence/v1', 'unsupported bundle schema');
  for (const field of ['control_repository', 'workflow_revision', 'issue_number', 'run_id', 'run_attempt']) {
    requireThat(manifest[field] === expected[field], `bundle ${field} mismatch`);
  }
  requireThat(SHA256.test(manifest.policy_sha256) && SHA256.test(manifest.enrollment_sha256),
    'invalid policy/enrollment digest');
  for (const field of ['policy_sha256', 'enrollment_sha256']) {
    if (expected[field] !== undefined) requireThat(manifest[field] === expected[field], `${field} changed`);
  }
  const captured = timestamp(manifest.captured_at);
  const expires = timestamp(manifest.expires_at);
  requireThat(captured <= now && now - captured <= MAX_AGE_MS &&
    expires > now && expires - captured === MAX_AGE_MS,
  'bundle is stale, future-dated or has an invalid expiry');
  requireThat(record(manifest.documents) && Object.keys(manifest.documents).length > 0 &&
    Object.keys(manifest.documents).length <= MAX_DOCUMENTS &&
    Object.hasOwn(manifest.documents, 'farm/evidence.json') &&
    Object.hasOwn(manifest.documents, 'farm/INDEX.md'), 'missing or oversized document inventory');
  const declared = Object.keys(manifest.documents).sort();
  let total = manifestBytes.length;
  for (const name of declared) {
    safeRelative(name);
    requireThat(name.startsWith('farm/') && SHA256.test(manifest.documents[name]),
      'invalid evidence document');
    const bytes = readBounded(trustedPath(directory, name), MAX_BUNDLE_BYTES);
    total += bytes.length;
    requireThat(total <= MAX_BUNDLE_BYTES, 'bundle exceeds 8 MiB');
    requireThat(digest(bytes) === manifest.documents[name], 'evidence document hash mismatch');
  }
  requireThat(JSON.stringify(walk(directory).sort()) ===
    JSON.stringify(['manifest.json', ...declared].sort()), 'bundle has missing or unlisted files');
  requireThat(Array.isArray(manifest.repositories) && manifest.repositories.length > 0 &&
    manifest.repositories.length <= 16, 'missing or oversized repository coverage');
  const repositories = new Set();
  for (const repository of manifest.repositories) {
    keys(repository, [
      'repository', 'revision', 'destination', 'files', 'total_files', 'tree_paths_shown',
    ], 'repository evidence');
    requireThat(REPOSITORY.test(repository.repository) && REVISION.test(repository.revision) &&
      !repositories.has(repository.repository.toLowerCase()), 'invalid or duplicate repository');
    repositories.add(repository.repository.toLowerCase());
    safeRelative(repository.destination);
    requireThat(repository.destination === `farm/${repository.repository}/SNAPSHOT.md`,
      'invalid repository destination');
    requireThat(Number.isSafeInteger(repository.total_files) && repository.total_files >= 0 &&
      Number.isSafeInteger(repository.tree_paths_shown) && repository.tree_paths_shown >= 0 &&
      repository.tree_paths_shown <= repository.total_files &&
      Array.isArray(repository.files) && repository.files.length <= MAX_DOCUMENTS &&
      repository.files.length <= repository.total_files, 'invalid repository file counts');
    const paths = new Set();
    for (const file of repository.files) {
      keys(file, ['path', 'truncated'], 'source file');
      safeSourcePath(file.path);
      requireThat(typeof file.truncated === 'boolean' && !paths.has(file.path), 'invalid source file');
      paths.add(file.path);
    }
  }
  const closed = [
    'farm/INDEX.md', 'farm/evidence.json',
    ...manifest.repositories.map(repository => repository.destination),
  ].sort();
  requireThat(JSON.stringify(declared) === JSON.stringify(closed), 'bundle document set is not closed');
  return { manifest, manifest_sha256: digest(manifestBytes) };
}

export function artifactName(context) {
  requireThat(POSITIVE.test(context.run_id) && POSITIVE.test(context.run_attempt), 'invalid artifact identity');
  return `squad-cao-evidence-${context.run_id}-${context.run_attempt}`;
}

/** Only the trusted writer adds this to the structured research envelope. */
export function provenance(bundle) {
  const { manifest: wave, manifest_sha256 } = bundle;
  return {
    provider: 'cao-farm-v1',
    artifact: artifactName(wave),
    manifest_sha256,
    control_repository: wave.control_repository,
    workflow_revision: wave.workflow_revision,
    policy_sha256: wave.policy_sha256,
    enrollment_sha256: wave.enrollment_sha256,
    issue_number: wave.issue_number,
    run_id: wave.run_id,
    run_attempt: wave.run_attempt,
    captured_at: wave.captured_at,
    expires_at: wave.expires_at,
  };
}

export function provenanceMarkdown(bundle) {
  const wave = provenance(bundle);
  return '\n\n### Evidence provenance\n\n' +
    `Verified CAO wave: [run ${wave.run_id}, attempt ${wave.run_attempt}]` +
    `(https://github.com/${wave.control_repository}/actions/runs/${wave.run_id})` +
    ` · artifact \`${wave.artifact}\` · captured ${wave.captured_at}.\n\n` +
    `Manifest SHA-256: \`${wave.manifest_sha256}\`. ` +
    'Committed install-time farm files remain historical bootstrap evidence.';
}

const DRAFT_MODES = new Set([
  'triage', 'triage revise', 'plan', 'plan revise', 'plan program',
  'plan program revise',
]);

export function evidenceMode(root, payload, eventName) {
  const command = classifySquadCommand(payload, eventName);
  if (command.status !== 'accepted' ||
      !(command.mode === 'research' || DRAFT_MODES.has(command.mode)) || !readProvider(root)) return null;
  return command.mode;
}

export function evidenceRequired(root, payload, eventName) {
  return Boolean(evidenceMode(root, payload, eventName));
}

/** Runtime gets a minimal environment, never ambient NODE_OPTIONS or model data. */
export function invokeProvider(root, context, { collect = false, directory = BUNDLE, env = process.env } = {}) {
  const descriptor = readProvider(root);
  requireThat(descriptor, 'provider disappeared');
  const childEnv = {
    PATH: env.PATH || '/usr/bin:/bin',
    GITHUB_REPOSITORY: context.control_repository,
    SQUAD_WORKFLOW_SHA: context.workflow_revision,
    SQUAD_ISSUE_NUMBER: String(context.issue_number),
    GITHUB_RUN_ID: context.run_id,
    GITHUB_RUN_ATTEMPT: context.run_attempt,
  };
  if (collect) {
    requireThat(env.GH_AW_GITHUB_AUTH_MODE === 'app',
      'authentication mode unsupported in v1; existing CAO Actions App authentication is required');
    requireThat(POSITIVE.test(env.GH_AW_GITHUB_READ_APP_ID || '') &&
      typeof env.GH_AW_GITHUB_READ_APP_PRIVATE_KEY === 'string' &&
      env.GH_AW_GITHUB_READ_APP_PRIVATE_KEY.length > 0, 'missing CAO Actions App read credentials');
    childEnv.GH_AW_GITHUB_AUTH_MODE = 'app';
    childEnv.GH_AW_GITHUB_READ_APP_ID = env.GH_AW_GITHUB_READ_APP_ID;
    childEnv.GH_AW_GITHUB_READ_APP_PRIVATE_KEY = env.GH_AW_GITHUB_READ_APP_PRIVATE_KEY;
  } else {
    childEnv.SQUAD_EVIDENCE_BUNDLE = directory;
  }
  const result = spawnSync(process.execPath, [
    trustedPath(root, descriptor.runtime), ...(collect ? [] : ['--validate-bundle']),
  ], {
    cwd: realpathSync(root), env: childEnv, timeout: 120_000, stdio: 'ignore',
  });
  // Never print runtime stdout/stderr or secret-bearing exception messages.
  requireThat(!result.error && result.status === 0, 'trusted CAO runtime failed; research stopped');
}

export function verifyProviderBundle(root, directory, expected, now = Date.now(), env = process.env) {
  const current = policyDigests(root);
  const verified = validateBundle(directory, {
    ...expected, enrollment_sha256: current.enrollment_sha256,
  }, now);
  if (expected.manifest_sha256 !== undefined) {
    requireThat(verified.manifest_sha256 === expected.manifest_sha256, 'referenced manifest hash mismatch');
  }
  // The provider revalidates against the current trusted run, not the referenced wave's run.
  invokeProvider(root, runContext(env), { directory });
  return verified;
}

export async function prepareEvidence({ root, github, payload, core, env = process.env }) {
  const mode = evidenceMode(root, payload, env.SQUAD_EVENT_NAME);
  core.setOutput('enabled', false);
  if (!mode) return;
  const current = runContext(env);
  requireThat(!existsSync(BUNDLE), 'pre-agent evidence directory is not empty');
  try {
    if (mode === 'research') {
      invokeProvider(root, current, { collect: true, env });
      verifyProviderBundle(root, BUNDLE, { ...current, ...policyDigests(root) }, Date.now(), env);
    } else {
      const reference = await researchReference(github, current);
      await restoreReference(github, reference, BUNDLE);
      const verified = verifyProviderBundle(root, BUNDLE, reference, Date.now(), env);
      requireThat(isDeepStrictEqual(provenance(verified), reference),
        'restored wave provenance mismatch; run /squad research');
    }
    core.setOutput('enabled', true);
  } catch (error) {
    // Incomplete evidence must never survive as a model-readable fallback.
    rmSync(BUNDLE, { force: true, recursive: true });
    throw error;
  }
}

export async function validatePublication({ root, directory, github, payload, env = process.env }) {
  const mode = evidenceMode(root, payload, env.SQUAD_EVENT_NAME);
  if (!mode) return null;
  const current = runContext(env);
  const expected = mode === 'research'
    ? { ...current, ...policyDigests(root) } : await researchReference(github, current);
  return verifyProviderBundle(root, directory, expected, Date.now(), env);
}

/** A bot-authored native research envelope is the sole artifact selector. */
export async function researchReference(github, context) {
  const [owner, repo] = context.control_repository.split('/');
  const candidates = [];
  let complete = false;
  for (let page = 1; page <= 5; page++) {
    const { data: comments } = await github.rest.issues.listComments({
      owner, repo, issue_number: context.issue_number, per_page: 100, page,
    });
    for (const comment of comments) {
      if (comment.user?.login !== 'github-actions[bot]' || comment.user?.type !== 'Bot') continue;
      const match = /\n\nStructured data:\s*\n```json\n([^`]+)\n```\s*$/.exec(comment.body || '');
      if (!match) continue;
      let data;
      try { data = JSON.parse(match[1]); } catch { continue; }
      if (data.squad_artifact === 'research' && data.schema_version === '1' &&
          data.origin_issue === context.issue_number) {
        candidates.push({ id: comment.id, updated_at: comment.updated_at, evidence: data.evidence });
      }
    }
    if (comments.length < 100) { complete = true; break; }
  }
  requireThat(complete, 'research comment scan incomplete; run /squad research');
  candidates.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)) || a.id - b.id);
  const reference = candidates.at(-1)?.evidence;
  requireThat(record(reference), 'missing referenced wave; run /squad research');
  keys(reference, [
    'provider', 'artifact', 'manifest_sha256', 'control_repository', 'workflow_revision',
    'policy_sha256', 'enrollment_sha256', 'issue_number', 'run_id', 'run_attempt', 'captured_at', 'expires_at',
  ], 'research evidence reference');
  requireThat(reference.provider === 'cao-farm-v1' && SHA256.test(reference.manifest_sha256) &&
    REVISION.test(reference.workflow_revision) &&
    reference.control_repository === context.control_repository &&
    reference.issue_number === context.issue_number &&
    reference.artifact === artifactName(reference), 'invalid research wave reference');
  return reference;
}

/** Actions ZIP, not a general-purpose extractor: bounded files only, no links. */
export function unpackArtifact(bytes, destination) {
  requireThat(bytes.length <= MAX_BUNDLE_BYTES, 'compressed artifact exceeds 8 MiB');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  requireThat(end >= 0 && bytes.readUInt32LE(end) === 0x06054b50, 'invalid artifact ZIP');
  requireThat(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0 &&
    bytes.readUInt16LE(end + 8) === bytes.readUInt16LE(end + 10) &&
    end + 22 + bytes.readUInt16LE(end + 20) === bytes.length, 'unsupported artifact ZIP');
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  requireThat(count > 0 && count <= MAX_DOCUMENTS + 1 &&
    cursor + bytes.readUInt32LE(end + 12) === end, 'invalid artifact ZIP directory');
  const entries = [];
  const names = new Set();
  let total = 0;
  for (let index = 0; index < count; index++) {
    requireThat(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'invalid ZIP entry');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const local = bytes.readUInt32LE(cursor + 42);
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    safeRelative(name);
    requireThat(!names.has(name) && (name === 'manifest.json' || name.startsWith('farm/')) &&
      !(flags & 1) && [0, 8].includes(method) && ((mode & 0xf000) === 0 || (mode & 0xf000) === 0x8000),
    'unsupported, duplicate or linked artifact entry');
    names.add(name);
    total += size;
    requireThat(total <= MAX_BUNDLE_BYTES && local + 30 <= bytes.length &&
      bytes.readUInt32LE(local) === 0x04034b50, 'oversized or invalid ZIP local entry');
    const localNameLength = bytes.readUInt16LE(local + 26);
    const start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    requireThat(bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') === name &&
      start + compressed <= bytes.readUInt32LE(end + 16), 'ZIP entry mismatch');
    const packed = bytes.subarray(start, start + compressed);
    const content = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: MAX_BUNDLE_BYTES });
    requireThat(content.length === size, 'ZIP size mismatch');
    entries.push([name, content]);
    cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  requireThat(cursor === end, 'unexpected ZIP directory data');
  requireThat(!existsSync(destination), 'artifact destination must be empty');
  mkdirSync(destination, { recursive: true });
  for (const [name, content] of entries) {
    const path = resolve(destination, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
  }
}

export async function restoreReference(github, reference, directory) {
  const [owner, repo] = reference.control_repository.split('/');
  const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
    owner, repo, run_id: reference.run_id, attempt_number: reference.run_attempt,
  });
  requireThat(String(run.id) === reference.run_id && String(run.run_attempt) === reference.run_attempt &&
    run.repository?.full_name === reference.control_repository &&
    run.path === '.github/workflows/squad.lock.yml' && run.conclusion === 'success',
  'referenced run is not a successful native Squad workflow; run /squad research');
  const { data } = await github.rest.actions.listWorkflowRunArtifacts({
    owner, repo, run_id: reference.run_id, name: reference.artifact, per_page: 100,
  });
  const matches = data.artifacts.filter(item => item.name === reference.artifact && !item.expired);
  requireThat(data.total_count === 1 && matches.length === 1 &&
    matches[0].size_in_bytes <= MAX_BUNDLE_BYTES, 'referenced wave unavailable; run /squad research');
  const response = await github.rest.actions.downloadArtifact({
    owner, repo, artifact_id: matches[0].id, archive_format: 'zip',
  });
  unpackArtifact(Buffer.from(response.data), directory);
}
