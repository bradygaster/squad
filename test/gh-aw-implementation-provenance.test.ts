import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROVENANCE_LABEL,
  PROVENANCE_SCHEMA,
  evaluateImplementationProvenanceItems,
  extractImplementationProvenance,
  implementationSessionId,
  validateImplementationProvenance,
} from '../workflows/shared/squad-implementation-provenance.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as Record<string, unknown>;

function bodyFor(payload: Record<string, unknown>, legacy = true): string {
  return [
    'Closes #42',
    '',
    PROVENANCE_LABEL,
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    ...(legacy ? ['', '<!-- squad:implement issue=42 run=70001 -->'] : []),
  ].join('\n');
}

describe('Squad implementation provenance v1', () => {
  const fixture = readJson('test-fixtures/implementation-provenance/valid-v1.json');
  const multiGoal = readJson(
    'test-fixtures/implementation-provenance/multi-goal-replacement-v1.json',
  );
  const schema = readJson('workflows/shared/implementation-provenance-v1.schema.json');
  const dispatcher = readFileSync(resolve(ROOT, 'workflows/squad.md'), 'utf8');
  const implementWorker = readFileSync(
    resolve(ROOT, 'workflows/squad-implement-worker.md'),
    'utf8',
  );
  const dependencyWorker = readFileSync(
    resolve(ROOT, 'workflows/squad-deps-worker.md'),
    'utf8',
  );
  const retro = readFileSync(resolve(ROOT, 'workflows/squad-retro.md'), 'utf8');

  it('wires the same required session input through every producer path', () => {
    for (const worker of [implementWorker, dependencyWorker]) {
      expect(worker).toMatch(
        /implementation_session_id:\r?\n\s+description:[\s\S]*?\r?\n\s+required: true/,
      );
      expect(worker).toContain('shared/squad-implementation-provenance.mjs');
      expect(worker).toContain('shared/implementation-provenance-v1.schema.json');
      expect(worker).toContain('enforceImplementationProvenanceSafeOutputs');
    }
    expect(dispatcher).toContain(
      'squad-implementation-session/v1/${{ github.event.repository.id }}/${{ github.run_id }}',
    );
    expect(retro).toContain(
      'squad-implementation-session/v1/${{ github.event.repository.id }}/${{ github.run_id }}',
    );
  });

  it('keeps the published schema and fixtures aligned with the runtime validator', () => {
    expect(schema.$id).toBe(PROVENANCE_SCHEMA);
    expect(schema.required).toEqual(Object.keys(fixture));
    expect(validateImplementationProvenance(fixture)).toEqual([]);
    expect(validateImplementationProvenance(multiGoal)).toEqual([]);
  });

  it('mints a stable opaque ID from the scheduling run, not PR text', () => {
    expect(implementationSessionId('12345', '67890')).toBe(
      'squad-implementation-session/v1/12345/67890',
    );
    expect(implementationSessionId('octo/example', '67890')).toBeNull();
  });

  it('extracts one top-level payload and treats absence as unknown', () => {
    expect(extractImplementationProvenance(bodyFor(fixture))).toEqual(fixture);
    expect(extractImplementationProvenance('Closes #42')).toBeNull();
    expect(extractImplementationProvenance([
      '```markdown',
      PROVENANCE_LABEL,
      '```json',
      JSON.stringify(fixture),
      '```',
      '```',
    ].join('\n'))).toBeNull();
  });

  it('rejects malformed, partial, duplicated, and runtime-mismatched payloads', () => {
    expect(extractImplementationProvenance(
      `${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n`,
    )).toBeUndefined();
    expect(extractImplementationProvenance(
      `${bodyFor(fixture)}\n\n${PROVENANCE_LABEL}\n\`\`\`json\n${JSON.stringify(fixture)}\n\`\`\``,
    )).toBeUndefined();

    const partial = { ...fixture };
    delete partial.workflow_run;
    expect(validateImplementationProvenance(partial)).toEqual([
      { kind: 'implementation-provenance-shape-invalid' },
    ]);

    expect(validateImplementationProvenance(fixture, {
      repository: 'other/repository',
      sessionId: 'squad-implementation-session/v1/12345/99999',
    })).toEqual(expect.arrayContaining([
      {
        kind: 'implementation-provenance-runtime-mismatch',
        field: 'repository',
      },
      {
        kind: 'implementation-provenance-runtime-mismatch',
        field: 'session',
      },
    ]));
  });

  it('validates the containing PR self-reference and preserves the legacy marker', () => {
    const item = {
      type: 'create_pull_request',
      branch: 'squad/implement-42-example',
      body: bodyFor(fixture),
    };
    expect(evaluateImplementationProvenanceItems({
      items: [item],
      repository: 'octo/example',
      issueNumber: '42',
      sessionId: 'squad-implementation-session/v1/12345/67890',
      workflow: '.github/workflows/squad-implement-worker.lock.yml',
      runId: 70001,
      runAttempt: 1,
      namespace: 'implement',
      requireLegacyMarker: true,
    })).toMatchObject({ ok: true, enforced: true, violations: [] });

    const copied = {
      ...item,
      branch: 'squad/implement-42-copied',
    };
    expect(evaluateImplementationProvenanceItems({
      items: [copied],
      repository: 'octo/example',
      issueNumber: '42',
      sessionId: 'squad-implementation-session/v1/12345/67890',
      workflow: '.github/workflows/squad-implement-worker.lock.yml',
      runId: 70001,
      runAttempt: 1,
      namespace: 'implement',
      requireLegacyMarker: true,
    }).violations).toContainEqual({
      kind: 'implementation-provenance-runtime-mismatch',
      field: 'head-ref',
    });
  });

  it('accepts dependency PR payloads without inventing a legacy marker', () => {
    const dependency = structuredClone(fixture);
    dependency.workflow_run = {
      ...(dependency.workflow_run as Record<string, unknown>),
      workflow: '.github/workflows/squad-deps-worker.lock.yml',
    };
    dependency.pull_request = {
      ...(dependency.pull_request as Record<string, unknown>),
      head_ref: 'squad/deps-42-update',
    };
    expect(evaluateImplementationProvenanceItems({
      items: [{
        type: 'create_pull_request',
        branch: 'squad/deps-42-update',
        body: bodyFor(dependency, false),
      }],
      repository: 'octo/example',
      issueNumber: '42',
      sessionId: 'squad-implementation-session/v1/12345/67890',
      workflow: '.github/workflows/squad-deps-worker.lock.yml',
      runId: 70001,
      runAttempt: 1,
      namespace: 'deps',
      requireLegacyMarker: false,
    })).toMatchObject({ ok: true, enforced: true, violations: [] });
  });
});
