# Work Routing

How to decide who handles generic work.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Product direction and architecture | Alpha | Roadmap decisions, design reviews |
| Runtime implementation | Beta | SDK and CLI changes |
| Research and integration | Gamma | Compatibility studies, release evidence |
| Session logging | Scribe | Automatic notes |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage and assign | Alpha |
| `squad:beta` | Pick up implementation | Beta |

## Rules

1. Route by the most specific work type.
2. Escalate ambiguous work to Alpha.
