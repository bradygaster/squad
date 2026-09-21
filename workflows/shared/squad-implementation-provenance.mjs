import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROVENANCE_LABEL = 'Squad implementation provenance:';
export const PROVENANCE_SCHEMA =
  'https://bradygaster.github.io/squad/schemas/implementation-provenance/v1';
export const SESSION_ID =
  /^squad-implementation-session\/v1\/[1-9][0-9]*\/[1-9][0-9]*$/;
export const NUMERIC_ID = /^[1-9][0-9]*$/;
export const TEMPORARY_ID = /^#?aw_[A-Za-z0-9_]{3,12}$/;
export const BOT = 'github-actions[bot]';
export const RECORD_TYPE = 'record_implementation_provenance';
export const DISPATCH_WORKFLOWS = new Set([
  '.github/workflows/squad.lock.yml',
  '.github/workflows/squad-retro.lock.yml',
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'schema_version',
  'producer',
  'repository',
  'origin_issue',
  'implementation_session_id',
  'session_origin',
  'workflow_run',
  'pull_request',
  'goals',
  'replaces',
]);
const SESSION_ORIGIN_KEYS = Object.freeze([
  'repository',
  'workflow',
  'run_id',
  'run_attempt',
]);
const WORKFLOW_RUN_KEYS = Object.freeze([
  'repository',
  'workflow',
  'run_id',
  'run_attempt',
  'event',
]);
const PULL_REQUEST_KEYS = Object.freeze(['repository', 'number', 'head_ref']);
const GOAL_KEYS = Object.freeze(['repository', 'issue', 'relationship']);
const REPLACEMENT_KEYS = Object.freeze(['repository', 'number']);
const RECORD_KEYS = Object.freeze(['pull_request', 'goals_json', 'replaces_json']);

const normalizeText = value => String(value ?? '').replace(/\r\n/g, '\n');
const exactKeys = (value, keys) =>
  value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const numeric = value => Number.isSafeInteger(value) && value > 0;
const numericText = value => NUMERIC_ID.test(String(value ?? '')) &&
  Number.isSafeInteger(Number(value));
const normalizeTemporaryId = value => String(value ?? '').replace(/^#/, '').toLowerCase();
const repositoryName = value =>
  typeof value === 'string' && /^[^/\s]+\/[^/\s]+$/.test(value);
const provenanceLikeBody = body => {
  const text = normalizeText(body);
  return /Squad implementation provenance/i.test(text) ||
    text.includes(PROVENANCE_SCHEMA) ||
    /"(?:schema|schema_version|producer|origin_issue|implementation_session_id|session_origin|workflow_run|pull_request|goals|replaces)"\s*:/.test(text);
};

function provenanceCommentCandidates(comments) {
  return comments.filter(comment =>
    (comment?.user?.login ?? comment?.author) === BOT &&
    provenanceLikeBody(comment?.body));
}

function authoritativeProvenanceFromComments(comments, expected) {
  const candidates = provenanceCommentCandidates(comments);
  if (candidates.length !== 1) return null;
  const payload = extractImplementationProvenance(candidates[0].body);
  return payload && validateImplementationProvenance(payload, expected).length === 0
    ? payload
    : null;
}

export function implementationSessionId(repositoryId, dispatcherRunId) {
  const value = `squad-implementation-session/v1/${repositoryId}/${dispatcherRunId}`;
  return SESSION_ID.test(value) ? value : null;
}

export function implementationDispatchReceipt({
  repository,
  issueNumber,
  worker,
  sessionId,
  workflow,
  runId,
  runAttempt,
}) {
  return [
    `Squad-Implementation-Dispatch: ${repository}#${issueNumber} worker=${worker}`,
    `Implementation-Session: ${sessionId}`,
    `Dispatcher-Workflow: ${workflow}`,
    `Dispatcher-Run: ${runId}`,
    `Dispatcher-Attempt: ${runAttempt}`,
  ].join('\n');
}

export function parseImplementationDispatchReceipt(comment, expected = {}) {
  if ((comment?.user?.login ?? comment?.author) !== BOT) return null;
  const lines = normalizeText(comment?.body).split('\n');
  const one = pattern => {
    const matches = lines.map(line => pattern.exec(line)).filter(Boolean);
    return matches.length === 1 ? matches[0] : null;
  };
  const dispatch = one(/^Squad-Implementation-Dispatch: ([^/\s]+\/[^#\s]+)#([1-9][0-9]*) worker=(squad-(?:implement|deps)-worker)$/);
  const session = one(/^Implementation-Session: (\S+)$/);
  const workflow = one(/^Dispatcher-Workflow: (\.github\/workflows\/squad(?:-retro)?\.lock\.yml)$/);
  const run = one(/^Dispatcher-Run: ([1-9][0-9]*)$/);
  const attempt = one(/^Dispatcher-Attempt: ([1-9][0-9]*)$/);
  if (!dispatch || !session || !workflow || !run || !attempt ||
      !SESSION_ID.test(session[1])) return null;
  const value = {
    repository: dispatch[1],
    issue_number: Number(dispatch[2]),
    worker: dispatch[3],
    session_id: session[1],
    workflow: workflow[1],
    run_id: Number(run[1]),
    run_attempt: Number(attempt[1]),
  };
  for (const [field, wanted] of Object.entries(expected)) {
    if (wanted !== undefined && value[field] !== wanted) return null;
  }
  return value;
}

export function extractImplementationProvenance(body) {
  const lines = normalizeText(body).split('\n');
  const candidates = [];
  let fence = null;
  let htmlComment = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      if (new RegExp(`^ {0,3}\\${fence.char}{${fence.length},}[ \\t]*$`).test(line)) fence = null;
      continue;
    }
    if (htmlComment) {
      if (line.includes('-->')) htmlComment = false;
      continue;
    }
    if (line.includes('<!--')) {
      htmlComment = !line.includes('-->');
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = { char: opening[1][0], length: opening[1].length };
      continue;
    }
    if (line.replace(/[ \t]+$/, '') !== PROVENANCE_LABEL) continue;
    let cursor = index + 1;
    while (cursor < lines.length && /^[ \t]*$/.test(lines[cursor])) cursor++;
    if (!/^ {0,3}```json[ \t]*$/.test(lines[cursor] || '')) {
      candidates.push({ malformed: true });
      continue;
    }
    cursor++;
    const jsonLines = [];
    let closed = false;
    for (; cursor < lines.length; cursor++) {
      if (/^ {0,3}`{3,}[ \t]*$/.test(lines[cursor])) {
        closed = true;
        break;
      }
      jsonLines.push(lines[cursor]);
    }
    candidates.push(closed ? { json: jsonLines.join('\n') } : { malformed: true });
    index = closed ? cursor : lines.length;
  }
  if (candidates.length === 0) return null;
  if (candidates.length !== 1 || candidates[0].malformed) return undefined;
  try {
    const value = JSON.parse(candidates[0].json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function containsUnresolvedSentinel(value) {
  if (typeof value === 'string') return value === 'self' || /#?aw_[A-Za-z0-9_]{3,12}/.test(value);
  if (Array.isArray(value)) return value.some(containsUnresolvedSentinel);
  if (value && typeof value === 'object') return Object.values(value).some(containsUnresolvedSentinel);
  return false;
}

function validateGoals(goals, repository, originIssue) {
  if (!Array.isArray(goals) || goals.length === 0 ||
      goals.some(goal => !exactKeys(goal, GOAL_KEYS) ||
        !repositoryName(goal.repository) || !numeric(goal.issue) ||
        !['closes', 'relates'].includes(goal.relationship))) {
    return [{ kind: 'implementation-provenance-goals-invalid' }];
  }
  const keys = goals.map(goal => `${goal.repository}\0${goal.issue}\0${goal.relationship}`);
  if (new Set(keys).size !== keys.length ||
      !goals.some(goal => goal.repository === repository &&
        goal.issue === originIssue && goal.relationship === 'closes')) {
    return [{ kind: 'implementation-provenance-goals-inconsistent' }];
  }
  return [];
}

function validateReplacements(replaces) {
  if (!Array.isArray(replaces) ||
      replaces.some(replacement => !exactKeys(replacement, REPLACEMENT_KEYS) ||
        !repositoryName(replacement.repository) || !numeric(replacement.number))) {
    return [{ kind: 'implementation-provenance-replacements-invalid' }];
  }
  const keys = replaces.map(value => `${value.repository}\0${value.number}`);
  return new Set(keys).size === keys.length
    ? []
    : [{ kind: 'implementation-provenance-replacements-duplicate' }];
}

export function validateImplementationProvenance(value, expected = {}) {
  const violations = [];
  if (!exactKeys(value, TOP_LEVEL_KEYS)) {
    return [{ kind: 'implementation-provenance-shape-invalid' }];
  }
  if (containsUnresolvedSentinel(value)) {
    violations.push({ kind: 'implementation-provenance-unresolved-sentinel' });
  }
  if (value.schema !== PROVENANCE_SCHEMA || value.schema_version !== '1' ||
      value.producer !== 'squad') {
    violations.push({ kind: 'implementation-provenance-version-invalid' });
  }
  if (!repositoryName(value.repository)) {
    violations.push({ kind: 'implementation-provenance-repository-invalid' });
  }
  if (!numeric(value.origin_issue)) {
    violations.push({ kind: 'implementation-provenance-origin-issue-invalid' });
  }
  if (!SESSION_ID.test(String(value.implementation_session_id ?? ''))) {
    violations.push({ kind: 'implementation-provenance-session-invalid' });
  }
  if (!exactKeys(value.session_origin, SESSION_ORIGIN_KEYS) ||
      !repositoryName(value.session_origin?.repository) ||
      !DISPATCH_WORKFLOWS.has(value.session_origin?.workflow) ||
      !numeric(value.session_origin?.run_id) ||
      !numeric(value.session_origin?.run_attempt)) {
    violations.push({ kind: 'implementation-provenance-session-origin-invalid' });
  }
  if (!exactKeys(value.workflow_run, WORKFLOW_RUN_KEYS) ||
      !repositoryName(value.workflow_run?.repository) ||
      typeof value.workflow_run?.workflow !== 'string' ||
      !numeric(value.workflow_run?.run_id) ||
      !numeric(value.workflow_run?.run_attempt) ||
      !['workflow_dispatch', 'pull_request'].includes(value.workflow_run?.event)) {
    violations.push({ kind: 'implementation-provenance-workflow-run-invalid' });
  }
  if (!exactKeys(value.pull_request, PULL_REQUEST_KEYS) ||
      !repositoryName(value.pull_request?.repository) ||
      !numeric(value.pull_request?.number) ||
      typeof value.pull_request?.head_ref !== 'string' ||
      value.pull_request.head_ref.length === 0) {
    violations.push({ kind: 'implementation-provenance-pull-request-invalid' });
  }
  violations.push(...validateGoals(value.goals, value.repository, value.origin_issue));
  violations.push(...validateReplacements(value.replaces));

  const comparisons = [
    ['repository', value.repository, expected.repository],
    ['origin-issue', value.origin_issue, expected.originIssue],
    ['session', value.implementation_session_id, expected.sessionId],
    ['session-repository', value.session_origin?.repository, expected.repository],
    ['session-workflow', value.session_origin?.workflow, expected.dispatcherWorkflow],
    ['session-run-id', value.session_origin?.run_id, expected.dispatcherRunId],
    ['session-run-attempt', value.session_origin?.run_attempt, expected.dispatcherRunAttempt],
    ['workflow-repository', value.workflow_run?.repository, expected.repository],
    ['workflow', value.workflow_run?.workflow, expected.workflow],
    ['run-id', value.workflow_run?.run_id, expected.runId],
    ['run-attempt', value.workflow_run?.run_attempt, expected.runAttempt],
    ['event', value.workflow_run?.event, expected.event],
    ['pull-repository', value.pull_request?.repository, expected.repository],
    ['pull-number', value.pull_request?.number, expected.pullRequestNumber],
    ['head-ref', value.pull_request?.head_ref, expected.headRef],
  ];
  for (const [field, actual, wanted] of comparisons) {
    if (wanted !== undefined && actual !== wanted) {
      violations.push({ kind: 'implementation-provenance-runtime-mismatch', field });
    }
  }
  return violations;
}

function recordForPull(items, pull) {
  const id = normalizeTemporaryId(pull.temporary_id);
  return items.filter(item => item.type === RECORD_TYPE &&
    normalizeTemporaryId(item.pull_request) === id);
}

function provenanceCommentsForPull(items, pull) {
  const id = normalizeTemporaryId(pull.temporary_id);
  return items.filter(item => item.type === 'add_comment' &&
    normalizeTemporaryId(item.item_number) === id &&
    provenanceLikeBody(item.body));
}

function parseRecord(item) {
  if (!exactKeys(item, ['type', ...RECORD_KEYS])) return null;
  try {
    const goals = JSON.parse(item.goals_json);
    const replaces = JSON.parse(item.replaces_json);
    return { ...item, goals, replaces };
  } catch {
    return null;
  }
}

export function evaluateImplementationProvenanceItems({
  items = [],
  repository,
  issueNumber,
  namespace,
  runId,
  requireLegacyMarker = false,
} = {}) {
  const pulls = items.filter(item => item.type === 'create_pull_request');
  const records = items.filter(item => item.type === RECORD_TYPE);
  const violations = [];
  if (pulls.length > 1) violations.push({ kind: 'implementation-provenance-multiple-pulls' });
  if (records.length !== pulls.length) {
    violations.push({ kind: 'implementation-provenance-record-count-invalid' });
  }
  for (const pull of pulls) {
    if (!TEMPORARY_ID.test(String(pull.temporary_id ?? ''))) {
      violations.push({ kind: 'implementation-provenance-pull-temporary-id-invalid' });
    }
    const expectedBranch = new RegExp(
      `^squad/${namespace}-${issueNumber}-[a-z0-9][a-z0-9-]*$`,
    );
    if (!expectedBranch.test(String(pull.branch ?? ''))) {
      violations.push({ kind: 'implementation-provenance-branch-invalid' });
    }
    if (pull.base || pull.repo || pull.head_repo) {
      violations.push({ kind: 'implementation-provenance-pull-target-override' });
    }
    if (normalizeText(pull.body).includes(PROVENANCE_LABEL) ||
        /"number"\s*:\s*"self"/.test(normalizeText(pull.body))) {
      violations.push({ kind: 'implementation-provenance-premature-durable-evidence' });
    }
    const commentCandidates = provenanceCommentsForPull(items, pull);
    if (commentCandidates.length > 0) {
      violations.push({ kind: 'implementation-provenance-comment-candidate-invalid' });
    }
    if (commentCandidates.length > 1) {
      violations.push({ kind: 'implementation-provenance-comment-candidate-ambiguous' });
    }
    const matches = recordForPull(items, pull);
    const record = matches.length === 1 ? parseRecord(matches[0]) : null;
    if (!record) {
      violations.push({ kind: 'implementation-provenance-record-invalid' });
      continue;
    }
    if (items.indexOf(matches[0]) !== items.indexOf(pull) + 1) {
      violations.push({ kind: 'implementation-provenance-record-order-invalid' });
    }
    violations.push(...validateGoals(record.goals, repository, Number(issueNumber)));
    violations.push(...validateReplacements(record.replaces));
    if (requireLegacyMarker) {
      const marker = `<!-- squad:implement issue=${issueNumber} run=${runId || '[1-9][0-9]*'} -->`;
      const lines = normalizeText(pull.body).split('\n');
      const exact = runId
        ? lines.filter(line => line === marker).length === 1
        : lines.filter(line => new RegExp(`^<!-- squad:implement issue=${issueNumber} run=[1-9][0-9]* -->$`).test(line)).length === 1;
      if (!exact || (normalizeText(pull.body).match(/<!-- squad:implement\b/g) || []).length !== 1) {
        violations.push({ kind: 'implementation-provenance-legacy-marker-invalid' });
      }
    }
  }
  return { ok: violations.length === 0, enforced: pulls.length > 0, violations };
}

function expectedIdentityFromEnv(env) {
  return {
    repository: env.GITHUB_REPOSITORY,
    repositoryId: env.GITHUB_REPOSITORY_ID,
    issueNumber: Number(env.SQUAD_IMPLEMENT_ISSUE_NUMBER),
    worker: env.SQUAD_IMPLEMENT_WORKER,
    sessionId: env.SQUAD_IMPLEMENT_SESSION_ID,
    dispatcherWorkflow: env.SQUAD_IMPLEMENT_DISPATCHER_WORKFLOW,
    dispatcherRunId: Number(env.SQUAD_IMPLEMENT_DISPATCHER_RUN_ID),
    dispatcherRunAttempt: Number(env.SQUAD_IMPLEMENT_DISPATCHER_RUN_ATTEMPT),
  };
}

async function collectComments(fetchJson, repository, issueNumber, maxPages = 3) {
  const values = [];
  for (let page = 1; page <= maxPages; page++) {
    const pageValues = await fetchJson(
      `repos/${repository}/issues/${issueNumber}/comments`,
      { per_page: 100, page },
    );
    if (!Array.isArray(pageValues)) return { values, complete: false };
    values.push(...pageValues);
    if (pageValues.length < 100) return { values, complete: true };
  }
  return { values, complete: false };
}

export async function validateWorkerIdentity(env = process.env, {
  fetchJson,
} = {}) {
  const violations = [];
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    if (env.SQUAD_IMPLEMENT_WORKER !== 'squad-implement-worker' ||
        env.SQUAD_IMPLEMENT_PULL_MERGED !== 'true' ||
        env.SQUAD_IMPLEMENT_PULL_BASE_REF !== env.SQUAD_IMPLEMENT_DEFAULT_BRANCH ||
        !numericText(env.SQUAD_IMPLEMENT_PULL_NUMBER)) {
      return { ok: false, violations: [{ kind: 'implementation-provenance-continuation-invalid' }] };
    }
    const comments = await collectComments(
      fetchJson,
      env.GITHUB_REPOSITORY,
      Number(env.SQUAD_IMPLEMENT_PULL_NUMBER),
    );
    const payload = authoritativeProvenanceFromComments(comments.values, {
      repository: env.GITHUB_REPOSITORY,
      pullRequestNumber: Number(env.SQUAD_IMPLEMENT_PULL_NUMBER),
      headRef: env.SQUAD_IMPLEMENT_PULL_HEAD_REF,
    });
    if (!comments.complete || !payload) {
      return { ok: false, violations: [{ kind: 'implementation-provenance-continuation-evidence-invalid' }] };
    }
    return {
      ok: true,
      origin: 'merge-continuation',
      repository: payload.repository,
      issueNumber: payload.origin_issue,
      sessionId: payload.implementation_session_id,
      dispatcherWorkflow: payload.session_origin.workflow,
      dispatcherRunId: payload.session_origin.run_id,
      dispatcherRunAttempt: payload.session_origin.run_attempt,
    };
  }

  const expected = expectedIdentityFromEnv(env);
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_ACTOR !== BOT ||
      !repositoryName(expected.repository) ||
      !numeric(expected.issueNumber) ||
      !['squad-implement-worker', 'squad-deps-worker'].includes(expected.worker) ||
      !DISPATCH_WORKFLOWS.has(expected.dispatcherWorkflow) ||
      !numeric(expected.dispatcherRunId) ||
      !numeric(expected.dispatcherRunAttempt) ||
      expected.sessionId !== implementationSessionId(
        expected.repositoryId,
        expected.dispatcherRunId,
      )) {
    return { ok: false, violations: [{ kind: 'implementation-provenance-dispatch-identity-invalid' }] };
  }
  const run = await fetchJson(
    `repos/${expected.repository}/actions/runs/${expected.dispatcherRunId}`,
    {},
  );
  const runPath = String(run?.path || '').split('@')[0];
  if (Number(run?.id) !== expected.dispatcherRunId ||
      Number(run?.run_attempt) !== expected.dispatcherRunAttempt ||
      run?.repository?.full_name !== expected.repository ||
      runPath !== expected.dispatcherWorkflow) {
    violations.push({ kind: 'implementation-provenance-dispatch-run-untrusted' });
  }
  const comments = await collectComments(fetchJson, expected.repository, expected.issueNumber);
  let receipts = comments.values.map(comment =>
    parseImplementationDispatchReceipt(comment, {
      repository: expected.repository,
      issue_number: expected.issueNumber,
      worker: expected.worker,
      session_id: expected.sessionId,
      workflow: expected.dispatcherWorkflow,
      run_id: expected.dispatcherRunId,
      run_attempt: expected.dispatcherRunAttempt,
    })).filter(Boolean);
  if (expected.dispatcherWorkflow === '.github/workflows/squad-retro.lock.yml') {
    const actionKey = env.SQUAD_IMPLEMENT_RETRO_ACTION_KEY;
    receipts = comments.values.filter(comment => {
      if ((comment?.user?.login ?? comment?.author) !== BOT) return false;
      const lines = normalizeText(comment.body).split('\n');
      return lines.filter(line =>
        line.startsWith(`Squad-Retro-Dispatch: #${expected.issueNumber} at `)).length === 1 &&
        lines.filter(line => line === `Action-Key: ${actionKey}`).length === 1 &&
        lines.filter(line => line === `Dispatch-Run: ${expected.dispatcherRunId}`).length === 1;
    });
  }
  if (!comments.complete || receipts.length !== 1) {
    violations.push({ kind: 'implementation-provenance-dispatch-receipt-unproven' });
  }
  return { ok: violations.length === 0, ...expected, violations, origin: 'dispatcher' };
}

export async function verifyReplacementEvidence({
  replacements,
  repository,
  originIssue,
  sessionId,
  fetchJson,
}) {
  const violations = [...validateReplacements(replacements)];
  for (const replacement of replacements || []) {
    if (replacement.repository !== repository) {
      violations.push({
        kind: 'implementation-provenance-replacement-repository-mismatch',
        number: replacement.number,
      });
      continue;
    }
    let pull;
    try {
      pull = await fetchJson(
        `repos/${repository}/pulls/${replacement.number}`,
        {},
      );
    } catch {
      pull = null;
    }
    if (Number(pull?.number) !== replacement.number ||
        pull?.base?.repo?.full_name !== repository) {
      violations.push({
        kind: 'implementation-provenance-replacement-not-found',
        number: replacement.number,
      });
      continue;
    }
    const comments = await collectComments(fetchJson, repository, replacement.number);
    const payload = authoritativeProvenanceFromComments(comments.values, {
      repository,
      originIssue,
      sessionId,
      pullRequestNumber: replacement.number,
      headRef: pull.head?.ref,
    });
    if (!comments.complete || !payload) {
      violations.push({
        kind: 'implementation-provenance-replacement-unrelated',
        number: replacement.number,
      });
    }
  }
  return violations;
}

export function readAgentOutputItems(directory, explicitPath) {
  try {
    const parsed = JSON.parse(readFileSync(explicitPath || join(directory, 'agent_output.json'), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    return Array.isArray(items) && items.every(item =>
      item && typeof item === 'object' && typeof item.type === 'string') ? items : null;
  } catch {
    return null;
  }
}

export async function enforceImplementationProvenanceSafeOutputs(env = process.env, {
  directory = '/tmp/gh-aw',
  agentOutputPath = env.GH_AW_AGENT_OUTPUT,
  readItems = () => readAgentOutputItems(directory, agentOutputPath),
  fetchJson,
} = {}) {
  const items = readItems();
  if (items === null) {
    return {
      ok: false,
      enforced: true,
      violations: [{ kind: 'implementation-provenance-agent-output-unreadable' }],
    };
  }
  const identity = await validateWorkerIdentity(env, { fetchJson });
  if (!identity.ok) return { ...identity, enforced: true };
  const result = evaluateImplementationProvenanceItems({
    items,
    repository: identity.repository,
    issueNumber: identity.issueNumber,
    namespace: env.SQUAD_IMPLEMENT_NAMESPACE,
    runId: Number(env.GITHUB_RUN_ID),
    requireLegacyMarker: env.SQUAD_IMPLEMENT_REQUIRE_LEGACY_MARKER === 'true',
  });
  const violations = [...result.violations];
  for (const record of items.filter(item => item.type === RECORD_TYPE)) {
    const parsedRecord = parseRecord(record);
    if (!parsedRecord) continue;
    violations.push(...await verifyReplacementEvidence({
      replacements: parsedRecord.replaces,
      repository: identity.repository,
      originIssue: identity.issueNumber,
      sessionId: identity.sessionId,
      fetchJson,
    }));
  }
  return { ...result, ok: violations.length === 0, violations, identity };
}

export async function emitImplementationProvenanceComment({
  item,
  resolvedTemporaryIds,
  items,
  env = process.env,
  fetchJson,
  createComment,
}) {
  const identity = await validateWorkerIdentity(env, { fetchJson });
  if (!identity.ok) throw new Error(describeImplementationProvenanceViolations(identity.violations).join('; '));
  const record = parseRecord(item);
  if (!record || !TEMPORARY_ID.test(String(item.pull_request ?? ''))) {
    throw new Error('implementation-provenance-record-invalid');
  }
  const resolved = resolvedTemporaryIds?.[normalizeTemporaryId(item.pull_request)];
  if (!resolved || resolved.repo !== identity.repository || !numeric(resolved.number)) {
    throw new Error('implementation-provenance-pull-reference-unresolved');
  }
  const pull = await fetchJson(
    `repos/${identity.repository}/pulls/${resolved.number}`,
    {},
  );
  if (Number(pull?.number) !== resolved.number ||
      pull?.base?.repo?.full_name !== identity.repository ||
      typeof pull?.head?.ref !== 'string') {
    throw new Error('implementation-provenance-created-pull-untrusted');
  }
  const outputItems = items ?? (env.GH_AW_AGENT_OUTPUT
    ? readAgentOutputItems('', env.GH_AW_AGENT_OUTPUT)
    : null);
  if (env.GH_AW_AGENT_OUTPUT && outputItems === null) {
    throw new Error('implementation-provenance-agent-output-unreadable');
  }
  const evaluatedItems = outputItems?.map(outputItem =>
    outputItem.type === 'create_pull_request' &&
    normalizeTemporaryId(outputItem.temporary_id) === normalizeTemporaryId(item.pull_request)
      ? { ...outputItem, branch: pull.head.ref, body: pull.body }
      : outputItem);
  const itemCheck = evaluateImplementationProvenanceItems({
    items: evaluatedItems ?? [{
      type: 'create_pull_request',
      temporary_id: item.pull_request,
      branch: pull.head.ref,
      body: pull.body,
    }, item],
    repository: identity.repository,
    issueNumber: identity.issueNumber,
    namespace: env.SQUAD_IMPLEMENT_NAMESPACE,
    runId: Number(env.GITHUB_RUN_ID),
    requireLegacyMarker: env.SQUAD_IMPLEMENT_REQUIRE_LEGACY_MARKER === 'true',
  });
  if (!itemCheck.ok) {
    throw new Error(describeImplementationProvenanceViolations(itemCheck.violations).join('; '));
  }
  const replacementViolations = await verifyReplacementEvidence({
    replacements: record.replaces,
    repository: identity.repository,
    originIssue: identity.issueNumber,
    sessionId: identity.sessionId,
    fetchJson,
  });
  if (replacementViolations.length) {
    throw new Error(describeImplementationProvenanceViolations(replacementViolations).join('; '));
  }
  const payload = {
    schema: PROVENANCE_SCHEMA,
    schema_version: '1',
    producer: 'squad',
    repository: identity.repository,
    origin_issue: identity.issueNumber,
    implementation_session_id: identity.sessionId,
    session_origin: {
      repository: identity.repository,
      workflow: identity.dispatcherWorkflow,
      run_id: identity.dispatcherRunId,
      run_attempt: identity.dispatcherRunAttempt,
    },
    workflow_run: {
      repository: identity.repository,
      workflow: env.SQUAD_IMPLEMENT_WORKFLOW,
      run_id: Number(env.GITHUB_RUN_ID),
      run_attempt: Number(env.GITHUB_RUN_ATTEMPT),
      event: env.GITHUB_EVENT_NAME,
    },
    pull_request: {
      repository: identity.repository,
      number: resolved.number,
      head_ref: pull.head.ref,
    },
    goals: record.goals,
    replaces: record.replaces,
  };
  const violations = validateImplementationProvenance(payload, {
    repository: identity.repository,
    originIssue: identity.issueNumber,
    sessionId: identity.sessionId,
    dispatcherWorkflow: identity.dispatcherWorkflow,
    dispatcherRunId: identity.dispatcherRunId,
    dispatcherRunAttempt: identity.dispatcherRunAttempt,
    workflow: env.SQUAD_IMPLEMENT_WORKFLOW,
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    event: env.GITHUB_EVENT_NAME,
    pullRequestNumber: resolved.number,
    headRef: pull.head.ref,
  });
  if (violations.length) {
    throw new Error(describeImplementationProvenanceViolations(violations).join('; '));
  }
  const body = `${PROVENANCE_LABEL}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
  await createComment(identity.repository, resolved.number, body);
  return { success: true, number: resolved.number, repo: identity.repository };
}

export function describeImplementationProvenanceViolations(violations = []) {
  return violations.map(violation =>
    `${violation.kind}${violation.field ? ` (${violation.field})` : ''}`);
}

async function restJson(env, route, fields = {}) {
  const url = new URL(`https://api.github.com/${route}`);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${route} returned ${response.status}`);
  return response.json();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const operation = process.argv.includes('--worker-identity')
    ? validateWorkerIdentity
    : enforceImplementationProvenanceSafeOutputs;
  operation(process.env, {
    fetchJson: (route, fields) => restJson(process.env, route, fields),
  }).then(result => {
    if (!result.ok) {
      throw new Error(describeImplementationProvenanceViolations(result.violations).join('; '));
    }
    console.log('Squad implementation provenance identity checked.');
  }).catch(error => {
    console.error(`refused: ${error.message}`);
    process.exitCode = 1;
  });
}
