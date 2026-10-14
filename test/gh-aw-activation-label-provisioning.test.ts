/**
 * Fresh repositories are provisioned by the trusted writer before synchronous
 * createIssue calls. No native add_labels fallback can mutate the origin issue.
 */
import { afterAll, describe, it, expect, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  buildActivationBindings, createActivation, digest, finalizeActivation, prepareActivation,
} from '../workflows/shared/squad-activation.mjs';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-label-provisioning');
const workflow = readFileSync(join(WORKFLOWS_DIR, 'squad.md'), 'utf8').replace(/\r\n/g, '\n');
const timestamp = '2026-01-01T00:00:00Z';
const bot = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };
const operator = { id: 700, login: 'operator', type: 'User' };
const clone = <T>(value: T): T => structuredClone(value);
const block = (kind: string) => `Structured data:\n\`\`\`json\n${JSON.stringify({
  squad_artifact: kind, schema_version: '1', origin_issue: 42, phases: [],
})}\n\`\`\``;
afterAll(() => rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true }));

function workspace(prefix: string) {
  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  return mkdtempSync(join(TEST_WORKSPACES_DIR, prefix));
}

function fixture({ owners = ['Builder', 'Reviewer', '@copilot'], implementation = false, phase = false } = {}) {
  const root = workspace('api-');
  mkdirSync(join(root, '.squad/casting'), { recursive: true });
  const registry = {
    schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1,
    transaction_id: 'labels-fixture', generated_at: timestamp,
    agents: Object.fromEntries(['Builder', 'Reviewer'].map(name => [name.toLowerCase(), {
      agent_id: name.toLowerCase(), display_name: name, persistent_name: name, role: 'Engineer',
      universe: 'synthetic', status: 'active', created_at: timestamp, updated_at: timestamp,
    }])),
  };
  const history = {
    transaction_id: registry.transaction_id, registry_revision: registry.revision,
    assignment_cast_snapshots: { genesis: { created_at: timestamp, agents: ['builder', 'reviewer'], universe: 'synthetic' } },
    universe_usage_history: [{ universe: 'synthetic', used_at: timestamp }],
  };
  const registryRaw = JSON.stringify(registry);
  const historyRaw = JSON.stringify(history);
  writeFileSync(join(root, '.squad/casting/registry.json'), registryRaw);
  writeFileSync(join(root, '.squad/casting/history.json'), historyRaw);
  writeFileSync(join(root, '.squad/casting/registry-history.commit.json'), JSON.stringify({
    transaction_id: registry.transaction_id, registry_revision: registry.revision,
    registry_sha256: digest(registryRaw), history_sha256: digest(historyRaw),
  }));
  writeFileSync(join(root, '.squad/team.md'),
    '## Members\n| Name | Role |\n|---|---|\n| Builder | Engineer |\n| Reviewer | Engineer |\n');
  const outputPath = join(root, 'output.json');
  const capturePath = join(root, 'capture.json');
  const journalPath = join(root, 'receipts.json');
  writeFileSync(outputPath, JSON.stringify({ items: [{ type: 'activate_plan', plan_comment_id: '10' }] }));
  const context = {
    repo: { owner: 'owner', repo: 'repo' }, actor: operator.login,
    payload: {
      action: 'created', sender: clone(operator), issue: { number: 42, user: clone(operator) },
      comment: { id: 9, body: implementation ? '/squad plan activate' : '/squad activate', user: clone(operator) },
    },
  };
  const env = {
    GITHUB_EVENT_NAME: 'issue_comment', GITHUB_RUN_ID: '900', GITHUB_RUN_ATTEMPT: '1',
    SQUAD_WORKFLOW_SHA: 'a'.repeat(40),
  };
  const planBody = [
    '# Label provisioning plan', ...(phase ? ['### Phase 1'] : []),
    `| # | Title | ${implementation ? 'Agent' : 'Owner'} | Agent ID | Depends On |${implementation ? ' Epic |' : ''}`,
    `|---|---|---|---|---|${implementation ? '---|' : ''}`,
    ...owners.map((owner, i) =>
      `| ${i + 1} | Same title | ${owner} | ${['Builder', 'Reviewer'].includes(owner) ? owner.toLowerCase() : '-'} | ${i ? i : 'None'} |${implementation ? ' delivery |' : ''}`),
    '', block(implementation ? 'implementation' : 'plan'),
  ].join('\n');
  const comment = (id: number, body: string) => ({
    id, body, user: clone(bot), created_at: timestamp, updated_at: timestamp,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/42',
    html_url: `https://github.com/owner/repo/issues/42#issuecomment-${id}`,
  });
  const comments = new Map([[10, comment(10, planBody)]]);
  if (implementation) {
    comments.set(7, comment(7, block('scope-accepted')));
    comments.set(8, comment(8, [
      '## Implementation Accepted',
      `- **Implementation plan version:** ${comments.get(10)!.html_url}`,
      block('impl-accepted'),
    ].join('\n')));
  }
  const issue = (number: number, params: any = {}) => ({
    number, id: number + 1000, node_id: `I_labels_${number}`,
    title: 'Same title', body: '', labels: [], updated_at: timestamp,
    html_url: `https://github.com/owner/repo/issues/${number}`,
    url: `https://api.github.com/repos/owner/repo/issues/${number}`, ...params,
  });
  const issues = new Map<number, any>([[42, issue(42, { labels: ['user-owned'] })]]);
  const parents = new Map<number, number>();
  const labels = new Set<string>();
  const calls: Array<{ method: string; params: any }> = [];
  const record = (method: string, params: any) => calls.push({ method, params: clone(params) });
  let nextComment = 1000;
  let nextIssue = 101;
  const api = {
    get: vi.fn(async ({ issue_number }: any) => ({ data: clone(issues.get(issue_number)) })),
    getComment: vi.fn(async ({ comment_id }: any) => ({ data: clone(comments.get(comment_id)) })),
    listComments: vi.fn(async () => ({ data: clone([...comments.values()]) })),
    getParent: vi.fn(async ({ issue_number }: any) => ({ data: clone(issues.get(parents.get(issue_number)!)) })),
    getLabel: vi.fn(async (params: any) => {
      record('getLabel', params);
      if (!labels.has(params.name)) throw Object.assign(new Error('Label missing'), { status: 404 });
      return { data: { name: params.name } };
    }),
    createLabel: vi.fn(async (params: any) => {
      record('createLabel', params);
      labels.add(params.name);
      return { data: { name: params.name } };
    }),
    createComment: vi.fn(async (params: any) => {
      record('createComment', params);
      const created = comment(nextComment++, params.body);
      comments.set(created.id, created);
      return { data: clone(created) };
    }),
    updateComment: vi.fn(async (params: any) => {
      record('updateComment', params);
      const current = comments.get(params.comment_id)!;
      current.body = params.body;
      return { data: clone(current) };
    }),
    addSubIssue: vi.fn(async (params: any) => {
      record('addSubIssue', params);
      const child = [...issues.values()].find(value => value.id === params.sub_issue_id);
      parents.set(child.number, params.issue_number);
      return { data: clone(child) };
    }),
    addLabels: vi.fn(async (params: any) => { record('addLabels', params); }),
  };
  const github = {
    rest: { issues: api, repos: { getCollaboratorPermissionLevel: vi.fn(async () => ({ data: { permission: 'admin' } })) } },
    paginate: vi.fn(async (method: any, params: any) => (await method(params)).data),
  };
  const createIssue = vi.fn(async (params: any) => {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    expect(comments.get(journal.pending_comment_id)?.body).toContain('squad-activation-pending/v1');
    expect(journal.started).toHaveLength(journal.receipts.length + 1);
    expect(params.labels.every((label: string) => labels.has(label)), 'labels must exist before POST /issues').toBe(true);
    record('createIssue', params);
    const created = issue(nextIssue++, params);
    issues.set(created.number, created);
    return { staged: false, issue: clone(created) };
  });
  const prepare = () => prepareActivation({ github, context, env, root, outputPath, capturePath });
  const create = (capture: any) => createActivation({
    github, context, env, root, capture, captureArtifactId: 800, journalPath, createIssue,
    sanitizeContent: (value: string) => value,
    formatIssueBody: (value: string) => value,
  });
  const finalize = (capture: any, journal: any) => finalizeActivation({
    github, context, env, root, capture, journal, receiptArtifactId: 801,
  });
  return { root, outputPath, journalPath, context, comments, issues, labels, calls, api, createIssue, prepare, create, finalize };
}

describe('gh-aw: trusted fresh-repository label provisioning', () => {
  it.each([false, true])('provisions every distinct label before any flat/granular create (implementation=%s)', async implementation => {
    const f = fixture({ implementation });
    const capture = await f.prepare();
    const journal = await f.create(capture);
    expect(f.api.getLabel.mock.calls.map(([params]) => params.name)).toEqual(['squad', 'squad:builder', 'squad:reviewer', 'squad:copilot']);
    expect(f.api.createLabel.mock.calls.map(([params]) => params)).toEqual(
      ['squad', 'squad:builder', 'squad:reviewer', 'squad:copilot'].map(name => ({
        owner: 'owner', repo: 'repo', name, color: '9B8FCC',
      })),
    );
    const firstCreate = f.calls.findIndex(call => call.method === 'createIssue');
    expect(f.calls.filter(call => call.method === 'getLabel' || call.method === 'createLabel')
      .every(call => f.calls.indexOf(call) < firstCreate)).toBe(true);
    expect(f.createIssue.mock.calls.map(([params]) => params.labels)).toEqual([
      ...(implementation ? [['squad']] : []),
      ['squad', 'squad:builder'], ['squad', 'squad:reviewer'], ['squad', 'squad:copilot'],
    ]);
    expect(journal.receipts).toHaveLength(implementation ? 4 : 3);
    expect(f.api.addLabels).not.toHaveBeenCalled();
    expect(f.issues.get(42).labels).toEqual(['user-owned']);
    expect(f.createIssue.mock.calls.every(([params]) => params.temporary_id === undefined && params.item_number === undefined)).toBe(true);
  });

  it.each([false, true])('a single-owner phase/epic receives exactly its certified owner label (implementation=%s)', async implementation => {
    const f = fixture({ owners: ['Builder', 'Builder'], phase: !implementation, implementation });
    const capture = await f.prepare();
    await f.create(capture);
    expect(capture.operations).toHaveLength(3);
    expect(f.createIssue.mock.calls.map(([params]) => params.labels)).toEqual([
      ['squad', 'squad:builder'], ['squad', 'squad:builder'], ['squad', 'squad:builder'],
    ]);
    expect(f.api.createLabel).toHaveBeenCalledTimes(2);
  });

  it('multi-owner phase retains each row label but assigns the parent base squad only', async () => {
    const f = fixture({ phase: true });
    const capture = await f.prepare();
    const journal = await f.create(capture);
    expect(capture.operations[0].labels).toEqual(['squad']);
    expect(buildActivationBindings(capture, journal).every((binding: any) =>
      binding.epic_omission_reason === 'multi-owner' && binding.epic_label === null)).toBe(true);
  });

  it('uses existing labels without recoloring, recreating, or reapplying them', async () => {
    const f = fixture({ owners: ['Builder', 'Builder'] });
    f.labels.add('squad');
    f.labels.add('squad:builder');
    await f.create(await f.prepare());
    expect(f.api.getLabel).toHaveBeenCalledTimes(2);
    expect(f.api.createLabel).not.toHaveBeenCalled();
    expect(f.api.addLabels).not.toHaveBeenCalled();
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 500])('does not mistake getLabel HTTP %s for a missing label', async status => {
    const f = fixture();
    f.api.getLabel.mockRejectedValueOnce(Object.assign(new Error(`HTTP ${status}`), { status }));
    await expect(f.create(await f.prepare())).rejects.toThrow(`HTTP ${status}`);
    expect(f.api.createLabel).not.toHaveBeenCalled();
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it.each([403, 500])('does not reserve or create issues when label provisioning fails with HTTP %s, then retries safely', async status => {
    const f = fixture();
    const originalComments = clone([...f.comments.entries()]);
    const originalOrigin = clone(f.issues.get(42));
    f.api.createLabel.mockRejectedValueOnce(Object.assign(new Error('Label provisioning failed'), { status }));
    await expect(f.create(await f.prepare())).rejects.toThrow('Label provisioning failed');
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.api.createComment).not.toHaveBeenCalled();
    expect(f.api.addSubIssue).not.toHaveBeenCalled();
    expect(f.api.addLabels).not.toHaveBeenCalled();
    expect(existsSync(f.journalPath)).toBe(false);
    expect([...f.comments.entries()]).toEqual(originalComments);
    expect([...f.issues.keys()]).toEqual([42]);

    const capture = await f.prepare();
    const journal = await f.create(capture);
    expect(journal.started).toEqual(capture.operations.map((operation: any) => operation.id));
    expect(journal.receipts).toHaveLength(capture.operations.length);
    const reservation = f.calls.findIndex(call => call.params.body?.includes('squad-activation-pending/v1'));
    expect(reservation).toBeGreaterThanOrEqual(0);
    expect(reservation).toBeLessThan(f.calls.findIndex(call => call.method === 'createIssue'));
    expect(f.comments.get(journal.pending_comment_id)?.body).toContain('squad-activation-pending/v1');
    await f.finalize(capture, journal);
    expect(await f.prepare()).toHaveProperty('existingAcceptanceId');
    expect(f.createIssue).toHaveBeenCalledTimes(capture.operations.length);
    expect(new Set(journal.receipts.map((receipt: any) => receipt.number)).size).toBe(capture.operations.length);
    expect(f.issues.size).toBe(capture.operations.length + 1);
    expect(f.issues.get(42)).toEqual(originalOrigin);
  });

  it.each([false, true])('rejects non-roster creation before reservation or label writes (implementation=%s)', async implementation => {
    const f = fixture({ owners: ['Builder', 'Visitor'], implementation });
    await expect((async () => f.create(await f.prepare()))()).rejects.toThrow(/non-roster|uncertified|owner/i);
    expect(f.api.createComment).not.toHaveBeenCalled();
    expect(f.api.getLabel).not.toHaveBeenCalled();
    expect(f.api.createLabel).not.toHaveBeenCalled();
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it('rejects duplicate stable tasks before writes despite different titles', async () => {
    const f = fixture();
    f.comments.get(10)!.body = f.comments.get(10)!.body.replace('| 2 | Same title |', '| 1 | Different title |');
    await expect(f.prepare()).rejects.toThrow(/stable task IDs.*duplicated/);
    expect(f.calls).toEqual([]);
  });

  it('refuses an unreadable frozen roster before writes', async () => {
    const f = fixture();
    writeFileSync(join(f.root, '.squad/team.md'), 'No roster table');
    await expect(f.prepare()).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });

  it('revalidates the frozen roster before provisioning labels', async () => {
    const f = fixture();
    const capture = await f.prepare();
    writeFileSync(join(f.root, '.squad/team.md'), '## Members\n| Name | Role |\n|---|---|\n| Visitor | Engineer |');
    await expect(f.create(capture)).rejects.toThrow(/frozen registry\/roster changed/);
    expect(f.calls).toEqual([]);
  });

  it('does not title-deduplicate distinct stable work or substitute a pre-existing issue', async () => {
    const f = fixture({ owners: ['Builder', 'Builder'] });
    f.issues.set(88, { ...clone(f.issues.get(42)), number: 88, labels: ['unrelated'] });
    const capture = await f.prepare();
    const journal = await f.create(capture);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(journal.receipts.map((receipt: any) => receipt.number)).toEqual([101, 102]);
    expect(f.issues.get(88).labels).toEqual(['unrelated']);
    expect(f.createIssue.mock.calls[1][0].body).toContain('**Depends On:** #101');
  });

  it('never retries an ambiguous create and blocks rerun label writes with the durable reservation', async () => {
    const f = fixture();
    const capture = await f.prepare();
    f.createIssue.mockRejectedValueOnce(new Error('Connection lost after POST'));
    await expect(f.create(capture)).rejects.toThrow('Connection lost after POST');
    const journal = JSON.parse(readFileSync(f.journalPath, 'utf8'));
    expect(journal.started).toEqual(['task:1']);
    expect(journal.receipts).toEqual([]);
    expect(f.createIssue).toHaveBeenCalledTimes(1);
    const callCount = f.calls.length;
    await expect(f.create(capture)).rejects.toThrow(/reserved or accepted/);
    await expect(f.prepare()).rejects.toThrow(/pending activation/);
    expect(f.calls).toHaveLength(callCount);
    expect(f.createIssue).toHaveBeenCalledTimes(1);
  });

  it('requires live labels, not merely the labels intended in a create call, before acceptance', async () => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    f.issues.get(journal.receipts[0].number).labels = ['squad'];
    const priorComments = f.api.createComment.mock.calls.length;
    await expect(f.finalize(capture, journal)).rejects.toThrow(/expected squad:builder, found bare squad/);
    expect(f.api.createComment).toHaveBeenCalledTimes(priorComments);
    expect(f.api.updateComment).not.toHaveBeenCalled();
  });

  it('publishes actual labels only after live verification and does not relabel on a completed rerun', async () => {
    const f = fixture({ implementation: true });
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const acceptance = [...f.comments.values()].find(comment => comment.body.includes('Activation bindings:'))!;
    const bindings = JSON.parse(acceptance.body.split('Activation bindings:\n```json\n')[1].split('\n```')[0]);
    expect(bindings.map((binding: any) => binding.label)).toEqual(['squad:builder', 'squad:reviewer', 'squad:copilot']);
    expect(bindings.every((binding: any) => binding.epic_omission_reason === 'multi-owner')).toBe(true);
    const callCount = f.calls.length;
    await expect(f.prepare()).resolves.toEqual({ existingAcceptanceId: acceptance.id });
    expect(f.calls).toHaveLength(callCount);
    expect(f.api.addLabels).not.toHaveBeenCalled();
  });
});

describe('gh-aw: retained native add-labels compiled contract', () => {
  let compiledLock: string | null = null;
  function compile(source = workflow): string {
    const compiler = process.env.SQUAD_GH_AW_BIN ?? 'gh';
    const prefix = process.env.SQUAD_GH_AW_BIN ? [] : ['aw'];
    const version = spawnSync(compiler, [...prefix, '--version'], { encoding: 'utf8' });
    expect(version.status, 'Supported gh-aw is required; never skip this gate').toBe(0);
    expect(`${version.stdout}\n${version.stderr}`).toContain('v0.91.5');
    const root = workspace('compile-');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    cpSync(WORKFLOWS_DIR, join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/squad.md'), source);
    execFileSync(compiler, [...prefix, 'compile', '.github/workflows/squad.md', '--strict', '--no-check-update'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    const lockPath = join(root, '.github/workflows/squad.lock.yml');
    expect(existsSync(lockPath)).toBe(true);
    return readFileSync(lockPath, 'utf8').replace(/\r\n/g, '\n');
  }
  const lockText = () => compiledLock ??= compile();
  const provisioningContract = (lock: string) => {
    const decoded = lock.replace(/\\"/g, '"');
    expect(decoded).toMatch(/"add_labels":\{[^}]*"create_if_missing":true/);
    expect(decoded).toMatch(/"add_labels":\{[^}]*"allowed":\["squad","squad:\*"\]/);
  };

  it('strict-compiles retained native label creation without inventing a create-label safe output', () => {
    expect(workflow).not.toContain('create-label:');
    provisioningContract(lockText());
  });
  it('still exposes native add_labels and create_issue for non-activation commands', () => {
    expect(lockText()).toMatch(/"tools":\[[^\]]*"add_labels"[^\]]*\]/);
    expect(lockText()).toMatch(/"tools":\[[^\]]*"create_issue"[^\]]*\]/);
  });
  it('keeps the agent job read-only even though the trusted write job can provision labels', () => {
    const compiled = lockText();
    const start = compiled.indexOf('\n  agent:\n');
    const end = compiled.indexOf('\n  safe_outputs:\n');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const permissions = compiled.slice(start, end).match(/permissions:\n((?:\s{6}\S.*\n)+)/)?.[1];
    expect(permissions).toContain('issues: read');
    expect(permissions).not.toContain('issues: write');
  });
  it('detects a realistic mutation disabling native missing-label provisioning', () => {
    const mutated = workflow.replace('create-if-missing: true', 'create-if-missing: false');
    expect(mutated).not.toBe(workflow);
    const mutatedLock = compile(mutated);
    expect(() => provisioningContract(mutatedLock)).toThrow();
  });
});
