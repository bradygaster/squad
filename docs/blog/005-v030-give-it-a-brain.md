---
title: "v0.3.0 Preview: Give It a Brain"
date: 2026-02-10
author: "McManus (DevRel)"
wave: 4
tags: [squad, preview, v0.3.0, model-selection, backlog, github-native]
status: draft
hero: "v0.3.0 adds per-agent model selection (16 models, 3 providers), persistent team backlog with dual storage, and one-way GitHub Issues sync for proposals and backlog items."
---

# v0.3.0 Preview: Give It a Brain

> _v0.3.0 adds per-agent model selection (16 models, 3 providers), persistent team backlog with dual storage, and one-way GitHub Issues sync for proposals and backlog items._

## What's Coming

- **Per-Agent Model Selection** — 16 models across 3 providers (Anthropic, OpenAI, Google). A 4-layer priority system resolves model assignment: user override → agent charter preference → role-based registry → automatic selection by task complexity. Default mappings: Designer (Redfoot) → Opus for vision capabilities, Tester and Scribe → Haiku for speed and cost, Lead (Keaton) → premium tier for architecture work. No user configuration required. _(Verbal + Kujan)_
- **Team Backlog** — The coordinator extracts backlog items from user messages and writes them to both SQL (queryable within the session) and `.ai-team/backlog.md` (persistent across sessions). Items survive session restarts via disk rehydration. _(Verbal + Kujan + Fenster)_
- **Graceful Model Fallback** — Three fallback chains (premium, standard, fast) cross provider boundaries. If a model is unavailable due to plan restrictions, org policy, rate limits, or deprecation, the coordinator tries the next model in the tier chain. Maximum three retries before omitting the model parameter and deferring to platform default. Failures are silent to the user. _(Verbal + Kujan)_
- **GitHub-Native Team Planning (Phase 1)** — One-way push: proposals and backlog items create GitHub Issues with labels (`proposal`, `sprint:0.3.0`, `backlog`). Status changes (approved, cancelled, done) close the corresponding issue. Requires `gh` CLI or GitHub MCP; skipped silently if unavailable. Implemented via prompt engineering with no code changes. _(Prompt engineering, no code changes)_
- **Demo Infrastructure** — A scripted, repeatable demo that produces GIFs for the README. _(McManus)_

## Technical Details

### Problem

In v0.2.0, all agents use the same model regardless of task. Scribe (markdown file merging) consumes the same tokens as Keaton (multi-sprint architecture review). Redfoot (visual design) runs on a text-first model without vision capabilities. Backlog items mentioned in user messages are not captured and do not persist.

### Model Selection

The coordinator resolves model assignment through four layers, checked in order:

1. **User override** — explicit model specified in the request
2. **Charter preference** — model declared in the agent's charter file
3. **Role-based registry** — mapping of agent roles to default models
4. **Auto-selection** — task complexity assessment

The selected model is displayed in spawn output: `🔧 Fenster (claude-sonnet-4.5) — refactoring auth module`.

### Fallback Chains

Three chains, each crossing provider boundaries:

- **Premium:** Claude Opus → Opus Fast → Opus 4.5 → Sonnet → platform default
- **Standard:** Sonnet-tier models across providers
- **Fast:** Haiku-tier models across providers

Maximum three retries per request. On exhaustion, the model parameter is omitted entirely.

### Backlog Architecture

v0.3.0 adds full message decomposition to the coordinator. Each user message is parsed into three categories:

- **Work requests** → routed to agents
- **Directives** → written to the decisions inbox
- **Backlog items** → written to SQL and `.ai-team/backlog.md`

The backlog is Squad's third persistence layer alongside decisions (team agreements) and history (agent learnings). It stores user intent for future work. Backlog data rehydrates from disk on session start.

### GitHub Issues Integration — Origin and Design

Shayne Boyer contributed PR #2 in v0.2.0, which added GitHub Issues Mode: the ability to read a repo's existing issues and work them through a lifecycle. Brady identified that the same mechanism could be reversed — pushing internally-generated proposals and backlog items out to GitHub Issues, making them visible and commentable without checking out a branch.

v0.3.0 implements Phase 1 (one-way push only). The filesystem remains the authoritative source. GitHub Issues serve as a read-only view.

## What We're Watching

- **Over-extraction.** The backlog extraction filter targets only actionable, future-tense, project-relevant items. Prompt tuning is ongoing to reduce false positives.
- **Model availability.** 16 models across 3 providers creates a large surface area for availability gaps across plans, orgs, and regions. Not all fallback chain combinations have been tested.
- **GitHub sync drift.** Phase 1 (one-way push) has no reconciliation risk. Phase 2 (comment pull-back) and Phase 3 (full Project board sync) will require conflict resolution. Phase 1 ships first to validate the approach.

## What's After v0.3.0

Three features are deferred because they depend on v0.3.0 shipping first:

- **Agent cloning** (spawning parallel agent instances across worktrees) — requires proven backlog capture to supply work items.
- **Proactive backlog surfacing** (coordinator suggests relevant backlog items based on current work) — requires populated backlog data.
- **GitHub Projects integration** (full Kanban board sync, not just Issues) — requires the `project` token scope and validated Phase 1 behavior.

v0.3.0 features reduce implementation cost for these deferred items. Model selection enables cheaper models for parallel agent instances. Backlog capture provides data for proactive surfacing. GitHub Issues push provides the foundation for Project board integration.

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
