# After Agent Work — Post-Work Reference

<!-- KNOWN PLATFORM BUGS: (1) "Silent Success" — ~7-10% of background spawns complete
     file writes but return no text. Mitigated by RESPONSE ORDER + filesystem checks.
     (2) "Server Error Retry Loop" — context overflow after fan-out. Mitigated by lean
     post-work turn + Scribe delegation + compact result presentation. -->

## Post-Work Steps

After each batch of agent work:

1. **Collect results** via `read_agent` (wait: true, timeout: 300).

2. **Silent success detection** — when `read_agent` returns empty/no response:
   - Check filesystem: history.md modified? New decision inbox files? Output files created?
   - Files found → `"⚠️ {Name} completed (files verified) but response lost."` Treat as DONE.
   - No files → `"❌ {Name} failed — no work product."` Consider re-spawn.

3. **Show compact results:** `{emoji} {Name} — {1-line summary of what they did}`

4. **Spawn Scribe** (background, never wait). Only if agents ran or inbox has files:

```
agent_type: "general-purpose"
model: "claude-haiku-4.5"
mode: "background"
name: "scribe"
description: "📋 Scribe: Log session & merge decisions"
prompt: |
  You are the Scribe. Read .squad/agents/scribe/charter.md.
  TEAM ROOT: {team_root}
  CURRENT_DATETIME: {current_datetime}

  SPAWN MANIFEST: {spawn_manifest}

  Tasks (in order):
  0. PRE-CHECK: Stat decisions.md size and count inbox/ files. Record measurements.
  1. DECISIONS ARCHIVE [HARD GATE]: If decisions.md >= 20480 bytes, archive entries older than 30 days NOW. If >= 51200 bytes, archive entries older than 7 days. Do not skip this step.
  2. DECISION INBOX: Merge .squad/decisions/inbox/ → decisions.md, delete inbox files. Deduplicate.
  3. ORCHESTRATION LOG: Write .squad/orchestration-log/{timestamp}-{agent}.md per agent. Use ISO 8601 UTC timestamp.
  4. SESSION LOG: Write .squad/log/{timestamp}-{topic}.md. Brief. Use ISO 8601 UTC timestamp.
  5. CROSS-AGENT: Append team updates to affected agents' history.md.
  6. HISTORY SUMMARIZATION [HARD GATE]: If any history.md >= 15360 bytes (15KB), summarize now.
  7. GIT COMMIT: Stage only the exact `.squad/` files Scribe wrote in this session. Use `git status --porcelain` filtered to allowed paths (decisions.md, decisions-archive.md, agents/{name}/history.md, agents/{name}/history-archive.md, log/*, orchestration-log/*). Stage each file individually with `git add -- <path>`. Handle renames by extracting destination path (`-replace '^.* -> ',''`). Commit with -F (write msg to temp file). Skip if nothing staged. ⚠️ NEVER use `git add .squad/` or broad globs.
  8. HEALTH REPORT: Log decisions.md before/after size, inbox count processed, history files summarized.

  Never speak to user. ⚠️ End with plain text summary after all tool calls.
```

5. **Immediately assess:** Does anything trigger follow-up work? Launch it NOW.

6. **Ralph check:** If Ralph is active, after chaining any follow-up work, IMMEDIATELY run Ralph's work-check cycle (Step 1). Do NOT stop. Do NOT wait for user input. Ralph keeps the pipeline moving until the board is clear.
