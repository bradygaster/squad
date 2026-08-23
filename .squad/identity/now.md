---
updated_at: 2026-08-10T22:18:00Z
focus_area: gh-aw workflow reliability — Plan Activate issue creation
branch: dev
---

# What We're Focused On

**Priority:** Fix #1678 — Plan Activate creates epics but stops before task issues (token exhaustion).

## Next Session Goal

Make `/squad plan activate` reliably create ALL issues (epics + tasks), not just epics. Test repo: `bradygaster/aspire-squad-e2e-3` issue #1.

## Next Session Work

1. **Slim task issue bodies** — Strip Rollout, Traces to, verbose Context blocks. Keep: title, 2-line scope, acceptance criteria, parent ref, size, depends-on. ~60% token savings.

2. **Hard gate after Step 2b** — Add explicit instruction: *"You have created epics. Tasks MUST follow. Do NOT post the summary comment or stop until all tasks are created."*

3. **Reorder: summary comment last** — Move `add-comment` completion step after all `create-issue` calls. Create everything first, summarize last.

4. **Self-validation (Step 2d)** — Count epics/tasks created vs expected:
   - Match → `✅ Activation complete — 6/6 epics, 20/20 tasks created.`
   - Mismatch → `⚠️ Partial activation — 6/6 epics, 0/20 tasks. Reply /squad plan activate to resume.`
   - Activate is idempotent (title-match dedup), so re-running creates only missing issues.

5. **Test** — Delete existing epics (#6–#11) on `aspire-squad-e2e-3`, re-run `/squad plan activate`, verify all 26 issues land.

## What Was Done This Session (2026-08-10)

### Pushed to dev (3 commits)
- `ed94258` — fix: `issues: write` → `issues: read` for gh-aw strict mode (#1676)
- `3a584f1` — feat: completion comments with PR links for Cast/Connect/Adopt/Cast Member/Retire
- `8501410` — docs: demo restructured to two-issue flow (cast + work intent)

### Issues closed (7)
- #1676 — issues:write strict compilation (fixed)
- #1632, #1631, #1633, #1661 — already fixed on dev (confirmed + closed)
- #1659 — gh-aw-dev tracking issue (branch merged)

### Issues filed (2)
- #1677 — feat: blanket @copilot delegation mode for implementation tasks
- #1678 — bug: plan activate creates epics but stops before tasks (with design comment)

### Directives captured
- Workflow output comments should always link to artifacts (PRs, issues)
- Demo script uses two-issue flow: casting issue (closes) + work intent issue (stays open)

## Open Feature Issues (backlog)
- #1677 — @copilot blanket delegation + sequencing
- #1604–#1609 — gh-aw enhancements (init presets, health check, state persistence, MCP bridge, squad.agent.md generation)
