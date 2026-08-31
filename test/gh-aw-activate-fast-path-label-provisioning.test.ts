/**
 * Fresh-repo label provisioning for the recommended `/squad activate` fast path (#1959).
 *
 * Parent: #1957. Depends on #1962 (`gh-aw-activation-temporary-ids.test.ts`), which
 * established the temporary-ID targeting pattern for the full `/squad plan activate`
 * path and enabled workflow-global `require-temporary-id: true`.
 *
 * `/squad activate` routes to the `squad-plan-accept` skill. When only a flat `plan`
 * artifact exists (no `program`/`implementation`), it takes its own fast path with its
 * own `create-issue` calls. #1955 fixed provisioning in `squad-plan-activate` only, and
 * #1962 added just enough temporary-ID compliance here to survive the new global flag —
 * so on a fresh repository the fast path still leaned on `create-issue`'s `labels:`
 * field, which GitHub silently drops for label names that do not already exist.
 *
 * This suite locks in the fast path's own copy of the verified pattern:
 *   - every fast-path `create-issue` still carries a unique temporary ID (#1962's
 *     compliance edit is preserved, not regressed)
 *   - `add_labels` is called in the same turn, targeting that call's temporary ID
 *   - `item_number` is mandatory, with the silent triggering-issue fallback named
 *   - reused/pre-existing issues are targeted by verified real numbers instead
 *   - base `squad`, single certified owner, `@copilot`, multi-owner, and non-roster
 *     behavior stays at parity with `squad-plan-activate`
 *   - the origin intent issue is never an `add_labels` target
 *   - reruns stay idempotent
 *
 * Out of scope: activation-result reporting redesign (#1963), operation-capacity policy
 * (#1961), the broad behavioral suite (#1960), checker distribution, and E4 (#1958).
 */

import { afterAll, describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-fast-path-labels');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

/** Read a text file with line endings normalized to LF (Windows checkouts materialize CRLF). */
function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const workflow = readText(SQUAD_WORKFLOW);

/**
 * Isolate the `squad-plan-accept` skill body — the fast path `/squad activate` routes to.
 * It has no `## end skill:` marker of its own, so its body runs to the next `## skill:`
 * heading (`squad-plan-revise`).
 */
const ACCEPT_START = workflow.indexOf('## skill: `squad-plan-accept`');
const ACCEPT_END = workflow.indexOf('## skill: `squad-plan-revise`');
expect(ACCEPT_START, '"## skill: `squad-plan-accept`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACCEPT_END, '"## skill: `squad-plan-revise`" is missing from workflows/squad.md').toBeGreaterThan(ACCEPT_START);
const acceptSkill = workflow.slice(ACCEPT_START, ACCEPT_END);

/** Whitespace-collapsed view for prose assertions that may span wrapped lines. */
const acceptProse = acceptSkill.replace(/\s+/g, ' ');

/** The `squad-plan-activate` body, used only for path-parity comparisons. */
const ACTIVATE_START = workflow.indexOf('## skill: `squad-plan-activate`');
const ACTIVATE_END = workflow.indexOf('## end skill: `squad-plan-activate`');
expect(ACTIVATE_START, '"## skill: `squad-plan-activate`" is missing from workflows/squad.md').toBeGreaterThan(-1);
expect(ACTIVATE_END, '"## end skill: `squad-plan-activate`" is missing').toBeGreaterThan(ACTIVATE_START);
const activateProse = workflow.slice(ACTIVATE_START, ACTIVATE_END).replace(/\s+/g, ' ');

describe('gh-aw: /squad activate fast path provisions labels on a fresh repo (#1959)', () => {
  it('routes `/squad activate` to squad-plan-accept, so this skill is the fast path', () => {
    // If routing ever moves, every assertion below is inspecting the wrong skill.
    expect(workflow).toContain('| `activate` | `squad-plan-accept` |');
    expect(workflow).toContain('| `/squad activate` | Activate (recommended fast-path) |');
  });

  it('names the root cause: create-issue labels: cannot create a missing label', () => {
    expect(
      /GitHub silently drops label names that do not already exist/i.test(acceptProse),
      "The fast path must state why create-issue's own labels: field is insufficient — " +
        'GitHub drops unknown label names on POST /issues rather than creating them. ' +
        'Without this the model has no reason to make the extra add_labels call.',
    ).toBe(true);
    expect(acceptProse).toMatch(/`create-issue`'s (own )?`labels:` field (alone )?cannot/i);
  });

  it('declares add_labels with create-if-missing as the provisioning mechanism', () => {
    expect(acceptSkill).toContain('add_labels');
    expect(acceptSkill).toContain('create-if-missing');
    expect(acceptProse).toMatch(/`add-labels` safe output \(`allowed: \[squad, "squad:\*"\]`, `create-if-missing: true`\)/);
    expect(
      /fresh repository/i.test(acceptProse),
      'The fresh-repository case is the entire point of #1959 and must be named explicitly.',
    ).toBe(true);
  });

  it('calls add_labels in the same turn as each create-issue call', () => {
    expect(acceptProse).toMatch(/In the same turn as each `create-issue` call in Step 2, call `add_labels`/i);
    // The per-item bullet must carry the instruction too, not just the section prose,
    // so a model reading only the create-issue recipe still emits the label call.
    const labelApplication = acceptSkill.match(/^- Label application:.*$/m)?.[0] ?? '';
    expect(labelApplication, 'Step 2 needs a per-item "Label application:" bullet').not.toBe('');
    expect(labelApplication).toContain('add_labels');
    expect(labelApplication).toContain('item_number');
  });
});

describe('#1959: fast-path add_labels targets an explicit, verified item', () => {
  it('targets the minting create-issue call\'s own temporary ID', () => {
    expect(acceptProse).toMatch(
      /`item_number` — that same `create-issue` call's `temporary_id` \(`#aw_ph\{N\}` for a phase issue, `#aw_wi\{N\}` for a work item\)/i,
    );
    const labelApplication = acceptSkill.match(/^- Label application:.*$/m)?.[0] ?? '';
    expect(labelApplication).toMatch(/`item_number` set to this item's own temporary ID/i);
  });

  it('preserves #1962\'s minimal temp-ID compliance on every fast-path create-issue', () => {
    // Regression guard: #1962 enabled workflow-global require-temporary-id: true, which
    // rejects any create-issue call lacking one. #1959 must not weaken that.
    const tempIdBullet = acceptSkill.match(/^- Temporary ID:.*$/m)?.[0] ?? '';
    expect(tempIdBullet, 'Step 2 must keep its "Temporary ID:" bullet').not.toBe('');
    expect(tempIdBullet).toContain('require-temporary-id: true');
    expect(tempIdBullet).toContain('#aw_ph{N}');
    expect(tempIdBullet).toContain('#aw_wi{N}');
    expect(tempIdBullet).toContain('^#?aw_[A-Za-z0-9_]{3,12}$');
    expect(tempIdBullet).toMatch(/must not repeat within this run/i);
    // The phase-issue parent linkage from #1962 must still resolve via temporary ID.
    expect(acceptProse).toMatch(/pass its `#aw_ph\{N\}` temporary ID/i);
  });

  it('makes item_number mandatory and names the silent triggering-issue fallback', () => {
    expect(acceptProse).toMatch(/Every `add_labels` call MUST pass `item_number`/);
    expect(
      /Omitting it does not fail — it silently applies the labels to the \*\*triggering intent issue\*\*/i.test(
        acceptProse,
      ),
      'The hazard must be stated as a silent mislabel of the user\'s own issue, not a ' +
        'generic "always pass item_number" — the model needs the consequence to weigh it.',
    ).toBe(true);
    // Parity: squad-plan-activate states the identical hazard.
    expect(activateProse).toMatch(/silently labels the \*\*triggering intent issue\*\*/i);
  });

  it('forbids borrowing another item\'s temporary ID or labeling an uncreated item', () => {
    expect(acceptProse).toMatch(/Never reuse another item's temporary ID/i);
    expect(acceptProse).toMatch(
      /never emit `add_labels` for an item whose `create-issue` call was not made in this run/i,
    );
  });

  it('uses verified real numbers for reused or pre-existing issues', () => {
    expect(acceptProse).toMatch(
      /For an issue this run did \*\*not\*\* create — one recognized by Step 1a's idempotency check or matched by title — pass its verified real number instead/i,
    );
    expect(acceptProse).toMatch(/a temporary ID maps only issues this run created/i);
  });

  it('forbids predicting a returned issue number or waiting for one', () => {
    expect(acceptProse).toMatch(
      /`create-issue` returns no real issue number during this run, so never predict or infer one and never pause between the two calls waiting for one/i,
    );
    expect(acceptProse).toMatch(/`create-issue` first and `add_labels` immediately after is the supported order/i);
  });
});

describe('#1959: fast-path label sets stay at parity with squad-plan-activate', () => {
  it('applies the base squad label to every activated item', () => {
    expect(acceptProse).toMatch(/Work item: `squad`, plus `squad:\{owner\}`/);
    expect(acceptProse).toMatch(/Phase issue: `squad`, plus `squad:\{owner\}`/);
  });

  it('derives the member label from that row\'s own frozen certified Owner', () => {
    expect(acceptProse).toMatch(
      /derived from that row's own frozen certified `Owner`, lowercased/i,
    );
    expect(acceptProse).toMatch(
      /never inherit the phase issue's owner or carry the previous row's value forward/i,
    );
    // The Step 2 computation bullet must still name its certified binding source.
    const labelRule = acceptSkill.match(/^- Labels:.*$/m)?.[0] ?? '';
    expect(labelRule).toMatch(/frozen row `Owner` lowercased/i);
    expect(labelRule).toMatch(/only from that task's certified binding/i);
  });

  it('maps @copilot to squad:copilot, matching the full activation path', () => {
    expect(acceptProse).toMatch(/`@copilot` maps to the existing `squad:copilot` routing label — never `squad:@copilot`/);
    expect(activateProse).toMatch(/`@copilot` maps to the existing `squad:copilot` routing label — never `squad:@copilot`/);
    // The pre-mutation roster gate must not treat @copilot as an uncertified value,
    // or the mapping above would be unreachable.
    expect(acceptProse).toMatch(/the special value `@copilot` excepted/i);
  });

  it('gives a multi-owner phase issue only squad, and records the omission', () => {
    expect(acceptProse).toMatch(
      /only when every accepted row in that phase names one and the same owner/i,
    );
    expect(acceptProse).toMatch(
      /Two or more distinct owners is a multi-owner phase: apply only `squad`, choose none of them/i,
    );
    expect(acceptProse).toMatch(/record it under a `Non-roster agent values` heading/i);
    // Parity with the epic rule in squad-plan-activate.
    expect(activateProse).toMatch(/multi-owner epic: apply only `squad`/i);
  });

  it('keeps the pre-mutation stop as the fast path\'s non-roster contract', () => {
    // The fast path is stricter than squad-plan-activate here: it refuses to mutate at
    // all rather than creating an issue with an omitted label. That is preserved, and
    // it is why no uncertified value can reach add_labels.
    expect(acceptProse).toMatch(/stop before mutation and require `\/squad plan revise`/i);
    expect(acceptProse).toMatch(
      /An `Owner` that is neither a certified roster name nor `@copilot` already stopped this run before mutation/i,
    );
    expect(acceptProse).toMatch(/no uncertified value can ever reach `add_labels`/i);
  });

  it('never targets the triggering intent issue with an owner label', () => {
    expect(acceptProse).toMatch(
      /The triggering intent issue is never an `add_labels` target/i,
    );
    expect(acceptProse).toMatch(
      /It is the flat-plan parent, not an activated item, and receives no owner label from this run/i,
    );
  });

  it('keeps reruns idempotent', () => {
    expect(acceptProse).toMatch(
      /Re-applying an already-present label on a rerun is a no-op under add-only merge semantics/i,
    );
    expect(acceptProse).toMatch(/safe under Step 1a's idempotency path/i);
    // The pre-existing whole-plan idempotency contract must survive untouched.
    expect(acceptProse).toMatch(/\*\*Whole-plan idempotency:\*\* when `requested_phase` is null/i);
  });

  it('treats an auto-provisioned label\'s default color as expected, not a failure', () => {
    expect(acceptProse).toMatch(
      /auto-provisioned by `create-if-missing` on a fresh repository instead receives gh-aw's deterministic color and an empty description/i,
    );
    expect(acceptProse).toMatch(/that is expected, not a failure, and must not be reported as one/i);
  });

  it('reports labels actually applied, never merely intended', () => {
    expect(acceptProse).toMatch(
      /Report only the labels a successful `add_labels` call actually applied; never a label that was skipped, deferred, or merely intended/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Compiled-artifact verification
// ---------------------------------------------------------------------------
//
// The assertions above lock the prose contract. This section proves the fast path's
// calls are actually executable: `gh aw compile --strict` must expose add_labels and
// create_issue as tools, wire create_if_missing into the handler config, and keep
// #1962's require_temporary_id enforcement on. Fails closed (never skips) per this
// repo's #1833/#1834 convention: an unmeasured contract is indistinguishable from a
// violated one.

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install github/gh-aw` (matches .github/workflows/squad-ci.yml). This ' +
  'gate fails closed rather than skipping: an unmeasured contract is indistinguishable ' +
  'from a violated one (#1834).';

describe('gh-aw: the fast path\'s label calls compile and stay enforceable (#1959)', () => {
  let compiledLock: string | null = null;

  function lockText(): string {
    if (compiledLock !== null) return compiledLock;

    const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) {
      throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    }

    mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
    const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'fast-path-labels-'));
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    // gh-aw's dispatch-workflow validation resolves cross-workflow references against a
    // `.github/workflows/` directory relative to the compiled file. This repo ships the
    // gh-aw *source* from a top-level `workflows/` dir; consumers install it into
    // `.github/workflows/` via `gh aw add`. Mirror that real deployment layout.
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

  it('strict-compiles the workflow carrying the fast-path label calls', () => {
    expect(lockText().length).toBeGreaterThan(0);
  });

  it('keeps add_labels and create_issue callable together, so the fast path can pair them', () => {
    const compiled = lockText();
    expect(compiled).toMatch(/"tools":\[[^\]]*"add_labels"[^\]]*\]/);
    expect(compiled).toMatch(/"tools":\[[^\]]*"create_issue"[^\]]*\]/);
  });

  it('wires create_if_missing into the handler config the fast path relies on', () => {
    // gh-aw embeds this JSON config inside a double-quoted YAML env value with every
    // `"` backslash-escaped. De-escape before matching so this holds across versions.
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"add_labels":\{[^}]*"create_if_missing":true/);
    expect(compiled).toMatch(/"add_labels":\{[^}]*"allowed":\["squad","squad:\*"\]/);
  });

  it('keeps #1962\'s require_temporary_id enforcement on for the fast path\'s create_issue calls', () => {
    // require-temporary-id is workflow-global, enforced at the MCP tool layer from the
    // single create_issue config block — it covers squad-plan-accept's calls too.
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"create_issue":\{[^}]*"require_temporary_id":true/);
    expect(compiled).toMatch(/"required_field_additions":\s*\{\s*"create_issue":\s*\[\s*"temporary_id"\s*\]/);
  });

  it('leaves label writes in the safe-output job, not the agent job', () => {
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
