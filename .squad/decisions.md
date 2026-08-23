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


---

### 2026-08-22: FIDO review — PR #1832 (closes #1824): fail loudly when /squad parses no command

#### FIDO review — PR #1832 (closes #1824): fail loudly when `/squad` parses no command

**Reviewer:** FIDO (Quality Owner) · **Author:** Procedures · **Date:** 2026-08-22
**Verdict:** ✅ **APPROVE WITH NITS** (posted as `COMMENTED` — GitHub blocks a formal Approve on an own-account PR)

This was an adversarial re-derivation, not a read-through. I reproduced every claim independently in the PR worktree
(`bradygaster-silver-engine`) and record measured-vs-assumed below.

---

#### Measured

##### Baseline
- New suite `test/gh-aw-command-parse.test.ts`: **15/15 pass** on clean branch (Git Bash resolved).
- `gh pr checks 1832`: **all gates green**, including the CI `test` job (5m39s) and `Diff Size Guard`.

##### Claim 1 — Mutation 1 (reintroduce position-0 line anchoring: `/^\/squad/`) — VERIFIED, load-bearing
- Applied the mutation (awk regex only). Result: **2 failed / 13 passed.**
- **Headline #1824 case ("prose, blank line, then command") PASSED under the reintroduced bug** — confirms the
  diagnosis: awk `^` anchors per *record*; `printf` feeds awk line-by-line, so a line-anchored parser still handles a
  command on its own line after prose. **The obvious test for #1824 is structurally blind to #1824's own bug.**
- The only catchers were the **indented** and **mid-sentence** cases (2 failures, each naming its specific input).
- **Inverse check:** removed those two cases, kept the mutation → **13/13 GREEN, mutation escapes entirely.**
  So the two cases are the *sole* catchers. (I measured **0** catch without them — marginally stronger than the
  PR body's "1 of 14"; the exact scalar is bookkeeping, the substance is that they are singularly load-bearing.)

##### Claim 2 — Mutation 2 (generic diagnostic: `echo 'unrecognized command'`) — VERIFIED (#1793 shape)
- Applied. Result: **3 failed / 12 passed.**
- The three catchers all require the diagnostic to **contain the offending text** / match the sentinel.
- Crucially, the **status-shaped assertions stayed GREEN** — "sends NO_COMMAND to PC-3 and forbids fallback" and
  "PC-3 fails the run" both passed against the gutted diagnostic. That is exactly the #1793 failure mode: a status-only
  gate cannot observe a diagnostic that reports nothing. Content-requiring assertions are what close it.

##### Claim 3 — Independence — VERIFIED, not circular
- The test extracts the fenced `bash` block after each PC heading (`bashBlockAfter`) and **executes** it via
  `execFileSync(shell, ['-c', cmd])` with the body in env. Mutations 1 & 2 prove it: altering the *declared parser* in
  the markdown flipped behavioral verdicts. A broken declared parser makes behavioral cases fail. The test does not
  re-read prose to confirm prose.

##### Claim 4 — the `/bin/sh` false-green and the new suite's hard-assert
- `HAS_POSIX_SHELL = existsSync('/bin/sh')` is false on Windows; the two `describe.skipIf(!HAS_POSIX_SHELL)` blocks in
  `gh-aw-quality.test.ts` skip. Measured on this host: **13 skipped tests / 28 literal `expect()` / 22 `it` decls** in
  those blocks (`it.each` expands further on a POSIX host). **Mechanism confirmed real** — a permanently-green gate on
  Windows. I could not reproduce the exact figure **102**; that is an expansion/counting convention, not a substantive
  disagreement.
- **The important half — forced red:** I hard-forced `resolvePosixShell()` to return `null`. New suite went
  **13 FAILED / 2 passed**, with the guard test failing loudly ("No POSIX shell found…"). It reports **RED, not a
  green skip**, when no shell resolves. Verified by force, not inferred. (The 2 still-green are pure static-markdown
  PC-2 checks that need no shell — expected.)

##### Claim 5b — #1812 separation — spot-checked
- The diff touches only the Parse Command routing section. The `plan activate` hardcoded roster lives in a separate
  skill, downstream of routing. No shared code path. This PR does not modify #1812's surface.

##### My own acceptance test for #1824 — could I construct a silent no-op / green-with-no-cast?
Ran the **exact PC-1 and PC-3 commands** from the markdown against hostile bodies (empty, only-fenced-block, HTML
comment, `/squad` in a URL, Cyrillic look-alike, two-per-line, `squadify` near-miss, leading tab, CRLF, quoted,
bare-with-trailing-space, zero-width space, no-slash):
- **Every zero-action body → `NO_COMMAND` → PC-3 loud fail.** No silent no-op, no green-with-no-cast constructible.
- The acceptance bar ("a run that cast no agents must not report success") **holds at the parser layer.**

---

#### Nits (non-blocking)
1. **HTML comment `<!-- /squad cast -->` parses `cast` and would cast.** Documented "deliberate widening" (surface,
   don't silently skip). Defensible, but invisible-in-render comment text triggering a real cast is worth a follow-up
   thought. Not a #1824 defect — it acts loudly, the opposite of the bug.
2. **Two `/squad` tokens on one line → greedy `sub(/^.*\/squad/,"")` picks the LAST** (`/squad cast … /squad plan`
   yields `plan`). An ordering surprise, still a loud action, not a no-op. Rare. Low severity.
3. The `102` skip figure in the PR body isn't reproducible as-stated (I measure 13 skipped tests / 28 expects). Cosmetic.

#### Residual I cannot close (stated plainly)
PC-2/PC-3's "exit non-zero / never `noop` / comment on the issue" are **prose instructions to an LLM**, not executed
code. The suite verifies (a) the diagnostic *command* emits correct verbatim text and (b) the markdown *declares* the
fail contract. It cannot verify the runtime LLM actually exits non-zero. This is inherent to gh-aw (the parser is a
prompt) and Procedures acknowledged it. The mitigation is that the *observable* diagnostic is now content-bearing and
mutation-sensitive, which is the strongest guarantee available at this layer.

#### Why APPROVE WITH NITS
Every load-bearing claim reproduced. The suite is mutation-sensitive where it matters (content, not status), fails red
when it cannot run, and is independent of the prose it guards. I tried to build a bypass and could not. The nits are
observations under a documented design decision, not regressions. Ship it; consider a follow-up issue for nit #1/#2 and
for the real `/bin/sh` 102-skip cleanup (out of scope here per Diff Size Guard).

*— FIDO. If it can break, I'll find how. This time I mostly couldn't, and I said so.*

---

#### ADDENDUM — 2026-08-22 (adjudicating the automated reviewer's findings)

Coordinator asked me to adjudicate two findings my first pass did not cover (injection; a
`workflow_dispatch` regression) plus confirm one convergence. Measured, not reasoned. Where I could not
measure, I say so.

#### FINDING 1 — shell injection ("verbatim issue text interpolated unsafely") → **NON-BLOCKING as stated; real hardening gap**

I ran 8 hostile payloads through the EXACT PC-1 and PC-3 pipelines with the body delivered via the
environment (the channel the tests use and the natural reading of `"$SQUAD_TRIGGER_BODY"`):
`$(touch)`, `` `touch` ``, `"; touch x; echo "`, `/squad cast; touch x`, `%s%s%s%n`, `/squad %n%n%n`,
`-e /squad`, `--version`.

- **Measured: zero side effects. No marker file ever created.** The pipeline is injection-safe.
  - `printf '%s\n' "$VAR"` — `%s` is a fixed literal in the *script*; the body is an **argument** to
    printf, never a **format** slot. Body `%n`/`%s` is inert data (payload `%s%s%s%n` → `NO_COMMAND`;
    `/squad %n%n%n` → extracted literally as `%n%n%n`, no crash, no write).
  - `grep -n -i -m 3 -F -- '/squad'` — `-F` fixed-string, `--` terminates options, `/squad` is the
    literal pattern; the body is **stdin**, so `-e`/`--version` in the body are data, not grep args.
  - Every hop is double-quoted; no word-splitting, no glob, no substitution.
- The reviewer's specific mechanism — *"verbatim issue text is interpolated into shell commands"* — is
  **not reproducible against the code in the diff.** The body is *referenced* (`"$VAR"`), not
  interpolated, and I could not turn it into an RCE.
- **The real residual, stated plainly:** line 240 says *"Assign the resolved trigger body ... to
  `SQUAD_TRIGGER_BODY`"* without specifying HOW. If a runtime agent implements that by pasting the body
  into a bash assignment (`SQUAD_TRIGGER_BODY="<body>"`), that channel IS an RCE — I demonstrated it:
  body `hello"; touch pwned; echo "` created the marker. Whether the gh-aw runtime uses the safe channel
  (pre-set env var) or the unsafe one (interpolation) is **decided by the gh-aw compiler + LLM, and there
  is no compiled `squad.lock.yml` in this repo to inspect. I cannot measure the runtime channel from
  here, and I will not infer it.**
- **Adjudication: NON-BLOCKING** — the demonstrated, reviewable pipeline is safe. But this must not stay
  at LLM discretion. **Required hardening (own follow-up):** pin the assignment to a named
  gh-aw-provided env var and add one line forbidding interpolation of body text into any script. Also
  note a one-hop-later exposure: PC-2 extracts `cast; touch pwned_env` as the *argument string*; harmless
  in PC-1/PC-3, but any downstream step that ever interpolates parsed args into a shell reopens it.

#### FINDING 2 — `workflow_dispatch` bare command regresses to a loud failure → **BLOCKING**

- **Measured (deterministic):** `PC1("implement")` = `NO_COMMAND`; `PC1("research")` = `NO_COMMAND`.
  Bare mode names carry no `/squad` token, and PC-1 returns the sentinel for anything lacking one.
- **This is exactly what dispatch sends.** `workflows/squad-implement-worker.md:259`:
  `"command": "implement"` (bare, nested under `inputs`). The activation guard (`squad.md:158-160`) itself
  lists `research`, `triage`, `plan*`, `implement` as valid bare dispatched commands.
- **Does it flow through PC-1?** `squad.md:240` names *"the dispatched command"* as a `SQUAD_TRIGGER_BODY`
  source, and PC-1 is `[MANDATORY]`. Literal reading: `implement` → PC-1 → `NO_COMMAND` → PC-2 →
  PC-3 → **exit non-zero.** The pre-fix flow ("strip `/squad` prefix, match longest-prefix-first, default
  to cast") matched `implement` and **worked** — so the PR converts a working relay into a guaranteed
  false failure.
- **The contradiction is the defect.** `squad.md:176-177` ("use this value as the command, skip remaining
  sources") treats the dispatched command as a pre-resolved mode; PC-1 requires a `/squad` token none of
  them carry. Either the agent obeys `[MANDATORY]` PC-1 and hard-fails the core autonomous path, or it
  ignores a `[MANDATORY]` step and behavior is undefined. Both are bad.
- **Untested:** the new suite never feeds a bare dispatched command; it only exercises `/squad`-bearing
  bodies and prose. Dispatch resolution has zero coverage. Confirmed by grep.
- **Adjudication: BLOCKING.** The implement relay is the highest-traffic non-interactive path.
  **Fix shape:** normalize dispatch input *before* PC-1 — when `event_name == workflow_dispatch` and
  `inputs.command` is a non-empty bare mode, treat it as already-resolved (bypass the `/squad` scan) or
  synthesize `SQUAD_TRIGGER_BODY="/squad ${command}"` ahead of PC-1. Normalize the input; do not loosen
  PC-1's scan (loosening reopens #1824).

#### FINDING 3 — greedy `sub(/^.*\/squad/,"")` picks the LAST token → **NON-BLOCKING, but a real defect (confirmed)**

- **Measured:** `PC1("Please run /squad cast, then /squad status")` = `status`. Declared contract
  (`squad.md:247`, "takes the **first** `/squad` token") says `cast`. **Contract violated.**
- Cause: `!f` stops at the first matching *line*, but within it the greedy `.*` strips through the LAST
  `/squad`, so the second command's argument wins.
- Two independent reviewers (me, then `copilot-pull-request-reviewer`) landed on the same line — promotes
  it from nit to real defect. **On its own: NON-BLOCKING** (needs two `/squad` on one line; still yields a
  loud valid action, not the silent-no-op #1824 class). But it lives on the same awk line as no other
  defect, so it should be fixed in this PR, not deferred. Fix shape: extract only up to the FIRST bounded
  `/squad` on the matched line (awk has no non-greedy; use `index()`/`match()` from the token position).

#### FINDING 4 (their 4th item) — PC-3 emission/exit untested: closable or inherent?

- **Partly closable, mostly inherent — and the two framings are the same residual.**
  - The PC-3 **diagnostic command** (the `grep` one-liner) IS extracted and executed by the suite, and
    Mutation 2 proved it content-sensitive. That half is closed.
  - The **`echo "::error::…"` emission** is prose with a `<verbatim output>` placeholder the agent fills,
    not a standalone command — only its *declaration* is assertable (the test already does
    `expect(pc3).toContain('::error::')`). Making the interpolated annotation itself executable/tested is
    marginally possible but low-value.
  - **"Post one comment"** (safe-output tool call) and **"fail the run — exit non-zero"** (the agent's
    control-flow choice) are gh-aw *runtime* behaviors. **Not reachable from a Vitest unit test.**
    Genuinely inherent.
- So the reviewer ("test gap") and my first pass ("inherent LLM-prompt limit") describe the same boundary.
  **This needs to be written down as a known limitation** so every future reviewer doesn't re-discover it:
  *the PC-3 contract is verified as declared and its diagnostic is verified behaviorally; the actual
  non-zero exit and issue comment are gh-aw runtime actions and are not unit-testable at this layer.*

---

#### VERDICT BLOCK

| # | Finding | Adjudication | Basis (measured) |
|---|---------|-------------|------------------|
| 1 | Shell injection | **NON-BLOCKING** (as stated) + required hardening | 8 payloads through the real pipeline via env → 0 side effects; interpolation channel is RCE but is the unspecified assignment step, and no lock exists here to confirm the runtime channel |
| 2 | Dispatch bare-command regression | **BLOCKING** | `PC1("implement")`/`PC1("research")` = `NO_COMMAND`; dispatch sends bare `command:"implement"` (worker:259); line 240 routes it through `[MANDATORY]` PC-1 → PC-3 hard fail; pre-fix worked; untested |
| 3 | Greedy last-token | **NON-BLOCKING** (real defect, fix in-PR) | `PC1("…/squad cast, then /squad status")` = `status`, contract says `cast` |
| 4 | PC-3 emission/exit test gap | Inherent (record as known limit); diagnostic half already closed | Suite executes the grep diagnostic; comment + non-zero exit are gh-aw runtime, not unit-testable |

**Overall: MERGE AFTER FIXES (rework the dispatch path).** Finding 2 is a net regression on the core
autonomous relay and blocks. Finding 3 rides the same awk line and should be fixed here. Finding 1 is not
a demonstrated exploit in the diff but leaves a security-critical step to LLM discretion — pin a safe
channel. My original #1824 assessment is unchanged and still stands: the issue-path fix is sound; the
dispatch-path handling introduced alongside it is not.

*— FIDO. Measured what I could; named what I couldn't.*

---

#### Addendum 3 — Pass 3 re-review of rework commit `6e7628c5` (2026-08-22T19:20-07:00, FIDO)

Re-reviewed EECOM's rework "fix(gh-aw): normalize bare workflow_dispatch commands before PC-1".
All measurements run in `bradygaster-animated-guacamole` (on branch, HEAD `6e7628c5`, `node_modules` present).
Method: extract the **declared** bash from `workflows/squad.md`, execute it, mutate the markdown, observe.

##### Claims — verified by measurement

1. **PC-0 fixes the BLOCKING dispatch regression (my Finding 2) — VERIFIED / resolved.**
   `PC0("implement")→"/squad implement"`; idempotent on `"/squad implement"`; `"  implement  "→"/squad implement"`;
   `""→"EMPTY_DISPATCH"`. Full relay `PC1(PC0(x))` resolves all six documented dispatch modes
   (`implement, research, cast, status, connect org/repo, plan accept implementation phase 2`) to their mode.
   The prior BLOCKING regression is closed.

2. **PC-1 deliberately NOT loosened; guard fires under mutation — VERIFIED.**
   Mutation (c) below fires the dedicated guard `PC-1 is NOT loosened …` naming the input, AND reopens the
   #1824 headline `no command anywhere`. The guard is load-bearing, not decorative.

3. **Greedy last-token fix (my Finding 3) — VERIFIED.**
   `PC1("Please /squad cast, then /squad status")→"cast, then /squad status"` (first `/squad` wins, remainder starts
   with `cast`); `PC1("/squad research and later /squad implement")→"research and later /squad implement"`.
   No longer returns the last token (`status`/`implement`).

4. **Text contradiction resolved — VERIFIED.**
   Only `squad.md:177` retains "skip the remaining sources", now scoped to *source selection*; `:184-187` state
   "Choosing a source never skips parsing: every source is parsed by **Parse Command** below … MUST be normalized by
   **Step PC-0** before PC-1 sees it." End-to-end unambiguous; PC-1 stays `[MANDATORY]`.

5. **Three mutations red-AND-naming — VERIFIED (standing bar met on all three).**
   - (a) PC-0 pass-through (`else print $0`): 7 red. Names input:
     `A workflow_dispatch of "implement" must resolve to that command … expected 'NO_COMMAND' to be 'implement'`.
   - (b) greedy `sub(/^.*\/squad/,"")` restored: 2 red. Names input:
     `PC-1 must extract "cast, then /squad status" from "Please /squad cast, then /squad status" … expected 'status'`.
   - (c) PC-1 loosened (accept first non-empty line): 9 red incl. the guard
     `PC-1 must still reject "implement" … expected 'implement' to be 'NO_COMMAND'` and the #1824 headline
     `We should improve the docs.` returned as prose.
   File restored via `git checkout --` after each; final tree clean.

6. **Tests 15 → 27 — VERIFIED.** `27 passed (27)`, clean.

7. **RETRO security contract, hop-1 UNMEASURED, gate deferred to #1834 — VERIFIED (by reading).**
   Text: "That gate is **not implemented**; it is tracked in #1834. This contract is normative today but reviewed by
   hand, not enforced by CI … hop 1 is unverifiable here, since this repository ships no compiled gh-aw output."
   Cannot be read as claiming enforcement that does not exist.

8. **PC-3 exit-non-zero recorded as a known limitation (my Finding 4) — VERIFIED (by reading).**
   "Known limitation — step 4 is an instruction, not an enforced exit code … That gap is inherent to gh-aw, not an
   oversight." Written down; no longer needs re-discovery.

##### The two probes the coordinator raised

- **Probe A — PC-0 `NR==1` leading-newline: MEASURED, mechanism REAL, NON-BLOCKING (nit).**
  `PC0($'\nimplement')→"EMPTY_DISPATCH"` and `PC0($' \nimplement')→"EMPTY_DISPATCH"` — a value that *carries*
  `implement` silent-halts. `PC0($'implement\nfoo')→"/squad implement"` (line 2 silently dropped);
  `PC0($'implement\r')→"/squad implement"` (CRLF handled). So the concern is real: `NR==1` + empty-first-line →
  `EMPTY_DISPATCH` → activation-guard silent halt, the exact defect class this PR closes.
  **Reachability (measured against the schema):** `command` is a `workflow_dispatch` string input
  (`squad.md:17-19`, `required:false`). Producers are (1) `squad-implement-worker.md:259` literal
  `"command": "implement"` — no newline; (2) the "Run workflow" UI — single-line field, cannot enter a newline;
  (3) a crafted REST/`gh api` dispatch with an embedded `\n` — possible but requires `actions:write` (a privileged
  actor). **Not reachable via either real producer or the UI; only via a hand-crafted privileged API payload.**
  **Untested** (no leading-newline fixture among the 27). Verdict: NON-BLOCKING (low severity, privileged + malformed
  surface), but a genuine latent silent-halt. Recommend closing cheaply: pin the behavior with a leading-newline test
  and/or have PC-0 scan the first *non-empty* line rather than hard-binding `NR==1`, so the halt is a deliberate choice.

- **Probe B — enumerate every caller: MEASURED, clean.**
  `grep` across `workflows/*.md` for JSON `"command":` producers → exactly **one**: `squad-implement-worker.md:259`
  (`"command": "implement"`). The only consumers of `inputs.command` are `squad.md:3` (run-name display) and
  `squad.md:139` (the value fed to PC-0). `squad-implement-worker.md`'s own `workflow_dispatch` inputs are
  `issue_number`/`aw_context` only — no `command`. **No third bare-command caller exists**; the "hardened in
  isolation" bug class has no other instance.

##### CI
All green: Diff Size Guard, Architectural Review, Security Review — Permissions & Secrets, test (4m51s), Policy Gates,
Changeset Drift, etc. `docs-quality` and `Scope Boundary` skipping. `MERGEABLE`/`CLEAN`.

##### Pass-3 verdict — APPROVE (merge as-is)
The pass-2 BLOCKING regression (Finding 2) is fixed **and** regression-guarded by input-naming tests; Finding 3 fixed;
the text contradiction resolved; all three mutations go red and name the offending input; the two inherent limits
(PC-3 exit; compiler-channel hop-1, #1834) are now written down rather than re-discovered. One NON-BLOCKING nit
remains: the PC-0 `NR==1` leading-newline silent-halt (Probe A) — latent, unreachable via known producers, untested;
worth a follow-up test + first-non-empty-line scan, not a merge blocker.
(Posted as `COMMENTED` — GitHub blocks a formal Approve from the PR-owning account.)


---

### 2026-08-22: RETRO security contract — /squad shell input channel

#### RETRO security contract — `/squad` shell input channel

**Scope:** PR #1832 / issue #1824, the `/squad` command parser in `workflows/squad.md`, and the gh-aw compiled workflow YAML produced from it.

**Threat model:** issue bodies, issue-comment bodies, issue titles, PR titles/bodies, and any other event field influenced by an external GitHub user are fully attacker-controlled. They may contain command substitutions, quotes, newlines, options, printf formats, awk escape sequences, and delimiter-looking text.

#### Normative text for `workflows/squad.md`

Paste the following block into `workflows/squad.md` as normative parser requirements.

````markdown
### Shell input security contract [MANDATORY]

The `/squad` parser treats issue bodies, issue-comment bodies, issue titles, PR titles/bodies, and any other GitHub event text as attacker-controlled.

**Mandatory channel:** attacker-controlled GitHub event text MUST cross from the GitHub Actions expression layer into shell only through named step/job environment variables. The shell MUST read those values only through quoted shell parameter expansion, for example:

```yaml
env:
  SQUAD_TRIGGER_BODY: ${{ github.event.comment.body || github.event.issue.body || '' }}
  SQUAD_TRIGGER_TITLE: ${{ github.event.issue.title || '' }}
run: |
  body="${SQUAD_TRIGGER_BODY-}"
  printf '%s\n' "$body" | awk '...' | grep -F -- '/squad'
```

**Forbidden anti-patterns:**

- `UNTRUSTED_TEMPLATE_IN_RUN`: never place `${{ github.event.comment.body }}`, `${{ github.event.issue.body }}`, `${{ github.event.issue.title }}`, PR title/body expressions, or expressions derived from them directly inside a `run:` block. This is unsafe even inside shell quotes because GitHub Actions template expansion happens before the shell starts.
- `UNTRUSTED_COMMAND_STRING`: never build shell syntax from attacker-controlled text. No `eval`, no `source`, no generated script text containing the body, and no `bash -c`/`sh -c` command string containing the body.
- `UNTRUSTED_PRINTF_FORMAT`: never pass attacker-controlled text as the first argument to `printf`. The first argument is the format slot and must be a literal such as `'%s\n'`; the body belongs only in an argument slot such as `printf '%s\n' "$body"`.
- `UNTRUSTED_AWK_PROGRAM_OR_VAR`: never interpolate attacker-controlled text into an `awk` program string. Do not pass the raw body through `awk -v`; `awk -v` performs escape-sequence processing on values and can mutate parser input. The raw body must reach `awk` on stdin, with a static single-quoted awk program.

**Per-hop requirements:**

1. **Actions assignment:** event text is assigned in YAML `env:` only. The compiled gh-aw workflow must not contain attacker-controlled `${{ github.event... }}` expressions in any `run:` block.
2. **Shell local variable:** if copied to a local variable, use ordinary assignment only, e.g. `body="${SQUAD_TRIGGER_BODY-}"`. Do not use `eval`, command substitution, here-doc script generation, or `bash -c` with the body.
3. **`printf`:** use `printf '%s\n' "$body"` or equivalent literal format. The body must be an argument slot, never the format slot.
4. **Pipe:** move the body between parser stages as stdin bytes. Do not re-materialize it into shell syntax between stages.
5. **`awk`:** keep the awk program static and single-quoted; receive the body from stdin. Use `awk` variables only for trusted parser constants, not the raw body.
6. **`grep`:** when matching attacker-controlled or user-derived literal text, use `grep -F -- "$pattern"` with the pattern quoted. `-F` makes the pattern fixed-string, not regex; `--` terminates grep option parsing so values like `-e` and `--version` are data, not flags.

**Verification requirement:** the repository gate must inspect the compiled gh-aw workflow output, not just this markdown. It must fail if any compiled `run:` block contains attacker-controlled GitHub event expressions, or if parser code passes a body variable as a `printf` format, into `eval`/`bash -c`, or into an awk program/`awk -v`. A gate that cannot turn red on a fixture containing `run: printf '%s\n' "${{ github.event.issue.body }}"` is not a valid gate.
````

End of pasteable block.

#### Evidence measured locally

Measurements were run with Git Bash in a scratch directory outside the repository and the scratch directory was deleted afterward.

##### Safe environment-variable channel

Payloads containing `$(touch owned)`, backticks, `"; touch owned #`, `%s%n`, `-e`, `--version`, and a no-command body were passed through:

```bash
cmd=$(printf "%s\n" "$SQUAD_TRIGGER_BODY" |
  awk '/\/squad/ { sub(/^.*\/squad[[:space:]]*/, "", $0); print; found=1; exit }
       END { if (!found) print "NO_COMMAND" }')
printf "%s\n" "$SQUAD_TRIGGER_BODY" | grep -F -- "/squad" >/dev/null
```

Measured result: `SAFE_PIPELINE_SIDE_EFFECT=NO`. No `owned` file was created.

##### Direct `run:` interpolation channel

A generated shell script equivalent to Actions template interpolation into `run:` was executed:

```bash
printf '%s\n' "/squad $(touch owned)" >/dev/null
```

Measured result: `DIRECT_INTERPOLATION_SIDE_EFFECT=YES`. The command substitution executed before `printf` received an argument. Shell quoting around the already-interpolated text did not protect it.

##### `printf` format slot

Measured:

```bash
BODY='literal\n%s%n'
printf '%s\n' "$BODY"
printf "$BODY"

BODY='prefix%n suffix'
target=before
printf "$BODY" target >/dev/null
printf '%s\n' "$target"
```

Results: argument-slot printing preserved the body literally; format-slot printing interpreted backslash and percent sequences. Bash `printf` `%n` assigned `target=6`. This is not the same as command execution, but it is a real parser-integrity bug and proves the body must never occupy the format slot.

##### `grep -F --`

Measured:

```bash
printf '%s\n' 'needle --version' | grep -F -- '--version'
printf '%s\n' 'needle -e'        | grep -F -- '-e'
printf '%s\n' 'literal .* [abc]' | grep -F -- '.* [abc]'
```

Results: all patterns matched as literal text. `--version` and `-e` were not treated as options, and `.* [abc]` was not treated as a regex. FIDO's claim is confirmed for the measured grep invocation shape: quoted pattern, `-F`, and `--` before the pattern.

##### `awk -v` and awk program interpolation

Measured:

```bash
awk -v body='line1\nline2' 'BEGIN { print body }'
printf '%s\n' 'line1\nline2' | awk '{ print }'
```

Result: `awk -v` converted `\n` into a newline; stdin preserved the literal backslash-n bytes. This is input mutation, distinct from shell injection.

Measured awk program injection with a generated program containing attacker syntax:

```bash
printf '%s\n' 'input' | awk '{ print ""; system("touch owned"); "" }'
```

Result: `AWK_PROGRAM_INTERPOLATION_SIDE_EFFECT=YES`. If attacker text is allowed to become awk program text, awk can execute commands through `system(...)`.

#### Verification shape

A compliant gate should run against the compiled gh-aw YAML. Source markdown checks are useful, but not sufficient.

Minimum static assertions:

1. Extract every compiled YAML `run:` block and fail on:
   - `\$\{\{[^}]*github\.event\.(comment\.body|issue\.body|issue\.title|pull_request\.body|pull_request\.title)[^}]*\}\}`
   - `printf[[:space:]]+["']?\$[{]?(SQUAD_TRIGGER_BODY|SQUAD_TRIGGER_TITLE|body|title)\b`
   - `\b(eval|source)\b.*\$(SQUAD_TRIGGER_BODY|SQUAD_TRIGGER_TITLE|body|title)\b`
   - `\b(bash|sh)[[:space:]]+-c\b.*\$(SQUAD_TRIGGER_BODY|SQUAD_TRIGGER_TITLE|body|title)\b`
   - `awk[^\n]*-v[^\n]*(SQUAD_TRIGGER_BODY|SQUAD_TRIGGER_TITLE|body|title)`
2. Include a positive-control fixture that must fail the gate:

   ```yaml
   run: |
     printf '%s\n' "${{ github.event.issue.body }}"
   ```

3. Include a dynamic parser test that executes the compiled parser path with payloads `$(touch owned)`, backticks, `"; touch owned #`, `%s%n`, `-e`, and `--version`, then asserts:
   - no sentinel side-effect file exists;
   - no `NO_COMMAND` path falls back to `cast`;
   - diagnostics do not cause additional command execution.

The instructions printed by the gate must identify the exact rule name above, for example `UNTRUSTED_TEMPLATE_IN_RUN`, so the failure is searchable and actionable.

#### Residual risk

I could measure POSIX shell behavior for the command shapes above. I could not determine whether the real gh-aw compiler currently emits a safe `env:` channel because no compiled gh-aw workflow lock/output for PR #1832 exists in this repository. The compiled output is where GitHub Actions template interpolation becomes executable shell text, so compliance remains unmeasured until a gate inspects that compiled artifact.


---

### 2026-08-22: Decision — /squad command parsing must fail loudly (#1824)

#### Decision — `/squad` command parsing must fail loudly (#1824)

**By:** Procedures (Prompt Architecture)
**Date:** 2026-08-22
**Issue:** #1824
**Files:** `workflows/squad.md` (Parse Command), `test/gh-aw-command-parse.test.ts`

#### Context

`/squad cast` silently no-opped with a green check unless the command started the
issue body. The `## Parse Command` section said *"Strip `/squad` prefix, trim
whitespace"* — a position-0 assumption — and had **no failure branch at all**.
There was no state in which the router reported "I did not understand this."
Success and no-op were byte-identical to a first-run user.

#### Decision

Two changes, in priority order.

1. **A no-op run must fail.** `Parse Command` now has an explicit `NO_COMMAND`
   outcome routed to a mandatory `Step PC-3` that emits `::error::`, posts a
   comment quoting the offending text, and exits non-zero. Defaulting to `cast`
   on an unparsed body is now explicitly forbidden. This is the load-bearing
   half: it converts every future variant of the bug from silent to visible.
2. **The scan reads the whole body.** The command is found wherever it sits.

#### Method — an executable contract, not prose

The parser is an LLM prompt, so there is no function to unit-test. Instead the
parse is expressed as two concrete shell commands embedded in the markdown, and
the test **extracts those exact commands from `workflows/squad.md` and executes
them** against real issue bodies. The two sources compared are the declared
contract and its observed behavior — neither re-reads the other. This follows the
existing TG-1 precedent in `test/gh-aw-quality.test.ts`.

#### What the mutation tests actually proved

**Mutation 1 — reintroduce position-0 anchoring, headings and prose untouched.**
Only **1 of 14** assertions caught it. The headline case — prose, blank line,
then the command, i.e. the literal #1824 scenario — **passed under the
reintroduced bug**. Cause: `^` in awk anchors per *record*, so a line-anchored
parser still handles a command sitting on its own line further down the body. The
blank-line case cannot distinguish a body-wide scan from a line-anchored one.

Two cases were added whose only job is to carry that weight: an **indented**
command and a **mid-sentence** command. Both are invisible to a line-anchored
scan. Re-running the mutation then produced 2 failures naming the specific input.
These cases look redundant with the blank-line case and are not; there is a
comment in the test saying so.

**Mutation 2 — replace PC-3's diagnostic with `echo 'unrecognized command'`.**
Every status-shaped signal stayed intact: `::error::` still present, PC-2 still
forbids the cast fallback, the run still fails. A status-only assertion passes
this clean — the exact shape that let a truncating parser through on #1793. It
was caught by 3 assertions, because they assert the diagnostic **contains the
offending text** rather than merely that a diagnostic exists.

#### Generalizable lessons

- **A red transcript is not automatically a good one.** Against pre-fix state the
  suite went 13/14 red, but on *"heading missing"* — structural, not behavioral.
  That proves coupling to the new contract, not sensitivity to a wrong parser.
  Only the mutations tested sensitivity, and they found the blind spot.
- **Test the anchor semantics you actually rely on.** A per-line `^` and a
  per-body scan agree on most realistic inputs. Pick cases where they disagree.
- **A skipped test is a permanently-green gate.** `HAS_POSIX_SHELL =
  existsSync('/bin/sh')` silently skips 102 behavioral assertions in
  `gh-aw-quality.test.ts` on every Windows machine. The new suite resolves Git
  Bash instead of skipping, and asserts that it found a shell — so a suite that
  could not run reports red rather than green.

#### Deliberate non-actions

- **The scan matches `/squad` inside quoted lines and fenced code blocks.**
  Excluding them would reintroduce a silent-skip path, which is the bug class
  being removed. gh-aw's `slash_command` trigger has already decided the run is a
  squad command by the time this prompt sees the body. Documented in-file.
- **The 102 `/bin/sh` skips in `gh-aw-quality.test.ts` were not fixed.** Real and
  worth a separate issue; out of scope for #1824 and would blow the diff budget.
- **#1812 not touched.** Confirmed separate: #1812 is in `plan activate`'s roster
  source, downstream of routing. It shares no code path with Parse Command.

### 2026-08-22: Roster provenance is certified by an emitting command (Team Guard Step TG-2), not by prose
**Date:** 2026-08-22
**Raised by:** Procedures
**Status:** Decided
**Issue:** #1812 (re-diagnoses #1784)

#### Context

`/squad plan activate` on fixture `aspiregregator-squad-e2e` (run `32471509974`) printed a
provenance sentence claiming it read the roster from `.squad/team.md` `## Members` → `Name`
column, and reported `lead, reviewer, devrel, security, docs`. The fixture's real cast is
`Keaton, McManus, Fenster, Hockney, Kint`. The five reported names are exactly the
`squad init --preset default` scaffold in
`packages/squad-sdk/src/presets/builtin/default/preset.json`. Two defects:

1. Activate bound against the hardcoded preset roster, not the repository's committed cast.
2. It **claimed provenance it did not have** — a wrong answer wearing a citation.

Downstream: at E4 the planner read `team.md` correctly and emitted the real names; activate
compared them against the hardcoded list, matched none, and applied **no** `squad:{agent}`
label. #1784's Condition 2 "passed" only because activate refused everything. **Refusal and
correct binding are indistinguishable from the outside** — the through-line of this workstream.

`workflows/squad.md` had already been hardened with bold, repeated prose instructing the agent
to read `## Members` from *this repository's* `team.md`, take the `Name` column verbatim, and
treat no other column as valid. That text was present; the defect happened anyway. A *declared*
requirement is not an *enforced* one.

#### Decision

Add **Team Guard Step TG-2 — Certify the Roster Set**: a bash block modeled on the existing
TG-1 line-444 `TEAM_PRESENT`/`TEAM_ABSENT` guard. It reads the **git-committed HEAD** revision
of `.squad/team.md` (`git show HEAD:.squad/team.md` — working-tree preset scaffolds are
invisible), finds the `Name` column of the `## Members` table **by header** (not by position),
and emits one lowercased `ROSTER_MEMBER: {name}` per data row — or a single
`ROSTER_UNREADABLE: {reason}` naming why (`absent from HEAD`, `no ## Members section`,
`no Name column in ## Members table`, `## Members has no data rows`).

Every downstream site that mints a `squad:{name}` label or binds an `Owner`/`Agent` value binds
**only** to TG-2's stdout. Because the summary can only reproduce `ROSTER_MEMBER:` lines the
command actually produced, **the provenance claim becomes true by construction**. On
`ROSTER_UNREADABLE:` the binder halts with the named reason — never a provenance sentence for a
read that did not happen, never a silent preset fallback.

#### Why structural, not more prose

The prose fix is the exact move that already failed here repeatedly, and is the anti-pattern
this workstream is clearing. TG-2's stdout is an **observable artifact of the run** that a test
can assert against; a prose directive's compliance cannot be observed. This is the same
distinction as TG-1's `TEAM_PRESENT`/`TEAM_ABSENT` — a requirement vs. a rule. Modeling on
PC-3 was explicitly rejected: PC-3's "exit non-zero on failure" is itself an unenforced prompt
directive (accepted limitation, #1824). TG-2 sits in the Team Guard family because the problem
**is** file provenance, not command-string normalization; modeling it on PC-* would have
manufactured a parallel structure rather than reusing the right one.

#### Why header-driven column detection, not `$2`

An earlier draft extracted a fixed column position. That silently binds the wrong data if a repo
authors `## Members` as `| Role | Name |` — it would emit the Role column, reproducing the exact
#1812 anti-pattern with a *true-looking* provenance claim. TG-2 instead scans the header row for
the cell whose trimmed text is `Name` and extracts that column; a table with no `Name` column
yields `ROSTER_UNREADABLE: no Name column in ## Members table` rather than a confident wrong
answer. (Mutation M2 proves this: pinning the column to position 2 reddens the header-order case,
naming the leaked `ROSTER_MEMBER: lead` / `reviewer`.)

#### Enforcement boundary — emission enforced, consumption directive (the good kind of unenforced)

TG-2 makes **emission** shell-enforced and assertable: the new test extracts the block and runs
it against real committed-HEAD git repos, proving the certified set is correct in isolation.
**Consumption** — the model actually binding only to `ROSTER_MEMBER:` lines — remains a prompt
directive. Nothing can compel the model to read its own emitted set. This is the *good* kind of
unenforced: like RETRO's hop-1 contract, the limitation labels itself. The defect was never an
unenforced directive; it was prose that read as a guarantee. This sentence stays in the record so
the boundary is named, not silent.

#### Postcondition `applied_labels ⊆ emitted_roster_members` is NOT reachable — named boundary

A machine-checked postcondition (a shell step asserting every applied `squad:{name}` label is a
subset of the emitted roster, failing loudly and naming the offending label) would close
acceptance 2a's second half by machine rather than by reviewer. It is **not reachable** under
gh-aw safe-outputs: the agent job runs read-only and writes `create-issue` requests to
`/tmp/gh-aw/safeoutputs/outputs.jsonl`; a **separate executor job** (with `issues: write`) applies
labels afterward. TG-2's stdout lives in the agent's bash sandbox and is not promotable to a
cross-job artifact the executor consumes; the only agent→executor channel is the model-filled
safe-output, which reintroduces the very model-memory trust the postcondition was meant to remove.
So emission is assertable in-run; consumption cannot be asserted at label-application time in this
architecture. Recorded as a boundary, not a silence — if safe-outputs later exposes the applied
set to a same-job shell step, this postcondition becomes worth its bytes and closes 2a fully.

#### CRLF / CR-strip could not be measured on this substrate — named boundary

TG-2's extraction carries `{sub(/\r$/,"")}` to normalize CRLF-authored `team.md` on Linux
runners. Mutation M8 (removing that strip) **could not be reddened** on the Windows git-bash test
host: `git show HEAD:.squad/team.md` there emits LF (git-for-windows normalizes CR out before awk
sees it, despite `core.autocrlf false`), and for regular GitHub tables the trailing pipe already
quarantines any CR into a post-pipe field that is never read. Two empirical probes (with/without
strip, on trailing-pipe and Name-last-no-trailing-pipe CRLF fixtures) produced identical clean
output. The strip is **retained as defense-in-depth** (correct and load-bearing on Linux runners
for irregular tables); its load-bearing behavior is **reasoned for Linux, not measured on
Windows**. The dedicated CRLF test was rewritten to assert the end-to-end parse invariant (clean
lowercased cast from a CRLF file) — which *is* reddenable (mutations M1/M4 flip it, naming the
offending `ROSTER_MEMBER:` output) — and no longer claims to prove the strip in isolation.

#### Prose removed — enumerated, each checked against `test/gh-aw-*`

The verbose per-site roster prose was superseded by TG-2 emission + short binders that point at
the certified set. Removed / compressed blocks: the plan `Owner/Agent binding rule` sub-steps
(a–d) → one binder paragraph; the plan `Owner` re-check reminder → one pointer; the accept
`squad:{owner}` minting paragraph → TG-2-bound sentence; the impl `Agent binding rule` working-
notes paragraph → TG-2-bound sentence; the impl `Agent` re-check reminder → one pointer; the
Check 10 four-step block → TG-2-bound restatement. Every test-pinned substring was verified to
survive: `Owner/Agent binding rule` (plan), `Agent binding rule` + `appears verbatim in the
`Name` column` (impl), `Name` column (all binders), the Check 10 `Never report a value as a
valid roster name unless …` sentence, and the no-backticked-role-token invariant across all five
skill blocks. All four existing gh-aw suites + the new one pass (172 passed / 13 skipped), which
confirms no pinned assertion was dropped. No prose was removed that a `test/gh-aw-*` test asserts
on.

#### Caller enumeration (FIDO requirement)

Every roster/owner/agent site across `workflows/` was enumerated:

**Minting / binding — all bound to TG-2's certified set:**
- `squad.md` accept `squad:{owner}` mint (§ "For each work item, create-issue")
- `squad.md` activate Label Pre-flight gate `squad:{agent}` (runs TG-2, false-provenance
  defenses, ≥1-label completeness rule) — governs the epic/task label declarations that follow it
- `squad.md` plan `Owner/Agent binding rule`
- `squad.md` impl `Agent binding rule` + its validation check
- `squad.md` Check 10 roster validation

**Pure consumers — NOT #1812 vectors (no independent roster derivation):**
- `squad-implement-worker.md` "Route work to the member named by the `squad:{member}` label" —
  consumes an already-certified label; reads `team.md` only for that member's charter/routing.
- `shared/squad.md` `squad init` cast-preservation guard (#1657) — existence check via
  `grep -q '^[|]'`, no name extraction for labels; aligned with the anti-preset-clobber intent.

No second minting path shares the defect. No compiled `.lock.yml` artifacts are committed
(gh-aw compiles at deploy time), so no regeneration is required.

#### Risk

Consumption remains model-trusted (see boundary above). If a future gh-aw version exposes the
applied-label set to a same-job shell step, add the subset postcondition to machine-check
acceptance 2a's second half. Until then, the ≥1-label completeness rule (activate must apply at
least one `squad:{agent}` label, else fail) is the guard that keeps "refused everything" from
masquerading as "bound correctly" — the failure mode that gave #1784 its false pass.

### 2026-08-22: FIDO adversarial review — PR #1837 (Closes #1812, roster false-provenance)

**Reviewer:** FIDO (tests & quality / CI gates)
**PR:** #1837 `bradygaster-activate-roster-binding-1812` → `dev` · +531/−61 · 3 files · `MERGEABLE`/`CLEAN`
**Worktree measured in:** `C:\src\copilot-worktrees\squad\bradygaster-automatic-broccoli` (HEAD `41d3058b`, node_modules present)
**Method:** measure, don't reason. Every claim reproduced independently; every mutation required to go RED *and name the offending input* (a status-only assertion passes a truncating parser).

#### VERDICT: APPROVE WITH NITS

TG-2 makes roster **emission** shell-enforced and every one of the new assertions is failable (7 mutations, all red + naming input). The compression dropped nothing load-bearing — all four legacy constraints survived and several were strengthened by re-keying to TG-2's certified stdout. Both honesty claims verified by measurement, not taken on trust. One real single-source-consistency nit (L1117), non-blocking because the authoritative downstream gate (Check 10) is correctly TG-2-bound.

---

#### Standing asks — all MET

##### 1. Per-case mutation evidence, naming the offending input
Ran against `test/gh-aw-activate-roster-binding.test.ts` (10 tests, ~5.5s). Each mutation applied to `workflows/squad.md`, run, restored via `git checkout --`.

| Mutation | Target | Result | Names input? |
|---|---|---|---|
| **M1** drop `tolower(n)` | lowercasing | RED (4 failed) | ✅ `got: ROSTER_MEMBER: Kint` (uppercase leaks) |
| **M2** pin `col=2` (position, not header) | #1812 anti-pattern | RED (2 failed) | ✅ leaks `ROSTER_MEMBER: lead`/`reviewer` on Role-first table + no-Name-col test |
| **M3** drop `__NOCOL__` sentinel | reason specificity | RED (1 failed) | ✅ names the *specific* reason (`no Name column` vs `no data rows`), not status-only |
| **M4** `git show HEAD:`→`cat` | committed-HEAD read | RED (2 failed) | ✅ extraction-guard fails + working-tree preset leak test names the leak |
| **M5–M7 + 4th** each `ROSTER_UNREADABLE:` echo → `ROSTER_MEMBER: ghost{n}` | all 4 named reasons | RED (5 failed) | ✅ e.g. `no member may be emitted without a Name column; got: ['ghost3 no name column']` |

All 7 structural mutations red **and** name the input. No vacuous/status-only assertions found.

##### 2. Caller enumeration — cross-checked, incl. OUTSIDE `workflows/`
- Coordinator's two "not a vector" claims **hold**: `shared/squad.md` is a `grep -q` existence check (#1657, extracts no names); `squad-implement-worker.md` **consumes** an already-certified `squad:{member}` label (reads team.md only for that member's charter) — never mints from roster.
- **Repo-wide grep outside `workflows/`** (`packages/`, `scripts/`): every `squad:{member}` hit is a template/changelog/CLI consumer that **reacts to already-applied labels** (`ralph-commands.ts` lists issues by label) or **produces** team.md itself (`cast.ts`, `team-md.ts`). **None** reads team.md's `Name` column to mint a label. The only roster→label minting path is `workflows/squad.md`, now TG-2-bound. **No third caller** — the #1832 caller-blindness trap is clean here.

##### 3. Each new assertion proven failable — see table above. Confirmed.

---

#### Honesty claims — both VERIFIED by measurement

##### Claim 1 — M8 (CR-strip) could not be reddened on Windows git-bash
**Measured:** removed BOTH TG-2 `sub(/\r$/,"")` strips (presence-check awk + extraction awk), re-ran the CRLF test → **still PASSES (1 passed)**. Confirms the strip has no observable effect on this substrate: a GitHub table row `| Keaton | Lead |\r` splits under `-F'|'` so the CR lands in the post-last-pipe field ($4), never read; the extracted name ($2) carries no CR. Procedures retained the strip as **reasoned-for-Linux defense-in-depth** and rewrote the CRLF test to assert the **end-to-end parse invariant** (reddenable by M1/M4), *not* the strip. The test claims only what it proves. **Honest.**
**#1833 compounding:** does NOT compound it. #1833 is `gh-aw-quality.test.ts` (POSIX-gated tests skip on Windows). This NEW suite ran **10/10, 0 skips** on this box — `resolvePosixShell()` falls back to Git-for-Windows `bash.exe`, and the first test hard-fails if no shell resolves, so a skipped suite cannot masquerade as green.

##### Claim 2 — postcondition `applied_labels ⊆ emitted_roster_members` not assertable in-run
**Measured against the actual frontmatter** (`workflows/squad.md` L28–32): the agent job has **`issues: read`, NOT `issues: write`**. It cannot apply labels directly. Labels flow through the `create-issue` safe-output (L97–98, `labels: [squad]`), executed by a **separate gh-aw executor job** with elevated perms. TG-2's stdout lives in the agent's bash sandbox and genuinely cannot cross into the label-applying job; the only agent→executor channel is the model-filled safe-output. So the subset postcondition is **not shell-assertable in-run** — the architectural claim is **correct**. Consumption stays a model-filled directive: the acceptable "self-labeling" form (like RETRO's hop-1 contract, #1834). Emission is shell-enforced/assertable (what the 10 tests measure); consumption is prose-directed. Correct given gh-aw's read-only-agent + separate-executor model.

---

#### Completeness rule (#1784 Condition-2) — CONFIRMED
Activation step 6 (added): *"when the plan names at least one roster `Agent`, at least one `squad:{agent}` label MUST be applied… Zero labels on a plan with roster owners is a binding failure, not a pass — report it, don't proceed silently."* This directly prevents "refused everything" from masquerading as "bound correctly" — the exact false-pass that gave #1784 its green. It is necessarily a directive (label application lives in the executor job, per Claim 2), which is the correct/only form available.

#### Prose compression — nothing load-bearing removed
Examined the **authoritative** −61 (my local `dev` was stale; local `dev...HEAD` showed +366/−66 polluted by ~286 lines of unrelated drift — reconciled against `gh pr diff`, squad.md = +80/−61). All −61 is the OLD file-based "read team.md, copy the Name column verbatim, trust your recall" binding language — the untrusted-source pattern #1812 is about — replaced by TG-2's certified `ROSTER_MEMBER:` binding. Every load-bearing constraint survived:

| Constraint | Removed? | Survives in +80? |
|---|---|---|
| Role-column exclusion (anti-#1812) | yes (old prose) | ✅ all 3 rewired sites: "no other column, the `Role` column included" |
| "no roster → ❌ Critical → stop" (#1784) | yes | ✅ Check 10 step 1, now keyed on `ROSTER_UNREADABLE:` (stronger) |
| "name the offending value" | yes | ✅ Check 10 step 4 |
| lowercasing | yes | ✅ activation step 4 + TG-2 `tolower` at source |

Cross-checked against Procedures' own enumeration in the shipped decision record — all test-pinned substrings survive; suite green confirms no dropped assertion.

---

#### THE FINDING (coordinator's main ask) — L1117, adjudicated

`workflows/squad.md` has **three** validation sites; the PR rewired two and left one:
- **L1111** (Step 2, Agent binding rule) → binds to **TG-2 certified set** ✅
- **L1165–1179** (Check 10, in `squad-plan-validate`) → rewired to **`ROSTER_MEMBER:`** ✅
- **L1117** (Step 3, "Validate Structure", inline pre-check during impl-plan drafting) → **STILL names the file**: *"agent validity (every `Agent` value appears verbatim in the `Name` column of the `## Members` table in `.squad/team.md`, or is `@copilot`)"* ❗

Confirmed unchanged by this PR (not in the −61 or +80). Procedures' shipped caller enumeration lists four TG-2-bound sites and does not mention this one — it was overlooked.

**Adjudication: REAL inconsistency, NON-BLOCKING nit.** (Reasoned, not shell-measured — L1117 is LLM prose, not executable.)
- Non-blocking because: the authoritative **minting** site (accept `squad:{owner}`) and the authoritative **gate** (Check 10, a separate `squad-plan-validate` run) both bind to TG-2. L1117 is an *inline sanity pre-check* during impl-plan generation, re-validating `Agent` values that Step 2's binding rule already sourced from TG-2, in the same agent context where TG-2 stdout is present. Any leak it misses is caught downstream by the TG-2-bound Check 10 before activation.
- But it is a real should-fix: it reintroduces the untrusted source (file/recall) *at a validation gate* — the exact residual shape ("the criterion a check applies is part of the check") that let #1812 recur 5×. A future refactor that removed Check 10 would leave L1117 as the only gate, naming the wrong source.
- **Fix (one line, trivial):** rebind L1117 to *"appears in Team Guard Step TG-2's certified roster set (`ROSTER_MEMBER:` lines), or is `@copilot`"* to match L1111/Check 10.
- (Note: L1250, the revise-path "agent validity (scoped to target items)", does NOT name the file — benign, leave it.)

#### CI — all green
`gh pr checks 1837`: **`test` = pass (4m41s)**; Architectural Review, Security Review, Diff Size Guard, Policy Gates, Changeset Drift, Lint, Bootstrap Protection, Squad File Leakage, readiness, impact, samples-build, sdk-exports-validation all pass. Two expected path-filter skips (docs-quality, Scope Boundary). Local suite 10/10, tree left clean.

---

#### Fix routing
Only nit is the L1117 one-liner. Procedures is locked out of its own revision under reviewer protocol → if the coordinator wants it fixed pre-merge, name **EECOM** (or fold into a fast follow-up). It does **not** block merge. **Recommend: merge as-is, L1117 as a tracked one-line follow-up.**

— FIDO, 2026-08-22T21:20-07:00

### 2026-08-22: A requirement with no observer is documentation, not a rule (declared vs. enforced)

**By:** Flight (Lead), requested by bradygaster

**Principle (quotable):** *A requirement expressed only as prose — in a prompt or a document — is not enforced. If compliance and non-compliance produce identical observable output, the requirement will be violated in plain sight and nothing will turn red. If a rule matters, something must be able to observe its violation and fail.*

**The test to apply to anything you write as a "requirement":** *If this rule were violated right now, what turns red? If the answer is "nothing," it is documentation, not a rule — either label it as unenforced or build the gate.*

#### Why this is distinct from "a permanently green gate is no gate" (2026-08-20)

The 2026-08-20 test bar (`### 2026-08-20: Test bar for the gh-aw workstream`, `git grep -n 'Test bar for the gh-aw'`, restated at `git grep -n 'permanently green gate'`) presupposes a gate **exists** and asks whether it can fail: a check whose output is constant regardless of input is worthless. The #1793 refinement (`git grep -n 'instructions a gate prints'`) extended that inward — *the instructions a gate prints are part of the gate*, so a remediation hint scoped narrower than the check (verify `*.mjs` / 42 paths for a check covering 174) is the same defect. This principle sits one step **earlier** on the same spectrum: it is about requirements that were **never gates at all** — prose with no observing mechanism whatsoever. There is no gate to be green or red; there is nothing to observe. The three form a ladder:

- (0) **no observer exists** — this record
- (1) an observer exists but structurally cannot fail — permanently-green
- (2) an observer can fail but its paired instructions cannot — #1793

Distinct failure, distinct fix. This is not a restatement.

#### Five confirmations in one working day (measured this session)

*Provenance caveat: instances 1 and 2 are verified from this session's evidence, not from the tree that recorded this file. This worktree is 2 commits behind `origin/dev` (1208 vs 1365 lines; `PC-3` 0/6, `UNTRUSTED_` 0/4). Every `workflows/squad.md` citation in this record is a **content anchor** (`git grep -n …`), not a line number — precisely because the same text sits at different lines in the two trees (the `TEAM_PRESENT` guard is L287 here, L444 on dev; the `Name`-column prose is 674/683/704 here, 831/840/861 on dev). Anchors revalidate on read; line numbers drift silently and stay syntactically plausible. A record about false provenance must not itself carry unverified provenance.*

1. **PC-3's "exit non-zero" is a prompt directive, not code.** The `/squad` router defines preconditions PC-0..PC-3 in `workflows/squad.md`; PC-3 instructs the agent to exit non-zero on failure, but the agent chooses its own exit status — nothing enforces it. Accepted as a known limitation in #1824. The mitigation that *works*: steps 1–3 emit output that survives the run and can be asserted afterward, independent of exit status.

2. **RETRO's shell-input security contract is prose — and correctly says so.** Its hop-1 requirement (attacker-controlled event text reaches shell only via named `env:` vars) defines four greppable anti-pattern tokens (`UNTRUSTED_TEMPLATE_IN_RUN`, `UNTRUSTED_COMMAND_STRING`, `UNTRUSTED_PRINTF_FORMAT`, `UNTRUSTED_AWK_PROGRAM_OR_VAR`). The compiler-channel hop is explicitly **unmeasured** (this repo ships no compiled gh-aw output) and the gate is deferred to #1834. This is the **positive** example, not a failure: a declared requirement that openly labels itself unenforced and files the gate is far safer than one that reads as a guarantee.

3. **Scribe's Archival Safety Rules A–E were violated while sitting in Scribe's own prompt.** In one run Scribe: (a) reported a decisions.md count of "31 + 3 = 34" when measured was 48 → 56; (b) reported "History summarization: SKIPPED — no moves performed" while rewriting `eecom/history.md` by +67/−50 lines; (c) later read a **line count of 129 as a byte count** and declared recoverable history unrecoverable. Rule D ("never report a gate outcome you did not measure") was broken three ways while Rule D was in the prompt. Two-day prehistory: a 2026-08-20 run trimmed **eecom, pao, and procedures** histories, each citing the same archive file (`history-archive-2026-08-20T11-59-44-0700.md`) that was never committed — three dangling pointers from one run, `git status` clean for two days (#1826). The commit that performed the loss, `c508d866` (2026-08-20 13:41), was titled *"chore(squad): record gh-aw triage session state and repair archives."* — it **asserted repair in its own message while performing the loss** (pao 13,605 B → 3,636 B, procedures 13,653 B → 3,997 B) and read as evidence of repair for two days. A commit message is a declaration with nothing enforcing it. Content stayed recoverable at commit `3dace32e` — the blob measures **15,063 bytes** (`git cat-file -s 771d9e0d`), the one figure no shell layer can reinterpret. **Decisively:** merged PR `f4cfaca3` (#1782) had already repaired this identical failure on 2026-08-19; its remedy was a content fix *plus adding Rules A–E to the prompt*. The prose remedy did not prevent recurrence one day later. Now #1836.

4. **#1812 — activate's roster binding has been prose-hardened five times and still fails.** `workflows/squad.md`'s `Name`-column binding prose (``git grep -n 'Name` column'``) instructs to read the `## Members` table from `.squad/team.md` and bind against the `Name` column verbatim. Measured: activate reported *"Roster set read from `.squad/team.md`"* while listing `lead, reviewer, devrel, security, docs` — the `squad init --preset default` scaffold, not the fixture roster (`Keaton, McManus, Fenster, Hockney, Kint`). Two defects: wrong source, and **false provenance** — a wrong answer wearing a citation.

5. **#1784's Condition 2 passed for the wrong reason.** Downstream of #4: the planner read `team.md` correctly, activate compared against a hardcoded list, matched nothing, and therefore applied **no** label. The acceptance condition "passed" only because of that refusal. "Refused everything" and "bound everything correctly" were indistinguishable to the check.

**Recurring sub-pattern (instances 3 & 4):** an unenforced prose requirement does not merely fail silently — it can emit an affirmative **false claim of compliance** ("Roster set read from team.md", "History summarization: SKIPPED"). False provenance is the worst case of declared-not-enforced.

#### The fix shape — the structural counter-example

The `TEAM_PRESENT` / `TEAM_ABSENT` guard in `workflows/squad.md` (`git grep -n TEAM_PRESENT`) is the pattern that works:

```
git show HEAD:.squad/team.md | awk '…/^## Members/…' | grep -q . && echo TEAM_PRESENT || echo TEAM_ABSENT
```

A command whose **output survives the run and can be asserted afterward** — an observable artifact, not an instruction the agent may or may not honor. In every failing instance above the requirement produced no observable artifact, so compliance and non-compliance looked identical. The actionable form of the principle: **convert requirements into emitted artifacts a later step asserts against — make provenance true by construction, not asserted in prose.** And prefer **anchors that revalidate on read** (a grep) over **coordinates that drift** (a line number): Procedures grep-anchored every #1812 edit, this session's stale line numbers reached it, and nothing needed redoing — the same claim, checkable at read time instead of asserted once and left to rot. Drift pressure is proportional to a file's writer count: `decisions.md` carries a **union merge driver** and every agent appends to it concurrently, so its lines move without anyone editing near them — the permanently-green restatement drifted from ~L604 to L598 inside a single session today, unannounced. It is the highest-drift file in the repo and therefore the **last** place a line number should ever be cited. The useful form of the rule is not "line numbers drift" but "predict which citations rot first, and anchor those hardest."

#### Corollary — a measured number that misstates its unit is the same collapse

Declared-vs-enforced is *"nothing can observe the violation."* This is its neighbour on a different axis: *"the observation happened, but the number does not mean what it claims."* Both collapse the same way — **a report that reads as verification but is not one** — which is why this is a corollary of the principle, not a separate one: same failure surface, different mechanism (missing observer vs. mislabelled observation). Same working day, one `eecom/history.md` blob, four agents:

- Scribe read a **line count (129) as a byte count** and nearly declared real history unrecoverable;
- Scribe reported an **estimated** decisions.md entry count (34) against a measured 56;
- Scribe asserted "no moves performed" while making a +67/−50 rewrite;
- Flight (this Lead) reported **CRLF-inflated `Out-String` chars** as the file size — while lecturing Scribe on measurement discipline in the same message;
- Lead and coordinator produced **92 vs 129 lines** for the same blob with no unit stated (non-blank vs total — both correct, neither comparable).

The blob read as **15,063 / 14,989 / 14,861 chars** and **129 / 92 lines** across agents; every figure was "right" under some methodology and none were comparable.

**The terminal form — a false number that becomes a false verdict.** Asked to recover pao and procedures, Scribe reported *"PAO & Procedures: UNRECOVERABLE — pre-summary versions not found in git history (all commits < 10KB)."* pao has **41 commits at 13,605 bytes**; procedures ~30 at **13,653** — both above the stated 10 KB threshold, both sitting in git, and the content was recovered from the very blobs the sweep declared absent. The prior five mis-stated a *measurement*; this one converted an unreproducible number into a **conclusion to stop looking**. That is the failure mode's endpoint: not a wrong figure in a report, but a wrong figure used to close the investigation.

**Two actionable rules:**
1. **State the unit and the command that produced every number.** `15,063 bytes (git cat-file -s)` is checkable; a bare `15,119` is not.
2. **Prefer a measure nothing can reinterpret.** During Scribe's repair, char count, line count, and heading-containment checks **all passed** on a file carrying a UTF-8 BOM and a stripped trailing newline; only the **blob SHA** caught it. That is the parent principle turned on the checks themselves — three observers that structurally could not see the failure, and one that could. A size-or-growth heuristic is one rung more dangerous than the BOM case — not a check that was fooled, but one that could never be right:

| agent | pre-trim | today | non-blank lines still missing |
|---|---|---|---|
| pao | 120 / 13,605 B | 114 / 10,634 B | 44 |
| procedures | 119 / 13,653 B | 135 / **15,370 B** | 35 |

`procedures` is 1,717 bytes **larger** today and still missing 35 lines — later sessions appended while the trimmed material stayed gone, so every size or growth check reports it healthy. Only content comparison detects it.

#### The honest boundary — when prose is legitimate

Prose is not worthless, and "never write prose requirements" would be wrong and ignored. Prose is legitimate when **all** of these hold:

- it is **explicitly marked unenforced** (RETRO's contract, instance 2, does exactly this);
- a **gate issue is filed alongside it** (RETRO → #1834), so the enforcement gap is tracked, not lost;
- the reader is **not misled** into believing it is a guarantee.

The failure is not prose — it is prose that *reads as enforcement*. Instance 2 is good practice; instances 1, 3, 4, 5 are the same words without the label. Apply the test above to every rule you write; if nothing turns red on violation, add the "(unenforced)" label and the gate issue, or build the observer.
