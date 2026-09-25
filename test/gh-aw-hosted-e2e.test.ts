import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  assertPristineTarget,
  guardedTargetMutation,
  sanitizedEnvironment,
  selectBootstrapOutputs,
  waitForBootstrapOutputs,
} from '../scripts/gh-aw-hosted-e2e.mjs';
import {
  assertInstalledManifestIdentity,
  loadBundleContract,
  loadInstalledBundleContract,
} from '../scripts/gh-aw-hosted-e2e-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts/gh-aw-hosted-e2e.mjs'), 'utf8');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/squad-gh-aw-hosted-e2e.yml'), 'utf8');
const CONTRACT = loadBundleContract(ROOT);
const TARGET_SHA = '1'.repeat(40);
const MOVED_SHA = '2'.repeat(40);
const packageArtifactCases = [
  ...CONTRACT.workflows.map(({ destination }) => ['workflow destination', destination]),
  ...CONTRACT.workflows.map(({ lock }) => ['workflow lock', lock]),
  ...CONTRACT.runtime.map(({ packageDestination }) => ['runtime package destination', packageDestination]),
  ...CONTRACT.runtime.map(({ destination }) => ['materialized runtime destination', destination]),
  ['installed manifest', '.github/aw/squad-workflows.manifest.json'],
  ['package ownership metadata', '.github/aw/packages/bradygaster-squad-workflows-3632054824e8.json'],
  ...CONTRACT.skills.map(({ destination }) => ['installed skill', destination]),
  ['trigger sentinel', '.github/workflows/shared/squad-bootstrap-trigger-probe.json'],
  ['package namespace residue', '.github/aw/squad/unknown-stale-file.md'],
] as const;

function fakeGitHub(overrides: Record<string, unknown> = {}) {
  return {
    getDefaultBranchSha: () => TARGET_SHA,
    getTree: () => ({ truncated: false, paths: [] }),
    listBranches: () => [{ name: 'main' }],
    listPullRequests: () => [],
    listIssues: () => [],
    ...overrides,
  };
}

const baseline = {
  capturedAt: '2026-09-24T20:00:00.000Z',
  defaultBranch: 'main',
  defaultBranchSha: TARGET_SHA,
  maximumPullRequestNumber: 10,
  maximumIssueNumber: 20,
};
const installation = {
  number: 11,
  mergedAt: '2026-09-24T20:01:00.000Z',
  mergeCommit: { oid: '3'.repeat(40) },
};
const bootstrapRun = {
  databaseId: 30,
  createdAt: '2026-09-24T20:01:05.000Z',
  headSha: installation.mergeCommit.oid,
};
const currentCastPr = {
  number: 12,
  url: 'https://example.test/pr/12',
  title: '[squad] Cast your Squad',
  body: 'Cast proposal',
  createdAt: '2026-09-24T20:01:06.000Z',
  isDraft: true,
  headRefName: 'squad/bootstrap-cast',
  baseRefName: 'main',
  state: 'open',
};
const currentResearchIssue = {
  number: 21,
  url: 'https://example.test/issues/21',
  title: '[Research Proposals] Agent-discovered repo opportunities',
  body: '<!-- squad:bootstrap-opportunities schema=1 -->\nCurrent proposals',
  createdAt: '2026-09-24T20:01:07.000Z',
  state: 'open',
};

describe('Squad gh-aw hosted E2E controller', () => {
  it('uses only a default-branch repository_dispatch controller and one PAT step', () => {
    const parsed = parse(WORKFLOW);
    expect(parsed.on.repository_dispatch.types).toEqual(['squad-gh-aw-hosted-e2e']);
    expect(parsed.on.workflow_dispatch).toBeUndefined();
    expect(WORKFLOW).not.toContain('inputs.source_ref');
    expect(WORKFLOW).toContain("github.ref_name == github.event.repository.default_branch");
    expect(WORKFLOW).toContain('protected `dev` branch');
    expect(WORKFLOW.match(/SQUAD_GH_AW_E2E_TOKEN/g)).toHaveLength(2);
    expect(parsed.jobs['hosted-e2e'].environment).toBe('squad-gh-aw-e2e');
    expect(parsed.permissions).toEqual({ contents: 'read' });
  });

  it('removes credentials from candidate child process environments', () => {
    process.env.GH_TOKEN = 'secret';
    process.env.SQUAD_GH_AW_E2E_TOKEN = 'secret';
    process.env.OTHER_CREDENTIAL = 'secret';
    process.env.ARBITRARY_UNTRUSTED_VALUE = 'secret';
    const env = sanitizedEnvironment({ SAFE_VALUE: 'ok' });
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.SQUAD_GH_AW_E2E_TOKEN).toBeUndefined();
    expect(env.OTHER_CREDENTIAL).toBeUndefined();
    expect(env.ARBITRARY_UNTRUSTED_VALUE).toBeUndefined();
    expect(env.SAFE_VALUE).toBe('ok');
    expect(() => sanitizedEnvironment({ GH_TOKEN: 'secret' })).toThrow(/explicitly privileged/);
    expect(() => sanitizedEnvironment({ SQUAD_GH_AW_E2E_TOKEN: 'secret' })).toThrow(/never be passed/);
    delete process.env.GH_TOKEN;
    delete process.env.SQUAD_GH_AW_E2E_TOKEN;
    delete process.env.OTHER_CREDENTIAL;
    delete process.env.ARBITRARY_UNTRUSTED_VALUE;
  });

  it('binds source and target identities without caller-selected privileged code', () => {
    expect(SCRIPT).toContain("repository: 'bradygaster/squad'");
    expect(SCRIPT).toContain('repositoryId: 1151205052');
    expect(SCRIPT).toContain('sourceRef !== `refs/heads/${info.default_branch}`');
    expect(SCRIPT).toContain('branch.protected !== true || branch.sha !== sourceSha');
    expect(SCRIPT).toContain('info.full_name !== target');
    expect(SCRIPT).toContain('info.id !== expectedRepositoryId || info.owner.id !== expectedOwnerId');
    expect(SCRIPT).toContain('actor.login !== expectedActorLogin || actor.id !== expectedActorId');
  });

  it('loads only the exact canonical manifest and has no fallback contract', () => {
    const contract = loadBundleContract(ROOT);
    expect(contract.package).toBe('bradygaster/squad/workflows');
    expect(contract.workflows).toHaveLength(7);
    expect(contract.runtime).toHaveLength(15);
    expect(contract.skills).toHaveLength(1);
    expect(contract.triggerProbe).toBe('shared/squad-bootstrap-trigger-probe.json');
    expect(() => loadInstalledBundleContract(resolve(ROOT, 'does-not-exist'))).toThrow(/missing or invalid/);
    expect(() => assertInstalledManifestIdentity(resolve(ROOT, 'packages'), ROOT)).toThrow(
      /Required file is missing/,
    );
    expect(readFileSync(
      resolve(ROOT, 'scripts/gh-aw-hosted-e2e-contract.mjs'),
      'utf8',
    )).not.toContain('FALLBACK_');
  });

  it('uses the non-executable unowned sentinel with exact staged diff and retained bytes', () => {
    expect(SCRIPT).toContain("kind: 'squad-bootstrap-trigger-probe'");
    expect(SCRIPT).toContain('trusted_source_sha: sourceSha');
    expect(SCRIPT).toContain('hosted_run_id:');
    expect(SCRIPT).toContain('install_merge_sha:');
    expect(SCRIPT).toContain('default_branch_sha:');
    expect(SCRIPT).toContain('assertExactStagedDiff(checkout, new Set([TRIGGER_PROBE_DESTINATION]))');
    expect(SCRIPT).not.toContain('appendFileSync');
    expect(SCRIPT).not.toContain("contract.runtime.find(({ path }) => path === contract.triggerProbe)");
  });

  it('bounds bootstrap polling and cleans temporary branches', () => {
    expect(SCRIPT).toContain('Date.now() + 20 * 60 * 1000');
    expect(SCRIPT).toContain('timeoutMs = 5 * 60 * 1000');
    expect(SCRIPT).toContain('Expected exactly one bootstrap run');
    expect(SCRIPT).toContain("['pr', 'close'");
    expect(SCRIPT).toContain("['api', '--method', 'DELETE'");
    expect(SCRIPT).toContain('rmSync(checkout, { recursive: true, force: true })');
  });

  it('never executes candidate package or installed verifier with inherited credentials', () => {
    expect(SCRIPT).toContain(
      'env: sanitizedEnvironment(options.env, { allowGitHubToken: options.allowGitHubToken === true })',
    );
    expect(SCRIPT).toContain("runChild('gh', ['aw', 'add'");
    expect(SCRIPT).toContain('SOURCE_READ_TOKEN must not reuse the mutation-capable GH_TOKEN');
    expect(SCRIPT).toContain('allowGitHubToken: true');
    expect(SCRIPT).toContain('env: { GH_TOKEN: sourceReadToken }');
    expect(SCRIPT).toContain("runChild('node', ['.github/workflows/shared/squad-install-verifier.mjs'");
    expect(SCRIPT).not.toMatch(/privileged\('node'/);
    expect(SCRIPT).not.toMatch(/privileged\('gh', \['aw'/);
  });

  it.each(packageArtifactCases)('rejects a pre-existing %s at %s before mutation', (_label, artifactPath) => {
    expect(() => assertPristineTarget(
      'owner/consumer',
      'main',
      CONTRACT,
      fakeGitHub({ getTree: () => ({ truncated: false, paths: [artifactPath] }) }),
    )).toThrow(/Target is not pristine/);
  });

  it.each([
    ['install branch', { branches: [{ name: 'squad-e2e/install-old' }] }],
    ['probe branch', { branches: [{ name: 'squad-e2e/probe-old' }] }],
    ['Cast branch', { branches: [{ name: 'squad/bootstrap-cast' }] }],
    ['installation PR', {
      pullRequests: [{
        number: 1, title: 'ci: install Squad agentic workflows', headRefName: 'other',
      }],
    }],
    ['probe PR', {
      pullRequests: [{
        number: 2, title: 'test: add Squad bootstrap trigger probe', headRefName: 'other',
      }],
    }],
    ['Cast PR', {
      pullRequests: [{
        number: 3, title: '[squad] Cast your Squad', headRefName: 'squad/bootstrap-cast',
      }],
    }],
    ['research issue title', {
      issues: [{
        number: 4, title: '[Research Proposals] Agent-discovered repo opportunities', body: '',
      }],
    }],
    ['canonical research marker', {
      issues: [{
        number: 5, title: 'renamed', body: '<!-- squad:bootstrap-opportunities schema=1 -->',
      }],
    }],
  ])('rejects a pre-existing %s before mutation', (_label, state) => {
    const contract = loadBundleContract(ROOT);
    expect(() => assertPristineTarget(
      'owner/consumer',
      'main',
      contract,
      fakeGitHub({
        listBranches: () => state.branches ?? [{ name: 'main' }],
        listPullRequests: () => state.pullRequests ?? [],
        listIssues: () => state.issues ?? [],
      }),
    )).toThrow(/Target is not pristine/);
  });

  it('binds the pristine default SHA and fails closed when it moves before push', () => {
    const contract = loadBundleContract(ROOT);
    const captured = assertPristineTarget(
      'owner/consumer',
      'main',
      contract,
      fakeGitHub(),
      () => Date.parse(baseline.capturedAt),
    );
    expect(captured.defaultBranchSha).toBe(TARGET_SHA);
    let pushed = false;
    expect(() => guardedTargetMutation({
      target: 'owner/consumer',
      defaultBranch: 'main',
      expectedSha: captured.defaultBranchSha,
      phase: 'installation push',
      github: fakeGitHub({ getDefaultBranchSha: () => MOVED_SHA }),
      mutate: () => { pushed = true; },
    })).toThrow(/moved before installation push/);
    expect(pushed).toBe(false);
  });

  it('does not accept old matching bootstrap outputs from --state all', () => {
    const oldOutputs = {
      castPrs: [{ ...currentCastPr, number: 9, createdAt: '2026-09-24T19:59:00.000Z' }],
      issues: [{ ...currentResearchIssue, number: 19, createdAt: '2026-09-24T19:59:00.000Z' }],
    };
    let now = 0;
    expect(() => waitForBootstrapOutputs(
      'owner/consumer',
      baseline,
      installation,
      bootstrapRun,
      {
        github: fakeGitHub({
          listPullRequests: () => oldOutputs.castPrs,
          listIssues: () => oldOutputs.issues,
        }),
        now: () => now,
        pause: (milliseconds: number) => { now += milliseconds; },
        timeoutMs: 20,
        pollMs: 10,
      },
    )).toThrow(/Timed out/);
  });

  it('accepts newly created outputs attributable to the current installation run', () => {
    let now = 0;
    const github = fakeGitHub({
      listPullRequests: () => [currentCastPr],
      listIssues: () => [currentResearchIssue],
    });
    expect(waitForBootstrapOutputs(
      'owner/consumer',
      baseline,
      installation,
      bootstrapRun,
      {
        github,
        now: () => now,
        pause: (milliseconds: number) => { now += milliseconds; },
        timeoutMs: 100,
        pollMs: 10,
      },
    )).toEqual({ castPr: currentCastPr, researchIssue: currentResearchIssue });
  });

  it.each([
    ['Cast PRs', {
      castPrs: [currentCastPr, { ...currentCastPr, number: 13 }],
      issues: [currentResearchIssue],
    }],
    ['research issues', {
      castPrs: [currentCastPr],
      issues: [currentResearchIssue, { ...currentResearchIssue, number: 22 }],
    }],
  ])('fails closed on duplicate current-run %s', (_label, outputs) => {
    expect(() => selectBootstrapOutputs(outputs, baseline, installation, bootstrapRun))
      .toThrow(/Ambiguous current bootstrap outputs/);
  });
});
