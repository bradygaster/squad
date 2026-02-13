# Proposal 018: Wave-Based Execution Plan (Quality → Experience)

**Status:** Superseded — by Proposal 019  
**Authored by:** Keaton (Lead)  
**Date:** 2026-02-09  
**Requested by:** bradygaster — *"i'd like a priority-based approach - quality then experience - for our next few waves of work"*  
**Supersedes:** Proposal 009 (v1 Sprint Plan) — sprint structure replaced with wave structure. Feature set and architecture decisions from 009 remain valid.

---

## The Principle

Brady's directive is clear: **quality first, then experience.** Not quality OR experience. Not quality balanced with experience. Quality FIRST. Because if it breaks, nothing else matters.

This changes the execution model. Proposal 009 organized work by capability (fast → yours → smart). This plan organizes by trust. Wave 1 makes Squad trustworthy. Wave 2 makes it delightful. Wave 3 makes it magical.

The ordering principle is compound: every quality investment in Wave 1 makes Wave 2 safer to ship. Every experience investment in Wave 2 makes Wave 3 more impactful. Nothing ships that doesn't earn its place.

---

## What's Already Shipped

Before planning what's next, here's the ledger of what's done:

| Item | Status | Evidence |
|------|--------|----------|
| Silent success bug mitigations (P015) | ✅ Shipped | 3 mitigations in squad.agent.md |
| Upgrade subcommand (`npx create-squad upgrade`) | ✅ Shipped | In index.js, lines 49-65 |
| Test suite (12 tests, 3 suites) | ✅ Shipped | test/index.test.js, all passing |
| Inbox-driven Scribe spawn | ✅ Shipped | In squad.agent.md |
| Scribe history.md created | ✅ Shipped | .ai-team/agents/scribe/ |
| decisions.md cleanup | ✅ Shipped | Headings, line endings fixed |
| First orchestration log entries | ✅ Shipped | orchestration-log/ |

**Current product surface:** 88-line index.js, zero dependencies, 12 passing tests, upgrade command, init with idempotency, `--version`, `--help`. Solid foundation. Not bulletproof yet.

---

## Wave 1: Quality — "Make It Trustworthy"

**Duration:** ~3-4 days  
**Principle:** If a user runs `npx create-squad` and something goes wrong, they never come back. Wave 1 is about eliminating every path where that happens.

### 1.1 Error Handling in index.js (Fenster)

**Problem:** index.js has zero error handling. Every filesystem operation is unguarded. If `squad.agent.md` source doesn't exist, if the target directory is read-only, if disk is full — raw stack trace. For a CLI tool with 9 users and a division watching, that's unacceptable.

**What ships:**
- Wrap `fs.copyFileSync`, `fs.mkdirSync`, `fs.readFileSync` in try/catch with human-readable error messages
- Validate that source files exist before copying (guard against corrupted npm install)
- Validate that `dest` (process.cwd()) is writable before starting
- Exit with code 1 on failure, code 0 on success (currently implicit)
- Add a top-level `process.on('uncaughtException')` handler that prints a clean message instead of a stack trace

**Effort:** 2 hours  
**Risk:** Very low — additive error handling, no behavior changes on happy path

### 1.2 Test Coverage Expansion (Hockney)

**Problem:** 12 tests cover init, idempotency, and copyRecursive. Missing: upgrade, `--version`, `--help`, error cases, edge cases. The test strategy (Proposal 013) identified 9 test categories — we've covered 3.

**What ships:**
- **Upgrade tests:** Upgrade overwrites squad.agent.md, preserves .ai-team/ contents, overwrites templates
- **Flag tests:** `--version` outputs semver, `--help` outputs usage, `help` subcommand works
- **Error case tests:** Init with missing source files (corrupted install), init in read-only directory (if testable on platform), unknown subcommand behavior
- **Edge case tests:** Very long path names, paths with spaces, Unicode directory names (Windows-relevant)
- **Exit code tests:** Verify process exits 0 on success, 1 on error (after 1.1 ships)

**Effort:** 3-4 hours  
**Risk:** Low — pure additive  
**Dependency:** Error case tests depend on 1.1 (error handling must exist to test it)

### 1.3 CI with GitHub Actions (Hockney)

**Problem:** Tests only run when someone remembers to run them. With 9 users and PRs incoming, we need automated quality gates.

**What ships:**
- `.github/workflows/ci.yml` — runs `npm test` on push and PR
- Matrix: Node 22.x on ubuntu-latest (expand to Windows later if needed)
- Status badge in README (when README ships in Wave 2)

**Effort:** 1 hour  
**Risk:** Very low — standard CI setup

### 1.4 Version Stamping — Phase 1 (Fenster)

**Problem:** Proposal 011 defines version stamping but it's not implemented. Users can't tell what version of Squad they're running beyond `--version`. The coordinator (`squad.agent.md`) has no version header, so upgrade can't report deltas.

**What ships:**
- Version comment header in `squad.agent.md`: `<!-- squad-coordinator-version: 0.1.0 -->`
- `upgrade` subcommand reads header, compares to package version, reports: "Upgraded coordinator from 0.1.0 to 0.2.0" or "Already up to date"
- `engines` field in `package.json`: `"node": ">=22.0.0"`

**Effort:** 1-2 hours  
**Risk:** Low — the upgrade subcommand already exists, this adds intelligence to it

### 1.5 Silent Success Bug — Deeper Mitigation (Verbal)

**Problem:** P015 mitigations are in place but the bug still hits ~1 in 6 agents this session. The mitigations (prompt reorder, file verification, response mandate) reduce the rate but don't eliminate it. More aggressive prompt engineering may help.

**What ships:**
- Audit current mitigations effectiveness — measure which agents still silent-fail
- Strengthen the response mandate in spawn prompts: move the "you MUST end with text" instruction to the FIRST line of every spawn prompt, not buried in the charter
- Add a coordinator-side retry: if `read_agent` returns empty and the agent wrote files, re-read with a longer timeout
- Document the bug honestly in the README (Wave 2) — users should know this is a platform constraint, not Squad being broken

**Effort:** 2 hours  
**Risk:** Low — prompt changes only, no code changes to index.js

### Wave 1 Summary

| Item | Owner | Effort | Dependency |
|------|-------|--------|------------|
| 1.1 Error handling | Fenster | 2h | None |
| 1.2 Test expansion | Hockney | 3-4h | 1.1 (error tests) |
| 1.3 CI setup | Hockney | 1h | None |
| 1.4 Version stamping | Fenster | 1-2h | None |
| 1.5 Silent success deeper fix | Verbal | 2h | None |
| **Total** | | **9-11h** | |

### Wave 1 Gate: "Can We Trust It?"

Wave 1 is complete when ALL of these are true:

- [ ] `npm test` passes 20+ tests covering init, upgrade, flags, and error cases
- [ ] CI runs on every push and PR
- [ ] index.js has zero unhandled exceptions on any filesystem error
- [ ] `squad.agent.md` has a version header
- [ ] `upgrade` reports version deltas
- [ ] Silent success rate is measured and documented

**This gate is binary.** If any item fails, Wave 2 doesn't start. Quality is not negotiable.

---

## Wave 1.5: Zero-Risk Experience (Parallel Track)

**Key insight:** Some experience work has ZERO quality risk because it doesn't touch code. These can run in parallel with Wave 1 without violating Brady's principle.

### 1.5.1 README Rewrite (McManus)

**Why parallel-safe:** The README is a markdown file. It doesn't affect index.js, tests, or the coordinator. McManus can ship Proposal 006's copy-paste-ready README without touching anything Wave 1 cares about.

**What ships:**
- New README.md from Proposal 006 (already written, already reviewed)
- CI status badge (depends on 1.3 — add after CI ships)
- Honest "Known Limitations" section documenting the silent success bug

**Effort:** 1-2 hours (mostly integration, the copy is done)  
**Risk:** Zero to codebase quality

### 1.5.2 Messaging Polish (McManus)

**Why parallel-safe:** Proposal 014's positioning, tagline hierarchy, and launch messaging are pure content. No code.

**What ships:**
- Finalized tagline: "Throw MY squad at it" (pending portability) or "Throw a squad at it" (current)
- npm package description update (one line in package.json)
- CHANGELOG.md for v0.1.0 documenting what's shipped

**Effort:** 1-2 hours  
**Risk:** Zero to codebase quality

### 1.5.3 Squad Paper Draft (Verbal)

**Why parallel-safe:** The Squad paper (Proposal 016) is a standalone document. Pure thought leadership.

**What ships:**
- First complete draft of the Squad paper
- Positioned for v1 launch amplification

**Effort:** 3-4 hours  
**Risk:** Zero to codebase quality

---

## Wave 2: Experience — "Make It Feel Right"

**Duration:** ~5-7 days  
**Principle:** Quality is proven. Now make the product feel like the future.  
**Gate prerequisite:** Wave 1 gate must be GREEN.

### 2.1 Tiered Response Modes (Verbal + Kujan)

**Why this is first in Wave 2:** Latency is the #1 experience complaint. Brady said it: "later on, the agents get in the way more than they help." Proposal 007's tiered modes (Direct/Lightweight/Standard/Full) transform the experience from "30 seconds for everything" to "3 seconds for simple things." This is the single highest-impact experience change.

**What ships:**
- Routing table in `squad.agent.md` for mode selection (Direct/Lightweight/Standard/Full)
- Coordinator context caching (skip re-reading team.md/routing.md/registry.json after first message)
- Scribe batching (only spawn when inbox has files)
- Coordinator direct handling for trivial tasks (single-line changes, status queries)

**Effort:** 3-4 hours  
**Risk:** Medium — routing judgment is the critical variable. Wrong routing (handling something directly that should have been spawned) is worse than slow routing.  
**Mitigation:** Bias toward spawning when uncertain. Direct mode only for unambiguous tasks.

### 2.2 Version Detection + Smart Upgrade (Fenster)

**Why here:** With version stamping shipped in Wave 1, we can now build the full upgrade intelligence from Proposal 011.

**What ships:**
- Upgrade detects version delta and reports what changed
- Upgrade runs additive-only migrations (create new directories that future versions introduce, like `skills/`)
- Migration registry: version-keyed functions that run on upgrade

**Effort:** 2-3 hours  
**Risk:** Low — upgrade is already shipping; this adds intelligence  
**Dependency:** Wave 1 item 1.4 (version stamping)

### 2.3 Skills System — Phase 1 (Verbal + Fenster)

**Why Phase 1 only:** The full skills system (Proposal 010) is big. Phase 1 is template + instruction only — add the Agent Skills standard SKILL.md format to templates, update spawn prompts to reference skills when present. No skill acquisition, no skill routing, no MCP declarations. Just: if `.ai-team/skills/react-patterns/SKILL.md` exists, agents read it.

**What ships:**
- Skills directory template in `.ai-team-templates/`
- SKILL.md format reference (from the Agent Skills standard)
- Spawn prompt update: "If `.ai-team/skills/` contains SKILL.md files, read relevant ones before working"
- Example skill: `squad-conventions/SKILL.md` documenting Squad's own patterns

**Effort:** 3-4 hours  
**Risk:** Low — additive prompt changes + new template files  
**Strategic value:** High — this is the foundation for Phase 2 (earned skills) and portability

### 2.4 Export/Import CLI — Export Only (Fenster)

**Why export-only first:** Proposal 008 (Portable Squads) is 11-14 hours total per Fenster's estimate. That's too big for one wave item. But export alone is ~4 hours and is useful standalone — users can backup squad state, share via Gist, diff over time. Import builds on export in Wave 3.

**What ships:**
- `npx create-squad export` subcommand
- Produces `squad-export.json` with casting state, charters, filtered histories
- `--out` flag for custom output path
- Clear messaging: "Review agent histories before sharing"
- Tests for export (Hockney)

**Effort:** 4-5 hours (including tests)  
**Risk:** Medium — new code path in index.js, but well-specified in Proposal 008/008-platform  
**Dependency:** Wave 1 gate (error handling and CI must be in place)

### Wave 2 Summary

| Item | Owner | Effort | Dependency |
|------|-------|--------|------------|
| 2.1 Tiered response modes | Verbal + Kujan | 3-4h | Wave 1 gate |
| 2.2 Smart upgrade | Fenster | 2-3h | 1.4 (version stamping) |
| 2.3 Skills Phase 1 | Verbal + Fenster | 3-4h | Wave 1 gate |
| 2.4 Export CLI | Fenster | 4-5h | Wave 1 gate |
| **Total** | | **12-16h** | |

### Wave 2 Gate: "Does It Feel Fast and Forward?"

- [ ] Trivial tasks (status queries, single-line changes) complete in <5 seconds
- [ ] `npx create-squad export` produces a valid, human-readable JSON manifest
- [ ] Skills directory exists in templates; agents read skills when present
- [ ] Upgrade reports version deltas and runs migrations
- [ ] All new code has tests; CI is green

---

## Wave 3: Experience — "Make It Magical"

**Duration:** ~7-10 days  
**Principle:** The product works and feels good. Now add the features that make people say "holy crap."  
**Gate prerequisite:** Wave 2 gate must be GREEN.

### 3.1 Import CLI + Portability Complete (Fenster)

**What ships:**
- `npx create-squad import <file>` subcommand
- Collision detection (refuse if squad exists, `--force` for replacement)
- Coordinator detects imported squad on first session, runs lightweight onboarding
- Round-trip tests: export → import → verify identity preserved, project context dropped
- History split: Portable Knowledge vs Project Learnings sections in history.md template

**Effort:** 5-6 hours  
**Risk:** Medium — import modifies init flow, needs thorough testing  
**Dependency:** 2.4 (export must exist)

### 3.2 Skills Phase 2 — Earned Skills (Verbal)

**What ships:**
- Agents learn to identify and extract skills from real work
- Skill confidence lifecycle: low → medium → high based on repeated application
- Skill-aware routing: coordinator checks skills when selecting agents for tasks
- MCP tool declarations in skill metadata (Brady's specific request)

**Effort:** 4-5 hours  
**Risk:** Medium-high — depends on prompt engineering quality for reliable skill categorization  
**Dependency:** 2.3 (Phase 1 format must exist)

### 3.3 Progressive History Summarization (Verbal)

**What ships:**
- Scribe responsibility: when history.md exceeds 3,000 tokens, summarize entries older than 2 weeks into Core Context
- Archive original entries to `history-archive.md`
- Keeps agent startup time constant regardless of project age

**Effort:** 2-3 hours  
**Risk:** Medium — lossy compression. Mitigated by archival (original data preserved)

### 3.4 Lightweight Spawn Template (Kujan)

**What ships:**
- Spawn template for simple, scoped tasks: no charter inline, no history read, just the task
- Use `explore` agent type for read-only queries (Haiku model, faster)

**Effort:** 1-2 hours  
**Risk:** Low — additive template, coordinator already routes by complexity (from 2.1)

### Wave 3 Summary

| Item | Owner | Effort | Dependency |
|------|-------|--------|------------|
| 3.1 Import + portability | Fenster | 5-6h | 2.4 (export) |
| 3.2 Skills Phase 2 | Verbal | 4-5h | 2.3 (Skills Phase 1) |
| 3.3 History summarization | Verbal | 2-3h | Wave 2 gate |
| 3.4 Lightweight spawn | Kujan | 1-2h | 2.1 (tiered modes) |
| **Total** | | **12-16h** | |

### Wave 3 Gate: "The Holy Crap Moments"

- [ ] Export from Project A → Import into Project B → agents know the user, not the old project
- [ ] An agent earns a skill in one project; the skill appears in the skills directory
- [ ] Message 15 of a session is faster than message 1
- [ ] Users say "holy crap" at least once during a demo

---

## Wave 4+: Horizon (Not Planned, Not Promised)

These are real features that don't earn a place in Waves 1-3. They're recorded here so we don't lose them.

| Feature | Source | Why Not Now |
|---------|--------|-------------|
| Squad DM (Proposal 017) | Brady request | Requires Gateway architecture, Dev Tunnels, platform adapters. Massive scope. Ship after core product is bulletproof. |
| Export merge (`--merge`) | Proposal 008 | Universe conflicts are unsolvable in v1. `--force` is honest. |
| Squad sharing / registry | Proposal 008 v2/v3 | Needs portability to be proven first. |
| Video content (Proposal 005) | McManus | Not blocked, can happen anytime. But not a code priority. |
| Conditional memory loading | Proposal 007 | Marginal gain (~1.5s/spawn). Tiered modes solve the big latency problem. |
| Agent-to-agent negotiation | Verbal | Fascinating. Premature. |
| Speculative execution | Verbal | Fascinating. Premature. |
| Squad Paper publication | Verbal | Draft in Wave 1.5. Publication timing is a launch decision, not a dev decision. |

**Squad DM specifically:** Proposal 017 is architecturally sound and Brady clearly wants it. But it's a second product surface — a Gateway server, platform adapters, tiered execution outside the CLI, auth, rate limiting. Building it before the core CLI is bulletproof is how you get two half-finished products instead of one great one. Wave 4 at earliest. Probably its own wave plan.

---

## Parallelism Map

Not everything is sequential. Here's what can run simultaneously:

```
Wave 1 (Quality)                    Wave 1.5 (Zero-Risk Experience)
├── 1.1 Error handling (Fenster)    ├── 1.5.1 README (McManus)
├── 1.3 CI setup (Hockney)         ├── 1.5.2 Messaging (McManus)
├── 1.4 Version stamping (Fenster) └── 1.5.3 Squad Paper (Verbal)
├── 1.5 Silent success (Verbal)
└── 1.2 Test expansion (Hockney)    ← depends on 1.1
```

Within Wave 2:
```
Wave 2 (Experience)
├── 2.1 Tiered modes (Verbal + Kujan)     ← can start immediately
├── 2.2 Smart upgrade (Fenster)            ← can start immediately
├── 2.3 Skills Phase 1 (Verbal + Fenster)  ← can start immediately
└── 2.4 Export CLI (Fenster)               ← after 2.2 (Fenster bandwidth)
```

Within Wave 3:
```
Wave 3 (Magical)
├── 3.1 Import CLI (Fenster)           ← depends on 2.4
├── 3.2 Skills Phase 2 (Verbal)        ← depends on 2.3
├── 3.3 History summarization (Verbal) ← after 3.2 (Verbal bandwidth)
└── 3.4 Lightweight spawn (Kujan)      ← can start immediately
```

---

## What I Cut and Why

| Cut | Why |
|-----|-----|
| **Init always-overwrite squad.agent.md** (from Proposal 009) | Already shipped differently — init skips, upgrade overwrites. Brady's users have the upgrade path. The current idempotent init behavior is what users expect and tests verify. Changing it now breaks 4 tests and 9 users' muscle memory for zero gain. |
| **History split as Wave 1 prerequisite** (from Proposal 008) | History split is architecturally correct but not a quality issue. It's an experience issue — portability. Moved to Wave 3 where it compounds with import. |
| **LLM-powered history classification** | Proposal 008 correctly punted this. Manual curation in v1, LLM classification in v2+. |
| **Squad merge** | Universe conflicts are a design problem, not an engineering problem. `--force` with archival is honest. |
| **Conditional memory loading** (Proposal 007 Solution 3) | ~1.5s savings per spawn. Tiered response modes (Wave 2.1) save 25+ seconds on trivial tasks. Optimize the big thing first. |
| **Squad DM** (Proposal 017) | Second product surface. Ship after first product surface is bulletproof. |

---

## Total Effort Estimate

| Wave | Effort | Calendar (parallel) |
|------|--------|-------------------|
| Wave 1 + 1.5 | 14-19h | 3-4 days |
| Wave 2 | 12-16h | 5-7 days |
| Wave 3 | 12-16h | 7-10 days |
| **Total** | **38-51h** | **~3 weeks** |

---

## The Principle, Restated

Brady said quality then experience. Here's what that means in practice:

**Wave 1 earns trust.** Every error is handled. Every path is tested. CI catches regressions. Version stamping enables forwardability. The silent success bug is measured and documented honestly. Users can rely on `npx create-squad` the way they rely on `npm init`.

**Wave 1.5 proves we can walk and chew gum.** Docs and messaging never conflict with code quality work. McManus and Verbal can ship content while Fenster and Hockney harden the core.

**Wave 2 delivers experience that quality made safe.** Tiered modes, skills, and export are all features that could break things — but they ship into a codebase with 20+ tests, CI, error handling, and version tracking. The quality foundation makes experience work lower-risk.

**Wave 3 compounds everything.** Import builds on export. Phase 2 skills build on Phase 1. History summarization builds on the history format. Lightweight spawns build on tiered routing. Every Wave 3 item is only possible because Waves 1 and 2 laid the foundation.

Quality isn't a phase you finish. It's the foundation everything else stands on.

---

**Review requested from:** bradygaster (this is your directive — does this plan match your intent?)  
**Approved by:** [Pending]  
**Implemented:** [Pending]
