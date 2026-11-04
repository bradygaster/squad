# After Agent Reference

### After Agent Work

<!-- KNOWN PLATFORM BUGS: (1) "Silent Success" — ~7-10% of background spawns complete
     file writes but return no text. Mitigated by RESPONSE ORDER + filesystem checks.
     (2) "Server Error Retry Loop" — context overflow after fan-out. Mitigated by lean
     post-work turn + Scribe delegation + compact result presentation. -->

**⚡ Keep the post-work turn LEAN.** Coordinator's job: (1) present compact results, (2) spawn Scribe only when accepted durable decisions need merging. That's ALL. No session or orchestration logs, no decision consolidation, no heavy file I/O.

**⚡ Context budget rule:** After collecting results from 3+ agents, use compact format (agent + 1-line outcome). Do not paste full agent output. Durable outcomes belong in decisions (`squad_decide`); each agent appends its own learnings to its own `history.md`.

After each batch of agent work:

1. **Collect results** via `read_agent` (wait: true, timeout: 300).

2. **Silent success detection** — when `read_agent` returns empty/no response:
   - Check filesystem: history.md modified? New decision inbox files? Output files created?
   - Files found → `"⚠️ {Name} completed (files verified) but response lost."` Treat as DONE.
   - No files → `"❌ {Name} failed — no work product."` Consider re-spawn.

3. **Show compact results:** `{emoji} {Name} — {1-line summary of what they did}`

4. **Spawn Scribe** (background, never wait) only when `decisions/inbox` holds accepted durable decisions to merge. Scribe's duties come only from its charter (`.squad/agents/scribe/charter.md`). The prompt below must stay identical to the **Scribe Spawn Template** in `squad.agent.md`:

```
agent_type: "general-purpose"
model: "claude-haiku-4.5"
mode: "background"
name: "scribe"
description: "📋 Scribe: Merge durable decisions"
prompt: |
  You are the Scribe. Read .squad/agents/scribe/charter.md.
  TEAM ROOT: {team_root}
  CURRENT_DATETIME: <resolved CURRENT_DATETIME literal>
  STATE_BACKEND: {state_backend}

  Tasks (in order):
  0. PRE-CHECK: Run `squad_state_health` when available. If state tools are unavailable, stop without mutating files or git state.
  0b. PRE-CHECK: Read `decisions.md` and list `decisions/inbox` with state tools. Record measurements.
  1. DECISION INBOX: Use `squad_state_list` and `squad_state_read` on `decisions/inbox`, merge accepted durable decisions into `decisions.md` with `squad_state_write`, delete processed inbox entries with `squad_state_delete`, and deduplicate. Before splicing an inbox body beneath an `###` entry, DEMOTE its headings so its shallowest heading lands at `####` (`##` -> `####`). Preserve relative structure. Never emit an `##` under an `###`.
  2. VERIFY: Re-read `decisions.md` and confirm every merged entry is present before deleting its inbox source.
  3. GIT COMMIT: Do not commit mutable squad state. If non-state repo files changed, report them for coordinator handling.

  Runtime state tools own persistence. Never switch branches, push note refs, reset `.squad/`, or commit mutable squad state from this prompt.

  Never speak to user. End with plain text summary after all tool calls.
```

Scribe does not write session logs, orchestration logs or other agents' `history.md`, and it does not archive. Size hygiene (archiving old decisions, compressing large histories, pruning old logs) is the `squad nap` CLI command, not a Scribe task.

5. **Immediately assess:** Does anything trigger follow-up work? Launch it NOW.

6. **Ralph check:** If Ralph is active (see Ralph — Work Monitor), after chaining any follow-up work, IMMEDIATELY run Ralph's work-check cycle (Step 1). Do NOT stop. Do NOT wait for user input. Ralph keeps the pipeline moving until the board is clear.
