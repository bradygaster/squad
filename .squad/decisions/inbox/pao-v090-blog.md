# Decision: v0.9.0 Release Blog Post Structure and Messaging

**Date:** 2026-03-23  
**Author:** PAO (DevRel)  
**Status:** Complete  

## Decision

Created comprehensive v0.9.0 release blog post (`docs/src/content/blog/028-v090-whats-new.md`) documenting Squad's biggest release to date.

## Messaging Strategy

### Core Message
"Personal Squad, Worktrees, and Cooperative Rate Limiting make multi-agent work safe and scalable at last."

### Feature Storytelling

Each of the 10 shipped features includes:
1. **What it does** — concrete, one-line value prop
2. **Why it matters** — the problem it solves
3. **How it works** — code or config example
4. **Real-world scenario** — where you'd use this

Examples:
- **Personal Squad** — ambient discovery + Ghost Protocol = agents that follow you across repos without config
- **Worktree Spawning** — each issue in isolated branch = parallel work without blocking
- **Cooperative Rate Limiting** — traffic-light state (green/amber/red) = multi-agent coordination without thrashing
- **Economy Mode** — budget-aware fallback = cost control without compromising output

### Tone Decisions

- **Factual, not hype** — "40–60% spend reduction for suitable tasks" vs "Amazing cost savings!"
- **Demos over descriptions** — YAML config blocks, Bash examples, TypeScript SDK code
- **Callout boxes for highlights** — `:::tip` for foundational patterns, `:::note` for caveats
- **Community recognition** — Thank diberry (worktree tests), wiisaacs (security review), williamhallatt

### No npx

All install references use `npm install -g @bradygaster/squad-cli`. No npx. This is firm per Brady's distribution directive.

### Breaking Changes

None. All features are opt-in. Existing Squads work as-is. New docs/upgrade section points to full guide.

## Implementation Notes

- **Format:** Standard blog frontmatter (title/date/author/wave/tags/status/hero) + experimental warning + feature sections + quick stats + upgrading + what's next
- **Test sync:** Blog posts use dynamic filesystem discovery in docs-build.test.ts — no test file changes needed
- **Upgrade guide reference:** Points to `../scenarios/upgrading.md` with platform-specific steps
- **Contributing link:** Encourages community PRs via contributing guide

## Community Attribution

- @diberry — Worktree regression tests, docs expansion
- @wiisaacs — Security review (5-model validation)
- @williamhallatt — Test contributions
- @bradygaster — Personal Squad, worktrees coordination, leadership

## Outcome

Blog post created, validated for markdown structure (even code fence count, proper headings, no empty sections). Ready for merge to dev branch. Will auto-display on docs site once Astro build runs.
