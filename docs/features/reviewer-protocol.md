# Reviewer Rejection Protocol

When a reviewer (Lead, Tester) rejects an agent's work, the agent is **locked out** from self-revising. This prevents endless fix-retry loops and forces human oversight or escalation. The protocol ensures rejected work doesn't slip through without proper review.

## How It Works

1. **Agent submits work** — Creates draft PR, requests review from Lead or Tester.
2. **Reviewer evaluates** — Checks code quality, test coverage, adherence to directives.
3. **Reviewer decision:**
   - **Approve** → PR merges, issue closes, agent unlocked.
   - **Request changes** → Agent is **locked out**, work routes to another agent or escalates.

## Strict Lockout

Once a reviewer rejects work, the **original agent cannot revise their own submission**. This is a hard constraint:

- Agent A writes code → Lead rejects
- Agent A **cannot** fix and resubmit
- Coordinator must **reassign** to Agent B or **escalate** to user

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

## Reassign vs. Escalate

When rejection happens, coordinator has two options:

| Option | When to Use | How It Works |
|--------|-------------|--------------|
| **Reassign** | Another agent has the skill | Route work to different squad member with relevant expertise |
| **Escalate** | No other agent fits, or multiple rejections | Notify user, ask for manual intervention or guidance |

### Reassign Example

1. Fenster (Frontend) writes a React component → Lead rejects: "Accessibility issues"
2. Fenster locked out
3. Coordinator checks skills: Hockney (Frontend) has accessibility expertise
4. Work reassigned to Hockney
5. Hockney fixes and resubmits

### Escalate Example

1. Backend writes API logic → Tester rejects: "Integration tests fail"
2. Backend locked out
3. Coordinator reassigns to Core Dev → Core Dev also fails review
4. Core Dev locked out
5. **All agents exhausted** → Coordinator escalates to user: "Issue #42 rejected twice. Need guidance or manual fix."

## Lockout Scope and Duration

| Scope | Duration |
|-------|----------|
| **Task-specific** | Lockout applies to the specific PR/issue, not all work |
| **Session-persistent** | Lockout survives session restarts (stored in `.ai-team/orchestration-log/`) |
| **Clearable** | User can manually unlock: "Unlock Fenster for issue #42" |

An agent locked out of issue #42 can still work on issue #43, #44, etc. Lockout is not a global ban.

## Deadlock Handling

If **all capable agents are locked out**:

1. Coordinator detects deadlock: no available agents for work.
2. Coordinator escalates to user: "All agents locked out for issue #42. Options: 1) Manual fix, 2) Unlock an agent and provide guidance, 3) Close as won't-fix."
3. User chooses resolution.

This prevents the team from getting stuck in a state where no one can proceed.

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

Lockouts are recorded in `.ai-team/orchestration-log/`:

```
[2024-01-15 15:45:30] REVIEW: Lead rejected PR #12 (author: Fenster)
[2024-01-15 15:45:31] LOCKOUT: Fenster locked out for issue #42
[2024-01-15 15:45:35] REASSIGN: Issue #42 → Hockney (accessibility expertise)
[2024-01-15 16:20:10] REVIEW: Lead approved PR #13 (author: Hockney)
[2024-01-15 16:20:11] UNLOCK: Fenster unlocked (issue #42 resolved)
```

## Sample Prompts

```
Lead, review PR #15
```
Triggers review. Lead evaluates code and either approves (merge + unlock) or rejects (lockout original author).

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
Coordinator notifies you of deadlock or repeated rejections. You provide manual intervention or guidance.
