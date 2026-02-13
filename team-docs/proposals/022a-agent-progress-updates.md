# Proposal 022a: Agent Progress Updates — Periodic Status During Long-Running Work

**Author:** Keaton (Lead)  
**Date:** 2026-02-13  
**Status:** Proposed  
**Requested by:** bradygaster (Issue #22)  
**Builds on:** Proposal 017/030/030a (async comms), 019 (master sprint plan), 034 (notifications)  

---

## 1. Problem Analysis

### The UX Gap

Users launching long-running background agents (exploratory code analysis, full test suites, large codebase refactors) report **uncertainty and anxiety** while work runs:

- **Blank terminal.** The UI goes silent after the coordinator acknowledges the spawn. No signals.
- **Invisible progress.** Did the agent hit an error? Is it stuck? Still working?
- **Perception of slowness.** Silence feels slower than noise. A 5-minute agent task *feels* like a hang without status updates.
- **Broken feedback loop.** Users can't tell the difference between "agent is paralyzed" and "agent is thinking hard," so they re-run work or cancel early.

**Result:** Users feel disconnected from their team. The remote-team feeling that Squad should create is broken by one-way communication.

### Why This Matters to Squad's Mission

Squad's core promise is that agents *feel like remote coworkers*. Remote coworkers send status updates:

- *"Working on auth refactor, found 47 uses of the old pattern."*
- *"Test suite passed, running benchmarks now."*
- *"Blocked on API response — need your input."*

Without periodic updates, Squad agents feel like a black box, not a team. Solving this unlocks the intimacy that differentiates Squad from generic agent orchestration.

### The Actual Constraint

This isn't a technical blocker. **The coordinator can already poll agents via `read_agent`** with short timeouts to collect partial output. **Agents can already write to shared files** that the coordinator monitors. **The real constraint is design:** What's the right signal? The right cadence? The right voice?

Get this wrong and the output becomes noise. Get it right and the user feels like their team is working *with* them, not *for* them.

---

## 2. Platform Constraints & Mechanisms

### Current System

```
User → Coordinator (spawns agents)
         ↓
      Background Agents (mode: "background")
         ├─ Agent works, produces files
         ├─ Agent completes
         ↓
Coordinator (polls via read_agent)
         ↓
      User (gets final result)
```

**Gaps:**
- Coordinator only polls AFTER agents complete
- No mechanism for periodic mid-work status collection
- read_agent designed for final results, not streaming progress

### Available Mechanisms

**1. read_agent with short timeouts (MOST VIABLE)**
- `read_agent` returns partial output if agent is still running
- Can call `read_agent(agent_id, wait: false)` to get current status without blocking
- Cost: One API call per poll interval per agent
- Latency: Instant, non-blocking
- **Constraint:** Only works for work that generates text output (not file-only work)

**2. Shared file progress tracking (FILE-BASED)**
- Agents write to `.ai-team/progress/{agent-name}.md` during execution
- Coordinator polls this file on intervals (every 30s, etc.)
- Cost: Filesystem reads (negligible)
- Latency: Filesystem read speed
- **Constraint:** Agents must explicitly write progress; easily forgotten; can create merge conflicts if multiple agents write to same file

**3. Agent output log files (OUTPUT-BASED)**
- Agents write output to `.ai-team/progress/{agent-name}.log` as they work
- Coordinator tails this file periodically
- Cost: Filesystem reads
- **Constraint:** Only captures stdout/stderr, not work state; file handles can conflict

**4. Milestone-based signals (BEHAVIORAL)**
- Agents emit text signals at natural work breakpoints ("✅ Parsed 300 files", "🔴 Test 45/120 failed")
- Coordinator collects these via read_agent
- Cost: Zero additional API calls (reuses read_agent mechanism)
- **Constraint:** Requires agents to be trained on milestone signals; needs documentation

**5. Event file drop-box (FILE-BASED WITH MERGE)**
- Agents write to `.ai-team/progress-events/{timestamp}-{agent}.json` (one file per event, never conflicts)
- Coordinator polls directory for new files
- Cost: Filesystem reads + parsing JSON
- **Constraint:** Requires file cleanup; JSON parsing overhead

---

## 3. Proposed Approaches

### Approach A: Coordinator Polling via read_agent (Lightweight, Cost-First)

**Mechanism:**
1. Coordinator spawns background agent with `task(..., mode: "background")`
2. Coordinator acknowledges spawn to user: *"🏗️ Keaton is analyzing the codebase — I'll check in every 30s."*
3. While agent is running, coordinator **periodically calls `read_agent(agent_id, wait: false)` on 30-second intervals**
4. If agent is still running, read_agent returns partial output accumulated so far
5. Coordinator **extracts summary-level signals from the output** and relays to user:
   - *"📍 Processed 150/400 files..."*
   - *"✅ All tests passing (67 completed, 23 remaining)"*
   - *"🔴 Blocked: missing env.config file"*
6. Agent completes, coordinator collects final result, presents full summary

**Implementation:**
```javascript
// In coordinator loop (simplified pseudocode)
const agent_id = spawn_task(..., "background");
user_output("🏗️ " + agent.name + " is starting work...");

const max_polls = 600; // 30s × 600 = 300 minutes max
let poll_count = 0;

while (poll_count < max_polls) {
  await sleep(30000); // 30 seconds
  const current = read_agent(agent_id, wait: false);
  
  if (current.status === "completed") break;
  if (current.status === "running" && current.output) {
    const summary = extract_summary(current.output);
    user_output("📍 " + summary); // Relay progress
  }
  poll_count++;
}

const final = read_agent(agent_id, wait: true, timeout: 10);
user_output("✅ Complete:\n" + final.output);
```

**Pros:**
- Zero file I/O complexity
- Agents need zero changes (already producing text output)
- Cost is ~1 read_agent call per 30s per agent (negligible for short tasks, trivial for long ones)
- Works with ALL agent types immediately
- Coordinator has full output context for smart summarization

**Cons:**
- Polling latency (30s is industry-standard but not real-time)
- Requires coordinator logic to extract meaningful signals
- Agents may output noise that looks like progress but isn't
- User sees coordinator-paraphrased progress, not raw agent voice

**Brady's Cost Model Fit:** ✅ Excellent. Reuses read_agent (already called at end). 30-second polling is standard across industry (GitHub Actions, CI/CD, etc.). No new infrastructure.

---

### Approach B: Agents Write Milestone Files (Voice-Preserving)

**Mechanism:**
1. Agents follow a documented pattern: at natural milestones, they **write to `.ai-team/progress/{agent-name}.md`**
2. Each write appends a dated milestone entry with agent's own voice:
   ```markdown
   ## Keaton — Codebase Analysis
   **2026-02-13 14:23:15Z** — Parsing directory structure
   **2026-02-13 14:23:42Z** — ✅ Found 340 files across 8 modules
   **2026-02-13 14:24:08Z** — 📍 Analyzing imports in `src/auth/`...
   **2026-02-13 14:25:30Z** — ✅ Auth module complete (156 imports catalogued)
   **2026-02-13 14:25:31Z** — 📍 Analyzing imports in `src/api/`...
   ```
3. Coordinator **reads `.ai-team/progress/` directory every 30s**, displays new entries to user
4. Agents delete their progress file after work completes (cleanup)

**Implementation:**
```javascript
// In agent code
await fs.appendFile(".ai-team/progress/keaton.md", 
  `**${timestamp}Z** — 📍 Parsing directory structure\n`);
```

**Pros:**
- Preserves agent personality/voice (agent writes what they want user to know)
- No coordinator logic needed to extract signals
- Natural milestones match agent work (file written = can write progress)
- Agents control message; coordinator just relays

**Cons:**
- Agents must explicitly write progress (easy to forget)
- Requires agent discipline and documentation
- File coordination issues: multiple agents, stale files, cleanup
- Agents need code to write files (adds 1-2KB per agent spawn template)
- Not all work has natural "milestone" moments

**Brady's Cost Model Fit:** ✅ Good. No API calls. Filesystem ops are free. Requires agent documentation and discipline.

---

### Approach C: Milestone-Based Signals + Coordinator Relay (Balanced)

**Mechanism:**
1. **Agents trained to emit signals at milestones** (no file writes, just text output):
   ```
   ✅ [MILESTONE] Analyzed 150/400 files
   🔴 [MILESTONE] Error in src/lib/parser.js — unresolved dependency
   📍 [MILESTONE] Starting test suite...
   ```
2. Coordinator calls `read_agent(agent_id, wait: false)` every 30s
3. Coordinator **scans output for `[MILESTONE]` markers**, extracts them
4. Coordinator relays milestones to user in real-time:
   ```
   📍 Keaton — ✅ Analyzed 150/400 files
   📍 Keaton — 🔴 Error in src/lib/parser.js
   ```
5. Milestones persist in read_agent output (not lost when agent completes)

**Implementation:**
```javascript
// In agent code — agents just emit markers, no special tools
console.log("✅ [MILESTONE] Analyzed 150/400 files");

// In coordinator — extract and relay
const milestones = extract_milestones(current_output);
milestones.forEach(m => user_output("📍 " + agent.name + " — " + m));
```

**Pros:**
- Agents don't need to write files (just console output)
- Agents have full control over what's a milestone
- Coordinator intelligence can be tuned without agent changes
- Works with existing agent output patterns
- Cost is exactly the same as Approach A

**Cons:**
- Requires documenting `[MILESTONE]` convention
- Agents need training/examples
- Coordinator must extract milestones correctly (can be regex-fragile)

**Brady's Cost Model Fit:** ✅ Excellent. Same cost as Approach A (read_agent polling). Light coordinator logic.

---

### Approach D: Real-time Event Log (Over-Engineered)

**Mechanism:**
- Agents write JSON events to `.ai-team/progress-events/{timestamp}.json` at milestones
- Coordinator polls directory for new files every 5s
- Parser extracts events, displays to user
- Old files deleted after display

**Pros:**
- Structured data for future event streaming
- Real-time (5s latency vs 30s)

**Cons:**
- File handles, cleanup complexity
- Requires JSON serialization in agents
- Directory polling is messier than file read
- Over-engineered for the problem
- Higher latency (5s polling is not actually real-time; requires OS notification API for true real-time)

**Brady's Cost Model Fit:** ❌ No. Adds complexity without proportional value.

---

## 4. Recommended Approach: Milestone Signals + Coordinator Relay (A+C Hybrid)

### Why This Approach Wins

**Combines Approach A's cost efficiency with Approach C's voice control:**

1. **Coordinator uses `read_agent` polling (30-second intervals)**
   - Zero file I/O
   - One API call per 30s per agent (negligible cost)
   - Works immediately with existing agents
   - Fallback: if agent doesn't emit milestones, user still gets periodic "still working" status

2. **Agents trained to emit `[MILESTONE]` signals in output**
   - Agents control what gets highlighted
   - No file writes, no coordination overhead
   - Natural extension of existing agent logging/console patterns
   - Can be taught via skill (`.ai-team/skills/progress-signals/`)

3. **Coordinator extracts and relays milestones in real-time**
   - Every 30s, scans the accumulated output for `[MILESTONE]` markers
   - Displays new milestones with agent name and emoji
   - Keeps terminal feeling *alive* without noise

### The User Experience

```
Brady: "keaton, analyze the codebase"

Coordinator:
🏗️  Keaton is analyzing the codebase. I'll check in every 30 seconds.

[30s later]
📍 Keaton — ✅ Parsed 150/400 files
📍 Keaton — 📍 Analyzing module dependencies...

[30s later]
📍 Keaton — ✅ Found 47 circular dependencies
📍 Keaton — 📍 Generating report...

[45s later]
✅ Keaton completed analysis. Here's the report:
[full output...]
```

### What Changes

**For agents:**
- No code changes required (backward compatible)
- New skill available: `.ai-team/skills/progress-signals/SKILL.md`
- Agents can opt-in: emit `✅ [MILESTONE]` markers in their output when hitting natural breakpoints
- Examples documented in skill; easy to adopt

**For coordinator:**
- Add `progress_polling` loop to the spawn → completion flow
- Extract milestones from read_agent output every 30s
- Relay to user: `📍 {agent_name} — {milestone_text}`
- Cost: 0 (one more read_agent call, which was already happening at end)

**For the user:**
- Zero changes; better UX
- Agents feel *alive* during long work
- Milestones reinforce agent personality (Keaton uses 🏗️, Verbal uses 🎯, etc.)

---

## 5. Impact on squad.agent.md

### Coordinator Additions

**In the spawn flow (post-spawn, before final result collection):**

```markdown
### Progress Polling (New Section)

When spawning agents with `mode: "background"`:

1. **Before polling starts:** User always sees acknowledgment (required, non-negotiable):
   ```
   🏗️  {AgentName} is {work_description}. Checking in every 30 seconds.
   ```

2. **Progress polling loop (30-second intervals):**
   - Call `read_agent(agent_id, wait: false, timeout: 5)` every 30s while agent is running
   - Extract all lines matching `\[MILESTONE\]` from output
   - For each new milestone (not previously shown):
     ```
     📍 {AgentName} — {milestone_text}
     ```
   - Continue polling until agent completes

3. **Agent completion:**
   - Call `read_agent(agent_id, wait: true, timeout: 300)` to get final result
   - Display final summary/output per normal flow

**Example template for agent spawn:**

```
const agent = spawn(task, {
  agent_type: "explore",
  description: "Analyzing codebase structure",
  prompt: "...",
  mode: "background"
});

// NEW: Acknowledge and start polling
output(`🏗️  Keaton is analyzing the codebase. I'll check in every 30 seconds.`);

// NEW: Poll every 30s for progress
const milestones_shown = new Set();
const max_iterations = 600; // 30s × 600 = 5 hours max

for (let i = 0; i < max_iterations; i++) {
  const result = read_agent(agent.id, wait: false);
  
  if (result.status === "completed") break;
  
  if (result.output) {
    const new_milestones = extract_new_milestones(result.output, milestones_shown);
    new_milestones.forEach(m => {
      output(`📍 Keaton — ${m}`);
      milestones_shown.add(m);
    });
  }
  
  if (i < max_iterations - 1) {
    await sleep(30000);
  }
}

// Collect final result
const final = read_agent(agent.id, wait: true, timeout: 300);
// ... process final output per normal flow
```
```

### Skill Addition

**File:** `.ai-team/skills/progress-signals/SKILL.md`

```yaml
---
name: "progress-signals"
description: "Teaches agents to emit periodic status updates during long-running work via console output markers."
domain: "developer-experience"
confidence: "high"
source: "manual"
teaches:
  - pattern: "milestone-emission"
  - pattern: "progress-logging"
---

# Progress Signals Skill

## When to Use

Your work is going to take more than 30 seconds and you want the user to know you're making progress.

## The Pattern

Emit lines matching this format in your output (via console.log or similar):

```
✅ [MILESTONE] {summary of what you just completed}
📍 [MILESTONE] {what you're starting now}
🔴 [MILESTONE] {error or blocker you hit}
```

The coordinator will automatically extract and relay these to the user every 30 seconds.

## Examples

```javascript
// Good examples
console.log("✅ [MILESTONE] Parsed 150/400 files");
console.log("📍 [MILESTONE] Starting test suite run...");
console.log("🔴 [MILESTONE] Auth endpoint timeout — retrying...");

// These get relayed to the user as:
// 📍 Keaton — ✅ Parsed 150/400 files
// 📍 Keaton — 📍 Starting test suite run...
// 📍 Keaton — 🔴 Auth endpoint timeout — retrying...
```

## Do's and Don'ts

✅ **Do:**
- Emit milestones at natural breakpoints (after parsing a file, completing a test phase, etc.)
- Keep milestone text short (~1 line, max 80 chars)
- Use emoji to signal status (✅ done, 📍 in-progress, 🔴 error, 🤔 thinking)

❌ **Don't:**
- Emit milestones for every log line (that's noise, not progress)
- Emit duplicate milestones (once per phase, not per iteration)
- Use `[MILESTONE]` outside of the exact format (won't be extracted)
- Forget that the user will see this — write for them, not the logs

## Implementation

```javascript
const fs = require('fs');

// In your agent work loop:
for (let i = 0; i < files.length; i++) {
  process_file(files[i]);
  
  if ((i + 1) % 50 === 0) {
    console.log(`✅ [MILESTONE] Processed ${i + 1}/${files.length} files`);
  }
}

console.log("📍 [MILESTONE] Starting analysis phase...");
// ... analysis work ...
console.log("✅ [MILESTONE] Analysis complete");
```
```

---

## 6. UX Mockup: What the User Actually Sees

### Scenario 1: Short Task (< 1 minute)

```
Brady: keaton, review the auth module for security issues

Coordinator:
🏗️  Keaton is reviewing auth.js for security issues. I'll check in every 30 seconds.

[45 seconds later]
✅ Keaton completed. Here's the review:

[Keaton's output...]
```

*No progress updates shown because work completed before first 30-second poll.*

---

### Scenario 2: Medium Task (3-5 minutes, with milestones)

```
Brady: keaton, analyze the codebase and suggest refactoring opportunities

Coordinator:
🏗️  Keaton is analyzing the codebase. I'll check in every 30 seconds.

[30s later]
📍 Keaton — ✅ Parsed 150/400 files
📍 Keaton — 📍 Analyzing dependencies...

[60s later]
📍 Keaton — ✅ Found 47 files with high coupling (>10 imports)
📍 Keaton — 📍 Generating refactoring suggestions...

[90s later]
📍 Keaton — ✅ Identified 5 refactoring opportunities
📍 Keaton — 🏗️  Prioritizing by risk/benefit ratio...

[4 minutes, 30 seconds later]
✅ Keaton completed analysis. Here's the refactoring roadmap:

[Keaton's detailed output with recommendations...]
```

*User can see progress without checking external dashboards. Feels like Keaton is working *with* Brady, not *for* him.*

---

### Scenario 3: Long Task with Error Recovery (8+ minutes)

```
Brady: fenster, add integration tests for the new payments API

Coordinator:
🔧  Fenster is writing integration tests for the payments API. I'll check in every 30 seconds.

[30s later]
📍 Fenster — 📍 Generating test structure from API spec...

[60s later]
📍 Fenster — ✅ Created 23 test files
📍 Fenster — 📍 Running first batch (1-5)...

[90s later]
📍 Fenster — ✅ Tests 1-5 passed
📍 Fenster — 📍 Running batch 2 (6-10)...

[2m 30s later]
📍 Fenster — 🔴 Test 8 failed: mock payment gateway timeout
📍 Fenster — 🔧 Increasing timeout to 5s, retrying...

[3m later]
📍 Fenster — ✅ Tests 6-10 passed (retry successful)
📍 Fenster — 📍 Running batch 3 (11-15)...

[5m later]
📍 Fenster — ✅ All 23 tests passed (12m run time)
📍 Fenster — 📍 Generating coverage report...

[5m 30s later]
✅ Fenster completed. Test suite is ready:

[Coverage report, summary, next steps...]
```

*Brady can watch the work progress. If something blocks, he sees it immediately ("Test 8 failed") instead of waiting for the entire task to fail. He can decide to intervene or wait based on progress visibility.*

---

## 7. Success Criteria

- [ ] Coordinator emits `[MILESTONE]` extraction logic (can parse at least 10 common milestone formats)
- [ ] Skill documentation is clear enough that agents adopt it within 1-2 spawns
- [ ] No performance degradation: read_agent polling < 100ms overhead per call
- [ ] Users report feeling less uncertain during 2+ minute tasks (post-launch feedback)
- [ ] Milestone signals work across all agent types (explore, task, general-purpose, code-review) without modification
- [ ] Coordinator handles edge case: agent produces no milestones (falls back to "still working" message every 30s)

---

## 8. Alternatives Considered

| Approach | Cost | Complexity | Voice Control | Adoption |
|----------|------|-----------|----------------|----------|
| **Polling only (A)** | ⭐ (1 API call/30s) | ⭐ (low) | ❌ (coordinator decides) | ✅ (auto-works) |
| **File writes (B)** | ⭐ (fs read) | ⭐⭐ (file I/O) | ✅ (agents control) | ⚠️ (requires agent work) |
| **Milestones + polling (C, RECOMMENDED)** | ⭐ (1 API call/30s) | ⭐ (low) | ✅ (agents control) | ✅ (opt-in skill) |
| **Event log (D)** | ⭐⭐ (fs + json) | ⭐⭐⭐ (high) | ✅ (agents control) | ⚠️ (overbuilt) |

**Recommendation:** C wins on all axes. It's the cost-first choice that doesn't sacrifice user voice or agent personality.

---

## 9. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Agents forget to emit milestones | Medium | Skill documentation + examples in spawn template |
| Coordinator logic extracts false positives | Low | Use strict regex: `\[MILESTONE\]` (hard to accidentally match) |
| 30-second polling feels too slow | Low | Industry standard (GitHub Actions uses 10-30s intervals); documented as tunable |
| read_agent output becomes very large | Low | Milestones are 1-2 lines each; total overhead < 10KB for most tasks |
| Users get overwhelmed by milestone noise | Medium | Coordinator shows only new milestones per poll (deduplication); milestone counts capped at ~1 per 30s for discipline |

---

## 10. Roadmap

### v0.4.0 (Phase 1 — Foundation)
- [ ] Add progress polling loop to coordinator
- [ ] Add milestone extraction logic (regex-based)
- [ ] Add `.ai-team/skills/progress-signals/SKILL.md`
- [ ] Update squad.agent.md spawn template with example

### v0.5.0+ (Phase 2 — Enhancement)
- [ ] Agent can customize polling cadence (10s vs 30s)
- [ ] Milestone emoji matching to agent persona (Keaton → 🏗️, Verbal → 🎯, etc.)
- [ ] Milestone filtering: user can disable for quiet mode
- [ ] Structured milestone API for external tooling (GitHub Issues, Discord, etc.)

---

## Decision

**APPROVED for v0.4.0.** This is a lightweight, cost-first solution that dramatically improves user experience during long-running work. It preserves agent personality, requires minimal coordinator changes, and compounds with existing async/notification infrastructure (Proposal 034).

Next: Fenster to implement coordinator polling logic and skill documentation.

