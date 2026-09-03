import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractIssueNumber,
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

function artifact(bindings: object[], phased = false) {
  return {
    squad_artifact: phased ? 'phases-activated' : 'activated',
    schema_version: '1',
    origin_issue: 1,
    phases: phased ? [2] : [],
    bindings,
  };
}

function task({
  task = '1',
  issue,
  epic = '2.1',
  epicIssue = 6,
  agent,
  epicAgents = [agent],
  label,
  omission,
  epicLabel,
  epicOmission,
}: {
  task?: string;
  issue: number;
  epic?: string;
  epicIssue?: number;
  agent: string;
  epicAgents?: string[];
  label?: string;
  omission?: string;
  epicLabel?: string;
  epicOmission?: string;
}) {
  return {
    task,
    issue,
    epic,
    epic_issue: epicIssue,
    agent,
    epic_agents: epicAgents,
    ...(label ? { label } : {}),
    ...(omission ? { omission_reason: omission } : {}),
    ...(epicLabel ? { epic_label: epicLabel } : {}),
    ...(epicOmission ? { epic_omission_reason: epicOmission } : {}),
  };
}

describe('deterministic post-activation agent binding guard (#1801)', () => {
  it('parses the last Structured data block from an activation comment', () => {
    const parsed = parseStructuredData(`
Activation bindings:
\`\`\`json
[{"task":"6","issue":17,"epic":"2.1","epic_issue":6,"agent":"McManus","epic_agents":["mcmanus"],"label":"squad:mcmanus","epic_label":"squad:mcmanus"}]
\`\`\`
Structured data:
\`\`\`json
{"squad_artifact":"activated","schema_version":"1","origin_issue":1,"phases":[]}
\`\`\`
`);
    expect(parsed.bindings[0]).toMatchObject({ task: '6', issue: 17, agent: 'McManus' });
  });

  it('rejects the observed #1859 correspondence failure despite both agents being roster names', () => {
    const input = artifact([
      task({ task: '6', issue: 17, agent: 'McManus', label: 'squad:mcmanus', epicLabel: 'squad:mcmanus' }),
    ]);
    expect(() => validateBindings(input, roster, labels({
      17: ['squad', 'squad:kint'],
      6: ['squad', 'squad:mcmanus'],
    }))).toThrow('expected squad:mcmanus, found squad:kint');
  });

  it('accepts multi-wave task numbers and checks each task against its own mapping', () => {
    const input = artifact([
      task({
        task: '2.1',
        issue: 21,
        epic: '2',
        epicIssue: 20,
        agent: 'Kint',
        epicAgents: ['kint', 'mcmanus'],
        label: 'squad:kint',
        epicOmission: 'multi-owner',
      }),
      task({
        task: '2.2',
        issue: 22,
        epic: '2',
        epicIssue: 20,
        agent: 'McManus',
        epicAgents: ['kint', 'mcmanus'],
        label: 'squad:mcmanus',
        epicOmission: 'multi-owner',
      }),
    ], true);
    expect(validateBindings(input, roster, labels({
      20: ['squad'],
      21: ['squad', 'squad:kint'],
      22: ['squad', 'squad:mcmanus'],
    }))).toEqual({ skipped: false, checked: 2, epics: 1 });
  });

  it('derives single- and multi-owner epic behavior from task bindings', () => {
    const singleOwner = artifact([
      task({ issue: 17, agent: 'McManus', label: 'squad:mcmanus', epicLabel: 'squad:mcmanus' }),
    ]);
    expect(validateBindings(singleOwner, roster, labels({
      6: ['squad', 'squad:mcmanus'],
      17: ['squad', 'squad:mcmanus'],
    })).epics).toBe(1);

    const multiOwner = artifact([
      task({ issue: 21, agent: 'Kint', epicAgents: ['kint', 'mcmanus'], label: 'squad:kint', epicOmission: 'multi-owner' }),
      task({ issue: 22, agent: 'McManus', epicAgents: ['mcmanus', 'kint'], label: 'squad:mcmanus', epicOmission: 'multi-owner' }),
    ]);
    expect(validateBindings(multiOwner, roster, labels({
      6: ['squad'],
      21: ['squad', 'squad:kint'],
      22: ['squad', 'squad:mcmanus'],
    })).epics).toBe(1);
  });

  it('rejects the observed #1860 epic report/label inconsistencies', () => {
    const falseSingleOwnerReport = artifact([
      task({ issue: 17, agent: 'McManus', label: 'squad:mcmanus', epicLabel: 'squad:mcmanus' }),
    ]);
    expect(() => validateBindings(falseSingleOwnerReport, roster, labels({
      6: ['squad'],
      17: ['squad', 'squad:mcmanus'],
    }))).toThrow('expected squad:mcmanus, found bare squad');

    const omittedMultiOwnerReport = artifact([
      task({ issue: 21, agent: 'Kint', epicAgents: ['kint', 'mcmanus'], label: 'squad:kint' }),
      task({ issue: 22, agent: 'McManus', epicAgents: ['kint', 'mcmanus'], label: 'squad:mcmanus' }),
    ]);
    expect(() => validateBindings(omittedMultiOwnerReport, roster, labels({
      6: ['squad'],
      21: ['squad', 'squad:kint'],
      22: ['squad', 'squad:mcmanus'],
    }))).toThrow('epic_omission_reason must be multi-owner');
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
    }, roster, new Map())).toThrow('bindings are missing or empty');
  });

  it('fails closed when activation evidence has no parseable structured block', () => {
    expect(() => parseStructuredData(
      'Structured data:\n```json\n{"squad_artifact":"activated","bindings":[',
    )).toThrow('could not be parsed');
  });

  it('fails closed when the activation bindings block is malformed', () => {
    expect(() => parseStructuredData(`
Activation bindings:
\`\`\`json
[{"task":
\`\`\`
Structured data:
\`\`\`json
{"squad_artifact":"activated","schema_version":"1","origin_issue":1,"phases":[]}
\`\`\`
`)).toThrow('activation bindings are invalid JSON');
  });

  it('fails closed when a task or epic issue cannot be resolved', () => {
    const input = artifact([
      task({ issue: 99, agent: 'Kint', label: 'squad:kint', epicLabel: 'squad:kint' }),
    ]);
    expect(() => validateBindings(input, roster, new Map())).toThrow('labels could not be resolved');
  });

  it('requires non-roster omissions for both task and sole-owner epic', () => {
    const missingReport = artifact([
      task({ issue: 30, agent: 'Reviewer' }),
    ]);
    expect(() => validateBindings(missingReport, roster, labels({
      6: ['squad'],
      30: ['squad'],
    }))).toThrow('omission_reason must be non-roster');

    const reported = artifact([
      task({
        issue: 30,
        agent: 'Reviewer',
        omission: 'non-roster',
        epicOmission: 'non-roster',
      }),
    ]);
    expect(validateBindings(reported, roster, labels({
      6: ['squad'],
      30: ['squad'],
    })).checked).toBe(1);
  });

  it('maps the special @copilot assignment to squad:copilot', () => {
    const input = artifact([
      task({
        issue: 40,
        agent: '@copilot',
        label: 'squad:copilot',
        epicLabel: 'squad:copilot',
      }),
    ]);
    expect(validateBindings(input, roster, labels({
      6: ['squad', 'squad:copilot'],
      40: ['squad', 'squad:copilot'],
    })).checked).toBe(1);
  });

  it('uses the full epic agent set for phased activation', () => {
    const input = artifact([
      task({
        issue: 50,
        epicIssue: 60,
        agent: 'Kint',
        epicAgents: ['kint', 'mcmanus'],
        label: 'squad:kint',
        epicOmission: 'multi-owner',
      }),
    ], true);
    expect(validateBindings(input, roster, labels({
      50: ['squad', 'squad:kint'],
      60: ['squad'],
    })).epics).toBe(1);
  });

  it('rejects one epic identifier mapped to multiple epic issue numbers', () => {
    const input = artifact([
      task({ issue: 70, epicIssue: 60, agent: 'Kint', epicAgents: ['kint', 'mcmanus'], label: 'squad:kint', epicOmission: 'multi-owner' }),
      task({ issue: 71, epicIssue: 61, agent: 'McManus', epicAgents: ['kint', 'mcmanus'], label: 'squad:mcmanus', epicOmission: 'multi-owner' }),
    ]);
    expect(() => validateBindings(input, roster, labels({
      60: ['squad'],
      61: ['squad'],
      70: ['squad', 'squad:kint'],
      71: ['squad', 'squad:mcmanus'],
    }))).toThrow('maps to multiple epic issue numbers');
  });

  it('wires a plain read-only workflow to Node 22 and the checker', () => {
    const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'squad-agent-binding-check.yml'), 'utf8');
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('workflows: [Squad, Squad CI]');
    expect(workflow).toContain('issues: read');
    expect(workflow).toContain('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('node scripts/check-agent-binding.mjs');
    expect(workflow).not.toContain('issues: write');
  });

  it('specifies every binding item as a complete task-to-epic mapping', () => {
    const workflow = readFileSync(join(process.cwd(), 'workflows', 'squad.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(workflow).toContain('Activation bindings:');
    expect(workflow).toContain('"task":"{plan # cell}"');
    expect(workflow).toContain('"epic_issue":"{epic issue reference}"');
    expect(workflow).toContain('"epic_agents":["{all distinct lowercased Agent cells');
  });

  it('fails closed on an incomplete envelope or mismatched origin issue', () => {
    const binding = task({ issue: 1, epicIssue: 2, agent: 'Kint', label: 'squad:kint', epicLabel: 'squad:kint' });
    expect(() => validateBindings({
      squad_artifact: 'activated',
      bindings: [binding],
    }, roster, labels({
      1: ['squad', 'squad:kint'],
      2: ['squad', 'squad:kint'],
    }))).toThrow('schema_version');

    expect(() => validateActivation({
      squad_artifact: 'activated',
      schema_version: '1',
      origin_issue: 8,
      phases: [],
      bindings: [binding],
    }, roster, labels({
      1: ['squad', 'squad:kint'],
      2: ['squad', 'squad:kint'],
    }), 9)).toThrow('does not match comment issue');
  });
});

describe('extractIssueNumber() label-prefetch reference resolution (#1980)', () => {
  it('passes a bare integer through unchanged', () => {
    expect(extractIssueNumber(42)).toBe(42);
  });

  it('resolves a quoted "#42" reference to 42', () => {
    expect(extractIssueNumber('#42')).toBe(42);
  });

  it('returns undefined for an unresolved temporary ID like "#aw_task1"', () => {
    expect(extractIssueNumber('#aw_task1')).toBeUndefined();
  });

  it('returns undefined for non-numeric garbage', () => {
    expect(extractIssueNumber('not-a-number')).toBeUndefined();
  });

  it("extracts only the resolvable issue numbers from a mixed-reference binding list, matching main()'s label-prefetch usage", () => {
    // Mirrors main()'s `bindings.flatMap(binding => [extractIssueNumber(binding?.issue), extractIssueNumber(binding?.epic_issue)]).filter(Number.isInteger)`
    // with a quoted resolved reference, a bare integer, and an unresolved temporary ID mixed
    // together, since that is exactly the shape a real activation artifact produces.
    const bindings = [
      { issue: '#17', epic_issue: 6 },
      { issue: 18, epic_issue: '#aw_task2' },
    ];
    const issues = bindings
      .flatMap(binding => [extractIssueNumber(binding?.issue), extractIssueNumber(binding?.epic_issue)])
      .filter(Number.isInteger);
    expect(issues).toEqual([17, 6, 18]);
  });
});
