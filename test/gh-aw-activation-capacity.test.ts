/**
 * Activation label-operation capacity and silent-truncation safeguards (#1961, parent #1957).
 *
 * ## The defect
 *
 * `workflows/squad.md` promises a `squad` (and where certified, `squad:{agent}`) label on
 * every issue an activation creates. Those labels are applied by the `add-labels` safe
 * output, which is governed by a `max`. Two independent problems made a large activation
 * able to lose label operations *while still reporting a clean success*:
 *
 * 1. **`max` is ambiguous in gh-aw's own surface area.** The compiler injects the tool
 *    constraint as "Maximum {N} label(s) can be added", which reads as a budget of label
 *    *names*. The runtime enforces something different — see below. An agent that believed
 *    the label reading would conclude a 50-issue activation (up to 100 label names) had
 *    overrun its budget and could stop labeling early or batch issues together.
 * 2. **An over-limit item is dropped, not failed.** gh-aw v0.87.10's collector
 *    (`actions/setup/js/collect_ndjson_output.cjs`) rejects the offending item and
 *    `continue`s, pushing a string into `errors`. Those errors are emitted with
 *    `core.warning(...)`, never `core.setFailed(...)`. The run finishes green with label
 *    operations missing. Nothing in the run announces the truncation.
 *
 * ## Runtime semantics this suite is written against (gh-aw v0.87.10, the CI pin)
 *
 * `collect_ndjson_output.cjs`:
 *
 * ```js
 * const typeCount = parsedItems.filter(existing => existing.type === itemType).length;
 * const maxAllowed = getMaxAllowedForType(itemType, expectedOutputTypes);
 * if (typeCount >= maxAllowed) {
 *   errors.push(`Line ${i + 1}: Too many items of type '${itemType}'. Maximum allowed: ${maxAllowed}.`);
 *   continue;  // <- the item is DROPPED
 * }
 * ```
 *
 * `max` therefore caps **safe-output items (tool calls) of that type**, not label names
 * inside one call. One `add_labels` call carrying two labels costs one item, not two.
 *
 * ## The capacity calculation this suite locks in
 *
 * Largest supported activation = **50 issues** — `enterprise`'s `max_issues: 50`, the
 * highest documented profile limit in `workflows/shared/squad-planning-policy.md`, and the
 * same threshold `squad-plan-activate`'s Output Budget Awareness uses to force phased
 * activation. At that size, worst case:
 *
 * | Safe output                    | Worst case | Configured |
 * |--------------------------------|-----------:|-----------:|
 * | `create-issue` items           |         50 |         75 |
 * | `add_labels` items (calls)     |         50 |        110 |
 * | labels within one call         |          2 |        n/a |
 * | label names across the run     |        100 |        110 |
 *
 * `add-labels: max` is sized to satisfy the worst case under **both** readings (50 calls
 * and 100 label names) so that no interpretation of the cap can justify dropping a label
 * operation.
 *
 * ## Out of scope (sibling issues — do not broaden these assertions here)
 *
 * - #1962 temporary-ID linkage between `create_issue` and `add_labels`. This suite is
 *   deliberately neutral about *how* an `add_labels` call identifies its target, so it
 *   does not conflict with that change.
 * - #1959 `/squad activate` fast-path parity.
 * - #1963 label-result reporting beyond the explicit overflow/incomplete signal.
 * - #1960 broad safe-output contract coverage; #1958 E4 evidence.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { extractSafeOutputsConfigJson } from './helpers/gh-aw-lock';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const PLANNING_POLICY = join(WORKFLOWS_DIR, 'shared', 'squad-planning-policy.md');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-activation-capacity');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

/** Read a text file with line endings normalized to LF (Windows checkouts materialize CRLF). */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const workflow = readText(SQUAD_WORKFLOW);
const policy = readText(PLANNING_POLICY);

const ACTIVATE_START = workflow.indexOf('## skill: `squad-plan-activate`');
const ACTIVATE_END = workflow.indexOf('## end skill: `squad-plan-activate`');
expect(ACTIVATE_START, '"## skill: `squad-plan-activate`" is missing').toBeGreaterThan(-1);
expect(ACTIVATE_END, '"## end skill: `squad-plan-activate`" is missing').toBeGreaterThan(ACTIVATE_START);
const activateSkill = workflow.slice(ACTIVATE_START, ACTIVATE_END);
const activateProse = activateSkill.replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// Derived capacity model — every input is read from a source of truth, so drift
// in the policy file or the frontmatter fails here instead of silently changing
// the safe number.
// ---------------------------------------------------------------------------

/**
 * The largest documented activation, derived from the planning policy rather than
 * hardcoded: the maximum `max_issues` across all documented profiles.
 */
function documentedMaxIssues(): number {
  const values = [...policy.matchAll(/max_issues[`|:\s]+(\d+)/g)].map(m => Number(m[1]));
  expect(values.length, 'squad-planning-policy.md must document max_issues values').toBeGreaterThan(0);
  return Math.max(...values);
}

/** Read `max` for a safe output straight out of the workflow frontmatter block. */
function frontmatterMax(safeOutput: string): number {
  const frontmatter = workflow.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  expect(frontmatter, 'workflows/squad.md must have frontmatter').not.toBe('');
  const block = frontmatter.match(new RegExp(`\\n  ${safeOutput}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))?.[1];
  expect(block, `frontmatter safe-outputs.${safeOutput} block must exist`).toBeDefined();
  const max = block?.match(/^\s*max:\s*(\d+)\s*$/m)?.[1];
  expect(max, `safe-outputs.${safeOutput} must declare an explicit max`).toBeDefined();
  return Number(max);
}

/** Worst-case labels applied to a single created issue: `squad` + one `squad:{agent}`. */
const MAX_LABELS_PER_ISSUE = 2;

describe('gh-aw: activation capacity is calculated, recorded, and bounded (#1961)', () => {
  it('derives the documented maximum activation size from the planning policy', () => {
    // enterprise is the highest documented profile; if a profile ever raises
    // max_issues above it, this recomputes and the capacity assertions below
    // re-evaluate against the new number rather than silently going stale.
    expect(documentedMaxIssues()).toBe(50);
  });

  it('the activation skill enforces the same threshold it is sized for', () => {
    // The capacity math is only meaningful if the workflow actually refuses to
    // attempt a larger single run. > 50 must route to phased activation.
    expect(
      /total > 50/.test(activateSkill) && /phased activation/i.test(activateSkill),
      'Output Budget Awareness must force phased activation above the documented maximum.',
    ).toBe(true);
  });

  it('records the capacity calculation as workflow rationale, not folklore', () => {
    expect(
      /Activation capacity budget/i.test(activateSkill),
      'The activation skill must record the capacity calculation so the configured caps ' +
        'are explainable and cannot be lowered by accident.',
    ).toBe(true);
    // The rationale must name the worst-case operand counts, not just the caps.
    expect(activateProse).toMatch(/one per epic\/task/i);
    expect(activateProse).toMatch(/one per created issue/i);
  });

  it('distinguishes limits on output items/calls from labels per call', () => {
    // This is the specific ambiguity #1961 exists to close. The prose must state
    // that `max` counts items/tool calls, and that labels inside one call are not
    // individually charged against it.
    expect(
      /limits safe-output items \(tool calls\), not label names inside a call/i.test(activateProse),
      'The workflow must state explicitly that `max` counts safe-output items (tool ' +
        'calls) rather than label names within a call.',
    ).toBe(true);
    expect(
      /consumes \*\*one\*\* item, not two/i.test(activateProse) || /one\*\* item, not two/i.test(activateProse),
      'The workflow must show that a two-label call costs one item, so the agent cannot ' +
        'conclude it must ration labels.',
    ).toBe(true);
  });

  it('warns that an over-limit item is dropped with a warning rather than failing the run', () => {
    // gh-aw's collector pushes a string into `errors` and the job emits it via
    // core.warning — never core.setFailed. Truncation is invisible unless the
    // workflow itself detects it.
    expect(
      /dropped, not failed/i.test(activateProse),
      'The workflow must state that an over-limit safe-output item is dropped rather ' +
        'than failing the run — this is why self-validation is mandatory.',
    ).toBe(true);
    expect(activateProse).toMatch(/finish green|still succeeds/i);
  });
});

describe('gh-aw: configured caps cover the worst case under both readings of max (#1961)', () => {
  const maxIssues = documentedMaxIssues();
  const createIssueMax = frontmatterMax('create-issue');
  const addLabelsMax = frontmatterMax('add-labels');

  it('create-issue covers one item per activated issue with margin', () => {
    expect(createIssueMax).toBeGreaterThanOrEqual(maxIssues);
    // Bounded, not unbounded: an accidental extra zero should fail review here.
    expect(createIssueMax).toBeLessThanOrEqual(maxIssues * 3);
  });

  it('add-labels covers one CALL per activated issue (the runtime reading)', () => {
    // Runtime semantics: max caps NDJSON items of type add_labels.
    expect(addLabelsMax).toBeGreaterThanOrEqual(maxIssues);
  });

  it('add-labels also covers every LABEL NAME in the run (the prompt-prose reading)', () => {
    // gh-aw injects "Maximum {max} label(s) can be added". Even if the agent takes
    // that literally, a full 50-issue activation applying squad + squad:{agent} to
    // every issue (100 names) must still fit, or the agent can rationalize dropping
    // label operations. This is the assertion that would have failed at max: 80.
    const worstCaseLabelNames = maxIssues * MAX_LABELS_PER_ISSUE;
    expect(worstCaseLabelNames).toBe(100);
    expect(
      addLabelsMax,
      `add-labels max (${addLabelsMax}) must cover the worst-case ${worstCaseLabelNames} ` +
        'label names so the "Maximum N label(s)" constraint gh-aw injects cannot be read ' +
        'as a reason to stop labeling early.',
    ).toBeGreaterThanOrEqual(worstCaseLabelNames);
  });

  it('keeps the margin explicit and bounded, not open-ended', () => {
    const worstCase = Math.max(maxIssues, maxIssues * MAX_LABELS_PER_ISSUE);
    expect(addLabelsMax).toBeGreaterThan(worstCase);
    expect(
      addLabelsMax,
      'The margin above the worst case must stay bounded — a very large cap trades a ' +
        'silent-truncation bug for an unbounded-write one.',
    ).toBeLessThanOrEqual(worstCase * 2);
  });

  it('never lets add-labels fall below create-issue (one call per created issue)', () => {
    expect(addLabelsMax).toBeGreaterThanOrEqual(createIssueMax);
  });
});

// ---------------------------------------------------------------------------
// Boundary behaviour: exactly at the maximum, and one over it.
// ---------------------------------------------------------------------------

describe('gh-aw: activation size boundaries (#1961)', () => {
  const maxIssues = documentedMaxIssues();
  const createIssueMax = frontmatterMax('create-issue');
  const addLabelsMax = frontmatterMax('add-labels');

  it('AT the maximum supported size, every operation fits without truncation', () => {
    const issues = maxIssues; // 50
    expect(issues, 'create-issue items at max size must fit').toBeLessThanOrEqual(createIssueMax);
    expect(issues, 'add_labels calls at max size must fit').toBeLessThanOrEqual(addLabelsMax);
    expect(
      issues * MAX_LABELS_PER_ISSUE,
      'label names at max size must fit even under the prose reading of max',
    ).toBeLessThanOrEqual(addLabelsMax);
  });

  it('ONE OVER the maximum supported size is routed to phased activation, not attempted whole', () => {
    const issues = maxIssues + 1; // 51
    expect(issues).toBeGreaterThan(maxIssues);
    // The workflow must not silently attempt an oversized run. The guard is a
    // documented threshold on the plan total, evaluated before any create-issue call.
    expect(
      /Count expected issues before starting/i.test(activateProse),
      'The over-limit guard must run before issue creation begins, not after.',
    ).toBe(true);
    expect(
      /If total > 50: recommend phased activation/i.test(activateProse),
      'One over the documented maximum must recommend phased activation and proceed ' +
        'with the current phase only.',
    ).toBe(true);
  });

  it('ONE OVER a safe-output cap must surface as an explicit incomplete result', () => {
    // The cap itself cannot report this (dropped item + warning only), so the
    // workflow must name cap exhaustion as a reportable cause with affected items.
    expect(
      /Cap exhaustion is a reportable/i.test(activateProse),
      'Reaching a safe-output cap must be an explicitly reportable cause of an ' +
        'incomplete activation.',
    ).toBe(true);
    expect(
      /list the work items that did not fit/i.test(activateProse),
      'An overflow report must identify the affected work items, not just state that ' +
        'overflow happened.',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Self-validation: expected activated items vs targeted label operations.
// ---------------------------------------------------------------------------

describe('gh-aw: self-validation reconciles activated items with label operations (#1961)', () => {
  it('declares a label-operation reconciliation step', () => {
    expect(
      /\*\*2e\. Label-Operation Reconciliation/i.test(activateSkill),
      'Step 2e must exist: counting created issues alone cannot detect a lost label ' +
        'operation.',
    ).toBe(true);
  });

  it('compares expected activated items against successful label operations', () => {
    expect(activateProse).toMatch(/`activated`.*issues created or recognized/i);
    expect(activateProse).toMatch(/`labeled`.*add_labels.*returned successfully/i);
    expect(
      /labeled < activated/.test(activateSkill),
      'The reconciliation must compare the two counts explicitly.',
    ).toBe(true);
  });

  it('counts a missing, rejected, or errored label call as unlabeled', () => {
    // A dropped over-limit item produces no error the agent can see, so "no
    // successful result" — not "an observed error" — must be the failing condition.
    expect(
      /never made, was rejected, or returned an error counts as \*\*unlabeled\*\*/i.test(activateProse),
      'A label call that was never made must count as unlabeled, otherwise a dropped ' +
        'item is invisible to the reconciliation.',
    ).toBe(true);
  });

  it('escalates a shortfall to report_incomplete identifying every affected work item', () => {
    const reconciliation = activateSkill.slice(activateSkill.indexOf('**2e. Label-Operation Reconciliation'));
    expect(reconciliation).toContain('report_incomplete');
    expect(
      /issue number, its title, and the label set it should have received/i.test(
        reconciliation.replace(/\s+/g, ' '),
      ),
      'The incomplete report must identify affected work items specifically enough to ' +
        'act on.',
    ).toBe(true);
  });

  it('states why report_incomplete is the mechanism that prevents a green truncated run', () => {
    // gh-aw's report_incomplete is a first-class failure signal: handle_agent_failure
    // activates failure handling even when the agent exits 0. That property is the
    // whole reason this is the right primitive.
    expect(
      /failure signal even when the agent exits successfully/i.test(activateProse),
      'The workflow must record why report_incomplete (not noop, not a comment) is the ' +
        'primitive that stops a truncated run being recorded as clean.',
    ).toBe(true);
  });

  it('forbids emitting a clean activation artifact when labels are missing', () => {
    expect(
      /false success report/i.test(activateProse),
      'Emitting an activated/phases-activated artifact while labeled < activated must be ' +
        'named as a false success report.',
    ).toBe(true);
    expect(activateProse).toMatch(/phases-activated.*artifact.*while.*labeled < activated|activated.*artifact/i);
  });

  it('still forbids blaming a cap that was never actually reached', () => {
    // Guard against over-correction: #1683's rule (do not excuse a partial run by
    // pointing at a cap) must survive, now narrowed to *guessed* causes.
    expect(
      /Never surface the `create-issue` or `add-comment` safe-output caps as a guessed reason/i.test(
        activateProse,
      ),
      'A cap may be named only when observed (Step 2e), never as a guess.',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compiled-artifact verification — runtime contract evidence, not prose.
//
// Fails closed (never skips) per this repo's #1833/#1834 convention: an
// unmeasured contract is indistinguishable from a violated one.
// ---------------------------------------------------------------------------

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install --pin v0.87.10 github/gh-aw` (matches .github/workflows/squad-ci.yml). ' +
  'This gate fails closed rather than skipping: an unmeasured contract is ' +
  'indistinguishable from a violated one (#1834).';

describe('gh-aw: compiled runtime proves the capacity contract (#1961)', () => {
  let compiledLock: string | null = null;

  function lockText(): string {
    if (compiledLock !== null) return compiledLock;

    const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) {
      throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    }

    mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
    const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'capacity-'));
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    // Mirror the real deployment layout: this repo ships gh-aw sources from a
    // top-level `workflows/` dir; consumers install them into `.github/workflows/`.
    cpSync(WORKFLOWS_DIR, join(workspace, '.github', 'workflows'), { recursive: true });
    execFileSync('gh', ['aw', 'compile', '.github/workflows/squad.md', '--strict', '--approve', '--no-check-update'], {
      cwd: workspace,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const lockPath = join(workspace, '.github', 'workflows', 'squad.lock.yml');
    if (!existsSync(lockPath)) {
      throw new Error(
        `gh aw compile produced no squad.lock.yml — the contract is unmeasured. ${GH_AW_INSTALL_HINT}`,
      );
    }
    compiledLock = readText(lockPath);
    return compiledLock;
  }

  function safeOutputsConfig(): Record<string, Record<string, unknown>> {
    const json = extractSafeOutputsConfigJson(lockText());
    expect(json, 'compiled lock must carry the safe-outputs config').toBeDefined();
    return JSON.parse(json as string);
  }

  it('strict-compiles with the capacity configuration in place', () => {
    expect(lockText().length).toBeGreaterThan(0);
  });

  it('compiles the declared add_labels max into the runtime config (not just frontmatter prose)', () => {
    const config = safeOutputsConfig();
    expect(config['add_labels']).toBeDefined();
    expect(config['add_labels']['max']).toBe(frontmatterMax('add-labels'));
    // The number that actually reaches the runtime must cover the worst case.
    expect(config['add_labels']['max'] as number).toBeGreaterThanOrEqual(
      documentedMaxIssues() * MAX_LABELS_PER_ISSUE,
    );
  });

  it('keeps create_issue capacity unchanged at its established value', () => {
    const config = safeOutputsConfig();
    expect(config['create_issue']['max']).toBe(75);
  });

  it("injects a tool constraint whose number matches the configured cap", () => {
    // gh-aw phrases this as "Maximum {max} label(s) can be added". The workflow's
    // rationale quotes that phrasing; if gh-aw's number and the configured cap ever
    // diverge, the rationale would be describing a budget that does not exist.
    const compiled = lockText().replace(/\\"/g, '"');
    const declared = frontmatterMax('add-labels');
    expect(compiled).toContain(`CONSTRAINTS: Maximum ${declared} label(s) can be added`);
  });

  it('enables report_incomplete so the overflow signal is actually callable', () => {
    // Step 2e is unenforceable if this safe output is not wired in: gh-aw builds the
    // agent's tool list by intersecting the config keys with its known tools, so the
    // key's presence here is what makes report_incomplete available at runtime.
    const config = safeOutputsConfig();
    expect(
      Object.prototype.hasOwnProperty.call(config, 'report_incomplete'),
      'report_incomplete must be present in the compiled safe-outputs config — Step 2e ' +
        'depends on it to convert a truncated activation into a failure signal.',
    ).toBe(true);
  });

  it('exposes add_labels and create_issue as tools the agent can call', () => {
    const compiled = lockText();
    expect(compiled).toMatch(/"tools":\[[^\]]*"add_labels"[^\]]*\]/);
    expect(compiled).toMatch(/"tools":\[[^\]]*"create_issue"[^\]]*\]/);
  });

  it('does not broaden the agent job permissions — writes stay in the safe-output job', () => {
    // Raising a capacity cap must not become a permissions change.
    const compiled = lockText();
    const agentJobAt = compiled.indexOf('\n  agent:\n');
    const safeOutputsJobAt = compiled.indexOf('\n  safe_outputs:\n');
    expect(agentJobAt, '"agent:" job missing from compiled lock').toBeGreaterThan(-1);
    expect(safeOutputsJobAt, '"safe_outputs:" job missing from compiled lock').toBeGreaterThan(agentJobAt);

    const permsBlock = compiled.slice(agentJobAt, safeOutputsJobAt).match(/permissions:\n((?:\s{6}\S.*\n)+)/)?.[1] ?? '';
    expect(permsBlock).toContain('issues: read');
    expect(permsBlock).not.toContain('issues: write');
  });
});
