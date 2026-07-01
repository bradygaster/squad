---
title: Tiered Memory — Hot / Cold / Wiki
description: Three-tier agent memory model that cuts spawn context cost by 20-55% by separating fresh task context from archived history and durable reference docs.
---
# Tiered Memory — Hot / Cold / Wiki
**Problem:** Squad agents load their full `history.md` on every spawn. Production measurements show 34–74KB payloads per agent (8.8K–18.5K tokens), with 82–96% of that being "old noise" — context the current task doesn't need.
**Solution:** A three-tier memory model that loads only what each task actually requires, achieving 20–55% context reduction per spawn.
Tiered Memory ships as a built-in skill at `.github/skills/tiered-memory/SKILL.md`. In current releases, `squad init` and `squad upgrade` install it automatically. It pairs with Scribe's existing 15KB-summarization rule (see [Memory & Knowledge](/squad/docs/concepts/memory-and-knowledge/)) to give large, long-running squads predictable context budgets.
---
## The three tiers
### 🔥 Hot — Current Session Context
- **Size target:** ~2–4KB
- **Loaded:** Always, on every spawn
- **Contents:** Current task, active decisions made this session, immediate blockers, last 3–5 actions, who's being talked to
- **Lifetime:** Current session only — Scribe promotes relevant parts to Cold at session end
- **Purpose:** Immediate task context with zero latency and zero decision
### ❄️ Cold — Summarized Cross-Session History
- **Size target:** ~8–12KB
- **Loaded:** On demand — include only when the task explicitly needs history
- **Contents:** Summarized past sessions, cross-session decisions, recurring patterns, unresolved issues
- **Lifetime:** 30-day rolling window — older entries promoted to Wiki
- **Purpose:** Answer *"what have we tried before?"* and *"what was decided?"* without replaying full transcripts
- **How to include:** Pass `--include-cold` in the spawn template, or add a `## Cold Memory` section to the agent's instructions
### 📚 Wiki — Durable Structured Knowledge
- **Size target:** variable (structured reference docs)
- **Loaded:** Async write, selective read — only when the task requires domain knowledge
- **Contents:** ADRs, agent charters, routing rules, stable conventions, external API contracts, platform constraints
- **Lifetime:** Permanent until explicitly deprecated
- **Purpose:** Authoritative reference (not history) — structured facts
- **How to include:** Pass `--include-wiki` or reference specific wiki doc paths in the spawn template
---
## When to load each tier
| Situation | Hot | Cold | Wiki |
|-----------|-----|------|------|
| New task, no prior context needed | ✅ | ❌ | ❌ |
| Resuming interrupted work | ✅ | ✅ | ❌ |
| Debugging a recurring issue | ✅ | ✅ | ❌ |
| Designing something new in an established area | ✅ | ❌ | ✅ |
| Onboarding a new team member | ✅ | ❌ | ✅ |
| Investigating an architectural drift | ✅ | ✅ | ✅ |
The bias is to load LESS, not more. Cold and Wiki should be opt-in for each spawn based on whether the task description references the past or domain conventions.
---
## How Scribe maintains the tiers
Scribe's existing maintenance cycle (see [Memory & Knowledge](/squad/docs/concepts/memory-and-knowledge/)) is extended:
1. **Hot drained at session end** — Scribe scans the session's hot memory, summarizes meaningful entries, appends them to Cold
2. **Cold aged into Wiki** — entries older than 30 days that contain structured facts (decisions, conventions, contracts) get promoted to Wiki
3. **Wiki authored deliberately** — Scribe never auto-creates Wiki entries from scratch; it only promotes Cold content that's already structured
---
## Production measurements
The skill's documentation cites measurements from a large production squad:
| Squad size | Before tiered | After tiered | Reduction |
|------------|--------------|--------------|-----------|
| 8 agents, 34KB total history | 8,800 tokens/spawn | 4,400 tokens/spawn | ~50% |
| 14 agents, 74KB total history | 18,500 tokens/spawn | 8,300 tokens/spawn | ~55% |
The exact savings depend on what fraction of each agent's history is task-relevant. The 20–55% range is the measured spread across different team configurations.
---
## Caveats
- **The tier split is currently advisory** — the skill defines hot/cold/wiki semantics, but the spawn template doesn't yet enforce `--include-cold` / `--include-wiki` flags as part of the runtime contract. Adoption is per-team via spawn-template edits.
- **Wiki has no UI** — there's no `squad wiki list` command yet. Entries live as files in `.squad/wiki/` (when teams create that directory) and the coordinator references them by path.
- **Issue [#1268](https://github.com/bradygaster/squad/issues/1268) and [#1269](https://github.com/bradygaster/squad/issues/1269)** propose making Scribe enforce these tiers via the governed memory pipeline. Until those land, tier maintenance is best-effort.
---
## See also
- [Memory & Knowledge](/squad/docs/concepts/memory-and-knowledge/) — the broader memory architecture
- [Skills](/squad/docs/features/skills/) — how built-in skills work
- [Context Hygiene](/squad/docs/features/context-hygiene/) — related practices for keeping spawn context small
