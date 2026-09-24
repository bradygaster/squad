import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AgentProvenanceError,
  parseAgentProvenanceRegistry,
  parseWorkAgentBindings,
  reconcileAgentProvenanceRegistry,
} from '@bradygaster/squad-sdk/casting';

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
