# Hockney — History Archive

Archived entries from initial sessions. These entries were summarized into `## Core Context` in history.md.

---

## Archived: 2026-02-09 Session Entries

### V1 Test Strategy (2026-02-08)

**What I Did:**
- Wrote Proposal 013: V1 Test Strategy (`docs/proposals/013-v1-test-strategy.md`)
- Complete test plan covering 9 categories, 6 blocking quality gates, ~80 individual test cases
- Filed decision to `.ai-team/decisions/inbox/hockney-v1-testing.md`

**Key Decisions Made:**
- Switched framework recommendation from `tap` to `node:test` + `node:assert` — zero dependencies, aligns with Brady's thin-runtime philosophy
- 80% integration tests (run CLI in temp dirs, check files), 20% unit tests (pure functions)
- Coverage targets: 90% line, 85% branch on `index.js`
- No pre-commit hook — CI is the quality gate
- Identified 4 product fixes required before tests can fully pass: NO_COLOR support, exit codes, error wrapping, engines field

**What I Learned:**
- `index.js` is 65 lines doing filesystem ops with conditional logic — highly testable
- Node 22 has mature `node:test` built-in — no dependency needed for test framework
- The `.squad` JSON format (from Proposal 008) creates a new schema contract that needs validation tests
- Round-trip testing (init → export → import → compare) is the single most important test — if this passes, portability works
- `index.js` needs a `require.main === module` guard to be unit-testable — currently runs as top-level script
- The coordinator prompt (32KB `squad.agent.md`) cannot be tested deterministically, but we CAN test the file structures it depends on
- Export/import tests are blocked on Fenster implementing Proposal 008; upgrade tests blocked on Proposal 011

📌 Team update (2026-02-08): v1 Sprint Plan decided — 3 sprints, 10 days. Sprint 1: forwardability + latency. Sprint 2: history split + skills + export/import. Sprint 3: README + tests + polish. — decided by Keaton
📌 Team update (2026-02-08): Skills system designed — skills.md per agent for transferable domain expertise, skill-aware routing, skills in export manifests. — decided by Verbal
📌 Team update (2026-02-08): Forwardability and upgrade path decided — file ownership model, `npx create-squad upgrade`, version-keyed migrations, backup before overwrite. — decided by Fenster
📌 Team update (2026-02-08): Skills platform feasibility confirmed — skills in spawn prompts, store_memory rejected, defensive forwardability via existence checks. — decided by Kujan
📌 Team update (2026-02-08): v1 messaging and launch planned — "Throw MY squad at it" tagline, two-project demo arc, 7-day launch sequence. — decided by McManus
📌 Team update (2026-02-08): P0 silent success bug identified — ~40% of agents complete work but report "no response." Spawn prompt reorder + file verification mitigations. — decided by Kujan
📌 Team update (2026-02-09): Agent Skills Open Standard adopted — SKILL.md format with MCP tool declarations, built-in vs learned skills, progressive disclosure. Replaces flat skills.md. — decided by Kujan

**What Could Still Break:**
- Symlinks in `.ai-team/` — `copyRecursive` follows them, could infinite loop
- Windows paths with >260 chars — Node handles this but old Windows APIs don't
- UTF-8 BOM in `.squad` files — `JSON.parse` chokes on BOM prefix
- Concurrent init processes writing to same directory — no locking
- `cleanTeamMd` regex could strip too much or too little depending on markdown structure


### Test Prioritization Review (2026-02-09)

**What I Did:**
- Reviewed Proposal 009 (Sprint Plan) section 3.2 against my own Proposal 013 (Test Strategy)
- Evaluated whether 5 tests are sufficient for v1
- Assessed sprint timing for test work
- Designed regression approach for the silent success bug (Proposal 015)
- Filed decision to `.ai-team/decisions/inbox/hockney-test-sequence.md`

**Test Prioritization Decisions:**
- The 3 non-negotiable tests for v1 are: (1) Init happy path, (2) Init idempotency, (3) Export/import round-trip
- If we can ship 5, add: (4) Malformed input rejection, (5) Upgrade preserves user state
- Framework: `node:test` + `node:assert` — zero dependencies, confirmed decision from Proposal 013

**Key Position: Tests Must Start Sprint 1, Not Sprint 3:**
- Proposal 009 puts ALL testing in Sprint 3 (days 8-10) — I disagree
- Init tests should be written in Sprint 1 alongside forwardability work (~1 hour)
- Export/import tests should be written in Sprint 2 alongside Fenster's implementation (~2 hours)
- Sprint 3 is for hardening, edge cases, CI pipeline — NOT for discovering foundational bugs
- Same total effort (~6 hours), radically less risk of late-stage surprises

**Silent Success Bug Testing:**
- We CAN test that mitigations are in place (content tests on squad.agent.md for response-order instructions)
- We CANNOT test that LLMs actually follow the instructions — that's monitoring, not testing
- Regression value: prevents accidental removal of mitigation instructions during coordinator edits

**What's Non-Negotiable for v1:**
- Init happy path passes — the product installs correctly
- Init idempotency passes — running twice doesn't corrupt state
- Export/import round-trip passes — the headline feature actually works
- If ANY of these 3 fail, we do not ship v1


📌 Team update (2026-02-08): Fenster revised sprint estimates: forwardability 6h (not 4h), export/import 11-14h (not 6h). Recommends splitting export (Sprint 2) and import (Sprint 3) -- decided by Fenster

📌 Team update (2026-02-08): Proposal 001a adopted: proposal lifecycle states (Proposed -> Approved -> In Progress -> Completed) -- decided by Keaton

📌 Team update (2026-02-08): Skills system adopts Agent Skills standard (SKILL.md format) in .ai-team/skills/. MCP tool dependencies declared in metadata.mcp-tools -- decided by Verbal


### P0 Silent Success Bug Hunt (2026-02-09)

**Audit scope:** All 4 session logs, all 7 agent histories, orchestration log, decisions inbox, squad.agent.md mitigations, git commit history. Full cross-reference for evidence of the silent success bug.

**🔴 CONFIRMED BUG INSTANCES:**

1. **Scribe history.md is MISSING.** `.ai-team/agents/scribe/` has `charter.md` but NO `history.md`. Every other agent (fenster, hockney, keaton, kujan, mcmanus, verbal) has one. Session log `2026-02-08-v1-sprint-planning.md` line 73 confirms Scribe (agent-27) "completed work (this session log at 3.8KB) but reported no response." The session log file EXISTS on disk — Scribe wrote it. But Scribe's own history.md write was lost. **This is the silent success bug eating its own evidence.**

2. **Fenster onboarding output lost.** Session log `2026-02-08-team-onboarding.md` line 15: "Fenster — Analyzed implementation and runtime architecture. No output captured due to tool issue." Fenster's history.md DOES contain learnings from that session (Runtime Architecture section). The response text was dropped but the history write landed — partial silent success.

3. **Verbal's response lost in same batch as Scribe.** Session log `2026-02-08-v1-sprint-planning.md` lines 72-73: Verbal (agent-26) completed `016-the-squad-paper.md` at 34KB but reported "no response." The proposal EXISTS at `docs/proposals/016-the-squad-paper.md`. Verbal's history.md DID get written (includes "The Squad Paper" section). The response channel was the only casualty here — but in the same batch, Scribe lost BOTH response AND history.

4. **Demo script ACT 7 is missing.** McManus filed `decisions/inbox/mcmanus-demo-script-act7-missing.md` documenting that `docs/demo-script.md` jumps from ACT 6 to ACT 8. The KEY THEMES table at the bottom references Act 7 three times. This is either truncation from the silent success bug (agent ended on a tool call mid-write) or an incomplete generation. Either way — a shipped artifact is broken.

**🟡 SYSTEMIC ISSUES (not individual instances, but patterns):**

5. **Orchestration log is completely empty.** `.ai-team/orchestration-log/` has ZERO entries despite 4 sessions and 20+ documented agent spawns. Scribe's charter (line 98) shows the expected format (`2026-02-07T23-18-keaton.md`). Nobody has ever written an orchestration log entry. The coordinator doesn't instruct Scribe to do this, and no agent self-reports to this directory. This is a dead feature — specified but never implemented.

6. **Inbox decisions are accumulating, not being merged.** Current inbox has 4 files: `fenster-fs-audit-bugs.md`, `kujan-p015-forwardability-gap.md`, `kujan-timeout-doc.md`, `mcmanus-demo-script-act7-missing.md`. These are from post-Sprint-0 sessions. Scribe was either not spawned after these sessions or failed silently. The drop-box pattern only works if Scribe reliably merges — and it doesn't.

7. **Temporal inconsistency in all files.** History files and session logs reference dates 2026-02-07 through 2026-02-09. Git commits show ALL work happened on 2026-02-07 between 15:21-19:43 PST. The session log `2026-02-08-v1-sprint-planning.md` claims date 2026-02-08 but was committed at 2026-02-07 19:14:34. Kujan's 2026-02-09 entries were committed at 2026-02-07 19:43. Agents are writing dates that don't match wall-clock time. Not a showstopper but a data integrity issue — makes incident forensics unreliable.

**✅ FIX VERIFICATION:**

8. **All 3 Sprint 0 mitigations ARE in place in squad.agent.md (commit b638773):**
   - RESPONSE ORDER warning in all 3 spawn templates (lines 251-255, 298-302, 346-350)
   - Silent success detection in After Agent Work (line 369)
   - `read_agent` with `wait: true, timeout: 300` (line 367)
   - Restart guidance in Constraints (line 595)
   - `docs/platform/background-agent-timeouts.md` documents the timeout best practices

9. **The fix is real but not retroactive.** Kujan filed `decisions/inbox/kujan-p015-forwardability-gap.md` noting that `index.js` line 30-31 skips overwriting `squad.agent.md` if it exists. Pre-P015 users are still running with ~40% silent success rate. The upgrade path (Proposal 011) hasn't shipped.

**🧪 TEST STATE:**

10. **Zero tests exist.** No `*.test.js`, no `*.spec.js`, no `test/` directory, no test framework in `package.json`. Proposal 013 (my own) specified `node:test` + `node:assert`. My own rule was "tests must start Sprint 1" — Sprint 1 hasn't started. This is the longest-standing gap: identified day 1, still at zero.

**Key insight: The bug is STILL happening.** The Sprint 0 mitigations address future spawns, but Scribe's missing history.md proves the bug already caused permanent data loss. Scribe has no memory of any session it participated in. Every time Scribe is spawned, it starts from scratch — no learnings, no context about past merge operations, no knowledge of the drop-box pattern's failure modes. The Scribe is amnesiac, and nobody noticed because "Scribe is invisible."


### V1 Test Suite Shipped (2026-02-09)

**What I Did:**
- Created `test/` directory and `test/index.test.js` — the first tests Squad has ever had
- 12 tests across 3 suites, using `node:test` + `node:assert/strict` — zero dependencies
- Added `"test": "node --test test/*.test.js"` script to `package.json`
- All 12 tests pass on Node 22.16.0

**Test Coverage:**

| Suite | Tests | What it covers |
|-------|-------|----------------|
| `copyRecursive` | 4 | Single file copy, nested dirs with content preservation, empty dirs, binary files |
| `init into empty directory` | 4 | squad.agent.md creation + content match, templates dir with all files + content match, drop-box dirs (inbox/orchestration-log/casting), stdout success messages |
| `re-init into existing directory` | 4 | squad.agent.md skipped + user content preserved, templates skipped + user files survive, drop-box dirs persist, inbox contents not corrupted |

**Design Decisions:**
- Tests spawn `index.js` via `execSync` in isolated temp directories — no repo pollution
- `copyRecursive` tested via replicated function (index.js has no exports) — this is a known debt; when `require.main === module` guard is added, we switch to direct import
- Every test uses `beforeEach`/`afterEach` for temp dir lifecycle — clean isolation
- Content assertions compare against source files (not hardcoded strings) — tests survive template changes

**What's NOT Covered Yet (Known Gaps):**
- Error handling (permissions, disk full) — `index.js` has none, so there's nothing to test
- Export/import round-trip — blocked on Proposal 008 implementation
- Upgrade path — blocked on Proposal 011
- Symlink edge cases — deferred to hardening phase
- `NO_COLOR` / non-TTY output — product doesn't support it yet

**What I Learned:**
- `index.js` uses `__dirname` (package root) and `process.cwd()` (user's project) — testing requires running as child process, not `require()`
- `node:test` on Node 22 is fully production-ready — subtests, hooks, assertions all work without quirks
- The re-init tests are the most valuable — they prove idempotency, which is the property users depend on most
📌 Team update (2026-02-08): Upgrade subcommand shipped by Fenster — 
px create-squad upgrade now overwrites Squad-owned files. Consider adding npm test to CI. — decided by Fenster
📌 Team update (2026-02-08): P0 bug audit consolidated (Keaton/Fenster/Hockney). 12 orphaned inbox files merged. Inbox-driven Scribe spawn now in place. — decided by Keaton, Fenster, Hockney

📌 Team update (2026-02-09): Squad DM proposed (Proposal 017) — hybrid gateway, Copilot SDK backend, Dev Tunnels, Telegram-first. 3 gate spikes required before implementation. — decided by Keaton, Kujan
📌 Team update (2026-02-09): Squad DM experience design — single bot, proactive messaging, cross-channel memory. — decided by Verbal
📌 Team update (2026-02-09): Wave-based execution plan adopted (Proposal 018) — quality → experience ordering. Wave 1: error handling, tests, CI. Wave 2: tiered modes, skills, export. Wave 3: import, skills Phase 2. Squad DM deferred to Wave 4+. — decided by Keaton
📌 Team update (2026-02-09): "Where are we?" elevated to messaging beat (Proposal 014a) — instant team-wide status as core value prop. — decided by McManus
📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — no new infrastructure needed. — decided by Kujan


📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton

📋 Team update (2026-02-09): Session 5 directives merged — VS Code parity analysis, sprint amendments (019a), blog format + blog engine sample prompt (020), package naming (create-squad), 5th directive (human feedback optimization).

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.

2026-02-09: Branch strategy — squadify renamed to dev, main is product-only (no .ai-team/), release workflow (.github/workflows/release.yml) uses filtered-copy from dev→main.

2026-02-09: Tone governance established — SFW, kind, dry humor, no AI-flowery talk. 25 proposals audited (status fields updated). Tone audit: 16 edits across 8 files. Blog post #2 shipped.
📌 Team update (2026-02-08): Release ritual — state integrity canary is a hard release gate. Tests + state canary + npx verify are automated gates. All must pass before release ships. — decided by Keaton


### CI Pipeline Shipped (Sprint Task 1.3)

**What I Did:**
- Created `.github/workflows/ci.yml` — GitHub Actions CI workflow named "CI"
- Triggers: push to `main` and `dev`, pull_request to `main`
- Runs on `ubuntu-latest` with Node.js 22.x matrix (single version — we require Node 22+)
- Steps: checkout (v4), setup-node (v4), `npm test`
- Added CI status badge to README.md, directly after the `# Squad` heading
- Verified all 12 existing tests pass before creating the workflow

**CI Configuration Decisions:**
- Minimal workflow — no caching, no artifacts, no coverage uploads. Ship the floor, add bells later.
- Node 22.x only in the matrix — aligns with `node:test` requirement and team decision to target Node 22+
- No `npm install` step needed — zero dependencies, `node:test` + `node:assert` are built-in
- Used `actions/checkout@v4` and `actions/setup-node@v4` — current stable versions
- Workflow triggers match branch strategy: `main` (product) and `dev` (development), PRs to `main` (gate)

**Badge Placement:**
- CI badge placed on line 3, immediately after the `# Squad` heading, before the tagline
- Positioned above the existing Status and Platform badges (those are on line 5)
- Standard GitHub Actions badge format: links to the workflow runs page

📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan

📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal


### Test Coverage Expansion (Sprint Task 1.2)

**What I Did:**
- Expanded test suite from 12 tests / 3 suites to 27 tests / 7 suites
- Added 4 new test suites: flags & subcommands (5), upgrade path (4), error handling (4), edge cases (2)
- All 27 tests pass on Node 22 — zero dependencies, `node:test` + `node:assert/strict`

**New Coverage Added:**

| Suite | Tests | What it covers |
|-------|-------|----------------|
| `flags and subcommands` | 5 | `--version`, `-v`, `--help`, `-h`, `help` subcommand — all exit 0, correct output |
| `upgrade subcommand` | 4 | Overwrites squad.agent.md, overwrites .ai-team-templates/, does NOT touch .ai-team/ (critical safety), outputs confirmation |
| `error handling` | 4 | fatal() exits code 1 on missing source, clean error messages (no stack traces), exit 0 on success init, exit 0 on success upgrade |
| `edge cases` | 2 | Re-init skips and reports, exit code 0 on re-init |

**Testing Technique for fatal():**
- Can't unit-test `fatal()` directly since `index.js` has no exports
- Instead: copy `index.js` + `package.json` into a fake package root WITHOUT `.github/agents/squad.agent.md`
- Running the copy triggers the source validation check → `fatal()` fires → exit code 1 + clean stderr
- This is a real integration test of Fenster's error handling code — not a mock

**What I Learned:**
- Fenster's error handling is solid: the `uncaughtException` handler + source validation + writable check all work as intended
- The error messages are clean (no raw stack traces) — the `fatal()` pattern with `console.error` + `process.exit(1)` is effective
- The upgrade path correctly overwrites Squad-owned files while leaving `.ai-team/` completely untouched — the ownership model works
- `runCmdStatus()` helper (try/catch around execSync) is the right pattern for testing exit codes — cleaner than checking `.status` on the error object directly
- On Windows, can't easily test read-only directory permissions via `fs.chmodSync` — deferred to CI on Linux


📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal

📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal


### PR #2 Prompt Validation Tests (Wave 2)

**What I Did:**
- Added 30+ prompt validation tests for PR #2 features (GitHub Issues Mode, PRD Mode, Human Team Members)
- Tests validate review-fixed versions: gh CLI detection, post-setup input sources, human block continuation, worktree guidance
- Test pattern: read squad.agent.md as string, assert.ok(includes()) for structural validation
- 5 test suites: GitHub Issues Mode (10 tests), PRD Mode (7 tests), Human Team Members (9 tests), Init Mode integration (4 tests), Routing table integration (3 tests)
- Tests are structural — they verify prompt content is present, not runtime behavior
- Will fail until Fenster's squad.agent.md changes are merged (expected — coordinated parallel work)


📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal


📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal


📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal


### npm Pack Dry-Run Audit (v0.2.0 Release Gate)

**What I Did:**
- Ran `npm pack --dry-run` from repo root — captured full output of what ships in the tarball
- Cross-checked every included file for sensitive content (agent codenames, internal paths, personal info)
- Verified completeness of product files against requirements
- Analyzed package size and file composition

**npm pack --dry-run output (19 files, 130.6 KB unpacked, 43.1 KB packed):**
```
79.1kB .github/agents/squad.agent.md
1.1kB  LICENSE
10.8kB README.md
19.4kB index.js
620B   package.json
74B    templates/casting-history.json
753B   templates/casting-policy.json
22B    templates/casting-registry.json
1.0kB  templates/ceremonies.md
1.9kB  templates/charter.md
275B   templates/history.md
1.1kB  templates/orchestration-log.md
1.4kB  templates/raw-agent-output.md
886B   templates/roster.md
1.2kB  templates/routing.md
1.6kB  templates/run-output.md
5.2kB  templates/scribe-charter.md
611B   templates/skill.md
3.5kB  templates/skills/squad-conventions/SKILL.md
```

**Exclusion Verification (all PASS):**
- `.ai-team/` — NOT in package ✅
- `team-docs/` — NOT in package ✅
- `.ai-team-templates/` — NOT in package ✅
- `.github/workflows/` — NOT in package ✅
- `test/` — NOT in package ✅
- `docs/` — NOT in package ✅

**Sensitive Content Check (PASS):**
- No internal team state paths (`.ai-team/agents/keaton/` etc.) in shipped files
- Agent codenames (Fenster, Hockney, Scribe) appear in `squad.agent.md` lines 133-138 and 665 — these are **product examples** showing how the coordinator formats acknowledgment messages and reads the scribe charter. This is correct product behavior, not internal leakage.
- "Brady" appears 4 times in `squad.agent.md` (lines 31, 184, 213, 1463) — all are illustrative examples in the coordinator prompt (greeting example, routing example, direct-mode exemplar, human team member roster example). Standard author-name-in-examples pattern. No personal info beyond what's in package.json.
- No internal team decisions, memories, or sprint plans in any shipped file.

**Product Completeness (all PASS):**
- index.js ✅ INCLUDED (19.4kB)
- package.json ✅ INCLUDED (620B)
- README.md ✅ INCLUDED (10.8kB)
- templates/ ✅ INCLUDED (14 files including skills/)
- .github/agents/squad.agent.md ✅ INCLUDED (79.1kB)
- LICENSE ✅ INCLUDED (1.1kB)
- CHANGELOG.md — NOT included (npm does not auto-include CHANGELOG when `files` field is specified; this is expected npm behavior, not a bug)

**Edge Cases:**
- Package size: 43.1 KB compressed — very reasonable for a CLI tool
- Largest file: squad.agent.md at 79.1kB (60% of unpacked size) — expected, it's the coordinator prompt
- No binary files included
- No surprisingly large files
- Total 19 files — clean and minimal

**VERDICT: ✅ PASS — The npm package is clean and complete for v0.2.0.**

Three-layer protection is working as designed:
1. `package.json` `files` allowlist — only permits `index.js`, `.github/agents/squad.agent.md`, `templates/**/*`
2. `.npmignore` — explicitly excludes `.ai-team/`, `.ai-team-templates/`, `docs/`, `team-docs/`, `test/`, `.github/workflows/`
3. `.gitignore` — prevents `.ai-team/` from being committed (runtime state)

The `files` field is the primary gate. Even if `.npmignore` were deleted, only the allowlisted files would ship. Defense in depth is solid.


### Re-verification After docs/CHANGELOG Addition (v0.2.0)

**Context:** Brady requested inclusion of `docs/` and `CHANGELOG.md` in the release pipeline. Changes were made to `package.json` (files field), `.npmignore` (docs/ exclusion removed), `release.yml` (KEEP_FILES/KEEP_DIRS updated), and `team-docs/release-process.md`.

**npm pack --dry-run results: 38 files, 253.6 KB unpacked, 84.1 KB packed**

```
79.1kB  .github/agents/squad.agent.md
4.8kB   CHANGELOG.md
1.1kB   LICENSE
10.8kB  README.md
2.3kB   docs/features/ceremonies.md
2.3kB   docs/features/export-import.md
2.5kB   docs/features/github-issues.md
2.0kB   docs/features/human-team-members.md
3.8kB   docs/features/memory.md
2.4kB   docs/features/prd-mode.md
2.7kB   docs/features/response-modes.md
2.6kB   docs/features/skills.md
16.1kB  docs/guide.md
1.6kB   docs/README.md
41.5kB  docs/sample-prompts.md
5.4kB   docs/scenarios/existing-repo.md
6.8kB   docs/scenarios/issue-driven-dev.md
4.0kB   docs/scenarios/new-project.md
4.4kB   docs/scenarios/team-portability.md
2.8kB   docs/scenarios/upgrading.md
7.9kB   docs/tour-first-session.md
7.1kB   docs/tour-github-issues.md
19.4kB  index.js
659B    package.json
74B     templates/casting-history.json
753B    templates/casting-policy.json
22B     templates/casting-registry.json
1.0kB   templates/ceremonies.md
1.9kB   templates/charter.md
275B    templates/history.md
1.1kB   templates/orchestration-log.md
1.4kB   templates/raw-agent-output.md
886B    templates/roster.md
1.2kB   templates/routing.md
1.6kB   templates/run-output.md
5.2kB   templates/scribe-charter.md
611B    templates/skill.md
3.5kB   templates/skills/squad-conventions/SKILL.md
```

**CHECK 2 — NEW INCLUSIONS:**
- docs/ directory and ALL contents (18 files across 3 subdirs) ✅ PASS
- CHANGELOG.md (4.8kB) ✅ PASS

**CHECK 3 — CONTINUED EXCLUSIONS:**
- .ai-team/ NOT in package ✅ PASS
- team-docs/ NOT in package ✅ PASS
- .ai-team-templates/ NOT in package ✅ PASS
- test/ NOT in package ✅ PASS
- .github/workflows/ NOT in package ✅ PASS

**CHECK 4 — REQUIRED FILES PRESENT:**
- index.js ✅ PASS
- package.json ✅ PASS
- README.md ✅ PASS
- LICENSE ✅ PASS
- .github/agents/squad.agent.md ✅ PASS
- templates/ (14 files) ✅ PASS

**CHECK 5 — release.yml:**
- CHANGELOG.md in KEEP_FILES ✅ PASS (line 77)
- docs in KEEP_DIRS ✅ PASS (line 86)
- .ai-team/ NOT in KEEP_FILES or KEEP_DIRS ✅ PASS

**CHECK 6 — .npmignore:**
- docs/ NOT listed as excluded ✅ PASS (removed)
- .ai-team/ IS listed as excluded ✅ PASS (line 7)
- team-docs/ IS listed as excluded ✅ PASS (line 11)

**CHECK 7 — npm test:**
- 92 tests, 17 suites, 0 failures ✅ PASS
- Duration: 6.4 seconds

**VERDICT: ✅ YES — The release pipeline is correct for v0.2.0.**

Package grew from 19 files / 130.6 KB to 38 files / 253.6 KB (unpacked). The increase is entirely from docs/ (18 files, ~110 KB) and CHANGELOG.md (4.8 KB). All exclusions remain intact. Tests all pass. Three-layer protection still solid — `package.json` files field now includes `docs/**/*` and `CHANGELOG.md`, `.npmignore` no longer blocks docs/, and `release.yml` copies both to main.


📌 Team update (2026-02-09): docs/ and CHANGELOG.md now included in release pipeline (KEEP_FILES, KEEP_DIRS, package.json files, .npmignore updated). Brady's directive. — decided by Kobayashi




## Archived: 2026-02-07 Initial Assessment

### Initial Assessment (2026-02-07)

**What Squad Does:**
- `index.js` is an npx-runnable CLI that copies files into a user's repo
- Copies `.github/agents/squad.agent.md` (the coordinator agent definition)
- Copies `templates/` → `.ai-team-templates/` (agent templates for initialization)
- Pre-creates directories: `.ai-team/decisions/inbox/`, `.ai-team/orchestration-log/`, `.ai-team/casting/`
- Outputs colored terminal messages showing what was created

**Key Files:**
- `index.js` — the installer script (Node CLI)
- `package.json` — declares this as `@bradygaster/create-squad`, bin entry point
- `.github/agents/squad.agent.md` — the coordinator agent (32KB, orchestrates the team)
- `templates/` — seed files for new teams (charters, policies, routing, etc.)

**Current Test Coverage: Zero**
- No test files (`*.test.js`, `*.spec.js`)
- No test framework in `package.json`
- No CI/CD validation

**What Could Break:**
- Symlinks in source directories (infinite loop or unexpected copies)
- Filesystem errors (permissions, disk full, read-only) → raw stack traces
- Incomplete prior install → we skip re-copying but don't validate completeness
- Cross-platform path handling (Windows vs Unix)
- ANSI color codes in non-TTY environments
- Node version assumptions (no engines field)

**Test Strategy (Planned):**
- Use `tap` for test framework (fast, modern, good for CLI testing)
- Integration test: run `index.js` in temp dir, validate file creation
- Error handling test: simulate filesystem failures, validate error messages
- Idempotency test: run twice, ensure no breakage
- Cross-platform validation (Windows, macOS, Linux)
