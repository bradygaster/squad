# Proposal: Error Recovery Skill

**Issue:** bradygaster/squad#623
**Author:** tamirdresher
**Date:** 2026-03-26
**Status:** Proposal

---

## Problem Statement

When a Squad agent fails (model timeout, tool error, invalid output, context overflow), there is
no standardized recovery pattern. Individual coordinators implement ad-hoc retry logic or simply
fail the task. This causes inconsistent user experience and missed opportunities for graceful
degradation across the squad.

---

## Proposed Approach

A skill library providing five recovery patterns an agent can apply when it encounters a failure:

| Pattern | When to use |
|---------|-------------|
| **retry** | Transient errors (rate limit, timeout) — wait and retry same approach |
| **fallback** | Primary approach consistently fails — switch to alternative method |
| **diagnose** | Unclear failure cause — gather diagnostics before deciding |
| **escalate** | Blocked beyond agent capability — surface to coordinator/human |
| **degrade** | Full functionality unavailable — deliver partial result with caveat |

The skill provides a selection guide table mapping error symptoms to the appropriate pattern,
plus prompt templates for each pattern that agents can use in their reasoning.

---

## Fit with Existing Architecture

- **Complements** existing gent-conduct skill (which covers behavior) — this skill covers failure states
- **No code changes** — template-only, agents apply this via their prompt reasoning
- **Coordinator-agnostic** — works with any existing coordinator style
- **Consistent with** the 3-cycle protocol from iterative-retrieval skill

---

## What Changes

- New skill: packages/squad-cli/templates/skills/error-recovery/SKILL.md
- New skill: packages/squad-sdk/templates/skills/error-recovery/SKILL.md
- New changeset: .changeset/error-recovery-skill.md

## What Stays the Same

- No existing skills modified
- No CLI or SDK runtime code changed

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agents over-apply retry (masking root causes) | Low | Medium | Skill explicitly limits retry to 3 attempts max |
| Conflicts with future built-in error handling | Low | Low | Template-only — superseded naturally if runtime handles it |

---

## References

- Issue: bradygaster/squad#623
