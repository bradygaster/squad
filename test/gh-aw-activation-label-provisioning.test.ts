/**
 * Fresh-repo `squad`/`squad:{agent}` label provisioning for `/squad plan activate` (#1955).
 *
 * `workflows/squad.md` promised `squad` and `squad:{agent}` labels on every issue the
 * activation flow creates, but the workflow only declared `issues: read` and a
 * `create-issue` safe-output — it never declared a way to create a label that does not
 * already exist. GitHub's REST API silently drops label names that are not already
 * present in the target repository when they're passed to `POST /issues`, so a
 * consumer's very first activation on a brand-new repo (zero pre-existing labels)
 * created every issue with none of the labels the docs promised. The old prose named
 * this honestly as a "prerequisite gap" instead of fixing it.
 *
 * The fix is gh-aw's `add-labels` safe output with `create-if-missing: true`: it creates
 * any label in its `allowed` list that the target repository is missing, then applies it
 * via an add-only GraphQL mutation. This suite locks in:
 *   - the frontmatter no longer describes label creation as an unconfigured gap
 *   - Steps 2b/2c call `add_labels` immediately after each verified `create-issue` result
 *   - the roster-binding/correspondence/non-roster rules `gh-aw-agent-binding-
 *     correspondence.test.ts` already locks in are untouched by this change
 *   - the compiled workflow actually wires `create_if_missing: true` into the add_labels
 *     safe-output handler config, so this isn't just unenforced prose
 *
 * Out of scope (per #1955's delegated task boundaries): running the E4 live end-to-end
 * test, and the `squad-plan-accept` fast-path's own separate create-issue/label logic
 * (only reachable when a flat `plan` artifact exists with no `program`/`implementation`
 * artifacts — see workflows/squad.md's `squad-plan-accept` skill).
 */

import { afterAll, describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-label-provisioning');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

/** Read a text file with line endings normalized to LF (Windows checkouts materialize CRLF). */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const workflow = readText(SQUAD_WORKFLOW);

/** Whitespace-collapsed view for prose assertions that may span wrapped lines. */
const prose = workflow.replace(/\s+/g, ' ');

/** Isolate the `squad-plan-activate` skill body — the only in-scope command for #1955. */
const ACTIVATE_START = workflow.indexOf("## skill: `squad-plan-activate`");
const ACTIVATE_END = workflow.indexOf("## end skill: `squad-plan-activate`");
expect(ACTIVATE_START, '"## skill: `squad-plan-activate`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACTIVATE_END, '"## end skill: `squad-plan-activate`" is missing from workflows/squad.md').toBeGreaterThan(ACTIVATE_START);
const activateSkill = workflow.slice(ACTIVATE_START, ACTIVATE_END);
const activateProse = activateSkill.replace(/\s+/g, ' ');

describe('gh-aw: fresh-repo label provisioning in squad-plan-activate (#1955)', () => {
  it('declares add-labels with create-if-missing in frontmatter, not a create-label safe-output', () => {
    // gh-aw has no `create-label` safe-output primitive; `add-labels` with
    // `create-if-missing: true` is the only supported mechanism. A regression here
    // (e.g. someone inventing `create-label`) would fail this assertion first.
    expect(workflow).toContain('add-labels:');
    expect(workflow).toContain('create-if-missing: true');
    expect(workflow).not.toContain('create-label:');
  });

  it('reframes the old "prerequisite gap" as solved, not still open', () => {
    // The phrase survives as a deliberate callback ("... is never a prerequisite gap"),
    // but the old admission that it was an unconfigured limitation must be gone.
    expect(
      /never a prerequisite gap/i.test(activateProse),
      'The prose must state that a fresh repository with missing labels is no longer a ' +
        'prerequisite gap now that add-labels/create-if-missing is declared.',
    ).toBe(true);

    expect(
      /not configured in this workflow/i.test(activateProse),
      'The old "not configured in this workflow" admission must be removed along with ' +
        'the gap it described.',
    ).toBe(false);
  });

  it('documents that add-labels auto-provisions squad labels on a fresh repository', () => {
    expect(
      /`add-labels`.*`create-if-missing`.*auto-creates/is.test(activateSkill) ||
        /create-if-missing.*creates any label/is.test(activateSkill),
      'The Label Pre-flight section must explain that add-labels/create-if-missing ' +
        'auto-provisions squad/squad:{agent} labels, replacing the removed gap language.',
    ).toBe(true);

    expect(
      /fresh repository/i.test(activateProse),
      'The provisioning explanation should name the fresh-repository case #1955 reported.',
    ).toBe(true);
  });

  it("explains why create-issue's own labels field cannot provision missing labels", () => {
    expect(
      /silently drops? label/i.test(activateProse),
      "The prose must state that create-issue's labels field cannot create missing " +
        'labels — GitHub silently drops names that do not already exist — so a reader ' +
        "does not reintroduce reliance on create-issue's labels field alone.",
    ).toBe(true);
  });

  it('calls add_labels immediately after create-issue for epics (2b)', () => {
    const epicAt = activateSkill.indexOf('**2b. Create Epic Issues:**');
    const taskAt = activateSkill.indexOf('**2c. Create Task Issues:**');
    expect(epicAt, '"**2b. Create Epic Issues:**" is missing').toBeGreaterThan(-1);
    expect(taskAt, '"**2c. Create Task Issues:**" is missing').toBeGreaterThan(epicAt);

    const epicSection = activateSkill.slice(epicAt, taskAt);
    expect(
      /add_labels/i.test(epicSection),
      'Step 2b must call add_labels on the epic issue after create-issue returns.',
    ).toBe(true);
    expect(
      /verified/i.test(epicSection) && /add_labels/i.test(epicSection),
      'The add_labels call must target the verified (real, returned) issue number, not a predicted one.',
    ).toBe(true);
  });

  it('calls add_labels immediately after create-issue for tasks (2c), inside the atomic contract', () => {
    const taskAt = activateSkill.indexOf('**2c. Create Task Issues:**');
    const selfValidationAt = activateSkill.indexOf('**2d. Self-Validation:**');
    expect(taskAt, '"**2c. Create Task Issues:**" is missing').toBeGreaterThan(-1);
    expect(selfValidationAt, '"**2d. Self-Validation:**" is missing').toBeGreaterThan(taskAt);

    const taskSection = activateSkill.slice(taskAt, selfValidationAt);
    expect(
      /add_labels/i.test(taskSection),
      'Step 2c must call add_labels on the task issue after create-issue returns.',
    ).toBe(true);

    const atomicAt = taskSection.indexOf('ATOMIC CONTRACT');
    expect(atomicAt, '"ATOMIC CONTRACT" block is missing from Step 2c').toBeGreaterThan(-1);
    const atomicLine = taskSection.slice(atomicAt, atomicAt + 400);
    expect(
      /add_labels/i.test(atomicLine),
      'The ATOMIC CONTRACT (one compose → one create-issue call → one verify) must be ' +
        'extended to include the add_labels call, so the model cannot buffer multiple ' +
        'tasks before labeling them.',
    ).toBe(true);
  });

  it('forbids the invalid "wait for a returned real issue number" contract (#1962)', () => {
    // The original version of this rule told the model to wait until create-issue
    // "returned and been verified" before calling add_labels. gh-aw never returns a real
    // issue number to the agent — creation is deferred to the safe-output job — so that
    // instruction was unsatisfiable and is exactly the defect #1962 corrects. The prose
    // must now say the opposite: do not wait, because no number arrives.
    expect(
      /never call `add_labels` before/i.test(activateProse),
      'The old "never call add_labels before create-issue has returned a real issue ' +
        'number" rule must be gone — it encoded the invalid assumption #1962 fixes.',
    ).toBe(false);

    expect(
      /do not wait for a returned issue number/i.test(activateProse),
      'The prose must explicitly tell the model NOT to wait for a returned issue ' +
        'number, since gh-aw never provides one during the run.',
    ).toBe(true);

    expect(
      /does \*\*not\*\* return a real GitHub issue number/i.test(activateProse),
      'The Hallucination Guard must state plainly that create-issue does not return a ' +
        'real issue number during the run.',
    ).toBe(true);
  });

  it('preserves the roster-binding correspondence rules unchanged (#1859, #1860)', () => {
    // This is a narrow smoke check; gh-aw-agent-binding-correspondence.test.ts is the
    // authoritative lock for these rules. This test only guards against this change
    // having silently damaged them while rewriting the surrounding label prose.
    expect(activateProse).toMatch(/own\s+`Agent`\s+cell/i);
    expect(activateProse).toMatch(/never inherit the parent epic/i);
    expect(activateProse).toMatch(/carry the previous task/i);
    expect(activateProse).toMatch(/two or more/i);
    expect(activateProse).toMatch(/never\s+choose\s+one\s+of\s+several/i);
    expect(activateProse).toMatch(/simultaneously certified and wrong/i);
    expect(activateProse).toMatch(/Non-roster agent values` heading is \*\*required\*\*/i);
  });

  it('keeps rerun idempotency: reapplying labels on a rerun is a documented no-op', () => {
    expect(
      /re-applying an already-present label on a rerun is a no-op/i.test(activateProse),
      'Rerun idempotency must be explicit: title-match dedup already skips recreating ' +
        'issues, and add_labels must be safe to call again for issues that already carry ' +
        'the label (add-only GraphQL merge semantics).',
    ).toBe(true);
    // Pre-existing idempotent-rerun contract (Step 2d) must remain intact.
    expect(activateProse).toMatch(/Re-runs are idempotent via title match/i);
  });

  it('does not touch the separate squad-plan-accept fast-path label logic (out of scope)', () => {
    const acceptStart = workflow.indexOf('## skill: `squad-plan-accept`');
    expect(acceptStart, '"## skill: `squad-plan-accept`" is missing from workflows/squad.md').toBeGreaterThan(-1);
    // squad-plan-accept has no "## end skill" marker of its own; its body runs until the
    // next "## skill:" heading (squad-plan-revise).
    const acceptEnd = workflow.indexOf('## skill: `squad-plan-revise`');
    expect(acceptEnd, '"## skill: `squad-plan-revise`" is missing from workflows/squad.md').toBeGreaterThan(acceptStart);

    const acceptSkill = workflow.slice(acceptStart, acceptEnd);
    // #1955 is scoped to squad-plan-activate only; squad-plan-accept's own
    // create-issue/label fast path (reachable only for a flat plan with no
    // program/implementation artifacts) is intentionally unmodified here.
    expect(acceptSkill).not.toContain('add_labels');
    expect(acceptSkill).not.toContain('create-if-missing');
  });
});

// ---------------------------------------------------------------------------
// Compiled-artifact verification
// ---------------------------------------------------------------------------
//
// The assertions above lock the prose contract. This section proves the prose is
// backed by a real, compilable safe-output: `gh aw compile --strict` must wire
// `create_if_missing: true` into the add_labels handler config, and the add_labels
// tool must be exposed to the agent. Fails closed (never skips) per this repo's
// #1833/#1834 convention: an unmeasured contract is indistinguishable from a
// violated one.

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install github/gh-aw` (matches .github/workflows/squad-ci.yml). This ' +
  'gate fails closed rather than skipping: an unmeasured contract is indistinguishable ' +
  'from a violated one (#1834).';

describe('gh-aw: add-labels compiles into the real safe-output handler config (#1955)', () => {
  let compiledLock: string | null = null;

  function lockText(): string {
    if (compiledLock !== null) return compiledLock;

    const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) {
      throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    }

    mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
    const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'add-labels-'));
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    // gh-aw's dispatch-workflow validation resolves cross-workflow references against
    // a `.github/workflows/` directory located relative to the compiled file. This repo
    // ships the gh-aw *source* from a top-level `workflows/` dir; downstream consumers
    // install it into `.github/workflows/` via `gh aw add`. Mirror that real deployment
    // layout, matching .github/workflows/squad-ci.yml's own compile gate.
    cpSync(WORKFLOWS_DIR, join(workspace, '.github', 'workflows'), { recursive: true });
    execFileSync('gh', ['aw', 'compile', '.github/workflows/squad.md', '--strict', '--approve', '--no-check-update'], {
      cwd: workspace,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const lockPath = join(workspace, '.github', 'workflows', 'squad.lock.yml');
    if (!existsSync(lockPath)) {
      throw new Error(
        `gh aw compile produced no squad.lock.yml — the compiled artifact this gate ` +
          `inspects is absent, so the contract is unmeasured. ${GH_AW_INSTALL_HINT}`,
      );
    }
    compiledLock = readText(lockPath);
    return compiledLock;
  }

  it('strict-compiles with add-labels declared', () => {
    expect(lockText().length).toBeGreaterThan(0);
  });

  it('wires create_if_missing: true and the allowed squad label patterns into the handler config', () => {
    // gh-aw v0.87.x (this fix's required pin bump) emits this JSON config only
    // embedded inside a double-quoted YAML env var value, with every `"`
    // backslash-escaped. De-escape before matching so this holds regardless of a
    // given compiler version's quoting choice.
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toContain('"add_labels"');
    expect(compiled).toMatch(/"add_labels":\{[^}]*"create_if_missing":true/);
    expect(compiled).toMatch(/"add_labels":\{[^}]*"allowed":\["squad","squad:\*"\]/);
  });

  it('exposes add_labels as a tool the agent can call, alongside create_issue', () => {
    const compiled = lockText();
    expect(compiled).toMatch(/"tools":\[[^\]]*"add_labels"[^\]]*\]/);
    expect(compiled).toMatch(/"tools":\[[^\]]*"create_issue"[^\]]*\]/);
  });

  it("does not broaden the main agent job's permissions — writes stay in the safe-output job", () => {
    const compiled = lockText();
    const agentJobAt = compiled.indexOf('\n  agent:\n');
    const safeOutputsJobAt = compiled.indexOf('\n  safe_outputs:\n');
    expect(agentJobAt, '"agent:" job is missing from the compiled lock file').toBeGreaterThan(-1);
    expect(safeOutputsJobAt, '"safe_outputs:" job is missing from the compiled lock file').toBeGreaterThan(agentJobAt);

    const agentJob = compiled.slice(agentJobAt, safeOutputsJobAt);
    // The agent job's own permissions block (the first "permissions:" after the job
    // name) must remain issues: read — write access lives only in the safe_outputs job.
    const permsMatch = agentJob.match(/permissions:\n((?:\s{6}\S.*\n)+)/);
    expect(permsMatch, 'agent job permissions block not found').not.toBeNull();
    const permsBlock = permsMatch ? permsMatch[1] : '';
    expect(permsBlock).toContain('issues: read');
    expect(permsBlock).not.toContain('issues: write');
  });
});
