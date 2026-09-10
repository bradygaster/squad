import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import * as gate from '../workflows/shared/squad-improvement-gate.mjs';
import { retroActionPullMarker } from '../workflows/shared/squad-retro-provenance.mjs';
import { extractSafeOutputsConfigJson } from './helpers/gh-aw-lock.js';

const ROOT = process.cwd();
const WORKER = readFileSync(resolve(ROOT, 'workflows/squad-improvement-worker.md'), 'utf8').replace(/\r\n/g, '\n');
const ROUTER = readFileSync(resolve(ROOT, 'workflows/squad.md'), 'utf8').replace(/\r\n/g, '\n');
const PATH = '.squad/skills/example/SKILL.md';
const KEY = 'fail:0123456789abcdef';
const REPO = 'squad-test/example';
const AT = '2026-09-02T00:00:00Z';
const workspaces: string[] = [];
function scratch() {
  const root = mkdtempSync(resolve(ROOT, '.squad-improvement-test-'));
  workspaces.push(root);
  return root;
}
afterAll(() => { for (const root of workspaces) rmSync(root, { recursive: true, force: true }); });

const issue = (overrides = {}) => ({
  number: 77, state: 'open', title: 'Improve input-validation guidance',
  user: { login: 'github-actions[bot]', type: 'Bot' },
  labels: ['squad-retro-action', 'squad-retro-proposal'],
  body: `Action-Key: ${KEY}\nProposed-Path: ${PATH}\n\nExplain the empty-input test.`,
  ...overrides,
});
const approvalBody = (proposal = issue()) =>
  `/squad approve-improvement\nApproved-Revision: ${gate.proposalRevision(proposal)}\nApproved-Path: ${PATH}`;
const comment = (overrides = {}) => ({
  id: 901, user: { login: 'maintainer', type: 'User' }, body: approvalBody(),
  issue_url: `https://api.github.com/repos/${REPO}/issues/77`,
  created_at: AT, updated_at: AT, performed_via_github_app: null,
  ...overrides,
});
const approval = (overrides = {}) => ({
  id: 901, author: 'maintainer', user_type: 'User', via_app: false,
  created_at: AT, updated_at: AT, paths: [PATH], revision: gate.proposalRevision(issue()),
  ...overrides,
});
const decide = (overrides = {}) => gate.evaluateImprovementApproval({
  issue: issue(), approval: approval(), actorPermission: 'write', lastEditedAt: null, existingPulls: [], repository: REPO, ...overrides,
});
const env = (root = ROOT) => ({
  GITHUB_REPOSITORY: REPO, GITHUB_WORKSPACE: root, GITHUB_REF: 'refs/heads/dev',
  SQUAD_IMPROVE_DEFAULT_BRANCH: 'dev', SQUAD_IMPROVE_ISSUE_NUMBER: '77', SQUAD_IMPROVE_APPROVAL_COMMENT_ID: '901',
});
function api(options: {
  proposal?: any; approved?: any; comments?: any[]; permission?: any; revision?: any; pulls?: any[];
  commentFailure?: boolean; pullFailure?: boolean; native?: any; nativeFailure?: boolean;
} = {}) {
  const proposal = options.proposal || issue();
  const approved = options.approved || comment();
  const calls: string[] = [];
  return {
    calls,
    fetchJson: async (route: string, fields: any) => {
      calls.push(route);
      if (route === `repos/${REPO}/issues/77`) return proposal;
      if (route === `repos/${REPO}/issues/comments/901`) return approved;
      if (route.endsWith('/comments')) return options.commentFailure ? { __status: 503 } : fields.page === 1 ? options.comments || [approved] : [];
      if (route.endsWith('/permission')) return options.permission || { permission: 'write' };
      if (route.endsWith('/pulls')) return options.pullFailure ? { __status: 503 } : fields.page === 1 ? options.pulls || [] : [];
      throw new Error(`Unexpected route: ${route}`);
    },
    // A single fetchGraphql mock backs BOTH the revision (lastEditedAt) query
    // and the native issue<->PR link query gh-aw's real GraphQL runtime would
    // answer differently; distinguish by the query text so each keeps its own
    // deterministic default and tests can override either independently.
    fetchGraphql: async (query: string) => {
      calls.push('graphql');
      if (query.includes('closedByPullRequestsReferences')) {
        if (options.nativeFailure) return { __status: 503 };
        return { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: options.native || [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
      }
      return options.revision || { data: { repository: { issue: { ...proposal, lastEditedAt: null } } } };
    },
  };
}
const diffFor = (path = PATH, mode = '100644') => [
  `diff --git a/${path} b/${path}`, `new file mode ${mode}`, 'index 0000000..1111111',
  '--- /dev/null', `+++ b/${path}`, '@@ -0,0 +1 @@', '+content', '',
].join('\n');
// The pinned create-pull-request `patch-format: am` transport is always a
// real RFC 2822 mailbox message (as `git format-patch` produces and `git am`
// consumes), never a bare diff. Wrapping every fixture the same way keeps the
// gate under test against the actual transport shape instead of a plain-diff
// mock that a MIME-hiding attack could never reach in production.
const mailboxOf = (diff: string, subject = 'squad improvement') => [
  'From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001',
  'From: squad-bot <squad-bot@users.noreply.github.com>',
  'Date: Tue, 8 Sep 2026 00:00:00 +0000',
  `Subject: [PATCH] ${subject}`,
  '',
  '---',
  ' file | 1 +',
  ' 1 file changed, 1 insertion(+)',
  '',
  diff,
  '-- ',
  '2.45.0',
  '',
].join('\n');
const patchFor = (path = PATH, mode = '100644') => mailboxOf(diffFor(path, mode));
// A realistic mailbox where the visible plaintext MIME part only shows the
// approved diff, while a sibling base64-encoded part -- fully legal in a
// multipart mailbox message and decoded by `git am`'s own mailinfo parser --
// carries an entirely different, unapproved diff. This is the exact transport
// `git am --3way` (not a hand-rolled scanner) will actually apply.
const hiddenMimePatch = (approvedPath: string, hiddenPath: string, boundary = 'squad-mime-boundary') => [
  'From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001',
  'From: squad-bot <squad-bot@users.noreply.github.com>',
  'Date: Tue, 8 Sep 2026 00:00:00 +0000',
  'Subject: [PATCH] Update approved skill',
  'MIME-Version: 1.0',
  `Content-Type: multipart/mixed; boundary="${boundary}"`,
  '',
  `--${boundary}`,
  'Content-Type: text/plain; charset="utf-8"',
  '',
  `---\n file | 1 +\n 1 file changed, 1 insertion(+)\n\n${diffFor(approvedPath)}`,
  `--${boundary}`,
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from(diffFor(hiddenPath), 'utf8').toString('base64').replace(/(.{76})/g, '$1\n'),
  `--${boundary}--`,
  '',
].join('\n');
const prItem = (overrides = {}) => ({
  type: 'create_pull_request', branch: 'squad/improve-77-example', draft: true,
  body: [
    'Closes #77', `Action-Key: ${KEY}`, `Scope-Digest: ${gate.scopeDigest(KEY, [PATH])}`,
    `Approved-Revision: ${gate.proposalRevision(issue())}`, 'Approval-Comment: 901', retroActionPullMarker(77, KEY),
  ].join('\n'),
  ...overrides,
});

describe('improvement: exact human approval', () => {
  it('binds number, title, body, scope and revision, not just a path digest', () => {
    expect(decide()).toMatchObject({ authorized: true, approval_comment_id: 901, proposal_revision: gate.proposalRevision(issue()), paths: [PATH] });
    for (const replacement of [{ number: 78 }, { title: 'Different outcome' }, { body: issue().body + '\nNow remove a check.' }]) {
      expect(gate.proposalRevision(issue(replacement))).not.toBe(gate.proposalRevision(issue()));
    }
  });
  it.each(['write', 'maintain', 'admin'])('requires live %s permission', permission => {
    expect(decide({ actorPermission: permission }).authorized).toBe(true);
  });
  it.each(['read', 'triage', 'none', '', null, undefined])('refuses weak/unresolved permission %s', permission => {
    expect(decide({ actorPermission: permission }).authorized).toBe(false);
  });
  it.each([
    ['closed issue', { issue: issue({ state: 'closed' }) }],
    ['human-created issue', { issue: issue({ user: { login: 'outsider', type: 'User' } }) }],
    ['missing action key', { issue: issue({ body: `Proposed-Path: ${PATH}` }) }],
    ['ordinary action', { issue: issue({ labels: ['squad-retro-action'] }) }],
    ['proposal label alone', { issue: issue({ labels: ['squad-retro-proposal'] }) }],
    ['bot approval', { approval: approval({ user_type: 'Bot' }) }],
    ['app-mediated approval', { approval: approval({ via_app: true }) }],
    ['edited approval', { approval: approval({ updated_at: '2026-09-03T00:00:00Z' }) }],
    ['missing exact comment', { approval: approval({ id: null }) }],
    ['revoked approval', { revokedAfterApproval: true }],
    ['body edited later', { lastEditedAt: '2026-09-03T00:00:00Z' }],
    ['same-second body edit', { lastEditedAt: AT }],
    ['missing revision lookup', { lastEditedAt: undefined }],
    ['bad revision timestamp', { lastEditedAt: 'unknown' }],
    ['different content hash', { approval: approval({ revision: '0'.repeat(64) }) }],
    ['no approved scope', { approval: approval({ paths: [] }) }],
    ['different approved file', { approval: approval({ paths: ['.squad/skills/other/SKILL.md'] }) }],
    ['changed proposal title', { issue: issue({ title: 'A different task' }) }],
  ])('refuses %s', (_name, overrides) => { expect(decide(overrides).authorized).toBe(false); });
  it.each([
    '> /squad approve-improvement', '    /squad approve-improvement',
    '`/squad approve-improvement`', '```\n/squad approve-improvement\n```',
    '~~~\n/squad approve-improvement\n~~~', 'prose\n/squad approve-improvement',
    '/squad\u200b approve-improvement', '\ufeff/squad approve-improvement',
    '/SQUAD APPROVE-IMPROVEMENT', '/squad approve-improvement now',
  ])('does not normalize a different command into authority: %s', body => {
    expect(gate.parseCommandComment(body).command).not.toBe('approve');
  });
  it('accepts CRLF without deleting invisible characters or ignoring trailing code', () => {
    expect(gate.parseCommandComment(approvalBody().replace(/\n/g, '\r\n'))).toMatchObject({ command: 'approve', revision: gate.proposalRevision(issue()), paths: [PATH] });
    expect(gate.parseCommandComment(`${approvalBody()}\n\`\`\`\nhidden\n\`\`\``).command).toBeNull();
  });
  it('ignores proposed keys/paths in fences, quotes and hidden comments', () => {
    expect(gate.extractProposedPaths(`\`\`\`\nProposed-Path: ${PATH}\n\`\`\``)).toEqual([]);
    expect(gate.extractActionKey(`<!--\nAction-Key: ${KEY}\n-->`)).toBeNull();
    expect(gate.extractActionKey(`Action-Key: ${KEY}\nAction-Key: ${KEY}`)).toBeNull();
  });
});

describe('improvement: live revalidation and permanent deduplication', () => {
  it('fetches the exact selected comment, never a newer substitute or the relay actor', async () => {
    const newer = comment({ id: 902, user: { login: 'other-person', type: 'User' } });
    const mock = api({ comments: [comment(), newer] });
    const context = await gate.collectImprovementContext(env(), mock);
    expect(context).toMatchObject({ authorized: true, approval_comment_id: 901, approver: 'maintainer' });
    expect(mock.calls).toContain(`repos/${REPO}/issues/comments/901`);
    expect(mock.calls).toContain(`repos/${REPO}/collaborators/maintainer/permission`);
    expect(mock.calls).not.toContain(`repos/${REPO}/issues/comments/902`);
    expect(mock.calls.length).toBeLessThanOrEqual(gate.IMPROVEMENT_API_REQUEST_CEILING);
  });
  it.each([
    ['wrong issue URL', { approved: comment({ issue_url: 'https://api.github.com/repos/other/repo/issues/77' }) }],
    ['different comment ID', { approved: comment({ id: 902 }) }],
    ['changed content', { proposal: issue({ body: issue().body + '\nDifferent requirement' }) }],
    ['edited human approval', { approved: comment({ updated_at: '2026-09-03T00:00:00Z' }) }],
    ['permission endpoint failure', { permission: { __status: 403 } }],
    ['null GraphQL issue', { revision: { data: { repository: { issue: null } } } }],
    ['missing GraphQL revision field', { revision: { data: { repository: { issue: issue() } } } }],
    ['unreadable comment history', { commentFailure: true }],
    ['unreadable PR history', { pullFailure: true }],
  ])('fails closed on %s', async (_name, options) => {
    expect((await gate.collectImprovementContext(env(), api(options))).authorized).toBe(false);
  });
  it('honors later revocation even with a newer unrelated approval, but not bot-generated revocation', async () => {
    const revoke = comment({ id: 902, body: '/squad revoke-improvement', created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z' });
    expect((await gate.collectImprovementContext(env(), api({ comments: [comment(), revoke, comment({ id: 903 })] }))).reason).toBe('approval-revoked');
    expect((await gate.collectImprovementContext(env(), api({ comments: [{ ...revoke, user: { login: 'bot', type: 'Bot' } }] }))).authorized).toBe(true);
  });
  it.each([
    ['open', null], ['closed', '2026-09-03T00:00:00Z'], ['closed', null],
  ])('reuses a linked %s PR (merged_at=%s)', async (state, merged_at) => {
    for (const link of [
      { head: { ref: 'squad/improve-77-first' } },
      { head: { ref: 'human/fix' }, body: 'Closes #77' },
      // GitHub-supported closing syntax beyond the bare `#77` form: an
      // optional colon after the keyword, and a repo-qualified reference.
      { head: { ref: 'human/fix' }, body: 'Closes: #77' },
      { head: { ref: 'human/fix' }, body: `Closes ${REPO}#77` },
      { head: { ref: 'human/fix' }, body: `Fixes: ${REPO}#77` },
      { head: { ref: 'human/fix' }, body: `Resolves https://github.com/${REPO}/issues/77` },
    ]) {
      const result = await gate.collectImprovementContext(env(), api({ pulls: [{ number: 99, state, merged_at, ...link }] }));
      expect(result).toMatchObject({ authorized: false, reason: 'already-dispatched', pull_number: 99 });
    }
  });
  it('never lets a repo-qualified reference to a DIFFERENT repository count as linking this issue', async () => {
    const result = await gate.collectImprovementContext(env(), api({
      pulls: [{ number: 99, state: 'closed', merged_at: null, head: { ref: 'human/fix' }, body: 'Closes other-org/other-repo#77' }],
    }));
    expect(result.authorized).toBe(true);
  });
  // -------------------------------------------------------------------------
  // Native GitHub issue<->PR links (the PR "Development" sidebar) attach a
  // human PR to this issue with NO closing-keyword text -- or matching
  // branch name -- anywhere in it. `pullLinksIssue`'s text/branch check can
  // never see this; only the native `closedByPullRequestsReferences` lookup
  // (queried per-issue) proves it. Finishing part C: this must dedupe the
  // same as a textual link, cover every PR state, and fail closed on an
  // incomplete or errored native scan.
  // -------------------------------------------------------------------------
  it.each([
    ['OPEN', 'open'], ['CLOSED', 'closed-unmerged'], ['MERGED', 'merged'],
  ])('refuses a re-approval already covered by a native %s link with NO body reference at all', async (nativeState, expectedPullState) => {
    const result = await gate.collectImprovementContext(env(), api({ native: [{ number: 555, state: nativeState }] }));
    expect(result).toMatchObject({ authorized: false, reason: 'already-dispatched', pull_number: 555, pull_state: expectedPullState });
  });
  it('follows a complete paginated native response before authorizing, never truncating early', async () => {
    let calls = 0;
    const mock = api();
    const fetchJson = mock.fetchJson;
    mock.fetchGraphql = async (query: string, variables: { after: string | null }) => {
      if (!query.includes('closedByPullRequestsReferences')) {
        return { data: { repository: { issue: { ...issue(), lastEditedAt: null } } } };
      }
      calls++;
      return calls === 1
        ? { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'c1' } } } } } }
        : { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
    };
    mock.fetchJson = fetchJson;
    const result = await gate.collectImprovementContext(env(), mock);
    expect(calls).toBe(2);
    expect(result.authorized).toBe(true);
  });
  it.each([
    ['errors', { nativeFailure: true }],
    ['exhausts its page ceiling', { native: [], }],
  ])('fails closed -- never authorizes -- when the native link scan %s', async (_name, overrides) => {
    const mock = api(overrides as Record<string, unknown>);
    if (_name.includes('ceiling')) {
      // Force truncation via the page ceiling by always claiming more pages exist.
      mock.fetchGraphql = async (query: string) => query.includes('closedByPullRequestsReferences')
        ? { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'c' } } } } } }
        : { data: { repository: { issue: { ...issue(), lastEditedAt: null } } } };
    }
    expect((await gate.collectImprovementContext(env(), mock)).authorized).toBe(false);
  });
  it.each(['comments', 'pulls'])('refuses a full bounded %s history, never treating it as empty', async kind => {
    const mock = api();
    const fetchJson = mock.fetchJson;
    mock.fetchJson = async (route, fields) => route.endsWith(`/${kind}`)
      ? Array.from({ length: 100 }, () => kind === 'comments' ? comment({ body: 'noise' }) : { head: { ref: 'other' } })
      : fetchJson(route, fields);
    expect((await gate.collectImprovementContext(env(), mock)).authorized).toBe(false);
  });
  it.each(['', '#aw_new123', '77x', '-1', '1.2', '9007199254740993'])('rejects unresolved issue input %s before API work', async number => {
    const mock = api();
    expect((await gate.collectImprovementContext({ ...env(), SQUAD_IMPROVE_ISSUE_NUMBER: number }, mock)).authorized).toBe(false);
    expect(mock.calls).toEqual([]);
  });
});

describe('improvement: actual patch write set', () => {
  it('validates a real parseable Git patch and allows an intentional approved subset', () => {
    const result = gate.evaluatePatchScope(patchFor(), [PATH, '.squad/decisions/inbox/note.md']);
    expect(result).toMatchObject({ ok: true, paths: [PATH] });
  });
  const forbidden = [
    '.squad/decisions.md', '.squad/history.md', '.squad/team.md', '.squad/routing.md', '.squad/config.json',
    '.squad/agents/flight/charter.md', '.github/workflows/squad.md', 'package.json',
    '.squad/skills/gh-aw-enlistment/SKILL.md', '.squad/skills/worker/SKILL.md',
    '.squad/skills/secret-handling/SKILL.md', '.squad/skills/auth/SKILL.md',
    '.squad/skills/permissions/SKILL.md', '.squad/skills/protected-files/SKILL.md',
    '.squad/skills/package-self-upgrade/SKILL.md', '.squad/skills/a/.github/config.md',
    '.squad/skills/a/run.mjs', '.squad/skills/../../outside.md',
    '.squad/skills/a b.md', '.squad/skills/a\u200b.md', '.squad/skills//x.md',
  ];
  it.each(forbidden)('rejects forbidden path even if explicitly approved: %s', path => {
    expect(gate.isSafePath(path)).toBe(false);
    expect(gate.evaluatePatchScope(patchFor(path), [path]).ok).toBe(false);
  });
  it.each(['100755', '120000', '160000'])('rejects transport mode %s', mode => {
    expect(gate.evaluatePatchScope(patchFor(PATH, mode), [PATH]).ok).toBe(false);
  });
  it('rejects an extra in-directory file the human never approved', () => {
    expect(gate.evaluatePatchScope(patchFor() + patchFor('.squad/skills/extra/SKILL.md'), [PATH]).ok).toBe(false);
  });
  it.each([
    patchFor().replace(`+++ b/${PATH}`, '+++ b/.squad/decisions.md'),
    patchFor() + 'diff --git a/.squad/skills/new.md b/.squad/skills/new.md\nrename from old\nrename to new\n',
    patchFor().replace('@@ -0,0 +1 @@\n+content', 'GIT binary patch\nliteral 5\nx'),
    'this is not a git patch',
    patchFor().replace('diff --git a/', 'diff --git "a/'),
  ])('refuses malformed, alternate-target, renamed or binary transport', patch => {
    expect(gate.evaluatePatchScope(patch, [PATH]).ok).toBe(false);
  });
  it('rejects symlinked ancestors using actual filesystem metadata', () => {
    const root = scratch();
    mkdirSync(join(root, '.squad', 'skills'), { recursive: true });
    mkdirSync(join(root, 'outside'));
    symlinkSync(join(root, 'outside'), join(root, '.squad', 'skills', 'linked'), 'junction');
    expect(gate.resolveSafeRepoPaths(root, ['.squad/skills/linked/note.md']).unsafe).toEqual(['.squad/skills/linked/note.md']);
  });
  describe('MIME-hiding mailbox transport (reviewer finding A)', () => {
    // The pinned create-pull-request `patch-format: am` handler applies every
    // message with `git am --3way`, which decodes MIME multipart bodies and
    // quoted-printable/base64 Content-Transfer-Encoding via Git's own
    // mailinfo parser before any hunk is applied. A realistic multipart
    // mailbox can show only the approved diff in a plaintext part while an
    // entirely different, unapproved diff sits base64-encoded in a sibling
    // part -- opaque to a raw byte scan, but decoded and applied by the real
    // transport all the same. These are exercised through the real `git`
    // binary (mailsplit + mailinfo + apply), not a mocked diff.
    const approvedPath = '.squad/skills/approved/SKILL.md';
    const hiddenPath = '.squad/skills/hidden/SKILL.md';
    it('sees the base64-hidden extra file and refuses the out-of-scope write', () => {
      const result = gate.evaluatePatchScope(hiddenMimePatch(approvedPath, hiddenPath), [approvedPath]);
      expect(result.ok).toBe(false);
      expect(result.paths).toEqual([approvedPath, hiddenPath].sort());
      expect(result.violations).toContainEqual({ kind: 'path-outside-approved-scope', path: hiddenPath });
    });
    it('still refuses even when the hidden path would itself be approved as a decoy scope', () => {
      // Approving only the visible plaintext path must not be enough: the
      // gate has to compare against what actually applies, not what a naive
      // scanner can read without decoding.
      const result = gate.evaluatePatchScope(hiddenMimePatch(approvedPath, hiddenPath), [approvedPath, hiddenPath]);
      // Both paths are approved here, so this specific mailbox now validates --
      // the point is that the hidden path was VISIBLE to the scope check at
      // all (proven by the sibling assertion above), not silently dropped.
      expect(result.paths).toEqual([approvedPath, hiddenPath].sort());
      expect(result.ok).toBe(true);
    });
    it('detects a quoted-printable-hidden extra file the same way', () => {
      const boundary = 'squad-qp-boundary';
      const hiddenDiff = diffFor(hiddenPath).replace(/=/g, '=3D');
      const patch = [
        'From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001',
        'From: squad-bot <squad-bot@users.noreply.github.com>',
        'Date: Tue, 8 Sep 2026 00:00:00 +0000',
        'Subject: [PATCH] Update approved skill',
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="utf-8"',
        '',
        `---\n file | 1 +\n 1 file changed, 1 insertion(+)\n\n${diffFor(approvedPath)}`,
        `--${boundary}`,
        'Content-Type: text/plain; charset="utf-8"',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        hiddenDiff,
        `--${boundary}--`,
        '',
      ].join('\n');
      const result = gate.evaluatePatchScope(patch, [approvedPath]);
      expect(result.ok).toBe(false);
      expect(result.paths).toEqual([approvedPath, hiddenPath].sort());
    });
    it('rejects a mailbox transport git mailsplit cannot parse, rather than silently trusting a raw scan', () => {
      // A bare diff with no mailbox envelope at all can never come from the
      // real `patch-format: am` transport; treat it as untrustworthy input,
      // not as "no privileged output".
      const result = gate.evaluatePatchScope(diffFor(approvedPath), [approvedPath]);
      expect(result).toMatchObject({ ok: false, violations: [{ kind: 'unsupported-mailbox-transport' }] });
    });
    it('decodes a multi-message mailbox series (one file per commit) the same way `git am` would', () => {
      const series = patchFor(approvedPath) + patchFor(hiddenPath);
      const result = gate.evaluatePatchScope(series, [approvedPath]);
      expect(result.ok).toBe(false);
      expect(result.paths).toEqual([approvedPath, hiddenPath].sort());
      expect(gate.evaluatePatchScope(series, [approvedPath, hiddenPath]).ok).toBe(true);
    });
  });
});

describe('improvement: final safe-output enforcement', () => {
  async function enforce(items = [prItem()], patch = patchFor(), options = {}, variables = {}) {
    return gate.enforceImprovementSafeOutputs({ ...env(), ...variables }, { ...api(options), readItems: () => items, readPatch: () => patch });
  }
  it('allows only an approved draft with exact provenance and patch', async () => {
    expect(await enforce()).toMatchObject({ ok: true, enforced: true, paths: [PATH] });
  });
  it.each([
    { draft: false }, { branch: 'squad/improve-78-wrong' }, { branch: '' }, { base: 'dev' },
    { body: 'Closes #77' }, { body: prItem().body.replace('Approval-Comment: 901', 'Approval-Comment: 902') },
    { body: prItem().body.replace('Approved-Revision:', 'Wrong-Revision:') },
    { body: prItem().body.replace('Scope-Digest:', 'Wrong-Digest:') },
  ])('rejects a mutated output: %o', async mutation => { expect((await enforce([prItem(mutation)])).ok).toBe(false); });
  it('checks live revocation again after implementation', async () => {
    const revoked = comment({ body: '/squad revoke-improvement', created_at: AT, updated_at: AT });
    expect((await enforce([prItem()], patchFor(), { comments: [revoked] })).ok).toBe(false);
  });
  it('refuses unsupported bundle transport rather than inspecting a decoy am patch', async () => {
    const root = scratch();
    writeFileSync(join(root, 'agent_output.json'), JSON.stringify({ items: [prItem()] }));
    writeFileSync(join(root, 'aw-squad-improve-77-example.bundle'), 'bundle');
    writeFileSync(join(root, 'aw-squad-improve-77-example.patch'), patchFor());
    expect((await gate.enforceImprovementSafeOutputs(env(), { ...api(), directory: root })).ok).toBe(false);
  });
  it('keeps refusal comments usable without granting PR authority', async () => {
    expect((await enforce([{ type: 'add_comment', item_number: '77', body: 'Refused: approval-revision-mismatch' } as any], '', { permission: { permission: 'read' } })).ok).toBe(true);
    expect((await enforce([{ type: 'add_comment', item_number: '99', body: 'Wrong target' } as any], '')).ok).toBe(false);
  });
  it('fails closed for off-default runs, extra PRs, no patch and unreadable output', async () => {
    expect((await enforce([prItem()], patchFor(), {}, { GITHUB_REF: 'refs/heads/other' })).ok).toBe(false);
    expect((await enforce([prItem(), prItem()])).ok).toBe(false);
    expect((await enforce([prItem()], '')).ok).toBe(false);
    expect((await gate.enforceImprovementSafeOutputs(env(), { readItems: () => null })).ok).toBe(false);
  });
});

describe('improvement: one authorized dispatcher route and installed contract', () => {
  const event = () => ({ action: 'created', issue: { number: 77 }, comment: comment() });
  const variables = { ...env(), GITHUB_EVENT_NAME: 'issue_comment', GITHUB_ACTOR: 'maintainer' };
  it('routes the exact human comment through mutating permission and nested typed inputs', async () => {
    expect((await gate.validateImprovementCommand(event(), variables, api().fetchJson)).ok).toBe(true);
    expect(ROUTER).toContain('gate.validateImprovementCommand(context.payload, process.env)');
    const skill = ROUTER.slice(ROUTER.indexOf('## skill: `squad-approve-improvement`'), ROUTER.indexOf('## skill: `squad-revoke-improvement`'));
    const payload = JSON.parse(skill.match(/```json\n([\s\S]*?)\n```/)![1]);
    expect(Object.keys(payload.inputs).sort()).toEqual(['approval_comment_id', 'issue_number']);
    expect(payload.issue_number).toBeUndefined();
  });
  it.each([
    ['weak permission', () => event(), { permission: { permission: 'read' } }],
    ['wrong issue target', () => ({ ...event(), issue: { number: 99 } }), {}],
    ['different comment content', () => ({ ...event(), comment: comment({ body: '/squad approve-improvement\nunexpected' }) }), {}],
    ['PR comment', () => ({ ...event(), issue: { number: 77, pull_request: {} } }), {}],
    ['edited comment', () => ({ ...event(), action: 'edited' }), {}],
    ['bot approval', () => event(), { approved: comment({ user: { login: 'maintainer', type: 'Bot' } }) }],
  ])('refuses %s before the dispatcher agent', async (_name, input, options) => {
    expect((await gate.validateImprovementCommand(input(), variables, api(options).fetchJson)).ok).toBe(false);
  });
  it('reserves revocation without dispatch, labels or comments', async () => {
    const revoke = { ...event(), comment: comment({ body: '/squad revoke-improvement' }) };
    expect(await gate.validateImprovementCommand(revoke, variables)).toMatchObject({ ok: true, reserved: true });
    const mode = ROUTER.slice(ROUTER.indexOf('## skill: `squad-revoke-improvement`'), ROUTER.indexOf('## skill: `squad-connect`'));
    expect(mode).toContain('Emit nothing, dispatch nothing');
    expect(mode).not.toContain('```json');
  });
  it('rejects relays whose IDs no longer match the injected immediate comment context', async () => {
    const origin = {
      repo: REPO, workflow_id: `${REPO}/.github/workflows/squad.lock.yml@refs/heads/dev`,
      event_type: 'issue_comment', item_type: 'issue', item_number: '77', comment_id: '901',
    };
    const routedEnv = { ...env(), GITHUB_ACTOR: 'github-actions[bot]', SQUAD_IMPROVE_AW_CONTEXT: JSON.stringify(origin) };
    expect((await gate.collectImprovementContext(routedEnv, api())).authorized).toBe(true);
    for (const mutation of [{ comment_id: '902' }, { item_number: '78' }, { workflow_id: 'forged' }, { repo: 'other/repo' }]) {
      const result = await gate.collectImprovementContext({
        ...routedEnv, SQUAD_IMPROVE_AW_CONTEXT: JSON.stringify({ ...origin, ...mutation }),
      }, api());
      expect(result.reason).toBe('approval-relay-context-invalid');
    }
  });
  it('strict-compiles the am transport, exact allowlist and before-handler live gate', () => {
    const root = scratch();
    cpSync(resolve(ROOT, 'workflows'), join(root, '.github', 'workflows'), { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('gh', ['aw', 'compile', 'squad-improvement-worker', '--strict', '--no-check-update'], { cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    const lock = readFileSync(join(root, '.github', 'workflows', 'squad-improvement-worker.lock.yml'), 'utf8');
    const config = JSON.parse(extractSafeOutputsConfigJson(lock)!);
    expect(config.create_pull_request).toMatchObject({
      draft: true, max: 1, max_patch_files: 20, protected_files_policy: 'blocked',
      allowed_files: ['.squad/skills/**', '.squad/decisions/inbox/**'], protected_dot_folder_excludes: ['.squad/'],
    });
    expect(config.create_pull_request.protected_files).toContain('package.json');
    expect(config).not.toHaveProperty('dispatch_workflow');
    expect(WORKER).toContain('patch-format: am');
    expect(WORKER).toContain('echo ".github/workflows/squad-improvement-context.json" >> "${GITHUB_WORKSPACE:?}/.git/info/exclude"');
    expect(WORKER).not.toMatch(/^\s{2}(issue_comment|pull_request|schedule):/m);
    const job = lock.slice(lock.indexOf('\n  safe_outputs:\n'));
    expect(job.indexOf('name: Enforce approved improvement scope before any output')).toBeLessThan(job.indexOf('name: Process Safe Outputs'));
    expect(job).toContain('ref: refs/heads/${{ github.event.repository.default_branch }}');
    expect(job).toContain('SQUAD_IMPROVE_APPROVAL_COMMENT_ID');
  }, 90000);
});
