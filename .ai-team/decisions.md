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

### 2026-02-17: Insider Program — Binary Model (consolidated)
**By:** Keaton (Feb 17), Keaton + McManus (Feb 16 original design, superseded)

**Evolution:** Feb 16 proposed ring-based progression (Ring 0→1→Stable, 30 cap); Feb 17 Brady directive simplified to binary model (insider or release, no caps/tiers).

**What:** Insider Program launches in v0.5.0 with binary access model (insider or release) instead of ring-based progression. No capacity caps, no tiers, no progression mechanics. Recognition via CONTRIBUTORS.md badges, Discord #squad-insiders channel, release notes, blog posts. Access control: honor system + public insider list. Community engagement: seed recruitment (spboyer, londospark, miketsui3a, csharpfritz targets), GitHub Discussions application flow, exclusive access (preview branch, monthly AMA, quarterly retrospectives), onboarding welcome package, ongoing engagement (pre-release cadence, monthly check-ins, quarterly retros), anti-churn via alumni tier.

**Why:** Ring system solved a capacity problem (30 member limit) Squad doesn't have yet. At current scale (5-10 early contributors), binary "you're on nightly or you're on release" is simpler and removes coordination overhead for solo maintainer. Brady's directive prioritized simplicity over future-proofing.

**Implementation:**
- Installation: `npx github:bradygaster/squad#insider` (branch-based)
- State isolation: `.squad-insider/` directory prevents contamination
- Access control: Honor system + public list in CONTRIBUTORS.md
- Upgrade path: `squad upgrade` supports switching regular → insider
- Version ID: `v0.5.0-insider+{commit}` for bug reporting
- Recognition: [INSIDER] badge in CONTRIBUTORS.md, Discord channel, blog posts, release notes thank-yous
- Responsibilities: test within 48-72h, file detailed bugs, optional exit criteria validation (1-2 criteria/release, 2-4h commitment)

**What changed from Feb 16 design:**
- ❌ Ring 0 (5-10) → Ring 1 (15-25) → Stable progression
- ❌ Capacity cap (30 total)
- ❌ Formal entry pathways (invitation, application, auto-qualify) → Manual invitation based on contribution
- ❌ Governance structure (Lead + DevRel oversight)
- ❌ Alumni tier (still available conceptually via honor system)
- ✅ Keep: Branch-based install, state isolation, honor system, recognition (badge/Discord/blog), testing responsibilities

### 2026-02-16: Release cadence & testing automation
**By:** Kobayashi
**What:** Designed repeatable release cadence, pre-release testing process, and automation roadmap. Pre-1.0: milestone-driven with 4-6 week time caps (wave completion triggers release). Post-1.0: biweekly time-based (every 2 weeks on Fridays, milestone overflow to next release). Three-tier testing: patches (1-3 days, CI + smoke), minor releases (1 week beta, 6 exit criteria), breaking changes (2+ weeks beta, 7 exit criteria). Automation roadmap: Phase 1 (v0.5.0) pre-release tags + Discord webhooks + exit criteria template; Phase 2 (v0.6.0) migration smoke tests + multi-repo matrix + feedback bot; Phase 3 (v1.0.0) automated release notes + beta promotion + health dashboard. v0.5.0 beta as prototype: keep pre-release tags, exit criteria checklist, Discussions feedback; automate tag creation, Discord webhooks, checklist updates.
**Why:** v0.5.0 beta (manual, 5-10 users, 7 exit criteria) proves the manual process works but doesn't scale. Brady is solo maintainer. Fast patches need express lanes. Breaking changes need validation. System must handle both velocity (patches in 1-3 days) and safety (breaking changes validated for weeks).

### 2026-02-16: `.ai-team-templates/` Guard Protection — APPROVED
**By:** Kobayashi (Git & Release Engineer)  
**What:** Verified two changes to protect `.ai-team-templates/` runtime artifacts: (1) Removed from `.gitignore` (now tracked in git on dev branches), (2) Added to guard workflow (blocks `.ai-team-templates/**` from main/preview with same enforcement as `.ai-team/`). Three-layer defense intact: package.json files array (primary), .npmignore (secondary), guard workflow (tertiary).
**Why:** `.ai-team-templates/` is runtime artifact created by `index.js` during install (copies `templates/` → `.ai-team-templates/`). Should be visible in git for upgrade tracking but must never reach production branches. Changes implement correct enforcement.

### 2026-02-16: Branch protection on main
**By:** Kobayashi
**What:** Enabled comprehensive branch protection on `main` branch: required status checks (Squad Main Guard workflow strict mode), minimum 1 PR approval, stale review dismissal, conversation resolution required, no direct pushes, force push disabled, branch deletion disabled. Admin bypass available but policy encourages PR review.
**Why:** Main branch previously had no protection rules, allowing direct pushes and merges without review. Creates risk of untested or unreviewed code entering primary branch.

### 2026-02-16: Release Process Hardening — Guard and Gitignore Audit
**By:** Kobayashi
**What:** Three findings from preview branch audit: (1) Preview branch verified CLEAN (zero .ai-team/ files, zero team-docs/ files), (2) Guard workflow incomplete (triggers on `pull_request` only, missing `push` trigger means direct pushes bypass validation), (3) `.gitignore` entry for `.ai-team-templates/` incorrect (blocks dogfooding artifacts, tells users to ignore Squad-owned files that should be committed). Recommended fixes: add push trigger to guard workflow, remove `.ai-team-templates/` from .gitignore.
**Why:** Guard is defense-in-depth (package.json "files" is primary gate), but direct pushes create incident risk. The `.gitignore` entry serves no purpose — Squad's templates are already tracked in `templates/`.

### 2026-02-16: Guard workflow push trigger added
**By:** Kobayashi
**What:** Added `push` trigger to `.github/workflows/squad-main-guard.yml` to catch direct pushes to main and preview branches, not just PRs. Updated error message to mention `.ai-team-templates/` alongside `.ai-team/` and `team-docs/` as forbidden paths.
**Why:** The guard's validation logic already handles both `pull_request` and `push` events, but the workflow trigger was incomplete. Without the push trigger, a maintainer could accidentally `git push origin main` with forbidden files and the guard would not run.

### 2026-02-16: Pre-release checklist formalized
**By:** Kobayashi
**What:** Added README "What's New" section check to pre-release validation. Formalized 9-item release checklist: CHANGELOG updated, package.json version, README "What's New" section, branch protection enabled, guard workflow passing, dev/preview/main branch hygiene, tests passing, distribution safety verified (package.json files array + .npmignore).
**Why:** v0.4.1 shipped without README update highlighting new features (role emoji, squad upgrade --self, deprecation banner). Users reading README had no visibility into what changed. Release checklist prevents these gaps.

### 2026-02-16: v0.4.1 release contamination and recovery
**By:** Kobayashi
**What:** v0.4.1 tag was created with 129+ forbidden files (.ai-team/, .ai-team-templates/, team-docs/). Deleted release+tag, cleaned main branch (146 files removed), re-tagged from clean main. 6-minute contamination window (21:40-21:46 UTC) where `npx github:bradygaster/squad@v0.4.1` delivered contaminated state. Recovery: Release deleted, tags deleted locally+remotely, main verified clean, new v0.4.1 tag created from clean commit, release recreated, distribution tested.
**Why:** Guard workflows are detective (post-commit), not preventive. Direct push to main bypassed the intended preview→main PR flow. Branch protection rules are mandatory to enforce PR reviews and prevent contamination.

### 2026-02-16: Insider-specific installation flow
**By:** Kobayashi
**What:** Branch-based installation via `npx github:bradygaster/squad#insider` with isolated state directory (`.squad-insider/`) and version identification (`v0.5.0-insider+{commit}`). Honor-system access control with public insider list in CONTRIBUTORS.md.
**Why:** Brady requested insiders have a DIFFERENT installation mechanism than public pre-releases. Standard beta tags (`v0.5.0-beta.1`) are version-pinned and stable; insiders need continuous access to bleeding-edge builds. Branch-based distribution is the npx-native solution that makes insiders feel special while staying simple for a solo maintainer.

---

## Recommendation: Branch-Based Insider Access

### 1. Branch Strategy

**Use an `insider` branch for continuous insider builds.**

- `insider` branch tracks bleeding-edge changes as they land on `dev`
- Separate from `dev` (which may have broken WIP) and `preview` (which is release prep)
- Periodically synced from `dev` when changes are ready for insider testing (manual push by Brady or automated workflow)
- When a build graduates to public beta, tag it from `insider` → `v0.5.0-beta.1`

**Branch flow:**
```
dev → insider (continuous) → v0.5.0-beta.1 (tag) → main (release)
```

**Why not tags?**
- `v0.5.0-insider.1`, `v0.5.0-insider.2`, etc. require Brady to cut a new tag for every insider build
- Insiders would have to **pin to specific tags** (`#v0.5.0-insider.3`), which defeats the "always latest" goal
- Branch-based: insiders re-run `npx` and automatically get latest build on `insider` branch

**Why not a separate repo?**
- Too heavy — private fork requires separate GitHub repo, separate issues, separate CI
- Doubles Brady's maintenance burden
- Breaks the dogfooding story (Squad Squad would need TWO repos)

---

### 2. Installation Command

**Insiders install via:**
```bash
npx github:bradygaster/squad#insider
```

**Public users install via:**
```bash
npx github:bradygaster/squad
```
(pulls from `main`)

**Public beta testers install via:**
```bash
npx github:bradygaster/squad#v0.5.0-beta.1
```
(version-pinned for stability)

**Distinction is clear:**
- `#insider` = bleeding edge, continuous updates, you're testing IN PRODUCTION
- `#v0.5.0-beta.1` = stable snapshot, version-pinned, public pre-release
- No tag = stable release from `main`

---

### 3. Access Control

**Honor system + public insider list.**

GitHub repo is public, so technical enforcement is impossible without a private fork. Instead:
- Document insider status as **"testing in production — not for general use"**
- Add `[INSIDER]` badge next to names in `CONTRIBUTORS.md`
- Insider agreement: "You're testing unstable builds. Don't share the install command with non-insiders."
- If insiders share the command, the worst that happens is more testers (acceptable risk)

**No technical gate because:**
- Branch protection can't restrict read access on a public repo
- GitHub Teams would require making the repo private (breaks dogfooding story)
- OAuth apps/tokens add infrastructure Brady doesn't want to maintain

**Why this works:**
- Insider status is a **privilege, not a secret**
- Insiders want to test early and provide feedback — sharing the command doesn't benefit them
- If it becomes a problem, Brady can move `insider` branch to a private fork later (reversible)

---

### 4. Version Identification

**Insiders see a distinct version string:**

```bash
$ npx github:bradygaster/squad#insider --version
Squad v0.5.0-insider+abc1234 (built 2026-02-16 14:32 UTC)
⚠️  INSIDER BUILD — NOT FOR PRODUCTION
```

**Format:** `v{NEXT_VERSION}-insider+{COMMIT_SHA}`

**Implementation:**
- `index.js` reads git ref at install time: `git rev-parse --short HEAD`
- Stamps `squad.agent.md` frontmatter with: `version: "0.5.0-insider+abc1234"`
- Adds build timestamp to version display
- Adds warning banner to `--version` output

**Why `+{COMMIT_SHA}`?**
- Insiders can report bugs with exact commit: "v0.5.0-insider+abc1234 breaks on Windows"
- Brady can bisect issues: "This worked at `+abc1234` but broke at `+def5678`"
- Makes version distinct from public builds (no confusion with `v0.5.0` or `v0.5.0-beta.1`)

---

### 5. Update Flow

**Insiders update by re-running the install command:**
```bash
npx github:bradygaster/squad#insider
```

**npx behavior:**
- Downloads latest commit from `insider` branch
- Runs `index.js` from that commit
- Overwrites Squad-owned files (`.github/agents/squad.agent.md`, `templates/`)
- Preserves user state (`.squad-insider/` or `.squad/`)

**Notification:**
- When Brady pushes a new insider build, post in GitHub Discussions: "Insider build `+abc1234` is live"
- Insiders can opt in to watch the repo for updates
- No auto-update (risky for testing — insiders should consciously update)

**Cadence:**
- No fixed schedule — Brady pushes to `insider` when a batch of changes is ready
- Could be daily, could be weekly, depends on dev velocity
- Insiders check Discussions or re-run `npx` whenever they want the latest

---

### 6. Transition to Public Beta

**When an insider build is stable enough for public beta:**

1. Brady tags the insider build:
   ```bash
   git checkout insider
   git tag v0.5.0-beta.1
   git push origin v0.5.0-beta.1
   ```

2. Announcement in GitHub Discussions:
   > **Insider build `+abc1234` is now public beta v0.5.0-beta.1.**
   >
   > If you're an insider, you can:
   > - Stay on `#insider` branch (bleeding edge, continuous updates)
   > - Switch to `#v0.5.0-beta.1` (stable snapshot, no surprises)
   >
   > Public testers: Install with `npx github:bradygaster/squad#v0.5.0-beta.1`

3. Insiders decide:
   - **Stay on `insider`:** Keep getting latest changes (most will do this)
   - **Pin to beta tag:** Test the exact build that public beta users see

**Key insight:** Insiders aren't PROMOTED to beta users — they're a **parallel track** that keeps testing beyond what public beta users see.

---

### 7. Safety Mechanisms

**Separate state directory:**

Insider builds use `.squad-insider/` instead of `.squad/`:

```
.squad/          ← stable releases (0.4.1, 0.5.0, etc.)
.squad-insider/  ← insider builds (continuous, may break)
```

**Why separate state?**
- Prevents insider builds from corrupting production state
- Insiders can run BOTH stable and insider builds on the same repo
- Rollback is trivial: delete `.squad-insider/`, reinstall from `main`

**Implementation:**
- `index.js` detects insider build via `git symbolic-ref --short HEAD` → `insider`
- Uses `.squad-insider/` instead of `.squad/` for all team state
- Coordinator reads from `.squad-insider/team.md` when running from insider build

**Warning banner:**
- Every `--version` call shows: `⚠️ INSIDER BUILD — NOT FOR PRODUCTION`
- Coordinator first response includes: `[Running insider build +abc1234]`
- README.md for insider branch warns: "You're testing in production. Expect breakage."

**Backup strategy:**
- Before installing insider build, `index.js` creates `.squad-insider-backup-{timestamp}/`
- If something catastrophic happens, user can restore from backup
- Backup is automatic, user doesn't have to remember

**Rollback flow:**
1. User hits a critical bug on insider build
2. Uninstall insider: remove `.squad-insider/`
3. Reinstall stable: `npx github:bradygaster/squad` (pulls from `main`)
4. Report bug in Discussions with commit SHA from `squad --version`

---

## Summary Table

| Aspect | Public Users | Public Beta | Insiders |
|--------|-------------|-------------|----------|
| **Install command** | `npx github:bradygaster/squad` | `npx github:bradygaster/squad#v0.5.0-beta.1` | `npx github:bradygaster/squad#insider` |
| **Source** | `main` branch (tagged release) | Tag (stable snapshot) | `insider` branch (continuous) |
| **Version string** | `v0.5.0` | `v0.5.0-beta.1` | `v0.5.0-insider+abc1234` |
| **State directory** | `.squad/` | `.squad/` | `.squad-insider/` |
| **Update frequency** | Stable releases (weeks/months) | Beta cycles (weeks) | Continuous (days) |
| **Access control** | Public | Public | Honor system + docs |
| **Risk level** | Low (stable) | Medium (pre-release) | High (bleeding edge) |
| **Purpose** | Production use | Public testing | Early feedback |

---

## Implementation Checklist

### Phase 1: Branch Setup (15 minutes)
- [ ] Create `insider` branch from current `dev`
- [ ] Add branch protection rules (Brady-only push, no direct commits)
- [ ] Update `insider` branch README with warning banner
- [ ] Add insider install command to README

### Phase 2: Version Stamping (1 hour, Fenster)
- [ ] Modify `index.js` to detect `insider` branch at install time
- [ ] Read commit SHA via `git rev-parse --short HEAD`
- [ ] Stamp `squad.agent.md` with `version: "X.Y.Z-insider+{sha}"`
- [ ] Add build timestamp to version metadata
- [ ] Add `--version` flag handler with warning banner

### Phase 3: State Isolation (1.5 hours, Fenster)
- [ ] Modify `index.js` to use `.squad-insider/` on insider builds
- [ ] Update coordinator to read from `.squad-insider/team.md`
- [ ] Create automatic backup on insider install
- [ ] Test: install stable, install insider, verify both work in parallel

### Phase 4: Documentation (1 hour, McManus)
- [ ] Add "Insider Program" section to README.md
- [ ] Document install command, update flow, rollback process
- [ ] Add insider badge convention to CONTRIBUTORS.md
- [ ] Create GitHub Discussions template for insider announcements

### Phase 5: First Insider Build (30 minutes, Brady)
- [ ] Sync `dev` → `insider` (first time)
- [ ] Post announcement in Discussions: "Insider program is live"
- [ ] Invite first batch of insiders (existing contributors)
- [ ] Test: install insider build, verify version string, run basic commands

---

## Open Questions for Brady

1. **Sync frequency:** Should `dev` → `insider` sync be manual (Brady pushes when ready) or automated (GitHub Action on every `dev` push)?
   - **Recommendation:** Manual. Brady controls when builds are "insider-ready."

2. **Insider list visibility:** Should `CONTRIBUTORS.md` show `[INSIDER]` badge, or should insider status be private?
   - **Recommendation:** Public. Makes insider status a visible privilege, no secrets to keep.

3. **Beta graduation criteria:** What makes an insider build "ready" for public beta?
   - **Recommendation:** Time-based (e.g., 1 week on `insider` with no critical bugs) or feature-based (all milestone work complete).

4. **State directory naming:** Is `.squad-insider/` the right name, or prefer `.ai-team-insider/`?
   - **Recommendation:** `.squad-insider/`. Aligns with Squad branding, shorter to type.

5. **First insiders:** Who gets invited first? All current contributors, or selective invite?
   - Brady already answered: Yes, invite contributors retroactively.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Insider build breaks prod** | Medium | High | Separate state directory (`.squad-insider/`), backup on install |
| **Insiders share install command** | Medium | Low | Honor system + docs, acceptable if more testers join |
| **Version confusion** | Low | Medium | Distinct version string (`+commit`), warning banner |
| **Brady overwhelmed by feedback** | Medium | Medium | Set expectations: "Not all feedback will be acted on immediately" |
| **Insider builds diverge from beta** | Low | Low | Tag from `insider` when graduating to beta (same source) |
| **npx caching issues** | Low | Medium | Document: `npx --yes github:bradygaster/squad#insider` (force fresh) |

---

## Why This Design Wins

1. **Zero new infrastructure:** Uses existing GitHub branches, npx distribution, git refs. No servers, no auth, no databases.

2. **Simple for Brady:** Push to `insider` branch when ready. No tag management for every build. Insiders auto-get latest.

3. **Feels special:** 
   - Different install command (`#insider`)
   - Different version string (`-insider+commit`)
   - Different state directory (`.squad-insider/`)
   - Public badge in CONTRIBUTORS.md

4. **Safe by default:** 
   - Separate state prevents corruption
   - Automatic backups on install
   - Warning banners everywhere
   - Easy rollback (delete `.squad-insider/`, reinstall stable)

5. **Scales to future needs:**
   - If insider program grows, can add automated sync or private fork
   - If access control needed, can switch to GitHub Teams + private repo
   - If cadence needed, can add automated `dev` → `insider` workflow

6. **Aligns with Squad's architecture:**
   - Filesystem-authoritative (state in `.squad-insider/`)
   - Git-native (branch-based distribution)
   - Zero-dependency (no new npm packages)
   - npx-from-GitHub (existing install mechanism)

---

## Alternatives Considered (and rejected)

### Alternative A: Pre-release tags with naming convention
**Approach:** `v0.5.0-insider.1`, `v0.5.0-insider.2`, etc.

**Why rejected:**
- Requires Brady to cut a new tag for every insider build (manual overhead)
- Insiders must pin to specific tags (`#v0.5.0-insider.3`), not "always latest"
- Tag proliferation (insider builds are frequent, public betas are not)
- Feels too similar to beta tags (same mechanism, just different name)

### Alternative B: Private fork with insider-only access
**Approach:** `bradygaster/squad-insider` repo, invite collaborators

**Why rejected:**
- Doubles Brady's maintenance (two repos, two CI pipelines, two issue trackers)
- Breaks dogfooding story (Squad Squad would live in private repo)
- Insider feedback wouldn't be visible to community (closed development)
- Heavy infrastructure for a solo maintainer

### Alternative C: npm pre-release channel
**Approach:** Publish `@bradygaster/squad-insider` to npm

**Why rejected:**
- Brady explicitly rejected npm distribution (Decision 2026-02-09)
- Requires npm account, publish workflow, package management
- Doesn't align with GitHub-only distribution model

### Alternative D: Discord-gated access
**Approach:** Private Discord channel, share install command there

**Why rejected:**
- Brady chose GitHub Discussions as primary communication (answered question #1)
- Discord requires separate platform, moderation, invite management
- Doesn't solve the technical access problem (public repo = anyone can install)

---

## Next Steps

1. **Brady approves this design** (or requests changes)
2. **Fenster implements Phase 2-3** (version stamping, state isolation)
3. **McManus implements Phase 4** (documentation)
4. **Brady implements Phase 1 + 5** (branch setup, first build)
5. **Test with 2-3 initial insiders** (smoke test before broad invite)
6. **Public announcement** in GitHub Discussions
7. **Invite all current contributors** (retroactive insider access)

### 2026-02-16: v0.5.0 scope update — Issue #88 resolved by community
**By:** Squad (Coordinator)
**What:** Issue #88 (Discord docs outdated) resolved via PR #89 by @digitaldrummerj. Removed from v0.6.0 deferred list. Two enhancements now ship with v0.5.0: PR #80 (llms.txt support) and PR #89 (MCP Discord docs fix).
**Why:** Community contributions closed a deferred issue and enhanced docs discoverability. Both are low-risk, already merged and tested - safe to include in v0.5.0 release notes.


### 2026-02-16: Blog progress as we make it, not just at ship
**By:** Brady Gaster (via Squad)
**What:** Keep blogging throughout v0.5.0 development - don't wait until release day. Share progress, decisions, and milestones as they happen.
**Why:** User directive - blogging is a communication channel, not just a release ritual. Keeps community engaged during the 4-week timeline, builds anticipation, and documents the journey.

### 2026-02-16: Architectural Analysis — Issues #86 and #87 for v0.5.0

**Author:** Keaton (Lead)  
**Date:** 2026-02-16  
**Context:** Brady requested architectural evaluation of #86 and #87 for potential v0.5.0 inclusion  
**Status:** Complete — recommendations documented below

---

## Issue #86: Squad Undid Uncommitted Changes

**Reporter:** @tlmii (Tim Mulholland)  
**Date:** 2026-02-16  
**Current Status:** Already in v0.5.0 as "HIGH SEVERITY - Week 1 investigation required"

### Scenario

Two back-to-back prompts in same CLI session:
1. Frontend work completed (uncommitted)
2. More UI changes requested → Agent encountered issues → Executed `git checkout` to undo its own work → **Also discarded previous uncommitted work from step 1**

User notes: Squad eventually recovered (referenced prior work from context, added memories/instructions about committing), but the data loss moment is trust-destroying.

### Root Cause Analysis

**NOT migration-related.** The `.ai-team/` → `.squad/` rename has zero connection to git operations. This is a **prompt engineering failure** in git discipline.

**Primary cause:** Agents lack explicit instructions about uncommitted work preservation. When deciding to "undo work," agents reach for `git checkout` without checking for other uncommitted changes in the working tree.

**Secondary cause:** No handoff protocol for uncommitted state. When Agent B spawns after Agent A, Agent B has no visibility into "Agent A left uncommitted changes" — it only sees git state (HEAD commit). The working tree state is invisible to the next agent.

**Tertiary cause:** Coordinator doesn't detect uncommitted work at spawn boundaries. If the coordinator knew uncommitted changes existed from a previous session, it could warn the next agent or enforce a commit/stash before proceeding.

### Architectural Classification

**This is a prompt engineering issue, not a coordinator architecture flaw.**

The coordinator's job is orchestration — routing work, managing agent lifecycles, collecting results. Git state management is agent-level responsibility. But agents need better instructions:

1. **Pre-checkout safety:** "Before running `git checkout`, run `git status --porcelain`. If output is non-empty, ABORT and ask user to commit or stash first."
2. **Working tree awareness:** "Check for uncommitted changes before ANY destructive git operation (checkout, reset, clean)."
3. **Commit discipline:** "After completing work that modifies files, commit the changes before ending your turn."

### Does It Block v0.5.0?

**YES, conditionally.**

This is trust-destroying. If Squad can silently discard hours of work, users won't trust it regardless of what directory it lives in. The issue shows Squad recovered, but that's treating the symptom — not the root cause.

**However:** This bug exists in v0.4.1 right now. The v0.5.0 migration doesn't introduce it or make it worse. The question: Do we hold v0.5.0 to fix a pre-existing bug, or ship v0.5.0 and patch it in v0.5.1?

**My call:** Investigate in Week 1 (already planned). If the fix is **prompt-only** (add git discipline instructions to `squad.agent.md`), bundle it into v0.5.0 — we're already touching that file for #69 and #76. If it requires **new tooling or complex coordinator changes**, ship as v0.5.1 patch.

The blocker is: **Don't ship v0.5.0 if we can't prove the fix works.** Test it across 3-4 real "agent hits error, tries to undo" scenarios before releasing.

### Effort Estimate

**Investigation (Week 1):** 4-6 hours (Fenster + Hockney)
- Reproduce the exact scenario from #86
- Identify where `git checkout` instruction originates (spawn template? agent instinct?)
- Check if coordinator has uncommitted work detection at spawn boundaries
- Check if agents have `git status` awareness in prompts

**Fix (if prompt-only):** 2-4 hours (Verbal)
- Add git discipline section to `squad.agent.md` and spawn templates
- Add pre-checkout safety check: "Run `git status --porcelain` first, abort if non-empty"
- Add coordinator logic: detect uncommitted work before spawning next agent, warn in context
- Test across failure scenarios: agent errors mid-work, agent tries to undo, multiple agents in sequence

**Fix (if complex):** 8-12 hours (Fenster + Verbal)
- New coordinator logic to snapshot uncommitted state before spawns
- Agent handoff protocol with explicit git state awareness
- Working tree preservation mechanism (auto-stash? commit to temp branch?)
- Extensive testing across multi-agent workflows

### Recommendation

**Scope:** v0.5.0 if prompt-only fix, v0.5.1 if complex tooling required  
**Action:** Week 1 investigation (already in v0.5.0 plan)  
**Blocker status:** Conditionally YES — don't ship v0.5.0 until fix is validated  
**Owner:** Fenster (investigation + complex fix if needed), Verbal (prompt fix)  
**Timeline dependency:** If prompt-only, adds ~6 hours to v0.5.0 (tolerable). If complex, defer to v0.5.1.

---

## Issue #87: Workflows Assume Project Type

**Reporter:** @tlmii (Tim Mulholland)  
**Date:** 2026-02-16  
**Current Status:** Deferred to v0.6.0 in Issue #91

### Scenario

Added Squad to existing non-npm codebase (no `package.json` in root) → `squad init` generated workflows (`squad-release.yml`, `squad-ci.yml`, etc.) that assume npm package structure → Workflows don't work for user's project.

User notes: Didn't investigate whether workflows are AI-generated or static templates, but "feels like it could be tweaked."

### Root Cause Analysis

**This is a template generation problem, not core architecture.**

**Where workflows come from:**
1. `squad init` runs `index.js`
2. `index.js` copies files from `templates/workflows/` to `.github/workflows/`
3. Templates assume npm structure: `package.json` version field, `npm test` command, `npm publish` behavior

**Why this happens:**
Squad was built FOR Squad (npm package, Node.js project). The templates reflect that origin story. When applied to non-npm projects (Python, .NET, Java, Ruby, Go), they make incorrect assumptions.

**The architectural gap:**
Squad doesn't detect project type before generating workflows. It applies npm templates unconditionally. This is fine for npm projects, broken for everything else.

### Architectural Classification

**NOT architectural, but reveals an architectural gap.**

The core Squad architecture (coordinator, agents, memory, casting) is language-agnostic. The prompt engineering works for any codebase. The templates are where the npm assumption lives.

**Two paths forward:**

**Path A (Template multi-project support):**
- Detect project type during init (`package.json`? `pyproject.toml`? `pom.xml`? `.csproj`?)
- Generate appropriate workflow templates per project type
- Maintain multiple template sets (npm, Python, .NET, Java, Go, generic fallback)
- Effort: 8-12 hours implementation + 4-6 hours testing

**Path B (Remove problematic templates entirely):**
- Don't generate release/CI workflows during `squad init`
- Teach coordinator to generate workflows on-demand when user explicitly requests
- This avoids the "wrong template" problem entirely
- Effort: 2-4 hours cleanup + documentation

### Is It Architectural?

**No. This doesn't affect Squad's core assumptions about how agents work.**

Squad's architecture is:
- Memory lives in `.squad/` (soon)
- Agents read/write to `.squad/` via filesystem
- Coordinator orchestrates via `task` tool spawns
- State is git-tracked, portable, human-readable

None of those depend on npm or any particular project type. The workflows are **optional infrastructure the installer adds** — not foundational to how Squad operates.

### Would Fixing It Benefit v0.5.0 Users?

**YES, but not critically.**

**For existing users running `squad upgrade`:** They already have workflows in place from v0.4.x. The upgrade doesn't touch workflows. No benefit.

**For new users running `squad init` on v0.5.0:** They'll hit the same problem #87 reports — but that's already the case in v0.4.1. This isn't a v0.5.0 regression.

**For v0.5.0 beta testers:** If any beta repos are non-npm projects, they'll encounter this issue and report it. That's **noise during beta when we need signal on migration safety**. Fixing it in v0.5.0 means cleaner beta feedback.

**Benefit of fixing:** Cleaner beta, one less "Squad broke my repo" complaint  
**Cost of fixing:** Adds 14-20 hours + testing across multiple project types to an already large release

### Does It Conflict with v0.5.0 Work?

**NO, but tangent.**

The v0.5.0 path rewrites are `.ai-team/` → `.squad/` in source files. The workflows issue is npm assumptions in templates. They're orthogonal.

**HOWEVER:** If we're already touching all workflow templates for v0.5.0 (to update paths from `.ai-team/` to `.squad/`), adding project type detection is marginally easier than doing it in a separate release. Touch once, not twice.

**But:** That's a weak argument. The templates don't reference `.ai-team/` or `.squad/` — they reference the product workflows (CI, release). The overlap is minimal.

### Should It Be Pulled Into v0.5.0?

**My recommendation: NO. Keep it deferred to v0.6.0.**

**Rationale:**

**1. Scope protection is paramount.**  
v0.5.0 is already 242 squad-hours (30 calendar days):
- #69: 745 occurrences across 123 files (80h)
- #76: Refactor `squad.agent.md` to stay under 30K GitHub Enterprise limit (24h)
- #86: Data loss investigation + fix (6-12h depending on fix complexity)
- #71, #84, #62: Cleanup and hardening (58h total)

Adding project type detection + conditional templates is another **14-20 hours** PLUS testing across 5+ project types (npm, Python, .NET, Java, Go). That's a **6-8% timeline increase** for a polish feature.

**2. Risk profiles don't match.**  
v0.5.0's existential risk: **state corruption during migration** (catastrophic — users lose casting, history, decisions).  
#87's risk: **workflows don't work for my project type** (annoying but not data-destroying, user can delete 3 files).

Bundling them asks beta testers to validate TWO unrelated things simultaneously. That splits focus.

**3. User workaround exists.**  
Users can delete problematic workflows (`rm .github/workflows/squad-*.yml`). It's 3 files, takes 10 seconds. Not ideal UX, but tolerable.  
No workaround exists for corrupted `.squad/` migration.

**4. Beta signal clarity.**  
v0.5.0 beta must answer ONE question: **Is migration safe?**  
If we bundle #87 fixes, we're asking: **Is migration safe AND does project type detection work across npm/Python/.NET/Java/Go?**

That requires recruiting beta testers across multiple ecosystems. An npm-only beta cohort can't validate Python template generation. Assembling a multi-language cohort takes longer.

**5. Post-v0.5.0 is the natural timing.**  
After the directory rename ships (last breaking change before v1.0), v0.6.0 becomes the polish release. Project type detection + conditional templates is **classic v0.x polish**. It doesn't block v1.0 — it just needs to ship eventually.

Keeping v0.5.0 laser-focused on migration safety gives us the best chance of hitting the March 16 ship date with high confidence.

### Effort Estimate (If Pulled Into v0.5.0)

**Investigation:** 2 hours (Kujan)
- Catalog all templates with npm assumptions (workflows, configs)
- Research project type detection (file markers, heuristics)
- Map project types to appropriate template sets

**Implementation:** 8-12 hours (Fenster)
- Add project type detection to `index.js` (check for `package.json`, `pyproject.toml`, `*.csproj`, `pom.xml`, `go.mod`, etc.)
- Create template variants: npm, Python, .NET, Java, Go, generic fallback
- Update init logic to select templates based on detected type
- Update upgrade logic to respect existing workflows (don't overwrite custom workflows)

**Testing:** 4-6 hours (Hockney)
- Test init across 5 project types (npm, Python, .NET, Java, Go)
- Test upgrade when workflows already exist (should be no-op)
- Test "no workflows" path (user previously deleted them, upgrade respects that)
- Validate each template set's assumptions (Python runs pytest? .NET runs dotnet test?)

**Documentation:** 2 hours (McManus)
- Update init docs to explain project type detection
- Document what file markers trigger which templates
- Add troubleshooting for "wrong template detected"

**Total:** 16-22 hours

**Risk:** Testing surface area more than doubles. We'd need beta testers for npm, Python, .NET, Java, and Go repos to validate all template variants. That's **significantly harder to recruit** than just "test migration on any repo."

### Recommendation

**Scope:** Stay deferred to v0.6.0  
**Action:** None for v0.5.0  
**Blocker status:** NO — this is polish, not a show-stopper  
**Owner (for v0.6.0):** Fenster (implementation), Kujan (project type detection strategy)

**If Brady insists on pulling it into v0.5.0:**
- Add **2 weeks** to timeline (March 16 → March 30)
- Add "project type detection works across 5 languages" as **8th exit criterion** for beta
- Recruit beta testers across npm, Python, .NET, Java, Go ecosystems (harder cohort to assemble)
- Accept that v0.5.0 becomes **"migration + project type polish"** instead of laser-focused on migration safety
- Acknowledge the **risk of diluted beta feedback** (testers report template issues instead of migration issues)

I don't recommend this path. The timeline pressure, scope creep, and beta complexity aren't worth it for a polish feature that can ship in v0.6.0 without consequence.

---

## Summary Recommendations

| Issue | Include in v0.5.0? | Rationale | Effort | Owner |
|-------|-------------------|-----------|--------|-------|
| **#86** | ✅ **YES (conditionally)** | Trust-destroying data loss bug. Already planned for Week 1 investigation. Fix in v0.5.0 if prompt-only (2-4h), defer to v0.5.1 if complex (8-12h). | 6-12h | Fenster + Verbal |
| **#87** | ❌ **NO** | Polish feature, not a blocker. Scope protection more important. Natural fit for v0.6.0. User workaround exists (delete 3 files). | 16-22h | Defer to v0.6.0 |

### Issue #86: Confirm Existing Plan, Clarify Approach

**Action:** The v0.5.0 plan already includes #86 as "HIGH SEVERITY - Week 1 investigation." This analysis confirms that's correct. Clarifications:

1. **Investigation scope:** Reproduce scenario, identify git checkout origin, check coordinator uncommitted state detection, check agent git status awareness
2. **Fix strategy:** Prompt-only if possible (add git discipline to templates, pre-checkout safety checks). Complex tooling only if prompt fix insufficient.
3. **Blocker definition:** Don't ship v0.5.0 until fix is validated across 3-4 "agent errors and tries to undo" test scenarios
4. **Fallback:** If fix requires >12 hours or introduces new complexity, defer to v0.5.1 patch

**No scope change needed for Issue #91.**

### Issue #87: Stay Deferred, Document Reasoning

**Action:** Keep #87 deferred to v0.6.0. Update Issue #91 with architectural justification:

1. **Not architectural** — template generation issue, doesn't affect core Squad operation
2. **User workaround exists** — delete 3 workflow files
3. **Scope protection paramount** — v0.5.0 is 242 hours, adding 16-22h is 6-8% timeline increase
4. **Risk profiles mismatch** — v0.5.0 risk is state corruption (catastrophic), #87 risk is "wrong template" (annoying)
5. **Beta complexity** — would require multi-language cohort (npm, Python, .NET, Java, Go)
6. **Natural v0.6.0 fit** — polish release after last breaking change

**Scope change for Issue #91:** None. Reaffirm deferral with architectural reasoning.

---

## Next Steps

1. ✅ Document this analysis in `.ai-team/decisions/inbox/` (this file)
2. ⬜ Post summary comment to Issue #91 explaining:
   - #86: Already in scope, confirm HIGH SEVERITY, clarify prompt-first approach
   - #87: Stay deferred, architectural analysis shows it's polish not blocker
3. ⬜ Fenster + Hockney: Begin Week 1 investigation of #86 per existing plan
4. ⬜ If #86 fix is prompt-only, Verbal implements git discipline instructions in `squad.agent.md`

---

**Signed:** Keaton (Lead)  
**Date:** 2026-02-16



### 2026-02-18: Nightly/Insider Program ships FIRST in v0.5.0
**By:** bradygaster (via Copilot)
**What:** Insider Program (nightly builds) must be the FIRST deliverable in v0.5.0, not bundled into Week 3-4. Team needs ability to test incrementally as other features land.
**Why:** Enables continuous validation throughout the sprint. Contributors can test #69, #76, #86 fixes as they merge to dev, rather than waiting until Week 3 for a beta build.

**Impact on v0.5.0 timeline:**
- **NEW Week 1 priority:** Insider Program setup (was bundled into "blogging" before)
  - Set up `insider` branch (auto-publishes to npm with `insider` dist-tag)
  - Document install: `npx github:bradygaster/squad#insider`
  - CI/CD automation for nightly publishes
  - Recognition artifacts (CONTRIBUTORS.md badge, Discord channel access)
- **#86 investigation stays in Week 1** (HIGH SEVERITY, don't defer)
- **#69, #76 shift to Week 2+** (implementation follows Insider Program launch)

**Rationale:** Testing infrastructure before features means every PR after Week 1 gets real-world validation from insiders.

### 2026-02-18: Single .squad/ folder — no separate templates directory
**By:** bradygaster (via Copilot)
**What:** Everything Squad-related goes inside `.squad/` directory. No separate `.squad-templates/` or similar split. Current `.ai-team-templates/` should become `.squad/templates/` (nested inside .squad/).
**Why:** Simplicity — one folder to find, one folder to .gitignore, one folder to understand. Reduces user confusion about where Squad state lives.

**Impact on Issue #69:**
- Scope increases: Both `.ai-team/` → `.squad/` AND `.ai-team-templates/` → `.squad/templates/`
- Reference count increases from 1,572 to ~1,672 (adds ~100 template references)
- Migration logic must handle nested directory structure
- Fenster's 3-PR plan still valid, adds ~2h to PR #2 (documentation updates)

# Issue #69 Audit: `.ai-team/` → `.squad/` Migration (Week 1)

**Agent:** Fenster (Backend Dev)  
**Date:** 2026-02-18  
**Phase:** Audit + Architecture (Week 1 of 2-week cycle)  
**Context:** Breaking rename shipping in v0.5.0 with backward compat until v1.0.0

---

## Executive Summary

**Actual Reference Count:** **1,572 occurrences** (not 745)

- Verified via PowerShell full-repo scan (excluding node_modules)
- Original estimate was likely based on partial scan or specific file types only

**Implementation Approach:** **3 atomic PRs** (5-8 hours each)

**Risk Level:** **Medium** — One-command migration mitigates user impact, but internal coordination cost is high

---

## 1. Reference Count Verification

### Total Occurrences by File Type

| File Type | Count | Notes |
|-----------|-------|-------|
| **Markdown** | ~850+ | Includes: squad.agent.md (247 refs), docs/, .ai-team/**, CHANGELOG.md, README.md, CONTRIBUTING.md |
| **JavaScript** | 52 | All in index.js (CLI implementation) + test files |
| **YAML Workflows** | 54 | .github/workflows/** + templates/workflows/** |
| **JSON** | 0 | No direct references in .json files |
| **HTML** | 0 | No direct references in _site/** |
| **Templates** | ~50+ | templates/**, .ai-team-templates/** (mostly .md format guides) |
| **Git Config** | 6 | .gitattributes (4), .gitignore (1), .npmignore (1) |

**Total:** 1,572 occurrences across ~180 files

### Additional Findings

**`.ai-team-templates/` references:** 100+ occurrences

- This is a SEPARATE directory that also needs renaming → `.squad-templates/`
- Currently: `templates/` (source) → `.ai-team-templates/` (user's project copy)
- After migration: `templates/` → `.squad-templates/`

**Hidden complexity not in original scope:**

- `.ai-team-templates/` adds ~100 more references
- Git merge drivers in .gitattributes reference `.ai-team/**` paths (4 entries)
- Workflows have hardcoded `.ai-team/team.md` path checks (10+ occurrences)

---

## 2. Migration Complexity Categories

### **Category A: Simple String Replace (Safe)**

**Files:** ~120 files  
**Occurrences:** ~900 references  
**Risk:** Low

**File types:**

- Documentation: `docs/**/*.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`
- Agent histories: `.ai-team/agents/*/history.md`, `.ai-team/agents/*/history-archive.md`
- Team decisions: `.ai-team/decisions.md`, `.ai-team/decisions-archive.md`
- Session logs: `.ai-team/log/**/*.md`
- Templates: `templates/**/*.md`, `.ai-team-templates/**/*.md`

**Implementation:**

```bash
# Safe find/replace in markdown
find . -name "*.md" -type f -exec sed -i 's/\.ai-team\//\.squad\//g' {} +
find . -name "*.md" -type f -exec sed -i 's/\.ai-team-templates\//\.squad-templates\//g' {} +
```

### **Category B: Variable/Config (Path-Agnostic)**

**Files:** `squad.agent.md` (5% of references)  
**Occurrences:** ~50 references  
**Risk:** Low

**Pattern:** References like `TEAM_ROOT`, `{team_root}/.ai-team/`, documented patterns

**Implementation:** Simple string replace, but requires human verification afterward to ensure spawn prompts use correct variable interpolation

### **Category C: Runtime Code (Needs Dual-Path Logic)**

**Files:** `index.js`, test files  
**Occurrences:** 52 references  
**Risk:** Medium-High

**Dual-path detection needed:**

```javascript
// Current (single-path):
const teamMd = path.join(dest, '.ai-team', 'team.md');

// After migration (dual-path):
function resolveTeamRoot(dest) {
  const newPath = path.join(dest, '.squad');
  const legacyPath = path.join(dest, '.ai-team');
  
  if (fs.existsSync(newPath)) return newPath;
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath; // default for new installs
}
```

**Affected operations:**

- `squad init` — create `.squad/` (not `.ai-team/`)
- `squad upgrade` — detect both, prefer `.squad/`
- `squad copilot` — resolve team root before reading
- `squad plugin marketplace` — resolve team root
- `squad export/import` — resolve team root
- All workflow scripts (Ralph, issue-assign, triage, label-sync)

### **Category D: Git Configuration (Atomic Updates)**

**Files:** `.gitattributes`, `.gitignore`, `.npmignore`  
**Occurrences:** 6 references  
**Risk:** Low (but must be atomic)

**Changes:**

**.gitattributes** (4 lines):
```diff
-.ai-team/decisions.md merge=union
-.ai-team/agents/*/history.md merge=union
-.ai-team/log/** merge=union
-.ai-team/orchestration-log/** merge=union
+.squad/decisions.md merge=union
+.squad/agents/*/history.md merge=union
+.squad/log/** merge=union
+.squad/orchestration-log/** merge=union
```

**.npmignore** (2 lines):
```diff
-.ai-team/
-.ai-team-templates/
+.squad/
+.squad-templates/
```

**.gitignore** (0 changes — `.ai-team/` is NOT in .gitignore on dev branch)

### **Category E: GitHub Workflows (Hardcoded Paths)**

**Files:** 10 workflow files (source + templates)  
**Occurrences:** 54 references  
**Risk:** Medium

**Affected workflows:**

- `squad-heartbeat.yml` (Ralph) — checks `.ai-team/team.md` existence (5 refs)
- `squad-issue-assign.yml` — reads `.ai-team/team.md` for assignment (3 refs)
- `squad-triage.yml` — reads `.ai-team/team.md` + `.ai-team/routing.md` (4 refs)
- `sync-squad-labels.yml` — triggers on `.ai-team/team.md` changes (3 refs)
- `squad-main-guard.yml` — blocks `.ai-team/**` from main/preview (8 refs)
- `squad-preview.yml` — checks no `.ai-team/` files tracked (4 refs)

**Dual-path detection strategy:**

```yaml
# Example: squad-heartbeat.yml
- name: Check team exists
  run: |
    if [ -f ".squad/team.md" ]; then
      TEAM_ROOT=".squad"
    elif [ -f ".ai-team/team.md" ]; then
      TEAM_ROOT=".ai-team"
      echo "⚠️ Using legacy .ai-team/ — run 'squad upgrade --migrate-directory'"
    else
      echo "No squad found"
      exit 0
    fi
    echo "TEAM_ROOT=$TEAM_ROOT" >> $GITHUB_ENV
```

---

## 3. Atomic Migration Logic Design

### `squad upgrade --migrate-directory`

**Purpose:** One-command migration for existing repos (v0.5.0 → v1.0.0 transition period)

**Preconditions:**

1. `.ai-team/` exists
2. `.squad/` does NOT exist (or `--force` flag provided)
3. Git working tree is clean (no uncommitted changes) — OR user acknowledges dirty state

**Migration Steps (Atomic):**

```
Step 0: Pre-flight validation
  - Confirm .ai-team/ exists
  - Confirm .squad/ does NOT exist (unless --force)
  - Check git status (warn if dirty, require --force or --allow-dirty)
  - Backup: git stash push -m "pre-squad-migration-backup" (optional, user choice)

Step 1: Rename directory
  - git mv .ai-team/ .squad/
  - git mv .ai-team-templates/ .squad-templates/ (if exists)

Step 2: Update .gitattributes
  - Replace all .ai-team/ → .squad/ paths in merge driver rules
  - Commit: "chore: update .gitattributes for .squad/ migration"

Step 3: Update .npmignore (if present in user repo)
  - Replace .ai-team/ → .squad/
  - Replace .ai-team-templates/ → .squad-templates/
  - Commit: "chore: update .npmignore for .squad/ migration"

Step 4: Update squad.agent.md (if customized by user)
  - Replace all .ai-team/ → .squad/ references
  - Commit: "chore: update squad.agent.md for .squad/ migration"

Step 5: Verify structure
  - Check .squad/team.md exists
  - Check .squad/casting/ exists
  - Check .squad/agents/ exists
  - List migrated files (show count)

Step 6: Final commit
  - Commit all remaining changes
  - Message: "chore: migrate .ai-team/ → .squad/ (v0.5.0)"

Step 7: Post-migration notice
  - "✓ Migration complete: .ai-team/ → .squad/"
  - "✓ X files migrated successfully"
  - "⚠️ Next: Run 'squad upgrade' to update templates and coordinator"
  - "⚠️ If using workflows, update workflow files manually (see docs)"
```

### Edge Cases

| Scenario | Detection | Handling |
|----------|-----------|----------|
| **Both directories exist** | `fs.existsSync('.squad/')` | ABORT unless `--force` — prompt user to resolve manually |
| **Dirty working tree** | `git diff-index --quiet HEAD` | WARN + require `--allow-dirty` flag OR offer to stash |
| **Mid-session Scribe state** | `.ai-team/decisions/inbox/*.md` exists | WARN — recommend committing pending decisions first |
| **No git repo** | `git rev-parse --git-dir` fails | PROCEED with fs rename (no git mv), skip commits |
| **Detached HEAD** | `git symbolic-ref -q HEAD` fails | WARN but PROCEED (commits will be in detached state) |
| **Merge conflict in progress** | `.git/MERGE_HEAD` exists | ABORT — require clean merge state first |
| **Stashed changes** | `git stash list` not empty | INFO — note that migration will add to stash list if backup chosen |

**Idempotency:** YES

- Safe to run multiple times
- If `.squad/` already exists and matches `.ai-team/` structure → NO-OP
- If `.squad/` exists but differs → ABORT (or `--force` to overwrite)

---

## 4. Dual-Path Detection Strategy

### CLI (`index.js`)

**Current:** Hardcoded `.ai-team/` paths (52 occurrences)

**After migration:** Resolve team root dynamically

```javascript
// Add at top of index.js
function resolveTeamRoot(baseDir) {
  const newPath = path.join(baseDir, '.squad');
  const legacyPath = path.join(baseDir, '.ai-team');
  
  // Prefer new path if both exist
  if (fs.existsSync(newPath)) {
    return { root: newPath, isLegacy: false };
  }
  if (fs.existsSync(legacyPath)) {
    console.log(`${YELLOW}⚠️  Using legacy .ai-team/ — run 'squad upgrade --migrate-directory' to migrate${RESET}`);
    return { root: legacyPath, isLegacy: true };
  }
  
  // Default for new installs
  return { root: newPath, isLegacy: false };
}

// Usage in commands:
const { root: teamRoot, isLegacy } = resolveTeamRoot(dest);
const teamMd = path.join(teamRoot, 'team.md');
```

### Coordinator (`squad.agent.md`)

**Current:** Documented pattern uses `TEAM_ROOT` variable in spawn prompts

**After migration:** NO CODE CHANGE needed (already path-agnostic via variable)

**Worktree Awareness section** (lines 620-660) already states:

> All `.ai-team/` paths must be resolved relative to a known **team root**

**Implementation:** Update documentation to show `.squad/` as default, `.ai-team/` as legacy fallback

### Workflows

**Current:** Hardcoded `.ai-team/team.md` checks (54 occurrences)

**After migration:** Add dual-path detection to each workflow

**Example pattern:**

```yaml
- name: Resolve team root
  id: team
  run: |
    if [ -f ".squad/team.md" ]; then
      echo "root=.squad" >> $GITHUB_OUTPUT
      echo "legacy=false" >> $GITHUB_OUTPUT
    elif [ -f ".ai-team/team.md" ]; then
      echo "root=.ai-team" >> $GITHUB_OUTPUT
      echo "legacy=true" >> $GITHUB_OUTPUT
    else
      echo "found=false" >> $GITHUB_OUTPUT
    fi

- name: Warn about legacy path
  if: steps.team.outputs.legacy == 'true'
  run: |
    echo "⚠️ Using legacy .ai-team/ — consider migrating to .squad/"

- name: Read team roster
  if: steps.team.outputs.found != 'false'
  run: |
    TEAM_ROOT="${{ steps.team.outputs.root }}"
    cat "$TEAM_ROOT/team.md"
```

**Affected steps count:** ~15 workflow steps need this pattern

---

## 5. Implementation Work Estimate

### PR Breakdown (3 atomic PRs, 5-8h each)

#### **PR #1: Core Infrastructure (Foundation)** — 5-8 hours

**Goal:** Enable dual-path detection in CLI + add migration command

**Files changed:** ~10 files

- `index.js` — Add `resolveTeamRoot()`, refactor all `.ai-team/` references (52 changes)
- `test/init-flow.test.js` — Update assertions for dual-path
- `test/plugin-marketplace.test.js` — Update assertions for dual-path
- `.gitattributes` — Add `.squad/**` merge drivers (keep legacy for compat)
- `.npmignore` — Add `.squad/` and `.squad-templates/` entries
- `package.json` — Bump version to 0.5.0-alpha.1

**New functionality:**

- `resolveTeamRoot(dest)` helper function
- `squad upgrade --migrate-directory` command (150-200 lines)
- `squad upgrade --migrate-directory --force` override
- `squad upgrade --migrate-directory --allow-dirty` override
- Migration edge case handling (all scenarios from section 3)

**Testing:**

- Unit tests for `resolveTeamRoot()` (6 scenarios)
- E2E test: migrate existing .ai-team/ → .squad/
- E2E test: migration idempotency (run twice, second is no-op)
- E2E test: migration with dirty tree (should abort)
- E2E test: migration with --force (both dirs exist)

**Risk:** Medium — This PR touches CLI entry point, must not break existing users on v0.4.x

**Merge strategy:** Feature flag? NO — Ship as new command only, existing commands unchanged

---

#### **PR #2: Documentation + Templates** — 3-5 hours

**Goal:** Update all markdown docs and template files to use `.squad/`

**Files changed:** ~120 files

- `.github/agents/squad.agent.md` — 247 references → `.squad/`
- `README.md` — All examples → `.squad/`
- `CHANGELOG.md` — Add v0.5.0 migration entry
- `CONTRIBUTING.md` — Update guard workflow docs → `.squad/`
- `docs/**/*.md` — All 30+ guide/feature/scenario docs
- `templates/**/*.md` — Charter, history, ceremonies templates
- `.ai-team/**/*.md` — Squad's own team state (dogfooding migration)

**Implementation:**

```bash
# Automated via script (create migration-docs.sh)
find . -name "*.md" -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/_site/*" \
  -exec sed -i 's/\.ai-team\//\.squad\//g' {} + \
  -exec sed -i 's/\.ai-team-templates\//\.squad-templates\//g' {} +
```

**Manual review needed:** 10-15 files

- `CHANGELOG.md` — Write migration announcement
- `README.md` — Verify examples still make sense
- `docs/guide.md` — Update "What gets installed" section
- `squad.agent.md` — Verify spawn prompt templates correct

**Testing:** Visual inspection, search for remaining `.ai-team/` refs (should be 0 in docs)

**Risk:** Low — Pure documentation, no runtime impact

---

#### **PR #3: Workflows (User-Facing Automation)** — 5-6 hours

**Goal:** Update all GitHub Actions workflows for dual-path detection

**Files changed:** 10 workflow files × 2 (source + templates) = 20 files

- `.github/workflows/squad-heartbeat.yml`
- `.github/workflows/squad-issue-assign.yml`
- `.github/workflows/squad-triage.yml`
- `.github/workflows/sync-squad-labels.yml`
- `.github/workflows/squad-main-guard.yml`
- `.github/workflows/squad-preview.yml`
- Mirror changes in `templates/workflows/**` (user repo copies)

**Implementation per workflow:**

1. Add "Resolve team root" step (pattern from section 4)
2. Replace all hardcoded `.ai-team/` → `$TEAM_ROOT` variable
3. Add deprecation warning if legacy path detected
4. Update error messages to mention both paths

**Specific workflow changes:**

- **squad-main-guard.yml** — Block BOTH `.ai-team/**` and `.squad/**` (8 lines)
- **squad-preview.yml** — Check BOTH paths for tracked files (4 lines)
- **squad-heartbeat.yml (Ralph)** — Resolve team root before reading roster (5 refs)
- **squad-issue-assign.yml** — Dynamic team roster path (3 refs)
- **squad-triage.yml** — Dynamic routing file path (4 refs)
- **sync-squad-labels.yml** — Trigger on BOTH `.ai-team/team.md` and `.squad/team.md` changes

**Testing:**

- Workflow validation: `yamllint .github/workflows/*.yml`
- Dry-run on test repo with `.ai-team/` (legacy path detection)
- Dry-run on test repo with `.squad/` (new path detection)
- Dry-run with BOTH dirs present (should prefer `.squad/`)

**Risk:** Medium-High — These workflows run on main repo, failure impacts all contributors

**Rollback plan:** Revert workflows to v0.4.1 versions, keep CLI changes

---

### Total Implementation Time

**Conservative estimate:** 15-20 hours (3 PRs × 5-7 hours each)

**Optimistic estimate:** 13-15 hours (if no major edge cases found)

**Breakdown:**

- PR #1 (CLI): 5-8 hours (most complex — migration logic + tests)
- PR #2 (Docs): 3-5 hours (mostly automated, manual review light)
- PR #3 (Workflows): 5-6 hours (tedious but straightforward)

**Staging plan:**

- Week 1 (current): Audit + architecture (this document) — 4 hours ✅
- Week 1 (Day 3-5): PR #1 implementation — 6 hours
- Week 2 (Day 1-2): PR #2 implementation — 4 hours
- Week 2 (Day 3-4): PR #3 implementation — 5 hours
- Week 2 (Day 5): Testing + docs — 2 hours

**Total:** 21 hours across 2 weeks (matches 80h estimate scope for full v0.5.0 cycle, but this is Week 1 foundation work)

---

## 6. Risk Assessment

### User-Facing Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Migration fails mid-way** | High — corrupted state | Low | Atomic git operations, pre-flight backup via stash |
| **Dual-path detection breaks** | High — CLI unusable | Medium | Comprehensive tests (6 scenarios), fallback to legacy |
| **Workflows fail silently** | Medium — automation stops | Low | Explicit error messages, team root resolution logged |
| **Consumer repos don't migrate** | Low — backward compat | High | Keep `.ai-team/` support until v1.0.0 (6+ months) |
| **Docs out of sync** | Low — confusion | Medium | Automated sed script, manual review of examples |

### Developer Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **PR #1 blocks all other work** | High — CLI is entry point | Feature branch, thorough testing before merge |
| **Merge conflicts in squad.agent.md** | Medium — 247 refs | Coordinate with other active PRs (check #69 label) |
| **Test suite breaks** | Medium — CI red | Update test assertions in same PR as code changes |
| **Guard workflow false positives** | High — blocks legitimate PRs | Test guard logic with both `.ai-team/` and `.squad/` in feature branch |

### Production Risks (v0.5.0 Release)

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| **v0.4.x users upgrade, migration fails** | GitHub issue spike | Hotfix v0.5.1 with improved error handling + rollback instructions |
| **Workflows break on existing repos** | CI failures on user repos | Emergency comms: "Pin to v0.4.1 until migration complete" |
| **Documentation still shows `.ai-team/`** | Community reports confusion | Hotfix docs-only PR, redeploy squad.bradygaster.com |

**Rollback complexity:** Medium

- CLI changes: Revert `index.js` to v0.4.1
- Docs: Re-run sed script with inverse replacements
- Workflows: Revert to v0.4.1 versions in templates/

**Migration is opt-in:** YES (until v1.0.0)

- v0.5.0 ships with dual-path support
- Users choose when to run `squad upgrade --migrate-directory`
- No breaking changes until v1.0.0 removes `.ai-team/` support

---

## 7. Test Plan Outline

### Scenarios That MUST Pass Before Merge

#### **PR #1 (CLI) Tests**

1. ✅ **New install creates `.squad/`** — Run `squad init` on empty repo, verify `.squad/team.md` exists
2. ✅ **Legacy repo keeps `.ai-team/`** — Run CLI commands on v0.4.x repo, verify no migration forced
3. ✅ **Migration command works** — Run `squad upgrade --migrate-directory` on v0.4.x repo, verify:
   - `.ai-team/` → `.squad/` renamed via git mv
   - `.gitattributes` updated
   - `.npmignore` updated (if present)
   - Commit created with correct message
   - No data loss (all files present in `.squad/`)
4. ✅ **Migration is idempotent** — Run command twice, second run is no-op
5. ✅ **Migration aborts on dirty tree** — Stage uncommitted changes, run migration, verify abort
6. ✅ **Migration with --allow-dirty proceeds** — Dirty tree + flag, verify migration succeeds
7. ✅ **Dual-path detection prefers `.squad/`** — Create both dirs, verify `.squad/` used
8. ✅ **Legacy warning shown** — Access `.ai-team/` repo, verify deprecation message displayed

#### **PR #2 (Docs) Tests**

1. ✅ **No `.ai-team/` refs in docs/** — grep returns 0 matches
2. ✅ **README examples use `.squad/`** — Visual inspection of install flow
3. ✅ **CHANGELOG has v0.5.0 entry** — Section exists with migration instructions
4. ✅ **squad.agent.md spawn prompts correct** — Search for `TEAM_ROOT` variable usage

#### **PR #3 (Workflows) Tests**

1. ✅ **Guard blocks `.squad/` on main** — Create PR with `.squad/` files to main, verify blocked
2. ✅ **Guard blocks `.ai-team/` on main** — (regression test) Still blocked after migration
3. ✅ **Ralph resolves `.squad/` team root** — Run heartbeat workflow, verify team detection
4. ✅ **Ralph falls back to `.ai-team/`** — Remove `.squad/`, verify legacy detection
5. ✅ **Issue assign reads dynamic path** — Trigger workflow, verify no hardcoded path errors
6. ✅ **Triage uses dynamic routing** — Trigger workflow, verify routing file resolved

### Integration Tests (Cross-PR)

1. ✅ **Full migration flow** — v0.4.x repo → run `squad init` (noop) → run `squad upgrade` → run `squad upgrade --migrate-directory` → run workflows → verify all green
2. ✅ **Consumer repo simulation** — Create test repo with Squad v0.4.x → upgrade to v0.5.0 → trigger 5 real issues → verify automation works
3. ✅ **Rollback test** — Migrate → manual revert to `.ai-team/` → verify CLI still works (backward compat)

### Performance Tests

- **Migration speed:** <5 seconds for repos with <1000 files in `.ai-team/`
- **Cold start time:** `squad init` on empty repo <2 seconds (unchanged from v0.4.x)
- **Dual-path resolution:** <10ms overhead per command (negligible)

---

## 8. Open Questions / Decisions Needed

### Q1: Should `.ai-team-templates/` also migrate?

**Current:** Separate directory with ~100 references

**Options:**

- **A) Migrate simultaneously** — `.ai-team-templates/` → `.squad-templates/` in same PR
- **B) Defer to v0.6.0** — Focus only on `.ai-team/` for v0.5.0, templates later
- **C) Never migrate templates** — Keep legacy name for backward compat

**Recommendation:** Option A (migrate simultaneously)

**Rationale:** Templates are conceptually part of the same namespace, splitting creates confusion ("why is only one renamed?"). Adds ~50 more string replacements but no new logic.

### Q2: What's the v1.0.0 cutoff date for `.ai-team/` removal?

**Current plan:** Backward compat "until v1.0.0"

**Options:**

- **A) 6 months (Aug 2026)** — Aggressive, clear deadline
- **B) 1 year (Feb 2027)** — Conservative, low user friction
- **C) "When adoption reaches 80%"** — Data-driven but indefinite

**Recommendation:** Option B (1 year / Feb 2027)

**Rationale:** Squad is pre-1.0, breaking changes should be rare and well-telegraphed. 1 year gives ample time for users to migrate without urgency.

### Q3: Should migration be automatic on `squad upgrade`?

**Current design:** Explicit `squad upgrade --migrate-directory` command

**Options:**

- **A) Keep explicit** — User must opt-in to migration
- **B) Auto-prompt** — `squad upgrade` detects `.ai-team/` and asks "Migrate now? [y/N]"
- **C) Fully automatic** — `squad upgrade` always migrates if `.ai-team/` detected

**Recommendation:** Option B (auto-prompt)

**Rationale:** Reduces friction (user doesn't need to remember second command), but keeps control (can decline with 'N'). Safety: defaults to NO if user just hits Enter.

### Q4: Do consumer repos need a migration guide?

**Context:** External repos using Squad will have `.ai-team/` state

**Assets needed:**

- **Migration checklist** — Step-by-step for repo owners
- **Troubleshooting guide** — Common failures + fixes
- **Rollback instructions** — If migration fails, how to revert
- **Video walkthrough** — 2-min demo showing the command + verification

**Recommendation:** YES — Create `docs/scenarios/migrate-to-squad-directory.md`

**Rationale:** ~50% of users will encounter migration in real repos (not fresh installs). Reducing support burden requires proactive docs.

---

## 9. Final Recommendations

### Immediate Actions (Week 1 Completion)

1. ✅ **Audit complete** — This document
2. ⏭️ **Get stakeholder review** — Brady + Keaton review this doc, approve approach
3. ⏭️ **Create PR #1 branch** — `feature/squad/69-cli-migration` from dev
4. ⏭️ **Implement `resolveTeamRoot()`** — Foundation for dual-path logic
5. ⏭️ **Implement `squad upgrade --migrate-directory`** — Core migration command
6. ⏭️ **Write PR #1 tests** — 8 scenarios from section 7

### Week 2 Deliverables

- PR #1 merged (CLI + migration)
- PR #2 merged (Docs)
- PR #3 merged (Workflows)
- `docs/scenarios/migrate-to-squad-directory.md` published
- v0.5.0-alpha.1 tagged for beta testing

### Success Metrics (Post-Merge)

- 0 reported migration failures in first week
- <5 GitHub issues with "migration" label
- 0 rollbacks required
- 80% of active Squad repos migrate within 1 month (tracked via telemetry opt-in)

---

## Appendix A: File Manifest (High-Impact Files)

Files requiring manual review after automated changes:

1. `.github/agents/squad.agent.md` — 247 refs, spawn prompts must stay correct
2. `index.js` — 52 refs, CLI entry point
3. `.gitattributes` — 4 refs, git merge drivers
4. `.npmignore` — 2 refs, package exclusions
5. `.github/workflows/squad-main-guard.yml` — 8 refs, blocks forbidden paths
6. `.github/workflows/squad-heartbeat.yml` — 5 refs, Ralph team detection
7. `README.md` — 15+ refs, user-facing examples
8. `CHANGELOG.md` — 10+ refs, version history
9. `CONTRIBUTING.md` — 12+ refs, contributor guide

---

## Appendix B: Dual-Path Resolution Reference Implementation

```javascript
// index.js — Add near top after imports

const SQUAD_DIR = '.squad';
const LEGACY_DIR = '.ai-team';
const SQUAD_TEMPLATES_DIR = '.squad-templates';
const LEGACY_TEMPLATES_DIR = '.ai-team-templates';

/**
 * Resolve team root directory, preferring new .squad/ over legacy .ai-team/
 * @param {string} baseDir - Base directory to search from (usually cwd)
 * @returns {{ root: string, templatesRoot: string, isLegacy: boolean }}
 */
function resolveTeamRoot(baseDir) {
  const newPath = path.join(baseDir, SQUAD_DIR);
  const legacyPath = path.join(baseDir, LEGACY_DIR);
  const newTemplatesPath = path.join(baseDir, SQUAD_TEMPLATES_DIR);
  const legacyTemplatesPath = path.join(baseDir, LEGACY_TEMPLATES_DIR);

  // Prefer new path if both exist
  if (fs.existsSync(newPath)) {
    return {
      root: newPath,
      templatesRoot: fs.existsSync(newTemplatesPath) ? newTemplatesPath : legacyTemplatesPath,
      isLegacy: false
    };
  }

  if (fs.existsSync(legacyPath)) {
    showLegacyWarning();
    return {
      root: legacyPath,
      templatesRoot: legacyTemplatesPath,
      isLegacy: true
    };
  }

  // Default for new installs
  return {
    root: newPath,
    templatesRoot: newTemplatesPath,
    isLegacy: false
  };
}

function showLegacyWarning() {
  console.log();
  console.log(`${YELLOW}⚠️  Using legacy .ai-team/ directory${RESET}`);
  console.log(`${YELLOW}    Run 'squad upgrade --migrate-directory' to migrate to .squad/${RESET}`);
  console.log(`${YELLOW}    Legacy support ends in v1.0.0 (Feb 2027)${RESET}`);
  console.log();
}

// Usage in commands:
const { root: teamRoot, templatesRoot, isLegacy } = resolveTeamRoot(dest);
const teamMd = path.join(teamRoot, 'team.md');
```

---

**END OF AUDIT REPORT**

---

**Estimated Implementation Time:** 15-20 hours (3 PRs)

**Recommended Start Date:** 2026-02-19 (Week 1 Day 3)

**Target Completion:** 2026-02-28 (Week 2 Day 5)

**v0.5.0 Alpha Release:** 2026-03-03 (beta testing begins)

### 2026-02-18: Issue #86 Investigation — Squad Undid Uncommitted Changes
**By:** Fenster (Backend Dev)  
**Investigation Duration:** 4 hours (Week 1 Day 2)  
**Requested by:** bradygaster (via Ralph - v0.5.0 epic)

---

## Executive Summary

✅ **Successfully reproduced** the data loss scenario in isolated test environment.  
🎯 **Root cause identified:** Prompt engineering gap — no git safety discipline in agent spawn templates.  
📋 **Recommendation:** **Prompt-only fix** (2-4 hours). Add git safety instructions to `squad.agent.md`.  
⚠️ **Severity confirmed:** HIGH — trust-destroying. Must fix before v0.5.0 ships.

---

## Reproduction Results

### Test Scenario

Created isolated test repo, simulated exact scenario from @tlmii's report:

1. **Initial commit** — baseline state (`README.md` with "Initial state")
2. **Session 1 work** — Frontend changes added (uncommitted)
3. **Session 2 work** — More UI changes added on top (uncommitted) 
4. **Agent error** — Simulated agent running `git checkout .` to undo Session 2 work

### Observed Behavior

```
BEFORE checkout:
# Test Project
Initial state

## Frontend Work (Session 1 - UNCOMMITTED)
- Added login form component
- Implemented auth flow

## UI Improvements (Session 2 - UNCOMMITTED)
- Refined button styles
- Added dark mode toggle

Running: git checkout .

AFTER checkout (DATA LOSS):
# Test Project
Initial state
```

**Result:** `git checkout .` discarded BOTH Session 1 AND Session 2 work. Reverted to last commit. **Exact data loss as reported in Issue #86.**

---

## Root Cause Analysis

### 1. Primary Cause: No Pre-Checkout Safety in Spawn Prompts

**Location:** `.github/agents/squad.agent.md` (lines 683-755, "Template for any agent")

**What's missing:**
- No instruction to run `git status --porcelain` before destructive git operations
- No abort-if-uncommitted-work pattern
- No explicit git discipline guidance

**Where agents learn git commands:**
- GitHub Issues Mode (line 1582-1603) includes `git checkout -b` for branch creation
- Scribe charter includes `git commit` workflow (with Windows compatibility notes)
- General agent instructions include "do the work" but no git safety rules

**Agents are left to infer git usage from context** — no explicit safety protocol.

### 2. Secondary Cause: No Uncommitted Work Detection at Spawn Boundaries

**Location:** Coordinator logic in `squad.agent.md`

**What's missing:**
- Coordinator doesn't check for uncommitted work before spawning Agent B after Agent A
- No warning in spawn prompt: "⚠️ Uncommitted changes detected from previous session"
- No visibility into prior agent's working tree state

**The handoff is git-state-blind:** Agent B only sees HEAD commit via charter/history/decisions reads. Working tree state is invisible.

### 3. Tertiary Cause: No Commit Discipline Guidance

**Current instructions (line 726-755):**
- Agents update `history.md` ✅
- Agents write to decisions inbox ✅  
- Agents extract skills ✅
- **No mention of committing their own work** ❌

Result: Agents leave uncommitted changes for the next agent to handle.

---

## Git Instructions Audit: What Exists Today

### ✅ What Squad Already Has

1. **Scribe commit protocol** (lines 850-881) — robust Windows-compatible commit workflow:
   - `cd` into team root before git operations
   - Use temp file + `git commit -F` (PowerShell-safe)
   - Verify commit landed with `git log --oneline -1`

2. **GitHub Issues Mode branching** (lines 1582-1603):
   - `git checkout -b squad/{issue-number}-{slug}`
   - Branch creation for PR workflow
   - Commit with message: `feat: {summary} (#{number})`

3. **Worktree awareness** (lines 620-656):
   - Resolve team root via `git rev-parse --show-toplevel`
   - Handle worktree-local vs. main-checkout strategies
   - Pass `TEAM_ROOT` to all agent spawns

### ❌ What's Missing

1. **Pre-checkout safety check** — CRITICAL GAP
2. **Working tree awareness before destructive operations**
3. **Commit discipline for agents doing domain work**
4. **Uncommitted work detection at coordinator spawn boundaries**

---

## Investigation Questions (from briefing)

### Q: Does squad.agent.md have git safety instructions?

**A: NO** for agents. YES for Scribe (commit protocol only).

**Grep results for "git checkout", "git status", "uncommitted":**
- `git checkout` mentioned 3 times (all in GitHub Issues Mode — branch creation context)
- `git status` mentioned ZERO times in agent guidance
- "uncommitted" mentioned ZERO times in agent spawn templates

### Q: What does the spawn template say about git operations?

**A: NOTHING** about safety. The standard spawn template (lines 683-755) includes:
- Read charter, history, decisions ✅
- Do the work ✅
- Update history.md ✅
- Write to decisions inbox ✅
- **Response order block** ✅
- **NO git discipline** ❌

### Q: Is there a pre-checkout safety check pattern?

**A: NO.** Git operations are agent-inferred, not coordinator-enforced.

### Q: Can agents see uncommitted work when they spawn?

**A: NO.** Agent spawn prompt includes:
- Charter (inlined)
- History (file read)
- Decisions (file read)
- Team root path
- Input artifacts (authorized file paths)

**Working tree status is NOT passed.** Agent B has no visibility into Agent A's uncommitted work.

---

## Fix Approach Recommendation

### ✅ RECOMMENDED: Prompt-Only Fix (2-4 hours)

**Why this is the right path:**
- Root cause is guidance gap, not architectural flaw
- Coordinator already has the right separation of concerns (orchestration vs. domain work)
- Git operations are agent-level responsibility — prompt engineering is the correct layer
- Existing Scribe precedent shows robust git workflows can be expressed in prompts

**What to add:**

#### 1. Git Safety Block in Standard Spawn Template

Add after "Do the work" section (around line 712):

```markdown
GIT DISCIPLINE:
- Before running `git checkout`, `git reset`, `git clean`, or any command that discards changes:
  1. Run `git status --porcelain`
  2. If output is non-empty (uncommitted work exists), ABORT
  3. Report to user: "⚠️ Uncommitted changes detected. Commit or stash before proceeding?"
- After completing work that modifies files, commit your changes:
  1. Stage: `git add {files you changed}`
  2. Commit: `git commit -m "brief description (by {Name})"`
- If uncertain whether to commit, err on the side of committing. Uncommitted work is invisible to the next agent.
```

#### 2. Uncommitted Work Detection at Spawn Boundaries

Add to coordinator "After Agent Work" section (around line 774):

```markdown
Before spawning the next agent batch, check for uncommitted work:
1. Run `git status --porcelain`
2. If output is non-empty, inject into next spawn prompt:
   ⚠️ UNCOMMITTED CHANGES EXIST:
   {paste git status output}
   
   These are from a previous session. Before running any `git checkout` or destructive
   git operation, verify you're not discarding work the user wants to keep.
```

#### 3. Lightweight Mode Git Safety

Add to Lightweight Spawn Template (around line 301):

```markdown
⚠️ GIT SAFETY: If your task involves `git checkout`, `git reset`, or `git clean`,
run `git status --porcelain` first. Abort and ask user if uncommitted work exists.
```

**Estimated effort:**
- **Prompt updates:** 1-2 hours (add blocks to 3 templates)
- **Coordinator detection logic:** 1 hour (`git status --porcelain` check + injection)
- **Testing:** 1 hour (run 4 test scenarios — see below)
- **Total: 3-4 hours**

### ❌ NOT RECOMMENDED: Complex Tooling (8-12 hours)

**Why avoid this path:**
- Architecturally unnecessary — coordinator/agent boundary is correct
- Adds coordinator complexity for agent-level concern
- Maintenance burden — new tool surface to test/document
- Doesn't prevent the underlying problem (agents not checking before destructive ops)

**What this would entail:**
- New coordinator tool: `snapshot_uncommitted_state()`
- Auto-stash before every spawn
- Agent handoff protocol with explicit git state awareness
- Working tree preservation mechanism
- Extensive testing across multi-agent workflows

**Verdict:** Overengineered. Prompt-only fix addresses root cause more directly.

---

## Test Scenarios (Must Pass Before v0.5.0 Ships)

### Scenario 1: Agent Hits Error Mid-Work, Tries to Undo

**Setup:**
1. Agent A completes work (uncommitted)
2. Agent B spawned for follow-up task
3. Agent B encounters error, decides to "undo work"

**Expected behavior:**
- Agent B runs `git status --porcelain` before `git checkout`
- Detects uncommitted changes
- Aborts and asks user: "⚠️ Uncommitted changes detected. Commit or stash first?"

**Pass criteria:**
- Agent B does NOT discard Agent A's work
- User is prompted for guidance

### Scenario 2: Multi-Agent Parallel Work, One Fails

**Setup:**
1. Coordinator spawns Agent A (backend) + Agent B (frontend) in parallel (background mode)
2. Both modify files
3. Agent A completes successfully (uncommitted)
4. Agent B fails mid-work, attempts to undo via `git checkout`

**Expected behavior:**
- Agent B's `git status` check detects Agent A's uncommitted work
- Agent B aborts and reports conflict

**Pass criteria:**
- Agent A's completed work is NOT discarded by Agent B's failure recovery

### Scenario 3: GitHub Issues Mode Branch Creation (Existing Workflow)

**Setup:**
1. User says "work on issue #42"
2. Agent creates branch via `git checkout -b squad/42-fix-auth`
3. Agent does work (uncommitted)
4. Agent encounters error, tries to undo

**Expected behavior:**
- Same as Scenario 1 — `git status` check before destructive ops
- Branch creation (`git checkout -b`) is safe (doesn't discard work)

**Pass criteria:**
- Existing GitHub Issues workflow continues to work
- Safety check prevents data loss on error recovery

### Scenario 4: Coordinator Detects Uncommitted Work at Spawn Boundary

**Setup:**
1. Agent A completes work, leaves files uncommitted
2. User requests follow-up task
3. Coordinator spawns Agent B

**Expected behavior:**
- Coordinator runs `git status --porcelain` before spawning Agent B
- Detects uncommitted work from Agent A
- Injects warning into Agent B's spawn prompt: "⚠️ Uncommitted changes exist: {file list}"

**Pass criteria:**
- Agent B is aware of uncommitted work from the start
- Agent B does NOT blindly run destructive git operations

---

## Effort vs. Impact

| Approach | Effort | Impact | Risk | Recommendation |
|----------|--------|--------|------|----------------|
| **Prompt-only fix** | 3-4h | Eliminates data loss | Low — prompt changes, easy to revert | ✅ **DO THIS** |
| **Complex tooling** | 8-12h | Same (prevents data loss) | Medium — new coordinator surface | ❌ Skip |
| **Ship without fix** | 0h | Trust destruction continues | HIGH — user stops using Squad | ❌ **DO NOT SHIP** |

---

## v0.5.0 Blocker Status

**YES, this blocks v0.5.0 shipment** — but only conditionally:

1. **If fixed this week (prompt-only, 3-4h):** Bundle into v0.5.0. Already touching `squad.agent.md` for #69 (directory rename) and #76 (casting system). Add git safety as part of the same release.

2. **If complex tooling required (8-12h):** Defer to v0.5.1 patch. Don't block v0.5.0 for a pre-existing bug that requires architectural work.

**My recommendation:** Fix it this week (prompt-only). It's a 3-4 hour investment to eliminate a trust-destroying bug. Shipping v0.5.0 with known data loss exposure is unacceptable.

---

## Next Steps

1. **Verbal** (Prompt Engineer) — implement prompt-only fix:
   - Add Git Safety block to standard spawn template
   - Add Lightweight Mode git safety
   - Add uncommitted work detection to coordinator "After Agent Work" section

2. **Fenster** (Backend Dev, me) — implement coordinator detection logic:
   - Add `git status --porcelain` check before spawning next agent
   - Inject warning into spawn prompt when uncommitted work detected

3. **Hockney** (Tester) — create test scenarios:
   - Write 4 test cases (scenarios described above)
   - Validate across single-agent, multi-agent, and GitHub Issues Mode workflows
   - Confirm no regressions in existing git operations (branch creation, commits)

4. **McManus** (Lead) — validate fix before v0.5.0 ships:
   - Review test results from Hockney
   - Confirm all 4 scenarios pass
   - Sign off on v0.5.0 readiness

**Timeline:** Complete by end of Week 1 (2 days remaining). Estimated 6-8 hours total team effort.

---

## Conclusion

Issue #86 is a **high-severity trust bug** caused by a **prompt engineering gap**, not an architectural flaw. The fix is straightforward: add explicit git safety instructions to agent spawn templates and coordinator spawn boundary checks.

**Can reproduce:** ✅  
**Root cause identified:** ✅  
**Fix approach:** Prompt-only (3-4 hours)  
**Test scenarios defined:** ✅  
**Blocker status:** YES — but fixable this week  

**Recommendation:** Fix it now (prompt-only), bundle into v0.5.0, validate across 4 test scenarios before shipping.

---

**Investigation complete. Ready for fix implementation.**

# Decision: Create `.github/copilot-instructions.md` for Squad Source Repo

**Date:** 2026-02-18  
**Owner:** Keaton (Lead)  
**Context:** Design review — Brady noticed inconsistent routing behavior when using Squad in VS Code

---

## Decision

**Create `.github/copilot-instructions.md` for the Squad source repository.**

---

## Rationale

1. **File does not exist** — Squad ships a template at `templates/copilot-instructions.md` for consumer repos, but the Squad repo itself has no instructions file
2. **Different purposes** — Template is for coding agent issue workflow in consumer repos; this file is for contributors working on Squad's source
3. **Closes context gap** — When contributors use Copilot in Squad repo without selecting the Squad agent, they get zero Squad-specific context
4. **Platform standard** — `copilot-instructions.md` is GitHub Copilot's standard mechanism for repo-level instructions

---

## Content Strategy

- **Short and surgical** — ~250-300 tokens (~50 lines)
- **Project identity** — "This is the Squad source repo"
- **Agent routing hint** — Suggest using `@squad` agent for team operations
- **Architecture pointers** — Key file paths (`.github/agents/squad.agent.md`, `.ai-team/`, `templates/`, `index.js`)
- **Codebase conventions** — Branch naming, test command, template vs. source distinction
- **Reference by path** — Don't duplicate team roster or routing rules, point to `.ai-team/team.md` and `.ai-team/routing.md`

---

## What This Solves

- Copilot has context about Squad's architecture when used without agent selection
- Reduces hallucinated answers about Squad structure
- Nudges users toward `@squad` agent for team operations
- Provides conventions for code edits to this repo

---

## What This Does NOT Solve

- Cannot force routing through Squad agent (platform limitation — requires explicit user agent selection)
- Brady's routing inconsistency may be a separate issue (stale agent cache, missing `@squad`, or VS Code extension version issue)
- **Action:** File separate issue to investigate root cause

---

## Critical Risk — Upgrade Logic Collision

**Issue:** `index.js` lines 854-865 copy `templates/copilot-instructions.md` to `.github/copilot-instructions.md` during `squad upgrade`. If someone runs `squad upgrade` in the Squad repo itself, it would overwrite our custom file with the consumer template.

**Mitigation:**
- Add safeguard to `squad upgrade` logic
- Check if running in Squad source repo (package.json name === "squad")
- Skip `.github/copilot-instructions.md` upgrade step if so
- Log warning: "Skipping copilot-instructions.md (running in Squad source repo)"
- **Owner:** Fenster
- **Timeline:** Before v0.5.0 (HIGH priority — data loss risk)

---

## Content Ownership

**Owner:** Keaton (Lead)  
**Rationale:** This is a `.github/` infrastructure file defining repo-level conventions and architecture. Falls under Lead's domain.

**Review process:**
- Content changes require design review if they alter routing guidance or architectural descriptions
- Typo/path corrections do not require review
- Version or staleness markers should be added to detect drift from `squad.agent.md`

---

## Implementation

Content:

```markdown
# Copilot Instructions — Squad Source Repository

<!-- This file is for the Squad source repo itself, not the template shipped to users.
     See templates/copilot-instructions.md for the user-facing version. -->

This is the **source repository** for Squad, an AI team framework for GitHub Copilot.

## Using the Squad Agent

This repo has an active Squad agent at `.github/agents/squad.agent.md`. For team operations, roster management, or multi-agent work, select **Squad** from the agent picker in VS Code rather than asking Copilot directly.

- Team roster: `.ai-team/team.md`
- Routing rules: `.ai-team/routing.md`

## Repository Structure

- `index.js` — CLI entry point (`npx create-squad`)
- `.github/agents/squad.agent.md` — The Squad coordinator agent (~1,800 lines)
- `templates/` — Files copied to consumer repos during `create-squad` init
- `.ai-team/` — This repo's own Squad team state (live, not a template)
- `docs/` — Documentation site source
- `test/` — Test suite (`node --test test/*.test.js`)

## Conventions

- **Branch naming:** `squad/{issue-number}-{kebab-case-slug}`
- **Decisions:** Write to `.ai-team/decisions/inbox/`
- **Testing:** Run `npm test` before opening PRs
- **Template vs. source:** Files in `templates/` are copied verbatim by `index.js` to consumer repos. The `.ai-team/` directory here is Squad's own team — don't confuse them.

## Quick Answers

Quick factual questions about file locations, build commands, or public API may be answered directly. Domain questions (architecture, prompt design, VS Code integration) should route through the Squad agent to reach the relevant specialist.
```

---

**Timeline:** Before v0.5.0  
**Dependencies:** Fenster implements upgrade safeguard before v0.5.0

---

**Signed:** Keaton (Lead)


**Recognition mechanism (preserved):**
- `[INSIDER]` badge in CONTRIBUTORS.md
- Discord #squad-insiders channel
- Blog post credits
- Release notes thank-yous

**Responsibilities (preserved):**
- Test within 48-72h of new insider build
- File detailed bugs with commit SHA
- Validate exit criteria before releases (optional but valued)

**Rationale:**
Ring progression adds coordination overhead (tracking tiers, graduation criteria, communication) that doesn't scale with solo maintainer bandwidth. Value is in testing feedback, not tier labels. If cohort grows beyond 30 members, rings can be added later as scaling mechanism. Adding rings later is easy; removing rings after launch is awkward.

**v0.5.0 timing:** Insider Program ships as NEW feature in v0.5.0 alongside .ai-team/ → .squad/ migration. Not tied to beta cohort — beta validates migration, insiders are ongoing continuous testing.

### 2026-02-18: Issue #76 — squad.agent.md Refactor for GHE 30KB Limit (Architecture Design)

**By:** Verbal (Prompt Engineer)
**Requested by:** bradygaster (via Ralph - v0.5.0 Week 1 Day 2)
**Status:** Architecture Complete — Ready for Implementation

---

## Executive Summary

**Current State:** squad.agent.md is **108.68 KB** (~111,293 bytes) — **3.6× over GHE's 30KB limit**

**Recommended Solution:** lib/ split with inline references, targeting **~25KB core file** with **headroom for growth**

**Implementation Estimate:** 12-16 squad-hours across 3 agents (Verbal, Fenster, Hockney)

**Risk Level:** LOW — mechanical file surgery with validation gates

---

## 1. Current State Analysis

### File Size Breakdown

**Total Size:** 108.68 KB (111,293 bytes)
- **Target:** <30KB (GHE limit)
- **Recommended ceiling:** ~25KB (20% headroom)
- **Required reduction:** ~83KB (76% of current content)

### Section Analysis (Estimated Sizes)

Based on line count and content density, approximate section sizes:

| Section | Est. Size | Usage Frequency | Move to lib/? |
|---------|-----------|-----------------|---------------|
| **Casting & Persistent Naming** | ~15KB | Per-init, per-add-member | ✅ YES |
| **Ceremonies** | ~8KB | Per-ceremony trigger | ✅ YES |
| **GitHub Issues Mode** | ~10KB | Per-issue-session | ✅ YES |
| **Ralph — Work Monitor** | ~12KB | Per-Ralph-session | ✅ YES |
| **PRD Mode** | ~8KB | Per-PRD-session | ✅ YES |
| **Human Team Members** | ~5KB | Per-add-human, low freq | ✅ YES |
| **Copilot Coding Agent** | ~7KB | Per-CCA-add, low freq | ✅ YES |
| **Multi-Agent Artifact Format** | ~3KB | Per-multi-agent-work | ✅ YES |
| **Coordinator Identity** | ~2KB | Every session | ❌ KEEP |
| **Init Mode** | ~8KB | Per-init only | ❌ KEEP |
| **Team Mode (core)** | ~15KB | Every session | ❌ KEEP |
| **Routing** | ~3KB | Every spawned agent | ❌ KEEP |
| **Response Mode Selection** | ~4KB | Every spawn | ❌ KEEP |
| **Per-Agent Model Selection** | ~5KB | Every spawn | ❌ KEEP |
| **Source of Truth Hierarchy** | ~2KB | Reference doc | ⚠️ MAYBE |
| **Worktree Awareness** | ~3KB | Per-session if worktrees | ⚠️ MAYBE |

**Total lib/ candidates:** ~68KB
**Core retention:** ~40KB (after compression)

---

## 2. Recommended lib/ Split Architecture

### Core Principle: **Inline References with Lazy Loading**

The coordinator stays under 30KB by **referencing** lib/ files instead of **embedding** them. Each reference is a one-liner that tells the coordinator when to read the full file.

### lib/ File Structure

```
.squad/lib/                          (or .ai-team/lib/ until #69 completes)
├── casting.md                       (~15KB) — Casting & Persistent Naming
├── ceremonies.md                    (~8KB)  — Ceremony system
├── github-issues.md                 (~10KB) — GitHub Issues Mode
├── ralph.md                         (~12KB) — Ralph work monitor
├── prd-mode.md                      (~8KB)  — PRD intake and decomposition
├── human-members.md                 (~5KB)  — Human team member management
├── copilot-agent.md                 (~7KB)  — @copilot as squad member
└── artifact-format.md               (~3KB)  — Multi-agent artifact assembly
```

**Total lib/ content:** ~68KB (moved out of squad.agent.md)

### Core squad.agent.md Structure (Target: ~25KB)

```markdown
---
name: Squad
description: "Your AI team..."
---

## Coordinator Identity
[KEEP INLINE — 2KB]

## Init Mode
[KEEP INLINE — compressed to ~6KB]
Reference: "For casting, read .squad/lib/casting.md"

## Team Mode
[KEEP INLINE — core orchestration ~12KB]

### Routing
[KEEP INLINE — 3KB]

#### Ceremony Triggers
When {condition}, read .squad/lib/ceremonies.md and run the ceremony.

### Response Mode Selection
[KEEP INLINE — 4KB]

### Per-Agent Model Selection
[KEEP INLINE — 5KB]

### Client Compatibility
[KEEP INLINE — 3KB]

### GitHub Issues Mode (stub)
When user says "pull issues" or "work on #N", read .squad/lib/github-issues.md.

### Ralph Activation (stub)
When user says "Ralph, go" or "keep working", read .squad/lib/ralph.md.

### PRD Mode (stub)
When user provides a PRD, read .squad/lib/prd-mode.md.

### Human Team Members (stub)
When adding a human to the roster, read .squad/lib/human-members.md.

### Copilot Coding Agent (stub)
When adding @copilot, read .squad/lib/copilot-agent.md.

## Source of Truth Hierarchy
[KEEP INLINE — 2KB reference table]

## Constraints
[KEEP INLINE — 1KB]
```

**Estimated total:** ~25KB with headroom

---

## 3. Reference Mechanism Design

### Option A: Inline References (RECOMMENDED)

**How it works:**
- Each specialized mode has a 2-3 line stub in squad.agent.md
- Stub specifies the trigger condition and the file to read
- Coordinator reads the file on-demand when the condition matches

**Example stub:**

```markdown
### GitHub Issues Mode

When the user says "pull issues from {repo}", "work on issue #N", or "show the backlog":

1. Read `.squad/lib/github-issues.md` for full instructions
2. Follow the procedures defined there

This mode is NOT active until explicitly triggered.
```

**Pros:**
- Smallest core file size (~25KB with good headroom)
- Explicit load-on-demand semantics
- Easy to maintain (one file = one feature)
- New features can add lib/ files without bloating core

**Cons:**
- Adds ~1-2 tool calls per specialized mode activation (negligible latency)
- Coordinator must remember to read the file (but the stub is explicit)

### Option B: Preamble Load-All

**How it works:**
- First message of each session, coordinator reads ALL lib/ files
- Files stay in context window for the full session

**Pros:**
- Zero latency once loaded
- Coordinator has full instructions immediately

**Cons:**
- **Context window cost:** +68KB per session for features that may never be used
- **Token burn:** Reading 8 files at session start even if only using 1-2
- **Doesn't solve the problem:** GHE only cares about squad.agent.md file size, not context window. This just moves the problem from file → context.

### Option C: Auto-Detection via Session Scanning (REJECTED)

**How it works:**
- Coordinator scans the session for signals (mentions of "Ralph", "issue #", "PRD")
- Auto-loads lib/ files based on detected intent

**Why rejected:**
- Too clever — introduces failure modes if detection misses signals
- Still requires reading files (same latency as Option A)
- Harder to debug (implicit behavior)
- Option A is simpler and equivalent

---

## 4. Backward Compatibility Analysis

### For GHE Users (Primary Beneficiary)

**Before refactor:**
- ❌ Cannot use Squad (agent config exceeds 30KB limit)
- Error: "Invalid config: Prompt exceeds max length 30000"

**After refactor:**
- ✅ squad.agent.md ~25KB (well under limit)
- ✅ lib/ files in `.squad/lib/` or `.ai-team/lib/` (not subject to GHE limit)
- ✅ All features work identically

**Impact:** Zero breaking changes. Lib/ files are part of repo state, loaded on-demand.

### For Copilot Teams Users (No Impact)

**Before refactor:**
- ✅ Works fine (no 30KB limit)

**After refactor:**
- ✅ Still works fine
- ⚠️ Slight latency increase when activating specialized modes (~1-2s for file read)
- ✅ BUT: Only affects modes that are triggered (GitHub Issues, Ralph, PRD, etc.)
- ✅ Core coordination (spawning, routing, response modes) has ZERO latency change

**Impact:** Negligible. The file reads only happen when entering specialized modes, and the overhead is <2s per mode activation.

### Coordinator Behavior Validation

**Critical invariant:** The coordinator must behave identically before and after the split.

**Validation approach:**
1. **Functional equivalence:** Every instruction in lib/ files existed in squad.agent.md before the split. No new logic, just relocation.
2. **Test scenarios:** Run the same prompts on both versions, compare outputs:
   - "Pull issues from owner/repo"
   - "Ralph, keep working"
   - "Here's the PRD for my app"
   - "Add Sarah as Designer"
   - "Include @copilot on the team"
3. **Assert identical spawns:** Agent spawn prompts should be byte-identical before/after
4. **Assert identical routing:** Same user message routes to same agent

---

## 5. Implementation Plan

### Phase 1: File Extraction (Mechanical)

**Owner:** Verbal
**Effort:** 4-6 hours
**Deliverables:**
- Extract 8 sections to `.ai-team/lib/*.md` files
- Replace each section in squad.agent.md with inline reference stub
- Compress Init Mode and Team Mode core by removing redundant examples

**Steps:**
1. Create `.ai-team/lib/` directory
2. Extract `casting.md` (Casting & Persistent Naming section)
3. Extract `ceremonies.md` (Ceremonies section)
4. Extract `github-issues.md` (GitHub Issues Mode section)
5. Extract `ralph.md` (Ralph — Work Monitor section)
6. Extract `prd-mode.md` (PRD Mode section)
7. Extract `human-members.md` (Human Team Members section)
8. Extract `copilot-agent.md` (Copilot Coding Agent Member section)
9. Extract `artifact-format.md` (Multi-Agent Artifact Format section)
10. Replace each extracted section with 2-3 line stub in squad.agent.md
11. Verify file size: `Get-Item .github/agents/squad.agent.md | Select-Object Length`
12. Target achieved: <26KB

### Phase 2: Validation Testing

**Owner:** Hockney (Tester)
**Effort:** 4-6 hours
**Deliverables:**
- Test suite covering all lib/-dependent features
- Regression validation (before/after behavior identical)

**Test Scenarios:**
1. **GitHub Issues Mode:**
   - "Pull issues from bradygaster/squad"
   - Verify coordinator reads lib/github-issues.md
   - Verify issue listing works identically
2. **Ralph:**
   - "Ralph, go"
   - Verify coordinator reads lib/ralph.md
   - Verify work queue scanning works
3. **PRD Mode:**
   - "Here's the PRD: {paste}"
   - Verify coordinator reads lib/prd-mode.md
   - Verify decomposition works
4. **Human Members:**
   - "Add Brady as PM"
   - Verify coordinator reads lib/human-members.md
   - Verify roster update works
5. **Copilot Agent:**
   - "Include @copilot on the team"
   - Verify coordinator reads lib/copilot-agent.md
   - Verify capability profile setup works
6. **Casting (Init Mode):**
   - Run init on fresh repo
   - Verify coordinator reads lib/casting.md during roster proposal
   - Verify universe selection works
7. **Ceremonies:**
   - Trigger a ceremony (e.g., design review)
   - Verify coordinator reads lib/ceremonies.md
   - Verify facilitator spawn works

**Pass criteria:** All 7 scenarios produce identical behavior to pre-refactor version.

### Phase 3: Migration & Documentation

**Owner:** Fenster (Core Dev)
**Effort:** 4-6 hours
**Deliverables:**
- Migration added to `index.js` for `squad init` and `squad upgrade`
- Documentation updated for lib/ structure
- Issue #69 coordination (`.ai-team/lib/` → `.squad/lib/`)

**Steps:**
1. Add lib/ directory creation to `squad init`:
   ```javascript
   fs.mkdirSync(path.join(squadRoot, '.ai-team', 'lib'), { recursive: true });
   ```
2. Add migration to `squad upgrade`:
   - If `.ai-team/lib/` doesn't exist, create it
   - If squad.agent.md is >30KB (old version), show warning: "Your squad.agent.md is oversized. Upgrade to v0.5.0+ to fix GHE compatibility."
3. Update `README.md` to mention lib/ directory structure
4. Add `docs/architecture.md` documenting the lib/ pattern
5. ⚠️ **Issue #69 coordination:** When `.ai-team/` → `.squad/` rename happens, lib/ files move too. Add note to #69 migration plan.

---

## 6. Issue #69 Coordination

**Context:** Issue #69 renames `.ai-team/` → `.squad/`. This impacts lib/ paths.

**Strategy:**

### Phase 1 (v0.5.0): Ship Using `.ai-team/lib/`
- All references in squad.agent.md use `.ai-team/lib/`
- Works for both GHE and Copilot Teams users today
- No dependency on #69 landing

### Phase 2 (When #69 Ships): Simultaneous Path Update
- When `.ai-team/` → `.squad/` migration runs, it moves lib/ too
- Update all inline references from `.ai-team/lib/` → `.squad/lib/`
- One find/replace in squad.agent.md

**No blocking dependency.** Issue #76 can ship immediately using `.ai-team/lib/`. The path change is trivial when #69 lands.

---

## 7. Test Plan

### Pre-Flight Checks

Before refactor:
1. Capture baseline metrics:
   - Current squad.agent.md size (111,293 bytes)
   - Session start latency for 5 scenarios
   - Agent spawn time for specialized modes
2. Run 10 representative prompts, capture outputs

### Post-Refactor Validation

After refactor:
1. **Size validation:**
   - `Get-Item .github/agents/squad.agent.md | Select-Object Length`
   - Assert: <26,000 bytes
2. **Functional regression:**
   - Re-run the same 10 prompts
   - Assert: Outputs are identical (or functionally equivalent)
3. **Latency check:**
   - Measure session start time (should be unchanged)
   - Measure GitHub Issues Mode activation (may add ~1-2s for file read)
   - Measure Ralph activation (may add ~1-2s for file read)
4. **New install test:**
   - Run `npx github:bradygaster/squad` on fresh repo
   - Verify `.ai-team/lib/` directory is created
   - Verify init completes successfully
5. **Upgrade test:**
   - Clone a v0.4.0 squad (pre-refactor)
   - Run `npx github:bradygaster/squad upgrade`
   - Verify lib/ directory is created
   - Verify squad.agent.md is updated with stubs

### GHE Smoke Test (Critical)

**Cannot test directly (no GHE instance available)**, but validation:
1. Check file size: <30KB
2. Check that all references are relative paths (not absolute)
3. Check that lib/ files are in repo (not external dependencies)
4. Document in release notes: "GHE users should test in their environment and report issues"

---

## 8. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| Coordinator forgets to read lib/ file when needed | High | Low | Explicit stubs with clear triggers; validation tests catch this |
| File read fails (path issue, missing file) | High | Low | Add file existence checks; clear error messages |
| Latency increase annoys users | Medium | Low | Only affects specialized modes; <2s overhead; document in release notes |
| #69 path change breaks references | Medium | Low | Find/replace in squad.agent.md when #69 ships; coordinated release |
| Users manually edit squad.agent.md and break stubs | Low | Medium | Document that stubs are required; add comments in file |
| GHE has other undocumented limits | Medium | Low | Request community testing; document workarounds if found |

**Overall Risk:** LOW. The refactor is mechanical file surgery. Validation gates catch regressions.

---

## 9. Effort Breakdown

### Squad Time Estimates

| Phase | Agent | Work | Hours |
|-------|-------|------|-------|
| **Phase 1: Extraction** | Verbal | Extract 8 sections to lib/, add stubs | 4-6h |
| **Phase 2: Testing** | Hockney | Run 7 validation scenarios | 4-6h |
| **Phase 3: Migration** | Fenster | Update init/upgrade, docs | 4-6h |
| **Total** | — | — | **12-16h** |

### Parallel Work Opportunities

- Verbal's extraction work (Phase 1) is **sequential** (one file at a time to avoid merge conflicts)
- Hockney can write test scenarios **in parallel** with Phase 1 (draft tests before refactor lands)
- Fenster's migration work (Phase 3) is **blocked** on Phase 1 completing (needs new lib/ structure)

**Critical path:** Verbal → Fenster (10-12h sequential minimum)

**With parallelism:** Hockney overlaps with Verbal, reducing wall-clock time to ~8-10 days if working incrementally

---

## 10. Success Criteria

### Must-Have (P0)

- ✅ squad.agent.md file size <30KB (ideally ~25KB)
- ✅ All 7 specialized modes work identically to pre-refactor
- ✅ `squad init` creates `.ai-team/lib/` and populates it
- ✅ `squad upgrade` migrates existing installs to lib/ structure
- ✅ Validation tests pass (100% functional equivalence)

### Should-Have (P1)

- ✅ Documentation updated (README, architecture.md)
- ✅ Latency overhead <2s for specialized mode activation
- ✅ Issue #69 coordination plan documented

### Nice-to-Have (P2)

- ✅ GHE community feedback collected post-release
- ⚠️ Performance benchmarks published (before/after latency)
- ⚠️ Compression of Init Mode and Team Mode core (not required for <30KB, but helps headroom)

---

## 11. Recommendation

**PROCEED WITH IMPLEMENTATION.**

- **Architecture is sound:** Inline references with lazy loading is the simplest, most maintainable approach
- **Size target is achievable:** ~68KB moves to lib/, core stays at ~25KB
- **Risk is low:** Mechanical file surgery with validation gates
- **Effort is reasonable:** 12-16 squad-hours across 3 agents
- **No blocking dependencies:** Can ship using `.ai-team/lib/` immediately; #69 path change is trivial later

**Recommended sequencing:**
1. **Week 1 Day 3-4:** Verbal extracts files (Phase 1)
2. **Week 1 Day 5:** Hockney validates (Phase 2)
3. **Week 1 Day 5-6:** Fenster adds migration (Phase 3)

**Target delivery:** End of Week 1 (v0.5.0 Day 6-7)

---

## Appendix: Alternative Approaches Considered

### Alternative 1: Compression Only (No lib/ Split)

**Approach:** Aggressively compress squad.agent.md by removing examples, redundant instructions, and verbose sections.

**Target:** ~30KB via compression alone

**Why rejected:**
- Compression gains are limited (~15-20KB at most)
- File would still be at GHE limit with zero headroom
- Next feature added would exceed 30KB again
- Harder to maintain (dense, telegraphic instructions)
- Doesn't solve long-term growth problem

### Alternative 2: External URL References

**Approach:** Host lib/ files externally (GitHub repo, CDN) and reference by URL

**Why rejected:**
- Introduces external dependency (network calls, auth)
- Breaks offline/airgapped environments
- Users can't modify behavior (lib/ files are local and editable in Option A)
- More complexity for near-zero benefit

### Alternative 3: Dynamic Composition at Install Time

**Approach:** Generate squad.agent.md at install time by concatenating core + lib/ files based on user preferences

**Why rejected:**
- Still produces >30KB output file (doesn't solve GHE limit)
- Adds complexity to install/upgrade flow
- Hard to version control (which components were included?)
- Breaks "one file is source of truth" model

**Inline references (Option A) is the clear winner.**

---

## Next Steps

1. **Brady approves this architecture** → Proceed to Phase 1
2. **Verbal begins extraction** (Phase 1, 4-6h)
3. **Hockney writes test scenarios** (parallel with Phase 1)
4. **Fenster prepares migration code** (Phase 3, after Phase 1 completes)
5. **Full validation** (Phase 2, 4-6h)
6. **Ship in v0.5.0**

---

**Questions for Brady:**
1. Approve this architecture? Any modifications?
2. Preferred lib/ location: `.ai-team/lib/` initially (rename with #69) or block on #69 completing first?
3. Acceptable to add ~1-2s latency when activating specialized modes (GitHub Issues, Ralph, PRD)?

---

**End of Architecture Design**


### 2026-02-16: CCA Compatibility Assessment for Squad v0.5.0

**By:** Kujan  
**What:** Researched whether Squad can run from the Copilot Coding Agent (CCA). GO/NO-GO determination for v0.5.0 scope.  
**Why:** Issue #25 asks if CCA can boot Squad — load squad.agent.md, spawn sub-agents, and work as a full squad session. This is the async comms breakthrough mentioned in Proposal 030.

---

## Research Findings

### 1. Custom Agent Files — ✅ CONFIRMED

**Status:** YES, CCA reads `.github/agents/*.agent.md` the same way Copilot CLI does.

- CCA discovers custom agents from `.github/agents/` automatically (repo-level) or `<org>/.github/agents` (org-level)
- After commit to main, the agent appears in Copilot's agent picker for CLI, VS Code, and GitHub.com
- CCA can be pointed at `squad.agent.md` as its governing agent via `/delegate` commands or issue assignment
- The custom agent profile includes name, description, prompt instructions, and optional MCP server definitions

**Implication:** Squad's governance model (squad.agent.md) is CCA-compatible. CCA can load Squad instructions.

---

### 2. Tool Availability: `task` Tool — ⚠️ PARTIAL / UNKNOWN

**Status:** UNCLEAR — documentation does not confirm `task` tool availability in CCA environment.

Research findings:
- VS Code uses `runSubagent` (not `task`) for sub-agent spawning
- CCA documentation describes `/delegate` and `/task` commands at the **user level** (CLI commands to invoke CCA), NOT as tools available **inside** CCA's execution environment
- No documentation found confirming that CCA, once running, has access to the `task` tool to spawn further sub-agents
- CCA is described as operating in an ephemeral cloud-based environment (GitHub Actions)

**Implication:** High risk. Squad's architecture depends entirely on spawning real sub-agents via the `task` tool. If CCA lacks this tool, Squad cannot function as designed.

**Action Required:** Empirical test. Deploy a test custom agent to `.github/agents/` that attempts to call the `task` tool and observe whether it succeeds or fails.

---

### 3. Background Mode — ❌ UNLIKELY

**Status:** NO — CCA operates asynchronously by default, but likely does not support `mode: "background"` for sub-agent spawning.

- CCA's asynchronous model means **CCA itself** runs in the background (no user in the loop during execution)
- But this is different from **CCA spawning background sub-agents** using `mode: "background"`
- VS Code uses parallel sync subagents (not background mode) — multiple subagents launched in one turn run concurrently but block until all complete
- No documentation found describing CCA's ability to spawn fire-and-forget background tasks

**Implication:** Squad's parallel fan-out pattern (spawn 3-5 agents as background tasks, poll with `read_agent`) likely not available. Could fall back to VS Code's pattern (parallel sync subagents in one turn), but this requires `task` or `runSubagent` tool availability first.

---

### 4. MCP Server Access — ✅ CONFIRMED (with caveats)

**Status:** YES, CCA can access configured MCP servers.

- CCA supports MCP (Model Context Protocol) server connections
- Custom agents can declare MCP server dependencies in their `.agent.md` frontmatter
- Repo-level or org-level MCP configuration via JSON file or GitHub settings
- GitHub MCP server (issues, PRs, commits) is a default MCP server
- Playwright MCP server (web interactions) is also available

**Caveats:**
- MCP servers must be explicitly configured (not automatic)
- Remote servers requiring OAuth may not be supported
- CCA only uses MCP "tools" (not resources or prompts)

**Implication:** Squad's dependency on GitHub MCP server (for issue management) is feasible. MCP access alone does not solve the sub-agent spawning problem.

---

### 5. File System Access — ⚠️ CONSTRAINED

**Status:** YES, but with critical limitations.

- CCA runs in an ephemeral containerized environment (GitHub Actions)
- CCA can read/write files in the repository
- **CRITICAL CONSTRAINT:** `.ai-team/` is gitignored on main (per Squad's architectural decision from Proposal 015 and team decisions)
- CCA cannot read `.ai-team/decisions.md`, `.ai-team/agents/*/history.md`, or other Squad filesystem state
- All CCA governance must be self-contained within `.github/agents/squad.agent.md`

**Implication:** This fundamentally constrains the CCA-as-squad-member model. CCA cannot load Squad's full memory (decisions, history, skills) from `.ai-team/` because those files don't exist in CCA's environment. CCA can only follow `squad.agent.md` conventions, not the full Squad filesystem state.

**Workaround:** Embed essential Squad governance (casting policy, routing table, ceremony triggers) directly into `squad.agent.md`. This makes `squad.agent.md` larger but self-sufficient.

**File writes:** CCA can write to `.ai-team/` if the directory structure is created during CCA's session. Changes can be committed back via PR. This is the "state commitment" pattern described in Issue #25.

---

### 6. Session Model — ✅ COMPATIBLE (with design constraints)

**Status:** YES, CCA's asynchronous session model works for Squad, but eliminates interactive flows.

- CCA operates asynchronously — no user in the loop during execution
- Human gates exist at workflow boundaries: task assignment (start) and PR review (end)
- CCA cannot run Squad ceremonies that require human input (e.g., design meetings with ask_user)
- CCA cannot run Squad's "ask for clarification" flows

**Implication:** CCA-Squad is a batch execution model. User delegates task → CCA executes → CCA opens PR. Squad's interactive ceremonies (Scribe sync gates, human input prompts) must be skipped or deferred to PR review stage.

**Acceptable degradation:** CCA operates as a "silent sprint" — no mid-flight human input, no ceremony gates, work product delivered as PR for human review.

---

### 7. Scope Limitations — ⚠️ MODERATE

**Status:** CCA can handle well-scoped, actionable tasks. Complex, multi-step work requires decomposition.

- CCA is most reliable with well-defined, atomic tickets
- Broad, ambiguous requirements should use the Plan agent (VS Code) to decompose before handoff
- Session duration: persistent but may timeout on inactivity
- Complexity ceiling: single-issue work is the sweet spot; full multi-agent sprints are risky without sub-agent spawning

**Implication:** CCA-Squad is best suited for single-issue execution, not full sprint orchestration. Without confirmed `task` tool access, multi-agent fan-out is not possible, limiting CCA to single-agent inline work.

---

## Go/No-Go Assessment

### ❌ NO-GO for v0.5.0 — BLOCKED ON SUB-AGENT SPAWNING

**Verdict:** Squad cannot run from CCA in v0.5.0 **unless** empirical testing confirms `task` or equivalent sub-agent spawning tool is available.

**Blocking Issues:**

1. **No confirmed sub-agent spawning mechanism.** Documentation does not confirm that CCA has access to `task`, `runSubagent`, or any equivalent tool for spawning sub-agents. Squad's architecture is built entirely on multi-agent orchestration — without spawning, Squad is reduced to a single inline agent (not Squad).

2. **`.ai-team/` gitignore constraint.** CCA cannot read Squad's memory (decisions, history, skills) because those files are gitignored. This breaks Squad's knowledge continuity across sessions. Workaround is to embed governance in `squad.agent.md`, but this is a major architectural shift.

3. **No background mode.** CCA likely does not support `mode: "background"` for sub-agents, eliminating Squad's parallel fan-out pattern. Could fall back to VS Code's parallel sync pattern, but requires sub-agent spawning first.

**What's Missing:**

| Capability | Required for Squad? | CCA Status | Impact |
|------------|---------------------|------------|--------|
| Custom agent files | YES | ✅ Confirmed | Unblocked |
| Sub-agent spawning (`task` tool) | YES | ⚠️ Unknown | **BLOCKER** |
| Background mode (`mode: "background"`) | Preferred | ❌ Unlikely | Degraded but acceptable |
| MCP server access | YES | ✅ Confirmed | Unblocked |
| File system access (read `.ai-team/`) | YES | ❌ Gitignored | **MAJOR CONSTRAINT** |
| File system access (write `.ai-team/`) | YES | ✅ Possible | Unblocked |
| Async session model | Preferred | ✅ Confirmed | Unblocked |

---

## Recommended Action Plan

### Phase 1: Spike (2-4 hours) — Empirical Test

**Owner:** Kujan or Verbal  
**Goal:** Confirm or deny `task` tool availability in CCA environment.

**Steps:**

1. Create `.github/agents/spawner-test.agent.md` in a test repo:
   ```markdown
   ---
   name: Spawner Test
   description: Test whether CCA can spawn sub-agents
   ---
   
   Your job: attempt to spawn a sub-agent using the `task` tool with `agent_type: "explore"` and `prompt: "List files in current directory"`.
   
   Report:
   - If successful: "SUCCESS: task tool available, sub-agent spawned"
   - If tool not found: "FAILURE: task tool not available"
   ```

2. Delegate an issue to this agent via CCA: `gh copilot delegate "Test sub-agent spawning" --agent spawner-test`

3. Observe CCA's behavior:
   - Does it attempt to call `task`?
   - Does it report tool not found?
   - Does it fall back to inline work?

4. Document findings in this decision file.

**Outcome determines next steps:**

- **If `task` tool available:** GO for Phase 2 (CCA integration design).
- **If `task` tool NOT available:** NO-GO. CCA cannot run Squad. Consider alternative architectures (see Fallback Options).

---

### Phase 2: CCA Integration Design (8-12 hours, conditional on Phase 1 SUCCESS)

**Owner:** Kujan + Verbal  
**Goal:** Architect CCA-Squad integration with confirmed tooling.

**Design Questions:**

1. **Governance embedding:** How much of Squad's governance (routing, casting, ceremonies) must be embedded directly into `squad.agent.md` given `.ai-team/` is unavailable?
2. **Memory handoff:** How does CCA persist state (decisions, history) back to `.ai-team/` if it writes during execution? Does state commit happen in the PR?
3. **Ceremony degradation:** Which Squad ceremonies can run in CCA (no human input) and which must be skipped?
4. **Launch mode:** Does CCA-Squad spawn sub-agents (if `task` available) or work inline as a single agent?

**Deliverables:**

- Updated `squad.agent.md` with CCA-specific instructions (platform detection: CLI vs VS Code vs CCA)
- CCA compatibility section in `docs/scenarios/client-compatibility.md`
- Testing plan for CCA-Squad integration

---

### Fallback Options (if Phase 1 FAILS)

If `task` tool is not available in CCA, Squad cannot operate as a multi-agent system. Fallback architectures:

#### Option A: CCA as Squad Member (Not Coordinator)

- CCA does NOT run Squad
- CCA is a **member** of Squad's roster (like `@copilot` in team.md)
- User delegates work to Squad via CLI or VS Code
- Squad coordinator routes suitable tasks to CCA via `/delegate` (if gh CLI is available)
- CCA executes single-agent work, opens PR, Squad reviews

**Pros:**
- Leverages CCA's strengths (async execution, single-issue focus)
- No sub-agent spawning required
- Fits Squad's existing routing model

**Cons:**
- CCA is a tool used BY Squad, not Squad itself
- Does not achieve "CCA boots Squad" vision from Issue #25

#### Option B: Lightweight CCA Mode (Single-Agent Squad)

- CCA loads `squad.agent.md` but operates as a single inline agent (no sub-agent spawning)
- `squad.agent.md` includes fallback instructions: "If `task` tool not available, work inline without delegation"
- CCA follows Squad conventions (casting, routing, decision persistence) but executes all work itself
- CCA writes decisions/history to `.ai-team/` and commits via PR

**Pros:**
- Achieves "CCA loads Squad governance" goal
- Squad conventions (memory, decisions) are preserved
- Works with confirmed CCA capabilities

**Cons:**
- Not true multi-agent Squad — single agent pretending to be a team
- Loses Squad's core value prop (specialization, parallel fan-out)

#### Option C: Defer to v0.6.0

- Acknowledge CCA integration is blocked on platform capabilities
- Document findings in compatibility matrix
- Monitor GitHub's Copilot roadmap for sub-agent spawning in CCA
- Revisit in v0.6.0 when platform evolves

**Pros:**
- Avoids over-engineering workarounds for missing capabilities
- Focuses v0.5.0 on confirmed CLI/VS Code parity
- Sets realistic expectations

**Cons:**
- Delays async comms breakthrough from Proposal 030
- User's stated priority (#25) is deferred

---

## Summary

**Current State:** CCA can load `squad.agent.md` as a custom agent, but cannot spawn sub-agents or read `.ai-team/` memory. This makes true Squad operation impossible without empirical confirmation of `task` tool availability.

**Recommended Path:**

1. **Immediate:** Run Phase 1 spike (2-4h) to test `task` tool in CCA
2. **If YES:** Proceed with Phase 2 design (8-12h) for v0.5.0
3. **If NO:** Select fallback option (A, B, or C) and document in v0.5.0 scope

**Risk Level:** HIGH. Proceeding without Phase 1 confirmation is architectural gambling.

---

**Signed:** Kujan (GitHub Copilot SDK Expert)  
**Date:** 2026-02-16



### 2026-02-18: v0.4.2 release scope — Insider Program
**By:** bradygaster (via Copilot), with Keaton and Kobayashi analysis
**What:** Ship v0.4.2 as the Insider Program release before v0.5.0. Scope:
- #94: Insider Program infrastructure (branch, CI/CD, docs, CLI help) — Kobayashi
- #93: README /agents → /agent docs fix — McManus
- Everything else stays in v0.5.0 (especially #69 rename, #76 GHE refactor, #62 CI/CD hardening)
**Why:** The Insider Program is testing infrastructure that enables incremental validation of v0.5.0 work. Shipping it as v0.4.2 unblocks early testing feedback without coupling to the breaking changes.

# Decision: Research Hypotheses for Squad Investment Validation

**Date:** February 2026  
**Requestor:** Brady  
**Decided by:** Keaton  
**Status:** Proposed for review

---

## Problem
The executive summary demonstrates *structural* Squad value (6,400 hours saved, 10–50× token multiplier, 61% adoption). But investment decisions require *causal* proof: Does Squad actually improve developer outcomes? Does it drive retention? Does it scale predictably?

Brady's directive: Design customer research to validate or invalidate the investment thesis.

---

## Solution
Formulated **6 testable hypotheses** (4 core + 2 exploratory) mapped to distinct research methods:

1. **H1: Task Completion Speed & Quality** — A/B time-motion study (6–8 wks, $15–25K)
   - Proves: Real productivity gains, not just metrics artifacts
   
2. **H2: Accessibility Barrier Reduction** — Longitudinal cohort study (3 wks, $10–18K)
   - Proves: Squad democratizes Copilot access; lowers learning curve 40–60%
   
3. **H3: Retention via Lock-In** — Retrospective cohort + retention simulator (4–5 wks, $8–14K)
   - Proves: Switching costs are real; customer LTV improves
   
4. **H4: Complexity Scaling & ROI** — Portfolio analysis + regression (6–8 wks, $12–20K)
   - Proves: Squad ROI inflection point; know where to sell
   
5. **H5: Token Multiplier Validation** — Telemetry cohort analysis (2–4 wks, $5K)
   - Proves: Token multiplier (12–35×) is real; Copilot revenue expansion
   
6. **H6: Organizational Adoption** — Retrospective org-level network analysis (3–4 wks, $4–7K)
   - Proves: Network effects exist; expansion is organic

**Portfolio execution:** Phase 1 (H1+H2 parallel, wks 1–8), Phase 2 (H3+H4 parallel, wks 9–16), Phase 3 (H5+H6 parallel, wks 9–12).  
**Total cost:** ~$54–91K over 16 weeks.

---

## Investment Go/No-Go Criteria
Investment confidence gates:
- ✅ **H1 confirmed** → Market demand proven (greenlight: proceed)
- ✅ **H3 confirmed** → Retention moat real (greenlight: unit economics work)
- ✅ **H5 in range 12–35×** → Revenue multiplier justified (greenlight: margin scales)
- ✅ **H4 shows clear inflection** → GTM clarity (greenlight: know target segment)

**Minimum threshold:** 3 of 4 confirmed = proceed with scaling. 2 or fewer = reconsider thesis.

---

## Trade-Offs
- **Time investment:** Phase 1 begins immediately; full suite takes 16 weeks. Can front-load H1+H2 for faster early signal (8 weeks).
- **Participant recruitment:** H1 (time-motion) requires 24–32 committed developers; lead time ~2–3 weeks. Must start recruitment now.
- **Data access:** H5 (token multiplier) requires GitHub Copilot API telemetry partnership. Coordination overhead but low execution cost.
- **Statistical confidence:** Some hypotheses (H1, H4) require moderate sample sizes (24–32, 61–80); others (H2, H6) are more exploratory. Mix of rigor.

---

## Success Criteria
- **Research credibility:** Each hypothesis has clear success/failure metrics (not ambiguous)
- **Decision relevance:** Each answers a gate-level investment question
- **Grounding:** All hypotheses rooted in exec summary data (token multiplier, adoption rate, time savings)
- **Parallelizability:** Portfolio designed so teams can run hypotheses in parallel (Phases 1–3)

---

## Alternatives Considered
1. **Single flagship study (H1 only)** — Faster, cheaper, but doesn't address retention, scaling, or expansion. Too narrow for investment decision.
2. **Qualitative case studies** — Rich but anecdotal. Can't drive go/no-go decision alone; would require quant follow-up anyway.
3. **Internal telemetry expansion** — Squad repos have session logs, decision files, commit patterns. Could extract more signal without external participants. But can't measure comparative effectiveness (squad vs. solo Copilot) without control cohort.
4. **Wait for natural attrition** — Observe who stays/churns over time. But too slow (6–12 months) for investment timeline.

**Recommendation:** Hybrid approach is best—combine the 6 hypotheses, run Phases 1–3 in parallel where possible, and use early Phase 1 results (H1, H2) to inform resource allocation for Phase 2+3.

---

## Owner & Next Steps
- **Research lead:** TBD (assign someone with research design + statistical chops)
- **Phase 1 kickoff:** Begin H1 participant recruitment this week (longest lead time)
- **Brady alignment:** Review this hypothesis suite — any gaps? Any hypotheses to prioritize or defer?
- **Resource lock:** Approve $54–91K research budget

---

**Reference artifact:**  
`.ai-team/agents/keaton/research-hypotheses-draft.md` — Full hypothesis documentation with methods, metrics, success criteria.

---

# Research Opportunities Section Added to Executive Summary

**Author:** McManus  
**Date:** 2026-02-14  
**Status:** Decided  
**Context:** Brady requested addition of research framing to executive summary before Caveats section.

---

## Decision

Added "## Research Opportunities" section to `docs/squad-executive-summary.md` (lines 176–241), immediately before the Caveats section. The section presents four core customer research hypotheses (H1–H4) in executive-friendly format.

**Rationale:**
- Executive summary establishes *observable* 6-month impact (token multiplier, adoption rate, time savings estimates).
- Go/no-go investment decisions require *causal proof*: Does Squad actually improve developer effectiveness? Is lock-in real? Does ROI scale predictably?
- Research section bridges this gap by proposing testable studies that generate the evidence needed.
- Tone and structure match existing document (metrics-driven, scannable, executive-facing).

---

## Section Contents

| Hypothesis | Addresses | Timeline | Cost |
|---|---|---|---|
| **H1: Task Completion Speed & Quality** | Does Squad make devs faster + maintain code quality? | 6–8 weeks | $15–25K |
| **H2: Accessibility Barrier Reduction** | Does Squad lower the entry barrier for new Copilot users? | 3 weeks active | $10–18K |
| **H3: Retention via Switching Cost** | Is the lock-in moat real? Do users stay longer? | 4–5 weeks | $8–14K |
| **H4: Complexity Scaling & ROI Threshold** | Does ROI scale predictably? Where does Squad break even? | 6–8 weeks | $12–20K |

---

## Research Prioritization (Recommended)

**Immediate (Weeks 1–8):** H1 + H2 in parallel  
- Answer core market question: *Does Squad work for end users?*
- Result: speed proof + accessibility proof = foundation for enterprise case studies

**Phase 2 (Weeks 9–16):** H3 + H4 in parallel  
- Answer business model question: *Is the moat real? Does it scale?*
- Result: retention economics + GTM clarity = complete go/no-go framework

**Go/No-Go Threshold:**
- If H1 + H3 both confirm → Squad is a business
- Add H4 confirmation → Enterprise GTM clarity
- If <2 confirm → Reconsider expansion thesis

**Total investment:** ~$45–77K over 16 weeks

---

## Synthesis Notes

This section synthesized Keaton's detailed research methodology (`keaton/research-hypotheses-draft.md`) into executive-digestible format. Key translation moves:

1. **Hypothesis → Key Metrics** — Reduced Keaton's detailed study designs to 1–2 line summaries; elevated key metrics & business insights to headline level.
2. **Operational Framing** — Reframed as "which studies to run first?" (operational) vs. "here's a research portfolio" (academic).
3. **Voice Continuity** — Matched existing exec summary tone: confident, direct, metrics-first, no hedging. Avoided jargon.
4. **Go/No-Go Alignment** — Closed with explicit investment decision criteria ("if this confirms, we proceed") rather than "here are four interesting studies."

---

## No Changes to Other Sections

- Caveats section remains unchanged (now follows Research Opportunities)
- All existing content above "Research Opportunities" unchanged
- Document structure: [Hero] → [The Numbers] → [Where Time Comes From] → [Copilot Usage Multiplier] → [Barriers Removed] → [Business Domains] → [Adoption Patterns] → [Retention & Lock-In] → [1% Projection] → [Why Squad Matters] → **[Research Opportunities]** → [Caveats]


### 2026-02-19: Milestone Moment Blog Template — GitHub Trending Post

# Milestone Moment Blog Template — GitHub Trending Post

**Timestamp:** 2026-02-19  
**Author:** McManus  
**Decision:** Milestone moment blog posts (launches, trending, major media coverage) use a specific template structure for authenticity and impact.

## Context

Squad hit #9 on GitHub Trending Developers on February 19, 2026 — 12 days after launch (February 7). This is a genuine milestone and a moment the community needs to hear about directly.

The challenge: How do we celebrate without sounding either corporate or fake-humble? The answer lies in structure, not adjectives.

## Template Structure for Milestone Posts

**Opening**: Lead with the number. State what happened, when it happened, and verify it's real.

**Context**: Place the moment in a larger story. What else is trending? Is there a wave? How does Squad fit? This reframes the post from vanity to significance.

**Timeline**: Show the velocity. 12 days from launch to trending validates something fundamental about the product or market fit. Let the facts do the talking.

**What's Happening**: Surface the signal beneath the trending number — people are starring, which means they're trying, building, talking. Make it concrete.

**Why Now**: Three theses or fewer. What converged? What was true yesterday that's more obviously true today? (Product moment, feature fit, market wave.)

**What This Unlocks**: What changes now that this is public? Discovery, credibility, momentum — tangible consequences.

**What's Next**: Reset expectations. Trending is a sprint. The test is whether people who starred still use Squad in March. Keep the audience grounded.

**Energy comes from facts and honesty, not adjectives or emotion.**

## Voice Principles

- No editorial framing. No "thrilled," "excited," or "proud." Facts only.
- Quote other projects on the trending list (agentsys, agent-of-empires, inbox-zero). This feels inclusive, not competitive.
- Acknowledge transience explicitly. Shows confidence — we're not expecting trending to last forever, just celebrating that it happened.
- Let numbers be the proof: 12 days, #9, 131 tests (from earlier post), 42 agents (agentsys), #1 on the list.
- Close with "what's the real test?" — reframe to what matters long-term.

## Implementation

Published as `docs/blog/012-trending-on-github.md` with standard frontmatter (title, date, author, tags, status: published).

This template reusable for future milestones: major press coverage, API launches, significant contributor milestones.

## Precedent

This follows Brady's "straight facts" directive (2026-02-10) and the tone shift from opinionated storytelling to factual technical communication. Structure by impact, not narrative. Energy from specificity.


### 2026-02-17: Insider Program CI/CD Infrastructure (Issue #94 Phase 0+1)

**Author:** Kobayashi (Git & Release Engineer)  
**Date:** 2026-02-17  
**Status:** Implemented & Ready for Manual Insider Branch Creation  
**Triggered by:** Issue #94 — Enable insider/early-adopter program for Squad  

## What

Built the complete CI/CD infrastructure for the insider branch, enabling early adopters to install from 
px github:bradygaster/squad#insider.

### Phase 0: Branch Protection

**Updated:** squad-main-guard.yml (both .github/workflows/ and 	emplates/workflows/)

- Added insider to pull_request.branches and push.branches triggers
- Guard now blocks .ai-team/**, .ai-team-templates/**, and 	eam-docs/** from insider (same protection as main/preview)
- Maintains state integrity — insider is a protected branch, not a dev branch

### Phase 1: CI/CD Workflows

**1. Updated squad-ci.yml** (both source and template)
- PR triggers: [dev, preview, main, insider] — now includes insider
- Push triggers: [dev, insider] — tests run on every insider push
- Effect: Full CI coverage on insider branch

**2. Created squad-insider-release.yml** (both source and template)
- **Trigger:** Push to insider branch
- **Behavior:**
  1. Runs tests (blocks release if tests fail)
  2. Reads base version from package.json (e.g.,  .4.0)
  3. Appends -insider+{short_sha} to version (e.g.,  .4.0-insider+a3f7e2)
  4. Creates annotated git tag: 0.4.0-insider+a3f7e2
  5. Publishes GitHub Release marked as prerelease: true
  6. Release notes explain this is a dev build with clear installation instructions
  7. Verifies release was created successfully
- **Idempotency:** Git handles retags. Multiple pushes generate new releases as short_sha changes.
- **Permissions:** contents: write (minimum needed for tagging and release creation)

### Technical Decisions

1. **Version suffix format:** SemVer 2.0 compliant prerelease syntax (-insider+{short_sha}). The + is metadata, preventing accidental version precedence issues.

2. **Test gate before release:** Tests run before any release. Failure blocks the entire workflow. This is the minimum safety mechanism.

3. **No package.json modification:** Insider versions are computed at workflow-time, not persisted. Base version stays clean. Prevents merge conflicts on dev.

4. **Sync invariant maintained:** All changes applied symmetrically to both .github/workflows/ (production) and 	emplates/workflows/ (shipped to users). This prevents user repos from having stale workflows.

5. **Patterns from existing workflows:** Used Node 22, ctions/checkout@v4, ctions/setup-node@v4, GITHUB_TOKEN, and gh CLI — consistent with squad-release.yml and squad-preview.yml.

## Consequences

- Insider releases are independent of stable releases. They don't affect main/preview.
- Early adopters explicitly opt-in via #v0.4.0-insider+{sha} tag — not default branch.
- Guard blocks all forbidden paths from insider. State integrity is protected.
- Release process for stable (squad-release.yml) is unaffected.

## Next Steps (Brady)

1. **Create the insider branch manually:**
   `bash
   git checkout -b insider
   git push origin insider
   `

2. **Verify workflows run on first push:**
   - GitHub Actions → Workflows → squad-ci.yml (tests) and squad-insider-release.yml (auto-release)
   - Releases tab should show new 0.4.0-insider+{sha} release (marked prerelease)

3. **Test installation:**
   `bash
   npx github:bradygaster/squad#v0.4.0-insider+{sha}
   `

## Distribution & Safety

- **Three-layer protection still holds:** .gitignore, package.json files array, .npmignore
- **Insider releases don't affect npm:** They're GitHub-only (npx from GitHub tag)
- **State integrity protected:** Guard blocks .ai-team/** from insider like main/preview
- **Release pipeline unaffected:** squad-release.yml (stable) and squad-preview.yml continue unchanged


### 2026-02-19: Platform-Specific Command Clarity & Insider Documentation (Issue #93, #94 Phase 2)

**By:** McManus (DevRel)

**What:** Two related fixes to improve developer clarity and insider onboarding:

1. **Command Clarification (#93):** README.md updated (line 55) to explicitly distinguish Copilot CLI (/agent singular) from VS Code (/agents plural). Previous version only mentioned /agents, causing confusion for CLI users.

2. **Insider Program Documentation (#94 Phase 2):** Three-tier documentation structure:
   - **README.md:** One-sentence mention with install command in new "Insider Program" section after "Upgrade"
   - **CONTRIBUTORS.md (new):** Insider program summary, how to join, what to expect, hall of fame placeholder
   - **docs/insider-program.md (new):** Comprehensive 4.3K guide covering installation, version format, bug reporting, FAQ, rollback

**Why:** 
- **Command clarity:** One line of ambiguous documentation creates friction for CLI users. Platform-specific phrasing removes doubt.
- **Three-tier documentation depth:** Different audiences need different detail levels. README browsers need awareness (one-liner). Community members need entry point + expectations (CONTRIBUTORS.md). Committed insiders need comprehensive reference (docs/).
- **Honor system design:** Minimal ceremony (no forms, invitations, caps). Aligns with open-source norms. Branch-based distribution transparent via version string (v0.4.2-insider+abc1234f).

**Rationale for Tier Structure:**
- README (awareness): Casual browsers. "There's an insider option. Here's how." No cognitive load.
- CONTRIBUTORS.md (summary): Community members deciding to join. "What is this? How do I join? What should I expect?"
- docs/insider-program.md (deep dive): Committed insiders. "Everything I need to know about continuous builds."

Each tier answers different questions for different audiences without information overload.

**Rationale for Branch-Based Distribution:**
- **Transparent:** Users know exactly what code they're running (version string shows insider status)
- **Easy to maintain:** No special registry, no dual-publish complexity, no separate package management
- **Self-selected community:** Insiders chose to be on bleeding edge. Lower frustration when rough edges exist.

**Files Changed:**
- README.md (line 55: added platform clarification; new "Insider Program" section after "Upgrade")
- CONTRIBUTING.md (added "Insider Program" section with link to CONTRIBUTORS.md)
- CONTRIBUTORS.md (new: insider program entry point + contributor hall of fame)
- docs/insider-program.md (new: comprehensive insider guide)

**Not Changed:**
- index.js (post-init output already correct from Fenster's work)
- No changes to CLI behavior or branching strategy

**Status:** ✅ COMPLETE — Both issues resolved. Documentation deployed.

### 2026-02-19: Insider Program infrastructure verified and complete
**By:** Kobayashi
**What:** Audited all Phase 1-3 implementation of issue #94 (Insider Program). All checklist items verified: CI/CD triggers, guard protection, insider release workflow, documentation (README, CONTRIBUTING, docs/insider-program.md, CONTRIBUTORS.md), CLI help text. All 11 workflow templates confirmed in sync between .github/workflows/ and 	emplates/workflows/.
**Why:** Implementation landed in commit 263626a on dev. Audit confirms the insider branch infrastructure is ready — once Brady creates the insider branch from dev, the CI/CD pipeline will auto-tag insider releases with {version}-insider+{short-sha} format and the guard workflow will prevent .ai-team/ state from leaking. Distribution path 
px github:bradygaster/squad#insider is documented and ready.

---

### 2026-02-20: User directive — consolidate everything under .squad
**By:** Brady (via Copilot)
**What:** In v0.5.0, everything should be in .squad that isn't in .copilot — EXCEPT files that must stay at root for npx to work (index.js, package.json, templates/). Those stay at root.
**Why:** User request — captured for team memory. Consolidation directive for the .ai-team → .squad rename migration. Clarified after team discussion: templates/ stays at root because npx needs it there. No guard carve-outs needed.



### 2026-02-20: Branch content policy — what ships where
**By:** Squad (Coordinator), requested by Brady
**What:** Formal policy defining which files belong on each protected branch
**Why:** 164 forbidden files leaked onto insider when branch was created from dev. Need a checklist to prevent this on every branch creation.

---

## Branch Content Policy

### ✅ ALLOWED on all protected branches (main, preview, insider)

| Path | Description |
|------|-------------|
| `.github/agents/` | Agent definition (squad.agent.md) |
| `.github/workflows/` | CI/CD workflows |
| `.github/copilot-instructions.md` | Copilot coding agent instructions |
| `.gitattributes` | Merge driver config |
| `.gitignore` | Git ignore rules |
| `.npmignore` | npm publish ignore rules |
| `index.js` | CLI entry point |
| `package.json` | Package manifest |
| `templates/` | Files copied to consumer repos during init |
| `docs/` (except `docs/proposals/`) | Public documentation, blog, features, scenarios |
| `test/` | Test suite |
| `README.md` | Project readme |
| `CHANGELOG.md` | Release changelog |
| `CONTRIBUTING.md` | Contribution guide |
| `CONTRIBUTORS.md` | Contributors list |
| `LICENSE` | License file |

### ❌ FORBIDDEN on all protected branches (main, preview, insider)

| Path | Why | Enforced by |
|------|-----|-------------|
| `.ai-team/` | Runtime team state — dev/feature branches only | squad-main-guard.yml |
| `.ai-team-templates/` | Internal format guides — dev only | squad-main-guard.yml |
| `team-docs/` | Internal team content — dev only | squad-main-guard.yml |
| `docs/proposals/` | Internal design proposals — dev only | squad-main-guard.yml |
| `_site/` | Build output — never committed | .gitignore |

### 🔀 Branch-specific extras

| Branch | Extra files allowed | Notes |
|--------|-------------------|-------|
| **main** | — | Cleanest. Tagged releases cut from here. |
| **preview** | — | Pre-release. Same content rules as main. |
| **insider** | `docs/insider-program.md`, `.github/workflows/squad-insider-release.yml`, `templates/workflows/squad-insider-release.yml` | Early access channel. Auto-tags on push. |
| **dev** | `.ai-team/`, `.ai-team-templates/`, `team-docs/`, `docs/proposals/` | Development. All internal files live here. |
| **squad/* feature** | Same as dev | Feature branches inherit dev rules. |

### 📋 Branch Creation Checklist

When creating a new protected branch from dev:

1. `git checkout -b {branch} dev`
2. Remove forbidden paths:
   ```bash
   git rm -r --quiet .ai-team/ .ai-team-templates/ docs/proposals/ 2>/dev/null; true
   git rm -r --quiet team-docs/ 2>/dev/null; true
   ```
3. Commit: `git commit -m "chore: remove dev-only files from {branch}"`
4. Push: `git push -u origin {branch}`
5. Verify: `git ls-tree -r --name-only origin/{branch} | grep -E "^\.ai-team|^team-docs|^docs/proposals"` (should return nothing)



### 2026-02-20: .squad Consolidation — Architectural Analysis & Implementation Feasibility (consolidated)

**By:** Keaton (Lead), Fenster (Core Dev)

#### What

Analysis of Brady's consolidation directive ("everything under .squad/ except npx-required files") with special focus on templates placement and implementation impact across 4 systems (index.js, guard workflow, tests, npm packaging).

Two independent analyses converged on the same recommendation: **keep templates/ at root, merge .ai-team-templates/ into .squad/templates/ (reference only)**.

#### Keaton's Architecture Analysis

**The Tension:** Moving templates/ into .squad/ creates a conflict:
- .squad/ is blocked from protected branches (guard workflow)
- templates/ MUST be on main (ships in npm package via package.json files array)

**Two Distinct Audiences:**
- templates/ → public (shipped to npm consumers, consumer-facing)
- .squad/ → private (runtime team state, dev branches only)

**Architectural Concerns with Full Consolidation:**
1. Guard workflow complexity — requires path-level exception (breaks semantic clarity of ".squad = team state that never ships")
2. Consumer directory confusion — .squad/templates/ in consumer repo would mystify users ("is this for me to edit?")
3. npm package oddity — dotted directory in package suggests "agent state" not "install boilerplate"
4. Maintenance debt — future maintainers must remember templates are the exception
5. Naming convention misalignment — .github/workflows/, .vscode/, .copilot/ all follow pattern "one purpose per directory"

**Recommendation:** Keep templates/ at root. Full consolidation (Option B) creates more technical debt than it resolves.

**Why this works:** Brady's underlying goal (eliminate .ai-team/ naming sprawl) is achieved by:
- .ai-team/ → .squad/ (state)
- .ai-team-templates/ → .squad/templates/ (reference guides, inside .squad/)
- templates/ → templates/ (install boilerplate, root level)

This gives one branded location (.squad/) for team artifacts while keeping install pipeline clear. 85% achieves Brady's goal with 80% less complexity.

#### Fenster's Implementation Impact Analysis

**4 Systems Affected, 6 Files, ~30 Lines Changed:**

| System | Effort | Complexity | Risk |
|--------|--------|-----------|------|
| index.js | Low | Mechanical (18 refs → 1 variable) | Low |
| Guard workflow | Low | 3-line carve-out (Option A: allowlist within blocklist) | Medium (must test) |
| Tests | Trivial | 1 path constant change | Low |
| npm packaging | Low | Precision required (package.json files array + .npmignore) | Medium (verify with npm pack) |
| **Total** | **3–4 hours** | **Low-Medium** | **Medium** |

**Verdict:** Feasible. Go with nested .squad/templates/ approach. Guard carve-out is negligible.

**Guard Implementation (Option A - Recommended):**
`javascript
if (f.startsWith('.squad/')) {
  // Templates ship on main — allow them
  if (f.startsWith('.squad/templates/')) return false;
  return true;
}
`
This is 3 lines, clean, readable, future-proof.

#### Synthesis

Both analyses independently converged on the same recommendation: **keep templates/ at root** but **merge .ai-team-templates/ into .squad/templates/**. This approach:
- Honors Brady's consolidation goal (one .squad/ namespace for team artifacts)
- Simplifies guard workflow (no exceptions, or minimal 3-line carve-out)
- Maintains semantic clarity (public boilerplate != private state)
- Reduces maintenance burden
- Improves consumer experience (no confusing .squad/templates/ in consumer repos)

**Implementation scope:** 3–4 hours, low-medium complexity, manageable risk. Enables v0.5.0 timeline.

---

### Why

Brady's consolidation directive is sound—reduce naming sprawl. But full consolidation of templates into .squad/ introduces unnecessary technical debt (guard exceptions, maintenance burden, semantic confusion). This decision balances Brady's organizational goal with operational simplicity. Both architectural and implementation perspectives align on the same path forward.

#### Decision Status

✅ **DECIDED.** Referenced in epic #69 clarification comment. Informs 6 sub-issues (#101–#106) for v0.5.0.



## 2026-02-20: v0.5.0 Epic Update — Consolidated Directive & Sub-Issues

**By:** Keaton (Lead)  
**Context:** Brady's clarified consolidation directive from today's session + architectural decision (Feb 20) on `templates/` placement

---

## What Was Done

### 1. Updated Issue #69 with Clarification Comment

Added comprehensive comment to #69 (epic) documenting:
- **Brady's directive:** Everything under `.squad/` except npx-required files (index.js, package.json, `templates/` at root)
- **Directory migration plan:**
  - `.ai-team/` → `.squad/`
  - `.ai-team-templates/` → `.squad/templates/` (merged)
  - `templates/` → stays at root (npx requirement)
- **Guard workflow policy:** Block `.squad/**` entirely from protected branches (no carve-outs needed)
- **Branch content policy:** Formalized Feb 20 in `copilot-branch-content-policy.md`
- **Scope of affected work:** CLI, squad.agent.md, workflows, templates, docs, tests

### 2. Created 6 Sub-Issues under #69 Epic

Each sub-issue tagged with `release:v0.5.0` and `type:feature`, assigned to v0.5.0 milestone:

| Issue # | Title | Scope |
|---------|-------|-------|
| #101 | CLI dual-path support for .squad/ migration | index.js: check .squad/ first, fall back to .ai-team/; `squad upgrade --migrate-directory` command; deprecation warning |
| #102 | squad.agent.md path migration - 745 references | Update ~745 references across ~123 files; team root detection for both paths |
| #103 | Workflow dual-path support for .squad/ migration | 6+ GitHub Actions workflows handle both paths; guard workflow verification |
| #104 | Merge .ai-team-templates/ into .squad/templates/ | Move format guides from .ai-team-templates/ to .squad/templates/; update references |
| #105 | Documentation and test updates for .squad/ paths | 27 docs files + 2 test files; migration guide; README updates |
| #106 | Guard workflow enforcement - verify .squad/ blocking | Verify guard workflow blocks .squad/** and docs/proposals/**; test PR rejection |

All sub-issues include:
- Clear task description and scope
- Acceptance criteria (checkboxes)
- Parent epic reference (#69)
- Related issue cross-links where appropriate

### 3. Documented Architectural Decision

This decision captures:
- **Consolidation directive clarification** — Brady's explicit "everything under .squad/ except npx files" + rationale
- **Templates placement rationale** — Why `templates/` stays at root despite the consolidation goal (guard simplicity, npm package clarity, consumer experience)
- **Guard policy simplification** — Block `.squad/**` entirely; no path-level exceptions needed
- **Timeline & scope** — Sub-issues enable discrete, parallelizable work toward v0.5.0 release (March 16)

---

## Why This Matters

**Before today:** Ambiguity about which files belong where in `.squad/` migration. Unclear whether `templates/` should be nested (complexity) or stay at root (simplicity).

**After today:** 
1. Clear directive documented in epic comment + sub-issues
2. Architectural decision documented (templates at root is simpler & safer)
3. Six discrete work items enable parallel execution by team members
4. Guard workflow stays simple (block `.squad/**` entirely; no exceptions)

**For v0.5.0 release:** These sub-issues form the complete scope for the consolidation work. No hidden scopes or dependencies lurking in the epic description.

---

## What Depends on This

- **v0.5.0 epic (#91)** — This clarification unblocks Fenster's implementation of #69
- **Branch content policy enforcement** — Guard workflow already blocks `.squad/` and `docs/proposals/` (Feb 20); this formalizes the policy
- **Consumer migration** — `squad upgrade --migrate-directory` (sub-issue #101) enables repos with `.ai-team/` to migrate

---

## Historical Context

- **Feb 15:** #69 created with initial scope (1,672 references across 130+ files)
- **Feb 17:** #91 (epic) marked as "IN PROGRESS" with #69 as MUST SHIP
- **Feb 20 (today):** Brady clarified "everything under .squad/ EXCEPT npx files"; Keaton analyzed templates placement; squad decided: keep `templates/` at root, merge `.ai-team-templates/` into `.squad/templates/`
- **Feb 20 (today):** Branch content policy formalized; guard workflow updated to block `docs/proposals/` too
- **Feb 20 (today):** This epic updated with clarification comment + 6 sub-issues

---

## Acceptance

This decision is complete. All sub-issues are visible in GitHub; comment is posted to #69; policy is documented in decisions inbox.

**Next step:** Route sub-issues to team for implementation (Fenster on CLI/migration, Verbal on agent.md, Kobayashi on workflows, etc.).



### 2026-02-19: CLI vs VS Code Command Parity

**By:** McManus

**What:** Documentation now explicitly mentions both `/agent` (Copilot CLI, singular) and `/agents` (VS Code, plural) wherever users are directed to launch Squad. Updated 6 documentation files across scenarios and guides.

**Why:** Issue #93 reported confusion — users on the CLI see `/agent` but all docs say `/agents`. This creates friction at the critical first moment ("I can't find the command"). The fix is simple: be platform-aware. When instructing users to launch Squad, say "Type `/agent` (CLI) or `/agents` (VS Code)." This removes ambiguity and respects the fact that we ship on two platforms with different affordances.

**Files changed:**
- `docs/tour-first-session.md` — first-session walkthrough (critical UX)
- `docs/scenarios/existing-repo.md` — adding Squad mid-project  
- `docs/scenarios/mid-project.md` — onboarding late-stage projects
- `docs/scenarios/new-project.md` — new project setup (also critical)
- `docs/scenarios/private-repos.md` — private repo guidance
- `docs/scenarios/troubleshooting.md` — problem statement for agent discovery

**Platform context:** README.md and index.js already had correct dual-platform language (looks like this was partially addressed in HEAD). The fix ensures consistency across all scenarios and guides.

**Decision:** Explicit platform notation is clearer than implicit. We say "CLI" and "VS Code" in parentheses to make it unmissable. No need for fancy UI—just honest writing.

### 2026-02-20: Memory Architecture Proposal — Team Review (consolidated)

**By:** Keaton (Lead), Verbal (Prompt Engineer), Fenster (Core Dev)  
**Date:** 2026-02-20  
**Status:** Team consensus documented — no implementation in v0.5.0  
**Requested by:** Brady (bradygaster)  
**Context:** Brady attended external presentation on agent memory architecture (identity/memory/social layers with RAG) and requested team feasibility analysis.

**What:** Three independent analyses across architecture, prompt design, and implementation:

1. **Keaton (Architecture):** ~40% overlap with existing Squad, ~30% extension, ~30% new. Recommendation: cherry-pick wisdom.md + now.md for v0.6.0, defer social modeling + RAG + formal hooks. v0.5.0 stays mechanical (rename only).

2. **Verbal (Prompt Engineering):** Two good ideas (wisdom/episode split + active state file), reject hook formalization (context already dense) + social modeling (mask.md = trust violation, contradicts charter consistency).

3. **Fenster (Core Dev):** Feasibility: wisdom.md + now.md = 9-hour MVP. Blockers: JSONL on Windows (file locking, git merge conflicts, line endings), decisions.md already 300KB. Solution: markdown + SEM format, `.squad/` not repo root.

**Why:**

- **Wisdom extraction** addresses real problem: history.md mixes timeless patterns with episodic events, signal-to-noise degrades over time. Splitting legitimate improvement.

- **now.md (active state)** addresses cold-start: agents re-derive context from history.md every session. Lightweight state file eliminates this.

- **RAG infrastructure not ready:** Copilot platform doesn't expose embedding APIs. Building RAG ourselves requires vector store dependency (massive shift from "prompts + filesystem"). This is platform-dependency feature, not "build it ourselves" feature.

- **Social modeling privacy concern:** Storing per-person interaction logs, interpretive models, strategic masks even on local filesystem is design choice requiring explicit Brady approval. Not opt-in by default.

- **Formal pre/post hooks regress:** Coordinator already IS the hook system. Spawn template already manual pre-hook. Scribe already manual post-hook. Formalizing doesn't add capability, adds abstraction debt.

- **Context window pressure:** Proposal adds 3K-8K tokens, keeps us under 200K budget. But decisions.md already 300KB (~75K tokens). Real blocker is decisions.md unbounded growth, not new memory files.

- **Backward compatibility:** Two migrations in close succession (v0.5.0 rename + v0.6.0 restructure) is user friction. Stagger it.

- **.squad/ vs repo root:** Anything adopted goes under `.squad/agents/{name}/` (wisdom.md, now.md) or `.squad/memory/` (shared). Proposal's repo-root layout (identity/, memory/, social/) would pollute every consumer repo, contradict v0.5.0 consolidation, break upgrade path.

**Decision:**

- **v0.5.0 (current):** Stay mechanical. Rename + consolidation only.
- **v0.6.0:** Ship wisdom.md (split history.md events/patterns) + now.md (agent current state). 9-hour implementation: wisdom.md extraction (2h), now.md creation (2h), Scribe update (3h), tests (2h).
- **v0.7.0+:** Evaluate social modeling, episodic memory, RAG pending: privacy model + platform capabilities + data validation.
- **Never** (unless rethought): Formal pre/post hooks — coordinator already IS hooks.

**Related:**
- Issue: #101 (directory consolidation)
- Issue: #106 (migration tooling)
- Epic: #69 (.squad consolidation)

**Team consensus:** wisdom.md + now.md in v0.6.0. Defer social layer + RAG. Don't formalize hooks.

---


