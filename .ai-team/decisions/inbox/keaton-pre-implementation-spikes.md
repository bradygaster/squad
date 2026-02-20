# Decision: Pre-Implementation Spike Plan

**Date:** 2026-02-21  
**Owner:** Keaton (Lead)  
**Status:** Pending Brady approval  
**Scope:** Gate-check before M0 implementation begins

---

## Decision

Before committing to M0 implementation, run **5 targeted architectural spikes** to validate critical SDK assumptions:

1. **Concurrent sessions + shared CopilotClient** (2h) — foundational; blocks all agent spawning
2. **Adapter pattern + tool routing** (3h) — core coordinator architecture
3. **MCP passthrough + namespacing** (2h) — marketplace import feature
4. **gh CLI auth + export/import** (1.5h) — init and marketplace workflows
5. **resumeSession for Ralph** (2h) — persistent monitoring for M1

**Total:** 10.5 hours across 1.3 days.

**Timeline:** Run Spike 1 serially (foundational), parallelize Spikes 2+3+4, then Spike 5.

**Success criteria:** All 5 spikes produce passing tests and working reference code.

---

## Why This Matters

We've made **27 architectural decisions and resolved 27 questions**, but several are based on **assumptions about SDK behavior that haven't been validated**:

- ❓ Do concurrent sessions actually work safely on one CopilotClient? (assumed yes)
- ❓ Can we route tools correctly when multiple agents share one session? (assumed yes)
- ❓ Does `resumeSession()` truly work for persistent monitoring? (assumed yes)
- ❓ Does gh CLI auth work as documented in SDK? (assumed yes)
- ❓ Can MCP servers be bound per-agent without collision? (assumed yes)

If **any** of these assumptions are wrong, we'll waste weeks on rework after M0 implementation commits. Spikes convert assumptions to facts.

---

## Risk Matrix

| Spike | If It Fails | Impact | Mitigation | Acceptable |
|-------|------------|--------|-----------|-----------|
| 1 (Concurrent) | Sessions don't multiplex safely | Entire session pooling breaks | Use session pool (1 client per agent) | ✅ Yes, +3d |
| 2 (Adapter) | Tool routing impossible | Can't route tools between agents | Pre-allocate namespaces; separate sessions | ⚠️ Maybe, +5d |
| 3 (MCP) | MCP server binding fails | Marketplace MCP features broken | Defer to M3; skip MCP in M2 import | ✅ Yes, no delay |
| 4 (Auth) | gh auth doesn't work | Import fails on auth | Require explicit GH_TOKEN env var | ✅ Yes, +1d |
| 5 (Ralph) | resumeSession fails | Ralph can't persist | Use polling pattern in M1; defer to M3 | ✅ Yes, no delay |

---

## What Gets Delivered

After spikes complete:

1. **Spike 1 output:** `test-concurrent-sessions.ts` (regression suite)
2. **Spike 2 output:** `src/coordinator/adapter.ts` (starting code for M0 coordinator)
3. **Spike 3 output:** `test-mcp-passthrough.ts` (reference for MCP binding)
4. **Spike 4 output:** `test-gh-auth.ts` + `test-export-import.ts` (regression tests)
5. **Spike 5 output:** `test-resume-session.ts` (reference for Ralph implementation)

All code moves into M0/M1 implementation or regression suite.

---

## Work Parallel Tracks During Spikes

Teams don't have to wait for spike results. **Start immediately:**

- ✅ CLI scaffold (init, upgrade, basic commands) — no SDK needed
- ✅ Agent registry + config schema — no SDK needed
- ✅ Casting system (TypeScript logic) — can be built standalone
- ✅ Tests + CI setup — no SDK needed

**Wait for spike results:**
- ⏸️ Coordinator bootstrap
- ⏸️ Marketplace import
- ⏸️ MCP integration
- ⏸️ Ralph heartbeat

---

## Success Criteria

✅ Spike 1: CopilotClient remains singleton; 3 concurrent sessions complete without crosstalk  
✅ Spike 2: Adapter wraps client; single agent + tool routing works; two agents don't interfere  
✅ Spike 3: MCP tool invokes; namespaced tool works; offline MCP fails gracefully  
✅ Spike 4: gh auth reads token; export/import round-trip succeeds  
✅ Spike 5: Session resumes with checkpoints; tool handlers work in resumed session

---

## Related Documents

- Full assessment: `.ai-team/docs/pre-implementation-readiness.md`
- SDK constraints: `.ai-team/docs/import-export-sdk-constraints.md`
- Architectural decisions: `.ai-team/docs/architectural-decisions.md`

---

## Approval Chain

- [ ] Keaton (Lead) — produced assessment ✅
- [ ] Brady — approves spike plan and timeline
- [ ] SDK expert — owns Spikes 1, 2, 5
- [ ] Toolkit expert — owns Spike 4
- [ ] Integration team — owns Spike 3

---

**Next:** Present to Brady. If approved, begin spike execution immediately.
