# Result Persistence

> Mandatory archival of agent results before context expires.

Agent results from `read_agent` expire within 2–3 minutes. The Scribe writes agent results to the orchestration log immediately after reading them to ensure results are not lost if the session ends or context is compacted.

## Why Result Persistence Matters

When an agent completes work:
1. You call `read_agent` to retrieve its results
2. Coordinator displays output to you
3. Session ends or context is compacted
4. The `read_agent` response disappears from memory
5. **Results are gone** unless persisted

Result persistence ensures the Coordinator archives every agent's work to disk before moving forward, so you can always look up what happened.

## Result Persistence Flow

**Step 1: Immediate Write After `read_agent`**
After calling `read_agent`, before any other processing, the Scribe writes:
```
.squad/orchestration-log/{ISO8601-timestamp}-{agent-name}.md
```

Example filename: `2026-04-08T14-23-45Z-API-Agent.md` (hyphens instead of colons for Windows compatibility)

**Step 2: Log File Format**
Each log file contains:
- Agent name and spawn ID
- ISO 8601 timestamp of completion
- Original task description
- Result summary (what the agent did)
- List of files modified (if any)
- Full response text

Example:
```markdown
# Orchestration Log: 2026-04-08T14-23-45Z — API Agent

**Agent:** API Agent (spawn-id: api-agent-2026-04-08-142345)
**Task:** Refactor user endpoints to use dependency injection

**Status:** ✅ Complete

**Summary:** Refactored three endpoints (GET /users, POST /users, DELETE /users/:id) to accept dependency-injected logger. Added tests for each endpoint. All tests pass.

**Files Modified:**
- src/routes/users.ts
- src/routes/__tests__/users.test.ts

**Full Response:**
[Agent's complete output from read_agent]
```

**Step 3: Persistence Before Anything Else**
Result persistence happens BEFORE:
- Coordinator displays results to user
- Coordinator spawns follow-up agents
- Coordinator processes session state
- Any other action

This ensures results are safe even if the session crashes or context compacts mid-process.

## Observable Behavior

- `.squad/orchestration-log/` contains timestamped markdown files for every agent that ran
- Each file includes agent name, task, result summary, and files modified
- If `read_agent` returns no response, Coordinator checks the filesystem for `history.md`, `decisions/`, and `output/` files written by the agent directly during its run
- Session never loses agent results

## Orchestration Log Location

```
.squad/orchestration-log/
├── 2026-04-08T14-23-45Z-API-Agent.md
├── 2026-04-08T14-35-12Z-Frontend-Agent.md
└── 2026-04-08T14-50-00Z-Scribe.md
```

File naming: `{ISO8601-timestamp}-{agent-name}.md` (timestamps use hyphens instead of colons for Windows compatibility)

## Related Concepts

- **Compaction Recovery** — Session state checkpoint that helps Coordinator resume after context is compacted
- **Session State** — Lightweight checkpoint (`.squad/session-state.md`) that captures next action needed

## See Also

- [Compaction Recovery](./compaction-recovery.md) — How Coordinator recovers from context compaction
- [Coordinator Restraint Rules](./coordinator-restraint.md) — How Coordinator avoids over-managing agents
