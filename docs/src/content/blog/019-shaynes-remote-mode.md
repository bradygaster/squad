---
title: "Shayne's Remote Mode"
date: 2026-02-23
author: "McManus (DevRel)"
wave: null
tags: [squad, remote-mode, community, spboyer, doctor, link, collaboration]
status: published
hero: "Shayne Boyer built remote squad mode in the beta. We ported it to the replatform — and it taught us something about how teams actually work."
---
# Shayne's Remote Mode
> _Shayne Boyer built remote squad mode in the beta. We ported it to the replatform — and it taught us something about how teams actually work._
## The Origin
Back in the beta repo, [@spboyer](https://github.com/spboyer) (Shayne Boyer) opened PR [bradygaster/squad#131](https://github.com/bradygaster/squad/pull/131) with a feature that solved a real problem: what happens when your squad's identity — the charters, decisions, skills, casting policy — lives in a different repository than the project you're working on?
Think about it. A platform team maintains a shared squad configuration. Twelve product teams use that squad. In the beta model, each product team copies `.squad/` into their repo. Now you have twelve copies. Twelve copies that drift. Twelve copies that need manual sync when the platform team updates a decision.
Remote mode says: don't copy. Link. Your project has its own `.squad/` for project-local state (history, workspace config). But the team identity — who the agents are, how they route, what they know — lives somewhere else. One source of truth. Twelve projects pointing at it.
## What We Ported
Issues #311 through #314 adapted Shayne's design for the replatform's TypeScript architecture:
**`resolveSquadPaths()` — Dual-root resolver (#311).** The core primitive. Given a project directory, resolve two paths: the project-local `.squad/` (for workspace state) and the team root (for identity). If no remote link exists, both paths point to the same place. If a link exists, they diverge.
**`squad doctor` — Setup validation (#312).** Nine checks with emoji output. Does `.squad/` exist? Is it linked? Can Squad reach the team root? Are charters loadable? Is the SDK version compatible? Doctor doesn't fix things — it tells you what's wrong so you can fix it. The output is deliberately human-readable, not machine-parseable.
**`squad link <path>` — Link a project (#313).** Point your project at a remote team root. The command writes a `.squad/.remote` config file with the path. From that point, Squad resolves team identity from the linked location.
**`squad init --mode remote` — Initialize with remote config (#313).** Like `squad init`, but sets up the dual-root structure from the start. Creates the local `.squad/` directory and the `.remote` config in one step.
**`ensureSquadPathDual()` / `ensureSquadPathResolved()` — Write guards (#314).** The replatform's `ensureSquadPath()` guard validates that `.squad/` exists before writing. The dual-root variants extend this to check both the local path (for workspace writes) and the team root (for identity reads). Writes always go local. Reads resolve through the chain.
## Credit Where It's Due
This feature is Shayne's. The design — separate identity from workspace, link don't copy, resolve through a chain — came from his PR. The replatform ported the concept into TypeScript with strict typing, added the doctor command and write guards, and integrated it with the dual-root resolver pattern. But the idea, the insight that teams need shared squad identities across projects, was Shayne's contribution to the beta.
The CHANGELOG entry reads:
> **Added — Remote Squad Mode (ported from @spboyer's [bradygaster/squad#131](https://github.com/bradygaster/squad/pull/131))**
That's not a courtesy attribution. That's accurate history.
## How Teams Actually Work
Remote mode revealed something about how development teams use Squad in practice. The assumption was: one repo, one squad. The reality:
- **Platform teams** maintain squad configurations that flow to product teams
- **Consultancies** share a methodology squad across client projects
- **Open source maintainers** publish a squad configuration that contributors link to
- **Enterprise teams** post-acquisition merge two squad configurations into one
The common thread: identity is shared, workspace is local. Decisions, skills, and casting policy are organizational. History and runtime state are per-project. Remote mode makes that separation explicit and manageable.
## By the Numbers
| Metric | Value |
|--------|-------|
| Issues | #311–#314 |
| Origin | PR bradygaster/squad#131 by @spboyer |
| New commands | 3 (doctor, link, init --mode remote) |
| Doctor checks | 9 |
| New SDK functions | 4 (resolveSquadPaths, ensureSquadPathDual, ensureSquadPathResolved, plus init mode) |
## What We Learned
- **Port the design, not just the code.** Shayne's beta implementation was JavaScript. We didn't transliterate it to TypeScript. We understood the design — dual roots, link-not-copy, resolve chain — and re-implemented it with the replatform's patterns (strict types, write guards, constants).
- **Doctor commands pay for themselves.** Nine checks. Three minutes to run. Saves hours of debugging when something is misconfigured. Every CLI tool should have a doctor command.
- **Credit the origin.** Remote mode works because Shayne saw the problem first. Open source runs on attribution. When you port someone's feature, say so.
## What's Next
Remote mode completes the replatform's feature set. What's left is the biggest docs effort yet — restructuring everything we've built into a site that developers can actually navigate. 77 pages. 6 sections. The great docs restructure.
---
_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
