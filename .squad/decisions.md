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


### 2026-08-13: Restore shared ancestry between dev and main via merge, dev-wins conflict policy

#### Context

`dev` and `main` had unrelated git histories. `dev`'s root commit (`4c5772c5`, a
dependabot bump dated 2026-07-13) shares no ancestor with `main`'s root
(`f4830e48`, 1722 commits). `dev` itself has 196 commits. `git merge-base
upstream/dev upstream/main` returned nothing and `git merge-tree` refused
outright. This made the v0.12.0 promotion PR (#1698, `dev` -> `main`) flatly
unmergeable, with no way to review a normal diff. The v0.11.0 promotion
(2026-06-29) predates the July 13 reset, which is why it worked and why
#1698 was the first to hit this wall.

#### Decision

Merge `upstream/main` into `dev` with `--allow-unrelated-histories`, resolving
every one of the 275 conflicts in `dev`'s favor, on a new branch
`squad/restore-main-ancestry`, landed via PR #1699 into `dev`.

Rejected alternative: rebasing `dev` onto `main`. `dev` carries a
`non_fast_forward` ruleset that blocks the force-push a rebase requires, and a
rebase would rewrite all 196 commits on `dev`, invalidating every PR currently
open against it. A merge is additive only and needs no force-push.

#### Why dev-wins conflict resolution is safe

All 275 conflicts were `add/add` (identical path on both branches, no common
base to 3-way merge from). Resolved every one with `git checkout --ours` (dev's
content). This is safe because the only `main`-only code fix that mattered,
#1415 (`tools: ['*']` in `.github/agents/squad.agent.md`), was verified already
present on `dev` before starting the merge, so dev-wins loses zero code.
Verified the resolution was a true no-op against dev's pre-merge tree: diffing
all 275 resolved files plus the 48 removed changesets plus the 6 auto-merged
files against dev's HEAD showed only 18 real changes total, exactly the
files deliberately kept (see below). Confirmed unchanged post-merge:
`package.json` / `packages/squad-cli/package.json` / `packages/squad-sdk/package.json`
(all `0.12.0`), `CHANGELOG.md` (`## [0.12.0] - 2026-08-12` intact),
`test/gh-aw-quality.test.ts` (#1697 fix intact), `workflows/squad.md` and
`workflows/squad-implement-worker.md` (#1682 feature intact).

#### What was restored (kept from main, lost in the July 13 reset)

7 docs pages:
- docs/src/content/blog/015-wave-2-the-repl-moment.md
- docs/src/content/blog/032-v010-stabilisation-insider.md
- docs/src/content/blog/033-swe-bench-lite-results.md
- docs/src/content/docs/features/remote-control.md
- docs/src/content/docs/get-started/choosing-your-path.md
- docs/src/content/docs/guide/personal-squad.md
- docs/src/content/docs/guide/shell.md

5 decision records:
- .squad/decisions/inbox/booster-ci-deletion-guard.md
- .squad/decisions/inbox/booster-release-skill-v094.md
- .squad/decisions/inbox/flight-versioning-policy.md
- .squad/decisions/inbox/procedures-fix-coordinator-inline-dispatch-gate.md
- .squad/decisions/inbox/retro-copilot-git-safety.md

Plus 6 files that auto-merged cleanly via a genuine 3-way merge (not a
conflict), appending older history from main onto dev's existing content with
no loss on either side: `.squad/agents/{eecom,fido,flight,pao,procedures}/history.md`
and `.squad/decisions.md`.

#### What was dropped

48 `.changeset/*.md` files that arrived from `main`. These are spent: their
content is already consumed into `CHANGELOG.md`'s `[0.12.0]` entry, and
re-adding them risked tripping the Changeset Drift check. `.changeset/` after
this merge contains exactly what `dev` had before: `README.md`,
`config.json`, `max-reasoning-effort.md`.

#### Validation

Static/diff verification was thorough (see above). Dynamic validation
(`npm run build`, `npx vitest run`) could **not** be executed in this sandbox:
the corporate npm proxy does not mirror `eslint-plugin-n@18.3.0` (its cache
tops out at 18.2.2) and there is no direct route to the public npm registry
from this environment. Confirmed unrelated to the merge:
`package-lock.json`'s staged content is byte-identical to dev's pre-merge
HEAD, and this exact dependency/version was already in dev's lockfile before
any of this work. CI (which has full registry access) is the source of truth
for build/test validation on PR #1699.

#### Outcome

`git merge-base <this-branch> upstream/main` now succeeds, confirming `dev`
has a real common ancestor with `main` again. This unblocks PR #1698 and
prevents the same failure on future promotions, provided the new release-process
skill gate (verify `git merge-base dev main` before starting release-prep) is
followed going forward.

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
