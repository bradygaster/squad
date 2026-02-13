# Proposal 001: Proposal-First Workflow

**Status:** Approved ✅ Shipped  
**Authored by:** Keaton + Verbal  
**Date:** 2026-02-07  
**Requested by:** bradygaster

---

## Summary

Everything meaningful gets written down and reviewed before execution. No drive-by features, no surprise refactors. If it changes the product, the team sees it first.

---

## Problem

Squad's advantage is compound decisions — each feature makes the next easier. But that only works if decisions are visible, reviewed, and remembered. Ad-hoc changes create drift. Proposals create alignment.

---

## What Requires a Proposal

**Write a proposal for:**

- **New features** — user-facing capabilities that didn't exist before
- **Architecture changes** — patterns that affect multiple agents or core orchestration
- **Major refactors** — restructuring that touches >3 files or changes public APIs
- **Agent design shifts** — new agent types, charter templates, orchestration patterns
- **Messaging overhauls** — changes to how Squad presents itself (README, templates, error messages)
- **Breaking changes** — anything that requires users to migrate or adapt

**Rule of thumb:** If you'd want to know about it before merge, it needs a proposal.

---

## What Doesn't Require a Proposal

**Just do it:**

- Bug fixes (obvious, localized, no behavior change)
- Minor polish (typos, formatting, comment clarity)
- Test additions (no production code change)
- Documentation updates (unless they reflect a policy shift)
- Dependency updates (security patches, minor bumps)

**Rule of thumb:** If it's obviously right and reversible, skip the proposal.

---

## Proposal Format

**Location:** `docs/proposals/{number}-{slug}.md`

Numbering is sequential: `001-`, `002-`, etc. Slug is kebab-case (e.g., `001-proposal-first-workflow.md`).

**Required sections:**

```markdown
# Proposal {number}: {Title}

**Status:** Proposed | Approved | Cancelled | Superseded  
**Authored by:** {Agent name(s) or human}  
**Date:** YYYY-MM-DD  
**Requested by:** {Human who asked for this}

---

## Summary
One paragraph. What is this?

---

## Problem
What motivated this? What breaks without it?

---

## Solution
How does it work? Be specific. Code samples if needed.

---

## Trade-offs
What do we give up? What gets harder?

---

## Alternatives Considered
What else did we think about? Why not those?

---

## Success Criteria
How do we know this worked?
```

**Optional sections:** Implementation Plan, Migration Path, Examples

---

## Review Process

### Who Reviews

- **Keaton** — architectural and product implications
- **Verbal** — agent experience and AI strategy
- **Domain specialist** — whoever owns the affected area (McManus for messaging, Fenster for runtime, Hockney for testing)
- **bradygaster** — always the final sign-off

### How Sign-Off Works

1. Author writes proposal, files PR (or commits directly to `main` with `Status: Proposed`)
2. Coordinator spawns reviewers based on domain
3. Reviewers comment directly in the proposal file or via PR comments
4. Author revises until reviewers approve
5. Brady gives final approval — changes status to `Approved`
6. Execution begins (agents reference the proposal during implementation)

**Review timeline:** Proposals should resolve within 48 hours of submission. If stuck, Brady decides.

---

## Evolution and Cancellation

### Refining a Proposal

- **Before approval:** Edit the proposal directly. Track major changes in a `## Revisions` section at the bottom.
- **After approval:** If execution reveals a flaw, file an amendment as a new proposal that references the original (e.g., `005-amend-parallel-spawning.md`).

### Cancelling a Proposal

Change status to `Cancelled`, add a `## Cancellation Reason` section explaining why. Keep the file — cancelled proposals are learning artifacts.

### Superseding a Proposal

If a new proposal makes an old one obsolete, change the old one's status to `Superseded by {number}`.

---

## Trade-offs

**What we gain:**
- Decisions are visible and reviewed before execution
- Team (human + agent) stays aligned on direction
- Historical record of why choices were made

**What we give up:**
- Speed on small changes (though "no proposal needed" covers most of these)
- Spontaneity — can't just ship a feature on instinct

**Why it's worth it:** Squad's mission is to beat the industry to what customers need next. That requires compound decisions. Proposals ensure each decision builds on the last.

---

## Alternatives Considered

**Option 1: Decision log only (no proposals)**  
Write decisions after the fact. Faster, but loses review step. Decisions become historical record, not alignment tool.

**Option 2: Proposals for everything**  
Even bug fixes need proposals. Too slow. Creates friction where none is needed.

**Option 3: Proposals only for humans**  
Agents skip the process. Breaks alignment — agents make architectural decisions, too. They need the same discipline.

**Why this approach:** Balances speed (skip proposals for obvious work) with alignment (require proposals for meaningful change).

---

## Success Criteria

- Every feature added to Squad in the next 6 weeks has a proposal
- No "surprise" architectural changes — reviewers see them before merge
- Cancelled proposals exist — proves the process filters bad ideas
- Agents reference proposals during implementation (visible in session logs)

---

## Revisions

None yet.
