# Proposal: Iterative Retrieval Skill

**Issue:** bradygaster/squad#622
**Author:** tamirdresher
**Date:** 2026-03-26
**Status:** Proposal

---

## Problem Statement

Agents that spawn sub-agents or issue retrieval operations have no standardized protocol for
how many cycles are acceptable before escalating. This leads to:
- Unbounded loops when agents keep spawning without convergence
- Missed escalations when 1 cycle is insufficient but the agent gives up
- Inconsistent behavior across coordinators

---

## Proposed Approach

A structured 3-cycle protocol for iterative information retrieval with mandatory checkpoints:

**Cycle 1:** Broad scan — identify the domain, key files, and initial findings
**Cycle 2:** Targeted retrieval — follow up on specific gaps identified in Cycle 1
**Cycle 3 (max):** Final fill — address remaining gaps only. If still incomplete, escalate

The skill provides:
- Spawn prompt templates for each cycle (what to include, what to stop)
- A coordinator validation checklist (did previous cycle produce actionable output?)
- Issue deduplication logic (don't spawn for issues already in progress)
- Good/bad example spawn prompts to calibrate agent behavior

---

## Fit with Existing Architecture

- **Complements** error-recovery skill (escalate pattern is the fallback at cycle 3)
- **No code changes** — template-only skill
- **Coordinator-agnostic** — works with any existing Ralph or custom coordinator
- **Consistent with** the 3-round Ralph pattern already used in production

---

## What Changes

- New skill: packages/squad-cli/templates/skills/iterative-retrieval/SKILL.md
- New skill: packages/squad-sdk/templates/skills/iterative-retrieval/SKILL.md
- New changeset: .changeset/iterative-retrieval-skill.md

## What Stays the Same

- No existing skills modified
- No CLI or SDK runtime code changed

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 3-cycle limit is too restrictive for complex tasks | Low | Medium | Skill explicitly allows coordinator to extend with justification |
| Conflicts with future built-in spawn limiting | Low | Low | Template-only — naturally superseded |

---

## References

- Issue: bradygaster/squad#622
