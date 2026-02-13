# Proposal 019: Master Sprint Plan — The Definitive Build Plan

**Status:** Approved ✅ Shipped (Waves 1-3)  
**Authored by:** Keaton (Lead)  
**Date:** 2026-02-09  
**Requested by:** bradygaster — *"stack it all up — sprint plan it? all of it."*  
**Supersedes:** Proposal 009 (v1 Sprint Plan), Proposal 018 (Wave Execution Plan)

---

## What This Document Is

This is the ONE document the team executes from. Every proposal, every decision, every directive from every session — synthesized into a single actionable plan with agent assignments, dependencies, effort estimates, and hard gates.

No ambiguity. No redundancy. If it's not in here, it's not in scope.

---

## Brady's Directives (Non-Negotiable)

1. **Quality first, then experience.** Wave 1 earns trust. Nothing else ships until the foundation is solid.
2. **"Where are we?" is a first-class value prop.** Instant team-wide status synthesis. Demo it. Message it. Build around it.
3. **Human input responsiveness matters.** Coordinator captures human directives to inbox as first action. Platform input latency is unsolvable, but directive persistence uses the existing drop-box.
4. **The "feels heard" UX principle.** When a human speaks, the coordinator acknowledges immediately and writes the directive to the inbox before doing anything else. The user must never wonder if their message was received.

---

## What's Already Shipped (Do Not Re-Plan)

| Item | Evidence | Shipped By |
|------|----------|------------|
| P015 silent success mitigations (3 in squad.agent.md) | squad.agent.md | Kujan |
| Upgrade subcommand in index.js | index.js lines 49-65 | Fenster |
| 12 tests passing (init, idempotency, copyRecursive) | test/index.test.js | Hockney |
| Inbox-driven Scribe spawn | squad.agent.md | Kujan |
| Scribe history.md created | .ai-team/agents/scribe/ | Keaton |
| Demo script ACT 7 restored | docs/demo-script.md | McManus |
| decisions.md cleanup | .ai-team/decisions.md | Keaton |
| Orchestration log entries (was dead, now working) | .ai-team/orchestration-log/ | Keaton |
| 12 orphaned inbox files merged | .ai-team/decisions/inbox/ (empty) | Keaton |

---

## Proposal 009 Disposition

| 009 Item | Status in 019 |
|----------|---------------|
| Sprint 1: Forwardability (always-overwrite init) | **Superseded.** Init skips, upgrade overwrites. Already shipped. |
| Sprint 1: Tiered response modes | **Carried forward** → Wave 2, item 2.1 |
| Sprint 1: P015 silent success fix | **Completed.** Shipped in squad.agent.md |
| Sprint 2: History split | **Carried forward** → Wave 3, item 3.1 (part of import) |
| Sprint 2: Skills system | **Carried forward** → Wave 2 (Phase 1) and Wave 3 (Phase 2) |
| Sprint 2: Export/Import | **Carried forward** → Wave 2 (export) and Wave 3 (import) |
| Sprint 3: README rewrite | **Carried forward** → Wave 1.5, item 1.5.1 |
| Sprint 3: Test expansion | **Carried forward** → Wave 1, item 1.2 |
| Sprint 3: Polish | **Carried forward** → distributed across waves |
| Aggressive cuts (merge, LLM classification, sharing, negotiation, speculative) | **Carried forward** → Horizon |
| Skills as first-class concept | **Carried forward** → Wave 2/3 with Agent Skills standard |
| Forwardability bright line (Squad-owned vs user-owned files) | **Carried forward** → already implemented in index.js |

## Proposal 018 Disposition

| 018 Item | Status in 019 |
|----------|---------------|
| Wave 1: Error handling | **Carried forward** → Wave 1, item 1.1 |
| Wave 1: Test expansion | **Carried forward** → Wave 1, item 1.2 |
| Wave 1: CI setup | **Carried forward** → Wave 1, item 1.3 |
| Wave 1: Version stamping | **Carried forward** → Wave 1, item 1.4 |
| Wave 1: Silent success deeper fix | **Carried forward** → Wave 1, item 1.5 |
| Wave 1.5: README, messaging, paper | **Carried forward** → Wave 1.5 (unchanged) |
| Wave 2: Tiered response modes | **Carried forward** → Wave 2, item 2.1 |
| Wave 2: Smart upgrade | **Carried forward** → Wave 2, item 2.2 |
| Wave 2: Skills Phase 1 | **Carried forward** → Wave 2, item 2.3 |
| Wave 2: Export CLI | **Carried forward** → Wave 2, item 2.4 |
| Wave 3: Import CLI | **Carried forward** → Wave 3, item 3.1 |
| Wave 3: Skills Phase 2 | **Carried forward** → Wave 3, item 3.2 |
| Wave 3: History summarization | **Carried forward** → Wave 3, item 3.3 |
| Wave 3: Lightweight spawn template | **Carried forward** → Wave 3, item 3.4 |
| Wave 4+: Horizon | **Carried forward** → Horizon section (refined) |

**New in 019 (not in 018):**
- Wave 1, item 1.6: Human directive capture ("feels heard" behavior)
- Wave 1, item 1.7: "Feels heard" coordinator acknowledgment
- Wave 1.5, item 1.5.4: "Where are we?" messaging beat
- Wave 1.5, item 1.5.5: Demo script finalization
- Wave 1.5, item 1.5.6: Video content strategy alignment
- Explicit content tier parallel track with all content items

---

## Summary Table — All Work Items

| ID | Item | Owner | Effort | Depends On | Wave |
|----|------|-------|--------|------------|------|
| **1.1** | Error handling in index.js | Fenster | 2h | — | 1 |
| **1.2** | Test coverage expansion | Hockney | 3-4h | 1.1 (error tests) | 1 |
| **1.3** | CI with GitHub Actions | Hockney | 1h | — | 1 |
| **1.4** | Version stamping Phase 1 | Fenster | 1-2h | — | 1 |
| **1.5** | Silent success deeper mitigation | Verbal | 2h | — | 1 |
| **1.6** | Human directive capture | Kujan | 1h | — | 1 |
| **1.7** | "Feels heard" coordinator behavior | Verbal | 1h | — | 1 |
| **1.5.1** | README rewrite | McManus | 1-2h | 1.3 (CI badge) | 1.5 |
| **1.5.2** | Messaging polish | McManus | 1-2h | — | 1.5 |
| **1.5.3** | Squad Paper draft | Verbal | 3-4h | — | 1.5 |
| **1.5.4** | "Where are we?" messaging beat | McManus | 1h | — | 1.5 |
| **1.5.5** | Demo script finalization | McManus | 2h | — | 1.5 |
| **1.5.6** | Video content strategy alignment | Verbal + McManus | 1h | — | 1.5 |
| **2.1** | Tiered response modes | Verbal + Kujan | 3-4h | Wave 1 gate | 2 |
| **2.2** | Smart upgrade with migrations | Fenster | 2-3h | 1.4 (version stamping) | 2 |
| **2.3** | Skills Phase 1 (template + read) | Verbal + Fenster | 3-4h | Wave 1 gate | 2 |
| **2.4** | Export CLI | Fenster | 4-5h | Wave 1 gate | 2 |
| **3.1** | Import CLI + history split | Fenster | 5-6h | 2.4 (export) | 3 |
| **3.2** | Skills Phase 2 (earned skills) | Verbal | 4-5h | 2.3 (Phase 1) | 3 |
| **3.3** | Progressive history summarization | Verbal | 2-3h | Wave 2 gate | 3 |
| **3.4** | Lightweight spawn template | Kujan | 1-2h | 2.1 (tiered modes) | 3 |

**Total: 42-56 hours across 3 waves + parallel content track.**

---

## Wave 1: Quality — "Make It Trustworthy"

**Duration:** ~3-4 days  
**Principle:** If a user runs `npx create-squad` and something goes wrong, they never come back.

### 1.1 Error Handling in index.js

**Owner:** Fenster  
**Effort:** 2 hours  
**Depends on:** Nothing  
**Source:** Proposal 018 §1.1

**What ships:**
- Wrap all `fs.*Sync` calls in try/catch with human-readable error messages
- Validate source files exist before copying (guard against corrupted npm install)
- Validate `dest` (process.cwd()) is writable before starting
- Exit with code 1 on failure, code 0 on success (currently implicit)
- Top-level `process.on('uncaughtException')` handler — clean message, no stack trace

**Risk:** Very low — additive error handling, no happy-path behavior changes

### 1.2 Test Coverage Expansion

**Owner:** Hockney  
**Effort:** 3-4 hours  
**Depends on:** 1.1 (error case tests need error handling to exist)  
**Source:** Proposals 013, 018 §1.2

**What ships:**
- **Upgrade tests:** Upgrade overwrites squad.agent.md, preserves .ai-team/ contents, overwrites templates
- **Flag tests:** `--version` outputs semver, `--help` outputs usage, `help` subcommand works
- **Error case tests:** Init with missing source files, unknown subcommand behavior
- **Edge case tests:** Paths with spaces, Unicode directory names (Windows-relevant)
- **Exit code tests:** Verify process exits 0 on success, 1 on error

**Target:** 20+ tests across 5 suites (up from 12 tests, 3 suites)  
**Risk:** Low — pure additive

### 1.3 CI with GitHub Actions

**Owner:** Hockney  
**Effort:** 1 hour  
**Depends on:** Nothing  
**Source:** Proposals 013, 018 §1.3

**What ships:**
- `.github/workflows/ci.yml` — runs `npm test` on push and PR
- Matrix: Node 22.x on ubuntu-latest
- Status badge for README (added when README ships in Wave 1.5)

**Risk:** Very low — standard CI setup

### 1.4 Version Stamping — Phase 1

**Owner:** Fenster  
**Effort:** 1-2 hours  
**Depends on:** Nothing  
**Source:** Proposals 011, 018 §1.4

**What ships:**
- Version comment header in `squad.agent.md`: `<!-- squad-coordinator-version: 0.1.0 -->`
- `upgrade` subcommand reads header, compares to package version, reports delta: "Upgraded coordinator from 0.1.0 to 0.2.0" or "Already up to date"
- `engines` field in `package.json`: `"node": ">=22.0.0"`

**Risk:** Low — additive to existing upgrade subcommand

### 1.5 Silent Success Bug — Deeper Mitigation

**Owner:** Verbal  
**Effort:** 2 hours  
**Depends on:** Nothing  
**Source:** Proposals 015, 018 §1.5

**What ships:**
- Audit current mitigations effectiveness — measure which agents still silent-fail
- Strengthen response mandate: move "you MUST end with text" to FIRST line of every spawn prompt
- Add coordinator-side retry: if `read_agent` returns empty and agent wrote files, re-read with longer timeout
- Document the bug honestly in README (when it ships in 1.5.1)

**Risk:** Low — prompt changes only, no code changes to index.js

### 1.6 Human Directive Capture

**Owner:** Kujan  
**Effort:** 1 hour  
**Depends on:** Nothing  
**Source:** Brady's session directive, Proposal 018 team update

**What ships:**
- Coordinator writes human directives to `.ai-team/decisions/inbox/` as first action before routing
- Format: `human-directive-{timestamp}.md` with the user's exact words
- This ensures human input survives even if the coordinator session crashes or times out
- Scribe merges directives into decisions.md on next merge cycle

**Risk:** Very low — uses existing drop-box pattern

### 1.7 "Feels Heard" Coordinator Behavior

**Owner:** Verbal  
**Effort:** 1 hour  
**Depends on:** Nothing  
**Source:** Brady's session directive

**What ships:**
- Update `squad.agent.md` Team Mode: on every user message, coordinator FIRST acknowledges receipt with a brief text response ("Got it. Routing to {Name}..." or "On it. Spawning {agents}...")
- This text response ships BEFORE any tool calls, ensuring the user sees immediate feedback
- The acknowledgment is brief (one sentence) — not a plan, not a summary, just "I heard you"
- For complex requests, the acknowledgment includes what the coordinator is about to do

**Risk:** Very low — prompt engineering only. The "feels heard" pattern prevents the "did it get my message?" anxiety that compounds with platform latency.

### Wave 1 Parallelism

```
Day 1-2:                              Day 2-4:
├── 1.1 Error handling (Fenster)       └── 1.2 Test expansion (Hockney) ← needs 1.1
├── 1.3 CI setup (Hockney)
├── 1.4 Version stamping (Fenster)
├── 1.5 Silent success (Verbal)
├── 1.6 Human directive capture (Kujan)
└── 1.7 Feels heard behavior (Verbal)
```

Items 1.1, 1.3, 1.4, 1.5, 1.6, 1.7 all run in parallel on Day 1-2.  
Item 1.2 starts Day 2 after 1.1 ships (error tests need error handling to exist).

### Wave 1 Gate: "Can We Trust It?"

**This gate is binary. ALL must pass or Wave 2 doesn't start.**

- [ ] `npm test` passes 20+ tests covering init, upgrade, flags, error cases, and exit codes
- [ ] CI runs on every push and PR — `.github/workflows/ci.yml` exists and is green
- [ ] index.js has zero unhandled exceptions on any filesystem error
- [ ] `squad.agent.md` has a version header
- [ ] `upgrade` reports version deltas
- [ ] Silent success rate is measured and documented
- [ ] Coordinator captures human directives to inbox before routing
- [ ] Coordinator acknowledges user messages with immediate text before tool calls

---

## Wave 1.5: Content Track (Parallel — Zero Code Risk)

**Key insight:** Content work has ZERO quality risk. It doesn't touch index.js, tests, or the coordinator code. McManus and Verbal can ship content while Fenster and Hockney harden the core.

**Runs entirely in parallel with Wave 1 and continues through Wave 2.**

### 1.5.1 README Rewrite

**Owner:** McManus  
**Effort:** 1-2 hours  
**Depends on:** 1.3 (CI badge — add after CI ships)  
**Source:** Proposals 002, 006, 014

**What ships:**
- New README.md from Proposal 006 (already written, already reviewed)
- CI status badge (after 1.3 ships)
- Honest "Known Limitations" section documenting silent success bug
- "Where are we?" callout in "Why Squad?" section (per 014a)

### 1.5.2 Messaging Polish

**Owner:** McManus  
**Effort:** 1-2 hours  
**Depends on:** Nothing  
**Source:** Proposals 002, 014, 014a

**What ships:**
- Finalized tagline: "Throw MY squad at it" (pending portability) or "Throw a squad at it" (current)
- npm package description update (one line in package.json)
- CHANGELOG.md for v0.1.0 documenting what's shipped
- "Where are we?" positioned as awareness hook in tagline hierarchy

### 1.5.3 Squad Paper Draft

**Owner:** Verbal  
**Effort:** 3-4 hours  
**Depends on:** Nothing  
**Source:** Proposal 016

**What ships:**
- First complete draft of the Squad paper
- Positioned for v1 launch amplification
- Publication timing deferred to launch decision

### 1.5.4 "Where Are We?" Messaging Beat

**Owner:** McManus  
**Effort:** 1 hour  
**Depends on:** Nothing  
**Source:** Proposal 014a — Brady: *"that i can do that is SO hot, such a feature"*

**What ships:**
- "Ask Your Team, Not Your Dashboard" messaging beat copy
- Demo script beat insertion ("The Check-In")
- Social clip format for Twitter/X (30-second "where are we?" → comprehensive answer)
- README placement: close of "Why Squad?" section + follow-up in "Agents Work in Parallel"

### 1.5.5 Demo Script Finalization

**Owner:** McManus  
**Effort:** 2 hours  
**Depends on:** Nothing  
**Source:** Proposal 004

**What ships:**
- Final production-ready demo script with all 9 beats
- "Where are we?" check-in beat inserted (per 014a)
- Pre-recording checklist verified against current product state
- All beat timestamps validated against current Squad behavior

### 1.5.6 Video Content Strategy Alignment

**Owner:** Verbal + McManus  
**Effort:** 1 hour  
**Depends on:** Nothing  
**Source:** Proposal 005

**What ships:**
- Trailer script finalized (75s target)
- Full demo script aligned with Proposal 004 beats
- Series roadmap confirmed (which videos first after launch)
- "Where are we?" positioned as a key demo moment across all videos

---

## Wave 2: Experience — "Make It Feel Right"

**Duration:** ~5-7 days  
**Principle:** Quality is proven. Now make the product feel like the future.  
**Gate prerequisite:** Wave 1 gate must be GREEN.

### 2.1 Tiered Response Modes

**Owner:** Verbal + Kujan  
**Effort:** 3-4 hours  
**Depends on:** Wave 1 gate  
**Source:** Proposal 007

**What ships:**
- Routing table in `squad.agent.md` for mode selection:
  - **Direct:** Status checks, quick factual questions, "where are we?" — coordinator answers, no spawn (~2-3s)
  - **Lightweight:** Single-file edits, small fixes, follow-ups — minimal spawn prompt (~8-12s)
  - **Standard:** Normal tasks, single agent — full spawn with history + decisions (~25-35s)
  - **Full:** Multi-agent, complex tasks — parallel fan-out, full ceremony (~40-60s)
- Coordinator context caching: skip re-reading team.md/routing.md/registry.json after first message
- Scribe batching: only spawn when inbox has files
- "Where are we?" handled in Direct mode — instant, no agent spawn needed

**Risk:** Medium — routing judgment is the critical variable. Bias toward spawning when uncertain.

### 2.2 Smart Upgrade with Migrations

**Owner:** Fenster  
**Effort:** 2-3 hours  
**Depends on:** 1.4 (version stamping must exist)  
**Source:** Proposal 011

**What ships:**
- Upgrade detects version delta and reports what changed
- Additive-only migrations (create new directories like `skills/`)
- Migration registry: version-keyed functions that run on upgrade
- No destructive operations — upgrade is always safe

**Risk:** Low — upgrade already exists; this adds intelligence

### 2.3 Skills Phase 1 — Template + Read

**Owner:** Verbal + Fenster  
**Effort:** 3-4 hours  
**Depends on:** Wave 1 gate  
**Source:** Proposals 010, 012

**What ships:**
- `.ai-team/skills/` directory created on init/upgrade (additive migration via 2.2)
- SKILL.md format reference from Agent Skills standard in templates
- Spawn prompt update: "If `.ai-team/skills/` contains SKILL.md files, read relevant ones before working"
- Example skill: `squad-conventions/SKILL.md` documenting Squad's own patterns
- Skills are read-only in Phase 1 — agents read but don't create skills yet

**Risk:** Low — additive prompt changes + new template files  
**Strategic value:** High — foundation for Phase 2 (earned skills) and portability

### 2.4 Export CLI

**Owner:** Fenster  
**Effort:** 4-5 hours (including tests)  
**Depends on:** Wave 1 gate  
**Source:** Proposals 008, 008-platform

**What ships:**
- `npx create-squad export` subcommand
- Produces `squad-export.json` with casting state, charters, filtered histories
- `--out` flag for custom output path
- Clear messaging: "Review agent histories before sharing"
- Hockney writes export tests (included in effort)

**Risk:** Medium — new code path in index.js, but well-specified

### Wave 2 Parallelism

```
Wave 2 (all items can start when Wave 1 gate passes)
├── 2.1 Tiered modes (Verbal + Kujan)     ← start immediately
├── 2.2 Smart upgrade (Fenster)            ← start immediately (needs 1.4)
├── 2.3 Skills Phase 1 (Verbal + Fenster)  ← start immediately
└── 2.4 Export CLI (Fenster)               ← after 2.2 (Fenster bandwidth)
```

### Wave 2 Gate: "Does It Feel Fast and Forward?"

- [ ] Trivial tasks (status queries, "where are we?", single-line changes) complete in <5 seconds
- [ ] `npx create-squad export` produces a valid, human-readable JSON manifest
- [ ] Skills directory exists in templates; agents read skills when present
- [ ] Upgrade reports version deltas and runs migrations
- [ ] All new code has tests; CI is green

---

## Wave 3: Experience — "Make It Magical"

**Duration:** ~7-10 days  
**Principle:** The product works and feels good. Now add the features that make people say "holy crap."  
**Gate prerequisite:** Wave 2 gate must be GREEN.

### 3.1 Import CLI + Portability Complete

**Owner:** Fenster  
**Effort:** 5-6 hours  
**Depends on:** 2.4 (export must exist)  
**Source:** Proposals 008, 008-platform, 008-experience

**What ships:**
- `npx create-squad import <file>` subcommand
- Collision detection: refuse if squad exists, `--force` for replacement with archival
- Coordinator detects imported squad on first session, runs lightweight onboarding
- Round-trip tests: export → import → verify identity preserved, project context dropped
- History split: Portable Knowledge vs Project Learnings sections in history.md template
- Import skips casting ceremony — names, universe, and relationships arrive pre-populated

**Risk:** Medium — import modifies init flow, needs thorough testing

### 3.2 Skills Phase 2 — Earned Skills

**Owner:** Verbal  
**Effort:** 4-5 hours  
**Depends on:** 2.3 (Phase 1 format must exist)  
**Source:** Proposals 010, 012

**What ships:**
- Agents learn to identify and extract skills from real work
- Skill confidence lifecycle: low → medium → high based on repeated application
- Skill-aware routing: coordinator checks skills when selecting agents for tasks
- MCP tool declarations in skill metadata (Brady's specific request)

**Risk:** Medium-high — depends on prompt engineering quality for reliable skill categorization  
**Critical path:** Verbal's prompt work here is the make-or-break for the skills thesis

### 3.3 Progressive History Summarization

**Owner:** Verbal  
**Effort:** 2-3 hours  
**Depends on:** Wave 2 gate  
**Source:** Proposal 007 §Solution 7

**What ships:**
- Scribe responsibility: when history.md exceeds 3,000 tokens, summarize entries older than 2 weeks into Core Context
- Archive original entries to `history-archive.md`
- Keeps agent startup time constant regardless of project age

**Risk:** Medium — lossy compression. Mitigated by archival (original data preserved).

### 3.4 Lightweight Spawn Template

**Owner:** Kujan  
**Effort:** 1-2 hours  
**Depends on:** 2.1 (tiered modes must exist)  
**Source:** Proposal 007 §Solution 5

**What ships:**
- Spawn template for simple, scoped tasks: no charter inline, no history read, just the task
- Use `explore` agent type for read-only queries (Haiku model, faster)
- Coordinator already routes by complexity (from 2.1); this adds the lightweight template

**Risk:** Low — additive template

### Wave 3 Parallelism

```
Wave 3
├── 3.1 Import CLI (Fenster)           ← depends on 2.4
├── 3.2 Skills Phase 2 (Verbal)        ← depends on 2.3
├── 3.3 History summarization (Verbal) ← after 3.2 (Verbal bandwidth)
└── 3.4 Lightweight spawn (Kujan)      ← can start immediately
```

### Wave 3 Gate: "The Holy Crap Moments"

- [ ] Export from Project A → Import into Project B → agents know the user, not the old project
- [ ] An agent earns a skill in one project; the skill appears in the skills directory
- [ ] Message 15 of a session is faster than message 1
- [ ] "Where are we?" returns comprehensive team-wide status in <5 seconds
- [ ] Users say "holy crap" at least once during a demo

---

## Horizon — Explicitly Deferred

These are real features. They're deferred because shipping them before the core is bulletproof creates two half-finished products instead of one great one.

| Feature | Source | Why Not Now | Revisit When |
|---------|--------|-------------|--------------|
| **Squad DM (Telegram)** | Proposal 017 (3 docs) | Second product surface. Gateway, adapters, tiered execution, auth, rate limiting — massive scope. Ship after core CLI is complete. | Wave 3 gate passes |
| **Agent-to-agent negotiation** | Verbal (003) | Fascinating. Premature. Needs proven agent reliability first. | Skills Phase 2 proves agents can reliably categorize knowledge |
| **Speculative execution** | Verbal (003) | Spawning agents "just in case" requires confidence in the silent success fix and tiered modes. | Silent success rate < 5% |
| **Squad sharing / registry** | Proposal 008 v2/v3 | Needs portability proven in real use first. Export/import round-trip must be trusted. | 10+ successful export/import cycles |
| **Export merge (`--merge`)** | Proposal 008 | Universe conflicts are unsolvable in v1. `--force` with archival is honest. | User feedback demands it |
| **LLM-powered history classification** | Proposal 008 | Manual curation is honest and correct for v1. | Export user feedback says manual is too painful |
| **Conditional memory loading** | Proposal 007 §Solution 3 | ~1.5s savings/spawn. Tiered modes (2.1) save 25+ seconds on trivial tasks. Optimize the big thing first. | After tiered modes prove effective |
| **preferences.md as separate file** | Verbal (008-experience) | Architecturally sound but adds migration cost. Portable Knowledge section in history.md is sufficient for v1. | Sharing (v1.2) needs personal data stripping |
| **squad-profile.md** | Verbal (008-experience) | Team meta-identity file. Adds value when squads have 3+ projects of history. | After 3 real export/import cycles |
| **Squad diff** | Verbal (008-experience) | Quantified squad evolution tracking. Requires sufficient data. | After 6 months of squad usage |

---

## Agent Workload Summary

| Agent | Wave 1 | Wave 1.5 | Wave 2 | Wave 3 | Total |
|-------|--------|----------|--------|--------|-------|
| **Fenster** | 1.1 (2h), 1.4 (1-2h) | — | 2.2 (2-3h), 2.3 (shared, 2h), 2.4 (4-5h) | 3.1 (5-6h) | 16-20h |
| **Hockney** | 1.2 (3-4h), 1.3 (1h) | — | Tests for 2.4 (incl.) | Tests for 3.1 (incl.) | 4-5h |
| **Verbal** | 1.5 (2h), 1.7 (1h) | 1.5.3 (3-4h), 1.5.6 (shared, 0.5h) | 2.1 (shared, 2h), 2.3 (shared, 2h) | 3.2 (4-5h), 3.3 (2-3h) | 17-21h |
| **Kujan** | 1.6 (1h) | — | 2.1 (shared, 2h) | 3.4 (1-2h) | 4-5h |
| **McManus** | — | 1.5.1 (1-2h), 1.5.2 (1-2h), 1.5.4 (1h), 1.5.5 (2h), 1.5.6 (shared, 0.5h) | — | — | 5-8h |
| **Keaton** | Review all gates | Review content | Review all code | Final sign-off | Continuous |

---

## Total Effort Estimate

| Wave | Effort | Calendar (with parallelism) |
|------|--------|---------------------------|
| Wave 1 (Quality) | 11-14h | 3-4 days |
| Wave 1.5 (Content, parallel) | 9-13h | Runs alongside Waves 1-2 |
| Wave 2 (Experience) | 12-16h | 5-7 days |
| Wave 3 (Magical) | 12-16h | 7-10 days |
| **Total** | **44-59h** | **~3 weeks** |

---

## Dependency Graph

```
Wave 1 (Quality)                    Wave 1.5 (Content — parallel)
├── 1.1 Error handling (Fenster)    ├── 1.5.1 README (McManus) ← needs 1.3 for badge
├── 1.3 CI setup (Hockney)         ├── 1.5.2 Messaging (McManus)
├── 1.4 Version stamping (Fenster) ├── 1.5.3 Squad Paper (Verbal)
├── 1.5 Silent success (Verbal)    ├── 1.5.4 "Where are we?" (McManus)
├── 1.6 Directive capture (Kujan)  ├── 1.5.5 Demo script (McManus)
├── 1.7 Feels heard (Verbal)       └── 1.5.6 Video strategy (Verbal + McManus)
└── 1.2 Test expansion (Hockney) ← depends on 1.1
           │
    ═══════╧══════════  WAVE 1 GATE  ═══════════════
           │
Wave 2 (Experience)
├── 2.1 Tiered modes (Verbal + Kujan)
├── 2.2 Smart upgrade (Fenster) ← needs 1.4
├── 2.3 Skills Phase 1 (Verbal + Fenster)
└── 2.4 Export CLI (Fenster) ← after 2.2 (bandwidth)
           │
    ═══════╧══════════  WAVE 2 GATE  ═══════════════
           │
Wave 3 (Magical)
├── 3.1 Import + portability (Fenster) ← needs 2.4
├── 3.2 Skills Phase 2 (Verbal) ← needs 2.3
├── 3.3 History summarization (Verbal) ← after 3.2 (bandwidth)
└── 3.4 Lightweight spawn (Kujan) ← needs 2.1
```

---

## How This Plan Respects Brady's Directives

### 1. Quality First, Then Experience

Wave 1 is ALL quality: error handling, tests, CI, version stamping, silent success, directive capture, responsiveness. Zero experience features ship until the gate passes. Content (Wave 1.5) runs parallel but never touches code.

### 2. "Where Are We?" as First-Class Value Prop

- Wave 1.5: McManus writes the messaging beat, demo script beat, and social clip format (1.5.4)
- Wave 2: Tiered modes (2.1) ensure "where are we?" is handled in Direct mode — instant, no spawn
- README (1.5.1): "Where are we?" placed in "Why Squad?" section and "Agents Work in Parallel"
- Demo script (1.5.5): "The Check-In" beat inserted into production demo
- Video strategy (1.5.6): "Where are we?" positioned as key moment across all videos

### 3. Human Input Responsiveness

- Wave 1: Coordinator writes directives to inbox before routing (1.6)
- Platform input latency is unsolvable, but directive persistence uses existing drop-box
- Combined with "feels heard" (1.7), the user's message is both acknowledged and persisted

### 4. "Feels Heard" UX Principle

- Wave 1: Coordinator acknowledges every message with immediate text before tool calls (1.7)
- The acknowledgment is one sentence — just enough to confirm receipt
- For complex requests: "Got it. Spawning Fenster and Hockney for this."
- For simple requests: "On it." + direct handling (enhanced in Wave 2 with tiered modes)

---

## The Principle, Restated

Brady said quality then experience. Here's what that means in execution:

**Wave 1 earns trust.** Every error is handled. Every path is tested. CI catches regressions. The coordinator hears you and says so. Users can rely on `npx create-squad` the way they rely on `npm init`.

**Wave 1.5 proves we can walk and chew gum.** Content never conflicts with code. McManus and Verbal ship messaging, demos, and the Squad paper while the core hardens.

**Wave 2 delivers experience that quality made safe.** Tiered modes, skills, and export ship into a codebase with 20+ tests, CI, error handling, and version tracking.

**Wave 3 compounds everything.** Import builds on export. Phase 2 skills build on Phase 1. History summarization builds on the history format. Lightweight spawns build on tiered routing. Every Wave 3 item is only possible because Waves 1 and 2 laid the foundation.

Quality isn't a phase you finish. It's the foundation everything else stands on.

---

**This is the plan. Execute from here.**

**Review requested from:** bradygaster  
**Approved by:** Keaton (Lead) — this is my plan, I own it  
**Executed by:** The full squad
