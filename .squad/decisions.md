# Decisions

> Team decisions that all agents must respect. Managed by Scribe.


---

### 2026-08-21: E4 conflict was add/add, not a divergence
**Date:** 2026-08-21
**Raised by:** Coordinator
**Status:** Decided

#### Context

The conflict on PR #1813 for `.squad/e2e/E4-agent-binding-verification.md` was an add/add, not a content divergence. The file did not exist at the merge base. `dev` added the procedure via #1791 with `⛔ NOT YET EXECUTED`; the branch added the same file updated to `✅ EXECUTED` with results.

#### Decision

Resolution kept the executed version plus dev's sibling files.

---

### 2026-08-21: Git plumbing merge pattern for dirty working trees
**Date:** 2026-08-21
**Raised by:** Sims / Coordinator
**Status:** Decided

#### Context

When CRLF normalization (or other `.gitattributes` fallout) makes the working tree dirty enough that `git merge` refuses to start, a conflict must be resolved via plumbing.

#### Decision

Established pattern:
1. `git merge-tree --write-tree` to analyse the merge and identify conflicts.
2. `git mktree` to rebuild the affected subtree with the resolved blob SHAs.
3. Walk the tree hierarchy replacing SHAs up to the root tree.
4. `git commit-tree` with two parents and a ref update to land the merge commit.

#### Risk — mandatory pairing

Hand-building trees can silently drop sibling entries. This technique MUST be paired with a tree-inventory diff before and after to verify nothing was lost. The coordinator verified PR #1813's plumbing merge: 1 file changed (+124/−14), `.squad/e2e/` and `.squad/` inventories identical, all 47 markdown headings present before the merge survive after it. The 14 deletions were the status banner and the Phase 0d correction — intentional, not loss.

---

### 2026-08-21: gitignore placement — colocation over root rules
**Date:** 2026-08-21
**Raised by:** Flight
**Status:** Decided

#### Decision

When adding a `.gitignore` to exclude files written by a tool under a specific subdirectory (e.g., `.github/aw/logs/`), the correct placement is a `.gitignore` inside that directory — not a rule in the root `.gitignore`.

#### Rationale

Colocation with the artifact directory improves discoverability, and the ignore rule survives even if someone cleans the root `.gitignore`. Nested-directory re-inclusion semantics (`*` + `!.gitignore`) work correctly for flat-file directories; subdirectories within an excluded directory remain ignored, which is the desired behavior for tool-generated log dumps.

---

### 2026-08-21: scaling-tribble session produced no work — intent unrecorded
**Date:** 2026-08-21
**Raised by:** Coordinator
**Status:** Noted / Open

#### Finding

The `bradygaster-scaling-tribble` worktree ("Custom runners for agentic workflows") produced absolutely no work: single reset in reflog, no commits, no stash.

#### Action

The intent behind that session is unrecorded. This may need to be re-opened as a fresh session or issue.

---

### 2026-08-19: Squad's responsibility matrix stops at this repo
**Date:** 2026-08-19
**Raised by:** bradygaster (via Copilot session)
**Status:** Decided

#### Context

During follow-up planning after a live end-to-end Squad test, the coordinator
repeatedly proposed opening a pull request against `github/gh-aw` to refresh
that repo's copy of `workflows/squad.md`, on the theory that stale content
there was blocking `github/gh-aw#53498`.

Brady rejected this three times. The proposal came from misreading the
`source: bradygaster/squad/workflows/squad.md@dev` line in gh-aw's copy as
evidence of a vendoring relationship that obligated us to keep their copy
current.

#### Decision

**All Squad work happens in `bradygaster/squad`.** We do not push code or
changes to `gh-aw` or any other external repository. The only work that
happens outside this repo is running tests in targeted test repos.

The gh-aw copy of `squad.md` is where some of their experimentation happens.
It is not ours to maintain, and no work item should be opened against it
until further notice.

#### Relationship framing (corrected)

Squad and gh-aw are **not** vendors of each other's code in either direction.

- `workflows/squad.md` originated inside gh-aw and was **moved here**. This
  repo is where that file and its siblings live now.
- We depend on gh-aw only to do "Squad things using gh-aw" — it is a runtime
  we build on, not a downstream consumer we ship to.
- A `source:` pin appearing in another repo is their provenance metadata. It
  does not create an obligation on us.

#### Consequences

- No follow-up item may be framed as "refresh / upstream / sync to gh-aw."
- Findings that appear to be gh-aw defects are theirs to triage. We may still
  investigate one to understand our own behavior, but investigation does not
  imply we open anything there.
- Test repos (e.g. `bradygaster/aspiregregator-squad-test`) remain in scope
  for verification work.

#### Foundational Directives (carried from beta, updated for Mission Control)

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

### 2026-08-19: Finding D: slash_command plus bots concurrency warning
**Date:** 2026-08-19T13:30:18.326-07:00  
**By:** Booster  
**Area:** Squad workflow trigger/concurrency behavior

#### Finding

Compiling `workflows/squad.md` with `gh aw compile workflows\squad.md --no-emit --no-check-update` reproduces the warning:

```text
workflows\squad.md: warning: Both slash_command and bots triggers are configured. If a bot listed in bots: posts a comment that starts with the slash command text (e.g., /command-name), it will trigger the workflow and occupy the concurrency slot, potentially blocking simultaneous manual invocations. To ensure the workflow only runs on explicit user commands, remove the 'bots:' field.
```

The compile also fails afterward because the local worktree does not have the referenced `squad-implement-worker` in the compiler's expected `.github\workflows` directory, but the warning is emitted before that unrelated failure.

gh-aw emits the warning in `pkg/workflow/compiler_validators.go` from `emitGeneralToolWarnings` when both `len(workflowData.Command) > 0` and `len(workflowData.Bots) > 0`.

#### Mechanism

`workflows/squad.md` configures:

```yaml
on:
  bots: ["github-actions[bot]"]
  slash_command:
    name: squad
```

gh-aw command matching accepts comments that are exactly `/squad`, start with `/squad `, or start with `/squad\n`. For comment triggers, actors listed in `bots:` are exempted from the normal owner/member/collaborator author-association guard, so a `github-actions[bot]` comment beginning with `/squad` can pass activation.

The workflow has no explicit concurrency block, so gh-aw auto-generates command/slash-command workflow concurrency keyed by workflow plus issue/PR number, with `cancel-in-progress` disabled for command workflows. A bot-authored `/squad ...` comment on the same issue therefore shares the same concurrency slot as a human `/squad ...` comment on that issue.

GitHub Actions permits one running and one pending run per concurrency group by default. If the bot run is running, the human run is delayed as pending. If another run in the same group queues while the human run is pending, the older pending run can be canceled and replaced. The failure can be effectively silent from the issue thread; the signal is in Actions UI/logs, not necessarily a Squad comment.

#### Assessment

This is a real but narrow hazard. Our current `bots:` entry is only `github-actions[bot]`. Our own gh-aw/Squad failure and status comments can be authored by that bot, but the observed `[aw]` failure-report class does not begin with `/squad`, so it does not match the slash-command predicate.

For the e2e chain we care about — `/squad implement` → epic → child PR → merge → worker dispatches Squad continuation — this warning is unlikely to bite unless one of our bot-authored comments begins with `/squad`. The continuation hop uses `dispatch-workflow` / `workflow_dispatch` inputs, not a bot issue comment, so it does not require `bots:` and does not depend on bot-authored slash-command comments.

#### Options

1. **Remove `bots:` from `workflows/squad.md`.** Clears the warning and prevents bot-authored `/squad` comments from occupying the human command slot. Cost: any intentional GitHub Actions bot slash-command automation stops working. I found no evidence the implement continuation needs that.
2. **Narrow `bots:`.** Already as narrow as possible for this use case (`github-actions[bot]` only). No practical improvement unless there is a more specific bot identity.
3. **Custom concurrency group with bot isolation.** Could route bot actors to `github.run_id`, but gh-aw still emits this warning because the check only looks at `slash_command` plus non-empty `bots`. It also preserves bot-triggered `/squad` execution, which is the behavior creating risk.
4. **Restructure triggers / split bot handling.** Viable only if we need bot slash-command support. More complexity than warranted for the e2e path.
5. **Suppress or ignore.** Leaves warning noise and a narrow real hazard. Acceptable for immediate e2e only if no bot comments start with `/squad`.

#### Recommendation

Address it, but do not block the immediate e2e rerun on it. The clean product configuration is to remove `bots:` from `workflows/squad.md` unless Flight identifies a required bot-authored slash-command scenario. The continuation hop we are proving uses workflow dispatch, so removing `bots:` should not weaken that path. If the team wants zero churn before the e2e rerun, doing nothing is operationally acceptable as long as the rerun issue avoids bot comments beginning with `/squad`.

### 2026-08-19: Finding F: protected-files request_review and signed commits
**Date:** 2026-08-19T13:11:34.130-07:00  
**By:** Booster  
**Area:** gh-aw safe-output protection for Squad Implement Worker

#### Verdict

The hard refusal is real signed-commit behavior, not a missing protected-files lookup. gh-aw first classifies `protected-files: request_review` as a soft protected-file action, but the signed-commit replay path revalidates the synthesized GraphQL payload and rejects every file-protection action except `allow`.

That makes `request_review` effectively incompatible with signed `create-pull-request` writes that touch protected files. The user-visible soft-log/hard-fail sequence is an integration/documentation bug in gh-aw, but the signed path is deliberately fail-closed.

#### Mechanism

1. `create_pull_request.cjs` calls `checkFileProtection(...)` with the configured policy defaulting to `request_review`.
2. For `request_review`, it logs that it will create the pull request with a caution and request-changes review.
3. The handler then calls `pushSignedCommits(...)` with the same validation config.
4. `push_signed_commits.cjs` synthesizes the GraphQL `createCommitOnBranch` file payload and calls `checkFileProtectionPostApply(...)`.
5. If the returned action is anything other than `allow`, it throws `Signed-commit payload violates file-protection policy (...)`.
6. `request_review` therefore soft-logs at PR-handler level, then hard-refuses at signed-push level.

`fallback-to-issue` follows a different route: the same signed-push validation still rejects the protected payload, but the PR handler has `manifestProtectionFallback` set, catches the push failure, and creates the protected-file review issue instead of trying to create the PR.

#### Worker recommendation

For `workflows/squad-implement-worker.md`, keep the existing `excluded-files` list for structural no-write zones:

```yaml
excluded-files:
  - ".github/workflows/**"
  - "**/.github/workflows/**"
  - ".github/agents/**"
  - "**/.github/agents/**"
  - ".github/aw/**"
  - "**/.github/aw/**"
  - ".squad/**"
  - "**/.squad/**"
```

Change `protected-files: request_review` to:

```yaml
protected-files: fallback-to-issue
```

Do not set `protected-files: allowed` unless the worker is intentionally allowed to rewrite protected manifests, security docs, and other top-level dot folders. `excluded-files` and `protected-files` overlap only for the excluded protected directories. `excluded-files` strips those paths from the patch before commit creation; `protected-files` still protects package manifests, lockfiles, `CODEOWNERS`, `README.md`, `SECURITY.md`, `CHANGELOG.md`, and other non-excluded protected files.

#### E2E rerun viability

This should unblock the e2e rerun for the worker path. A protected-file write will no longer produce the misleading `request_review` soft path followed by a signed-payload hard failure; it will be routed to the protected-file review issue path. Writes under `.github/workflows/`, `.github/agents/`, `.github/aw/`, and `.squad/` should be stripped before protected-file evaluation because of `excluded-files`.

Any workflow-source change must be recompiled into the installed `.lock.yml` used by `bradygaster/aspiregregator-squad-test`; editing this repo's Markdown source alone will not affect an already-compiled test workflow.

#### Risk

The recommendation does not weaken the no-write zones covered by `excluded-files`; those files remain absent from the generated patch. It does change the protected-file outcome from failed/contradictory `request_review` to review-issue fallback. The worker does not gain ability to commit excluded directories, but it can still propose normal allowed source files. Protected non-excluded files will require manual review through an issue instead of being opened as a PR with requested changes.

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

### 2026-08-19: Squad protected-files policy
**Date:** 2026-08-19T13:11:34.130-07:00  
**By:** Flight  
**Area:** Squad Implement Worker protected-file policy

#### Recommendation

Choose **B**:

```yaml
protected-files:
  policy: fallback-to-issue
  exclude:
    - README.md
```

This should be Squad's shipped worker default for now. It fixes the `request_review`/signed-commit incompatibility without turning routine README work into a dead-end review issue. It keeps the genuinely load-bearing protected files protected: dependency manifests, lockfiles, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and top-level dot folders not already stripped by `excluded-files`.

Do not choose plain `fallback-to-issue` as the product default. It is mechanically safe but creates the wrong default UX for a core Squad use case: docs improvement by PAO. Do not choose the broader docs exclusion yet. `README.md` is special because it is both high-frequency and low-control-plane. `CONTRIBUTING.md` and `CHANGELOG.md` can be process/release-control files in adopting repositories.

#### Threat model

The protected-file guard is not primarily protecting `dev` from an unreviewed merge; the PR review gate already does that. It is protecting reviewers and repo owners from high-leverage changes being normalized into routine agent output.

Protected status is load-bearing when a file can change:

- the dependency graph or supply-chain surface (`package.json`, lockfiles, `go.mod`, `pyproject.toml`, `Gemfile`, `Directory.Packages.props`, etc.);
- install/build/test execution (`scripts`, package manager config, SDK/toolchain pinning);
- repository governance (`CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`);
- release provenance or release automation assumptions (`CHANGELOG.md` in many repos);
- future automation behavior through top-level dot folders, where not already removed by `excluded-files`.

For those files, `fallback-to-issue` forces a human to explicitly acknowledge that the work is crossing a policy boundary before the patch becomes a normal PR. That extra friction is justified.

`README.md` does not carry the same default threat. It can mislead users, but that risk is visible in ordinary review and is exactly the kind of work Squad should handle. Protecting every basename `README.md` at every depth is inherited from gh-aw's generic manifest-safety model, not from Squad's product model.

#### Unit of configuration

Ship B as the worker default, then surface protected-file policy as an adopting-repo configuration choice in the connect/adopt path.

The worker needs a safe, opinionated default because every adopter starts somewhere. But repo owners differ: regulated repos may want strict plain `fallback-to-issue`; docs-heavy repos may want additional exclusions; experimental repos may choose a looser profile. This belongs beside the finding E preflight for Actions PR permissions. Both are adoption-time repository capability/safety choices, so they should share one preflight/configuration surface rather than becoming scattered workflow footnotes.

The default should not wait for that surface. The current `request_review` value is broken with signed create-pull-request writes.

#### User experience of fallback-to-issue

`fallback-to-issue` is acceptable as a policy-boundary escape hatch, not as the normal happy path.

For a legitimate manifest task such as "add the Serilog package," an issue instead of a PR is frustrating but defensible: adding a dependency is a supply-chain decision, and the repo owner should consciously turn that issue into a PR or configure a looser policy. That outcome must be documented clearly so users understand it is a safety handoff, not a failed worker.

For README work, the same experience is bad product behavior. It blocks common successful work, creates coordinator churn, and trains users that Squad cannot do basic docs tasks. That is why README should be excluded from protected-file defaults.

#### CHANGELOG.md

Do not exclude `CHANGELOG.md` in the shipped default.

This repo uses changesets, so Squad should normally write `.changeset/*.md`, not `CHANGELOG.md`. Adopting repos may not. In many projects `CHANGELOG.md` is release provenance, may be generated, and may be validated by release automation. A false changelog entry can be materially worse than a README edit because it can misstate shipped behavior or satisfy a release gate. Repos that intentionally maintain changelogs by hand can opt out later through the adoption configuration surface.

#### Follow-up

When implementation happens, update the workflow source and recompile the installed `.lock.yml` in any consuming/test repo used for validation. Keep the existing `excluded-files` rules; they solve a different problem and remain independent of this decision.

### 2026-08-20: Merge continuation dispatch inputs
**By:** Booster (CI/Workflows)
**What:** Squad must not rely on a destructive default to mask missing workflow-dispatch inputs. `workflows/squad.md` must not default `workflow_dispatch.inputs.command` to `cast`; missing dispatch inputs must be surfaced visibly. Merge continuation must use the prompt-visible generic dispatch tool shape, with workflow inputs nested under `inputs` rather than passed as top-level keys, and the continuation comment must target the parent epic rather than auto-targeting the merged pull request.
**Why:** Run `32316227601` in `bradygaster/aspiregregator-squad-e2e` accepted the agent's safe-output call but dispatched Squad with no inputs. The agent had called the generic `dispatch_workflow` safe-job with `{"command":"implement","issue_number":"5"}` as top-level keys, while the compiled tool schema expected `workflow_name` plus a nested `inputs` object. The workflow-specific `squad` dynamic tool also existed, but the compiled prompt's safe-output tool summary listed the generic `dispatch_workflow`, so the prompt and the visible schema disagreed.
**Guardrail:** Static gates should check both sides of this contract — action-like workflow-dispatch inputs must not carry destructive defaults, and continuation dispatch payload keys must be nested under `inputs` and match the receiving workflow's declared input names. See #1772, where a later run showed a different failure mode against the same single-slot dispatch budget.

### 2026-08-19: Finding D — slash_command plus bots concurrency warning — DECIDED
**By:** Booster + Flight (consensus during triage)
**What:** Keep `bots: ["github-actions[bot]"]` in both `workflows/squad.md` and `workflows/squad-implement-worker.md`. Accept the compiler warning as a known, documented trade-off. The concurrency hazard is narrow: no current workflow posts a bot comment beginning with `/squad`. Merge-continuation uses `workflow_dispatch`, not slash-command comments. Tests at `test/gh-aw-implement-workflow.test.ts` lines 102-115 assert `bots:` present. Close #1763.
**Why:** Removing `bots:` breaks a tested expectation with zero functional benefit. Wave-5 dependency: defer until #1772 is fixed and a continuation run is green.

### 2026-08-20: gh-aw pre-E2E scope cut — #1762, #1764, wave:1 cap
**By:** Flight (Lead)
**What:** (1) Close #1762 — docs suffice for PR-creation setting; preflight probe deferred to `squad health` (#1605). (2) Close #1764 — delete all 3 copilot/* branches (all content already on dev; others are pure CRLF churn). (3) Wave:1 hard cap = 6 issues: #1772, #1758, #1759, #1730, #1732, #1768. #1731 demoted to wave:2. #1761 non-gating ride-along. (4) Close #1738 — speculative RFC, premature until core SDLC path proven.
**Why:** More than six load-bearing changes the night before an E2E turns the test into a debugging session for our own diffs. Workstream has two axes: (a) make existing path correct/reliable (tomorrow's goal), (b) new capabilities on top. Tomorrow tests (a) only.
**Workstream goal:** Make the `/squad` SDLC lifecycle run reliably end-to-end as gh-aw workflows — plan → accept → activate → implement → merge-relay — with trustworthy dispatch and honest fixtures, so an epic decomposes into children that implement and merge without manual intervention.

### 2026-08-20: P0 triage — #1772 and #1758 still real
**By:** EECOM (Core Dev)
**What:** Both P0s verified structurally unresolved. #1772: commit b6804305 added prompt wording only; `max: 1` at `squad-implement-worker.md:204` still silently drops the real dispatch if a probe fires first. Fix must be structural (extend `scripts/check-workflow-input-interpolation.mjs` or add runtime rejection for empty dispatch). #1758: all 3 defects confirmed (squad-plan-accept Step 1 hardcodes plan lookup; Epic Dispatch at L529-554 dispatches Epics not tasks in 3-level tree; validate at L867 is after accept-scope, not before both accepts). Both SHIP-NOW. Close #1604, #1609. Defer #1730, #1731, #1733, #1735, #1606.
**Why:** Prompt text cannot prevent structural misbehavior. #1758 is wave:3 (depends on #1759) but code work can proceed now; live E2E proof deferred until #1772 fixed.

### 2026-08-20: #1732 split — compile gate SHIP-NOW, prompt-budget and string-assertion CLOSE
**By:** FIDO (Quality Owner)
**What:** `gh aw compile` is absent from CI — test at `test/gh-aw-quality.test.ts:978` uses `it.skipIf(!ghAwAvailable)` and the extension is never installed in the CI `test` job (`squad-ci.yml`). Prompt-budget gate already done (lines 637-669). String-assertion item too vague. Split: SHIP-NOW = add `gh extension install github/gh-aw` to `squad-ci.yml` so compile test actually runs. CLOSE prompt-budget and string-assertion portions.
**Why:** CI should never silently skip the compile check on every run.

### 2026-08-20: Fixture repo fate — aspiregregator-squad-e2e is the sole E2E fixture
**By:** Sims (E2E Test Engineer)
**What:** Close #1768 — decision already executed. `aspiregregator-squad-test` retired; hand-created issues already closed (runs 32297494287-32297512862). `aspiregregator-squad-e2e` is the sole primary E2E fixture going forward; contains honest Squad-decomposed issues. Close `aspiregregator-squad-e2e` #12 and #14 before tomorrow's run (failure artifacts from #1772 dispatch bug). No new fixture repo needed.
**Why:** Hand-created fixtures prove dispatch mechanics but not Squad's ability to decompose and continue through its own children.

### 2026-08-20: #1759 SHIP-NOW; #1756 SHARPEN structural contract; #1757 and #1608 DEFER
**By:** Procedures (Prompt Engineer)
**What:** #1759 confirmed live bug — squad.md squad-plan Step 3 (L637) emits Owner column and squad-plan-implementation Steps 2/4 (L851, L863) emit Agent column, but neither instructs values MUST be cast names from `.squad/team.md`; model falls back to role strings (`lead`, `devrel`) breaking `squad:{owner}` labels at L670. SHIP-NOW. #1756: ship structural contract only (emitted-artifact sections: evidence table, goals+non-goals, load-bearing assumptions, open decisions, traceability IDs R1..Rn); defer insight tuning. #1757: DEFER wave:4 — value is taste-based, E2E should inform. #1608: DEFER wave:3.
**Why:** #1759 is small, isolated, and visible during tomorrow's plan review. Shorter list that ships.

### 2026-08-20: #1761 SHIP-NOW — 3 doc errors in gh-aw.md; #1736 DEFER wave:3
**By:** PAO (DevRel)
**What:** #1761 SHIP-NOW — 3 verified errors in `docs/src/content/docs/guide/gh-aw.md`: (1) stale `.github/aw/` in `git add` (L38, L113 — could cause FALSE E2E failure); (2) redundant `gh aw compile` step (L34-35, L100-108); (3) missing restricted-secrets prompt callout (absent entirely). #1736: DEFER wave:3, blocked on #1733; current text accurate.
**Why:** Stale git add path could cause a false E2E failure independent of any code bug.

### 2026-08-20: Issue clarity bar — goal + success criteria or close it
**By:** brady gaster (via Copilot coordinator)
**What:** Every open issue must have (1) a clear goal and (2) clear, observable success criteria. If an issue cannot meet that bar, close it rather than carry it. Work should be crisp, targeted, and goal-oriented — prefer a short list that ships over a complete list that thrashes.
**Why:** Stated during gh-aw workstream triage ahead of a full-day end-to-end test series. Direct quote: `i want our work to be very, very crisp, targeted, and goal-oriented ... make sure the goals of each are clear, make sure the success criteria for each is clear, and if not, close the issues and ship the thing.`
**Scope:** Applies to issue triage generally, not just the gh-aw workstream.

### 2026-08-20: Board cleanup execution — 7 issues closed, 3 branches deleted, milestones M1-M5 created
**By:** Ralph (Work Monitor)
**What:** Executed gh-aw triage decisions. Closed #1738, #1762, #1764, #1768, #1763, #1604, #1609 with rationale comments. Deleted 3 copilot/* branches (all already on dev or pure CRLF churn). Wave labels corrected: #1756 promoted to wave:1, #1730/#1731/#1729 demoted to wave:3/4. All 6 wave:1 issues updated with explicit Goal + Success Criteria blocks. Filed #1779. Created milestones M1-M5 (Pre-E2E stabilization, E2E verdict, Harden proven path, Review gate, Adoption & durability).
**Why:** Brady's issue clarity bar: every open issue must have a clear goal and observable success criteria, or it gets closed.

### 2026-08-20: max:2 and the activation guard are complementary, not redundant
**By:** EECOM + Procedures (batch 2)
**What:** `max: 1` → `max: 2` in `squad-implement-worker.md` is the *worker's* outbound dispatch budget (#1777). `checkDispatchWorkflowSchemas()` in `squad.md` is *squad.md's* inbound validation gate (#1778). They operate at different layers. Both shipped. The empty-dispatch guard replaced an instruction that **created an issue** on empty dispatch input — that instruction was the generator behind junk fixture issues #12 and #14 in aspiregregator-squad-e2e.
**Why:** Separate concerns; removing either would reopen a different failure mode.

### 2026-08-20: Empty-probe failure signal is a ::warning:: annotation, not a comment
**By:** Procedures (batch 2)
**What:** When the dispatch guard detects an empty dispatch probe, it emits a `::warning::` GitHub Actions log annotation rather than posting an issue comment.
**Why:** The empty probe has no triggering issue to post to; a log annotation survives the run and is visible in the Actions UI without creating noise in issue threads.

### 2026-08-20: #1758 shipped whole — validate-ordering fix anchored to squad-planning-ontology.md
**By:** Procedures + EECOM (batch 2)
**What:** The validate-ordering defect (#1758.3) was fixable because `workflows/shared/squad-planning-ontology.md:48-87` is the authoritative state machine and `squad.md`'s `next=` hints had drifted from it. The fix was a repair against a spec, not an inference. Pinned by test `#1758.3`. All three defects shipped in #1778.
**Why:** Before deferring a fix as unverifiable, look for a spec the code should already conform to. If a spec exists and the code has drifted, the fix is a repair, not a guess.

### 2026-08-20: When a bug is only reachable above a scope threshold, constrain the experiment rather than rush the fix
**By:** Sims + Flight (batch 2)
**What:** #1779 (epic-scope dispatcher collision) deferred to M3. Rationale: a third same-night change to `squad-implement-worker.md` — already under concurrent edit by #1777 — hours before a full-day run was judged a worse confound than the bug itself. Constraining the E2E experiment to a single-epic scope eliminates the bug's trigger condition without touching contended code.
**Why:** Generalizable principle for contended files near a test window.

### 2026-08-20: #1779 trigger is epic scope, not fixture shape
**By:** Sims (batch 2)
**What:** The bug in #1779 is triggered by two or more sibling epics under a common root, each with leaf tasks, where one exhausts before another starts. It is live and reachable on any realistically-sized epic. It is not a fixture-design problem — aspiregregator-squad-e2e with a single epic avoids the trigger.
**Why:** Distinguishes the fixture workaround (valid for tomorrow) from the real product constraint (M3).

### 2026-08-20: Test bar for the gh-aw workstream — a test must fail against the pre-fix state
**By:** Flight + FIDO (batch 2)
**What:** A test that passes while the system is broken is decoration, not a gate. Derived from #1766, which shipped prompt-wording-only with a test that passed throughout the broken period. Applied to #1777 and #1778: each test was verified to fail against the pre-fix state. Also applies to pinning tests: a pin that reads one side as ground truth and regenerates from it is decoration, not a gate.
**Why:** Establishes a reusable quality bar for this workstream going forward.

---

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

### 2026-08-22: FIDO review — PR #1831
**Date:** 2026-08-22
**Reviewer:** FIDO
**PR:** https://github.com/bradygaster/squad/pull/1831
**Verdict:** APPROVE WITH NITS

#### Verification performed

- Built the PR worktree successfully with `npm run build`.
- Baseline `squad doctor` on the PR worktree reported:
  - `working tree line endings — 174 LF-pinned file(s) all LF on disk`
  - `Summary: 13 passed, 0 failed, 0 warnings, 0 info`
- Forced these three LF-pinned `.mjs` files to CRLF on disk without changing the index:
  - `packages/squad-cli/scripts/patch-esm-imports.mjs`
  - `scripts/check-changeset-drift.mjs`
  - `scripts/promote-insider-tag.mjs`
- Confirmed `git diff --name-only -- <files>` showed no content diff while `git ls-files --eol` showed `i/lf w/crlf attr/text eol=lf`.
- Poisoned-tree `squad doctor` reported:
  - `3 of 174 LF-pinned file(s) still have CRLF on disk`
  - named all three files
  - `Summary: 12 passed, 1 failed, 0 warnings, 0 info`
- `npm run fix:crlf` repaired all three files and exited 0.
- After repair, `git ls-files --eol -- "*.mjs"` reported `0 of 42` `.mjs` files with `w/crlf`.
- After repair, `squad doctor` returned to `Summary: 13 passed, 0 failed, 0 warnings, 0 info`.
- Guard verification: I added a real content edit plus CRLF to `scripts/promote-insider-tag.mjs`; `npm run fix:crlf` skipped it, exited 1, and preserved the `FIDO_PRECIOUS_GUARD` marker.
- Targeted Vitest run:
  - `test/scripts/check-changeset-drift.test.ts`: 8 tests
  - `test/promote-insider-tag.test.ts`: 15 tests
  - `test/cli/patch-esm-imports.test.ts`: 6 tests
  - `test/scripts/crlf-worktree-repair.test.ts`: 13 tests
  - total: 42 passed
- `node scripts/check-shebang-eol.mjs` passed: 46 shebanged files pinned to LF, 174 LF-pinned files storing LF blobs.

#### Judgment

The primary verification gap is closed: the doctor check observes the dirty working-tree-only state that CI cannot produce, reports it as a failed check, names the stale files, and the remediation repairs them.

The repair safety guard holds. A content-modified file is detected by `git diff --name-only`, skipped, and not clobbered by `git checkout-index -f`.

The `check-shebang-eol.mjs` refactor does not weaken the original CI check. Its existing index-based invariants still pass, and the new working-tree detection remains deliberately exported for local doctor/repair rather than wired into CI.

The new tests assert real behavior, not parser decoration: they first establish the poisoned state, assert the repair result, inspect `git ls-files --eol`, and verify preserved user content for the destructive path.

Both deliberate non-actions are sound:

1. No `git add --renormalize .`: correct. This defect is a stale working tree, not bad index blobs. I measured 94 CRLF-storing `.ts` blobs in this PR worktree, so the exact documented 95 count appears stale by one, but the churn argument still holds.
2. No CI gate for the working-tree check: correct. Fresh CI checkout is exactly the condition that masks this class of defect, making such a gate permanently green.

#### Nits / discrepancies

- My measured counts differ slightly from EECOM's transcript: 174 LF-pinned files instead of 173, and `0 of 42` `.mjs` files after repair instead of `0 of 41`. This appears explained by the newly added `scripts/fix-crlf-worktree.mjs`, and is not a blocker.
- The `.gitattributes` / CONTRIBUTING rationale says 95 CRLF-storing `.ts` blobs; I measured 94. The rationale remains valid, but the literal count is stale.

---

### 2026-08-22: Gate instructions are part of the gate
**By:** Scribe, from EECOM/FIDO #1793/#1831
**Extends:** 2026-08-20: Test bar for the gh-aw workstream — a test must fail against the pre-fix state

**What:** The instructions a gate prints are part of the gate. A correct check paired with a remediation or verification command that cannot observe the failure is still a broken gate, because the printed command is what a developer actually runs.

**Concrete instance:** `squad doctor`'s working-tree check counted all 174 `eol=lf`-pinned paths, but printed `git ls-files --eol "*.mjs"` — which covers only 42 of them. A pinned non-`.mjs` file left CRLF would have verified all-clear.

**Why:** Verification and remediation hints must cover the same artifact set as the check. Otherwise the team has built a check that can fail while teaching developers to run a narrower command that proves nothing.
