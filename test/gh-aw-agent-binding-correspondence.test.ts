/**
 * Agent-binding correspondence in `workflows/squad.md` (#1859, #1860).
 *
 * Two defects survived every guard the workflow already had, because those guards
 * verify **membership** and the defects were failures of **correspondence**.
 *
 * Team Guard TG-2 certifies a vocabulary — the set of names that may become a
 * `squad:{agent}` label — and validation Check 10 asserts every `Agent` value is a
 * member of it. Neither asks whether the label applied to task *N* is the agent the
 * plan assigned to task *N*. **A label can be simultaneously certified and wrong.**
 *
 * Measured on `octodemo/aspiregregator-squad-e2e` (run 32778953402, 12/12 values
 * certified, TG-2 green, Check 10 green):
 *
 *   #1859 — the accepted plan assigns task 6 to `McManus`. Issue #17 was created
 *           with `squad:kint`, the owner of its parent epic (2.1). 11 of 12 correct,
 *           and the one failure was invisible to every membership check because
 *           `kint` is a perfectly valid roster name.
 *
 *   #1860 — the activation summary reported `— squad:kint` on epic #6 and
 *           `squad:kint / squad:mcmanus` on epic #7. Both issues carry `[squad]`
 *           only. The summary also omitted the `Non-roster agent values` heading
 *           that the multi-owner epic required, so a run that silently dropped two
 *           bindings read as clean.
 *
 * The proximate cause was ambiguity, not disobedience: the epic and task rules both
 * said `Labels: squad, squad:{agent}` and never bound `{agent}` to a source. Reading
 * tasks grouped under an epic, inheriting the epic's agent is the natural resolution.
 *
 * These tests lock the disambiguation in place. They assert prompt text rather than
 * behavior, which is a weaker instrument than the executed-shell assertions in
 * `gh-aw-activate-roster-binding.test.ts` — deterministic post-activation enforcement
 * is #1801. What they do buy is that the specific ambiguity which produced #1859
 * cannot silently return, and every failure names the rule that went missing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQUAD_WORKFLOW = join(process.cwd(), 'workflows', 'squad.md');
const workflow = readFileSync(SQUAD_WORKFLOW, 'utf8').replace(/\r\n/g, '\n');

/**
 * Whitespace-collapsed view for prose assertions.
 *
 * Rules that span two or three wrapped lines are otherwise unmatchable, and a test
 * that fails when a maintainer rewraps a paragraph teaches people to delete it.
 * Matching meaning, not layout.
 */
const prose = workflow.replace(/\s+/g, ' ');

/**
 * Return the single line declaring labels for a `create-issue` step.
 *
 * Anchored on the step heading so a rule added to the *other* step cannot satisfy
 * an assertion about this one — the two rules are near-identical in wording and
 * that is precisely how the epic's agent leaked onto tasks in the first place.
 */
function labelLineAfter(heading: string): string {
  const at = workflow.indexOf(heading);
  expect(at, `"${heading}" is missing from workflows/squad.md`).toBeGreaterThan(-1);

  const line = workflow
    .slice(at)
    .split('\n')
    .find(l => /^-\s+Labels:/.test(l.trim()));

  expect(line, `no "- Labels:" line follows "${heading}" in workflows/squad.md`).toBeDefined();
  return line ?? '';
}

const EPIC_HEADING = '**2b. Create Epic Issues:**';
const TASK_HEADING = '**2c. Create Task Issues:**';

describe('gh-aw: agent-binding correspondence (#1859, #1860)', () => {
  it('finds both create-issue label rules, so the assertions below are not vacuous', () => {
    // Without this, a renamed heading would make every test here pass by finding
    // nothing to object to — the same empty-set failure mode that let #1822 through.
    expect(labelLineAfter(EPIC_HEADING).length).toBeGreaterThan(0);
    expect(labelLineAfter(TASK_HEADING).length).toBeGreaterThan(0);
  });

  it('binds a task label to that task\'s own Agent cell', () => {
    const rule = labelLineAfter(TASK_HEADING);

    expect(
      /own\s+`Agent`\s+cell/i.test(rule),
      `The task label rule must name the task's OWN Agent cell as the source. ` +
        `Left unbound it reads as "some agent", and the model resolves it from the ` +
        `surrounding epic — which is #1859 exactly. Found:\n${rule}`,
    ).toBe(true);

    expect(
      /matches this task/i.test(rule),
      `The task label rule must say which plan row to read — the one whose "#" ` +
        `matches this task. Found:\n${rule}`,
    ).toBe(true);
  });

  it('forbids inheriting the epic\'s agent or carrying the previous task\'s forward', () => {
    const rule = labelLineAfter(TASK_HEADING);

    expect(
      /never inherit the parent epic/i.test(rule),
      `#1859's observed failure was inheritance from the parent epic. The rule must ` +
        `prohibit it by name; a positive instruction alone was already present and ` +
        `did not prevent it. Found:\n${rule}`,
    ).toBe(true);

    expect(
      /carry the previous task/i.test(rule),
      `Sequential create-issue calls make carry-forward the other natural drift. ` +
        `Found:\n${rule}`,
    ).toBe(true);
  });

  it('derives an epic label from its own tasks and refuses to guess for multi-owner epics', () => {
    const rule = labelLineAfter(EPIC_HEADING);

    expect(
      /`Epic`\s+cell\s+names\s+this\s+epic/i.test(rule),
      `An epic has no Agent column of its own; its label is only well-defined as the ` +
        `agents of the tasks that name it. Epic 2.1 carried squad:kint while its only ` +
        `task belonged to McManus. Found:\n${rule}`,
    ).toBe(true);

    expect(
      /two or more/i.test(rule) && /only\s+`squad`/i.test(rule),
      `A multi-owner epic has no single correct label. Epic 1.2 spanned Kint and ` +
        `McManus; the summary printed "squad:kint / squad:mcmanus", which is not a ` +
        `label. The rule must resolve to bare "squad". Found:\n${rule}`,
    ).toBe(true);

    expect(
      /never\s+choose\s+one\s+of\s+several/i.test(rule),
      `Picking an arbitrary owner is the failure that looks most like success — the ` +
        `label is certified, present, and wrong. Found:\n${rule}`,
    ).toBe(true);
  });

  it('states that membership is not correspondence', () => {
    expect(
      /simultaneously certified and wrong/i.test(prose),
      `The roster-binding gate must say why TG-2 and Check 10 passing is not ` +
        `evidence that the binding is right. Both were green for #1859. Without ` +
        `this, a future reader reasonably concludes the gate already covers it.`,
    ).toBe(true);

    expect(
      /membership across the run is not evidence/i.test(prose),
      `The gate must require per-issue verification. "Every value is a roster name" ` +
        `is true of a run in which every label is on the wrong issue.`,
    ).toBe(true);
  });

  it('requires the summary to report labels applied, not intended', () => {
    expect(
      /only after that issue's `create-issue` call returned successfully carrying it/i.test(prose),
      `#1860: the summary attributed squad:kint to epic #6, which never received it. ` +
        `The summary must be a record of what happened, not a restatement of the plan.`,
    ).toBe(true);

    expect(
      /Omitting the heading while omitting the label/i.test(prose),
      `The two omissions compound: dropping a label AND its "Non-roster agent values" ` +
        `entry produces a summary indistinguishable from a clean run. The gate must ` +
        `name that combination, since each omission alone looks benign.`,
    ).toBe(true);
  });

  it('keeps the Non-roster agent values heading required, not conditional on taste', () => {
    const at = prose.indexOf('Non-roster agent values');
    expect(at, '`Non-roster agent values` heading rule is missing').toBeGreaterThan(-1);

    // The heading is referenced in more than one rule; require that at least one
    // occurrence is stated as mandatory. Epic 1.2 was a legitimate multi-owner case
    // that correctly received no agent label — and was never reported.
    expect(
      /`Non-roster agent values` heading is \*\*required\*\*/i.test(prose),
      'A "should" here yields silence in exactly the multi-owner case that needs it.',
    ).toBe(true);
  });
});
