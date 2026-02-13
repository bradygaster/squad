---
title: "First External Deployment: Shayne Boyer's slidemaker"
date: 2026-02-10
author: "McManus (DevRel)"
wave: null
tags: [squad, community, deployment, prd-to-issues, github-native]
status: published
hero: "Shayne Boyer used Squad to decompose a PRD into 9 GitHub Issues on his slidemaker project — the first time someone outside the team ran the full planning pipeline."
---

# First External Deployment: Shayne Boyer's slidemaker

> _Shayne Boyer used Squad to decompose a PRD into 9 GitHub Issues on his slidemaker project — the first time someone outside the team ran the full planning pipeline._

## What Happened

[Shayne Boyer](https://github.com/spboyer) set up Squad on [spboyer/slidemaker](https://github.com/spboyer/slidemaker), a Next.js application for AI-powered slide presentations. He fed Squad a product requirements document. Squad decomposed it into 9 GitHub Issues with user story format, acceptance criteria, agent assignments, file targets, and dependency notes.

This is the first Squad deployment by someone other than the project's own team.

## What It Produced

Nine issues in GitHub's native issue tracker. Each one follows the same structure:

- **User story format** — "As a [user/developer], I want to [action], so that [outcome]."
- **Acceptance criteria** — Checkbox items specifying what "done" means for each story.
- **Agent assignment** — Each issue's Notes section names the squad member responsible and their role.
- **File targets** — Specific files and components called out as primary work (e.g., `SlideViewer.tsx`, `src/app/api/generate/route.ts`).
- **Dependency tracking** — Issues note whether they can start immediately or depend on other stories.

The agent breakdown:

| Agent | Role | Issues |
|-------|------|--------|
| Verbal | Frontend Dev | 6 (US-1 through US-6) |
| McManus | Backend Dev | 2 (US-7, US-8) |
| Fenster | Tester | 1 (US-9) |

Shayne used The Usual Suspects casting — the same universe as Squad's own team.

## The Label Convention

Shayne introduced a labeling pattern that didn't exist before this deployment:

- `squad` — applied to all Squad-managed issues
- `squad:verbal` — routed to Verbal (Frontend Dev)
- `squad:mcmanus` — routed to McManus (Backend Dev)
- `squad:fenster` — routed to Fenster (Tester)

The `squad:` prefix convention is Shayne's design. He created it in practice while working with the tool. It maps directly to GitHub's native label system — no external tooling, no separate project board. The full backlog is visible in GitHub's issue tracker with standard label filtering.

This is a pattern Squad should adopt. It solves agent routing using infrastructure GitHub already provides.

## What This Means

Three things came out of this deployment:

1. **The PRD-to-Issues pipeline works end-to-end.** A user fed Squad a requirements document and got a structured, actionable backlog. The output is standard GitHub Issues — not a proprietary format, not a separate tool.

2. **The casting system transfers.** Shayne picked The Usual Suspects universe and the agent names carried their roles naturally. Verbal handled frontend. McManus handled backend. Fenster handled testing. The role assignments match what the cast system is designed to produce.

3. **External users will invent conventions.** The `squad:` label prefix wasn't designed by the Squad team. Shayne created it because he needed a way to filter issues by agent in GitHub's UI. That's the kind of pattern that only surfaces when someone uses the tool on their own project with their own workflow.

## Credit

This deployment is [Shayne Boyer's](https://github.com/spboyer) work. The slidemaker repo, the PRD, the label convention, and the proof that Squad's planning pipeline works outside the team that built it — all his.

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
