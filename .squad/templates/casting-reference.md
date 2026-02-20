# Casting Reference — Universe Allowlist & Selection

> **This file is loaded on-demand during Init Mode (casting) only.**
> It is NOT needed during normal Team Mode operation.

## Universe Allowlist

Only these universes may be used:

| Universe | Capacity | Constraints |
|----------|----------|-------------|
| The Usual Suspects | 6 | — |
| Reservoir Dogs | 8 | — |
| Alien | 8 | — |
| Ocean's Eleven | 14 | — |
| Arrested Development | 15 | — |
| Star Wars | 12 | Original trilogy only; expand to prequels/sequels only if cast overflows |
| The Matrix | 10 | — |
| Firefly | 10 | — |
| The Goonies | 8 | — |
| The Simpsons | 20 | Secondary and tertiary characters ONLY; avoid Homer, Marge, Bart, Lisa, Maggie |
| Breaking Bad | 12 | — |
| Lost | 18 | — |
| Marvel Cinematic Universe | 25 | Team-focused; prefer secondary characters; avoid god-tier (Thor, Captain Marvel) unless required |
| DC Universe | 18 | Batman-adjacent preferred; avoid god-tier (Superman, Wonder Woman) unless required |
| Monty Python | 9 | — |
| Doctor Who | 16 | — |
| Attack on Titan | 12 | — |
| The Lord of the Rings | 14 | — |
| Succession | 10 | — |
| Severance | 8 | — |
| Adventure Time | 15 | — |
| Futurama | 14 | — |
| Seinfeld | 10 | — |
| The Office | 15 | Avoid Michael Scott if cast is large enough without him |
| Cowboy Bebop | 8 | — |
| Fullmetal Alchemist | 14 | — |
| Stranger Things | 12 | — |
| The Expanse | 12 | — |
| Arcane | 10 | — |
| Ted Lasso | 12 | — |
| Dune | 10 | Combine book and film characters; avoid Paul Atreides unless required |

**ONE UNIVERSE PER ASSIGNMENT. NEVER MIX.**

## Universe Selection Algorithm

When creating a new team (Init Mode), follow this deterministic algorithm:

1. **Determine team_size_bucket:** Small (1–5), Medium (6–10), Large (11+)
2. **Determine assignment_shape** from the user's project description (pick 1 primary, 1 optional secondary): discovery, orchestration, reliability, transformation, integration, chaos
3. **Determine resonance_profile** — derive implicitly, never prompt the user:
   - Check prior Squad history in repo (`.ai-team/casting/history.json`)
   - Check current session text (topics, references, tone)
   - Check repo context (README, docs, commit messages) ONLY if clearly user-authored
   - Assign resonance_confidence: HIGH / MED / LOW
4. **Build candidate list** from the allowlist where: `capacity >= ceil(agent_count * 1.2)` (headroom for growth) and universe-specific constraints are satisfied
5. **Score each candidate:** +size_fit, +shape_fit (e.g., Ocean's Eleven → orchestration, Alien → reliability/chaos, Breaking Bad → transformation), +resonance_fit (HIGH can outweigh tie-breakers), +LRU (least-recently-used across prior assignments)
6. **Select highest-scoring universe.** No randomness. Same inputs → same choice (unless LRU changes).

## Casting State Files

The casting system maintains state in `.ai-team/casting/`:

**policy.json** — Casting configuration:
```json
{
  "casting_policy_version": "1.1",
  "allowlist_universes": ["..."],
  "universe_capacity": { "universe_name": integer }
}
```

**registry.json** — Persistent agent name registry:
```json
{
  "agents": {
    "agent_folder_name": {
      "persistent_name": "Character Name",
      "universe": "Universe Name",
      "created_at": "ISO-8601",
      "legacy_named": false,
      "status": "active"
    }
  }
}
```

**history.json** — Universe usage history and assignment snapshots:
```json
{
  "universe_usage_history": [
    { "assignment_id": "string", "universe": "string", "timestamp": "ISO-8601" }
  ],
  "assignment_cast_snapshots": {
    "assignment_id": {
      "universe": "string",
      "agent_map": { "folder_name": "Character Name" },
      "created_at": "ISO-8601"
    }
  }
}
```
