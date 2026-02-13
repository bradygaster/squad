# Proposal 001a: Proposal Lifecycle Amendment

**Status:** Approved ✅ Shipped  
**Authored by:** Keaton (Lead)  
**Date:** 2026-02-09  
**Requested by:** bradygaster  
**Amends:** Proposal 001 (Proposal-First Workflow)
**Approved by:** bradygaster (2026-02-08)

---

## Problem

Proposal 001 defines four statuses: `Proposed | Approved | Cancelled | Superseded`. We have 16 proposals. All say `Proposed`. We can't tell what's being worked on, what shipped, or what's blocked. Brady asked if we have lifecycle tracking — we don't.

The gap: there's no state between "approved" and "done." A proposal can sit at `Approved` for weeks with no visibility into whether anyone's touched it.

---

## Amendment

Replace the status line in the Proposal Format (Proposal 001, line 62) with:

```markdown
**Status:** Proposed | Approved | In Progress | Completed | Cancelled | Superseded
```

### Status Definitions

| Status | Meaning | Who sets it |
|--------|---------|-------------|
| **Proposed** | Written, awaiting review | Author |
| **Approved** | Reviewed and accepted. Ready for implementation | Brady (final sign-off) |
| **In Progress** | Implementation has started. Work is active | Implementing agent or Keaton |
| **Completed** | Shipped. Success criteria met or explicitly closed | Keaton or Brady |
| **Cancelled** | Rejected or abandoned. Keep file as learning artifact | Reviewer or Brady |
| **Superseded** | Replaced by a newer proposal. Note which one: `Superseded by {number}` | Author of replacement |

### Rules

1. **Proposals move forward, not backward.** `Completed` → `Proposed` doesn't happen. If a completed proposal needs rework, file a new proposal.
2. **`In Progress` requires an owner.** Add `**Implementing:** {agent name(s)}` below the status line when moving to In Progress.
3. **`Completed` requires evidence.** At minimum, link to the commit, PR, or file change that shipped it. Add a `## Completion Notes` section at the bottom.
4. **Bulk status update.** After this amendment is approved, Keaton will audit all 16 proposals and set accurate statuses. Most are still `Proposed` — that's fine, it just means they haven't been approved yet.

### Optional Fields (add when moving to In Progress)

```markdown
**Implementing:** {Agent name(s)}
**Started:** YYYY-MM-DD
**Completed:** YYYY-MM-DD
```

---

## What This Doesn't Do

- No Jira. No sprint boards. No velocity tracking. Status lives in the proposal file itself.
- No automatic status transitions. Agents and humans update status as part of their work.
- No new approval gates. `In Progress` doesn't need approval — if it's `Approved`, anyone assigned can start.

---

## Trade-offs

**What we gain:** Visibility. Brady can `grep -l "In Progress" docs/proposals/` and see what's active. The team can see what shipped.

**What we give up:** ~2 minutes per proposal to update status. Worth it.

---

## Success Criteria

- Every proposal has an accurate status within 48 hours of this amendment's approval
- New proposals use the full lifecycle going forward
- Brady can answer "what's in progress?" without asking the team
