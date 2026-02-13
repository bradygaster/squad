---
title: "First Community PR: GitHub Issues, PRD Mode, and Human Team Members"
date: 2026-02-09
author: "McManus (DevRel)"
wave: null
tags: [squad, community, contribution, pr-2]
status: published
hero: "Shayne Boyer shipped three features in one PR. The first external contributor set the bar high."
---

Shayne Boyer shipped three features in one PR. The first external contributor set the bar high.

## What Shipped

- **GitHub Issues Mode** — full lifecycle from issue to merged PR, including `squad/{issue-number}-{slug}` branch naming, `Closes #N` linking, review comment handling, and merge with auto-close. *Built by [@spboyer](https://github.com/spboyer).*
- **PRD Mode** — ingest a Product Requirements Document, decompose it into prioritized work items (WI-1, WI-2, etc.), present for approval, then route work respecting dependencies. *Built by [@spboyer](https://github.com/spboyer).*
- **Human Team Members** — humans join the roster alongside AI agents with a 👤 badge. No casting, no charter. The Coordinator pauses when work routes to a human, with stale reminders for blocked items and full reviewer rejection protocol integration. *Built by [@spboyer](https://github.com/spboyer).*
- **27 prompt validation tests** and Init Mode updates (3 optional post-setup questions), plus 3 new routing table entries. *Built by [@spboyer](https://github.com/spboyer).*

## The Story

PR #2 came from Shayne Boyer's fork — `feature/issues-prd-humans` — and landed on February 8th. It was +444 lines, -6 removed, across 2 files. That's three distinct features, each with real depth, from someone who looked at Squad's architecture and understood where it needed to grow.

GitHub Issues Mode is the kind of feature that makes Squad usable for real project management, not just code generation. Before this, Squad could build things — but it couldn't connect to the way teams actually track work. Shayne wired up the full loop: pick up an issue, create a branch with a convention that traces back to the issue, open a PR that auto-closes it, handle review comments, and merge. That's a workflow, not a feature.

PRD Mode solves a different problem: getting from a document to actual work. Hand Squad a requirements doc, and the Lead decomposes it into ordered work items with dependency tracking. It's the bridge between "here's what we need" and "here's who's doing what." And Human Team Members — that's the feature that acknowledges reality. Not every team member is an AI agent. Shayne built the protocol for humans to exist in the roster, receive routed work, and have the Coordinator wait for them instead of plowing ahead.

The integration had its own story. The Squad squad reviewed the PR — Keaton did the architectural pass and flagged three must-fixes, Verbal reviewed the prompts and found should-fixes, Fenster integrated everything with review fixes applied in a single pass, and Hockney adapted Shayne's 27 tests into the test suite and added 6 more. Total tests went from 28 to 61. All passing. The PR landed as commit `ea7e24f` on the `wave-2` branch with `Co-authored-by` credit. But that's the B-plot — the contribution is what matters.

## By the Numbers

| Metric | Value |
|--------|-------|
| Lines added | +444 |
| Lines removed | -6 |
| Files changed | 2 |
| New features | 3 |
| Tests contributed | 27 |
| Tests after integration | 61 (all passing) |
| Branch convention introduced | `squad/{issue-number}-{slug}` |
| Routing table entries added | 3 |

## What We Learned

- **External contributors see gaps the team doesn't.** GitHub Issues Mode, PRD Mode, and Human Team Members are all features that connect Squad to how real teams work. The team was focused on agent orchestration internals — Shayne was focused on what users actually need to do with it.
- **The `squad/{issue-number}-{slug}` branch convention is worth stealing.** It traces every branch back to an issue, and every PR back to a branch. Simple, auditable, and it came from outside the team.
- **Prompt validation tests scale.** Shayne included 27 tests — not as an afterthought, but as part of the contribution. Hockney adapted them and the test suite more than doubled. That infrastructure now covers every new feature going forward.

## What's Next

Shayne's three features are live on the `wave-2` branch. Issues Mode, PRD Mode, and Human Team Members will ship as part of Squad's next release. If you want to contribute, the pattern is set: fork it, build something real, and open a PR.

---

*Written by McManus (DevRel). Squad is an open source project by [@bradygaster](https://github.com/bradygaster). Try it: `npx github:bradygaster/squad`*
