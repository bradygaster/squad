# Background Agent Timeouts: What We Learned the Hard Way

> "What did you expect the agent to do when you asked it to cure cancer in 5 minutes?"

## The Problem

When you spawn a background agent via the `task` tool with `mode: "background"`, you collect results with `read_agent`. The default timeout is **30 seconds**.

A background agent doing real work — reading files, analyzing code, writing proposals, updating history — takes **45–120 seconds**. A 30-second timeout catches maybe 20% of that.

The platform doesn't tell you "still working." It tells you **nothing**. Which you interpret as failure.

## The Symptom

```
"General-purpose agent did not produce a response."
```

This looks like your agent crashed. It didn't. It's still writing files, updating history, logging decisions. You just hung up on it.

We saw this on **~40% of spawns** before we understood the cause.

## The Math

| Phase | Time |
|-------|------|
| Agent startup + context loading | 5–10s |
| Read input files (history, decisions, artifacts) | 5–15s |
| Actual analysis/implementation work | 20–60s |
| Write output files (proposals, code) | 5–15s |
| Update history.md + decision inbox | 5–10s |
| Generate text summary | 2–5s |
| **Total** | **42–115s** |

Default `read_agent` timeout: **30s**. You do the math.

## The Fix

```javascript
read_agent({
  agent_id: "agent-12",
  wait: true,       // block until done
  timeout: 300      // max 5 minutes — the platform ceiling
})
```

**`timeout` is a MAX, not a fixed delay.** If the agent finishes in 50 seconds, you get results in 50 seconds. Setting 300 doesn't mean waiting 300. It means "don't abandon this agent for up to 5 minutes."

Always use `wait: true`. Without it, `read_agent` returns immediately with whatever's available — which for a busy agent is nothing.

## The Complementary Fix: Response Order

Correct timeouts aren't enough. There's a second failure mode.

When an agent's **last action is a tool call** (writing to `history.md`, creating an inbox file), the platform may report "no response" even if the agent ran to completion. The response channel returns the agent's final *text*, not its final *tool output*.

**Fix:** Instruct agents to end with text, not tool calls.

```
⚠️ RESPONSE ORDER: After completing ALL tool calls (file writes, history
updates, decision inbox writes), you MUST end your final message with a
TEXT summary. Your very last output must be text, NOT a tool call.
```

This dropped our silent-success rate from ~40% to near zero when combined with the timeout fix.

## The Detection Pattern: Files Are Ground Truth

Even with both fixes, responses can still be lost. When they are:

1. **Don't report failure.** The agent probably finished.
2. **Check the filesystem.** Did the expected output files get created? Was `history.md` updated? Are there new files in the decision inbox?
3. **If files exist → silent success.** Read the output files and summarize them yourself.
4. **If files don't exist → genuine failure.** Re-spawn the agent.

```
# Pseudo-logic for the coordinator
if (agentResponse is empty) {
  if (expectedOutputFiles exist) {
    report("⚠️ {Name} completed work (files verified) but response was lost.")
    summary = read(outputFiles)
  } else {
    report("❌ {Name} didn't complete. Re-spawning...")
    respawn(agent)
  }
}
```

The filesystem is the reliable channel. Response text is a convenience.

## TL;DR

| What | Do This |
|------|---------|
| `read_agent` timeout | `wait: true, timeout: 300` — always |
| Agent prompt | End with "your last output must be text" |
| Empty response | Check files before reporting failure |
| Default 30s timeout | Never use it for real work |

---

*Documented from Proposal 015 (P0 Silent Success Bug). Learned in production when 40% of our agents were "failing" while delivering perfect work.*
