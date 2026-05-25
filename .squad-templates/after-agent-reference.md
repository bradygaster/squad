# After Agent Reference

### After Agent Work

<!-- KNOWN PLATFORM BUGS: (1) "Silent Success" — ~7-10% of background spawns complete
     file writes but return no text. Mitigated by RESPONSE ORDER + filesystem checks.
     (2) "Server Error Retry Loop" — context overflow after fan-out. Mitigated by lean
     post-work turn + Scribe delegation + compact result presentation. -->

**⚡ Keep the post-work turn LEAN.** Coordinator's job: (1) present compact results, (2) spawn Scribe. That's ALL. No orchestration logs, no decision consolidation, no heavy file I/O.

**⚡ Context budget rule:** After collecting results from 3+ agents, use compact format (agent + 1-line outcome). Full details go in orchestration log via Scribe.

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
  CURRENT_DATETIME: <resolved CURRENT_DATETIME literal>
  STATE_BACKEND: {state_backend}

  SPAWN MANIFEST: {spawn_manifest}

  Tasks (in order):
  {% if STATE_BACKEND == "orphan" or STATE_BACKEND == "git-notes" or STATE_BACKEND == "two-layer" %}
  0. PRE-CHECK — STATE LEAK GUARD: Check if any agent accidentally committed or staged state files
     (.squad/decisions.md, agents/*/history.md, log/*, orchestration-log/*, decisions/inbox/*)
     to the working branch. If found: unstage with `git reset HEAD -- {file}`, restore with
     `git checkout HEAD -- {file}`. If leaked in last commit, amend to remove. Log count.
  {% endif %}
  0b. PRE-CHECK: Stat decisions.md size and count inbox/ files. Record measurements.
  1. DECISIONS ARCHIVE [HARD GATE]: If decisions.md >= 20480 bytes, archive entries older than 30 days NOW. If >= 51200 bytes, archive entries older than 7 days. Do not skip this step.
  {% if STATE_BACKEND == "git-notes" %}
  2. DECISION MERGE (git-notes): For each agent ref `squad/{agent}`, read notes via `git notes --ref=squad/{agent} show $(git rev-list --max-parents=0 HEAD)`. Extract any `decision` entries. Merge into decisions.md. Clear the decision field by overwriting the note without it.
  {% elif STATE_BACKEND == "two-layer" %}
  2. DECISION MERGE (two-layer): Merge .squad/decisions/inbox/ → decisions.md AND read agent note refs for any decisions with `promote_to_permanent`. Deduplicate. Push note refs: `git push origin 'refs/notes/squad/*'`
  {% else %}
  2. DECISION INBOX: Merge .squad/decisions/inbox/ → decisions.md, delete inbox files. Deduplicate.
  {% endif %}
  3. ORCHESTRATION LOG: Write .squad/orchestration-log/{timestamp}-{agent}.md per agent. Use ISO 8601 UTC timestamp.
  4. SESSION LOG: Write .squad/log/{timestamp}-{topic}.md. Brief. Use ISO 8601 UTC timestamp.
  {% if STATE_BACKEND == "git-notes" %}
  5. CROSS-AGENT (git-notes): For team updates, write to affected agents' note refs via `powershell .squad/scripts/notes/write-note.ps1 -Ref "squad/{agent}" -Content '{json}'`.
  {% else %}
  5. CROSS-AGENT: Append team updates to affected agents' history.md.
  {% endif %}
  6. HISTORY SUMMARIZATION [HARD GATE]: If any history.md >= 15360 bytes (15KB), summarize now.
  {% if STATE_BACKEND == "orphan" or STATE_BACKEND == "two-layer" %}
  7. GIT COMMIT (orphan): Stage `.squad/` state files and commit to the `squad-state` orphan branch:
     a. Identify changed `.squad/` state files via `git status --porcelain` (decisions.md, agents/*/history.md, log/*, orchestration-log/*).
     b. For each file, use git plumbing to write to the orphan branch:
        `git show squad-state:.squad/{path}` to check if file exists on orphan.
        Use `git checkout squad-state -- .squad/{path}` + write + `git add` + `git commit` workflow, OR
        use the SDK's OrphanBranchBackend if available.
     c. Reset working tree state files: `git checkout HEAD -- .squad/` to avoid polluting the working branch.
     d. Push orphan branch: `git push origin squad-state`
     ⚠️ NEVER commit `.squad/` state files to the working branch when using orphan backend.
  {% else %}
  7. GIT COMMIT: Stage only the exact `.squad/` files Scribe wrote in this session. Use `git status --porcelain` filtered to allowed paths (decisions.md, decisions-archive.md, agents/{name}/history.md, agents/{name}/history-archive.md, log/*, orchestration-log/*). Stage each file individually with `git add -- <path>`. Handle renames by extracting destination path (`-replace '^.* -> ',''`). Commit with -F (write msg to temp file). Skip if nothing staged. ⚠️ NEVER use `git add .squad/` or broad globs.
  {% endif %}
  8. HEALTH REPORT: Log decisions.md before/after size, inbox count processed, history files summarized.

  Never speak to user. ⚠️ End with plain text summary after all tool calls.
```

5. **Immediately assess:** Does anything trigger follow-up work? Launch it NOW.

6. **Ralph check:** If Ralph is active (see Ralph — Work Monitor), after chaining any follow-up work, IMMEDIATELY run Ralph's work-check cycle (Step 1). Do NOT stop. Do NOT wait for user input. Ralph keeps the pipeline moving until the board is clear.
