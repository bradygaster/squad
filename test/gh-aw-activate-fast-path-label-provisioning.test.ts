/**
 * Fast-path activation uses one trusted request, frozen row identities and actual
 * receipts. Native temporary-ID label tools remain available only for other commands.
 */
import { afterAll, describe, it, expect, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  ACTIVATION_RECEIPT_SCHEMA, buildActivationBindings, digest, parseActivationPlan,
  validateCreateReceipt, validateReceiptSet,
} from '../workflows/shared/squad-activation.mjs';
import { enforceSquadCommandContract } from '../workflows/shared/squad-command-contract.mjs';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-fast-path-labels');
const workflow = readFileSync(join(WORKFLOWS_DIR, 'squad.md'), 'utf8').replace(/\r\n/g, '\n');
const acceptStart = workflow.indexOf('## skill: `squad-plan-accept`');
const acceptEnd = workflow.indexOf('## skill: `squad-plan-revise`');
const acceptSkill = workflow.slice(acceptStart, acceptEnd);
const timestamp = '2026-01-01T00:00:00Z';
const team = '## Members\n| Name | Role |\n|---|---|\n| Builder | Engineer |\n| Reviewer | Tester |';
const registry = {
  schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1,
  agents: Object.fromEntries(['Builder', 'Reviewer'].map(name => [name.toLowerCase(), {
    status: 'active', display_name: name, persistent_name: name, role: 'Engineer',
    universe: 'synthetic', created_at: timestamp, updated_at: timestamp,
  }])),
};
const table = (rows: string[]) => [
  '| # | Title | Owner | Agent ID | Depends On |', '|---|---|---|---|---|', ...rows,
].join('\n');
const rows = [
  '| build | Same title | Builder | builder | None |',
  '| review | Same title | Reviewer | reviewer | build |',
  '| assist | Assistant task | @copilot | - | review |',
];
const parse = (body = table(rows), roster = team, identities = registry) =>
  parseActivationPlan(body, 'plan', identities, roster);

afterAll(() => rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true }));

function workspace(prefix: string) {
  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  return mkdtempSync(join(TEST_WORKSPACES_DIR, prefix));
}

function captured(phased = false) {
  const plan = parse(`${phased ? '### Phase 1\n' : ''}${table(rows)}`);
  const operations = [
    ...plan.epics.map((epic: string) => ({ id: `epic:${epic}`, epic })),
    ...plan.tasks.map((task: any) => ({ id: `task:${task.id}`, task: task.id, epic: task.epic })),
  ];
  const capture = {
    repository: 'owner/repo', origin_issue: 42, run_id: 900, run_attempt: 1,
    plan, fullPlan: plan, operations, registry, phase: null,
  };
  const journal = {
    schema: ACTIVATION_RECEIPT_SCHEMA, repository: capture.repository,
    capture_sha256: digest(capture), run_id: 900, run_attempt: 1,
    started: operations.map(operation => operation.id),
    parent_fallbacks: [],
    receipts: operations.map((operation, index) => ({
      operation_id: operation.id, repository: capture.repository,
      number: 101 + index, id: 1001 + index, node_id: `I_${index}`,
      url: `https://github.com/owner/repo/issues/${101 + index}`,
    })),
  };
  return { capture, journal };
}

describe('gh-aw: fast-path request boundary', () => {
  it('routes activate to the shared trusted writer, not paired native tools', () => {
    expect(acceptStart).toBeGreaterThan(-1);
    expect(acceptEnd).toBeGreaterThan(acceptStart);
    expect(workflow).toContain('| `activate` | `squad-plan-accept` |');
    expect(acceptSkill).toContain('Call `activate_plan` exactly once');
    expect(acceptSkill).toContain('Do not call `create_issue`, `add_labels`, `add_comment`');
    expect(workflow.slice(workflow.indexOf('## skill: `squad-plan-activate`')))
      .toContain('Use the same `activate_plan` procedure');
  });

  async function enforce(command: string, items: unknown[]) {
    const outputPath = join(workspace('dispatch-'), 'output.json');
    writeFileSync(outputPath, JSON.stringify({ items }));
    const createComment = vi.fn();
    const user = { id: 700, login: 'operator', type: 'User' };
    const operation = enforceSquadCommandContract({
      payload: {
        action: 'created', sender: user, issue: { number: 42, user },
        comment: { id: 9, body: `/squad ${command}`, user },
      },
      eventName: 'issue_comment', actor: 'operator',
      resolvePermission: async () => 'admin', createComment, agentOutputPath: outputPath,
    });
    return { operation, createComment };
  }

  it.each(['activate', 'plan accept', 'plan activate'])('accepts only the plan reference for %s', async command => {
    const { operation, createComment } = await enforce(command, [{ type: 'activate_plan', plan_comment_id: '10' }]);
    await expect(operation).resolves.toMatchObject({ status: 'accepted', mode: command });
    expect(createComment).not.toHaveBeenCalled();
  });

  const unsafeItems = [
    ['native create with temporary ID', [{ type: 'create_issue', temporary_id: 'aw_wi1', title: 'Task' }]],
    ['paired native create and label', [
      { type: 'create_issue', temporary_id: 'aw_wi1', title: 'Task' },
      { type: 'add_labels', item_number: 'aw_wi1', labels: ['squad', 'squad:builder'] },
    ]],
    ['implicit origin label fallback', [{ type: 'add_labels', labels: ['squad:builder'] }]],
    ['borrowed or predicted issue number', [{ type: 'add_labels', item_number: 101, labels: ['squad'] }]],
    ['mixed trusted and native outputs', [
      { type: 'activate_plan', plan_comment_id: '10' }, { type: 'add_labels', item_number: 'aw_other', labels: ['squad'] },
    ]],
    ['model-supplied labels', [{ type: 'activate_plan', plan_comment_id: '10', labels: ['squad:visitor'] }]],
    ['model-supplied bindings', [{ type: 'add_comment', body: 'Activation bindings:\n[]' }]],
    ['model acceptance', [{ type: 'add_comment', data: { squad_artifact: 'plan-accepted' }, body: 'Accepted' }]],
    ['model lifecycle', [{ type: 'upsert_lifecycle_state', body: '**Current state:** Activated' }]],
    ['duplicate requests', [{ type: 'activate_plan', plan_comment_id: '10' }, { type: 'activate_plan', plan_comment_id: '10' }]],
  ] as const;
  it.each(unsafeItems)('rejects %s before writes in all activation modes', async (_name, items) => {
    for (const command of ['activate', 'plan accept', 'plan activate']) {
      const { operation, createComment } = await enforce(command, [...items]);
      await expect(operation).rejects.toThrow(/trusted writer|native issue creation/);
      expect(createComment).not.toHaveBeenCalled();
    }
  });
});

describe('gh-aw: frozen fast-path owner and actual-ID correspondence', () => {
  it.each([
    ['Azure Frontend', 'azure-frontend'],
    ['Dr. Example', 'dr-example'],
    ['--Release_Lead--', 'release-lead'],
  ])('derives the actual task and epic label from certified display name %s', (name, slug) => {
    const identities = structuredClone(registry);
    identities.agents.builder.display_name = name;
    identities.agents.builder.persistent_name = name;
    const plan = parse(`### Phase 1\n${table([`| build | Example | ${name} | builder | None |`])}`,
      team.replace('Builder', name), identities);
    const operations = [{ id: 'epic:phase-1', epic: 'phase-1' }, { id: 'task:build', task: 'build', epic: 'phase-1' }];
    const capture = {
      repository: 'owner/repo', origin_issue: 42, run_id: 900, run_attempt: 1,
      plan, fullPlan: plan, operations, registry: identities, phase: 1,
    };
    const journal = {
      schema: ACTIVATION_RECEIPT_SCHEMA, repository: capture.repository,
      capture_sha256: digest(capture), run_id: 900, run_attempt: 1, parent_fallbacks: [],
      started: operations.map(operation => operation.id),
      receipts: operations.map((operation, index) => ({
        operation_id: operation.id, repository: capture.repository, number: 101 + index,
        id: 1001 + index, node_id: `I_${index}`, url: `https://github.com/owner/repo/issues/${101 + index}`,
      })),
    };
    expect(buildActivationBindings(capture, journal)).toMatchObject([
      { label: `squad:${slug}`, epic_label: `squad:${slug}`, agent_id: 'builder' },
    ]);
  });

  it('rejects ambiguous certified display-name slugs before producing a plan', () => {
    const identities = structuredClone(registry);
    identities.agents.builder.display_name = 'Foo Bar';
    identities.agents.builder.persistent_name = 'Foo Bar';
    identities.agents.reviewer.display_name = 'Foo-Bar';
    identities.agents.reviewer.persistent_name = 'Foo-Bar';
    expect(() => parse(table(['| build | Example | Foo Bar | builder | None |']),
      team.replace('Builder', 'Foo Bar').replace('Reviewer', 'Foo-Bar'), identities))
      .toThrow(/slug.*ambiguous/);
  });

  it('uses each row owner and explicitly maps @copilot without inheriting the prior owner', () => {
    expect(parse().tasks.map((task: any) => [task.id, task.agent_id, task.label])).toEqual([
      ['build', 'builder', 'squad:builder'], ['review', 'reviewer', 'squad:reviewer'],
      ['assist', null, 'squad:copilot'],
    ]);
    expect(parse().tasks[2].label).not.toBe('squad:@copilot');
  });

  it('keeps distinct stable tasks with the same title instead of title-deduplicating them', () => {
    expect(parse().tasks.slice(0, 2).map((task: any) => task.id)).toEqual(['build', 'review']);
  });

  it('rejects duplicate stable IDs rather than last-writer-wins mappings', () => {
    expect(() => parse(table([...rows, rows[0]]))).toThrow(/stable task IDs.*duplicated/);
  });

  it.each([
    ['borrowed identity', rows[0].replace('| builder |', '| reviewer |'), /Agent ID/],
    ['invented identity', rows[0].replace('| builder |', '| invented |'), /Agent ID/],
    ['non-roster asserted identity', rows[0].replace('| Builder |', '| Visitor |'), /unknown non-roster owner/],
  ] as const)('rejects %s before producing a label binding', (_name, row, reason) => {
    expect(() => parse(table([row]))).toThrow(reason);
  });

  it('refuses an unreadable roster rather than treating it as an empty certified set', () => {
    expect(() => parse(table(rows), 'not a roster')).toThrow();
  });

  it('does not certify an inactive frozen owner', () => {
    const identities = structuredClone(registry);
    identities.agents.builder.status = 'inactive';
    expect(() => parse(table(rows), team, identities)).toThrow(/active frozen roster owner/);
  });

  it('uses only actual receipt numbers for task, parent and dependency bindings', () => {
    const { capture, journal } = captured();
    const bindings = buildActivationBindings(capture, journal);
    expect(bindings.map((binding: any) => [binding.task, binding.issue, binding.epic_issue, binding.depends_on]))
      .toEqual([['build', '#101', '#42', []], ['review', '#102', '#42', ['#101']], ['assist', '#103', '#42', ['#102']]]);
    expect(bindings.every((binding: any) => binding.epic_label === null && binding.epic_omission_reason === 'origin')).toBe(true);
  });

  it('records multi-owner parent omission without choosing any task owner for the epic', () => {
    const { capture, journal } = captured(true);
    const bindings = buildActivationBindings(capture, journal);
    expect(bindings.every((binding: any) => binding.epic_issue === '#101' &&
      binding.epic_label === null && binding.epic_omission_reason === 'multi-owner')).toBe(true);
    expect(bindings[0].epic_agents).toEqual(['@copilot', 'builder', 'reviewer']);
    expect(bindings.map((binding: any) => binding.label)).toEqual(['squad:builder', 'squad:reviewer', 'squad:copilot']);
  });

  it.each(['aw_wi1', '#aw_wi1', 0, 1.5])('rejects non-actual receipt number %s', number => {
    const { capture, journal } = captured();
    (journal.receipts[0] as any).number = number;
    expect(() => validateReceiptSet(capture, journal)).toThrow(/identities.*malformed/);
  });

  it('rejects staged output instead of waiting for a native queued result', () => {
    const { capture } = captured();
    expect(() => validateCreateReceipt({ staged: true, temporary_id: 'aw_wi1' }, capture.operations[0], capture))
      .toThrow(/did not return an actual issue/);
  });

  it('cannot borrow a receipt, change repositories, or report an uncreated operation', () => {
    for (const mutate of [
      (journal: any) => { journal.receipts[1] = { ...journal.receipts[0], operation_id: 'task:review' }; },
      (journal: any) => { journal.receipts[0].repository = 'other/repo'; },
      (journal: any) => { journal.receipts.pop(); },
      (journal: any) => { journal.started.reverse(); },
    ]) {
      const { capture, journal } = captured();
      mutate(journal);
      expect(() => validateReceiptSet(capture, journal)).toThrow();
    }
  });
});

describe('gh-aw: native compiled policy remains bounded outside activation', () => {
  let compiledLock: string | null = null;
  function lockText() {
    if (compiledLock !== null) return compiledLock;
    const compiler = process.env.SQUAD_GH_AW_BIN ?? 'gh';
    const prefix = process.env.SQUAD_GH_AW_BIN ? [] : ['aw'];
    const version = spawnSync(compiler, [...prefix, '--version'], { encoding: 'utf8' });
    expect(version.status, 'Supported gh-aw is required; this contract never skips').toBe(0);
    expect(`${version.stdout}\n${version.stderr}`).toContain('v0.91.5');
    const root = workspace('compile-');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    cpSync(WORKFLOWS_DIR, join(root, '.github/workflows'), { recursive: true });
    execFileSync(compiler, [...prefix, 'compile', '.github/workflows/squad.md', '--strict', '--no-check-update'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    const lockPath = join(root, '.github/workflows/squad.lock.yml');
    expect(existsSync(lockPath)).toBe(true);
    compiledLock = readFileSync(lockPath, 'utf8').replace(/\r\n/g, '\n');
    return compiledLock;
  }

  it('strict-compiles the workflow containing the trusted activation request', () => {
    expect(lockText()).toContain('activate_plan');
  });
  it('retains native add_labels and create_issue tools for unrelated commands', () => {
    expect(lockText()).toMatch(/"tools":\[[^\]]*"add_labels"[^\]]*\]/);
    expect(lockText()).toMatch(/"tools":\[[^\]]*"create_issue"[^\]]*\]/);
  });
  it('retains bounded native label provisioning, not arbitrary label creation', () => {
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"add_labels":\{[^}]*"create_if_missing":true/);
    expect(compiled).toMatch(/"add_labels":\{[^}]*"allowed":\["squad","squad:\*"\]/);
  });
  it('retains native temporary-ID enforcement without using it as activation authority', () => {
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"create_issue":\{[^}]*"require_temporary_id":true/);
    expect(compiled).toMatch(/"required_field_additions":\s*\{\s*"create_issue":\s*\[\s*"temporary_id"\s*\]/);
  });
  it('keeps issue writes outside the model agent job', () => {
    const compiled = lockText();
    const start = compiled.indexOf('\n  agent:\n');
    const end = compiled.indexOf('\n  safe_outputs:\n');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const permissions = compiled.slice(start, end).match(/permissions:\n((?:\s{6}\S.*\n)+)/)?.[1];
    expect(permissions).toContain('issues: read');
    expect(permissions).not.toContain('issues: write');
  });
});
