# Orchestration Log: Keaton (Lead) — Inline

**Date:** 2026-02-21T00:23 UTC  
**Session:** 2026-02-20T22-23-import-export-readiness (inline continuation)  
**Requested by:** Brady  
**Role:** Lead  
**Mode:** Standard

## Work Summary

**Output:** `.ai-team/docs/pre-implementation-readiness.md` (26KB)

### Content Delivered

Brady asked: "Are there any architectural tests or explorations that need to happen before we dive in?" Comprehensive assessment of 27 architectural assumptions that need validation.

### Key Finding

The team has made 27 decisions and resolved 27 questions, but several are based on ASSUMPTIONS about SDK behavior that haven't been validated:

- ❓ Do concurrent sessions work safely on one CopilotClient?
- ❓ Can tools be routed correctly with multiple agents?
- ❓ Does resumeSession() work for persistent monitoring?
- ❓ Does gh CLI auth work as documented?
- ❓ Can MCP servers bind per-agent without collision?

**Spike Solution:** 5 targeted architectural spikes validate critical assumptions in just 10.5 hours (~1.3 days).

### The 5 Spikes (Detailed)

**Spike 1: Concurrent Sessions (2h, foundational, MUST-HAVE)**
- Assumption: Multiple agents safely share one CopilotClient
- Test: Spawn 3 sessions, verify no crosstalk
- Blocks: All agent spawning — if fails, entire session pooling breaks
- Fallback: Use session pool (1 client per agent), +3d recovery

**Spike 2: Adapter Pattern + Tool Routing (3h, core architecture)**
- Assumption: Can route tools correctly between agents
- Test: Two agents, one tool definition, verify routing fidelity
- Blocks: Coordinator architecture
- Fallback: Pre-allocate namespaces or separate sessions, +5d recovery

**Spike 3: MCP Passthrough + Namespacing (2h, marketplace feature)**
- Assumption: MCP servers bind per-agent without collision
- Test: MCP tool invocation, namespacing, offline failure
- Blocks: Marketplace MCP import features
- Fallback: Defer to M3, skip MCP in M2 import (no delay)

**Spike 4: gh CLI Auth + Export/Import (1.5h, init + marketplace)**
- Assumption: gh CLI auth works as documented
- Test: Token read, export/import round-trip success
- Blocks: Init and marketplace workflows
- Fallback: Require explicit GH_TOKEN env var, +1d recovery

**Spike 5: resumeSession for Ralph (2h, persistent monitoring)**
- Assumption: resumeSession() works for persistent monitoring
- Test: Session resume with checkpoints, tool handlers in resumed session
- Blocks: Ralph implementation
- Fallback: Use polling pattern, defer to M3 (no delay)

### Execution Plan

**Timeline:** Run Spike 1 serially (foundational), parallelize Spikes 2+3+4, then Spike 5.

**What Gets Delivered After:**
- test-concurrent-sessions.ts (regression suite)
- src/coordinator/adapter.ts (starting code for M0)
- test-mcp-passthrough.ts (reference for MCP binding)
- test-gh-auth.ts + test-export-import.ts (regression tests)
- test-resume-session.ts (reference for Ralph)

### Parallel Work During Spikes

Teams don't wait for spike results. Start immediately:
- ✅ CLI scaffold (init, upgrade, basic commands)
- ✅ Agent registry + config schema
- ✅ Casting system (TypeScript logic)
- ✅ Tests + CI setup

**Wait for spike results:**
- ⏸️ Coordinator bootstrap
- ⏸️ Marketplace import
- ⏸️ MCP integration
- ⏸️ Ralph heartbeat

### Risk Mitigation

If any spike fails:
- Spike 1 fails → tolerable, +3d recovery, session-per-agent fallback
- Spike 2 fails → challenging, +5d recovery, namespace pre-allocation
- Spikes 3–5 fail → no critical path impact, features deferred to M3+

---

## Decision Output

**File:** `.ai-team/decisions/inbox/keaton-pre-implementation-spikes.md`

Decision: Run 5 targeted architectural spikes before M0 implementation.

**Status:** Pending Brady approval. Implementation does NOT begin until Brady signals "Go implement M0."

**Approval Chain:**
- [ ] Brady — approves spike plan and timeline
- [ ] SDK expert (Kujan) — owns Spikes 1, 2, 5
- [ ] Toolkit expert (Fenster) — owns Spike 4
- [ ] Integration team (Baer?) — owns Spike 3

---

## Related Decisions Merged

- Spikes validate assumptions from all 27 prior decisions
- Results feed directly into M0 implementation (PRD 1 gate)
- Risk matrix informs Brady checkpoint scheduling
