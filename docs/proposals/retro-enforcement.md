# Proposal: Retro Enforcement Skill

**Issue:** bradygaster/squad#601
**Author:** tamirdresher
**Date:** 2026-03-26
**Status:** Proposal

---

## Problem Statement

Retrospectives have a 0% action item completion rate when tracked as markdown checklists.
Measured across 6 consecutive retrospectives in production (tamirdresher/tamresearch1):
- Markdown checkboxes: 0/24 action items completed
- GitHub Issues: 85%+ completion rate for equivalent work

The problem is structural, not behavioral. Markdown checklists have no assignee, no notifications,
no close events, and no query surface. They rely entirely on human memory to re-check. GitHub Issues
have all of these built in.

This skill addresses the root cause: standardizing the retro ceremony to use GitHub Issues for
action items and providing coordinator integration to enforce the retro cadence itself.

---

## Proposed Approach

### 1. Test-RetroOverdue — Retro Cadence Enforcement

A PowerShell function that checks whether a retrospective has occurred within the current window
(default: 7 days). The coordinator calls this at the start of every round and blocks other work
if the retro is overdue.

`powershell
if (Test-RetroOverdue -LogDir ".squad/log" -WindowDays 7) {
    # Spawn retro facilitator, wait for log, then resume
}
`

Detection: checks .squad/log/ for *retrospective* files dated within the window.

### 2. Action Item Enforcement

Every retro action item MUST be a GitHub Issue. The skill provides:
- Verification logic to detect markdown checkboxes (anti-pattern)
- Verification logic to confirm Issue references exist in retro logs
- Example Issue format with required fields (title, body, assignee, labels)

### 3. Ceremonies Template Update

Updates .squad-templates/ceremonies.md with an enforcement-aware Retrospective definition
that documents the enforcement behavior, cadence, and required output format.

---

## Fit with Existing Architecture

- **Complements** the existing ceremonies template (additive, not replacing)
- **Integrates** with existing .squad/log/ pattern used by Scribe and coordinators
- **No new dependencies** — uses PowerShell, GitHub Issues, and existing file conventions
- **Coordinator integration** is optional and additive — existing coordinators continue to work

---

## What Changes

- New skill: packages/squad-cli/templates/skills/retro-enforcement/SKILL.md
- New skill: packages/squad-sdk/templates/skills/retro-enforcement/SKILL.md
- Updated: .squad-templates/ceremonies.md (Retrospective section enhanced)
- New changeset: .changeset/retro-enforcement.md

## What Stays the Same

- Existing ceremonies template sections (Design Review, etc.) unchanged
- Existing .squad/log/ format unchanged
- No changes to CLI or SDK runtime code — template/skills only

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Coordinator blocks on retro check when no .squad/log/ dir exists | Medium | Low | Test-RetroOverdue handles SilentlyContinue for missing dirs |
| Teams don't want weekly enforcement | Low | Low | Cadence is configurable (-WindowDays param) |

---

## References

- Issue: bradygaster/squad#601
- Production data: tamirdresher/tamresearch1 (0% vs 85%+ completion, 6 retrospectives)
