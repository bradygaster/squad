/**
 * gh-aw temporary-ID targeting for `/squad plan activate` (#1962, parent #1957).
 *
 * The activation prose previously told the model to read a real GitHub issue number back
 * from each `create-issue` call and then target `add_labels` at it. gh-aw never does that:
 * issue creation is deferred to the post-agent safe-output job, so the agent only ever
 * receives a success acknowledgement. Every downstream operation that depended on a
 * "returned" number was therefore either blocked forever or satisfied by a hallucinated
 * number — and an `add_labels` call with no resolvable `item_number` silently falls back to
 * labelling the *triggering intent issue*.
 *
 * gh-aw's supported linkage is `temporary_id`: `create_issue` mints one, and
 * `add_labels.item_number`, `create_issue.parent`, and `create_issue.blocked_by` accept it.
 * The safe-output job resolves temporary IDs to real issue numbers after the agent exits.
 *
 * Verified against the pinned gh-aw v0.87.10 (.github/workflows/squad-ci.yml):
 *   - `create_issue.temporary_id` — optional string, pattern `^#?aw_[A-Za-z0-9_]{3,12}$`
 *   - `add_labels.item_number`    — number | string, `^(\d+|#?aw_[A-Za-z0-9_]{3,12})$`
 *   - `require-temporary-id: true` under `safe-outputs.create-issue` compiles to
 *     `"require_temporary_id":true` plus `required_field_additions.create_issue`
 *
 * This suite locks the corrected contract. It is deliberately narrow: the broad activation
 * behavioral suite is #1960, the `/squad activate` fast path is #1959, and the activation
 * reporting redesign is #1963.
 */

import { afterAll, describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-temporary-ids');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

/** Read a text file with line endings normalized to LF (Windows checkouts materialize CRLF). */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const workflow = readText(SQUAD_WORKFLOW);

const ACTIVATE_START = workflow.indexOf('## skill: `squad-plan-activate`');
const ACTIVATE_END = workflow.indexOf('## end skill: `squad-plan-activate`');
expect(ACTIVATE_START, '"## skill: `squad-plan-activate`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACTIVATE_END, '"## end skill: `squad-plan-activate`" is missing from workflows/squad.md').toBeGreaterThan(
  ACTIVATE_START,
);
const activateSkill = workflow.slice(ACTIVATE_START, ACTIVATE_END);

/** Whitespace-collapsed view for prose assertions that may span wrapped lines. */
const activateProse = activateSkill.replace(/\s+/g, ' ');

/** Isolate a `**{marker}**` step body, running to the next bold step heading. */
function stepBody(marker: string): string {
  const start = activateSkill.indexOf(marker);
  expect(start, `"${marker}" is missing from the squad-plan-activate skill`).toBeGreaterThan(-1);
  const rest = activateSkill.slice(start + marker.length);
  const nextStep = rest.search(/\n\*\*\d[a-z]?\./);
  return (nextStep === -1 ? rest : rest.slice(0, nextStep)).replace(/\s+/g, ' ');
}

describe('gh-aw: temporary-ID targeting in squad-plan-activate (#1962)', () => {
  it('requires a temporary_id on every create-issue via frontmatter', () => {
    // Without this, a create_issue call that forgets its temporary_id still succeeds and
    // the matching add_labels has nothing resolvable to target. The flag makes the
    // omission a hard rejection instead of a silent mis-label.
    const frontmatterEnd = workflow.indexOf('\n---', 4);
    expect(frontmatterEnd, 'workflows/squad.md frontmatter is unterminated').toBeGreaterThan(0);
    const frontmatter = workflow.slice(0, frontmatterEnd);

    const createIssueAt = frontmatter.indexOf('create-issue:');
    expect(createIssueAt, '`create-issue:` is missing from the safe-outputs frontmatter').toBeGreaterThan(-1);

    expect(
      frontmatter.slice(createIssueAt),
      '`require-temporary-id: true` must be declared under safe-outputs.create-issue.',
    ).toMatch(/create-issue:[\s\S]*?require-temporary-id: true/);
  });

  it('documents the exact gh-aw temporary-ID format, not an invented one', () => {
    // A value outside gh-aw's pattern is rejected at the MCP tool layer, so the prose has
    // to carry the real pattern rather than a plausible-looking approximation.
    expect(
      activateProse,
      'The prose must cite gh-aw\'s actual temporary_id pattern.',
    ).toContain('^#?aw_[A-Za-z0-9_]{3,12}$');
  });

  it('mints deterministic temporary IDs derived from the plan, never invented ones', () => {
    expect(activateProse).toMatch(/#aw_epic\{K\}/);
    expect(activateProse).toMatch(/#aw_task\{N\}/);
    expect(
      /derive, never invent/i.test(activateProse),
      'The minting scheme must be derived from the plan\'s own identifiers so a rerun ' +
        'produces the same IDs and two items can never collide.',
    ).toBe(true);
  });

  it('makes temporary-ID uniqueness the prompt\'s responsibility', () => {
    // Verified in gh-aw v0.87.10: a duplicate temporary_id is NOT rejected. The
    // temporaryIdMap set() silently overwrites, so the last create_issue using a value
    // owns it and every earlier reference resolves to the wrong issue. gh-aw emits no
    // warning for this on create_issue, so the prompt must enforce it.
    expect(
      /uniqueness is your responsibility/i.test(activateProse),
      'The prose must state that gh-aw does not enforce temporary-ID uniqueness.',
    ).toBe(true);
    expect(
      /does not reject a duplicate `temporary_id`/i.test(activateProse),
      'The prose must name the concrete failure mode: duplicates are silently accepted.',
    ).toBe(true);
  });

  it('mandates an explicit add_labels item_number and names the silent-fallback hazard', () => {
    // This is the actual production defect: an add_labels with no item_number does not
    // error — it labels the triggering intent issue, branding the user's own request.
    expect(
      /every `add_labels` call MUST pass `item_number`/i.test(activateProse),
      'Explicit item_number targeting must be mandatory, not implied.',
    ).toBe(true);
    expect(
      /triggering intent issue/i.test(activateProse),
      'The prose must name what an omitted item_number silently hits.',
    ).toBe(true);
  });

  it('targets add_labels at the create-issue call\'s temporary_id', () => {
    expect(
      /`item_number` set to that call's `temporary_id`/i.test(activateProse),
      'add_labels must be wired to the minting create-issue call\'s temporary_id.',
    ).toBe(true);
  });

  it('never waits for, predicts, or reads back an issue number for issues it created', () => {
    expect(
      /does \*\*not\*\* return a real GitHub issue number/i.test(activateProse),
      'The Hallucination Guard must state plainly that create-issue returns no number.',
    ).toBe(true);
    expect(
      /never predict, infer, or "read back" a number/i.test(activateProse),
      'Predicting or inferring a created issue\'s number must be explicitly forbidden.',
    ).toBe(true);
    expect(
      /do not wait for a returned issue number/i.test(activateProse),
      'The prose must tell the model not to block on a number that never arrives.',
    ).toBe(true);
  });

  it('still uses real, verified numbers for pre-existing and reused issues', () => {
    // Temporary IDs only map issues THIS run created. An idempotent rerun or a
    // dedup-by-title match has a genuine number and must use it.
    expect(
      /has a real, verified number: target it by that number, not a temporary ID/i.test(activateProse),
      'Reused/pre-existing issues must be targeted by their verified real number.',
    ).toBe(true);
  });

  it('declares a temporary ID in both the epic (2b) and task (2c) creation steps', () => {
    for (const marker of ['**2b. Create Epic Issues:**', '**2c. Create Task Issues:**']) {
      expect(stepBody(marker), `${marker} must declare a Temporary ID field`).toMatch(/- Temporary ID:/);
    }
  });

  it('passes the epic\'s temporary ID as each task\'s parent', () => {
    // The epic does not exist yet when the task create-issue is emitted, so `parent`
    // cannot be a real number. gh-aw resolves a temporary ID here.
    expect(stepBody('**2c. Create Task Issues:**')).toMatch(/#aw_epic\{K\}/);
  });

  it('uses the triggering issue\'s own real number as the epic parent', () => {
    // The one place a real number IS correct: the intent issue that triggered the run
    // already exists and its number is independently known.
    expect(stepBody('**2b. Create Epic Issues:**')).toMatch(/triggering issue/i);
  });

  it('expresses native dependency edges with temporary IDs on create-issue', () => {
    // blocked_by must be declared on the create_issue call itself (gh-aw's topological
    // sort only inspects create_issue.blocked_by), not patched in afterwards with a
    // number the agent does not have.
    const start = activateSkill.indexOf('##### Step 3: Native Dependency Edges');
    expect(start, '"##### Step 3: Native Dependency Edges" is missing').toBeGreaterThan(-1);
    const rest = activateSkill.slice(start);
    const nextHeading = rest.slice(1).search(/\n#{1,5} /);
    const stepThree = (nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1)).replace(/\s+/g, ' ');

    expect(stepThree).toMatch(/blocked_by/);
    expect(stepThree).toMatch(/#aw_task\{N\}/);
    expect(
      /on the `create-issue` call itself/i.test(stepThree),
      'blocked_by must be declared on the create-issue call, not applied afterwards.',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compiled-artifact verification
// ---------------------------------------------------------------------------
//
// The prose assertions above are only a contract if gh-aw actually compiles the
// requirement into the safe-output handler config. Fails closed (never skips) per this
// repo's #1833/#1834 convention: an unmeasured contract is indistinguishable from a
// violated one.

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install --pin v0.87.10 github/gh-aw` (matches .github/workflows/squad-ci.yml). ' +
  'This gate fails closed rather than skipping: an unmeasured contract is ' +
  'indistinguishable from a violated one (#1834).';

describe('gh-aw: require-temporary-id compiles into the real safe-output config (#1962)', () => {
  let compiledLock: string | null = null;

  function lockText(): string {
    if (compiledLock !== null) return compiledLock;

    const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) {
      throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    }

    mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
    const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'temp-ids-'));
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    // This repo ships the gh-aw *source* from a top-level `workflows/` dir; downstream
    // consumers install it into `.github/workflows/` via `gh aw add`. Mirror that real
    // deployment layout, matching .github/workflows/squad-ci.yml's own compile gate.
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

  it('strict-compiles with require-temporary-id declared', () => {
    expect(lockText().length).toBeGreaterThan(0);
  });

  it('wires require_temporary_id: true into the create_issue handler config', () => {
    // gh-aw embeds this JSON inside a double-quoted YAML env value with every `"`
    // backslash-escaped. De-escape before matching so this holds regardless of a given
    // compiler version's quoting choice.
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"create_issue":\{[^}]*"require_temporary_id":true/);
  });

  it('adds temporary_id to create_issue\'s required fields', () => {
    // gh-aw emits this block pretty-printed across multiple lines, so match with
    // whitespace tolerance rather than assuming compact JSON.
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(
      /"required_field_additions":\s*\{\s*"create_issue":\s*\[\s*"temporary_id"\s*\]/,
    );
  });

  it('tells the agent, in its own tool constraints, that temporary_id is required', () => {
    // The prompt-side constraint string is what the model actually reads at runtime;
    // without it the enforcement is a silent rejection the agent cannot anticipate.
    // De-escaping reintroduces quotes inside the value (`Labels ["squad"]`), so match
    // with a bounded lazy span rather than a quote-delimited one.
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"create_issue":\s*"\s*CONSTRAINTS:[\s\S]{0,300}?temporary_id is required/);
  });
});
