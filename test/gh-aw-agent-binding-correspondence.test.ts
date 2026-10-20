/**
 * #1859/#1860: membership is not per-task correspondence. Exercise the trusted
 * parser, receipt mapper and checker instead of the removed model create rules.
 */
import { describe, it, expect } from 'vitest';
import {
  ACTIVATION_RECEIPT_SCHEMA, buildActivationBindings, digest, frozenAssignments,
  parseActivationPlan,
} from '../workflows/shared/squad-activation.mjs';
import {
  parseAgentRegistry, parseRoster, validateActivation,
} from '../workflows/shared/check-agent-binding.mjs';

const team = '## Members\n| Name | Role |\n|---|---|\n| Kint | Lead |\n| McManus | Engineer |\n';
const registry = {
  schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1,
  generated_at: '2026-01-01T00:00:00Z',
  agents: Object.fromEntries(['Kint', 'McManus'].map(name => [name.toLowerCase(), {
    display_name: name, persistent_name: name, role: 'Engineer', universe: 'synthetic',
    status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }])),
};
const table = (rows: string[]) => [
  '| # | Title | Agent | Agent ID | Depends On | Epic |',
  '|---|---|---|---|---|---|', ...rows,
].join('\n');
const rows = [
  '| 1 | Same title | Kint | kint | None | mixed |',
  '| 2 | Same title | McManus | mcmanus | 1 | mixed |',
  '| 3 | Solo task | McManus | mcmanus | 2 | solo |',
];

function fixture(body = table(rows), phase: number | null = null) {
  const fullPlan = parseActivationPlan(body, 'implementation', registry, team);
  const plan = structuredClone(fullPlan);
  if (phase !== null) {
    plan.tasks = plan.tasks.filter((task: any) => task.phase === phase);
    plan.epics = [...new Set(plan.tasks.map((task: any) => task.epic))];
  }
  const operations = [
    ...plan.epics.map((epic: string) => ({ id: `epic:${epic}` })),
    ...plan.tasks.map((task: any) => ({ id: `task:${task.id}` })),
  ];
  const capture = {
    repository: 'owner/repo', origin_issue: 42, run_id: 900, run_attempt: 1,
    registry, plan, fullPlan, phase, operations,
  };
  const journal = {
    schema: ACTIVATION_RECEIPT_SCHEMA, capture_sha256: digest(capture),
    repository: capture.repository, run_id: capture.run_id, run_attempt: 1,
    started: operations.map(operation => operation.id),
    parent_fallbacks: [],
    receipts: operations.map((operation, index) => ({
      operation_id: operation.id, repository: capture.repository,
      number: 101 + index, id: 1001 + index, node_id: `I_${index}`,
      url: `https://github.com/owner/repo/issues/${101 + index}`,
    })),
  };
  const bindings = buildActivationBindings(capture, journal);
  const artifact = {
    squad_artifact: phase === null ? 'activated' : 'phases-activated',
    schema_version: '1', origin_issue: 42, phases: phase === null ? [] : [phase], bindings,
  };
  // Independent expectations: never derive actual API labels from the output under test.
  const labels = new Map<number, Set<string>>([
    [101, new Set(['squad'])], [102, new Set(['squad', 'squad:mcmanus'])],
    [103, new Set(['squad', 'squad:kint'])], [104, new Set(['squad', 'squad:mcmanus'])],
    [105, new Set(['squad', 'squad:mcmanus'])],
  ]);
  const check = () => validateActivation(artifact, parseRoster(team), labels, 42, {
    repository: capture.repository, registry: parseAgentRegistry(registry),
    epicAssignments: frozenAssignments(fullPlan),
  });
  return { capture, journal, bindings, artifact, labels, check };
}

describe('gh-aw: agent-binding correspondence (#1859, #1860)', () => {
  it('executes both epic and task mapping boundaries, with distinct receipt identities', () => {
    const f = fixture();
    expect(f.capture.operations.map(operation => operation.id)).toEqual([
      'epic:mixed', 'epic:solo', 'task:1', 'task:2', 'task:3',
    ]);
    expect(f.bindings.map((binding: any) => [binding.task, binding.issue, binding.epic_issue]))
      .toEqual([['1', '#103', '#101'], ['2', '#104', '#101'], ['3', '#105', '#102']]);
    expect(() => f.check()).not.toThrow();
  });

  it("binds each task to its own frozen Agent cell even when titles are identical", () => {
    const f = fixture();
    expect(f.bindings.map((binding: any) => [binding.task, binding.agent, binding.agent_id, binding.label]))
      .toEqual([
        ['1', 'Kint', 'kint', 'squad:kint'],
        ['2', 'McManus', 'mcmanus', 'squad:mcmanus'],
        ['3', 'McManus', 'mcmanus', 'squad:mcmanus'],
      ]);
  });

  it.each(['previous task', 'parent epic'])('rejects inheriting the %s certified owner', source => {
    const f = fixture();
    const target = f.bindings[1];
    if (source === 'previous task') {
      target.agent = 'Kint';
      target.agent_id = 'kint';
      target.label = 'squad:kint';
      f.labels.set(104, new Set(['squad', 'squad:kint']));
    } else {
      // #1859: substitute a different but certified parent owner.
      target.label = 'squad:kint';
      f.labels.set(104, new Set(['squad', 'squad:kint']));
    }
    expect(() => f.check()).toThrow();
  });

  it('derives each epic from only its own tasks and never chooses one of multiple owners', () => {
    const f = fixture();
    expect(f.bindings[0]).toMatchObject({
      epic_agents: ['kint', 'mcmanus'], epic_label: null, epic_omission_reason: 'multi-owner',
    });
    expect(f.bindings[2]).toMatchObject({ epic_agents: ['mcmanus'], epic_label: 'squad:mcmanus' });
    f.bindings[0].epic_label = 'squad:kint';
    f.labels.set(101, new Set(['squad', 'squad:kint']));
    expect(() => f.check()).toThrow();
  });

  it('checks full-plan epic ownership even when the selected phase has only one owner', () => {
    const f = fixture([
      '### Phase 1', table([rows[0]]), '### Phase 2',
      table(['| 2 | Future task | McManus | mcmanus | 1 | mixed |']),
    ].join('\n'), 1);
    f.labels.clear();
    f.labels.set(101, new Set(['squad']));
    f.labels.set(102, new Set(['squad', 'squad:kint']));
    expect(f.bindings[0]).toMatchObject({
      epic_agents: ['kint', 'mcmanus'], epic_agent_ids: ['kint', 'mcmanus'],
      epic_label: null, epic_omission_reason: 'multi-owner',
    });
    expect(() => f.check()).not.toThrow();
    f.bindings[0].epic_agents = ['kint'];
    f.bindings[0].epic_agent_ids = ['kint'];
    f.bindings[0].epic_label = 'squad:kint';
    f.labels.set(101, new Set(['squad', 'squad:kint']));
    expect(() => f.check()).toThrow();
  });

  it('rejects a correct roster label on the wrong issue, despite run-wide membership', () => {
    const f = fixture();
    f.labels.set(103, new Set(['squad', 'squad:mcmanus']));
    f.labels.set(104, new Set(['squad', 'squad:kint']));
    expect(() => f.check()).toThrow();
  });

  it('requires live labels, not merely planned labels or a successful issue receipt', () => {
    const f = fixture();
    f.labels.set(102, new Set(['squad']));
    expect(() => f.check()).toThrow();
    f.labels.set(102, new Set(['squad', 'squad:mcmanus']));
    expect(() => f.check()).not.toThrow();
  });

  it('preserves explicit omission reasons rather than presenting multi-owner epics as clean bindings', () => {
    const f = fixture();
    expect(f.bindings.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ epic: 'mixed', epic_label: null, epic_omission_reason: 'multi-owner' }),
    ]));
    delete f.bindings[0].epic_omission_reason;
    expect(() => f.check()).toThrow();
  });

  it('fails before receipts when an owner is a role or its stable identity was remapped', () => {
    expect(() => fixture(table([rows[0].replace('Kint | kint', 'Lead | -')]))).toThrow();
    expect(() => fixture(table([rows[0].replace('Kint | kint', 'Kint | mcmanus')]))).toThrow();
  });
});
