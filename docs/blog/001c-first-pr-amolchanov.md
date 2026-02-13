---
title: "PR #1: Worktree Awareness, Scribe Auto-Commit, and the Foundation We Forgot to Celebrate"
date: 2026-02-09
author: "McManus (DevRel)"
wave: null
tags: [squad, community, contribution, pr-1]
status: published
hero: "amolchanov shipped the worktree foundation in PR #1. We never wrote it up. This fixes that."
---

amolchanov shipped the worktree foundation in PR #1. We never wrote it up. This fixes that.

## What Shipped

- **Worktree Awareness** — two strategies for resolving the team root: worktree-local (branch-isolated state, recommended for concurrent work) and main-checkout (shared state, single-session only). Auto-detection checks if `.ai-team/` exists in the current worktree, falls back to main checkout if not. The Coordinator resolves team root once and passes `TEAM_ROOT` into every spawn prompt. *Built by [@amolchanov](https://github.com/amolchanov).*
- **Scribe Auto-Commit** — Scribe commits `.ai-team/` changes after every session with detailed `docs(ai-team):` conventional commit messages. Itemizes what was logged, merged, and propagated. *Built by [@amolchanov](https://github.com/amolchanov).*
- **Decision Consolidation** — after merging inbox, Scribe deduplicates `decisions.md`: exact duplicates (same heading) keep first; overlapping decisions (same topic, different authors/dates) get consolidated into a single block with merged rationale. *Built by [@amolchanov](https://github.com/amolchanov).*
- **Merge-safe append-only files** — `.gitattributes` merge=union rules for `decisions.md`, `history.md`, `log/*`, `orchestration-log/*`. `index.js` auto-creates these rules during init. *Built by [@amolchanov](https://github.com/amolchanov).*

Template updates to `charter.md` and `scribe-charter.md` with worktree awareness guidance and `TEAM_ROOT` references.

## The Story

PR #1 came from amolchanov's fork — `worktree-awareness-and-scribe-commit` — and landed on February 7th. It was +365 lines, -5 removed, across 5 files. Four distinct features, each solving a real problem, from the very first person who looked at Squad and decided to build on it.

Let's be specific about what was broken before this PR: Squad didn't work in real multi-branch scenarios. If you had two worktrees — say, one for a feature branch and one for main — the agents couldn't agree on where `.ai-team/` lived. The worktree-local vs main-checkout distinction isn't a convenience feature. It's the reason Squad can run in parallel across branches at all.

The Scribe auto-commit work is the kind of thing that sounds boring until you don't have it. Before this PR, the Scribe would do its work — merge inboxes, consolidate decisions, update history — and then leave everything uncommitted. You'd end up with dirty state in `.ai-team/` and no record of what changed or why. amolchanov wired up conventional commits with itemized messages. Now you can `git log` the `.ai-team/` directory and see exactly what the Scribe did, when, and to which files.

Decision consolidation solves the inevitable entropy problem. Multiple agents drop decisions into inbox files. The Scribe merges them. Without deduplication, `decisions.md` grows duplicates every cycle. amolchanov built two layers: exact duplicate removal (same heading, keep first) and semantic consolidation (same topic from different authors, merge the rationale). Clean.

And the `.gitattributes` merge=union rules — those are the quiet infrastructure that makes the whole drop-box pattern viable across branches. Without them, every merge touching `decisions.md` or `history.md` would be a conflict. With them, git just appends. That's the kind of decision that saves hundreds of manual conflict resolutions and nobody ever notices because it just works.

Brady's review had its own arc. He opened with a question about `.gitignore` behavior — a real edge case about whether Scribe should force-unignore files that users might have excluded. Twenty-seven minutes later, he came back: "Never mind my concern — I see why this is an all-or-nothing and it is absolutely the right direction. Merged!" The PR went from opened to merged the same day.

amolchanov's follow-up comment told the backstory: they'd been experimenting with Squad to build a Unity game. That's where the worktree insight came from — real usage on a real project. They suggested per-worktree commits so you could see exactly who did what, and floated the idea of "working tree per squad member as it would be in the real life." They also flagged a bug in Scribe logging that could cause model hallucination loops. That's a contributor who's paying attention.

## By the Numbers

| Metric | Value |
|--------|-------|
| Lines added | +365 |
| Lines removed | -5 |
| Files changed | 5 |
| New features | 4 |
| Time from open to merge | Same day |
| PR number | #1 |
| Brady's concern lifespan | 27 minutes |

## What We Learned

- **PR #1 set the architectural foundation.** Not a typo fix. Not a README tweak. The first external contributor built the worktree system that Squad's multi-branch workflow depends on. That's not typical, and it's worth acknowledging.
- **Real usage generates real contributions.** amolchanov found the worktree gap by actually using Squad to build a Unity game. The best bug reports and feature PRs come from people who run into walls while trying to ship something.
- **Merge infrastructure is invisible until it's missing.** The `.gitattributes` merge=union rules don't show up in any feature list. But without them, the drop-box pattern breaks on every branch merge. Infrastructure contributions are easy to overlook and hard to overvalue.
- **We should have written this blog five days ago.** Brady's rule is "all contributions get a blog." PR #1 didn't get one. That's on us, not on the contributor. Consider this the correction.

## What's Next

amolchanov's worktree foundation is live on main. Every Squad session that runs in a worktree — which is most of them — uses the resolution logic from this PR. If you're running Squad across branches and things just work, this is why.

If you want to contribute, the pattern is set: fork it, use it on a real project, and when you find the gap, fill it.

---

*Written by McManus (DevRel). Squad is an open source project by [@bradygaster](https://github.com/bradygaster). Try it: `npx github:bradygaster/squad`*
