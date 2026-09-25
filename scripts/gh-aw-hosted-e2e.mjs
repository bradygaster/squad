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
const INSTALL_PR_TITLE = 'ci: install Squad agentic workflows';
const PROBE_PR_TITLE = 'test: add Squad bootstrap trigger probe';
const CAST_BRANCH = 'squad/bootstrap-cast';
const CAST_PR_TITLE = '[squad] Cast your Squad';
const RESEARCH_ISSUE_TITLE = '[Research Proposals] Agent-discovered repo opportunities';
const RESEARCH_MARKER = '<!-- squad:bootstrap-opportunities schema=1 -->';
const PROVENANCE_MARKER_PATTERN = /^<!-- squad:bootstrap-provenance (\{[^\r\n]+\}) -->$/gm;
const ACTIONS_BOT_LOGIN = 'github-actions[bot]';
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

export function sanitizedEnvironment(extra = {}, { allowGitHubToken = false } = {}) {
  if ('SQUAD_GH_AW_E2E_TOKEN' in extra) {
    throw new Error('SQUAD_GH_AW_E2E_TOKEN must never be passed to a child process.');
  }
  if ('GH_TOKEN' in extra && !allowGitHubToken) {
    throw new Error('GH_TOKEN requires an explicitly privileged or source-read child process.');
  }
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
    env: sanitizedEnvironment(options.env, { allowGitHubToken: options.allowGitHubToken === true }),
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
  return runChild(command, args, {
    ...options,
    allowGitHubToken: true,
    env: { ...options.env, GH_TOKEN: token },
  });
}

function ghJson(args, options = {}) {
  const output = privileged('gh', args, options);
  return output ? JSON.parse(output) : null;
}

const githubAdapter = Object.freeze({
  getDefaultBranchSha(target, branch) {
    return ghJson([
      'api', `repos/${target}/branches/${branch}`,
      '--jq', '{sha:.commit.sha}',
    ]).sha;
  },
  getTree(target, sha) {
    return ghJson([
      'api', `repos/${target}/git/trees/${sha}?recursive=1`,
      '--jq', '{truncated,paths:[.tree[] | select(.type == "blob") | .path]}',
    ]);
  },
  listBranches(target) {
    return ghJson([
      'api', '--paginate', '--slurp', `repos/${target}/branches?per_page=100`,
    ]).flat().map((branch) => ({ name: branch.name, sha: branch.commit.sha }));
  },
  listPullRequests(target) {
    return ghJson([
      'api', '--paginate', '--slurp', `repos/${target}/pulls?state=all&per_page=100`,
    ]).flat().map((pullRequest) => ({
      number: pullRequest.number,
      url: pullRequest.html_url,
      title: pullRequest.title,
      body: pullRequest.body,
      createdAt: pullRequest.created_at,
      isDraft: pullRequest.draft,
      headRefName: pullRequest.head.ref,
      headRepository: pullRequest.head.repo?.full_name,
      headSha: pullRequest.head.sha,
      baseRefName: pullRequest.base.ref,
      baseSha: pullRequest.base.sha,
      author: {
        login: pullRequest.user.login,
        id: pullRequest.user.id,
        type: pullRequest.user.type,
      },
      state: pullRequest.state,
    }));
  },
  listIssues(target) {
    return ghJson([
      'api', '--paginate', '--slurp', `repos/${target}/issues?state=all&per_page=100`,
    ]).flat().filter((issue) => !issue.pull_request).map((issue) => ({
      number: issue.number,
      url: issue.html_url,
      title: issue.title,
      body: issue.body,
      createdAt: issue.created_at,
      author: {
        login: issue.user.login,
        id: issue.user.id,
        type: issue.user.type,
      },
      state: issue.state,
    }));
  },
  getUser(login) {
    return ghJson([
      'api', `users/${login}`,
      '--jq', '{login,id,type}',
    ]);
  },
});

function sourceGhJson(args) {
  const token = process.env.SOURCE_READ_TOKEN ?? process.env.GH_TOKEN;
  if (!token) throw new Error('A source repository read token is required.');
  const output = runChild('gh', args, { allowGitHubToken: true, env: { GH_TOKEN: token } });
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

function packageArtifactCategories(contract) {
  return {
    workflowDestinations: contract.workflows.map(({ destination }) => destination),
    workflowLocks: contract.workflows.map(({ lock }) => lock),
    runtimePackageDestinations: contract.runtime.map(({ packageDestination }) => packageDestination),
    runtimeDestinations: contract.runtime.map(({ destination }) => destination),
    manifest: [CONTRACT_DESTINATION],
    ownership: [OWNERSHIP_DESTINATION],
    skill: contract.skills.map(({ destination }) => destination),
    triggerSentinel: [TRIGGER_PROBE_DESTINATION],
  };
}

function matchingPriorRunArtifacts(branches, pullRequests, issues) {
  return {
    branches: branches.filter(({ name }) => name.startsWith('squad-e2e/install-')
      || name.startsWith('squad-e2e/probe-')
      || name === CAST_BRANCH),
    pullRequests: pullRequests.filter(({ headRefName, title }) => (
      headRefName.startsWith('squad-e2e/install-')
      || headRefName.startsWith('squad-e2e/probe-')
      || headRefName === CAST_BRANCH
      || title === INSTALL_PR_TITLE
      || title === PROBE_PR_TITLE
      || title === CAST_PR_TITLE
    )),
    issues: issues.filter(({ title, body }) => (
      title === RESEARCH_ISSUE_TITLE || (body ?? '').includes(RESEARCH_MARKER)
    )),
  };
}

export function assertPristineTarget(target, defaultBranch, contract, github = githubAdapter, now = Date.now) {
  if (contract.workflows.length !== 7 || contract.runtime.length !== 15 || contract.skills.length !== 1) {
    throw new Error('Trusted package topology must be exactly 7 workflows, 15 runtime resources, and 1 skill.');
  }
  const defaultBranchSha = github.getDefaultBranchSha(target, defaultBranch);
  assertSha(defaultBranchSha, 'Target default-branch SHA');
  const tree = github.getTree(target, defaultBranchSha);
  if (tree.truncated) throw new Error('Target default-branch tree response was truncated.');
  const paths = new Set(tree.paths);
  const categories = packageArtifactCategories(contract);
  const existingPaths = Object.entries(categories).flatMap(([category, candidates]) => (
    candidates.filter((path) => paths.has(path)).map((path) => ({ category, path }))
  ));
  const packageNamespace = [...paths].filter((path) => path.startsWith('.github/aw/squad/'));
  const branches = github.listBranches(target);
  const pullRequests = github.listPullRequests(target);
  const issues = github.listIssues(target);
  const prior = matchingPriorRunArtifacts(branches, pullRequests, issues);
  if (existingPaths.length > 0 || packageNamespace.length > 0
    || prior.branches.length > 0 || prior.pullRequests.length > 0 || prior.issues.length > 0) {
    throw new Error(`Target is not pristine: ${JSON.stringify({
      packagePaths: existingPaths,
      packageNamespace,
      priorRunBranches: prior.branches.map(({ name }) => name),
      priorRunPullRequests: prior.pullRequests.map(({ number }) => number),
      priorRunIssues: prior.issues.map(({ number }) => number),
    })}`);
  }
  return {
    capturedAt: new Date(now()).toISOString(),
    defaultBranch,
    defaultBranchSha,
    maximumPullRequestNumber: Math.max(0, ...pullRequests.map(({ number }) => number)),
    maximumIssueNumber: Math.max(0, ...issues.map(({ number }) => number)),
  };
}

export function assertTargetDefaultBranch(
  target,
  defaultBranch,
  expectedSha,
  phase,
  github = githubAdapter,
) {
  const actualSha = github.getDefaultBranchSha(target, defaultBranch);
  if (actualSha !== expectedSha) {
    throw new Error(
      `Target default branch moved before ${phase}: expected ${expectedSha}, found ${actualSha}.`,
    );
  }
}

export function guardedTargetMutation({
  target,
  defaultBranch,
  expectedSha,
  phase,
  mutate,
  github = githubAdapter,
}) {
  assertTargetDefaultBranch(target, defaultBranch, expectedSha, phase, github);
  return mutate();
}

export function authorizeTarget(args, sourceInfo, contract, github = githubAdapter) {
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
  const baseline = assertPristineTarget(target, info.default_branch, contract, github);
  return { target, info, workflowPermissions, actor, baseline };
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

function bootstrapOutputs(target, github = githubAdapter) {
  const expectedAuthor = github.getUser(ACTIONS_BOT_LOGIN);
  if (expectedAuthor.login !== ACTIONS_BOT_LOGIN
    || expectedAuthor.type !== 'Bot'
    || !Number.isSafeInteger(expectedAuthor.id)) {
    throw new Error('GitHub Actions bot identity is unavailable or invalid.');
  }
  const castBranch = github.listBranches(target).find(({ name }) => name === CAST_BRANCH);
  return {
    target,
    expectedAuthor,
    castBranchSha: castBranch?.sha,
    castPrs: github.listPullRequests(target),
    issues: github.listIssues(target),
  };
}

function parseBootstrapProvenance(body, label) {
  const matches = [...String(body ?? '').matchAll(PROVENANCE_MARKER_PATTERN)];
  if (matches.length !== 1) {
    throw new Error(`${label} must contain exactly one bootstrap provenance marker.`);
  }
  let marker;
  try {
    marker = JSON.parse(matches[0][1]);
  } catch {
    throw new Error(`${label} bootstrap provenance marker is malformed.`);
  }
  const keys = Object.keys(marker).sort();
  const expectedKeys = ['cast_sha', 'install_sha', 'repository', 'run_id', 'schema'];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)
    || marker.schema !== 1
    || typeof marker.repository !== 'string'
    || typeof marker.run_id !== 'string'
    || typeof marker.install_sha !== 'string'
    || typeof marker.cast_sha !== 'string'
    || !SHA_PATTERN.test(marker.install_sha)
    || !SHA_PATTERN.test(marker.cast_sha)
    || !/^[1-9][0-9]*$/.test(marker.run_id)) {
    throw new Error(`${label} bootstrap provenance marker is malformed.`);
  }
  return marker;
}

function sameAuthor(actual, expected) {
  return actual?.login === expected.login
    && actual?.id === expected.id
    && actual?.type === expected.type;
}

export function selectBootstrapOutputs(outputs, baseline, installation, bootstrapRun) {
  const cutoff = Math.max(
    Date.parse(baseline.capturedAt),
    Date.parse(installation.mergedAt),
    Date.parse(bootstrapRun.createdAt),
  );
  const castPrs = outputs.castPrs.filter((pr) => (
    pr.number > baseline.maximumPullRequestNumber
    && Date.parse(pr.createdAt) >= cutoff
    && pr.title === CAST_PR_TITLE
  ));
  const issues = outputs.issues.filter((issue) => (
    issue.number > baseline.maximumIssueNumber
    && Date.parse(issue.createdAt) >= cutoff
    && issue.title === RESEARCH_ISSUE_TITLE
  ));
  if (castPrs.length > 1 || issues.length > 1) {
    throw new Error(
      `Ambiguous current bootstrap outputs: ${castPrs.length} Cast PRs and ${issues.length} research issues.`,
    );
  }
  if (castPrs.length === 1 && issues.length === 1) {
    const [castPr] = castPrs;
    const [researchIssue] = issues;
    const castMarker = parseBootstrapProvenance(castPr.body, 'Cast PR');
    const issueMarker = parseBootstrapProvenance(researchIssue.body, 'Research issue');
    const expectedMarker = {
      schema: 1,
      repository: outputs.target,
      run_id: String(bootstrapRun.databaseId),
      install_sha: installation.mergeCommit.oid,
      cast_sha: castPr.headSha,
    };
    if (JSON.stringify(castMarker) !== JSON.stringify(expectedMarker)
      || JSON.stringify(issueMarker) !== JSON.stringify(expectedMarker)) {
      throw new Error('Bootstrap outputs do not share the expected current-run provenance.');
    }
    if (!researchIssue.body.startsWith(`${RESEARCH_MARKER}\n`)) {
      throw new Error('Research issue is missing the canonical bootstrap marker.');
    }
    if (!sameAuthor(castPr.author, outputs.expectedAuthor)
      || !sameAuthor(researchIssue.author, outputs.expectedAuthor)) {
      throw new Error('Bootstrap outputs were not authored by the expected GitHub Actions bot.');
    }
    if (castPr.headRepository !== outputs.target
      || castPr.headRefName !== CAST_BRANCH
      || castPr.baseRefName !== baseline.defaultBranch
      || castPr.baseSha !== installation.mergeCommit.oid
      || castPr.headSha !== outputs.castBranchSha
      || !SHA_PATTERN.test(castPr.headSha)
      || castPr.isDraft !== true) {
      throw new Error('Bootstrap Cast PR repository, branch, SHA, base, or draft state is invalid.');
    }
    return { castPr, researchIssue };
  }
  return null;
}

export function waitForBootstrapOutputs(
  target,
  baseline,
  installation,
  bootstrapRun,
  {
    github = githubAdapter,
    now = Date.now,
    pause = sleep,
    timeoutMs = 5 * 60 * 1000,
    pollMs = 10_000,
  } = {},
) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const selected = selectBootstrapOutputs(
      bootstrapOutputs(target, github),
      baseline,
      installation,
      bootstrapRun,
    );
    if (selected) return selected;
    pause(pollMs);
  }
  throw new Error('Timed out waiting for the draft Cast PR and bootstrap research issue.');
}

function createAndMergePr({
  cwd,
  target,
  defaultBranch,
  expectedBaseSha,
  branch,
  title,
  body,
  evidence,
  github = githubAdapter,
}) {
  privileged('gh', ['auth', 'setup-git']);
  guardedTargetMutation({
    target,
    defaultBranch,
    expectedSha: expectedBaseSha,
    phase: `${title} push`,
    github,
    mutate: () => privileged('git', ['push', '--set-upstream', 'origin', branch], {
      cwd,
      capture: false,
    }),
  });
  const prUrl = guardedTargetMutation({
    target,
    defaultBranch,
    expectedSha: expectedBaseSha,
    phase: `${title} PR creation`,
    github,
    mutate: () => privileged('gh', [
      'pr', 'create', '--repo', target, '--base', defaultBranch, '--head', branch,
      '--title', title, '--body', body,
    ], { cwd }),
  });
  const pr = ghJson(['pr', 'view', prUrl, '--repo', target, '--json', 'number,url,state,headRefName,baseRefName']);
  writeJson(resolve(evidence, `pr-${pr.number}-created.json`), pr);
  guardedTargetMutation({
    target,
    defaultBranch,
    expectedSha: expectedBaseSha,
    phase: `${title} merge`,
    github,
    mutate: () => privileged(
      'gh',
      ['pr', 'merge', String(pr.number), '--repo', target, '--merge', '--delete-branch'],
      {
        cwd,
        capture: false,
        timeout: 300_000,
      },
    ),
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
  const targetState = authorizeTarget(args, sourceInfo, contract);
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
    const clonedHead = runChild('git', ['rev-parse', 'HEAD'], { cwd: checkout });
    if (clonedHead !== targetState.baseline.defaultBranchSha) {
      throw new Error(
        `Cloned target HEAD does not match pristine baseline: expected ${targetState.baseline.defaultBranchSha}, found ${clonedHead}.`,
      );
    }
    runChild('git', ['config', 'user.name', 'Squad hosted E2E'], { cwd: checkout });
    runChild('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], { cwd: checkout });
    const installBranch = `squad-e2e/install-${process.env.GITHUB_RUN_ID ?? sourceSha.slice(0, 12)}`;
    remoteBranches.add(installBranch);
    runChild('git', ['switch', '-c', installBranch], { cwd: checkout });

    const sourceReadToken = process.env.SOURCE_READ_TOKEN;
    if (!sourceReadToken) throw new Error('SOURCE_READ_TOKEN is required for immutable package retrieval.');
    if (sourceReadToken === process.env.GH_TOKEN) {
      throw new Error('SOURCE_READ_TOKEN must not reuse the mutation-capable GH_TOKEN.');
    }
    runChild('gh', ['aw', 'add', `${PACKAGE_NAME}@${sourceSha}`], {
      cwd: checkout,
      capture: false,
      timeout: 600_000,
      allowGitHubToken: true,
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
      expectedBaseSha: targetState.baseline.defaultBranchSha,
      branch: installBranch,
      title: INSTALL_PR_TITLE,
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
    writeJson(resolve(evidence, 'installation-identity.json'), {
      baseline: targetState.baseline,
      installation,
      bootstrapRun: installRun,
    });
    const outputs = waitForBootstrapOutputs(
      targetState.target,
      targetState.baseline,
      installation,
      installRun,
    );

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
      expectedBaseSha: installation.mergeCommit.oid,
      branch: probeBranch,
      title: PROBE_PR_TITLE,
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
