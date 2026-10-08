import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertClearingReview, enforceReviewOutputs, OVERRIDE_PREFIX,
  reviewTarget, validateAttribution, validateVerdict, VERDICT_PREFIX,
} from '../workflows/shared/squad-review-guard.mjs';
import {
  BOOTSTRAP_PR_FALLBACK_ISSUE_TITLE,
  bootstrapPrFallbackIssueMarker,
  buildBootstrapPrFallbackCompareUrl,
  buildBootstrapPrFallbackProvenanceLine,
} from '../workflows/shared/squad-bootstrap-validator.mjs';

const REPOSITORY = 'squad/example';
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const START = '2026-09-28T12:00:00Z';
const ISSUED = '2026-09-28T12:01:00Z';
const SUBMITTED = '2026-09-28T12:01:01Z';
const FINISHED = '2026-09-28T12:02:00Z';
const MERGED = '2026-09-28T12:03:00Z';
const NOW = Date.parse('2026-09-28T12:04:00Z');
const workspaces: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

function fixture(relay = false) {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const env = {
    GITHUB_EVENT_NAME: relay ? 'pull_request' : 'pull_request_target',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_RUN_ID: '17', GITHUB_RUN_ATTEMPT: '1',
    SQUAD_REVIEW_PR: '42', SQUAD_REVIEW_HEAD: HEAD,
    SQUAD_REVIEW_WORKFLOW_SHA: BASE, SQUAD_REVIEW_DEFAULT_BRANCH: 'dev',
  };
  const attribution = {
    schema: 'squad-review-author/v1', repository: REPOSITORY, issue: 9,
    author_agent: 'implementer', reviewer_agent: 'reviewer',
  };
  const registry = {
    schema: 'squad-agent-provenance/v1', schema_version: 1,
    agents: {
      implementer: { persistent_name: 'implementer', status: 'active' },
      reviewer: { persistent_name: 'reviewer', status: 'active' },
    },
  };
  const pr = {
    number: 42, state: relay ? 'closed' : 'open', merged: relay, merged_at: MERGED,
    title: 'Implementation', created_at: START,
    body: '<!-- squad:implement issue=9 run=7 -->',
    user: { login: 'human', type: 'User' },
    head: { sha: HEAD, ref: 'squad/implement-9-fix', repo: { full_name: REPOSITORY, name: 'example' } },
    base: { sha: BASE, ref: 'dev', repo: { full_name: REPOSITORY, name: 'example' } },
  };
  const verdict = {
    schema: 'squad-review-verdict/v1', repository: REPOSITORY, pull_request: 42,
    base_sha: BASE, head_sha: HEAD, author_agent: 'implementer', reviewer_agent: 'reviewer',
    result: 'COMMENT', timestamp: ISSUED, run_id: 17, run_attempt: 1,
    event: 'pull_request_target', workflow_path: '.github/workflows/squad-review.lock.yml',
    workflow_sha: BASE,
  };
  const review = {
    id: 123, user: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' }, commit_id: HEAD,
    state: 'COMMENTED', submitted_at: SUBMITTED,
    body: '',
  };
  const run = {
    id: 17,
    event: 'pull_request_target', path: '.github/workflows/squad-review.lock.yml',
    display_title: 'Squad review \u2014 PR #42',
    repository: { full_name: REPOSITORY }, head_sha: BASE, run_attempt: 1,
    pull_requests: [{ number: 42, head: { sha: HEAD }, base: { repo: { name: 'example' } } }],
    run_started_at: START, updated_at: FINISHED, status: 'completed', conclusion: 'success',
  };
  const jobs = [{
    name: 'review',
    status: 'completed',
    conclusion: 'success',
    started_at: START,
    completed_at: FINISHED,
  }];
  const bootstrapRun = {
    event: 'push', path: '.github/workflows/squad-bootstrap.lock.yml',
    repository: { full_name: REPOSITORY }, head_sha: BASE, head_branch: 'dev',
    status: 'completed', conclusion: 'success',
  };
  const override = {
    schema: 'squad-review-override/v1', repository: REPOSITORY, pull_request: 42,
    head_sha: HEAD, review_id: 123, reason: 'Accepted false positive; linked human decision.',
  };
  const comment = {
    user: { login: 'human', type: 'User' }, created_at: FINISHED, updated_at: FINISHED,
    body: '',
  };
  const state = {
    reviews: [review], comments: [] as typeof comment[], permission: 'admin',
    missingManifest: false, calls: [] as string[], prReads: 0, changeAfterFirstRead: false,
    workflowRuns: [run],
    attempts: new Map([[1, run]]),
    attemptJobs: new Map([[1, jobs]]),
    repoIssues: [] as Record<string, unknown>[],
    extraRuns: new Map<string, Record<string, unknown>>(),
    compareStatus: 'diverged' as 'identical' | 'ahead' | 'behind' | 'diverged',
    compareThrows: 0 as number,
    compareOmitStatus: false,
    compareOmitBaseCommit: false,
    compareOmitMergeBaseCommit: false,
    compareBaseCommitShaOverride: undefined as string | undefined,
    compareMergeBaseShaOverride: undefined as string | undefined,
  };
  const encode = (value: unknown) => {
    const content = Buffer.from(JSON.stringify(value));
    return {
      type: 'file', encoding: 'base64', size: content.length,
      content: content.toString('base64'),
    };
  };
  const get = async (route: string, fields?: Record<string, unknown>) => {
    state.calls.push(route);
    if (route.endsWith('/pulls/42')) {
      state.prReads++;
      if (state.changeAfterFirstRead && state.prReads > 1) pr.head.sha = BASE;
      return structuredClone(pr);
    }
    if (route === `repos/${REPOSITORY}`) {
      return { full_name: REPOSITORY, default_branch: 'dev' };
    }
    if (route === `repos/${REPOSITORY}/issues`) return state.repoIssues;
    const compare = route.match(/\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/);
    if (compare) {
      const [, baseSha, headSha] = compare;
      if (state.compareThrows) throw Object.assign(new Error('API error'), { status: state.compareThrows });
      const status = baseSha === headSha ? 'identical' : state.compareStatus;
      const resolvedBaseSha = state.compareBaseCommitShaOverride ?? baseSha;
      const result: Record<string, unknown> = {};
      if (!state.compareOmitStatus) result.status = status;
      if (!state.compareOmitBaseCommit) result.base_commit = { sha: resolvedBaseSha };
      if (!state.compareOmitMergeBaseCommit) {
        result.merge_base_commit = { sha: state.compareMergeBaseShaOverride ?? resolvedBaseSha };
      }
      return result;
    }
    if (route.endsWith('/contents/.squad-review.json')) {
      expect(fields?.ref).toBe(HEAD);
      if (state.missingManifest) {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      }
      return encode(attribution);
    }
    if (route.endsWith('/contents/.squad/bootstrap-reset.json')) {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    }
    if (route.endsWith('/contents/.squad/casting/registry.json')) {
      expect(fields?.ref).toBe(BASE);
      return encode(registry);
    }
    if (route.endsWith('/reviews')) return state.reviews;
    if (route.endsWith('/actions/workflows/squad-review.lock.yml/runs')) {
      return { workflow_runs: state.workflowRuns };
    }
    if (route.endsWith('/actions/runs/17')) return run;
    if (route.endsWith('/actions/runs/29')) return bootstrapRun;
    const genericRun = route.match(/\/actions\/runs\/([1-9]\d*)$/);
    if (genericRun && state.extraRuns.has(genericRun[1])) return state.extraRuns.get(genericRun[1]);
    const attempt = route.match(/\/actions\/runs\/\d+\/attempts\/(\d+)$/);
    if (attempt) return state.attempts.get(Number(attempt[1]));
    const attemptJobs = route.match(/\/actions\/runs\/\d+\/attempts\/(\d+)\/jobs$/);
    if (attemptJobs) return { jobs: state.attemptJobs.get(Number(attemptJobs[1])) ?? [] };
    if (route.endsWith('/comments')) return state.comments;
    if (route.endsWith('/permission')) return { permission: state.permission };
    throw new Error(`Unexpected API route: ${route}`);
  };
  const sync = () => {
    review.body = `${VERDICT_PREFIX}${JSON.stringify(verdict)}`;
    comment.body = `${OVERRIDE_PREFIX}${JSON.stringify(override)}`;
  };
  sync();
  return {
    env, attribution, registry, pr, verdict, review, run, bootstrapRun, jobs,
    override, comment,
    state, encode, get, sync,
  };
}

function makeBootstrap(f: ReturnType<typeof fixture>) {
  f.state.missingManifest = true;
  f.pr.title = '[squad] Cast your Squad';
  f.pr.user = { login: 'github-actions[bot]', type: 'Bot' };
  f.pr.head.ref = 'squad/bootstrap-cast';
  f.pr.body = `<!-- squad:bootstrap-provenance ${JSON.stringify({
    schema: 1,
    repository: REPOSITORY,
    run_id: '29',
    install_sha: BASE,
    cast_sha: HEAD,
  })} -->`;
  f.state.comments.push({
    user: { login: 'github-actions[bot]', type: 'Bot' },
    created_at: START,
    updated_at: START,
    body: `${f.pr.body}\nBase-controlled bootstrap provenance. Do not edit this comment.`,
  });
  f.verdict.author_agent = '@squad/base-controlled-bootstrap';
  f.verdict.reviewer_agent = '@squad/base-controlled-review';
  f.sync();
}

type BootstrapPrFallbackIssueOptions = {
  headBranch: string;
  baseBranch: string;
  baseSha?: string;
  headSha?: string;
  runId?: string;
  createdAt?: string;
  updatedAt?: string;
  author?: { login: string; type: string };
  title?: string;
  state?: string;
  compareUrlOverride?: string;
  omitProvenance?: boolean;
  omitMarker?: boolean;
};

function makeBootstrapPrFallbackIssue(options: BootstrapPrFallbackIssueOptions) {
  const {
    headBranch, baseBranch, baseSha = BASE, headSha = HEAD, runId = '29', createdAt = START, updatedAt = createdAt,
    author = { login: 'github-actions[bot]', type: 'Bot' },
    title = BOOTSTRAP_PR_FALLBACK_ISSUE_TITLE, state = 'open',
    compareUrlOverride, omitProvenance = false, omitMarker = false,
  } = options;
  const compareUrl = buildBootstrapPrFallbackCompareUrl({
    repository: REPOSITORY, baseBranch, headBranch, title: '[squad] Cast your Squad', server: 'https://github.com',
  });
  const provenanceLine = omitProvenance ? '' : `${buildBootstrapPrFallbackProvenanceLine({
    repository: REPOSITORY, runId, baseBranch, baseSha, headBranch, headSha,
    compareUrl: compareUrlOverride ?? compareUrl,
  })}\n`;
  const marker = omitMarker ? '' : `${bootstrapPrFallbackIssueMarker(headBranch)}\n`;
  return {
    state,
    user: author,
    title,
    created_at: createdAt,
    updated_at: updatedAt,
    body: `${marker}${provenanceLine}\n${compareUrl}`,
  };
}

// A human manually opened the Cast PR from the compare-URL link in the bootstrap fallback issue,
// after automated pull request creation was permission-denied (documented alongside item 8's mandatory
// `can_approve_pull_request_reviews: false` policy). This PR carries no bot provenance comment; squad
// review re-verifies it against the bot-authored, signed fallback issue's provenance record instead.
// Its title must still be the canonical Cast title: the compare URL a human is asked to open already
// pre-fills it, and classifyBootstrapState() rejects any PR on this branch with another title.
function makeBootstrapPrFallback(
  f: ReturnType<typeof fixture>,
  issueOverrides: Partial<BootstrapPrFallbackIssueOptions> = {},
) {
  f.state.missingManifest = true;
  f.pr.title = '[squad] Cast your Squad';
  f.pr.user = { login: 'human', type: 'User' };
  f.pr.head.ref = 'squad/bootstrap-cast';
  f.pr.head.sha = HEAD;
  f.pr.created_at = START;
  f.pr.body = 'Opened manually from the fallback issue compare link.';
  f.state.repoIssues = [makeBootstrapPrFallbackIssue({
    headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, baseSha: f.pr.base.sha, headSha: HEAD, runId: '29',
    createdAt: START, ...issueOverrides,
  })];
  f.sync();
}

function retainFirstAttempt(f: ReturnType<typeof fixture>) {
  const firstAttempt = structuredClone(f.run);
  const firstJobs = structuredClone(f.jobs);
  const first = structuredClone(f.review);
  first.body = `${VERDICT_PREFIX}${JSON.stringify({ ...f.verdict, result: 'REQUEST_CHANGES' })}`;
  f.review.id = 124;
  f.review.submitted_at = '2026-09-28T12:02:11Z';
  f.verdict.timestamp = '2026-09-28T12:02:10Z';
  f.verdict.run_attempt = 2;
  f.run.run_attempt = 2;
  f.run.run_started_at = FINISHED;
  f.run.updated_at = '2026-09-28T12:02:30Z';
  f.jobs[0].started_at = FINISHED;
  f.jobs[0].completed_at = f.run.updated_at;
  f.state.attempts.set(1, firstAttempt);
  f.state.attempts.set(2, f.run);
  f.state.attemptJobs.set(1, firstJobs);
  f.state.attemptJobs.set(2, f.jobs);
  f.state.reviews = [first, f.review];
  f.sync();
  return first;
}

describe('generation-bound fresh bootstrap review', () => {
  const reset = {
    schema: 'squad-bootstrap-reset/v1', id: 'retry-1',
    archived_pull_requests: [3], archived_issues: [],
  };
  function freshFixture(manual = false) {
    const f = fixture();
    makeBootstrap(f);
    f.pr.head.ref = 'squad/bootstrap-cast-retry-1';
    f.pr.title += ' [reset:retry-1]';
    f.bootstrapRun.event = 'workflow_dispatch';
    const actors = {
      actor: { login: 'maintainer', type: 'User' },
      triggering_actor: { login: 'maintainer', type: 'User' },
    };
    Object.assign(f.bootstrapRun, actors);
    if (manual) {
      f.pr.user = { login: 'human', type: 'User' };
      f.state.comments = [];
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: f.pr.head.ref, baseBranch: f.pr.base.ref,
        compareUrlOverride: buildBootstrapPrFallbackCompareUrl({
          repository: REPOSITORY, baseBranch: f.pr.base.ref,
          headBranch: f.pr.head.ref, title: f.pr.title, server: 'https://github.com',
        }),
      })];
    }
    const state = { reset, recordedReset: reset };
    const get = async (route: string, fields?: Record<string, unknown>) => {
      if (route.endsWith('/contents/.squad/bootstrap-reset.json')) {
        return f.encode(fields?.ref === f.pr.base.sha ? state.reset : state.recordedReset);
      }
      return f.get(route, fields);
    };
    return { ...f, get, actors, resetState: state };
  }

  it.each([false, true])('authorizes exact authenticated dispatch provenance (manual fallback=%s)', async manual => {
    const f = freshFixture(manual);
    expect((await reviewTarget(f.env, f.get, { requireBootstrapRunSuccess: true })).author_agent)
      .toBe('@squad/base-controlled-bootstrap');
    expect(f.state.calls.some(route => route.includes('/collaborators/maintainer/permission'))).toBe(true);
  });

  it.each([false, true])('rejects wrong actor, identity, head and unsuccessful runs (fallback=%s)', async manual => {
    for (const mutate of [
      (f: ReturnType<typeof freshFixture>) => { f.state.permission = 'read'; },
      (f: ReturnType<typeof freshFixture>) => { f.actors.triggering_actor.type = 'Bot'; },
      (f: ReturnType<typeof freshFixture>) => { f.resetState.reset = { ...reset, id: 'other' }; },
      (f: ReturnType<typeof freshFixture>) => { f.bootstrapRun.head_sha = HEAD; },
      (f: ReturnType<typeof freshFixture>) => { f.bootstrapRun.conclusion = 'failure'; },
      (f: ReturnType<typeof freshFixture>) => { f.bootstrapRun.path = '.github/workflows/other.yml'; },
      (f: ReturnType<typeof freshFixture>) => { f.bootstrapRun.event = 'push'; },
    ]) {
      const f = freshFixture(manual);
      mutate(f);
      await expect(reviewTarget(f.env, f.get, { requireBootstrapRunSuccess: true })).rejects.toThrow();
    }
  });

  it('keeps legacy manual dispatch ineligible and refuses changed committed reset history', async () => {
    const legacy = fixture();
    makeBootstrap(legacy);
    legacy.bootstrapRun.event = 'workflow_dispatch';
    await expect(reviewTarget(legacy.env, legacy.get)).rejects.toThrow('base-controlled workflow run');
    const f = freshFixture();
    f.pr.base.sha = '9'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    f.resetState.recordedReset = { ...reset, archived_pull_requests: [99] };
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow('reset changed');
  });

  it.each([false, true])('refuses reopened archived legacy Cast authorization (fallback=%s)', async manual => {
    const f = fixture();
    if (manual) makeBootstrapPrFallback(f);
    else makeBootstrap(f);
    const get = async (route: string, fields?: Record<string, unknown>) => {
      if (route.endsWith('/contents/.squad/bootstrap-reset.json')) {
        return f.encode({ ...reset, archived_pull_requests: [42] });
      }
      return f.get(route, fields);
    };
    await expect(reviewTarget(f.env, get)).rejects.toThrow('archived bootstrap pull requests');
  });
});

describe('independent Squad review guard', () => {
  it('uses reserved workflow roles only for the base-controlled post-install bootstrap PR', async () => {
    const f = fixture();
    makeBootstrap(f);
    f.state.reviews = [];
    await expect(reviewTarget(f.env, f.get)).resolves.toMatchObject({
      author_agent: '@squad/base-controlled-bootstrap',
      reviewer_agent: '@squad/base-controlled-review',
    });

    const workspace = mkdtempSync(join(tmpdir(), 'squad-review-bootstrap-'));
    workspaces.push(workspace);
    const path = join(workspace, 'output.json');
    writeFileSync(path, JSON.stringify({ items: [{
      type: 'submit_pull_request_review', event: 'COMMENT', body: 'Bootstrap Cast reviewed.',
    }] }));
    await enforceReviewOutputs({ ...f.env, GH_AW_AGENT_OUTPUT: path }, f.get);
    const output = JSON.parse(readFileSync(path, 'utf8'));
    expect(output.items[0].body).toContain('"author_agent":"@squad/base-controlled-bootstrap"');
    expect(output.items[0].body).toContain(
      '"reviewer_agent":"@squad/base-controlled-review"',
    );
  });

  it('refuses arbitrary first-install PRs even when they contain package-shaped claims', async () => {
    const f = fixture();
    f.state.missingManifest = true;
    f.pr.title = 'ci: add Squad agentic workflow';
    f.pr.body = `Package: bradygaster/squad/workflows@${HEAD}`;
    await expect(reviewTarget(f.env, f.get))
      .rejects.toThrow('missing or duplicate base-controlled bootstrap PR provenance');
  });

  it.each([
    ['branch', (f: ReturnType<typeof fixture>) => { f.pr.head.ref = 'attacker/bootstrap'; }],
    ['title', (f: ReturnType<typeof fixture>) => { f.pr.title = 'Trusted bootstrap'; }],
    ['author', (f: ReturnType<typeof fixture>) => { f.pr.user.login = 'attacker'; }],
    ['head', (f: ReturnType<typeof fixture>) => {
      f.pr.body = f.pr.body.replace(HEAD, BASE);
    }],
    ['base run', (f: ReturnType<typeof fixture>) => { f.bootstrapRun.head_sha = HEAD; }],
    ['workflow', (f: ReturnType<typeof fixture>) => {
      f.bootstrapRun.path = '.github/workflows/attacker.yml';
    }],
    ['comment', (f: ReturnType<typeof fixture>) => {
      f.state.comments[0].body = f.state.comments[0].body.replace(HEAD, BASE);
    }],
    ['comment author', (f: ReturnType<typeof fixture>) => {
      f.state.comments[0].user.login = 'attacker';
    }],
  ])('refuses a bootstrap activation with mutated %s provenance', async (_label, mutate) => {
    const f = fixture();
    makeBootstrap(f);
    mutate(f);
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow();
  });

  it('requires successful base-controlled bootstrap completion at the clearing gate', async () => {
    const f = fixture();
    makeBootstrap(f);
    f.bootstrapRun.status = 'in_progress';
    f.bootstrapRun.conclusion = null;
    await expect(reviewTarget(f.env, f.get)).resolves.toMatchObject({
      author_agent: '@squad/base-controlled-bootstrap',
    });
    await expect(assertClearingReview(f.env, f.get))
      .rejects.toThrow('base-controlled bootstrap run did not complete successfully');
  });

  it('accepts bot-authored bootstrap provenance when the install commit is identical to the live base', async () => {
    const f = fixture();
    makeBootstrap(f);
    await expect(reviewTarget(f.env, f.get)).resolves.toMatchObject({
      author_agent: '@squad/base-controlled-bootstrap',
    });
    expect(f.state.calls).toContain(`repos/${REPOSITORY}/compare/${BASE}...${BASE}`);
  });

  it('accepts bot-authored bootstrap provenance when the default branch fast-forwarded after installation', async () => {
    const f = fixture();
    makeBootstrap(f);
    const advancedBase = 'd'.repeat(40);
    f.pr.base.sha = advancedBase;
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = advancedBase;
    f.state.compareStatus = 'ahead';
    await expect(reviewTarget(f.env, f.get)).resolves.toMatchObject({
      author_agent: '@squad/base-controlled-bootstrap',
    });
    expect(f.state.calls).toContain(`repos/${REPOSITORY}/compare/${BASE}...${advancedBase}`);
  });

  it.each([
    ['diverged', (f: ReturnType<typeof fixture>) => { f.state.compareStatus = 'diverged'; }],
    ['behind', (f: ReturnType<typeof fixture>) => { f.state.compareStatus = 'behind'; }],
    ['missing status', (f: ReturnType<typeof fixture>) => {
      f.state.compareOmitStatus = true;
    }],
    ['missing base_commit', (f: ReturnType<typeof fixture>) => {
      f.state.compareStatus = 'ahead';
      f.state.compareOmitBaseCommit = true;
    }],
    ['missing merge_base_commit', (f: ReturnType<typeof fixture>) => {
      f.state.compareStatus = 'ahead';
      f.state.compareOmitMergeBaseCommit = true;
    }],
    ['mismatched base_commit', (f: ReturnType<typeof fixture>) => {
      f.state.compareStatus = 'ahead';
      f.state.compareBaseCommitShaOverride = 'e'.repeat(40);
    }],
    ['mismatched merge_base_commit', (f: ReturnType<typeof fixture>) => {
      f.state.compareStatus = 'ahead';
      f.state.compareMergeBaseShaOverride = 'f'.repeat(40);
    }],
  ])('rejects bot-authored bootstrap provenance when compare evidence is %s', async (_label, mutate) => {
    const f = fixture();
    makeBootstrap(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    mutate(f);
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'bootstrap provenance install commit is not an ancestor of the pull request base',
    );
  });

  it.each([
    ['404', 404],
    ['rate limit', 403],
    ['general API failure', 500],
  ])('fails closed when the bot-authored bootstrap compare API returns %s', async (_label, status) => {
    const f = fixture();
    makeBootstrap(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    f.state.compareThrows = status;
    await expect(reviewTarget(f.env, f.get)).rejects.toMatchObject({ status });
  });

  it('accepts the documented manual bootstrap pull request fallback when live data exactly matches the signed provenance record', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.state.reviews = [];
    await expect(reviewTarget(f.env, f.get)).resolves.toMatchObject({
      author_agent: '@squad/base-controlled-bootstrap',
      reviewer_agent: '@squad/base-controlled-review',
    });

    const workspace = mkdtempSync(join(tmpdir(), 'squad-review-bootstrap-fallback-'));
    workspaces.push(workspace);
    const path = join(workspace, 'output.json');
    writeFileSync(path, JSON.stringify({ items: [{
      type: 'submit_pull_request_review', event: 'COMMENT', body: 'Manual Cast PR fallback reviewed.',
    }] }));
    await enforceReviewOutputs({ ...f.env, GH_AW_AGENT_OUTPUT: path }, f.get);
    const output = JSON.parse(readFileSync(path, 'utf8'));
    expect(output.items[0].body).toContain('"author_agent":"@squad/base-controlled-bootstrap"');
    expect(output.items[0].body).toContain('"reviewer_agent":"@squad/base-controlled-review"');
  });

  it('requires successful base-controlled bootstrap completion at the clearing gate for the fallback path too', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.bootstrapRun.status = 'in_progress';
    f.bootstrapRun.conclusion = null;
    await expect(reviewTarget(f.env, f.get)).resolves.toMatchObject({
      author_agent: '@squad/base-controlled-bootstrap',
    });
    await expect(assertClearingReview(f.env, f.get))
      .rejects.toThrow('base-controlled bootstrap run did not complete successfully');
  });

  it('does not extend the fallback trust path to an unrelated PR on the Cast branch with no matching issue', async () => {
    const f = fixture();
    f.state.missingManifest = true;
    // Canonical title so this isolates the "no matching fallback issue" rejection path from the
    // separate (also-covered) wrong-title rejection path.
    f.pr.title = '[squad] Cast your Squad';
    f.pr.user = { login: 'human', type: 'User' };
    f.pr.head.ref = 'squad/bootstrap-cast';
    f.pr.body = 'No fallback issue exists for this branch.';
    f.state.repoIssues = [];
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'missing base-controlled bootstrap PR fallback issue',
    );
  });

  it('rejects a fallback-path PR with a non-canonical title even if a matching fallback issue exists', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.title = 'Manually opened Cast PR';
    f.sync();
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'pull request does not match the documented manual Cast fallback shape',
    );
  });

  it('rejects a fallback-path PR authored by a non-human, non-Bot account type (regression: only an actual User account qualifies)', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.user = { login: 'some-app', type: 'Organization' };
    f.sync();
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'pull request does not match the documented manual Cast fallback shape',
    );
  });

  it('still refuses an ordinary (non-fallback) human-authored PR with the unchanged bootstrap provenance error', async () => {
    const f = fixture();
    f.state.missingManifest = true;
    f.pr.title = 'Unrelated change';
    f.pr.user = { login: 'human', type: 'User' };
    f.pr.head.ref = 'squad/implement-9-fix';
    f.pr.body = 'An ordinary implementation PR, not on the Cast branch.';
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'missing or duplicate base-controlled bootstrap PR provenance',
    );
  });

  it('refuses the fallback trust path when duplicate open fallback issues are ambiguous', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.state.repoIssues.push(makeBootstrapPrFallbackIssue({
      headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, runId: '29',
    }));
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow('Ambiguous bootstrap PR fallback issues');
  });

  it.each([
    ['forged (non-bot) author', (f: ReturnType<typeof fixture>) => {
      (f.state.repoIssues[0] as { user: unknown }).user = { login: 'attacker', type: 'User' };
    }],
    ['edited after creation', (f: ReturnType<typeof fixture>) => {
      (f.state.repoIssues[0] as { updated_at: string }).updated_at = SUBMITTED;
    }],
    ['closed', (f: ReturnType<typeof fixture>) => {
      (f.state.repoIssues[0] as { state: string }).state = 'closed';
    }],
    ['titled incorrectly', (f: ReturnType<typeof fixture>) => {
      (f.state.repoIssues[0] as { title: string }).title = 'A different issue';
    }],
    ['missing its branch marker', (f: ReturnType<typeof fixture>) => {
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, omitMarker: true,
      })];
    }],
    ['missing its provenance record', (f: ReturnType<typeof fixture>) => {
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, omitProvenance: true,
      })];
    }],
    ['bound to the wrong repository', (f: ReturnType<typeof fixture>) => {
      const issue = f.state.repoIssues[0] as { body: string };
      issue.body = issue.body.replace(`"repository":"${REPOSITORY}"`, '"repository":"attacker/squad"');
    }],
    ['bound to the wrong base branch', (f: ReturnType<typeof fixture>) => {
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: 'main', headSha: HEAD,
      })];
    }],
    ['bound to a stale base commit SHA (the default branch advanced since the issue was opened)', (f: ReturnType<typeof fixture>) => {
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, baseSha: '9'.repeat(40), headSha: HEAD,
      })];
    }],
    ['bound to the wrong head branch', (f: ReturnType<typeof fixture>) => {
      const issue = f.state.repoIssues[0] as { body: string };
      issue.body = issue.body.replace(
        '"head_branch":"squad/bootstrap-cast"',
        '"head_branch":"attacker/bootstrap"',
      );
    }],
    ['bound to the wrong head SHA', (f: ReturnType<typeof fixture>) => {
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: BASE,
      })];
    }],
    ['bound to a tampered compare URL', (f: ReturnType<typeof fixture>) => {
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD,
        compareUrlOverride: 'https://github.com/squad/example/compare/dev...attacker?expand=1',
      })];
    }],
    ['bound to a run with the wrong event', (f: ReturnType<typeof fixture>) => {
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, runId: '17',
      })];
    }],
    ['bound to a run in the wrong repository', (f: ReturnType<typeof fixture>) => {
      f.state.extraRuns.set('99', {
        event: 'push', path: '.github/workflows/squad-bootstrap.lock.yml',
        repository: { full_name: 'attacker/squad' }, head_branch: 'dev',
        status: 'completed', conclusion: 'success',
      });
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, runId: '99',
      })];
    }],
    ['bound to a run on the wrong workflow path', (f: ReturnType<typeof fixture>) => {
      f.state.extraRuns.set('98', {
        event: 'push', path: '.github/workflows/attacker.yml',
        repository: { full_name: REPOSITORY }, head_branch: 'dev',
        status: 'completed', conclusion: 'success',
      });
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, runId: '98',
      })];
    }],
    ['bound to a run against the wrong branch', (f: ReturnType<typeof fixture>) => {
      f.state.extraRuns.set('97', {
        event: 'push', path: '.github/workflows/squad-bootstrap.lock.yml',
        repository: { full_name: REPOSITORY }, head_branch: 'attacker-branch',
        status: 'completed', conclusion: 'success',
      });
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, runId: '97',
      })];
    }],
    ['created after the pull request', (f: ReturnType<typeof fixture>) => {
      f.pr.created_at = START;
      f.state.repoIssues = [makeBootstrapPrFallbackIssue({
        headBranch: 'squad/bootstrap-cast', baseBranch: f.pr.base.ref, headSha: HEAD, createdAt: FINISHED,
      })];
    }],
  ])('refuses the manual fallback trust path when the fallback issue is %s', async (_label, mutate) => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    mutate(f);
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow();
  });

  it('recovers the manual fallback trust path when the default branch fast-forwarded past the recorded base commit (base-drift regression)', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    // Simulate ordinary activity landing on the default branch between the base-controlled
    // bootstrap run filing the fallback issue and a human later opening the Cast PR: the live
    // PR base.sha has moved on from the pinned provenance.base_sha, but the bootstrap run itself
    // (id 29) still legitimately recorded the original BASE commit.
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    await expect(reviewTarget(f.env, f.get)).resolves.toMatchObject({
      author_agent: '@squad/base-controlled-bootstrap',
    });
  });

  it('refuses the manual fallback trust path when the default branch has diverged (force-pushed) past the recorded base commit', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'diverged';
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'bootstrap PR fallback provenance base commit is not an ancestor of the pull request base',
    );
  });

  it('refuses the manual fallback trust path when the default branch moved behind the recorded base commit', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'behind';
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'bootstrap PR fallback provenance base commit is not an ancestor of the pull request base',
    );
  });

  it('refuses the manual fallback trust path when the compare API errors (fails closed, no local ancestry assumption)', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    f.state.compareThrows = 404;
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow('API error');
  });

  it('refuses the manual fallback trust path when the compare API omits base_commit (status alone is not binding proof)', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    f.state.compareOmitBaseCommit = true;
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'bootstrap PR fallback provenance base commit is not an ancestor of the pull request base',
    );
  });

  it('refuses the manual fallback trust path when the compare API omits merge_base_commit', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    f.state.compareOmitMergeBaseCommit = true;
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'bootstrap PR fallback provenance base commit is not an ancestor of the pull request base',
    );
  });

  it('refuses the manual fallback trust path when base_commit resolves to an unrelated commit despite a passing status', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    f.state.compareBaseCommitShaOverride = 'e'.repeat(40);
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'bootstrap PR fallback provenance base commit is not an ancestor of the pull request base',
    );
  });

  it('refuses the manual fallback trust path when merge_base_commit resolves to an unrelated commit despite a passing status', async () => {
    const f = fixture();
    makeBootstrapPrFallback(f);
    f.pr.base.sha = 'd'.repeat(40);
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = f.pr.base.sha;
    f.state.compareStatus = 'ahead';
    f.state.compareMergeBaseShaOverride = 'f'.repeat(40);
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow(
      'bootstrap PR fallback provenance base commit is not an ancestor of the pull request base',
    );
  });

  it('does not rescue malformed attribution or non-404 reads', async () => {
    const f = fixture();
    f.attribution.schema = 'wrong';
    await expect(reviewTarget(f.env, f.get)).rejects.toThrow('malformed committed');
    await expect(reviewTarget(f.env, async (route, fields) => {
      if (route.endsWith('/contents/.squad-review.json')) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }
      return f.get(route, fields);
    })).rejects.toThrow('Forbidden');
  });

  it('accepts a distinct, committed, current-head verdict and merged-head relay', async () => {
    for (const relay of [false, true]) {
      const f = fixture(relay);
      await expect(assertClearingReview(f.env, f.get, { relay })).resolves.toEqual(f.verdict);
      expect(f.state.prReads).toBe(2);
      if (relay) expect(f.state.calls.some(route => route.endsWith('/jobs'))).toBe(true);
    }
  });

  it('requires the correct event and trusted base workflow SHA on merged relays', async () => {
    const f = fixture(true);
    f.env.GITHUB_EVENT_NAME = 'pull_request_target';
    await expect(assertClearingReview(f.env, f.get, { relay: true }))
      .rejects.toThrow('only merged pull request events');
    f.env.GITHUB_EVENT_NAME = 'pull_request';
    f.env.SQUAD_REVIEW_WORKFLOW_SHA = '';
    await expect(assertClearingReview(f.env, f.get, { relay: true }))
      .rejects.toThrow('workflow source is not the exact PR base commit');
  });

  it.each([false, true])('selects a successful rerun with retained attempt-1 rejection (reverse=%s)', async reverse => {
    const f = fixture(true);
    retainFirstAttempt(f);
    if (reverse) f.state.reviews.reverse();
    await expect(assertClearingReview(f.env, f.get, { relay: true })).resolves.toEqual(f.verdict);
    expect(f.state.calls).toContain(`repos/${REPOSITORY}/actions/runs/17/attempts/2/jobs`);
    expect(f.state.calls).not.toContain(`repos/${REPOSITORY}/actions/runs/17/attempts/1/jobs`);
  });

  it('keeps the executing gate scoped to its exact attempt with retained older evidence', async () => {
    const f = fixture();
    retainFirstAttempt(f);
    f.env.GITHUB_RUN_ATTEMPT = '2';
    await expect(assertClearingReview(f.env, f.get)).resolves.toEqual(f.verdict);
    f.state.reviews.push({ ...f.review, id: 125 });
    await expect(assertClearingReview(f.env, f.get)).rejects.toThrow('duplicate verdict evidence');
  });

  it('orders by GitHub submission time and review ID, not verdict time or list order', async () => {
    const f = fixture(true);
    const first = retainFirstAttempt(f);
    first.submitted_at = f.review.submitted_at;
    first.body = `${VERDICT_PREFIX}${JSON.stringify({
      ...f.verdict, run_attempt: 1, result: 'REQUEST_CHANGES', timestamp: first.submitted_at,
    })}`;
    f.state.reviews.reverse();
    await expect(assertClearingReview(f.env, f.get, { relay: true })).resolves.toEqual(f.verdict);
    // Submission time takes precedence even when the earlier review has a larger ID.
    first.submitted_at = SUBMITTED;
    first.id = 125;
    first.body = `${VERDICT_PREFIX}${JSON.stringify({
      ...f.verdict, run_attempt: 1, result: 'REQUEST_CHANGES', timestamp: ISSUED,
    })}`;
    await expect(assertClearingReview(f.env, f.get, { relay: true })).resolves.toEqual(f.verdict);
  });

  it('selects a newer automatic run independently of the relay environment run ID', async () => {
    const f = fixture(true);
    retainFirstAttempt(f);
    f.verdict.run_id = 18;
    f.verdict.run_attempt = f.run.run_attempt = 1;
    f.run.id = 18;
    f.state.attempts = new Map([[1, f.run]]);
    f.state.attemptJobs = new Map([[1, f.jobs]]);
    f.sync();
    await expect(assertClearingReview(f.env, f.get, { relay: true })).resolves.toEqual(f.verdict);
  });

  it('does not fall back when the latest trusted failed rerun emitted no review', async () => {
    const f = fixture(true);
    retainFirstAttempt(f);
    f.state.reviews = [f.state.reviews[0]];
    f.state.attempts.get(2)!.conclusion = 'failure';
    f.state.attemptJobs.get(2)![0].conclusion = 'failure';
    await expect(assertClearingReview(f.env, f.get, { relay: true }))
      .rejects.toThrow('missing or duplicate verdict evidence');
    expect(f.state.calls).not.toContain(`repos/${REPOSITORY}/actions/runs/17/attempts/1/jobs`);
  });

  it('rejects duplicate verdicts for the selected attempt even with distinct review IDs', async () => {
    const f = fixture(true);
    retainFirstAttempt(f);
    f.state.reviews.push({ ...f.review, id: 125 });
    await expect(assertClearingReview(f.env, f.get, { relay: true }))
      .rejects.toThrow('duplicate verdict evidence');
  });

  it.each([
    'failed-run', 'failed-job', 'duplicate-job', 'wrong-workflow', 'wrong-event',
    'wrong-head', 'replay', 'after-merge', 'malformed', 'invalid-id', 'latest-rejection',
  ])('never falls back to an earlier attempt when the latest has %s', async mutation => {
    const f = fixture(true);
    retainFirstAttempt(f);
    f.state.reviews[0].body = `${VERDICT_PREFIX}${JSON.stringify({
      ...f.verdict, run_attempt: 1, timestamp: ISSUED,
    })}`;
    switch (mutation) {
      case 'failed-run': f.run.conclusion = 'failure'; break;
      case 'failed-job': f.jobs[0].conclusion = 'failure'; break;
      case 'duplicate-job': f.jobs.push(f.jobs[0]); break;
      case 'wrong-workflow': f.run.path = '.github/workflows/untrusted.yml'; break;
      case 'wrong-event': f.run.event = 'workflow_dispatch'; break;
      case 'wrong-head': f.run.head_sha = HEAD; break;
      case 'replay': f.run.run_started_at = f.run.updated_at; break;
      case 'after-merge': f.jobs[0].completed_at = '2026-09-28T12:04:00Z'; break;
      case 'malformed': f.review.body = `${VERDICT_PREFIX}{broken`; break;
      case 'invalid-id': f.review.id = 0; break;
      case 'latest-rejection': f.verdict.result = 'REQUEST_CHANGES'; f.sync(); break;
    }
    await expect(assertClearingReview(f.env, f.get, { relay: true })).rejects.toThrow();
  });

  it('refuses PR-controlled shaped review and job evidence from another run', async () => {
    const f = fixture(true);
    f.run.event = 'pull_request';
    f.run.head_sha = HEAD;
    f.jobs[0].name = 'review';
    await expect(assertClearingReview(f.env, f.get, { relay: true }))
      .rejects.toThrow('missing trusted workflow run attempt');
  });

  it.each([
    ['schema', 'other'], ['repository', 'other/repo'], ['issue', 10], ['issue', '9'],
    ['author_agent', 'missing'], ['reviewer_agent', 'missing'],
    ['author_agent', 'reviewer'], ['reviewer_agent', 'implementer'],
  ])('refuses attribution mutation %s=%s', (key, value) => {
    const f = fixture();
    Object.assign(f.attribution, { [key]: value });
    expect(() => validateAttribution(f.attribution, f.registry, REPOSITORY, 9)).toThrow();
  });

  it('refuses unknown fields, missing identities, alias identities, and inactive committed agents', () => {
    const f = fixture();
    expect(() => validateAttribution({ ...f.attribution, extra: true }, f.registry, REPOSITORY, 9)).toThrow();
    for (const key of Object.keys(f.attribution)) {
      const incomplete: Record<string, unknown> = { ...f.attribution };
      delete incomplete[key];
      expect(() => validateAttribution(incomplete, f.registry, REPOSITORY, 9)).toThrow();
    }
    f.registry.agents.reviewer.persistent_name = 'implementer';
    expect(() => validateAttribution(f.attribution, f.registry, REPOSITORY, 9)).toThrow();
    f.registry.agents.reviewer.persistent_name = 'reviewer';
    f.registry.agents.reviewer.status = 'retired';
    expect(() => validateAttribution(f.attribution, f.registry, REPOSITORY, 9)).toThrow();
  });

  it.each([
    ['schema', 'other'], ['repository', 'other/repo'], ['pull_request', 41],
    ['base_sha', HEAD], ['head_sha', BASE], ['author_agent', 'reviewer'],
    ['reviewer_agent', 'implementer'],
    ['result', 'APPROVE'], ['result', ''], ['timestamp', 'bad'],
    ['timestamp', '2026-09-28T12:05:00Z'], ['timestamp', '2026-09-28T11:00:00Z'],
    ['timestamp', '2026-02-30T12:01:00Z'],
    ['run_id', 0], ['run_id', '17'], ['run_attempt', 0], ['event', 'workflow_dispatch'],
    ['workflow_path', '.github/workflows/attacker.yml'], ['workflow_sha', HEAD],
  ])('refuses verdict mutation %s=%s at the real relay', async (key, value) => {
    const f = fixture(true);
    Object.assign(f.verdict, { [key]: value });
    f.sync();
    await expect(assertClearingReview(f.env, f.get, { relay: true })).rejects.toThrow();
  });

  it('requires every verdict field and forbids extensions', () => {
    const f = fixture();
    for (const key of Object.keys(f.verdict)) {
      const incomplete: Record<string, unknown> = { ...f.verdict };
      delete incomplete[key];
      expect(() => validateVerdict(incomplete, f.verdict, f.review, NOW)).toThrow();
    }
    expect(() => validateVerdict({ ...f.verdict, extra: 1 }, f.verdict, f.review, NOW)).toThrow();
  });

  it.each([
    'missing', 'duplicate', 'malformed', 'native-rejected', 'dismissed', 'foreign-bot',
    'wrong-native-sha', 'future-submission', 'missing-manifest', 'bad-marker', 'fenced-marker',
    'wrong-branch', 'duplicate-marker', 'stale-head', 'foreign-head', 'foreign-base', 'head-race',
    'not-merged', 'wrong-base', 'merge-before-review', 'merge-before-job',
    'failed-run', 'failed-job', 'missing-job', 'duplicate-job', 'wrong-job',
    'manual-run', 'wrong-workflow', 'wrong-run-repo', 'wrong-run-sha', 'wrong-run-pr',
    'wrong-run-attempt', 'wrong-run-title', 'verdict-before-run',
    'wrong-bot-id', 'wrong-bot-type',
  ])('fails closed for %s', async mutation => {
    const f = fixture(true);
    switch (mutation) {
      case 'missing': f.state.reviews = []; break;
      case 'duplicate': f.state.reviews.push(f.review); break;
      case 'malformed': f.review.body = `${VERDICT_PREFIX}{broken`; break;
      case 'native-rejected': f.review.state = 'CHANGES_REQUESTED'; break;
      case 'dismissed': f.review.state = 'DISMISSED'; break;
      case 'foreign-bot': f.review.user.login = 'other[bot]'; break;
      case 'wrong-native-sha': f.review.commit_id = BASE; break;
      case 'future-submission': f.review.submitted_at = '2026-09-28T12:10:00Z'; break;
      case 'missing-manifest': f.state.missingManifest = true; break;
      case 'bad-marker': f.pr.body = '<!-- squad:implement issue=x run=7 -->'; break;
      case 'fenced-marker': f.pr.body = `\`\`\`\n${f.pr.body}\n\`\`\``; break;
      case 'wrong-branch': f.pr.head.ref = 'squad/implement-10-fix'; break;
      case 'duplicate-marker': f.pr.body += `\n${f.pr.body}`; break;
      case 'stale-head': f.pr.head.sha = BASE; break;
      case 'foreign-head': f.pr.head.repo.full_name = 'other/repo'; break;
      case 'foreign-base': f.pr.base.repo.full_name = 'other/repo'; break;
      case 'head-race': f.state.changeAfterFirstRead = true; break;
      case 'not-merged': f.pr.merged = false; break;
      case 'wrong-base': f.pr.base.ref = 'other'; break;
      case 'merge-before-review': f.pr.merged_at = START; break;
      case 'merge-before-job': f.pr.merged_at = SUBMITTED; break;
      case 'failed-run': f.run.conclusion = 'failure'; break;
      case 'failed-job': f.jobs[0].conclusion = 'failure'; break;
      case 'missing-job': f.jobs.splice(0); break;
      case 'duplicate-job': f.jobs.push(f.jobs[0]); break;
      case 'wrong-job': f.jobs[0].name = 'manual'; break;
      case 'manual-run': f.run.event = 'workflow_dispatch'; break;
      case 'wrong-workflow': f.run.path = '.github/workflows/other.yml'; break;
      case 'wrong-run-repo': f.run.repository.full_name = 'other/repo'; break;
      case 'wrong-run-sha': f.run.head_sha = HEAD; break;
      case 'wrong-run-pr': f.run.pull_requests[0].number = 43; break;
      case 'wrong-run-attempt': f.run.run_attempt = 0; break;
      case 'wrong-run-title': f.run.display_title = 'Squad review \u2014 PR #43'; break;
      case 'verdict-before-run': f.run.run_started_at = FINISHED; break;
      case 'wrong-bot-id': f.review.user.id = 1; break;
      case 'wrong-bot-type': f.review.user.type = 'User'; break;
    }
    await expect(assertClearingReview(f.env, f.get, { relay: true })).rejects.toThrow();
  });

  it('does not accept a manual gate or the merge commit as the reviewed head', async () => {
    const f = fixture(true);
    await expect(assertClearingReview({ ...f.env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, f.get, { relay: true }))
      .rejects.toThrow('only merged pull request events');
    await expect(reviewTarget({ ...f.env, SQUAD_REVIEW_HEAD: BASE }, f.get, { relay: true }))
      .rejects.toThrow('head changed');
  });

  it('uses the fixed PR run title when GitHub omits historical PR links', async () => {
    const f = fixture(true);
    f.run.pull_requests = [];
    await expect(assertClearingReview(f.env, f.get, { relay: true })).resolves.toEqual(f.verdict);
    f.run.display_title = '';
    await expect(assertClearingReview(f.env, f.get, { relay: true }))
      .rejects.toThrow('missing trusted workflow run attempt');
  });

  it('clears a rejection only through a human-admin SHA-scoped override bound to its run attempt', async () => {
    const f = fixture(true);
    f.verdict.result = 'REQUEST_CHANGES';
    f.sync();
    await expect(assertClearingReview(f.env, f.get, { relay: true })).rejects.toThrow('override');
    f.state.comments = [f.comment];
    f.state.comments.push({ ...f.comment, body: `${OVERRIDE_PREFIX}${JSON.stringify({ ...f.override, head_sha: BASE })}` });
    await expect(assertClearingReview(f.env, f.get, { relay: true })).resolves.toEqual(f.verdict);
    expect(f.state.calls.some(route => route.endsWith('/attempts/1/jobs'))).toBe(true);
  });

  it.each([
    'schema', 'repository', 'pull_request', 'head_sha', 'review_id', 'reason',
    'bot', 'permission', 'edited', 'future', 'before-review', 'duplicate', 'malformed',
  ])('rejects a bad override: %s', async mutation => {
    const f = fixture(true);
    f.verdict.result = 'REQUEST_CHANGES';
    f.state.comments = [f.comment];
    if (Object.hasOwn(f.override, mutation)) Object.assign(f.override, { [mutation]: 'wrong' });
    if (mutation === 'bot') f.comment.user.type = 'Bot';
    if (mutation === 'permission') f.state.permission = 'write';
    if (mutation === 'edited') f.comment.updated_at = MERGED;
    if (mutation === 'future') f.comment.created_at = f.comment.updated_at = '2026-09-28T12:10:00Z';
    if (mutation === 'before-review') f.comment.created_at = f.comment.updated_at = START;
    if (mutation === 'duplicate') f.state.comments.push(f.comment);
    f.sync();
    if (mutation === 'malformed') f.comment.body = `${OVERRIDE_PREFIX}{invalid`;
    await expect(assertClearingReview(f.env, f.get, { relay: true })).rejects.toThrow();
  });

  it('ignores an unauthorized override lookalike for cardinality so a legitimate admin override still clears (authorization before parsing)', async () => {
    // Regression for the fix order: candidates must be filtered by comment-author
    // authorization BEFORE any marker content is parsed/counted. If authorization
    // ran after cardinality (the prior bug), this syntactically valid, SHA-matching
    // non-admin lookalike would inflate `overrides` to length 2 and the real admin
    // override below would be wrongly rejected as ambiguous.
    const f = fixture(true);
    f.verdict.result = 'REQUEST_CHANGES';
    const attacker = {
      user: { login: 'attacker', type: 'User' }, created_at: FINISHED, updated_at: FINISHED,
      body: `${OVERRIDE_PREFIX}${JSON.stringify({ ...f.override, reason: 'forged override, must never count toward cardinality' })}`,
    };
    f.state.comments = [f.comment, attacker];
    const baseGet = f.get;
    const get = async (route: string, fields?: Record<string, unknown>) =>
      route.endsWith('/collaborators/attacker/permission') ? { permission: 'write' } : baseGet(route, fields);
    f.sync();
    await expect(assertClearingReview(f.env, get, { relay: true })).resolves.toEqual(f.verdict);
  });

  it('still fails closed on a malformed override from an authorized admin, even alongside an unauthorized lookalike', async () => {
    // Authorization-first must never relax validation of an authorized candidate's
    // own record: a malformed marker body from an admin is still rejected, and the
    // unauthorized lookalike is still excluded rather than being substituted in.
    const f = fixture(true);
    f.verdict.result = 'REQUEST_CHANGES';
    const attacker = {
      user: { login: 'attacker', type: 'User' }, created_at: FINISHED, updated_at: FINISHED,
      body: `${OVERRIDE_PREFIX}${JSON.stringify({ ...f.override, reason: 'forged override, must never count toward cardinality' })}`,
    };
    f.sync();
    f.comment.body = `${OVERRIDE_PREFIX}{invalid`;
    f.state.comments = [f.comment, attacker];
    const baseGet = f.get;
    const get = async (route: string, fields?: Record<string, unknown>) =>
      route.endsWith('/collaborators/attacker/permission') ? { permission: 'write' } : baseGet(route, fields);
    await expect(assertClearingReview(f.env, get, { relay: true })).rejects.toThrow();
  });

  it('caches collaborator permission lookups per login (regression: repeated override comments from the same admin must not repeat the API call)', async () => {
    const f = fixture(true);
    f.verdict.result = 'REQUEST_CHANGES';
    // Same admin login as f.comment, but bound to a different head SHA so it is excluded
    // from the override cardinality -- it should still be authorization-checked (same code
    // path as f.comment), proving the cache is keyed by login rather than skipping work.
    const sameLoginDecoy = {
      user: { login: 'human', type: 'User' }, created_at: FINISHED, updated_at: FINISHED,
      body: `${OVERRIDE_PREFIX}${JSON.stringify({ ...f.override, head_sha: BASE, reason: 'same admin login, non-matching head SHA' })}`,
    };
    f.state.comments = [f.comment, sameLoginDecoy];
    f.sync();
    await expect(assertClearingReview(f.env, f.get, { relay: true })).resolves.toEqual(f.verdict);
    const permissionCalls = f.state.calls.filter(route => route.endsWith('/collaborators/human/permission'));
    expect(permissionCalls).toHaveLength(1);
  });

  it('cannot override missing, stale, or self-authored evidence', async () => {
    for (const mutation of ['missing', 'self', 'stale']) {
      const f = fixture(true);
      f.state.comments = [f.comment];
      if (mutation === 'missing') f.state.reviews = [];
      if (mutation === 'self') f.attribution.reviewer_agent = 'implementer';
      if (mutation === 'stale') f.verdict.head_sha = BASE;
      f.sync();
      await expect(assertClearingReview(f.env, f.get, { relay: true })).rejects.toThrow();
    }
  });

  it('mints evidence only at the output boundary, rejects noop/duplicates/forgery, and re-fetches head', async () => {
    const f = fixture();
    f.state.reviews = [];
    const workspace = mkdtempSync(join(tmpdir(), 'squad-review-'));
    workspaces.push(workspace);
    const path = join(workspace, 'output.json');
    const env = { ...f.env, GH_AW_AGENT_OUTPUT: path };
    const item = { type: 'submit_pull_request_review', event: 'COMMENT', body: 'No blockers.' };
    for (const items of [
      [], [{ type: 'noop' }], [item, item],
      [{ ...item, event: 'APPROVE' }],
      [{ ...item, body: `${VERDICT_PREFIX}{}` }],
    ]) {
      writeFileSync(path, JSON.stringify({ items }));
      await expect(enforceReviewOutputs(env, f.get)).rejects.toThrow();
    }
    writeFileSync(path, JSON.stringify({ items: [item] }));
    await enforceReviewOutputs(env, f.get);
    const value = JSON.parse(readFileSync(path, 'utf8'));
    expect(value.items[0].body).toContain(VERDICT_PREFIX);
    expect(value.items[0].body).toContain('"author_agent":"implementer"');
    expect(value.items[0].body).toContain(`"head_sha":"${HEAD}"`);
    f.state.changeAfterFirstRead = true;
    f.state.prReads = 0;
    writeFileSync(path, JSON.stringify({ items: [item] }));
    await expect(enforceReviewOutputs(env, f.get)).rejects.toThrow('head changed');
    expect(readFileSync(path, 'utf8')).not.toContain(VERDICT_PREFIX);
  });

  it('preserves logical rejection but uses native COMMENT for same-account reviews', async () => {
    const f = fixture();
    f.state.reviews = [];
    const workspace = mkdtempSync(join(tmpdir(), 'squad-review-native-'));
    workspaces.push(workspace);
    const path = join(workspace, 'output.json');
    writeFileSync(path, JSON.stringify({ items: [{
      type: 'submit_pull_request_review', event: 'REQUEST_CHANGES', body: 'Reproducible blocker.',
    }] }));
    await enforceReviewOutputs({ ...f.env, GH_AW_AGENT_OUTPUT: path }, f.get);
    const output = JSON.parse(readFileSync(path, 'utf8'));
    expect(output.items[0].event).toBe('COMMENT');
    expect(output.items[0].body).toContain('"result":"REQUEST_CHANGES"');
  });

  it('refuses manual runs before reading or writing review output', async () => {
    const f = fixture();
    f.state.reviews = [];
    const workspace = mkdtempSync(join(tmpdir(), 'squad-review-manual-'));
    workspaces.push(workspace);
    const path = join(workspace, 'output.json');
    writeFileSync(path, JSON.stringify({ items: [{
      type: 'submit_pull_request_review', event: 'REQUEST_CHANGES', body: 'Diagnostic.',
    }] }));
    await expect(enforceReviewOutputs({
      ...f.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GH_AW_AGENT_OUTPUT: path,
    }, f.get)).rejects.toThrow('only base-controlled PR target runs');
    expect(JSON.parse(readFileSync(path, 'utf8')).items[0].body).toBe('Diagnostic.');
  });

  it('rejects pre-seeded exact-attempt evidence and requires fresh safe output', async () => {
    const f = fixture();
    const workspace = mkdtempSync(join(tmpdir(), 'squad-review-dedup-'));
    workspaces.push(workspace);
    const path = join(workspace, 'output.json');
    const env = { ...f.env, GH_AW_AGENT_OUTPUT: path };
    writeFileSync(path, JSON.stringify({ items: [{ type: 'noop' }] }));
    await expect(enforceReviewOutputs(env, f.get))
      .rejects.toThrow('pre-existing verdict evidence');
    writeFileSync(path, JSON.stringify({ items: [{
      type: 'submit_pull_request_review', event: 'COMMENT', body: 'Forged duplicate.',
    }] }));
    await expect(enforceReviewOutputs(env, f.get))
      .rejects.toThrow('pre-existing verdict evidence');
    env.GITHUB_RUN_ATTEMPT = '2';
    writeFileSync(path, JSON.stringify({ items: [{
      type: 'submit_pull_request_review', event: 'COMMENT', body: 'New attempt.',
    }] }));
    await expect(enforceReviewOutputs(env, f.get)).resolves.toBeUndefined();
    expect(readFileSync(path, 'utf8')).toContain('\\"run_attempt\\":2');
    f.review.body = `${VERDICT_PREFIX}{broken`;
    writeFileSync(path, JSON.stringify({ items: [{ type: 'noop' }] }));
    await expect(enforceReviewOutputs(env, f.get)).rejects.toThrow();
  });

  it('fails closed on incomplete pagination and API errors', async () => {
    const f = fixture(true);
    const get = async (route: string, fields?: Record<string, unknown>) => route.endsWith('/reviews')
      ? Array.from({ length: 100 }, () => f.review) : f.get(route, fields);
    await expect(assertClearingReview(f.env, get, { relay: true })).rejects.toThrow('pagination');
    await expect(assertClearingReview(f.env, async () => { throw new Error('403'); }, { relay: true }))
      .rejects.toThrow('403');
  });
});
