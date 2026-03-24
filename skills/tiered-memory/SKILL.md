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