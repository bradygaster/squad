import { readFileSync, writeFileSync } from 'node:fs';
import { evaluateImplementDispatchInputs } from './squad-retro-provenance.mjs';

export const VERDICT_PREFIX = 'Squad-Review-Verdict: ';
export const OVERRIDE_PREFIX = 'Squad-Review-Override: ';
const WORKFLOW = '.github/workflows/squad-review.lock.yml';
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
  requireThat(review.user?.login === BOT && review.user?.id === BOT_ID &&
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
    provenance.install_sha === pr.base.sha &&
    provenance.cast_sha === pr.head.sha,
    'invalid base-controlled bootstrap pull request',
  );
  const run = await get(`repos/${repository}/actions/runs/${provenance.run_id}`);
  requireThat(
    run.event === 'push' &&
    run.path === BOOTSTRAP_WORKFLOW &&
    run.repository?.full_name === repository &&
    run.head_sha === pr.base.sha &&
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
    attribution = await validateBootstrapAttribution(
      get,
      repository,
      pr,
      requireBootstrapRunSuccess,
    );
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

export async function assertClearingReview(env, get, options = {}) {
  const { relay = false } = options;
  requireThat(env.GITHUB_EVENT_NAME === 'pull_request_target',
    'only base-controlled PR target runs can clear review');
  const target = await reviewTarget(env, get, {
    ...options,
    requireBootstrapRunSuccess: true,
  });
  const candidates = (await currentEvidence(target, get)).map(review => ({
    review,
    verdict: validateVerdict(
      record(review.body, VERDICT_PREFIX),
      target,
      review,
      relay ? timestamp(target.pr.merged_at) : Date.now(),
    ),
  }));
  const bound = relay ? candidates : candidates.filter(({ verdict }) =>
    String(verdict.run_id) === env.GITHUB_RUN_ID &&
    String(verdict.run_attempt) === env.GITHUB_RUN_ATTEMPT);
  requireThat(bound.length === 1, 'missing or duplicate verdict evidence for this run');
  const { review, verdict } = bound[0];
  const cutoff = relay ? timestamp(target.pr.merged_at) : Date.now();
  const run = await get(`repos/${target.repository}/actions/runs/${verdict.run_id}`);
  requireThat(run.event === 'pull_request_target' && run.path === WORKFLOW &&
    run.repository?.full_name === target.repository && run.head_sha === target.head_sha &&
    run.run_attempt >= verdict.run_attempt &&
    run.display_title === `Squad review \u2014 PR #${target.pull_request}` &&
    Array.isArray(run.pull_requests) &&
    (run.pull_requests.length === 0 || run.pull_requests.some(pr => pr.number === target.pull_request &&
      pr.head?.sha === target.head_sha && pr.base?.repo?.name === target.pr.base.repo.name)),
  'verdict is not bound to this PR workflow run');
  const attempt = run.run_attempt === verdict.run_attempt ? run :
    await get(`repos/${target.repository}/actions/runs/${verdict.run_id}/attempts/${verdict.run_attempt}`);
  requireThat(attempt.event === 'pull_request_target' && attempt.path === WORKFLOW &&
    attempt.repository?.full_name === target.repository &&
    attempt.head_sha === target.head_sha &&
    attempt.run_attempt === verdict.run_attempt &&
    timestamp(attempt.run_started_at) <= timestamp(verdict.timestamp) &&
    (attempt.status !== 'completed' ||
      timestamp(review.submitted_at) <= timestamp(attempt.updated_at)), 'verdict outside workflow run');
  if (relay) {
    requireThat(attempt.status === 'completed' && attempt.conclusion === 'success',
      'review run attempt did not succeed');
    const jobs = await list(get,
      `repos/${target.repository}/actions/runs/${verdict.run_id}/attempts/${verdict.run_attempt}/jobs`,
      'jobs');
    const authorityJobs = jobs.filter(job => job.name === AUTHORITY_JOB);
    requireThat(authorityJobs.length === 1 && authorityJobs[0].conclusion === 'success' &&
      timestamp(authorityJobs[0].completed_at) <= cutoff,
    'base-controlled review authority job did not pass before merge');
  }
  if (verdict.result === 'REQUEST_CHANGES') {
    const comments = await list(get, `repos/${target.repository}/issues/${target.pull_request}/comments`);
    const overrides = comments.filter(comment =>
      String(comment.body ?? '').includes(OVERRIDE_PREFIX.trim()))
      .filter(comment => {
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
    requireThat(comment.user?.type === 'User' && /^[\w-]+$/.test(comment.user.login) &&
      timestamp(comment.created_at) >= timestamp(review.submitted_at) &&
      timestamp(comment.updated_at) === timestamp(comment.created_at) &&
      timestamp(comment.created_at) <= cutoff, 'override must be a new, unedited human comment');
    const permission = await get(
      `repos/${target.repository}/collaborators/${comment.user.login}/permission`);
    requireThat(permission.permission === 'admin', 'override requires repository administrator');
  }
  await reviewTarget(env, get, {
    ...options,
    requireBootstrapRunSuccess: true,
  });
  return verdict;
}
