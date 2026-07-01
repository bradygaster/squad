---
title: Fleet Dispatch — Parallel Issue Triage
description: Hybrid dispatch mode for squad watch that batches read-heavy issues into a single Copilot /fleet session for 2.9x faster parallel analysis.
---
# Fleet Dispatch — Parallel Issue Triage
**Try this for parallel read-heavy issue triage:**
```bash
squad watch --execute --dispatch-mode fleet
```
**Try this for mixed read + write workloads:**
```bash
squad watch --execute --dispatch-mode hybrid
```
Fleet Dispatch enables `squad watch --execute` to batch **read-heavy issues** (research, review, audit, triage) into a single Copilot CLI `/fleet` session that analyzes them in parallel tracks. The published measurement: **2.9× faster** than sequential dispatch for read-heavy workloads.
It's a `WatchCapability` that runs in the `post-execute` phase of the watch loop, so it composes with the existing per-issue dispatch logic rather than replacing it.
---
## Three dispatch modes
| Mode | What gets parallelized | Best for |
|------|------------------------|----------|
| **`sequential`** (default) | One issue at a time, full agent spawn each | Mixed workloads, debugging |
| **`fleet`** | All issues batched into one `/fleet` Copilot session, parallel analysis tracks | Pure triage/review rounds where all issues are read-only |
| **`hybrid`** | Read-heavy issues go to fleet; write-heavy issues go sequential | Realistic backlogs with both kinds |
`hybrid` is the recommended mode for most teams — it gets the speedup on the analysis-heavy issues without trying to fleet-dispatch issues that need to write code or modify state.
---
## What counts as "read-heavy"
The fleet-dispatch capability classifies issues using the same `classifyIssue` logic used elsewhere in `squad watch`. Read-heavy classification is based on labels and title keywords:
- **Labels:** `triage`, `review`, `audit`, `analyze`, `research`, `investigate`, `discuss`, `question`
- **Title keywords:** *"review"*, *"audit"*, *"analyze"*, *"investigate"*, *"why does"*, *"how does"*
Anything that touches code, files, or external systems is **write-heavy** and stays in sequential dispatch — even in `hybrid` mode.
---
## How a fleet round works
When `squad watch` decides to dispatch (work items present, no rate-limit hold), and `dispatchMode` is `fleet` or `hybrid`:
1. Watch's executor calls `findExecutableIssues` to get the work batch
2. FleetDispatch capability runs in `post-execute` phase
3. Read-heavy issues are filtered out of the sequential queue
4. A multi-track `/fleet` prompt is built — one track per issue
5. Each track names the appropriate agent (from the roster + labels) and instructs it to:
   - Read the issue body
   - Analyze, assess urgency (P0/P1/P2)
   - Recommend next step
   - Write findings as an issue comment
   - **NOT** create branches or modify files
6. The prompt is sent as a single `copilot --fleet` invocation
7. Copilot runs all tracks in parallel, posts comments per issue, exits
8. Watch logs the fleet dispatch result and continues to its next round
A typical fleet prompt looks like:
```
/fleet Execute these 6 read-only analysis tracks in parallel:
Track 1 (PAO): Issue #421: Triage user-reported bug in login flow
  Read the issue body. Analyze, assess urgency (P0/P1/P2), recommend next step.
  Write findings as an issue comment.
  Do NOT create branches or modify files.
Track 2 (FIDO): Issue #428: Review PR #427's test coverage
  ...
Rules: All tracks READ-ONLY. Write findings as issue comments. Run in parallel.
```
---
## Measurement methodology
The 2.9× speedup citation comes from comparing 6 read-heavy issues:
- Sequential mode: 6 separate `copilot --agent {role}` invocations → ~18 minutes total (each ~3 min for cold-start + analysis)
- Fleet mode: 1 `copilot --fleet` invocation with 6 tracks → ~6 minutes total (one cold-start, parallel analysis tracks)
Speedup is dominated by avoiding 5 cold-starts. It does NOT extend to write-heavy issues because Copilot's `/fleet` doesn't currently support parallel write operations safely (commits would conflict).
---
## Configuration
Set the dispatch mode in `.squad/watch-config.json`:
```json
{
  "execute": true,
  "dispatchMode": "hybrid",
  "interval": 300,
  "copilotFlags": "--allow-all-tools --no-color"
}
```
Or via CLI flag (overrides config):
```bash
squad watch --execute --dispatch-mode fleet
squad watch --execute --dispatch-mode hybrid
squad watch --execute --dispatch-mode sequential
```
---
## Limitations
- **Read-only only.** Fleet tracks must not modify files or create branches. The capability builds prompts that explicitly forbid this; if your team needs parallel write workflows, sequential dispatch remains the safer choice.
- **One track per issue.** No batching of multiple issues into one track — each issue gets its own analysis context.
- **Track count limit.** Copilot CLI `/fleet` has its own track-count ceiling. For backlogs with >10 read-heavy issues per round, the capability splits across multiple fleet calls.
- **Classification is conservative.** If `classifyIssue` is unsure, it defaults to write-heavy (sequential). Better to lose the speedup than to fleet-dispatch a write-heavy issue accidentally.
---
## See also
- [Ralph](/squad/docs/features/ralph/) — the watch loop's broader behavior
- [Capability Routing](/squad/docs/features/capability-routing/) — how watch matches work to agents
- [Rate Limiting](/squad/docs/features/rate-limiting/) — cooperative rate limiting (composes with fleet dispatch)
