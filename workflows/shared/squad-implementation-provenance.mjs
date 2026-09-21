import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PROVENANCE_LABEL = 'Squad implementation provenance:';
export const PROVENANCE_SCHEMA =
  'https://bradygaster.github.io/squad/schemas/implementation-provenance/v1';
export const SESSION_ID =
  /^squad-implementation-session\/v1\/[1-9][0-9]*\/[1-9][0-9]*$/;
export const NUMERIC_ID = /^[1-9][0-9]*$/;

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'schema_version',
  'producer',
  'repository',
  'origin_issue',
  'implementation_session_id',
  'workflow_run',
  'pull_request',
  'goals',
  'replaces',
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

const normalizeText = value => String(value ?? '').replace(/\r\n/g, '\n');
const exactKeys = (value, keys) =>
  value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const numeric = value => Number.isSafeInteger(value) && value > 0;

export function implementationSessionId(repositoryId, dispatcherRunId) {
  const value = `squad-implementation-session/v1/${repositoryId}/${dispatcherRunId}`;
  return SESSION_ID.test(value) ? value : null;
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

export function validateImplementationProvenance(value, expected = {}) {
  const violations = [];
  if (!exactKeys(value, TOP_LEVEL_KEYS)) {
    return [{ kind: 'implementation-provenance-shape-invalid' }];
  }
  if (value.schema !== PROVENANCE_SCHEMA || value.schema_version !== '1' ||
      value.producer !== 'squad') {
    violations.push({ kind: 'implementation-provenance-version-invalid' });
  }
  if (typeof value.repository !== 'string' || !value.repository.includes('/')) {
    violations.push({ kind: 'implementation-provenance-repository-invalid' });
  }
  if (!numeric(value.origin_issue)) {
    violations.push({ kind: 'implementation-provenance-origin-issue-invalid' });
  }
  if (!SESSION_ID.test(String(value.implementation_session_id ?? ''))) {
    violations.push({ kind: 'implementation-provenance-session-invalid' });
  }

  if (!exactKeys(value.workflow_run, WORKFLOW_RUN_KEYS) ||
      typeof value.workflow_run.repository !== 'string' ||
      typeof value.workflow_run.workflow !== 'string' ||
      !numeric(value.workflow_run.run_id) ||
      !numeric(value.workflow_run.run_attempt) ||
      value.workflow_run.event !== 'workflow_dispatch') {
    violations.push({ kind: 'implementation-provenance-workflow-run-invalid' });
  }
  if (!exactKeys(value.pull_request, PULL_REQUEST_KEYS) ||
      typeof value.pull_request.repository !== 'string' ||
      value.pull_request.number !== 'self' ||
      typeof value.pull_request.head_ref !== 'string') {
    violations.push({ kind: 'implementation-provenance-pull-request-invalid' });
  }
  if (!Array.isArray(value.goals) || value.goals.length === 0 ||
      value.goals.some(goal => !exactKeys(goal, GOAL_KEYS) ||
        typeof goal.repository !== 'string' || !numeric(goal.issue) ||
        !['closes', 'relates'].includes(goal.relationship))) {
    violations.push({ kind: 'implementation-provenance-goals-invalid' });
  } else {
    const goalKeys = value.goals.map(goal =>
      `${goal.repository}\0${goal.issue}\0${goal.relationship}`);
    if (new Set(goalKeys).size !== goalKeys.length ||
        !value.goals.some(goal => goal.repository === value.repository &&
          goal.issue === value.origin_issue && goal.relationship === 'closes')) {
      violations.push({ kind: 'implementation-provenance-goals-inconsistent' });
    }
  }
  if (!Array.isArray(value.replaces) ||
      value.replaces.some(replacement => !exactKeys(replacement, REPLACEMENT_KEYS) ||
        typeof replacement.repository !== 'string' || !numeric(replacement.number))) {
    violations.push({ kind: 'implementation-provenance-replacements-invalid' });
  }

  const comparisons = [
    ['repository', value.repository, expected.repository],
    ['origin-issue', value.origin_issue, expected.originIssue],
    ['session', value.implementation_session_id, expected.sessionId],
    ['workflow-repository', value.workflow_run?.repository, expected.repository],
    ['workflow', value.workflow_run?.workflow, expected.workflow],
    ['run-id', value.workflow_run?.run_id, expected.runId],
    ['run-attempt', value.workflow_run?.run_attempt, expected.runAttempt],
    ['pull-repository', value.pull_request?.repository, expected.repository],
    ['head-ref', value.pull_request?.head_ref, expected.headRef],
  ];
  for (const [field, actual, wanted] of comparisons) {
    if (wanted !== undefined && actual !== wanted) {
      violations.push({ kind: 'implementation-provenance-runtime-mismatch', field });
    }
  }
  return violations;
}

export function evaluateImplementationProvenanceItems({
  items = [],
  repository,
  issueNumber,
  sessionId,
  workflow,
  runId,
  runAttempt,
  namespace,
  requireLegacyMarker = false,
} = {}) {
  const pulls = items.filter(item => item.type === 'create_pull_request');
  const violations = [];
  if (pulls.length > 1) violations.push({ kind: 'implementation-provenance-multiple-pulls' });
  for (const pull of pulls) {
    const expectedBranch = new RegExp(
      `^squad/${namespace}-${issueNumber}-[a-z0-9][a-z0-9-]*$`,
    );
    if (!expectedBranch.test(String(pull.branch ?? ''))) {
      violations.push({ kind: 'implementation-provenance-branch-invalid' });
    }
    const provenance = extractImplementationProvenance(pull.body);
    if (provenance === null) {
      violations.push({ kind: 'implementation-provenance-missing' });
    } else if (provenance === undefined) {
      violations.push({ kind: 'implementation-provenance-malformed' });
    } else {
      violations.push(...validateImplementationProvenance(provenance, {
        repository,
        originIssue: Number(issueNumber),
        sessionId,
        workflow,
        runId: Number(runId),
        runAttempt: Number(runAttempt),
        headRef: pull.branch,
      }));
    }
    if (requireLegacyMarker) {
      const marker =
        `<!-- squad:implement issue=${issueNumber} run=${runId} -->`;
      const lines = normalizeText(pull.body).split('\n');
      if (lines.filter(line => line === marker).length !== 1 ||
          (normalizeText(pull.body).match(/<!-- squad:implement\b/g) || []).length !== 1) {
        violations.push({ kind: 'implementation-provenance-legacy-marker-invalid' });
      }
    }
  }
  return { ok: violations.length === 0, enforced: pulls.length > 0, violations };
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

export function enforceImplementationProvenanceSafeOutputs(env = process.env, {
  directory = '/tmp/gh-aw',
  agentOutputPath = env.GH_AW_AGENT_OUTPUT,
  readItems = () => readAgentOutputItems(directory, agentOutputPath),
} = {}) {
  const items = readItems();
  if (items === null) {
    return {
      ok: false,
      enforced: true,
      violations: [{ kind: 'implementation-provenance-agent-output-unreadable' }],
    };
  }
  return evaluateImplementationProvenanceItems({
    items,
    repository: env.GITHUB_REPOSITORY,
    issueNumber: env.SQUAD_IMPLEMENT_ISSUE_NUMBER,
    sessionId: env.SQUAD_IMPLEMENT_SESSION_ID,
    workflow: env.SQUAD_IMPLEMENT_WORKFLOW,
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    namespace: env.SQUAD_IMPLEMENT_NAMESPACE,
    requireLegacyMarker: env.SQUAD_IMPLEMENT_REQUIRE_LEGACY_MARKER === 'true',
  });
}

export function describeImplementationProvenanceViolations(violations = []) {
  return violations.map(violation =>
    `${violation.kind}${violation.field ? ` (${violation.field})` : ''}`);
}
