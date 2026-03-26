# Proposal: Tiered Agent Memory Skill

**Issue:** bradygaster/squad#600
**Author:** tamirdresher
**Date:** 2026-03-26
**Status:** Proposal

---

## Problem Statement

Squad agents load their full conversation history on every spawn. In production, top agents carry:

| Agent | Context Size | Old Noise % |
|-------|-------------|-------------|
| Picard | 74KB / 18,500 tokens | 96% |
| Scribe | 52KB / 13,000 tokens | 91% |
| Data   | 43KB / 10,700 tokens | 88% |
| Ralph  | 38KB / 9,500 tokens  | 85% |
| Worf   | 34KB / 8,500 tokens  | 82% |

82-96% of each agent's context is "old noise" — past decisions, completed tasks, and ended
conversations. This wastes tokens, increases spawn latency, and risks agents hallucinating
stale context as current fact.

---

## Proposed Approach

Replace monolithic context loading with a three-tier model:

**Hot Tier (~2-4KB, always loaded):** Current session context only. Task description, active
decisions this session, last 3-5 actions, current blockers.

**Cold Tier (~8-12KB, on-demand):** Summarized cross-session history compressed by Scribe
(~10:1 compression). Load with --include-cold when task needs history.

**Wiki Tier (variable, selective read):** Durable structured knowledge — ADRs, stable
conventions, API contracts, agent charters. Load with --include-wiki.

**Result:** 20-55% context reduction per spawn with better relevance.

### Scribe Integration

Scribe automates tier promotion:
- End of session: Scribe compresses Hot → Cold summary
- After 30 days: Scribe promotes Cold → Wiki for aged stable decisions
- On-demand: Any agent can request a wiki entry with scribe:wiki-write

---

## Fit with Existing Architecture

- **Complements** Scribe's existing session summary role (formalizes it with structured output)
- **No changes to existing agents** — coordinators opt in by including cold/wiki sections
- **File layout** uses existing .squad/ directory convention
- **No code changes** — template-only skill, spawn templates are guidelines

---

## What Changes

- New skill: packages/squad-cli/templates/skills/tiered-memory/SKILL.md
- New skill: packages/squad-sdk/templates/skills/tiered-memory/SKILL.md
- New changeset: .changeset/tiered-memory.md

## What Stays the Same

- Existing spawn templates unchanged (opt-in)
- Scribe charter not modified (skill provides guidance, Scribe charter update is separate)
- No CLI or SDK runtime code changed

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cold tier grows stale without Scribe automation | Medium | Low | Skill documents TTL; manual promotion works too |
| Wiki tier becomes a dumping ground | Low | Medium | Skill explicitly scopes Wiki to stable facts only |
| Cold compression loses important context | Low | Medium | Scribe keeps 10% verbosity; agents can load raw cold if needed |

---

## References

- Issue: bradygaster/squad#600
- Production measurements: tamirdresher/tamresearch1 (June 2025)
