# Compaction Recovery

> Recovery mechanism for when conversation context is compacted.

The Coordinator writes a recovery checkpoint to `.squad/sessions/{session-id}.json` after each agent batch. If prior messages are missing upon context resumption (detected by the Coordinator), it reads the checkpoint to recover its place in the workflow without losing the plan.

## Why Compaction Recovery Matters

Large conversations can exceed the Coordinator's context window. When this happens:
1. Your LLM compacts prior messages (they're summarized or removed)
2. The Coordinator loses its working memory of what happened
3. **Without recovery:** Coordinator might replay earlier steps or lose the plan
4. **With recovery:** Coordinator reads the session state checkpoint and continues exactly where it left off

## Session State Checkpoint

### What It Contains

A minimal checkpoint answering: **"What should the Coordinator do next?"**

Example:
```markdown
# Session State — 2026-04-08T14:50:00Z

**Last Completed Step:** 8 (Results persisted to orchestration log)

**Next Action:**
- Spawn Scribe to summarize decisions made during this session

**Workflow Phase:** Post-agent-work

**Context:** Three agents completed: API Agent (refactored endpoints), Frontend Agent (updated components), Tests Agent (added coverage)
```

### File Location

```
.squad/sessions/{session-id}.json
```

This file is **temporary** — it's overwritten after each agent batch and is listed in `.gitignore` to prevent accidental commits.

## Compaction Recovery Flow

### Detection
The Coordinator detects context compaction when:
- Prior conversation turns are missing from the context window
- Earlier agent results are no longer visible
- Memory gaps appear in the workflow timeline

### Recovery Steps

1. **Read Session State**
   ```
   Open .squad/sessions/{session-id}.json
   Parse "nextAction" field
   ```

2. **Skip Replayed Steps**
   - Do NOT re-run steps already recorded in the checkpoint
   - Use the orchestration log to verify what happened
   - Resume at the "nextAction" field

3. **Continue Workflow**
   - Execute the next action
   - Update the checkpoint after each batch
   - Proceed normally

### Example Recovery

**Before Compaction:**
```
Coordinator spawned: API Agent → Frontend Agent → Tests Agent
Results persisted to orchestration log
(context is now full)
```

**Context Compaction Occurs:**
```
Session context is pruned to fit within token limit
Earlier messages are removed or summarized
Coordinator's memory of agent work is gone
```

**Upon Context Resumption:**
```
Coordinator notices missing prior messages
Reads .squad/sessions/{session-id}.json
Finds: "lastCompletedStep": 8
Finds: "nextAction": "Spawn Scribe to summarize decisions"
Coordinator skips steps 1-8, jumps directly to spawning Scribe
```

## Observable Behavior

- Session state checkpoint is written after each agent batch (step 8 in post-work flow)
- Checkpoint persists through context compaction
- Upon resumption, Coordinator continues the post-work flow without replaying earlier steps
- User sees no interruption — recovery is transparent

## Session State Format

The session state checkpoint includes:
- **Timestamp:** ISO 8601 format (when checkpoint was created)
- **Last Completed Step:** Number of the most recent workflow step
- **Next Action:** One bullet point describing the next action
- **Workflow Phase:** Current phase (e.g., "post-agent-work", "pre-spawn")
- **Context:** Brief summary of what happened (for debugging)

Example:
```markdown
# Session State — 2026-04-08T15:12:30Z

**Last Completed Step:** 8 (Orchestration log updated)

**Next Action:**
- Review agent results and determine if any follow-up work is needed

**Workflow Phase:** Post-agent-work

**Context:** 
Agents spawned: API Agent (completed successfully), Frontend Agent (completed with warnings)
API Agent modified: src/routes/users.ts, src/routes/__tests__/users.test.ts
Frontend Agent modified: src/components/UserProfile.tsx
Warnings: Frontend Agent flagged 2 deprecated React APIs
```

## Checkpoint Limitations

The session state checkpoint is **NOT**:
- Authoritative for architectural decisions (use `.squad/decisions.md` instead)
- Authoritative for work routing (use `.squad/routing.md` instead)
- A permanent archive (it's overwritten after each batch)
- A detailed work log (use the orchestration log for details)

It is **ONLY** a breadcrumb to help the Coordinator resume at the right place.

## Related Concepts

- **Result Persistence** — Immediate archival of agent results to disk before context expires
- **Orchestration Log** — Timestamped records of every agent's work (`.squad/orchestration-log/`)

## See Also

- [Result Persistence](./result-persistence.md) — How agent results are archived
- [Coordinator Restraint Rules](./coordinator-restraint.md) — How Coordinator avoids over-managing agents
