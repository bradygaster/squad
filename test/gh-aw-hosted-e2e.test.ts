import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  assertPristineTarget,
  guardedTargetMutation,
  sanitizedEnvironment,
  selectBootstrapFallback,
  selectBootstrapOutputs,
  selectManualFallbackCastPr,
  waitForBaseControlledReviewCanary,
  waitForBootstrapCompletion,
  waitForBootstrapFallback,
  waitForBootstrapOutputs,
  waitForManualFallbackCastPr,
} from '../scripts/gh-aw-hosted-e2e.mjs';
import {
  assertInstalledManifestIdentity,
  loadBundleContract,
  loadInstalledBundleContract,
} from '../scripts/gh-aw-hosted-e2e-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts/gh-aw-hosted-e2e.mjs'), 'utf8');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/squad-gh-aw-hosted-e2e.yml'), 'utf8');
const BOOTSTRAP_WORKFLOW = readFileSync(resolve(ROOT, 'workflows/squad-bootstrap.md'), 'utf8');
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
    listBranches: () => [{ name: 'main', sha: TARGET_SHA }],
    listPullRequests: () => [],
    listIssues: () => [],
    getUser: () => ACTIONS_BOT,
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
const ACTIONS_BOT = {
  login: 'github-actions[bot]',
  id: 41898282,
  type: 'Bot',
};
const CAST_SHA = '4'.repeat(40);
const provenanceMarker = (overrides: Record<string, unknown> = {}) => (
  `<!-- squad:bootstrap-provenance ${JSON.stringify({
    schema: 1,
    repository: 'owner/consumer',
    run_id: String(bootstrapRun.databaseId),
    install_sha: installation.mergeCommit.oid,
    cast_sha: CAST_SHA,
    ...overrides,
  })} -->`
);
const currentCastPr = {
  number: 12,
  url: 'https://example.test/pr/12',
  title: '[squad] Cast your Squad',
  body: `${provenanceMarker()}\nCast proposal`,
  createdAt: '2026-09-24T20:01:06.000Z',
  isDraft: true,
  headRefName: 'squad/bootstrap-cast',
  headRepository: 'owner/consumer',
  headSha: CAST_SHA,
  baseRefName: 'main',
  baseSha: installation.mergeCommit.oid,
  author: ACTIONS_BOT,
  state: 'open',
};
const currentResearchIssue = {
  number: 21,
  url: 'https://example.test/issues/21',
  title: '[Research Proposals] Agent-discovered repo opportunities',
  body: `<!-- squad:bootstrap-opportunities schema=1 -->\n${provenanceMarker()}\nCurrent proposals`,
  createdAt: '2026-09-24T20:01:07.000Z',
  author: ACTIONS_BOT,
  state: 'open',
};
const currentOutputs = (
  castPr = currentCastPr,
  researchIssue = currentResearchIssue,
) => ({
  target: 'owner/consumer',
  expectedAuthor: ACTIONS_BOT,
  castBranchSha: CAST_SHA,
  castPrs: [castPr],
  issues: [researchIssue],
});

// Mirrors workflows/shared/squad-bootstrap-validator.mjs's bootstrapPrFallbackIssueMarker /
// buildBootstrapPrFallbackIssueBody, independently re-derived (not imported) so this test does
// not trust the module it is meant to catch regressions in.
const fallbackCompareUrl =
  'https://github.com/owner/consumer/compare/main...squad/bootstrap-cast'
  + '?expand=1&title=%5Bsquad%5D%20Cast%20your%20Squad';
const fallbackProvenanceMarker = (overrides: Record<string, unknown> = {}) => (
  `<!-- squad:bootstrap-pr-fallback-provenance ${JSON.stringify({
    schema: 1,
    repository: 'owner/consumer',
    run_id: String(bootstrapRun.databaseId),
    base_branch: 'main',
    base_sha: bootstrapRun.headSha,
    head_branch: 'squad/bootstrap-cast',
    head_sha: CAST_SHA,
    compare_url: fallbackCompareUrl,
    ...overrides,
  })} -->`
);
const currentFallbackIssue = {
  number: 22,
  url: 'https://example.test/issues/22',
  title: '[squad] Manual pull request creation required for the Cast branch',
  body: `<!-- squad:bootstrap-pr-fallback branch=squad/bootstrap-cast -->\n`
    + `${fallbackProvenanceMarker()}\n`
    + '## GitHub Actions permission required\n\n'
    + `Squad bootstrap pushed the \`squad/bootstrap-cast\` branch to \`owner/consumer\` (base \`main\`) but could `
    + 'not open the pull request because this repository does not allow GitHub Actions to create or approve pull '
    + 'requests.\n\n'
    + '### Create the pull request manually\n\n'
    + `${fallbackCompareUrl}\n\n`,
  createdAt: '2026-09-24T20:01:06.000Z',
  updatedAt: '2026-09-24T20:01:06.000Z',
  author: ACTIONS_BOT,
  state: 'open',
};
const currentFallbackOutputs = (fallbackIssue = currentFallbackIssue) => ({
  target: 'owner/consumer',
  expectedAuthor: ACTIONS_BOT,
  castBranchSha: CAST_SHA,
  castPrs: [],
  issues: [fallbackIssue],
});

const HUMAN_AUTHOR = { login: 'a-real-human', id: 583231, type: 'User' };
const manualCastPr = (overrides: Record<string, unknown> = {}) => ({
  number: 13,
  url: 'https://example.test/pr/13',
  title: '[squad] Cast your Squad',
  body: 'Opened by hand per the fallback issue instructions.',
  createdAt: '2026-09-24T20:05:00.000Z',
  isDraft: false,
  headRefName: 'squad/bootstrap-cast',
  headRepository: 'owner/consumer',
  headSha: CAST_SHA,
  baseRefName: 'main',
  baseSha: bootstrapRun.headSha,
  author: HUMAN_AUTHOR,
  state: 'open',
  ...overrides,
});
const manualFallbackOutputs = (
  pr = manualCastPr(),
  fallbackIssue = currentFallbackIssue,
) => ({
  target: 'owner/consumer',
  expectedAuthor: ACTIONS_BOT,
  castBranchSha: CAST_SHA,
  castPrs: [pr],
  issues: [fallbackIssue],
});

describe('Squad gh-aw hosted E2E controller', () => {
  it('verifies and narrowly repairs staged ownership metadata before the installation commit', () => {
    const gate = SCRIPT.indexOf('const staged = verifyStagedInstall(checkout,');
    const commit = SCRIPT.indexOf("['commit', '-m', 'ci: install Squad agentic workflows']");
    const removal = SCRIPT.indexOf("'.github/skills/agentic-workflows/SKILL.md'");
    expect(removal).toBeGreaterThan(SCRIPT.indexOf("['aw', 'add'"));
    expect(removal).toBeLessThan(gate);
    expect(gate).toBeGreaterThan(SCRIPT.indexOf("['add', '--', ...installPaths]"));
    expect(gate).toBeLessThan(commit);
    expect(SCRIPT.slice(gate, commit)).toContain('stageOwnership: true');
    expect(SCRIPT.slice(gate, commit)).toContain('if (staged.failures.length > 0)');
    expect(SCRIPT.slice(gate, commit)).toContain('throw new Error');
  });

  it('uses only a default-branch repository_dispatch controller and one PAT step', () => {
    const parsed = parse(WORKFLOW);
    // Only one dispatch type, and only one job: the hosted-E2E controller never observes or
    // validates a human-opened Cast fallback pull request itself (no job, no cross-repository
    // secret). That is a deliberately operator-driven, local-only step (see `resumeFallback`'s
    // doc comment in scripts/gh-aw-hosted-e2e.mjs) -- never a GitHub Actions job.
    expect(parsed.on.repository_dispatch.types).toEqual(['squad-gh-aw-hosted-e2e']);
    expect(parsed.jobs['resume-fallback']).toBeUndefined();
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
    expect(contract.workflows).toHaveLength(8);
    expect(contract.runtime).toHaveLength(17);
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

  it('emits trusted run provenance into both bootstrap output bodies', () => {
    expect(BOOTSTRAP_WORKFLOW).toContain('SQUAD_BOOTSTRAP_INSTALL_SHA: ${{ github.sha }}');
    expect(BOOTSTRAP_WORKFLOW).toContain('SQUAD_BOOTSTRAP_REPOSITORY: ${{ github.repository }}');
    expect(BOOTSTRAP_WORKFLOW).toContain('SQUAD_BOOTSTRAP_RUN_ID: ${{ github.run_id }}');
    expect(BOOTSTRAP_WORKFLOW).toContain(
      "const provenancePrefix = '<' + '!-- squad:bootstrap-provenance ';",
    );
    expect(BOOTSTRAP_WORKFLOW).toContain(
      'const provenanceMarker = `${provenancePrefix}${JSON.stringify(provenance)} -->`;',
    );
    expect(BOOTSTRAP_WORKFLOW).not.toContain(
      '<!-- squad:bootstrap-provenance ${JSON.stringify(provenance)} -->',
    );
    expect(BOOTSTRAP_WORKFLOW).toContain('pullRequestDetails.head.repo?.full_name !== provenance.repository');
    expect(BOOTSTRAP_WORKFLOW).toContain('body: `${provenanceMarker}\\n${prBodyWithoutProvenance}`');
    expect(BOOTSTRAP_WORKFLOW).toContain(
      'Base-controlled bootstrap provenance. Do not edit this comment.',
    );
    expect(BOOTSTRAP_WORKFLOW).toContain('body: markedIssueBody');
  });

  it('bounds bootstrap polling and cleans temporary branches', () => {
    expect(SCRIPT).toContain('Date.now() + 20 * 60 * 1000');
    expect(SCRIPT).toContain('timeoutMs = 5 * 60 * 1000');
    expect(SCRIPT).toContain('Expected exactly one bootstrap run');
    expect(SCRIPT).toContain("['pr', 'close'");
    expect(SCRIPT).toContain("['api', '--method', 'DELETE'");
    expect(SCRIPT).toContain('rmSync(checkout, { recursive: true, force: true })');
  });

  it('requires a base-controlled review canary after the manual installation boundary', () => {
    expect(SCRIPT).toContain('waitForBaseControlledReviewCanary');
    expect(SCRIPT).toContain("job.name === 'review'");
    expect(SCRIPT).toContain('job.check_run_url');
    expect(SCRIPT).toContain("check.name !== 'review'");
    expect(SCRIPT).not.toContain("check.name !== 'Squad Review / review'");
    expect(SCRIPT).toContain("check.app?.slug !== 'github-actions'");
    expect(SCRIPT).toContain("'@squad/base-controlled-bootstrap'");
    expect(SCRIPT).toContain("'@squad/base-controlled-review'");
    expect(SCRIPT).toContain("verdict.result !== 'COMMENT'");
    expect(SCRIPT.indexOf('waitForBaseControlledReviewCanary')).toBeLessThan(
      SCRIPT.indexOf("kind: 'squad-bootstrap-trigger-probe'"),
    );
    expect(SCRIPT).not.toMatch(/SQUAD_REVIEW_APP_|squad-review-authority|publisher_app_/);
  });

  it.each([
    'native-job-name', 'ui-context-name', 'wrong-check-id', 'wrong-head',
    'wrong-run-head', 'failed-check', 'incomplete-check', 'foreign-app', 'foreign-app-id',
  ])('exercises the hosted canary API contract: %s', mutation => {
    const target = 'owner/consumer';
    const verdict = {
      schema: 'squad-review-verdict/v1', repository: target,
      pull_request: currentCastPr.number, base_sha: currentCastPr.baseSha,
      head_sha: CAST_SHA, author_agent: '@squad/base-controlled-bootstrap',
      reviewer_agent: '@squad/base-controlled-review', result: 'COMMENT',
      event: 'pull_request_target', workflow_sha: currentCastPr.baseSha,
      workflow_path: '.github/workflows/squad-review.lock.yml', run_id: 31, run_attempt: 1,
    };
    const run = {
      id: 31, event: verdict.event, path: verdict.workflow_path,
      head_sha: currentCastPr.baseSha,
      repository: { full_name: target }, run_attempt: 1,
      display_title: `Squad review — PR #${currentCastPr.number}`,
    };
    const job = {
      name: 'review', status: 'completed', conclusion: 'success',
      check_run_url: `https://api.github.com/repos/${target}/check-runs/123`,
    };
    const check = {
      id: 123, name: 'review', head_sha: CAST_SHA, status: 'completed', conclusion: 'success',
      app: { id: 15368, slug: 'github-actions' },
    };
    switch (mutation) {
      case 'ui-context-name': check.name = 'Squad Review / review'; break;
      case 'wrong-check-id': check.id = 124; break;
      case 'wrong-head': check.head_sha = TARGET_SHA; break;
      case 'wrong-run-head': run.head_sha = CAST_SHA; break;
      case 'failed-check': check.conclusion = 'failure'; break;
      case 'incomplete-check': check.status = 'in_progress'; break;
      case 'foreign-app': check.app.slug = 'other'; break;
      case 'foreign-app-id': check.app.id = 1; break;
    }
    const routes: string[] = [];
    const request = (args: string[]) => {
      const route = args.find(arg => arg.startsWith(`repos/${target}/`));
      routes.push(route!);
      switch (route) {
        case `repos/${target}/pulls/${currentCastPr.number}/reviews?per_page=100`:
          return [{
            user: ACTIONS_BOT, commit_id: CAST_SHA,
            body: `Squad-Review-Verdict: ${JSON.stringify(verdict)}`,
          }];
        case `repos/${target}/actions/runs/31`: return run;
        case `repos/${target}/actions/runs/31/attempts/1/jobs?per_page=100`: return [{ jobs: [job] }];
        case `repos/${target}/check-runs/123`: return check;
        default: throw new Error(`Unexpected API route: ${route}`);
      }
    };
    const evidence = mkdtempSync(resolve(tmpdir(), 'squad-review-canary-'));
    try {
      const execute = () => waitForBaseControlledReviewCanary(target, currentCastPr, evidence, {
        request, now: () => 0, pause: () => { throw new Error('Unexpected polling'); },
      });
      if (mutation === 'native-job-name') {
        expect(execute()).toEqual({ run, job, check, verdict });
        expect(JSON.parse(readFileSync(
          resolve(evidence, 'base-controlled-review-canary.json'), 'utf8',
        )).check.name).toBe('review');
      } else if (mutation === 'wrong-run-head') {
        expect(execute).toThrow('not bound to the base-controlled workflow run');
      } else {
        expect(execute).toThrow('not bound to the trusted review job');
      }
      expect(routes.at(-1)).toBe(mutation === 'wrong-run-head'
        ? `repos/${target}/actions/runs/31`
        : `repos/${target}/check-runs/123`);
    } finally {
      rmSync(evidence, { recursive: true, force: true });
    }
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
      listBranches: () => [
        { name: 'main', sha: TARGET_SHA },
        { name: 'squad/bootstrap-cast', sha: CAST_SHA },
      ],
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

  it('rejects the post-baseline fork spoof with public names and markers', () => {
    const attacker = { login: 'attacker', id: 999, type: 'User' };
    const spoofedPr = {
      ...currentCastPr,
      body: 'Cast proposal',
      headRepository: 'attacker/consumer',
      author: attacker,
    };
    const spoofedIssue = {
      ...currentResearchIssue,
      body: '<!-- squad:bootstrap-opportunities schema=1 -->\nAttacker proposals',
      author: attacker,
    };
    expect(() => selectBootstrapOutputs(
      currentOutputs(spoofedPr, spoofedIssue),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/exactly one bootstrap provenance marker/);
  });

  it.each([
    ['run ID', { run_id: '31' }],
    ['install SHA', { install_sha: '5'.repeat(40) }],
    ['repository', { repository: 'attacker/consumer' }],
    ['Cast SHA marker', { cast_sha: '6'.repeat(40) }],
  ])('rejects a mismatched %s provenance value', (_label, markerOverrides) => {
    const marker = provenanceMarker(markerOverrides);
    expect(() => selectBootstrapOutputs(
      currentOutputs(
        { ...currentCastPr, body: `${marker}\nCast proposal` },
        {
          ...currentResearchIssue,
          body: `<!-- squad:bootstrap-opportunities schema=1 -->\n${marker}\nCurrent proposals`,
        },
      ),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/expected current-run provenance/);
  });

  it('rejects outputs bound to different runs', () => {
    const wrongIssueMarker = provenanceMarker({ run_id: '31' });
    expect(() => selectBootstrapOutputs(
      currentOutputs(currentCastPr, {
        ...currentResearchIssue,
        body: `<!-- squad:bootstrap-opportunities schema=1 -->\n${wrongIssueMarker}\nCurrent proposals`,
      }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/expected current-run provenance/);
  });

  it.each([
    ['missing marker', 'Cast proposal'],
    ['malformed marker', '<!-- squad:bootstrap-provenance not-json -->\nCast proposal'],
    ['duplicate marker', `${provenanceMarker()}\n${provenanceMarker()}\nCast proposal`],
  ])('rejects a Cast PR with a %s', (_label, body) => {
    expect(() => selectBootstrapOutputs(
      currentOutputs({ ...currentCastPr, body }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/provenance marker/);
  });

  it.each([
    ['missing marker', '<!-- squad:bootstrap-opportunities schema=1 -->\nCurrent proposals'],
    ['malformed marker', '<!-- squad:bootstrap-opportunities schema=1 -->\n<!-- squad:bootstrap-provenance not-json -->\nCurrent proposals'],
    ['duplicate marker', `<!-- squad:bootstrap-opportunities schema=1 -->\n${provenanceMarker()}\n${provenanceMarker()}\nCurrent proposals`],
  ])('rejects a research issue with a %s', (_label, body) => {
    expect(() => selectBootstrapOutputs(
      currentOutputs(currentCastPr, { ...currentResearchIssue, body }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/provenance marker/);
  });

  it.each([
    ['wrong PR author', {
      castPr: { ...currentCastPr, author: { login: 'attacker', id: 999, type: 'User' } },
      issue: currentResearchIssue,
      outputs: {},
      message: /expected GitHub Actions bot/,
    }],
    ['wrong issue author', {
      castPr: currentCastPr,
      issue: { ...currentResearchIssue, author: { login: 'attacker', id: 999, type: 'User' } },
      outputs: {},
      message: /expected GitHub Actions bot/,
    }],
    ['fork head repository', {
      castPr: { ...currentCastPr, headRepository: 'attacker/consumer' },
      issue: currentResearchIssue,
      outputs: {},
      message: /repository, branch, SHA, base, or draft state/,
    }],
    ['wrong PR head SHA', {
      castPr: { ...currentCastPr, headSha: '6'.repeat(40) },
      issue: currentResearchIssue,
      outputs: {},
      message: /expected current-run provenance/,
    }],
    ['wrong target branch SHA', {
      castPr: currentCastPr,
      issue: currentResearchIssue,
      outputs: { castBranchSha: '6'.repeat(40) },
      message: /repository, branch, SHA, base, or draft state/,
    }],
    ['wrong base SHA', {
      castPr: { ...currentCastPr, baseSha: '6'.repeat(40) },
      issue: currentResearchIssue,
      outputs: {},
      message: /repository, branch, SHA, base, or draft state/,
    }],
    ['wrong head branch', {
      castPr: { ...currentCastPr, headRefName: 'squad/bootstrap-cast-spoof' },
      issue: currentResearchIssue,
      outputs: {},
      message: /repository, branch, SHA, base, or draft state/,
    }],
  ])('rejects %s', (_label, testCase) => {
    expect(() => selectBootstrapOutputs(
      { ...currentOutputs(testCase.castPr, testCase.issue), ...testCase.outputs },
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(testCase.message);
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

describe('Squad gh-aw hosted E2E manual pull request fallback outcome', () => {
  it('accepts a current fallback issue bound to the Cast branch', () => {
    expect(selectBootstrapFallback(
      currentFallbackOutputs(),
      baseline,
      installation,
      bootstrapRun,
    )).toEqual({ fallbackIssue: currentFallbackIssue, castBranchSha: CAST_SHA });
  });

  it('does not accept an old fallback issue predating the installation run', () => {
    const oldIssue = { ...currentFallbackIssue, number: 19, createdAt: '2026-09-24T19:59:00.000Z' };
    expect(selectBootstrapFallback(
      currentFallbackOutputs(oldIssue),
      baseline,
      installation,
      bootstrapRun,
    )).toBeNull();
  });

  it('does not accept a closed fallback issue (a human dismissal does not count as a current report)', () => {
    const closedIssue = { ...currentFallbackIssue, state: 'closed' };
    expect(selectBootstrapFallback(
      currentFallbackOutputs(closedIssue),
      baseline,
      installation,
      bootstrapRun,
    )).toBeNull();
  });

  it('does not accept an edited fallback issue (mirrors production: an edited issue would always fail review, so E2E must not report success for it)', () => {
    const editedIssue = { ...currentFallbackIssue, updatedAt: '2026-09-24T20:05:00.000Z' };
    expect(selectBootstrapFallback(
      currentFallbackOutputs(editedIssue),
      baseline,
      installation,
      bootstrapRun,
    )).toBeNull();
  });

  it('rejects a fallback issue not authored by the expected GitHub Actions bot', () => {
    const attacker = { login: 'attacker', id: 999, type: 'User' };
    expect(() => selectBootstrapFallback(
      currentFallbackOutputs({ ...currentFallbackIssue, author: attacker }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/expected GitHub Actions bot/);
  });

  it.each([
    ['missing marker', 'Squad bootstrap pushed a branch, but you need to create the pull request manually.'],
    ['marker bound to a different branch', '<!-- squad:bootstrap-pr-fallback branch=some-other-branch -->\nBody'],
  ])('rejects a fallback issue with a %s', (_label, body) => {
    expect(() => selectBootstrapFallback(
      currentFallbackOutputs({ ...currentFallbackIssue, body }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/canonical pull request fallback marker/);
  });

  it('fails closed when the Cast branch was never pushed', () => {
    expect(() => selectBootstrapFallback(
      { ...currentFallbackOutputs(), castBranchSha: null },
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/Cast branch was not pushed/);
  });

  it('rejects a fallback issue whose provenance compare URL does not match the expected link', () => {
    const badBody = currentFallbackIssue.body.replace(
      fallbackCompareUrl,
      'https://example.test/not-a-compare-url',
    );
    expect(() => selectBootstrapFallback(
      currentFallbackOutputs({ ...currentFallbackIssue, body: badBody }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/provenance does not match the current bootstrap run/);
  });

  it('rejects a fallback issue missing the full signed provenance record (regression: marker + compare URL text alone is not sufficient)', () => {
    // Before this fix, selectBootstrapFallback accepted any issue carrying the plain-text branch
    // marker and a compare-URL substring, even with no signed provenance record at all -- a shape
    // production's own validateBootstrapPrFallbackAttribution would always reject. Stripping only
    // the provenance marker line (keeping the marker and the human-readable compare link intact)
    // proves the E2E now independently enforces the same full-record requirement.
    const noProvenanceBody = currentFallbackIssue.body.replace(`${fallbackProvenanceMarker()}\n`, '');
    expect(() => selectBootstrapFallback(
      currentFallbackOutputs({ ...currentFallbackIssue, body: noProvenanceBody }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/must contain exactly one bootstrap pull request fallback provenance marker/);
  });

  it('rejects a fallback issue whose provenance run_id does not match the current bootstrap run (regression: stale/unrelated run binding)', () => {
    const staleBody = currentFallbackIssue.body.replace(
      fallbackProvenanceMarker(),
      fallbackProvenanceMarker({ run_id: '29' }),
    );
    expect(() => selectBootstrapFallback(
      currentFallbackOutputs({ ...currentFallbackIssue, body: staleBody }),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/provenance does not match the current bootstrap run/);
  });

  it('fails closed on duplicate current-run fallback issues', () => {
    expect(() => selectBootstrapFallback(
      { ...currentFallbackOutputs(), issues: [currentFallbackIssue, { ...currentFallbackIssue, number: 23 }] },
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/Ambiguous current bootstrap fallback issues/);
  });

  it('polls until the fallback issue appears, then resolves', () => {
    let now = 0;
    let calls = 0;
    const github = {
      ...fakeGitHub(),
      listBranches: () => [
        { name: 'main', sha: TARGET_SHA },
        { name: 'squad/bootstrap-cast', sha: CAST_SHA },
      ],
      listIssues: () => {
        calls += 1;
        return calls < 2 ? [] : [currentFallbackIssue];
      },
    };
    const result = waitForBootstrapFallback(
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
    );
    expect(result).toEqual({ fallbackIssue: currentFallbackIssue, castBranchSha: CAST_SHA });
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('times out waiting for a fallback issue that never arrives', () => {
    let now = 0;
    expect(() => waitForBootstrapFallback(
      'owner/consumer',
      baseline,
      installation,
      bootstrapRun,
      {
        github: fakeGitHub(),
        now: () => now,
        pause: (milliseconds: number) => { now += milliseconds; },
        timeoutMs: 20,
        pollMs: 10,
      },
    )).toThrow(/Timed out/);
  });

  it('waitForBootstrapCompletion resolves a Cast PR outcome as kind "pr"', () => {
    const github = {
      ...fakeGitHub(),
      listBranches: () => [
        { name: 'main', sha: TARGET_SHA },
        { name: 'squad/bootstrap-cast', sha: CAST_SHA },
      ],
      listPullRequests: () => [currentCastPr],
      listIssues: () => [currentResearchIssue],
    };
    expect(waitForBootstrapCompletion(
      'owner/consumer',
      baseline,
      installation,
      bootstrapRun,
      { github, timeoutMs: 100, pollMs: 10 },
    )).toEqual({ kind: 'pr', castPr: currentCastPr, researchIssue: currentResearchIssue });
  });

  it('waitForBootstrapCompletion resolves a fallback-issue outcome as kind "fallback"', () => {
    const github = {
      ...fakeGitHub(),
      listBranches: () => [
        { name: 'main', sha: TARGET_SHA },
        { name: 'squad/bootstrap-cast', sha: CAST_SHA },
      ],
      listIssues: () => [currentFallbackIssue],
    };
    expect(waitForBootstrapCompletion(
      'owner/consumer',
      baseline,
      installation,
      bootstrapRun,
      { github, timeoutMs: 100, pollMs: 10 },
    )).toEqual({ kind: 'fallback', fallbackIssue: currentFallbackIssue, castBranchSha: CAST_SHA });
  });

  it('waitForBootstrapCompletion times out when neither outcome ever appears', () => {
    let now = 0;
    expect(() => waitForBootstrapCompletion(
      'owner/consumer',
      baseline,
      installation,
      bootstrapRun,
      {
        github: fakeGitHub(),
        now: () => now,
        pause: (milliseconds: number) => { now += milliseconds; },
        timeoutMs: 20,
        pollMs: 10,
      },
    )).toThrow(/Timed out/);
  });

  it('a malformed fallback-issue body still fails closed under source mutation (regression anchor)', () => {
    // Mutation-kill anchor for selectBootstrapFallback's provenance checks: this proves the guard
    // is reachable and actually enforced, not merely declared. If the provenance parse/compare were
    // deleted or inverted, this issue (whose body intentionally omits the provenance record and the
    // compare-URL section entirely) would be wrongly accepted instead of throwing.
    const malformed = { ...currentFallbackIssue, body: currentFallbackIssue.body.split('### Create')[0].replace(`${fallbackProvenanceMarker()}\n`, '') };
    expect(() => selectBootstrapFallback(
      currentFallbackOutputs(malformed),
      baseline,
      installation,
      bootstrapRun,
    )).toThrow(/must contain exactly one bootstrap pull request fallback provenance marker/);
  });

  it('selectManualFallbackCastPr returns null while no human has opened the Cast pull request yet', () => {
    // Proves the fallback outcome is non-terminal: the fallback issue existing alone is not
    // success, and selectManualFallbackCastPr must not synthesize or require creating one.
    expect(selectManualFallbackCastPr(currentFallbackOutputs(), currentFallbackIssue)).toBeNull();
  });

  it('selectManualFallbackCastPr accepts a valid manually (human) created Cast pull request', () => {
    const pr = manualCastPr();
    expect(selectManualFallbackCastPr(manualFallbackOutputs(pr), currentFallbackIssue)).toBe(pr);
  });

  it('selectManualFallbackCastPr fails closed on a bot-authored look-alike pull request', () => {
    // A bot-authored PR (even one matching every other field) must never be accepted here: it
    // would mean something other than a human satisfied the review-gate boundary under test.
    const pr = manualCastPr({ author: ACTIONS_BOT });
    expect(selectManualFallbackCastPr(manualFallbackOutputs(pr), currentFallbackIssue)).toBeNull();
  });

  it('selectManualFallbackCastPr fails closed on an ambiguous set of candidate pull requests', () => {
    const outputs = {
      ...manualFallbackOutputs(),
      castPrs: [manualCastPr(), manualCastPr({ number: 14, url: 'https://example.test/pr/14' })],
    };
    expect(() => selectManualFallbackCastPr(outputs, currentFallbackIssue)).toThrow(
      /Ambiguous manually created Cast fallback pull requests/,
    );
  });

  it('selectManualFallbackCastPr excludes a closed or merged pull request from candidates (regression)', () => {
    // Regression test (Copilot review on bb805b2c, "Filter fallback selection to open pull
    // requests"): listPullRequests queries state=all, so an unrelated closed/merged human PR that
    // otherwise matches every other field (head/base branch, title, author, SHAs, timing) must
    // never be treated as the manual fallback Cast PR - open state is load-bearing, not cosmetic.
    const closedPr = manualCastPr({ state: 'closed' });
    expect(selectManualFallbackCastPr(manualFallbackOutputs(closedPr), currentFallbackIssue)).toBeNull();
    const mergedPr = manualCastPr({ state: 'merged' });
    expect(selectManualFallbackCastPr(manualFallbackOutputs(mergedPr), currentFallbackIssue)).toBeNull();
    // A genuinely open, otherwise-identical PR must still be found (not an over-broad fix that
    // breaks the valid path).
    const openPr = manualCastPr();
    expect(selectManualFallbackCastPr(manualFallbackOutputs(openPr), currentFallbackIssue)).toBe(openPr);
    // Mixing a closed look-alike with the real open candidate must resolve to the open one alone,
    // not throw ambiguity merely because a closed decoy also matches every other field.
    const mixedOutputs = {
      ...manualFallbackOutputs(),
      castPrs: [closedPr, openPr],
    };
    expect(selectManualFallbackCastPr(mixedOutputs, currentFallbackIssue)).toBe(openPr);
  });

  it('selectManualFallbackCastPr fails closed on a pull request opened before the fallback issue', () => {
    const pr = manualCastPr({ createdAt: '2026-09-24T20:00:00.000Z' });
    expect(selectManualFallbackCastPr(manualFallbackOutputs(pr), currentFallbackIssue)).toBeNull();
  });

  it('selectManualFallbackCastPr fails closed on a wrong head branch, base branch, or title', () => {
    expect(selectManualFallbackCastPr(
      manualFallbackOutputs(manualCastPr({ headRefName: 'squad/bootstrap-cast-other' })),
      currentFallbackIssue,
    )).toBeNull();
    expect(selectManualFallbackCastPr(
      manualFallbackOutputs(manualCastPr({ baseRefName: 'dev' })),
      currentFallbackIssue,
    )).toBeNull();
    expect(selectManualFallbackCastPr(
      manualFallbackOutputs(manualCastPr({ title: 'Cast your Squad (manual)' })),
      currentFallbackIssue,
    )).toBeNull();
  });

  it('selectManualFallbackCastPr fails closed when the SHAs do not match the fallback provenance', () => {
    // Mutation-kill anchor: the candidate matches on branch/title/author/ordering, but its SHAs
    // do not match the signed fallback-issue provenance. If the base/head SHA cross-checks were
    // deleted, this would be wrongly accepted as the authorized pull request.
    expect(() => selectManualFallbackCastPr(
      manualFallbackOutputs(manualCastPr({ baseSha: '5'.repeat(40) })),
      currentFallbackIssue,
    )).toThrow(/does not match the fallback issue provenance/);
    expect(() => selectManualFallbackCastPr(
      manualFallbackOutputs(manualCastPr({ headSha: '6'.repeat(40) })),
      currentFallbackIssue,
    )).toThrow(/does not match the fallback issue provenance/);
  });

  it('selectManualFallbackCastPr fails closed when the head SHA does not match the pushed Cast branch', () => {
    // Even if a candidate's headSha happens to match the fallback issue's own (forgeable) head_sha
    // field, it must still be cross-checked against the Cast branch actually pushed by this run.
    const forgedSha = '7'.repeat(40);
    const forgedProvenance = fallbackProvenanceMarker({ head_sha: forgedSha });
    const forgedFallbackIssue = {
      ...currentFallbackIssue,
      body: currentFallbackIssue.body.replace(fallbackProvenanceMarker(), forgedProvenance),
    };
    const pr = manualCastPr({ headSha: forgedSha });
    expect(() => selectManualFallbackCastPr(
      manualFallbackOutputs(pr, forgedFallbackIssue),
      forgedFallbackIssue,
    )).toThrow(/does not match the pushed Cast branch/);
  });

  it('selectManualFallbackCastPr fails closed on a malformed fallback issue under source mutation (regression anchor)', () => {
    const malformed = {
      ...currentFallbackIssue,
      body: currentFallbackIssue.body.replace(`${fallbackProvenanceMarker()}\n`, ''),
    };
    expect(() => selectManualFallbackCastPr(currentFallbackOutputs(malformed), malformed)).toThrow(
      /must contain exactly one bootstrap pull request fallback provenance marker/,
    );
  });

  it('waitForManualFallbackCastPr polls until a human opens the Cast pull request, then resolves', () => {
    let now = 0;
    let calls = 0;
    const pr = manualCastPr();
    const github = {
      ...fakeGitHub(),
      listBranches: () => [
        { name: 'main', sha: TARGET_SHA },
        { name: 'squad/bootstrap-cast', sha: CAST_SHA },
      ],
      listIssues: () => [currentFallbackIssue],
      listPullRequests: () => {
        calls += 1;
        return calls < 2 ? [] : [pr];
      },
    };
    const result = waitForManualFallbackCastPr(
      'owner/consumer',
      currentFallbackIssue,
      {
        github,
        now: () => now,
        pause: (milliseconds: number) => { now += milliseconds; },
        timeoutMs: 100,
        pollMs: 10,
      },
    );
    expect(result).toBe(pr);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('waitForManualFallbackCastPr times out when no human ever opens the Cast pull request', () => {
    // Direct proof that the fallback-issue outcome alone is not terminal success: with no pull
    // request ever appearing, resume must keep failing rather than report success.
    let now = 0;
    const github = {
      ...fakeGitHub(),
      listBranches: () => [
        { name: 'main', sha: TARGET_SHA },
        { name: 'squad/bootstrap-cast', sha: CAST_SHA },
      ],
      listIssues: () => [currentFallbackIssue],
    };
    expect(() => waitForManualFallbackCastPr(
      'owner/consumer',
      currentFallbackIssue,
      {
        github,
        now: () => now,
        pause: (milliseconds: number) => { now += milliseconds; },
        timeoutMs: 20,
        pollMs: 10,
      },
    )).toThrow(/Timed out waiting for a human to manually create the Cast fallback pull request/);
  });

  it('never creates, merges, or approves the manual fallback Cast pull request itself, and never calls the target API for it from the hosted job', () => {
    // Source-level architectural proof for the redesign: `hosted()`'s fallback branch performs no
    // GitHub API call at all (it only parses the fallback issue's own already-fetched provenance
    // body) and never mutates anything beyond writing local evidence files. `resumeFallback()` is
    // a separate, operator-run-only command (see its doc comment) that may *observe* GitHub state
    // but likewise never issues `pr create`/`pr merge`/review-approval calls.
    const hostedStart = SCRIPT.indexOf('function hosted(');
    const hostedEnd = SCRIPT.indexOf('\nfunction ', hostedStart + 1);
    const hostedBody = SCRIPT.slice(hostedStart, hostedEnd);
    expect(hostedBody).toContain('awaiting_manual_pr');
    expect(hostedBody).toContain('parseBootstrapPrFallbackProvenance');
    expect(hostedBody).not.toContain('selectManualFallbackCastPr');
    expect(hostedBody).not.toContain('waitForManualFallbackCastPr');
    expect(hostedBody).not.toMatch(/'pr',\s*'create'/);
    expect(hostedBody).not.toMatch(/'pr',\s*'merge'/);
    expect(hostedBody).not.toMatch(/'pr',\s*'review'/);

    const resumeStart = SCRIPT.indexOf('function resumeFallback(');
    const resumeEnd = SCRIPT.indexOf('\nfunction ', resumeStart + 1);
    const resumeBody = SCRIPT.slice(resumeStart, resumeEnd);
    expect(resumeBody).toContain('waitForManualFallbackCastPr');
    expect(resumeBody).toContain('waitForBaseControlledReviewCanary');
    expect(resumeBody).not.toMatch(/'pr',\s*'create'/);
    expect(resumeBody).not.toMatch(/'pr',\s*'merge'/);
    expect(resumeBody).not.toMatch(/'pr',\s*'review'/);
  });

  it('wires resume-fallback into the command dispatcher as an operator-only local command, never a workflow job', () => {
    expect(SCRIPT).toContain("args.command === 'resume-fallback'");
    expect(SCRIPT).toMatch(/Usage:.*resume-fallback/);
    // The doc comment directly above `resumeFallback` must say so explicitly, in its own words.
    const resumeStart = SCRIPT.indexOf('function resumeFallback(');
    const commentStart = SCRIPT.lastIndexOf('// Resumes a prior', resumeStart);
    const docComment = SCRIPT.slice(commentStart, resumeStart);
    expect(docComment).toMatch(/operator-run LOCAL command only/);
    expect(docComment).toMatch(/never invoked by any GitHub\n?\/\/ ?Actions workflow or repository_dispatch job/);
    expect(docComment).toMatch(/must never be run with a repository secret/);
    // And the workflow file itself must not wire it to anything -- no job, no dispatch type.
    expect(WORKFLOW).not.toContain('resume-fallback');
    expect(WORKFLOW).not.toContain('resume_fallback');
  });

  it('transitively proves every function resumeFallback can reach issues read-only GitHub API calls', () => {
    // Deeper than the single-function proof above: walks the full transitive call graph reachable
    // from `resumeFallback` (bootstrapOutputs, the githubAdapter block, selectManualFallbackCastPr,
    // waitForManualFallbackCastPr, waitForBaseControlledReviewCanary) and asserts none of those
    // function bodies contain a non-GET `gh api --method`, nor any `pr create`/`pr merge`/`pr
    // review` subcommand. `resumeFallback` is an operator-run-only local command (never wired to
    // any CI job or repository secret -- see its doc comment and the dispatcher-wiring test
    // above); this proves that whatever GH_TOKEN the operator's own `gh` session supplies, every
    // code path this command can execute against the target repository is GET-only.
    const extractFunction = (name: string, exported = false) => {
      const needle = exported ? `export function ${name}(` : `function ${name}(`;
      const start = SCRIPT.indexOf(needle);
      expect(start, `${name} not found in script`).toBeGreaterThanOrEqual(0);
      let depth = 0;
      let i = SCRIPT.indexOf('{', start);
      const bodyStart = i;
      for (; i < SCRIPT.length; i += 1) {
        if (SCRIPT[i] === '{') depth += 1;
        else if (SCRIPT[i] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      return SCRIPT.slice(bodyStart, i + 1);
    };

    const reachableFromResume = [
      extractFunction('resumeFallback'),
      extractFunction('bootstrapOutputs'),
      extractFunction('selectManualFallbackCastPr', true),
      extractFunction('waitForManualFallbackCastPr', true),
      extractFunction('waitForBaseControlledReviewCanary', true),
    ];
    const adapterStart = SCRIPT.indexOf('const githubAdapter = Object.freeze({');
    const adapterEnd = SCRIPT.indexOf('\n});', adapterStart) + 4;
    reachableFromResume.push(SCRIPT.slice(adapterStart, adapterEnd));

    for (const body of reachableFromResume) {
      expect(body).not.toMatch(/--method/);
      expect(body).not.toMatch(/'pr',\s*'create'/);
      expect(body).not.toMatch(/'pr',\s*'merge'/);
      expect(body).not.toMatch(/'pr',\s*'review'/);
      expect(body).not.toMatch(/'issues',\s*'(create|comment|close)'/);
    }
  });

  it('writes complete awaiting_manual_pr evidence (target, branch/head/base/SHA, compare URL, next step) with no API call', () => {
    const hostedStart = SCRIPT.indexOf('function hosted(');
    const hostedEnd = SCRIPT.indexOf('\nfunction ', hostedStart + 1);
    const hostedBody = SCRIPT.slice(hostedStart, hostedEnd);
    for (const field of [
      'target:',
      'head_branch:',
      'head_sha:',
      'base_branch:',
      'base_sha:',
      'compare_url:',
      'next_step:',
    ]) {
      expect(hostedBody).toContain(field);
    }
    expect(hostedBody).toMatch(/installed Squad.*\n.*Review workflow then validates it locally/);
    expect(hostedBody).toContain('never a CI job, never a repository secret');
  });

  it('writes a next_step instruction with a complete, directly-runnable resume-fallback invocation (all three required flags)', () => {
    const hostedStart = SCRIPT.indexOf('function hosted(');
    const hostedEnd = SCRIPT.indexOf('\nfunction ', hostedStart + 1);
    const hostedBody = SCRIPT.slice(hostedStart, hostedEnd);
    // Reproduces the exact arg names resumeFallback() requires via requireArg(),
    // so a reviewer following next_step verbatim never hits "missing required
    // argument" for --target, --evidence-in, or --evidence.
    expect(hostedBody).toMatch(/resume-fallback[\s\S]*--target\b/);
    expect(hostedBody).toMatch(/--evidence-in\b/);
    expect(hostedBody).toMatch(/--evidence\b(?!-in)/);
    // The gh run download step must precede resume-fallback and name the exact
    // artifact convention resumeFallback's own doc comment documents.
    expect(hostedBody).toMatch(/gh run download[\s\S]*?--repo[\s\S]*?--name squad-gh-aw-hosted-e2e-/);
  });
});
