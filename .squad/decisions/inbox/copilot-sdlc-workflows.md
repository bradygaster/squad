# Decision: Should Squad ship pre-baked SDLC workflows?

**Date:** 2026-08-08
**Raised by:** bradygaster (via Copilot session)
**Status:** Open

## Context

Squad currently owns team formation and coordination (`workflows/squad.md` + `shared/squad.md`). Once a squad is cast, the actual SDLC — plan, implement, test, review — happens through the agents but there's no pre-built gh-aw workflow for those phases. Users go from "I have a squad" to "now what?" with a gap.

The question: should Squad ship optional SDLC workflows (plan, implement, review), or leave that space to other tools/integrations?

## Options

### A — Squad stays team-only (status quo)

- Squad owns casting, coordination, and routing
- SDLC workflows are the user's responsibility or come from third parties
- Other tools can `imports: - shared/squad.md` to compose Squad into their own pipelines
- **Pro:** Tight scope, easier to maintain, no opinions on how teams should work
- **Con:** Biggest friction point ("I cast a squad… now what?") remains unsolved

### B — Ship optional SDLC workflows under `workflows/shared/`

- Add composable shared components: `shared/plan.md`, `shared/implement.md`, `shared/review.md`
- Each imports `shared/squad.md` for team state
- Ship a top-level `workflows/sdlc.md` that composes all phases as a batteries-included option
- Users who only want casting still use `workflows/squad.md` alone
- **Pro:** Closes the adoption gap, composable (not mandatory), demonstrates the `shared/` pattern
- **Con:** More surface area to maintain, risk of being too opinionated

### C — Ship a single "do work" workflow, not a full SDLC

- One additional workflow (e.g., `workflows/work.md`) that takes an issue and delegates it to the squad
- Lighter than a full SDLC pipeline — just "give an issue to the squad and let them figure it out"
- **Pro:** Minimal scope increase, high value, lets the squad's routing/coordination handle the rest
- **Con:** Doesn't cover structured SDLC phases (planning, review gates)

## Recommendation

Option B with a phased rollout — start with a single `shared/implement.md` component (the highest-value gap), then add plan and review later based on usage. This keeps the composable `shared/` pattern intact while solving the immediate "now what?" problem.

## Decision

*(Pending — to be resolved by the team)*
