/**
 * Activation summaries report actual accepted label-operation outcomes (#1963).
 *
 * Parent: #1957. Stacks on #1962 (`gh-aw-activation-temporary-ids.test.ts`, temporary-ID
 * targeting for `/squad plan activate`) and #1959
 * (`gh-aw-activate-fast-path-label-provisioning.test.ts`, the `/squad activate` fast path's
 * own `add_labels` provisioning). Those two made the label *operations* correct. They did
 * not make the *summary* correct.
 *
 * Two defects remained, one per activation path, plus a latent data-contract bug:
 *
 *   1. Over-claim by attribution. Both paths permitted naming a `squad:{agent}` label once
 *      `create-issue` "returned successfully carrying it". `create-issue`'s `labels:` field
 *      cannot land a label GitHub does not already have — the exact failure #1959 fixed —
 *      so that sentence licensed reporting labels that were never applied. A label is now
 *      reportable only when an accepted `add_labels` call carried it for that same issue.
 *
 *   2. Invalid `Activation bindings:` JSON. The block required bare `{created task issue
 *      number}` / `{created epic issue number}`. The agent cannot know a created issue's
 *      real number during its turn, and gh-aw's temporary-ID substitution is a plain text
 *      replacement over the whole comment body that does *not* skip fenced code blocks and
 *      *keeps* the `#`. A bare `"issue":#aw_task1` therefore becomes `"issue":#42` —
 *      invalid JSON that fails the entire block. Verified empirically against the pinned
 *      runtime (`github/gh-aw-actions@v0.87.2`, `setup/js/temporary_id.cjs`). Quoting is
 *      the narrowest correct fix: `"issue":"#aw_task1"` → `"issue":"#42"`, which parses.
 *
 *   3. Unresolved references were undefined behavior. An `#aw_…` surviving substitution
 *      means that `create-issue` never landed. The checker now fails closed on it instead
 *      of coercing, skipping, or repairing it.
 *
 * The runtime limitation this suite deliberately encodes: safe outputs are applied in a
 * post-agent job, so an activation run has evidence only that a call was *accepted for a
 * specific target* — never the GitHub API result. "Accepted" is the strongest honest claim.
 * These tests fail on any summary language that claims verification the runtime cannot
 * provide, in either direction (over-claim or silent under-claim).
 *
 * Out of scope: operation-capacity policy (#1961) beyond compatibility, the broad
 * behavioral contract suite (#1960), checker distribution, post-activation implementation,
 * and E4 (#1958).
 */

import { afterAll, describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseRoster, validateBindings } from '../scripts/check-agent-binding.mjs';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const ONTOLOGY = join(WORKFLOWS_DIR, 'shared', 'squad-planning-ontology.md');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-activation-summary');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

/** Read a text file with line endings normalized to LF (Windows checkouts materialize CRLF). */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const workflow = readText(SQUAD_WORKFLOW);
const ontologyProse = readText(ONTOLOGY).replace(/\s+/g, ' ');

/** `squad-plan-activate` — the `/squad plan activate` path. Has an explicit end marker. */
const ACTIVATE_START = workflow.indexOf('## skill: `squad-plan-activate`');
const ACTIVATE_END = workflow.indexOf('## end skill: `squad-plan-activate`');
expect(ACTIVATE_START, '"## skill: `squad-plan-activate`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACTIVATE_END, '"## end skill: `squad-plan-activate`" is missing').toBeGreaterThan(ACTIVATE_START);
const activateSkill = workflow.slice(ACTIVATE_START, ACTIVATE_END);
const activateProse = activateSkill.replace(/\s+/g, ' ');

/**
 * `squad-plan-accept` — the recommended `/squad activate` fast path. It has no
 * `## end skill:` marker, so its body runs to the next `## skill:` heading.
 */
const ACCEPT_START = workflow.indexOf('## skill: `squad-plan-accept`');
const ACCEPT_END = workflow.indexOf('## skill: `squad-plan-revise`');
expect(ACCEPT_START, '"## skill: `squad-plan-accept`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACCEPT_END, '"## skill: `squad-plan-revise`" is missing from workflows/squad.md').toBeGreaterThan(ACCEPT_START);
const acceptSkill = workflow.slice(ACCEPT_START, ACCEPT_END);
const acceptProse = acceptSkill.replace(/\s+/g, ' ');

/** Both activation paths, so parity assertions cannot pass by covering only one. */
const BOTH_PATHS: ReadonlyArray<readonly [string, string]> = [
  ['/squad plan activate (squad-plan-activate)', activateProse],
  ['/squad activate fast path (squad-plan-accept)', acceptProse],
];

describe('gh-aw: activation summaries report accepted outcomes, not intent (#1963)', () => {
  it('routes both activation commands to the two skills this suite inspects', () => {
    // If routing moves, every parity assertion below is inspecting the wrong prose.
    expect(workflow).toContain('| `activate` | `squad-plan-accept` |');
    expect(workflow).toContain('| `plan activate` | `squad-plan-activate` |');
  });

  it.each(BOTH_PATHS)(
    '%s: refuses to treat a successful create-issue as label evidence',
    (_path, prose) => {
      expect(
        prose,
        'A summary that credits create-issue for a label reports work that may never have ' +
          'happened: create-issue silently drops label names the repository lacks (#1959). ' +
          'Each path must state that create-issue is not evidence.',
      ).toMatch(/A successful `create-issue` is \*\*not\*\* evidence/);
      expect(prose).toMatch(/`labels:` field cannot land a label on a fresh repository/);
    },
  );

  it.each(BOTH_PATHS)(
    '%s: conditions every reported label on an accepted add_labels call for that same issue',
    (_path, prose) => {
      expect(
        prose,
        'The reportable condition must be an accepted add_labels operation targeting the ' +
          'same issue — not a computed value, not another item\'s call.',
      ).toMatch(/`add_labels` call (?:that )?carr(?:ied|ying) that label(?: and targeting| and targeted)? that same issue|`add_labels` call carrying that label was accepted for that same issue/);
      expect(
        prose,
        'Targeting must name both forms: temporary ID for a created issue, verified real ' +
          'number for a reused one.',
      ).toMatch(/by its own `temporary_id`, or by its verified real number for a reused issue/);
    },
  );

  it('removes the create-issue attribution that Label Pre-flight Step 8 used to license', () => {
    // The exact pre-#1963 sentence. Its survival anywhere means the over-claim is still
    // reachable, regardless of what was added elsewhere.
    expect(
      activateProse,
      'Label Pre-flight Step 8 previously allowed naming a label once "that issue\'s ' +
        'create-issue call returned successfully carrying it". That is the root over-claim.',
    ).not.toMatch(/`create-issue` call returned\s*successfully carrying it/);
    expect(activateProse).not.toMatch(/create-issue` call returned successfully carrying it/);
  });

  it.each(BOTH_PATHS)(
    '%s: claims acceptance only, never verification the runtime cannot provide',
    (_path, prose) => {
      expect(
        prose,
        'Safe outputs are applied after the agent turn. A run that says it verified or ' +
          'confirmed a label on the issue is claiming observability gh-aw does not offer.',
      ).toMatch(/never write that a label was (?:"verified", "confirmed on the issue", or\s*"checked"|verified, confirmed, or checked)/);
      expect(prose).toMatch(/nothing here reads labels back/);
    },
  );

  it.each(BOTH_PATHS)('%s: rejects under-claiming as well as over-claiming', (_path, prose) => {
    expect(
      prose,
      'Reporting an omission for an item whose add_labels call was accepted manufactures a ' +
        'defect that did not occur — the mirror image of the over-claim, equally wrong.',
    ).toMatch(/never (?:report an accepted operation as an omission|emit the heading for an owner that\s*\*did\* become an accepted label)/);
  });

  it.each(BOTH_PATHS)(
    '%s: still requires the Non-roster agent values heading when an owner got no label',
    (_path, prose) => {
      // Preserved from the base stack. #1963 must not weaken it while tightening the
      // positive direction.
      expect(prose).toMatch(/`Non-roster agent values` heading is \*\*required\*\*/);
      expect(prose).toMatch(/naming the value and\s*the issue it applied to|naming the value\s*and the issue it applied to/);
      expect(prose).toMatch(/reports a\s*clean run that did not happen/);
    },
  );
});

describe('gh-aw: Activation bindings carry resolvable issue references (#1963)', () => {
  it('replaces the bare created-issue-number placeholders that produced invalid JSON', () => {
    expect(
      workflow,
      'A bare number placeholder cannot be satisfied: the agent never learns a created ' +
        "issue's real number during its turn.",
    ).not.toContain('"issue":{created task issue number}');
    expect(workflow).not.toContain('"epic_issue":{created epic issue number}');
  });

  it('specifies both binding references as quoted JSON strings', () => {
    expect(activateSkill).toContain('"issue":"{task issue reference}"');
    expect(activateSkill).toContain('"epic_issue":"{epic issue reference}"');
    expect(activateProse).toMatch(/`issue` and `epic_issue` are \*\*JSON strings\*\*, never bare numbers/);
  });

  it('names invalid JSON as the reason quoting is mandatory, not style', () => {
    expect(
      activateProse,
      'Without the reason stated, a future edit "simplifies" the quotes away and silently ' +
        'breaks every bindings block.',
    ).toMatch(/\*\*The quoting is load-bearing\.\*\*/);
    expect(activateProse).toMatch(/it does not skip fenced code blocks/);
    expect(activateProse).toMatch(/`"issue":#aw_task1` becomes `"issue":#42`, which is invalid JSON/);
    expect(activateProse).toMatch(/`"issue":"#aw_task1"` becomes `"issue":"#42"`, which parses/);
  });

  it('uses temporary IDs for created items and verified real numbers for reused ones', () => {
    expect(activateProse).toMatch(/\*\*Created this run:\*\* that item's own `temporary_id`, quoted/);
    expect(activateProse).toMatch(/\*\*Reused or pre-existing\*\*[^.]*its verified real\s*number in the same quoted form/);
    expect(
      activateProse,
      'Inventing a number for a created issue is the failure mode this whole design avoids.',
    ).toMatch(/never a real number\s*for an issue this run created/);
    expect(activateProse).toMatch(/never infer an issue number/);
  });

  it('treats a surviving temporary ID as a failure rather than repairing it', () => {
    expect(activateProse).toMatch(/was never resolved — that `create-issue` did\s*not land/);
    expect(activateProse).toMatch(/Leave it rather than repairing it by hand/);
  });

  it('documents the same reference and label contract in the shared ontology', () => {
    // The ontology is the artifact contract the deterministic checker consumes; a rule
    // stated only in the skill body is invisible to that consumer's spec.
    expect(ontologyProse).toMatch(/\*\*Issue references are quoted strings, never bare numbers\.\*\*/);
    expect(ontologyProse).toMatch(/it does not skip fenced code\s*blocks/);
    expect(ontologyProse).toMatch(/\*\*Reported labels mean accepted label operations\.\*\*/);
    expect(ontologyProse).toMatch(/It does not assert the label was\s*observed on the issue/);
    expect(ontologyProse).toMatch(/consumers MUST treat it as a failure rather than skipping or repairing it/);
  });
});

describe('post-activation checker resolves binding references and fails closed (#1963)', () => {
  const roster = parseRoster(`
## Members
| Name | Role |
|------|------|
| Kint | Lead |
`);

  function binding(issue: unknown, epicIssue: unknown) {
    return {
      task: '1',
      issue,
      epic: '2.1',
      epic_issue: epicIssue,
      agent: 'Kint',
      epic_agents: ['kint'],
      label: 'squad:kint',
      epic_label: 'squad:kint',
    };
  }

  function activated(bindings: object[]) {
    return {
      squad_artifact: 'activated',
      schema_version: '1',
      origin_issue: 1,
      phases: [],
      bindings,
    };
  }

  const presentLabels = new Map([
    [42, new Set(['squad', 'squad:kint'])],
    [43, new Set(['squad', 'squad:kint'])],
  ]);

  it('accepts the resolved quoted form gh-aw substitution produces', () => {
    // '"issue":"#aw_task1"' becomes '"issue":"#42"' after substitution — the shape the
    // checker actually receives in production.
    const result = validateBindings(activated([binding('#42', '#43')]), roster, presentLabels);
    expect(result).toMatchObject({ skipped: false, checked: 1, epics: 1 });
  });

  it('still accepts bare integers, so artifacts written before this contract validate', () => {
    const result = validateBindings(activated([binding(42, 43)]), roster, presentLabels);
    expect(result).toMatchObject({ skipped: false, checked: 1 });
  });

  it('fails closed on an unresolved temporary ID instead of skipping or coercing it', () => {
    expect(
      () => validateBindings(activated([binding('#aw_task1', '#43')]), roster, presentLabels),
      'A surviving temporary ID means that create-issue never landed. Silently skipping it ' +
        'would report a clean activation for an issue that does not exist.',
    ).toThrow('unresolved temporary ID');
  });

  it('fails closed on an unresolved epic reference too', () => {
    expect(() => validateBindings(activated([binding('#42', '#aw_epic1')]), roster, presentLabels))
      .toThrow('unresolved temporary ID');
  });

  it('rejects a reference that is neither a number nor a resolvable reference', () => {
    // Cross-repo substitution yields `owner/repo#42`; Squad activates same-repo only, so
    // that form means something went wrong upstream. Reject rather than parse loosely.
    expect(() => validateBindings(activated([binding('other/repo#42', '#43')]), roster, presentLabels))
      .toThrow('binding has no valid issue number');
    expect(() => validateBindings(activated([binding('', '#43')]), roster, presentLabels))
      .toThrow('binding has no valid issue number');
  });

  it('keeps per-item correspondence across resolved references', () => {
    // Two tasks in one epic, distinct issues: a checker that resolved references sloppily
    // could collapse them and pass a duplicate.
    const two = [
      { ...binding('#42', '#43'), task: '1' },
      { ...binding('#42', '#43'), task: '2' },
    ];
    expect(() => validateBindings(activated(two), roster, presentLabels))
      .toThrow('duplicate binding');
  });
});

// ---------------------------------------------------------------------------
// Compiled-artifact verification
// ---------------------------------------------------------------------------
//
// The prose assertions above lock the reporting contract. This section proves the
// workflow carrying it still strict-compiles and that the safe outputs the contract
// depends on stay wired. Fails closed (never skips) per this repo's #1833/#1834
// convention: an unmeasured contract is indistinguishable from a violated one.

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install github/gh-aw` (matches .github/workflows/squad-ci.yml). This ' +
  'gate fails closed rather than skipping: an unmeasured contract is indistinguishable ' +
  'from a violated one (#1834).';

describe('gh-aw: the activation summary contract compiles in strict mode (#1963)', () => {
  let compiledLock: string | null = null;

  function lockText(): string {
    if (compiledLock !== null) return compiledLock;

    const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) {
      throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    }

    mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
    const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'activation-summary-'));
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    // gh-aw resolves cross-workflow references against a `.github/workflows/` directory
    // relative to the compiled file. This repo ships gh-aw *source* from a top-level
    // `workflows/` dir; consumers install it via `gh aw add`. Mirror that layout.
    cpSync(WORKFLOWS_DIR, join(workspace, '.github', 'workflows'), { recursive: true });
    execFileSync(
      'gh',
      ['aw', 'compile', '.github/workflows/squad.md', '--strict', '--approve', '--no-check-update'],
      { cwd: workspace, encoding: 'utf8', stdio: 'pipe' },
    );

    const lockPath = join(workspace, '.github', 'workflows', 'squad.lock.yml');
    if (!existsSync(lockPath)) {
      throw new Error(
        'gh aw compile produced no squad.lock.yml — the compiled artifact this gate ' +
          `inspects is absent, so the contract is unmeasured. ${GH_AW_INSTALL_HINT}`,
      );
    }
    compiledLock = readText(lockPath);
    return compiledLock;
  }

  it('strict-compiles the workflow carrying the reporting contract', () => {
    expect(lockText().length).toBeGreaterThan(0);
  });

  it('keeps add_labels callable — the only operation a reported label may cite', () => {
    expect(lockText()).toMatch(/"tools":\[[^\]]*"add_labels"[^\]]*\]/);
  });

  it('keeps temporary-ID substitution reachable for the quoted binding references', () => {
    // Quoted `#aw_…` references only resolve because create_issue requires a temporary ID
    // and gh-aw rewrites references to it. Without this, every binding stays unresolved.
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"create_issue":\{[^}]*"require_temporary_id":true/);
  });

  it('leaves label writes in the safe-output job, which is why "accepted" is the honest claim', () => {
    // The agent job holds only `issues: read`; a separate post-agent job performs the
    // write. That job boundary is precisely why no summary may claim a verified GitHub
    // result — the agent turn ends before any label is applied.
    const compiled = lockText();
    const agentJobAt = compiled.indexOf('\n  agent:\n');
    const safeOutputsJobAt = compiled.indexOf('\n  safe_outputs:\n');
    expect(agentJobAt, '"agent:" job is missing from the compiled lock file').toBeGreaterThan(-1);
    expect(safeOutputsJobAt, '"safe_outputs:" job is missing from the compiled lock file').toBeGreaterThan(agentJobAt);

    const permsMatch = compiled.slice(agentJobAt, safeOutputsJobAt).match(/permissions:\n((?:\s{6}\S.*\n)+)/);
    expect(permsMatch, 'agent job permissions block not found').not.toBeNull();
    const permsBlock = permsMatch ? permsMatch[1] : '';
    expect(permsBlock).toContain('issues: read');
    expect(permsBlock).not.toContain('issues: write');
  });
});
