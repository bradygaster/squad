---
name: "reviewer-protocol"
description: "Reviewer rejection workflow, strict lockout semantics scoped to substantive rejections, 2-pass review cap with Flight arbitration, and no duplicate post-approval verification outside security/data-loss/release/migration classes"
domain: "orchestration"
confidence: "high"
source: "extracted"
---

## Context

When a team member has a **Reviewer** role (e.g., Tester, Code Reviewer, Lead), they may approve or reject work from other agents. On a **substantive** rejection, the coordinator enforces strict lockout rules to ensure the original author does NOT self-revise. This prevents defensive feedback loops and ensures independent review — without turning every one-line nit into a lockout, a second review pass, or a second independent verification.

## Patterns

### Reviewer Rejection Protocol

When a team member has a **Reviewer** role:

- Reviewers may **approve** or **reject** work from other agents.
- On a **substantive rejection** (see Scope below), the Reviewer may choose ONE of:
  1. **Reassign:** Require a *different* agent to do the revision (not the original author).
  2. **Escalate:** Require a *new* agent be spawned with specific expertise.
- The Coordinator MUST enforce this. If the Reviewer says "someone else should fix this," the original agent does NOT get to self-revise.
- On a **nit** (see Scope below), the original author fixes it in the same PR — no reject, no lockout, no revision cycle.
- If the Reviewer approves, work proceeds normally.

### Scope of Lockout — Substantive Rejections Only

Lockout applies **only** to a rejection for a substantive reason:

- A logic defect, regression, or missing coverage for a real bug.
- A security issue.
- An unintended change to API surface or observable behavior.

Lockout does **NOT** apply — the finding is a **nit**, not a rejection — when ALL of the
following hold:

- Non-blocking: no behavior, security, or API change results from the finding itself.
- Fewer than **5 changed lines** to fix it.
- No logic, security, or API/behavior change involved (e.g., typo, comment, wording, dead
  import, formatting).

**Objective test:** if the finding needs its own explanation of a behavior change, it's
substantive. If it's a one-line diff a linter could plausibly have flagged, it's a nit.

**Nits close in the same PR.** The original author fixes them before merge — never filed as
a follow-up issue, never treated as a rejection, never triggering lockout or another review
pass. (Evidence this needs saying: PR #1837/#1812 was "approved with nits" but one real nit
was deferred to a follow-up commit by a different agent instead of fixed in the reviewed PR.)

### Strict Lockout Semantics

When an artifact is **rejected for a substantive reason** (see Scope above):

1. **The original author is locked out.** They may NOT produce the next version of that artifact. No exceptions.
2. **A different agent MUST own the revision.** The Coordinator selects the revision author based on the Reviewer's recommendation (reassign or escalate).
3. **The Coordinator enforces this mechanically.** Before spawning a revision agent, the Coordinator MUST verify that the selected agent is NOT the original author. If the Reviewer names the original author as the fix agent, the Coordinator MUST refuse and ask the Reviewer to name a different agent.
4. **The locked-out author may NOT contribute to the revision** in any form — not as a co-author, advisor, or pair. The revision must be independently produced.
5. **Lockout scope:** The lockout applies to the specific artifact that was rejected. The original author may still work on other unrelated artifacts.
6. **Lockout duration:** The lockout persists for that revision cycle. If the revision (Pass 2) is **also** rejected for a substantive reason, do NOT spawn a third agent to revise again — route to **Flight arbitration** (see Review Pass Cap below). The revision author remains locked out pending Flight's ruling.
7. **Deadlock handling:** If Flight's arbitration ruling itself cannot be executed because every eligible agent is already locked out, the Coordinator MUST escalate to the user rather than re-admitting a locked-out author.

### Review Pass Cap and Arbitration

Ordinary review is capped at **2 passes** per artifact:

1. **Pass 1** — initial review.
2. **Pass 2** — review of the revision produced under lockout.

If Pass 2 disagreement persists (rejects again), the Coordinator does **NOT** spawn a third
full review pass or a third revision cycle. Instead:

- Route the disagreement to **one Flight arbitration** — a single ruling, not a re-review.
- Flight reads both passes' findings and the artifact, then rules: merge, revise (naming the
  revision owner, still excluding all locked-out agents), or reject. Flight's ruling is
  final and recorded in the PR or decision log.
- Arbitration ends the review; it does not restart the pass count or spawn a Pass 3.

(Evidence: FIDO history, 2026-08-22, PR #1832 — three full review passes ran on one PR before
merge. Pass 3 there would now be a single Flight arbitration instead.)

### No Duplicate Independent Verification After Approval

Once a Reviewer **approves** an artifact and CI is **green**, no second agent independently
re-verifies it from scratch. Approval + green CI is sufficient to merge.

**Exceptions — independent duplicate verification is still required:**

- **Security-sensitive surfaces** — anything RETRO owns or co-owns per `routing.md`
  (e.g. `packages/squad-sdk/src/hooks/`, `packages/squad-sdk/src/memory/`), or anything
  matching a trigger in `.copilot/skills/security-review/SKILL.md`.
- **Data-loss-risk changes** — deletions, force operations, destructive migrations.
- **Release/publish pipeline changes** — anything gated by `.squad/skills/release-process/SKILL.md`.
- **Irreversible migrations** — one-way schema or data transforms that can't be undone by
  re-running the change.

Outside these four classes, do not add a second reviewer "just to be safe" — that is
duplicate verification, not risk-based review.

### Default Reviewer Count

Default is **one reviewer** per PR — the module's advisory secondary per `routing.md`, or
Flight if the module has none listed. Add **RETRO** as an additional reviewer only when the
PR touches an actual security-sensitive surface (see exceptions above). Do not co-assign
RETRO to review changes outside that surface.

## Examples

**Example 1: Reassign after rejection**
1. Fenster writes authentication module
2. Hockney (Tester) reviews → rejects: "Error handling is missing. Verbal should fix this."
3. Coordinator: Fenster is now locked out of this artifact
4. Coordinator spawns Verbal to revise the authentication module
5. Verbal produces v2
6. Hockney reviews v2 → approves
7. Lockout clears for next artifact

**Example 2: Escalate for expertise**
1. Edie writes TypeScript config
2. Keaton (Lead) reviews → rejects: "Need someone with deeper TS knowledge. Escalate."
3. Coordinator: Edie is now locked out
4. Coordinator spawns new agent (or existing TS expert) to revise
5. New agent produces v2
6. Keaton reviews v2

**Example 3: Third-round disagreement → Flight arbitration, not deadlock**
1. Fenster writes module → Hockney rejects (Pass 1, substantive)
2. Verbal revises → Hockney rejects again (Pass 2, substantive)
3. Coordinator does NOT spawn a third revision cycle — routes to Flight arbitration
4. Flight reviews both passes, rules "merge with Verbal's revision; the remaining nit is
   non-blocking" — ruling recorded, review ends

**Example 3b: Genuine deadlock (rare)**
1. Fenster writes module → rejected; Verbal revises → rejected (Pass 2)
2. Flight arbitrates: "needs another revision, but by someone who hasn't touched this yet"
3. No third eligible agent exists (small team, both already locked out)
4. Coordinator: "All eligible agents have been locked out. Escalating to user: [artifact details]"

**Example 4: Reviewer accidentally names original author**
1. Fenster writes module → rejected
2. Hockney says: "Fenster should fix the error handling"
3. Coordinator: "Fenster is locked out as the original author. Please name a different agent."
4. Hockney: "Verbal, then"
5. Coordinator spawns Verbal

**Example 5: Nit — no lockout, fixed in the same PR**
1. Fenster's PR renames a local variable for clarity in one extra line while fixing the
   requested change (4 lines total, no logic/security/API change)
2. Hockney: "Approve with nit — the variable rename is fine, no objection"
3. Coordinator: this is a nit (< 5 lines, no behavior change) — no rejection, no lockout
4. Fenster fixes any remaining nit text directly in the same PR before merge; Hockney
   approves; PR merges — no second review pass, no follow-up issue

## Related Review Skills

For domain-specific review checklists, see:
- **Architectural Review:** `.copilot/skills/architectural-review/SKILL.md` — module boundaries, dependency direction, export surface, sweeping refactor safety
- **Security Review:** `.copilot/skills/security-review/SKILL.md` — credentials, injection, workflow permissions, supply chain

## What Stays Unchanged

This recovery narrows *lockout scope* and *review-pass* overhead. It does NOT touch:

- **Mutation testing** — still required wherever it already applies; unaffected by pass caps.
- **Adversarial repro** — still required for the four exception classes in "No Duplicate
  Independent Verification," and whenever a reviewer chooses it as their method on Pass 1 or 2.
- **CI gates** — unchanged; approval still requires green CI, always.
- **Risk-based deep review** — a reviewer may go as deep as the change warrants within their
  2 passes; the cap bounds *unresolved disagreement*, not diligence on a single pass.

## Anti-Patterns

- ❌ Allowing the original author to self-revise after a substantive rejection
- ❌ Treating the locked-out author as an "advisor" or "co-author" on the revision
- ❌ Re-admitting a locked-out author when deadlock occurs (must escalate to user)
- ❌ Applying lockout across unrelated artifacts (scope is per-artifact)
- ❌ Accepting the Reviewer's assignment when they name the original author (must refuse and ask for a different agent)
- ❌ Clearing lockout before the revision is approved (lockout persists through revision cycle)
- ❌ Skipping verification that the revision agent is not the original author
- ❌ Treating a nit (< 5 changed lines, no logic/security/API change) as a rejection that triggers lockout
- ❌ Deferring a nit to a follow-up issue instead of fixing it in the same PR before merge
- ❌ Running a third full review pass instead of routing Pass-2 disagreement to Flight arbitration
- ❌ Spawning a second independent reviewer after approval + green CI outside the security/data-loss/release/migration exceptions
- ❌ Adding RETRO to a review that doesn't touch a security-sensitive surface
- ❌ Skipping mutation testing, adversarial repro, or CI gates on the theory that the pass cap also caps diligence
