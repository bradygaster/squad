/**
 * #1963: summaries describe actual per-issue outcomes. The model cannot observe
 * queued native writes; the trusted synchronous writer can, and must validate
 * live labels plus actual receipts before publishing acceptance.
 */
import { afterAll, describe, it, expect, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  activationRequest, createActivation, digest, finalizeActivation, prepareActivation,
  validateCreateReceipt,
} from '../workflows/shared/squad-activation.mjs';
import { parseRoster, parseStructuredData, validateBindings } from '../scripts/check-agent-binding.mjs';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-activation-summary');
afterAll(() => rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true }));

function workspace(prefix: string) {
  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  return mkdtempSync(join(TEST_WORKSPACES_DIR, prefix));
}
const readText = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const workflow = readText(join(WORKFLOWS_DIR, 'squad.md'));
const ontology = readText(join(WORKFLOWS_DIR, 'shared', 'squad-planning-ontology.md')).replace(/\s+/g, ' ');
const block = (heading: string, value: unknown) => `${heading}:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
const timestamp = '2026-01-01T00:00:00Z';
const bot = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };
const operator = { id: 700, login: 'operator', type: 'User' };
const paths = ['activate', 'plan accept', 'plan activate'] as const;

function fixture(command: string = 'activate', secondOwner = 'Kint') {
  const root = workspace('runtime-');
  mkdirSync(join(root, '.squad/casting'), { recursive: true });
  const registry = {
    schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1,
    generated_at: timestamp, transaction_id: 'summary-fixture',
    agents: Object.fromEntries(['Kint', 'McManus'].map(name => [name.toLowerCase(), {
      display_name: name, persistent_name: name, role: 'Engineer', universe: 'synthetic',
      status: 'active', created_at: timestamp, updated_at: timestamp,
    }])),
  };
  const history = {
    transaction_id: registry.transaction_id, registry_revision: 1,
    assignment_cast_snapshots: { genesis: { created_at: timestamp, agents: ['kint', 'mcmanus'], universe: 'synthetic' } },
    universe_usage_history: [{ universe: 'synthetic', used_at: timestamp }],
  };
  const registryRaw = JSON.stringify(registry);
  const historyRaw = JSON.stringify(history);
  writeFileSync(join(root, '.squad/casting/registry.json'), registryRaw);
  writeFileSync(join(root, '.squad/casting/history.json'), historyRaw);
  writeFileSync(join(root, '.squad/casting/registry-history.commit.json'), JSON.stringify({
    transaction_id: registry.transaction_id, registry_revision: 1,
    registry_sha256: digest(registryRaw), history_sha256: digest(historyRaw),
  }));
  writeFileSync(join(root, '.squad/team.md'),
    '## Members\n| Name | Role |\n|---|---|\n| Kint | Lead |\n| McManus | Engineer |\n');
  const outputPath = join(root, 'request.json');
  writeFileSync(outputPath, JSON.stringify({ items: [{ type: 'activate_plan', plan_comment_id: '10' }] }));
  const context = {
    repo: { owner: 'owner', repo: 'repo' }, actor: operator.login,
    payload: { action: 'created', sender: operator, issue: { number: 42, user: operator },
      comment: { id: 9, body: `/squad ${command}`, user: operator } },
  };
  const env = { GITHUB_EVENT_NAME: 'issue_comment', GITHUB_RUN_ID: '900', GITHUB_RUN_ATTEMPT: '1',
    SQUAD_WORKFLOW_SHA: 'a'.repeat(40) };
  const granular = command === 'plan activate';
  const envelope = (kind: string) => ({ squad_artifact: kind, schema_version: '1', origin_issue: 42, phases: [] });
  const comment = (id: number, body: string) => ({
    id, body, user: bot, created_at: timestamp, updated_at: timestamp,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/42',
    html_url: `https://github.com/owner/repo/issues/42#issuecomment-${id}`,
  });
  const planBody = [
    `| # | Title | ${granular ? 'Agent' : 'Owner'} | Agent ID | Depends On |${granular ? ' Epic |' : ''}`,
    `|---|---|---|---|---|${granular ? '---|' : ''}`,
    `| 1 | Same title | Kint | kint | None |${granular ? ' epic1 |' : ''}`,
    `| 2 | Same title | ${secondOwner} | ${secondOwner === '@copilot' ? '-' : secondOwner.toLowerCase()} | 1 |${granular ? ' epic1 |' : ''}`,
    block('Structured data', envelope(granular ? 'implementation' : 'plan')),
  ].join('\n');
  const comments = new Map([[10, comment(10, planBody)]]);
  if (granular) {
    comments.set(7, comment(7, block('Structured data', envelope('scope-accepted'))));
    comments.set(8, comment(8, block('Structured data', envelope('impl-accepted'))));
  }
  const issue = (number: number, values: Record<string, any> = {}) => ({
    number, id: number + 1000, node_id: `I_${number}`, body: '', labels: [],
    url: `https://api.github.com/repos/owner/repo/issues/${number}`,
    html_url: `https://github.com/owner/repo/issues/${number}`, ...values,
  });
  const issues = new Map<number, any>([[42, issue(42)]]);
  const parents = new Map<number, number>();
  const events: string[] = [];
  const rest = {
    repos: { getCollaboratorPermissionLevel: vi.fn(async () => ({ data: { permission: 'admin' } })) },
    issues: {
      get: vi.fn(async ({ issue_number }: any) => {
        events.push(`read:${issue_number}`);
        return { data: structuredClone(issues.get(issue_number)) };
      }),
      getComment: vi.fn(async ({ comment_id }: any) => ({ data: structuredClone(comments.get(comment_id)) })),
      listComments: vi.fn(async () => ({ data: structuredClone([...comments.values()]) })),
      getLabel: vi.fn(async () => { throw Object.assign(new Error('Missing'), { status: 404 }); }),
      createLabel: vi.fn(async () => ({ data: {} })),
      addSubIssue: vi.fn(async ({ issue_number, sub_issue_id }: any) => {
        const child = [...issues.values()].find(issue => issue.id === sub_issue_id);
        if (!child) throw new Error('Unknown child issue');
        parents.set(child.number, issue_number);
        return { data: {} };
      }),
      getParent: vi.fn(async ({ issue_number }: any) => {
        const parent = parents.get(issue_number);
        if (parent === undefined) throw Object.assign(new Error('Parent unavailable'), { status: 404 });
        return { data: structuredClone(issues.get(parent)) };
      }),
      createComment: vi.fn(async ({ body }: any) => {
        const value = comment(1000 + comments.size, body);
        events.push(`publish:${parseStructuredData(body)?.squad_artifact ?? 'pending'}`);
        comments.set(value.id, value);
        return { data: structuredClone(value) };
      }),
      updateComment: vi.fn(async ({ comment_id, body }: any) => {
        comments.get(comment_id)!.body = body;
        return { data: structuredClone(comments.get(comment_id)) };
      }),
    },
  };
  const github = { rest, paginate: vi.fn(async (method: any, params: any) => (await method(params)).data) };
  const createIssue = vi.fn(async (params: any) => {
    const value = issue(100 + issues.size, params);
    events.push(`create:${value.number}`);
    issues.set(value.number, structuredClone(value));
    return { staged: false, issue: value };
  });
  const prepare = () => prepareActivation({ github, context, env, root, outputPath, capturePath: join(root, 'capture.json') });
  const create = (capture: any) => createActivation({
    github, context, env, root, capture, captureArtifactId: 800, createIssue,
    journalPath: join(root, 'journal.json'), sanitizeContent: (value: string) => value,
    formatIssueBody: (value: string) => value,
  });
  const finalize = (capture: any, journal: any, receiptArtifactId = 801) =>
    finalizeActivation({ github, context, env, root, capture, journal, receiptArtifactId });
  const accepted = () => [...comments.values()].find(item =>
    ['plan-accepted', 'activated'].includes(parseStructuredData(item.body)?.squad_artifact));
  return { prepare, create, finalize, accepted, comments, issues, events, github, createIssue };
}

describe('gh-aw: trusted summaries report live outcomes, not intent (#1963)', () => {
  it('routes both public activation skills and the compatibility alias to one exact request', () => {
    expect(workflow).toContain('| `activate` | `squad-plan-accept` |');
    expect(workflow).toContain('| `plan activate` | `squad-plan-activate` |');
    expect(activationRequest([{ type: 'activate_plan', plan_comment_id: '10' }])).toBe(10);
    for (const type of ['create_issue', 'add_labels', 'add_comment', 'upsert_lifecycle_state']) {
      expect(() => activationRequest([
        { type: 'activate_plan', plan_comment_id: '10' }, { type },
      ])).toThrow(/exactly one activate_plan/);
    }
  });

  it.each(paths)('%s: a successful create is not evidence that its requested labels landed', async command => {
    const f = fixture(command);
    const capture = await f.prepare();
    const journal = await f.create(capture);
    f.issues.get(journal.receipts.at(-1).number).labels = ['squad'];
    await expect(f.finalize(capture, journal)).rejects.toThrow(/expected squad:kint/);
    expect(f.accepted()).toBeUndefined();
  });

  it.each(paths)('%s: checks the same issue, not another operation with the right label', async command => {
    const f = fixture(command, 'McManus');
    const capture = await f.prepare();
    const journal = await f.create(capture);
    const tasks = journal.receipts.filter((receipt: any) => receipt.operation_id.startsWith('task:'));
    f.issues.get(tasks[0].number).labels = ['squad', 'squad:mcmanus'];
    f.issues.get(tasks[1].number).labels = ['squad', 'squad:kint'];
    await expect(f.finalize(capture, journal)).rejects.toThrow(/expected squad:kint/);
    expect(f.accepted()).toBeUndefined();
  });

  it('never accepts the old create-returned-successfully attribution without live readback', async () => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    f.github.rest.issues.get.mockRejectedValueOnce(new Error('API read unavailable'));
    await expect(f.finalize(capture, journal)).rejects.toThrow('API read unavailable');
    expect(f.accepted()).toBeUndefined();
  });

  it.each(paths)('%s: publishes only after every live label is read back', async command => {
    const f = fixture(command);
    const capture = await f.prepare();
    const journal = await f.create(capture);
    f.events.length = 0;
    const evidence = await f.finalize(capture, journal);
    expect(evidence.basis).toBe('current-trusted-execution');
    const publication = f.events.findIndex(event => /^publish:(?:activated|plan-accepted)$/.test(event));
    expect(publication).toBeGreaterThan(-1);
    for (const receipt of journal.receipts) {
      expect(f.events.indexOf(`read:${receipt.number}`)).toBeGreaterThan(-1);
      expect(f.events.indexOf(`read:${receipt.number}`)).toBeLessThan(publication);
    }
  });

  it.each(paths)('%s: does not under-report a successfully observed owner label', async command => {
    const f = fixture(command);
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const artifact = parseStructuredData(f.accepted()!.body);
    expect(artifact.bindings).toHaveLength(2);
    for (const binding of artifact.bindings) {
      expect(binding.label).toBe('squad:kint');
      expect(binding.omission_reason).toBeUndefined();
    }
  });

  it.each(paths)('%s: reports external identity omissions against the exact task', async command => {
    const f = fixture(command, '@copilot');
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const bindings = parseStructuredData(f.accepted()!.body).bindings;
    expect(bindings[1]).toMatchObject({
      task: '2', agent: '@copilot', agent_id: null,
      identity_omission_reason: 'external-agent', label: 'squad:copilot',
    });
    expect(bindings[0].identity_omission_reason).toBeUndefined();
    if (command === 'plan activate') {
      expect(bindings[1]).toMatchObject({ epic_label: null, epic_omission_reason: 'multi-owner' });
    }
  });

  it.each(paths)('%s: rejects unknown owners before mutation rather than silently omitting their labels', async command => {
    const f = fixture(command, 'Visitor');
    await expect(f.prepare()).rejects.toThrow(/unknown non-roster owner/);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('makes an intentionally omitted multi-owner epic label visible in the human summary', async () => {
    const f = fixture('plan activate', 'McManus');
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const body = f.accepted()!.body;
    const omissionSection = body.match(/^#{2,6} Non-roster agent values\s*\n([\s\S]*?)(?=^#{2,6} |\nActivation bindings:|$)/m)?.[1];
    expect(omissionSection, '#1860: machine omission metadata must not replace the required human-visible explanation')
      .toBeDefined();
    expect(omissionSection).toContain('#101');
    expect(omissionSection?.toLowerCase()).toContain('kint');
    expect(omissionSection?.toLowerCase()).toContain('mcmanus');
  });

  it('withholds acceptance when durable receipts have not been uploaded', async () => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await expect(f.finalize(capture, journal, 0)).rejects.toThrow(/durable receipt artifact upload is missing/);
    expect(f.accepted()).toBeUndefined();
  });
});

describe('gh-aw: Activation bindings contain actual API issue references (#1963)', () => {
  it('rejects model-provided maps and bare-number placeholders at the request boundary', () => {
    for (const issue of ['#aw_task1', 'aw_task1', 101]) {
      expect(() => activationRequest([{ type: 'activate_plan', plan_comment_id: '10', issue }]))
        .toThrow(/exact numeric plan_comment_id/);
    }
    expect(workflow).not.toContain('"issue":{created task issue number}');
    expect(workflow).not.toContain('"epic_issue":{created epic issue number}');
  });

  it('serializes both task and epic actual references as valid quoted JSON', async () => {
    const f = fixture('plan activate');
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const body = f.accepted()!.body;
    const bindings = parseStructuredData(body).bindings;
    expect(body).toContain('"issue":"#102"');
    expect(body).toContain('"epic_issue":"#101"');
    expect(bindings.map((binding: any) => binding.issue)).toEqual(['#102', '#103']);
    expect(body).not.toMatch(/#?aw_/);
  });

  it('does not rely on text substitution, which can produce invalid JSON for bare tokens', () => {
    expect(() => JSON.parse('{"issue":#42}')).toThrow();
    expect(JSON.parse('{"issue":"#42"}')).toEqual({ issue: '#42' });
    expect(() => validateCreateReceipt({ staged: true, issue: { number: '#aw_task1' } },
      { id: 'task:1' }, { repository: 'owner/repo' })).toThrow(/actual issue/);
  });

  it('preserves actual IDs on reruns rather than creating or guessing replacements by title', async () => {
    const f = fixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const original = f.accepted()!;
    const bytes = original.body;
    expect(await f.prepare()).toEqual({ existingAcceptanceId: original.id });
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(f.accepted()!.body).toBe(bytes);
  });

  it('withholds acceptance for unresolved task or epic IDs in actual receipt journals', async () => {
    for (const index of [0, 1]) {
      const f = fixture('plan activate');
      const capture = await f.prepare();
      const journal = await f.create(capture);
      journal.receipts[index].number = '#aw_unresolved';
      await expect(f.finalize(capture, journal)).rejects.toThrow(/identities are missing or malformed/);
      expect(f.accepted()).toBeUndefined();
    }
  });

  it('documents current live-label evidence separately from legacy queued-operation records', () => {
    expect(ontology).toContain('Issue references are quoted, actual numeric references.');
    expect(ontology).toContain('Older records\' labels mean accepted operations, not proof that those operations landed.');
    expect(ontology).toContain('New finalization also checks the live result.');
    expect(ontology).toContain('Neither bare nor `#`-prefixed `aw_` tokens are valid consumable references.');
  });

  it('never upgrades an operator-authorized current-state supplement into historical attestation', () => {
    expect(ontology).toContain('basis: current-state-authorized');
    expect(ontology).toContain('supplement never claims historical attestation');
    expect(ontology).toContain('Only independently verified request evidence may authorize reader selection');
  });
});

describe('post-activation checker resolves binding references and fails closed (#1963)', () => {
  const roster = parseRoster('## Members\n| Name | Role |\n|---|---|\n| Kint | Lead |\n');
  const binding = (issue: unknown, epicIssue: unknown) => ({
    task: '1', issue, epic: '2.1', epic_issue: epicIssue, agent: 'Kint',
    epic_agents: ['kint'], label: 'squad:kint', epic_label: 'squad:kint',
  });
  const activated = (bindings: object[]) => ({
    squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [], bindings,
  });
  const labels = new Map([[42, new Set(['squad', 'squad:kint'])], [43, new Set(['squad', 'squad:kint'])]]);

  it('accepts resolved quoted references, including legacy substituted records', () => {
    expect(validateBindings(activated([binding('#42', '#43')]), roster, labels))
      .toMatchObject({ skipped: false, checked: 1, epics: 1 });
  });
  it('continues to accept bare integers in pre-contract artifacts', () => {
    expect(validateBindings(activated([binding(42, 43)]), roster, labels))
      .toMatchObject({ skipped: false, checked: 1 });
  });
  it.each(['#aw_task1', 'aw_task1'])('fails closed on unresolved task reference %s', reference => {
    expect(() => validateBindings(activated([binding(reference, '#43')]), roster, labels))
      .toThrow(/unresolved temporary ID/);
  });
  it('fails closed on an unresolved epic reference too', () => {
    expect(() => validateBindings(activated([binding('#42', '#aw_epic1')]), roster, labels))
      .toThrow('unresolved temporary ID');
  });
  it.each(['other/repo#42', ''])('rejects invalid or cross-repository reference %j', reference => {
    expect(() => validateBindings(activated([binding(reference, '#43')]), roster, labels))
      .toThrow('binding has no valid issue number');
  });
  it('keeps per-item correspondence across resolved references', () => {
    expect(() => validateBindings(activated([
      binding('#42', '#43'), { ...binding('#42', '#43'), task: '2' },
    ]), roster, labels)).toThrow('duplicate binding');
  });
});

describe('gh-aw: activation summary contract strict-compiles at the trusted boundary (#1963)', () => {
  let compiled: any;
  function compile(source = workflow) {
    const root = workspace('compile-');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    cpSync(WORKFLOWS_DIR, join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/squad.md'), source);
    const binary = process.env.SQUAD_GH_AW_BIN ?? 'gh';
    const prefix = process.env.SQUAD_GH_AW_BIN ? [] : ['aw'];
    execFileSync(binary, [...prefix, 'compile', '.github/workflows/squad.md', '--strict', '--approve', '--no-check-update'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    return parseYaml(readText(join(root, '.github/workflows/squad.lock.yml')));
  }
  function lock() {
    compiled ??= compile();
    return compiled;
  }
  function writer(document = lock()) {
    const jobs = Object.values(document.jobs) as any[];
    const matches = jobs.filter(job => job.steps?.some((step: any) =>
      step.with?.script?.includes('activation.finalizeActivation(')));
    expect(matches, 'compiled workflow must have exactly one trusted finalizer').toHaveLength(1);
    return matches[0];
  }
  function requireFinalizer(document: any) {
    const job = writer(document);
    const scripts = job.steps.map((step: any) => step.with?.script ?? '').join('\n');
    expect(scripts).toContain('createIssue, sanitizeContent,');
    expect(scripts).toContain('await activation.createActivation(');
    expect(scripts).toContain('await activation.finalizeActivation(');
    expect(scripts.indexOf('await activation.createActivation('))
      .toBeLessThan(scripts.indexOf('await activation.finalizeActivation('));
  }
  it('strict-compiles the workflow carrying the summary contract without skipping unavailable tools', () => {
    expect(lock().jobs.agent).toBeDefined();
    requireFinalizer(lock());
  });
  it('exposes one trusted activate_plan request rather than a label-acceptance summary producer', () => {
    const job = writer();
    expect(job.permissions.issues).toBe('write');
    expect(job.needs).toContain('safe_outputs');
    expect(job.if).toContain("contains(needs.agent.outputs.output_types, 'activate_plan')");
    const prepare = job.steps.find((step: any) => step.with?.script?.includes('activation.prepareActivation('));
    expect(prepare.with.script).toContain('outputPath: process.env.GH_AW_AGENT_OUTPUT');
    expect(prepare.env.GH_AW_AGENT_OUTPUT).toContain('agent_output.json');
  });
  it('persists actual capture and receipts before the trusted finalizer publishes bindings', () => {
    const steps = writer().steps;
    const uploads = steps.map((step: any, index: number) => ({ step, index }))
      .filter(({ step }: any) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(uploads).toHaveLength(2);
    const finalizer = steps.findIndex((step: any) => step.with?.script?.includes('activation.finalizeActivation('));
    expect(uploads.every(({ index }: any) => index < finalizer)).toBe(true);
    expect(uploads[1].step.if).toContain('always()');
    expect(steps[finalizer].env.RECEIPT_ARTIFACT_ID).toContain('artifact-id');
  });
  it('retains read-only model permissions while granting writes only to the trusted job', () => {
    expect(lock().jobs.agent.permissions.issues).toBe('read');
    expect(writer().permissions.issues).toBe('write');
  });
  it('strict-compiles a real source mutation and detects the missing finalizer despite unchanged summary prose', () => {
    const source = workflow.replace(
      /        - name: Validate actual bindings before publishing acceptance\n[\s\S]*?(?=    cast-failure:)/,
      '',
    );
    expect(source).not.toBe(workflow);
    const mutant = compile(source);
    expect(() => requireFinalizer(mutant)).toThrow(/exactly one trusted finalizer/);
  });
});
