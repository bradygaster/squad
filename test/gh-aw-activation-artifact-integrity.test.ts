/**
 * Both activation routes delegate metadata and bindings to the trusted writer.
 * Checker, wording-scanner and collector regressions remain independently covered.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertAcceptedOnlyLabelWording,
  parseAgentRegistry,
  parseRoster,
  parseStructuredData,
  validateActivation,
  validateBindings,
} from '../scripts/check-agent-binding.mjs';
import {
  ACTIVATION_RECEIPT_SCHEMA, buildActivationBindings, digest,
} from '../workflows/shared/squad-activation.mjs';

/** Read a text file with line endings normalized to LF (Windows checkouts materialize CRLF). */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const ONTOLOGY = join(WORKFLOWS_DIR, 'shared', 'squad-planning-ontology.md');
const COLLECTOR_YML = join(process.cwd(), '.github', 'workflows', 'squad-agent-binding-check.yml');

const workflow = readText(SQUAD_WORKFLOW);
const ontology = readText(ONTOLOGY);

/** Skill bodies end at the next level-two heading or EOF, not a legacy end marker. */
function skillBody(name: string): string {
  const heading = `## skill: \`${name}\``;
  const start = workflow.indexOf(heading);
  expect(start, `${heading} is missing`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + heading.length);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}
const activateSkill = skillBody('squad-plan-activate');
const acceptSkill = skillBody('squad-plan-accept');

/** Both activation paths, so parity assertions cannot pass by covering only one. */
const BOTH_PATHS: ReadonlyArray<readonly [string, string]> = [
  ['/squad plan activate (squad-plan-activate)', activateSkill],
  ['/squad activate fast path (squad-plan-accept)', acceptSkill],
];

describe('gh-aw: both model paths delegate activation publication to the trusted writer', () => {
  it.each(BOTH_PATHS)('%s: routes to activate_plan rather than authoring bindings', (_path, text) => {
    expect(text).toContain('`activate_plan`');
    expect(text).toContain('trusted');
    expect(text).not.toMatch(/MUST include an `Activation bindings:|Label operations accepted/);
  });

  it('makes the granular route reuse the exact fast-path procedure and recovery rules', () => {
    expect(activateSkill.replace(/\s+/g, ' ')).toContain(
      'same `activate_plan` procedure and no-create recovery rules as `squad-plan-accept`',
    );
    expect(activateSkill).toContain('one `activate_plan` request only');
  });

  it('requires exactly one comment-ID request and forbids model-owned metadata and native writes', () => {
    const prose = acceptSkill.replace(/\s+/g, ' ');
    expect(prose).toMatch(/Call `activate_plan` exactly once with `plan_comment_id`/);
    expect(prose).toContain("comment's numeric ID as a string. Emit no other safe-output operation.");
    expect(prose).toContain('Do not call `create_issue`, `add_labels`, `add_comment` or `upsert_lifecycle_state`');
    expect(prose).toContain('Do not author Activation bindings, acceptance metadata, issue-number maps');
    expect(prose).toContain('synchronous createIssue API');
    expect(prose).toContain('Never deduplicate by title, guess issue numbers');
  });

  it('retains the shared ontology requirement for all four acceptance types', () => {
    const prose = ontology.replace(/\s+/g, ' ');
    expect(prose).toMatch(
      /mandatory for\s*`phases-activated`, `activated`, `phases-accepted`, and `plan-accepted` artifacts/,
    );
    expect(prose).toMatch(/neither path may omit it or ship an\s*empty array/);
  });
});

const trustedTeam = '## Members\n| Name | Role |\n|---|---|\n| Builder | Engineer |';
const trustedRegistry = {
  schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 3,
  agents: {
    builder: {
      status: 'active', display_name: 'Builder', persistent_name: 'Builder', role: 'Engineer',
      universe: 'descriptive', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    },
  },
};

function producerFixture(kind = 'implementation', phase: number | null = null) {
  const capture = {
    repository: 'example/project', origin_issue: 7, registry: trustedRegistry,
    run_id: 100, run_attempt: 1, phase,
    plan: {
      kind, tasks: [
        { id: '1', epic: 'epic1', agent: 'Builder', agent_id: 'builder', label: 'squad:builder', dependencies: [] as string[] },
        { id: '2', epic: 'epic1', agent: 'Builder', agent_id: 'builder', label: 'squad:builder', dependencies: ['1'] },
      ],
    },
    operations: [{ id: 'epic:epic1' }, { id: 'task:1' }, { id: 'task:2' }],
  };
  const journal = {
    schema: ACTIVATION_RECEIPT_SCHEMA, capture_sha256: digest(capture),
    repository: capture.repository, run_id: capture.run_id, run_attempt: capture.run_attempt,
    started: capture.operations.map(operation => operation.id),
    parent_fallbacks: [],
    receipts: capture.operations.map((operation, index) => ({
      operation_id: operation.id, repository: capture.repository,
      number: 40 + index, id: 1040 + index, node_id: `I_example_${40 + index}`,
      url: `https://github.com/example/project/issues/${40 + index}`,
    })),
  };
  return { capture, journal };
}

function checkProduced(capture: ReturnType<typeof producerFixture>['capture'], bindings: unknown) {
  const artifact = capture.plan.kind === 'plan'
    ? (capture.phase === null ? 'plan-accepted' : 'phases-accepted')
    : (capture.phase === null ? 'activated' : 'phases-activated');
  return validateActivation({
    squad_artifact: artifact, schema_version: '1', origin_issue: capture.origin_issue,
    phases: capture.phase === null ? [] : [capture.phase], bindings,
  }, parseRoster(trustedTeam), new Map([40, 41, 42].map(number =>
    [number, new Set(['squad', 'squad:builder'])])), capture.origin_issue, {
    repository: capture.repository, registry: parseAgentRegistry(trustedRegistry),
  });
}

describe.each([
  ['plan', null, 'plan-accepted'], ['plan', 1, 'phases-accepted'],
  ['implementation', null, 'activated'], ['implementation', 1, 'phases-activated'],
] as const)('trusted producer: %s phase %s emits %s', (kind, phase, artifact) => {
  it('builds complete versioned metadata and real-number bindings for the compatibility checker', () => {
    const { capture, journal } = producerFixture(kind, phase);
    const bindings = buildActivationBindings(capture, journal);
    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toEqual({
      binding_schema: 'squad-work-agent-binding/v1', binding_version: 1, producer: 'squad',
      repository: 'example/project', origin_issue: 7, artifact,
      registry_schema: 'squad-agent-provenance/v1', registry_revision: 3,
      task: '1', issue: '#41', epic: 'epic1', epic_issue: '#40',
      agent: 'Builder', agent_id: 'builder', epic_agents: ['builder'], epic_agent_ids: ['builder'],
      label: 'squad:builder', epic_label: 'squad:builder', depends_on: [],
    });
    expect(bindings[1]).toMatchObject({ task: '2', issue: '#42', depends_on: ['#41'] });
    expect(checkProduced(capture, bindings)).toMatchObject({ checked: 2 });
  });
});

describe('trusted producer: missing, empty and unresolved binding evidence fails closed', () => {
  it.each([0, 1, 2])('does not build bindings from only %i of three create receipts', count => {
    const { capture, journal } = producerFixture();
    journal.receipts = journal.receipts.slice(0, count);
    expect(() => buildActivationBindings(capture, journal)).toThrow(/recreation is forbidden/);
  });

  it.each(['aw_task1', '#aw_task1', undefined])('rejects unresolved or missing actual issue number %j', number => {
    const { capture, journal } = producerFixture();
    Object.assign(journal.receipts[1], { number });
    expect(() => buildActivationBindings(capture, journal)).toThrow(/actual issue identities/);
  });

  it('cannot publish an empty binding array even with an empty self-consistent journal', () => {
    const { capture, journal } = producerFixture();
    capture.plan.tasks = [];
    capture.operations = [];
    journal.started = [];
    journal.receipts = [];
    journal.capture_sha256 = digest(capture);
    expect(() => checkProduced(capture, buildActivationBindings(capture, journal)))
      .toThrow(/bindings are missing or empty/);
  });

  it('cannot resolve dependencies absent from the actual receipt map', () => {
    const { capture, journal } = producerFixture();
    capture.plan.tasks[1].dependencies = ['missing'];
    journal.capture_sha256 = digest(capture);
    expect(() => buildActivationBindings(capture, journal)).toThrow();
  });

  it('cannot resolve a missing epic receipt even when all declared operations finished', () => {
    const { capture, journal } = producerFixture();
    capture.operations.shift();
    journal.started.shift();
    journal.receipts.shift();
    journal.capture_sha256 = digest(capture);
    expect(() => buildActivationBindings(capture, journal)).toThrow();
  });

  it.each([
    { binding_schema: undefined }, { producer: 'model' }, { registry_revision: 4 },
    { repository: 'example/other' }, { origin_issue: 8 }, { issue: 'aw_task1' },
    { epic_issue: '#aw_epic1' },
  ])('checker rejects corrupted producer metadata or unresolved mappings: %j', mutation => {
    const { capture, journal } = producerFixture();
    const bindings = buildActivationBindings(capture, journal);
    Object.assign(bindings[0], mutation);
    expect(() => checkProduced(capture, bindings)).toThrow();
  });

  it('never labels the existing origin as an epic for a flat plan', () => {
    const { capture, journal } = producerFixture('plan');
    capture.plan.tasks.forEach(task => { task.epic = 'origin'; });
    capture.operations.shift();
    journal.started.shift();
    journal.receipts.shift();
    journal.capture_sha256 = digest(capture);
    const bindings = buildActivationBindings(capture, journal);
    for (const binding of bindings) {
      expect(binding).toMatchObject({ epic: 'origin', epic_issue: '#7', epic_label: null, epic_omission_reason: 'origin' });
    }
    expect(checkProduced(capture, bindings)).toMatchObject({ checked: 2 });
  });
});

// ---------------------------------------------------------------------------
// 3a. Checker: fast-path artifact types get the same bindings validation.
// ---------------------------------------------------------------------------

const roster = parseRoster(`
## Members
| Name | Role |
|------|------|
| Kint | Lead |
`);

function binding(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    binding_schema: 'squad-work-agent-binding/v1',
    binding_version: 1,
    producer: 'squad',
    repository: 'bradygaster/squad',
    origin_issue: 1,
    artifact: 'activated',
    registry_schema: 'squad-agent-provenance/v1',
    registry_revision: 2,
    task: '1',
    issue: 42,
    epic: '2.1',
    epic_issue: 43,
    agent: 'Kint',
    epic_agents: ['kint'],
    label: 'squad:kint',
    epic_label: 'squad:kint',
    agent_id: 'runtime-engineer',
    epic_agent_ids: ['runtime-engineer'],
    ...overrides,
  };
}

const presentLabels = new Map([
  [42, new Set(['squad', 'squad:kint'])],
  [43, new Set(['squad', 'squad:kint'])],
  [44, new Set(['squad', 'squad:kint'])],
]);
const registry = parseAgentRegistry({
  schema: 'squad-agent-provenance/v1',
  schema_version: 1,
  revision: 2,
  agents: {
    'runtime-engineer': {
      status: 'active',
      display_name: 'Kint',
      persistent_name: 'Kint',
      role: 'Lead',
      universe: 'descriptive',
      created_at: '2026-09-20T20:00:00.000Z',
      updated_at: '2026-09-21T20:00:00.000Z',
    },
    'retired-reviewer': {
      status: 'retired',
      display_name: 'Former Reviewer',
      persistent_name: 'Former Reviewer',
      role: 'Reviewer',
      universe: 'descriptive',
      created_at: '2026-09-20T20:00:00.000Z',
      updated_at: '2026-09-21T20:00:00.000Z',
      retired_at: '2026-09-21T20:00:00.000Z',
    },
  },
});

describe.each([
  ['plan-accepted', false],
  ['phases-accepted', true],
  ['activated', false],
  ['phases-activated', true],
])('checker/runtime: %s bindings validation (E4 preflight A parity)', (squad_artifact, phased) => {
  function artifact(bindings: unknown) {
    return {
      squad_artifact,
      schema_version: '1',
      origin_issue: 1,
      phases: phased ? [1] : [],
      bindings,
    };
  }

  it('fails closed when bindings are absent', () => {
    expect(() => validateBindings(artifact(undefined), roster, presentLabels)).toThrow(
      'bindings are missing or empty',
    );
  });

  describe('checker/runtime: authoritative work-to-agent provenance', () => {
    const artifact = (overrides: Partial<Record<string, unknown>> = {}) => ({
      squad_artifact: 'activated',
      schema_version: '1',
      origin_issue: 1,
      phases: [],
      bindings: [binding(overrides)],
    });
    const authority = { repository: 'bradygaster/squad', registry };

    it('accepts a producer-owned stable id without using display names as identity', () => {
      expect(validateActivation(artifact(), roster, presentLabels, 1, authority))
        .toMatchObject({ checked: 1 });
    });

    it('rejects a partial producer registry before checking bindings', () => {
      expect(() => parseAgentRegistry({
        schema: 'squad-agent-provenance/v1',
        schema_version: 1,
        revision: 2,
        agents: { 'runtime-engineer': { status: 'active', display_name: 'Kint' } },
      })).toThrow(/incomplete/);
    });

    it('accepts historical bindings to retired tombstones', () => {
      const retiredBinding = binding({
        agent_id: 'retired-reviewer',
        epic_agent_ids: ['retired-reviewer'],
      });
      expect(validateActivation(
        { ...artifact(), bindings: [retiredBinding] },
        roster,
        presentLabels,
        1,
        authority,
      )).toMatchObject({ checked: 1 });
    });

    it('accepts explicit external-agent omissions without inferring an id', () => {
      const externalBinding = binding({
        agent_id: null,
        epic_agent_ids: [],
        identity_omission_reason: 'external-agent',
        epic_identity_omission_reason: 'partial',
      });
      expect(validateActivation(
        { ...artifact(), bindings: [externalBinding] },
        roster,
        presentLabels,
        1,
        authority,
      )).toMatchObject({ checked: 1 });
    });

    it('rejects incomplete epic id sets, mixed omission semantics, and mixed revisions', () => {
      const known = binding({
        epic_identity_omission_reason: 'partial',
      });
      const omitted = binding({
        task: '2',
        issue: 44,
        agent_id: null,
        identity_omission_reason: 'external-agent',
        epic_agent_ids: [],
        epic_identity_omission_reason: 'partial',
      });
      expect(() => validateActivation(
        { ...artifact(), bindings: [known, omitted] },
        roster,
        presentLabels,
        1,
        authority,
      )).toThrow(/inconsistent epic_agent_ids|complete epic task-agent set/);

      expect(() => validateActivation(
        {
          ...artifact(),
          bindings: [
            known,
            { ...omitted, epic_agent_ids: ['runtime-engineer'], epic_identity_omission_reason: undefined },
          ],
        },
        roster,
        presentLabels,
        1,
        authority,
      )).toThrow(/every binding requires partial omission/);

      expect(() => validateActivation(
        {
          ...artifact(),
          bindings: [
            binding(),
            binding({ task: '2', issue: 44, registry_revision: 1 }),
          ],
        },
        roster,
        presentLabels,
        1,
        authority,
      )).toThrow(/registry_revision conflicts/);
    });

    it.each([
      ['missing schema', { binding_schema: undefined }],
      ['wrong repository', { repository: 'bradygaster/squadcaster' }],
      ['wrong origin', { origin_issue: 99 }],
      ['wrong artifact', { artifact: 'plan-accepted' }],
      ['future registry', { registry_revision: 3 }],
      ['unknown stable id', { agent_id: 'unknown-agent' }],
      ['partial epic ids', { epic_agent_ids: [] }],
    ])('fails closed for %s', (_case, mutation) => {
      expect(() => validateActivation(artifact(mutation), roster, presentLabels, 1, authority))
        .toThrow();
    });
  });

  it('fails closed when bindings are an empty array', () => {
    expect(() => validateBindings(artifact([]), roster, presentLabels)).toThrow('bindings are missing or empty');
  });

  it('accepts a valid non-empty bindings array', () => {
    const result = validateBindings(artifact([binding()]), roster, presentLabels);
    expect(result).toMatchObject({ skipped: false, checked: 1, epics: 1 });
  });
});

it('non-activation artifact types remain untouched by the bindings contract', () => {
  expect(
    validateBindings(
      { squad_artifact: 'triage', schema_version: '1', origin_issue: 1, phases: [] },
      roster,
      presentLabels,
    ),
  ).toEqual({ skipped: true });
});

describe('checker/runtime: full parseStructuredData + validateActivation pipeline against realistic fast-path comments', () => {
  function fastPathComment(bindingsBlock: string): string {
    return `## ✅ Plan Activated — 1 epic, 1 task

| # | Title | Issue | Size | Agent |
|---|-------|-------|------|-------|
| 1 | Do the thing | #42 | S | Kint |

${bindingsBlock}
Structured data:
\`\`\`json
{"squad_artifact":"plan-accepted","schema_version":"1","origin_issue":1,"phases":[]}
\`\`\`
`;
  }

  const VALID_BINDINGS_BLOCK = `Activation bindings:
\`\`\`json
[{"task":"1","issue":"#42","epic":"2.1","epic_issue":"#43","agent":"Kint","epic_agents":["kint"],"label":"squad:kint","epic_label":"squad:kint"}]
\`\`\``;

  it('a realistic comment with a valid bindings block parses and validates cleanly', () => {
    const artifact = parseStructuredData(fastPathComment(VALID_BINDINGS_BLOCK));
    expect(artifact).not.toBeNull();
    const result = validateActivation(artifact, roster, new Map([[42, new Set(['squad', 'squad:kint'])], [43, new Set(['squad', 'squad:kint'])]]));
    expect(result).toMatchObject({ skipped: false, checked: 1 });
  });

  it('runtime-shape mutation: deleting the Activation bindings block from a real comment fails validation', () => {
    const artifact = parseStructuredData(fastPathComment(''));
    expect(artifact).not.toBeNull();
    expect(() => validateActivation(artifact, roster, new Map())).toThrow('bindings are missing or empty');
  });

  it('runtime-shape mutation: emptying the Activation bindings array in a real comment fails validation', () => {
    const emptied = 'Activation bindings:\n```json\n[]\n```';
    const artifact = parseStructuredData(fastPathComment(emptied));
    expect(artifact).not.toBeNull();
    expect(() => validateActivation(artifact, roster, new Map())).toThrow('bindings are missing or empty');
  });
});

// ---------------------------------------------------------------------------
// 3b. Checker: accepted-only label-operation wording, scoped (not blanket-scanned).
// ---------------------------------------------------------------------------

const FORBIDDEN_WORDS = ['applied', 'received', 'landed', 'verified', 'confirmed', 'checked'] as const;

describe('checker/runtime: rejects standalone certainty claims in label-operation reporting', () => {
  describe.each(FORBIDDEN_WORDS)('forbidden word "%s"', word => {
    it.each([
      word,
      word.toUpperCase(),
      `${word[0].toUpperCase()}${word.slice(1)}`,
      `${word}.`,
      `${word},`,
      `${word}!`,
    ])('flags a label-operation claim using %j', variant => {
      const comment = `- Label squad:kint was ${variant} for #42`;
      expect(() => assertAcceptedOnlyLabelWording(comment, 'activated')).toThrow(
        /forbidden certainty claim/,
      );
    });
  });

  it.each([
    ['activated'],
    ['phases-activated'],
    ['plan-accepted'],
    ['phases-accepted'],
  ])('applies identically to the %s artifact type', artifactType => {
    expect(() =>
      assertAcceptedOnlyLabelWording('Label squad:kint was verified for #42', artifactType),
    ).toThrow(/forbidden certainty claim/);
  });

  it('is a no-op for artifact types outside the activation contract', () => {
    expect(assertAcceptedOnlyLabelWording('Label squad:kint was verified for #42', 'triage')).toEqual({
      skipped: true,
    });
    expect(assertAcceptedOnlyLabelWording('Label squad:kint was verified for #42', 'research')).toEqual({
      skipped: true,
    });
  });

  it('accepts compliant accepted-only wording', () => {
    expect(
      assertAcceptedOnlyLabelWording('- Label squad:kint: add_labels accepted for #42.', 'activated'),
    ).toEqual({ skipped: false });
  });

  // --- Negative cases: the whole point of scoping is that these must NOT false-positive.

  it('does not flag a forbidden word inside a quoted work-item title', () => {
    expect(
      assertAcceptedOnlyLabelWording(
        'Label squad:kint: title "Verified Payments Reconciliation" accepted.',
        'activated',
      ),
    ).toEqual({ skipped: false });
  });

  it('does not flag a forbidden word inside a markdown table row (titles live there)', () => {
    const comment = '| 1 | "Verified Email Addresses" | #42 | S | Kint |';
    expect(assertAcceptedOnlyLabelWording(comment, 'activated')).toEqual({ skipped: false });
  });

  it('does not flag a forbidden word in a line unrelated to label-operation reporting', () => {
    // No "label"/"labels"/"squad:*" mention — out of scope for this check, even though the
    // word is a bare, unquoted claim about something else entirely.
    expect(
      assertAcceptedOnlyLabelWording('The build was verified successfully by CI.', 'activated'),
    ).toEqual({ skipped: false });
  });

  it('does not flag an explicit negation — the honest, compliant statement the contract requires', () => {
    expect(
      assertAcceptedOnlyLabelWording('Label squad:kint was not verified on the issue.', 'activated'),
    ).toEqual({ skipped: false });
    expect(
      assertAcceptedOnlyLabelWording(
        'Label squad:copilot: never confirmed by GitHub, only accepted.',
        'activated',
      ),
    ).toEqual({ skipped: false });
  });

  it('does not flag a forbidden word appearing only as a substring of another word', () => {
    expect(
      assertAcceptedOnlyLabelWording('Label squad:kint operation unverified; retry recommended.', 'activated'),
    ).toEqual({ skipped: false });
    expect(
      assertAcceptedOnlyLabelWording('Label squad:kint remains prechecked for retry.', 'activated'),
    ).toEqual({ skipped: false });
  });

  it('does not use a blanket whole-comment scan: an unrelated section may say the word freely', () => {
    const comment = `## ✅ Plan Activated — 1 epic, 1 task

| # | Title | Issue | Size | Agent |
|---|-------|-------|------|-------|
| 1 | "Verified Email Addresses" | #42 | S | Kint |

Label squad:kint: add_labels accepted for #42.
`;
    expect(assertAcceptedOnlyLabelWording(comment, 'activated')).toEqual({ skipped: false });
  });

  it('regression: a whole-comment scan would have false-positived on the table row above', () => {
    const comment = `| 1 | "Verified Email Addresses" | #42 | S | Kint |

Label squad:kint: add_labels accepted for #42.
`;
    // Demonstrates why the check must not be a blanket substring scan: `\bverified\b` alone
    // matches this comment, but the scoped checker must not flag it.
    expect(/\bverified\b/i.test(comment)).toBe(true);
    expect(assertAcceptedOnlyLabelWording(comment, 'activated')).toEqual({ skipped: false });
  });

  // --- Regression: negation/claim scope must bind to a clause, not the whole line.

  it('regression: an unrelated negation earlier on the line must not blanket-suppress a real, separate claim', () => {
    // "No issues were skipped" negates "skipped", not "verified" — the claim after the colon
    // is a genuinely separate clause and is a real, standalone certainty claim.
    expect(() =>
      assertAcceptedOnlyLabelWording(
        'No issues were skipped: Label squad:kint was verified for #42.',
        'activated',
      ),
    ).toThrow(/forbidden certainty claim/);
  });

  it('regression: a forbidden word describing a different subject on the same line as a label token must not flag', () => {
    // "its verified real number" describes the reused issue number, not the label operation —
    // this is the exact, sanctioned "or by its verified real number for a reused issue" wording
    // from the Label operations accepted contract (workflows/squad.md), and must pass.
    expect(
      assertAcceptedOnlyLabelWording(
        'Reported squad:kint for issue #123, its verified real number (reused this run).',
        'activated',
      ),
    ).toEqual({ skipped: false });
  });
});

// ---------------------------------------------------------------------------
// 4. CI collector actually passes fast-path artifacts to the checker.
// ---------------------------------------------------------------------------

const COLLECTOR_ARTIFACT_REGEX_SOURCE =
  '"squad_artifact"\\s*:\\s*"?(?:phases-activated|activated|phases-accepted|plan-accepted|activation-reconciled)';

describe('gh-aw: squad-agent-binding-check.yml collector passes fast-path artifacts to the checker (E4 preflight A)', () => {
  const ymlContent = readText(COLLECTOR_YML);

  it('delegates discovery to the canonical collector with the exact artifact-matching regex', () => {
    expect(ymlContent).toContain('await collectHistoricalActivationRecords({ github, context })');
    expect(readText(join(WORKFLOWS_DIR, 'shared', 'check-agent-binding.mjs')))
      .toContain(COLLECTOR_ARTIFACT_REGEX_SOURCE);
  });

  it('the shared discovery regex matches every activation artifact type (fast-path and granular)', () => {
    const collectorRegex = new RegExp(COLLECTOR_ARTIFACT_REGEX_SOURCE, 'i');
    for (const artifactType of ['activated', 'phases-activated', 'plan-accepted', 'phases-accepted', 'activation-reconciled']) {
      expect(
        collectorRegex.test(`Structured data:\n\`\`\`json\n{"squad_artifact":"${artifactType}","schema_version":"1"}\n\`\`\``),
        `expected collector regex to match ${artifactType}`,
      ).toBe(true);
    }
  });

  it('the shared discovery regex does not indiscriminately match unrelated non-activation artifacts', () => {
    const collectorRegex = new RegExp(COLLECTOR_ARTIFACT_REGEX_SOURCE, 'i');
    for (const artifactType of ['research', 'triage', 'scope-accepted', 'impl-accepted', 'impl-phases-accepted', 'validation']) {
      expect(
        collectorRegex.test(`{"squad_artifact":"${artifactType}"}`),
        `expected collector regex NOT to match ${artifactType}`,
      ).toBe(false);
    }
  });

  it('regression: the old blanket /activated/i filter would have missed every fast-path artifact', () => {
    // This is the exact defect this change fixes: `plan-accepted` / `phases-accepted`
    // comments never contain the substring "activated", so the old collector filter
    // silently dropped them before the checker ever saw them.
    const oldFilter = /activated/i;
    expect(oldFilter.test('{"squad_artifact":"plan-accepted"}')).toBe(false);
    expect(oldFilter.test('{"squad_artifact":"phases-accepted"}')).toBe(false);
  });

  it('still reads Node 22 and never grants issues: write (unchanged behavioral contract)', () => {
    expect(ymlContent).toContain('node-version: 22');
    expect(ymlContent).toContain('issues: read');
    expect(ymlContent).not.toContain('issues: write');
  });
});
