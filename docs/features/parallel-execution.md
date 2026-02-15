# Parallel Execution

> **Try this:**  
> `"Have three agents work on this in parallel: UI mockups, API spec, and database schema"`  
> `"Work on issues #12, #15, and #18 at the same time"`  
> `"Run at most 2 agents at once to save costs"`

Squad launches independent work in parallel by default — multiple agents work simultaneously, no waiting. You control concurrency limits and can force sequential execution when needed.

---

## How Parallel Execution Works

Squad runs agents in parallel whenever possible. The fan-out pattern launches all independent agents simultaneously, waits for results, then proceeds — no sequential bottlenecks unless data dependencies or reviewer gates require them.

## How Parallel Execution Works

When the coordinator receives work:

1. **Dependency Analysis** — Check if tasks have data dependencies (A needs output from B).
2. **Fan-Out** — Launch all independent agents in parallel using `mode: "background"`.
3. **Wait** — Coordinator polls agent status until all complete.
4. **Collect** — Aggregate results, check for errors, route to next step.

### Example: Feature Implementation

> "Implement user authentication: API endpoints, frontend form, tests, and documentation"

Coordinator spawns **4 agents in parallel**:
- Backend → API endpoints
- Frontend → Login/signup form
- Tester → Integration tests
- DevRel → Auth documentation

All work simultaneously. No agent waits for another unless there's a code dependency.

## Background vs Sync Mode

| Mode | When to Use | Behavior |
|------|-------------|----------|
| `background` | Independent work, no data dependencies | Agent runs in parallel, coordinator polls for completion |
| `sync` | Data dependency (one agent needs output from another) | Agent runs sequentially, coordinator waits |
| `sync` | Reviewer gate (Lead must approve before continuing) | Agent runs, coordinator waits for review decision |

### Background Mode

Used for **fan-out parallelism**:

```
Coordinator → [Agent1, Agent2, Agent3] (background)
                ↓        ↓        ↓
              Result1  Result2  Result3
                ↓        ↓        ↓
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

## Eager Execution Philosophy

Squad's default is **eager parallelism** — launch everything that can run, let the coordinator handle synchronization. Benefits:

- **Faster throughput** — No artificial sequencing.
- **Better resource utilization** — Multiple agents saturate available compute.
- **Resilient to blocking** — If one agent stalls, others keep working.

Trade-off: Increased API cost (multiple agents running simultaneously). If cost is a concern, tell the coordinator:

> "Work sequentially to save costs"

Coordinator switches to sync mode for all agents.

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
2. Lead reviews → Approves or rejects
3. If approved → Merge and close
4. If rejected → Reassign or escalate (agent is **locked out**)

This is a **sync gate** — the next step cannot proceed until the reviewer completes.

## Parallel Execution Logs

The coordinator logs parallel execution in `.ai-team/orchestration-log/`:

```
[2024-01-15 14:30:00] FAN-OUT: Spawning 4 agents (Backend, Frontend, Tester, DevRel)
[2024-01-15 14:30:15] AGENT: Backend started (background)
[2024-01-15 14:30:16] AGENT: Frontend started (background)
[2024-01-15 14:30:17] AGENT: Tester started (background)
[2024-01-15 14:30:18] AGENT: DevRel started (background)
[2024-01-15 14:35:42] COLLECT: Backend completed (success)
[2024-01-15 14:36:10] COLLECT: Frontend completed (success)
[2024-01-15 14:36:55] COLLECT: DevRel completed (success)
[2024-01-15 14:38:20] COLLECT: Tester completed (success)
[2024-01-15 14:38:21] FAN-IN: All agents complete
```

## Parallel Limits

The coordinator respects concurrency limits to avoid rate limits or resource exhaustion:

- **Default:** 5 agents in parallel
- **Adjustable:** `"Run at most 3 agents at once"` → Coordinator batches work in groups of 3

## Sample Prompts

```
Build the new dashboard feature — everyone work in parallel
```
Coordinator spawns all relevant agents (Frontend, Backend, Tester, DevRel) simultaneously.

```
Implement the API first, then write tests — do it sequentially
```
Forces sync mode: Backend runs, completes, then Tester starts.

```
Work on issues #12, #15, and #18 at the same time
```
Spawns 3 agents in parallel, one per issue. Assumes no dependencies between issues.

```
Run at most 2 agents at once to save costs
```
Sets concurrency limit. Coordinator batches work: runs 2, waits for completion, runs next 2.

```
Why is Tester waiting? Show me the dependency graph.
```
Coordinator explains why Tester is blocked (e.g., waiting for Backend to finish implementation).
