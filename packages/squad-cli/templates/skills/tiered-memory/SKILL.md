---
name: tiered-memory
description: Three-tier agent memory model (hot/cold/wiki) for 20-55% context reduction per spawn
domain: memory-management, performance
confidence: high
source: earned (production measurements in tamirdresher/tamresearch1, 34-74KB baseline payloads)
---

# Skill: Tiered Agent Memory

## Overview

Squad agents currently load their full context history on every spawn, resulting in 34–74KB payloads per agent (8,800–18,500 tokens). Measurement shows 82–96% of that context is "old noise" — information that is no longer relevant to the current task. The Tiered Agent Memory skill introduces a three-tier memory model that eliminates this bloat, achieving 20–55% context reduction per spawn in production.

---

## Memory Tiers

### 🔥 Hot Tier — Current Session Context
- **Size target:** ~2–4KB
- **Load policy:** Always loaded. Every spawn includes hot memory by default.
- **Contents:** Current task description, active decisions made this session, immediate blockers, last 3–5 actions taken, who you are talking to right now.
- **Lifetime:** Current session only. Discarded after session ends (Scribe promotes relevant parts to Cold).
- **Purpose:** Provide immediate task context without any latency or load decision.

### ❄️ Cold Tier — Summarized Cross-Session History
- **Size target:** ~8–12KB
- **Load policy:** Load on demand. Include only when the task explicitly needs history.
- **Contents:** Summarized past sessions (compressed by Scribe), cross-session decisions, recurring patterns, unresolved issues from prior work.
- **Lifetime:** 30 days rolling window. After 30 days, Scribe promotes to Wiki tier.
- **Purpose:** Answer "what have we tried before?" and "what was decided?" without replaying full transcripts.
- **How to include:** Pass `--include-cold` in spawn template or add `## Cold Memory` section.

### 📚 Wiki Tier — Durable Structured Knowledge
- **Size target:** variable, structured reference docs
- **Load policy:** Async write, selective read. Load only when task requires domain knowledge.
- **Contents:** Architecture decisions (ADRs), agent charters, routing rules, stable conventions, external API contracts, known platform constraints.
- **Lifetime:** Permanent until explicitly deprecated.
- **Purpose:** Authoritative reference. Not history — structured facts.
- **How to include:** Pass `--include-wiki` or reference specific wiki doc paths in spawn template.

---

## When to Load Each Tier

| Situation | Hot | Cold | Wiki |
|-----------|-----|------|------|
| New task, no prior context needed | ✅ | ❌ | ❌ |
| Resuming interrupted work | ✅ | ✅ | ❌ |
| Debugging a recurring issue | ✅ | ✅ | ❌ |
| Implementing against a spec/ADR | ✅ | ❌ | ✅ |
| Onboarding to unfamiliar subsystem | ✅ | ❌ | ✅ |
| Post-incident review | ✅ | ✅ | ✅ |

---

## Spawn Template Pattern

The default spawn prompt should include **Hot tier only**:

```
## Memory Context

### Hot (current session)
{hot_context}
```

Add `--include-cold` when the task needs history:
```
## Memory Context

### Hot (current session)
{hot_context}

### Cold (summarized history — load on demand)
See: .squad/memory/cold/{agent-name}.md
```

Add `--include-wiki` when the task needs domain knowledge:
```
## Memory Context

### Hot (current session)
{hot_context}

### Wiki (durable reference)
See: .squad/memory/wiki/{topic}.md
```

---

## Measurement Data

Baseline measurements from tamirdresher/tamresearch1 production runs (June 2025):

| Agent | Total Context | Old Noise % | Hot-Only Size | Savings |
|-------|--------------|-------------|---------------|---------|
| Picard (Lead) | 74KB / 18.5K tokens | 96% | ~3KB | 55% |
| Scribe | 52KB / 13K tokens | 91% | ~4KB | 48% |
| Data | 43KB / 10.7K tokens | 88% | ~3.5KB | 42% |
| Ralph | 38KB / 9.5K tokens | 85% | ~3KB | 38% |
| Worf | 34KB / 8.5K tokens | 82% | ~3KB | 20% |

**Average savings: 20–55% per spawn** with Hot-only loading. Cold + Wiki on-demand adds ~2–8KB when needed, still well below current baselines.

---

## Integration with Scribe Agent

Scribe is the memory coordinator for this system. It automates tier promotion:

1. **End of session:** Scribe compresses Hot → Cold summary (keeps ~10% of session verbosity)
2. **After 30 days:** Scribe promotes Cold → Wiki for decisions/facts that aged into stable knowledge
3. **On-demand wiki writes:** Any agent can request Scribe to write a wiki entry mid-session using `scribe:wiki-write`

See Scribe charter: `.squad/agents/scribe/charter.md`

---

## Implementation Checklist

- [ ] Scribe writes Hot context file at session start (`.squad/memory/hot/{agent}.md`)
- [ ] Scribe compresses and writes Cold summary at session end
- [ ] Spawn templates default to Hot-only
- [ ] Coordinators add `--include-cold` / `--include-wiki` flags as needed
- [ ] Wiki entries stored in `.squad/memory/wiki/`
- [ ] Cold entries stored in `.squad/memory/cold/` with 30-day TTL

---

## References

- Upstream issue: bradygaster/squad#600
- Production data: tamirdresher/tamresearch1 (June 2025)

---

## Spawn Template

# Spawn Template: Agent with Tiered Memory

Use this template when spawning any Squad agent. By default it loads **Hot tier only**. Add optional sections as needed.

---

## Task

{task_description}

## WHY

{why_this_matters}

## Success Criteria

- [ ] {criterion_1}
- [ ] {criterion_2}

---

## Memory Context

### 🔥 Hot (always included)

> Paste current session context here (2–4KB max):

```
Current task: {task_description}
Active decisions: {decisions_this_session}
Last actions: {last_3_to_5_actions}
Blockers: {current_blockers_or_none}
Talking to: {current_interlocutor}
```

---

### ❄️ Cold (include when task needs history — add `--include-cold`)

> Load on demand. Do not inline unless specifically needed.

Summarized cross-session history is at:  
`.squad/memory/cold/{agent-name}.md`

Include when:
- Resuming interrupted work
- Debugging a recurring issue  
- "What have we tried before?"

**To load cold memory, add this section and fetch the file before spawning:**

```
## Cold Memory Summary
{contents_of_.squad/memory/cold/{agent-name}.md}
```

---

### 📚 Wiki (include when task needs domain knowledge — add `--include-wiki`)

> Load on demand. Reference specific wiki docs by path.

Wiki entries are at: `.squad/memory/wiki/`

Include when:
- Implementing against an ADR or spec
- Onboarding to unfamiliar subsystem
- Need stable conventions or API contracts

**To load wiki, add this section and reference the specific doc:**

```
## Wiki Reference
{contents_of_.squad/memory/wiki/{topic}.md}
```

---

## Escalation

If blocked or uncertain:
- Architecture questions → @picard  
- Security concerns → @worf  
- Infrastructure/deployment → @belanna  
- Memory/history questions → @scribe  

---

## Notes

- Hot tier is always included and should stay under 4KB
- Cold adds ~8–12KB; only include when history is relevant
- Wiki adds variable size; only include specific relevant docs
- See `skills/tiered-memory/SKILL.md` for full tier reference
- See `docs/tiered-memory-guide.md` for wiring instructions
