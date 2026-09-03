# Decisions

> Team decisions that all agents must respect. Managed by Scribe.


---

### Type safety — strict mode non-negotiable
**By:** CONTROL (formerly Edie)
**What:** `strict: true`, `noUncheckedIndexedAccess: true`, no `@ts-ignore` allowed.
**Why:** Types are contracts. If it compiles, it works.

### Hook-based governance over prompt instructions
**By:** RETRO (formerly Baer)
**What:** Security, PII, and file-write guards are implemented via the hooks module, NOT prompt instructions.
**Why:** Prompts can be ignored. Hooks are code — they execute deterministically.

### Node.js >=20, ESM-only, streaming-first
**By:** GNC (formerly Fortier)
**What:** Runtime target is Node.js 20+. ESM-only. Async iterators over buffers.
**Why:** Modern Node.js features enable cleaner async patterns.

### Casting — Apollo 13, mission identity
**By:** Squad Coordinator
**What:** Team names drawn from Apollo 13 / NASA Mission Control. Scribe is always Scribe. Ralph is always Ralph. Previous universe (The Usual Suspects) retired to alumni.
**Why:** The team outgrew its original universe. Apollo 13 captures collaborative pressure, technical precision, and mission-critical coordination — perfect for an AI agent framework.

### Proposal-first workflow
**By:** Flight (formerly Keaton)
**What:** Meaningful changes require a proposal in `docs/proposals/` before execution.
**Why:** Proposals create alignment before code is written.

### Tone ceiling — always enforced
**By:** PAO (formerly McManus)
**What:** No hype, no hand-waving, no claims without citations.
**Why:** Trust is earned through accuracy, not enthusiasm.

### Zero-dependency scaffolding preserved
**By:** Network (formerly Rabin)
**What:** CLI remains thin. Zero runtime dependencies for the CLI scaffolding path.
**Why:** Users should be able to run `npx` without downloading a dependency tree.

### Merge driver for append-only files
**By:** Squad Coordinator
**What:** `.gitattributes` uses `merge=union` for `.squad/decisions.md`, `agents/*/history.md`, `log/**`, `orchestration-log/**`.
**Why:** Enables conflict-free merging of team state across branches.

### Interactive Shell as Primary UX
**By:** Brady
**What:** Squad becomes its own interactive CLI shell. `squad` with no args enters a REPL.
**Why:** Squad needs to own the full interactive experience.

### Root Cause Analysis

Three factors combine to create the VS Code routing failure. Ranked by dominance:

#### 1. 🔴 CLI-Centric Enforcement Language (DOMINANT)

The routing constraint is expressed exclusively in CLI terms. The CRITICAL RULE references `task` tool only. When the coordinator reads this in VS Code, where the tool is `runSubagent`, it doesn't reliably make the substitution. It falls through to Platform Detection's Fallback mode: 'work inline.' This enforcement language creates a logical gap.

#### 2. 🟡 Prompt Saturation (AMPLIFYING)

The coordinator prompt is 950 lines / ~80KB. The routing constraint is buried at line 1010 under irrelevant sections (Init Mode, ceremonies, Ralph work monitor, worktree lifecycle). The core dispatch loop accounts for ~200 lines, competing for attention with ~750 lines of governance and reference material.

#### 3. 🟡 Template Duplication (AMPLIFYING)

CLI 1.0.11 discovers all \*.agent.md\ files from cwd to git root. Squad has 5 copies: .squad-templates, templates/, packages/squad-cli/templates, packages/squad-sdk/templates, and .github/agents/. Only .github/agents/ should be discoverable. CLI 1.0.11 merges ALL of them, multiplying the coordinator instructions by 5x and diluting the routing constraint.

### Proposed Fixes

**Fix 1: Platform-Neutral Enforcement Language (P0)**
- Rewrite CRITICAL RULE to be platform-neutral: 'You are a DISPATCHER, not a DOER. Every task that needs domain expertise MUST be dispatched to a specialist agent.'
- List dispatch mechanisms: CLI (`task` tool), VS Code (`runSubagent` tool), or fallback (work inline)
- Update anti-patterns and constraints sections with same substitution

**Fix 2: Top-and-Bottom Reinforcement (P0)**
- Add reinforcement block at end of prompt (LLMs weight beginning/end more heavily than middle)
- Emphasize: Squad ROUTES, it does not BUILD. Do not produce domain artifacts inline.

**Fix 3: Prompt Slimming — Move to Lazy-Loaded References (P1)**
- Extract ~350 lines (~37%) to lazy-loaded templates: worktree-reference.md, ralph-reference.md, casting-reference.md, mcp-reference.md
- Reduce from 950→600 lines, making routing constraint a larger percentage of total prompt

**Fix 4: Template File Renaming (P1)**
- Rename template copies to .template extension to prevent CLI 1.0.11 discovery
- Update sync-templates.mjs and squad-cli/squad-sdk init code to reference new filenames

**Fix 5: VS Code-Specific Hardening Block (P1)**
- Move VS Code adaptations section higher (from line 458 to immediately after CRITICAL RULE)
- Restructure as active enforcement block with platform detection table
- Make clear: if `runSubagent` is available, it MUST be used for domain work

### Priority Ordering

| Priority | Fix | Impact | Effort | Ships In |
|---|---|---|---|---|
| **P0** | Fix 1: Platform-neutral enforcement | 🔴 Directly closes logical gap | Low | Next patch |
| **P0** | Fix 2: Top-and-bottom reinforcement | 🔴 Exploits LLM attention patterns | Trivial | Next patch |
| **P1** | Fix 4: Template file renaming | 🟡 Eliminates 4x duplication | Medium | Next minor |
| **P1** | Fix 3: Prompt slimming | 🟡 Reduces 950→600 lines | Medium | Next minor |
| **P1** | Fix 5: VS Code hardening block | 🟡 Makes VS Code dispatch prominent | Low | Next minor |

**Ship order:** Fix 1 + Fix 2 together (one PR, immediate). Fix 4 next (requires code changes). Fix 3 + Fix 5 together (prompt restructure PR).

### Validation

After implementing, test with Andreas's reproduction case:
1. Open VS Code with squadified project
2. Ask coordinator to do domain work that matches routing rule
3. Verify: coordinator dispatches via `runSubagent` instead of working inline
4. Verify: coordinator cites the routing rule when dispatching

FIDO should own the test scenario. GUIDO should validate the VS Code runtime behavior.

### Open Questions

1. Does CLI 1.0.11 support exclusion patterns (.copilotignore)? If yes, Fix 4 becomes simpler.
2. Should we version-gate the VS Code adaptations (detect CLI version)?
3. Is `runSubagent` still the correct tool name, or has it changed?
---

### Files Updated
1. `.squad/skills/release-process/SKILL.md` (team-level skill)
2. `.copilot/skills/release-process/SKILL.md` (copilot-level skill)
3. `.squad/agents/booster/history.md` (learnings log)

### New Knowledge Added

| Issue | Root Cause | Fix PR | Skill Section |
|-------|-----------|--------|---------------|
| Root package.json version drift | squad-release.yml reads from root, not sub-packages | #1043 | Known Gotchas + v0.9.4 Incident Learnings |
| CHANGELOG missing `## [$VERSION]` | Workflow validates version entry exists | #1042 | Known Gotchas + Release Checklist |
| Lockfile integrity check rejects workspace packages | Check didn't filter for registry-only packages | #1044 | Known Gotchas + Common Failure Modes |
| GITHUB_TOKEN can't trigger downstream workflows | GitHub security feature prevents event propagation | N/A (design) | GITHUB_TOKEN section + Manual Publish |
| Prebuild bump breaks workspace linking | bump-build.mjs mutates versions breaking exact match | N/A (known) | Local Development section |

### Cross-References
- Added bidirectional cross-references between team-level and copilot-level skill files
- Added PR references (#1042, #1043, #1044) as source evidence throughout

#### Rationale

These are high-impact, recurring failure modes. Documenting them in the skill files ensures every agent (human or AI) working on releases has the knowledge to avoid repeating the v0.9.4 delays. The GITHUB_TOKEN limitation in particular is non-obvious and would catch any future release.

### 2026-08-22: gh-aw Tier 2 triage — workflow generation
**By:** Booster (CI/CD), requested by bradygaster
**What:** Labeled #1556 as `workflows`, `type:bug`, `priority:p1`, `wave:1-next`, `squad:booster`, `triaged`, `go:spec-ready`; labeled #1493 as `workflows`, `type:bug`, `priority:p1`, `wave:1-next`, `squad:booster`, `triaged`, `go:spec-ready`; labeled #1502 as `workflows`, `type:rfc`, `priority:p2`, `wave:2-soon`, `squad:booster`, `triaged`, `go:needs-research`. Posted crash-proof triage briefs on all three. PR #1709 partially addresses #1493 with a `.local-backup` preservation path and green-but-stale checks; recommendation is request changes for user-facing docs and a rebase/rerun before merge. #1827 is genuinely separate from #1556: #1827 is gh-aw `.lock.yml` compiler/actionlint schema output from `workflows/*.md`, while #1556 is conventional YAML templates copied by `squad upgrade`; they share only the generated-YAML linting theme.
**Why:** The implementation surfaces are easy to confuse. `workflows/*.md` and `workflows/shared/*.md` are gh-aw source files that compile to lock files, while #1493/#1556/#1502 primarily target CLI/SDK conventional workflow templates under `packages/squad-cli/templates/workflows/`, `packages/squad-sdk/templates/workflows/`, and the upgrade/generator code that writes `.github/workflows/*.yml`. #1502 spans configuration design, SDK parity, and checkout security validation, so it needs an RFC/design pass before implementation. #1493 already has PR #1709, but the issue acceptance includes docs; stale CI should be refreshed rather than treated as a genuine failure.

---

### 2026-08-22: `.squad/` must not be gitignored

**By:** bradygaster (via Copilot)

**What:** The `.squad/` folder must not be hidden from git. Team state — decisions,
history, logs, orchestration records, casting, archives — is authoritative project data
and belongs in version control.

**Standing rule:** No Squad command may write `.squad/` into any git ignore surface
(`.gitignore`, `.git/info/exclude`, or global excludes).

**Why:** Two independent mechanisms were hiding it, and the second caused real data loss.

1. **`.git/info/exclude` pollution (#1826, #1817).** `squad consult` writes `.squad/` and
   `.github/agents/squad.agent.md` to the exclude file
   (`packages/squad-sdk/src/sharing/consult.ts:447`). It resolves the path with
   `git rev-parse --git-path info/exclude`, which from *any* worktree returns the shared
   common dir — verified as `C:/src/squad/.git/info/exclude`. One consult run therefore
   poisons the main checkout and every sibling worktree simultaneously.

   The failure is silent and progressive: files already tracked stay tracked, so the repo
   looks healthy, while every *new* `.squad/` file becomes invisible.

2. **`.gitignore` entries (#1823).** `.squad/log/`, `.squad/orchestration-log/`,
   `.squad/decisions/inbox/`, and `.squad/sessions/` are ignored repo-wide, which is why
   Scribe logging has never worked in a clean clone.

**Data loss recovered:** Removing the exclude entries surfaced
`.squad/archive/2026-08-20-decisions-archive.md` (7,513 bytes, 6 decision entries) and
`.squad/agents/sims/history.md`, both untracked since 2026-08-20. Spot-checking three
archived entries — "Copilot git safety rules", "Dispatch Enforcement — Stop Coordinator
From Doing Domain Work Inline", and "Workflow templates linted via explicit actionlint
file paths" — confirmed none are present in the tracked `.squad/decisions.md`. They
existed only on one machine and would not have survived a clean clone.

This is precisely the failure the Scribe ARCHIVAL SAFETY RULES describe: moving content
into an untracked destination is a deletion, not an archive (#1774, #1783, #1760).

**Standing corollary:** Scribe must verify an archival destination is tracked
(`git ls-files --error-unmatch <dest>`) before moving any content into it.

**Follow-on risk:** `.squad/decisions.md` is 51,819 bytes, over the 51,200-byte hard gate.
The next Scribe run will attempt archival again and will repeat the loss unless the ignore
surfaces are fixed first.

---

### 2026-08-22: gh-aw Tier 1 triage — false-green cluster
**By:** Flight (Lead), requested by bradygaster
**What:** Keep #1801 and #1812 independent: #1801 owns the validation/template false-green and deterministic artifact checks; #1812 owns `plan activate` reading/reporting the wrong roster. Do not absorb #1801 into #1757. Re-scope #1757 to the later adversarial-quality pass after #1801's deterministic gate repair lands.
**Why:** The shared thesis is "success and no-op are indistinguishable without independent verification," but the repair surfaces differ. E4 showed `plan validate` can read `.squad/team.md` correctly while `plan activate` reports the default `lead/reviewer/devrel/security/docs` roster, so #1812 is stage-local and not blocked by #1801. #1801 is a concrete bug with a red-today check: literal pre-filled verdict cells and fail-open parsing. #1757 remains valuable, but it is broader product behavior; mixing it with #1801 would let subjective adversarial prompting mask a deterministic gate that must fail against recorded bad artifacts.

---

### 2026-08-22: gh-aw Tier 3 triage — /squad review epic sequencing
**By:** Procedures (Prompt Engineer), requested by bradygaster
**What:** Sequenced the /squad review chain as #1730 + #1731 → #1733 → #1734 → #1736, with #1735 optional after #1733. Kept the epic and phase issues in wave:3-later because none of the Tier 1 false-green work depends on /squad review landing first. Marked #1734, and enforcement-facing #1736 work, as blocked on #1824, #1812, #1801, #1822, #1827, and #1825. Prompt-budget projection: only #1730 should add router text to workflows/squad.md, estimated +1–2 KB over the current 62,398 B, leaving roughly 35.6–36.6 KB under the 100 KB ceiling.
**Why:** A required review check would be unsafe while gh-aw still has known success/no-op ambiguity: green no-op cast, false provenance, pre-filled validation ✅, dead runbook queries, invalid generated .lock.yml, and silent CLI pin drift. Keeping review advisory until those land avoids creating a permanently red or blind gate, which would be equivalent to no gate. The prompt budget stays viable only if review and remediation remain separate workflows rather than being folded into the monolithic router prompt.

---

### 2026-08-22: CRLF working-tree repair (#1793)
**By:** EECOM (Core Dev), requested by bradygaster

**What:** Two additions plus one shared detector.

- **Remediation command:** `npm run fix:crlf` (`node scripts/fix-crlf-worktree.mjs`). It finds every path pinned `eol=lf` whose working file is `w/crlf`, excludes any path with a real content difference from the index, rewrites the rest with `git checkout-index -f`, then **re-measures** and reports anything that survived.
- **Doctor rule:** `working tree line endings` in `squad doctor` — fails when any `eol=lf`-pinned file is CRLF on disk, names the files, and prints the repair command. Returns `undefined` (not applicable) outside a git repo or when nothing is pinned.
- **Shared detector:** `listWorktreeCrlf` / `listContentModified` exported from the existing `scripts/check-shebang-eol.mjs`, which already owns this invariant family, rather than a third parallel implementation.

**Why this shape over a repo-wide renormalize:**

- `git add --renormalize .` rewrites the **index**, which is the opposite side of the defect — the files on disk are the problem, and their blobs are already correct. It would also sweep 95 CRLF-storing `.ts` blobs into one line-ending churn commit, which `.gitattributes` documents as a deliberate exclusion. The repair must produce **no commit at all**; it is something a developer runs locally.
- `git checkout -- <path>` is not sufficient. In this state the file is content-clean: git's checkin filter normalizes the CRLF away, so the cleaned blob equals the index blob exactly (verified — identical SHAs, empty `git diff`). Git therefore has nothing to restore and can no-op, which is precisely why the condition is so durable. `git checkout-index -f` writes from the index unconditionally and is the primitive that actually repairs it. It is safe here only because it is gated on "no content difference".
- The working-tree invariant is **deliberately not wired into `scripts/check-shebang-eol.mjs`'s CI gate.** CI always has a fresh checkout, so a working-tree assertion there could never observe the failure it exists to catch — a permanently green gate is equivalent to no gate (per the 2026-08-20 test bar). The condition is local-only by nature, so it belongs in `squad doctor`, which runs on the developer's actual disk.

**Verification (the check was proven capable of failing):** with the three files from #1793 forced to CRLF, `squad doctor` reported `❌ 3 of 173 LF-pinned file(s) still have CRLF on disk` and the three suites collapsed from 29 tests to 6 (5 failed). After `npm run fix:crlf`: `w/crlf` count 0 of 41, doctor `✅ 173 LF-pinned file(s) all LF on disk`, and 29/29 tests passing.

**Incidental finding, not fixed here:** `npm run build` dirties the tree as a side effect — `scripts/bump-build.mjs` bumps all three `package.json` versions (suppress with `SKIP_BUILD_BUMP=1`) and `scripts/sync-skill-templates.mjs` rewrites two `templates/skills/release-process/SKILL.md` files. Both are real content diffs, not CRLF phantoms, so `git diff --ignore-cr-at-eol` does not filter them and they are easy to stage by accident.

#### Addendum, 2026-08-22 (post-review, FIDO on #1831)

Approved with nits; one changed the reasoning enough to record.

**A verification hint can be under-scoped relative to the check it accompanies — and that is the same failure mode as a gate that cannot fail.** The doctor check covers every `eol=lf`-pinned path (174 here), but both remediation messages told the developer to verify with `git ls-files --eol "*.mjs"` (42 paths). A pinned non-`.mjs` file left CRLF would have reported all-clear. The check was correct; the sentence telling you how to confirm it was not, and the sentence is what a developer actually acts on. The 2026-08-20 test bar says a gate that cannot observe failure is equivalent to no gate — this extends it: **the instructions a gate prints are part of the gate.** Both hints now point at the check's real scope, and a test asserts the message does not silently re-narrow.

Two smaller carry-overs, both about claiming only what is true:
- Hardcoded counts drift. The CRLF-storing `.ts` blob figure measured **94** at review time; `.gitattributes:38` still says 95, and my own docs said 173/41 where the tree now reads 174/42 (this PR adds one `.mjs`). Prefer describing a quantity over pinning it unless the exact number is load-bearing. `.gitattributes` left alone deliberately — correcting its comment is unrelated churn.
- `fix-crlf-worktree.mjs` batches by **file count**, which bounds argv length only indirectly. Measured rather than assumed: longest tracked path is 80 chars, so a full 200-file batch is ~16K against the 32767 Windows limit, and overflow would need a ~164-character mean path. Explicit length accounting declined, and the comment now says so instead of implying a guarantee.

Both deliberate non-actions stand: no `git add --renormalize`, no CI gate.

---

### 2026-08-22: Gate instructions are part of the gate
**By:** Scribe, from EECOM/FIDO #1793/#1831
**Extends:** 2026-08-20: Test bar for the gh-aw workstream — a test must fail against the pre-fix state

**What:** The instructions a gate prints are part of the gate. A correct check paired with a remediation or verification command that cannot observe the failure is still a broken gate, because the printed command is what a developer actually runs.

**Concrete instance:** `squad doctor`'s working-tree check counted all 174 `eol=lf`-pinned paths, but printed `git ls-files --eol "*.mjs"` — which covers only 42 of them. A pinned non-`.mjs` file left CRLF would have verified all-clear.

**Why:** Verification and remediation hints must cover the same artifact set as the check. Otherwise the team has built a check that can fail while teaching developers to run a narrower command that proves nothing.


---

