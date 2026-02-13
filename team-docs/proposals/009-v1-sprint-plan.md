# Proposal 009: Squad v1 Sprint Plan

**Author:** Keaton (Lead)  
**Date:** 2026-02-08  
**Status:** Superseded — by Proposal 019  
**Approved by:** bradygaster (2026-02-08)  
**Amendments:** Sprint 0 added per Fenster/Keaton/Hockney review. Export/import split per Fenster. Tests start Sprint 1 per Hockney.  
**Triggered by:** bradygaster — 9 users, whole division talking. Make Squad the best AI dev tool out there. Period.

---

## The Thesis

Squad v1 is three things:

1. **A team that gets faster as the session progresses** (not slower)
2. **A team that travels with you** (portable, forwardable, upgradable)
3. **A team that gets smarter at what you do** (skills)

Everything in this sprint serves one of those three. If it doesn't, it's cut.

---

## What Makes the v1 Cut

### The Non-Negotiables (Brady's directives)

| Directive | What it means for v1 | Source proposal |
|-----------|---------------------|----------------|
| **Forwardability** | `npx create-squad upgrade` — existing users get new coordinator versions without losing their team | NEW (this plan) |
| **Portability** | Export/import squad identity across projects | 008 |
| **Skills** | Domain expertise that compounds across projects | NEW (this plan) |
| **Latency fix** | Squad feels faster at message 10 than message 1 | 007 |

### The v1 Feature Set

| Feature | Priority | Sprint | Effort |
|---------|----------|--------|--------|
| Forwardability (`upgrade` command) | **P0** | Sprint 1 | 4 hours |
| Latency P0 fixes (context caching + Scribe batching) | **P0** | Sprint 1 | 2 hours |
| Tiered response modes | **P0** | Sprint 1 | 3 hours |
| Coordinator direct handling | **P0** | Sprint 1 | 2 hours |
| History split (Portable Knowledge / Project Learnings) | **P0** | Sprint 2 | 3 hours |
| Skills system (definition, acquisition, export) | **P0** | Sprint 2 | 6 hours |
| Export/import CLI | **P0** | Sprint 2 | 6 hours |
| README rewrite (proposal 006) | **P1** | Sprint 3 | 2 hours |
| Testing infrastructure (happy path + round-trip) | **P1** | Sprint 3 | 4 hours |
| Progressive history summarization | **P1** | Sprint 3 | 3 hours |
| Lightweight spawn template | **P2** | Sprint 3 | 2 hours |

---

## Sprint 1: "Make It Fast" (Days 1-3)

**Goal:** A session at message 15 should feel as fast as message 1. Fix the DMV problem.

### 1.1 Forwardability Architecture (Fenster + Kujan)

**The problem Brady identified:** `index.js` line 30-32 skips `squad.agent.md` if it exists. That means when we ship coordinator improvements, existing users never get them. This is wrong.

**The fix: `npx create-squad upgrade`**

```
npx create-squad                # init (existing behavior, but ALWAYS writes squad.agent.md)
npx create-squad upgrade        # updates squad.agent.md + templates, preserves .ai-team/
```

**Implementation:**

1. **Change init behavior:** Remove the skip-if-exists guard on `squad.agent.md`. The coordinator file is OUR code, not user state. Always overwrite it. User state lives in `.ai-team/` — that's what we preserve.

2. **Add `upgrade` subcommand:** Same as init, but:
   - Overwrites `squad.agent.md` (always)
   - Overwrites `.ai-team-templates/` (always — these are reference templates)
   - Does NOT touch `.ai-team/` (team state, history, decisions, casting — sacred)
   - Prints what changed: "✓ squad.agent.md updated to v0.2.0"

3. **Version header in `squad.agent.md`:**
   ```markdown
   <!-- squad-coordinator-version: 0.2.0 -->
   # Squad Coordinator
   ```
   The upgrade command reads this header, compares to the new version, and reports the delta. If versions match, prints "Already up to date."

4. **Version `package.json`:** Bump to `0.2.0` for v1 release. The coordinator version tracks independently from the package version but they should align at release boundaries.

**What this changes about init:**

```javascript
// BEFORE (wrong for upgrades):
if (fs.existsSync(agentDest)) {
  console.log(`${DIM}squad.agent.md already exists — skipping${RESET}`);
} else {
  fs.copyFileSync(agentSrc, agentDest);
}

// AFTER (forwardable):
fs.mkdirSync(path.dirname(agentDest), { recursive: true });
fs.copyFileSync(agentSrc, agentDest);
console.log(`${GREEN}✓${RESET} .github/agents/squad.agent.md`);
```

The init flow ALWAYS writes the coordinator. Templates get the same treatment. `.ai-team/` directories are still created with `{ recursive: true }` (idempotent — safe to re-run).

**Trade-off:** If a user has manually edited `squad.agent.md` (adding custom instructions), init/upgrade will overwrite those edits. This is acceptable because: (a) `squad.agent.md` is documented as Squad-managed, not user-edited, (b) custom instructions should go in `.ai-team/` files that agents read, not in the coordinator itself, (c) we can add a `--preserve-coordinator` flag later if this becomes a real issue.

### 1.2 Latency P0: Context Caching + Scribe Batching (Verbal)

Direct from Proposal 007, Solutions 2 and 4. These are instruction-only changes to `squad.agent.md`.

**Context caching (add to Team Mode):**
```markdown
**Context efficiency:**
- On your first message this session: Read team.md, routing.md, registry.json.
- On subsequent messages: You already have these in your conversation context. 
  Do NOT re-read them unless a new agent was added or the user asks you to refresh.
```

**Scribe batching (modify After Agent Work):**
```markdown
**Scribe policy:**
- Spawn Scribe ONLY when there are files in .ai-team/decisions/inbox/.
- If no inbox files exist, skip Scribe entirely.
- Decision: no inbox files = no Scribe spawn. Period.
```

**Savings:** ~4.5s per message (caching) + ~10s on 50% of messages (Scribe). Zero risk.

### 1.3 Tiered Response Modes (Verbal + Keaton)

Direct from Proposal 007, Solution 1. The single highest-impact change.

**Add routing table to `squad.agent.md`:**

| Signal | Mode | What happens |
|--------|------|-------------|
| Quick factual question, status check | **Direct** | Coordinator answers. No spawn. ~2-3s. |
| "Change X to Y in file Z", single-line fix | **Direct** | Coordinator does it. No spawn. ~3-5s. |
| Follow-up to work done this session | **Lightweight** | Minimal spawn. Skip history/decisions reads. ~8-12s. |
| "Fix the bug in...", single-domain task | **Standard** | Full agent spawn with context. ~25-35s. |
| Multi-domain, "team build...", new feature | **Full** | Parallel fan-out, full ceremony. ~40-60s. |

**The rule:** Match ceremony to complexity. A 5-second task should not trigger a 30-second ceremony.

### 1.4 Coordinator Direct Handling (Verbal)

Expand the coordinator's permission to handle trivial tasks directly:

```markdown
**Coordinator handles directly (no spawn):**
- Quick factual questions about the project
- Single-line changes where file path and exact change are specified
- Status summaries and session catch-up
- File rename/move/delete when user specifies exactly what
- Confirming what an agent did in a previous turn

**Coordinator MUST spawn for:**
- Any task requiring domain judgment
- Multi-file changes
- Architecture decisions
- Tasks addressed to a specific agent by name
- Test writing, code review, quality assessment
```

### Sprint 1 Deliverables

- [ ] `npx create-squad upgrade` works
- [ ] Init always writes `squad.agent.md` (forwardable)
- [ ] Version header in `squad.agent.md`
- [ ] Context caching instructions live in coordinator
- [ ] Scribe batching instructions live in coordinator
- [ ] Tiered response mode routing table live in coordinator
- [ ] Coordinator direct handling rules live in coordinator
- [ ] Manual test: message 10 of a session feels dramatically faster

**Sprint 1 blocks:** Nothing. All changes are to `index.js` and `squad.agent.md`. Fully parallel work.

---

## Sprint 2: "Make It Yours" (Days 4-7)

**Goal:** Your squad travels with you. Your squad has skills. The relationship compounds.

### 2.1 History Split (Verbal + Keaton)

The prerequisite for everything in Sprint 2. From Proposal 008.

**Update history.md template:**

```markdown
# Project Context

- **Owner:** {user}
- **Project:** {project}
- **Stack:** {stack}
- **Created:** {date}

## Portable Knowledge

<!-- Observations about the USER that travel across projects. -->

## Project Learnings

<!-- Observations about THIS project's codebase, architecture, decisions. -->
```

**Update spawn prompt in `squad.agent.md`:**

```markdown
When appending to history.md, categorize your learnings:
- **Portable Knowledge** — user preferences, style, communication patterns.
  Things true regardless of project.
- **Project Learnings** — codebase architecture, file locations, tech choices.
  Things that only matter here.
```

**Existing histories:** No migration needed. Agents naturally adopt the split on their next write. Export heuristic handles unsplit histories.

### 2.2 Skills: The New Concept

**What is a skill?**

A skill is domain expertise that a squad acquires through repeated work in a specific area. It's not a user preference (that's Portable Knowledge). It's not project context (that's Project Learnings). It's **learned patterns about a technology, framework, or domain** that make the squad more effective.

**Examples:**
- "React: prefer functional components with hooks. Use React.memo for expensive renders. Test with React Testing Library, not Enzyme."
- "Express.js: middleware chain pattern. Always validate request body before business logic. Use express-validator."
- "PostgreSQL: use connection pooling. Prefer prepared statements. Index foreign keys."
- "CLI tools: use commander.js for arg parsing. Always support --help. Exit codes matter."

**Where skills differ from preferences:**

| Concept | Belongs to | Example | Portable across users? |
|---------|-----------|---------|----------------------|
| **Preference** | The user | "Brady prefers explicit error handling" | No (personal) |
| **Skill** | The squad | "React: use hooks, test with RTL" | Yes (domain knowledge) |
| **Project Learning** | The project | "Auth middleware is in src/auth/" | No |

A preference is about *who you work with*. A skill is about *what you work on*. Both are portable. But skills can be shared across squads — that's what makes them special.

**Implementation: `skills.md` per squad**

```markdown
# Squad Skills

<!-- Domain expertise acquired through project work. Portable and shareable. -->

## React
- Prefer functional components with hooks over class components
- Use React.memo for expensive render trees
- Test with React Testing Library (user-centric queries: getByRole, getByText)
- State management: prefer zustand for simple state, Redux Toolkit for complex
- Acquired: 2026-02-10 (project: my-dashboard)

## TypeScript
- Strict mode always
- Prefer discriminated unions over type assertions
- Use zod for runtime validation at boundaries
- Acquired: 2026-02-07 (project: squad)

## Express.js
- Middleware chain: auth → validate → business logic → response
- Use express-validator for request validation
- Error handling: custom AppError class with status codes
- Acquired: 2026-02-15 (project: my-api)
```

**How skills are acquired:**

1. **Implicit:** When agents work on a project and observe patterns, they log domain learnings to `skills.md` instead of project-specific history. The spawn prompt instruction:
   ```markdown
   When you learn something about a TECHNOLOGY or FRAMEWORK (not the project, 
   not the user), add it to .ai-team/skills.md under the relevant domain heading.
   Skills are patterns that would help on ANY project using that technology.
   ```

2. **Explicit:** The user can tell the squad directly: "Team, we always use zustand for state management in React projects. Add that as a skill."

3. **On export:** Skills travel with the squad. When imported into a new React project, the squad already knows the team's React patterns.

**How skills are used:**

The spawn prompt includes:
```markdown
Read .ai-team/skills.md — these are domain skills your squad has developed.
If the current task involves a domain listed in skills.md, apply those patterns.
If you learn new domain patterns during this task, append them to skills.md.
```

**Skills + Portability = The Killer Combo:**

Brady's insight: "a squad that works on 5 React projects doesn't just know the USER — it has React SKILLS."

Export captures `skills.md`. Import restores it. Day one on a new React project, the squad already knows:
- Use hooks, not classes
- Test with RTL
- Use zustand for state management
- The middleware chain pattern for Express

The squad isn't starting from scratch. It's bringing domain expertise earned across every project it's ever worked on.

**Skills + Sharing (v2 teaser):**

Skills are the most naturally shareable artifact. Unlike preferences (personal) or project learnings (local), skills are domain knowledge. A "React Skills Pack" could be published independently of any squad's identity. But that's v2. For v1, skills live in `skills.md` and travel with the squad on export/import.

### 2.3 Export/Import CLI (Fenster + Kujan)

From Proposals 008 and 008-platform. Now including skills.

**CLI commands:**

```
npx create-squad export              # → ./squad-export.json
npx create-squad export --out FILE   # → custom path
npx create-squad import FILE         # import squad from manifest
npx create-squad import FILE --force # replace existing squad (archive old)
npx create-squad upgrade             # update coordinator + templates (Sprint 1)
```

**What gets exported (updated with skills):**

| Source | Exported? | Notes |
|--------|-----------|-------|
| `casting/` (registry, history, policy) | ✅ Full | Squad identity |
| `agents/*/charter.md` | ✅ Full | Agent identity |
| `agents/*/history.md` | ⚠️ Portable Knowledge section only | Heuristic extraction for unsplit histories |
| `skills.md` | ✅ Full | Domain expertise — the new crown jewel |
| `team.md` | ⚠️ Roster only | Strip project context |
| `routing.md` | ✅ Full | Team structure |
| `decisions.md` | ❌ No | Project-specific |
| `orchestration-log/` | ❌ No | Session artifacts |

**Manifest schema (v1.0):**

```json
{
  "squad_manifest_version": "1.0",
  "exported_at": "ISO-8601",
  "exported_from": "owner/repo",
  "casting": { "registry": {}, "history": {}, "policy": {} },
  "agents": {
    "keaton": {
      "charter": "markdown string",
      "portable_knowledge": ["observation 1", "observation 2"]
    }
  },
  "skills": "full skills.md content",
  "team": "cleaned team.md",
  "routing": "routing.md content"
}
```

**Import flow:**
1. Validate `.squad` or `.json` manifest
2. Refuse if `.ai-team/team.md` exists (unless `--force`)
3. Copy `squad.agent.md` and templates (always — forwardable)
4. Restore casting state with `imported_from` metadata
5. Create agent directories with charters and seeded histories
6. Write `skills.md` from manifest
7. Create empty `decisions.md`, inbox, orchestration-log
8. Print import summary

**`--force` behavior:**
1. Archive existing `.ai-team/` to `.ai-team-archive-{timestamp}/`
2. Proceed with normal import

**No `--merge` in v1.** Honest refusal with clear messaging. Merge is v2.

### 2.4 Coordinator: Imported Squad Detection (Verbal)

~10 lines added to `squad.agent.md` Team Mode:

```markdown
**Imported squad detection:**
If registry.json has an `imported_from` field and team.md Project Context
has "(to be filled)":
1. Greet the user by name — the team is back.
2. Ask about the new project — orient the team.
3. Fill in Project Context.
4. Clear the `imported_from` flag.
5. Read skills.md and note which domains the team already knows.
```

### Sprint 2 Deliverables

- [ ] History template has Portable Knowledge / Project Learnings sections
- [ ] Spawn prompts instruct agents on categorizing learnings
- [ ] `skills.md` concept implemented (template + spawn prompt instructions)
- [ ] `npx create-squad export` produces valid manifest
- [ ] `npx create-squad import FILE` restores squad with skills
- [ ] `--force` flag archives and replaces
- [ ] Coordinator detects imported squads and runs onboarding
- [ ] Round-trip test: export from project A → import into project B → verify fidelity

**Sprint 2 blocks:** Sprint 1 must ship first (forwardability is prerequisite for template updates reaching users).

---

## Sprint 3: "Make It Shine" (Days 8-10)

**Goal:** Polish, testing, documentation. The experience that makes people say "holy crap."

### 3.1 README Rewrite (McManus)

Ship Proposal 006. The README should sell Squad in 30 seconds:
- "Your AI agent team. Any project." (updated positioning with portability)
- Elevate casting as a feature
- Skills section: "Your squad learns your tech stack"
- Quick Start includes export/import
- "Why Squad?" section

### 3.2 Testing Infrastructure (Hockney)

From Hockney's original assessment. Minimum viable test suite:

1. **Init test:** Run `index.js` in temp dir → verify file structure created
2. **Upgrade test:** Run init → modify `.ai-team/` → run upgrade → verify `.ai-team/` preserved, `squad.agent.md` updated
3. **Export/import round-trip:** Init → create mock team state → export → import into new dir → verify fidelity
4. **Forwardability test:** Init with old `squad.agent.md` → upgrade → verify new version header
5. **Skills persistence test:** Add skills → export → import → verify skills.md intact

Framework: `tap` (already decided by Hockney). No new dependencies beyond the test framework.

### 3.3 Progressive History Summarization (Verbal)

From Proposal 007, Solution 7. Scribe responsibility.

When `history.md` exceeds ~3,000 tokens:
- Summarize entries older than 2 weeks into a "Core Context" section
- Archive originals to `history-archive.md`
- Keeps per-spawn context load under ~2,000 tokens regardless of project age

### 3.4 Lightweight Spawn Template (Verbal)

From Proposal 007, Solution 5. For tiered response "Lightweight" mode:

```markdown
agent_type: "general-purpose"
prompt: |
  You are {Name}, the {Role}. Make this change:
  {task with exact file paths}
  Do NOT read history.md or decisions.md. Just do it and report.
```

Saves ~5-8 seconds per lightweight spawn.

### Sprint 3 Deliverables

- [ ] README rewrite shipped
- [ ] Test suite with 5 core tests passing
- [ ] Progressive history summarization in Scribe instructions
- [ ] Lightweight spawn template in coordinator
- [ ] Manual end-to-end validation of full v1 flow

---

## What We're NOT Doing in v1

This list is as important as what's in. Cutting these is a decision, not an oversight.

| Feature | Why it's cut | When |
|---------|-------------|------|
| **Squad merge** (`--merge` on import) | Universe conflicts are unsolvable without opinionated rules. Ship `--force`, learn from usage. | v1.1 |
| **LLM-assisted history classification** | Manual curation + heuristic extraction is good enough for v1. Users can review the manifest. | v1.1 |
| **Squad sharing / Gist publishing** | Needs privacy controls (strip preferences for sharing). Personal portability first. | v1.2 |
| **Squad registry / marketplace** | Premature. Need a community first. | v2 |
| **Agent-to-agent negotiation** | Industry trend (Verbal, Proposal 005) but not v1 material. Current fan-out-and-merge works. | v2 |
| **Dynamic micro-specialist spawning** | 10+ narrow experts is a v2 vision. The 5-role + skills model handles v1. | v2 |
| **Speculative execution** | Anticipatory agent spawning is cool but risky. Get the basics perfect first. | v2 |
| **Video content** | Important for adoption but not blocking v1 code. McManus and Verbal can produce in parallel. | Parallel track |
| **Demo script / recording** | Same — production concern, not code concern. | Parallel track |
| **Copilot SDK integration** | Decision is "stay independent." Revisit when SDK offers something we can't build. | v2+ |
| **User overrides** ("full review on this") | Nice to have, but tiered modes cover 95% of the intent. | v1.1 |
| **Partial export** (`--agents keaton,verbal`) | Full squad export is the right v1 default. Partial is a refinement. | v1.1 |
| **`preferences.md` as separate file** | Verbal proposed this (008-experience). For v1, Portable Knowledge section in history.md is sufficient. Separate file adds migration cost with limited near-term benefit. Revisit based on usage. | v1.1 |
| **`squad-profile.md`** | Team meta-history is cool but not MVP. Skills.md covers the domain knowledge gap. Profile is relationship tracking — v1.1. | v1.1 |
| **Squad diff** (`create-squad diff`) | The quantified-self feature Verbal designed. Compelling but not v1. Needs longitudinal data. | v1.2 |

---

## The Forwardability Architecture (Detail)

Brady said: "Forwardability is non-negotiable." Here's the full picture.

### What is forwardable vs. what is user state

| Artifact | Owner | Forwardable? | On upgrade... |
|----------|-------|-------------|---------------|
| `squad.agent.md` | Squad (us) | ✅ Yes | Always overwritten |
| `.ai-team-templates/` | Squad (us) | ✅ Yes | Always overwritten |
| `.ai-team/team.md` | User's squad | ❌ Sacred | Never touched |
| `.ai-team/agents/*/` | User's squad | ❌ Sacred | Never touched |
| `.ai-team/casting/` | User's squad | ❌ Sacred | Never touched |
| `.ai-team/decisions.md` | User's squad | ❌ Sacred | Never touched |
| `.ai-team/skills.md` | User's squad | ❌ Sacred | Never touched |
| `.ai-team/orchestration-log/` | User's squad | ❌ Sacred | Never touched |

**The bright line:** We own the coordinator and templates. Users own `.ai-team/`. Upgrade = our code gets updated, their state stays intact.

### Versioning strategy

```
package.json version:     0.2.0    (npm release version)
squad.agent.md version:   0.2.0    (coordinator instruction version)
manifest version:         1.0      (export format version)
```

- Package version increments on every release
- Coordinator version tracks meaningful instruction changes
- Manifest version increments only on breaking schema changes (rare)

### The upgrade flow

```
$ npx create-squad upgrade

Upgrading Squad...
  ✓ squad.agent.md: 0.1.0 → 0.2.0
  ✓ .ai-team-templates/ updated
  ✗ .ai-team/ — preserved (your team is safe)

What's new in 0.2.0:
  - Tiered response modes (Direct/Lightweight/Standard/Full)
  - Coordinator context caching (faster repeat messages)
  - Scribe batching (no more empty Scribe spawns)
  - Skills support (your squad learns domains)
  - Export/Import (take your squad to new projects)
```

---

## Skills Architecture (Detail)

### File: `.ai-team/skills.md`

Created during init (empty template). Grows as the squad works.

**Template:**
```markdown
# Squad Skills

<!-- Domain expertise acquired through project work. -->
<!-- Skills are portable — they travel with your squad to new projects. -->
<!-- Skills are shareable — they work for any user, not just you. -->
```

**Spawn prompt addition to `squad.agent.md`:**
```markdown
**Skills:**
- Read .ai-team/skills.md at the start of every Standard or Full mode task.
- If the current task involves a domain listed in skills.md, apply those patterns.
- If you discover a reusable pattern about a technology or framework during your work,
  append it to skills.md under the appropriate domain heading.
- Skills are about TECHNOLOGIES and DOMAINS, not about the user or the project.
  "Use React Testing Library" is a skill. "Brady prefers RTL" is a preference.
  "Auth module is in src/auth/" is a project learning.
```

**Skills vs. Copilot's `store_memory`:**

The Copilot platform has `store_memory` for persisting facts. Skills are different:
- `store_memory` is per-session, platform-managed, opaque
- Skills are per-squad, filesystem-backed, human-readable, exportable, shareable
- Skills compound across projects via export/import
- Skills are curated domain knowledge, not raw memory dumps

This is exactly the kind of thing that makes Squad's filesystem-first approach a differentiator.

### Skill Acquisition Flow

```
Session 1 (React project):
  User: "Build a dashboard with React"
  Fenster builds it, observes: functional components, hooks pattern
  → Appends to skills.md: "## React\n- Prefer functional components with hooks"

Session 5 (same project):
  Fenster has been writing tests with RTL
  → Appends: "- Test with React Testing Library (getByRole, getByText)"

Export → Import into new React project:
  First session: squad already knows React patterns
  Fenster scaffolds with hooks, writes RTL tests — without being told
  
Session 1 (new Express project):
  Squad has no Express skills yet
  Fenster learns the middleware pattern
  → Appends: "## Express.js\n- Middleware chain: auth → validate → business logic"

Export now contains React + Express skills.
Next project gets both.
```

---

## Dependency Map

```
Sprint 1 (parallel tracks):
  ├── 1.1 Forwardability (Fenster + Kujan) ─────────────────┐
  ├── 1.2 Latency P0 (Verbal) ──────────────────────────────┤
  ├── 1.3 Tiered modes (Verbal + Keaton) ───────────────────┤
  └── 1.4 Direct handling (Verbal) ─────────────────────────┘
                                                              │
Sprint 2 (sequential dependencies):                           │
  ├── 2.1 History split (Verbal + Keaton) ← depends on 1.1   │
  │     └── 2.2 Skills system (Verbal + Keaton) ← depends on 2.1
  │           └── 2.3 Export/Import (Fenster + Kujan) ← depends on 2.1 + 2.2
  └── 2.4 Imported squad detection (Verbal) ← depends on 2.3
                                                              │
Sprint 3 (parallel tracks):                                   │
  ├── 3.1 README rewrite (McManus) ← can start Sprint 2      │
  ├── 3.2 Testing (Hockney) ← depends on 2.3                 │
  ├── 3.3 History summarization (Verbal) ← depends on 2.1    │
  └── 3.4 Lightweight spawn (Verbal) ← depends on 1.3        │
```

### Who Does What

| Agent | Sprint 1 | Sprint 2 | Sprint 3 |
|-------|----------|----------|----------|
| **Keaton** | Architecture review on tiered modes, direct handling rules | Skills architecture, history split review | Final integration review |
| **Verbal** | Latency P0 instructions, tiered mode routing, direct handling rules | History split prompts, skills prompt instructions, imported squad detection | History summarization, lightweight spawn template |
| **Fenster** | Forwardability changes to `index.js` | Export/import CLI implementation | Bug fixes |
| **Kujan** | Forwardability review (platform implications) | Export/import platform feasibility | — |
| **Hockney** | — | — | Test suite (5 core tests) |
| **McManus** | — | — (can start README draft) | README rewrite, messaging update |

### Parallel Tracks (Non-Blocking)

These run alongside the sprints and don't block v1 code:

| Track | Owner | Status |
|-------|-------|--------|
| Video trailer (75s) | McManus + Verbal | Proposal 005 approved, script needed |
| Demo script finalization | McManus | Proposal 004, needs Brady recording session |
| DevRel polish (6 items) | McManus | Proposal 002, can execute independently |

---

## Success Criteria

### The "Holy Crap" Moments

These are the specific interactions that make users say it. If we ship v1 and these don't work, we failed.

1. **"It just... knew."** — Import squad into new React project. First message: "Set up the project." Squad uses TypeScript strict mode, hooks, RTL — without being told. Skills + preferences working together.

2. **"That was instant."** — Message 12 of a session. User says "change the port to 8080 in server.ts." Coordinator handles it directly in ~3 seconds. No spawn. No ceremony. The team knows when to go fast.

3. **"My team is back."** — Export from finished project. Import into new project. Squad greets user by name, references their working style, asks about the new codebase. Feels like onboarding a trusted team, not configuring a tool.

4. **"It got better."** — Third project with the same squad. Hockney (Tester) writes tests matching the exact patterns the user has corrected toward over two previous projects. The squad's skills compound visibly.

5. **"I upgraded and nothing broke."** — Run `npx create-squad upgrade` on an existing project. New coordinator features appear. All team state, history, skills, casting preserved. Zero friction.

### Measurable Targets

| Metric | Current (v0.1) | Target (v1) |
|--------|----------------|-------------|
| Trivial task latency (message 10+) | ~30-35s | ~3-5s |
| Simple task latency (single agent) | ~30-35s | ~12-15s |
| Complex task latency (multi-agent) | ~60-70s | ~50-60s |
| Scribe spawns per 10-message session | 10 | 3-4 |
| Coordinator re-reads per session | 4-5 per message | 0-1 after first |
| Export/import round-trip fidelity | N/A | 100% for casting + charters + skills |
| Upgrade preserves user state | No upgrade exists | 100% of `.ai-team/` preserved |
| Time to first useful agent action (imported squad) | N/A | < 30 seconds |
| Test coverage (core paths) | 0 tests | 5 tests passing |

### What "Done" Looks Like

v1 is done when:

1. ✅ `npx create-squad` initializes a project (existing behavior, but now always writes coordinator)
2. ✅ `npx create-squad upgrade` updates coordinator without touching team state
3. ✅ `npx create-squad export` produces a valid manifest with casting, charters, skills, portable knowledge
4. ✅ `npx create-squad import FILE` restores a squad with full identity and skills
5. ✅ Coordinator uses tiered response modes (Direct/Lightweight/Standard/Full)
6. ✅ Coordinator caches context within a session (no re-reads)
7. ✅ Scribe only spawns when inbox has files
8. ✅ Agents categorize learnings into Portable Knowledge vs Project Learnings
9. ✅ Agents acquire and apply skills from `skills.md`
10. ✅ 5 core tests pass
11. ✅ README reflects v1 features
12. ✅ Brady runs it and says something unrepeatable in a good way

---

## The Compound Bet

Here's why these features together are more than the sum of their parts:

**Forwardability** means every Squad user gets every improvement automatically. We ship once, 9 users (and growing) benefit immediately. No "you need to re-create your squad."

**Latency fixes** mean the experience gets better as you use it more. Progressive trust. The squad learns when to go fast. This is the difference between a tool that wears out its welcome and a tool that earns its place.

**Portability** means the investment compounds across projects. Every project you work with your squad makes the next project better. The switching cost isn't lock-in — it's accumulated relationship capital.

**Skills** mean the squad gets smarter at specific domains. Not just "knows the user" but "knows React." Not just "knows React" but "knows React the way THIS team uses React." Portable, shareable, compounding.

Together: **A team that gets faster, smarter, and more personal with every project — and you never have to rebuild it.**

That's the product that makes people say "throw a squad at it" — not as a tagline, but as a truth. Because the squad they're throwing has earned its reputation across every project they've worked together.

That's v1. Let's ship it.

— Keaton

---

**Review requested from:** Verbal (prompt engineering implications), Fenster (implementation feasibility), Hockney (test plan), McManus (messaging), bradygaster (final sign-off)  
**Approved by:** [Pending]  
**Implemented:** [Pending]  
**Retrospective:** [Pending]
