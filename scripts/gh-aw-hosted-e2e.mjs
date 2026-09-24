import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CANONICAL_MANIFEST_PATH,
  INSTALLED_MANIFEST_PATH,
  loadBundleContract,
  loadInstalledBundleContract,
} from './gh-aw-hosted-e2e-contract.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replaceAll('-', '_');
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
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

function ghJson(args, options = {}) {
  const output = run('gh', args, options);
  return output ? JSON.parse(output) : null;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function inspectInstallation(root, contract) {
  const workflowRoot = resolve(root, '.github/workflows');
  const findings = [];
  const inspect = (relativePath, expectedDigest) => {
    const path = resolve(workflowRoot, relativePath);
    if (!existsSync(path)) {
      findings.push({ code: 'missing', path: `.github/workflows/${relativePath}` });
      return;
    }
    if (expectedDigest) {
      const actual = contract.digest(relativePath);
      if (actual !== expectedDigest) {
        findings.push({
          code: 'stale',
          path: `.github/workflows/${relativePath}`,
          expected_sha256: expectedDigest,
          actual_sha256: actual,
        });
      }
    }
  };

  for (const workflow of contract.workflows) {
    inspect(workflow.source, workflow.source_sha256);
    inspect(workflow.lock);
  }
  for (const runtime of contract.runtime) inspect(runtime.destination, runtime.sha256);

  return {
    valid: findings.length === 0,
    contract_source: contract.source,
    workflow_count: contract.workflows.length,
    findings,
  };
}

function repairInstallation(root, sourceRoot, contract) {
  const workflowRoot = resolve(root, '.github/workflows');
  const sourceWorkflowRoot = resolve(sourceRoot, 'workflows');
  const paths = [
    ...contract.workflows.flatMap((workflow) => [
      { source: workflow.source, destination: workflow.source },
      { source: workflow.lock, destination: workflow.lock },
    ]),
    ...contract.runtime.map((runtime) => ({
      source: runtime.path,
      destination: runtime.destination,
    })),
  ];
  for (const entry of paths) {
    const source = resolve(sourceWorkflowRoot, entry.source);
    if (!existsSync(source)) {
      throw new Error(`Recovery source is missing workflows/${entry.source}`);
    }
    const target = resolve(workflowRoot, entry.destination);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  const manifestTarget = resolve(root, INSTALLED_MANIFEST_PATH);
  mkdirSync(dirname(manifestTarget), { recursive: true });
  cpSync(resolve(sourceRoot, CANONICAL_MANIFEST_PATH), manifestTarget);
}

function requireArg(args, name) {
  const value = args[name];
  if (!value || value === true) throw new Error(`--${name.replaceAll('_', '-')} is required`);
  return value;
}

function sleep(milliseconds) {
  execFileSync('sleep', [String(milliseconds / 1000)]);
}

function waitForBootstrapRun(target, headSha, startedAt, evidence) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    let runs = [];
    try {
      runs = ghJson([
        'run', 'list',
        '--repo', target,
        '--workflow', 'squad-bootstrap.lock.yml',
        '--event', 'push',
        '--json', 'databaseId,headSha,status,conclusion,url,createdAt',
        '--limit', '20',
      ]) ?? [];
    } catch {
      sleep(10_000);
      continue;
    }
    const matching = runs.filter((run) =>
      run.headSha === headSha && Date.parse(run.createdAt) >= startedAt - 60_000);
    if (matching.length > 1) {
      throw new Error(`Expected one bootstrap run for ${headSha}, found ${matching.length}`);
    }
    if (matching.length === 1 && matching[0].status === 'completed') {
      writeJson(resolve(evidence, `bootstrap-run-${headSha.slice(0, 12)}.json`), matching[0]);
      if (matching[0].conclusion !== 'success') {
        throw new Error(`Bootstrap run failed: ${matching[0].url}`);
      }
      return matching[0];
    }
    sleep(10_000);
  }
  throw new Error(`Timed out waiting for bootstrap run at ${headSha}`);
}

function waitForBootstrapOutputs(target) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const castPrs = ghJson([
      'pr', 'list', '--repo', target, '--state', 'open',
      '--head', 'squad/bootstrap-cast',
      '--json', 'number,url,isDraft,title,headRefName,baseRefName',
    ]);
    const issues = ghJson([
      'issue', 'list', '--repo', target, '--state', 'open',
      '--search', '"[Research Proposals] Agent-discovered repo opportunities" in:title',
      '--json', 'number,url,title,body',
    ]);
    const researchIssues = issues.filter((issue) =>
      issue.title === '[Research Proposals] Agent-discovered repo opportunities'
      && issue.body.includes('<!-- squad:bootstrap-opportunities schema=1 -->'));
    if (castPrs.length === 1 && castPrs[0].isDraft && researchIssues.length === 1) {
      return { castPr: castPrs[0], researchIssue: researchIssues[0] };
    }
    sleep(10_000);
  }
  throw new Error('Timed out waiting for the draft Cast PR and bootstrap research issue');
}

function createAndMergePr({ cwd, target, branch, title, body, evidence }) {
  run('git', ['push', '--set-upstream', 'origin', branch], { cwd, capture: false });
  const prUrl = run('gh', [
    'pr', 'create',
    '--repo', target,
    '--base', run('gh', ['repo', 'view', target, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']),
    '--head', branch,
    '--title', title,
    '--body', body,
  ], { cwd });
  const pr = ghJson(['pr', 'view', prUrl, '--repo', target, '--json', 'number,url,state,headRefName,baseRefName']);
  writeJson(resolve(evidence, `pr-${pr.number}-created.json`), pr);
  run('gh', ['pr', 'merge', String(pr.number), '--repo', target, '--merge', '--delete-branch'], {
    cwd,
    capture: false,
    timeout: 300_000,
  });
  const merged = ghJson(['pr', 'view', String(pr.number), '--repo', target, '--json', 'number,url,state,mergedAt,mergeCommit']);
  writeJson(resolve(evidence, `pr-${pr.number}-merged.json`), merged);
  if (merged.state !== 'MERGED' || !merged.mergeCommit?.oid) {
    throw new Error(`Installation PR ${pr.url} did not merge`);
  }
  return merged;
}

function assertPristineConsumer(target) {
  const result = spawnSync('gh', [
    'api', `repos/${target}/contents/.github/workflows/squad.md`,
    '--silent',
  ], { encoding: 'utf8', stdio: 'pipe' });
  if (result.error) throw result.error;
  if (result.status === 0) {
    throw new Error(`${target} already contains Squad workflows; use a fresh one-shot consumer`);
  }
  if (!`${result.stdout}\n${result.stderr}`.includes('404')) {
    throw new Error(`Could not prove ${target} is pristine: ${result.stderr || result.stdout}`);
  }
}

function hosted(args, repositoryRoot) {
  const target = requireArg(args, 'target');
  const confirm = requireArg(args, 'confirm');
  const sourceRepository = requireArg(args, 'source_repository');
  const sourceRef = requireArg(args, 'source_ref');
  const evidence = resolve(requireArg(args, 'evidence'));
  if (confirm !== target) throw new Error('--confirm must exactly match --target');
  if (target === sourceRepository) throw new Error('The hosted E2E target must not be the Squad source repository');
  if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is required');

  mkdirSync(evidence, { recursive: true });
  const targetInfo = ghJson([
    'repo', 'view', target,
    '--json', 'nameWithOwner,defaultBranchRef,hasIssuesEnabled,isPrivate,mergeCommitAllowed,url',
  ]);
  if (targetInfo.isPrivate) throw new Error('Hosted E2E consumers must be public to exercise the supported public journey');
  if (!targetInfo.hasIssuesEnabled) throw new Error(`${target} must have GitHub Issues enabled`);
  if (!targetInfo.mergeCommitAllowed) throw new Error(`${target} must allow merge commits for deterministic E2E merges`);
  assertPristineConsumer(target);

  const permissions = ghJson(['api', `repos/${target}/actions/permissions/workflow`]);
  if (permissions.default_workflow_permissions !== 'read'
    || permissions.can_approve_pull_request_reviews !== true) {
    throw new Error(
      `${target} must set default_workflow_permissions=read and can_approve_pull_request_reviews=true`,
    );
  }
  writeJson(resolve(evidence, 'preflight.json'), { target: targetInfo, permissions });

  const checkout = resolve(tmpdir(), `squad-gh-aw-e2e-${process.env.GITHUB_RUN_ID ?? Date.now()}`);
  const remoteBranches = new Set();
  const installationPrs = new Set();
  rmSync(checkout, { recursive: true, force: true });
  try {
    run('gh', ['repo', 'clone', target, checkout], { capture: false, timeout: 300_000 });
    run('git', ['config', 'user.name', 'Squad hosted E2E'], { cwd: checkout });
    run('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], { cwd: checkout });

    const contract = loadBundleContract(repositoryRoot);
    if (contract.workflows.length !== 7) {
      throw new Error(`The Squad bundle contract must declare exactly seven workflows, found ${contract.workflows.length}`);
    }
    const installBranch = `squad-e2e/install-${process.env.GITHUB_RUN_ID ?? Date.now()}`;
    remoteBranches.add(installBranch);
    run('git', ['switch', '-c', installBranch], { cwd: checkout });
    const refs = contract.workflows.map(
      ({ source }) => `${sourceRepository}/workflows/${source}@${sourceRef}`,
    );
    run('gh', ['aw', 'add', ...refs], { cwd: checkout, capture: false, timeout: 600_000 });
    run('gh', ['aw', 'compile', '--strict'], { cwd: checkout, capture: false, timeout: 600_000 });

    const canonicalManifest = readFileSync(resolve(repositoryRoot, CANONICAL_MANIFEST_PATH), 'utf8');
    const installedManifest = readFileSync(resolve(checkout, INSTALLED_MANIFEST_PATH), 'utf8');
    if (installedManifest !== canonicalManifest) {
      throw new Error('Installed bundle manifest is not byte-for-byte identical to the canonical manifest');
    }
    const installedContract = loadInstalledBundleContract(checkout);
    if (installedContract.workflows.map(({ name }) => name).join('\n')
      !== contract.workflows.map(({ name }) => name).join('\n')) {
      throw new Error('Installed bundle manifest does not match the canonical workflow order');
    }
    const diagnosis = inspectInstallation(checkout, {
      ...installedContract,
      digest(relativePath) {
        const path = resolve(checkout, '.github/workflows', relativePath);
        return run('shasum', ['-a', '256', path]).split(/\s+/)[0];
      },
    });
    writeJson(resolve(evidence, 'installed-diagnosis.json'), diagnosis);
    if (!diagnosis.valid) throw new Error(`Installed bundle is incomplete: ${JSON.stringify(diagnosis.findings)}`);

    const installPaths = ['.gitattributes', '.github/aw', '.github/workflows', '.github/skills']
      .filter((path) => existsSync(resolve(checkout, path)));
    run('git', ['add', '--', ...installPaths], { cwd: checkout });
    run('git', ['commit', '-m', 'ci: install Squad agentic workflows'], { cwd: checkout });
    const installStartedAt = Date.now();
    const installation = createAndMergePr({
      cwd: checkout,
      target,
      branch: installBranch,
      title: 'ci: install Squad agentic workflows',
      body: 'One-shot hosted E2E installation. Generated Squad work remains human-reviewed and is not merged.',
      evidence,
    });
    installationPrs.add(installation.number);
    const installRun = waitForBootstrapRun(target, installation.mergeCommit.oid, installStartedAt, evidence);

    const { castPr, researchIssue } = waitForBootstrapOutputs(target);
    writeJson(resolve(evidence, 'bootstrap-outputs.json'), {
      installation_run: installRun,
      cast_pull_request: castPr,
      research_issue: researchIssue,
    });

    run('git', ['fetch', 'origin', targetInfo.defaultBranchRef.name], { cwd: checkout });
    const runtimeBranch = `squad-e2e/runtime-${process.env.GITHUB_RUN_ID ?? Date.now()}`;
    remoteBranches.add(runtimeBranch);
    run('git', ['switch', '-C', runtimeBranch, `origin/${targetInfo.defaultBranchRef.name}`], { cwd: checkout });
    const probe = resolve(checkout, '.github/workflows', contract.triggerProbe);
    if (!existsSync(probe)) throw new Error(`Trigger probe is missing: ${contract.triggerProbe}`);
    appendFileSync(probe, `\n<!-- hosted-e2e-trigger-probe:${process.env.GITHUB_RUN_ID ?? Date.now()} -->\n`);
    run('git', ['add', '--', `.github/workflows/${contract.triggerProbe}`], { cwd: checkout });
    run('git', ['commit', '-m', 'test: probe Squad bootstrap runtime trigger'], { cwd: checkout });
    const updateStartedAt = Date.now();
    const update = createAndMergePr({
      cwd: checkout,
      target,
      branch: runtimeBranch,
      title: 'test: probe Squad bootstrap runtime trigger',
      body: 'One-shot hosted E2E probe for a shared runtime-only bootstrap trigger.',
      evidence,
    });
    installationPrs.add(update.number);
    const updateRun = waitForBootstrapRun(target, update.mergeCommit.oid, updateStartedAt, evidence);
    writeJson(resolve(evidence, 'summary.json'), {
      status: 'passed',
      target,
      contract_source: contract.source,
      installation_pr: installation.number,
      installation_run: installRun.url,
      generated_cast_pr: castPr.url,
      generated_research_issue: researchIssue.url,
      runtime_update_pr: update.number,
      runtime_update_run: updateRun.url,
      generated_work_merged: false,
    });
  } finally {
    for (const prNumber of installationPrs) {
      try {
        const state = ghJson(['pr', 'view', String(prNumber), '--repo', target, '--json', 'state']);
        if (state.state === 'OPEN') {
          run('gh', ['pr', 'close', String(prNumber), '--repo', target], { capture: false });
        }
      } catch (error) {
        console.error(`Failed to close E2E PR ${prNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const branch of remoteBranches) {
      try {
        run('gh', ['api', '--method', 'DELETE', `repos/${target}/git/refs/heads/${branch}`]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('422') && !message.includes('404')) {
          console.error(`Failed to delete E2E branch ${branch}: ${message}`);
        }
      }
    }
    rmSync(checkout, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');

try {
  if (args.command === 'diagnose') {
    const root = resolve(requireArg(args, 'root'));
    const contractRoot = resolve(args.contract_root || repositoryRoot);
    const contract = loadBundleContract(contractRoot);
    const result = inspectInstallation(root, {
      ...contract,
      digest(relativePath) {
        const path = resolve(root, '.github/workflows', relativePath);
        return run('shasum', ['-a', '256', path]).split(/\s+/)[0];
      },
    });
    if (args.json) writeJson(resolve(args.json), result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
  } else if (args.command === 'repair') {
    const root = resolve(requireArg(args, 'root'));
    const sourceRoot = resolve(requireArg(args, 'source_root'));
    const contractRoot = resolve(args.contract_root || sourceRoot);
    const contract = loadBundleContract(contractRoot);
    repairInstallation(root, sourceRoot, contract);
    const result = inspectInstallation(root, {
      ...contract,
      digest(relativePath) {
        const path = resolve(root, '.github/workflows', relativePath);
        return run('shasum', ['-a', '256', path]).split(/\s+/)[0];
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
  } else if (args.command === 'hosted') {
    hosted(args, repositoryRoot);
  } else {
    throw new Error('Usage: gh-aw-hosted-e2e.mjs <diagnose|repair|hosted> [options]');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
