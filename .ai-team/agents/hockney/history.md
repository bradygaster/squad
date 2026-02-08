# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

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

📌 Team update (2026-02-08): Proposal-first workflow adopted — all meaningful changes require proposals before execution. Write to `docs/proposals/`, review gates apply. — decided by Keaton + Verbal
📌 Team update (2026-02-08): Stay independent, optimize around Copilot — Squad will not become a Copilot SDK product. Filesystem-backed memory preserved as killer feature. — decided by Kujan
📌 Team update (2026-02-08): Stress testing prioritized — Squad must build a real project using its own workflow to validate orchestration under real conditions. — decided by Keaton
📌 Team update (2026-02-08): DevRel polish identified — six onboarding gaps to close: install output, sample-prompts linking, "Why Squad?" section, casting elevation, troubleshooting, demo video. — decided by McManus
📌 Team update (2026-02-08): Agent experience evolution proposed — adaptive spawn prompts, reviewer protocol with guidance, proactive coordinator chaining. — decided by Verbal
📌 Team update (2026-02-08): Industry trends identified — dynamic micro-specialists, agent-to-agent negotiation, speculative execution as strategic directions. — decided by Verbal
📌 Team update (2026-02-08): Portable Squads architecture decided — history split (Portable Knowledge vs Project Learnings), JSON manifest export, no merge in v1. — decided by Keaton
📌 Team update (2026-02-08): Tiered response modes proposed — Direct/Lightweight/Standard/Full spawn tiers to reduce late-session latency. Context caching + conditional Scribe spawning as P0 fixes. — decided by Kujan + Verbal
📌 Team update (2026-02-08): Portable squads platform feasibility confirmed — pure CLI/filesystem, ~80 lines in index.js, .squad JSON format, no merge in v0.1. — decided by Kujan
📌 Team update (2026-02-08): Portable squads memory architecture — preferences.md (portable) split from history.md (project-local), squad-profile.md for team identity, import skips casting ceremony. — decided by Verbal

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
