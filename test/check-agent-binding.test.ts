import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseRoster,
  parseStructuredData,
  validateActivation,
  validateBindings,
} from '../scripts/check-agent-binding.mjs';

const roster = parseRoster(`
## Members
| Name | Role |
|------|------|
| Kint | Lead |
| McManus | Dev |
`);

function labels(entries: Record<number, string[]>) {
  return new Map(Object.entries(entries).map(([issue, issueLabels]) => [
    Number(issue),
    new Set(issueLabels),
  ]));
}

describe('deterministic post-activation agent binding guard (#1801)', () => {
  it('parses the last Structured data block from an activation comment', () => {
    const artifact = parseStructuredData(`
Structured data:
\`\`\`json
{"squad_artifact":"activated","schema_version":"1","origin_issue":1,"phases":[],"bindings":[{"kind":"task","task":"6","issue":17,"epic":"2.1","agent":"McManus","agents":["mcmanus"],"label":"squad:mcmanus"}]}
\`\`\`
`);
    expect(artifact.bindings[0]).toMatchObject({ task: '6', issue: 17, agent: 'McManus' });
  });

  it('rejects the observed #1859 correspondence failure despite both agents being roster names', () => {
    const artifact = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        { kind: 'task', task: '6', issue: 17, epic: '2.1', agent: 'McManus', agents: ['mcmanus'], label: 'squad:mcmanus' },
      ],
    };
    expect(() => validateBindings(artifact, roster, labels({ 17: ['squad', 'squad:kint'] })))
      .toThrow('expected squad:mcmanus, found squad:kint');
  });

  it('accepts multi-wave task numbers and checks each task against its own mapping', () => {
    const artifact = {
      squad_artifact: 'phases-activated', schema_version: '1', origin_issue: 1, phases: [2],
      bindings: [
        { kind: 'task', task: '2.1', issue: 21, epic: '2', agent: 'Kint', agents: ['kint'], label: 'squad:kint' },
        { kind: 'task', task: '2.2', issue: 22, epic: '2', agent: 'McManus', agents: ['mcmanus'], label: 'squad:mcmanus' },
      ],
    };
    expect(validateBindings(artifact, roster, labels({
      21: ['squad', 'squad:kint'],
      22: ['squad', 'squad:mcmanus'],
    }))).toEqual({ skipped: false, checked: 2 });
  });

  it('derives epic behavior from the distinct task-agent set', () => {
    const singleOwner = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        { kind: 'epic', issue: 6, epic: '2.1', agents: ['mcmanus'], label: 'squad:mcmanus' },
      ],
    };
    expect(validateBindings(singleOwner, roster, labels({ 6: ['squad', 'squad:mcmanus'] })).checked).toBe(1);

    const multiOwner = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        { kind: 'epic', issue: 7, epic: '1.2', agents: ['kint', 'mcmanus'], omission_reason: 'multi-owner' },
      ],
    };
    expect(validateBindings(multiOwner, roster, labels({ 7: ['squad'] })).checked).toBe(1);
  });

  it('rejects the observed #1860 summary/label inconsistencies', () => {
    const falseSingleOwnerReport = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        { kind: 'epic', issue: 6, epic: '2.1', agents: ['mcmanus'], label: 'squad:mcmanus' },
      ],
    };
    expect(() => validateBindings(falseSingleOwnerReport, roster, labels({ 6: ['squad'] })))
      .toThrow('expected squad:mcmanus, found bare squad');

    const omittedMultiOwnerReport = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        { kind: 'epic', issue: 7, epic: '1.2', agents: ['kint', 'mcmanus'] },
      ],
    };
    expect(() => validateBindings(omittedMultiOwnerReport, roster, labels({ 7: ['squad'] })))
      .toThrow('omission report must be multi-owner');
  });

  it.each([
    ['missing', undefined],
    ['empty', []],
  ])('fails closed when activation bindings are %s', (_name, bindings) => {
    expect(() => validateBindings({
      squad_artifact: 'activated',
      schema_version: '1',
      origin_issue: 1,
      phases: [],
      bindings,
    }, roster, new Map()))
      .toThrow('bindings are missing or empty');
  });

  it('fails closed when activation evidence has no parseable structured block', () => {
    expect(() => parseStructuredData(
      'Structured data:\n```json\n{"squad_artifact":"activated","bindings":[',
    )).toThrow('could not be parsed');
  });

  it('fails closed when a binding issue cannot be resolved', () => {
    const artifact = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        { kind: 'task', task: '1', issue: 99, epic: '1.1', agent: 'Kint', agents: ['kint'], label: 'squad:kint' },
      ],
    };
    expect(() => validateBindings(artifact, roster, new Map())).toThrow('labels could not be resolved');
  });

  it('requires non-roster omissions to be reported and carry no agent label', () => {
    const artifact = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        { kind: 'task', task: '3', issue: 30, epic: '1.2', agent: 'Reviewer', agents: ['reviewer'] },
      ],
    };
    expect(() => validateBindings(artifact, roster, labels({ 30: ['squad'] })))
      .toThrow('omission report must be non-roster');

    const reportedArtifact = {
      squad_artifact: 'activated', schema_version: '1', origin_issue: 1, phases: [],
      bindings: [
        {
          kind: 'task',
          task: '3',
          issue: 30,
          epic: '1.2',
          agent: 'Reviewer',
          agents: ['reviewer'],
          omission_reason: 'non-roster',
        },
      ],
    };
    expect(validateBindings(reportedArtifact, roster, labels({ 30: ['squad'] })).checked).toBe(1);
  });

  it('wires a plain read-only workflow to the checker', () => {
    const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'squad-agent-binding-check.yml'), 'utf8');
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('issues: read');
    expect(workflow).toContain('node scripts/check-agent-binding.mjs');
    expect(workflow).not.toContain('issues: write');
  });

  it('fails closed on an incomplete envelope or mismatched origin issue', () => {
    expect(() => validateBindings({
      squad_artifact: 'activated',
      bindings: [{ kind: 'task', task: '1', issue: 1, epic: '1', agent: 'Kint', agents: ['kint'], label: 'squad:kint' }],
    }, roster, labels({ 1: ['squad', 'squad:kint'] }))).toThrow('schema_version');

    expect(() => validateActivation({
      squad_artifact: 'activated',
      schema_version: '1',
      origin_issue: 8,
      phases: [],
      bindings: [{ kind: 'task', task: '1', issue: 1, epic: '1', agent: 'Kint', agents: ['kint'], label: 'squad:kint' }],
    }, roster, labels({ 1: ['squad', 'squad:kint'] }), 9)).toThrow('does not match comment issue');
  });
});
