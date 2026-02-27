# Session Log: 2026-02-20 23:20 — Telemetry & Testing Directives

**Who:** Keaton (background)  
**Status:** COMPLETED

## What Happened

Keaton processed Brady's two major directives captured during Copilot session:

1. **Testing emphasis:** "Test the HECK out of everything along the way." Every milestone must include thorough testing (80% M0, 75% M1, 70% M2+) with mandatory integration tests per milestone. Testing is a first-class exit criterion, not an afterthought.

2. **Usage telemetry:** "Customers need to know how much AI their squad is using." Squadified repos must log token consumption, premium requests, session IDs, and cost estimates. Native SDK `assistant.usage` events feed into `.squad/telemetry/` JSONL logs. Phase 1 (M0-6) includes telemetry MVP; Phase 2 (M4-7) builds the dashboard CLI.

## Decisions Merged

- **Decision:** Usage Telemetry as Cross-Cutting Concern (Keaton)
  - Telemetry is Phase 1 foundational, not Phase 2 stretch
  - M0-6 expands to include JSONL logging from SDK events
  - M1+ integration tests validate telemetry accuracy (tokens, cost, metrics)
  - Testing thresholds per milestone are cross-cutting exit criteria

- **Directives:** Two user directives captured (Brady → Copilot)
  - Testing emphasis (all milestones)
  - Usage telemetry (Phase 1 MVP + Phase 2 dashboard)

## Issues Created

3 issues filed against **squad-pr** repository:
- #63: M0-6 telemetry expansion (token logging, cost tracking, integration tests)
- #64: Testing directive — minimum coverage thresholds (80%, 75%, 70% per milestone)
- #65: Phase 2 stretch — `squad usage` CLI dashboard (reads JSONL, displays cost breakdown)

## Inbox Status

✅ All inbox files processed and merged into `decisions.md`
✅ Inbox directory cleaned
