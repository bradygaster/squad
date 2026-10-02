import { readFileSync, writeFileSync } from 'node:fs';
import { evaluateImplementDispatchInputs } from './squad-retro-provenance.mjs';
import {
  BOOTSTRAP_PR_FALLBACK_ISSUE_TITLE,
  bootstrapPrFallbackIssueMarker,
  buildBootstrapPrFallbackCompareUrl,
  findExistingBootstrapPrFallbackIssue,
  parseBootstrapPrFallbackProvenance,
} from './squad-bootstrap-validator.mjs';

export const VERDICT_PREFIX = 'Squad-Review-Verdict: ';
export const OVERRIDE_PREFIX = 'Squad-Review-Override: ';
const WORKFLOW = '.github/workflows/squad-review.lock.yml';
const WORKFLOW_RUNS = 'actions/workflows/squad-review.lock.yml/runs';
const AUTHORITY_JOB = 'review';
const BOOTSTRAP_WORKFLOW = '.github/workflows/squad-bootstrap.lock.yml';
const SHA = /^[0-9a-f]{40}$/;
const ID = /^[a-z][a-z0-9-]*$/;
const BOT = 'github-actions[bot]';
const BOT_ID = 41898282;
const BOOTSTRAP_BRANCH = 'squad/bootstrap-cast';
const BOOTSTRAP_TITLE = '[squad] Cast your Squad';
const BOOTSTRAP_AUTHOR = '@squad/base-controlled-bootstrap';
const BOOTSTRAP_REVIEWER = '@squad/base-controlled-review';
const BOOTSTRAP_PREFIX = '<' + '!-- squad:bootstrap-provenance ';

function requireThat(condition, message) {
  if (!condition) throw new Error(`Squad review refused: ${message}`);
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function timestamp(value) {
  requireThat(typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)), 'missing or malformed timestamp');
  requireThat(new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'),
    'invalid calendar timestamp');
  return Date.parse(value);
}

function record(body, prefix) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const candidates = text.split('\n').filter(line => line.startsWith(prefix));
  requireThat(text.split(prefix.trim()).length === 2 && candidates.length === 1,
    `missing or duplicate ${prefix.trim()}`);
  const value = JSON.parse(candidates[0].slice(prefix.length));
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'invalid record');
  return value;
}

export function validateAttribution(value, registry, repository, issue) {
  requireThat(exactKeys(value, ['schema', 'repository', 'issue', 'author_agent', 'reviewer_agent']) &&
    value.schema === 'squad-review-author/v1' && value.repository === repository &&
    Number.isSafeInteger(value.issue) && value.issue > 0 && value.issue === issue,
  'missing or malformed committed .squad-review.json');
  requireThat(registry?.schema === 'squad-agent-provenance/v1' && registry.schema_version === 1 &&
    registry.agents && typeof registry.agents === 'object', 'invalid committed agent registry');
  for (const id of [value.author_agent, value.reviewer_agent]) {
    requireThat(typeof id === 'string' && ID.test(id) &&
      Object.hasOwn(registry.agents, id) && registry.agents[id].status === 'active' &&
      registry.agents[id].persistent_name === id, 'unknown, inactive, or aliased stable agent ID');
  }
  requireThat(value.author_agent !== value.reviewer_agent, 'author and reviewer must be distinct');
  return value;
}

export function validateVerdict(value, expected, review, now = Date.now()) {
  requireThat(exactKeys(value, [
    'schema', 'repository', 'pull_request', 'base_sha', 'head_sha', 'author_agent',
    'reviewer_agent', 'result', 'timestamp', 'run_id', 'run_attempt', 'event',
    'workflow_path', 'workflow_sha',
  ]) && value.schema === 'squad-review-verdict/v1', 'invalid verdict shape');
  for (const key of [
    'repository', 'pull_request', 'base_sha', 'head_sha', 'author_agent', 'reviewer_agent',
  ]) {
    requireThat(value[key] === expected[key], `verdict ${key} mismatch`);
  }
  requireThat(SHA.test(value.base_sha) && SHA.test(value.head_sha) &&
    value.author_agent !== value.reviewer_agent,
    'invalid SHA or self review');
  requireThat(['COMMENT', 'REQUEST_CHANGES'].includes(value.result) &&
    value.event === 'pull_request_target' &&
    Number.isSafeInteger(value.run_id) && value.run_id > 0 &&
    Number.isSafeInteger(value.run_attempt) && value.run_attempt > 0 &&
    value.workflow_path === WORKFLOW && value.workflow_sha === expected.workflow_sha,
  'invalid verdict result or run');
  requireThat(Number.isSafeInteger(review.id) && review.id > 0 &&
    review.user?.login === BOT && review.user?.id === BOT_ID &&
    review.user?.type === 'Bot' && review.commit_id === value.head_sha &&
    review.state === 'COMMENTED',
  'review author, commit, or native result mismatch');
  const issued = timestamp(value.timestamp);
  const submitted = timestamp(review.submitted_at);
  requireThat(issued <= submitted && submitted <= now && submitted - issued <= 300_000,
    'stale or future verdict timestamp');
  return value;
}

async function list(get, route, field) {
  const all = [];
  for (let page = 1; page <= 50; page++) {
    const response = await get(route, { per_page: 100, page });
    const items = field ? response[field] : response;
    requireThat(Array.isArray(items), 'unreadable paginated evidence');
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw new Error('Squad review refused: evidence pagination exceeded bound');
}

async function committedFileEvidence(
  get,
  repository,
  path,
  ref,
  { allowMissing = false, maximumSize = 2_000_000 } = {},
) {
  requireThat(SHA.test(ref), 'invalid committed evidence ref');
  let file;
  try {
    file = await get(`repos/${repository}/contents/${path}`, { ref });
  } catch (error) {
    if (allowMissing && error?.status === 404) return undefined;
    throw error;
  }
  requireThat(file?.type === 'file' && file.encoding === 'base64' &&
    typeof file.content === 'string' && Number.isSafeInteger(file.size) &&
    file.size >= 0 && file.size <= maximumSize, `unreadable committed ${path}`);
  const content = Buffer.from(file.content, 'base64');
  requireThat(content.length === file.size, `truncated committed ${path}`);
  return {
    content,
  };
}

async function committedJsonEvidence(get, repository, path, ref, options) {
  const evidence = await committedFileEvidence(get, repository, path, ref, options);
  if (evidence === undefined) return undefined;
  return {
    ...evidence,
    value: JSON.parse(evidence.content.toString('utf8')),
  };
}

async function committedJson(get, repository, path, ref, options) {
  return (await committedJsonEvidence(get, repository, path, ref, options))?.value;
}

function bootstrapRecord(body, label = 'bootstrap provenance') {
  const lines = String(body ?? '').replace(/\r\n/g, '\n')
    .split('\n').filter(line => line.startsWith(BOOTSTRAP_PREFIX));
  requireThat(lines.length === 1 && lines[0].endsWith(' -->'),
    `missing or duplicate base-controlled ${label}`);
  const value = JSON.parse(lines[0].slice(BOOTSTRAP_PREFIX.length, -4));
  requireThat(exactKeys(
    value,
    ['schema', 'repository', 'run_id', 'install_sha', 'cast_sha'],
  ) && value.schema === 1, `malformed base-controlled ${label}`);
  return value;
}

async function requireRecordedBaseAncestor(get, repository, recordedSha, liveSha, message) {
  requireThat(SHA.test(recordedSha) && SHA.test(liveSha), message);
  const comparison = await get(`repos/${repository}/compare/${recordedSha}...${liveSha}`);
  requireThat(
    (comparison?.status === 'identical' || comparison?.status === 'ahead') &&
    comparison?.base_commit?.sha === recordedSha &&
    comparison?.merge_base_commit?.sha === recordedSha,
    message,
  );
}

// The post-install bootstrap PR fallback (documented alongside `can_approve_pull_request_reviews: false`
// in docs/src/content/docs/guide/gh-aw.md) asks a human to open the Cast PR manually from a compare-URL
// link after `pulls.create` is permission-denied. That PR is human-authored, so it cannot satisfy the
// bot-authorship predicate `validateBootstrapAttribution` relies on below, and bootstrap's own agent
// registry does not exist yet to supply a committed `.squad-review.json` either. Rather than permanently
// failing this required check (which would make the documented Quick start/E2E path structurally
// impossible to merge), this function replaces only the PR-author bot-attribution predicate with a
// narrowly-scoped trusted path: the human PR is eligible for review only when live GitHub data exactly
// matches a bot-authored, unedited, open bootstrap-PR-fallback issue carrying a signed provenance record
// binding this exact repository, base branch, its exact base commit SHA, pushed Cast branch, its exact
// head SHA, the base-controlled bootstrap run that produced it, and the manual compare URL. Every other
// review/provenance/content/head
// check (SHA pinning, default-branch targeting, workflow-source binding, etc.) is enforced unchanged by
// the surrounding `reviewTarget`. This never relies on `pulls.create`/review-approval permissions.
async function validateBootstrapPrFallbackAttribution(env, get, repository, pr, requireRunSuccess) {
  requireThat(pr.head.ref === BOOTSTRAP_BRANCH && pr.user?.type === 'User',
    'pull request does not match the documented manual Cast fallback shape');
  // Mirrors validateBootstrapAttribution's own `pr.title === BOOTSTRAP_TITLE` requirement below:
  // without it, a manually opened PR with an arbitrary title passes this review path (the compare
  // URL a human is asked to open already pre-fills this exact title via its `title` query param),
  // but classifyBootstrapState() rejects any PR on this branch with another title, so a manual
  // bootstrap rerun — or the post-merge bootstrap run itself — would then fail before ever creating
  // the linked research-proposals issue.
  requireThat(pr.title === BOOTSTRAP_TITLE,
    'pull request does not match the documented manual Cast fallback shape');
  // Deliberately omits `baseSha` here (unlike squad-bootstrap.md's own push-triggered dedupe
  // call): a human may open this Cast PR well after the default branch has legitimately
  // advanced, and once the PR exists `classifyBootstrapState` never files a replacement
  // fallback issue bound to a fresher base commit. Requiring a live `baseSha` match would make
  // the human fallback path permanently unrecoverable the moment any further commit lands on
  // the default branch. The recorded (immutable) `base_sha` is instead validated for live
  // ancestry below, and the base-controlled run binding is pinned to that same immutable value.
  const issues = await list(get, `repos/${repository}/issues`);
  const fallbackIssue = findExistingBootstrapPrFallbackIssue(issues, BOOTSTRAP_BRANCH, {
    repository,
    baseBranch: pr.base.ref,
    headSha: pr.head.sha,
  });
  requireThat(fallbackIssue, 'missing base-controlled bootstrap PR fallback issue');
  requireThat(fallbackIssue.user?.login === BOT && fallbackIssue.user?.type === 'Bot',
    'bootstrap PR fallback issue is not bot-authored');
  requireThat(fallbackIssue.title === BOOTSTRAP_PR_FALLBACK_ISSUE_TITLE,
    'bootstrap PR fallback issue has an unexpected title');
  requireThat(fallbackIssue.state === 'open', 'bootstrap PR fallback issue is closed');
  requireThat(timestamp(fallbackIssue.updated_at) === timestamp(fallbackIssue.created_at),
    'bootstrap PR fallback issue was edited after creation');
  const body = String(fallbackIssue.body ?? '');
  requireThat(body.includes(bootstrapPrFallbackIssueMarker(BOOTSTRAP_BRANCH)),
    'bootstrap PR fallback issue is missing its branch marker');
  const provenance = parseBootstrapPrFallbackProvenance(body);
  requireThat(provenance, 'missing or malformed bootstrap PR fallback provenance record');
  requireThat(
    provenance.repository === repository &&
    provenance.base_branch === pr.base.ref &&
    provenance.head_branch === pr.head.ref &&
    provenance.head_sha === pr.head.sha,
    'bootstrap PR fallback provenance does not match this pull request',
  );
  // `provenance.base_sha` pins the exact base commit the base-controlled bootstrap run that
  // filed this fallback issue actually observed. It deliberately is NOT required to equal the
  // live `pr.base.sha`: GitHub reports a PR's `base.sha` as the base ref's *current* tip, which
  // advances with every ordinary commit landing on the default branch -- and a human may not open
  // this Cast PR until well after that has happened. Once the PR exists, `classifyBootstrapState`
  // never files a replacement fallback issue, so requiring live equality here would make the
  // fallback path permanently unrecoverable after the first subsequent push. Instead, only prove
  // `provenance.base_sha` is still a valid ancestor of (or identical to) the live base tip -- i.e.
  // the default branch has only fast-forwarded since, never been rewound or force-pushed to an
  // incompatible history.
  // github.rest.repos.compareCommitsWithBasehead throws on API error (404/403 rate-limit/etc.),
  // which propagates and fails this job closed -- there is no local/offline fallback. Beyond the
  // status check, also bind the compare response's own resolved `base_commit`/`merge_base_commit`
  // SHAs back to `provenance.base_sha`: a `status` of 'identical'/'ahead' alone does not guarantee
  // the API resolved *this* base against *this* provenance commit (e.g. a short-SHA or mistyped
  // route could silently compare against the wrong ref while still reporting a plausible status).
  await requireRecordedBaseAncestor(
    get,
    repository,
    provenance.base_sha,
    pr.base.sha,
    'bootstrap PR fallback provenance base commit is not an ancestor of the pull request base',
  );
  const expectedCompareUrl = buildBootstrapPrFallbackCompareUrl({
    repository,
    baseBranch: provenance.base_branch,
    headBranch: provenance.head_branch,
    title: BOOTSTRAP_TITLE,
    server: env.GITHUB_SERVER_URL,
  });
  requireThat(provenance.compare_url === expectedCompareUrl,
    'bootstrap PR fallback provenance compare URL does not match the expected manual link');
  requireThat(timestamp(fallbackIssue.created_at) <= timestamp(pr.created_at),
    'bootstrap PR fallback issue was created after this pull request');
  // Both bootstrap attribution paths bind the trusted run to the immutable SHA recorded in their
  // provenance rather than the live, drifting `pr.base.sha` (see the ancestry check above for why).
  // Without this, a fallback issue's provenance.run_id only has to name *some* historical
  // successful bootstrap run on the same base branch, not the run that actually produced the
  // exact base commit recorded in this provenance.
  const run = await get(`repos/${repository}/actions/runs/${provenance.run_id}`);
  requireThat(
    run.event === 'push' &&
    run.path === BOOTSTRAP_WORKFLOW &&
    run.repository?.full_name === repository &&
    run.head_sha === provenance.base_sha &&
    run.head_branch === provenance.base_branch &&
    (!requireRunSuccess || (run.status === 'completed' && run.conclusion === 'success')),
    requireRunSuccess
      ? 'base-controlled bootstrap run did not complete successfully'
      : 'bootstrap PR fallback provenance is not bound to the base-controlled workflow run',
  );
  return {
    schema: 'squad-review-author/v1',
    repository,
    issue: pr.number,
    author_agent: BOOTSTRAP_AUTHOR,
    reviewer_agent: BOOTSTRAP_REVIEWER,
  };
}

async function validateBootstrapAttribution(get, repository, pr, requireRunSuccess) {
  const provenance = bootstrapRecord(pr.body, 'bootstrap PR provenance');
  const comments = await list(get, `repos/${repository}/issues/${pr.number}/comments`);
  const provenanceComments = comments.filter(comment =>
    comment.user?.login === BOT &&
    comment.user?.type === 'Bot' &&
    String(comment.body ?? '').startsWith(BOOTSTRAP_PREFIX));
  requireThat(provenanceComments.length === 1,
    'missing or duplicate bot-authenticated bootstrap provenance comment');
  const commentProvenance = bootstrapRecord(
    provenanceComments[0].body,
    'bootstrap comment provenance',
  );
  requireThat(JSON.stringify(commentProvenance) === JSON.stringify(provenance),
    'bootstrap PR and bot-authenticated comment provenance differ');
  requireThat(
    pr.title === BOOTSTRAP_TITLE &&
    pr.head.ref === BOOTSTRAP_BRANCH &&
    pr.user?.login === BOT &&
    pr.user?.type === 'Bot' &&
    provenance.repository === repository &&
    /^[1-9]\d*$/.test(provenance.run_id ?? '') &&
    SHA.test(provenance.install_sha ?? '') &&
    provenance.cast_sha === pr.head.sha,
    'invalid base-controlled bootstrap pull request',
  );
  await requireRecordedBaseAncestor(
    get,
    repository,
    provenance.install_sha,
    pr.base.sha,
    'bootstrap provenance install commit is not an ancestor of the pull request base',
  );
  const run = await get(`repos/${repository}/actions/runs/${provenance.run_id}`);
  requireThat(
    run.event === 'push' &&
    run.path === BOOTSTRAP_WORKFLOW &&
    run.repository?.full_name === repository &&
    run.head_sha === provenance.install_sha &&
    run.head_branch === pr.base.ref &&
    (!requireRunSuccess || (run.status === 'completed' && run.conclusion === 'success')),
    requireRunSuccess
      ? 'base-controlled bootstrap run did not complete successfully'
      : 'bootstrap provenance is not bound to the base-controlled workflow run',
  );
  return {
    schema: 'squad-review-author/v1',
    repository,
    issue: pr.number,
    author_agent: BOOTSTRAP_AUTHOR,
    reviewer_agent: BOOTSTRAP_REVIEWER,
  };
}

export async function reviewTarget(
  env,
  get,
  {
    relay = false,
    requireBootstrapRunSuccess = false,
  } = {},
) {
  const repository = env.GITHUB_REPOSITORY;
  const number = Number(env.SQUAD_REVIEW_PR);
  requireThat(typeof repository === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repository) &&
    /^[1-9]\d*$/.test(env.SQUAD_REVIEW_PR ?? '') && Number.isSafeInteger(number), 'invalid target');
  const pr = await get(`repos/${repository}/pulls/${number}`);
  const repo = await get(`repos/${repository}`);
  requireThat(pr.number === number && pr.head?.repo?.full_name === repository &&
    pr.base?.repo?.full_name === repository && SHA.test(pr.head.sha) && SHA.test(pr.base.sha),
  'foreign repository or invalid PR');
  requireThat(repo?.full_name === repository && typeof repo.default_branch === 'string' &&
    pr.base.ref === repo.default_branch, 'review target must use the repository default branch');
  requireThat(SHA.test(env.SQUAD_REVIEW_HEAD ?? '') && pr.head.sha === env.SQUAD_REVIEW_HEAD,
    'PR head changed or expected SHA missing');
  requireThat(SHA.test(env.SQUAD_REVIEW_WORKFLOW_SHA ?? '') &&
    env.SQUAD_REVIEW_WORKFLOW_SHA === pr.base.sha,
  'workflow source is not the exact PR base commit');
  requireThat(env.GITHUB_EVENT_NAME === (relay ? 'pull_request' : 'pull_request_target'),
    relay
      ? 'only merged pull request events can relay review evidence'
      : 'only base-controlled PR target runs can emit review output');
  requireThat(relay
    ? pr.merged === true && pr.state === 'closed' &&
      pr.base.ref === env.SQUAD_REVIEW_DEFAULT_BRANCH
    : pr.state === 'open' && pr.merged === false, 'invalid PR lifecycle');
  const body = String(pr.body ?? '').replace(/\r\n/g, '\n');
  let issue;
  if (body.includes('squad:implement')) {
    const provenance = evaluateImplementDispatchInputs({
      eventName: 'pull_request', pullRequestBody: body, pullRequestHeadRef: pr.head.ref,
    });
    requireThat(provenance.ok, 'malformed or duplicate implementation provenance');
    issue = provenance.issue_number;
  }
  const value = await committedJson(
    get,
    repository,
    '.squad-review.json',
    pr.head.sha,
    { allowMissing: true },
  );
  let attribution;
  if (value === undefined) {
    requireThat(relay === false && env.GITHUB_EVENT_NAME === 'pull_request_target',
      'missing committed attribution outside base-controlled bootstrap activation');
    attribution = pr.head.ref === BOOTSTRAP_BRANCH && pr.user?.type !== 'Bot'
      ? await validateBootstrapPrFallbackAttribution(env, get, repository, pr, requireBootstrapRunSuccess)
      : await validateBootstrapAttribution(get, repository, pr, requireBootstrapRunSuccess);
  } else {
    const registry = await committedJson(
      get,
      repository,
      '.squad/casting/registry.json',
      pr.base.sha,
    );
    attribution = validateAttribution(value, registry, repository, issue ?? value?.issue);
  }
  return {
    repository, pull_request: number, base_sha: pr.base.sha, head_sha: pr.head.sha,
    workflow_sha: env.SQUAD_REVIEW_WORKFLOW_SHA,
    author_agent: attribution.author_agent, reviewer_agent: attribution.reviewer_agent, pr,
  };
}

async function currentEvidence(target, get) {
  const reviews = await list(get, `repos/${target.repository}/pulls/${target.pull_request}/reviews`);
  // A forged/malformed current-head bot record is never rescued by a valid duplicate.
  return reviews.filter(review => review.user?.login === BOT &&
    (review.commit_id === target.head_sha ||
      String(review.body ?? '').includes(target.head_sha)) &&
    String(review.body ?? '').includes(VERDICT_PREFIX.trim()));
}

export async function enforceReviewOutputs(env, get, options = {}) {
  requireThat(env.GITHUB_EVENT_NAME === 'pull_request_target',
    'only base-controlled PR target runs can emit review output');
  const target = await reviewTarget(env, get, options);
  const output = JSON.parse(readFileSync(env.GH_AW_AGENT_OUTPUT, 'utf8'));
  requireThat(Array.isArray(output.items), 'missing safe-output items');
  const verdicts = output.items.filter(item => item.type === 'submit_pull_request_review');
  const existing = await currentEvidence(target, get);
  const currentRun = existing.filter(review => {
    const verdict = validateVerdict(record(review.body, VERDICT_PREFIX), target, review);
    return String(verdict.run_id) === env.GITHUB_RUN_ID &&
      String(verdict.run_attempt) === env.GITHUB_RUN_ATTEMPT;
  });
  requireThat(currentRun.length === 0,
    'pre-existing verdict evidence for this run attempt is forbidden');
  requireThat(verdicts.length === 1, 'exactly one review is required; noop cannot clear review');
  const item = verdicts[0];
  requireThat(['COMMENT', 'REQUEST_CHANGES'].includes(item.event) &&
    typeof item.body === 'string' && !item.body.includes('Squad-Review-Verdict') &&
    !item.body.includes('Squad-Review-Override'), 'invalid review output');
  const value = {
    schema: 'squad-review-verdict/v1',
    repository: target.repository,
    pull_request: target.pull_request,
    base_sha: target.base_sha,
    head_sha: target.head_sha,
    author_agent: target.author_agent,
    reviewer_agent: target.reviewer_agent,
    result: item.event,
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    run_id: Number(env.GITHUB_RUN_ID),
    run_attempt: Number(env.GITHUB_RUN_ATTEMPT),
    event: 'pull_request_target',
    workflow_path: WORKFLOW,
    workflow_sha: target.workflow_sha,
  };
  requireThat(Number.isSafeInteger(value.run_id) && value.run_id > 0 &&
    Number.isSafeInteger(value.run_attempt) && value.run_attempt > 0, 'invalid workflow identity');
  item.body += `\n\n${VERDICT_PREFIX}${JSON.stringify(value)}`;
  // GitHub forbids requesting changes on one's own PR. The logical verdict,
  // not a native bot approval/rejection, drives the independent status check.
  item.event = 'COMMENT';
  // Native review commit binding and a final live read prevent stale agent output passing.
  await reviewTarget(env, get, options);
  writeFileSync(env.GH_AW_AGENT_OUTPUT, JSON.stringify(output));
}

function runMatchesTarget(run, target, runId) {
  return run?.id === runId &&
    run.event === 'pull_request_target' && run.path === WORKFLOW &&
    run.repository?.full_name === target.repository && run.head_sha === target.base_sha &&
    run.display_title === `Squad review \u2014 PR #${target.pull_request}` &&
    Array.isArray(run.pull_requests) &&
    (run.pull_requests.length === 0 || run.pull_requests.some(pr =>
      pr.number === target.pull_request && pr.head?.sha === target.head_sha &&
      pr.base?.repo?.name === target.pr.base.repo.name));
}

async function latestRelayAttempt(target, get, cutoff) {
  const runs = await list(
    get,
    `repos/${target.repository}/${WORKFLOW_RUNS}`,
    'workflow_runs',
  );
  const attempts = [];
  for (const run of runs) {
    if (!Number.isSafeInteger(run?.id) || run.id < 1 ||
        !runMatchesTarget(run, target, run.id)) continue;
    requireThat(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0,
      'trusted workflow run has an invalid attempt count');
    for (let runAttempt = 1; runAttempt <= run.run_attempt; runAttempt++) {
      const attempt = await get(
        `repos/${target.repository}/actions/runs/${run.id}/attempts/${runAttempt}`,
      );
      requireThat(runMatchesTarget(attempt, target, run.id) &&
        attempt.run_attempt === runAttempt,
      'invalid trusted workflow run attempt');
      const startedAt = timestamp(attempt.run_started_at);
      if (startedAt <= cutoff) attempts.push({ run, attempt, startedAt });
    }
  }
  requireThat(attempts.length > 0, 'missing trusted workflow run attempt before merge');
  attempts.sort((left, right) =>
    left.startedAt - right.startedAt ||
    left.run.id - right.run.id ||
    left.attempt.run_attempt - right.attempt.run_attempt);
  return attempts.at(-1);
}

async function assertAuthorityJob(target, get, selected, cutoff) {
  const jobs = await list(get,
    `repos/${target.repository}/actions/runs/${selected.run.id}/attempts/${selected.attempt.run_attempt}/jobs`,
    'jobs');
  const authorityJobs = jobs.filter(job => job.name === AUTHORITY_JOB);
  requireThat(authorityJobs.length === 1 &&
    authorityJobs[0].status === 'completed' &&
    authorityJobs[0].conclusion === 'success' &&
    timestamp(authorityJobs[0].started_at) >= timestamp(selected.attempt.run_started_at) &&
    timestamp(authorityJobs[0].completed_at) <= timestamp(selected.attempt.updated_at) &&
    timestamp(authorityJobs[0].completed_at) <= cutoff,
  'base-controlled review authority job did not pass before merge');
}

export async function assertClearingReview(env, get, options = {}) {
  const { relay = false } = options;
  const target = await reviewTarget(env, get, {
    ...options,
    requireBootstrapRunSuccess: true,
  });
  const cutoff = relay ? timestamp(target.pr.merged_at) : Date.now();
  const candidates = (await currentEvidence(target, get)).map(review => ({
    review,
    verdict: validateVerdict(
      record(review.body, VERDICT_PREFIX),
      target,
      review,
      cutoff,
    ),
  }));
  const selected = relay ? await latestRelayAttempt(target, get, cutoff) : undefined;
  const runId = relay ? String(selected.run.id) : env.GITHUB_RUN_ID;
  const runAttempt = relay ? String(selected.attempt.run_attempt) : env.GITHUB_RUN_ATTEMPT;
  const bound = candidates.filter(({ verdict }) =>
    String(verdict.run_id) === runId && String(verdict.run_attempt) === runAttempt);
  requireThat(bound.length === 1, 'missing or duplicate verdict evidence for this run');
  const { review, verdict } = bound[0];
  if (relay) {
    requireThat(selected.attempt.status === 'completed' &&
      timestamp(selected.attempt.updated_at) <= cutoff &&
      selected.attempt.conclusion === 'success',
      'review run attempt did not succeed');
    requireThat(timestamp(selected.attempt.run_started_at) <= timestamp(verdict.timestamp) &&
      timestamp(review.submitted_at) <= timestamp(selected.attempt.updated_at),
    'verdict outside workflow run');
    await assertAuthorityJob(target, get, selected, cutoff);
  } else {
    const run = await get(`repos/${target.repository}/actions/runs/${verdict.run_id}`);
    requireThat(runMatchesTarget(run, target, verdict.run_id) &&
      run.run_attempt >= verdict.run_attempt,
    'verdict is not bound to this PR workflow run');
    const attempt = run.run_attempt === verdict.run_attempt ? run :
      await get(`repos/${target.repository}/actions/runs/${verdict.run_id}/attempts/${verdict.run_attempt}`);
    requireThat(runMatchesTarget(attempt, target, verdict.run_id) &&
      attempt.run_attempt === verdict.run_attempt &&
      timestamp(attempt.run_started_at) <= timestamp(verdict.timestamp) &&
      (attempt.status !== 'completed' ||
        timestamp(review.submitted_at) <= timestamp(attempt.updated_at)), 'verdict outside workflow run');
  }
  if (verdict.result === 'REQUEST_CHANGES') {
    const comments = await list(get, `repos/${target.repository}/issues/${target.pull_request}/comments`);
    const tagged = comments.filter(comment => String(comment.body ?? '').includes(OVERRIDE_PREFIX.trim()));
    // Authorize the comment's AUTHOR -- human, admin permission -- before any
    // marker content is parsed or counted. Checking identity first never
    // requires touching the body, so an unauthorized actor (any non-admin
    // collaborator, or a bot) cannot get their comment parsed at all, and
    // cannot post a syntactically valid, SHA-matching lookalike purely to
    // inflate the candidate count and veto a legitimate admin's override (the
    // `overrides.length === 1` cardinality check below would otherwise refuse
    // a real, authorized override whenever an unauthorized lookalike is also
    // present). A malformed marker from an authorized admin still fails
    // closed below -- it is never silently skipped.
    const authorized = [];
    const permissionCache = new Map();
    for (const comment of tagged) {
      if (comment.user?.type !== 'User' || !/^[\w-]+$/.test(comment.user?.login ?? '')) continue;
      const login = comment.user.login;
      if (!permissionCache.has(login)) {
        permissionCache.set(login, await get(`repos/${target.repository}/collaborators/${login}/permission`));
      }
      const permission = permissionCache.get(login);
      if (permission.permission !== 'admin') continue;
      authorized.push(comment);
    }
    const overrides = authorized.filter(comment => {
      const candidate = record(comment.body, OVERRIDE_PREFIX);
      requireThat(typeof candidate.head_sha === 'string' && SHA.test(candidate.head_sha),
        'override has an invalid head SHA');
      return candidate.head_sha === target.head_sha;
    });
    requireThat(overrides.length === 1, 'REQUEST_CHANGES needs exactly one explicit override');
    const comment = overrides[0];
    const override = record(comment.body, OVERRIDE_PREFIX);
    requireThat(exactKeys(override, ['schema', 'repository', 'pull_request', 'head_sha', 'review_id', 'reason']) &&
      override.schema === 'squad-review-override/v1' &&
      override.repository === target.repository && override.pull_request === target.pull_request &&
      override.head_sha === target.head_sha && override.review_id === review.id &&
      typeof override.reason === 'string' && override.reason.trim().length >= 10,
    'invalid SHA-scoped override');
    requireThat(timestamp(comment.created_at) >= timestamp(review.submitted_at) &&
      timestamp(comment.updated_at) === timestamp(comment.created_at) &&
      timestamp(comment.created_at) <= cutoff, 'override must be a new, unedited human comment');
  }
  await reviewTarget(env, get, {
    ...options,
    requireBootstrapRunSuccess: true,
  });
  return verdict;
}
