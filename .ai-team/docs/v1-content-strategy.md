# SDK Replatform v1 Content Strategy

**Owner:** McManus (DevRel)  
**Created:** 2026-02-21  
**Audience:** Internal team (documentation of strategic content approach for v1 launch)

---

## 1. v1 Stamping Convention

When Squad ships v0.6.0 (hybrid SDK + prompt coordinator) and v0.7.0 (full SDK), we are shipping a **replatform**—not a feature release. This is a new foundation. Every piece of public content must answer: "Is this old world (v0.x) or new world (v0.6+ SDK-based)?"

### Stamping Rules

**Code and Comments:**
- Every file touching SDK runtime adds comment header on first modified line:
  ```javascript
  // v1: SDK-orchestrated coordinator. Replaces prompt-based router.
  ```
- Every new function or class adds `v1:` prefix comment:
  ```javascript
  // v1: SquadClient wraps CopilotClient lifecycle management
  ```
- No `v1:` tag on unchanged code from v0.5.x. Unchanged = not replatformed.

**Documentation (docs/ and public-facing):**
- Add badge near headline if content is v1-specific:
  ```markdown
  ### Agent History v1
  > **v1 feature** — Available in Squad v0.6.0+. [Migration guide](docs/migration/v0.6.0-sdk.md)
  ```
- If a feature exists in both v0.x and v1, use **parallel sections**:
  ```markdown
  ## Config System
  
  ### v0.5.2 and earlier
  [old approach with .squad/]
  
  ### v0.6.0+ (SDK-based)
  [new approach with config.json]
  ```
- Never hide the old way. Users pinning v0.5.2 need to understand what they're NOT getting.

**Blog Posts:**
- Add YAML frontmatter tag: `v1-content: true` if post covers SDK features.
- Tag older content: `v1-content: false` (implied for posts before v0.6.0).
- v1 posts **always include** a "Backward Compatibility" section stating whether v0.5.2 users benefit.

**Changelog (CHANGELOG.md):**
- SDK-replatformed features marked with 🏗️ emoji prefix:
  ```
  - 🏗️ v1: Coordinator refactored as TypeScript orchestrator (SDK-based)
  - ✨ New: Agent MCP isolation (v1 only)
  - 🐛 Fix: Silent success mitigation (v0.5.2 compatible)
  ```

### Why This Matters

Users need to know: "Is this available to me?" A user on v0.5.2 doesn't want to read v1 features. A user on v0.6.0 wants to understand what v1 enables. Clear stamping prevents frustration and support overhead.

---

## 2. Blog Cadence & Calendar

We ship v1 across **~32 weeks in 3 phases**. Content strategy mirrors milestone delivery.

### Phase 1: Foundation (Weeks 1–4, M0)
**Goal:** Build confidence in SDK viability. No public marketing. Internal validation only.

**Blog:** 1 post (technical deep-dive for team)
- **Post:** "Building the Foundations — SDK Spike Results" (internal, `.ai-team/blog/`)
- **Timing:** Week 4 (after M0 viability gate)
- **Audience:** Potential adopters of Squad SDK (developers, platforms)
- **Topics:** SDK architecture choices, why TypeScript, initial performance metrics
- **v1-content:** true (establishes SDK baseline)

### Phase 2: Core Runtime (Weeks 3–12, M1–M2)
**Goal:** Prove SDK orchestrator works. Introduce new config system. Feature parity approaching.

**Blog Schedule:**
1. **Week 8:** "Agent Lifecycle Redesigned" (how v1 agents run differently, benefits)
   - Audience: Current Squad users
   - Content: How v1 improves reliability, session recovery, isolation
   - v1-content: true
2. **Week 12:** "Configuring Your Squad in v1" (new config.json, migration path)
   - Audience: Users ready to upgrade from v0.5.2
   - Content: Step-by-step config migration, backward compat promise
   - v1-content: true

### Phase 3: Feature Parity + Distribution (Weeks 10–26, M3–M4)
**Goal:** Feature parity achieved. Distribution ready. Marketplace in sight.

**Blog Schedule:**
1. **Week 16:** "Routing Redone: SDK-native Policy Engine" (technical post on routing)
   - Audience: Operators, team leads
   - Content: How SDK routing improves reliability vs. prompt-based routing
   - v1-content: true
2. **Week 20:** "Squad Goes Universal" (multi-language support, project detection)
   - Audience: Non-Node.js users (Python, Go, .NET teams)
   - Content: Squad now works on any project type, agent isolation per stack
   - v1-content: true
3. **Week 24:** "Agent Marketplace Preview" (export/import, sharing agents)
   - Audience: Community, early adopters building reusable agents
   - Content: How to export your squad, import shared agents, marketplace vision
   - v1-content: true

### Phase 4: Launch (Weeks 28–32, M5–M6)
**Goal:** v0.6.0 ships. Migration guide published. Community celebrates.

**Blog Schedule:**
1. **Week 29:** "v0.6.0 — The Replatform" (launch announcement)
   - Audience: All Squad users
   - Content: What changed, what didn't, why it matters, migration path (optional), zero-friction promise
   - v1-content: true
2. **Week 30:** "Migration Guide for v0.6.0" (pinned blog post, also in docs/)
   - Audience: Current v0.5.2 users
   - Content: Step-by-step upgrade (2 steps: update, run migration). Rollback plan. FAQ.
   - v1-content: true (but framed for easy downgrade)
3. **Week 31:** "What's Next for Squad" (v0.7.0 preview, roadmap)
   - Audience: Contributors, team members
   - Content: Full-SDK v0.7.0, marketplace acceleration, next challenges
   - v1-content: true

### Calendar Summary

| Week | M | Phase | Blog Topic | Audience |
|------|---|-------|-----------|----------|
| 4 | M0 | Foundation | "SDK Spike Results" | Team, SDK adopters |
| 8 | M1 | Runtime | "Agent Lifecycle Redesigned" | Current users |
| 12 | M2 | Config | "Configuring Your Squad in v1" | Ready-to-upgrade users |
| 16 | M3 | Parity | "Routing Redone" | Operators |
| 20 | M3 | Parity | "Squad Goes Universal" | Non-Node users |
| 24 | M4 | Distribution | "Agent Marketplace Preview" | Community |
| 29 | M6 | Launch | "v0.6.0 — The Replatform" | All users |
| 30 | M6 | Launch | "Migration Guide" | v0.5.2 users |
| 31 | M6 | Launch | "What's Next" | Contributors |

**Tone:** Facts only. No narrative framing, no sales language. Energy from technical specificity and completeness.

---

## 3. Documentation Plan

Docs at each milestone define what users can learn and do.

### M0 (Foundation)
**Exit Criteria:** SDK connection works, session pool proven.

**Docs Required:**
- `.ai-team/docs/` only (internal):
  - `M0-spike-results.md` — What we learned about SDK. Architecture choices justified.
  - Technical spike notes (for team, not public).

**Public Docs:** None. M0 is not marketed.

### M1 (Core Runtime)
**Exit Criteria:** Tools, hooks, agent lifecycle work.

**Docs Required:**
- `docs/architecture/v1-agent-lifecycle.md` (new)
  - How agents run under v1. Session persistence. Recovery from crash. Isolation.
- `docs/architecture/v1-sdk-orchestrator.md` (new)
  - SDK coordinator replaces prompt-based router. Why it's better.
- Blog posts (see section 2).

**Public Update:** README adds: "v0.6.0 (SDK-based) available in beta. [Learn what's new](docs/whatsnew.md)."

### M2 (Config & Init)
**Exit Criteria:** Config-driven architecture; new init flow.

**Docs Required:**
- `docs/guides/v1-config-migration.md` (new)
  - Old `.squad/agents/` → new `config.json/agents`. Step-by-step.
  - Backward compat promise: v0.5.2 forever pinnable.
- `docs/guides/v1-initialization.md` (new)
  - New init flow. First-time setup. Project type detection.
  - No new dependencies for v0.6.0 (opt-in for v0.7.0).

**Update Existing:**
- `README.md`: Add "Getting Started with v0.6.0 Beta" section.

### M3 (Feature Parity)
**Exit Criteria:** Coordinator runs on SDK; routing matches v0.4.1; 80%+ tests pass.

**Docs Required:**
- `docs/features/` review and update
  - Every feature page gets "v0.5.2 vs v0.6.0" comparison table.
  - Example: Parallel Work, Casting, Ralph Heartbeat, etc.
- `docs/migration/v0.6.0-full-guide.md` (comprehensive)
  - What's new (benefits). What's unchanged (continuity). What's dropping (rarely, with reason).
  - Per-feature compatibility matrix.
  - Troubleshooting (what breaks, how to fix, rollback option).
- `docs/architecture/v1-feature-comparison.md` (technical reference)
  - Internal mapping: v0.5.2 code → v0.6.0 code. For maintainers.

**Blog posts:** See section 2 (weeks 16, 20).

### M4 (Distribution)
**Exit Criteria:** npm + GitHub distro; install/upgrade work; ~5MB bundle.

**Docs Required:**
- `docs/guides/v0.6.0-install-and-upgrade.md` (new)
  - Old: `npx github:bradygaster/squad`
  - New: Same command, v0.6.0 lands in your node_modules.
  - Upgrade path: `npx github:bradygaster/squad upgrade` (same as before).
- **No documentation changes for users.** Distribution is transparent.

### M5 (Agent Repository)
**Exit Criteria:** Export/import; remote agents; marketplace MVP.

**Docs Required:**
- `docs/guides/v1-export-import.md` (new)
  - Export your agents: `squad export --universe usual-suspects --output team.json`
  - Import shared agents: `squad import --url github.com/user/squad-universe`
  - Marketplace concept: where agents live, how sharing works.
- `docs/marketplace/` (new directory)
  - `README.md` — Agent marketplace concept.
  - `publishing.md` — How to publish your agents.
  - `discovering.md` — How to find and use shared agents.
- `docs/guides/v1-mcp-isolation.md` (optional, advanced)
  - What MCP isolation is (v1 feature). When you need it. How to configure.

**Blog post:** See section 2 (week 24, "Agent Marketplace Preview").

### M6 (Polish & Launch)
**Exit Criteria:** Docs complete, migration guide, v0.6.0-rc.1, Brady approval, launch.

**Docs Required:**
- `docs/migration/v0.6.0-everything.md` (final comprehensive guide)
  - Do I upgrade? (Yes, zero friction. No, v0.5.2 works forever.)
  - How do I upgrade? (One command: `npx github:bradygaster/squad upgrade`)
  - What's different? (Architecture internal; user experience identical or better.)
  - What if it breaks? (Rollback in 30 seconds: `npx github:bradygaster/squad@0.5.2`)
  - FAQ: 15 top questions pre-answered.
- `docs/whatsnew.md` (updated)
  - Latest section: v0.6.0 features, v0.6.0 benefits.
  - Previous sections: v0.5.2, v0.4.x (archive).
- README.md (final pass)
  - "What's New in v0.6.0" section replaces beta notice.
  - Stable, confident. Replatform is invisible to users; benefits are visible.

**Blog posts:** See section 2 (weeks 29–31, launch).

### Full Documentation Checklist

| Artifact | M0 | M1 | M2 | M3 | M4 | M5 | M6 |
|----------|----|----|----|----|----|----|-----|
| Agent Lifecycle design | — | ✅ | — | — | — | — | — |
| SDK Orchestrator design | — | ✅ | — | — | — | — | — |
| Config migration guide | — | — | ✅ | — | — | — | — |
| Init flow guide | — | — | ✅ | — | — | — | — |
| Feature comparison matrix | — | — | — | ✅ | — | — | — |
| Full migration guide | — | — | — | ✅ | — | — | ✅ |
| Install/upgrade guide | — | — | — | — | ✅ | — | — |
| Export/import guide | — | — | — | — | — | ✅ | — |
| Marketplace docs | — | — | — | — | — | ✅ | — |
| MCP isolation (advanced) | — | — | — | — | — | ✅ (opt) | — |
| Launch prep (final polish) | — | — | — | — | — | — | ✅ |

---

## 4. File Placement Rules

**Crystal clear. No ambiguity.**

### What Goes Where

#### `.ai-team/docs/` — Team Working Docs (Internal)
**Purpose:** Org, strategy, technical decisions, process, internal RFCs.

**Examples:**
- `milestones.md` — Milestone definitions (internal planning).
- `replatform-diagrams.md` — Mermaid diagrams for exec presentations.
- `sdk-opportunity-analysis.md` — Business case (confidential).
- `v1-content-strategy.md` — THIS FILE (strategy, not public).
- `crossover-vision-mcmanus.md` — Personal vision, team context (internal).
- `prds/` — All PRDs (product requirements, team reference).

**Access:** Team members, not published.

**Lifespan:** Lives indefinitely. Historical record.

#### `docs/` — Public Site Documentation
**Purpose:** Everything users read. On the public website. In the GitHub repo readme. Searchable.

**Examples:**
- `README.md` — Linked from every installation page.
- `guide.md` — First time learning Squad.
- `features/` — What Squad can do (Agent Lifecycle, Casting, Parallel Work, etc.).
- `migration/` — Step-by-step guides for changing versions.
- `whatsnew.md` — Release history.
- `architecture/` — How Squad works (for developers building on it).
- `sample-prompts.md` — Prompts to try.
- `scenarios/` — Use case walkthroughs.
- `community.md` — How to get involved, contribute, deploy Squad.

**Access:** Public. Indexed by search engines. Mirrored to marketing site.

**Lifespan:** Evolves with releases. Archive old versions in `migration/` subdirs.

#### `templates/` — CLI Scaffolding
**Purpose:** Files copied verbatim when users run `npx github:bradygaster/squad init`.

**Examples:**
- `squad.agent.md` — Coordinator prompt (becomes `.ai-team/agents/squad/AGENT.md`).
- `.github/workflows/squad-*.yml` — GitHub Actions (become user's workflows).
- `sample-prompts.md` — Starter prompts (becomes `.squad/sample-prompts.md` or `.ai-team/sample-prompts.md`).

**Access:** Public (users get them).

**Rule:** Minimal docs in templates. Assume users have access to full `docs/` after init.

#### Root Directory (C:\src\squad\)
**Markdown Files Allowed:**
- `README.md` — Project overview (public).
- `CHANGELOG.md` — Release history (public).
- `CONTRIBUTING.md` — How to contribute (public).
- `LICENSE` — Legal (required).

**Markdown Files NOT Allowed:**
- ❌ `PLAN.md` — Use `.ai-team/docs/` for planning.
- ❌ `NOTES.md` — Use `.ai-team/docs/` or `.ai-team/agents/{role}/history.md`.
- ❌ `INTERNAL-STRATEGY.md` — Use `.ai-team/docs/`.
- ❌ `DEV-GUIDE.md` — Use `docs/` (public) or `.ai-team/docs/` (internal).

**Why:** Repo stays clean. Users see README, CHANGELOG, CONTRIBUTING. Internal working docs stay in `.ai-team/`.

#### `.ai-team/` — Team Runtime State (Git-Ignored)
**Purpose:** Live state, decisions, agent memory, skills, decisions inbox.

**Never committed to git.** Protected by `.gitignore`.

**Examples:**
- `decisions.md` — Active decisions.
- `decisions/inbox/` — New decisions waiting for review.
- `agents/{role}/history.md` — Agent memory (resets per session, but template exists).
- `docs/` — Working docs (internal).
- `skills/{name}/SKILL.md` — Agent skills, learning.

---

## 5. Content Migration Plan (v1 Cutover)

When we ship v0.6.0 from a **new repo** (`squad-sdk`) or **same repo** (flagged as v1):

### Cutover Timeline

**Week 32 (M6 exit, before v0.6.0 release):**

1. **Freeze old docs** — `docs/` current as of M6.
   - README.md finalized with v0.6.0 "What's New" section.
   - `whatsnew.md` updated with v0.6.0 entry.
   - No further changes to v0.5.2 docs.

2. **v1-stamped content catalog** — McManus creates inventory:
   - All code comments with `v1:` prefix → count: X
   - All docs with v1-specific badges → count: Y
   - All blog posts with `v1-content: true` → count: Z

3. **Migration registry** — Record in `.ai-team/docs/`:
   - Exactly which files are v1-only.
   - Exactly which files have both v0.x and v1 sections.
   - Rollback plan: "If SDK breaks, revert these file edits."

### If Squad Stays in One Repo (Current Plan)

**Day of v0.6.0 release:**
- Tag: `v0.6.0`
- All docs in `docs/` are current.
- All v1-stamped code is live.
- `templates/` updated with v0.6.0 workflows.
- Users installing fresh get v0.6.0. Users upgrading via `squad upgrade` get v0.6.0.

**Backward compat:**
- `.ai-team/` structure unchanged. Old v0.5.2 state still readable.
- v0.5.2 users pinning `@0.5.2` get old behavior forever.
- No data loss. No destructive migration.

### If Squad Replatforms to Separate Repo (Future Option)

**If we ever move to `github.com/bradygaster/squad-sdk`:**

1. **Source repo stays** — `github.com/bradygaster/squad` is v0.x source (frozen, no new features, only patches).
2. **New repo** — `github.com/bradygaster/squad-sdk` is v0.6.0+ (SDK-based).
3. **Documentation split:**
   - `squad` repo docs remain v0.x only.
   - `squad-sdk` repo docs are v0.6.0+.
   - `squad.md` landing page links to both: "v0.5.2 users → [source repo]", "v0.6.0+ users → [SDK repo]".
4. **Users not impacted.**
   - `npx github:bradygaster/squad` still works (installation script routes to latest major version).
   - Existing projects never forced to move.

**Migration content plan:**
- `docs/migration/from-v0.5.2-to-squad-sdk.md` — If moving repos, how to handle.
- Cross-repo links in both README files.
- Blog post: "Squad Now Has a Sister: squad-sdk" (explains split, not scary).

### Migration Deliverables (M6)

**Content Handoff:**
- ✅ All v1-stamped content live in `docs/`.
- ✅ All `.ai-team/docs/` content archived (decision memory preserved).
- ✅ Blog posts published (9 total across phases).
- ✅ Migration guide final-reviewed by Brady.
- ✅ CHANGELOG.md v0.6.0 entry complete.
- ✅ README.md reflects v0.6.0 as stable, not beta.
- ✅ `docs/whatsnew.md` has v0.6.0 entry at top.
- ✅ `templates/` updated with v0.6.0 workflows.

**FAQ Published:**
- Where's my `.ai-team/` folder? (Unchanged, still works.)
- Do I have to upgrade? (No, v0.5.2 pinned works forever.)
- What breaks if I upgrade? (Nothing, zero-friction promise validated in testing.)
- How do I downgrade? (One command: `npx github:bradygaster/squad@0.5.2`.)

---

## Appendix: Messaging Principles

**Brady's Directive (2026-02-10):** All public-facing material = straight facts only. No editorial voice, sales language, or narrative framing.

**Applied to v1 Content:**

✅ **GOOD:**
> "v0.6.0 replaces Squad's coordinator with a TypeScript SDK orchestrator. Silent success bugs (undetected crashes) are eliminated. Agent sessions persist across CLI restarts. New `squad orchestrate` command available for advanced routing. Upgrade by running `npx github:bradygaster/squad upgrade`. Zero new dependencies required (SDK is optional for v0.6.0, required for v0.7.0)."

❌ **BAD:**
> "Excited to announce v0.6.0! We've reimagined Squad from the ground up, delivering lightning-fast orchestration and unparalleled reliability. The beautiful new SDK-based architecture is a game-changer for how teams collaborate with Copilot. 🚀"

**Why the difference:**
- Good: Specific, verifiable, actionable. Users know exactly what changed, what works, what's next.
- Bad: Adjectives, editorializing, vague excitement. Users leave confused about actual changes.

---

**End of v1 Content Strategy**
