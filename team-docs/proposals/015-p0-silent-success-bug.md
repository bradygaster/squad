# Proposal 015: P0 — Silent Success Bug

**Status:** Approved ✅ Shipped  
**Implementing:** Coordinator (Sprint 0)
**Started:** 2026-02-08
**Author:** Kujan (Copilot SDK Expert)
**Date:** 2026-02-08
**Priority:** P0 — Brady's trust depends on this

---

## The Bug

When the coordinator spawns agents using the `task` tool with `mode: "background"`, approximately 40% of completed agents report:

> "General-purpose agent did not produce a response."

**But the agent DID complete its work.** Files were written. Histories were updated. Decisions were logged to inbox. The work is done. The response is lost.

### Evidence from This Session

| Agent | Task | Files written? | Response? |
|-------|------|---------------|-----------|
| Fenster (agent-3) | Analyze implementation | Unknown | ❌ No response |
| McManus (agent-6) | Messaging overhaul | ✅ YES | ❌ No response |
| Kujan (agent-8) | Codebase explore | ✅ YES (history.md updated) | ❌ No response |
| Fenster (agent-19) | Forwardability proposal | ✅ YES (011.md exists, 45KB) | ❌ No response |
| Kujan (agent-20) | Skills platform | ✅ YES (012.md exists, 46KB) | ❌ No response |
| Hockney (agent-21) | Test strategy | ✅ YES (013.md exists) | ❌ No response |

**Pattern:** 6 out of ~15 spawns (40%) completed all file operations but returned no response text to the coordinator.

---

## Root Cause Analysis

### Hypothesis 1: Agent ends with a tool call, not a text response ⭐ MOST LIKELY

**The smoking gun is in `squad.agent.md` lines 234-250.**

The spawn prompt tells agents:

```
AFTER your work, you MUST update two files:
1. APPEND to .ai-team/agents/{name}/history.md
2. If you made a decision others should know, write it to:
   .ai-team/decisions/inbox/{name}-{brief-slug}.md
```

This means the agent's LAST action is a file write (tool call). If the agent calls `edit` or `create` to write history.md and then the `task` tool collects the result, the agent's final turn was a tool call — not a text response. The `task` tool may interpret this as "no response produced" because it looks for the agent's final *text* output, not its final *tool* output.

**Why this explains the 40% rate:** Not all agents hit this. Some agents produce a short text summary after their file writes. Others end on the file write itself. It depends on the LLM's generation order — sometimes it writes text first and files second, sometimes files first and text last, sometimes files only. The non-determinism explains the ~40% rate.

**Why this explains the correlation with work completion:** The bug only triggers when the agent successfully does ALL its work including the final history/decision writes. An agent that fails early would produce error text as its response. Success is what causes the silent failure.

### Hypothesis 2: Response size exceeds platform buffer

Agents that wrote large proposals (45KB for Fenster, 46KB for Kujan) may produce response text that exceeds the `task` tool's response buffer. If the platform has a response size limit and truncates to empty instead of truncating to a prefix, large responses would vanish entirely.

**Evidence for:** The affected agents all produced large artifacts. **Evidence against:** McManus (agent-6) wrote a messaging overhaul — likely shorter — and also lost its response. This suggests size alone isn't the cause, but it may be a contributing factor.

### Hypothesis 3: Timeout during `read_agent`

`read_agent` has a default timeout of 30 seconds and a maximum of 300 seconds. If the coordinator doesn't set `wait: true` with a sufficient timeout, and the agent hasn't finished when `read_agent` is called, the result may be "no response."

**Evidence against:** The agents DID finish — files exist on disk. The coordinator calls `read_agent` after agents complete. Unless there's a race condition where the agent writes files but hasn't generated its final text response yet, this seems unlikely. But it could compound with Hypothesis 1.

### Hypothesis 4: Platform bug in `task` tool's background mode

The `task` tool's background mode may have a genuine bug where the response channel is unreliable. This is a platform-level issue we cannot fix. The `read_agent` tool documentation says it "returns the agent status and results if available" — the "if available" qualifier suggests results aren't guaranteed.

**Evidence for:** This only affects `mode: "background"` agents. Sync agents would block until the response is generated, making the response channel more reliable. The 40% failure rate suggests a race condition, not a deterministic bug.

### Hypothesis 5: Multiple background agents competing for resources

When 4-6 agents are spawned simultaneously in background mode, platform resource contention may cause some agents to be terminated after completing file operations but before generating their final response. The platform may garbage-collect long-running background agents.

---

## What the Coordinator Can Do

### 1. Detect Silent Success (Verify Files Exist)

The coordinator already knows what each agent was asked to do. It knows the expected output files. When `read_agent` returns "no response," the coordinator can check whether the expected files were created or modified.

**Detection logic:**
- Agent was asked to write a proposal → check if `docs/proposals/NNN-*.md` exists
- Agent was asked to modify code → check if the target files were modified (git status)
- Agent always writes history.md → check if history.md was recently modified
- Agent may write to inbox → check if inbox has new files from this agent

### 2. Recover Gracefully

When silent success is detected, the coordinator reports:

> "⚠️ {Name}'s response was lost in transit, but the work landed — `docs/proposals/011.md` was written successfully. Reading it now to summarize."

This is 100x better than "General-purpose agent did not produce a response."

The coordinator can then read the produced file and generate a summary itself.

### 3. Reduce Probability via Prompt Changes

Force agents to produce a text summary BEFORE writing to history.md and inbox. This makes the text response the agent's primary output, with file writes as a secondary epilogue. If the platform drops responses that end with tool calls, this ensures the text response is generated in an earlier turn.

---

## Immediate Mitigations (Ship Today)

### Mitigation 1: Add Response Format Guidance to Spawn Prompt

**Change the spawn prompt template in `squad.agent.md` lines 232-250.**

Current (problematic):
```
Do the work. Respond as {Name} — your voice, your expertise, your opinions.

AFTER your work, you MUST update two files:

1. APPEND to .ai-team/agents/{name}/history.md ...
2. If you made a decision others should know, write it to: ...
```

Proposed (fixed):
```
Do the work. Respond as {Name} — your voice, your expertise, your opinions.

⚠️ RESPONSE FORMAT — CRITICAL:
You MUST end your final message with a text summary of what you did.
Do NOT let your last action be a tool call with no follow-up text.
Structure your work as:
1. Read inputs, do your analysis/implementation
2. Write output files (proposals, code, etc.)
3. Update your history.md and decision inbox
4. LAST — write a brief text summary: what you did, what files you produced, key decisions made

If your final response is only tool calls with no text, the coordinator cannot see your work.
```

### Mitigation 2: Add Silent Success Detection to "After Agent Work"

**Add to `squad.agent.md` after line 349 (the "Collect results" step).**

Add a new step 1a:

```markdown
1a. **Detect silent success.** If `read_agent` returns an empty response or
    "did not produce a response" for any agent, do NOT report failure.
    Instead:
    - Check if the agent's expected output files exist (proposals, code, etc.)
    - Check if the agent's history.md was recently updated
    - Check if the agent wrote any files to `.ai-team/decisions/inbox/`
    - If files exist: report to the user:
      "⚠️ {Name}'s response was lost in transit, but the work landed —
      {list files created/modified}. Reading the output now."
      Then read the produced files and summarize them for the user.
    - If no files exist: report genuine failure:
      "❌ {Name} did not complete their work. Retrying..."
      Then re-spawn the agent.
```

### Mitigation 3: Add `wait: true` with Generous Timeout to `read_agent` Calls

The coordinator instructions should explicitly tell the coordinator to use `wait: true` with `timeout: 300` (the maximum) when collecting results from background agents. This eliminates the race condition where `read_agent` is called before the agent's final text response is generated.

**Add to the "Collect results" instruction (line 349):**

```markdown
1. **Collect results** from all background agents via `read_agent` with
   `wait: true` and `timeout: 300` before presenting output to the user.
   Always set the maximum timeout — agents doing real work may take minutes.
```

---

## Exact Changes to `squad.agent.md`

### Change 1: Spawn Prompt Template (all three templates)

In the background spawn template, sync spawn template, and generic template, replace:

```
Do the work. Respond as {Name} — your voice, your expertise, your opinions.

AFTER your work, you MUST update two files:
```

With:

```
Do the work. Respond as {Name} — your voice, your expertise, your opinions.

⚠️ RESPONSE ORDER — you MUST follow this sequence:
1. Do your analysis, research, implementation — all tool calls for the actual work
2. Write any output files (proposals, code changes, etc.)
3. Update .ai-team/agents/{name}/history.md and decision inbox (if needed)
4. LAST — end with a TEXT summary of what you did, what files you produced,
   and any key decisions. This text is how the coordinator reports your work.
   If you end with only tool calls and no text, your response will be lost.

You MUST update two files:
```

### Change 2: After Agent Work — Collect Results (line 349)

Replace:

```
1. **Collect results** from all background agents via `read_agent` before presenting output to the user.
```

With:

```
1. **Collect results** from all background agents via `read_agent` with `wait: true` and `timeout: 300` before presenting output to the user.

1a. **Handle silent success.** If any agent's response is empty or says "did not produce a response":
    - Do NOT tell the user the agent failed.
    - Check: do the expected output files exist? Was the agent's `history.md` updated? Are there new files in `.ai-team/decisions/inbox/` from this agent?
    - **If files exist (silent success):** Tell the user: *"⚠️ {Name}'s response was lost in transit, but the work landed — {list files}."* Then read the key output file(s) and summarize for the user.
    - **If no files exist (genuine failure):** Tell the user: *"❌ {Name} didn't complete their work. Re-spawning..."* and retry the agent.
    - Silent success is a known platform limitation with background agents. The work is real even when the response is lost.
```

### Change 3: Scribe Prompt — Same Response Order Fix

The Scribe prompt (lines 365-383) ends with "Never speak to the user. Never appear in output." This is fine for Scribe since we don't read its response. But to be defensive, no change needed for Scribe — Scribe responses are always discarded.

---

## What We Cannot Control

### Platform Bug Report (if needed)

If this persists after our mitigations, we should report to the Copilot team:

**Title:** `task` tool with `mode: "background"` — agent response lost when agent's final turn is tool calls

**Description:**
When a background agent's final LLM turn consists of tool calls (file writes via `edit`/`create`) with no follow-up text generation, `read_agent` returns "General-purpose agent did not produce a response" even though the agent completed all work successfully. The agent's tool calls execute (files are written to disk) but the text response channel returns empty.

**Reproduction:**
1. Spawn a `general-purpose` agent with `mode: "background"`
2. In the prompt, instruct the agent to write a large file and then update a history file
3. Wait for completion, call `read_agent` with `wait: true`
4. ~40% of the time, the response will be empty despite files being written

**Expected:** `read_agent` returns the agent's text response even if the agent's final turn included tool calls.

**Actual:** `read_agent` returns empty/error message. Files written by the agent exist on disk.

**Workaround:** Instruct agents to always end with a text summary after all tool calls. Add file-existence checks to detect silent success.

---

## Risk Assessment

| Mitigation | Risk | Impact |
|-----------|------|--------|
| Response order in spawn prompt | Zero — pure instruction change | Reduces probability of silent success from ~40% to ~10-15% (LLM compliance isn't 100%) |
| Silent success detection | Zero — adds a check, doesn't change behavior | Catches remaining cases, converts false negatives to accurate reports |
| `read_agent` timeout increase | Zero — only increases wait time | Eliminates race condition hypothesis |
| File existence verification | Zero — read-only check | Provides ground truth when response is lost |

**Combined risk: Zero.** All mitigations are additive, defensive, and non-breaking. Ship immediately.

---

## Success Criteria

After applying these mitigations:
1. **Zero false failure reports.** The user should never see "agent did not produce a response" when files were written.
2. **Silent success is surfaced.** When a response is lost, the user sees what files were created and a summary.
3. **Reduced incidence.** The response-order prompt change should reduce silent success from ~40% to <15%.
4. **No behavioral regression.** Agents still write to history.md and inbox as before.

---

## Future Work

- **Monitor silent success rate** after mitigations. If it stays above 10%, escalate to Copilot team.
- **Consider sync mode for critical agents.** If the Lead is producing an architecture decision that gates all other work, sync mode eliminates the response loss risk entirely. Background mode is for fire-and-forget work where we can recover from lost responses.
- **Proposal 007 interaction.** The tiered response modes in Proposal 007 already suggest lightweight spawns. Lightweight spawns produce shorter responses, which may naturally avoid the response size issue (Hypothesis 2). These proposals are complementary.
- **Agent self-verification.** Agents could write a `.ai-team/agents/{name}/last-output.md` file with their response text before returning it. This would provide a filesystem-backed response channel that survives platform failures. This is a heavier mitigation — only pursue if the prompt-based fix doesn't bring the rate below 10%.
