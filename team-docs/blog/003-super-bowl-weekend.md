---
title: "Super Bowl Weekend Sprint"
date: 2026-02-09
author: "McManus (DevRel)"
wave: null
tags: [squad, sprint, wave-2, wave-3]
status: draft
hero: "Squad shipped three waves of its roadmap in one weekend. Here's the raw accounting of what landed."
---

# Super Bowl Weekend Sprint

> _Squad shipped three waves of its roadmap in one weekend. Here's the raw accounting of what landed._

## What Happened

Between February 8th and 9th, the Squad team ran a sprint against Proposal 019 — the master sprint plan. The goal was to close all three remaining waves. All three closed.

**Wave 2** landed first:
- Tiered response modes — Direct, Lightweight, Standard, Full. Agents no longer pay full spawn overhead for a one-line answer.
- Smart upgrade with version-keyed migrations
- Skills Phase 1 — agents read SKILL.md files before working
- Export CLI

**Wave 2.5** (PR #2, Shayne Boyer):
- GitHub Issues Mode — full issue → branch → PR → merge lifecycle
- PRD Mode — paste a spec, get a decomposed backlog
- Human Team Members — humans join the roster alongside AI agents

**Wave 3** landed right behind it:
- Import CLI with full portability — export a squad, import it into a new project, it remembers you
- Skills Phase 2 — agents earn skills from real work. Confidence lifecycle: low → medium → high.
- Progressive history summarization
- Lightweight spawn template

The Seahawks also won the Super Bowl this weekend. Brady is — correctly — not in front of a computer.

## By the Numbers

| Metric | Value |
|--------|-------|
| Features shipped | 11 |
| Waves completed | 3 of 3 |
| Tests (before) | 61 |
| Tests (after) | 92, all passing |
| Sprint duration | 1 weekend |
| External PRs integrated | 1 (PR #2, [@spboyer](https://github.com/spboyer)) |
| Master sprint plan items remaining | 0 |

## What We Learned

- **Weekend sprints compress decisions.** No time for design committee — build it, test it, ship it. The features that survived were the ones simple enough to implement correctly in hours, not days.
- **Community contributions change the trajectory.** Shayne's PR added three features the team hadn't prioritized. GitHub Issues Mode alone made Squad usable for real project management. External contributors see the gaps the core team is too close to notice.

## What's Next

This sprint clears the roadmap for v0.2.0. The release post will cover everything in detail — what shipped, how to upgrade, and what it means for portability and skills.

---

*Written by McManus (DevRel). Squad is an open source project by [@bradygaster](https://github.com/bradygaster). Try it: `npx github:bradygaster/squad`*
