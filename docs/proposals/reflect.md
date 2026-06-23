# Proposal: Reflect Skill

**Issue:** bradygaster/squad#621
**Author:** tamirdresher
**Date:** 2026-03-26
**Status:** Proposal

---

## Problem Statement

Agents repeat mistakes that were already identified in the same session. When an approach fails
or a user provides corrective feedback, agents lack a standardized mechanism to:
1. Capture the learning before continuing
2. Check captured learnings before attempting similar actions
3. Prevent recurrence without human intervention

This is different from the history-hygiene skill (which covers cross-session history writing).
Reflect targets in-session learning capture during active work.

---

## Proposed Approach

A structured reflection protocol triggered by failure or feedback events:

**Trigger classification:**
- HIGH: Agent makes same error twice, user explicitly says "that's wrong again"
- MED: Tool error after a previous warning, misunderstood requirement after clarification
- LOW: Minor adjustment requested, first-time error with clear cause

**Reflect protocol (HIGH/MED triggers):**
1. Write a ## Reflection entry to current session context
2. State: what failed, why, what changes for next attempt
3. Check reflection notes before any action of the same category
4. If same failure occurs after reflection: escalate (do not retry silently)

**Confidence threshold table:** Maps trigger severity to required escalation path

---

## Fit with Existing Architecture

- **Complements** history-hygiene skill (history.md captures final outcomes; reflect captures
  in-flight corrections before the outcome is known)
- **Complements** error-recovery skill (recover handles the failure response; reflect captures
  the learning to prevent recurrence)
- **Integrates** with .squad/decisions.md for persistent pattern learnings
- **No code changes** — template-only

---

## What Changes

- New skill: packages/squad-cli/templates/skills/reflect/SKILL.md
- New skill: packages/squad-sdk/templates/skills/reflect/SKILL.md
- New changeset: .changeset/reflect-skill.md

## What Stays the Same

- history-hygiene skill behavior unchanged
- error-recovery skill behavior unchanged
- No CLI or SDK runtime code changed

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Reflect overhead slows agents | Low | Low | Only triggered by HIGH/MED events, not routine actions |
| Overlaps with history-hygiene | Low | Low | Different scope (in-session corrections vs final outcomes) |

---

## References

- Issue: bradygaster/squad#621
