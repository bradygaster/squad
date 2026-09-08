// Approval is a live human comment, not a label, dispatch actor or cached verdict.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ACTION_LABEL, PROPOSAL_LABEL, extractActionKey, hasTrustedActionProvenance,
  isNumericId, labelsOf, normalizeText, standaloneValues, restJson, collectPages,
  readAgentOutputItems, evaluateRetroPullRequestItems, pullLinksIssue, findNativeLinkedPulls,
  NATIVE_LINK_MAX_PAGES,
} from './squad-retro-provenance.mjs';

export { ACTION_LABEL, PROPOSAL_LABEL, extractActionKey, readAgentOutputItems };
export const APPROVE_COMMAND = '/squad approve-improvement';
export const REVOKE_COMMAND = '/squad revoke-improvement';
export const TRUSTED_PERMISSIONS = Object.freeze(['admin', 'maintain', 'write']);
export const ALLOWED_PATH_PREFIXES = Object.freeze(['.squad/skills/', '.squad/decisions/inbox/']);
export const ALLOWED_FILE_MODE = '100644';
const MAX_PAGES = 5;
// issue + comment + comments(<=MAX_PAGES) + permission + pulls(<=MAX_PAGES) +
// revision (1 graphql) + native-link scan (<=NATIVE_LINK_MAX_PAGES graphql).
export const IMPROVEMENT_API_REQUEST_CEILING = 3 + 2 * MAX_PAGES + 1 + NATIVE_LINK_MAX_PAGES;
const digest = value => createHash('sha256').update(value).digest('hex');
export const extractProposedPaths = body => [...new Set(standaloneValues(body, 'Proposed-Path'))];
export const scopeDigest = (actionKey, paths) => digest(`${actionKey}\n${[...paths].sort().join('\n')}`).slice(0, 16);

export function proposalRevision(issue) {
  return digest(JSON.stringify([Number(issue.number), normalizeText(issue.title), normalizeText(issue.body)]));
}

export function isSafePath(path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_./-]+\.md$/.test(path) ||
      !ALLOWED_PATH_PREFIXES.some(prefix => path.startsWith(prefix))) return false;
  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return false;
  // These are execution/governance surfaces even when packaged as skills.
  return !segments.slice(1).some(segment =>
    /^(?:\.git.*|node_modules|AGENTS\.md|SECURITY\.md|CODEOWNERS)$/i.test(segment) ||
    /(?:auth|permission|secret|protect|self.upgrade|worker|gh-aw|squad-retro|reviewer-protocol|routing|charter)/i.test(segment));
}

export function parseCommandComment(body) {
  const lines = normalizeText(body).split('\n').filter(line => line.trim() !== '');
  if (lines[0] === REVOKE_COMMAND) return { command: 'revoke', paths: [] };
  if (lines[0] !== APPROVE_COMMAND) return { command: null, paths: [] };
  let revision = null;
  const paths = [];
  for (const line of lines.slice(1)) {
    const revisionLine = /^Approved-Revision: ([0-9a-f]{64})$/.exec(line);
    const pathLine = /^Approved-Path: ([^\s]+)$/.exec(line);
    if (revisionLine && revision === null) revision = revisionLine[1];
    else if (pathLine && !paths.includes(pathLine[1])) paths.push(pathLine[1]);
    else return { command: null, paths: [], malformed: 'approval-has-unexpected-content' };
  }
  return { command: 'approve', paths, revision };
}

export function isTrustedApprover({ permission } = {}) {
  return TRUSTED_PERMISSIONS.includes(permission)
    ? { trusted: true, source: 'collaborator-permission' }
    : { trusted: false, source: null, ...(permission === undefined ? { unresolved: true } : {}) };
}

export function evaluateImprovementApproval({
  issue, approval, revokedAfterApproval = false, actorPermission, lastEditedAt, existingPulls = [],
  nativeLinkedPulls = [], repository,
} = {}) {
  const refuse = (reason, extra = {}) => ({ authorized: false, reason, issue_number: issue?.number ?? null, ...extra });
  if (!issue || issue.pull_request || !isNumericId(issue.number)) return refuse('issue-unavailable');
  if (issue.state !== 'open') return refuse('issue-not-open');
  if (!hasTrustedActionProvenance(issue)) return refuse('issue-provenance-invalid');
  if (!labelsOf(issue).includes(ACTION_LABEL)) return refuse('missing-action-label');
  if (!labelsOf(issue).includes(PROPOSAL_LABEL)) return refuse('missing-proposal-label');
  if (!approval) return refuse('no-approval-comment');
  if (approval.user_type !== 'User' || approval.via_app) return refuse('approval-not-human');
  if (!isNumericId(approval.id) || approval.updated_at !== approval.created_at) return refuse('approval-comment-edited');
  if (revokedAfterApproval) return refuse('approval-revoked');
  const trust = isTrustedApprover({ permission: actorPermission });
  if (!trust.trusted) return refuse(trust.unresolved ? 'actor-permission-unresolved' : 'actor-not-trusted');
  const approvedAt = Date.parse(approval.created_at);
  if (!Number.isFinite(approvedAt) || lastEditedAt === undefined ||
      (lastEditedAt !== null && !Number.isFinite(Date.parse(lastEditedAt)))) return refuse('revision-unresolved');
  if (lastEditedAt !== null && Date.parse(lastEditedAt) >= approvedAt) return refuse('approval-stale-body-changed');
  const paths = extractProposedPaths(issue.body);
  if (!paths.length || paths.length > 20) return refuse('no-proposed-paths');
  const unsafe = paths.filter(path => !isSafePath(path));
  if (unsafe.length) return refuse('out-of-scope-paths', { paths: unsafe });
  const approved = [...(approval.paths || [])].sort();
  if (!approved.length) return refuse('approval-missing-scope');
  if (JSON.stringify(approved) !== JSON.stringify([...paths].sort())) return refuse('approval-scope-mismatch');
  if (approval.revision !== proposalRevision(issue)) return refuse('approval-revision-mismatch');
  const existing = nativeLinkedPulls[0] || existingPulls.find(pull => pullLinksIssue(pull, issue.number, repository));
  if (existing) return refuse('already-dispatched', {
    pull_number: existing.number, pull_state: existing.merged || existing.merged_at ? 'merged' : existing.state === 'open' ? 'open' : 'closed-unmerged',
  });
  const actionKey = extractActionKey(issue.body);
  return {
    authorized: true, reason: 'approved', issue_number: issue.number, paths, action_key: actionKey,
    proposal_revision: proposalRevision(issue), scope_digest: scopeDigest(actionKey, paths),
    approval_comment_id: Number(approval.id), approver: approval.author, approved_at: approval.created_at,
    approval_trust_source: trust.source,
  };
}

export function resolveSafeRepoPaths(root, paths) {
  const safe = [];
  const unsafe = [];
  for (const path of paths) {
    const rel = relative(resolve(root), resolve(root, path));
    let invalid = !isSafePath(path) || !rel || rel.startsWith('..') || isAbsolute(rel);
    let cursor = resolve(root);
    for (const segment of rel.split(/[\\/]/)) {
      cursor = join(cursor, segment);
      try {
        if (lstatSync(cursor).isSymbolicLink()) invalid = true;
      } catch (error) {
        if (error.code !== 'ENOENT') invalid = true;
      }
    }
    (invalid ? unsafe : safe).push(path);
  }
  return { safe, unsafe };
}

export function parsePatchEntries(patchText) {
  const entries = [];
  let current;
  for (const line of normalizeText(patchText).split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/([^\s"]+) b\/([^\s"]+)$/.exec(line);
      current = { paths: new Set(match ? [match[1], match[2]] : []), modes: [], flags: match ? [] : ['unparsable-header'] };
      entries.push(current);
    } else if (current) {
      if (/^(?:rename|copy) (?:from|to) /.test(line)) current.flags.push('rename-or-copy');
      if (/^(?:GIT binary patch|Binary files )/.test(line)) current.flags.push('binary-patch');
      const mode = /^(?:(?:new|deleted) file mode|(?:old|new) mode) (\d+)$/.exec(line) ||
        /^index [0-9a-f]+\.\.[0-9a-f]+ (\d+)$/.exec(line);
      if (mode) current.modes.push(mode[1]);
      const file = /^(?:---|\+\+\+) ([ab]\/[^\t]+)(?:\t.*)?$/.exec(line);
      if (file) current.paths.add(file[1].slice(2));
    }
  }
  return entries.map(entry => ({ ...entry, paths: [...entry.paths] }));
}

// Decode a `git format-patch`/`am` mailbox with Git's OWN mail parser
// (`mailsplit` then `mailinfo`) before any scope check ever runs, so the gate
// always inspects the same bytes `git am --3way` will apply. A hand-rolled
// header scan (or a plain `git apply` on the raw mailbox) is not a MIME
// parser: it can only ever see a plaintext part directly in the raw bytes,
// while a sibling part with `Content-Transfer-Encoding: base64` or
// `quoted-printable` -- fully legal in a multipart mailbox message -- stays
// opaque to it. `git am` decodes every part via `mailinfo` and applies all of
// them, so a malicious mailbox could show an innocent, approved diff to a
// naive scanner while a hidden encoded part carries an entirely different,
// unapproved change. Using the identical Git tooling here closes that gap
// deterministically rather than attempting to reimplement MIME decoding.
function decodeMailboxPatch(rawText, root) {
  const scratch = mkdtempSync(join(tmpdir(), 'squad-improve-mailbox-'));
  try {
    const splitDir = join(scratch, 'split');
    mkdirSync(splitDir, { recursive: true });
    let splitCount;
    try {
      const out = execFileSync('git', ['mailsplit', `-o${splitDir}`], {
        cwd: root, input: rawText, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
      });
      splitCount = Number(String(out).trim());
    } catch {
      return { ok: false, reason: 'unsupported-mailbox-transport' };
    }
    if (!Number.isInteger(splitCount) || splitCount < 1) return { ok: false, reason: 'unsupported-mailbox-transport' };
    const patches = [];
    for (let index = 1; index <= splitCount; index++) {
      const name = String(index).padStart(4, '0');
      let message;
      try {
        message = readFileSync(join(splitDir, name));
      } catch {
        return { ok: false, reason: 'unsupported-mailbox-transport' };
      }
      const msgOut = join(scratch, `${name}.msg`);
      const patchOut = join(scratch, `${name}.patch`);
      try {
        execFileSync('git', ['mailinfo', '--encoding=UTF-8', msgOut, patchOut], {
          cwd: root, input: message, timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        return { ok: false, reason: 'unsupported-mailbox-encoding' };
      }
      try {
        patches.push(readFileSync(patchOut, 'utf8'));
      } catch {
        return { ok: false, reason: 'unsupported-mailbox-encoding' };
      }
    }
    return { ok: true, text: patches.join('\n') };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function evaluatePatchScope(patchText, approvedPaths = [], root = process.cwd()) {
  const violations = [];
  const raw = String(patchText || '');
  if (!raw.trim()) return { ok: true, violations, paths: [], entries: [] };
  // The pinned create-pull-request `patch-format: am` transport applies every
  // message with `git am --3way`, which itself calls Git's own mailsplit and
  // mailinfo mail parser: MIME multipart bodies and quoted-printable/base64
  // Content-Transfer-Encoding are decoded there, before any diff hunk is ever
  // applied. Scanning the untouched mailbox bytes (or running `git apply`
  // directly against them) only ever sees whatever plain-text part happens to
  // be readable without decoding -- a sibling part encoded as base64 can carry
  // an entirely different, unapproved diff that git am still applies. Routing
  // every message through the identical mailsplit/mailinfo parser first means
  // scope enforcement always sees the exact bytes that get written.
  const decoded = decodeMailboxPatch(raw, root);
  if (!decoded.ok) return { ok: false, violations: [{ kind: decoded.reason }], paths: [], entries: [] };
  const text = decoded.text;
  const entries = parsePatchEntries(text);
  const paths = new Set(entries.flatMap(entry => entry.paths));
  if (!entries.length) violations.push({ kind: 'unrecognized-patch-format' });
  for (const entry of entries) {
    for (const kind of entry.flags) violations.push({ kind });
    if (entry.modes.some(mode => mode !== ALLOWED_FILE_MODE)) violations.push({ kind: 'forbidden-file-mode' });
  }
  // Git, not our header parser, is the authority on the transport's write set.
  // --numstat parses the (now MIME-decoded) patch without touching the checkout.
  try {
    const stats = execFileSync('git', ['apply', '--numstat', '-z', '--'], {
      cwd: root, input: text, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const record of stats.split('\0').filter(Boolean)) {
      const match = /^(\d+)\t(\d+)\t(.+)$/.exec(record);
      if (!match) { violations.push({ kind: 'unrecognized-git-write-set' }); continue; }
      if (!paths.has(match[3])) violations.push({ kind: 'patch-parser-disagreement', path: match[3] });
      paths.add(match[3]);
    }
    if (!stats) violations.push({ kind: 'empty-git-write-set' });
  } catch { violations.push({ kind: 'invalid-git-patch' }); }
  for (const path of paths) {
    if (!approvedPaths.includes(path)) violations.push({ kind: 'path-outside-approved-scope', path });
    if (!isSafePath(path)) violations.push({ kind: 'unsafe-patch-path', path });
  }
  if (paths.size > 20) violations.push({ kind: 'patch-file-cap' });
  return { ok: !violations.length, violations, paths: [...paths].sort(), entries };
}

async function graphql(env, query, variables) {
  try {
    const base = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '').replace(/\/api\/v3$/, '/api');
    const response = await fetch(`${base}/graphql`, {
      method: 'POST', headers: { authorization: `Bearer ${env.GH_TOKEN || env.GITHUB_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15000),
    });
    return response.ok ? await response.json() : { __status: response.status };
  } catch { return { __status: 'request-unavailable' }; }
}

export async function collectImprovementContext(env = process.env, {
  fetchJson = (route, fields) => restJson(env, route, fields),
  fetchGraphql = (query, variables) => graphql(env, query, variables),
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  const number = env.SQUAD_IMPROVE_ISSUE_NUMBER;
  const commentId = env.SQUAD_IMPROVE_APPROVAL_COMMENT_ID;
  const refuse = reason => ({ authorized: false, reason, issue_number: isNumericId(number) ? Number(number) : null });
  if (!repository || !isNumericId(number)) return refuse('issue-number-unresolved');
  if (!isNumericId(commentId)) return refuse('approval-comment-id-required');
  if (env.SQUAD_IMPROVE_AW_CONTEXT) {
    let origin;
    try { origin = JSON.parse(env.SQUAD_IMPROVE_AW_CONTEXT); } catch { return refuse('approval-relay-context-invalid'); }
    if (env.GITHUB_ACTOR !== 'github-actions[bot]' || origin.repo !== repository ||
        origin.workflow_id !== `${repository}/.github/workflows/squad.lock.yml@refs/heads/${env.SQUAD_IMPROVE_DEFAULT_BRANCH}` ||
        origin.event_type !== 'issue_comment' || origin.item_type !== 'issue' ||
        origin.item_number !== number || origin.comment_id !== commentId) return refuse('approval-relay-context-invalid');
  }
  const issue = await fetchJson(`repos/${repository}/issues/${number}`, {});
  if (!issue || issue.__status || Number(issue.number) !== Number(number) || issue.pull_request) return refuse('issue-unavailable');
  const comment = await fetchJson(`repos/${repository}/issues/comments/${commentId}`, {});
  const apiBase = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  if (!comment || comment.__status || String(comment.id) !== commentId ||
      comment.issue_url !== `${apiBase}/repos/${repository}/issues/${number}`) return refuse('approval-comment-provenance-invalid');
  const parsed = parseCommandComment(comment.body);
  if (parsed.command !== 'approve') return refuse('no-approval-comment');
  const comments = await collectPages(fetchJson, `repos/${repository}/issues/${number}/comments`, {}, MAX_PAGES);
  if (comments.truncated) return refuse('comment-history-incomplete');
  const revoked = comments.values.some(entry => entry.user?.type === 'User' &&
    parseCommandComment(entry.body).command === 'revoke' &&
    Date.parse(entry.updated_at || entry.created_at) >= Date.parse(comment.created_at));
  const permission = await fetchJson(`repos/${repository}/collaborators/${encodeURIComponent(comment.user?.login || '')}/permission`, {});
  const revision = await fetchGraphql(
    'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){number title body lastEditedAt}}}',
    { owner: repository.split('/')[0], name: repository.split('/')[1], number: Number(number) },
  );
  const live = revision?.data?.repository?.issue;
  if (revision?.errors || !live || !Object.hasOwn(live, 'lastEditedAt') ||
      proposalRevision(live) !== proposalRevision(issue)) return refuse('revision-unresolved');
  const pulls = await collectPages(fetchJson, `repos/${repository}/pulls`, { state: 'all', sort: 'created', direction: 'desc' }, MAX_PAGES);
  if (pulls.truncated) return refuse('pull-request-history-incomplete');
  // Native links (the PR "Development" sidebar) can attach a human PR to
  // this issue with no closing-keyword text at all, including one already
  // closed unmerged; `pullLinksIssue` alone would miss it. An incomplete
  // native scan is refused the same as an incomplete REST pull scan: an
  // absent answer is never proof of "not linked".
  const native = await findNativeLinkedPulls(fetchGraphql, repository, number);
  if (native.truncated) return refuse('pull-request-history-incomplete');
  const result = evaluateImprovementApproval({
    issue, approval: {
      ...parsed, id: comment.id, author: comment.user?.login, user_type: comment.user?.type,
      via_app: !!comment.performed_via_github_app, created_at: comment.created_at, updated_at: comment.updated_at,
    },
    actorPermission: permission && !permission.__status ? permission.permission : undefined,
    lastEditedAt: live.lastEditedAt, revokedAfterApproval: revoked, existingPulls: pulls.values,
    nativeLinkedPulls: native.pulls, repository,
  });
  if (!result.authorized) return result;
  const paths = resolveSafeRepoPaths(env.GITHUB_WORKSPACE || process.cwd(), result.paths);
  return paths.unsafe.length ? { ...refuse('unsafe-path-on-disk'), paths: paths.unsafe } : result;
}

function readPatchText(directory) {
  const files = readdirSync(directory);
  if (files.some(name => /^aw.*\.bundle$/.test(name))) throw new Error('Bundle transport is not approved; use patch-format: am.');
  return files.filter(name => /^aw.*\.patch$/.test(name)).sort().map(name => {
    const path = join(directory, name);
    if (!lstatSync(path).isFile()) throw new Error('Patch transport must be a regular file.');
    return readFileSync(path, 'utf8');
  }).join('\n');
}

export async function enforceImprovementSafeOutputs(env = process.env, {
  fetchJson, fetchGraphql, directory = '/tmp/gh-aw', agentOutputPath = env.GH_AW_AGENT_OUTPUT,
  readItems = () => readAgentOutputItems(directory, agentOutputPath),
  readPatch = () => readPatchText(directory),
} = {}) {
  const items = readItems();
  const violations = [];
  if (items === null) return { ok: false, enforced: true, violations: [{ kind: 'unreadable-agent-output' }] };
  if (items.some(item => !['create_pull_request', 'add_comment', 'noop', 'missing_data', 'report_incomplete'].includes(item.type))) {
    violations.push({ kind: 'unexpected-improvement-output' });
  }
  for (const item of items.filter(item => item.type === 'add_comment')) {
    if (String(item.item_number) !== String(env.SQUAD_IMPROVE_ISSUE_NUMBER) || parseCommandComment(item.body).command) {
      violations.push({ kind: 'comment-outside-action' });
    }
  }
  let patch;
  try { patch = readPatch(); } catch { violations.push({ kind: 'unsupported-patch-transport' }); }
  const privileged = items.some(item => item.type === 'create_pull_request') || !!patch?.trim();
  if (!privileged) return { ok: !violations.length, enforced: !!violations.length, reason: 'no-privileged-output', violations };
  if (!env.SQUAD_IMPROVE_DEFAULT_BRANCH || env.GITHUB_REF !== `refs/heads/${env.SQUAD_IMPROVE_DEFAULT_BRANCH}`) {
    violations.push({ kind: 'privileged-output-off-default-branch' });
  }
  const context = await collectImprovementContext(env, { ...(fetchJson ? { fetchJson } : {}), ...(fetchGraphql ? { fetchGraphql } : {}) });
  if (!context.authorized) return { ok: false, enforced: true, violations: [...violations, { kind: 'unauthorized', reason: context.reason }], context };
  const pulls = evaluateRetroPullRequestItems({ items, issueNumber: context.issue_number, actionKey: context.action_key, namespace: 'improve' });
  violations.push(...pulls.violations);
  for (const item of items.filter(item => item.type === 'create_pull_request')) {
    if (JSON.stringify(standaloneValues(item.body, 'Approved-Revision')) !== JSON.stringify([context.proposal_revision]) ||
        JSON.stringify(standaloneValues(item.body, 'Approval-Comment')) !== JSON.stringify([String(context.approval_comment_id)]) ||
        JSON.stringify(standaloneValues(item.body, 'Scope-Digest')) !== JSON.stringify([context.scope_digest])) {
      violations.push({ kind: 'approval-receipt-mismatch' });
    }
  }
  const scope = evaluatePatchScope(patch, context.paths, env.GITHUB_WORKSPACE || process.cwd());
  violations.push(...scope.violations);
  if (pulls.count && !scope.paths.length) violations.push({ kind: 'pull-request-without-patch' });
  return { ok: !violations.length, enforced: true, violations, context, paths: scope.paths };
}

// Fail fast before the dispatcher agent; its existing mode authorization still
// runs. The receiver checks injected aw_context against the exact relayed IDs.
export async function validateImprovementCommand(event, env, fetchJson = (route, fields) => restJson(env, route, fields)) {
  const violations = [];
  const rawCommand = /(?:^|\s)\/squad(?:\s+|$)([^\r\n]*)/.exec(normalizeText(event?.comment?.body || event?.issue?.body))?.[1]?.trim();
  if (rawCommand === 'revoke-improvement') return { ok: true, reserved: true, violations };
  if (!rawCommand?.startsWith('approve-improvement')) return { ok: true, ignored: true, violations };
  if (env.GITHUB_EVENT_NAME !== 'issue_comment' ||
      event.action !== 'created' || event.issue?.pull_request || rawCommand !== 'approve-improvement') {
    return { ok: false, violations: [{ kind: 'approval-route-invalid' }] };
  }
  const comment = await fetchJson(`repos/${env.GITHUB_REPOSITORY}/issues/comments/${event.comment.id}`, {});
  const apiBase = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  if (comment?.id !== event.comment.id ||
      comment.issue_url !== `${apiBase}/repos/${env.GITHUB_REPOSITORY}/issues/${event.issue.number}` ||
      comment?.user?.type !== 'User' || comment.user.login !== env.GITHUB_ACTOR ||
      comment.performed_via_github_app || comment.created_at !== comment.updated_at ||
      comment.body !== event.comment.body || parseCommandComment(comment.body).command !== 'approve') {
    violations.push({ kind: 'approval-comment-provenance-invalid' });
  }
  const permission = await fetchJson(`repos/${env.GITHUB_REPOSITORY}/collaborators/${encodeURIComponent(env.GITHUB_ACTOR)}/permission`, {});
  if (!isTrustedApprover({ permission: permission?.permission }).trusted) violations.push({ kind: 'actor-not-trusted' });
  return { ok: !violations.length, violations };
}

export const describeViolations = (violations = []) => violations.map(({ kind, ...rest }) => `${kind} ${JSON.stringify(rest)}`);

async function cli() {
  if (process.argv.includes('--revision')) {
    console.log(proposalRevision(JSON.parse(readFileSync(0, 'utf8'))));
    return;
  }
  const result = process.argv.includes('--enforce')
    ? await enforceImprovementSafeOutputs()
    : await collectImprovementContext();
  if (process.argv.includes('--enforce')) {
    if (!result.ok) throw new Error(describeViolations(result.violations).join('; '));
  } else {
    const index = process.argv.indexOf('--output');
    if (index < 0 || !process.argv[index + 1]) throw new Error('--output is required.');
    writeFileSync(process.argv[index + 1], `${JSON.stringify(result, null, 2)}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  cli().catch(error => { console.error(`refused: ${error.message}`); process.exitCode = 1; });
}
