# Parallel Execution

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to launch concurrent work streams:**
```
Have three agents work on this in parallel: UI mockups, API spec, and database schema
```

**Try this to work multiple issues in priority order:**
```
Work on issues #12, #15, and #18 at the same time
```

**Try this to tighten the dispatch caps further:**
```
Run at most 2 agents at once to save costs
```

Squad dispatches the minimum sufficient set of agents for a task, and runs genuinely independent work in parallel. You control the caps and can force sequential execution when needed.

---

## How Dispatch Works

Squad routes fast and routes minimally: one primary owner by default, a second agent only for a genuinely independent concern or a required reviewer. Work that is provably independent runs at the same time — nothing is sequenced artificially, and nothing is spawned speculatively.

When the coordinator receives work:

1. **Scope & Dependency Analysis** — Identify the primary owner, then check whether any other concern is genuinely independent (different module, different owner, non-overlapping files) or has a data dependency (A needs output from B).
2. **Dispatch minimum sufficient** — Launch the primary owner now. Add a second agent only when the independence test passes. Independent agents use `mode: "background"`.
3. **Wait** — Coordinator polls agent status until in-flight work completes.
4. **Collect** — Aggregate results, check for errors, dispatch the next step only if the accepted scope requires it.

### Example: Feature Implementation

> "Implement user authentication: API endpoints, frontend form, tests, and documentation"

Coordinator dispatches **2 agents** — the two provably independent concerns:
- Backend → API endpoints (`src/api/`)
- Frontend → Login/signup form (`src/ui/`)

Both run at the same time. Tests and documentation are **not** pre-spawned — they are downstream work, dispatched once the implementation exists and shows they're actually needed.

## Background vs Sync Mode

Pick the mode from the actual dependency, not from a default. Ask: *is anyone waiting on this result right now?* If yes → `sync`. If no, and it is genuinely independent of everything else in flight → `background`.

| Mode | When to Use | Behavior |
|------|-------------|----------|
| `background` | Work that is genuinely independent of everything else in flight | Agent runs in parallel, coordinator polls for completion |
| `sync` | Data dependency (one agent needs output from another) | Agent runs sequentially, coordinator waits |
| `sync` | Reviewer gate (Lead must approve before continuing) | Agent runs, coordinator waits for review decision |

### Background Mode

Used for work **already known to be independent**:

```
Coordinator → [Agent1, Agent2] (background)
                ↓        ↓
              Result1  Result2
                ↓        ↓
            Coordinator collects all
```

Agents don't see each other's output until the coordinator collects and synthesizes.

### Sync Mode

Used for **dependencies and gates**:

```
Coordinator → Agent1 (sync) → Result1
                ↓
      Coordinator → Agent2 (sync, uses Result1) → Result2
                ↓
      Coordinator → Reviewer (sync, gates next step)
```

Each step blocks until the previous completes.

## Minimum Sufficient Dispatch

Squad's default is **minimum sufficient dispatch** — the fewest agents that can complete the work, dispatched immediately. Speed comes from routing fast, not from routing wide.

- **One primary agent by default.** The single owner whose domain is the actual concern. The roster is not surveyed for everyone who "could usefully start work."
- **A second agent only** for a genuinely independent concern or a reviewer the task requires. Two agents that would edit the same files are one agent.
- **No speculative agents.** Testers, docs writers, and scaffolders are dispatched when an upstream result shows they're needed.
- **No automatic follow-up chains.** When an agent completes, the coordinator reports. Follow-up work is launched only when the accepted scope requires it.
- **Genuine parallelism is preserved.** Name two distinct concerns with different owners and non-overlapping files, and they run at the same time.

If you want the whole roster on something, say so explicitly:

> "Team, everyone take a pass at the dashboard feature"

If cost is the concern, the other direction works too:

> "Work sequentially to save costs"

## Deadlock Avoidance

When agents have circular dependencies:

- **Agent A** needs output from **Agent B**
- **Agent B** needs output from **Agent A**

The coordinator detects the cycle during dependency analysis and prompts:

```
⚠️ Circular dependency detected: A ↔ B
Choose resolution:
1. Run A first, then B
2. Run B first, then A
3. Redesign to remove dependency
```

## Reviewer Gates

Some tasks require **sequential review**:

1. Agent writes code → Draft PR
2. Lead reviews → Approves, flags a nit, or rejects
3. If approved (CI green) → Merge and close
4. If a nit (< 5 changed lines, no logic/security/API change) → Author fixes it in the same PR, no lockout
5. If a substantive rejection → Reassign or escalate (agent is **locked out** of that artifact)

This is a **sync gate** — the next step cannot proceed until the reviewer completes.

## Dispatch Logs

The coordinator logs dispatch in `.squad/orchestration-log/`:

```
[2024-01-15 14:30:00] DISPATCH: 2 agents (Backend src/api/, Frontend src/ui/) — independent concerns
[2024-01-15 14:30:15] AGENT: Backend started (background)
[2024-01-15 14:30:16] AGENT: Frontend started (background)
[2024-01-15 14:35:42] COLLECT: Backend completed (success)
[2024-01-15 14:36:10] COLLECT: Frontend completed (success)
[2024-01-15 14:36:11] COLLECT: All in-flight agents complete
```

## Dispatch Limits

The coordinator respects dispatch caps to keep work focused and avoid rate limits or resource exhaustion:

- **Per request:** 2 domain agents. Exceeding it takes an explicit `"Team, ..."` request, or a task that provably spans 3+ modules with different primaries.
- **In flight:** 3 domain agents at once, and 1 in-flight task per agent. Over the cap, work queues and the coordinator says what's queued.
- **Exempt:** Scribe (background logging) and Ralph (monitor) never count against the caps.
- **Adjustable:** `"Run at most 2 agents at once"` → Coordinator batches work in groups of 2. `.squad/routing.md` and `.squad/team.md` can tighten these numbers per repo.

## Sample Prompts

```
Build the new dashboard feature — everyone work in parallel
```
An explicit "everyone" request lifts the per-request cap: the coordinator dispatches the relevant owners (Frontend, Backend, Tester, DevRel) and names the modules each is taking.

```
Implement the API first, then write tests — do it sequentially
```
Forces sync mode: Backend runs, completes, then Tester starts.

```
Work on issues #12, #15, and #18 at the same time
```
Works the issues in priority order within the in-flight cap. Independent issues run at the same time; the rest queue and the coordinator says what's queued.

```
Run at most 2 agents at once to save costs
```
Tightens the in-flight cap. Coordinator batches work: runs 2, waits for completion, runs the next 2.

```
Why is Tester waiting? Show me the dependency graph.
```
Coordinator explains why Tester is blocked (e.g., waiting for Backend to finish implementation).
