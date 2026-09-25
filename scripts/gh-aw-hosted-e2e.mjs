import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertInstalledManifestIdentity,
  loadBundleContract,
  loadInstalledBundleContract,
} from './gh-aw-hosted-e2e-contract.mjs';
import {
  CONTRACT_DESTINATION,
  OWNERSHIP_ENTRY_COUNT,
  OWNERSHIP_DESTINATION,
  PACKAGE_NAME,
  TRIGGER_PROBE_DESTINATION,
  checkSource,
  verifyInstall,
} from '../workflows/shared/squad-install-verifier.mjs';

const TRUSTED_SOURCE = Object.freeze({
  repository: 'bradygaster/squad',
  repositoryId: 1151205052,
  owner: 'bradygaster',
  ownerId: 41929050,
});
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_CHILD_ENV = Object.freeze([
  'CI',
  'GH_CONFIG_DIR',
  'GH_HOST',
  'HOME',
  'LANG',
  'LC_ALL',
  'NO_COLOR',
  'PATH',
  'SHELL',
  'TERM',
  'TMPDIR',
]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replaceAll('-', '_');
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function requireArg(args, name) {
  const value = args[name];
  if (!value || value === true) throw new Error(`--${name.replaceAll('_', '-')} is required`);
  return value;
}

export function sanitizedEnvironment(extra = {}) {
  const env = Object.fromEntries(
    SAFE_CHILD_ENV.filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  return { ...env, ...extra };
}

export function runChild(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: sanitizedEnvironment(options.env),
    stdio: options.capture === false ? 'inherit' : 'pipe',
    timeout: options.timeout ?? 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return (result.stdout ?? '').trim();
}

function privileged(command, args, options = {}) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required for the trusted hosted journey.');
  return runChild(command, args, { ...options, env: { ...options.env, GH_TOKEN: token } });
}

function ghJson(args, options = {}) {
  const output = privileged('gh', args, options);
  return output ? JSON.parse(output) : null;
}

function sourceGhJson(args) {
  const token = process.env.SOURCE_READ_TOKEN ?? process.env.GH_TOKEN;
  if (!token) throw new Error('A source repository read token is required.');
  const output = runChild('gh', args, { env: { GH_TOKEN: token } });
  return output ? JSON.parse(output) : null;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sleep(milliseconds) {
  runChild('sleep', [String(milliseconds / 1000)]);
}

function assertSha(value, label) {
  if (!SHA_PATTERN.test(value)) throw new Error(`${label} must be a lowercase 40-character SHA.`);
}

function canonicalRemote(url) {
  return url
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .toLowerCase();
}

export function sourcePreflight(args, repositoryRoot) {
  const sourceRepository = requireArg(args, 'source_repository');
  const sourceRepositoryId = Number(requireArg(args, 'source_repository_id'));
  const sourceRef = requireArg(args, 'source_ref');
  const sourceSha = requireArg(args, 'source_sha');
  assertSha(sourceSha, 'Source SHA');
  if (sourceRepository !== TRUSTED_SOURCE.repository
    || sourceRepositoryId !== TRUSTED_SOURCE.repositoryId) {
    throw new Error('Hosted E2E controller must run from the trusted Squad repository.');
  }
  const info = sourceGhJson([
    'api', `repos/${TRUSTED_SOURCE.repository}`,
    '--jq', '{id,full_name,default_branch,owner:{login:.owner.login,id:.owner.id}}',
  ]);
  if (info.id !== TRUSTED_SOURCE.repositoryId
    || info.full_name !== TRUSTED_SOURCE.repository
    || info.owner.login !== TRUSTED_SOURCE.owner
    || info.owner.id !== TRUSTED_SOURCE.ownerId) {
    throw new Error('Trusted source repository identity or state is invalid.');
  }
  if (sourceRef !== `refs/heads/${info.default_branch}`) {
    throw new Error('Hosted E2E controller must run from the repository default branch ref.');
  }
  const branch = sourceGhJson([
    'api', `repos/${TRUSTED_SOURCE.repository}/branches/${info.default_branch}`,
    '--jq', '{protected,sha:.commit.sha}',
  ]);
  if (branch.protected !== true || branch.sha !== sourceSha) {
    throw new Error('Trusted source must be the protected default-branch head.');
  }
  const checkedOut = runChild('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot });
  if (checkedOut !== sourceSha) throw new Error('Checked-out HEAD does not match the trusted source SHA.');
  const status = runChild('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repositoryRoot });
  if (status) throw new Error('Trusted source checkout must be clean.');
  const remote = runChild('git', ['remote', 'get-url', 'origin'], { cwd: repositoryRoot });
  if (canonicalRemote(remote) !== `https://github.com/${TRUSTED_SOURCE.repository}`) {
    throw new Error('Checked-out origin is not the trusted Squad repository.');
  }
  const integrityFailures = checkSource(repositoryRoot);
  if (integrityFailures.length > 0) {
    throw new Error(`Trusted source integrity failed:\n${integrityFailures.join('\n')}`);
  }
  return { ...info, sha: sourceSha };
}

function assertExactStagedDiff(cwd, expected) {
  const staged = runChild('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd })
    .split('\n').filter(Boolean).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(staged) !== JSON.stringify(wanted)) {
    throw new Error(`Staged diff mismatch.\nExpected: ${wanted.join(', ')}\nActual: ${staged.join(', ')}`);
  }
  const deleted = runChild('git', ['diff', '--cached', '--name-only', '--diff-filter=D'], { cwd });
  if (deleted) throw new Error(`Staged deletions are forbidden: ${deleted}`);
}

export function authorizeTarget(args, sourceInfo) {
  const target = requireArg(args, 'target');
  const expectedRepositoryId = Number(requireArg(args, 'target_repository_id'));
  const expectedOwnerId = Number(requireArg(args, 'target_owner_id'));
  const expectedActorLogin = requireArg(args, 'pat_actor_login');
  const expectedActorId = Number(requireArg(args, 'pat_actor_id'));
  if (!Number.isSafeInteger(expectedRepositoryId) || !Number.isSafeInteger(expectedOwnerId)
    || !Number.isSafeInteger(expectedActorId)) {
    throw new Error('Configured target and actor IDs must be numeric.');
  }
  const actor = ghJson(['api', 'user', '--jq', '{login,id}']);
  if (actor.login !== expectedActorLogin || actor.id !== expectedActorId) {
    throw new Error('PAT actor identity does not match the configured login and numeric ID.');
  }
  const info = ghJson([
    'api', `repos/${target}`,
    '--jq',
    '{id,full_name,default_branch,owner:{login:.owner.login,id:.owner.id},private,has_issues,allow_merge_commit}',
  ]);
  if (info.full_name !== target) throw new Error('Target repository redirected or transferred.');
  if (info.id !== expectedRepositoryId || info.owner.id !== expectedOwnerId) {
    throw new Error('Target repository or owner numeric identity does not match configuration.');
  }
  if (info.full_name === sourceInfo.full_name || info.id === sourceInfo.id) {
    throw new Error('The hosted E2E target must not be the source repository.');
  }
  const [targetOwner] = target.split('/');
  if (info.owner.login !== targetOwner) throw new Error('Target owner login is not canonical.');
  if (info.private) throw new Error('Hosted E2E consumers must be public.');
  if (!info.has_issues || !info.allow_merge_commit) {
    throw new Error('Target must enable Issues and merge commits.');
  }
  const workflowPermissions = ghJson(['api', `repos/${target}/actions/permissions/workflow`]);
  if (workflowPermissions.default_workflow_permissions !== 'read'
    || workflowPermissions.can_approve_pull_request_reviews !== true) {
    throw new Error('Target Actions permissions do not match the supported secure configuration.');
  }
  return { target, info, workflowPermissions, actor };
}

function waitForBootstrapRun(target, headSha, startedAt, evidence) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const runs = ghJson([
      'run', 'list', '--repo', target, '--workflow', 'squad-bootstrap.lock.yml',
      '--event', 'push', '--json', 'databaseId,headSha,status,conclusion,url,createdAt',
      '--limit', '30',
    ]);
    const matching = runs.filter(
      (run) => run.headSha === headSha && Date.parse(run.createdAt) >= startedAt - 60_000,
    );
    if (matching.length > 1) throw new Error(`Expected exactly one bootstrap run for ${headSha}; found ${matching.length}.`);
    if (matching.length === 1 && matching[0].status === 'completed') {
      writeJson(resolve(evidence, `bootstrap-run-${headSha.slice(0, 12)}.json`), matching[0]);
      if (matching[0].conclusion !== 'success') throw new Error(`Bootstrap run failed: ${matching[0].url}`);
      return matching[0];
    }
    sleep(10_000);
  }
  throw new Error(`Timed out waiting for bootstrap run at ${headSha}.`);
}

function bootstrapOutputs(target) {
  const castPrs = ghJson([
    'pr', 'list', '--repo', target, '--state', 'all', '--head', 'squad/bootstrap-cast',
    '--json', 'number,url,isDraft,title,headRefName,baseRefName,state',
  ]);
  const issues = ghJson([
    'issue', 'list', '--repo', target, '--state', 'all', '--limit', '100',
    '--search', '"[Research Proposals] Agent-discovered repo opportunities" in:title',
    '--json', 'number,url,title,body,state',
  ]).filter((issue) => issue.title === '[Research Proposals] Agent-discovered repo opportunities'
    && issue.body.includes('<!-- squad:bootstrap-opportunities schema=1 -->'));
  return { castPrs, issues };
}

function waitForBootstrapOutputs(target) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const outputs = bootstrapOutputs(target);
    if (outputs.castPrs.length === 1 && outputs.castPrs[0].isDraft && outputs.issues.length === 1) {
      return { castPr: outputs.castPrs[0], researchIssue: outputs.issues[0] };
    }
    sleep(10_000);
  }
  throw new Error('Timed out waiting for the draft Cast PR and bootstrap research issue.');
}

function createAndMergePr({ cwd, target, defaultBranch, branch, title, body, evidence }) {
  privileged('gh', ['auth', 'setup-git']);
  privileged('git', ['push', '--set-upstream', 'origin', branch], { cwd, capture: false });
  const prUrl = privileged('gh', [
    'pr', 'create', '--repo', target, '--base', defaultBranch, '--head', branch,
    '--title', title, '--body', body,
  ], { cwd });
  const pr = ghJson(['pr', 'view', prUrl, '--repo', target, '--json', 'number,url,state,headRefName,baseRefName']);
  writeJson(resolve(evidence, `pr-${pr.number}-created.json`), pr);
  privileged('gh', ['pr', 'merge', String(pr.number), '--repo', target, '--merge', '--delete-branch'], {
    cwd,
    capture: false,
    timeout: 300_000,
  });
  const merged = ghJson([
    'pr', 'view', String(pr.number), '--repo', target,
    '--json', 'number,url,state,mergedAt,mergeCommit',
  ]);
  if (merged.state !== 'MERGED' || !merged.mergeCommit?.oid) throw new Error(`PR ${pr.url} did not merge.`);
  writeJson(resolve(evidence, `pr-${pr.number}-merged.json`), merged);
  return merged;
}

function verifyInstalledTrusted(repositoryRoot, checkout, sourceSha) {
  assertInstalledManifestIdentity(repositoryRoot, checkout);
  const result = verifyInstall(checkout, { expectedRevision: sourceSha });
  if (result.failures.length > 0) throw new Error(result.failures.join('\n'));
  const ownership = JSON.parse(readFileSync(
    resolve(checkout, OWNERSHIP_DESTINATION),
    'utf8',
  ));
  if (ownership.files.length !== OWNERSHIP_ENTRY_COUNT) {
    throw new Error(`Expected ${OWNERSHIP_ENTRY_COUNT} owned package files; found ${ownership.files.length}.`);
  }
}

function hosted(args, repositoryRoot) {
  const sourceInfo = sourcePreflight(args, repositoryRoot);
  const sourceSha = requireArg(args, 'source_sha');
  const evidence = resolve(requireArg(args, 'evidence'));
  const contract = loadBundleContract(repositoryRoot);
  if (contract.workflows.length !== 7 || contract.runtime.length !== 15 || contract.skills.length !== 1) {
    throw new Error('Trusted package topology must be exactly 7 workflows, 15 runtime resources, and 1 skill.');
  }
  const targetState = authorizeTarget(args, sourceInfo);
  mkdirSync(evidence, { recursive: true });
  writeJson(resolve(evidence, 'preflight.json'), targetState);

  const checkout = resolve(dirname(evidence), `squad-gh-aw-e2e-consumer-${process.env.GITHUB_RUN_ID ?? sourceSha.slice(0, 12)}`);
  const remoteBranches = new Set();
  const createdPrs = new Set();
  rmSync(checkout, { recursive: true, force: true });
  try {
    privileged('gh', ['repo', 'clone', targetState.target, checkout], {
      capture: false,
      timeout: 300_000,
    });
    runChild('git', ['config', 'user.name', 'Squad hosted E2E'], { cwd: checkout });
    runChild('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], { cwd: checkout });
    const installBranch = `squad-e2e/install-${process.env.GITHUB_RUN_ID ?? sourceSha.slice(0, 12)}`;
    remoteBranches.add(installBranch);
    runChild('git', ['switch', '-c', installBranch], { cwd: checkout });

    const sourceReadToken = process.env.SOURCE_READ_TOKEN;
    if (!sourceReadToken) throw new Error('SOURCE_READ_TOKEN is required for immutable package retrieval.');
    runChild('gh', ['aw', 'add', `${PACKAGE_NAME}@${sourceSha}`], {
      cwd: checkout,
      capture: false,
      timeout: 600_000,
      env: { GH_TOKEN: sourceReadToken },
    });
    runChild('node', ['.github/workflows/shared/squad-install-verifier.mjs', '--materialize-runtime'], {
      cwd: checkout,
      capture: false,
    });
    runChild('gh', ['aw', 'compile', '--strict', '--approve', '--no-check-update'], {
      cwd: checkout,
      capture: false,
      timeout: 600_000,
    });
    runChild('gh', ['aw', 'compile', '--strict', '--no-check-update'], {
      cwd: checkout,
      capture: false,
      timeout: 600_000,
    });
    verifyInstalledTrusted(repositoryRoot, checkout, sourceSha);

    const installPaths = ['.gitattributes', '.github/aw', '.github/workflows', '.github/skills', '.vscode']
      .filter((path) => existsSync(resolve(checkout, path)));
    runChild('git', ['add', '--', ...installPaths], { cwd: checkout });
    runChild('git', ['commit', '-m', 'ci: install Squad agentic workflows'], { cwd: checkout });
    const installStartedAt = Date.now();
    const installation = createAndMergePr({
      cwd: checkout,
      target: targetState.target,
      defaultBranch: targetState.info.default_branch,
      branch: installBranch,
      title: 'ci: install Squad agentic workflows',
      body: 'One-shot hosted E2E installation. Generated Squad work remains human-reviewed and is not merged.',
      evidence,
    });
    createdPrs.add(installation.number);
    const installRun = waitForBootstrapRun(
      targetState.target,
      installation.mergeCommit.oid,
      installStartedAt,
      evidence,
    );
    const outputs = waitForBootstrapOutputs(targetState.target);

    runChild('git', ['fetch', 'origin', targetState.info.default_branch], { cwd: checkout });
    const probeBranch = `squad-e2e/probe-${process.env.GITHUB_RUN_ID ?? sourceSha.slice(0, 12)}`;
    remoteBranches.add(probeBranch);
    runChild('git', ['switch', '-C', probeBranch, `origin/${targetState.info.default_branch}`], { cwd: checkout });
    verifyInstalledTrusted(repositoryRoot, checkout, sourceSha);
    const probe = {
      schema_version: 1,
      kind: 'squad-bootstrap-trigger-probe',
      trusted_source_sha: sourceSha,
      hosted_run_id: String(process.env.GITHUB_RUN_ID ?? 'local'),
      install_merge_sha: installation.mergeCommit.oid,
      default_branch_sha: installation.mergeCommit.oid,
    };
    writeJson(resolve(checkout, TRIGGER_PROBE_DESTINATION), probe);
    verifyInstalledTrusted(repositoryRoot, checkout, sourceSha);
    runChild('git', ['add', '--', TRIGGER_PROBE_DESTINATION], { cwd: checkout });
    assertExactStagedDiff(checkout, new Set([TRIGGER_PROBE_DESTINATION]));
    runChild('git', ['commit', '-m', 'test: add Squad bootstrap trigger probe'], { cwd: checkout });
    const probeStartedAt = Date.now();
    const probeMerge = createAndMergePr({
      cwd: checkout,
      target: targetState.target,
      defaultBranch: targetState.info.default_branch,
      branch: probeBranch,
      title: 'test: add Squad bootstrap trigger probe',
      body: 'One-shot non-executable sentinel proving the bootstrap path trigger.',
      evidence,
    });
    createdPrs.add(probeMerge.number);
    const probeRun = waitForBootstrapRun(
      targetState.target,
      probeMerge.mergeCommit.oid,
      probeStartedAt,
      evidence,
    );
    const sentinel = ghJson([
      'api',
      `repos/${targetState.target}/contents/${TRIGGER_PROBE_DESTINATION}?ref=${targetState.info.default_branch}`,
      '--jq', '.content',
    ]);
    const decoded = Buffer.from(sentinel.replace(/\n/g, ''), 'base64').toString('utf8');
    if (decoded !== `${JSON.stringify(probe, null, 2)}\n`) throw new Error('Merged trigger sentinel bytes changed.');
    runChild('git', ['fetch', 'origin', targetState.info.default_branch], { cwd: checkout });
    runChild('git', ['reset', '--hard', `origin/${targetState.info.default_branch}`], { cwd: checkout });
    verifyInstalledTrusted(repositoryRoot, checkout, sourceSha);
    writeJson(resolve(evidence, 'summary.json'), {
      status: 'passed',
      target: targetState.target,
      source_sha: sourceSha,
      installation_pr: installation.number,
      installation_run: installRun.url,
      probe_pr: probeMerge.number,
      probe_run: probeRun.url,
      generated_cast_pr: outputs.castPr.url,
      generated_research_issue: outputs.researchIssue.url,
      generated_work_merged: false,
    });
  } finally {
    for (const prNumber of createdPrs) {
      try {
        const state = ghJson(['pr', 'view', String(prNumber), '--repo', targetState.target, '--json', 'state']);
        if (state.state === 'OPEN') privileged('gh', ['pr', 'close', String(prNumber), '--repo', targetState.target]);
      } catch (error) {
        console.error(`Failed to close E2E PR ${prNumber}: ${error.message}`);
      }
    }
    for (const branch of remoteBranches) {
      try {
        privileged('gh', ['api', '--method', 'DELETE', `repos/${targetState.target}/git/refs/heads/${branch}`]);
      } catch (error) {
        if (!/404|422/.test(error.message)) console.error(`Failed to delete E2E branch ${branch}: ${error.message}`);
      }
    }
    rmSync(checkout, { recursive: true, force: true });
  }
}

function diagnose(args) {
  const root = resolve(requireArg(args, 'root'));
  const contractRoot = resolve(requireArg(args, 'contract_root'));
  assertInstalledManifestIdentity(contractRoot, root);
  const contract = loadInstalledBundleContract(root);
  const findings = [];
  for (const entry of [
    ...contract.workflows.flatMap((workflow) => [
      [workflow.destination, workflow.source_sha256],
      [workflow.lock, undefined],
    ]),
    ...contract.runtime.map((runtime) => [runtime.destination, runtime.sha256]),
    ...contract.skills.map((skill) => [skill.destination, skill.sha256]),
  ]) {
    const [path, expected] = entry;
    if (!existsSync(resolve(root, path))) findings.push({ code: 'missing', path });
    else if (expected && contract.digest(path) !== expected) findings.push({ code: 'stale', path });
  }
  const result = { valid: findings.length === 0, findings };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

export function main(argv = process.argv.slice(2), repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const args = parseArgs(argv);
  if (args.command === 'source-preflight') {
    sourcePreflight(args, repositoryRoot);
    return 0;
  }
  if (args.command === 'hosted') {
    hosted(args, repositoryRoot);
    return 0;
  }
  if (args.command === 'diagnose') return diagnose(args);
  throw new Error('Usage: gh-aw-hosted-e2e.mjs <source-preflight|hosted|diagnose> [options]');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
