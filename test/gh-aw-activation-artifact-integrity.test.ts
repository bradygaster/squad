/**
 * E4 preflight package A — fast-path `/squad activate` artifact integrity.
 *
 * Before this change, only the granular `/squad plan activate` path
 * (`squad-plan-activate`, artifacts `activated` / `phases-activated`) was required to emit
 * a non-empty `Activation bindings:` block, and only that path's checker/collector wiring
 * covered it. The recommended fast path (`squad-plan-accept`, artifacts `plan-accepted` /
 * `phases-accepted`) creates and labels issues identically but had no such requirement, no
 * checker coverage, and the CI collector (`.github/workflows/squad-agent-binding-check.yml`)
 * filtered on a literal `/activated/i` substring that a `plan-accepted`/`phases-accepted`
 * comment never contains — so a fast-path activation with omitted or empty bindings was
 * invisible to the deterministic post-activation check.
 *
 * This suite locks four things:
 *   1. Both activation paths use the exact same `Label operations accepted` heading text.
 *   2. The fast path's output template requires a non-empty `Activation bindings:` block,
 *      with the same shape/quoting/omission-reason contract as the granular path.
 *   3. The deterministic checker (`scripts/check-agent-binding.mjs`) validates `plan-accepted`
 *      / `phases-accepted` bindings exactly like `activated` / `phases-activated`, and rejects
 *      standalone certainty claims ("applied", "received", "landed", "verified", "confirmed",
 *      "checked") in label-operation reporting — scoped per-clause (not per-line or a blanket
 *      whole-comment scan), so quoted titles, unrelated sections, substrings, a forbidden word
 *      describing an unrelated subject sharing a line with a label token, and negations never
 *      false-positive, while a negation elsewhere on the line never blanket-suppresses a real,
 *      separate claim.
 *   4. The CI collector actually passes fast-path artifact comments to that checker.
 *
 * Out of scope (per the E4 preflight package A brief): workflow discriminators, docs
 * sequencing, draft PR UX, and every other E4 finding.
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

/** `squad-plan-activate` — the `/squad plan activate` granular path. Has an explicit end marker. */
const ACTIVATE_START = workflow.indexOf('## skill: `squad-plan-activate`');
const ACTIVATE_END = workflow.indexOf('## end skill: `squad-plan-activate`');
expect(ACTIVATE_START, '"## skill: `squad-plan-activate`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACTIVATE_END, '"## end skill: `squad-plan-activate`" is missing').toBeGreaterThan(ACTIVATE_START);
const activateSkill = workflow.slice(ACTIVATE_START, ACTIVATE_END);

/**
 * `squad-plan-accept` — the recommended `/squad activate` fast path. It has no
 * `## end skill:` marker, so its body runs to the next `## skill:` heading.
 */
const ACCEPT_START = workflow.indexOf('## skill: `squad-plan-accept`');
const ACCEPT_END = workflow.indexOf('## skill: `squad-plan-revise`');
expect(ACCEPT_START, '"## skill: `squad-plan-accept`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACCEPT_END, '"## skill: `squad-plan-revise`" is missing from workflows/squad.md').toBeGreaterThan(ACCEPT_START);
const acceptSkill = workflow.slice(ACCEPT_START, ACCEPT_END);

/** Both activation paths, so parity assertions cannot pass by covering only one. */
const BOTH_PATHS: ReadonlyArray<readonly [string, string]> = [
  ['/squad plan activate (squad-plan-activate)', activateSkill],
  ['/squad activate fast path (squad-plan-accept)', acceptSkill],
];

// ---------------------------------------------------------------------------
// 1. Heading parity — both paths use the exact same literal heading.
// ---------------------------------------------------------------------------

describe('gh-aw: both activation paths use the exact "Label operations accepted" heading', () => {
  it.each(BOTH_PATHS)('%s: renders the heading verbatim', (_path, skillText) => {
    expect(skillText).toMatch(/^#{1,6} Label operations accepted\s*$/m);
  });

  it('never reintroduces the old, non-identical heading text in either path', () => {
    expect(workflow).not.toContain('Label reporting — accepted operations only');
    expect(workflow).not.toContain('Label reporting');
  });

  it('the two headings are byte-identical, not merely similar', () => {
    const activateHeading = activateSkill.match(/^#{1,6} Label operations accepted\s*$/m)?.[0].replace(/^#+\s*/, '').trim();
    const acceptHeading = acceptSkill.match(/^#{1,6} Label operations accepted\s*$/m)?.[0].replace(/^#+\s*/, '').trim();
    expect(activateHeading).toBe('Label operations accepted');
    expect(acceptHeading).toBe('Label operations accepted');
    expect(activateHeading).toBe(acceptHeading);
  });
});

// ---------------------------------------------------------------------------
// 2. Fast-path output template requires non-empty Activation bindings.
// ---------------------------------------------------------------------------

/**
 * Shared assertion used both as a direct positive check against the real committed skill
 * text, and — mutated — as a mutation-test kill switch. A mutation that survives this
 * function despite deleting or hollowing out the contract would mean the test suite cannot
 * actually detect the regression it claims to guard.
 */
function assertBindingsContractPresent(skillText: string): void {
  const prose = skillText.replace(/\s+/g, ' ');
  expect(prose).toMatch(
    /MUST include an `Activation bindings:` fenced JSON block containing a non-empty array/,
  );
  expect(prose).toMatch(/never emit an empty array/);
  expect(prose).toMatch(/#{1,6} Label operations accepted/);
}

describe('gh-aw: fast-path (`squad-plan-accept`) requires non-empty Activation bindings (#1958 E4 preflight A)', () => {
  it('passes against the real committed fast-path skill body', () => {
    expect(() => assertBindingsContractPresent(acceptSkill)).not.toThrow();
  });

  it('passes against the real committed granular skill body (parity baseline)', () => {
    expect(() => assertBindingsContractPresent(activateSkill)).not.toThrow();
  });

  it('states the identical versioned provenance/quoting/omission contract as the granular path', () => {
    const prose = acceptSkill.replace(/\s+/g, ' ');
    expect(prose).toMatch(
      /identical versioned provenance, binding shape, quoting, and omission semantics as `squad-plan-activate` Step 4/,
    );
    expect(activateSkill).toContain('squad-work-agent-binding/v1');
    expect(activateSkill).toContain('squad-agent-provenance/v1');
    expect(activateSkill).toContain('legacy-plan-missing-id');
    expect(prose).toMatch(/never bare numbers/);
    expect(prose).toMatch(/a surviving `#aw_…` reference means `create-issue` never\s*landed/);
  });

  it('the checker treats a missing/empty fast-path bindings block as a failure, stated explicitly', () => {
    const prose = acceptSkill.replace(/\s+/g, ' ');
    expect(prose).toMatch(
      /missing, empty, malformed, or unresolved bindings block on a `plan-accepted` or\s*`phases-accepted` artifact as a failure exactly as it does for `activated`\s*and `phases-activated`/,
    );
  });

  it('both activation paths revalidate stable IDs before mutation', () => {
    expect(acceptSkill).toMatch(/Agent ID` MUST exactly match its `AGENT_IDENTITY:` record/);
    expect(activateSkill).toMatch(/plan `Agent ID` to exactly match the\s+same `AGENT_IDENTITY:` record/);
    expect(activateSkill).toContain('never reconstruct one from its name or label');
  });

  it('both artifact-data lines for the fast path carry the Activation bindings JSON array', () => {
    expect(acceptSkill).toContain(
      'Phase-specific: `data: {"squad_artifact":"phases-accepted","schema_version":"1","origin_issue":{issue_number},"phases":[{accumulated}]}` → Phase accepted table + remaining phases table + the `Activation bindings:` JSON array.',
    );
    expect(acceptSkill).toContain(
      'Full (no phases): `data: {"squad_artifact":"plan-accepted","schema_version":"1","origin_issue":{issue_number},"phases":[]}` → All issues table + the `Activation bindings:` JSON array.',
    );
  });

  // --- Mutation tests: prove the assertion above actually fails when the committed source
  // --- is hollowed out, rather than only ever passing by construction.
  it.each(BOTH_PATHS)(
    '%s: mutation kill — deleting the Activation bindings requirement sentence fails the contract check',
    (_path, skillText) => {
      const mutated = skillText.replace(
        /(?:\*\*Every phase and full acceptance artifact body|Every phase and full activation artifact body) MUST include an `Activation[\s\S]*?non-empty array[^.]*\./,
        'The summary should mention the created issues.',
      );
      expect(mutated).not.toBe(skillText);
      expect(() => assertBindingsContractPresent(mutated)).toThrow();
    },
  );

  it.each(BOTH_PATHS)(
    '%s: mutation kill — weakening "never emit an empty array" to permit an empty array fails the contract check',
    (_path, skillText) => {
      const mutated = skillText.replace(/never\s+emit an empty array/, 'an empty array is acceptable');
      expect(mutated).not.toBe(skillText);
      expect(() => assertBindingsContractPresent(mutated)).toThrow();
    },
  );

  it.each(BOTH_PATHS)(
    '%s: mutation kill — renaming the Label operations accepted heading fails the contract check',
    (_path, skillText) => {
      const mutated = skillText.replace(/#{1,6} Label operations accepted/, '###### Label Notes');
      expect(mutated).not.toBe(skillText);
      expect(() => assertBindingsContractPresent(mutated)).toThrow();
    },
  );

  it('documents the fast-path mandatory-bindings contract in the shared ontology, not only the skill body', () => {
    const prose = ontology.replace(/\s+/g, ' ');
    expect(prose).toMatch(
      /mandatory for\s*`phases-activated`, `activated`, `phases-accepted`, and `plan-accepted` artifacts/,
    );
    expect(prose).toMatch(/neither path may omit it or ship an\s*empty array/);
  });
});

// ---------------------------------------------------------------------------
// Known-trap wording regression: "the label set it should have received".
// ---------------------------------------------------------------------------

describe('gh-aw: the known "should have received" trap phrase is reworded (#1958 E4 preflight A)', () => {
  it('never uses the exact trap phrase describing a label a report_incomplete item was targeting', () => {
    // Narrowly scoped to the exact known-trap phrase, not a blanket ban on "received" — the
    // word legitimately appears elsewhere in this file for unrelated meanings (e.g. "the
    // right issue received the right value", "a rejection you never received"), and a
    // blanket scan would be exactly the false-positive-prone pattern this change avoids.
    expect(workflow).not.toMatch(/label set it should have received/);
  });

  it('replaces it with wording that names the same fact without a forbidden certainty word', () => {
    expect(workflow).toContain('the label set that missing operation targeted');
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
  '"squad_artifact"\\s*:\\s*"?(?:phases-activated|activated|phases-accepted|plan-accepted)';

describe('gh-aw: squad-agent-binding-check.yml collector passes fast-path artifacts to the checker (E4 preflight A)', () => {
  const ymlContent = readText(COLLECTOR_YML);

  it('embeds the exact artifact-matching regex used to filter collected comments', () => {
    expect(ymlContent).toContain(COLLECTOR_ARTIFACT_REGEX_SOURCE);
  });

  it('the embedded regex matches every activation artifact type (fast-path and granular)', () => {
    const collectorRegex = new RegExp(COLLECTOR_ARTIFACT_REGEX_SOURCE, 'i');
    for (const artifactType of ['activated', 'phases-activated', 'plan-accepted', 'phases-accepted']) {
      expect(
        collectorRegex.test(`Structured data:\n\`\`\`json\n{"squad_artifact":"${artifactType}","schema_version":"1"}\n\`\`\``),
        `expected collector regex to match ${artifactType}`,
      ).toBe(true);
    }
  });

  it('the embedded regex does not indiscriminately match unrelated non-activation artifacts', () => {
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
