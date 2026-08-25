/**
 * gh-aw Plan Lifecycle Contract Tests
 *
 * Guards the long-path planning lifecycle in `workflows/squad.md` against the
 * three defects tracked by #1758, the Owner/Agent cast-Name binding of #1759,
 * the structural research contract of #1756, and adversarial validation from
 * #1757.
 *
 * These assertions target the workflow's structural contract (labeled sections,
 * ordering hints, binding rules) rather than incidental prose — a single
 * regression produces a single failing criterion.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const ONTOLOGY = join(WORKFLOWS_DIR, 'shared', 'squad-planning-ontology.md');
const TEAM = join(process.cwd(), '.squad', 'team.md');

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

/** Slice a `## skill: \`name\`` block out of the workflow markdown. */
function skillBlock(markdown: string, name: string): string {
  const start = markdown.indexOf(`## skill: \`${name}\``);
  if (start === -1) throw new Error(`skill block "${name}" not found`);
  const rest = markdown.slice(start + 1);
  const nextSkillIdx = rest.indexOf('\n## skill: `');
  const endMarkerIdx = rest.indexOf(`\n## end skill: \`${name}\``);
  const candidates = [nextSkillIdx, endMarkerIdx].filter(index => index >= 0);
  const endIdx = candidates.length === 0 ? -1 : Math.min(...candidates);
  return endIdx === -1 ? markdown.slice(start) : rest.slice(0, endIdx);
}

/** Slice a `## agent: \`name\`` block out of the workflow markdown. */
function agentBlock(markdown: string, name: string): string {
  const marker = `## agent: \`${name}\``;
  const start = markdown.indexOf(marker);
  if (start === -1) throw new Error(`agent block "${name}" not found`);
  const bodyStart = start + marker.length;
  const rest = markdown.slice(bodyStart);
  const nextH2 = rest.search(/\n## /);
  return nextH2 === -1 ? rest : rest.slice(0, nextH2);
}

const squad = readText(SQUAD_WORKFLOW);
const ontology = readText(ONTOLOGY);
const team = readText(TEAM);

// ---------------------------------------------------------------------------
// team.md parsing — Name column vs Role column
// ---------------------------------------------------------------------------

/** Cast Names from the `## Members` table's `Name` column. */
function castNames(): string[] {
  const section = team.match(/## Members\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
  return [...section.matchAll(/^\|\s*([A-Za-z0-9@]+)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map(m => m[1])
    .filter(name => name && name !== 'Name' && !/^-+$/.test(name));
}

/** Role strings from the `## Members` table's `Role` column. */
function castRoles(): string[] {
  const section = team.match(/## Members\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
  return [...section.matchAll(/^\|\s*([A-Za-z0-9@]+)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map(m => m[2].trim())
    .filter(role => role && role !== 'Role' && !/^-+$/.test(role));
}

const NAMES = castNames();
const NAMES_LC = new Set(NAMES.map(n => n.toLowerCase()));
const ROLES_LC = new Set(castRoles().map(r => r.toLowerCase()));

/**
 * A plan Owner/Agent cell is a "role-string leak" when it fails to resolve to a
 * cast Name from team.md. This is the exact defect #1759 describes: Role strings
 * (`lead`, `devrel`) reaching an Owner column instead of cast Names.
 */
function isRoleStringLeak(ownerCell: string): boolean {
  const value = ownerCell.trim().toLowerCase();
  if (value === '@copilot') return false; // explicit coding-agent fallback
  return !NAMES_LC.has(value);
}

// ---------------------------------------------------------------------------
// #1759 / #1784 — Owner/Agent columns must resolve to cast Names, and the
// binding sites must not seed the model with the tokens they forbid.
// ---------------------------------------------------------------------------

/**
 * #1784: the binding rules used to enumerate their own counter-examples —
 * `` never a Role string (`Lead`, `DevRel`) `` — and live run E3 showed the model
 * emitting `lead`/`devrel` verbatim, including `devrel` for a roster that has no
 * DevRel role. The concrete token is salient; the negation is not.
 *
 * A backticked code span is the most copyable form a token can take in the
 * prompt, so the binding blocks must contain none that name a Role rather than a
 * Name. Roles come from team.md's `Role` column, so this stays honest as the
 * roster changes; the extra literals are the values E3 actually leaked.
 */
const FORBIDDEN_TOKENS = [
  ...castRoles().map(r => r.toLowerCase()),
  'devrel',
  'reviewer',
];

/** Backticked code spans in `text`, lowercased. */
function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim().toLowerCase());
}

/**
 * Code spans in `text` that name a Role (or a known leaked value), in bare or
 * `squad:`-prefixed form. These are the tokens #1784 proved get copied out.
 */
function leakedRoleTokens(text: string): string[] {
  return codeSpans(text).filter(span => {
    const bare = span.startsWith('squad:') ? span.slice('squad:'.length) : span;
    if (NAMES_LC.has(bare)) return false; // a cast Name is a legitimate value
    return FORBIDDEN_TOKENS.includes(bare);
  });
}

describe('#1759: Owner/Agent bind to the cast Name column', () => {
  it('team.md exposes distinct Name and Role columns to bind against', () => {
    expect(NAMES).toContain('Procedures');
    expect(NAMES).toContain('Flight');
    expect(ROLES_LC.has('lead')).toBe(true); // "Lead" is a Role, not a Name
    expect(NAMES_LC.has('lead')).toBe(false); // and it is not a valid Owner
  });

  it('the role-leak detector catches a Role string in an Owner column', () => {
    // A well-formed plan table whose Owner cells are cast Names.
    const goodPlan = [
      '| # | Title | Owner | Size | Depends On |',
      '|---|-------|-------|------|-----------|',
      '| 1 | Wire adapter | EECOM | M | - |',
      '| 2 | Prompt refactor | Procedures | S | 1 |',
    ].join('\n');

    // A plan table that leaked Role strings into the Owner column.
    const badPlan = [
      '| # | Title | Owner | Size | Depends On |',
      '|---|-------|-------|------|-----------|',
      '| 1 | Wire adapter | lead | M | - |',
      '| 2 | Prompt refactor | devrel | S | 1 |',
    ].join('\n');

    const owners = (table: string) =>
      [...table.matchAll(/^\|\s*\d+\s*\|[^|]*\|\s*([^|]+?)\s*\|/gm)].map(m => m[1]);

    expect(owners(goodPlan).some(isRoleStringLeak)).toBe(false);
    expect(owners(badPlan).every(isRoleStringLeak)).toBe(true);
    // The specific failure mode: "lead" is a Role, "Procedures"/"EECOM" are Names.
    expect(isRoleStringLeak('lead')).toBe(true);
    expect(isRoleStringLeak('Procedures')).toBe(false);
  });

  it('squad-plan binds the Owner column to the team.md Name column', () => {
    const block = skillBlock(squad, 'squad-plan');
    expect(block).toMatch(/Owner\/Agent binding rule/i);
    expect(block).toContain('`Name` column');
    expect(block).toContain('@copilot');
  });

  it('squad-plan-accept mints squad:{owner} from the cast Name, not a role', () => {
    const block = skillBlock(squad, 'squad-plan-accept');
    expect(block).toContain('`Name` column');
    expect(block).toContain('`squad:{owner}`');
  });

  it('squad-plan-implementation binds the Agent column to the cast Name', () => {
    const block = skillBlock(squad, 'squad-plan-implementation');
    expect(block).toMatch(/Agent binding rule/i);
    expect(block).toContain('`Name` column');
    expect(block).toMatch(/appears verbatim in the `Name` column/);
  });
});

describe('#1784: binding sites never name the tokens they forbid', () => {
  it('the leak detector recognizes a prohibition that enumerates Role tokens', () => {
    // The pre-fix text from workflows/squad.md:913 — this MUST be flagged, or
    // the assertions below prove nothing.
    const preFix =
      'every `Agent` value MUST be a cast **Name** from the `Name` column of ' +
      '`.squad/team.md`, never a Role string (`Lead`, `DevRel`) or lowercased ' +
      'role (`lead`, `reviewer`).';
    expect(leakedRoleTokens(preFix)).toEqual(
      expect.arrayContaining(['lead', 'devrel', 'reviewer'])
    );

    // The pre-fix label text from workflows/squad.md:730.
    const preFixLabel =
      'never mint a role-derived label such as `squad:lead` or `squad:reviewer`.';
    expect(leakedRoleTokens(preFixLabel)).toEqual(
      expect.arrayContaining(['squad:lead', 'squad:reviewer'])
    );

    // A positive-only rule carries no forbidden token.
    const postFix =
      'Every `Agent` value MUST appear verbatim in the `Name` column of the ' +
      '`## Members` table in `.squad/team.md`, or be `@copilot`.';
    expect(leakedRoleTokens(postFix)).toEqual([]);
  });

  for (const skill of [
    'squad-plan',
    'squad-plan-accept',
    'squad-plan-implementation',
    'squad-plan-validate',
    'squad-plan-activate',
  ]) {
    it(`${skill} states the binding positively, without naming a Role token`, () => {
      expect(leakedRoleTokens(skillBlock(squad, skill))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// #1784 — /squad plan validate must fail a non-roster Owner/Agent value
// ---------------------------------------------------------------------------

describe('#1784: squad-plan-validate treats the Name column as sole truth', () => {
  const block = skillBlock(squad, 'squad-plan-validate');

  it('declares a roster-binding check in the checks table', () => {
    expect(block).toMatch(/Non-roster owner\/agent/i);
  });

  it('scores a non-roster value as Critical, not a warning', () => {
    const severity = block.match(/^Severity:.*$/m)?.[0] ?? '';
    // Check 10 is the roster check; it must sit on the Critical side.
    expect(severity).toMatch(/Critical[^.]*\b10\b/);
    expect(severity).not.toMatch(/Warning[^.]*\b10\b/);
  });

  it('binds the check to the Name column and forbids attesting validity otherwise', () => {
    const check = block.match(/###### Check 10[\s\S]*?(?=\n##### )/)?.[0] ?? '';
    expect(check).not.toEqual('');
    expect(check).toContain('`Name` column');
    expect(check).toMatch(/Critical/);
    expect(check).toMatch(/Never report a value as a\s+valid roster name unless/);
  });
});

// ---------------------------------------------------------------------------
// #1758.1 — squad-plan-accept must route before it can hard-fail
// ---------------------------------------------------------------------------

describe('#1758.1: squad-plan-accept routes granular plans before failing', () => {
  const block = skillBlock(squad, 'squad-plan-accept');

  it('Step 1 checks program/implementation before replying "No plan found"', () => {
    const step1 = block.match(/##### Step 1: Find Plan and Route([\s\S]*?)#####/)?.[1] ?? '';
    expect(step1, 'Step 1 must be a routing step').not.toBe('');

    const programIdx = step1.indexOf('`program`');
    const noPlanIdx = step1.indexOf('No plan found');
    expect(programIdx).toBeGreaterThan(-1);
    expect(noPlanIdx).toBeGreaterThan(-1);
    // The hard-fail must come AFTER the program/implementation routing check,
    // so the routing note is reachable rather than dead code.
    expect(programIdx).toBeLessThan(noPlanIdx);
  });

  it('routes to Accept Scope -> Accept Implementation -> Activate when granular artifacts exist', () => {
    const step1 = block.match(/##### Step 1: Find Plan and Route([\s\S]*?)#####/)?.[1] ?? '';
    const scopeIdx = step1.indexOf('Accept Scope');
    const implIdx = step1.indexOf('Accept Implementation');
    const activateIdx = step1.indexOf('Activate');
    expect(scopeIdx).toBeGreaterThan(-1);
    expect(implIdx).toBeGreaterThan(scopeIdx);
    expect(activateIdx).toBeGreaterThan(implIdx);
  });

  it('only replies "No plan found" when none of plan/program/implementation exist', () => {
    expect(block).toMatch(
      /none of `program`, `implementation`, or `plan` exist, reply "No plan found/,
    );
  });
});

// ---------------------------------------------------------------------------
// #1758.2 — Implement descends to leaf tasks, never dispatches epics
// ---------------------------------------------------------------------------

describe('#1758.2: Implement dispatches leaf tasks, not epics', () => {
  it('Step 1 descends the hierarchy recursively to leaf tasks', () => {
    expect(squad).toMatch(/descending recursively through \*\*every\*\* level/);
    expect(squad).toContain('Identify the **leaf tasks**');
    expect(squad).toContain('Intermediate parents');
    expect(squad).toContain('are never dispatched to a worker');
  });

  it('Epic Dispatch iterates leaf tasks and matches leaf branch names', () => {
    const dispatch = squad.match(/##### Epic Dispatch([\s\S]*?)## skill:/)?.[1] ?? '';
    expect(dispatch).toContain('For each open leaf task');
    expect(dispatch).toContain('squad/implement-{leaf-number}-');
    expect(dispatch).toContain('"issue_number": "{leaf-issue-number}"');
    // The immediate-children language that caused the bug must be gone.
    expect(dispatch).not.toContain('For each open child issue');
  });

  it('preserves the three-slot dispatch cap', () => {
    expect(squad).toMatch(/available-slots = max\(0, 3 - active-implementation-count\)/);
  });
});

// ---------------------------------------------------------------------------
// #1758.3 — validate precedes BOTH accept steps (ontology-consistent order)
// ---------------------------------------------------------------------------

describe('#1758.3: validate precedes both accept steps', () => {
  /** Canonical command order from the ontology state-transition block. */
  function ontologyCommandOrder(): string[] {
    const blockMatch = ontology.match(/```\n(idle[\s\S]*?)```/);
    const transitions = blockMatch![1];
    return [...transitions.matchAll(/triggered_by:\s*(\/squad plan [\w ]+)/g)].map(m =>
      m[1].trim(),
    );
  }

  it('ontology sequences validate before accept scope before accept implementation', () => {
    const order = ontologyCommandOrder();
    const idx = (cmd: string) => order.indexOf(cmd);
    expect(idx('/squad plan validate')).toBeGreaterThan(-1);
    expect(idx('/squad plan validate')).toBeLessThan(idx('/squad plan accept scope'));
    expect(idx('/squad plan accept scope')).toBeLessThan(
      idx('/squad plan accept implementation'),
    );
  });

  it('squad.md next-hints reproduce the ontology order', () => {
    // program -> implementation -> validate -> accept scope -> accept implementation -> activate
    expect(skillBlock(squad, 'squad-plan-program')).toMatch(
      /next = `\/squad plan implementation`/,
    );
    expect(skillBlock(squad, 'squad-plan-implementation')).toMatch(
      /next = `\/squad plan validate`/,
    );
    expect(skillBlock(squad, 'squad-plan-validate')).toMatch(
      /Next on pass: `\/squad plan accept scope`/,
    );
    expect(skillBlock(squad, 'squad-plan-accept-scope')).toMatch(
      /next = `\/squad plan accept implementation`/,
    );
    expect(skillBlock(squad, 'squad-plan-accept-implementation')).toMatch(
      /next = `\/squad plan activate`/,
    );
  });

  it('validate no longer routes straight to accept implementation', () => {
    const block = skillBlock(squad, 'squad-plan-validate');
    expect(block).not.toMatch(/Next on pass: `\/squad plan accept implementation`/);
  });
});

// ---------------------------------------------------------------------------
// #1757 — validation owns an adversarial gate fed by Fact Checker DA evidence
// ---------------------------------------------------------------------------

describe('#1757: squad-plan-validate has adversarial teeth', () => {
  const validation = skillBlock(squad, 'squad-plan-validate');
  const factChecker = agentBlock(squad, 'fact-checker');
  const adversarialChecks = [
    'Opposition steelman',
    'Load-bearing assumptions',
    '30-day pre-mortem',
    'Alternative approach',
    'Remaining risk acceptance',
  ];

  function numberedChecks(block: string): Map<number, string> {
    return new Map(
      [...block.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm)].map(match => [
        Number(match[1]),
        match[2].trim(),
      ]),
    );
  }

  function hasSubstantiveAdversarialValidation(artifact: string): boolean {
    const requiredSections = [
      'Steelman of the opposition',
      'Load-bearing assumptions',
      '30-day pre-mortem',
      'Alternative approach',
      'Remaining risk acceptance',
      'Validator Synthesis',
    ];

    const sectionsAreSubstantive = requiredSections.every((heading, index) => {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const next = requiredSections
        .slice(index + 1)
        .map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      const boundary = next ? `(?=\\n### (?:${next})|$)` : '$';
      const body = artifact.match(new RegExp(`### ${escaped}\\n([\\s\\S]*?)${boundary}`))?.[1] ?? '';
      return /\bWHAT:/i.test(body) && /\bWHY:/i.test(body) && /\bHOW:/i.test(body);
    });
    const checkNumbers = [...artifact.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(match =>
      Number(match[1]),
    );

    return (
      sectionsAreSubstantive &&
      checkNumbers.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16' &&
      /### 30-day pre-mortem[\s\S]*\b30 days?\b/i.test(artifact) &&
      /### Remaining risk acceptance[\s\S]*\bACCEPTED\b[\s\S]*\bowner:/i.test(artifact) &&
      /### Validator Synthesis[\s\S]*\bvalidation decision:/i.test(artifact)
    );
  }

  it('preserves structural checks 1-10 and augments them with five adversarial checks', () => {
    const checks = numberedChecks(validation);
    expect([...checks.keys()].slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...checks.values()].slice(10, 15)).toEqual(adversarialChecks);
    expect(checks.get(16)).toBe('Validator synthesis');
  });

  it('uses Fact Checker DA output as advisory evidence, never as the verdict owner', () => {
    expect(validation).toMatch(/Use the `fact-checker` sub-agent exactly once/);
    expect(validation).toMatch(/brief is input evidence, not a verdict/i);
    expect(validation).toMatch(/Validation — not Fact Checker —[\s\S]*final verdict/);
    expect(factChecker).not.toMatch(/^RESULT: (?:PASS|FAIL)$/m);
    expect(factChecker).toMatch(/Never emit `RESULT: PASS`, `RESULT: FAIL`/);
  });

  it('requires all five DA elements with concrete semantic thresholds', () => {
    for (const section of [
      '##### Steelman of the opposition',
      '##### Load-bearing assumptions',
      '##### 30-day pre-mortem',
      '##### Alternative approach',
      '##### Risk acceptance',
    ]) {
      expect(factChecker, `Fact Checker must emit "${section}"`).toContain(section);
    }
    expect(validation).toMatch(/strongest credible opposition steelman/i);
    expect(validation).toMatch(/falsifiable conditions/);
    expect(validation).toMatch(/exactly 30 days after execution begins/);
    expect(validation).toMatch(/materially different alternative approach/);
    expect(validation).toMatch(/explicitly\s+`ACCEPTED` with rationale and an accountable owner/);
  });

  it('fails closed when adversarial evidence or verdict ownership is missing', () => {
    expect(validation).toMatch(
      /sub-agent is unavailable, errors, returns an empty brief,[\s\S]*force `RESULT: FAIL`/,
    );
    expect(validation).toMatch(/copied verdict,[\s\S]*cannot become `RESULT: PASS`/);
    expect(validation).toMatch(/Structural PASS alone cannot produce overall PASS/);
  });

  it('distinguishes a neatly formatted bad plan from a genuinely validated plan', () => {
    const validationHeader = [
      '## ✅ Squad Plan Validation — PASSED',
      'RESULT: PASS',
      '| Check | Status | Details |',
      '|---|---|---|',
    ];
    const structurallyValidBadPlan = [
      ...validationHeader,
      ...Array.from({ length: 10 }, (_, index) => `| ${index + 1} | ✅ | — |`),
    ].join('\n');

    const genuinelyValidatedPlan = [
      ...validationHeader,
      ...Array.from({ length: 16 }, (_, index) => `| ${index + 1} | ✅ | evidence |`),
      '### Steelman of the opposition',
      'WHAT: Replace the batch design with streaming. WHY: the latency target makes batching unsafe. HOW: prove the target with a prototype.',
      '### Load-bearing assumptions',
      'WHAT: queue ordering is stable. WHY: reordering breaks reconciliation. HOW: add an ordering probe before implementation.',
      '### 30-day pre-mortem',
      'WHAT: The rollout is reverted in 30 days. WHY: retries amplify duplicate writes. HOW: ship idempotency keys and alerts.',
      '### Alternative approach',
      'WHAT: Use a durable outbox. WHY: it narrows the consistency boundary. HOW: compare operational cost before choosing.',
      '### Remaining risk acceptance',
      'WHAT: delayed delivery. WHY: the queue can lag. HOW: ACCEPTED with bounded SLO; owner: EECOM.',
      '### Validator Synthesis',
      'WHAT: Structural and adversarial evidence align. WHY: the identified failure modes are bounded. HOW: validation decision: proceed.',
    ].join('\n');

    expect(hasSubstantiveAdversarialValidation(structurallyValidBadPlan)).toBe(false);
    expect(hasSubstantiveAdversarialValidation(genuinelyValidatedPlan)).toBe(true);
  });

  it('keeps the sub-agent outside every skill block and uses safe nested headings', () => {
    expect(squad).toContain('## end skill: `squad-plan-activate`\n\n## agent: `fact-checker`');
    expect(factChecker).not.toMatch(/^## (?!agent:)/m);
  });
});

// ---------------------------------------------------------------------------
// #1756 — structural research contract replaces the >=200-char floor
// ---------------------------------------------------------------------------

describe('#1756: research uses a structural contract, not a length floor', () => {
  const block = skillBlock(squad, 'squad-research');

  it('drops the >=200-char length floor entirely', () => {
    expect(block).not.toContain('≥200 chars');
    expect(block).not.toMatch(/\b200\b/);
  });

  it('requires the six structural sections', () => {
    for (const section of [
      'Evidence table',
      'Goals',
      'Non-goals',
      'Load-bearing assumptions',
      'Open decisions',
      'Acceptance framing',
    ]) {
      expect(block, `research contract must require "${section}"`).toContain(section);
    }
  });

  it('requires Rn traceability IDs and one citation token per evidence row', () => {
    expect(block).toMatch(/`Rn` traceability ID/);
    expect(block).toMatch(/exactly one citation token/);
  });

  it('the MANDATORY verify step enumerates the structural checks', () => {
    const verify = block.match(/Step 4: Verify Completion \[MANDATORY\]([\s\S]*)$/)?.[1] ?? '';
    expect(verify).toContain('Evidence table');
    expect(verify).toMatch(/unique `Rn` ID and exactly one citation token/);
    expect(verify).not.toContain('≥200 chars');
  });
});

// ---------------------------------------------------------------------------
// #1772 (defense-in-depth) — empty workflow_dispatch probe is guarded, not
// turned into a junk issue. Pairs with EECOM's dispatch-workflow max fix
// (PR #1777).
// ---------------------------------------------------------------------------

describe('#1772: empty workflow_dispatch probe halts without junk issues', () => {
  const guard =
    squad.match(/### Workflow-dispatch activation guard[\s\S]*?(?=\nResolve the slash command)/)?.[0] ??
    '';

  it('declares a MANDATORY activation guard that runs before any skill', () => {
    expect(guard, 'activation guard section must exist').not.toBe('');
    expect(guard).toMatch(/\[MANDATORY — run before any skill\]/);
  });

  it('halts an empty-command probe with a log annotation and no side effects', () => {
    expect(guard).toMatch(/Dispatched command\*\*\s+above is empty or missing/);
    expect(guard).toContain('::warning::');
    // The empty probe must STOP without creating an issue, comment, or skill entry.
    expect(guard).toMatch(/Do NOT create an issue, do NOT post a comment, do NOT/);
  });

  it('no longer instructs creating a junk "missing command/issue_number" issue', () => {
    // The old junk-issue generators (fixture #12/#14 root cause) must be gone.
    expect(squad).not.toContain('Squad workflow dispatch missing command');
    expect(squad).not.toContain('Squad workflow dispatch missing issue_number');
  });

  it('references EECOM PR #1777 so the paired fixes are traceable', () => {
    expect(guard).toContain('PR #1777');
  });
});
