# SKILL: Universe Selection Criteria Framework

**Confidence**: Medium  
**Verified**: 2026-02-10 (Keaton universe expansion decision)  
**Applies to**: Casting system policy, universe portfolio expansion, team character assignments  
**Owner**: Keaton (Lead)

## Problem

When evaluating whether to add new universes to the allowlist, decisions can be ad-hoc or miss structural gaps. Need a reusable framework for assessing coverage and recommending strategic additions.

## The Pattern

### Evaluation Dimensions

Assess any universe portfolio against 4 orthogonal axes:

| Axis | Questions | Metrics |
|------|-----------|---------|
| **Geography/Culture** | Are universes globally diverse? Do they reflect audience geography? | % non-American; count of distinct cultural origins (UK, Japan, EU, etc.) |
| **Genre Diversity** | Is the portfolio skewed to one genre? | Genre distribution by count; outliers (missing fantasy, sci-fi, etc.) |
| **Capacity Distribution** | Do available sizes match team distribution needs? | Universes per bucket: Small (6-10), Medium (11-18), Large (19+) |
| **Developer Resonance** | Would the target audience recognize and enjoy this universe? | Overlap with tech/creative communities; Easter egg "smile factor" |

### Gap Analysis Algorithm

1. **Catalog current state** — list all universes with capacity, origin, genre, size bucket
2. **Count by dimension:**
   - Geography: tally by origin region
   - Genre: tally by primary genre (crime, sci-fi, comedy, drama, fantasy, animation)
   - Capacity: count universes in each size bucket
   - Resonance: note which communities each universe serves
3. **Identify outliers:** What's underrepresented? (e.g., fantasy=0%, anime=0%, British=0%)
4. **Propose candidates** that fill largest gaps:
   - Each new universe should fill ≥2 gaps (not 1)
   - Target candidate pool: 15–25 universes total (quality over quantity)
   - Each universe needs ≥6 distinct usable character names (minimum viable roster)
5. **Evaluate trade-offs:**
   - Keep existing universes (switching costs high; breaks assignment history)
   - No universe constraints unless necessary (simpler initialization)
   - Selection algorithm unchanged (compounds existing work)

### Success Criteria for Additions

- ✅ Geography: ≥2 new geographic origins
- ✅ Genre: Fills largest gap (e.g., fantasy 0% → 5%; sci-fi ++) 
- ✅ Capacity: Better distribution (fewer gaps in small/medium/large buckets)
- ✅ Resonance: All additions would make developers smile on team creation
- ✅ Depth: Each universe has 6+ distinct names (not thin character pools)

## Application Notes

- **When to use**: Casting policy reviews, portfolio health checks, expansion decisions
- **Who decides**: Keaton (Lead) — architecture/strategy decision
- **How to document**: Use decision format (problem → solution → trade-offs → alternatives → success)
- **Frequency**: Annual or on Brady's direction ("people think we need...")

## Example

**Current state (2026-02-10 baseline):**
- 14 universes, 185 capacity
- 13/14 American (93%)
- Genres: 8 crime, 3 sci-fi, 2 comedy, 1 animation (missing fantasy entirely)
- Distribution: 7 small, 4 medium, 3 large (unbalanced)

**Gap analysis identified:**
- Zero British TV (developers expect this)
- Zero anime (tech community overlap)
- Zero fantasy (nerd audience gap)
- Small bucket undersupplied

**Decision: Add 6 universes**
1. Monty Python (British, comedy, small)
2. Doctor Who (British, sci-fi, medium)
3. Attack on Titan (Japanese anime, ensemble, medium)
4. The Lord of the Rings (fantasy, large)
5. Succession (modern drama, medium)
6. Severance (sci-fi thriller, small)

**Result: 20 universes, 245 capacity**
- British: 2 new (+2 geographic origin)
- Japanese: 1 new (anime added)
- Fantasy: 1 new (gap filled)
- Sci-fi: 6 total (was 3; +100%)
- Size: 9 small, 6 medium, 5 large (better spread)

All 6 added universes have 8+ character names and recognized developer resonance.

## Related Decisions

- `.ai-team/decisions/inbox/keaton-universe-expansion.md` (2026-02-10 implementation)
- `.github/agents/squad.agent.md` § Universe Allowlist (policy table)
- `.ai-team/casting/policy.json` (machine-readable universe config)
