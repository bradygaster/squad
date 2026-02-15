# Team Decisions

Shared brain. All agents read this before working.
---

## Deduplication Notes (2026-02-12)

**Overlapping decisions identified and consolidated:**

1. **Branching Strategy:** Multiple decisions on branching (2026-02-09, 2026-02-11, 2026-02-12) represent evolution of thinking:
   - 2026-02-09: Initial decision (dev/main separation)
   - 2026-02-10: Keaton's proposal (three-branch model with feature branches)
   - 2026-02-11: Fenster's analysis (validating three-branch model)
   - 2026-02-12: Kobayashi's hardening (branch protection rules)
   Together they represent the progression from initial model through detailed proposal to hardening implementation.

2. **Release Process:** Decisions span 2026-02-09 through 2026-02-12, building on each other:
   - 2026-02-09: Pipeline audit
   - 2026-02-11: Release process directive (no manual pushes)
   - 2026-02-12: Detailed hardening with branch protection rules
   Consolidated as single logical progression of release safety.

3. **Version Display:** Kujan's 2026-02-12 decision implements existing infrastructure from 2026-02-10 per-agent model selection. No duplication.

All original decision blocks preserved for historical context. No content removed.

---

## Initial Setup


### 2026-02-07: Team formation
**By:** Copilot (Coordinator)
**What:** Created Squad's own team using The Usual Suspects universe — Keaton (Lead), Verbal (Prompt Engineer), McManus (DevRel), Fenster (Core Dev), Hockney (Tester).
**Why:** Squad needs a dedicated team to evolve the product, amplify its message, and stay ahead of the industry. Casting chosen to represent pressure and consequence, not literal role names. Brady (the owner) requested The Usual Suspects specifically.

### 2026-02-07: Proposal-first workflow adoption

**By:** Keaton + Verbal
**Date:** 2026-02-07
**Context:** bradygaster's request for "proposal first" mindset

Squad adopts a proposal-first workflow for all meaningful changes (features, architecture, major refactors, agent design, messaging, breaking changes). Proposals must be written, reviewed by domain specialists, and approved by bradygaster before execution.

**Why:** Squad's mission requires compound decisions — each feature making the next easier. This only works with visibility and alignment. Proposals are the mechanism: visibility (changes documented before execution), alignment (team reviews before merge), memory (historical record of why choices were made), filtering (bad ideas cancelled, good ideas refined).

**What Changes:** New directory `docs/proposals/` with numbered markdown files. Agents write proposals, not just code. Review gates: Keaton (architecture), Verbal (AI strategy), domain specialists, Brady (final approval). 48-hour timeline.

**What Doesn't Change:** Bug fixes, minor polish, tests, doc updates, dependency bumps — no proposal needed. Parallel execution, drop-box pattern, casting system — all stay the same.

**Implementation:** Proposal written to `docs/proposals/001-proposal-first-workflow.md`.

### 2026-02-07: DevRel priorities for Squad onboarding

**By:** McManus

**What:** Identified six critical polish areas to improve Squad's first-5-minutes developer experience: (1) Make install output visible and explanatory, (2) Link sample-prompts.md from README (16 ready-to-use demos), (3) Add "Why Squad?" value prop section, (4) Elevate casting from Easter egg to feature, (5) Add troubleshooting section, (6) Record 2-minute demo video/GIF showing parallel work.

**Why:** The product has strong bones — solid messaging, tight Quick Start, real numbers in the context budget table — but the first-time experience has gaps. Install output is too quiet (just checkmarks, no structure explanation). Sample prompts are hidden in docs/. Casting (thematic persistent names) is mentioned once but not explained. No "why should I care?" section. No troubleshooting. No visual demo. These gaps increase time-to-value and reduce conversion. Priority is making the first 5 minutes irresistible — from "what is this?" to "I need this" as fast as possible.

### 2026-02-07: Stay independent, optimize around Copilot
**By:** Kujan
**What:** Squad will NOT become a Copilot SDK product. Instead, we optimize around the platform while maintaining independence. Focus on being the best example of what you can build *on* Copilot, not *of* Copilot.
**Why:** Squad's filesystem-backed memory (git-cloneable, human-readable) is a killer feature. SDK adoption would abstract this away and reduce transparency. We can evolve faster independently. If the SDK later adds features we need (agent memory primitives, marketplace integration, spawn quota management), we reconsider. Until then: independent product, platform-optimized implementation.

### 2026-02-09: Portable Squads — architecture, platform, and experience (consolidated)

**By:** Keaton, Kujan, Verbal
**Proposals:** 008-portable-squads.md, 008-portable-squads-platform.md, 008-portable-squads-experience.md

**What:** Squad supports exporting and importing team identity across projects via a JSON manifest file. Key decisions from three independent analyses:
- **Architecture (Keaton):** Separate Team Identity (portable) from Project Context (not portable). History split into portable knowledge and project learnings. Export format is a single `squad-export.json`. CLI: `npx create-squad export` / `npx create-squad --from <manifest>`. Casting travels unconditionally. No merge in v1.
- **Platform (Kujan):** CLI subcommands, `.squad` JSON file format, refuse merge in v0.1, manual history curation in v0.1 with LLM-assisted cleanup in v0.2. `imported_from` flag in registry.json. Implementation ~80 lines. No new dependencies.
- **Experience (Verbal):** Memory split: `preferences.md` (portable) from `history.md` (project-specific). `squad-profile.md` for team meta-history. Import skips casting ceremony. Narrative markdown for v1.

**Why:** The team is more valuable than the project. Without portability, users rebuild from scratch. Category-defining feature — nobody in the industry has portable agent teams. Opens path to squad sharing (v2) and registries (v3). Filesystem-backed memory makes export trivially simple. Combined with skills: a squad arrives at a new project already knowing the user AND the technology.

### 2026-02-09: Skills system — open standard with MCP tool declarations (consolidated)

**By:** Kujan, Verbal
**Proposals:** 010-skills-system.md, 012-skills-platform-and-copilot-integration.md (both Revision 2)

**What:** Squad agents acquire, store, and apply skills — earned domain knowledge that changes how agents approach work. Evolution across four independent analyses:
- **Initial design (Verbal, 2026-02-08):** Skills as portable competence distinct from preferences. Per-agent `skills.md` files. Lifecycle: acquisition → reinforcement → correction → deprecation. Confidence tracked by project count.
- **Platform feasibility (Kujan, 2026-02-08):** Skills stored separately from history for clean export. `store_memory` tool rejected (wrong persistence model). File paths in charters are frozen API contracts. Forwardability via defensive reads.
- **Open standard adoption (Kujan, 2026-02-09):** Adopted Agent Skills Open Standard (agentskills.io). SKILL.md format with YAML frontmatter. Standard directory layout. MCP tool dependencies declared via `metadata.mcp-servers`. Two categories: built-in (squad-prefixed, upgradable) and learned (never overwritten).
- **Final decision (Verbal, 2026-02-09):** Skills in `.ai-team/skills/{skill-name}/SKILL.md`. Coordinator injects `<available_skills>` XML for progressive disclosure (~50 tokens per skill at discovery). Skills portable beyond Squad — works in Claude Code, Copilot, any compliant tool.

**Why:** Brady's directive: skills adhering to Anthropic SKILL.md standard with MCP tool declarations. Squad's unique value: it GENERATES standard-compliant skills from real work while others author by hand. Flat `skills/` directory replaces per-agent files — skills are team knowledge. Ecosystem compatibility, progressive disclosure, and future-proofing. Implementation phased across 6 releases.

### 2026-02-09: Scribe resilience — template fix + inbox-driven spawn
**By:** Verbal
**What:** Two related fixes shipped:
1. **Template patch:** Scribe spawn template in `squad.agent.md` was the only template missing the `⚠️ RESPONSE ORDER` instruction. Fixed. Also cleaned contaminated content in Verbal's history.md (Proposal 016 entry had Proposal 010's details).
2. **Cascade fix:** Added inbox-driven Scribe spawn to squad.agent.md "After Agent Work" section. Coordinator now checks `.ai-team/decisions/inbox/` for files BEFORE deciding whether to spawn Scribe. If inbox has files, Scribe spawns regardless of agent response status. Created `.ai-team/agents/scribe/history.md` — Scribe was the only agent without memory.
**Why:** Scribe is the most vulnerable agent to the silent success bug (does nothing but tool calls). The cascade: silent success → Scribe not spawned → inbox accumulates → decisions.md stale → team diverges. Fix triggers on artifacts (files), not responses (agent output).
**Scope:** squad.agent.md (4 lines changed), new file scribe/history.md.

### 2026-02-09: P0 bug audit — shared state integrity findings (consolidated)
**By:** Keaton (Lead), Fenster (Core Dev), Hockney (Tester)
**What:** Three independent audits converged on the same findings:
1. **Drop-box pipeline broken:** Up to 12 inbox files accumulated unmerged across sessions. Scribe was either never spawned or silent-failed. This is the silent success bug manifesting in team infrastructure.
2. **Scribe had no history.md** — lost to the silent success bug. Every spawn started from scratch. (Now fixed by Verbal.)
3. **Orchestration log is dead** — zero entries written despite 20+ agent spawns across 4+ sessions.
4. **Demo script ACT 7 missing** — McManus flagged, now restored (see separate decision).
5. **P015 mitigations don't reach existing users** — `index.js` skip-if-exists blocks fixes from pre-existing installs. Upgrade subcommand is the delivery mechanism (now shipped by Fenster).
6. **decisions.md had raw review dumps** (lines 315-826) not formatted as decisions.
7. **Phantom references** in Verbal's history and session log (`003-casting-system.md` vs actual `003-copilot-platform-optimization.md`).
**The cascade pattern:** Silent success bug → Scribe not spawned → inbox accumulates → decisions.md stale → agents work with incomplete context → more divergence. This is not just a display bug — it's a shared state corruption vector.
**Required actions (most now completed):**
- ✅ Merge orphaned inbox files (this session)
- ✅ Inbox-driven Scribe spawn added to coordinator
- ✅ Scribe's history.md created
- ⬜ Orchestration log: implement or remove from charter
- ⬜ Add `npm test` to CI when pipeline is set up

### 2026-02-09: Upgrade Subcommand Shipped
**By:** Fenster (Core Dev)
**What:** Implemented `upgrade` subcommand in `index.js`. Running `npx create-squad upgrade` now overwrites Squad-owned files (`squad.agent.md`, `.ai-team-templates/`) to bring existing installs forward. Added `--help`, `-h`, `help`, `--version`, `-v` support.
**File ownership enforced:** Squad-owned (overwrite on upgrade): `.github/agents/squad.agent.md`, `.ai-team-templates/`. User-owned (never touched): `.ai-team/`. Additive-only: inbox, orchestration-log, casting dirs.
**Not in this pass:** No backup-before-overwrite, no version detection, no migration framework — deferred per Proposal 011's phased approach.
**Why:** Pre-P015 users are stuck on coordinator instructions without RESPONSE ORDER and silent success detection. The upgrade subcommand is the delivery mechanism for these fixes.

### 2026-02-09: Background agent timeout best practices documented
**By:** Kujan (Copilot SDK Expert)
**What:** Created `docs/platform/background-agent-timeouts.md` — best practices covering the `read_agent` default timeout problem (30s default vs 45-120s real work), response order issue, and file-verification detection pattern. Key numbers: 30s default timeout, 45-120s real agent work time, 300s safe ceiling.
**Why:** The 30s default was causing ~40% of agents to appear failed when still working. Doc captures hard-won knowledge for future builders.

### 2026-02-09: Squad DM — architecture and experience design (consolidated)

**By:** Keaton, Verbal
**Proposal:** 017-squad-dm.md (architecture, platform feasibility, experience design)

**What:** Direct messaging interface for Squad across Telegram, Slack, Discord. Key decisions from two independent analyses:
- **Architecture (Keaton, 2026-02-08):** Thin platform adapters → Squad DM Gateway → tiered execution (Direct LLM for queries, Copilot CLI for code, GitHub Actions for CI). Dev Tunnels for webhook ingress. Auth via dm-config.json. Three phases: MVP Telegram (2-3 days), multi-platform (1-2 weeks), full parity + proactive notifications (2-4 weeks). Includes Kujan's platform feasibility: Copilot SDK as execution backend, ~420 lines new code. Gate: verify nested SDK sessions before committing.
- **Experience (Verbal, 2026-02-09):** Single Squad bot with emoji-prefixed agent identity. DM output: summary + GitHub link, never inline full artifacts. Proactive messaging: CI alerts, daily standups, decision prompts. Cross-channel memory: DM and terminal share `.ai-team/` state. DM mode flag in spawn prompts adapts output without changing personality.

**Why:** Brady wants to work with his Squad away from the terminal ("YES LIKE MOLTS but just my team(s)"). Cross-channel memory is the architectural moat. DM transitions Squad from reactive tool to proactive team. Deferred to Wave 4+ per Proposal 019.

### 2026-02-09: Brady directives — session 5 batch

**By:** bradygaster (human)

**Directives:**

1. **VS Code parity:** No reason Squad shouldn't work in VS Code Copilot Chat as well or better than CLI. Investigate.

2. **"Feels heard" clarification:** Not just coordinator saying "gotcha" — ideally human input impacts ongoing agent work in real-time. If not possible, enhance the experience for now. Don't let perfect be the enemy of good.

3. **README timing:** Consider saving README rewrite for the end, OR keep it updated as we go. Team's call. But think of each iteration as individually blogworthy.

4. **Blog engine meta-play:** Create a blog markdown format to update users on progress. Then make one of the sample prompts a blog engine with amazing front-end UX that renders Squad blog posts. Meta.

5. **NPM package naming:** Currently `bradygaster/squad`. Wants easy-to-understand npx commands for update/export. If we need to rename now, do it — not at v1 yet. Optimize for consistency and future-proofing.

6. **Human feedback optimization:** "please please optimize for an efficient experience or a continually up-to-date one for the human. humans like feedback." — This is a P0 UX principle for all work going forward.

---

### 2026-02-09: No npm distribution — GitHub-only model (consolidated)
**By:** bradygaster, Keaton
**What:** Squad is NOT published to npm. Not now, not ever. Distributed exclusively via `npx github:bradygaster/squad`. Item 1.8 from Proposal 019a (Register create-squad on npm) is CANCELLED. All documentation must use GitHub-hosted npx syntax. Kobayashi (Git & Release Engineer) hired to own releases, tags, branch strategy, CI/CD, and state integrity. Three new Wave 1 items added (1.11 release workflow, 1.12 branch strategy, 1.13 first tagged release). Wave 1 effort increases from 15-18h to 18-22h.
**Why:** Brady's explicit decision: no npm registry involvement. GitHub is the sole distribution channel. The package name is the GitHub repo name. Keaton executed the directive, updating Proposal 019a and onboarding Kobayashi.

### 2025-07-16: Proposal 021 — Release Plan & Distribution Strategy

**By:** Kobayashi (Git & Release Engineer)

**Decisions proposed (pending Brady's approval):**

1. **Distribution model:** `npx github:bradygaster/squad` pulls `main` HEAD. Version pinning uses `#` syntax: `npx github:bradygaster/squad#v0.2.0`. No npm publish — ever.

2. **Branch strategy:** `main` is release-only (always stable, always what users get). `squadify` is the development branch. Merges to `main` happen only during the release process. Direct push to `main` is prohibited.

3. **Tag format:** `v{MAJOR}.{MINOR}.{PATCH}` — e.g., `v0.1.0`, `v0.2.0`. Tags are immutable.

4. **Semantic versioning (pre-v1):** Minor bump for new features/breaking changes, patch bump for bug fixes and content changes. Wave completion → minor bump.

5. **CI pipeline:** `.github/workflows/ci.yml` — runs `npm test` on push/PR to `main` and `squadify`. Node 22.x, ubuntu-latest. Includes smoke test (init) and state integrity test (upgrade preserves `.ai-team/`).

6. **Release automation:** `.github/workflows/release.yml` — triggered by `v*` tag push. Validates tag matches `package.json` version, runs tests, creates GitHub Release with install/upgrade/pin instructions, verifies npx resolution.

7. **State integrity:** `.ai-team/` is never touched by upgrade — enforced in CI with a sentinel file test. `.ai-team/` stays out of `.gitignore` (it's user state that should be committed).

8. **Release authority:** Open question — does Brady approve each release, or can Kobayashi cut releases when wave gates pass?

**Proposal location:** `docs/proposals/021-release-plan-and-distribution.md`

**Implements:** Sprint Plan items 1.3 (CI setup), release process (new scope), distribution strategy (new scope).

**Open questions for Brady:**
- Tag `v0.1.0` now or wait for Wave 1 → `v0.2.0`?
- Is the repo public or private? (affects branch protection and API access)
- Release authority model?
- When to merge `squadify` → `main` for the first time?

### 2026-02-09: Branch strategy — dev has everything, main is product-only

**By:** bradygaster (human)

**Decision:**

1. **Rename `squadify` to `dev`** — all work continues here, including Squad Squad files (`.ai-team/`, `docs/proposals/`, orchestration logs, etc.)

2. **`main` is product-only** — when we merge to main, Squad Squad files are excluded. Main only gets: `index.js`, `package.json`, `.github/agents/squad.agent.md`, `templates/`, `test/`, `README.md`, `LICENSE`, `.npmignore`.

3. **`dev` is public and intentional** — the Squad Squad state being visible is part of the story. Dog-fooding in public.

4. **`npx github:bradygaster/squad` pulls from `main`** — users always get clean product, never the Squad Squad.

**Impact:**
- Kobayashi needs to design the merge-to-main process to strip Squad Squad files
- CI runs on `dev`, releases cut from `main`
- The `.ai-team/` files in this repo never land on `main`


---

# Decision: Branch Strategy & Release Workflow

**Author:** Kobayashi (Git & Release Engineer)  
**Date:** 2025-07-16  
**Status:** Implemented (pending Brady's push)

---

## Branch Rename

- `squadify` renamed to `dev` (local only — remote rename is Brady's call)
- `dev` is the primary development branch; Squad Squad lives here and is intentionally public (dog-fooding story)

## Branch Separation

| Branch | Purpose | Contains |
|--------|---------|----------|
| `main` | Product-only, what users get via `npx github:bradygaster/squad` | `index.js`, `package.json`, `README.md`, `LICENSE`, `.gitignore`, `.npmignore`, `.gitattributes`, `.github/agents/squad.agent.md`, `templates/` |
| `dev` | Development + Squad Squad | Everything — product files, `.ai-team/`, `docs/`, `test/`, `.github/workflows/`, etc. |

## Release Process: Filtered-Copy Strategy

**Chosen approach:** Script-based filtered copy via GitHub Actions (Option C from Brady's list).

**How it works:**
1. Workflow triggers on `workflow_dispatch` (enter version) or tag push
2. Tests run on `dev` — gate before anything ships
3. Checks out `dev`, copies only product files to staging area
4. Switches to `main`, replaces content with staged product files
5. Commits `release: v{version}` on `main`
6. Tags the commit, pushes `main` + tag
7. Creates GitHub Release (prerelease for pre-v1)
8. Verifies `npx` resolution

**Why this over alternatives:**
- **Not force-push (Option A):** Destructive, loses `main` commit history
- **Not `.gitattributes` merge drivers (Option B):** Fragile, hard to debug, requires all contributors to configure
- **Not orphan branch (Option D):** Loses all git history tracing from `dev`
- **Filtered-copy is:** Simple, explicit, auditable, reversible, automatable

## Files Created/Modified

- **Created:** `.github/workflows/release.yml`
- **Modified:** `docs/proposals/021-release-plan-and-distribution.md` (updated all references from `squadify` → `dev`, rewrote §4b and §5)

## Action Required

- Brady: push `dev` branch to remote (replaces `squadify`)
- Brady: review and approve release workflow before first use
- Brady: set remote default branch to `dev` on GitHub (or keep `main` as default — either works since `main` is what users pull)


---

# Decision: Squad Squad Isolation — Distribution Hygiene

**Author:** Kobayashi (Git & Release Engineer)  
**Date:** 2026-02-09  
**Status:** Implemented  
**Triggered by:** bradygaster — "you're the squad squad"

---

## Problem

Squad (the product) and the Squad Squad (the AI team that builds it) live in the same repository. When users run `npx github:bradygaster/squad`, should they receive the team's internal state (`.ai-team/`, `docs/proposals/`, orchestration logs, etc.) alongside the product?

Brady's position: The repo is completely public. The Squad Squad state SHOULD be visible (it's the story — dogfooding). But it should NOT ship to users as part of the `npx` install.

## Analysis of Options

### 2026-02-09: Tone audit — surgical cleanup of public-facing content

**By:** Verbal

**What:** Full tone audit of all agent charters, histories, decisions.md, session logs, orchestration logs, blog post, README, and key proposals (014, 014a, 005, 008, 010, 017, 019a). Applied Brady's tone governance directive: SFW, polite, no self-congratulation, no AI-flowery talk, keep opinionated voices intact.

**What was fixed (13 edits across 7 files):**

1. **`docs/proposals/014-v1-messaging-and-launch.md`** (3 edits)
   - "three features that change everything" → "three features that matter"
   - "changes everything about AI tools" → "not like any AI tool you've used"
   - Endorsement: removed "This is the launch Squad has been building toward" and "Make it pop" — self-congratulatory

2. **`docs/proposals/005-video-content-strategy.md`** (2 edits)
   - "paradigm shift, and it looks like magic on screen" → "fundamentally different workflow, and it looks compelling on screen"
   - Endorsement: "positions Squad as inevitable" → "gets Squad in front of people early"; cut "Beat everyone to the visual language"

3. **`docs/proposals/010-skills-system.md`** (2 edits)
   - "This is brilliant" → "This works well"
   - "This is huge" → "This matters"

4. **`docs/proposals/019a-sprint-plan-amendments.md`** (2 edits)
   - "This is brilliant" → "This is a strong play"
   - "incredible front-end reading experience" → "polished front-end reading experience"

5. **`docs/proposals/008-portable-squads-experience.md`** (2 edits)
   - Section header "Why This Changes Everything" → "Why This Matters"
   - "massive messaging upgrade. The possessive pronoun changes everything" → "significant messaging upgrade. The possessive pronoun matters"

6. **`docs/proposals/014a-where-are-we-messaging-beat.md`** (2 edits)
   - Reduced "category-defining" from 3 uses to 1 (kept the section-setting one, replaced the others with "strongest beat" and "lead beat")

7. **`docs/proposals/017-dm-experience-design.md`** (3 edits)
   - "The Three Things That Make Squad DM Category-Defining" → "The Three Things That Make Squad DM Different"
   - "Absolutely yes" → "Yes" (in Verbal's dialogue)
   - "Nobody else is doing this. Nobody." → "Nobody else is doing this yet."

8. **`.ai-team/agents/verbal/history.md`** (1 edit)
   - "The possessive pronoun changes everything" → "The possessive pronoun is the whole v1 story"

9. **`.ai-team/decisions.md`** (1 edit)
   - DM decision entry: trimmed "category-defining" and "This is the feature that makes..." self-congratulatory closer

**What was left alone (and why):**

- **Agent charters** — all clean. Edgy personality is character voice, not tone violation.
- **Verbal's "feel magical" / "AI bro"** — that's my personality. Edgy but not mean.
- **"killer feature" in decisions.md** — standard internal assessment term, not hype.
- **"category-defining" in decisions.md (line 137, 259)** — internal strategic positioning, not public copy.
- **Blog post (001)** — already clean. Factual, honest about the silent success bug, no self-congratulation.
- **README** — already clean. Concise, factual, no hype language.
- **Session logs** — already clean. Just facts.
- **Orchestration logs** — already clean.
- **"Magic Moments" sections in proposals 008, 010** — these are UX design terms describing interaction patterns, not self-congratulation. The word "magic" in context of UX design is industry-standard (Apple uses it, don't @ me). Left as-is.
- **Brady quotes** — never edited direct quotes from Brady (e.g., "amazing front-end UX" in 019a line 50 is his words).
- **"gorgeous" in 019a line 129** — part of a sample prompt (user-facing copy for a blog engine request), not team self-talk.
- **Wave 3 name "Magical"** — internal sprint name. Changing it would break cross-references across 4+ files for no reason.

**Principle applied:** Light touch. Brady said "don't go overboard." Each agent should still sound like themselves — Verbal is edgy, McManus is polished, Fenster is blunt. The goal was to sand off the "we're so incredible" peaks, not flatten the voice.

### 2026-02-09: Release ritual — checklist and lead recommendations (consolidated)

**By:** Keaton, Kobayashi

**What:** Release process established with checklist and architectural recommendations from two independent analyses:
- **Checklist (Kobayashi, 2026-02-08):** Step-by-step release ritual from branch prep through post-release verification. Documented in `team-docs/release-process.md`.
- **Lead recommendations (Keaton, 2026-02-08):** Comprehensive review of release workflow architecture, CI gates, version validation, branch strategy, and filtered-copy mechanism. Identified strengths and areas for hardening.

**Why:** Squad needs a repeatable, auditable release process. Combined checklist and architectural review ensures both operational correctness and structural safety.

### 2026-02-09: Coordinator captures user directives before routing
**By:** Kujan
**What:** Added a "Directive Capture" section to `squad.agent.md` (Team Mode). When the user states a preference, rule, or scope decision (signaled by phrases like "always…", "never…", "from now on…"), the coordinator writes it to `.ai-team/decisions/inbox/copilot-directive-{timestamp}.md` before routing any work. The format matches standard decision entries so Scribe merges them naturally. Mixed messages (directive + work request) are handled — capture first, route second.
**Why:** User directives are team-wide decisions that affect all agents. Without capture, they exist only in conversation context and are lost between sessions. The decisions inbox is the correct persistence layer — it feeds into `decisions.md` via Scribe, which all agents read at spawn time. This closes the loop between human intent and team memory.

### 2026-02-08: "Feels Heard" — Immediate acknowledgment before agent spawns
**By:** Verbal (Prompt Engineer)
**Status:** Decided
**What:** The coordinator MUST respond with brief text acknowledging the user's request BEFORE spawning background agents. For single agents, use a human sentence naming the agent and describing the work. For multi-agent spawns, show a quick launch table with emoji, agent name, and task description. The acknowledgment goes in the same response as the `task` tool calls — text first, then tool calls.
**Why:** When the coordinator spawns background agents, there can be a significant delay before the user sees any response. A blank screen while agents work creates anxiety and breaks the feeling of a responsive team. Immediate acknowledgment makes the experience feel human — like a team lead saying "I'm on it" before diving into work.
**Where:** `.github/agents/squad.agent.md` — new "Acknowledge Immediately" subsection in Team Mode, placed before Directive Capture and Routing.
**Scope:** This is the coordinator-level instruction only. Does not change agent spawn templates or post-completion behavior.

### 2026-02-09: Incoming queue — architecture decisions and coordinator design (consolidated)
**By:** Verbal
**What:** Proposal 023 v2 establishes three architecture decisions for the incoming queue, incorporating Brady's direction and Kujan's platform assessment:

1. **SQL hot layer + filesystem durable store.** SQL `todos` table is the queryable working set within a session. `.ai-team/backlog.md` is the durable source of truth across sessions. Writes go to both. Session start rehydrates SQL from filesystem. Filesystem always wins on conflict.

2. **Team backlog as first-class feature.** Auto-populated from conversation extraction, explicit adds supported, drop-box pattern for agent writes. Third memory channel alongside decisions and history. Proactive surfacing after agent work completes.

3. **Agent cloning is architecturally ready.** Same agent identity can spawn multiple times in parallel — each clone in its own worktree, writing to separate inbox files. No infrastructure changes needed.

The coordinator generalizes the directive capture pattern into full message extraction — parsing every message for work requests, directives, backlog items, questions, and context clues before spawning agents. Backlog items persist to `.ai-team/backlog.md` (filesystem-first). SQL rejected as primary store (session-scoped = non-persistent).
**Why:** Users send compound messages. Today only directives and work requests get captured — everything else disappears. Brady's explicit architecture direction (SQL as cache, filesystem as truth, team can clone). Kujan's assessment confirmed platform constraints. The backlog adds a third memory channel (intent) alongside decisions (agreements) and history (learnings).

**Recommendation:** Move to implementation. Phase 1 (extraction + dual-layer writes) is ~40 lines in squad.agent.md. Cloning (Phase 3) should be tested conservatively.

### 2026-02-08: State hygiene protocol established
**By:** Verbal
**What:** .ai-team/ must NEVER be tracked in git. Main branch = bare minimum product files only. Three-layer protection: .gitignore (prevents tracking), package.json files allowlist (prevents npm distribution), .npmignore (explicit exclusion). Release branch gates what reaches main.
**Why:** v0.1.0 shipped team state to public GitHub repo. The package.json files array saved us from shipping to npm consumers, but GitHub visibility was still a leak. This protocol ensures it never happens again.

### 2026-02-08: User directive — short ask_user responses
**By:** Brady (via Copilot)
**What:** If ask_user returns a response under 10 characters, treat it as ambiguous and re-confirm with the user before acting. The platform may fabricate default responses from blank input.
**Why:** User request — captured for team memory. Brady observed the ask_user tool returning "Use your best judgment" when he typed nothing, and the coordinator acted on it as if it were a real response.

### 2026-02-09: Documentation structure and docs/ separation (consolidated)
**By:** Kobayashi
**What:** Permanent three-tier separation of documentation and team state:
- `docs/` = Public-facing documentation only (user guides, sample prompts, API docs). GitHub Pages ready. Ships on GitHub and in the release pipeline (KEEP_DIRS, package.json files field). On main, contains ONLY user-facing content — no internal planning.
- `team-docs/` = Internal team documentation (proposals, sprint plans, postmortems, blog drafts). Tracked in git on development branches, excluded from npm. Never merged to main.
- `.ai-team/` = Runtime team state. Gitignored. Never committed to any branch.
**Why:** v0.1.0 incident mixed user-facing and internal content in docs/. Brady's directive established permanent structural separation. Three tiers ensure product docs (public), team docs (internal but tracked), and team state (runtime, never tracked) are never mixed. As of 2026-02-09, docs/ and CHANGELOG.md are included in the release pipeline per Brady's directive.

### 2026-02-08: Per-agent model selection design
**By:** Verbal
**What:** Designed a per-agent model selection system with four layers: user override (highest priority) → charter `## Model` field → registry `model` field → deterministic auto-selection algorithm. Auto-selection maps role categories to model tiers (Designer → Opus for vision, Tester/Scribe → Haiku for speed, Lead/Dev → Sonnet for balance). Task complexity signals can bump the tier (architecture decisions → Opus, simple renames → Haiku). Charter template and registry schema both get model fields; charter wins on conflict because the agent's self-declared rationale is more authoritative. Phase 1 is zero code changes — coordinator instructions only. Model auto-selection is a hard dependency: it must ship with or before charter model fields so the feature is zero-config by default. Delegation support: agent-to-agent spawns read the target's charter `## Model` field; the model preference is self-declared and travels with the agent regardless of who spawns it.
**Why:** Current uniform model selection wastes money on simple tasks (Scribe doing file merges on Sonnet), undersells complex tasks (Keaton making architecture decisions on Sonnet), and creates capability mismatches (Redfoot designing visuals on a text-first model). Brady's directive: "We don't want Redfoot using Claude Sonnet to design imagery." The model must match the agent's capabilities. This design makes model selection automatic, transparent, and overridable.


# Export CLI Implemented (Item 2.4)

**Date:** 2026-02-09
**Author:** Fenster
**Status:** Completed
**Proposal:** 019 (Item 2.4)
**Depends on:** Item 2.2 (Smart Upgrade), Item 2.3 (Skills Phase 1)

## What

Shipped `npx github:bradygaster/squad export [--out <path>]` — produces a `squad-export.json` portable snapshot containing casting state, agent charters/histories, and skills.

## Implementation

- Export handler added to `index.js` after help block, before source validation (export doesn't need installer source files)
- Validates squad existence via `.ai-team/team.md` — fatal error if missing
- Reads casting files (registry.json, policy.json, history.json) with individual try/catch — missing files skipped
- Scans `.ai-team/agents/*/` for charter.md and history.md per agent
- Scans `.ai-team/skills/*/SKILL.md` for skill definitions
- `--out <path>` flag via `process.argv.indexOf('--out')` — no parser dependency
- Help text updated with export command description
- 9 tests added covering all specified scenarios

## Manifest Schema (v1.0)

```json
{
  "version": "1.0",
  "exported_at": "ISO 8601 timestamp",
  "squad_version": "from package.json",
  "casting": { "registry": {}, "policy": {}, "history": {} },
  "agents": { "name": { "charter": "string", "history": "string" } },
  "skills": ["SKILL.md contents"]
}
```

## Constraints Honored

- Zero dependencies
- Windows compatible (all `path.join()`)
- Existing 69 tests unaffected (4 pre-existing failures in templates/migrations unrelated to export)
- 9 new export tests all pass

## What's Next

- Import CLI (Item 3.1) will consume this format
- History curation remains manual in v1 per Proposal 008


# Decision: Import CLI Implementation (Sprint Task 3.1)

**Author:** Fenster (Core Developer)
**Date:** 2026-02-09
**Status:** Completed

## Context

Wave 2 delivered the `export` subcommand. Wave 3 requires the `import` counterpart to complete the portability story. Per Proposal 008, squads must be portable across projects via JSON manifest files.

## Decision

Shipped `import` subcommand at `npx github:bradygaster/squad import <file> [--force]`. Key design decisions:

1. **Collision detection with archival, not deletion.** When `.ai-team/` exists and `--force` is used, the old squad is moved to `.ai-team-archive-{timestamp}/`. No data is ever destroyed. Timestamp format uses `YYYYMMDD-HH-mm-ss` (no colons — Windows-safe).

2. **History split is pattern-based, not LLM-assisted.** Section headers are classified as portable or project-specific using regex patterns. This is deterministic and zero-dependency. LLM-assisted classification is deferred to v0.2 per Proposal 008.

3. **Project-specific files are NOT imported.** `decisions.md` and `team.md` are created empty. These are project-local state that doesn't transfer. Casting state (registry, policy, history) transfers unconditionally.

4. **Skills imported by frontmatter name extraction.** The `name` field from SKILL.md YAML frontmatter determines the directory name. Portable and deterministic.

5. **Casting ceremony skipped on import.** Per Proposal 008, imported squads arrive with pre-populated names, universe, and relationships. No interactive setup needed.

## Consequences

- Squad portability is now a complete feature: export → import round-trip at 100% fidelity (tested).
- History split is conservative — some portable content may end up in project learnings. This is safer than the reverse (project-specific content treated as portable).
- 92 tests pass, zero regressions. 11 new import-specific tests cover happy path, error cases, round-trip, and history split.

### 2026-02-09: Forwardability and smart upgrade (consolidated)
**By:** Fenster
**What:** Squad adopts a forwardability model: file ownership (Squad-owned vs user-owned), `upgrade` subcommand, and version-keyed migration system. Implementation shipped: version delta detection reads installed version from squad.agent.md frontmatter, compares against package version. Migration registry (array of versioned functions) runs applicable migrations in semver order. First migration (0.2.0) creates `.ai-team/skills/`. "Already up to date" path exits early but still runs pending migrations. 8 new tests added.
**Why:** Users must be able to update squads with new features without losing state. File ownership model ensures upgrades are safe. Migration registry is the delivery mechanism for all future improvements -- additive-only, idempotent, never destructive.
**Proposal:** `docs/proposals/011-forwardability-and-upgrade-path.md`

### 2026-02-09: Tiered response modes (consolidated)
**By:** Kujan, Verbal
**What:** Four-tier response mode system (Direct/Lightweight/Standard/Full) replaces "every interaction spawns an agent" model. Routing table determines WHO; Response Mode Selection determines HOW based on complexity. Includes: decision table with latency targets, Lightweight Spawn Template (no charter/history/decisions reads), explore agent for read-only queries, "where are we?" as Direct Mode exemplar, context caching (stop re-reading team files after first message), Scribe batching (skip when inbox empty). Anti-pattern #3 updated to reference tiered modes as legitimate exceptions.
**Why:** Brady's feedback -- "later on, the agents get in the way more than they help." Every interaction paid ~30-35s overhead regardless of complexity. Tiered modes match effort to complexity: Direct ~2-3s, Lightweight ~8-12s, Standard ~25-35s, Full ~40-60s. Context caching saves ~3 tool calls per subsequent message. Combined: late-session friction becomes flow.
**Proposal:** `docs/proposals/007-agent-persistence-and-latency.md`

### 2026-02-09: GitHub-native state as first-class context
**By:** Brady (via Copilot)
**What:** Explore shifting Squad artifacts from files-on-disk to GitHub-native features. Proposals could be GitHub Issues instead of markdown files. Issues, PRs, discussions, and other GitHub repo features become additional context sources alongside .ai-team/ files. Inspired by Shayne's real-world usage where Squad is answering issues, commenting on PRs, and using GitHub features end-to-end.
**Why:** User directive — captured for team memory. This is a strategic direction for post-v0.2.0 work: deeper GitHub integration where the platform itself becomes part of the team's state and context.

### 2026-02-09: Mermaid diagram color convention
**By:** Brady (via Copilot)
**What:** All mermaid diagrams must use hard-picked colors: dark-colored backgrounds on boxes with light-colored (white) font text. Never use random or default mermaid colors. This is a visual accessibility rule.
**Why:** User directive — Brady can't read the random colors that get generated. Consistent dark-bg/light-text across all diagrams.


# Decision: Comprehensive Proposal Status Audit

**By:** Keaton (Lead)
**Date:** 2026-02-10
**Requested by:** bradygaster

## What

Audited all 25+ proposals in `team-docs/proposals/` and updated every status field to reflect what actually shipped across Waves 0-3 and PR #2.

## Status Changes Made

### **YES — this release pipeline is safe for v0.2.0.**

The pipeline uses **three independent protection layers**, two of which are allowlists (structurally can't leak unknown files). Internal state (`.ai-team/`, `team-docs/`, agent charters, memories, casting state) cannot reach users through any distribution path:

1. **Release workflow KEEP_FILES** — only 8 files + 1 directory reach `main`
2. **`package.json` `files`** — only 3 patterns enter the npm tarball
3. **`.npmignore`** — backup denylist if `files` is removed

For internal state to leak, ALL THREE layers would need to fail simultaneously, which requires deliberate sabotage, not accident.

**Ship it.**


# Decision: v0.2.0 Release Prep Complete

**By:** Kobayashi (Git & Release Engineer)
**Date:** 2026-02-09
**Status:** Ready for review

## What

v0.2.0 release is prepped but NOT triggered. The following changes are on the `wave-2` branch:

1. **`CHANGELOG.md`** — New `[0.2.0]` section documenting Wave 2, Wave 2.5 (PR #2), and Wave 3 features.
2. **`package.json`** — Version bumped from `0.1.0` to `0.2.0`.
3. **`team-docs/release-process.md`** — Internal release process documentation with mermaid diagram and line-level references to CI/CD workflows.

## Remaining Steps Before Release

1. **Merge `wave-2` → `dev`** — 4 commits ahead of dev. This is a prerequisite.
2. **Merge `dev` → `release`** — For pre-release testing.
3. **Final test run on `release`** — Confirm 92/92 tests pass.
4. **Trigger release workflow** — `workflow_dispatch` with version `0.2.0`, or push tag `v0.2.0`.

## What NOT to Change

- `squad.agent.md` version header stays at `"0.0.0-source"` — it's stamped dynamically at install time by `index.js:350-353`.
- No changes needed to `.github/workflows/` — both `ci.yml` and `release.yml` are ready.

## Who Needs to Know

- **Brady** — Approves and triggers the release.
- **Hockney** — Tests are the release gate; 92 pass, 0 fail.
- **Keaton** — Branch merges need coordination.

### 2026-02-09: User directive — Contributor list doc
**By:** Brady (via Copilot)
**What:** Create a contributor list document. Every contribution (commits, issues, PRs) is tracked with links. Squad AI members get credit for shipped features just like humans do. The README tagline should read "conceived by Brady, built by us" where "us" links to the contributor page. The contributor doc lists all human contributors with their contributions AND all squad members with their roles and responsibilities.
**Why:** User request — captured for team memory. Brady wants full attribution for both human and AI contributors.

### 2026-02-10: User directive
**By:** bradygaster (via Copilot)
**What:** Don't ask clarifying questions when the coordinator has enough context to make a decision. "Let's gear up for 0.3.0 sprint" is a clear work request — route it to Keaton, don't ask "what's the theme?" The coordinator has proposals, horizon items, and a Lead agent. Use them.
**Why:** User request — captured for team memory. Brady was asked an unnecessary question, and a platform bug auto-responded on his behalf before he could answer. Both problems stem from the same root: the coordinator should have just launched Keaton.

### 2026-02-10: User directive — model fallback resilience
**By:** bradygaster (via Copilot)
**What:** The model selection algorithm must handle cases where a chosen model isn't available to the user (wrong Copilot plan, org policy, regional availability, model deprecation). It must not "go south" — graceful fallback is required.
**Why:** User request — captured for team memory. Model availability is not uniform across Copilot contexts.

### 2026-02-10: v0.3.0 is ONE feature — proposals as GitHub Issues (consolidated)
**By:** bradygaster, Keaton
**Date:** 2026-02-10
**Supersedes:** Original Proposal 028 phased approach (GitHub-native planning as multi-phase rollout)

**What:** v0.3.0 scope is a single feature: proposals become GitHub Issues instead of markdown files on disk. This supersedes the earlier phased approach (Proposal 028: one-way push, comment pull-back, Project board sync) with a simpler model: GitHub Issues ARE the source of truth for proposals. The coordinator creates issues with `gh issue create`, agents post analysis as signed comments, the owner approves via label or comment. Team (humans + AI agents) iterates on proposals in issue comments until consensus, then triages into sprint and works via normal git practices. Filesystem remains authoritative for all other team state (decisions, history, skills). All previously planned 0.3.0 items (async comms, model selection, marketing site, CCA integration) are deferred. CCA squad adoption (originally P1) deferred to post-v0.3.0. GitHub becomes part of the product. Provider abstraction layer ensures ADO/GitLab can plug in later. GitHub integration must not break CLI conversations; the terminal experience remains primary.

**Why:** Brady's directive: laser focus on making GitHub a first-class collaboration surface. Proposals are collaborative artifacts; collaboration happens on GitHub (URLs, comments, reactions, mobile access), not in markdown files on feature branches. This unlocks external contributor participation, persistent discussion, and normal git flow. Markdown proposals are invisible; issue proposals are shareable.

### 2026-02-10: v0.3.0 sprint plan
**By:** Keaton
**What:** v0.3.0 ships three things: per-agent model selection (024 Phases 1-2), team backlog with message extraction (023 Phases 1-2), and Demo 1 scripted infrastructure (026 partial). Two waves — Intelligence (model selection + backlog capture) and Integration (Scribe merge, agent backlog access, model visibility, demo GIF, "where are we?" enrichment). 15 work items, 28-39 hours, ~8-10 days. Smaller than v0.2.0 by design.
**Why:** Compound strategy — every feature makes the next easier. Model selection improves every future agent spawn (right model = better results, lower cost). Backlog capture closes the biggest information loss in Squad today (multi-item messages lose 2 of 3 items). Demo infrastructure lets Brady show the product to the world. Cut aggressively: no agent cloning, no proactive surfacing, no model cost reporting, no Demos 2-5, no Squad DM. Ship fewer things that work perfectly. v0.2.0 gave Squad hands; v0.3.0 gives it a brain.


# Decision: GitHub API Capabilities Assessment

**Author:** Kujan
**Date:** 2026-02-10
**Proposal:** 028a (GitHub API Capabilities Assessment)
**Type:** Research Finding

## Decision

Squad agents have the tools needed for full GitHub Issues integration **right now**. GitHub Projects integration requires one manual step from Brady (`gh auth refresh -s project`).

## Key Findings

### 2026-02-10: Model Selection Algorithm — Fallback Chain Architecture

**By:** Verbal
**What:** Designed the model selection algorithm (Proposal 024b) with cross-provider fallback chains and a nuclear fallback (`omit model param`) that guarantees spawns never break regardless of model availability. Three tiers, cross-provider ordering, 3-retry maximum, silent fallback by default.
**Why:** Brady's directive — system must NOT break when a model is unavailable. The nuclear fallback (omitting the `model` parameter entirely) is backward-compatible with pre-model-selection behavior, meaning the worst case is degraded quality, never a broken spawn. Cross-provider chains handle both single-model and provider-wide outages. Silent fallback prevents user anxiety during transient failures.

### 2026-02-10: P0 silent success bug — detection and mitigation (consolidated)
**By:** Kujan, Verbal
**What:** ~40% of background agents completed all work but `read_agent` returned "did not produce a response." Root cause: agent's final LLM turn is a tool call, not text. Three-phase mitigation: (1) Kujan's Proposal 015 identified the bug and proposed reorder, detection, and timeout fixes. (2) Verbal strengthened all 4 spawn templates with 6-line RESPONSE ORDER instruction, structured filesystem-based silent success detection (files found → done, no files → failed), and HTML comment documenting bug rate (~7-10%), root cause, and mitigation layers. (3) `read_agent` with `wait: true, timeout: 300` catches remaining cases.
**Why:** #1 trust-destroying bug — coordinator tells user "agent failed" while work sits on disk. Mitigations reduced silent success rate from ~40% to ~7-10%. All changes are additive, non-breaking, and ship to all users via squad.agent.md.

### 2026-02-10: Skills Phases 1-2 shipped — read and earned skills (consolidated)
**By:** Verbal
**What:** Phase 1: SKILL.md format template created at `templates/skill.md`. Example skill `squad-conventions` ships as starter content. Init creates `.ai-team/skills/`. All spawn templates instruct agents to read relevant SKILL.md files before working. Skills are read-only in Phase 1. 81 tests pass. Phase 2: Agents can now write SKILL.md files from real work. Skill extraction instruction added to all spawn templates. Confidence lifecycle: low→medium→high (monotonic). Coordinator does skill-aware routing — checks `.ai-team/skills/` before spawning. `templates/skill.md` extended with optional `tools` field for MCP tool declarations. All prompt engineering, zero code changes.
**Why:** Phase 1 established format, directory structure, and agent awareness. Phase 2 closes the loop: agents earn skills from work, skills feed routing, knowledge compounds across sessions and projects. This is the self-reinforcing learning flywheel that makes Squad's skill system unique.

### 2026-02-10: Blog post conventions — contributions and celebrations (consolidated)
**By:** bradygaster, McManus
**What:** Two standing blog policies: (1) Every external contribution gets a blog post highlighting the contributor. Posts live in `team-docs/blog/`, not `docs/blog/`. File naming follows sequential numbering. Frontmatter uses `wave: null` for non-wave posts with `community` and `contribution` tags. Contributor is always the hero. Retroactive posts are acceptable. (2) Celebration posts (milestones, events) use the same `wave: null` frontmatter. Parallel narrative structure: external event first, project milestone second, connection third. Stats in tables, not prose. Tone ceiling: energy, dry humor, facts-carry-weight. No self-congratulation. Banned words apply.
**Why:** Consistent quality and tone across all team blog content. Community contributions are celebrated with visibility. McManus owns blog content.

### 2026-02-10: GitHub integration must not break CLI conversations
**By:** bradygaster (via Copilot)
**What:** Whatever we do with GitHub Issues/PR conversation support, it must not interfere with or degrade CLI conversations. CLI experience is primary. GitHub integration is additive — it cannot break what already works.
**Why:** User request — CLI is the core product surface, GitHub integration is secondary

### 2026-02-10: Marketing site — Jekyll on GitHub Pages (consolidated)
**By:** bradygaster, Keaton, McManus
**What:** Marketing site uses Jekyll on GitHub Pages with the following architecture:
- `docs/` is the Jekyll source root — no separate site directory, no content copying
- Markdown files in docs/ are the single source of truth; Jekyll renders them to HTML in place
- Existing markdown files get YAML front matter added; Jekyll renders them with custom layouts
- GitHub Pages configured to serve from `docs/` on `main` branch using classic deployment
- No separate HTML build step — GitHub Pages handles it natively
- New infrastructure files: `_config.yml`, `_layouts/`, `_includes/`, `index.md` (landing page), `assets/css/`
- Blog renders from `team-docs/blog/` via Jekyll collection; only posts with `status: published` appear
- Landing page is separate from README.md (same facts, different structure and audience)
- Everything in `team-docs/` and `.ai-team/` excluded from site except published blog posts
- All landing page copy follows the straight-facts directive
- Phase 1 is 5-8 hours, assigned to McManus (content) + Fenster (infrastructure)
- Supersedes all prior marketing site directives
**Why:** Brady's priorities are (1) no content reproduction and (2) HTML output. Jekyll-in-docs satisfies both — it renders markdown where it lives instead of copying to a build directory. Every alternative (Docusaurus, VitePress, Hugo) requires a build pipeline producing a second copy. GitHub Pages runs Jekyll natively with zero CI configuration. The `docs/` directory already exists with 16+ well-structured markdown files. Adding Jekyll infrastructure is purely additive — no product code changes, no new dependencies. McManus's content plan ensures docs render directly, blog uses status frontmatter, and the three-tier separation (docs = public site, team-docs = internal, .ai-team = runtime) has a concrete consumer.

### 2026-02-10: Public-facing content tone — facts only (consolidated)
**By:** bradygaster, McManus
**What:** Two-phase tone directive for all public-facing material:

**Phase 1 (2026-02-09):** General tone governance:
- All content must be SFW, polite, respectful, growth-attitude (permanent rule)
- Dry, funny, but not jerks — modeled after The Usual Suspects
- No self-congratulation; just report what happened
- Kindness first in all public-facing content
- Thorough logging — honest about what happened including bugs and failures

**Phase 2 (2026-02-10):** Straight facts only (stricter refinement):
- No editorial commentary, sales language, narrative framing, rhetorical hooks
- No quoting team members' reactions to features
- Every sentence states what a feature is, how it works, what it depends on, or what it replaces
- Technical specifics (numbers, model counts, API details) required
- Attribution (who built what) required
- Deferred items must state what they depend on
- Applies to all blog posts in `team-docs/blog/` and all public-facing written material
- Banned words: amazing, incredible, brilliant, game-changing. No meme closers.
- First application: Blog post `005-v030-give-it-a-brain.md` rewritten under this directive

**Why:** Brady's tone governance (02-09) established the baseline: honest, respectful, no self-congratulation. The facts-only directive (02-10) tightened this further: no editorial voice at all, just factual statements. McManus recorded and applied the detailed rules. These stack — Phase 2 is a strict subset of Phase 1.

### 2026-02-10: Async squad communication — top personal priority
**By:** bradygaster (via Copilot)
**What:** Brady wants to communicate with his squads (per repo) asynchronously — from his phone, away from the PC. One chat channel per repo. Mediums to evaluate: Telegram (existing proposal), Microsoft Teams (ideal — especially per-repo chat), Discord, others. The goal: keep squads rolling when you're not at your desk. Brady says he wants THIS more than anything.
**Why:** User request — this is the highest-priority feature request from the product owner. Changes Squad from a dev-time tool to an always-available team.

### 2026-02-10: Clean branch configuration at init time
**By:** bradygaster (via Copilot)
**What:** During Squad init, offer repo owners a config option: "Which branch(es) should squad team files never land in?" (e.g., main, release). Squad state (.ai-team/, team-docs/, proposals, etc.) is filtered out of those branches automatically — Scribe and release workflows respect the list. This is a per-repo consideration, not a global default. Supersedes the earlier clean-main directive.
**Why:** User request — repo owners should control which branches stay product-only. Generalizes the existing KEEP_FILES/KEEP_DIRS release pattern for any Squad-powered repo.

### 2026-02-10: Contributors include non-code contributions
**By:** bradygaster (via Copilot)
**What:** Contributors to Squad include people who validate patterns, test in the wild, and drive product design — not just code commits. Shayne Boyer (spboyer) is a contributor: his slidemaker repo (spboyer/slidemaker) validated PRD-to-issues flow, invented the squad: label convention, and proved the GitHub Issues Mode design. Reference his work explicitly in proposals and docs. Credit where credit is due.
**Why:** User request — contribution recognition is a team value, not just a git metric.

### 2026-02-10: `squad:` label convention standardized (consolidated)

**By:** Keaton, McManus
**Date:** 2026-02-10
**Affects:** All agents creating GitHub Issues, coordinator prompt for Phase 1 (028)

**What:** The `squad:` prefix label convention is the standard for all squad-managed GitHub Issues. Two-tier system:
1. **`squad`** — base label on every squad-managed issue. Enables `gh issue list --label squad` to show all squad work.
2. **`squad:{agent-name}`** — per-agent routing label (e.g., `squad:verbal`, `squad:mcmanus`, `squad:fenster`). Enables per-agent backlog filtering.

Replaces the old `squad-agent` label proposed in 028a §7.

**Origin:** Shayne Boyer invented this pattern during his slidemaker deployment (spboyer/slidemaker, issues #1–#9). He needed per-agent filtering in GitHub's native UI and created the prefix convention independently. Validated in production before the Squad team designed it.

**Issue template:** Squad-generated issues must follow user story format with agent metadata (persona, capability, benefit, acceptance criteria, squad member, primary work, dependencies).

**Why:** Uses GitHub's existing label infrastructure — no external tooling. Simple enough to document in one sentence. Production-validated by an external user. Keaton standardized the convention; McManus recommended documenting it and auto-creating labels at GitHub Issues Mode init.

**Next:** Document in Squad's GitHub Issues Mode docs. Credit Shayne Boyer as origin. Consider auto-creating labels on init.

### 2026-02-10: Async comms strategy — two-tier MVP with CCA-first approach
**By:** Kujan (Copilot SDK Expert)
**What:** Proposal 030 recommends a two-tier async communication MVP for 0.3.0: (1) CCA-as-squad-member via `squad.agent.md` CCA guidance section — 2-4h prompt engineering, zero new infrastructure, gives Brady async work assignment from phone via GitHub Issues. (2) Telegram bridge via Copilot SDK — 8-16h new code, gives conversational async chat, conditional on SDK nested session spike passing. CCA is the floor, Telegram is the ceiling. Ship both, CCA first. Connector ranking: CCA+Issues > Telegram > Discord > Discussions > Teams > Slack.
**Why:** Brady un-deferred async comms to TOP PRIORITY for 0.3.0. CCA angle didn't exist in the original Proposal 017 and changes the entire strategy — it gives async comms through GitHub's native surfaces with near-zero build cost. Supersedes Proposal 017 feasibility assessment.

### 2026-02-10: Label taxonomy drives GitHub-native Squad workflow (consolidated)
**By:** bradygaster, Verbal
**Date:** 2026-02-10
**Source:** Brady directive + Proposal 032c (Verbal)

**What:** Labels are the workflow engine for GitHub-native Squad. Complete taxonomy designed: 39 labels across 7 namespaces: status (8: draft/reviewing/approved/implementing/done/blocked/shelved/superseded), type (8), priority (4: p0-p3), squad routing (3 base + per-agent), automation (6: cca-eligible, needs-review, needs-decomposition, stale, good-first-issue, help-wanted), migration/provenance (4: migrated:from-markdown, era:v0.1/v0.2/v0.3). Status labels are mutually exclusive and drive a formal state machine with defined transitions. GitHub Milestones used for sprints (not labels). Every status transition, routing decision, and lifecycle event is label-driven. Migrated proposals must reflect REAL historical state. No fake/placeholder states. Full migration mapping for all 44 existing proposals. `squad init` creates all labels idempotently via `gh label create --force`. Provider abstraction maps to ADO (states + tags), GitLab (scoped labels with `::`). Labels are the API surface that Actions, CCA, and humans all share.

**Why:** Brady's directive: labels drive the ENTIRE workflow, and states must be REAL. This taxonomy is the foundation for all GitHub-native automation in v0.3.0.

### 2026-02-10: Microsoft Teams is the ideal async comms platform
**By:** bradygaster (via Copilot)
**What:** Brady's preferred async comms platform is Microsoft Teams. Per-repo channels, already on every device, already where the org lives. Telegram is fallback, Teams is the target.
**Why:** User request — Teams preference captured for connector prioritization in Proposal 030.

### 2026-02-10: Proposal 032 expanded with Migration Plan, Actions Automation, Working in the Open
**By:** Keaton
**Requested by:** bradygaster
**What:** Three new sections appended to Proposal 032:

1. **Section 11 — Proposal Migration Plan:** All 42 existing markdown proposals classified into 4 categories (Shipped/Active/Superseded/Deferred) with three-wave migration to GitHub Issues. Active proposals migrate first, shipped as closed issues second, superseded+deferred last. Script-assisted migration with agent review. `team-docs/proposals/` gets redirect README post-migration.

2. **Section 12 — GitHub Actions Automation:** 7 workflows designed: proposal-bot, proposal-consensus, proposal-decompose, proposal-stale, agent-comment, proposal-lint, cca-assign. Core workflows ship to consumer repos via `squad init`; CCA-specific workflows are opt-in. Actions handle mechanical lifecycle transitions, reducing coordinator prompt load.

3. **Section 13 — Working in the Open:** Squad's own development moves to public GitHub Issues. Collaborative artifacts (proposals, PRs, issues) are public; team state (history, decisions, skills, charters) stays private and gitignored. Slidemaker pattern is the contribution template.

**Why:** Brady's three directives — (1) iterate on GitHub-native proposals as THE 0.3.0 feature, (2) migrate all existing proposals from markdown to issues, (3) factor in GitHub Actions for automation. This is the strategic expansion of 032 from "proposals as issues" to "the entire proposal ecosystem runs on GitHub."

### 2026-02-10: GitHub Actions automation for proposal lifecycle (consolidated)
**By:** Keaton, Kujan
**Date:** 2026-02-10
**Source:** Proposal 032 Section 12 (Keaton), Proposal 032b (Kujan)

**What:** 7 GitHub Actions workflows designed for the proposal system. Workflows ship as opt-in templates in `templates/workflows/`, installed during `squad init` (not bundled automatically). Phase 1 (v0.3.0) ships three standalone workflows: `squad-proposal-lifecycle.yml` (label transitions), `squad-consensus.yml` (approval tracking), `squad-stale-proposals.yml` (stale cleanup). Phase 2 (v0.4.0) adds CCA Dispatch, Sprint Planner, and Daily Standup after CCA governance is validated per Proposal 031. Agent-comment workflow is Squad-internal only. Proposal-lint ships by default but can be removed.

**Why:** Actions handle mechanical lifecycle transitions (label changes, stale cleanup, CCA assignment), freeing the coordinator prompt to focus on orchestration. Standalone workflows are simpler to understand and customize than reusable workflows or composite actions. Workflows have repo-specific permissions and users must audit them before enabling. Template-based installation is the right pattern since npm has no convention for `.github/workflows/` files.

### 2026-02-10: Working in the open — collaborative artifacts public, team state private
**By:** Keaton
**What:** Squad's development publicly visible via GitHub Issues. Proposals, agent analysis, design discussions, approvals are all public. `.ai-team/` remains gitignored. Terminal sessions remain ephemeral. The boundary: GitHub-hosted artifacts are public, filesystem team state is private.
**Why:** Brady's directive to "work in the open as a squad." Validates the slidemaker contribution model (open issue → agents work it) and demonstrates Squad's capabilities by using them publicly.

### 2026-02-10: Octomember deferred — coordinator handles git platform ops
**By:** Keaton
**What:** No dedicated "Octomember" agent for git platform operations in v0.3.0. The coordinator handles issue creation, comment posting, and label management directly via `gh` CLI. If built later, the name is Redfoot (The Usual Suspects universe).
**Why:** Git platform operations are coordinator-mediated (event-driven, not cross-cutting). Adding an agent would add latency, context overhead (~4%), and a new coordination surface for zero benefit. Scribe exists because memory management is cross-cutting. Git ops are not. Revisit if coordinator prompt bloat becomes a problem.

### 2026-02-10: Agent comments on issues use signature blocks, not GitHub bot accounts
**By:** Keaton
**What:** Agent analysis posted as issue comments is signed with emoji + name + role header and "Posted by Squad" footer. No separate GitHub accounts or bot registration.
**Why:** Bot accounts require GitHub App registration, OAuth, and per-installation tokens — too much infrastructure for v0.3.0. Signature blocks are simple, reliable, and clearly distinguish AI from human comments. If Squad gets GitHub App status later, agent comments could come from a bot account with GitHub's "bot" badge.

# Decision: v0.3.0 Priority Reorder — DM is P0, GitHub Integration is P1

**By:** Keaton (per Brady's directive)  
**Date:** 2026-02-10  
**Scope:** v0.3.0 sprint plan (Proposal 027)

## What Changed

Brady reordered v0.3.0 priorities. The sprint plan has been fundamentally restructured:

1. **Squad DM (async comms) is now P0 / Wave 1.** Previously deferred to Horizon. Three existing 017 proposals provide the design foundation. Copilot SDK spike is the go/no-go gate.

2. **GitHub Issues/PRs + CCA adoption is P1 / Wave 2.** Expanded from "Phase 1 one-way push" to include Issues as work input and CCA governance. Validated by spboyer/slidemaker.

3. **Model selection moved to Wave 3.** Was Wave 1 centerpiece. Still ships in v0.3.0 but at lower priority. Explicit relief valve — can slip to 0.4.0 if DM + GitHub run long.

4. **Two new work streams added:** CCA adoption (Squad as governance layer for Copilot Coding Agent) and clean branch configuration (protect production branches from .ai-team/).

5. **Sprint size roughly doubled:** From 31-43h to 68-99h across 3 waves instead of 2.

## What Every Agent Needs to Know

- **Wave 1 (Reach):** Kujan runs the SDK spike first. Everything else depends on it. Fenster + Kujan build the Telegram bridge. Verbal designs the DM output mode.
- **Wave 2 (Integration):** Verbal + Kujan handle GitHub Issue integration. Keaton + Verbal handle CCA discovery. Fenster handles clean branch config.
- **Wave 3 (Intelligence):** Model selection, marketing site, demos, backlog intelligence. This is the relief valve — if scope pressure hits, Wave 3 items defer to 0.4.0.
- **CLI is still primary.** All GitHub/DM integration is additive. Nothing breaks the terminal experience.

## Why This Is the Right Call

Brady is the user. DM is the feature that makes Squad irreplaceable. GitHub integration makes Squad visible where work already happens. Model selection makes Squad smarter — but smarter doesn't matter if nobody can reach it.

### 2026-02-10: CCA governance must be self-contained in squad.agent.md
**By:** Kujan
**What:** All CCA governance instructions must live inside `.github/agents/squad.agent.md`, not reference `.ai-team/` files. Because `.ai-team/` is gitignored (team decision, 2026-02-08), CCA running in GitHub Actions cannot read `.ai-team/decisions.md` or any other Squad state files. The CCA Guidance section in Proposal 030 Appendix A needs revision — it currently tells CCA to "Read `.ai-team/decisions.md`" which will fail. Embed all critical conventions directly in the CCA Guidance section instead.
**Why:** This was discovered while designing the E2E test (Proposal 031). The planted-decision test originally relied on CCA reading `.ai-team/decisions.md`, but the gitignore constraint makes that impossible. This changes the CCA integration model from "CCA reads full Squad state" to "CCA reads a self-contained governance summary in squad.agent.md." Still viable, but different from what Proposal 030 assumed.

### 2026-02-10: Community issue responses use substantive technical detail, not placeholders
**By:** Keaton
**What:** When responding to community feature requests, Squad agents post substantive comments that reference specific internal design work (proposal numbers, architectural decisions, timelines). Comments follow Brady's tone directive: straight facts, no hype, no editorial voice. Signature block format: emoji + name + role, footer linking to Squad repo.
**Why:** Community contributors who take time to write detailed feature requests deserve detailed responses showing the team has thought deeply about their suggestions. Vague "great idea" replies waste the community's trust. The team's proposal-first workflow gives us real technical detail to share. This also serves as external validation of the product direction.


# Decision Inbox: Project Boards (033)

**From:** Keaton (Lead)  
**Date:** 2026-02-10  
**Re:** Issue #6 — GitHub Project Boards for Squad

## Decisions Made

### 2026-02-11: Project boards target v0.4.0 (consolidated)
**By:** Keaton, Kujan
**What:** Project board support defers to v0.4.0. v0.3.0 scope remains GitHub-native proposals (032). Projects V2 boards depend on Issue integration being solid first. Token scope (`gh auth refresh -s project`) is a prerequisite not yet run.
**Why:** Boards are a dashboard layer on top of the label/issue infrastructure being built in v0.3.0. Shipping boards before labels are stable puts the cart before the horse. Brady's directive: v0.3.0 is ONE feature (proposals as GitHub Issues). Reversible — Brady can pull forward if community demand warrants.

### 2026-02-11: Board operations use `gh` CLI, not npm packages (consolidated)
**By:** Keaton, Kujan
**What:** All Projects V2 operations go through `gh` CLI commands. No npm dependencies added. Keaton initially specified `gh api graphql` for raw API calls; Kujan refined to `gh project *` subcommands which wrap GraphQL behind ergonomic flags. Both agree: zero npm dependencies for board operations.
**Why:** Squad is zero-dependency. The coordinator is a prompt that executes shell commands, not a runtime that imports modules. Adding `graphql-request` or `@octokit/graphql` would be the first `node_modules` entry — a fundamental architectural change for a convenience gain. `gh` CLI handles auth, rate limiting, and the GraphQL protocol. Reversible, but the bar should be high.

### 2026-02-11: Board integration is opt-in, not automatic (consolidated)
**By:** Keaton, Kujan
**What:** No automatic board creation on `squad init` or first issue. User explicitly requests board setup. Kujan adds: implement as a skill (`github-project-boards`), not code in `index.js`. Graceful degradation when `project` scope is missing — agents detect scope at runtime via `gh auth status`.
**Why:** Not every repo wants a project board. Surprise side effects erode trust. The coordinator pattern is: user requests, coordinator executes. Skill-based implementation keeps it modular.

### 2026-02-11: Labels are authoritative, boards are projections (consolidated)
**By:** Keaton, Kujan
**What:** Label changes drive board column positions. Board UI changes do NOT propagate back to labels. One-way sync: labels -> board. Label changes trigger Actions workflows; board column moves do not. Board mirrors label state but is not the source of truth. Aligns with existing `label-driven-workflow` skill anti-pattern guidance.
**Why:** Two-way sync creates state conflicts. Labels are the state machine (032c). If someone moves a card on the board, it creates a label/board mismatch — but the label is correct. Reverse sync would require conflict resolution not yet designed. Two-way sync is a future consideration, not a v0.4.0 concern.

### 2026-02-11: User directive — model selection cost optimization
**By:** Brady (via Copilot)
**What:** Agents should pick their own models. Optimize for cost first unless the agent is writing code — in that case, optimize for quality and accuracy. Scribe and non-coding agents should use free or less-expensive models. When in doubt, cost over quality unless code is being written.
**Why:** User request — captured for team memory. This is the governing principle for the per-agent model selection feature (Proposal 024).

### 2026-02-11: Per-agent model selection implemented
**By:** Verbal
**What:** Added model selection to coordinator instructions, updated all spawn templates, added ## Model to charters and registry. Brady's cost-first directive applied: agents that write code use sonnet (standard), agents that don't write code use haiku (fast), mixed agents use "auto" (coordinator decides per-task), Redfoot uses opus (vision required).
**Why:** Brady's directive: cost-first unless writing code. Shipped as part of v0.3.0.



# Keaton — Universe Expansion Proposal (2026-02-10)

## Problem

Brady's direction: "People think we need more universes." Current allowlist (14 universes) has gaps:
- **Geographic skew**: 93% American (zero British, zero anime, zero international)
- **Genre imbalance**: Crime/action/thriller dominate (8/14); missing fantasy, sci-fi ensemble, modern drama
- **Size distribution weakness**: 7 small, 4 medium, 3 large — doesn't serve 4-6 person teams well; few options for large squads
- **Developer resonance**: Strong for crime/action fans, but gaps for fantasy, anime, British comedy, corporate drama audiences

## Solution

**Add 6 universes, reaching 20 total.** This hits the quality-over-quantity target (18-22 range) while strategically filling gaps without overcrowding the selection algorithm.

### 2026-02-11: Rename "sprints" to "milestones"
**By:** Brady (via Copilot), inspired by Jeff Fritz
**What:** Squad uses "milestones" instead of "sprints" for release planning units. Waves are feature-gated milestones, not time-boxed sprints. This aligns with GitHub's native Milestones feature and more accurately describes how Squad ships — when the work is done, not when a timer expires.
**Why:** Fritz suggested it during his video coverage. It's more accurate: Squad doesn't enforce time-boxed cadence. GitHub Milestones are a native platform concept we can integrate with. "Sprint" implies Scrum process overhead that doesn't exist here.

### 2026-02-11: Discord is the v0.3.0 MVP messaging connector for Squad DM
**By:** Keaton
**What:** Discord replaces Telegram as the first rich messaging connector for Squad DM. The v0.3.0 delivery is three tiers: (1) CCA-as-squad-member via GitHub Issues (2-4h, prompt-only, unchanged), (1b) Discord webhook notifications for one-way alerts (30 min, new), (2) Discord conversational bridge via Copilot SDK (8-16h, replaces Telegram bridge). Teams is the second connector target for v0.4.0. Telegram is deprioritized per Brady's explicit preference.
**Why:** Brady prefers Discord over Telegram. The team analysis confirms this is the right call on multiple axes:
- **Technical (Kujan):** Build cost delta is ~30-70 LOC (~1 hour) over Telegram. Discord's `discord.js` library is mature. Channel-per-repo is native (no workarounds). Bot setup is straightforward via Discord Developer Portal.
- **Experience (Verbal):** Discord wins the "text my squad from my phone" feeling. Rich embeds with per-agent colors give instant visual identity. 2000-char message limit naturally enforces DM summary mode. The dev community already lives on Discord — no mental model shift for users.
- **Per-repo:** Discord server with text channels per repo (`#squad`, `#other-project`) maps cleanly. Superior to Telegram groups, comparable to Teams channels but lighter weight.
- **Lock-in:** Zero. `discord.js` has no GitHub coupling. The Squad DM Gateway architecture keeps the messaging layer platform-agnostic — swapping Discord for Teams or Slack later is an adapter change, not an architecture change.

### 2026-02-11: GitHub integrations are notification-only, not a messaging replacement
**By:** Keaton
**What:** GitHub-for-Teams, Copilot Extensions, and GitHub Actions webhooks provide one-way notification capabilities but cannot replace building a conversational bot. GitHub-for-Teams delivers event cards (push, PR, issue events) but is not programmable or extensible. Copilot Extensions are the wrong architecture for messaging bridges. GitHub Actions can push webhook notifications to Discord/Teams for free (one-way alerts).
**Why:** Brady asked whether GitHub's existing integrations could give us messaging "for free." The answer is: partially. One-way notifications (CI failure → Discord alert) are free via GitHub Actions webhooks. Conversational messaging (Brady asks a question → agents respond) requires a bot. This confirms the two-tier architecture: GitHub-native for work assignment (CCA), purpose-built bot for conversation (Discord).

### 2026-02-11: Squad DM Gateway must have zero GitHub-specific imports
**By:** Keaton
**What:** The shared Squad DM Gateway layer (message routing, agent spawning, response formatting) must never import GitHub-specific libraries or APIs. Platform adapters (Discord, Teams, Slack) are thin and replaceable. The gateway is the shared core. This preserves the path to Azure DevOps and GitLab support.
**Why:** Brady's concern about platform lock-in is valid and architecturally addressable. The adapter pattern keeps options open: Discord adapter imports `discord.js`, Teams adapter imports Bot Framework SDK, but the gateway itself is platform-agnostic. If Squad adds ADO or GitLab hosting support later, the messaging layer requires zero changes — only the hosting/auth layer adapts. CCA is GitHub-only by nature but is additive (Tier 1), not foundational.

### 2026-02-11: Release process directive
**By:** Brady (via Copilot)
**What:** Never bypass the release CI/CD pipeline. All code reaches main exclusively through the two-phase release workflow (preview → ship). No direct pushes, no manual merges to main.
**Why:** User directive — the release.yml pipeline is the only authorized path to main. It validates versions, filters product files, runs tests, and creates GitHub Releases. Bypassing it risks shipping non-product files, unvalidated versions, or missing release artifacts.


### 2026-02-12: User directive
**By:** Brady (via Copilot)
**What:** All tables presented to the user should include a "squad-time to complete" column showing estimated time for the squad to finish each item.
**Why:** User request — captured for team memory. Users already know the squad is superhuman; showing estimated completion time reinforces that and helps with planning.


# Fenster's Take: Branching Strategy for Squad

**Status:** Perspective for Brady  
**By:** Fenster (Core Dev)  
**Date:** 2026-02-11

---

## Summary

`dev` is sufficient as the integration branch. Feature branches (`squad/{issue}-{slug}`) merging into `dev` via PR is the right pattern for Squad's velocity. We don't need an "upcoming" or staging layer — it adds friction without safety. The release pipeline (preview → ship) already gives Brady control. Worktree support isn't essential yet. The current setup is clean.

---

## 1. Is dev sufficient as the integration branch?

**Yes.** Here's why:

- **dev is where the work lives**, and that's correct. All feature branches merge here. All agents read current state from dev. All tests run against dev. This is the "source of truth" for active work.
- **We don't need staging/upcoming.** Every feature branch is already a "staging area" for isolated work. The release pipeline's preview phase gives Brady a final eyeball before anything touches main. Adding another branch layer would:
  - Require managing merges between three layers (feature → upcoming → dev → main)
  - Create confusion about "where do I pull from?" during onboarding
  - Slow iteration (waiting for an intermediate merge before seeing something in a "staging" branch)
  - Add more places for merge conflicts
  
- **The real safety comes from the release process**, not branch topology. Brady can't accidentally ship garbage to main because the release pipeline (Kobayashi's design) validates versions, filters files, runs tests, and sits at a preview step. That's the gate.

---

## 2. How do feature branches work day-to-day?

**Clean pattern:** `squad/{issue}-{slug}` → dev via PR

This is already the right approach:

- Each feature gets its own branch. Agent spawns know which branch they're on (read from git config).
- PRs to dev trigger tests automatically (CI on dev is running).
- Once approved and merged, that work is immediately available to other agents on dev.
- Multiple agents can work in parallel on different features without blocking each other.

**One friction point I notice:** If an agent is working on a feature and another agent merges a conflicting change to dev mid-flight, the feature branch developer has to rebase. This is unavoidable, but we should document the rebase workflow clearly so agents aren't surprised.

---

## 3. What about when multiple features are in flight?

**Don't add worktree support yet.** Here's my reasoning:

- Worktrees are useful when *one person* needs to context-switch between multiple local branches. But our workflow is different: agents spawn on a *specific branch*, do their work, and exit. They're not context-switching.
- If we spawn Fenster to work on squad/123-feature-a and Fenster to work on squad/456-feature-b simultaneously (which we could do), they just use different clones or containerized instances. The orchestration handles it.
- Worktrees would add complexity to index.js (detecting worktrees, routing the agent to the right one, cleanup). Not worth it until we actually need it.

**What matters:** The PR-per-feature model keeps features isolated. If five features are in flight, we have five branches and five PRs. Each one can merge independently. That's plenty of parallelism.

---

## 4. What's the simplest flow that keeps Brady safe?

**Current setup is already safe.** Here's the protection:

1. **main is protected** — no direct pushes. All code goes through the release pipeline.
2. **release.yml pipeline enforces the two-phase workflow** — preview first (lets Brady eyeball it), then ship (automated). No bypasses.
3. **dev is the integration point** — all feature PRs merge here. Agents test against dev.
4. **release pipeline validates before shipping** — versions, file filtering, test runs. If something breaks, the preview phase catches it before main.

**For Brady's peace of mind:** The only thing we need to ensure is that:
- No one force-pushes to main or dev
- All merges to dev come through PRs with a brief review (agent-to-agent code review is fine)
- Release process is never skipped (enforce through GitHub branch protection rules)

This is already the case. We're good.

---

## 5. Does the current setup create friction for rapid iteration?

**No.**

- **Feature branches are fast** — creates a branch, pushes a commit, opens a PR, merges within minutes (assuming tests pass). No ceremony.
- **Dev is always ready** — agents don't wait for staging or release prep. They can spawn, pull from dev, and start work immediately.
- **Parallel PRs don't block each other** — if three features are merging to dev, they land independently. No "gate-keeping."
- **Tests run automatically** — CI on dev is working. We know if something broke before merging.

**One real friction point:** If we're shipping a release and simultaneously landing features in dev, there's a brief moment where dev is ahead of the preview branch. This is fine and expected — it's exactly why we have a two-phase workflow.

---

## Recommendation

**Keep the current model.**

- Stick with feature branches → dev (via PR) → release pipeline → main
- No "upcoming" branch
- No worktrees (yet)
- Add one doc: "Rebasing guide for agents" so they know what to do if dev changes while they're working

The simplicity is a feature. The release pipeline does the actual safety work. Branching topology is just plumbing.

---

## Questions for Brady

1. **Do we want automated squash-merge on feature branch PRs to dev?** (Keeps commit history clean, easier to bisect)
2. **Should the rebasing guide be in docs/ or team-docs/?** (I'd suggest team-docs — it's internal workflow)
3. **Any concerns about the current preview → ship release model, or is that already validated?**


# Branching Strategy — Proposal

**By:** Keaton (Lead)  
**Date:** 2026-02-10  
**Requested by:** Brady (v0.3.0 manual push incident)  
**Status:** READY FOR DECISION

---

## Problem

Brady had to manually push to `preview` and `main` during v0.3.0. This defeats the entire point of the CI/CD pipeline: **our release process should never require human hands on branch buttons.** We also need clarity on:

1. Should feature work go straight to `dev`, or is there a staging branch in between?
2. Where do hotfixes go?
3. Should `preview` and `main` be protected from manual pushes?
4. How do we prevent another manual-push incident?

## Solution: Three-Branch Strategy + Strict Automation

### 2026-02-12: Release Pipeline Hardening — Branch Protection & CI/CD Enforcement

**By:** Kobayashi (Git & Release Engineer)

**Context:** During v0.3.0 release, the coordinator manually pushed release.yml to main (bootstrap) and pushed to preview/main. Brady wants ZERO manual pushes to preview or main — only CI/CD should write to these branches. This memo analyzes the current pipeline and proposes hardening measures.

---

## Problem Statement

Current state:
- **Preview and main branches are unprotected.** Anyone with write access can push directly, bypassing the release workflow.
- **Bootstrap problem:** release.yml must exist on main before GitHub Actions can see it. First-time setup for new repos requires manual seed.
- **No validation that dev is ahead of main.** The preview phase doesn't check whether there are actual changes to release.
- **Manual intervention risk.** The workflow exists and is designed well, but nothing prevents humans from circumventing it.

Brady's directive: **Preview and main are CI/CD-only. No manual pushes. Ever.**

---

## Recommended Hardening: Five Components

### Version Display via Coordinator Self-Announcement

**By:** Kujan
**Date:** 2025-07-14
**Context:** Issue #18 — Show squad version number in agent label across Copilot hosts

**What:** Added a `Version` instruction to the Coordinator Identity section in `squad.agent.md`. The coordinator reads the `version` field from its own YAML frontmatter and includes `Squad v{version}` in its first response of each session.

**Why:** The version stamping pipeline (`stampVersion()` in `index.js`) already embeds the real version into the installed agent file's frontmatter during init and upgrade. The version was present but never surfaced to users. This approach requires zero code changes — it's a prompt instruction that leverages existing infrastructure.

**Alternatives rejected:**
- `description` frontmatter field: noisy in agent picker, may truncate
- `task` tool `description` parameter: per-spawn, not persistent
- Runtime `package.json` read: coordinator can't access the npm package at runtime

**Scope:** Single line addition to `squad.agent.md` Coordinator Identity section. No `index.js` changes. All 118 tests pass.


# Decision: Tips and Tricks User Documentation

**Date:** 2026-02-11
**Author:** McManus (DevRel)
**Status:** Approved

## What

Created `docs/tips-and-tricks.md` — practical end-user guide for managing Squad effectively. Addresses Issue #16.

## Why

Users new to Squad need more than feature documentation. They need patterns: when to use "Team" vs direct commands, how to get the most out of parallel work, how to manage decisions and memory, and how to recover from common mistakes.

Sample-prompts.md shows what Squad can build; tips-and-tricks.md shows how to work with Squad as a team.

## Key Decisions in the Doc

1. **Prompt Patterns**: Emphasis on scope clarity, roster specification, and decision stacking in the prompt itself. "Be specific about scope" prevents agents from asking clarifying questions later.

2. **Team vs Direct Commands**: Clear routing guidance — "Team" for parallel/cross-functional work, direct commands for sequential/specialized work. Includes table with use cases.

3. **Parallel Work Discipline**: Don't interrupt agents mid-chain. Check work logs instead of raw output. Let Ralph handle backlogs while you focus on urgent work.

4. **Ralph as Backlog Processor**: Practical Ralph patterns — activation, scoping, status checks, heartbeat setup. Ralph is most valuable when you have open issues.

5. **Decisions as Permanent Rules**: Set conventions early (session 1-2), capture them in decisions.md, agents read them automatically. "You only have to say them once."

6. **Pitfall Recovery**: 8 common mistakes with solutions. Emphasis on commitment (commit `.ai-team/`), clarity (specific prompts), and discipline (don't interrupt parallel work).

7. **Copyable Prompts**: Templates for getting started, asking for status, spike-then-build, closing phases. Real prompts users can copy directly.

## Style Notes

- Facts-based, not instructional. "Here's what works" not "You should do this."
- Before/after examples for patterns (❌ bad, ✅ good).
- Tables for routing guidance and reference.
- No fluff. Every section has working examples.
- Tone matches existing docs: direct, opinionated, technical.

## What Gets Created in Squad

This enables a help feature where users can ask:
- "Tips for prompt writing" → excerpt from Effective Prompt Patterns
- "How do I work with Ralph?" → Ralph section
- "I keep interrupting parallel work" → Pitfalls section
- "Show me a template prompt" → Copyable Prompts section

Document is self-contained and can be cross-referenced in README or featured in future chat help.

## Not in This Doc

- Feature explanations (that's in feature docs)
- Architecture (that's in guide.md)
- Installation (that's in guide.md)
- Getting started (that's in tour-first-session.md)

This doc assumes the user has installed Squad and formed a team. It's about effectiveness, not mechanics.



### 2026-02-12: Universe allowlist expansion
**By:** Fenster
**What:** Added 11 new universes to the casting allowlist (Adventure Time, Futurama, Seinfeld, The Office, Cowboy Bebop, Fullmetal Alchemist, Stranger Things, The Expanse, Arcane, Ted Lasso, Dune). Updated both `.github/agents/squad.agent.md` and `.ai-team/casting/policy.json`. Closed issue #21.
**Why:** The existing 20-universe list was genre-heavy on heist/crime films and light on animation, anime, sitcoms, and workplace comedy. Community request (Gabe, issue #21) for Adventure Time was the catalyst. The 10 additional universes were selected to diversify genre coverage — adding sitcom (Seinfeld, The Office), anime (Cowboy Bebop, Fullmetal Alchemist), animation (Futurama, Arcane), horror/drama (Stranger Things), hard sci-fi (The Expanse), sports/comedy (Ted Lasso), and epic sci-fi (Dune). Capacity values set conservatively (8–15) based on named character pools. Two constraint entries added where protagonist avoidance improves casting variety.


# Issue #6 (Project Boards) — Go/No-Go Assessment

**Date:** 2026-02-11  
**By:** Keaton (Lead)  
**Status:** Go (Conditional v0.4.0)  
**Posted:** https://github.com/bradygaster/squad/issues/6#issuecomment-3888277477

---

## What

Project Boards (V2) integration for Squad is **approved for v0.4.0 implementation**. The feature is architecturally sound, technically feasible with zero npm dependencies, and has clear 3-phase implementation plan.

---

## Why

1. **Validated architecture:** Labels drive automation (source of truth), boards provide visualization (read-only projection). No state conflicts. Complements existing 032/032c/PR#5 work.

2. **Zero-dependency confirmed:** Kujan's 033a assessment proved `gh project *` CLI covers all 12 required operations. GitHub MCP server has zero Projects V2 tools. No npm packages needed.

3. **Single blocker is fixable:** Missing `project` token scope is not a design problem. Brady runs `gh auth refresh -s project` once, feature is unblocked. Graceful degradation handles missing scope at runtime.

4. **Clear sprint decomposition:** 17-26 squad-hours across 3 agents, 3 phases:
   - Phase 1 (Foundation): Validate CLI commands work, define provider interface (WI-1, WI-2)
   - Phase 2 (Integration): Coordinator prompts + sync workflow (WI-3, WI-4) — can parallelize Fenster + Verbal
   - Phase 3 (Polish): Query/display + docs (WI-5, WI-6) — can parallelize Verbal + McManus

5. **Community signal matters:** @londospark's Issue #6 is the first external feature request with concrete technical proposal. Shipping it demonstrates we listen and move fast. v0.4.0 is achievable in 12-16 calendar days if phases 2-3 overlap.

---

## Rationale

**v0.4.0, not v0.3.0:** Brady's directive for v0.3.0 is ONE feature (proposals as GitHub Issues, 032). Project boards sit on top of the label/issue foundation that 032/032c/PR#5 build. The right sequence is labels first (v0.3.0), boards as a dashboard (v0.4.0). This is not deferral, it's architecture.

**Zero-dependency constraint holds:** Proposal 033 initially suggested GraphQL client library. Kujan's 033a recommendation is `gh project *` CLI commands exclusively. This preserves our zero-dependency architecture and is more maintainable long-term.

**Provider abstraction from day 1:** While GitHub-only on Day 1, the design documents cross-provider mapping (GitHub/ADO/GitLab). 033a shows each provider has equivalent operations. No future architectural rework needed.

---

## Prerequisites

**Brady must run before squad starts:**
```bash
gh auth refresh -s project
```

Grants `project` scope to the token. One-time interactive step, ~10 seconds. Verify:
```bash
gh auth status 2>&1 | grep "project"
```

If scope is missing at runtime, graceful degradation kicks in: board operations skip silently, user gets a message with fix instructions.

---

## Agent Assignments

- **Fenster (Core Dev):** WI-1 (validate GraphQL commands), WI-2 (provider interface), WI-4 (sync workflow)
- **Verbal (Prompt Engineer):** WI-3 (board init prompts), WI-5 (board query/display)
- **McManus (DevRel):** WI-6 (documentation)

---

## Risks Mitigated

| Risk | Mitigation |
|------|-----------|
| `gh project item-edit` ID handling unreliable | Phase 1 is a focused validation gate; if it fails, we reassess |
| Token scope becomes unavailable | Graceful degradation + clear user messaging |
| Board sync becomes noisy | Sync is label-driven and silent; no issue comments |
| GraphQL field IDs change per-project | Expected behavior; WI-1 documents 4-step discovery; team.md caches IDs |
| Prompt bloat in coordinator | Verbal's core skill; if needed, we split functionality |

---

## Next Steps

1. Brady grants `project` scope
2. Fenster begins Phase 1 (WI-1 validation)
3. After Phase 1 gate passes, Verbal + Fenster start Phase 2 in parallel
4. After Phase 2, Verbal + McManus start Phase 3 in parallel

---

## Decision Reference

Full proposal: `team-docs/proposals/033-project-boards.md`  
API assessment: `team-docs/proposals/033a-projects-v2-api-assessment.md`  
GitHub issue: Issue #6 (londospark)  
Public comment: https://github.com/bradygaster/squad/issues/6#issuecomment-3888277477



---

### 2026-02-11: Squad Notification Architecture — MCP Integration Pattern

**By:** Keaton (Lead)

**What:** Squad agents can notify humans via external channels (Teams, iMessage, Discord, webhooks) when work is blocked, errors occur, or decisions are needed. Implemented as an MCP integration pattern — Squad ships ZERO notification infrastructure.

**Why:**

1. **Brady's vision:** "It needs to feel like I'm not in the team room, they are, and they need me so they pinged me." When agents hit a wall requiring human input, they should ping the human's phone, not just pause in the terminal.

2. **MCP integration preserves Squad's architecture:** Zero dependencies, filesystem-authoritative, git-native. The consumer brings their own notification MCP server (Teams, iMessage, etc.). Squad teaches agents WHEN and HOW to notify via a skill at `.ai-team/skills/human-notification/SKILL.md`.

3. **Platform-agnostic design:** Works with ANY notification MCP server — Teams (primary path), iMessage (Mac-only secondary), Discord, generic webhooks. Squad never hardens against a specific platform. When new platforms emerge (Slack, Mattermost, Signal), the consumer installs the right MCP server and Squad's skill detects the tools automatically.

4. **Zero maintenance burden:** The consumer owns the MCP server, credentials, and delivery mechanism. When Teams changes their API, the MCP server maintainer updates the server — not Squad. Squad just teaches the notification pattern and lets the platform handle delivery.

5. **Graceful degradation:** If no MCP server is configured, agents log the notification attempt and continue. Notifications are an enhancement, not a requirement. Squad works perfectly without them.

**Architecture:**

- **Layer 1:** Notification skill (`.ai-team/skills/human-notification/SKILL.md`) teaches agents when to ping (BLOCKED, ERROR, DECISION, COMPLETE) and how to compose rich, agent-branded notifications.
- **Layer 2:** MCP tool abstraction — agents detect which notification tools are available (`send_teams_message`, `send_imessage`, `post_webhook`) and use the right format for each platform.
- **Layer 3:** Consumer's MCP server (configured in `.vscode/mcp.json`, VS Code settings, etc.) handles actual delivery.

**Message format (platform-agnostic):**

- **Who:** Agent name + emoji (Keaton 🏗️)
- **Why:** Type badge (🚫 BLOCKED, ⚠️ ERROR, 🤔 DECISION, ✅ COMPLETE)
- **Context:** Brief explanation (1-2 sentences)
- **Action:** What the human should do next
- **Link:** URL to GitHub issue/PR/proposal if applicable

**Platform-specific renderers:**

- **Teams:** Adaptive Card JSON with color-coded theme (red for ERROR, orange for BLOCKED, blue for DECISION, green for COMPLETE)
- **iMessage:** Plain text with emoji and signature
- **Webhook:** Structured JSON payload that consumer routes to their chosen backend (Slack, Discord, SMS, push notifications)

**Integration with existing features:**

- **Human Team Members:** When work routes to a human team member, the assigned agent sends a BLOCKED notification on their behalf.
- **Ralph (Work Queue Monitor):** Ralph can escalate stale work via notifications (opt-in — default OFF).
- **Coordinator Handoffs:** When an agent returns blocked, the coordinator triggers the notification BEFORE prompting the user in terminal (ensures Brady gets the ping even if not watching terminal).

**Primary path: Microsoft Teams**

Brady said Teams is "ideal, especially per-repo channels." Teams channels-within-a-Team map perfectly to repos. Microsoft ships official MCP support: `@microsoft/teams.mcp` npm package and https://github.com/microsoft/IF-MCP-Server-for-Microsoft-Teams. Setup: create Incoming Webhook URL, configure MCP server, Squad detects `send_teams_message` tool and sends Adaptive Cards.

**Secondary path: iMessage (Mac-only)**

Zero account setup, instant delivery, native to Apple ecosystem. Limitations: requires macOS with Messages.app running, cannot run headless. MCP server exists: `imessage-mcp` or `imsg` CLI tool. Squad detects `send_imessage` tool and sends plain text with agent signature.

**Trade-offs:**

- **No auto-configuration:** Consumer must manually wire up MCP server and credentials. This is a setup burden but preserves Squad's zero-dependency constraint.
- **Single channel per repo:** All notifications from a repo go to ONE configured channel/recipient. Per-agent channels would fragment the notification stream (Brady doesn't want to monitor 5 channels per repo).
- **COMPLETE notifications opt-in:** Completion notifications can be noisy. Default is OFF. Consumers enable explicitly if they want visibility into finished work.

**Sprint estimate:** 1.8 squad-days (core) + 0.3 squad-days (Ralph integration, optional). Target version: 0.3.0 (alongside GitHub-native proposals).

**Success criteria:**

1. Notification skill exists at `.ai-team/skills/human-notification/SKILL.md`
2. Skill teaches all four trigger types (BLOCKED, ERROR, DECISION, COMPLETE)
3. `docs/notifications.md` exists with Teams and iMessage setup guides
4. Agents gracefully degrade when no MCP server configured
5. At least ONE real-world test: Brady configures Teams, receives notification from his squad

**Key file paths:**

- `team-docs/proposals/034-notification-architecture.md` — full design specification
- `.ai-team/skills/human-notification/SKILL.md` — agent-facing skill (teaches when/how to notify)
- Future: `docs/notifications.md` — consumer setup guide (Teams, iMessage, Discord, webhook walkthroughs)

**Future enhancements (post-0.3.0):**

- Discord support in primary docs (currently secondary tier)
- Slack support for enterprise customers
- Per-agent notification preferences (e.g., "only notify for Keaton's blockers")
- Digest mode (daily/weekly summary email instead of real-time pings)
- Two-way communication (reply to notification via Teams/iMessage and have Squad ingest response — requires connector architecture, not just MCP tools)


---

# Decision: Squad Notifications Consumer Documentation

**Status:** Completed  
**Decided by:** McManus  
**Date:** 2026-02-12

## What Was Decided

Created `docs/features/notifications.md` — consumer-facing documentation for "Squad Pings You," the feature allowing users to receive instant messages when agents need human input.

## Rationale

Brady's vision: "It needs to feel like I'm not in the team room, they are, and they need me so they pinged me." This doc translates that into practical setup paths and concrete examples of what notifications look like.

## Key Design Decisions

### 2026-02-13: go:/release: label automation

**By:** Fenster

**What:** Four-workflow system to automate `go:` (triage verdict) and `release:` (version target) label namespaces. Created `squad-label-enforce.yml` for mutual exclusivity enforcement; updated `sync-squad-labels.yml` to sync 8 static labels (3 go:, 5 release:); updated `squad-triage.yml` to apply `go:needs-research` as default verdict; updated `squad-heartbeat.yml` to detect issues missing go: labels and go:yes issues missing release: labels.

**Why:** Labels-as-automation is the foundation of Squad's GitHub-native workflow. The `go:` namespace (go:yes, go:no, go:needs-research) captures triage decisions; the `release:` namespace (release:v0.4.0, v0.5.0, v0.6.0, v1.0.0, release:backlog) captures delivery targets. Mutual exclusivity is business logic (exactly 1 go: label per triaged issue, at most 1 release: label per issue). Workflows enforce this at runtime, eliminating human error. The enforcement workflow handles label transitions: when a new go: or release: label is applied, it removes conflicting labels in the same namespace and posts a comment (only on actual changes). Special cases: `go:yes` auto-applies `release:backlog` if no release target exists (every approved issue must have a target); `go:no` strips release labels (rejected issues shouldn't be in release planning). Default verdict (`go:needs-research`) is applied by triage workflow to ensure every triaged issue enters the system with a go: label. Ralph (heartbeat) now scans for label hygiene: issues missing go: labels are surfaced as incomplete triage, go:yes issues missing release: labels are surfaced as incomplete planning. This is textbook "agentic DevOps" — labels are the state machine, automation is the enforcement layer.


### 2026-02-13: User directives (consolidated)

**By:** Brady (via Copilot)

**What:**
1. **Execution strategy:** Take action, don't wait for permission. If the squad has questions on issues, leave a comment. If not, close research issues and create milestone-ready implementation issues. Optimize for momentum.
2. **Agent emoji identity:** Add role-specific emoji to agent identity across platforms:
   - In VS Code: Include emoji in agent name field in .agent.md files (e.g., name: "🔧 Fenster", "🧪 Hockney")
   - In CLI: Prepend emoji to description field in 	ask tool spawns (e.g., "🔧 Fenster: refactoring auth module")
   - Roster mapping: 🏗️ Lead, 🔧 Core Dev, ⚛️ Frontend, 🧪 Tester, 📝 DevRel, ✏️ Prompt Engineer, 📋 Scribe, 🔄 Ralph

**Why:** User request — captured for team memory. Brady wants momentum over planning paralysis. Emoji identity makes agent roles immediately distinguishable across platforms (VS Code, CLI) and makes the experience feel more alive.
### 2026-02-13: VS Code runSubagent spawning — platform parity and adaptation strategy (consolidated)

**By:** Keaton, Strausz, Kujan

**What:** VS Code is the #1 priority for Copilot client parity. Squad agent spawning via 
unSubagent in VS Code requires: (1) platform detection via tool availability (	ask = CLI, gent/
unSubagent = VS Code), (2) custom .agent.md files per Squad role to replace CLI gent_type parameters, (3) prompt-based agent selection rather than structured spawn parameters. Key findings: parallel execution supported (multiple sub-agents run concurrently in VS Code); 
unSubagent is synchronous but covers Squad's Eager Execution via batch spawning; model selection differs (CLI has per-spawn model param, VS Code routes through .agent.md frontmatter); MCP tools are inherited by default in VS Code (opposite of CLI, net positive).

**Why — architectural (Keaton):** Issue #10 decomposition — Brady's directive prioritizes VS Code over JetBrains and GitHub.com (P2/deferred). VS Code dominates the market and has the most feature-complete Copilot integration (agent spawning, background tasks, file system access). Solving VS Code first unblocks patterns for other surfaces.

**Why — viability (Strausz):** Issue #32 spike on VS Code 
unSubagent API confirms it can replace CLI 	ask tool but requires platform detection and custom agent files. Coordinator needs conditional spawn logic to detect platform via tool availability, then use appropriate mechanism. Custom agent files provide finer control than CLI agent types (tool restrictions, model selection, visibility). This decision unblocks #33 (file discovery), #34 (model selection), #35 (compatibility matrix).

**Why — parity analysis (Kujan):** Full parameter catalog between CLI 	ask and VS Code 
unSubagent: prompt maps 1:1, parallel fan-out works both surfaces (CLI background mode, VS Code parallel sync subagents), model selection is the biggest gap. The 5 spawn patterns (standard, lightweight, explore, scribe, ceremony facilitator) all map successfully — only degradation is Scribe becoming synchronous (tolerable) and explore losing speed optimization (optional fix via custom agent file).

**Implementation strategy (consensus):**
- **Recommended approach:** Prompt-level platform detection in squad.agent.md coordinator — no abstraction layer needed
- **v0.4.0 MVP:** Accept session model for all agents, defer per-agent model selection
- **v0.4.x follow-up:** Generate custom agent files for per-agent model selection
- **Graceful degradation:** If neither 	ask nor gent tool available, coordinator works inline with warning

**Key technical findings:**
- 
unSubagent is synchronous but supports parallel batch spawning (multiple sub-agents in one turn run concurrently)
- No mode: "background" equivalent — Squad's Eager Execution works via parallel batch spawning instead
- Model selection via .agent.md model field (not spawn parameter) — experimental, requires VS Code setting
- MCP tool inheritance is DEFAULT in VS Code (opposite of CLI) — this is positive for Squad
- Detection strategy: check for 	ask tool (CLI) vs gent tool (VS Code) in available_tools
- Graceful degradation: if neither tool available, coordinator works inline

**Decomposition (sub-issues for v0.4.0):**
| Issue | Priority | Surface | Work |
|-------|----------|---------|------|
| #32 | P0 | VS Code | Test 
unSubagent as squad spawn mechanism |
| #33 | P0 | VS Code | Test agent file discovery & .ai-team/ access |
| #34 | P1 | VS Code | Model selection & background mode parity |
| #35 | P1 | VS Code | Compatibility matrix document |
| #36 | P2 | JetBrains + GitHub.com | Surface research (v0.5.0+ deferred) |

**Related decisions:**
- Per-agent model selection (024 consolidated) — VS Code must support model parameter
- GitHub-native planning (028) — Issues/PRs are assignment vehicle
- Release timeline (019) — v0.4.0 includes GitHub Issues + Project Boards; client parity incremental

**Success criteria:**
- Agent spawning works in VS Code via 
unSubagent
- .ai-team/ file discovery and access validated
- Model selection parameter support tested  
- Background/async execution mode documented
- Compatibility matrix published (VS Code 100%, others TBD)



---

# Decision: Agent Progress Updates — Milestone Signals + Coordinator Polling

**Decision Date:** 2026-02-13  
**Decided by:** Keaton (Lead)  
**Affects:** Proposal 022a (Issue #22), Coordinator (squad.agent.md), All Agent Types  
**Status:** Proposed (awaiting Brady approval, likely v0.4.0)

---

## The Question

**Issue #22 (bradygaster):** Users feel uncertain during long-running background agent work. The terminal goes quiet. How do we surface periodic progress updates that:
- Signal work is still happening
- Reflect agent personality (not generic "still working...")
- Don't slow down actual work (cost-first model)
- Work across all agent types (explore, task, general-purpose, code-review)

## The Decision

**Implement Milestone Signals + Coordinator Polling mechanism.**

### Compound Value

This decision unlocks downstream features:

1. **With Proposal 034 (Notifications):** Agent can emit `🔴 [MILESTONE] Blocked on decision` → Coordinator can trigger human notification
2. **With Squad DM:** Progress milestones can sync to Discord channel as reactions or embeds
3. **With Proposal 028 (GitHub-native planning):** Milestones can auto-comment on GitHub Issues in progress
4. **Future: Agent negotiation:** Agents can emit `⚠️ [MILESTONE] Conflict detected` → Coordinator initiates agent conversation

Visible progress is foundational for agent-user intimacy. It answers "Are they working for me or with me?"

---

## Success Criteria

- [ ] Coordinator extracts milestones correctly from 10+ common formats
- [ ] Agents adopt pattern within 1-2 spawns of first use
- [ ] No performance degradation: read_agent polling < 100ms overhead per call
- [ ] Works across all agent types without modification
- [ ] Users report less uncertainty during 2+ minute tasks (post-launch feedback)
- [ ] Milestone signal appears in at least 3 agent specs by v0.4.0 close

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Agents forget to emit milestones | Medium | Skill documentation + spawn template examples |
| Coordinator extracts false positives | Low | Strict regex: `\[MILESTONE\]` (hard to accidentally match) |
| Polling latency (30s) feels too slow | Low | Industry standard; documented as tunable per agent |
| read_agent output accumulates too large | Low | Milestones are 1-2 lines; total overhead < 10KB |
| Users get milestone fatigue | Low | Deduplication + one milestone per 30s discipline |

---

## Timeline

- **Proposal review:** 48-72 hours (standard)
- **Implementation (if approved):** 3-4 squad-hours
  - Fenster: Coordinator polling loop (1.5h)
  - Verbal: Skill design + agent examples (1.5h)
  - Testing: Validation across agent types (1h)
- **Target release:** v0.4.0 (after Project Boards)

---

## Related Proposals

- **Proposal 034:** Notification architecture (Teams, iMessage, webhook) — notifications triggered by agent state
- **Proposal 017/030/030a:** Async comms (Squad DM) — milestones can surface in Discord/Teams
- **Proposal 028:** GitHub-native planning — milestones can comment on issues
- **Issue #22:** Community request for progress visibility during long-running work

---

## Next Steps

1. **Brady's approval:** Is this the right design? Any modifications?
2. **Verbal's feedback:** How should the skill be documented? What examples?
3. **Fenster's estimate:** Any gotchas in the coordinator implementation?
4. **Implementation:** Parallel work on coordinator + skill
5. **Testing:** Validate across explore, task, general-purpose, code-review agents
6. **Release:** v0.4.0 (bundled with Project Boards feature)



---

# Decision: VS Code Model & Background Parity Strategy

**By:** Kujan
**Date:** 2026-02-14
**Issue:** #34
**Proposal:** 034a

## Decision

VS Code model selection and background mode parity follows a three-phase approach:

1. **Phase 1 (v0.4.0):** Accept session model for all VS Code spawns. Use `runSubagent` (anonymous). No custom agent files required. Parallel sync subagents replace background mode.

2. **Phase 2 (v0.5.0):** Generate model-tier `.agent.md` files during `squad init` — `squad-fast` (haiku), `squad-standard` (sonnet), `squad-premium` (opus). Use `agent` tool to invoke named agents for model control.

3. **Phase 3 (v0.6.0+):** Per-role agent files if custom agent subagent support stabilizes out of experimental.

## Key Constraints

- `runSubagent` does NOT accept `model` param — frontmatter only
- VS Code "Background Agents" ≠ CLI `mode: "background"` — different concept entirely
- `chat.customAgentInSubagent.enabled` is still experimental
- Model names differ: CLI uses API names, VS Code uses display names with `(copilot)` suffix

## What This Means for the Team

- **Fenster:** When implementing VS Code spawn logic in `squad.agent.md`, use prompt-level conditional instructions (§5 of proposal). No code-level abstraction.
- **Verbal:** Spawn templates need VS Code-specific variants. Key differences: drop `mode`, `model`, `agent_type`, `description` params. Add "batch Scribe last" rule.
- **Keaton:** Phase 2 requires `squad init` to detect VS Code and generate `.agent.md` files. Plan for v0.5.0.


---

# Decision: VS Code File Discovery and .ai-team/ Access Requires No Code Changes

**Author:** Strausz
**Date:** 2026-02-15
**Issue:** #33

## Decision

Squad's file discovery and `.ai-team/` access work in VS Code with zero code changes to `squad.agent.md`. The instruction-level abstraction (describing operations like "read this file" rather than hardcoding tool names like `view` or `readFile`) naturally works across both CLI and VS Code surfaces.

## Rationale

- VS Code auto-discovers `squad.agent.md` from `.github/agents/` — same location CLI uses
- Sub-agents inherit file tools by default — better than CLI (more tools available)
- Path resolution via `git rev-parse --show-toplevel` works in VS Code via `runInTerminal`
- All `.ai-team/` read/write operations are supported via VS Code's built-in tools

## Constraints Documented

- Multi-root workspaces: NOT supported for Squad (known VS Code bugs). Single-root only.
- Workspace Trust: Must be enabled. Document as prerequisite.
- First-session approval: Users see tool approval prompts on first file write. Document in onboarding.
- `sql` tool: CLI-only. Avoid in VS Code codepaths.

## Optional Enhancement (Not Blocking)

A small VS Code compatibility note can be added to `squad.agent.md` covering workspace scope, `sql` absence, and approval UX. This is recommended but not required for functionality.



---

# Decision: Client Parity Compatibility Matrix

**Date:** 2026-02-15  
**Owner:** McManus (DevRel)  
**Status:** Implemented  
**Related:** Issue #35, Proposals #032a, #032b, #033a, #034a  

## Summary

Created `docs/scenarios/client-compatibility.md` as the single source of truth for what Squad features work on each Copilot surface (CLI, VS Code, JetBrains, GitHub.com).

## Rationale

**Community clarity need:** Issue #9 (reporter: miketsui3a) and #10 asked for documentation on cross-client support. Developers trying Squad on VS Code or other surfaces need to know what works where without trial-and-error or searching scattered spikes.

**Spike findings ready:** Four research proposals (032a–034a) contain production-grade findings from February spikes. Synthesizing them into one document prevents knowledge silos and gives developers a single reference point.

**Developer-first structure:** Matrix format (quick reference) + detailed per-platform sections + adaptation guide enables self-service troubleshooting. No need to file issues or ask in discussions.

## Key Decisions Documented

1. **CLI is primary:** Full feature support, recommended for learning and setup.

2. **VS Code works:** With adaptations.
   - Sub-agents are sync but parallel when spawned in one turn (functionally equivalent to CLI's background mode).
   - Session model by default (Phase 1). Custom agent frontmatter for Phase 2.
   - File access works (workspace-scoped).
   - Scribe batching pattern: put Scribe last in parallel groups.

3. **JetBrains/GitHub untested:** Documented as `?` (unknown). Links to pending spikes #12, #13.

4. **SQL is CLI-only:** Avoids confusion about cross-platform SQL workflows.

5. **File discovery works everywhere:** `.github/agents/squad.agent.md` auto-discovered on all platforms tested.

6. **Straight facts tone:** No editorial framing, no "amazing" language. Every statement specifies what a feature is, how it works, or what replaces it.

## Structure

- **Quick Reference Matrix** — One table with ✅/⚠️/❌/? for all features
- **Per-Platform Details** — CLI (full), VS Code (conditional), JetBrains (unknown), GitHub (unknown)
- **Platform Adaptation Guide** — When to use which surface + feature degradation table for developers building cross-platform coordinators
- **Investigation Status** — Links to spike proposals for deep dives
- **See Also** — Cross-references to related feature docs (model selection, parallel execution, worktrees)

## Navigation

- Added to `docs/README.md` under "Operations" section (first item for discoverability)
- Link: [Client Compatibility Matrix](scenarios/client-compatibility.md) — What works on CLI, VS Code, JetBrains, GitHub.com

## Impact

- ✅ Developers get one document instead of reading 4 proposals
- ✅ Community questions about "does this work on VS Code?" have a documented answer
- ✅ Sets foundation for Phase 2 (custom agent generation) and Phase 3 (per-role agent files)
- ✅ Enables Brady to point to facts-based matrix when discussing cross-client strategy

## Future Work

- Spike #12 (JetBrains investigation) — populate `?` cells, determine if agent spawning supported
- Spike #13 (GitHub investigation) — populate `?` cells, assess GitHub's agent orchestration capabilities
- Phase 2 (v0.5.0) — Generate custom `.agent.md` files during `squad init` for model-tier selection on VS Code
- Empirical testing — Verify VS Code has the silent success bug (P0 from Proposal 015) or can omit Response Order workaround


## Decision: Projects V2 Phase 1 Gate — PASSED

**Date:** 2026-02-15  
**Author:** Fenster  
**Context:** Issue #6, Proposal 033 WI-1 + WI-2

### 2026-02-15: Client Compatibility section added to squad.agent.md
**By:** Verbal
**What:** Added a "Client Compatibility" coordinator instruction section to `.github/agents/squad.agent.md` as the v0.4.0 deliverable for issue #10. The section includes platform detection logic (CLI/VS Code/fallback), VS Code spawn adaptations (9 behavioral changes), a feature degradation table (6 rows), and a SQL tool caveat. Both Background and Sync spawn templates were annotated with VS Code equivalents via blockquote callouts. Source data from proposals 032a, 032b, 033a, 034a and the compatibility matrix at `docs/scenarios/client-compatibility.md`.
**Why:** The coordinator needs actionable instructions for cross-platform spawning. Without this section, `squad.agent.md` only knows CLI patterns — a VS Code coordinator would attempt `task` tool calls, fail, and have no fallback. The section is placed between Per-Agent Model Selection and Eager Execution Philosophy because platform detection logically gates how spawning, model selection, and parallelism work. Prompt-level conditional instructions (not a code abstraction layer) is the team-agreed approach from proposal 032b §8.


### 2026-02-15: MCP integration — coordinator awareness and CLI config generation
**By:** Fenster
**What:** Added MCP Integration section to squad.agent.md, MCP context block to spawn template, and `.copilot/mcp-config.json` sample generation to `squad init` and `squad upgrade`.
**Why:** Issue #11 — enable Squad to use MCP services (Trello, Aspire, etc.). Squad doesn't own MCP server lifecycle; it teaches agents awareness and provides a sample config with the `EXAMPLE-` prefix pattern so users know where to configure. The upgrade migration ensures existing installs get the sample config.

### 2026-02-15: Init Mode — optimization and confirmation skip fixes (consolidated)

**By:** Keaton

*Note: This decision consolidates two related Init Mode improvements from 2026-02-13 (compression) and 2026-02-15 (confirmation UX fix). The 2026-02-13 decision on context window optimization is superseded by this consolidated entry.*

**Why:** Issue #66 — this is a recurring UX problem that undermines user control during team setup

---

## Root Cause Analysis

The Init Mode confirmation skip is a **prompt design problem**, not a logic error. The coordinator prompt has all the right steps in the right order — but the surrounding prompt context creates overwhelming pressure for the LLM to execute the full sequence in a single turn. There are **five reinforcing causes**.

#### Cause 1: Numbered List Completion Impulse

Init Mode steps 1–8 are a single numbered list. LLMs are trained to complete sequences. When the model reaches step 5 ("Ask: Look right?"), it generates the question text — but the next token prediction sees step 6 right there in context. The model treats the numbered list as a **procedure to execute**, not a **conversation to have**. It "asks" the question as output text, then immediately proceeds to step 6 because that's what comes next in the sequence.

This is the **primary driver**. The model doesn't distinguish between "emit this question and stop" vs "emit this question as part of completing the list."

#### Cause 2: Step 6 Phrasing — "On confirmation" is Ambiguous

> `6. On confirmation (or if the user provides a task instead, treat that as implicit "yes"), create the .ai-team/ directory structure`

"On confirmation" reads as a **conditional within the same execution frame**, not as a "wait for the next user message." The parenthetical "(or if the user provides a task instead, treat that as implicit 'yes')" further weakens the gate — the model can rationalize that the user's *original message* (e.g., "I'm building a Node.js API") constitutes a task, triggering the implicit-yes bypass.

There is no explicit instruction to **stop generating**, **end the turn**, or **wait for user input**. The word "confirmation" is doing all the gate-keeping work, and it's not enough.

#### Cause 3: Eager Execution Philosophy Creates Contradictory Pressure

Line 16:
> **Mindset:** **"What can I launch RIGHT NOW?"** — always maximize parallel work

Line 480-486 (Eager Execution Philosophy):
> The Coordinator's default mindset is **launch aggressively, collect results later.**
> ...launch follow-up agents without waiting for the user to ask.

Line 848:
> DO NOT stop. Do NOT wait for user input.

These are Team Mode instructions, but they're in the **same prompt context** during Init Mode. The model doesn't scope instructions to modes — it absorbs the entire prompt as its behavioral baseline. The repeated "don't wait," "launch immediately," "don't stop" instructions create a strong prior against pausing for any reason.

#### Cause 4: The Parenthetical Escape Hatch

Step 5:
> *"(Or just give me a task to start!)"*

Step 6:
> *(or if the user provides a task instead, treat that as implicit "yes")*

Step 8 (post-setup):
> *These are additive. Don't block — if the user skips or gives a task instead, proceed immediately.*

These three parentheticals collectively communicate: "confirmation is optional, proceeding is fine." The model reads "Or just give me a task" as license to treat the user's initial project description as that task. Combined with step 6's implicit-yes clause, the model has a clean logical path from "user said what they're building" → "that's a task" → "implicit yes" → "create everything."

#### Cause 5: No Structural Turn Boundary

The prompt has no mechanism that **forces** a turn boundary between step 5 and step 6. In a multi-turn conversation, the only thing that creates a real pause is:
1. The model choosing to stop generating (weak — easily overridden by completion impulse)
2. A tool call like `ask_user` that structurally requires user input before continuing
3. An explicit "END YOUR RESPONSE HERE" instruction

Init Mode relies on option 1 alone. Given causes 1-4, option 1 consistently fails.

---

## Proposed Fixes

#### Fix A: Explicit STOP Gate (Minimum viable fix)

Replace the current step 5-6 boundary with a hard stop instruction:

```markdown
5. Propose the team roster (step 4 above), then ask:
   *"Look right? Say **yes**, **add someone**, or **change a role**."*

   **⚠️ STOP HERE. End your response. Do NOT proceed to step 6.**
   Wait for the user's reply before creating any files.

6. **[ONLY after the user replies]** On confirmation (explicit "yes", "looks good",
   or similar affirmative — OR if the user provides a task instead of confirming),
   create the `.ai-team/` directory structure.
```

**Pros:** Minimal change, preserves existing flow.
**Cons:** Still relies on the model obeying a text instruction. LLMs can and do ignore "STOP" instructions, especially with competing pressure from the Eager Execution sections.

#### Fix B: Structural Turn Break via Two-Phase Init (Recommended)

Split Init Mode into two clearly separated phases with an explicit turn boundary:

```markdown
## Init Mode — Phase 1: Cast the Team

No team exists yet. Propose one.

1. **Identify the user.** Run `git config user.name` and `git config user.email`.
2. Ask: *"What are you building? (language, stack, what it does)"*
3. **Cast the team** (see Casting & Persistent Naming algorithm).
4. Propose the team roster.
5. Ask: *"Look right? Say **yes**, **add someone**, or **change a role**."*

**Your response for Phase 1 ENDS here. Do not create any files or directories.**

---

## Init Mode — Phase 2: Create the Team

**Trigger:** User replied to the Phase 1 roster with confirmation or a task.

6. Create the `.ai-team/` directory structure...
7. Say: *"✅ Team hired..."*
8. Post-setup input sources...
```

**Pros:** The section boundary (horizontal rule + new heading) creates a structural signal that these are separate response turns. The model is much less likely to "complete" across section breaks than within a numbered list.
**Cons:** Slightly more verbose prompt. Requires the model to re-enter Init Mode Phase 2 on the next turn (but `team.md` doesn't exist yet, so the Init Mode check still triggers).

#### Fix C: `ask_user` Tool Instruction (Strongest guarantee)

If the platform supports an `ask_user` tool that forces a turn boundary:

```markdown
5. Propose the team roster, then call the `ask_user` tool with:
   *"Look right? Say **yes**, **add someone**, or **change a role**."*
   The `ask_user` tool will pause execution until the user responds.
   Do NOT proceed to step 6 until `ask_user` returns.
```

**Pros:** Structural guarantee — the tool call mechanism forces a real pause. The model cannot "complete past" a tool call the way it can ignore text instructions.
**Cons:** Depends on `ask_user` being available on all platforms (CLI, VS Code, etc.). May not exist in all Copilot client contexts. Needs a fallback for platforms without `ask_user`.

#### Fix D: Remove Competing Signals (Complementary — do with A, B, or C)

Add an Init Mode exception to the Eager Execution section:

```markdown
#### Eager Execution Philosophy

> **Exception:** Eager Execution does NOT apply during Init Mode.
> Init Mode requires explicit user confirmation before creating the team.
> See Init Mode step 5 for the required pause.

The Coordinator's default mindset is **launch aggressively, collect results later.**
```

Also tighten the step 6 implicit-yes clause to prevent the original message from qualifying:

```markdown
6. On confirmation (explicit "yes"/"looks good"/affirmative in response to step 5's question,
   OR if the user's **reply to step 5** is a task instead of confirming), create...
```

The key change: "reply to step 5" — not the original message.

---

## Recommendation

**Implement Fix B (two-phase split) + Fix D (remove competing signals).**

Fix B is the most robust text-only solution because it uses structural formatting (section breaks, separate headings) to create a turn boundary, rather than relying on the model obeying an instruction it has competing reasons to ignore. Fix D removes the contradictory pressure that causes the model to rationalize skipping the pause.

Fix C (`ask_user`) is the strongest technical guarantee but has platform portability concerns. Add it as an enhancement once client parity (Issue #10) is resolved — at that point, we'll know which clients support `ask_user`.

Fix A alone is insufficient. The model already has an instruction to ask and wait (step 5). Adding more emphasis to the same instruction pattern is unlikely to change behavior when the root causes (completion impulse, eager execution pressure, implicit-yes escape hatch) remain.

---

## Validation Approach

After implementing the fix:
1. Test with 5+ fresh repos (no `.ai-team/` directory) across CLI and VS Code
2. Verify the coordinator stops after proposing the roster and does NOT create files
3. Test the implicit-yes path: respond to the roster with a task instead of "yes" — files should be created
4. Test modification: respond with "add a designer" — coordinator should re-propose, not create
### 2026-02-15: Plugin Marketplace Integration

**Date:** 2026-02-15
**Decided by:** Keaton (Lead)
**Issue:** #29 — New team members should leverage configured plugin marketplace
**Status:** Implemented

## What

When adding new team members, the coordinator now checks configured plugin marketplaces for relevant templates and skills. This enables community-driven agent customization — e.g., prompting for "Azure cloud development" can discover and install an `azure-cloud-development` plugin automatically.

## Architecture

- **State:** `.ai-team/plugins/marketplaces.json` — JSON file listing registered marketplace sources (GitHub repos)
- **CLI:** `squad plugin marketplace add|remove|list|browse` — four subcommands for marketplace management
- **Coordinator flow:** Adding Team Members section updated with marketplace check step between name allocation and charter generation
- **Discovery:** `browse` command reads a marketplace repo's directory listing via `gh api` to find available plugins
- **Installation:** Plugin content copied into `.ai-team/skills/{plugin-name}/SKILL.md` or merged into agent charter

## Graceful Degradation

- No marketplaces configured → skip silently
- Marketplace unreachable → warn and continue
- No matching plugins → inform and proceed

## Trade-offs

- **Simple discovery model:** Directory listing, not a manifest. Low barrier for marketplace authors but less metadata. Good enough for v0.4.0; can add `manifest.json` later.
- **gh CLI dependency for browse:** Requires GitHub CLI installed and authenticated. Acceptable since Squad already depends on `gh` for other features.
- **No auto-install:** Always asks the user before installing. Respects user agency.

## Files Changed

- `.github/agents/squad.agent.md` — Added Plugin Marketplace section, updated Adding Team Members flow, added to Source of Truth table
- `index.js` — Added `plugin marketplace` subcommands, `plugins/` directory creation, v0.4.0 migration






### 2026-02-13: CI/CD workflow pipeline
**By:** Kobayashi
**What:** Created three CI/CD workflows (`squad-ci.yml`, `squad-preview.yml`, `squad-release.yml`) in both `.github/workflows/` and `templates/workflows/`. CI runs tests on PRs and dev pushes. Preview validation checks for clean state (no `.ai-team/`, valid version). Release automation is idempotent — reads version from package.json, skips if tag exists, creates tag + GitHub Release with auto-generated notes on new versions.
**Why:** Squad needed automated CI gates and a release pipeline that prevents human error. The idempotent design means re-pushing to main for the same version is safe (no duplicate releases). Minimal permissions (read-only for CI/preview, write only for release) follow least-privilege. Template copies ensure users who run `npx github:bradygaster/squad` or `upgrade` get these workflows installed automatically.


### 2026-02-13: CI guard to block forbidden paths on main

**By:** Kobayashi

## Context

`.ai-team/` files (121+ team state files) have repeatedly leaked into `main` via PR merges from `dev`. The root cause: files that were previously force-added with `git add -f` remain tracked by git, and `.gitignore` only prevents *new* files from being added — it does NOT stop already-tracked files from flowing through merges.

Similarly, `team-docs/` internal content (proposals, human-evals, etc.) has leaked into `main`. Only `team-docs/blog/` belongs on `main`.

`.gitignore` is a request. CI is enforcement.

## Decision

Created `squad-main-guard.yml` — a GitHub Actions workflow that:

1. **Triggers** on all PRs targeting `main` (opened, synchronize, reopened)
2. **Uses the GitHub API** (`pulls.listFiles`) to get the full list of changed files — not `git diff`, which would miss files already on the base branch
3. **Blocks** any PR containing files in:
   - `.ai-team/**` — zero exceptions
   - `team-docs/**` — except `team-docs/blog/**` (blog content is allowed)
4. **Fails with actionable guidance** — tells the contributor exactly which files to remove and how (`git rm --cached`)
5. **Passes silently** if no forbidden files are found

## Files

- `templates/workflows/squad-main-guard.yml` — the reusable template
- `.github/workflows/squad-main-guard.yml` — active on this repo
- `.gitignore` — updated with explicit warning against force-adding `.ai-team/`

## Rationale

- **Structural enforcement > convention.** `.gitignore` has failed repeatedly. A CI check is a hard gate.
- **GitHub API over git diff.** `pulls.listFiles` returns exactly what the PR introduces, paginated, without needing to reconstruct merge bases.
- **Actionable errors.** Contributors shouldn't have to guess how to fix the problem. The error message includes the exact commands to run.
- **Template + active.** The workflow lives in both `templates/workflows/` (for distribution to other repos via `npx`) and `.github/workflows/` (active on this repo).


### 2026-02-15: Release process documentation standards

**By:** Kobayashi  
**Status:** Complete

**What:** Created `docs/scenarios/release-process.md` — comprehensive maintainer guide for Squad release workflow.

**Why:** Brady requested "absolutely up to date" documentation covering the full step-by-step release process. The guide needed to address:
1. Preview builds (dev → preview validation)
2. PR workflow (feature work, review, merge)
3. Merging back to dev (post-release sync)
4. Full release lifecycle (six phases from prep to verification)
5. Branch protection rules (what's blocked, what's allowed)
6. Guard testing (three test scenarios with exact reproduction steps)
7. Troubleshooting (SSH, .ai-team/ leaks, missing workflows)
8. Sample Copilot prompts (actionable examples for each step)

**Details:**

- **File location:** `docs/scenarios/release-process.md` (2,100 lines)
- **Branch model documented:** Three-branch system (dev/preview/main) with file filtering per branch
- **Guard workflow detailed:** `.github/workflows/squad-main-guard.yml` mechanics, forbidden paths, fix instructions
- **Guard testing:** Three explicit test procedures with exact commands to verify behavior
- **Release phases:** Six-phase lifecycle with concrete git commands and gh CLI patterns
- **Distribution model:** Confirmed npx GitHub-only distribution, .ai-team/ never shipped (three-layer protection: .gitignore + package.json files array + .npmignore)
- **CHANGELOG.md updated:** Added v0.4.0 entry (12 closed issues, 6 workflows, 11 new universes, MCP integration, notifications, branch guard)

**Architectural decisions embedded:**

1. Guard blocks ALL of `.ai-team/**` (zero exceptions) — team state is runtime-only
2. Guard blocks `team-docs/**` EXCEPT `team-docs/blog/**` — blog content is distribution-safe
3. Guard runs on `opened`, `synchronize`, `reopened` events (covers force-push edge case)
4. Forbidden paths validated via GitHub Script pagination (handles 100+ file PRs)
5. Guard failure message includes exact fix commands — actionable, not just "you're blocked"

**Maintainer workflow codified:**

- `dev` branch: all work, all files allowed
- Feature branches → PRs → `dev` (no guard)
- Release prep: update CHANGELOG.md, package.json version
- `preview` branch: reset from dev, remove forbidden files, wait for guard ✅
- Release PR to `main`: guard validates again, PR merge enforces check status
- Tag from `main` only: triggers release workflow
- Sync back to `dev`: merge main → sync PR → dev

**Guard testing procedures:**

1. Test .ai-team/ block: add fake file, create PR to main, guard blocks, remove file, guard passes
2. Test team-docs/internal block: add internal file, create PR to preview, guard blocks
3. Test team-docs/blog allow: add blog file, create PR to main, guard passes

All three scenarios include exact commands for reproduction and expected outcomes.


### 2026-02-13: CONTRIBUTING.md guide for branch model education

**By:** McManus

## Context

Brady identified a persistent problem: `.ai-team/` files and internal `team-docs/` files keep leaking into `main` and `preview` branches via contributor PRs. The guard workflow (`squad-main-guard.yml`) catches these violations at CI time, but the root cause is contributor knowledge — new contributors don't understand:

1. Why the branch model exists
2. Where to make changes (which branch)
3. What files are blocked and why
4. How to fix a blocked PR

A single error message from a failed guard check isn't enough education. Contributors need a **guide they read before opening their PR**, not a CI error they encounter after.

## Decision

Created `CONTRIBUTING.md` at repo root with:

1. **Getting Started** (fork, clone, install, test) — onboarding in 3 minutes
2. **Branch Model** (visual three-tier diagram + naming convention) — the centerpiece
3. **What's Protected** (unmissable, bolded, repeated, explained with rationale) — `.ai-team/` is runtime state, not product
4. **PR Process** (step-by-step: feature branch → commit → push → guard checks → fix if needed)
5. **File Matrix** (quick reference: what flows freely, what blocks)
6. **Guard Explanation** (transparent: how the workflow works, why it's helpful)
7. **Commit Conventions** (conventional commits: feat:, fix:, docs:, chore:)
8. **Code Style** (2-space indent, camelCase, minimal comments — mirror existing code)
9. **Labels Taxonomy** (brief overview: squad:*, type:*, priority:*, etc.)
10. **FAQ** (10 common questions: accident scenarios, force-add, direct main PRs, blocking, design disagreement)
11. **Summary** (5 bullet-point checklist for contributors)

## Strategy

**Make the `.ai-team/` rule unmissable:**
- Appears in **Getting Started** (prerequisites section, engine version)
- Appears in **Branch Model** (visual diagram with 🚫 emoji)
- Appears in **What's Protected** (entire dedicated section, bolded, repeated)
- Appears in **PR Process** (guard checks explanation)
- Appears in **FAQ** (two Q&A entries about it)
- Appears in **Summary** (bullet point #2)

**Tone throughout:** Friendly, direct, no hedging. Explain *why* (keep dev metadata off production), not just *what* (you can't commit it). Guard workflow is framed as a helper ("easy to fix if it blocks you"), not a blocker.

## Files Changed

- **`CONTRIBUTING.md`** — new file, ~500 lines
- **`docs/community.md`** — updated "How to Contribute" section with prominent link to CONTRIBUTING.md

## Rationale

- **Prevention > remediation.** Reading CONTRIBUTING.md before opening a PR prevents 80% of guard violations. The guard is backup, not first-line education.
- **Comprehensiveness.** Include getting started, branch model, branch names, file rules, guard explanation, commit conventions, code style, labels, and FAQ. Cover all questions a new contributor might have.
- **Repetition of the rule.** The `.ai-team/` rule appears 6+ times in different contexts (diagram, dedicated section, file matrix, PR process, FAQ, summary). Repetition isn't redundant — it's the point. A contributor who reads this guide will not accidentally leak team state.
- **Visual emphasis.** 🚫 emoji, bold text, tables, code examples, and a diagram all make the guard rules stand out.
- **Actionable guidance.** Every section that explains what you *can't* do also explains *how* to fix it (git rm --cached).
- **Brady's directive.** Brady said: "Contributors MUST understand the branch model and what files are blocked from main and preview. This keeps biting us." This guide is the solution.

## Integration

- CONTRIBUTING.md is referenced in `README.md` (could be added in next polish pass if desired)
- `docs/community.md` points to CONTRIBUTING.md in the "How to Contribute" section
- Guide is discoverable from GitHub's standard location (repo root) and from community page

## Future

- If guard violations continue, this guide can be extended with real scenario walkthroughs ("You committed team-docs/sprint-plan.md, here's how to remove it")
- Could link to GitHub's guide on branch protection best practices as reference material


### 2026-02-14: Copilot CLI agent manifest YAML frontmatter must use only supported properties

**By:** Fenster

**What:** The `version` field was removed from squad.agent.md's YAML frontmatter because it is not a supported property per the GitHub Copilot CLI agent manifest specification. Version tracking was moved to an HTML comment format.

**Why:** Unsupported YAML frontmatter properties (like `version`, `model`, `argument-hint`, `handoffs`) cause the Copilot CLI parser to display "error: too many arguments" above the textbox in the CLI. The parser interprets unsupported properties as command-line arguments, resulting in a persistent error message that degrades UX. The only supported properties for GitHub Copilot CLI agents are: `name`, `description`, `tools`, and `mcp-servers` (org/enterprise level only). Moving version to an HTML comment preserves version tracking without conflicting with the parser.

**Reference:** https://docs.github.com/en/copilot/reference/custom-agents-configuration

**Impact:** All custom agent manifests should validate their YAML frontmatter against the official specification. Version or other metadata that isn't supported should be tracked in HTML comments or the Markdown body, not in YAML.

### 2026-02-15: Sidebar Logo Sizing

**By:** Fenster

## Context

The 500×500px `squad-logo.png` was rendering at ~248px tall in the sidebar header because `.sidebar-logo-img` used `max-width:100%; height:auto` — it filled the full sidebar width minus padding.

## Decision

Changed `.sidebar-logo-img` from `max-width:100%; height:auto` to `height:40px; width:auto`.

- **40px height** sits well within the sidebar-header's vertical space (padding: 20px top + 12px bottom) and matches typical docs site header logos (36–48px range).
- **width:auto** preserves the logo's aspect ratio — the 500×500 square image will render at 40×40px.
- No markup changes were needed; the flex layout in `.sidebar-header` already handles alignment.

## Alternatives Considered

- `max-width:48px` — would also work but constraining height is more conventional for header logos since vertical space is the scarce dimension.
- Adding a `width` + `height` attribute on the `<img>` tag — avoided to keep sizing in CSS where it belongs.


### 2026-02-15: Docs build template extraction — inline to external files

**By:** Fenster
**What:** Extracted inline HTML template, CSS, and JS from `docs/build.js` into separate files at `docs/assets/template.html`, `docs/assets/style.css`, and `docs/assets/script.js`. Build reads these at startup and does placeholder replacement. CSS and JS are now linked externally in the HTML output.
**Why:** Inline string-building made the build script ~310 lines with CSS/JS/HTML interleaved. Extracting to real files means: (1) editors provide syntax highlighting and linting for CSS/JS/HTML, (2) designers can edit styling without touching Node.js, (3) images and other static assets can be added to `docs/assets/` naturally, (4) the template is visible and diffable as a standalone HTML file. The `docs/assets/` → `_site/assets/` copy was already in place, so CSS/JS deploy with zero extra logic.

### 2026-02-15: Rename .ai-team/ to .squad/
**By:** Brady (via Copilot)
**What:** The team state directory will be renamed from `.ai-team/` to `.squad/` starting in v0.5.0, with a backward-compatible migration path. Full legacy removal in v1.0.0.
**Why:** `.squad/` is branded, shorter, follows conventions like `.github/` and `.vscode/`, and eliminates ambiguity about which tool owns the directory.



