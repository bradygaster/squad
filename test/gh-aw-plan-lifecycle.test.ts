/**
 * gh-aw Plan Lifecycle Contract Tests
 *
 * Guards the long-path planning lifecycle in `workflows/squad.md` against the
 * three defects tracked by #1758, the Owner/Agent cast-Name binding of #1759,
 * and the structural research contract of #1756.
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
  const nextIdx = rest.indexOf('\n## skill: `');
  return nextIdx === -1 ? markdown.slice(start) : rest.slice(0, nextIdx);
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
// #1759 — Owner/Agent columns must resolve to cast Names, never Role strings
// ---------------------------------------------------------------------------

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
    // Explicitly forbids the leaking values named in #1759.
    expect(block).toMatch(/never a Role string/i);
    expect(block).toMatch(/`lead`, `devrel`, `reviewer`/);
  });

  it('squad-plan-accept mints squad:{owner} from the cast Name, not a role', () => {
    const block = skillBlock(squad, 'squad-plan-accept');
    expect(block).toContain('cast **Name** lowercased');
    expect(block).toContain('squad:flight');
    expect(block).toMatch(/never mint a role-derived label such as `squad:lead`/);
  });

  it('squad-plan-implementation binds the Agent column to the cast Name', () => {
    const block = skillBlock(squad, 'squad-plan-implementation');
    expect(block).toMatch(/Agent binding rule/i);
    expect(block).toContain('`Name` column');
    expect(block).toMatch(/agent validity \(every `Agent` resolves to a `Name` row/);
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
