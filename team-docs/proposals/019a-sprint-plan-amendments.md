# Proposal 019a: Sprint Plan Amendments — Brady's Session 5 Directives

**Status:** Approved ✅ Shipped  
**Authored by:** Keaton (Lead)  
**Date:** 2026-02-09  
**Amends:** Proposal 019 (Master Sprint Plan)  
**Source:** Brady's session 5 batch directives

---

## What This Document Is

Brady dropped five directives that affect Proposal 019. This amendment addresses each one: what changes, who owns it, where it slots in the wave structure. The master plan itself is not rewritten — these are surgical modifications.

---

## Directive 1: README Timing

**Brady said:** *"maybe save the readme rewrite until the end - up to y'all. could be good to keep it up as we go"*

### My Call: Living README, Updated Each Wave

**Rationale:**

A living README serves three purposes a final-write-at-the-end does not:

1. **It's the demo.** Every time Brady shares the repo — with a colleague, a potential user, a conference organizer — the README IS the product. A stale placeholder README that says "coming soon" signals "this isn't real yet." A living README that reflects current capabilities signals "this is shipping."

2. **It forces accuracy.** If the README says "export your squad" and export isn't shipped yet, the README is wrong. Updating per-wave means the README is always honest about what's real. This aligns with Brady's own quality-first directive.

3. **The blog format (Directive 2) handles the narrative.** The README doesn't need to tell the story of how we got here — the blog does that. The README just needs to document what's true right now.

**What changes in 019:**

- Item **1.5.1 (README rewrite)** stays in Wave 1.5 but gets a new scope: **initial README that documents v0.1.0 capabilities only**. No forward-looking features.
- Add new recurring item: **README refresh** at each wave gate. McManus updates the README to reflect newly shipped capabilities. ~30 minutes per wave.
- README refresh is a **gate exit criterion** (not a gate blocker — you don't hold the gate for it, but you don't start the next wave's features until the README reflects the current wave).

| ID | Change | Owner | Effort |
|----|--------|-------|--------|
| 1.5.1 | Scope narrowed: current-state README only | McManus | 1-2h (unchanged) |
| 1.5.1a | Wave 1 gate: README refresh | McManus | 30min |
| 2.G.1 | Wave 2 gate: README refresh | McManus | 30min |
| 3.G.1 | Wave 3 gate: README refresh | McManus | 30min |

---

## Directive 2: Blog Engine Meta-Play

**Brady said:** *"think about a blog markdown format to continually update our users on progress, and then, one of the sample prompts is a blog engine with amazing front-end UX that renders Squad blog posts"*

This is a strong play. Squad builds a blog engine sample prompt. Squad uses a blog format to document its own progress. The blog engine renders Squad's own blog posts. Meta all the way down.

### 2a. Blog Post Format

Every wave produces a blog post. Format:

```markdown
---
title: "Wave 1: Making Squad Trustworthy"
date: 2026-02-12
wave: 1
author: squad
tags: [release, quality, testing]
summary: "Error handling, 20+ tests, CI pipeline, and the 'feels heard' UX principle."
---

## What Shipped

Brief summary of what's new.

## Why It Matters

Connect the technical work to the user's experience.

## What's Next

One-paragraph preview of the next wave.

## The Numbers

| Metric | Before | After |
|--------|--------|-------|
| Tests | 12 | 20+ |
| Error handling | none | complete |
| CI | none | GitHub Actions |

## Try It

```bash
npx github:bradygaster/squad upgrade
```
```

Blog posts live in `docs/blog/` with filename format: `YYYY-MM-DD-wave-N-title.md`. Front matter is YAML (standard), not custom.

### 2b. Sprint Plan Changes — Blog Post Per Wave

| ID | Item | Owner | Effort | Wave |
|----|------|-------|--------|------|
| B.1 | Blog post: Wave 1 summary | McManus | 1h | After Wave 1 gate |
| B.2 | Blog post: Wave 2 summary | McManus | 1h | After Wave 2 gate |
| B.3 | Blog post: Wave 3 summary | McManus | 1h | After Wave 3 gate |

Blog posts are wave gate exit criteria (same rule as README refresh — don't hold the gate, but publish before starting new feature work).

**McManus owns all blog posts.** The content track already has McManus bandwidth between waves. This is additive but fits naturally.

### 2c. Blog Engine Sample Prompt

Add to `docs/sample-prompts.md` under a new section:

**Proposed sample prompt:**

```
I need a developer blog engine with a polished front-end reading experience. 
Requirements:
- Reads markdown files with YAML front matter (title, date, author, tags, summary)
- Renders blog posts from a docs/blog/ directory
- Beautiful, responsive reading experience — think Stripe's blog meets a personal dev blog
- Syntax highlighting for code blocks
- Tag-based filtering and archive page
- RSS feed generation
- Dark mode that doesn't suck
- Zero build step — serve directly or generate static HTML
- Landing page with latest 5 posts and tag cloud

Tech: Node.js backend, vanilla HTML/CSS/JS frontend. No React, no frameworks.
Make it gorgeous. This blog tells the story of a product being built.
```

**What it demonstrates:** Full-stack coordination — backend API, frontend UX, markdown parsing, RSS generation, responsive design. Multiple agents working in parallel on different layers. The blog engine is non-trivial enough to show real Squad orchestration but scoped enough to ship in a session.

**Meta value:** When we demo this prompt, the blog engine renders our own blog posts about building Squad. The demo creates the tool that tells the demo's story.

### 2d. Agent Assignment

- **McManus:** Writes blog posts, adds sample prompt to `docs/sample-prompts.md`
- **Blog post writing** slots into the content track (Wave 1.5 and beyond)
- **Sample prompt addition** is a one-time edit — McManus, Wave 1.5, ~30min

---

## Directive 3: Package Naming — GitHub-Only Distribution

**Brady said:** *"today the package is just bradygaster/squad. if we are going to do an export or an update - i'd love if folks could run an npx command to get an update to their squad without breaking their squad"*

**Brady's subsequent decision (Session 6):** *No npm publish. Ever.* Squad is distributed exclusively via GitHub: `npx github:bradygaster/squad`. No npm registry involvement.

### Current State

- Package lives on GitHub: `bradygaster/squad`
- `npx github:bradygaster/squad` → init
- `npx github:bradygaster/squad upgrade` → upgrade
- Future: `npx github:bradygaster/squad export` → export

### Analysis — SUPERSEDED

The original analysis in this directive (Options A/B/C, `create-squad` npm registration) is **moot**. Brady has decided: no npm, no registry, no dual-publish. The distribution model is GitHub-only via `npx github:bradygaster/squad`. This is simpler, cleaner, and eliminates an entire class of maintenance (npm auth, publish CI, registry concerns).

**What this means:**
- The "package name" is the GitHub repo name: `bradygaster/squad`
- Users run: `npx github:bradygaster/squad` (init), `npx github:bradygaster/squad upgrade` (upgrade)
- If Brady renames the repo, the npx command changes automatically
- No npm auth, no publish CI, no registry maintenance
- GitHub Releases and tags become the versioning and distribution mechanism (see Directive 6)

### Sprint Plan Changes

| ID | Item | Owner | Effort | Wave |
|----|------|-------|--------|------|
| ~~1.8~~ | ~~Register `create-squad` on npm, dual-publish setup~~ | ~~Fenster~~ | ~~1h~~ | **CANCELLED** |
| 1.5.1 | README uses `npx github:bradygaster/squad` as primary command | McManus | (part of README) | 1.5 |

**Item 1.8 is CANCELLED.** No npm registration, no dual-publish. McManus updates all documentation to use `npx github:bradygaster/squad`.

---

## Directive 4: Human Feedback as P0

**Brady said:** *"please please optimize for an efficient experience or a continually up-to-date one for the human. humans like feedback."*

### Should This Be a 5th Directive?

**Yes.** This is a distinct principle from the existing four. Here's where it differs:

| Existing Directive | Scope | New Directive Scope |
|---|---|---|
| 1. Quality first | What we build first | — |
| 2. "Where are we?" | One specific feature | — |
| 3. Human input responsiveness | Input → system | — |
| 4. "Feels heard" | Immediate acknowledgment | — |
| **5. Human feedback optimization** | **System → human, continuously** | **Every interaction, every output** |

Directives 3 and 4 are about input (human → system). Directive 5 is about output (system → human). It's the other direction. The coordinator says "got it" (Directive 4), but then the user waits 45 seconds with no indication of progress. THAT is what Directive 5 addresses.

### The 5th Directive

> **5. Optimize for human feedback.** Every interaction should give the human visible evidence of progress. If work takes time, report what's happening. If there's a result, surface it clearly. Silence is never acceptable. The human should always know what's happening, what just happened, or what's about to happen.

### What in 019 Already Serves This

| Item | How It Serves Directive 5 |
|------|--------------------------|
| 1.7 "Feels heard" | Immediate ack — covers the first 2 seconds |
| 2.1 Tiered modes (Direct) | Fast answers for simple questions — covers trivial interactions |
| 1.5 Silent success fix | Prevents the worst case: work done, no output |
| 1.1 Error handling | Clear error messages instead of stack traces |

### What's Missing

1. **Progress reporting during multi-agent work.** When the coordinator spawns 3 agents, the human sees nothing until all 3 finish. The coordinator should report: "Spawned Fenster (error handling), Hockney (tests), Verbal (prompts). Waiting for results..." and ideally update as each completes.

2. **Result summarization after agent work.** When agents finish, the coordinator should synthesize: "All 3 agents completed. Fenster added error handling to index.js. Hockney wrote 8 new tests. Verbal updated 2 spawn prompts. Details in their reports." This is the "what just happened" leg.

3. **CLI output improvements.** `npx github:bradygaster/squad` currently outputs checkmarks. It should also explain what was created and what to do next. (Partially exists — the "Next steps" block is good, but the file list needs context.)

### Sprint Plan Changes

| ID | Item | Owner | Effort | Wave | Description |
|----|------|-------|--------|------|-------------|
| 1.9 | Progress reporting in coordinator | Verbal + Kujan | 2h | 1 | Coordinator reports agent spawn status and per-agent completion |
| 2.1+ | Result summarization | Verbal | (part of 2.1) | 2 | Coordinator synthesizes multi-agent results after fan-out |
| 1.1+ | CLI output enrichment | Fenster | (part of 1.1) | 1 | Enhanced init/upgrade output with context |

**New directive added to the Directives section of 019.**

---

## Directive 5: VS Code Parity

**Brady said:** *"is there any reason why things wouldn't 'just work' in vs code"*

### Analysis

Squad's architecture is platform-agnostic by design:
- `squad.agent.md` in `.github/agents/` — this IS the VS Code Copilot agent path. Same file, same location.
- All agent interactions use `task`, `powershell`, `view`, `edit`, `grep`, `glob` — tools available in both CLI and VS Code Copilot.
- Filesystem-backed memory (`.ai-team/`) is IDE-independent.
- No CLI-specific APIs, no terminal-only features.

**There is no architectural reason Squad wouldn't work in VS Code.** The agent file format, tool availability, and spawn mechanics are identical. If Kujan confirms this after testing, VS Code is a zero-effort additional platform.

### What Might Differ

1. **Tool availability nuances.** VS Code Copilot Chat may have slightly different tool implementations (e.g., terminal handling, file watching). Needs manual testing.
2. **Context window limits.** VS Code may have different token budgets than CLI. The coordinator's ~1,900-token overhead should be fine everywhere, but agent spawn prompts that approach limits might behave differently.
3. **Background agent behavior.** `mode: "background"` agents and `detach: true` may have different behavior in VS Code's integrated terminal vs standalone CLI.

### Sprint Plan Changes

| ID | Item | Owner | Effort | Wave | Description |
|----|------|-------|--------|------|-------------|
| 1.10 | VS Code parity smoke test | Kujan | 1h | 1 | Manual test: init, team mode, parallel spawn, "where are we?" in VS Code |
| 1.3+ | CI: consider VS Code test | Hockney | (investigation only) | 1 | Investigate if automated VS Code testing is feasible for CI |

**Kujan** runs a manual smoke test in Wave 1. If parity is confirmed (expected), we document "Works in both CLI and VS Code" in the README. If there are gaps, we file them as Wave 2 items.

**CI for VS Code:** Automated VS Code extension testing requires `vscode-test` or similar — heavyweight and fragile. **Not recommended for v1 CI.** Manual smoke test per wave is sufficient. Document the test checklist so any team member can run it.

---

## Summary of All Sprint Plan Changes

### New Items

| ID | Item | Owner | Effort | Wave |
|----|------|-------|--------|------|
| ~~1.8~~ | ~~Register `create-squad` on npm~~ | ~~Fenster~~ | ~~1h~~ | **CANCELLED** (Directive 6) |
| 1.9 | Progress reporting in coordinator | Verbal + Kujan | 2h | 1 |
| 1.10 | VS Code parity smoke test | Kujan | 1h | 1 |
| 1.11 | Release workflow (GitHub Actions) | Kobayashi | 2h | 1 |
| 1.12 | Branch strategy and merge to main | Kobayashi | 1-2h | 1 |
| 1.13 | First tagged release (v0.1.0) | Kobayashi | 1h | 1 (gate exit) |
| B.1 | Blog post: Wave 1 | McManus | 1h | Post-Wave 1 |
| B.2 | Blog post: Wave 2 | McManus | 1h | Post-Wave 2 |
| B.3 | Blog post: Wave 3 | McManus | 1h | Post-Wave 3 |

### Modified Items

| ID | Change |
|----|--------|
| 1.3 | CI setup: **Hockney + Kobayashi** (Kobayashi owns the Actions workflow, Hockney owns test content) |
| 1.5.1 | README scope: current-state only, updated per wave |
| 1.1 | Added: CLI output enrichment for human feedback |
| 2.1 | Added: result summarization after multi-agent fan-out |

### New Recurring Items

| Item | Owner | Effort | When |
|------|-------|--------|------|
| README refresh | McManus | 30min | Each wave gate exit |
| Blog post | McManus | 1h | Each wave gate exit |

### New Directive (added to 019 §Directives)

> **5. Optimize for human feedback.** Every interaction gives the human visible evidence of progress. Silence is never acceptable.

### New Content

| Item | Location | Owner |
|------|----------|-------|
| Blog post format spec | `docs/blog/` (directory) | McManus |
| Blog engine sample prompt | `docs/sample-prompts.md` | McManus |

### Updated Effort Total

| Category | 019 Estimate | 019a Additions | New Total |
|----------|-------------|----------------|-----------|
| Wave 1 | 11-14h | +7-8h (1.9, 1.10, 1.11, 1.12, 1.13; 1.8 cancelled) | 18-22h |
| Wave 1.5/Content | 9-13h | +4.5h (blog posts, sample prompt, README refreshes) | 13.5-17.5h |
| Wave 2 | 12-16h | (absorbed into existing items) | 12-16h |
| Wave 3 | 12-16h | (absorbed into existing items) | 12-16h |
| **Total** | **44-59h** | **+11.5-12.5h** | **55.5-71.5h** |

Calendar impact: moderate. New Wave 1 items (1.9, 1.10, 1.11, 1.12) all parallelize with existing work. Item 1.13 (first tagged release) is a Wave 1 gate exit criterion — it runs after the gate passes but before Wave 2 features begin. Kobayashi's work is entirely additive and does not block existing agents. Item 1.8 (npm registration) is cancelled, removing 1h.

---

## Updated Wave 1 Parallelism

```
Day 1-2:                                    Day 2-4:
├── 1.1 Error handling (Fenster)            └── 1.2 Test expansion (Hockney) ← needs 1.1
├── 1.3 CI setup (Hockney + Kobayashi)       ← UPDATED: Kobayashi owns Actions workflow
├── 1.4 Version stamping (Fenster)
├── 1.5 Silent success (Verbal)
├── 1.6 Human directive capture (Kujan)
├── 1.7 Feels heard behavior (Verbal)
├── 1.9 Progress reporting (Verbal + Kujan)  ← NEW
├── 1.10 VS Code smoke test (Kujan)          ← NEW
├── 1.11 Release workflow (Kobayashi)        ← NEW
└── 1.12 Branch strategy (Kobayashi)         ← NEW

Wave 1 Gate Exit:
├── 1.13 First tagged release v0.1.0 (Kobayashi) ← NEW (gate exit criterion)
├── README refresh (McManus)
└── Blog post: Wave 1 (McManus)
```

---

## Directive 6: GitHub-Only Distribution & Release Process

**Source:** Brady's session 6 decisions — no npm, Kobayashi hired, release plan needed.

### What Changed

Brady made three decisions that fundamentally affect the distribution and release model:

1. **No npm publish. Ever.** Squad is distributed exclusively via `npx github:bradygaster/squad`. The npm registry is not involved. Item 1.8 (register `create-squad` on npm) is **CANCELLED**. My recommendation to register the unscoped name was rejected — and Brady's right. GitHub-only distribution is simpler, eliminates npm auth/publish/registry maintenance, and keeps the entire project lifecycle on one platform.

2. **Kobayashi (Git & Release Engineer) joins the team.** Dedicated specialist for ALL git and GitHub responsibilities: releases, tags, branch strategy, CI/CD workflows, state integrity. Git IS our state maintenance layer — the `.ai-team/` directory, the drop-box pattern, orchestration logs, casting registry. A dedicated owner for git operations is the right call.

3. **Release workflow needed.** Proper GitHub Releases with tags, versioning, changelogs. Kobayashi is writing the detailed proposal (021), but release work slots into Wave 1 immediately.

### Team Roster Update

**Kobayashi — Git & Release Engineer** is added to the team:

| Agent | Role | Responsibilities |
|-------|------|-----------------|
| **Kobayashi** | Git & Release Engineer | GitHub Releases, tags, versioning, branch strategy, CI/CD workflows, GitHub Actions, state integrity, merge-to-main process |

Kobayashi owns the intersection of git and GitHub that touches every other agent's work. When Hockney writes tests, Kobayashi ensures CI runs them. When Fenster ships features, Kobayashi tags the release. When the team merges to main, Kobayashi owns the process.

### Cancelled Items

| ID | Item | Reason |
|----|------|--------|
| ~~1.8~~ | ~~Register `create-squad` on npm, dual-publish setup~~ | Brady: no npm, ever. GitHub-only distribution. |

### New Items

| ID | Item | Owner | Effort | Depends On | Wave |
|----|------|-------|--------|------------|------|
| **1.11** | Release workflow (GitHub Actions) | Kobayashi | 2h | 1.3 (CI foundation) | 1 |
| **1.12** | Branch strategy and merge to main | Kobayashi | 1-2h | — | 1 |
| **1.13** | First tagged release (v0.1.0) | Kobayashi | 1h | Wave 1 gate (all items pass) | 1 (gate exit) |

#### 1.11 Release Workflow (GitHub Actions)

**Owner:** Kobayashi
**Effort:** 2 hours
**Depends on:** 1.3 (CI must exist as the foundation)

**What ships:**
- `.github/workflows/release.yml` — triggered on tag push or manual dispatch
- Creates a GitHub Release with auto-generated changelog from commits
- Attaches version metadata
- Validates that tests pass before release is published
- No npm publish step — the release IS the distribution (users pull via `npx github:bradygaster/squad`)

**Detail:** Kobayashi is writing the full proposal (021) with implementation specifics. This item slots the work into the wave structure.

#### 1.12 Branch Strategy and Merge to Main

**Owner:** Kobayashi
**Effort:** 1-2 hours
**Depends on:** Nothing

**What ships:**
- Documented branch strategy (main as release branch, feature branches for work)
- Branch protection rules for main (require CI pass, require review)
- Merge process documentation for the team
- `.ai-team/` state integrity verification on merge (ensure no conflicting writes)

#### 1.13 First Tagged Release (v0.1.0)

**Owner:** Kobayashi
**Effort:** 1 hour
**Depends on:** Wave 1 gate must be GREEN

**What ships:**
- First official GitHub Release: `v0.1.0`
- Changelog summarizing everything shipped in Wave 1
- Tag on main branch
- Validates the release workflow (1.11) works end-to-end

**This is a Wave 1 gate EXIT criterion.** The gate must pass first (tests, CI, error handling, etc.), then Kobayashi cuts the release before Wave 2 features begin. No feature work starts on Wave 2 until v0.1.0 is tagged and released.

### Modified Items

| ID | Original Owner | New Owner | Change |
|----|---------------|-----------|--------|
| **1.3** | Hockney | **Hockney + Kobayashi** | Kobayashi owns the GitHub Actions workflow definition and CI infrastructure. Hockney owns the test content that CI runs. Split responsibility — Hockney shouldn't need to know Actions YAML, Kobayashi shouldn't need to know test assertions. |

### npm Reference Updates

All references to npm registration, dual-publish, and `create-squad` unscoped naming in this document have been updated:

| Location | Before | After |
|----------|--------|-------|
| Directive 3 title | "Package Naming" | "Package Naming — GitHub-Only Distribution" |
| Directive 3 analysis | Options A/B/C with npm registration recommendation | Marked SUPERSEDED — GitHub-only per Brady's decision |
| Directive 3 sprint changes | Item 1.8 active | Item 1.8 CANCELLED |
| Blog post code example | `npx @bradygaster/create-squad upgrade` | `npx github:bradygaster/squad upgrade` |
| Summary new items table | Item 1.8 listed | Item 1.8 marked CANCELLED |
| Effort totals | +4h for 1.8/1.9/1.10 | 1.8 removed, 1.11/1.12/1.13 added |

### Updated Agent Workload Summary (Wave 1 Only)

| Agent | Wave 1 Items | Effort |
|-------|-------------|--------|
| **Fenster** | 1.1 (2h), 1.4 (1-2h) | 3-4h |
| **Hockney** | 1.2 (3-4h), 1.3 test content (0.5h) | 3.5-4.5h |
| **Verbal** | 1.5 (2h), 1.7 (1h), 1.9 shared (1h) | 4h |
| **Kujan** | 1.6 (1h), 1.9 shared (1h), 1.10 (1h) | 3h |
| **Kobayashi** | 1.3 Actions workflow (0.5h), 1.11 (2h), 1.12 (1-2h), 1.13 (1h) | 4.5-5.5h |
| **McManus** | (Wave 1.5 — no Wave 1 items) | — |
| **Keaton** | Review all gates | Continuous |

### Impact on Wave 1 Gate

The Wave 1 gate criteria from 019 are updated:

- [ ] `npm test` passes 20+ tests covering init, upgrade, flags, error cases, and exit codes
- [ ] CI runs on every push and PR — `.github/workflows/ci.yml` exists and is green
- [ ] index.js has zero unhandled exceptions on any filesystem error
- [ ] `squad.agent.md` has a version header
- [ ] `upgrade` reports version deltas
- [ ] Silent success rate is measured and documented
- [ ] Coordinator captures human directives to inbox before routing
- [ ] Coordinator acknowledges user messages with immediate text before tool calls
- [ ] **NEW:** Branch strategy documented and protection rules applied
- [ ] **NEW (gate exit):** Release workflow tested and v0.1.0 tagged on GitHub Releases

---

**Review requested from:** bradygaster  
**Approved by:** Keaton (Lead) — these amendments strengthen 019  
**Next action:** Team reviews, Brady approves, then merge into 019 or execute alongside it
