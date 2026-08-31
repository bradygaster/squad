/**
 * Activation label-operation capacity and silent-truncation safeguards (#1961, parent #1957).
 *
 * ## The defect
 *
 * `workflows/squad.md` promises a `squad` (and where certified, `squad:{agent}`) label on
 * every issue an activation creates. Those labels are applied by the `add-labels` safe
 * output, which is governed by a `max`. Two problems let a large activation lose label
 * operations *while the run still reported success*:
 *
 * 1. **`max` is ambiguous in gh-aw's own surface area.** The compiler injects the tool
 *    constraint as "Maximum {N} label(s) can be added", which reads as a budget of label
 *    *names*. The runtime counts operations instead. At the previous `max: 80`, an agent
 *    that believed the label reading would conclude a 50-issue activation (up to 100 label
 *    names) had overrun its budget, and could stop labeling early or batch issues together.
 *    This is agent self-truncation, and it was reachable at 80.
 * 2. **Neither enforcement layer fails the run.** Even when a cap is genuinely hit, the
 *    workflow run still concludes successfully, so nothing forces the truncation to
 *    surface. See below.
 *
 * Note what is *not* claimed: at `max: 80`, 50 `add_labels` calls did **not** overflow the
 * operation cap. Runtime truncation was not reachable at the documented maximum. The cap
 * moves to 110 to defeat the misleading injected wording and to hold a bounded margin —
 * not to fix a proven 80-item overflow.
 *
 * ## Runtime semantics this suite is written against (gh-aw v0.87.10, the CI pin)
 *
 * **Cap enforcement is dual (Safe Outputs Specification MCE4) and neither half is fatal.**
 * Invocation time — `safe_outputs_handlers.cjs`, `enforcePerTypeMax` via
 * `appendSafeOutputCounted`, applied whenever `max` is explicitly configured (it is here):
 *
 * ```js
 * if (current >= maxAllowed) {
 *   throw { code: -32602, message: `E002: ${type} limit reached — ${current} of ${maxAllowed} already used this run`, ... };
 * }
 * ```
 *
 * That is a JSON-RPC error the agent **does** observe. Collection time —
 * `collect_ndjson_output.cjs` — is the second half: a surplus item is dropped with
 * `continue` and reported via `core.warning`. Neither path calls `core.setFailed`, so the
 * run concludes successfully with label operations missing.
 *
 * `max` therefore caps **operations of that type**, not label names inside one call. One
 * `add_labels` call carrying two labels costs one unit of budget, not two.
 *
 * **`report_incomplete` does not turn the run red.** gh-aw's own tool description claims it
 * is "treated as a failure signal even when the agent exits successfully" — misleading in
 * precisely the way this issue is about. In the pinned runtime,
 * `report_incomplete_handler.cjs` emits `core.warning` only, and `handle_agent_failure.cjs`
 * contains no `core.setFailed` or `process.exit`: its "failure handling" opens or updates an
 * `[aw] {workflow} reported incomplete result` tracking issue/comment. That is a durable,
 * human-actionable record — it satisfies #1961's "explicit incomplete result" — but the run
 * conclusion stays green. No narrower supported mechanism in v0.87.10 makes it red, so the
 * workflow states that limitation rather than implying a failure it cannot produce.
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
 * - #1962 / PR #1965 temporary-ID linkage between `create_issue` and `add_labels`. This
 *   branch is stacked on PR #1965, so that mechanism is present — but this suite still
 *   asserts nothing about *how* an `add_labels` call targets its item; PR #1965's own
 *   suite (`gh-aw-activation-temporary-ids.test.ts`) owns that contract. The one place
 *   the two meet is Step 2e's incomplete report, which must name the `temporary_id`
 *   minted under #1965's Temporary-ID Contract for items created this run, and a real
 *   number only where #1965 says one is verified (dedup-by-title or idempotent rerun).
 *   Demanding a number that does not yet exist would reintroduce the assumption #1962
 *   removes, so that single assertion is in scope here.
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
      /consumes \*\*one\*\* unit\s*of budget, not two/i.test(activateProse),
      'The workflow must show that a two-label call costs one unit of budget, so the ' +
        'agent cannot conclude it must ration labels.',
    ).toBe(true);
  });

  it('describes cap enforcement as dual and non-fatal, without overstating either half', () => {
    // Pinned-runtime semantics, both halves:
    //   invocation time  — safe_outputs_handlers.cjs enforcePerTypeMax/appendSafeOutputCounted
    //                      throw JSON-RPC -32602 "E002: {type} limit reached", which the
    //                      agent DOES observe;
    //   collection time  — collect_ndjson_output.cjs drops the surplus item via core.warning.
    // Neither calls core.setFailed, so the run still concludes successfully.
    expect(
      /enforced twice/i.test(activateProse),
      'The workflow must describe both halves of cap enforcement rather than only the ' +
        'collector drop.',
    ).toBe(true);
    expect(
      /E002/.test(activateSkill),
      'The invocation-time rejection must be named by its actual error, since the agent ' +
        'can observe it.',
    ).toBe(true);
    expect(
      /neither layer fails the run/i.test(activateProse),
      'The workflow must state that neither enforcement layer fails the run — that is ' +
        'why self-validation is mandatory.',
    ).toBe(true);
    // Guard against the inverse overclaim: the agent is NOT blind to cap rejections.
    expect(
      /never appears as an error to the agent/i.test(activateProse),
      'The workflow must not claim the agent never sees a cap error — invocation-time ' +
        'enforcement surfaces E002 to the agent.',
    ).toBe(false);
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
    // Runtime semantics: max caps add_labels operations, not label names.
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
    // Absence-of-success, not presence-of-error, must be the failing condition. The agent
    // does see an E002 rejection at invocation time, but a call can also simply never be
    // made, and a surplus item can be dropped downstream with only a warning. Reconciling
    // on counts covers all three; reconciling on observed errors does not.
    expect(
      /never made, was rejected, or returned an error counts as \*\*unlabeled\*\*/i.test(activateProse),
      'A label call that was never made must count as unlabeled, otherwise a lost ' +
        'operation is invisible to the reconciliation.',
    ).toBe(true);
  });

  it('escalates a shortfall to report_incomplete identifying every affected work item', () => {
    const reconciliation = activateSkill.slice(activateSkill.indexOf('**2e. Label-Operation Reconciliation'));
    const reconciliationProse = reconciliation.replace(/\s+/g, ' ');
    expect(reconciliation).toContain('report_incomplete');
    expect(
      /the identifier you used to target its `add_labels` call, its title, and the label set it should have received/i.test(
        reconciliationProse,
      ),
      'The incomplete report must identify affected work items specifically enough to act on.',
    ).toBe(true);
  });

  it('does not demand a real issue number for items created during the run', () => {
    // gh-aw defers issue creation to the safe-output job, so no real number exists during
    // the agent turn. Requiring one here would reintroduce exactly the invalid-number
    // assumption #1962 (PR #1965) removes. Now that this branch is stacked on #1965, the
    // identifier is named concretely as that PR's `temporary_id` rather than abstractly.
    const reconciliation = activateSkill.slice(activateSkill.indexOf('**2e. Label-Operation Reconciliation'));
    const reconciliationProse = reconciliation.replace(/\s+/g, ' ');
    expect(
      /`temporary_id` you minted under the Temporary-ID Contract/i.test(reconciliationProse),
      "For an item created this run the report must name the temporary_id minted under " +
        "#1965's Temporary-ID Contract, because no issue number exists yet.",
    ).toBe(true);
    expect(
      /not a GitHub issue number/i.test(reconciliationProse),
      'The report must say explicitly that the identifier is not an issue number.',
    ).toBe(true);
    expect(
      /matched by dedup-by-title, or an issue recognized by Step 1's idempotent-rerun path/i.test(reconciliationProse),
      'A real number may only be quoted where independently verified — a dedup-by-title ' +
        'match or an idempotent-rerun recognition, matching #1965 reused-issue rules.',
    ).toBe(true);
    expect(
      /Never predict, infer, or invent a number/i.test(reconciliationProse),
      'The report must forbid inventing an issue number to fill the identifier field.',
    ).toBe(true);
  });

  it('states report_incomplete semantics accurately — a tracking record, not a red run', () => {
    // Verified against pinned gh-aw v0.87.10 rather than gh-aw's own tool description
    // (which says "treated as a failure signal even when the agent exits successfully"
    // — misleading in exactly the way this issue is about):
    //   report_incomplete_handler.cjs   -> core.warning only.
    //   handle_agent_failure.cjs        -> contains no core.setFailed / process.exit;
    //                                      "failure handling" opens/updates an
    //                                      "[aw] ... reported incomplete result" issue.
    // The run still concludes successfully. The workflow must say so, so the agent does
    // not assume a red run is carrying the signal for it.
    expect(
      /reported incomplete result/i.test(activateProse),
      'The workflow must name the durable artifact report_incomplete actually produces.',
    ).toBe(true);
    expect(
      /does \*\*not\*\* change the run's conclusion/i.test(activateProse),
      'The workflow must state that report_incomplete does not change the run conclusion.',
    ).toBe(true);
    expect(
      /never rely on a red run/i.test(activateProse),
      'The workflow must forbid relying on a failed run to carry the incompletion signal.',
    ).toBe(true);
    // Guard against reintroducing the overclaim this test previously asserted.
    expect(
      /failure signal even when the agent exits successfully/i.test(activateProse),
      'The workflow must not repeat gh-aw\'s misleading "failure signal" phrasing: the ' +
        'pinned runtime emits a warning and a tracking issue, and never fails the run.',
    ).toBe(false);
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
