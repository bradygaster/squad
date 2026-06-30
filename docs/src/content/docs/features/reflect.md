---
title: Reflect — In-Session Learning Capture
description: Built-in skill that extracts HIGH/MED/LOW confidence patterns from conversations to prevent repeating mistakes and reinforce successful patterns.
---
# Reflect — In-Session Learning Capture
The `reflect` skill is a built-in capability that turns every user correction into a learning opportunity. Agents invoke `reflect` after critical conversation moments — corrections, praise, edge-case discoveries — to capture patterns that prevent repeating mistakes across sessions.
It ships at `.copilot/skills/reflect/SKILL.md` and is automatically available to every spawned agent. The skill complements the existing knowledge layers (`history.md`, `decisions.md`) by capturing **in-flight** learnings that may later graduate to permanent memory.
---
## How it fits the memory architecture
Squad has three layers for what agents know:
| Layer | Lifetime | Audience | Reflect's relationship |
|-------|----------|----------|------------------------|
| `.squad/agents/{name}/history.md` | Permanent | Owner agent + Scribe-propagated cross-updates | Reflect captures candidates; HIGH-confidence ones graduate here |
| `.squad/decisions.md` | Permanent | All agents | Reflect surfaces candidates; lead promotes after review |
| `reflect` skill | In-flight | Captured during the active session | Working memory for patterns not yet ready to commit |
Workflow:
1. During the session, agents invoke `reflect` to capture learnings
2. At session end, the agent or Scribe reviews captured learnings
3. HIGH-confidence patterns → lead reviews for `decisions.md` promotion
4. Agent-specific patterns → `{agent}/history.md` append
---
## Triggers — when to invoke reflect
### 🔴 HIGH Priority (invoke immediately)
| Trigger | Example phrase | Why critical |
|---------|---------------|--------------|
| User correction | *"no"*, *"wrong"*, *"not like that"*, *"never do"* | Captures mistakes to prevent repetition |
| Architectural insight | *"you removed that without understanding why"* | Documents the *why* behind a design (Chesterton's Fence) |
| Immediate fixes | *"debug"*, *"root cause"*, *"fix all"* | Learns from errors in real-time |
### 🟡 MEDIUM Priority (invoke after multiple instances)
| Trigger | Example phrase | Why important |
|---------|---------------|--------------|
| User praise | *"perfect"*, *"exactly"*, *"great"* | Reinforces successful patterns |
| Tool preferences | *"use X instead of Y"*, *"prefer"* | Builds workflow preferences |
| Edge cases | *"what if X happens?"*, *"don't forget"*, *"ensure"* | Captures scenarios to handle |
### 🟢 LOW Priority (invoke at natural breakpoints)
| Trigger | Example phrase | Why useful |
|---------|---------------|--------------|
| Workflow refinements | *"better if you..."*, *"next time"* | Iterative improvement |
| Style preferences | *"prefer this format"*, *"like this approach"* | Personal style learning |
---
## Capture format
Reflect produces structured entries the lead or Scribe can review at session end:
```markdown
## Reflection — 2026-06-11T16:42:00Z
**Trigger:** User correction — "no, never auto-merge without explicit approval"
**Confidence:** HIGH
**Pattern:** Auto-merge gating
**Learning:** Even when CI is green and reviews pass, do not invoke `gh pr merge` without an explicit user confirmation. The user wants the final merge action to be human-driven.
**Promote to:** `decisions.md` (team-wide rule) — surface to lead next ceremony
**Cited:** Coordinator session 2026-06-11, user message ~16:41
```
---
## Anti-patterns
- **Don't capture every interaction.** Reflect is for inflection points — corrections, surprises, breakthroughs. A capture rate >1 per ~10 messages is too high.
- **Don't promote LOW-confidence patterns to decisions.md.** Decisions are binding for the whole team; LOW captures are personal preferences and should live in the agent's `history.md` if anywhere.
- **Don't reflect on user instructions you already executed correctly.** That's not learning, that's logging.
- **Don't paraphrase the user's words when capturing HIGH-priority items.** Verbatim quotes preserve nuance.
---
## See also
- [Memory & Knowledge](/squad/docs/concepts/memory-and-knowledge/) — the three-layer model
- [Directives](/squad/docs/features/directives/) — how the coordinator captures explicit team rules
- [Error Recovery](/squad/docs/features/error-recovery/) — the companion skill for handling failures
