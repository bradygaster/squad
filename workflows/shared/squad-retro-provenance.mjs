// Read-only checks run again in the trusted safe-outputs job, before handlers.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const BOT = 'github-actions[bot]';
export const ACTION_LABEL = 'squad-retro-action';
export const PROPOSAL_LABEL = 'squad-retro-proposal';
export const RETRO_ORIGIN = 'squad-retro';
export const IMPLEMENT_WORKFLOW = 'squad-implement-worker';
export const RETRO_WORKFLOW_PATH = '.github/workflows/squad-retro.lock.yml';
export const FINGERPRINT = /^(?:fail|review):[0-9a-f]{16}$/;
export const TEMPORARY_ID = /^#?aw_[A-Za-z0-9_]{3,12}$/i;
export const NUMERIC_ID = /^[1-9][0-9]*$/;
export const DISPATCH_INPUT_KEYS = Object.freeze(['issue_number', 'request_origin', 'retro_action_key']);
export const IMPLEMENT_PULL_SCAN_MAX_PAGES = 5;
export const ACTION_COMMENT_MAX_PAGES = 2;
export const IMPLEMENT_GUARD_API_REQUEST_CEILING = 2 + ACTION_COMMENT_MAX_PAGES + IMPLEMENT_PULL_SCAN_MAX_PAGES;
export const RETRO_GUARD_API_REQUEST_CEILING = 3 * (1 + ACTION_COMMENT_MAX_PAGES) + IMPLEMENT_PULL_SCAN_MAX_PAGES;
export const IMPLEMENT_SCAN_RESOLUTION =
  'Manually inspect linked PRs; an incomplete scan cannot authorize automation. '
  + 'Use /squad implement on the action issue for human-managed recovery, not a retro-origin re-dispatch.';

export const normalizeText = value => String(value ?? '').replace(/\r\n/g, '\n');
export const labelsOf = issue => (issue?.labels || []).map(label =>
  typeof label === 'string' ? label : String(label?.name || ''));
export const isBotAuthored = item => (item?.author ?? item?.user?.login) === BOT &&
  (item?.user?.type === undefined || item.user.type === 'Bot');
export const isNumericId = value => NUMERIC_ID.test(String(value ?? '')) &&
  Number.isSafeInteger(Number(value));

// Keep display normalization out of authorization. In particular, removing
// invisible characters would turn a different command, key or path into one.
export function visibleLines(body) {
  const lines = [];
  let fence = null;
  let comment = false;
  for (const line of normalizeText(body).split('\n')) {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`).test(line)) fence = null;
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = { char: opening[1][0], length: opening[1].length };
      continue;
    }
    if (comment || line.includes('<!--')) {
      comment = !line.includes('-->');
      continue;
    }
    lines.push(line);
  }
  return lines;
}

export function standaloneValues(body, field) {
  const pattern = new RegExp(`^${field}: ([^\\s]+)[ \\t]*$`);
  return visibleLines(body).flatMap(line => {
    const match = pattern.exec(line);
    return match ? [match[1]] : [];
  });
}

export function extractActionKey(body) {
  const keys = standaloneValues(body, 'Action-Key');
  return keys.length === 1 && FINGERPRINT.test(keys[0]) ? keys[0] : null;
}

// gh-aw v0.87.10 appends structured metadata as `${body}\n\n` plus the exact
// top-level heading below and a fenced ```json block generated with
// JSON.stringify(item.data, null, 2). Parse that Markdown structure, not a
// regex over raw bytes: examples inside fenced code blocks are not authority,
// while incomplete or duplicate top-level envelopes are malformed.
const STRUCTURED_DATA_LABEL = 'Structured data:';

function markdownFenceOpen(line) {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return match ? { char: match[1][0], length: match[1].length } : null;
}

function markdownFenceClose(line, fence) {
  return new RegExp(`^ {0,3}\\${fence.char}{${fence.length},}[ \\t]*$`).test(line);
}

function isTopLevelStructuredDataLabel(line) {
  return line.replace(/[ \t]+$/, '') === STRUCTURED_DATA_LABEL;
}

function isTopLevelJsonFence(line) {
  return /^ {0,3}```json[ \t]*$/.test(line);
}

function isTopLevelBacktickFenceClose(line) {
  return /^ {0,3}`{3,}[ \t]*$/.test(line);
}

function structuredDataCandidates(body) {
  const lines = normalizeText(body).split('\n');
  const candidates = [];
  let fence = null;
  let htmlComment = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      if (markdownFenceClose(line, fence)) fence = null;
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
    const opening = markdownFenceOpen(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (!isTopLevelStructuredDataLabel(line)) continue;

    let cursor = index + 1;
    while (cursor < lines.length && /^[ \t]*$/.test(lines[cursor])) cursor++;
    if (!isTopLevelJsonFence(lines[cursor] || '')) {
      candidates.push({ malformed: true });
      index = cursor - 1;
      continue;
    }

    cursor++;
    const jsonLines = [];
    let closed = false;
    for (; cursor < lines.length; cursor++) {
      if (isTopLevelBacktickFenceClose(lines[cursor])) {
        closed = true;
        break;
      }
      jsonLines.push(lines[cursor]);
    }
    candidates.push(closed ? { json: jsonLines.join('\n') } : { malformed: true });
    index = closed ? cursor : lines.length;
  }
  return candidates;
}

export function parseStructuredData(body) {
  const matches = structuredDataCandidates(body);
  if (matches.length === 0) return null;
  if (matches.length > 1 || matches[0].malformed) return undefined;
  try {
    const value = JSON.parse(matches[0].json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function deriveActionTemporaryId(fingerprint, ordinal = 0) {
  if (!FINGERPRINT.test(String(fingerprint)) || !Number.isInteger(ordinal) || ordinal < 0 || ordinal > 4) return null;
  const [kind, digest] = fingerprint.split(':');
  return `aw_${kind[0]}${digest.slice(0, 6)}${ordinal}`;
}

// The sorted ordinal makes IDs unique even for distinct keys sharing a prefix.
// All five IDs fit both the documented 3–8 and runtime 3–12 suffix limits.
export function deriveActionTemporaryIds(fingerprints) {
  return [...new Set(fingerprints)].sort().slice(0, 5).map((fingerprint, ordinal) => ({
    fingerprint, temporary_id: deriveActionTemporaryId(fingerprint, ordinal),
  }));
}

export const normalizeTemporaryId = value => String(value ?? '').replace(/^#/, '').toLowerCase();
export const isTemporaryId = value => TEMPORARY_ID.test(String(value ?? ''));

// gh-aw removes HTML comments in prose, but preserves visible fenced text.
// Accept only this complete, explicit envelope, not markers in arbitrary code.
export function retroActionPullMarker(issueNumber, actionKey) {
  return `\`\`\`text\n<!-- squad:retro-action issue=${issueNumber} action-key=${actionKey} -->\n\`\`\``;
}

export function parseRetroActionPullMarker(body) {
  const text = normalizeText(body);
  if ((text.match(/squad:retro-action/g) || []).length !== 1) return null;
  const match = /^```text\n<!-- squad:retro-action issue=([1-9][0-9]*) action-key=((?:fail|review):[0-9a-f]{16}) -->\n```[ \t]*$/m.exec(text);
  if (!match || !isNumericId(match[1])) return null;
  // The envelope must not itself be quoted inside a larger fenced block.
  const before = text.slice(0, match.index);
  const sentinel = 'Retro-Provenance-Sentinel: present';
  if (!visibleLines(`${before}${sentinel}`).includes(sentinel)) return null;
  return { issue_number: Number(match[1]), action_key: match[2] };
}

export function hasTrustedActionProvenance(issue) {
  if (!isBotAuthored(issue) || issue?.pull_request) return false;
  const key = extractActionKey(issue?.body);
  if (!key) return false;
  const data = parseStructuredData(issue.body);
  // Absent (no envelope at all) is fine: the `data` field is optional for
  // action issues. Malformed (an envelope marker present but unusable, or
  // ambiguous) is never treated as absent -- an unrelated fenced JSON quoted
  // in the issue's own prose never reaches here, since parseStructuredData
  // only recognizes a top-level "Structured data:" envelope.
  if (data === null) return true;
  if (data === undefined) return false;
  return data.schema_version === '1' && data.squad_artifact === 'retro-action' && data.fingerprint === key;
}

export function isTrustedActionIssue(issue, actionKey = null) {
  return issue?.state === 'open' && labelsOf(issue).includes(ACTION_LABEL) &&
    !labelsOf(issue).includes(PROPOSAL_LABEL) && hasTrustedActionProvenance(issue) &&
    (actionKey === null || extractActionKey(issue.body) === actionKey);
}

export function materializeNewActionIssue(item) {
  if (!Object.prototype.hasOwnProperty.call(item || {}, 'data')) return null;
  // validateItem already serialized data into body before agent_output.json
  // was written. Validate that boundary; never repair or append its envelope.
  const data = parseStructuredData(item.body);
  if (!data || !isDeepStrictEqual(data, item.data)) return null;
  return {
    ...item,
    state: 'open',
    author: BOT,
    user: { login: BOT, type: 'Bot' },
    pull_request: undefined,
  };
}

export function hasTrustedNewActionProvenance(item, actionKey = null) {
  const issue = materializeNewActionIssue(item);
  if (!issue || !labelsOf(issue).includes(ACTION_LABEL) || !hasTrustedActionProvenance(issue) ||
      typeof issue.data.retro_id !== 'string' || !isNumericId(issue.data.retro_id) ||
      (actionKey !== null && extractActionKey(issue.body) !== actionKey)) return false;
  // Creation is not dispatch authorization. Governance proposals may name
  // files outside the improvement worker's narrow, approval-gated allowlist.
  if (!labelsOf(issue).includes(PROPOSAL_LABEL)) return true;
  const paths = standaloneValues(issue.body, 'Proposed-Path');
  const pathLines = visibleLines(issue.body).filter(line => line.startsWith('Proposed-Path:'));
  return paths.length > 0 && paths.length === pathLines.length && new Set(paths).size === paths.length &&
    paths.every(path =>
      /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) &&
      !path.split('/').some(segment => ['.', '..', '.git'].includes(segment.toLowerCase())),
  );
}

export function isTrustedRetroPull(pull, issue) {
  if (!isBotAuthored(pull)) return false;
  const marker = parseRetroActionPullMarker(pull.body);
  if (!marker || extractActionKey(pull.body) !== marker.action_key ||
      Number(issue?.number) !== marker.issue_number || !hasTrustedActionProvenance(issue) ||
      !['open', 'closed'].includes(issue.state) || !labelsOf(issue).includes(ACTION_LABEL) ||
      extractActionKey(issue.body) !== marker.action_key) return false;
  const kind = labelsOf(issue).includes(PROPOSAL_LABEL) ? 'improve' : 'implement';
  return String(pull.head?.ref || pull.head_ref || '').startsWith(`squad/${kind}-${marker.issue_number}-`);
}

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GitHub's closing-keyword syntax recognizes an optional colon after the
// keyword (`Closes: #77`) and, besides a bare `#77`, a repo-qualified
// `owner/repo#77` reference or a full issue URL -- all resolving to the same
// native "closes" relationship regardless of which spelling a human used.
// `repository` (when supplied) lets the qualified/URL forms be recognized
// without also matching a same-numbered issue in an unrelated repository.
export function pullLinksIssue(pull, number, repository) {
  const branch = String(pull?.head?.ref || pull?.head_ref || '');
  if (['implement', 'improve'].some(kind => branch.startsWith(`squad/${kind}-${number}-`))) return true;
  const repo = repository ? escapeRegExp(String(repository)) : null;
  const refs = [
    `#${number}`,
    ...(repo ? [`${repo}#${number}`, `https?://github\\.com/${repo}/issues/${number}`] : []),
  ].join('|');
  const pattern = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\\s+(?:${refs})(?![0-9])\\b`, 'i');
  return visibleLines(pull?.body).some(line => pattern.test(line));
}

// GitHub's *native* issue<->PR link (the "Development" sidebar) is a
// distinct relationship from the closing-keyword text above: a human can
// link a PR to an issue with no keyword -- or any body text -- at all, and
// that link persists (and still counts, per GitHub's own docs) whether the
// PR is later merged or closed unmerged. REST timeline events expose only a
// `connected` event with no target reference, so there is no REST shape that
// can answer "is this issue linked". The verified minimal GraphQL shape is
// `Issue.closedByPullRequestsReferences`, which -- with `excludeUserLinked:
// false` (the default) and `includeClosedPrs: true` -- returns every PR
// referencing this issue via either a keyword or a manual link, open,
// merged, or closed-unmerged, paginated like any other connection.
export const NATIVE_LINK_MAX_PAGES = 2;
const NATIVE_LINKED_PULLS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$after:String){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      closedByPullRequestsReferences(first:100,after:$after,includeClosedPrs:true,excludeUserLinked:false){
        nodes{ number state }
        pageInfo{ hasNextPage endCursor }
      }
    }
  }
}`;

// Normalizes the GraphQL PullRequestState enum (OPEN/CLOSED/MERGED) to the
// same {number,state,merged} shape callers already use for REST pull
// summaries, so a native match can be handed to the exact same logic.
const normalizeNativePull = node => ({
  number: node.number, merged: node.state === 'MERGED', state: node.state === 'MERGED' ? 'closed' : String(node.state || '').toLowerCase(),
});

export async function restGraphql(env, query, variables) {
  try {
    const base = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '').replace(/\/api\/v3$/, '/api');
    const token = env.GH_TOKEN || env.GITHUB_TOKEN;
    if (!token) return { __status: 'missing-token' };
    const response = await fetch(`${base}/graphql`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok ? await response.json() : { __status: response.status };
  } catch {
    return { __status: 'request-unavailable' };
  }
}

// Fails closed (`truncated: true`) on a GraphQL error, an unreachable
// endpoint, a malformed/missing connection shape, or exhausting the page
// ceiling -- an incomplete native scan can never prove "not linked".
export function findNativeLinkedPullsSync(fetchGraphql, repository, issueNumber, maxPages = NATIVE_LINK_MAX_PAGES) {
  const [owner, name] = String(repository).split('/');
  const pulls = [];
  let after = null;
  for (let page = 1; page <= maxPages; page++) {
    let response;
    try { response = fetchGraphql(NATIVE_LINKED_PULLS_QUERY, { owner, name, number: Number(issueNumber), after }); }
    catch { response = null; }
    const connection = response?.data?.repository?.issue?.closedByPullRequestsReferences;
    if (response?.errors || !connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      return { pulls, truncated: true, reason: 'native-link-unavailable', pages_scanned: page - 1 };
    }
    pulls.push(...connection.nodes.map(normalizeNativePull));
    if (!connection.pageInfo.hasNextPage) return { pulls, truncated: false, reason: null, pages_scanned: page };
    after = connection.pageInfo.endCursor;
  }
  return { pulls, truncated: true, reason: 'native-link-page-ceiling', pages_scanned: maxPages };
}

export async function findNativeLinkedPulls(fetchGraphql, repository, issueNumber, maxPages = NATIVE_LINK_MAX_PAGES) {
  const [owner, name] = String(repository).split('/');
  const pulls = [];
  let after = null;
  for (let page = 1; page <= maxPages; page++) {
    let response;
    try { response = await fetchGraphql(NATIVE_LINKED_PULLS_QUERY, { owner, name, number: Number(issueNumber), after }); }
    catch { response = null; }
    const connection = response?.data?.repository?.issue?.closedByPullRequestsReferences;
    if (response?.errors || !connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      return { pulls, truncated: true, reason: 'native-link-unavailable', pages_scanned: page - 1 };
    }
    pulls.push(...connection.nodes.map(normalizeNativePull));
    if (!connection.pageInfo.hasNextPage) return { pulls, truncated: false, reason: null, pages_scanned: page };
    after = connection.pageInfo.endCursor;
  }
  return { pulls, truncated: true, reason: 'native-link-page-ceiling', pages_scanned: maxPages };
}

export function dispatchMarker(target, actionKey, runId, at) {
  return `Squad-Retro-Dispatch: #${String(target).replace(/^#/, '')} at ${at}\nAction-Key: ${actionKey}\nDispatch-Run: ${runId}`;
}

export function parseDispatchMarker(comment, issueNumber) {
  if (!isBotAuthored(comment)) return null;
  const lines = visibleLines(comment.body);
  const matches = lines.map(line => /^Squad-Retro-Dispatch: #([1-9][0-9]*) at (\S+)$/.exec(line)).filter(Boolean);
  if (matches.length !== 1 || Number(matches[0][1]) !== Number(issueNumber)) return null;
  const at = Date.parse(comment.created_at || matches[0][2]);
  if (!Number.isFinite(at)) return null;
  return { at, run_id: standaloneValues(comment.body, 'Dispatch-Run')[0] || null, action_key: extractActionKey(comment.body) };
}

const targetOf = item => String(item?.item_number ?? item?.issue_number ?? item?.pr_number ?? '');
export function evaluateRetroDispatchOutputs({ items = [], autoImplementEnabled = false, maxDispatch = 3, actionTemporaryIds } = {}) {
  const violations = [];
  const targets = [];
  if (!Array.isArray(items)) return { ok: false, enforced: true, violations: [{ kind: 'unreadable-agent-output' }], targets };
  const dispatches = items.filter(item => item.type === 'dispatch_workflow');
  if (!dispatches.length) return { ok: true, enforced: false, violations, targets, reason: 'no-dispatch-output' };
  if (!autoImplementEnabled) return {
    ok: false, enforced: true, violations: [{ kind: 'dispatch-while-auto-implement-disabled' }], targets,
  };
  if (dispatches.length > Math.min(3, maxDispatch)) violations.push({ kind: 'dispatch-over-max' });
  const creates = items.filter(item => item.type === 'create_issue');
  const ids = actionTemporaryIds || deriveActionTemporaryIds(creates.map(item => extractActionKey(item.body)).filter(Boolean));
  const seenCreates = new Set();
  for (const create of creates) {
    const id = normalizeTemporaryId(create.temporary_id);
    if (seenCreates.has(id)) violations.push({ kind: 'duplicate-create-temporary-id', target: id });
    seenCreates.add(id);
  }
  const seen = new Set();
  for (const item of dispatches) {
    const index = items.indexOf(item);
    if (item.workflow_name !== IMPLEMENT_WORKFLOW) violations.push({ kind: 'dispatch-workflow-not-allowed' });
    if (item.ref || item.repo || item.target_repo) violations.push({ kind: 'dispatch-target-override' });
    const inputs = item.inputs;
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
      violations.push({ kind: 'dispatch-inputs-missing' });
      continue;
    }
    if (Object.keys(inputs).some(key => !DISPATCH_INPUT_KEYS.includes(key))) violations.push({ kind: 'dispatch-input-not-allowed' });
    if (inputs.request_origin !== RETRO_ORIGIN) violations.push({ kind: 'dispatch-origin-not-declared' });
    if (!FINGERPRINT.test(inputs.retro_action_key)) violations.push({ kind: 'dispatch-action-key-malformed' });
    const target = inputs.issue_number;
    if (typeof target !== 'string' || (!isNumericId(target) && !/^#aw_[a-z0-9_]{3,12}$/.test(target))) {
      violations.push({ kind: 'dispatch-target-not-resolvable' });
      continue;
    }
    if (seen.has(target)) violations.push({ kind: 'duplicate-dispatch-target' });
    seen.add(target);
    let createIndex = -1;
    if (isTemporaryId(target)) {
      createIndex = items.findIndex(candidate => candidate.type === 'create_issue' &&
        `#${candidate.temporary_id}` === target);
      if (createIndex < 0 || createIndex >= index) {
        violations.push({ kind: 'unresolved-temporary-id' });
        continue;
      }
      const create = items[createIndex];
      if (!labelsOf(create).includes(ACTION_LABEL)) violations.push({ kind: 'dispatch-target-not-action-labeled' });
      if (labelsOf(create).includes(PROPOSAL_LABEL)) violations.push({ kind: 'dispatch-target-is-proposal' });
      if (extractActionKey(create.body) !== inputs.retro_action_key) violations.push({ kind: 'dispatch-action-key-mismatch' });
      if (!hasTrustedNewActionProvenance(create, inputs.retro_action_key)) violations.push({ kind: 'new-action-provenance-invalid' });
      if (!ids.some(entry => entry.fingerprint === inputs.retro_action_key && `#${entry.temporary_id}` === target)) {
        violations.push({ kind: 'temporary-id-not-derived' });
      }
    }
    const marker = items.findIndex((candidate, position) => {
      if (candidate.type !== 'add_comment' || position <= createIndex || position >= index || targetOf(candidate) !== target) return false;
      const match = /^Squad-Retro-Dispatch: #(\S+) at (\S+)$/m.exec(normalizeText(candidate.body));
      return match && `#${match[1]}` === (target.startsWith('#') ? target : `#${target}`) && Number.isFinite(Date.parse(match[2]));
    });
    if (marker < 0) violations.push({ kind: 'dispatch-without-durable-marker' });
    targets.push({ target, action_key: inputs.retro_action_key, same_run: createIndex >= 0, issue_number: isNumericId(target) ? Number(target) : null });
  }
  return { ok: violations.length === 0, enforced: true, violations, targets };
}

export function evaluateImplementDispatchInputs({
  eventName = '', issueNumber = '', requestOrigin = '', retroActionKey = '',
  awContext = '', repository = '', defaultBranch = '',
} = {}) {
  if (eventName !== 'workflow_dispatch') return { ok: true, enforced: false, origin: 'event', violations: [] };
  const violations = [];
  if (!isNumericId(issueNumber)) violations.push({ kind: 'issue-number-not-numeric' });
  if (!requestOrigin && !retroActionKey) return {
    ok: !violations.length, enforced: !!violations.length, origin: 'manual', issue_number: Number(issueNumber), violations,
  };
  if (requestOrigin !== RETRO_ORIGIN) violations.push({ kind: 'request-origin-unknown' });
  if (!FINGERPRINT.test(retroActionKey)) violations.push({ kind: 'retro-action-key-malformed' });
  let caller;
  try { caller = JSON.parse(awContext); } catch { caller = null; }
  if (!caller || Array.isArray(caller) || typeof caller !== 'object') violations.push({ kind: 'aw-context-missing' });
  else {
    if (!defaultBranch || !repository || caller.workflow_id !== `${repository}/${RETRO_WORKFLOW_PATH}@refs/heads/${defaultBranch}`) {
      violations.push({ kind: 'retro-origin-caller-mismatch' });
    }
    if (caller.repo !== repository) violations.push({ kind: 'retro-origin-repo-mismatch' });
    if (!isNumericId(caller.run_id) || !isNumericId(caller.run_attempt)) violations.push({ kind: 'retro-origin-run-missing' });
  }
  return { ok: !violations.length, enforced: true, origin: RETRO_ORIGIN, issue_number: Number(issueNumber), action_key: retroActionKey, caller, violations };
}

export async function restJson(env, route, fields = {}) {
  try {
    const url = new URL(`${String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '')}/${route.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, String(value));
    const token = env.GH_TOKEN || env.GITHUB_TOKEN;
    if (!token) return { __status: 'missing-token' };
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(15000),
    });
    return response.ok ? await response.json() : { __status: response.status };
  } catch {
    return { __status: 'request-unavailable' };
  }
}

export async function collectPages(fetchJson, route, fields = {}, maxPages = 5) {
  const values = [];
  for (let page = 1; page <= maxPages; page++) {
    let batch;
    try { batch = await fetchJson(route, { ...fields, per_page: 100, page }); } catch { batch = null; }
    if (!Array.isArray(batch)) return { values, truncated: true, reason: 'list-unavailable', pages_scanned: page - 1 };
    values.push(...batch);
    if (batch.length < 100) return { values, truncated: false, reason: null, pages_scanned: page };
  }
  return { values, truncated: true, reason: 'list-page-ceiling', pages_scanned: maxPages };
}

export function readAgentOutputItems(directory, explicitPath) {
  try {
    const parsed = JSON.parse(readFileSync(explicitPath || join(directory, 'agent_output.json'), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    return Array.isArray(items) && items.every(item => item && typeof item === 'object' && typeof item.type === 'string') ? items : null;
  } catch { return null; }
}

export function readAutoImplementEnabled(root) {
  try {
    const raw = JSON.parse(readFileSync(resolve(root, '.squad', 'config.json'), 'utf8'));
    return raw?.squadRetroAutoImplement === 'allow' && (raw.squadRetro === undefined || raw.squadRetro === 'allow');
  } catch { return false; }
}

// Native links cover a human-connected PR that carries no closing-keyword
// text (and possibly no matching branch name) at all, including one already
// closed unmerged; text/branch matching alone would miss it. Checked first
// -- and short-circuiting the REST scan on a match -- since both paths agree
// on "an existing PR already owns this issue" and native lookup is the
// cheaper, issue-scoped call. A native-scan failure fails the whole lookup
// closed: an incomplete native scan can no more prove "not linked" than an
// incomplete REST scan can.
export async function findImplementPullRequest(fetchJson, repository, issueNumber, fetchGraphql) {
  if (fetchGraphql) {
    const native = await findNativeLinkedPulls(fetchGraphql, repository, issueNumber);
    if (native.truncated) return { match: null, truncated: true, reason: native.reason, pages_scanned: native.pages_scanned };
    if (native.pulls.length) {
      const match = [...native.pulls].sort((left, right) => left.number - right.number)[0];
      return { match, truncated: false, reason: null, pages_scanned: 0 };
    }
  }
  for (let page = 1; page <= IMPLEMENT_PULL_SCAN_MAX_PAGES; page++) {
    let batch;
    try { batch = await fetchJson(`repos/${repository}/pulls`, { state: 'all', sort: 'created', direction: 'desc', per_page: 100, page }); } catch { batch = null; }
    if (!Array.isArray(batch)) return { match: null, truncated: true, reason: 'pull-list-unavailable', pages_scanned: page - 1 };
    const match = batch.find(pull => pullLinksIssue(pull, issueNumber, repository));
    if (match) return { match: { number: match.number, state: match.state, merged: !!(match.merged_at || match.merged) }, truncated: false, reason: null, pages_scanned: page };
    if (batch.length < 100) return { match: null, truncated: false, reason: null, pages_scanned: page };
  }
  return { match: null, truncated: true, reason: 'pull-list-page-ceiling', pages_scanned: IMPLEMENT_PULL_SCAN_MAX_PAGES };
}

export async function validateImplementOrigin(env, fetchJson = (route, fields) => restJson(env, route, fields)) {
  const result = evaluateImplementDispatchInputs({
    eventName: env.SQUAD_IMPLEMENT_EVENT_NAME || env.GITHUB_EVENT_NAME,
    issueNumber: env.SQUAD_IMPLEMENT_ISSUE_NUMBER, requestOrigin: env.SQUAD_IMPLEMENT_REQUEST_ORIGIN,
    retroActionKey: env.SQUAD_IMPLEMENT_RETRO_ACTION_KEY, awContext: env.SQUAD_IMPLEMENT_AW_CONTEXT,
    repository: env.GITHUB_REPOSITORY, defaultBranch: env.SQUAD_IMPLEMENT_DEFAULT_BRANCH,
  });
  if (!result.ok || result.origin !== RETRO_ORIGIN) return result;
  const { violations, caller } = result;
  if (env.GITHUB_ACTOR !== BOT || env.GITHUB_REF !== `refs/heads/${env.SQUAD_IMPLEMENT_DEFAULT_BRANCH}`) {
    violations.push({ kind: 'retro-origin-platform-mismatch' });
    return { ...result, ok: false };
  }
  const repository = env.GITHUB_REPOSITORY;
  const run = await fetchJson(`repos/${repository}/actions/runs/${caller.run_id}`, {});
  if (String(run?.id) !== caller.run_id || String(run.run_attempt) !== caller.run_attempt ||
      run.path !== RETRO_WORKFLOW_PATH || run.head_branch !== env.SQUAD_IMPLEMENT_DEFAULT_BRANCH ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      !['schedule', 'workflow_dispatch'].includes(run.event)) violations.push({ kind: 'retro-origin-run-untrusted' });
  const issue = await fetchJson(`repos/${repository}/issues/${result.issue_number}`, {});
  if (Number(issue?.number) !== result.issue_number || !isTrustedActionIssue(issue, result.action_key)) {
    violations.push({ kind: 'retro-action-issue-untrusted' });
  }
  const comments = await collectPages(fetchJson, `repos/${repository}/issues/${result.issue_number}/comments`, {}, ACTION_COMMENT_MAX_PAGES);
  const receipt = comments.values.some(comment => {
    const marker = parseDispatchMarker(comment, result.issue_number);
    return marker?.run_id === caller.run_id && marker.action_key === result.action_key;
  });
  if (comments.truncated || !receipt) violations.push({ kind: 'retro-dispatch-receipt-unproven' });
  return { ...result, ok: !violations.length };
}

export function evaluateRetroPullRequestItems({ items = [], issueNumber, actionKey, namespace = 'implement' } = {}) {
  const pulls = items.filter(item => item.type === 'create_pull_request');
  const violations = [];
  if (pulls.length > 1) violations.push({ kind: 'multiple-pull-request-items' });
  for (const item of pulls) {
    if (item.draft !== undefined && item.draft !== true) violations.push({ kind: 'draft-disabled' });
    if (!new RegExp(`^squad/${namespace}-${issueNumber}-[a-z0-9][a-z0-9-]*$`).test(String(item.branch || ''))) {
      violations.push({ kind: 'branch-outside-implement-namespace' });
    }
    if (item.base || item.repo || item.head_repo) violations.push({ kind: 'pull-request-target-override' });
    if (extractActionKey(item.body) !== actionKey) violations.push({ kind: 'pull-request-action-key-missing' });
    const marker = parseRetroActionPullMarker(item.body);
    if (!marker || marker.issue_number !== Number(issueNumber) || marker.action_key !== actionKey) {
      violations.push({ kind: 'pull-request-retro-marker-invalid' });
    }
  }
  return { ok: !violations.length, violations, count: pulls.length };
}

export async function enforceImplementSafeOutputs(env = process.env, {
  fetchJson = (route, fields) => restJson(env, route, fields),
  fetchGraphql = (query, variables) => restGraphql(env, query, variables),
  directory = '/tmp/gh-aw', agentOutputPath = env.GH_AW_AGENT_OUTPUT,
  readItems = () => readAgentOutputItems(directory, agentOutputPath),
} = {}) {
  const items = readItems();
  if (items === null) return { ok: false, enforced: true, violations: [{ kind: 'unreadable-agent-output' }] };
  const origin = await validateImplementOrigin(env, fetchJson);
  if (!origin.ok) return origin;
  if (origin.origin !== RETRO_ORIGIN) return { ...origin, enforced: false, reason: 'not-retro-originated' };
  const pulls = evaluateRetroPullRequestItems({ items, issueNumber: origin.issue_number, actionKey: origin.action_key });
  const violations = [...pulls.violations];
  // A retro worker cannot drive parent planning or another retrospective.
  if (items.some(item => item.type === 'dispatch_workflow')) violations.push({ kind: 'retro-worker-redispatch-forbidden' });
  let existing;
  if (pulls.count) {
    existing = await findImplementPullRequest(fetchJson, env.GITHUB_REPOSITORY, origin.issue_number, fetchGraphql);
    if (existing.match) violations.push({ kind: 'existing-implement-pull-request', number: existing.match.number, state: existing.match.merged ? 'merged' : existing.match.state });
    else if (existing.truncated) violations.push({
      kind: 'implement-pull-scan-incomplete', reason: existing.reason, pages_scanned: existing.pages_scanned,
      max_pages: existing.reason?.startsWith('native-link') ? NATIVE_LINK_MAX_PAGES : IMPLEMENT_PULL_SCAN_MAX_PAGES,
      branch_prefix: `squad/implement-${origin.issue_number}-`, resolution: IMPLEMENT_SCAN_RESOLUTION,
    });
  }
  return { ...origin, ok: !violations.length, violations, pull_scan_truncated: existing?.truncated || false };
}

export function evaluateRetroPlanOutputs(items, plan) {
  const violations = [];
  const allowedTypes = new Set(['create_issue', 'add_comment', 'add_labels', 'dispatch_workflow', 'upsert_retro_state', 'noop', 'missing_data', 'report_incomplete']);
  if (items.some(item => !allowedTypes.has(item.type))) violations.push({ kind: 'unexpected-retro-output' });
  const creates = items.filter(item => item.type === 'create_issue');
  const actions = creates.filter(item => labelsOf(item).includes(ACTION_LABEL));
  if (actions.length > 5 || creates.length > 6) violations.push({ kind: 'action-create-cap' });
  const keys = actions.map(item => extractActionKey(item.body));
  if (keys.some(key => !key) || new Set(keys).size !== keys.length) violations.push({ kind: 'action-key-not-unique' });
  if (plan.action !== 'run' && actions.length) violations.push({ kind: 'action-create-without-report' });
  if (plan.action !== 'initialize_state' && creates.length !== actions.length) violations.push({ kind: 'unexpected-issue-create' });
  if (plan.action === 'initialize_state' && creates.length > 1) violations.push({ kind: 'state-create-cap' });
  for (const item of actions) {
    const key = extractActionKey(item.body);
    if (!(plan.qualifying_groups || []).some(group => group.fingerprint === key)) violations.push({ kind: 'unqualified-action' });
    if ((plan.action_matches || []).some(match => match.action_key === key)) violations.push({ kind: 'action-already-exists' });
    if (plan.config?.autoImplementEnabled && !plan.action_scan_complete) violations.push({ kind: 'action-history-incomplete' });
    if (!key || !hasTrustedNewActionProvenance(item, key) || item.data.retro_id !== plan.run_id) {
      violations.push({ kind: 'new-action-provenance-invalid' });
    }
  }
  if (plan.config?.autoImplementEnabled) {
    const newTargets = (plan.auto_implement_new_action_ids || []).filter(entry =>
      actions.some(item => item.temporary_id === entry.temporary_id && !labelsOf(item).includes(PROPOSAL_LABEL)));
    const expected = [
      ...(plan.auto_implement_candidates || []).map(item => String(item.issue_number)),
      ...newTargets.map(item => `#${item.temporary_id}`),
    ].slice(0, 3);
    const actual = items.filter(item => item.type === 'dispatch_workflow').map(item => item.inputs?.issue_number);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) violations.push({ kind: 'remediation-plan-not-delivered' });
    for (const exhausted of plan.auto_implement_exhausted || []) {
      const announcements = items.filter(item => item.type === 'add_comment' &&
        targetOf(item) === String(exhausted.issue_number) &&
        visibleLines(item.body).includes(`Squad-Retro-Dispatch-Abandoned: #${exhausted.issue_number}`));
      if (announcements.length !== 1) violations.push({ kind: 'exhausted-handoff-not-recorded' });
    }
  }
  for (const item of items) {
    if (item.type === 'upsert_retro_state' && !['run', 'housekeep'].includes(plan.action)) violations.push({ kind: 'checkpoint-during-reconciliation' });
    if (item.type === 'add_comment' && item.data?.squad_artifact === 'retro-report' && plan.action !== 'run') {
      violations.push({ kind: 'report-during-reconciliation' });
    }
  }
  const incoming = plan.incoming_request;
  if (incoming && !incoming.already_pending && ['suppress', 'reconcile'].includes(plan.action)) {
    const requests = items.filter(item => item.type === 'add_comment' && targetOf(item) === String(plan.state_issue) &&
      item.data?.squad_artifact === 'retro-request' && item.data.fingerprint === incoming.fingerprint);
    if (requests.length !== 1) violations.push({ kind: 'pending-request-not-recorded' });
  }
  return violations;
}

export async function enforceRetroSafeOutputs(env = process.env, {
  fetchJson = (route, fields) => restJson(env, route, fields),
  fetchGraphql = (query, variables) => restGraphql(env, query, variables),
  directory = '/tmp/gh-aw', agentOutputPath = env.GH_AW_AGENT_OUTPUT,
  readItems = () => readAgentOutputItems(directory, agentOutputPath),
  readPlan = () => JSON.parse(readFileSync(env.SQUAD_RETRO_PLAN_PATH, 'utf8')),
  autoImplementEnabled = readAutoImplementEnabled(env.GITHUB_WORKSPACE || process.cwd()),
} = {}) {
  const items = readItems();
  if (items === null) return { ok: false, enforced: true, violations: [{ kind: 'unreadable-agent-output' }] };
  let plan;
  try { plan = readPlan(); } catch { plan = null; }
  if (!plan || plan.run_id !== env.GITHUB_RUN_ID || plan.repository !== env.GITHUB_REPOSITORY) {
    return { ok: false, enforced: true, violations: [{ kind: 'trusted-plan-unavailable' }] };
  }
  const result = evaluateRetroDispatchOutputs({ items, autoImplementEnabled, actionTemporaryIds: plan.auto_implement_new_action_ids });
  const violations = [...result.violations, ...evaluateRetroPlanOutputs(items, plan)];
  if (!result.ok || !result.targets.length) return { ...result, ok: !violations.length, violations };
  if (env.GITHUB_REF !== `refs/heads/${env.SQUAD_RETRO_DEFAULT_BRANCH}`) violations.push({ kind: 'dispatch-off-default-branch' });
  if (!['run', 'housekeep', 'reconcile'].includes(plan.action)) violations.push({ kind: 'dispatch-outside-plan' });
  const pulls = await collectPages(fetchJson, `repos/${env.GITHUB_REPOSITORY}/pulls`, { state: 'all', sort: 'created', direction: 'desc' }, IMPLEMENT_PULL_SCAN_MAX_PAGES);
  if (pulls.truncated) violations.push({ kind: 'implement-pull-scan-incomplete' });
  const { deriveAutoImplementCandidates } = await import('./squad-retro-evidence.mjs');
  for (const target of result.targets) {
    const marker = items.find(item => item.type === 'add_comment' && targetOf(item) === target.target &&
      normalizeText(item.body).startsWith('Squad-Retro-Dispatch: '));
    if (!marker || marker.body !== dispatchMarker(target.target, target.action_key, env.GITHUB_RUN_ID, plan.now)) {
      violations.push({ kind: 'dispatch-receipt-mismatch' });
    }
    if (target.same_run) {
      if (plan.action !== 'run' || !plan.action_scan_complete ||
          !(plan.auto_implement_new_action_ids || []).some(entry => entry.fingerprint === target.action_key &&
            `#${entry.temporary_id}` === target.target)) violations.push({ kind: 'new-dispatch-outside-plan' });
      continue;
    }
    if (!(plan.auto_implement_candidates || []).some(candidate => candidate.issue_number === target.issue_number &&
        candidate.action_key === target.action_key)) violations.push({ kind: 'dispatch-outside-plan' });
    const issue = await fetchJson(`repos/${env.GITHUB_REPOSITORY}/issues/${target.issue_number}`, {});
    if (Number(issue?.number) !== target.issue_number || !isTrustedActionIssue(issue, target.action_key)) {
      violations.push({ kind: 'dispatch-target-untrusted' });
      continue;
    }
    const comments = await collectPages(fetchJson, `repos/${env.GITHUB_REPOSITORY}/issues/${target.issue_number}/comments`, {}, ACTION_COMMENT_MAX_PAGES);
    const native = await findNativeLinkedPulls(fetchGraphql, env.GITHUB_REPOSITORY, target.issue_number);
    if (native.truncated) violations.push({ kind: 'implement-pull-scan-incomplete', reason: native.reason });
    const live = deriveAutoImplementCandidates({
      actionIssues: [{ ...issue, comments: comments.values }], implementPulls: pulls.values, now: plan.now,
      retryHours: plan.config.autoImplementRetryHours,
      nativeLinkedPullsByIssue: new Map([[target.issue_number, native.pulls]]),
    });
    if (comments.truncated || native.truncated || !live.eligible.length) violations.push({ kind: 'dispatch-no-longer-eligible' });
  }
  return { ...result, ok: !violations.length, violations };
}

export const describeViolations = (violations = []) => violations.map(({ kind, ...details }) => `${kind} ${JSON.stringify(details)}`.trim());

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const operation = process.argv.includes('--implement-inputs') ? validateImplementOrigin :
    process.argv.includes('--implement') ? enforceImplementSafeOutputs : enforceRetroSafeOutputs;
  operation(process.env).then(result => {
    if (!result.ok) throw new Error(describeViolations(result.violations).join('; '));
    console.log(`Squad provenance: ${result.origin || 'retro'} checked.`);
  }).catch(error => {
    console.error(`refused: ${error.message}`);
    process.exitCode = 1;
  });
}
