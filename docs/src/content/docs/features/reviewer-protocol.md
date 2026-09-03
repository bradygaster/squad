# Reviewer Rejection Protocol

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to request a code review:**
```
Review the changes in src/auth/ and check for security issues
```

**Try this to trigger peer review:**
```
Lead, review the PR from Fenster
```

When a reviewer (Lead, Tester) rejects work for a **substantive** reason, the original agent is locked out from self-revision. This prevents endless fix-retry loops and forces reassignment or human oversight. Small non-blocking nits don't trigger any of that — the author just fixes them in the same PR.

---

## How It Works

1. **Agent submits work** — Creates draft PR, requests review from Lead or Tester.
2. **Reviewer evaluates** — Checks code quality, test coverage, adherence to directives.
3. **Reviewer decision:**
   - **Approve** → PR merges (with green CI), issue closes, agent unlocked.
   - **Approve with nits** → Author fixes them in the same PR. No lockout, no extra review pass.
   - **Request changes (substantive)** → Agent is **locked out**, work routes to another agent or escalates.

## Nit vs. Substantive

Not every finding is a rejection. A finding is a **nit** when all of these hold:

- Non-blocking — no behavior, security, or API change results from the finding itself
- Fewer than **5 changed lines** to fix
- No logic, security, or API/behavior change (typo, comment, wording, dead import, formatting)

Nits are fixed by the original author **in the same PR**, before merge — never deferred to a follow-up issue, never treated as a rejection.

A finding is **substantive** when it's a logic defect, a regression, missing coverage for a real bug, a security issue, or an unintended change to API surface or observable behavior. Rule of thumb: if the finding needs its own explanation of a behavior change, it's substantive.

## Strict Lockout (Substantive Rejections Only)

Once a reviewer rejects work for a substantive reason, the **original agent cannot revise their own submission**. This is a hard constraint:

- Agent A writes code → Lead rejects (substantive)
- Agent A **cannot** fix and resubmit
- Coordinator must **reassign** to Agent B or **escalate** to user

The locked-out author may not contribute as co-author, advisor, or pair either — the revision has to be independently produced.

### Why Lockout?

Without lockout:
- Agent A writes buggy code
- Lead rejects: "This has race conditions"
- Agent A fixes, resubmits
- Lead rejects again: "Still broken"
- Agent A fixes, resubmits
- Infinite loop, no progress

With lockout:
- Agent A writes buggy code
- Lead rejects: "This has race conditions"
- Agent A **locked out**
- Coordinator assigns Agent B (fresh perspective) or escalates to user
- Work gets done or human intervenes

## Two-Pass Cap and Flight Arbitration

Ordinary review is capped at **two passes** per artifact:

1. **Pass 1** — initial review
2. **Pass 2** — review of the revision produced under lockout

If Pass 2 is rejected again for a substantive reason, the coordinator does **not** spawn a third agent, a third revision cycle, or a third review pass. It routes the disagreement to **one Lead arbitration**: the Lead reads both passes and the artifact, then rules merge / revise (naming an owner who isn't locked out) / reject. The ruling is final, gets recorded, and ends the review.

**Deadlock is only reachable after arbitration** — if the ruling can't be executed because every eligible agent is locked out, the coordinator escalates to you rather than re-admitting a locked-out author.

## No Duplicate Verification After Approval

Once a reviewer approves and CI is green, a second agent doesn't re-verify from scratch. Exceptions that still get independent duplicate verification: security-sensitive surfaces, data-loss-risk changes (deletions, force operations, destructive migrations), release/publish pipeline changes, and irreversible migrations.

## Reassign vs. Escalate

When a substantive rejection happens, the coordinator has two options:

| Option | When to Use | How It Works |
|--------|-------------|--------------|
| **Reassign** | Another agent has the skill | Route work to different squad member with relevant expertise |
| **Escalate** | No other agent fits | Notify user, ask for manual intervention or guidance |

### Reassign Example

1. Fenster (Frontend) writes a React component → Lead rejects: "Accessibility issues" (substantive)
2. Fenster locked out
3. Coordinator checks skills: Hockney (Frontend) has accessibility expertise
4. Work reassigned to Hockney
5. Hockney fixes and resubmits — this is Pass 2

### Arbitration Example

1. Backend writes API logic → Tester rejects: "Integration tests fail" (Pass 1, substantive)
2. Backend locked out; Coordinator reassigns to Core Dev
3. Core Dev revises → Tester rejects again (Pass 2, substantive)
4. Coordinator does **not** spawn a third agent — it routes to **one Lead arbitration**
5. Lead reads both passes and rules: merge, revise (naming a non-locked-out owner), or reject. Ruling recorded, review ends.
6. If the ruling can't be executed because everyone eligible is locked out → escalate to user: "Issue #42: all eligible agents locked out after arbitration. Need guidance or manual fix."

## Lockout Scope and Duration

| Scope | Duration |
|-------|----------|
| **Task-specific** | Lockout applies to the specific PR/issue, not all work |
| **Session-persistent** | Lockout survives session restarts (stored in `.squad/orchestration-log/`) |
| **Clearable** | User can manually unlock: "Unlock Fenster for issue #42" |

An agent locked out of issue #42 can still work on issue #43, #44, etc. Lockout is not a global ban.

## Deadlock Handling

If **all capable agents are locked out** — which is only reachable *after* Lead arbitration has ruled:

1. Coordinator detects deadlock: the arbitration ruling can't be executed because no eligible agent remains.
2. Coordinator escalates to user: "All agents locked out for issue #42. Options: 1) Manual fix, 2) Unlock an agent and provide guidance, 3) Close as won't-fix."
3. User chooses resolution.

The coordinator never re-admits a locked-out author on its own to break a deadlock. This prevents the team from getting stuck in a state where no one can proceed.

## Reviewer Authority

Only **designated reviewers** can lock out agents:

| Reviewer | Authority | Scope |
|----------|-----------|-------|
| **Lead** | Code quality, architecture, security | All code submissions |
| **Tester** | Test coverage, correctness | Test-related changes |
| **User (you)** | Final arbiter | Can override any decision |

Other agents (Frontend, Backend, DevRel) cannot lock out peers.

## Unlocking an Agent

> "Unlock Fenster for issue #42"

Coordinator clears the lockout. Fenster can now revise the PR. Use this when:

- Reviewer feedback was unclear, you've provided better guidance
- Agent legitimately misunderstood requirements
- External factors (API change, dependency update) invalidated the original rejection

## Lockout Logs

Lockouts are recorded in `.squad/orchestration-log/`:

```
[2024-01-15 15:45:30] REVIEW: Lead rejected PR #12 (author: Fenster)
[2024-01-15 15:45:31] LOCKOUT: Fenster locked out for issue #42
[2024-01-15 15:45:35] REASSIGN: Issue #42 → Hockney (accessibility expertise)
[2024-01-15 16:20:10] REVIEW: Lead approved PR #13 (author: Hockney)
[2024-01-15 16:20:11] UNLOCK: Fenster unlocked (issue #42 resolved)
```

## Trust Levels for PR Management

This section covers the spectrum of human oversight for Squad-created PRs:

### 1. Full Review (Default)

Every PR requires human approval before merge. This is the default and recommended for team repos, shared codebases, and anything with external collaborators.

**When to use:** Team repositories, public packages, shared codebases where multiple people depend on stability.

**Risk:** Low — human gate on every change.

### 2. Selective Review

Squad creates and reviews PRs, but the human only reviews PRs that touch specific paths or domains they care about. Everything else merges after agent review.

**When to use:** Personal projects with established patterns where you trust Squad's judgment on routine changes (dependency updates, test fixes, doc improvements).

**Risk:** Medium — some changes skip human eyes.

### 3. Self-Managing (Personal Repos Only)

Squad creates, reviews, approves, and merges its own PRs. The human only jumps in when an issue is explicitly flagged for review.

**When to use:** Solo personal projects where you're the sole maintainer and experimentation speed matters more than pre-merge safety.

**Risk:** Higher — but fast; review PRs retroactively.

### Decision Matrix

| Trust Level | When | Risk |
|-------------|------|------|
| Full review | Team repos, shared codebases, public packages | Low — human gate on every change |
| Selective review | Personal projects with established patterns | Medium — some changes skip human eyes |
| Self-managing | Solo personal projects, experimentation | Higher — but fast; review PRs retroactively |

**Important:** Self-managing mode doesn't mean unmonitored. Use Ralph's work monitoring, Teams notifications, and periodic code review to stay informed. The difference is that you review *after* merge rather than *before*.

---

## Sample Prompts

```
Lead, review PR #15
```
Triggers review. Lead evaluates code and either approves (merge + unlock), approves with nits (author fixes them in the same PR), or rejects substantively (lockout original author).

```
Why is Fenster locked out?
```
Coordinator explains: "Fenster was locked out for issue #42 after Lead rejected PR #15 due to security concerns."

```
Unlock Fenster for issue #42 — I've given him better guidance
```
Clears lockout. Fenster can now revise the PR with your additional context.

```
Reassign issue #42 from Fenster to Hockney
```
Manual reassignment. Fenster remains locked out, Hockney takes over the work.

```
Escalate issue #42 to me — the team is stuck
```
Coordinator notifies you when arbitration can't be executed or the team is deadlocked. You provide manual intervention or guidance.
