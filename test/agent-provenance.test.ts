import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildActivationBindings,
  digest as activationDigest,
  frozenAssignments,
} from '../workflows/shared/squad-activation.mjs';
import { selectActivationRecord as selectChecker } from '../workflows/shared/check-agent-binding.mjs';
import { selectActivationRecord as selectBuiltSdk } from '../packages/squad-sdk/dist/casting/index.js';
import {
  AgentProvenanceError,
  parseAgentProvenanceRegistry,
  parseWorkAgentBindings,
  reconcileAgentProvenanceRegistry,
  selectActivationRecord,
  type ActivationRecord,
  type EpicAssignment,
  type ReconciliationEvidence,
  type WorkAgentBinding,
} from '../packages/squad-sdk/src/casting/index.js';

function fixture(
  name:
    | 'valid'
    | 'partial'
    | 'unsupported'
    | 'binding_valid'
    | 'binding_partial'
    | 'binding_epic_conflict'
    | 'binding_inconsistent_epic_sets'
    | 'binding_mixed_omission'
    | 'binding_mixed_revision',
): unknown {
  const cases = JSON.parse(
    readFileSync(join('test', 'fixtures', 'agent-provenance', 'cases.json'), 'utf8'),
  ) as Record<string, unknown>;
  return structuredClone(cases[name]);
}

describe('agent identity provenance contract', () => {
  it('keeps this repository on the complete producer contract', () => {
    const committed = JSON.parse(
      readFileSync(join('.squad', 'casting', 'registry.json'), 'utf8'),
    ) as unknown;

    expect(parseAgentProvenanceRegistry(committed)).toMatchObject({
      completeness: 'complete',
      registry: { schema: 'squad-agent-provenance/v1', revision: 1 },
    });
  });

    describe('verified activation selection', () => {
      const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
      const section = (label: string, value: unknown): string =>
        `${label}:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
      const registry = () => parseAgentProvenanceRegistry(fixture('valid')).registry;
      const bindings = (artifact: WorkAgentBinding['artifact'] = 'activated'): WorkAgentBinding[] =>
        (fixture('binding_valid') as WorkAgentBinding[]).map((binding) => ({
          ...binding, repository: 'owner/repo', artifact,
        }));
      const body = (
        artifact: WorkAgentBinding['artifact'] = 'activated',
        rows: unknown = bindings(artifact),
        originIssue = 45,
        phases: readonly number[] = [1],
      ): string => [
        section('Structured data', {
          squad_artifact: artifact, schema_version: '1', origin_issue: originIssue, phases,
        }),
        section('Activation bindings', rows),
      ].join('\n\n');
      const context = (reconciliations: readonly ReconciliationEvidence[] = []) => ({
        repository: 'owner/repo', originIssue: 45, reconciliations,
      });
      function reconciled(sourceBody = body('activated', [{ issue: 'temporary-task' }], 45, [])) {
        const source = { id: 10, body: sourceBody };
        const rows = bindings('activation-reconciled');
        const currentRegistry = registry();
        const evidence: ReconciliationEvidence = {
          requestCommentId: 20,
          requestSha256: digest('verified request'),
          actorId: 30,
          sourceCommentId: source.id,
          sourceSha256: digest(source.body),
          planSha256: digest('frozen current plan'),
          registrySha256: digest(JSON.stringify(currentRegistry)),
          bindingsSha256: digest(JSON.stringify(rows)),
        };
        const metadata = {
          schema: 'squad-activation-reconciliation/v1',
          basis: 'current-state-authorized',
          request_comment_id: evidence.requestCommentId,
          request_sha256: evidence.requestSha256,
          actor_id: evidence.actorId,
          supersedes_comment_id: evidence.sourceCommentId,
          supersedes_sha256: evidence.sourceSha256,
          plan_sha256: evidence.planSha256,
          registry_sha256: evidence.registrySha256,
          bindings_sha256: evidence.bindingsSha256,
        };
        const replacement = (changes: Record<string, unknown> = {}): ActivationRecord => ({
          id: 40,
          body: `${body('activation-reconciled', rows, 45, [])}\n\n${section('Activation reconciliation', {
            ...metadata, ...changes,
          })}`,
        });
        return { source, rows, currentRegistry, evidence, metadata, replacement };
      }

      function pendingReconciled(changes: Record<string, unknown> = {}) {
        const pending = {
          schema: 'squad-activation-pending/v1',
          repository: 'owner/repo',
          origin_issue: 45,
          run_id: 100,
          run_attempt: 1,
          capture_sha256: digest('frozen capture'),
          capture_artifact_id: 200,
          plan_comment_id: 300,
          plan_sha256: digest('frozen current plan'),
          registry_sha256: digest(JSON.stringify(registry())),
          phases: [],
          ...changes,
        };
        const test = reconciled(`Pending reservation\n\n\`\`\`json\n${JSON.stringify(pending)}\n\`\`\``);
        const evidence: ReconciliationEvidence = { ...test.evidence, sourceKind: 'pending' };
        return {
          ...test, evidence, pending,
          record: test.replacement({ supersedes_kind: 'pending' }),
        };
      }

      it('selects explicit current-state reconciliation of a verified pending reservation', () => {
        const test = pendingReconciled();
        const original = test.source.body;
        expect(selectActivationRecord(
          [test.source, test.record], test.currentRegistry, context([test.evidence]),
        )).toEqual({ id: 40, artifact: 'activation-reconciled', bindings: test.rows });
        expect(test.source.body).toBe(original);
        expect(selectActivationRecord([test.source], test.currentRegistry, context())).toBeUndefined();
      });

      it('accepts pending phase scope only when independently verified for both records', () => {
        const test = pendingReconciled({ phases: [1, 3] });
        const record = { ...test.record, body: test.record.body.replace('"phases":[]', '"phases":[1,3]') };
        expect(selectActivationRecord(
          [test.source, record], test.currentRegistry, context([{ ...test.evidence, phases: [1, 3] }]),
        )?.id).toBe(40);
        expect(() => selectActivationRecord(
          [test.source, test.record], test.currentRegistry, context([test.evidence]),
        )).toThrow(/pending source/);
      });

      it('requires independent pending authorization and the explicit metadata source kind', () => {
        const test = pendingReconciled();
        const { sourceKind: _kind, ...activationEvidence } = test.evidence;
        for (const [record, evidence] of [
          [test.record, activationEvidence],
          [test.replacement(), test.evidence],
          [test.replacement(), activationEvidence],
          [test.replacement({ supersedes_kind: 'activation' }), activationEvidence],
          [test.record, { ...test.evidence, sourceKind: 'unknown' }],
        ] as Array<[ActivationRecord, ReconciliationEvidence]>) {
          expect(() => selectActivationRecord(
            [test.source, record], test.currentRegistry, context([evidence]),
          )).toThrow(AgentProvenanceError);
        }
        expect(() => selectActivationRecord(
          [test.source, test.record], test.currentRegistry, context(),
        )).toThrow(/matching verifier evidence/);
      });

      it.each([
        ['schema', 'unknown'],
        ['repository', 'other/repo'],
        ['origin_issue', 99],
        ['run_id', 0],
        ['run_attempt', 1.5],
        ['capture_artifact_id', Number.MAX_SAFE_INTEGER + 1],
        ['plan_comment_id', '300'],
        ['capture_sha256', 'A'.repeat(64)],
        ['plan_sha256', 'a'.repeat(64)],
        ['registry_sha256', 'a'.repeat(64)],
        ['phases', [2, 1]],
        ['phases', [1, 1]],
        ['phases', [0]],
        ['phases', null],
      ])('rejects a pending source with invalid %s even when its body digest matches', (field, value) => {
        const test = pendingReconciled({ [field]: value });
        expect(() => selectActivationRecord(
          [test.source, test.record], test.currentRegistry, context([test.evidence]),
        )).toThrow(/pending source/);
      });

      it('rejects tampered pending bodies and ambiguous or malformed bare JSON fences', () => {
        const test = pendingReconciled();
        expect(() => selectActivationRecord(
          [{ ...test.source, body: `${test.source.body}\n` }, test.record],
          test.currentRegistry, context([test.evidence]),
        )).toThrow(/source body digest/);
        for (const sourceBody of [
          `${test.source.body}\n\n\`\`\`json\n{}\n\`\`\``,
          test.source.body.replace('```json', '```text'),
          test.source.body.replace(JSON.stringify(test.pending), '{invalid-json'),
          'No JSON reservation',
          body(),
        ]) {
          const invalid = reconciled(sourceBody);
          expect(() => selectActivationRecord(
            [invalid.source, invalid.replacement({ supersedes_kind: 'pending' })],
            invalid.currentRegistry, context([{ ...invalid.evidence, sourceKind: 'pending' }]),
          )).toThrow(AgentProvenanceError);
        }
      });

      it('does not let pending prior references select or supersede other acceptances', () => {
        const test = pendingReconciled({
          prior: { comment_id: 11, artifact: 'activation-reconciled', authorized: true },
        });
        expect(selectActivationRecord([test.source], test.currentRegistry, context())).toBeUndefined();
        expect(selectActivationRecord(
          [test.source, test.record], test.currentRegistry, context([test.evidence]),
        )?.id).toBe(40);
        const prior = { id: 11, body: body() };
        expect(() => selectActivationRecord(
          [test.source, test.record, prior], test.currentRegistry, context([test.evidence]),
        )).toThrow(/Ambiguous unsuperseded/);
        expect(selectActivationRecord(
          [test.source, prior], test.currentRegistry, context(),
        )?.id).toBe(11);
      });

      it('still rejects incomplete bindings when a pending source is explicitly verified', () => {
        const test = pendingReconciled();
        const rows = [{ ...test.rows[0]!, issue: 'temporary-task' }];
        const hash = digest(JSON.stringify(rows));
        const record = test.replacement({ supersedes_kind: 'pending', bindings_sha256: hash });
        record.body = record.body.replace(JSON.stringify(test.rows), JSON.stringify(rows));
        expect(() => selectActivationRecord(
          [test.source, record], test.currentRegistry,
          context([{ ...test.evidence, bindingsSha256: hash }]),
        )).toThrow(/Work-agent bindings are malformed or partial/);
      });

      it('preserves explicit activation source evidence without changing legacy metadata', () => {
        const test = reconciled();
        expect(selectActivationRecord(
          [test.source, test.replacement()], test.currentRegistry,
          context([{ ...test.evidence, sourceKind: 'activation' }]),
        )?.id).toBe(40);
      });

      it.each(['activated', 'phases-activated', 'plan-accepted', 'phases-accepted'] as const)(
        'selects one valid legacy %s record unchanged',
        (artifact) => {
          expect(selectActivationRecord([{ id: 10, body: body(artifact) }], registry(), context()))
            .toEqual({ id: 10, artifact, bindings: bindings(artifact) });
        },
      );

      it.each([['1'], [0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], [1, 1]])(
        'rejects malformed legacy phase scope %j in both readers',
        (...phases) => {
          for (const artifact of ['activated', 'phases-activated', 'plan-accepted', 'phases-accepted'] as const) {
            const rows = bindings(artifact).map(binding => ({
              ...binding, agent: 'Kepler', epic_agents: ['kepler'],
              label: 'squad:kepler', epic_label: 'squad:kepler', depends_on: [],
            }));
            const valid = { id: 10, body: body(artifact, rows) };
            const record = { ...valid, body: valid.body.replace('"phases":[1]', `"phases":${JSON.stringify(phases)}`) };
            for (const select of [selectActivationRecord, selectChecker]) {
              expect(select([valid], registry(), context())?.id).toBe(10);
              expect(() => select([record], registry(), context())).toThrow(/phase/);
            }
          }
        },
      );

      it('preserves valid legacy phase scopes with SDK/checker parity', () => {
        for (const phases of [[], [1], [3, 1], [Number.MAX_SAFE_INTEGER]]) {
          const rows = bindings().map(binding => ({
            ...binding, agent: 'Kepler', epic_agents: ['kepler'],
            label: 'squad:kepler', epic_label: 'squad:kepler', depends_on: [],
          }));
          const record = { id: 10, body: body('activated', rows, 45, phases) };
          expect(selectChecker([record], registry(), context()))
            .toMatchObject(selectActivationRecord([record], registry(), context())!);
        }
      });

      it('returns undefined for no relevant activation and ignores unrelated comments', () => {
        expect(selectActivationRecord([
          { id: 1, body: 'Discussion only' },
          { id: 2, body: section('Structured data', { squad_artifact: 'plan' }) },
          { id: 3, body: body('activated', bindings(), 99) },
        ], registry(), context())).toBeUndefined();
      });

      it('selects verified current-state bindings without modifying invalid historical acceptance', () => {
        const test = reconciled();
        const original = test.source.body;
        const selected = selectActivationRecord(
          [test.replacement(), test.source], test.currentRegistry, context([test.evidence]),
        );
        expect(selected).toEqual({
          id: 40, artifact: 'activation-reconciled', bindings: test.rows,
        });
        expect(test.source.body).toBe(original);
        expect(selected!.bindings.every((binding) =>
          Number.isSafeInteger(Number(binding.issue.replace(/^#/, '')))
          && Number.isSafeInteger(Number(binding.epic_issue.replace(/^#/, ''))))).toBe(true);
        expect(selected!.bindings[0]!.agent_id).toBe('runtime-engineer');
        expect(() => selectActivationRecord([test.source], test.currentRegistry, context()))
          .toThrow(AgentProvenanceError);
      });

      it('accepts explicit supersession of malformed original binding JSON', () => {
        const test = reconciled(body('activated', bindings(), 45, []).replace(JSON.stringify(bindings()), '{not JSON'));
        expect(selectActivationRecord(
          [test.source, test.replacement()], test.currentRegistry, context([test.evidence]),
        )?.id).toBe(40);
      });

      it('does not trust artifact metadata or authorized booleans without verifier evidence', () => {
        const test = reconciled(body());
        for (const replacement of [test.replacement(), test.replacement({ authorized: true })]) {
          expect(() => selectActivationRecord(
            [test.source, replacement], test.currentRegistry, context(),
          )).toThrow(AgentProvenanceError);
        }
        expect(() => selectActivationRecord(
          [test.source], test.currentRegistry, context([test.evidence]),
        )).toThrow(/no matching activation record/);
      });

      it.each([
        ['request_comment_id', 21],
        ['actor_id', 31],
        ['supersedes_comment_id', 11],
        ['request_sha256', 'a'.repeat(64)],
        ['supersedes_sha256', 'a'.repeat(64)],
        ['plan_sha256', 'a'.repeat(64)],
        ['registry_sha256', 'a'.repeat(64)],
        ['bindings_sha256', 'a'.repeat(64)],
      ])('requires independently matching evidence for %s', (field, value) => {
        const test = reconciled(body());
        expect(() => selectActivationRecord(
          [test.source, test.replacement({ [field]: value })],
          test.currentRegistry, context([test.evidence]),
        )).toThrow(/matching verifier evidence/);
      });

      it.each([
        ['request_comment_id', 0], ['actor_id', 1.5], ['supersedes_comment_id', Number.MAX_SAFE_INTEGER + 1],
        ['actor_id', '30'], ['request_sha256', 'A'.repeat(64)],
        ['plan_sha256', 'a'.repeat(63)], ['registry_sha256', null],
        ['schema', 'unknown'], ['basis', 'historical-attestation'],
      ])('rejects malformed reconciliation %s', (field, value) => {
        const test = reconciled(body());
        expect(() => selectActivationRecord(
          [test.source, test.replacement({ [field]: value })],
          test.currentRegistry, context([test.evidence]),
        )).toThrow(/Malformed activation reconciliation/);
      });

      it('rejects duplicate matching verifier evidence without legacy fallback', () => {
        const test = reconciled(body());
        expect(() => selectActivationRecord(
          [test.source, test.replacement()], test.currentRegistry,
          context([test.evidence, structuredClone(test.evidence)]),
        )).toThrow(/missing or extra verifier proofs/);
      });

      it('treats omitted verifier phases as whole-plan and accepts explicit empty scope', () => {
        const test = reconciled();
        for (const evidence of [test.evidence, { ...test.evidence, phases: [] }]) {
          expect(selectActivationRecord(
            [test.source, test.replacement()], test.currentRegistry, context([evidence]),
          )?.id).toBe(40);
        }
      });

      it('accepts only the explicitly verified canonical phase scope', () => {
        const test = reconciled(body('activated', [{ issue: 'temporary-task' }], 45, [1, 3]));
        const replacement = test.replacement();
        replacement.body = replacement.body.replace('"phases":[]', '"phases":[1,3]');
        const evidence = { ...test.evidence, phases: [1, 3] };
        expect(selectActivationRecord(
          [test.source, replacement], test.currentRegistry, context([evidence]),
        )?.id).toBe(40);
        for (const phases of [[], [1], [1, 2, 3], [3, 1], [1, 1, 3], ['1', 3], [0, 3]]) {
          const tampered = {
            ...replacement,
            body: replacement.body.replace('"phases":[1,3]', `"phases":${JSON.stringify(phases)}`),
          };
          expect(() => selectActivationRecord(
            [test.source, tampered], test.currentRegistry, context([evidence]),
          )).toThrow(/phase scope/);
        }
        expect(() => selectActivationRecord(
          [test.source, replacement], test.currentRegistry, context([test.evidence]),
        )).toThrow(/phase scope/);
      });

      it('rejects noncanonical or malformed verifier phase scope', () => {
        const test = reconciled();
        for (const phases of [
          [0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], [1, 1], [2, 1],
          ['1'], null, '1', new Array(1),
        ]) {
          const evidence = { ...test.evidence, phases } as ReconciliationEvidence;
          expect(() => selectActivationRecord(
            [test.source, test.replacement()], test.currentRegistry, context([evidence]),
          )).toThrow(/verifier reconciliation phase scope/);
        }
      });

      function frozenPhase() {
        const test = reconciled(body('activated', [{ issue: 'temporary-task' }], 45, [1]));
        test.currentRegistry.agents['quality-engineer'] = {
          ...test.currentRegistry.agents['runtime-engineer']!,
          display_name: 'Orbit',
          persistent_name: 'Orbit',
          role: 'Quality Engineer',
          avatar: { kind: 'repository-path', path: '.squad/agents/quality-engineer/avatar.png' },
        };
        const rows = test.rows.map((row) => ({
          ...row, epic_agent_ids: ['quality-engineer', 'runtime-engineer'],
        }));
        const assignments: EpicAssignment[] = [
          { task: rows[0]!.task, epic: rows[0]!.epic, agent: 'Kepler', agentId: 'runtime-engineer' },
          { task: 'future-task', epic: rows[0]!.epic, agent: 'Orbit', agentId: 'quality-engineer' },
        ];
        const evidence = {
          ...test.evidence,
          registrySha256: digest(JSON.stringify(test.currentRegistry)),
          bindingsSha256: digest(JSON.stringify(rows)),
          phases: [1],
        };
        const replacement = test.replacement({
          registry_sha256: evidence.registrySha256,
          bindings_sha256: evidence.bindingsSha256,
        });
        replacement.body = replacement.body
          .replace(JSON.stringify(test.rows), JSON.stringify(rows))
          .replace('"phases":[]', '"phases":[1]');
        return { ...test, rows, assignments, evidence, record: replacement };
      }

      it('validates a phase subset against the complete independently supplied epic assignments', () => {
        const test = frozenPhase();
        const selected = selectActivationRecord(
          [test.source, test.record], test.currentRegistry,
          { ...context([test.evidence]), epicAssignments: test.assignments },
        );
        expect(selected?.bindings).toEqual(test.rows);
        expect(selected?.bindings).toHaveLength(1);
        expect(selected?.bindings[0]!.epic_agent_ids).toEqual(['quality-engineer', 'runtime-engineer']);
        expect(() => selectActivationRecord(
          [test.source, test.record], test.currentRegistry, context([test.evidence]),
        )).toThrow(/malformed or partial/);
      });

      it('rejects missing, duplicate, and conflicting full-plan assignments', () => {
        const test = frozenPhase();
        for (const assignments of [
          [],
          [test.assignments[1]!],
          [test.assignments[0]!],
          [...test.assignments, { ...test.assignments[0]! }],
          [{ ...test.assignments[0]!, epic: 'wrong-epic' }, test.assignments[1]!],
          [{ ...test.assignments[0]!, task: ' missing ' }, test.assignments[1]!],
          [{ ...test.assignments[0]!, agent: 'Orbit' }, test.assignments[1]!],
          [{ ...test.assignments[0]!, agentId: null }, test.assignments[1]!],
          [{ ...test.assignments[0]!, agent: 'Orbit', agentId: 'quality-engineer' }, test.assignments[1]!],
          [test.assignments[0]!, { ...test.assignments[1]!, agentId: 'unknown-agent' }],
          [test.assignments[0]!, { ...test.assignments[1]!, agent: 'Impostor' }],
        ]) {
          expect(() => selectActivationRecord(
            [test.source, test.record], test.currentRegistry,
            { ...context([test.evidence]), epicAssignments: assignments },
          )).toThrow(AgentProvenanceError);
        }
      });

      it('rejects artifact-supplied epic assignments as a substitute for verifier context', () => {
        const test = frozenPhase();
        const selfAuthorized = {
          ...test.record,
          body: test.record.body.replace(
            '"phases":[1]', `"phases":[1],"epicAssignments":${JSON.stringify(test.assignments)}`,
          ),
        };
        expect(() => selectActivationRecord(
          [test.source, selfAuthorized], test.currentRegistry, context([test.evidence]),
        )).toThrow(/malformed or partial/);
      });

      it.each(['Builder', ' builder ', 'BUILDER'])(
        'roundtrips actual producer bindings and full frozen assignments for %s',
        (displayName) => {
          const currentRegistry = registry();
          const template = currentRegistry.agents['runtime-engineer']!;
          currentRegistry.agents = {
            builder: {
              ...template, display_name: 'Builder', persistent_name: 'Builder',
              avatar: { kind: 'repository-path', path: '.squad/agents/builder/avatar.png' },
            },
            reviewer: {
              ...template, display_name: 'Reviewer', persistent_name: 'Reviewer',
              avatar: { kind: 'repository-path', path: '.squad/agents/reviewer/avatar.png' },
            },
          };
          const task = {
            id: '1', epic: 'origin', agent: displayName, agent_id: 'builder',
            label: 'squad:builder', dependencies: [], phase: 1,
          };
          const fullPlan = {
            kind: 'plan',
            tasks: [
              task,
              { ...task, id: '2', agent: 'Reviewer', agent_id: 'reviewer', label: 'squad:reviewer', phase: 2 },
            ],
          };
          const capture = {
            repository: 'owner/repo', origin_issue: 45, run_id: 100, run_attempt: 1,
            phase: 1, registry: currentRegistry, fullPlan,
            plan: { ...fullPlan, tasks: [task] }, operations: [{ id: 'task:1' }],
          };
          const journal = {
            schema: 'squad-activation-receipts/v1',
            capture_sha256: activationDigest(capture),
            repository: capture.repository, run_id: capture.run_id, run_attempt: capture.run_attempt,
            started: ['task:1'],
            parent_fallbacks: [],
            receipts: [{
              operation_id: 'task:1', repository: capture.repository, number: 101, id: 1001,
              node_id: 'I_example_101', url: 'https://github.com/owner/repo/issues/101',
            }],
          };
          const produced = buildActivationBindings(capture, journal);
          const assignments = frozenAssignments(fullPlan);
          expect(produced[0].epic_agents).toEqual(['builder', 'reviewer']);
          expect(assignments[0].agent).toBe(displayName);
          const record = { id: 500, body: body('phases-accepted', produced, 45, [1]) };
          const selected = selectActivationRecord([record], currentRegistry, {
            ...context(), epicAssignments: assignments,
          });
          expect(selected).toMatchObject({
            id: 500, artifact: 'phases-accepted',
            bindings: [{
              task: '1', issue: '#101', agent_id: 'builder',
              epic_agent_ids: ['builder', 'reviewer'],
            }],
          });
          expect(() => selectActivationRecord([record], currentRegistry, {
            ...context(),
            epicAssignments: [{ ...assignments[0], agentId: 'Builder' }, assignments[1]],
          })).toThrow(/identity/);
        },
      );

      it('checks supplied display metadata and exact task identity against frozen assignments', () => {
        const test = frozenPhase();
        const bindingContext = {
          repository: 'owner/repo', originIssue: 45, artifact: 'activation-reconciled' as const,
          epicAssignments: test.assignments,
        };
        const parsedRegistry = parseAgentProvenanceRegistry(test.currentRegistry);
        const row = { ...test.rows[0]!, agent: 'Kepler', epic_agents: ['Kepler', 'Orbit'] };
        expect(parseWorkAgentBindings([row], parsedRegistry, bindingContext)).toEqual(test.rows);
        for (const modified of [
          { ...row, agent: 'Orbit' },
          { ...row, epic_agents: ['Kepler'] },
          { ...row, epic_agents: ['Kepler', 'Orbit', 'Orbit'] },
          { ...row, agent_id: ' runtime-engineer ' },
          { ...row, task: ` ${row.task}` },
          { ...row, epic: `${row.epic} ` },
        ]) {
          expect(() => parseWorkAgentBindings([modified], parsedRegistry, bindingContext))
            .toThrow(/malformed or partial/);
        }
      });

      it('derives partial omission from a future external owner, not only selected tasks', () => {
        const test = frozenPhase();
        const assignments = [
          test.assignments[0]!,
          { ...test.assignments[1]!, agent: 'External contributor', agentId: null },
        ];
        const row = {
          ...test.rows[0]!, epic_agent_ids: ['runtime-engineer'],
          epic_identity_omission_reason: 'partial' as const,
        };
        const parsedRegistry = parseAgentProvenanceRegistry(test.currentRegistry);
        const bindingContext = {
          repository: 'owner/repo', originIssue: 45, artifact: 'activation-reconciled' as const,
          epicAssignments: assignments,
        };
        expect(parseWorkAgentBindings([row], parsedRegistry, bindingContext)[0])
          .toMatchObject({ epic_identity_omission_reason: 'partial' });
        expect(() => parseWorkAgentBindings([
          { ...row, epic_identity_omission_reason: undefined },
        ], parsedRegistry, bindingContext)).toThrow(/malformed or partial/);
        const { epicAssignments: _assignments, ...strictContext } = bindingContext;
        expect(() => parseWorkAgentBindings([row], parsedRegistry, strictContext))
          .toThrow(/malformed or partial/);
      });

      it('rejects malformed verifier evidence', () => {
        const test = reconciled();
        for (const evidence of [
          { ...test.evidence, actorId: -1 },
          { ...test.evidence, bindingsSha256: 'not-a-digest' },
        ]) {
          expect(() => selectActivationRecord(
            [test.source, test.replacement()], test.currentRegistry, context([evidence]),
          )).toThrow(/Malformed verifier/);
        }
      });

      it('verifies the exact source body, source existence, registry, and full raw bindings', () => {
        const test = reconciled();
        expect(() => selectActivationRecord(
          [{ ...test.source, body: `${test.source.body}\n` }, test.replacement()],
          test.currentRegistry, context([test.evidence]),
        )).toThrow(/source body digest/);
        expect(() => selectActivationRecord(
          [test.replacement()], test.currentRegistry, context([test.evidence]),
        )).toThrow(/source body digest/);
        expect(() => selectActivationRecord(
          [test.source, test.replacement()], { ...test.currentRegistry, revision: 3 },
          context([test.evidence]),
        )).toThrow(/registry or bindings digest/);
        const modified = test.replacement();
        modified.body = modified.body.replace(
          JSON.stringify(test.rows), JSON.stringify(test.rows.map((row) => ({ ...row, extra: true }))),
        );
        expect(() => selectActivationRecord(
          [test.source, modified], test.currentRegistry, context([test.evidence]),
        )).toThrow(/registry or bindings digest/);
        const extraRows = test.rows.map((row) => ({ ...row, extra: true }));
        const newHash = digest(JSON.stringify(extraRows));
        modified.body = modified.body.replace(test.evidence.bindingsSha256, newHash);
        expect(selectActivationRecord(
          [test.source, modified], test.currentRegistry,
          context([{ ...test.evidence, bindingsSha256: newHash }]),
        )?.bindings).toEqual(test.rows);
      });

      it('validates reconciliation bindings even when their digest is verified', () => {
        const test = reconciled();
        const wrongRows = bindings('activated');
        const newHash = digest(JSON.stringify(wrongRows));
        const replacement = test.replacement({ bindings_sha256: newHash });
        replacement.body = replacement.body.replace(JSON.stringify(test.rows), JSON.stringify(wrongRows));
        expect(() => selectActivationRecord(
          [test.source, replacement], test.currentRegistry,
          context([{ ...test.evidence, bindingsSha256: newHash }]),
        )).toThrow(/Work-agent bindings/);
      });

      it('rejects duplicates, competing reconciliations, and unsuperseded old acceptances', () => {
        const test = reconciled(body('activated', bindings(), 45, []));
        for (const records of [
          [test.source, test.source],
          [test.source, { ...test.source, id: 11 }],
          [test.source, { id: 11, body: body('activated', null) }],
        ]) {
          expect(() => selectActivationRecord(records, test.currentRegistry, context()))
            .toThrow(/duplicate|Ambiguous/);
        }
        for (const extra of [
          { ...test.replacement(), id: 41 },
          { ...test.source, id: 11 },
          test.replacement(),
        ]) {
          expect(() => selectActivationRecord(
            [test.source, test.replacement(), extra], test.currentRegistry, context([test.evidence]),
          )).toThrow(/Competing|Ambiguous|duplicate|missing or extra verifier proofs/);
        }
      });

      it('rejects chains, self-supersession, and cross-origin source or replacement', () => {
        const test = reconciled(body());
        const replacement = test.replacement();
        const selfEvidence = {
          ...test.evidence, sourceCommentId: replacement.id, sourceSha256: digest(replacement.body),
        };
        expect(() => selectActivationRecord(
          [test.source, test.replacement({
            supersedes_comment_id: selfEvidence.sourceCommentId,
            supersedes_sha256: selfEvidence.sourceSha256,
          })], test.currentRegistry, context([selfEvidence]),
        )).toThrow(AgentProvenanceError);
        for (const source of [
          body('activation-reconciled'),
          body('activated', null, 99),
          body().replace('"schema_version":"1"', '"schema_version":"2"'),
        ]) {
          const invalid = reconciled(source);
          expect(() => selectActivationRecord(
            [invalid.source, invalid.replacement()], invalid.currentRegistry, context([invalid.evidence]),
          )).toThrow(AgentProvenanceError);
        }
        replacement.body = replacement.body.replace('"origin_issue":45', '"origin_issue":99');
        expect(() => selectActivationRecord(
          [test.source, replacement], test.currentRegistry, context([test.evidence]),
        )).toThrow(/cross-origin/);
      });

      it.each(['Structured data', 'Activation bindings', 'Activation reconciliation'])(
        'rejects missing, duplicate, or malformed %s sections without legacy fallback',
        (label) => {
          const test = reconciled(body());
          const original = test.replacement();
          for (const modified of [
            original.body.replace(`${label}:`, 'Removed:'),
            `${original.body}\n\n${section(label, {})}`,
            original.body.replace(`${label}:\n\`\`\`json\n`, `${label}:\n\`\`\`json\nnot-json`),
          ]) {
            expect(() => selectActivationRecord(
              [test.source, { ...original, body: modified }], test.currentRegistry, context([test.evidence]),
            )).toThrow(AgentProvenanceError);
          }
        },
      );

      it('rejects unknown reconciliation kinds and malformed envelopes', () => {
        const test = reconciled(body());
        for (const modified of [
          test.replacement().body.replace('"squad_artifact":"activation-reconciled"', '"squad_artifact":"unknown"'),
          test.replacement().body.replace('"phases":[]', '"phases":null'),
          test.replacement().body.replace('"schema_version":"1"', '"schema_version":1'),
        ]) {
          expect(() => selectActivationRecord(
            [test.source, { id: 40, body: modified }], test.currentRegistry, context([test.evidence]),
          )).toThrow(/envelope/);
        }
      });

      it.each(['issue', 'epic_issue'] as const)('rejects temporary or malformed %s references', (field) => {
        for (const value of [
          'temporary-42', '#temp', '0', '#0', '-1', '1.5', '1e3', 'Infinity',
          '9007199254740992', '#9007199254740992', ' 42', '42 ', '##42', '#01', 42,
        ]) {
          const rows = bindings().map((row) => ({ ...row, [field]: value }));
          expect(() => parseWorkAgentBindings(rows, parseAgentProvenanceRegistry(registry()), {
            repository: 'owner/repo', originIssue: 45, artifact: 'activated',
          })).toThrow(/malformed or partial/);
        }
      });

      it.each(['45', '#45'])('rejects task issue %s equal to the origin issue', (issue) => {
        const rows = bindings().map((row) => ({ ...row, issue }));
        expect(() => selectActivationRecord(
          [{ id: 10, body: body('activated', rows) }], registry(), context(),
        )).toThrow(/malformed or partial/);
      });

      it.each([
        ['#42', '42'],
        ['42', '#42'],
      ])('rejects task %s reused as epic issue %s in the same or another row', (issue, epicIssue) => {
        const first = { ...bindings()[0]!, issue, epic_issue: '#50' };
        for (const rows of [
          [{ ...first, epic_issue: epicIssue }],
          [first, { ...first, task: '2', issue: '#43', epic: 'second-epic', epic_issue: epicIssue }],
        ]) {
          expect(() => selectActivationRecord(
            [{ id: 10, body: body('activated', rows) }], registry(), context(),
          )).toThrow(/malformed or partial/);
        }
      });

      it.each(['45', '#45'])('reserves epic issue %s for the explicit origin epic', (epicIssue) => {
        const row = { ...bindings()[0]!, issue: '#42', epic_issue: epicIssue };
        expect(() => selectActivationRecord(
          [{ id: 10, body: body('activated', [row]) }], registry(), context(),
        )).toThrow(/malformed or partial/);
        expect(selectActivationRecord(
          [{ id: 10, body: body('activated', [{ ...row, epic: 'origin' }]) }],
          registry(), context(),
        )?.bindings[0]).toMatchObject({ issue: '#42', epic: 'origin', epic_issue: epicIssue });
      });

      function chainNode(
        index: number,
        phases: number[],
        parent?: { source: ActivationRecord; record: ActivationRecord },
        options: {
          prior?: unknown;
          sourceKind?: 'activation' | 'pending';
          rows?: Array<Record<string, unknown>>;
          planSha256?: string;
        } = {},
      ) {
        const rows = options.rows ?? phases.map((phase) => ({
          ...bindings('activation-reconciled')[0]!,
          task: String(phase), issue: `#${2065 + phase}`,
          agent: 'Kepler', epic_agents: ['kepler'], label: 'squad:kepler', epic_label: 'squad:kepler',
          depends_on: [],
        }));
        const sourceKind = options.sourceKind ?? 'pending';
        const planSha256 = options.planSha256 ?? digest('frozen chain plan');
        const registrySha256 = digest(JSON.stringify(registry()));
        const prior = options.prior ?? (parent ? {
          source_comment_id: parent.source.id, source_sha256: digest(parent.source.body),
          reconciliation_comment_id: parent.record.id, reconciliation_sha256: digest(parent.record.body),
        } : undefined);
        const frozen = {
          run_id: 100, run_attempt: index, capture_sha256: digest(`capture ${index}`),
          capture_artifact_id: 200 + index, plan_comment_id: 300,
          plan_sha256: planSha256, registry_sha256: registrySha256,
          ...(prior === undefined ? {} : { prior }),
        };
        const source = {
          id: index * 10,
          body: sourceKind === 'pending'
            ? `\`\`\`json\n${JSON.stringify({
              schema: 'squad-activation-pending/v1', repository: 'owner/repo', origin_issue: 45,
              ...frozen, phases,
            })}\n\`\`\``
            : `${body('phases-activated', rows.map(row => ({ ...row, artifact: 'phases-activated' })), 45, phases)}

${section('Activation evidence', {
  schema: 'squad-activation-finalization/v1', basis: 'current-trusted-execution',
  ...frozen, workflow_sha: 'a'.repeat(40), receipts_sha256: digest(`receipts ${index}`),
  receipts_artifact_id: 400 + index, pending_comment_id: 500 + index,
})}`,
        };
        const evidence: ReconciliationEvidence = {
          requestCommentId: 1000 + index, requestSha256: digest(`request ${index}`), actorId: 30,
          sourceCommentId: source.id, sourceSha256: digest(source.body),
          planSha256, registrySha256, bindingsSha256: digest(JSON.stringify(rows)), phases, sourceKind,
        };
        const record = {
          id: source.id + 1,
          body: `${body('activation-reconciled', rows, 45, phases)}\n\n${section('Activation reconciliation', {
            schema: 'squad-activation-reconciliation/v1', basis: 'current-state-authorized',
            request_comment_id: evidence.requestCommentId, request_sha256: evidence.requestSha256,
            actor_id: evidence.actorId, supersedes_comment_id: source.id, supersedes_sha256: evidence.sourceSha256,
            plan_sha256: planSha256, registry_sha256: registrySha256, bindings_sha256: evidence.bindingsSha256,
            ...(sourceKind === 'pending' ? { supersedes_kind: 'pending' } : {}),
          })}`,
        };
        return { source, record, evidence, rows };
      }

      function rejectChain(records: ActivationRecord[], proofs: ReconciliationEvidence[]) {
        for (const selector of [selectActivationRecord, selectBuiltSdk, selectChecker]) {
          expect(() => selector(records, registry(), context(proofs))).toThrow();
        }
      }

      it.each(['pending', 'activation'] as const)(
        'selects a complete independently verified chain through a %s source',
        (sourceKind) => {
          const first = chainNode(1, [1]);
          const second = chainNode(2, [1, 2], first, { sourceKind });
          const third = chainNode(3, [1, 2, 3], second);
          for (const nodes of [[first, second], [first, second, third]]) {
            const head = nodes.at(-1)!;
            const records = nodes.flatMap(node => [node.record, node.source]).reverse();
            const selectionContext = context(nodes.map(node => node.evidence).reverse());
            const sdk = selectActivationRecord(records, registry(), selectionContext)!;
            const canonical = selectChecker(records, registry(), selectionContext);
            expect(sdk.id).toBe(head.record.id);
            expect(sdk.bindings).toHaveLength(nodes.length);
            expect({
              ...canonical,
              bindings: parseWorkAgentBindings(canonical.bindings, parseAgentProvenanceRegistry(registry()), {
                repository: 'owner/repo', originIssue: 45, artifact: 'activation-reconciled',
              }),
            }).toEqual(sdk);
            expect(selectActivationRecord([head.source, head.record], registry(), context([head.evidence]))?.id)
              .toBe(head.record.id);
            expect(selectChecker([head.source, head.record], registry(), context([head.evidence]))?.id)
              .toBe(head.record.id);
          }
        },
      );

      it('rejects missing, duplicate, extra, and mismatched full-history proofs', () => {
        const first = chainNode(1, [1]);
        const second = chainNode(2, [1, 2], first);
        const records = [first.source, first.record, second.source, second.record];
        for (const proofs of [
          [second.evidence], [first.evidence],
          [first.evidence, first.evidence],
          [first.evidence, second.evidence, structuredClone(second.evidence)],
          [first.evidence, { ...second.evidence, actorId: 99 }],
          [first.evidence, { ...second.evidence, bindingsSha256: 'b'.repeat(64) }],
          [first.evidence, { ...second.evidence, registrySha256: 'b'.repeat(64) }],
        ]) rejectChain(records, proofs);
        rejectChain(records.filter(record => record.id !== first.source.id), [first.evidence, second.evidence]);
        rejectChain(records.filter(record => record.id !== first.record.id), [first.evidence, second.evidence]);
        rejectChain([...records, first.source], [first.evidence, second.evidence]);
        rejectChain([...records, { id: 999, body: body() }], [first.evidence, second.evidence]);
      });

      it.each([
        ['source SDK', selectActivationRecord], ['built SDK', selectBuiltSdk], ['checker', selectChecker],
      ] as const)(
        '%s ignores ordinary discussion in verified chains and scoped pairs',
        (_reader, selector) => {
          for (const sourceKind of ['pending', 'activation'] as const) {
            const first = chainNode(1, [1], undefined, { sourceKind });
            const second = chainNode(2, [1, 2], first, { sourceKind });
            const discussion = { id: 999, body: 'Thanks, the task breakdown looks good.' };
            expect(selector([discussion], registry(), context())).toBeUndefined();
            expect(() => selector([discussion], registry(), context([second.evidence]))).toThrow();
            for (const nodes of [[second], [first, second]]) {
              expect(selector(
                [discussion, { id: 998, body: section('Structured data', {
                  squad_artifact: 'plan', schema_version: '1', origin_issue: 45, phases: [],
                }) }, ...nodes.flatMap(node => [node.source, node.record])],
                registry(), context(nodes.map(node => node.evidence)),
              )?.id).toBe(second.record.id);
            }
          }
        },
      );

      it('rejects extra pending, activation, and malformed candidates in a mixed chain', () => {
        const first = chainNode(1, [1]);
        const second = chainNode(2, [1, 2], first);
        const records = [first.source, first.record, second.source, second.record,
          { id: 998, body: 'Ordinary discussion.' }];
        for (const extra of [
          chainNode(3, [1, 2, 3], second).source,
          { id: 999, body: body() },
          { id: 999, body: 'Activation bindings:\n```json\n{broken\n```' },
          { id: 999, body: first.source.body.replace('"phases":[1]', '"phases":null') },
          { id: 999, body: second.record.body },
        ]) rejectChain([...records, extra], [first.evidence, second.evidence]);
      });

      it('rejects altered ancestor bodies, malformed links, unknown parents, and self-links', () => {
        const first = chainNode(1, [1]);
        const second = chainNode(2, [1, 2], first);
        rejectChain([
          first.source, { ...first.record, body: `${first.record.body}\n` }, second.source, second.record,
        ], [first.evidence, second.evidence]);
        const link = {
          source_comment_id: first.source.id, source_sha256: digest(first.source.body),
          reconciliation_comment_id: first.record.id, reconciliation_sha256: digest(first.record.body),
        };
        for (const prior of [
          { ...link, source_sha256: 'b'.repeat(64) },
          { ...link, reconciliation_sha256: 'b'.repeat(64) },
          { ...link, reconciliation_comment_id: 999 },
          { ...link, source_comment_id: 20, reconciliation_comment_id: 21 },
          { ...link, authorized: true },
          { source_comment_id: first.source.id },
        ]) {
          const child = chainNode(2, [1, 2], first, { prior });
          rejectChain([first.source, first.record, child.source, child.record], [first.evidence, child.evidence]);
        }
        const cyclicFirst = chainNode(1, [1], second);
        rejectChain([cyclicFirst.source, cyclicFirst.record, second.source, second.record],
          [cyclicFirst.evidence, second.evidence]);
      });

      it('rejects forks, disconnected heads, non-expanding coverage, and inconsistent frozen plans', () => {
        const first = chainNode(1, [1]);
        const second = chainNode(2, [1, 2], first);
        const branch = chainNode(3, [1, 3], first);
        rejectChain(
          [first.source, first.record, second.source, second.record, branch.source, branch.record],
          [first.evidence, second.evidence, branch.evidence],
        );
        for (const child of [
          chainNode(2, [1], first),
          chainNode(2, [2, 3], first),
          chainNode(2, [1, 2]),
          chainNode(2, [1, 2], first, { planSha256: digest('different frozen plan') }),
        ]) rejectChain([first.source, first.record, child.source, child.record], [first.evidence, child.evidence]);
      });

      it('preserves prior numeric task/epic mappings even with freshly matching child binding proofs', () => {
        const first = chainNode(1, [1]);
        const second = chainNode(2, [1, 2], first);
        for (const rows of [
          second.rows.map((row, index) => index === 0 ? { ...row, issue: '#999' } : row),
          second.rows.map(row => ({ ...row, epic_issue: '#999' })),
          second.rows.filter(row => row.task !== '1'),
        ]) {
          const child = chainNode(2, [1, 2], first, { rows });
          rejectChain([first.source, first.record, child.source, child.record], [first.evidence, child.evidence]);
        }
      });

      it.each([
        [[2], [1, 2]],
        [[1, 3], [1, 2, 3]],
      ])('rejects nonprefix insertion from %j to %j despite matching proofs', (before, after) => {
        for (const sourceKind of ['activation', 'pending'] as const) {
          const first = chainNode(1, before, undefined, { sourceKind });
          const second = chainNode(2, after, first, { sourceKind });
          rejectChain([first.source, first.record, second.source, second.record],
            [first.evidence, second.evidence]);
        }
      });

      it('preserves numeric references but canonicalizes task and epic collision checks', () => {
        const parsedRegistry = parseAgentProvenanceRegistry(registry());
        const bindingContext = { repository: 'owner/repo', originIssue: 45, artifact: 'activated' as const };
        const first = { ...bindings()[0]!, issue: '#42', epic_issue: '#50' };
        expect(parseWorkAgentBindings([
          { ...first, issue: String(Number.MAX_SAFE_INTEGER) },
        ], parsedRegistry, bindingContext)[0]!.issue).toBe(String(Number.MAX_SAFE_INTEGER));
        expect(() => parseWorkAgentBindings([
          first, { ...first, issue: '42', task: '2' },
        ], parsedRegistry, bindingContext)).toThrow(/malformed or partial/);
        expect(() => parseWorkAgentBindings([
          first, { ...first, issue: '43', task: '2', epic: 'other', epic_issue: '50' },
        ], parsedRegistry, bindingContext)).toThrow(/malformed or partial/);
        expect(parseWorkAgentBindings([
          first, { ...first, issue: '43', task: '2', epic_issue: '50' },
        ], parsedRegistry, bindingContext)).toHaveLength(2);
      });
    });

  it('parses a complete v1 registry including an explicit avatar reference', () => {
    const result = parseAgentProvenanceRegistry(fixture('valid'));

    expect(result.completeness).toBe('complete');
    expect(result.diagnostics).toEqual([]);
    expect(result.registry.agents['runtime-engineer']).toMatchObject({
      display_name: 'Kepler',
      persistent_name: 'Kepler',
      avatar: {
        kind: 'repository-path',
        path: '.squad/agents/runtime-engineer/avatar.png',
      },
    });
  });

  it('returns valid records and diagnostics for a partial registry', () => {
    const result = parseAgentProvenanceRegistry(fixture('partial'));

    expect(result.completeness).toBe('partial');
    expect(Object.keys(result.registry.agents)).toEqual(['runtime-engineer']);
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      'agents.broken-agent.persistent_name',
    );
  });

  it('fails closed for an unsupported or malformed root', () => {
    expect(() => parseAgentProvenanceRegistry(fixture('unsupported')))
      .toThrow(AgentProvenanceError);
    expect(() => parseAgentProvenanceRegistry(undefined))
      .toThrow(AgentProvenanceError);
  });

  it('refuses to reconcile partial producer state', () => {
    expect(() => reconcileAgentProvenanceRegistry(
      fixture('partial'),
      [],
      { retireMissing: true },
    )).toThrow(/partial agent provenance registry/);
  });

  it('preserves the immutable id and creation time across a rename', () => {
    const existing = fixture('valid');
    const registry = reconcileAgentProvenanceRegistry(
      existing,
      [{
        id: 'runtime-engineer',
        displayName: 'Nova',
        role: 'Runtime Engineer',
        universe: 'descriptive',
      }],
      {
        generatedAt: '2026-09-22T20:00:00.000Z',
        retireMissing: true,
      },
    );

    expect(Object.keys(registry.agents)).toEqual(['runtime-engineer']);
    expect(registry.agents['runtime-engineer']).toMatchObject({
      display_name: 'Nova',
      persistent_name: 'Nova',
      created_at: '2026-09-20T20:00:00.000Z',
      updated_at: '2026-09-22T20:00:00.000Z',
      status: 'active',
    });
  });

  it('retains deletion tombstones and never silently reuses identities', () => {
    const retired = reconcileAgentProvenanceRegistry(
      fixture('valid'),
      [],
      {
        generatedAt: '2026-09-22T20:00:00.000Z',
        retireMissing: true,
      },
    );

    expect(retired.agents['runtime-engineer']).toMatchObject({
      status: 'retired',
      retired_at: '2026-09-22T20:00:00.000Z',
    });
    expect(() => reconcileAgentProvenanceRegistry(retired, [{
      id: 'runtime-engineer',
      displayName: 'Replacement',
      role: 'Quality Engineer',
      universe: 'descriptive',
    }])).toThrow(/cannot change role/);
  });

  it('rejects active role reassignment for the same stable id', () => {
    expect(() => reconcileAgentProvenanceRegistry(fixture('valid'), [{
      id: 'runtime-engineer',
      displayName: 'Kepler',
      role: 'Quality Engineer',
      universe: 'descriptive',
    }])).toThrow(/cannot change role/);
  });

  it('rejects id, display-name, and inferred-rename collisions', () => {
    const candidate = {
      id: 'runtime-engineer',
      displayName: 'Kepler',
      role: 'Runtime Engineer',
      universe: 'descriptive',
    };
    expect(() => reconcileAgentProvenanceRegistry(undefined, [candidate, candidate]))
      .toThrow(/Duplicate candidate agent id/);
    expect(() => reconcileAgentProvenanceRegistry(undefined, [
      candidate,
      { ...candidate, id: 'quality-engineer', role: 'Quality Engineer', displayName: 'KEPLER' },
    ])).toThrow(/Duplicate candidate display name/);

    expect(() => reconcileAgentProvenanceRegistry(fixture('valid'), [{
      id: 'renamed',
      displayName: 'Nova',
      role: 'Runtime Engineer',
      universe: 'descriptive',
    }])).toThrow(/supply the existing stable id/);
  });

  it.each(['agent-', 'agent--one', '-agent', 'Agent'])(
    'rejects non-canonical id %s',
    (id) => {
      expect(() => reconcileAgentProvenanceRegistry(undefined, [{
        id,
        displayName: 'Agent',
        role: 'Runtime Engineer',
        universe: 'descriptive',
      }])).toThrow(/Invalid agent id/);
    },
  );

  it('preserves avatars unless explicitly cleared and enforces id-owned paths', () => {
    const renamed = reconcileAgentProvenanceRegistry(fixture('valid'), [{
      id: 'runtime-engineer',
      displayName: 'Nova',
      role: 'Runtime Engineer',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-22T20:00:00.000Z' });
    expect(renamed.agents['runtime-engineer']!.avatar?.path)
      .toBe('.squad/agents/runtime-engineer/avatar.png');

    const cleared = reconcileAgentProvenanceRegistry(renamed, [{
      id: 'runtime-engineer',
      displayName: 'Nova',
      role: 'Runtime Engineer',
      universe: 'descriptive',
      avatar: null,
    }]);
    expect(cleared.agents['runtime-engineer']!.avatar).toBeUndefined();

    for (const path of [
      '.squad/agents/other-agent/avatar.png',
      '.squad/agents/runtime-engineer/../secret.png',
      '.squad\\agents\\runtime-engineer\\avatar.png',
      '/.squad/agents/runtime-engineer/avatar.png',
      '.squad/agents/Runtime-Engineer/avatar.png',
    ]) {
      expect(() => reconcileAgentProvenanceRegistry(fixture('valid'), [{
        id: 'runtime-engineer',
        displayName: 'Kepler',
        role: 'Runtime Engineer',
        universe: 'descriptive',
        avatar: { kind: 'repository-path', path },
      }])).toThrow(/Invalid avatar/);
    }
  });

  it('fails closed on malformed legacy roots and records', () => {
    expect(() => reconcileAgentProvenanceRegistry({}, [])).toThrow(/Legacy.*agents object/);
    expect(() => reconcileAgentProvenanceRegistry({
      agents: {
        'runtime-engineer': {
          persistent_name: 'Kepler',
          status: 'active',
          universe: 'descriptive',
        },
      },
    }, [])).toThrow(/Incomplete legacy/);
  });

  it('migrates complete legacy records without dropping unclaimed identities', () => {
    const legacy = {
      agents: {
        'runtime-engineer': {
          persistent_name: 'Kepler',
          role: 'Runtime Engineer',
          universe: 'descriptive',
          status: 'active',
          created_at: '2026-09-20T20:00:00.000Z',
        },
        reviewer: {
          persistent_name: 'Orbit',
          role: 'Reviewer',
          universe: 'descriptive',
          status: 'active',
          created_at: '2026-09-20T20:00:00.000Z',
        },
      },
    };
    const migrated = reconcileAgentProvenanceRegistry(legacy, [{
      id: 'runtime-engineer',
      displayName: 'Kepler',
      role: 'Runtime Engineer',
      universe: 'descriptive',
    }], {
      generatedAt: '2026-09-22T20:00:00.000Z',
      retireMissing: true,
    });

    expect(migrated.revision).toBe(1);
    expect(migrated.agents.reviewer).toMatchObject({
      display_name: 'Orbit',
      status: 'retired',
      retired_at: '2026-09-22T20:00:00.000Z',
    });
  });

  it('parses authoritative work bindings without display-name or label inference', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const bindings = parseWorkAgentBindings(fixture('binding_valid'), registry, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    });

    expect(bindings).toEqual([expect.objectContaining({
      agent_id: 'runtime-engineer',
      epic_agent_ids: ['runtime-engineer'],
      registry_revision: 2,
    })]);
  });

  it('keeps historical bindings valid after rename or retirement', () => {
    const renamed = reconcileAgentProvenanceRegistry(fixture('valid'), [{
      id: 'runtime-engineer',
      displayName: 'Nova',
      role: 'Runtime Engineer',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-22T20:00:00.000Z' });
    const retired = reconcileAgentProvenanceRegistry(renamed, [], {
      generatedAt: '2026-09-23T20:00:00.000Z',
      retireMissing: true,
    });

    expect(() => parseWorkAgentBindings(fixture('binding_valid'), {
      registry: retired,
      completeness: 'complete',
      diagnostics: [],
    }, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    })).not.toThrow();
  });

  it('represents external ownership as an explicit unavailable identity', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const external = fixture('binding_valid') as Array<Record<string, unknown>>;
    external[0].agent_id = null;
    external[0].epic_agent_ids = [];
    external[0].identity_omission_reason = 'external-agent';
    external[0].epic_identity_omission_reason = 'partial';

    expect(parseWorkAgentBindings(external, registry, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    })[0]).toMatchObject({
      agent_id: null,
      identity_omission_reason: 'external-agent',
    });
  });

  it('accepts an older binding revision and complete per-epic omission semantics', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const bindings = fixture('binding_inconsistent_epic_sets') as Array<Record<string, unknown>>;
    bindings[0]!.registry_revision = 1;
    bindings[1]!.registry_revision = 1;
    bindings[1]!.epic_agent_ids = ['runtime-engineer'];

    expect(parseWorkAgentBindings(bindings, registry, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    })).toEqual([
      expect.objectContaining({
        registry_revision: 1,
        agent_id: 'runtime-engineer',
        epic_agent_ids: ['runtime-engineer'],
        epic_identity_omission_reason: 'partial',
      }),
      expect.objectContaining({
        registry_revision: 1,
        agent_id: null,
        epic_agent_ids: ['runtime-engineer'],
        epic_identity_omission_reason: 'partial',
      }),
    ]);
  });

  it.each([
    ['cross-row epic conflict', 'binding_epic_conflict'],
    ['inconsistent epic agent sets', 'binding_inconsistent_epic_sets'],
    ['mixed epic omission semantics', 'binding_mixed_omission'],
  ] as const)('fails closed on %s', (_case, fixtureName) => {
    expect(() => parseWorkAgentBindings(
      fixture(fixtureName),
      parseAgentProvenanceRegistry(fixture('valid')),
      {
        repository: 'bradygaster/squad',
        originIssue: 45,
        artifact: 'activated',
      },
    )).toThrow(/malformed or partial/);
  });

  it('rejects reverse epic conflicts, mixed revisions, and ambiguous complete omissions', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const context = {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated' as const,
    };

    const reverseConflict = fixture('binding_epic_conflict') as Array<Record<string, unknown>>;
    reverseConflict[1]!.epic = '1.2';
    reverseConflict[1]!.epic_issue = '#2065';
    expect(() => parseWorkAgentBindings(reverseConflict, registry, context))
      .toThrow(/malformed or partial/);

    const mixedRevisions = fixture('binding_epic_conflict') as Array<Record<string, unknown>>;
    mixedRevisions[1]!.epic = '1.2';
    mixedRevisions[1]!.registry_revision = 1;
    expect(() => parseWorkAgentBindings(mixedRevisions, registry, context))
      .toThrow(/malformed or partial/);

    const ambiguousComplete = fixture('binding_valid') as Array<Record<string, unknown>>;
    ambiguousComplete[0]!.epic_identity_omission_reason = 'partial';
    expect(() => parseWorkAgentBindings(ambiguousComplete, registry, context))
      .toThrow(/malformed or partial/);
  });

  it('fails closed on missing, partial, cross-repository, or future-revision bindings', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const context = {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated' as const,
    };

    expect(() => parseWorkAgentBindings(undefined, registry, context)).toThrow(/non-empty array/);
    expect(() => parseWorkAgentBindings(fixture('binding_partial'), registry, context))
      .toThrow(/malformed or partial/);
    expect(() => parseWorkAgentBindings(
      fixture('binding_valid'),
      parseAgentProvenanceRegistry(fixture('partial')),
      context,
    )).toThrow(/partial registry/);
    expect(() => parseWorkAgentBindings(fixture('binding_valid'), registry, {
      ...context,
      repository: 'bradygaster/squadcaster',
    })).toThrow(/malformed or partial/);
    const duplicated = fixture('binding_valid') as Array<Record<string, unknown>>;
    duplicated.push({ ...duplicated[0]!, issue: '#2067' });
    expect(() => parseWorkAgentBindings(duplicated, registry, context))
      .toThrow(/malformed or partial/);
    const duplicatedIssue = fixture('binding_valid') as Array<Record<string, unknown>>;
    duplicatedIssue.push({ ...duplicatedIssue[0]!, task: '2' });
    expect(() => parseWorkAgentBindings(duplicatedIssue, registry, context))
      .toThrow(/malformed or partial/);
  });

  it('reports the authoritative provenance error when every binding row is malformed', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    expect(() => parseWorkAgentBindings([
      null,
      { binding_schema: 'wrong' },
      'not-an-object',
    ], registry, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    })).toThrow(/Work-agent bindings are malformed or partial/);
  });

  it.each([
    ['inconsistent epic identity sets', 'binding_inconsistent_epic_sets'],
    ['mixed omissions without complete partial markers', 'binding_mixed_omission'],
    ['mixed registry revisions', 'binding_mixed_revision'],
  ] as const)('fails closed on %s across rows', (_case, fixtureName) => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    expect(() => parseWorkAgentBindings(fixture(fixtureName), registry, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    })).toThrow(/malformed or partial/);
  });

  it('accepts one reconciled partial epic set when every row marks the omission', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const bindings = fixture('binding_mixed_omission') as Array<Record<string, unknown>>;
    bindings[0]!.epic_identity_omission_reason = 'partial';

    expect(parseWorkAgentBindings(bindings, registry, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    })).toHaveLength(2);
  });

  it.each([
    ['producer', 'other-producer'],
    ['repository', 'other/repository'],
    ['origin_issue', 99],
  ] as const)('rejects a cross-row %s identity conflict', (field, conflictingValue) => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const bindings = fixture('binding_valid') as Array<Record<string, unknown>>;
    bindings.push({
      ...bindings[0]!,
      task: '2',
      issue: '#2067',
      [field]: conflictingValue,
    });
    expect(() => parseWorkAgentBindings(bindings, registry, {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated',
    })).toThrow(/malformed or partial/);
  });

  it('fails closed on conflicting epic-to-issue relationships', () => {
    const registry = parseAgentProvenanceRegistry(fixture('valid'));
    const context = {
      repository: 'bradygaster/squad',
      originIssue: 45,
      artifact: 'activated' as const,
    };
    const sameEpicDifferentIssue = fixture('binding_valid') as Array<Record<string, unknown>>;
    sameEpicDifferentIssue.push({
      ...sameEpicDifferentIssue[0]!,
      task: '2',
      issue: '#2067',
      epic_issue: '#2099',
    });
    expect(() => parseWorkAgentBindings(sameEpicDifferentIssue, registry, context))
      .toThrow(/malformed or partial/);

    const sameIssueDifferentEpic = fixture('binding_valid') as Array<Record<string, unknown>>;
    sameIssueDifferentEpic.push({
      ...sameIssueDifferentEpic[0]!,
      task: '2',
      issue: '#2067',
      epic: '1.2',
    });
    expect(() => parseWorkAgentBindings(sameIssueDifferentEpic, registry, context))
      .toThrow(/malformed or partial/);
  });
});
