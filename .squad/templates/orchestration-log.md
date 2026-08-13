# Orchestration Log Entry

> One file per agent spawn. Saved to `.squad/orchestration-log/{timestamp}-{agent-name}.md`

---

### {timestamp} — {task summary}

| Field | Value |
|-------|-------|
| **Agent routed** | {Name} ({Role}) |
| **Why chosen** | {Routing rationale — what in the request matched this agent} |
| **Mode** | {`background` / `sync`} |
| **Why this mode** | {Brief reason — e.g., "No hard data dependencies" or "User needs to approve architecture"} |
| **Files authorized to read** | {Exact file paths the agent was told to read} |
| **File(s) agent must produce** | {Exact file paths the agent is expected to create or modify} |
| **Outcome** | {Completed / Rejected by {Reviewer} / Escalated} |
| **Token usage** | {inputTokens} in / {outputTokens} out — ${estimatedCostUsd} |

---

## Rules

1. **One file per agent spawn.** Named `{timestamp}-{agent-name}.md`. Timestamps must be filename-safe (replace colons with hyphens, e.g., `2026-02-23T20-16-27Z`).
2. **Log BEFORE spawning.** The entry must exist before the agent runs.
3. **Update outcome AFTER the agent completes.** Fill in the Outcome field.
4. **Never delete or edit past entries.** Append-only.
5. **If a reviewer rejects work,** log the rejection as a new entry with the revision agent.

---

## DispatchGuard Ledger Schema

The coordinator appends one JSON object per turn to `.squad/orchestration-log/dispatchguard/ledger-{SESSION_ID}.jsonl`. Scribe reads this file to audit compliance. Fields:

```jsonc
{
  "turn_id":                 "string — unique identifier for this coordinator turn",
  "session_id":              "string — Copilot session ID (from spawn prompt or environment)",
  "timestamp":               "ISO-8601 UTC datetime of the turn",
  "mode":                    "Direct | Lightweight | Standard | Full",
  "task_calls_since_last_turn": 0,   // integer — count of task/runSubagent/create_session calls
  "write_tools_used":        [],     // array of tool names that wrote files (edit, create, etc.)
  "domain_artifact_declared": {
    "value": false,                  // true if the turn claims it produced a domain artifact
    "description": ""                // if true, brief description of what was produced
  },
  "justification":           ""      // optional — explains why inline work was permitted (e.g., "direct_mode_whitelist_case_1")
}
```

**Verdicts file:** Scribe appends one JSON object per audited turn to `.squad/orchestration-log/dispatchguard/verdicts-{SESSION_ID}.jsonl`. See `.squad/hooks/README.md` for the output schema.

**Gitignore:** Both files are runtime-only and excluded from version control (see `.gitignore` entry for `.squad/orchestration-log/dispatchguard/`). Do NOT commit them.

