import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { compileFunction, constants } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { createFirstInstallFixture } from './helpers/gh-aw-install-fixture.js';
import { diagnosticRuntime, fetchDiagnosticRuntime } from './helpers/gh-aw-diagnostic-runtime.js';
import {
  buildActivationBindings,
  correctDependencyReferences,
  createActivation,
  digest,
  finalizeActivation,
  frozenAssignments,
  prepareActivation,
  reconcileActivation,
  selectionEvidence,
  validateReceiptSet,
  verifyReconciliationRequest,
  verifyPublishedActivation,
} from '../workflows/shared/squad-activation.mjs';
import {
  parseStructuredData,
  collectHistoricalActivationRecords,
  selectActivationRecord as selectChecker,
  validateCastingPairFiles,
  main as checkBindings,
} from '../workflows/shared/check-agent-binding.mjs';
import { enforceSquadCommandContract } from '../workflows/shared/squad-command-contract.mjs';
import { selectActivationRecord as selectSdk } from '../packages/squad-sdk/src/casting/index.js';
import { selectActivationRecord as selectBuiltSdk } from '../packages/squad-sdk/dist/casting/index.js';

const repository = 'owner/repo';
const timestamp = '2026-01-01T00:00:00Z';
const bot = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };
const operator = { id: 700, login: 'operator', type: 'User' };
const directories: string[] = [];
const clone = <T>(value: T): T => structuredClone(value);
const block = (heading: string, value: unknown) => `${heading}:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
const jsonBlock = (body: string, heading: string) =>
  JSON.parse(body.split(`${heading}:\n\`\`\`json\n`)[1].split('\n```')[0]);
const envelope = (kind: string) => ({
  squad_artifact: kind, schema_version: '1', origin_issue: 42, phases: [],
});

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// API responses are copied: a later store mutation must not silently mutate a captured snapshot.
function fixture({ count = 2, epic = false } = {}) {
  const root = join(process.cwd(), `.activation-finalization-${randomUUID()}`);
  directories.push(root);
  mkdirSync(join(root, '.squad/casting'), { recursive: true });
  const registry = {
    schema: 'squad-agent-provenance/v1' as const, schema_version: 1 as const,
    revision: 1, generated_at: timestamp, transaction_id: 'fixture-generation',
    agents: {
      builder: {
        agent_id: 'builder', display_name: 'Builder', persistent_name: 'Builder',
        role: 'Engineer', universe: 'synthetic', status: 'active' as const,
        created_at: timestamp, updated_at: timestamp,
      },
    },
  };
  const history = {
    transaction_id: registry.transaction_id, registry_revision: registry.revision,
    assignment_cast_snapshots: {
      genesis: { created_at: timestamp, agents: ['builder'], universe: 'synthetic' },
    },
    universe_usage_history: [{ universe: 'synthetic', used_at: timestamp }],
  };
  const registryRaw = `${JSON.stringify(registry)}\n`;
  const historyRaw = `${JSON.stringify(history)}\n`;
  writeFileSync(join(root, '.squad/casting/registry.json'), registryRaw);
  writeFileSync(join(root, '.squad/casting/history.json'), historyRaw);
  writeFileSync(join(root, '.squad/casting/registry-history.commit.json'), JSON.stringify({
    transaction_id: registry.transaction_id, registry_revision: 1,
    registry_sha256: digest(registryRaw), history_sha256: digest(historyRaw),
  }));
  writeFileSync(join(root, '.squad/team.md'), [
    '# Synthetic team', '', '## Members', '| Name | Role |', '|------|------|',
    '| Builder | Engineer |', '',
  ].join('\n'));
  const outputPath = join(root, 'output.json');
  const capturePath = join(root, 'capture.json');
  const journalPath = join(root, 'receipts.json');
  writeFileSync(outputPath, JSON.stringify({ items: [{ type: 'activate_plan', plan_comment_id: '10' }] }));
  const context = {
    repo: { owner: 'owner', repo: 'repo' }, actor: operator.login,
    payload: {
      action: 'created', sender: clone(operator), issue: { number: 42, user: clone(operator) },
      comment: { id: 9, body: '/squad activate', user: clone(operator) },
    },
  };
  const env = {
    GITHUB_EVENT_NAME: 'issue_comment', GITHUB_RUN_ID: '900', GITHUB_RUN_ATTEMPT: '1',
    SQUAD_WORKFLOW_SHA: 'a'.repeat(40),
  };
  const planBody = [
    '# Example plan',
    epic ? '| # | Title | Agent | Agent ID | Depends On | Epic |' : '| # | Title | Owner | Agent ID | Depends On |',
    epic ? '|---|---|---|---|---|---|' : '|---|---|---|---|---|',
    ...Array.from({ length: count }, (_, i) =>
      `| ${i + 1} | ${i === 0 ? 'Prepare example inputs' : `Example task ${i + 1}`} | Builder | builder | ${i === 0 ? '—' : '1'} |${epic ? ' example |' : ''}`),
    '', block('Structured data', envelope(epic ? 'implementation' : 'plan')),
  ].join('\n');
  function comment(id: number, body: string, user = bot) {
    return {
      id, body, user: clone(user), created_at: timestamp, updated_at: timestamp,
      issue_url: `https://api.github.com/repos/${repository}/issues/42`,
      html_url: `https://github.com/${repository}/issues/42#issuecomment-${id}`,
    };
  }
  const comments = new Map<number, ReturnType<typeof comment>>([[10, comment(10, planBody)]]);
  if (epic) {
    comments.set(7, comment(7, block('Structured data', envelope('scope-accepted'))));
    comments.set(8, comment(8, block('Structured data', envelope('impl-accepted'))));
  }
  function issue(number: number, values: Record<string, any> = {}) {
    return {
      number, id: number + 1000, node_id: `I_example_${number}`, title: `Issue ${number}`,
      body: '', labels: [] as string[], assignees: [{ id: operator.id }],
      updated_at: timestamp, html_url: `https://github.com/${repository}/issues/${number}`,
      url: `https://api.github.com/repos/${repository}/issues/${number}`, ...values,
    };
  }
  const issues = new Map<number, ReturnType<typeof issue>>([[42, issue(42)]]);
  const parents = new Map<number, number>();
  const labels = new Set<string>();
  const permissions = new Map([[operator.login, 'admin']]);
  const writes: Array<{ method: string; params: any }> = [];
  const hooks: {
    result?: (result: any, index: number) => any;
    get?: (number: number, reads: number) => void;
    comment?: (body: string) => void;
    update?: (params: any) => void;
    pendingIdMissing?: boolean;
    parentStatus?: number;
    publicationResponse?: (value: any) => any;
  } = {};
  const reads = new Map<number, number>();
  let nextComment = 1000;
  let nextIssue = 101;
  const rest = {
    repos: {
      getCollaboratorPermissionLevel: vi.fn(async ({ username }: any) => ({
        data: { permission: permissions.get(username) ?? 'read' },
      })),
    },
    issues: {
      get: vi.fn(async ({ issue_number }: any) => {
        const seen = (reads.get(issue_number) ?? 0) + 1;
        reads.set(issue_number, seen);
        hooks.get?.(issue_number, seen);
        if (!issues.has(issue_number)) throw Object.assign(new Error('Not found'), { status: 404 });
        return { data: clone(issues.get(issue_number)!) };
      }),
      getComment: vi.fn(async ({ comment_id }: any) => ({ data: clone(comments.get(comment_id)!) })),
      listComments: vi.fn(async () => ({ data: clone([...comments.values()]) })),
      getParent: vi.fn(async ({ issue_number }: any) => {
        if (!parents.has(issue_number)) throw Object.assign(new Error('Parent unavailable'), { status: 404 });
        return { data: clone(issues.get(parents.get(issue_number)!)!) };
      }),
      getLabel: vi.fn(async ({ name }: any) => {
        if (!labels.has(name)) throw Object.assign(new Error('Missing label'), { status: 404 });
        return { data: { name } };
      }),
      createLabel: vi.fn(async (params: any) => {
        writes.push({ method: 'createLabel', params: clone(params) });
        labels.add(params.name);
        return { data: { name: params.name } };
      }),
      createComment: vi.fn(async (params: any) => {
        writes.push({ method: 'createComment', params: clone(params) });
        hooks.comment?.(params.body);
        const created = comment(nextComment++, params.body);
        comments.set(created.id, created);
        if (params.body.includes('Activation bindings:') && hooks.publicationResponse) {
          return { data: hooks.publicationResponse(clone(created)) };
        }
        return { data: hooks.pendingIdMissing && params.body.includes('squad-activation-pending/v1')
          ? { ...clone(created), id: undefined } : clone(created) };
      }),
      updateComment: vi.fn(async (params: any) => {
        writes.push({ method: 'updateComment', params: clone(params) });
        hooks.comment?.(params.body);
        const current = comments.get(params.comment_id)!;
        current.body = params.body;
        return { data: clone(current) };
      }),
      update: vi.fn(async (params: any) => {
        writes.push({ method: 'update', params: clone(params) });
        hooks.update?.(params);
        Object.assign(issues.get(params.issue_number)!, { body: params.body, updated_at: '2026-01-02T00:00:00Z' });
        return { data: clone(issues.get(params.issue_number)!) };
      }),
      addSubIssue: vi.fn(async (params: any) => {
        writes.push({ method: 'addSubIssue', params: clone(params) });
        if (hooks.parentStatus) throw Object.assign(new Error('Parent link failed'), { status: hooks.parentStatus });
        const child = [...issues.values()].find(item => item.id === params.sub_issue_id)!;
        parents.set(child.number, params.issue_number);
        return { data: clone(child) };
      }),
    },
  };
  const github = { rest, paginate: vi.fn(async (method: any, params: any) => (await method(params)).data) };
  const createIssue = vi.fn(async (params: any) => {
    const saved = JSON.parse(readFileSync(journalPath, 'utf8'));
    const pending = comments.get(saved.pending_comment_id);
    expect(pending?.body, 'every issue create must follow a durable reservation').toContain('squad-activation-pending/v1');
    expect(saved.pending_comment_id).toBe(pending!.id);
    expect(saved.started).toHaveLength(saved.receipts.length + 1);
    expect(saved.started.at(-1)).toMatch(/^(task|epic):/);
    writes.push({ method: 'createIssue', params: clone(params) });
    const created = issue(nextIssue++, params);
    issues.set(created.number, created);
    const result = { staged: false, issue: clone(created) };
    return hooks.result ? hooks.result(result, createIssue.mock.calls.length) : result;
  });
  const prepare = () => prepareActivation({ github, context, env, root, outputPath, capturePath });
  const create = (capture: any, captureArtifactId: any = 800) => createActivation({
    github, context, env, root, capture, captureArtifactId, journalPath, createIssue,
    sanitizeContent: (value: string) => value, formatIssueBody: (value: string) => value,
  });
  const finalize = (capture: any, journal: any, receiptArtifactId: any = 801) =>
    finalizeActivation({ github, context, env, root, capture, journal, receiptArtifactId });
  const accepted = () => [...comments.values()].filter(item =>
    ['plan-accepted', 'activated', 'activation-reconciled'].includes(parseStructuredData(item.body)?.squad_artifact));
  return {
    root, registry, outputPath, capturePath, journalPath, context, env, comments, issues, parents,
    permissions, writes, hooks, github, createIssue, comment, issue, prepare, create, finalize, accepted,
  };
}

async function legacyFixture(epic = false) {
  const f = fixture({ epic });
  const capture = await f.prepare();
  const journal = await f.create(capture);
  const bindings = buildActivationBindings(capture, journal);
  const original = f.comment(99, [
    block('Activation bindings', bindings),
    block('Structured data', envelope(epic ? 'activated' : 'plan-accepted')),
  ].join('\n'));
  f.comments.delete(journal.pending_comment_id);
  f.comments.set(original.id, original);
  f.writes.length = 0;
  f.createIssue.mockClear();
  return { ...f, original, bindings, capture };
}

describe('authenticated legacy activation promotion', () => {
  it.each([false, true])('promotes a legacy record only with independently matching issue sources (epic=%s)', async epic => {
    const f = await legacyFixture(epic);
    const original = clone(f.original);
    expect(f.original.body).not.toContain('Activation evidence:');
    expect(await f.prepare()).toEqual({ existingAcceptanceId: 99 });
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].params.body).toContain('**State:** Activated');
    expect(f.comments.get(99)).toEqual(original);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps demonstrably bound legacy phases partial (shared epic=%s)', async sharedEpic => {
    const f = phasedFixture(sharedEpic);
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    const original = f.latest();
    original.body = original.body.replace(/Activation evidence:\s*```json\s*[\s\S]*?```/, '');
    const preserved = clone(original);
    f.writes.length = 0;
    f.createIssue.mockClear();
    expect(await f.prepare()).toEqual({ existingAcceptanceId: original.id });
    expect(f.comments.get(original.id)).toEqual(preserved);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
    f.context.payload.comment.body = sharedEpic ? '/squad plan activate' : '/squad activate';
    await expect(f.prepare()).rejects.toThrow(/only prior phases are accepted/);
    expect(f.writes).toEqual([]);
  });

  it('rejects the read-only outsider single-binding forgery for an unrelated labelled issue', async () => {
    const f = await legacyFixture();
    const binding = { ...f.bindings[0], issue: '#201' };
    f.issues.set(201, f.issue(201, { labels: ['squad', 'squad:builder'] }));
    f.original.user = { id: 701, login: 'outsider', type: 'User' };
    f.original.body = [block('Activation bindings', [binding]), block('Structured data', envelope('plan-accepted'))].join('\n');
    const original = clone(f.original);
    await expect(f.prepare()).rejects.toThrow(/workflow-bot.*reconciliation/);
    expect(f.permissions.get('outsider')).toBeUndefined();
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.comments.get(99)).toEqual(original);
  });

  it.each([
    'missing-stable-id', 'wrong-stable-id', 'missing-source-hash', 'wrong-owner', 'wrong-dependencies',
    'wrong-parent', 'wrong-api-parent', 'partial-task-set', 'wrong-binding-dependencies', 'unknown-phase',
    'wrong-artifact', 'wrong-plan-author', 'wrong-plan-origin', 'wrong-record-origin', 'wrong-bot-login',
    'wrong-bot-type', 'unrelated-labelled-issues',
  ])('requires reconciliation without writes for legacy %s', async mutation => {
    const f = await legacyFixture();
    const issue = f.issues.get(102)!;
    if (mutation === 'missing-stable-id') issue.body = issue.body.replace('**Stable work ID:** task:2\n', '');
    if (mutation === 'wrong-stable-id') issue.body = issue.body.replace('task:2', 'task:unrelated');
    if (mutation === 'missing-source-hash') issue.body = issue.body.replace(/^Plan SHA-256:.*\n/m, '');
    if (mutation === 'wrong-owner') issue.body = issue.body.replace('**Owner:** Builder', '**Owner:** Outsider');
    if (mutation === 'wrong-dependencies') issue.body = issue.body.replace('**Depends On:** #101', '**Depends On:** None');
    if (mutation === 'wrong-parent') issue.body = issue.body.replace('**Parent:** #42', '**Parent:** #43');
    if (mutation === 'wrong-api-parent') { f.parents.set(102, 43); f.issues.set(43, f.issue(43)); }
    if (mutation === 'partial-task-set') f.original.body = f.original.body.replace(JSON.stringify(f.bindings), JSON.stringify(f.bindings.slice(0, 1)));
    if (mutation === 'wrong-binding-dependencies') f.original.body = f.original.body.replace('"depends_on":["#101"]', '"depends_on":[]');
    if (mutation === 'unknown-phase') f.original.body = f.original.body.replace('"phases":[]', '"phases":[99]');
    if (mutation === 'wrong-artifact') f.original.body = f.original.body.replaceAll('plan-accepted', 'activated');
    if (mutation === 'wrong-plan-author') f.comments.get(10)!.user = clone(operator);
    if (mutation === 'wrong-plan-origin') f.comments.get(10)!.issue_url = 'https://api.github.com/repos/owner/repo/issues/43';
    if (mutation === 'wrong-record-origin') f.original.issue_url = 'https://api.github.com/repos/owner/repo/issues/43';
    if (mutation === 'wrong-bot-login') f.original.user.login = 'different[bot]';
    if (mutation === 'wrong-bot-type') f.original.user.type = 'User';
    if (mutation === 'unrelated-labelled-issues') for (const issue of f.issues.values()) issue.body = '';
    const original = clone(f.original);
    await expect(f.prepare()).rejects.toThrow(/reconciliation|hierarchy/);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.comments.get(99)).toEqual(original);
  });
});

describe('retry-safe activation preflight', () => {
  it('requires the pinned formatter instead of falling back to an unattributed body bound', async () => {
    const f = fixture();
    const capture = await f.prepare();
    await expect(createActivation({
      github: f.github, context: f.context, env: f.env, root: f.root, capture,
      captureArtifactId: 800, journalPath: f.journalPath, createIssue: f.createIssue,
      sanitizeContent: (body: string) => body,
    })).rejects.toThrow(/formatter is required before reservation/);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it('rejects short-line expansion before any durable reservation or issue create', async () => {
    const f = fixture();
    f.comments.get(10)!.body += '\n'.repeat(33000);
    expect(Buffer.byteLength(f.comments.get(10)!.body)).toBeLessThan(35000);
    const capture = await f.prepare();
    await expect(f.create(capture)).rejects.toThrow(/rendered issue body exceeds/);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it('includes sanitizer expansion and worst-case dependency reference widths in preflight', async () => {
    const f = fixture({ epic: true });
    const capture = await f.prepare();
    const seen: string[] = [];
    await expect(createActivation({
      github: f.github, context: f.context, env: f.env, root: f.root, capture,
      captureArtifactId: 800, journalPath: f.journalPath, createIssue: f.createIssue,
      formatIssueBody: (body: string) => body,
      sanitizeContent: (body: string) => {
        seen.push(body);
        return body.includes('**Depends On:** #') ? body + 'x'.repeat(65536) : body;
      },
    })).rejects.toThrow(/rendered issue body exceeds/);
    expect(seen.some(body => body.includes(`**Parent:** #${Number.MAX_SAFE_INTEGER}`))).toBe(true);
    expect(seen.some(body => body.includes(`**Depends On:** #${Number.MAX_SAFE_INTEGER}`))).toBe(true);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it.each([65535, 65536, 65537])('bounds the exact rendered %i-code-unit body including Unicode', async size => {
    const baseline = fixture({ count: 1 });
    await baseline.create(await baseline.prepare());
    const baselineBody = baseline.writes.find(write => write.method === 'createIssue')!.params.body;
    const extra = size - baselineBody.length;
    const f = fixture({ count: 1 });
    f.comments.get(10)!.body += '\n'.repeat(Math.floor((extra - 2) / 3)) + '😀' + 'x'.repeat((extra - 2) % 3);
    expect(Buffer.byteLength(f.comments.get(10)!.body)).toBeLessThan(35000);
    const capture = await f.prepare();
    if (size > 65536) {
      await expect(f.create(capture)).rejects.toThrow(/rendered issue body exceeds/);
      expect(f.writes).toEqual([]);
      expect(f.createIssue).not.toHaveBeenCalled();
    } else {
      const journal = await f.create(capture);
      expect(f.writes.find(write => write.method === 'createIssue')!.params.body).toHaveLength(size);
      await f.finalize(capture, journal);
      expect(f.createIssue).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ['getLabel', 403], ['getLabel', 500], ['createLabel', 403], ['createLabel', 500],
  ] as const)('permits a clean retry after prerequisite %s fails with %i', async (method, status) => {
    const f = fixture();
    const capture = await f.prepare();
    f.github.rest.issues[method].mockRejectedValueOnce(Object.assign(new Error('pre-create failure'), { status }));
    await expect(f.create(capture)).rejects.toThrow('pre-create failure');
    expect(f.createIssue).not.toHaveBeenCalled();
    expect([...f.comments.values()].some(comment => comment.body.includes('squad-activation-pending/v1'))).toBe(false);
    const retry = await f.prepare();
    const journal = await f.create(retry);
    await f.finalize(retry, journal);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(f.accepted()).toHaveLength(1);
  });

  it('reuses a provisioned label after its response is lost without reserving early', async () => {
    const f = fixture();
    const provision = f.github.rest.issues.createLabel.getMockImplementation()!;
    f.github.rest.issues.createLabel.mockImplementationOnce(async params => {
      await provision(params);
      throw Object.assign(new Error('label response lost'), { status: 500 });
    });
    await expect(f.create(await f.prepare())).rejects.toThrow('label response lost');
    expect(f.createIssue).not.toHaveBeenCalled();
    expect([...f.comments.values()].some(comment => comment.body.includes('squad-activation-pending/v1'))).toBe(false);
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    expect(f.writes.filter(write => write.method === 'createLabel' && write.params.name === 'squad')).toHaveLength(1);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });

  it('rechecks reservation admission after retry-safe prerequisites', async () => {
    const f = fixture();
    const capture = await f.prepare();
    const provision = f.github.rest.issues.createLabel.getMockImplementation()!;
    f.github.rest.issues.createLabel.mockImplementationOnce(async params => {
      const result = await provision(params);
      f.comments.set(98, f.comment(98, 'squad-activation-pending/v1'));
      return result;
    });
    await expect(f.create(capture)).rejects.toThrow(/reserved or accepted during preflight/);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.writes.every(write => write.method === 'createLabel')).toBe(true);
  });

  it('retains the no-create guard when an issue is stored but its create response fails', async () => {
    const f = fixture();
    const capture = await f.prepare();
    f.hooks.result = () => { throw Object.assign(new Error('response lost'), { status: 500 }); };
    await expect(f.create(capture)).rejects.toThrow('response lost');
    expect(f.issues.has(101)).toBe(true);
    expect(f.createIssue).toHaveBeenCalledTimes(1);
    await expect(f.prepare()).rejects.toThrow(/pending activation/);
    await expect(f.create(capture)).rejects.toThrow(/reserved/);
    expect(f.createIssue).toHaveBeenCalledTimes(1);
  });
});

function recovery(options: { count?: number; epic?: boolean } = {}) {
  const f = fixture(options);
  const original = f.comment(20, [
    '## Original invalid activation — preserve verbatim',
    block('Activation bindings', [{ task: '1', issue: 'aw_wi1', agent: 'Builder', epic_issue: '#42' }]),
    block('Structured data', envelope(options.epic ? 'activated' : 'plan-accepted')),
  ].join('\n'));
  f.comments.set(original.id, original);
  const count = options.count ?? 2;
  for (let i = 1; i <= count; i++) {
    f.issues.set(100 + i, f.issue(100 + i, {
      title: i === 1 ? 'Prepare example inputs' : `Example task ${i}`,
      labels: ['squad', 'squad:builder'], body: [
        `# Example task ${i}`, '**Owner:** Builder',
        `**Parent:** #${options.epic ? 201 : 42}`,
        i === 1 ? '**Depends On:** — (none)' : '**Depends On:** Task 1 (`aw_wi1`) — Prepare example inputs',
        '', 'Keep this prose and `aw_wi1` example untouched.', '',
      ].join('\n'),
    }));
    f.parents.set(100 + i, options.epic ? 201 : 42);
  }
  if (options.epic) {
    f.issues.set(201, f.issue(201, { title: '[Epic] example', body: 'Keep epic bytes.', labels: ['squad', 'squad:builder'] }));
    f.parents.set(201, 42);
  }
  const request = {
    schema: 'squad-activation-reconciliation-request/v1', repository, origin_issue: 42,
    original: { comment_id: 20, sha256: digest(original.body) },
    plan: { comment_id: 10, sha256: digest(f.comments.get(10)!.body) },
    registry: { revision: f.registry.revision, sha256: digest(f.registry) },
    tasks: Array.from({ length: count }, (_, i) => ({ task: String(i + 1), issue: 101 + i, temporary_id: `aw_wi${i + 1}` })),
    epics: options.epic ? [{ epic: 'example', issue: 201 }] : [],
  };
  function approve() {
    const body = block('Activation reconciliation request', request);
    f.comments.set(30, f.comment(30, body, operator));
    f.context.payload.comment.body = `/squad reconcile activation 30 ${digest(body)}`;
  }
  approve();
  const verify = () => verifyReconciliationRequest({
    github: f.github, context: f.context, root: f.root,
    requestCommentId: 30, requestSha256: f.context.payload.comment.body.split(' ').at(-1),
  });
  const reconcile = () => reconcileActivation({ github: f.github, context: f.context, env: f.env, root: f.root });
  return { ...f, original, request, approve, verify, reconcile };
}

const commonIdentity = (selected: any) => selected && ({
  id: selected.id, artifact: selected.artifact,
  bindings: selected.bindings.map((binding: any) => Object.fromEntries([
    'binding_schema', 'binding_version', 'producer', 'repository', 'origin_issue', 'artifact',
    'registry_schema', 'registry_revision', 'task', 'issue', 'epic', 'epic_issue', 'agent_id', 'epic_agent_ids',
  ].map(key => [key, binding[key]]))),
});

describe('trusted whole-plan activation finalization', () => {
  it.each([false, true])('captures actual IDs and immutable evidence (separate epic: %s)', async epic => {
    const f = fixture({ epic });
    expect(await validateCastingPairFiles(join(f.root, '.squad/casting/registry.json'))).toEqual(f.registry);
    const originalComments = clone([...f.comments.entries()]);
    const originalRoot = clone(f.issues.get(42));
    const capture = await f.prepare();
    const capturedBytes = readFileSync(f.capturePath, 'utf8');
    expect(JSON.parse(capturedBytes)).toEqual(capture);
    expect(capture).toMatchObject({
      schema: 'squad-activation-capture/v1', repository, origin_issue: 42,
      run_id: 900, run_attempt: 1, phase: null, registry_sha256: digest(f.registry),
    });
    const journal = await f.create(capture);
    const journalBytes = readFileSync(f.journalPath, 'utf8');
    const evidence = await f.finalize(capture, journal);
    const taskStart = epic ? 102 : 101;
    const expectedBindings = ['1', '2'].map((task, index) => ({
      binding_schema: 'squad-work-agent-binding/v1', binding_version: 1, producer: 'squad',
      repository, origin_issue: 42, artifact: epic ? 'activated' : 'plan-accepted',
      registry_schema: 'squad-agent-provenance/v1', registry_revision: 1,
      task, issue: `#${taskStart + index}`, epic: epic ? 'example' : 'origin',
      epic_issue: epic ? '#101' : '#42', agent: 'Builder', agent_id: 'builder',
      epic_agents: ['builder'], epic_agent_ids: ['builder'], label: 'squad:builder',
      epic_label: epic ? 'squad:builder' : null,
      ...(!epic ? { epic_omission_reason: 'origin' } : {}),
      depends_on: index === 0 ? [] : [`#${taskStart}`],
    }));
    const acceptance = f.accepted();
    expect(acceptance).toHaveLength(1);
    expect(jsonBlock(acceptance[0].body, 'Activation bindings')).toEqual(expectedBindings);
    expect(jsonBlock(acceptance[0].body, 'Structured data')).toEqual(envelope(epic ? 'activated' : 'plan-accepted'));
    expect(buildActivationBindings(capture, journal)).toEqual(expectedBindings);
    expect(evidence).toEqual({
      schema: 'squad-activation-finalization/v1', basis: 'current-trusted-execution',
      run_id: 900, run_attempt: 1, workflow_sha: 'a'.repeat(40),
      capture_sha256: digest(capture), receipts_sha256: digest(journal),
      capture_artifact_id: 800, receipts_artifact_id: 801, pending_comment_id: journal.pending_comment_id,
      parent_fallbacks: [],
      plan_comment_id: 10, plan_sha256: digest(f.comments.get(10)!.body), registry_sha256: digest(f.registry),
    });
    expect(jsonBlock(acceptance[0].body, 'Activation evidence')).toEqual(evidence);
    expect(f.issues.get(taskStart + 1)!.body).toContain(`**Depends On:** #${taskStart}\n`);
    expect(f.issues.get(taskStart)!.body).toContain('**Depends On:** None\n');
    expect(f.parents.get(taskStart + 1)).toBe(epic ? 101 : 42);
    expect(journal.receipts.map((receipt: any) => [receipt.number, receipt.id, receipt.node_id]))
      .toEqual(Array.from({ length: epic ? 3 : 2 }, (_, i) => [101 + i, 1101 + i, `I_example_${101 + i}`]));
    const reservation = f.writes.findIndex(write => write.params.body?.includes('squad-activation-pending/v1'));
    expect(reservation).toBeGreaterThanOrEqual(0);
    expect(reservation).toBeLessThan(f.writes.findIndex(write => write.method === 'createIssue'));
    expect(f.issues.get(42)).toEqual(originalRoot);
    for (const [id, comment] of originalComments) expect(f.comments.get(id)).toEqual(comment);
    expect(readFileSync(f.capturePath, 'utf8')).toBe(capturedBytes);
    expect(readFileSync(f.journalPath, 'utf8')).toBe(journalBytes);
    const selectionContext = { repository, originIssue: 42, reconciliations: [] };
    expect(commonIdentity(selectSdk(acceptance, f.registry, selectionContext)))
      .toEqual(commonIdentity(selectChecker(acceptance, f.registry, selectionContext)));
    expect(await f.prepare()).toEqual({ existingAcceptanceId: acceptance[0].id });
    expect(f.createIssue).toHaveBeenCalledTimes(epic ? 3 : 2);
  });

  it.each([
    ['missing number', (r: any) => { delete r.issue.number; }],
    ['missing database ID', (r: any) => { delete r.issue.id; }],
    ['missing node ID', (r: any) => { delete r.issue.node_id; }],
    ['mismatched URL', (r: any) => { r.issue.html_url = `https://github.com/${repository}/issues/999`; }],
    ['cross-repository URL', (r: any) => { r.issue.url = 'https://api.github.com/repos/other/repo/issues/101'; }],
    ['staged result', (r: any) => { r.staged = true; }],
    ['pull request result', (r: any) => { r.issue.pull_request = {}; }],
  ])('withholds acceptance after %s and refuses to recreate', async (_name, mutate) => {
    const f = fixture();
    const capture = await f.prepare();
    f.hooks.result = result => { mutate(result); return result; };
    await expect(f.create(capture)).rejects.toThrow(/actual issue|identit|repository|URL/);
    expect(f.createIssue).toHaveBeenCalledTimes(1);
    expect(f.issues.has(101)).toBe(true);
    expect(f.accepted()).toEqual([]);
    const journal = JSON.parse(readFileSync(f.journalPath, 'utf8'));
    expect(journal.started).toEqual(['task:1']);
    expect(journal.receipts).toEqual([]);
    await expect(f.finalize(capture, journal)).rejects.toThrow();
    await expect(f.create(capture)).rejects.toThrow(/reserved|recreated/);
    await expect(f.prepare()).rejects.toThrow(/pending|No-create/);
    expect(f.createIssue).toHaveBeenCalledTimes(1);
  });

  it.each(['number', 'id', 'node_id'])('rejects duplicate real %s on the second create', async field => {
    const f = fixture();
    const capture = await f.prepare();
    f.hooks.result = (result, index) => {
      if (index === 2) {
        result.issue[field] = f.issues.get(101)![field as keyof ReturnType<typeof f.issue>];
        if (field === 'number') {
          result.issue.html_url = f.issues.get(101)!.html_url;
          result.issue.url = f.issues.get(101)!.url;
        }
      }
      return result;
    };
    await expect(f.create(capture)).rejects.toThrow(/duplicate/);
    const journal = JSON.parse(readFileSync(f.journalPath, 'utf8'));
    expect(journal.started).toEqual(['task:1', 'task:2']);
    expect(journal.receipts).toHaveLength(1);
    await expect(f.finalize(capture, journal)).rejects.toThrow(/receipts are missing/);
    await expect(f.create(capture)).rejects.toThrow(/reserved/);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(f.accepted()).toEqual([]);
  });

  it('keeps a durable partial journal when creation succeeds remotely but its response is lost', async () => {
    const f = fixture();
    const capture = await f.prepare();
    f.hooks.result = (result, index) => {
      if (index === 2) throw new Error('connection lost after remote create');
      return result;
    };
    await expect(f.create(capture)).rejects.toThrow('connection lost after remote create');
    expect(f.issues.has(102)).toBe(true);
    const journal = JSON.parse(readFileSync(f.journalPath, 'utf8'));
    expect(journal.receipts).toHaveLength(1);
    expect(journal.started).toHaveLength(2);
    await expect(f.finalize(capture, journal)).rejects.toThrow(/receipts are missing/);
    await expect(f.prepare()).rejects.toThrow(/pending/);
    await expect(f.create(capture)).rejects.toThrow(/reserved/);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(f.accepted()).toEqual([]);
  });

  it.each([undefined, 0, -1, '800'])('never writes without a durable numeric capture artifact ID: %s', async id => {
    const f = fixture();
    const capture = await f.prepare();
    await expect(createActivation({
      github: f.github, context: f.context, capture, captureArtifactId: id,
      journalPath: f.journalPath, createIssue: f.createIssue, sanitizeContent: (text: string) => text,
      formatIssueBody: (body: string) => body,
    })).rejects.toThrow(/durable capture artifact/);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it('refuses an unacknowledged pending comment without creating any issues', async () => {
    const f = fixture();
    const capture = await f.prepare();
    f.hooks.pendingIdMissing = true;
    await expect(f.create(capture)).rejects.toThrow(/reservation identity/);
    await expect(f.prepare()).rejects.toThrow(/pending/);
    await expect(f.create(capture)).rejects.toThrow(/reserved/);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.accepted()).toEqual([]);
  });

  it.each([
    ['missing receipt upload', (f: any, _c: any, _j: any) => {}, 0, /receipt artifact upload/],
    ['changed dependencies', (f: any) => { f.issues.get(102).body = f.issues.get(102).body.replace('**Depends On:** #101', '**Depends On:** #999'); }, 801, /references differ/],
    ['changed labels', (f: any) => { f.issues.get(102).labels = ['squad', 'squad:other']; }, 801, /expected squad:builder, found squad:other/],
    ['changed actual identity', (f: any) => { f.issues.get(102).id++; }, 801, /identity differs/],
    ['changed API hierarchy', (f: any) => { f.parents.set(102, 101); }, 801, /API hierarchy/],
    ['changed plan', (f: any) => { f.comments.get(10).body += '\nChanged after create'; }, 801, /plan changed/],
    ['changed reservation', (f: any, _c: any, j: any) => { f.comments.get(j.pending_comment_id).body += '\nChanged'; }, 801, /reservation changed/],
    ['unresolved reference', (f: any) => { f.issues.get(102).body += '\n**Depends On:** `aw_wi1`'; }, 801, /references differ/],
  ])('withholds finalization for %s; retry cannot create', async (_name, mutate, receiptId, reason) => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    (mutate as Function)(f, capture, journal);
    await expect(f.finalize(capture, journal, receiptId)).rejects.toThrow(reason as RegExp);
    expect(f.accepted()).toEqual([]);
    await expect(f.create(capture)).rejects.toThrow(/reserved/);
    await expect(f.prepare()).rejects.toThrow(/pending/);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });

  it('checks plan changes before creating a reservation or issue', async () => {
    const f = fixture();
    const capture = await f.prepare();
    f.comments.get(10)!.body += '\nChanged before create';
    await expect(f.create(capture)).rejects.toThrow(/plan changed after capture/);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it.each([404, 422])('records parent body fallback for native API status %s', async status => {
    const f = fixture();
    f.hooks.parentStatus = status;
    const capture = await f.prepare();
    const journal = await f.create(capture);
    expect(journal.parent_fallbacks).toEqual(['task:1', 'task:2']);
    await f.finalize(capture, journal);
    expect(f.accepted()[0].body).toContain('parent body references are the recorded fallback');
    expect(f.issues.get(102)!.body).toContain('**Parent:** #42');
  });
});

describe('trusted lifecycle recovery and pre-write validation', () => {
  it('keeps reference-only temporary tokens and identity-looking plan prose out of operational fields', async () => {
    const f = fixture();
    f.comments.get(10)!.body += '\n\nExample of a broken dependency: `aw_wi1`\n**Depends On:** example only';
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    expect(f.issues.get(102)!.body).toContain('> **Depends On:** example only');
    expect(f.issues.get(102)!.body).toContain('**Depends On:** #101');
    expect(f.accepted()).toHaveLength(1);
    await expect(verifyPublishedActivation({
      github: f.github, context: f.context, root: f.root, comment: f.accepted()[0],
    })).resolves.toBeDefined();
  });

  it.each(['', ' '.repeat(3), 'x'.repeat(257)])('rejects unusable sanitized titles before any write: %j', async title => {
    const f = fixture();
    const capture = await f.prepare();
    await expect(createActivation({
      github: f.github, context: f.context, env: f.env, root: f.root, capture,
      captureArtifactId: 800, journalPath: f.journalPath, createIssue: f.createIssue,
      sanitizeContent: () => title,
      formatIssueBody: (body: string) => body,
    })).rejects.toThrow(/sanitized title/);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it('repairs a post-acceptance lifecycle interruption without duplicate acceptance or issues', async () => {
    const f = fixture();
    const tracker = f.comment(19, `## Squad lifecycle\n**State:** Planned\n${block('Structured data', envelope('lifecycle-state'))}`);
    f.comments.set(tracker.id, tracker);
    const capture = await f.prepare();
    const journal = await f.create(capture);
    f.hooks.comment = body => { if (body.startsWith('## Squad lifecycle')) throw new Error('lifecycle write interrupted'); };
    await expect(f.finalize(capture, journal)).rejects.toThrow('lifecycle write interrupted');
    expect(f.accepted()).toHaveLength(1);
    const acceptedId = f.accepted()[0].id;
    f.hooks.comment = undefined;
    expect(await f.prepare()).toEqual({ existingAcceptanceId: acceptedId });
    expect(f.comments.get(tracker.id)!.body).toContain('**Activation:** ✅ Done');
    expect(f.comments.get(tracker.id)!.body).toContain('**Last command:** `/squad activate`\n');
    expect(f.accepted()).toHaveLength(1);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    const writes = f.writes.length;
    await f.prepare();
    expect(f.writes).toHaveLength(writes);
  });

  it('rechecks current dependencies before repairing the lifecycle on an idempotent rerun', async () => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    f.issues.get(102)!.body += '\n**Depends On:** #999';
    const writes = f.writes.length;
    await expect(f.prepare()).rejects.toThrow(/current issue content/);
    expect(f.writes).toHaveLength(writes);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });

  it.each([7, 8])('rechecks frozen granular approval %s before creation', async id => {
    const f = fixture({ epic: true });
    const capture = await f.prepare();
    f.comments.get(id)!.body += '\nChanged approval';
    await expect(f.create(capture)).rejects.toThrow(/acceptance.*changed/);
    expect(f.writes).toEqual([]);
  });

  it.each(['request', 'plan', 'permission'])('stops a correction when %s changes during its durable intent write', async target => {
    const f = recovery();
    f.hooks.comment = body => {
      if (!body.startsWith('Dependency correction attempt')) return;
      if (target === 'permission') f.permissions.set(operator.login, 'read');
      else f.comments.get(target === 'request' ? 30 : 10)!.body += '\nChanged';
    };
    await expect(f.reconcile()).rejects.toThrow(/changed before|lost correction permission/);
    expect(f.github.rest.issues.update).not.toHaveBeenCalled();
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.comments.get(20)).toEqual(f.original);
  });
});

describe('actual receipt set integrity', () => {
  it.each([
    ['wrong schema', (j: any) => { j.schema = 'other/v1'; }],
    ['wrong capture hash', (j: any) => { j.capture_sha256 = '0'.repeat(64); }],
    ['wrong repository', (j: any) => { j.repository = 'other/repo'; }],
    ['wrong run', (j: any) => { j.run_id++; }],
    ['wrong attempt', (j: any) => { j.run_attempt++; }],
    ['duplicate started operation', (j: any) => { j.started[1] = j.started[0]; }],
    ['out-of-order operations', (j: any) => { j.started.reverse(); }],
    ['partial operation set', (j: any) => { j.started.pop(); }],
    ['partial receipts', (j: any) => { j.receipts.pop(); }],
    ['duplicate receipt operation', (j: any) => { j.receipts[1].operation_id = j.receipts[0].operation_id; }],
    ['receipt repository mismatch', (j: any) => { j.receipts[1].repository = 'other/repo'; }],
    ['issue-number collision', (j: any) => { j.receipts[1].number = j.receipts[0].number; j.receipts[1].url = j.receipts[0].url; }],
    ['database-ID collision', (j: any) => { j.receipts[1].id = j.receipts[0].id; }],
    ['node-ID collision', (j: any) => { j.receipts[1].node_id = j.receipts[0].node_id; }],
    ['missing database ID', (j: any) => { delete j.receipts[1].id; }],
  ])('rejects %s without publishing', async (_name, mutate) => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    expect([...validateReceiptSet(capture, journal).keys()]).toEqual(['task:1', 'task:2']);
    const bad = clone(journal);
    mutate(bad);
    expect(() => validateReceiptSet(capture, bad)).toThrow();
    await expect(f.finalize(capture, bad)).rejects.toThrow();
    expect(f.accepted()).toEqual([]);
  });
});

describe('operator-authorized current-state reconciliation', () => {
  it.each(['write', 'maintain', 'admin'])('repairs only authorized dependency tokens for %s and is idempotent', async permission => {
    const f = recovery({ epic: true });
    f.permissions.set(operator.login, permission);
    const beforeIssues = clone([...f.issues.entries()]);
    const beforeComments = clone([...f.comments.entries()]);
    const beforeParents = clone([...f.parents.entries()]);
    const verified = await f.verify();
    expect(f.writes).toEqual([]);
    const result = await f.reconcile();
    const record = jsonBlock(result.body, 'Activation reconciliation');
    expect(record).toEqual({
      schema: 'squad-activation-reconciliation/v1', basis: 'current-state-authorized',
      request_comment_id: 30, request_sha256: digest(f.comments.get(30)!.body), actor_id: operator.id,
      supersedes_comment_id: 20, supersedes_sha256: digest(f.original.body),
      plan_sha256: digest(f.comments.get(10)!.body), registry_sha256: digest(f.registry),
      bindings_sha256: digest(verified.bindings),
    });
    expect(jsonBlock(result.body, 'Structured data')).toEqual(envelope('activation-reconciled'));
    expect(jsonBlock(result.body, 'Activation bindings')).toEqual(verified.bindings);
    for (const [number, before] of beforeIssues) {
      const after = f.issues.get(number)!;
      const expectedBody = number === 102
        ? before.body.replace('**Depends On:** Task 1 (`aw_wi1`)', '**Depends On:** Task 1 (`#101`)')
        : before.body;
      expect(after).toEqual({ ...before, body: expectedBody, updated_at: number === 102 ? '2026-01-02T00:00:00Z' : before.updated_at });
    }
    for (const [id, before] of beforeComments) expect(f.comments.get(id)).toEqual(before);
    expect([...f.parents.entries()]).toEqual(beforeParents);
    expect(f.github.rest.issues.update).toHaveBeenCalledExactlyOnceWith({
      owner: 'owner', repo: 'repo', issue_number: 102, body: f.issues.get(102)!.body,
    });
    expect(f.writes.map(write => write.method)).toEqual(['createComment', 'update', 'createComment', 'createComment']);
    expect(f.createIssue).not.toHaveBeenCalled();
    const records = [f.original, result];
    const selectionContext = { repository, originIssue: 42, reconciliations: [selectionEvidence(await f.verify())] };
    const sdk = selectSdk(records, f.registry, selectionContext);
    const checker = selectChecker(records, f.registry, selectionContext);
    expect(commonIdentity(sdk)).toEqual(commonIdentity(checker));
    expect(sdk?.id).toBe(result.id);
    expect(sdk?.bindings.map(binding => [binding.task, binding.issue, binding.epic_issue]))
      .toEqual([['1', '#101', '#201'], ['2', '#102', '#201']]);
    const writeCount = f.writes.length;
    expect(await f.reconcile()).toEqual({ id: result.id, unchanged: true });
    expect(f.writes).toHaveLength(writeCount);
    f.context.payload.comment.body = '/squad activate';
    expect(await f.prepare()).toEqual({ existingAcceptanceId: result.id });
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it.each([
    ['changed request digest', (f: any) => { f.comments.get(30).body += ' '; }, /digest changed/],
    ['bot request author', (f: any) => { f.comments.get(30).user = bot; }, /operator account/],
    ['request author lacks permission', (f: any) => { f.comments.get(30).user = { id: 701, login: 'reader', type: 'User' }; }, /author is not authorized/],
    ['command actor lacks permission', (f: any) => { f.permissions.set(operator.login, 'read'); }, /require write|refused mutating/],
    ['stale original', (f: any) => { f.comments.get(20).body += '\nchanged'; }, /content changed/],
    ['stale plan', (f: any) => { f.comments.get(10).body += '\nchanged'; }, /content changed/],
    ['newer plan', (f: any) => { f.comments.set(11, f.comment(11, f.comments.get(10).body)); }, /no longer the current plan/],
    ['stale registry hash', (f: any) => { f.request.registry.sha256 = '0'.repeat(64); f.approve(); }, /registry differs/],
    ['stale registry revision', (f: any) => { f.request.registry.revision++; f.approve(); }, /registry differs/],
    ['wrong repository', (f: any) => { f.request.repository = 'other/repo'; f.approve(); }, /repository\/origin/],
    ['wrong origin', (f: any) => { f.request.origin_issue = 43; f.approve(); }, /repository\/origin/],
    ['duplicate task map', (f: any) => { f.request.tasks[1].task = '1'; f.approve(); }, /mapping is unknown|duplicated/],
    ['duplicate issue map', (f: any) => { f.request.tasks[1].issue = 101; f.approve(); }, /mapping is unknown|colliding/],
    ['origin issue collision', (f: any) => { f.request.tasks[1].issue = 42; f.approve(); }, /colliding/],
    ['duplicate temporary token', (f: any) => { f.request.tasks[1].temporary_id = 'aw_wi1'; f.approve(); }, /token mapping/],
    ['missing explicit mapping', (f: any) => { f.request.tasks.pop(); f.approve(); }, /complete frozen plan/],
    ['unapproved dependency token', (f: any) => { f.request.tasks[0].temporary_id = null; f.approve(); }, /explicitly approved/],
    ['unknown task', (f: any) => { f.request.tasks[1].task = 'unknown'; f.approve(); }, /mapping is unknown/],
    ['invented mapping field', (f: any) => { f.request.tasks[1].authorized = true; f.approve(); }, /task mappings require/],
    ['wrong parent', (f: any) => { f.parents.set(102, 101); }, /hierarchy/],
    ['cross-repository issue', (f: any) => { f.issues.get(102).url = 'https://api.github.com/repos/other/repo/issues/102'; }, /another repository/],
    ['pull request', (f: any) => { f.issues.get(102).pull_request = {}; }, /current mapped issue identity/],
    ['duplicate database identity', (f: any) => { f.issues.get(102).id = f.issues.get(101).id; }, /identity/],
    ['duplicate node identity', (f: any) => { f.issues.get(102).node_id = f.issues.get(101).node_id; }, /identity/],
    ['wrong owner label', (f: any) => { f.issues.get(102).labels = ['squad', 'squad:other']; }, /expected squad:builder, found squad:other/],
    ['mutated dependency', (f: any) => { f.issues.get(102).body = '**Depends On:** #999'; }, /dependency references/],
  ])('rejects %s before writes', async (_name, mutate, reason) => {
    const f = recovery();
    (mutate as Function)(f);
    await expect(f.reconcile()).rejects.toThrow(reason as RegExp);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.accepted()).toEqual([f.original]);
  });

  it.each([
    ['duplicate epic', (f: any) => { f.request.epics.push(clone(f.request.epics[0])); }],
    ['epic/task collision', (f: any) => { f.request.epics[0].issue = 101; }],
    ['missing epic', (f: any) => { f.request.epics = []; }],
    ['wrong epic parent', (f: any) => { f.parents.set(201, 101); }],
  ])('rejects %s without hierarchy repair', async (_name, mutate) => {
    const f = recovery({ epic: true });
    mutate(f);
    f.approve();
    await expect(f.reconcile()).rejects.toThrow(/mapping|complete frozen plan|hierarchy/);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it.each(['before correction', 'while recording correction'])('does not overwrite a body changed %s', async when => {
    const f = recovery();
    const changed = `${f.issues.get(102)!.body}\nOperator edit`;
    if (when === 'before correction') {
      f.hooks.get = (number, reads) => { if (number === 102 && reads === 2) f.issues.get(102)!.body = changed; };
    } else {
      f.hooks.comment = body => { if (body.startsWith('Dependency correction attempt')) f.issues.get(102)!.body = changed; };
    }
    await expect(f.reconcile()).rejects.toThrow(/changed before correction|changed while recording/);
    expect(f.issues.get(102)!.body).toBe(changed);
    expect(f.github.rest.issues.update).not.toHaveBeenCalled();
    expect(f.accepted()).toEqual([f.original]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it('resumes partial corrections without repeating repaired writes or issuing creates', async () => {
    const f = recovery({ count: 3 });
    const original = clone(f.original);
    f.hooks.update = params => {
      if (params.issue_number === 103) throw new Error('second correction API unavailable');
    };
    await expect(f.reconcile()).rejects.toThrow('second correction API unavailable');
    expect(f.issues.get(102)!.body).toContain('**Depends On:** Task 1 (`#101`) — Prepare example inputs');
    expect(f.issues.get(103)!.body).toContain('**Depends On:** Task 1 (`aw_wi1`) — Prepare example inputs');
    expect(f.accepted()).toEqual([original]);
    const writesBeforeRetry = f.writes.length;
    f.hooks.update = undefined;
    const result = await f.reconcile();
    expect(f.writes.slice(writesBeforeRetry).filter(write => write.method === 'update').map(write => write.params.issue_number))
      .toEqual([103]);
    expect(f.comments.get(20)).toEqual(original);
    expect(f.accepted()).toHaveLength(2);
    const writesAfterSuccess = f.writes.length;
    expect(await f.reconcile()).toEqual({ id: result.id, unchanged: true });
    expect(f.writes).toHaveLength(writesAfterSuccess);
    expect(f.createIssue).not.toHaveBeenCalled();
  });

  it('refuses to treat a malformed old acceptance as successful activation or recreate its issues', async () => {
    const f = recovery();
    const before = clone([...f.comments.entries()]);
    f.context.payload.comment.body = '/squad activate';
    await expect(f.prepare()).rejects.toThrow();
    expect([...f.comments.entries()]).toEqual(before);
    expect(f.writes).toEqual([]);
    expect(f.createIssue).not.toHaveBeenCalled();
  });
});

describe('dependency correction field grammar', () => {
  it('changes only the recognized backtick token and preserves surrounding bytes', () => {
    const body = [
      '# Exact title', '**Owner:** Builder',
      '**Depends On:** Task 1 (`aw_wi1`) — Prepare example inputs',
      'Unrelated prose: `aw_wi1`, #999', '',
    ].join('\n');
    expect(correctDependencyReferences(body, [101], { aw_wi1: 101 }))
      .toBe(body.replace('(`aw_wi1`)', '(`#101`)'));
    expect(correctDependencyReferences('**Depends On:** — (none)', [], {})).toBe('**Depends On:** — (none)');
  });

  it.each([
    '**Depends On:** aw_wi1',
    '**Depends On:** #aw_wi1',
    '**Depends On:** `aw_missing`',
    '**Depends On:** #101, #101',
    '**Depends On:** #999',
    '**Depends On:** #101\n**Depends On:** #101',
    'Prose mentions `aw_wi1` but no recognized dependency field.',
  ])('rejects unsupported or ambiguous dependency field: %s', body => {
    expect(() => correctDependencyReferences(body, [101], { aw_wi1: 101 })).toThrow();
  });
});

describe('SDK/canonical checker reconciliation selection parity', () => {
  it('preserves genuine whole-plan evidence with explicit or omitted phases', async () => {
    const f = recovery();
    const result = await f.reconcile();
    const proof = selectionEvidence(await f.verify());
    expect(proof.phases).toEqual([]);
    const omitted = { ...proof };
    delete omitted.phases;
    for (const evidence of [proof, omitted]) {
      const context = { repository, originIssue: 42, reconciliations: [evidence] };
      const selections = [selectSdk, selectBuiltSdk, selectChecker]
        .map(select => select([f.original, result], f.registry, context));
      for (const selected of selections) {
        expect(selected?.id).toBe(result.id);
        expect(commonIdentity(selected)).toEqual(commonIdentity(selections[0]));
      }
    }
  });

  it.each([{ phases: [1, 2] }, { phases: [] }, { phases: [2] }])(
    'rejects internally inconsistent activation-source evidence for replacement phases $phases',
    async ({ phases: replacementPhases }) => {
      const f = phasedFixture();
      const capture = await f.prepare();
      await f.finalize(capture, await f.create(capture));
      const source = f.latest();
      const bridge = await f.bridge(source);
      const verify = () => verifyReconciliationRequest({
        github: f.github, context: f.context, root: f.root,
        requestCommentId: bridge.comment.id, requestSha256: digest(bridge.comment.body),
      });
      const proof = selectionEvidence(await verify());
      const context = { repository, originIssue: 42, reconciliations: [proof],
        epicAssignments: frozenAssignments(capture.fullPlan) };
      expect(parseStructuredData(source.body).phases).toEqual([1]);
      expect(proof.phases).toEqual([1]);
      const replacement = {
        ...bridge.result,
        body: bridge.result.body.replace('"phases":[1]', `"phases":${JSON.stringify(replacementPhases)}`),
      };
      expect(parseStructuredData(replacement.body).phases).toEqual(replacementPhases);
      const forgedContext = {
        ...context, reconciliations: [{ ...proof, phases: replacementPhases }],
      };
      const writes = f.writes.length;
      const creates = f.createIssue.mock.calls.length;
      for (const select of [selectSdk, selectBuiltSdk, selectChecker]) {
        const selected = select([source, bridge.result], f.registry, context);
        expect(selected?.id).toBe(bridge.result.id);
        expect(commonIdentity(selected))
          .toEqual(commonIdentity(selectChecker([source, bridge.result], f.registry, context)));
        // Authentic evidence already rejects tampering; forged evidence must remain internally consistent.
        expect(() => select([source, replacement], f.registry, context)).toThrow();
        expect(() => select([source, replacement], f.registry, forgedContext)).toThrow(/phase/);
      }
      bridge.request.phases = replacementPhases;
      bridge.comment.body = block('Activation reconciliation request', bridge.request);
      f.context.payload.comment.body = `/squad reconcile activation ${bridge.comment.id} ${digest(bridge.comment.body)}`;
      await expect(verify()).rejects.toThrow(/phase/);
      await expect(reconcileActivation({
        github: f.github, context: f.context, env: f.env, root: f.root,
      })).rejects.toThrow(/phase/);
      expect(f.writes).toHaveLength(writes);
      expect(f.createIssue).toHaveBeenCalledTimes(creates);
    },
  );

  it.each([
    ['no verifier evidence', (s: any) => { s.context.reconciliations = []; }],
    ['duplicate verifier evidence', (s: any) => { s.context.reconciliations.push(clone(s.context.reconciliations[0])); }],
    ['wrong verifier actor', (s: any) => { s.context.reconciliations[0].actorId++; }],
    ['wrong verifier request', (s: any) => { s.context.reconciliations[0].requestSha256 = '0'.repeat(64); }],
    ['changed source record', (s: any) => { s.records[0].body += '\nchanged'; }],
    ['changed binding', (s: any) => { s.records[1].body = s.records[1].body.replace('"issue":"#101"', '"issue":"#999"'); }],
    ['changed registry', (s: any) => { s.registry.revision++; }],
    ['missing original', (s: any) => { s.records.shift(); }],
    ['duplicate comment ID', (s: any) => { s.records.push(clone(s.records[0])); }],
    ['competing reconciliations', (s: any) => { s.records.push({ ...s.records[1], id: 9999 }); }],
    ['unsuperseded original', (s: any) => { s.records.push({ ...s.records[0], id: 9999 }); }],
    ['wrong origin context', (s: any) => { s.context.originIssue++; }],
    ['wrong repository context', (s: any) => { s.context.repository = 'other/repo'; }],
  ])('both selectors reject %s without fallback', async (_name, mutate) => {
    const f = recovery();
    const result = await f.reconcile();
    const state = {
      records: clone([f.original, result]), registry: clone(f.registry),
      context: { repository, originIssue: 42, reconciliations: [selectionEvidence(await f.verify())] },
    };
    expect(selectSdk(state.records, state.registry, state.context)?.id).toBe(result.id);
    expect(selectChecker(state.records, state.registry, state.context)?.id).toBe(result.id);
    mutate(state);
    expect(() => selectChecker(state.records, state.registry, state.context)).toThrow();
    expect(() => selectSdk(state.records, state.registry, state.context)).toThrow();
  });
});

function phasedFixture(sharedEpic = false) {
  const f = fixture({ epic: sharedEpic });
  f.comments.get(10)!.body = [
    '# Phased example',
    ...[1, 2, 3].flatMap(phase => [
      `### Phase ${phase}`,
      sharedEpic ? '| # | Title | Agent | Agent ID | Depends On | Epic |' : '| # | Title | Owner | Agent ID | Depends On |',
      sharedEpic ? '|---|---|---|---|---|---|' : '|---|---|---|---|---|',
      `| ${phase} | Task ${phase} | ${sharedEpic && phase === 2 ? '@copilot | —' : 'Builder | builder'} | ${phase === 1 ? '—' : phase - 1} |${sharedEpic ? ' shared |' : ''}`,
    ]),
    block('Structured data', envelope(sharedEpic ? 'implementation' : 'plan')),
  ].join('\n');
  const activate = (phase: number) => {
    f.context.payload.comment.body = `/squad ${sharedEpic ? 'plan activate' : 'activate'} phase ${phase}`;
    f.env.GITHUB_RUN_ID = String(900 + phase);
  };
  const bridge = async (source: ReturnType<typeof f.comment>, pending?: { bindings: any[]; phases: number[] }) => {
    const artifact = pending ?? parseStructuredData(source.body);
    const request = {
      schema: 'squad-activation-reconciliation-request/v1', repository, origin_issue: 42,
      ...(pending ? { source_kind: 'pending' } : {}),
      original: { comment_id: source.id, sha256: digest(source.body) },
      plan: { comment_id: 10, sha256: digest(f.comments.get(10)!.body) },
      registry: { revision: 1, sha256: digest(f.registry) },
      tasks: artifact.bindings.map((binding: any) => ({
        task: binding.task, issue: Number(binding.issue.slice(1)), temporary_id: null,
      })),
      epics: [...new Map<string, number>(artifact.bindings.filter((binding: any) => binding.epic !== 'origin')
        .map((binding: any) => [binding.epic, Number(binding.epic_issue.slice(1))])).entries()]
        .map(([epic, issue]) => ({ epic, issue })),
      phases: artifact.phases,
    };
    const comment = f.comment(600 + artifact.phases.length, block('Activation reconciliation request', request), operator);
    f.comments.set(comment.id, comment);
    f.context.payload.comment.body = `/squad reconcile activation ${comment.id} ${digest(comment.body)}`;
    const result = await reconcileActivation({ github: f.github, context: f.context, env: f.env, root: f.root });
    return { result, comment, request };
  };
  const latest = () => [...f.comments.values()].filter(comment =>
    ['phases-accepted', 'phases-activated'].includes(parseStructuredData(comment.body)?.squad_artifact)).at(-1)!;
  activate(1);
  return { ...f, activate, bridge, latest };
}

describe('trusted synchronous publication completion (source and strict-compiled jobs)', () => {
  let lock: any;
  let runtimeSources: Map<string, string>;
  beforeAll(async () => {
    const installed = createFirstInstallFixture('a'.repeat(40), 'package');
    lock = parse(installed.consumerFiles.get('.github/workflows/squad.lock.yml')!.toString());
    runtimeSources = await fetchDiagnosticRuntime(['index.cjs', 'sanitize_content.cjs']);
  }, 180_000);

  function compiled(f: ReturnType<typeof fixture>) {
    const trusted = join(f.root, '.squad-activation-trusted-base');
    mkdirSync(join(trusted, '.github/workflows'), { recursive: true });
    cpSync(join(process.cwd(), 'workflows/shared'), join(trusted, '.github/workflows/shared'), { recursive: true });
    const outputs: Record<string, string> = {};
    const logs: string[] = [];
    const creationJob: any = Object.values(lock.jobs).find((job: any) =>
      job.steps.some((step: any) => step.name === 'Setup pinned issue creation API'));
    const runtime = diagnosticRuntime(runtimeSources, f.root, [], {
      ...Object.fromEntries(Object.entries(creationJob.env ?? {}).filter(([, value]) => !String(value).includes('${{'))),
      GITHUB_REPOSITORY: repository, ...f.env,
    });
    const api = runtime.load('js/index.cjs');
    const github = { ...f.github, hook: { before: () => {} }, rest: {
      ...f.github.rest, issues: { ...f.github.rest.issues,
        create: async (params: any) => {
          cpSync(join(f.root, 'squad-activation-receipts.json'), f.journalPath);
          return { data: (await f.createIssue(params)).issue };
        },
      },
    } };
    const run = async (name: string) => {
      cpSync(join(f.root, '.squad'), join(trusted, '.squad'), { recursive: true });
      const job: any = Object.values(lock.jobs).find((job: any) => job.steps.some((step: any) => step.name === name));
      expect(job.if).toContain("needs.safe_outputs.result == 'success'");
      const step = job.steps.find((step: any) => step.name === name);
      const core = {
        info: (message: string) => logs.push(message), debug: vi.fn(), warning: vi.fn(), error: vi.fn(),
        setOutput: (key: string, value: string) => { outputs[key] = value; },
        setFailed: (message: string) => { throw new Error(message); },
      };
      await compileFunction(`return (async () => { ${step.with.script} })();`,
        ['github', 'context', 'core', 'process', 'require', 'exec', 'io', 'getOctokit'],
        { importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER })(
        github, f.context, core, { env: {
          ...f.env, GITHUB_WORKSPACE: f.root, RUNNER_TEMP: f.root, GH_AW_AGENT_OUTPUT: f.outputPath,
          CAPTURE_ARTIFACT_ID: '800', RECEIPT_ARTIFACT_ID: '801',
        } }, (name: string) => {
          if (name === join(f.root, 'gh-aw/actions/index.cjs')) return api;
          if (name === join(f.root, 'gh-aw/actions/sanitize_content.cjs')) return runtime.load('js/sanitize_content.cjs');
          if (name === join(f.root, 'gh-aw/actions/issue_body.cjs')) return runtime.load('js/issue_body.cjs');
          return createRequire(import.meta.url)(name);
        }, {}, {}, () => github,
      );
    };
    return {
      logs, outputs, trusted,
      prepare: async () => {
        await run('Freeze and validate activation inputs');
        return outputs.fresh === 'false' ? { existingAcceptanceId: true }
          : JSON.parse(readFileSync(join(f.root, 'squad-activation-capture.json'), 'utf8'));
      },
      create: async (_capture: any) => {
        await run('Reserve activation and record actual create results');
        return JSON.parse(readFileSync(join(f.root, 'squad-activation-receipts.json'), 'utf8'));
      },
      finalize: async (_capture: any, _journal: any) => run('Validate actual bindings before publishing acceptance'),
      reconcile: async () => {
        writeFileSync(f.outputPath, JSON.stringify({ items: [{ type: 'reconcile_activation', action: 'reconcile' }] }));
        await run('Validate authorization and reconcile existing dependency references');
      },
    };
  }

  it.each([
    [65535, false], [65536, false], [65537, false],
    [65535, true], [65536, true], [65537, true],
  ] as const)(
    'compiled: admits only the pinned runtime attributed-body bound of %i code units (supplementary Unicode=%s) before reservation', async (size, unicode) => {
      const baseline = fixture({ count: 1 });
      const baselineRun = compiled(baseline);
      await baselineRun.create(await baselineRun.prepare());
      const attributedBody = baseline.writes.find(write => write.method === 'createIssue')!.params.body;
      const f = fixture({ count: 1 });
      const extra = size - attributedBody.length;
      const newlines = Math.floor((extra - (unicode ? 3 : 1)) / 3);
      f.comments.get(10)!.body += '\n'.repeat(newlines) + (unicode ? '😀' : '')
        + 'x'.repeat(extra - newlines * 3 - (unicode ? 2 : 0));
      const run = compiled(f);
      const capture = await run.prepare();
      if (size > 65536) {
        await expect(run.create(capture)).rejects.toThrow(/body exceeds/);
        expect(f.writes).toEqual([]);
        expect(f.createIssue).not.toHaveBeenCalled();
      } else {
        await run.finalize(capture, await run.create(capture));
        expect(f.writes.find(write => write.method === 'createIssue')!.params.body.length).toBe(size);
        if (unicode) expect(f.writes.find(write => write.method === 'createIssue')!.params.body).toContain('😀');
        expect(f.createIssue).toHaveBeenCalledTimes(1);
      }
    },
  );

  for (const implementation of ['source', 'compiled']) {
    const driver = (f: ReturnType<typeof fixture>) => implementation === 'compiled' ? compiled(f) : {
      ...f, reconcile: () => reconcileActivation({ github: f.github, context: f.context, env: f.env, root: f.root }),
    };

    it.each(['tilde', 'long-backtick', 'long-tilde', 'indented-fence', 'spaces', 'tab', 'space-tab'])(
      `${implementation}: excludes twice-sanitized %s code examples from the actual activation task set`, async style => {
        const f = fixture({ count: 1 });
        const example = [
          '### Phase 99',
          '| # | Title | Owner | Agent ID | Depends On |',
          '|---|---|---|---|---|',
          '| example | Must never create | Builder | builder | — |',
        ];
        const fenced = style === 'tilde' ? ['~~~markdown', ...example, '~~~']
          : style === 'long-backtick' ? ['````markdown', '```', ...example, '```', '````']
          : style === 'long-tilde' ? ['~~~~markdown', '~~~', ...example, '~~~', '~~~~']
          : style === 'indented-fence' ? ['   ~~~markdown', ...example, '   ~~~~']
          : example.map(line => `${style === 'spaces' ? '    ' : style === 'space-tab' ? '  \t' : '\t'}${line}`);
        const sanitizer = diagnosticRuntime(runtimeSources, f.root, [], {
          GITHUB_REPOSITORY: repository,
        }).load('js/sanitize_content.cjs').sanitizeContent;
        const body = `# Frozen plan\n\n${fenced.join('\n')}\n\n${f.comments.get(10)!.body}`;
        f.comments.get(10)!.body = sanitizer(sanitizer(body));
        expect(f.comments.get(10)!.body).toContain('Must never create');
        const run = driver(f);
        const capture = await run.prepare();
        expect(capture.fullPlan.phased).toBe(false);
        expect(capture.fullPlan.tasks.map((task: any) => task.id)).toEqual(['1']);
        await run.finalize(capture, await run.create(capture));
        expect(f.createIssue).toHaveBeenCalledTimes(1);
        expect(f.createIssue.mock.calls[0][0].title).not.toContain('Must never create');
      },
    );

    it.each([
      [[], 'omitted', true], [[], 'empty', true], [[1], 'omitted', false],
      [[1], 'empty', false], [[1], 'matched', true], [[1], 'mismatched', false],
      [[], 'mismatched', false],
    ])(`${implementation}: binds source scope %j to %s request scope`, async (sourcePhases, scope, valid) => {
      const f = recovery();
      // A phase-scoped source over the same mapped issues proves omission cannot widen recovery.
      f.original.body = f.original.body.replace('"phases":[]', `"phases":${JSON.stringify(sourcePhases)}`);
      if (sourcePhases.length) f.comments.get(10)!.body = `### Phase 1\n${f.comments.get(10)!.body}`;
      f.request.original.sha256 = digest(f.original.body);
      f.request.plan.sha256 = digest(f.comments.get(10)!.body);
      if (scope !== 'omitted') Object.assign(f.request, {
        phases: scope === 'empty' ? [] : scope === 'matched' ? sourcePhases : [2],
      });
      if (sourcePhases.length) {
        f.issues.set(201, f.issue(201, { labels: ['squad', 'squad:builder'] }));
        f.parents.set(201, 42);
        for (const number of [101, 102]) {
          f.parents.set(number, 201);
          f.issues.get(number)!.body = f.issues.get(number)!.body.replace('**Parent:** #42', '**Parent:** #201');
        }
        f.request.epics.push({ epic: 'phase-1', issue: 201 });
      }
      f.approve();
      const run = driver(f);
      if (valid) {
        await run.reconcile();
        expect(f.accepted()).toHaveLength(2);
        expect(parseStructuredData(f.accepted().at(-1)!.body).phases).toEqual(sourcePhases);
      } else {
        await expect(run.reconcile()).rejects.toThrow(/phase/);
        expect(f.writes).toEqual([]);
      }
      expect(f.createIssue).not.toHaveBeenCalled();
    });

    it(`${implementation}: omission cannot bind an unactivated later phase through full-plan mappings`, async () => {
      const f = recovery({ epic: true });
      f.original.body = f.original.body.replace('"phases":[]', '"phases":[1]');
      f.comments.get(10)!.body = [
        ...[1, 2].flatMap(phase => [
          `### Phase ${phase}`,
          '| # | Title | Agent | Agent ID | Depends On | Epic |',
          '|---|---|---|---|---|---|',
          `| ${phase} | Task ${phase} | Builder | builder | ${phase === 1 ? '—' : '1'} | example |`,
        ]),
        block('Structured data', envelope('implementation')),
      ].join('\n');
      f.request.original.sha256 = digest(f.original.body);
      f.request.plan.sha256 = digest(f.comments.get(10)!.body);
      f.approve();
      await expect(driver(f).reconcile()).rejects.toThrow(/phase.*exactly match/);
      expect(f.writes).toEqual([]);
      expect(f.createIssue).not.toHaveBeenCalled();
    });

    it(`${implementation}: production readers ignore discussion but reject extra history candidates`, async () => {
      const f = phasedFixture();
      const run = driver(f);
      const records: any[] = [f.comment(9000, 'Thanks, this breakdown looks good.', operator)];
      const proofs: any[] = [];
      let head: any;
      let capture: any;
      for (const phase of [1, 2]) {
        f.activate(phase);
        capture = await run.prepare();
        await run.finalize(capture, await run.create(capture));
        const source = f.latest();
        const bridge = await f.bridge(source);
        head = bridge.result;
        records.push(source, head);
        proofs.push(selectionEvidence(await verifyReconciliationRequest({
          github: f.github, context: f.context, root: f.root,
          requestCommentId: bridge.comment.id, requestSha256: digest(bridge.comment.body),
        })));
      }
      const checker = 'trusted' in run
        ? (await import(pathToFileURL(join(run.trusted, '.github/workflows/shared/check-agent-binding.mjs')).href)).selectActivationRecord
        : selectChecker;
      const selectionContext = { repository, originIssue: 42, reconciliations: proofs,
        epicAssignments: frozenAssignments(capture.fullPlan) };
      const pending = [...f.comments.values()].find(comment => comment.body.includes('squad-activation-pending/v1'))!;
      expect(pending).toBeDefined();
      for (const select of [selectSdk, selectBuiltSdk, checker]) {
        expect(select(records, f.registry, selectionContext)?.id).toBe(head.id);
        for (const extra of [pending, records[1], head]) {
          expect(() => select([...records, { ...extra, id: 9001 }], f.registry, selectionContext)).toThrow();
        }
      }
    });

    it(`${implementation}: completes the actual publication and retries without claiming a new output`, async () => {
      const f = fixture();
      const run = driver(f);
      const capture = await run.prepare();
      await run.finalize(capture, await run.create(capture));
      const accepted = f.accepted()[0];
      expect(accepted).toBeDefined();
      expect(f.github.rest.issues.getComment).toHaveBeenCalledWith({
        ...f.context.repo, comment_id: accepted.id,
      });
      f.env.GITHUB_RUN_ATTEMPT = '2';
      const writes = f.writes.length;
      expect(await run.prepare()).toHaveProperty('existingAcceptanceId');
      expect(f.writes).toHaveLength(writes);
      expect(f.createIssue).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['missing response', () => undefined],
      ['empty response', () => ({})],
      ['wrong repository', (receipt: any) => ({ ...receipt, issue_url: receipt.issue_url.replace('owner/repo', 'other/repo') })],
      ['wrong origin', (receipt: any) => ({ ...receipt, issue_url: receipt.issue_url.replace('/42', '/43') })],
      ['wrong bot ID', (receipt: any) => ({ ...receipt, user: { ...bot, id: 42 } })],
      ['wrong bot login', (receipt: any) => ({ ...receipt, user: { ...bot, login: 'other[bot]' } })],
      ['wrong bot type', (receipt: any) => ({ ...receipt, user: { ...bot, type: 'User' } })],
      ['self-claimed run', (receipt: any) => ({ ...receipt, body: receipt.body.replace('"run_id":900', '"run_id":901') })],
      ['another attempt', (receipt: any) => ({ ...receipt, body: receipt.body.replace('"run_attempt":1', '"run_attempt":2') })],
      ['old comment ID', (receipt: any) => ({ ...receipt, id: 10 })],
    ])(`${implementation}: rejects %s rather than borrowing a valid concurrent result`, async (_name, mutate) => {
      const f = fixture();
      const run = driver(f);
      const capture = await run.prepare();
      const journal = await run.create(capture);
      // A real, valid record remains visible in the API at the same origin/time,
      // but this invocation has no usable write response.
      f.hooks.publicationResponse = mutate as (value: any) => any;
      await expect(run.finalize(capture, journal)).rejects.toThrow(/publication receipt/);
      expect(f.accepted()).toHaveLength(1);
      expect([...f.comments.values()].some(comment => parseStructuredData(comment.body)?.squad_artifact === 'lifecycle-state'))
        .toBe(false);
    });

    it(`${implementation}: rejects same-origin/time concurrent publication and a different-attempt receipt`, async () => {
      const f = fixture();
      const run = driver(f);
      const capture = await run.prepare();
      const journal = await run.create(capture);
      f.hooks.comment = body => {
        if (!body.includes('Activation bindings:')) return;
        const other = f.comment(5000, body.replace('"run_id":900', '"run_id":901'));
        f.comments.set(other.id, other);
      };
      await expect(run.finalize(capture, journal)).rejects.toThrow(/competing/);
      expect(f.accepted()).toHaveLength(2);
      f.hooks.comment = undefined;
      f.env.GITHUB_RUN_ATTEMPT = '2';
      const before = f.writes.length;
      await expect(run.finalize(capture, journal)).rejects.toThrow(/command\/run\/attempt/);
      expect(f.writes).toHaveLength(before);
    });

    it(`${implementation}: unrelated valid history cannot replace missing current output`, async () => {
      const f = fixture();
      const run = driver(f);
      const capture = await run.prepare();
      const journal = await run.create(capture);
      f.hooks.publicationResponse = receipt => {
        f.comments.delete(receipt.id);
        f.comments.set(5000, f.comment(5000, receipt.body.replace('"run_id":900', '"run_id":899')));
        return undefined;
      };
      await expect(run.finalize(capture, journal)).rejects.toThrow(/publication receipt/);
      // Independent historical validity is deliberately not positive completion.
      expect(await runCollectedChecker(f, [f.comments.get(5000)!])).toContain('Validated 2 activation bindings.');
      expect([...f.comments.values()].some(comment => parseStructuredData(comment.body)?.squad_artifact === 'lifecycle-state'))
        .toBe(false);
    });

    it.each(['body', 'identity', 'bot', 'repository'])(
      `${implementation}: checks exact publication readback after a valid response (%s)`, async mutation => {
        const f = fixture();
        const run = driver(f);
        const capture = await run.prepare();
        const journal = await run.create(capture);
        f.hooks.publicationResponse = receipt => {
          const current = f.comments.get(receipt.id)!;
          if (mutation === 'body') current.body += '\nConcurrent edit';
          if (mutation === 'identity') current.id = 5000;
          if (mutation === 'bot') current.user = clone(operator);
          if (mutation === 'repository') current.issue_url = current.issue_url.replace(repository, 'other/repo');
          return receipt;
        };
        await expect(run.finalize(capture, journal)).rejects.toThrow(/publication receipt/);
        expect([...f.comments.values()].some(comment => parseStructuredData(comment.body)?.squad_artifact === 'lifecycle-state'))
          .toBe(false);
      },
    );

    it(`${implementation}: accepts authorized dispatch without a default-only revision restriction`, async () => {
      const f = fixture();
      f.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
      f.env.SQUAD_WORKFLOW_SHA = 'b'.repeat(40);
      Object.assign(f.context.payload, { inputs: { command: 'activate', issue_number: '42' } });
      const run = driver(f);
      const capture = await run.prepare();
      await run.finalize(capture, await run.create(capture));
      expect(f.accepted()).toHaveLength(1);
    });

    it(`${implementation}: reconciliation verifies its own response, not its predecessor as output`, async () => {
      const f = recovery();
      const run = driver(f);
      f.hooks.publicationResponse = () => clone(f.original);
      await expect(run.reconcile()).rejects.toThrow(/publication receipt/);
      expect(f.accepted()).toHaveLength(2);
      expect(f.createIssue).not.toHaveBeenCalled();
    });

    it(`${implementation}: accepts reconciliation and explicit transitive phase dependencies`, async () => {
      const f = phasedFixture();
      const run = driver(f);
      for (const phase of [1, 2, 3]) {
        f.activate(phase);
        const capture = await run.prepare();
        await run.finalize(capture, await run.create(capture));
        expect(parseStructuredData(f.latest().body).phases).toEqual(Array.from({ length: phase }, (_, i) => i + 1));
        if (phase < 3) await f.bridge(f.latest());
      }
      expect(f.createIssue).toHaveBeenCalledTimes(6);
      const r = recovery();
      await driver(r).reconcile();
      expect(r.accepted()).toHaveLength(2);
      expect(r.createIssue).not.toHaveBeenCalled();
    });

    it.each(['missing', 'changed', 'wrong-bot', 'wrong-repository'])(
      `${implementation}: rejects %s explicit predecessor without treating it as output`, async mutation => {
        const f = phasedFixture();
        const run = driver(f);
        const first = await run.prepare();
        await run.finalize(first, await run.create(first));
        const { result: bridge } = await f.bridge(f.latest());
        f.activate(2);
        const second = await run.prepare();
        const journal = await run.create(second);
        const predecessor = f.comments.get(bridge.id)!;
        if (mutation === 'missing') f.comments.delete(bridge.id);
        if (mutation === 'changed') predecessor.body += '\nChanged';
        if (mutation === 'wrong-bot') predecessor.user = clone(operator);
        if (mutation === 'wrong-repository') predecessor.issue_url = predecessor.issue_url.replace(repository, 'other/repo');
        const writes = f.writes.length;
        await expect(run.finalize(second, journal)).rejects.toThrow(/prior-phase|workflow-bot|ancestry/);
        // Failed prepublication or postpublication checks never publish lifecycle completion.
        expect(f.writes.slice(writes).some(write => write.params.body?.includes('"squad_artifact":"lifecycle-state"'))).toBe(false);
      },
    );
  }

  it('mutation: removing the in-job publication check admits the very same missing response', async () => {
    const f = fixture();
    const run = compiled(f);
    const path = join(run.trusted, '.github/workflows/shared/squad-activation.mjs');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('return checkActivationPublication({ github, context, root, receipt, expectedBody: body });');
    writeFileSync(path, source.replace(
      'return checkActivationPublication({ github, context, root, receipt, expectedBody: body });', 'return receipt;',
    ));
    const capture = await run.prepare();
    f.hooks.publicationResponse = () => undefined;
    await expect(run.finalize(capture, await run.create(capture))).resolves.toBeUndefined();
  });
});

function addValidation(f: ReturnType<typeof phasedFixture>) {
  const plan = f.comments.get(10)!;
  f.comments.set(11, f.comment(11, [
    '## Plan validation', 'RESULT: PASS',
    `**Implementation plan:** ${plan.html_url}`, `**Implementation SHA-256:** ${digest(plan.body)}`,
    '| Check | Status | Details |', '|---|---|---|',
    ...Array.from({ length: 16 }, (_, index) => `| ${index + 1} | PASS | Checked synthetic condition ${index + 1}. |`),
    '', '### Sizing Summary',
    '| Task | Size | Traces to |', '|---|---|---|',
    '| 1 | S | program-1 |', '| 2 | M | program-1 |', '| 3 | S | program-2 |',
    block('Structured data', envelope('validation')),
  ].join('\n')));
}

describe('combined implementation-phase acceptance and activation', () => {
  it.each([false, true])('retries phase-approval failure before reservation (stored=%s)', async stored => {
    const f = phasedFixture(true);
    addValidation(f);
    f.context.payload.comment.body = '/squad plan accept implementation phase 1';
    const post = f.github.rest.issues.createComment.getMockImplementation()!;
    f.github.rest.issues.createComment.mockImplementationOnce(async params => {
      expect(params.body).toContain('impl-phases-accepted');
      if (stored) await post(params);
      throw Object.assign(new Error('approval response failed'), { status: 500 });
    });
    await expect(f.create(await f.prepare())).rejects.toThrow('approval response failed');
    expect(f.createIssue).not.toHaveBeenCalled();
    expect([...f.comments.values()].some(comment => comment.body.includes('squad-activation-pending/v1'))).toBe(false);
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    expect([...f.comments.values()].filter(comment =>
      parseStructuredData(comment.body)?.squad_artifact === 'impl-phases-accepted')).toHaveLength(1);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });

  it('uses the same writer and bridge, then retries without duplicate creates', async () => {
    const f = phasedFixture(true);
    addValidation(f);
    for (const phase of [1, 2]) {
      f.activate(phase);
      f.context.payload.comment.body = `/squad plan accept implementation phase ${phase}`;
      const capture = await f.prepare();
      expect(capture.approvals.validation.id).toBe(11);
      await f.finalize(capture, await f.create(capture));
      const source = f.latest();
      expect([...f.comments.values()].some(comment =>
        parseStructuredData(comment.body)?.squad_artifact === 'impl-phases-accepted')).toBe(true);
      expect(await f.prepare()).toMatchObject({ existingAcceptanceId: source.id });
      if (phase === 1) await f.bridge(source);
    }
    expect(f.createIssue).toHaveBeenCalledTimes(3);
  });

  it.each(['missing', 'stale-plan', 'failed-check', 'oversized', 'traceability'])('rejects %s validation before writes', async mutation => {
    const f = phasedFixture(true);
    addValidation(f);
    f.context.payload.comment.body = '/squad plan accept implementation phase 1';
    if (mutation === 'missing') f.comments.delete(11);
    if (mutation === 'stale-plan') f.comments.get(10)!.body += '\nRevision.';
    if (mutation === 'failed-check') f.comments.get(11)!.body = f.comments.get(11)!.body.replace('| 16 | PASS |', '| 16 | FAIL |');
    if (mutation === 'oversized') f.comments.get(11)!.body = f.comments.get(11)!.body.replace('| 2 | M |', '| 2 | XL |');
    if (mutation === 'traceability') f.comments.get(11)!.body = f.comments.get(11)!.body.replace('| 3 | S | program-2 |', '| 3 | S | — |');
    await expect(f.prepare()).rejects.toThrow(/validation|sixteen/);
    expect(f.writes).toEqual([]);
  });

  it.each(['phase', 'validation'])('revalidates captured %s immediately before execution', async mutation => {
    const f = phasedFixture(true);
    addValidation(f);
    f.context.payload.comment.body = '/squad plan accept implementation phase 1';
    const capture = await f.prepare();
    if (mutation === 'phase') f.context.payload.comment.body = '/squad plan accept implementation phase 2';
    else f.comments.get(11)!.body += '\nChanged.';
    await expect(f.create(capture)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
});

describe('explicit pending-source current-state reconciliation', () => {
  async function setup() {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    const original = f.comments.get(journal.pending_comment_id)!;
    const bindings = buildActivationBindings(capture, journal);
    const request = {
      schema: 'squad-activation-reconciliation-request/v1', source_kind: 'pending',
      repository, origin_issue: 42,
      original: { comment_id: original.id, sha256: digest(original.body) },
      plan: { comment_id: 10, sha256: digest(f.comments.get(10)!.body) },
      registry: { revision: 1, sha256: digest(f.registry) },
      tasks: bindings.map((binding: any) => ({ task: binding.task, issue: Number(binding.issue.slice(1)), temporary_id: null })),
      epics: [],
    };
    const approve = () => {
      const comment = f.comment(600, block('Activation reconciliation request', request), operator);
      f.comments.set(comment.id, comment);
      f.context.payload.comment.body = `/squad reconcile activation 600 ${digest(comment.body)}`;
    };
    approve();
    const reconcile = () => reconcileActivation({ github: f.github, context: f.context, env: f.env, root: f.root });
    return { ...f, original, request, approve, reconcile };
  }

  it('recovers post-create/pre-acceptance interruption without historical attestation or new issues', async () => {
    const f = await setup();
    const originalBody = f.original.body;
    const result = await f.reconcile();
    const verified = await verifyReconciliationRequest({
      github: f.github, context: f.context, root: f.root,
      requestCommentId: 600, requestSha256: digest(f.comments.get(600)!.body),
    });
    const context = { repository, originIssue: 42, reconciliations: [selectionEvidence(verified)],
      epicAssignments: frozenAssignments(verified.fullPlan) };
    expect(selectChecker([f.original, result], f.registry, context)?.id).toBe(result.id);
    expect(selectSdk([f.original, result], f.registry, context)?.id).toBe(result.id);
    expect(selectBuiltSdk([f.original, result], f.registry, context)?.id).toBe(result.id);
    expect(result.body).toContain('"supersedes_kind":"pending"');
    expect(await f.reconcile()).toMatchObject({ id: result.id, unchanged: true });
    expect(f.original.body).toBe(originalBody);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    f.context.payload.comment.body = '/squad activate';
    expect(await f.prepare()).toMatchObject({ existingAcceptanceId: result.id });
  });

  it.each(['missing-map', 'forged-author', 'stale-reservation', 'stale-plan', 'missing-source-kind'])('rejects %s without accepting or creating', async mutation => {
    const f = await setup();
    if (mutation === 'missing-map') f.request.tasks.pop();
    if (mutation === 'forged-author') f.original.user = clone(operator);
    if (mutation === 'stale-reservation') f.original.body += '\nChanged.';
    if (mutation === 'stale-plan') f.comments.get(10)!.body += '\nChanged.';
    if (mutation === 'missing-source-kind') f.request.source_kind = 'activation';
    f.approve();
    const before = f.writes.length;
    await expect(f.reconcile()).rejects.toThrow();
    expect(f.writes).toHaveLength(before);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });
});

async function runCollectedChecker(
  f: ReturnType<typeof fixture>, comments: Array<{ id: number; body: string }>,
  options: { audit?: Record<string, any>; onFetch?: (path: string) => void; checker?: typeof checkBindings } = {},
) {
  const input = join(f.root, 'comments.json');
  const records = comments.map(({ id, body }) => ({ id, body, issue: 42 }));
  writeFileSync(input, JSON.stringify(options.audit ? { ...options.audit, comments: records } : records));
  const argv = process.argv;
  const token = process.env.GITHUB_TOKEN;
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    expect(url.origin).toBe('https://api.github.com');
    const path = url.pathname.replace('/repos/owner/repo/', '');
    options.onFetch?.(path);
    let data;
    const headers: Record<string, string> = {};
    if (path === 'issues/42/comments') {
      const page = Number(url.searchParams.get('page') ?? 1);
      data = [...f.comments.values()].slice((page - 1) * 100, page * 100);
      if (f.comments.size > page * 100) headers.link = `<https://api.github.com/repos/owner/repo/issues/42/comments?page=${page + 1}>; rel="next"`;
    }
    else if (/^issues\/comments\/\d+$/.test(path)) data = f.comments.get(Number(path.split('/').at(-1)));
    else if (/^issues\/\d+\/parent$/.test(path)) {
      const parent = f.parents.get(Number(path.split('/')[1]));
      if (parent === undefined) return new Response('{}', { status: 404 });
      data = f.issues.get(parent);
    }
    else if (/^issues\/\d+$/.test(path)) data = f.issues.get(Number(path.split('/')[1]));
    else if (path === 'collaborators/operator/permission') data = { permission: f.permissions.get(operator.login) };
    else throw new Error(`Unexpected checker request ${path}`);
    return new Response(JSON.stringify(data), { status: 200, headers });
  }));
  try {
    process.argv = ['node', 'checker', `--comments-file=${input}`, `--team-file=${f.root}/.squad/team.md`, '--repo=owner/repo'];
    process.env.GITHUB_TOKEN = 'synthetic-test-token';
    await (options.checker ?? checkBindings)();
    return log.mock.calls.map(args => args[0]);
  } finally {
    process.argv = argv;
    if (token === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = token;
    vi.unstubAllGlobals();
    log.mockRestore();
  }
}

describe('live downstream verification', () => {
  const automaticContext = () => ({
    eventName: 'workflow_run', repo: { owner: 'owner', repo: 'repo' },
    payload: { workflow_run: { updated_at: '2026-10-12T16:00:00Z' } },
  });
  const automaticAudit = (requestsUsed = 0) => ({
    schema: 'squad-historical-audit/v1', scope: 'recent-candidates',
    since: '2026-10-11T16:00:00.000Z', origins: [42], requestsUsed,
  });

  it('bounds automatic discovery pagination without returning a silently truncated success', async () => {
    const listCommentsForRepo = vi.fn(async ({ page, since }: any) => {
      expect(since).toBe('2026-10-11T16:00:00.000Z');
      return { data: Array.from({ length: 100 }, (_, i) => ({ id: page * 100 + i, body: 'Ordinary discussion' })) };
    });
    const listComments = vi.fn();
    await expect(collectHistoricalActivationRecords({
      github: { rest: { issues: { listCommentsForRepo, listComments } } }, context: automaticContext(),
    })).rejects.toThrow(/incomplete.*pagination/);
    expect(listCommentsForRepo).toHaveBeenCalledTimes(5);
    expect(listComments).not.toHaveBeenCalled();
  });

  it('accepts a complete automatic discovery at the exact page and origin limits using API Link termination', async () => {
    const f = fixture();
    const listCommentsForRepo = vi.fn(async ({ page }: any) => ({
      data: Array.from({ length: 100 }, (_, i) => ({
        ...f.comment(page * 100 + i, block('Structured data', envelope('activated'))),
        issue_url: `https://api.github.com/repos/owner/repo/issues/${page}`,
      })),
      headers: page < 5 ? { link: '<https://api.github.com/next>; rel="next"' } : {},
    }));
    const listComments = vi.fn(async ({ issue_number }: any) => ({ data: [{
      ...f.comment(issue_number, block('Structured data', { ...envelope('activated'), origin_issue: issue_number })),
      issue_url: `https://api.github.com/repos/owner/repo/issues/${issue_number}`,
    }], headers: {} }));
    const audit = await collectHistoricalActivationRecords({
      github: { rest: { issues: { listCommentsForRepo, listComments } } }, context: automaticContext(),
    });
    expect(audit).toMatchObject({ scope: 'recent-candidates', origins: [1, 2, 3, 4, 5], requestsUsed: 10 });
    expect(audit.comments).toHaveLength(5);
    expect(listCommentsForRepo).toHaveBeenCalledTimes(5);
  });

  it('distinguishes complete no-candidate discovery from API failures and missing trigger evidence', async () => {
    const listCommentsForRepo = vi.fn(async () => ({ data: [] }));
    const github = { rest: { issues: { listCommentsForRepo, listComments: vi.fn() } } };
    expect(await collectHistoricalActivationRecords({ github, context: automaticContext() }))
      .toMatchObject({ scope: 'recent-candidates', origins: [], comments: [], requestsUsed: 1 });
    listCommentsForRepo.mockRejectedValueOnce(new Error('rate limited'));
    await expect(collectHistoricalActivationRecords({ github, context: automaticContext() })).rejects.toThrow('rate limited');
    await expect(collectHistoricalActivationRecords({
      github, context: { ...automaticContext(), payload: {} },
    })).rejects.toThrow(/timestamp is missing/);
    expect(listCommentsForRepo).toHaveBeenCalledTimes(2);
  });

  it('follows explicit next links and rejects malformed or exhausted candidate discovery', async () => {
    const f = fixture();
    const candidate = f.comment(12, block('Structured data', envelope('activated')));
    const listCommentsForRepo = vi.fn(async ({ page }: any) => page === 1
      ? { data: [{ body: 'Discussion' }], headers: { link: '<https://api.github.com/page2>; rel="next"' } }
      : { data: [candidate] });
    const listComments = vi.fn(async () => ({ data: [candidate] }));
    const github = { rest: { issues: { listCommentsForRepo, listComments } } };
    expect(await collectHistoricalActivationRecords({ github, context: automaticContext() }))
      .toMatchObject({ origins: [42], requestsUsed: 3 });
    listCommentsForRepo.mockImplementation(async () => ({ data: [null] as any }));
    await expect(collectHistoricalActivationRecords({ github, context: automaticContext() })).rejects.toThrow();
    listCommentsForRepo.mockImplementation(async () => ({ data: Array.from({ length: 6 }, (_, i) => ({
      ...candidate, issue_url: `https://api.github.com/repos/owner/repo/issues/${i + 1}`,
    })) }));
    listComments.mockClear();
    await expect(collectHistoricalActivationRecords({ github, context: automaticContext() })).rejects.toThrow(/origin limit/);
    expect(listComments).not.toHaveBeenCalled();
  });

  it('bounds complete origin pages and fails when a discovered origin has missing evidence', async () => {
    const f = fixture();
    const candidate = f.comment(12, block('Structured data', envelope('activated')));
    const listCommentsForRepo = vi.fn(async () => ({ data: [candidate] }));
    const listComments = vi.fn(async () => ({ data: Array.from({ length: 100 }, () => candidate) }));
    const github = { rest: { issues: { listCommentsForRepo, listComments } } };
    await expect(collectHistoricalActivationRecords({ github, context: automaticContext() })).rejects.toThrow(/pagination limit/);
    expect(listComments).toHaveBeenCalledTimes(10);
    listComments.mockImplementation(async () => ({ data: [] }));
    await expect(collectHistoricalActivationRecords({ github, context: automaticContext() })).rejects.toThrow(/no activation evidence/);
    const pending = f.comment(13, '```json\n{"schema":"squad-activation-pending/v1"}\n```');
    listCommentsForRepo.mockImplementation(async () => ({ data: [pending] }));
    listComments.mockImplementation(async () => ({ data: [pending] }));
    await expect(collectHistoricalActivationRecords({ github, context: automaticContext() })).rejects.toThrow(/no activation evidence/);
  });

  it('manual full-history audit passes automatic discovery, origin and pagination limits without a time filter', async () => {
    const f = fixture();
    const candidate = f.comment(12, block('Structured data', envelope('activated')));
    const listCommentsForRepo = vi.fn(async ({ page, ...params }: any) => {
      expect(params).not.toHaveProperty('since');
      return { data: page <= 6 ? Array.from({ length: 100 }, (_, i) => ({
        ...candidate, id: page * 100 + i,
        issue_url: `https://api.github.com/repos/owner/repo/issues/${page}`,
      })) : [] };
    });
    const listComments = vi.fn(async ({ page, issue_number }: any) => ({ data: page <= 11
      ? Array.from({ length: 100 }, (_, i) => ({ ...candidate, id: page * 100 + i,
        issue_url: `https://api.github.com/repos/owner/repo/issues/${issue_number}` })) : [] }));
    const audit = await collectHistoricalActivationRecords({
      github: { rest: { issues: { listCommentsForRepo, listComments } } },
      context: { ...automaticContext(), eventName: 'workflow_dispatch' },
    });
    expect(audit).toMatchObject({ scope: 'full-history', origins: [1, 2, 3, 4, 5, 6], requestsUsed: 79 });
    expect(audit).not.toHaveProperty('since');
    expect(audit.comments).toHaveLength(6600);
  });

  it('charges all canonical chain and label reads against the remaining automatic budget', async () => {
    const f = recovery();
    const head = await f.reconcile();
    const calls: string[] = [];
    await expect(runCollectedChecker(f, [f.original, head], {
      audit: automaticAudit(249), onFetch: path => calls.push(path),
    })).rejects.toThrow(/budget exhausted.*complete-chain/);
    expect(calls).toHaveLength(1);
    calls.length = 0;
    const audit = automaticAudit(250);
    const legacy = f.comment(99, [
      block('Structured data', envelope('plan-accepted')),
      block('Activation bindings', jsonBlock(head.body, 'Activation bindings')
        .map((binding: any) => ({ ...binding, artifact: 'plan-accepted' }))),
    ].join('\n'));
    await expect(runCollectedChecker(f, [legacy], { audit, onFetch: path => calls.push(path) }))
      .rejects.toThrow(/budget exhausted/);
    expect(calls).toEqual([]);
    const result = await runCollectedChecker(f, [f.original, head], {
      audit: { ...audit, scope: 'full-history', requestsUsed: 1000 },
    });
    expect(result).toContain('Validated 2 activation bindings.');
    expect(result.some(line => line.includes('scope: full-history'))).toBe(true);
  });

  it('fails automatic verification on truncated origin evidence and does not call it no candidates', async () => {
    const f = fixture();
    await expect(runCollectedChecker(f, [], { audit: automaticAudit() })).rejects.toThrow(/candidate evidence is missing/);
    await expect(runCollectedChecker(f, [f.comment(1, 'Example: {"squad_artifact":"activated"}')], {
      audit: automaticAudit(),
    })).rejects.toThrow(/no validated activation evidence/);
    const noCandidates = await runCollectedChecker(f, [], { audit: { ...automaticAudit(1), origins: [] } });
    expect(noCandidates.some(line => line.includes('scope: recent-candidates'))).toBe(true);
    expect(noCandidates).toContain('No historical activation artifact found; no current-run completion is asserted.');
  });

  it('stops canonical evidence pagination at the shared API budget instead of validating partial history', async () => {
    const f = recovery();
    const head = await f.reconcile();
    for (let index = 0; index < 250; index++) f.comments.set(10000 + index, f.comment(10000 + index, 'Discussion'));
    const calls: string[] = [];
    await expect(runCollectedChecker(f, [f.original, head], {
      audit: automaticAudit(246), onFetch: path => calls.push(path),
    })).rejects.toThrow(/budget exhausted.*complete-chain/);
    expect(calls).toHaveLength(4);
    expect(calls.filter(path => path === 'issues/42/comments')).toHaveLength(2);
    expect(await runCollectedChecker(f, [f.original, head], {
      audit: { ...automaticAudit(1000), scope: 'full-history' },
    })).toContain('Validated 2 activation bindings.');
  });

  it('mutation: removing the actual request-budget guard admits the same over-budget canonical audit', async () => {
    const f = recovery();
    const head = await f.reconcile();
    const audit = automaticAudit(249);
    await expect(runCollectedChecker(f, [f.original, head], { audit })).rejects.toThrow(/budget exhausted/);
    const directory = join(f.root, 'mutant');
    cpSync(join(process.cwd(), 'workflows/shared'), directory, { recursive: true });
    const path = join(directory, 'check-agent-binding.mjs');
    const source = readFileSync(path, 'utf8');
    const guard = "if (requests >= requestBudget) incompleteAudit('API request budget exhausted during complete-chain verification');";
    expect(source).toContain(guard);
    writeFileSync(path, source.replace(guard, ''));
    const mutant = await import(pathToFileURL(path).href);
    const calls: string[] = [];
    expect(await runCollectedChecker(f, [f.original, head], {
      audit, checker: mutant.main, onFetch: path => calls.push(path),
    })).toContain('Validated 2 activation bindings.');
    expect(calls.length).toBeGreaterThan(1);
  });

  it.each(['.github/workflows/squad-agent-binding-check.yml', 'workflows/shared/squad-agent-binding-check.yml']
    .flatMap(path => ['workflow_run', 'workflow_dispatch'].map(eventName => [path, eventName])))(
    '%s executes %s historical audit, retaining old explicit predecessors without run attestation', async (path, eventName) => {
      const f = phasedFixture();
      const first = await f.prepare();
      await f.finalize(first, await f.create(first));
      const original = f.latest();
      await f.bridge(original);
      f.activate(2);
      const second = await f.prepare();
      await f.finalize(second, await f.create(second));
      const workflow = parse(readFileSync(join(process.cwd(), path), 'utf8'));
      expect(workflow.jobs.check.name).toContain('not current-run completion');
      const collector = workflow.jobs.check.steps.find((step: any) => step.with?.script);
      const files = new Map<string, string>();
      const listCommentsForRepo = vi.fn(async (params: any) => {
        if (eventName === 'workflow_run') expect(params.since).toBe('2026-09-30T00:01:00.000Z');
        else expect(params).not.toHaveProperty('since');
        // Only a new candidate is discovered; old predecessors still must be fetched.
        return { data: eventName === 'workflow_run' ? [clone(f.latest())] : clone([...f.comments.values()]) };
      });
      const listComments = vi.fn(async (params: any) => {
        expect(params.issue_number).toBe(42);
        expect(params).not.toHaveProperty('since');
        return { data: clone([...f.comments.values()]) };
      });
      const workspace = path.startsWith('.github/') ? process.cwd() : f.root;
      if (!path.startsWith('.github/')) {
        mkdirSync(join(f.root, '.github/workflows'), { recursive: true });
        cpSync(join(process.cwd(), 'workflows/shared'), join(f.root, '.github/workflows/shared'), { recursive: true });
      }
      await compileFunction(`return (async () => { ${collector.with.script} })();`,
        ['github', 'context', 'process', 'require'],
        { importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER })(
        { rest: { issues: { listCommentsForRepo, listComments } } },
        { eventName, repo: f.context.repo, payload: { workflow_run: {
          id: 999, run_attempt: 2, run_started_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:01:00Z',
        } } },
        { env: { RUNNER_TEMP: f.root, GITHUB_WORKSPACE: workspace } },
        (name: string) => {
          if (name === 'node:fs') return { writeFileSync: (path: string, body: string) => files.set(path, body) };
          return createRequire(import.meta.url)(name);
        },
      );
      expect(workflow.on).toHaveProperty('workflow_dispatch');
      const audit = JSON.parse(files.get(join(f.root, 'activation-comments.json'))!);
      expect(audit.scope).toBe(eventName === 'workflow_run' ? 'recent-candidates' : 'full-history');
      const records = audit.comments;
      expect(records.map((record: any) => record.id)).toContain(original.id);
      expect(records.map((record: any) => record.id)).toContain(f.latest().id);
      expect(await runCollectedChecker(f, records, { audit })).toContain('Validated 3 activation bindings.');
      expect(await runCollectedChecker(f, [])).toContain(
        'No historical activation artifact found; no current-run completion is asserted.',
      );
    },
  );

  it.each([null, ['task:unknown'], ['task:1', 'task:1']])('rejects malformed parent fallback evidence: %j', async fallbacks => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    expect(() => validateReceiptSet(capture, { ...journal, parent_fallbacks: fallbacks }))
      .toThrow(/parent fallback metadata/);
    await f.finalize(capture, journal);
    const head = f.accepted()[0];
    const evidence = jsonBlock(head.body, 'Activation evidence');
    head.body = head.body.replace(JSON.stringify(evidence),
      JSON.stringify({ ...evidence, parent_fallbacks: fallbacks }));
    await expect(runCollectedChecker(f, [head])).rejects.toThrow(/parent fallback metadata/);
  });

  it('does not invent a parent fallback after a previously successful native link disappears', async () => {
    const f = fixture();
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    f.parents.delete(102);
    await expect(runCollectedChecker(f, [f.accepted()[0]])).rejects.toThrow(/API returned 404/);
  });

  it.each([404, 422])('honors recorded parent fallback %s only while the API does not contradict it', async status => {
    const f = fixture();
    f.hooks.parentStatus = status;
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    const head = f.accepted()[0];
    expect(await runCollectedChecker(f, [head])).toContain('Validated 2 activation bindings.');
    f.parents.set(102, 101);
    await expect(runCollectedChecker(f, [head])).rejects.toThrow(/API hierarchy/);
  });

  it('rejects independently valid but disconnected competing source/supplement pairs', async () => {
    const f = recovery();
    const first = await f.reconcile();
    const otherSource = f.comment(21, f.original.body);
    f.comments.set(otherSource.id, otherSource);
    const otherRequest = { ...clone(f.request), original: { comment_id: 21, sha256: digest(otherSource.body) } };
    const requestComment = f.comment(31, block('Activation reconciliation request', otherRequest), operator);
    f.comments.set(requestComment.id, requestComment);
    const metadata = jsonBlock(first.body, 'Activation reconciliation');
    const otherMetadata = { ...metadata, request_comment_id: 31, request_sha256: digest(requestComment.body),
      supersedes_comment_id: 21, supersedes_sha256: digest(otherSource.body) };
    const other = f.comment(1500, first.body.replace(JSON.stringify(metadata), JSON.stringify(otherMetadata)));
    f.comments.set(other.id, other);
    await expect(runCollectedChecker(f, [f.original, first, otherSource, other])).rejects.toThrow(/competing/);
  });

  it('verifies the real collector projection for a continuation over preserved legacy issues', async () => {
    const f = phasedFixture();
    const first = await f.prepare();
    await f.finalize(first, await f.create(first));
    const prior = parseStructuredData(f.latest().body).bindings[0];
    const issue = f.issues.get(Number(prior.issue.slice(1)))!;
    issue.body = issue.body.replace(/^\*\*Stable work ID:\*\*.*\n/m, '')
      .replace('**Depends On:** None', '**Depends On:** — (none)');
    await f.bridge(f.latest());
    f.activate(2);
    const second = await f.prepare();
    await f.finalize(second, await f.create(second));
    const head = f.latest();
    expect(await runCollectedChecker(f, [head])).toContain('Validated 2 activation bindings.');
    const leaf = parseStructuredData(head.body).bindings.find((binding: any) => binding.task === '2');
    const taskNumber = Number(leaf.issue.slice(1));
    const epicNumber = Number(leaf.epic_issue.slice(1));
    f.parents.set(taskNumber, 42);
    await expect(runCollectedChecker(f, [head])).rejects.toThrow(/API hierarchy/);
    f.parents.set(taskNumber, epicNumber);
    const priorEpic = Number(prior.epic_issue.slice(1));
    f.parents.set(epicNumber, priorEpic);
    await expect(runCollectedChecker(f, [head])).rejects.toThrow(/API hierarchy/);
    f.parents.set(epicNumber, 42);
    await expect(runCollectedChecker(f, [{ ...head, body: `${head.body}\nTampered projection` }]))
      .rejects.toThrow(/differs from its current API record/);
    const changed = f.comments.get(head.id)!;
    changed.user = clone(operator);
    await expect(runCollectedChecker(f, [changed])).rejects.toThrow(/workflow-bot record/);
  });

  it('rechecks published producer bindings against frozen plan and current issue references', async () => {
    const f = fixture();
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    const comment = f.accepted()[0];
    expect(await verifyPublishedActivation({ github: f.github, context: f.context, root: f.root, comment }))
      .toMatchObject({ assignments: frozenAssignments(capture.fullPlan) });
    f.issues.get(102)!.body = f.issues.get(102)!.body.replace('**Depends On:** #101', '**Depends On:** #999');
    await expect(verifyPublishedActivation({ github: f.github, context: f.context, root: f.root, comment }))
      .rejects.toThrow(/dependencies/);
  });

  it('the packaged checker admits a validated supplement and skips only its exact malformed original', async () => {
    const f = recovery();
    f.original.body = f.original.body.replace('"issue":"aw_wi1"', '"issue":aw_wi1');
    f.request.original.sha256 = digest(f.original.body);
    f.approve();
    const result = await f.reconcile();
    expect(await runCollectedChecker(f, [f.original, result])).toContain('Validated 2 activation bindings.');
  });
});

describe('actual producer and verifier phase ancestry matrix', () => {
  let installed: ReturnType<typeof createFirstInstallFixture>;
  beforeAll(() => {
    installed = createFirstInstallFixture('a'.repeat(40), 'package');
  }, 180_000);

  const cases: Array<{
    name: string; plan: number[]; scopes: Array<number[] | undefined>;
    invalid?: boolean; requestScope?: 'omitted' | number[]; dependency?: boolean;
    guardMutation?: 'prefix' | 'whole-plan' | 'existence';
  }> = [
    { name: 'whole plan with omitted request scope', plan: [1, 2], scopes: [undefined] },
    { name: 'whole plan with explicit empty scope', plan: [1, 2], scopes: [[]] },
    { name: 'standalone scoped pair', plan: [1, 2], scopes: [[1]] },
    { name: 'ordered three-node growth', plan: [1, 2, 3], scopes: [[1], [1, 2], [1, 2, 3]], dependency: true },
    { name: 'sparse ordered growth', plan: [1, 3, 9], scopes: [[1], [1, 3], [1, 3, 9]], dependency: true },
    { name: 'reordered child', plan: [1, 2], scopes: [[1], [2, 1]], invalid: true },
    { name: 'nonprefix insertion at start', plan: [1, 2], scopes: [[2], [1, 2]], invalid: true, guardMutation: 'prefix' },
    { name: 'nonprefix insertion in middle', plan: [1, 2, 3], scopes: [[1, 3], [1, 2, 3]], invalid: true, guardMutation: 'prefix' },
    { name: 'duplicate child phase', plan: [1, 2], scopes: [[1], [1, 1, 2]], invalid: true },
    { name: 'non-growing child', plan: [1, 2], scopes: [[1], [1]], invalid: true },
    { name: 'omitted scoped request', plan: [1, 2], scopes: [[1]], requestScope: 'omitted', invalid: true },
    { name: 'widened scoped request', plan: [1, 2], scopes: [[1]], requestScope: [1, 2], invalid: true },
    { name: 'omitted whole-plan predecessor expansion', plan: [1], scopes: [undefined, [1]], invalid: true },
    { name: 'explicit whole-plan predecessor expansion', plan: [1], scopes: [[], [1]], invalid: true, guardMutation: 'whole-plan' },
    { name: 'nonexistent child phase with unchanged maps', plan: [1], scopes: [[1], [1, 999]], invalid: true, guardMutation: 'existence' },
    { name: 'nonexistent phase mixed with an existing phase', plan: [1], scopes: [[1, 999]], invalid: true, guardMutation: 'existence' },
    { name: 'scope omitting a dependency', plan: [1, 3], scopes: [[3]], dependency: true, invalid: true },
  ];

  it.each(cases.flatMap(testCase => ['activation', 'pending'].map(sourceKind => ({ ...testCase, sourceKind }))))(
    '$sourceKind: $name', async ({ plan: phaseIds, scopes, sourceKind, invalid, requestScope, dependency, guardMutation }) => {
      const f = fixture({ epic: true });
      f.comments.get(10)!.body = [
        '# Frozen phased implementation',
        ...phaseIds.flatMap((phase, index) => [
          `### Phase ${phase}`,
          '| # | Title | Agent | Agent ID | Depends On | Epic |',
          '|---|---|---|---|---|---|',
          `| ${phase} | Task ${phase} | Builder | builder | ${dependency && index ? phaseIds[index - 1] : '—'} | example |`,
        ]),
        block('Structured data', envelope('implementation')),
      ].join('\n');
      let capture = await f.prepare();
      let baseline: { emitted: any; reservation: any; bindings: any[] } | undefined;
      if (invalid) {
        const journal = await f.create(capture);
        await f.finalize(capture, journal);
        const emitted = f.accepted()[0];
        const reservation = f.comments.get(journal.pending_comment_id)!;
        baseline = { emitted, reservation, bindings: parseStructuredData(emitted.body).bindings };
        f.comments.delete(emitted.id);
        f.comments.delete(reservation.id);
      }

      const packagedRoot = join(f.root, 'packaged');
      mkdirSync(packagedRoot, { recursive: true });
      for (const [path, bytes] of installed.consumerFiles) {
        if (path.startsWith('.github/workflows/shared/')) {
          writeFileSync(join(packagedRoot, path.slice('.github/workflows/shared/'.length)), bytes);
        }
      }
      const packaged = await import(pathToFileURL(join(packagedRoot, 'check-agent-binding.mjs')).href);
      const packagedRuntime = await import(pathToFileURL(join(packagedRoot, 'squad-activation.mjs')).href);
      const records: any[] = [f.comment(9000, 'Ordinary discussion, not activation evidence.', operator)];
      f.comments.set(records[0].id, records[0]);
      const proofs: any[] = [];
      let previous: { source: any; result: any } | undefined;
      let validatedBindings = 0;
      for (const [index, scope] of scopes.entries()) {
        const phases = scope ?? [];
        let source: any;
        let rows: any[];
        if (baseline) {
          const { emitted, reservation, bindings } = baseline;
          rows = bindings.filter(row => !phases.length || phases.includes(Number(row.task)));
          const prior = previous ? {
            source_comment_id: previous.source.id, source_sha256: digest(previous.source.body),
            reconciliation_comment_id: previous.result.id, reconciliation_sha256: digest(previous.result.body),
          } : undefined;
          // Invalid historical inputs mutate actual producer output, never fabricate verifier proofs.
          let body = emitted.body
            .replace(JSON.stringify(jsonBlock(emitted.body, 'Structured data')),
              JSON.stringify({ ...jsonBlock(emitted.body, 'Structured data'), phases }))
            .replace(JSON.stringify(bindings), JSON.stringify(rows))
            .replace(JSON.stringify(jsonBlock(emitted.body, 'Activation evidence')),
              JSON.stringify({ ...jsonBlock(emitted.body, 'Activation evidence'), ...(prior ? { prior } : {}) }));
          if (sourceKind === 'pending') {
            const pendingData = JSON.parse(reservation.body.split('```json\n')[1].split('\n```')[0]);
            body = reservation.body.replace(JSON.stringify(pendingData),
              JSON.stringify({ ...pendingData, phases, ...(prior ? { prior } : {}) }));
          }
          source = f.comment(2000 + index, body);
          f.comments.set(source.id, source);
        } else {
          f.context.payload.comment.body = `/squad plan activate${phases.length ? ` phase ${phases.at(-1)}` : ''}`;
          f.env.GITHUB_RUN_ID = String(910 + index);
          capture = await f.prepare();
          const journal = await f.create(capture);
          rows = buildActivationBindings(capture, journal);
          if (sourceKind === 'activation') {
            await f.finalize(capture, journal);
            source = [...f.comments.values()].filter(comment => comment.body.includes('Activation evidence:')).at(-1)!;
          } else {
            source = f.comments.get(journal.pending_comment_id)!;
          }
        }
        const creates = f.createIssue.mock.calls.length;
        const issueSnapshot = clone([...f.issues.entries()]);
        const request: any = {
          schema: 'squad-activation-reconciliation-request/v1', repository, origin_issue: 42,
          ...(sourceKind === 'pending' ? { source_kind: 'pending' } : {}),
          original: { comment_id: source.id, sha256: digest(source.body) },
          plan: { comment_id: 10, sha256: digest(f.comments.get(10)!.body) },
          registry: { revision: 1, sha256: digest(f.registry) },
          tasks: rows.map((row: any) => ({ task: row.task, issue: Number(row.issue.slice(1)), temporary_id: null })),
          epics: [{ epic: 'example', issue: Number(rows[0].epic_issue.slice(1)) }],
          ...(scope === undefined ? {} : { phases }),
        };
        if (requestScope === 'omitted') delete request.phases;
        else if (requestScope) request.phases = requestScope;
        const requestComment = f.comment(3000 + index, block('Activation reconciliation request', request), operator);
        f.comments.set(requestComment.id, requestComment);
        f.context.payload.comment.body =
          `/squad reconcile activation ${requestComment.id} ${digest(requestComment.body)}`;
        const verifyOptions = {
          github: f.github, context: f.context, root: f.root,
          requestCommentId: requestComment.id, requestSha256: digest(requestComment.body),
        };
        const verify = () => verifyReconciliationRequest(verifyOptions);
        const reconcileOptions = { github: f.github, context: f.context, env: f.env, root: f.root };
        const selectionContext = { repository, originIssue: 42, reconciliations: proofs,
          epicAssignments: frozenAssignments(capture.fullPlan) };
        const writes = f.writes.length;
        if (invalid && index === scopes.length - 1) {
          await expect(verify()).rejects.toThrow(/phase|coverage|dependency|metadata/);
          await expect(packagedRuntime.verifyReconciliationRequest(verifyOptions))
            .rejects.toThrow(/phase|coverage|dependency|metadata/);
          await expect(reconcileActivation(reconcileOptions)).rejects.toThrow(/phase|coverage|dependency|metadata/);
          expect(f.writes).toHaveLength(writes);
          expect(proofs.some(proof => proof.sourceCommentId === source.id)).toBe(false);
          if (guardMutation) {
            const mutantRoot = join(f.root, 'mutant');
            cpSync(packagedRoot, mutantRoot, { recursive: true });
            const path = join(mutantRoot, 'squad-activation.mjs');
            const runtime = readFileSync(path, 'utf8');
            const [guard, replacement] = {
              prefix: [
                'previous.request.phases.every((phase, index) => request.phases[index] === phase)',
                'previous.request.phases.every(phase => request.phases.includes(phase))',
              ],
              'whole-plan': ['      previous.request.phases.length > 0 &&\n', ''],
              existence: [
                "    requireThat(phases.every(phase => fullPlan.tasks.some(task => task.phase === phase)),\n" +
                "      'selected prior phase does not exist in the frozen plan');\n",
                '',
              ],
            }[guardMutation];
            expect(runtime).toContain(guard);
            writeFileSync(path, runtime.replace(guard, replacement));
            const mutant = await import(pathToFileURL(path).href);
            // Exercise the actual producer with one verifier guard removed, including its real proof export.
            const result = await mutant.reconcileActivation(reconcileOptions);
            const proof = mutant.selectionEvidence(await mutant.verifyReconciliationRequest(verifyOptions));
            const mutatedRecords = [...records, source, result];
            const mutatedContext = { ...selectionContext, reconciliations: [...proofs, proof] };
            for (const select of [selectBuiltSdk, packaged.selectActivationRecord]) {
              if (guardMutation === 'existence') {
                // Readers trust supplied frozen-plan verification; only the verifier can check phase existence.
                expect(select(mutatedRecords, f.registry, mutatedContext)?.id).toBe(result.id);
              } else {
                expect(() => select(mutatedRecords, f.registry, mutatedContext)).toThrow(/phase coverage/);
              }
            }
            await expect(runCollectedChecker(f, mutatedRecords, { checker: packaged.main }))
              .rejects.toThrow(/phase|coverage/);
          }
          expect(f.createIssue).toHaveBeenCalledTimes(creates);
          expect([...f.issues.entries()]).toEqual(issueSnapshot);
          break;
        }
        const verified = await verify();
        const result = await reconcileActivation({
          github: f.github, context: f.context, env: f.env, root: f.root,
        });
        proofs.push(selectionEvidence(await verify()));
        records.push(source, result);
        previous = { source, result };
        validatedBindings += verified.bindings.length;
        for (const select of [selectBuiltSdk, packaged.selectActivationRecord]) {
          expect(select(records, f.registry, selectionContext)?.id).toBe(result.id);
          expect(select([records[0], source, result], f.registry, {
            ...selectionContext, reconciliations: [proofs.at(-1)],
          })?.id).toBe(result.id);
        }
        expect(await runCollectedChecker(f, records, { checker: packaged.main }))
          .toContain(`Validated ${validatedBindings} activation bindings.`);
        expect(f.createIssue).toHaveBeenCalledTimes(creates);
        expect([...f.issues.entries()]).toEqual(issueSnapshot);
      }
    },
  );
});

describe('explicit current-state phase continuation', () => {
  it('continues after a later-phase pending-source recovery and validates the complete transitive reader chain', async () => {
    const f = phasedFixture();
    const first = await f.prepare();
    await f.finalize(first, await f.create(first));
    const original = f.latest();
    const firstBridge = await f.bridge(original);
    f.activate(2);
    const second = await f.prepare();
    const journal = await f.create(second);
    const pending = f.comments.get(journal.pending_comment_id)!;
    const secondBridge = await f.bridge(pending, {
      bindings: buildActivationBindings(second, journal), phases: [1, 2],
    });
    const proofs = await Promise.all([firstBridge.comment, secondBridge.comment].map(comment =>
      verifyReconciliationRequest({ github: f.github, context: f.context, root: f.root,
        requestCommentId: comment.id, requestSha256: digest(comment.body) })));
    const selectionContext = { repository, originIssue: 42,
      reconciliations: proofs.map(selectionEvidence), epicAssignments: frozenAssignments(second.fullPlan) };
    const records = [original, firstBridge.result, pending, secondBridge.result];
    expect(selectSdk(records, f.registry, selectionContext)?.id).toBe(secondBridge.result.id);
    expect(selectChecker(records, f.registry, selectionContext)?.id).toBe(secondBridge.result.id);
    expect(await runCollectedChecker(f, [original, firstBridge.result, secondBridge.result]))
      .toContain('Validated 3 activation bindings.');
    f.activate(2);
    await expect(f.prepare()).resolves.toMatchObject({ existingAcceptanceId: secondBridge.result.id });
    f.activate(3);
    const third = await f.prepare();
    await f.finalize(third, await f.create(third));
    const head = f.latest();
    expect(await runCollectedChecker(f, [head])).toContain('Validated 3 activation bindings.');
    await expect(f.prepare()).resolves.toMatchObject({ existingAcceptanceId: head.id });
    expect(f.createIssue).toHaveBeenCalledTimes(6);
  });

  it('does not roll the terminal lifecycle backward when an old phase bridge is replayed', async () => {
    const f = phasedFixture();
    let firstCommand = '';
    for (const phase of [1, 2, 3]) {
      f.activate(phase);
      const capture = await f.prepare();
      await f.finalize(capture, await f.create(capture));
      if (phase < 3) {
        await f.bridge(f.latest());
        if (phase === 1) firstCommand = f.context.payload.comment.body;
      }
    }
    const before = clone([...f.comments.values()]);
    const writes = f.writes.length;
    f.context.payload.comment.body = firstCommand;
    await expect(reconcileActivation({ github: f.github, context: f.context, env: f.env, root: f.root }))
      .resolves.toMatchObject({ unchanged: true });
    expect([...f.comments.values()]).toEqual(before);
    expect(f.writes).toHaveLength(writes);
    expect(f.createIssue).toHaveBeenCalledTimes(6);
  });

  it('consumes a continuation over explicitly reconciled legacy-format prior issues without rewriting them', async () => {
    const f = phasedFixture();
    const first = await f.prepare();
    await f.finalize(first, await f.create(first));
    const prior = parseStructuredData(f.latest().body).bindings[0];
    const issue = f.issues.get(Number(prior.issue.slice(1)))!;
    issue.body = issue.body.replace(/^\*\*Stable work ID:\*\*.*\n/m, '')
      .replace('**Depends On:** None', '**Depends On:** — (none)');
    const legacyBody = issue.body;
    await f.bridge(f.latest());
    f.activate(2);
    const second = await f.prepare();
    await f.finalize(second, await f.create(second));
    const current = f.latest();
    await expect(f.prepare()).resolves.toMatchObject({ existingAcceptanceId: current.id });
    await expect(verifyPublishedActivation({ github: f.github, context: f.context, root: f.root, comment: current }))
      .resolves.toBeDefined();
    expect(issue.body).toBe(legacyBody);
    issue.body = issue.body.replace('**Depends On:** — (none)', '**Depends On:** #999');
    await expect(f.prepare()).rejects.toThrow(/dependency references/);
    expect(f.createIssue).toHaveBeenCalledTimes(4);
  });

  it.each([false, true])('continues three phases and reuses prior IDs (shared epic=%s)', async sharedEpic => {
    const f = phasedFixture(sharedEpic);
    for (const phase of [1, 2, 3]) {
      f.activate(phase);
      const capture = await f.prepare();
      expect(capture.operations.filter((operation: any) => operation.task).map((operation: any) => operation.task)).toEqual([String(phase)]);
      if (sharedEpic && phase > 1) expect(capture.operations).toHaveLength(1);
      const journal = await f.create(capture);
      await f.finalize(capture, journal);
      const source = f.latest();
      const artifact = parseStructuredData(source.body);
      expect(artifact.phases).toEqual(Array.from({ length: phase }, (_, index) => index + 1));
      expect(artifact.bindings).toHaveLength(phase);
      const trackers = [...f.comments.values()].filter(comment =>
        parseStructuredData(comment.body)?.squad_artifact === 'lifecycle-state');
      expect(trackers).toHaveLength(1);
      expect(trackers[0].body).toContain(phase === 3 ? '**State:** Activated' : '**State:** Partially activated');
      if (phase < 3) expect(trackers[0].body).toContain(`phase ${phase + 1}\``);
      expect(new Set(artifact.bindings.map((binding: any) => binding.issue)).size).toBe(phase);
      if (sharedEpic) expect(f.issues.get(Number(artifact.bindings[0].epic_issue.slice(1)))?.labels).toEqual(['squad']);
      const before = f.createIssue.mock.calls.length;
      expect(await f.prepare()).toMatchObject({ existingAcceptanceId: source.id });
      if (phase < 3) await f.bridge(source);
      expect(f.createIssue).toHaveBeenCalledTimes(before);
    }
    expect(f.createIssue).toHaveBeenCalledTimes(sharedEpic ? 4 : 6);
  });

  it('does not create the next phase without an explicit bridge', async () => {
    const f = phasedFixture();
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    f.activate(2);
    await expect(f.prepare()).rejects.toThrow(/prior-phase mapping bridge/);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });

  it.each(['request', 'plan', 'permission', 'competing'])('rejects a %s bridge before any next-phase creates', async mutation => {
    const f = phasedFixture();
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    const { result, comment } = await f.bridge(f.latest());
    if (mutation === 'request') comment.body += '\nChanged.';
    if (mutation === 'plan') f.comments.get(10)!.body += '\nChanged.';
    if (mutation === 'permission') f.permissions.set(operator.login, 'read');
    if (mutation === 'competing') f.comments.set(1500, f.comment(1500, result.body));
    f.activate(2);
    await expect(f.prepare()).rejects.toThrow();
    expect(f.createIssue).toHaveBeenCalledTimes(2);
  });

  it('blocks all recreation after a later-phase ambiguous API success', async () => {
    const f = phasedFixture();
    const capture = await f.prepare();
    await f.finalize(capture, await f.create(capture));
    await f.bridge(f.latest());
    f.activate(2);
    const next = await f.prepare();
    f.hooks.result = () => { throw new Error('connection lost after create'); };
    await expect(f.create(next)).rejects.toThrow(/connection lost/);
    f.env.GITHUB_RUN_ATTEMPT = '2';
    await expect(f.prepare()).rejects.toThrow(/pending activation/);
    expect(f.createIssue).toHaveBeenCalledTimes(3);
  });
});

describe('executing activation authority', () => {
  it.each(['permission', 'attempt', 'run'])('revalidates %s before creating', async mutation => {
    const f = fixture();
    const capture = await f.prepare();
    if (mutation === 'permission') f.permissions.set(operator.login, 'read');
    if (mutation === 'attempt') f.env.GITHUB_RUN_ATTEMPT = '2';
    if (mutation === 'run') f.env.GITHUB_RUN_ID = '901';
    await expect(f.create(capture)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
});

describe('authorized command output guard regression', () => {
  it.each(['admin', 'read'])('rejects the malformed old activation batch for %s independently of writer callbacks', async permission => {
    const f = fixture();
    const createComment = vi.fn();
    writeFileSync(f.outputPath, JSON.stringify({ items: [
      { type: 'create_issue', temporary_id: 'aw_wi1', title: 'Prepare example inputs', body: '**Owner:** Builder', labels: ['squad', 'squad:builder'] },
      { type: 'create_issue', temporary_id: 'aw_wi2', title: 'Example task 2', body: '**Depends On:** Task 1 (`aw_wi1`) — Prepare example inputs', labels: ['squad', 'squad:builder'] },
      { type: 'add_comment', issue_number: 42, body: [
        block('Activation bindings', [{ task: '1', issue: 'aw_wi1', agent: 'Builder', epic: 'origin', epic_issue: '#42' }]),
        block('Structured data', envelope('plan-accepted')),
      ].join('\n') },
    ] }));
    await expect(enforceSquadCommandContract({
      payload: f.context.payload, eventName: f.env.GITHUB_EVENT_NAME, actor: operator.login,
      resolvePermission: async () => permission, createComment, agentOutputPath: f.outputPath,
    })).rejects.toThrow(permission === 'admin' ? /trusted writer|activate_plan/ : /refused mutating|require write/);
    expect(createComment).not.toHaveBeenCalled();
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });

  it('allows the exact activate_plan request without running any writer', async () => {
    const f = fixture();
    const createComment = vi.fn();
    await expect(enforceSquadCommandContract({
      payload: f.context.payload, eventName: f.env.GITHUB_EVENT_NAME, actor: operator.login,
      resolvePermission: async () => 'admin', createComment, agentOutputPath: f.outputPath,
    })).resolves.toMatchObject({ status: 'accepted', mode: 'activate' });
    expect(createComment).not.toHaveBeenCalled();
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });
});
