import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AgentProvenanceError,
  parseAgentProvenanceRegistry,
  reconcileAgentProvenanceRegistry,
} from '@bradygaster/squad-sdk/casting';

function fixture(name: 'valid' | 'partial' | 'unsupported'): unknown {
  const cases = JSON.parse(
    readFileSync(join('test', 'fixtures', 'agent-provenance', 'cases.json'), 'utf8'),
  ) as Record<string, unknown>;
  return structuredClone(cases[name]);
}

describe('agent identity provenance contract', () => {
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
        id: 'new-name-that-must-not-win',
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
    }])).toThrow(/cannot be reassigned/);
  });

  it('rejects id, display-name, and ambiguous-role collisions', () => {
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

    const ambiguous = fixture('valid') as {
      agents: Record<string, unknown>;
    };
    ambiguous.agents['runtime-engineer-two'] = {
      ...(ambiguous.agents['runtime-engineer'] as object),
      display_name: 'Orbit',
      persistent_name: 'Orbit',
    };
    expect(() => reconcileAgentProvenanceRegistry(ambiguous, [{
      id: 'renamed',
      displayName: 'Nova',
      role: 'Runtime Engineer',
      universe: 'descriptive',
    }])).toThrow(/ambiguous/);
  });
});
