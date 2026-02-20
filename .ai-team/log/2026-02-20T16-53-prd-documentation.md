# 2026-02-20: SDK Replatform PRD Documentation Sprint

**Requested by:** Brady (via team approval of SDK replatforming)  
**Executed by:** 5-agent team sprint  
**Date:** 2026-02-20  
**Time:** 16:53 UTC  

## Agents & Deliverables

| Agent | Role | PRDs Written | Status |
|-------|------|--------------|--------|
| Keaton | Lead | 00-index, 05-coordinator, 14-clean-slate | Draft |
| Fenster | Core Dev | 01-runtime, 02-tools, 08-ralph | Draft |
| Verbal | Prompt Eng | 04-lifecycle, 07-skills, 11-casting, 13-a2a | Draft |
| Kujan | SDK Expert | 06-observability, 09-byok, 10-mcp, 12-distribution | Draft |
| Baer | Security | 03-hooks-policy | Draft |

## Deliverables Summary

- **14 PRDs** documented in `.ai-team/docs/prds/`
- **Master index** (00-index.md) with dependency graph, phase assignments, timeline
- **Phase breakdown:** Phase 1 (v0.6.0, 7–9w), Phase 2 (v0.7.x, 6–10w), Phase 3 (v0.8+)
- **Key themes:** SDK adapter isolation, TypeScript rewrite, hook-based governance, clean-slate architecture

## Key Decisions Captured

1. Adapter layer for SDK isolation (breaks Technical Preview coupling)
2. TypeScript/Node.js locked in (after 4-language analysis)
3. Green-field mindset for replatform (PRD 14 clean-slate)
4. Casting system hardening + A2A exploration (Brady directives)
5. Language decision: TypeScript final after brutally honest comparison

## Pending Brady Input

Multiple decisions deferred to Brady across all 5 PRDs. See individual orchestration logs for full list. Critical path: CLI entry point design, coordinator session model, backward compat strategy.

## Inbox Decisions Merged

- `keaton-prd-plan.md` → Team decisions
- `fenster-prd-runtime.md` → Team decisions
- `baer-prd-hooks.md` → Team decisions
- `verbal-prd-agents.md` → Team decisions
- `kujan-prd-platform.md` → Team decisions
- `fenster-comparesemver-prerelease.md` → Implementation decision (COMPLETED)
- `kobayashi-053-milestone.md` → Release tracking (COMPLETED)
- `kobayashi-insider-053-pushed.md` → Insider versioning (COMPLETED)
- `copilot-directive-replatform-design.md` → Brady directives
- `copilot-directive-language-locked.md` → Brady decision (FINAL)
- `copilot-directive-2026-02-20T07-39-23.md` → Brady directive

## Next Steps

1. Brady reviews 14 PRDs and provides input on pending decisions
2. Team synthesizes feedback into Phase 1 roadmap
3. Phase 1 work begins on PRD 1 (SDK orchestration runtime)
