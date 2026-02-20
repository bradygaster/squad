# Pre-Implementation Readiness Assessment

**Author:** Keaton (Lead)  
**Date:** 2026-02-21  
**Status:** Gate-check before M0 implementation begins  
**Requested by:** Brady  

---

## Executive Summary

We have **strong foundational decisions** (27 architectural decisions, 27 questions resolved) but several **high-risk assumptions** that we've made about SDK behavior without validation. Before committing code to M0, we should run **4-5 targeted spikes (2-3 days total)** to verify the assumptions that would cause the most damage if wrong.

**GREEN lights:** Config-driven architecture, agent spawning, agent routing, tools system, auth model.  
**YELLOW flags:** Concurrent sessions + single shared CopilotClient, MCP passthrough with namespacing, session state export/import, persistent session monitoring (Ralph).  
**RED stops:** None — all are mitigable with small research spikes.

---

## 1. Proof-of-Concept Spikes Needed

### Spike 1: Concurrent Sessions + Shared CopilotClient

**Assumption we're making:**
> Multiple concurrent agent sessions can safely share a single `CopilotClient` connection without resource exhaustion, state collision, or message ordering issues. (Architectural Decision Q36)

**Why it matters:**
- Core to Squad's parallelism story — all spawned agents (Scribe, async agents) share one client
- If false, we need N clients and resource pooling logic
- Affects bundle size, memory, startup cost

**What could go wrong:**
- SDK session multiplexing doesn't work as assumed; concurrent sessions interfere
- Tool handler invocations aren't properly isolated by sessionId
- Event stream ordering breaks under load
- Memory leak when sessions scale to 10+ concurrent

**Minimal spike to validate (2 hours):**
1. Write TypeScript test: create CopilotClient once
2. Spawn 3 concurrent sessions with `client.createSession()` 
3. Send different prompts to each; each session calls a simple test tool
4. Verify: no crosstalk, event ordering correct, all 3 complete successfully
5. Check: CopilotClient remains single instance, memory stable

**Priority:** **MUST** (blocks M0 session pooling, agent spawning)

**Evidence to collect:**
- SDK samples: https://github.com/github/copilot-sdk (if any exist)
- Output: working `test-concurrent-sessions.ts`

---

### Spike 2: CopilotClient + SDK Adapter Pattern

**Assumption we're making:**
> We can wrap CopilotClient in a Squad-specific adapter (e.g., `SquadCoordinator`) that handles agent routing, tool namespacing, and hook plumbing without hitting SDK limitations or API gaps. (Architectural Decisions Q36, Q38, Q39)

**Why it matters:**
- This adapter is the load-bearing wall between Squad's config-driven model and SDK's session/tool model
- If SDK's tool registration, hooks, or session API is incompletely documented or has hidden limitations, we'll discover it too late
- Affects the whole TypeScript replatform

**What could go wrong:**
- SDK tool handlers can't determine which agent called them (they can't — only sessionId is available per Kujan's analysis)
  - We planned to work around this via handler routing logic, but need to verify it's actually doable
- `onPreToolUse` / `onPostToolUse` hooks don't support the flow we need (async, conditional tool blocking, result transformation)
- Session config doesn't support per-agent tool scoping (it doesn't — but we can work around with prompt-level routing)
- Custom agent config schema doesn't serialize/deserialize cleanly

**Minimal spike to validate (3 hours):**
1. Write `src/coordinator/adapter.ts` stub
   - Wrap CopilotClient
   - Load agent configs from `.squad/agents/` (one local agent)
   - Map agent to `CustomAgentConfig`
   - Create a session with that config
2. Test single-agent spawn:
   - Agent sends a message
   - Agent invokes a tool (e.g., `echo_tool`)
   - Tool handler receives invocation with sessionId
   - Verify we can route the tool call to the right agent (by sessionId logic, not SDK magic)
3. Add second agent; test tool routing with 2 agents in one session
4. Verify: hooks exist and fire in the right order, custom agent config passes through unmodified

**Priority:** **MUST** (blocks adapter implementation for M1-M2)

**Evidence to collect:**
- SDK types.ts: `CustomAgentConfig`, `Tool`, `SessionHooks`
- SDK docs: `docs/guides/` for agent config and hooks patterns
- Output: working `adapter.ts` stub + test

---

### Spike 3: MCP Tool Passthrough + Namespacing

**Assumption we're making:**
> MCP tools can be bound to agents, exported/imported, and namespaced without collision when multiple agents define similar tools. (Architectural Decisions Q38, Kujan's SDK constraints analysis § Tool Conflicts)

**Why it matters:**
- Marketplace feature depends on agents being portable + tool-complete
- If namespacing breaks or MCP servers don't work cross-environment, imported agents will silently fail
- Risk: customer imports a squad, tools call fail, no clear error

**What could go wrong:**
- SDK tool handler can't route MCP calls to the correct MCP server (per-agent MCP server binding)
- MCP server probe (to test availability post-import) requires complex logic
- Namespaced tool names (e.g., `squad-agent1:query_kb`) confuse the agent prompt

**Minimal spike to validate (2 hours):**
1. Set up local MCP server (e.g., stdio-based, simple tool like `echo`)
2. Bind MCP server to an agent via `CustomAgentConfig.mcpServers`
3. Agent prompt references the MCP tool
4. Send message that triggers the MCP tool
5. Verify: MCP tool invokes correctly, result flows back to agent
6. Then: rename tool to `squad-agent1:mcp_tool`, update prompt, verify still works
7. Add second agent with different MCP tool, verify no collision

**Priority:** **SHOULD** (blocks marketplace, agent import/export in M2-M3)

**Evidence to collect:**
- SDK types.ts: `MCPServerConfig` structure
- SDK docs: `docs/mcp/` folder
- Output: working `test-mcp-passthrough.ts`

---

### Spike 4: gh CLI Token Auth + Import/Export Flow

**Assumption we're making:**
> `gh` CLI token is available to the SDK at runtime, and we can use it to authenticate remote agent registry clones (GitHub API). SDK auth priority chain works as documented. (Architectural Decision Q10, Q19, Kujan's auth analysis § Authentication Flow)

**Why it matters:**
- Marketplace import depends on being able to fetch agent manifests from GitHub
- If SDK doesn't read `gh` auth correctly, or if SDK's auth fallback chain is broken, users will hit auth errors on import
- Rate limiting on unauthenticated requests (60/hr vs 5000/hr) means bulk imports MUST use auth

**What could go wrong:**
- SDK doesn't actually read `gh` CLI token (only documented, not implemented)
- SDK's auth priority is wrong; `gh` auth is never reached
- Token refresh doesn't work during long-running imports
- Manifest JSON parsing fails if repo path contains special characters

**Minimal spike to validate (1.5 hours):**
1. Set `GH_TOKEN` from `gh auth token` (or use OAuth token stored by `gh` CLI)
2. Create CopilotClient with `useLoggedInUser: true` (SDK default)
3. Try to clone a public GitHub repo via SDK (simulate agent import)
4. Verify: clone succeeds without explicit `githubToken` parameter
5. Try to clone a private repo; verify token auth works
6. Check: token refresh works (optional — only if long operations needed)

**Priority:** **SHOULD** (blocks M0 init with `--include-sdk`, marketplace in M2-M3)

**Evidence to collect:**
- SDK types.ts: `CopilotClientOptions` auth fields
- SDK docs: `docs/auth/index.md`
- Output: working `test-gh-auth.ts`

---

### Spike 5: resumeSession() for Ralph Persistent Monitoring

**Assumption we're making:**
> `resumeSession()` works reliably for Ralph's persistent monitoring loop (checking GitHub issues on an interval). Session can be resumed days later with checkpoint restoration. (Architectural Decision Q35, Feature AGT-10)

**Why it matters:**
- Ralph's heartbeat runs as a GitHub Actions workflow; session state must survive workflow restart
- If `resumeSession()` doesn't preserve workspace checkpoints or loses conversation context, Ralph monitoring degrades
- Affects PRD 8 (Ralph) implementation

**What could go wrong:**
- `resumeSession()` doesn't actually restore workspace state (only documented)
- Checkpoint serialization breaks on long-running agents
- Session resumption resets tool handlers or hooks

**Minimal spike to validate (2 hours):**
1. Create a session with `infinite: true` (enables workspace)
2. Send a message, verify checkpoints are written to `session.workspacePath`
3. Call `client.resumeSession(sessionId)` with that sessionId
4. Verify: session restores, checkpoints are readable, conversation history available
5. Send another message in resumed session; verify context is preserved
6. Check: tool handlers work in resumed session

**Priority:** **SHOULD** (blocks Ralph in M1, PRD 8)

**Evidence to collect:**
- SDK types.ts: `ResumeSessionConfig`
- SDK docs: `docs/guides/sessions.md` or similar
- SDK samples: any persistent session examples
- Output: working `test-resume-session.ts`

---

## 2. Architectural Unknowns Still Open

### Session State Export/Import (Scribe Context)

**Status:** Partially addressed by Kujan's SDK constraints analysis  
**Gap:** We know session state isn't natively serializable, but we haven't prototyped the workaround.

**What we need to verify:**
- Can we manually serialize session workspace (checkpoints, plan.md) to JSON?
- Can imported agents start fresh without "warm-up" knowledge (acceptable per Kujan)?
- What context truncation strategy works best when agent history grows large?

**Risk:** Medium — we might lose Scribe's learning across imports, or lose conversational context during long sessions

**Action:** Include session export testing in Spike 5 (resumeSession spike)

---

### Config-Driven Customizability (Non-Programmer UX)

**Status:** Decided (config-driven, not prompt-driven)  
**Gap:** We haven't validated that JSON/YAML config can actually express everything `squad.agent.md` prompts currently do.

**What we need to verify:**
- Agent routing logic (explicit names + ambiguous fallback) fits in config structure?
- Model tier selection (4-layer priority) can be config-expressed?
- Casting policy (diegetic, thematic, structural overflow) can be codified?
- Skill confidence levels fit the config model?

**Risk:** High UX regression — if config can't express routing/casting, users lose visibility into agent logic

**Action:** Before M0, audit `squad.agent.md` (32KB) and list what MUST stay in TypeScript vs. what can move to config. Spike 6 (future): prototype config schema for one complex feature (routing OR casting).

---

### Tool Availability Control Without SDK Bindings

**Status:** Known limitation (Kujan's analysis § Tool Availability Control)  
**Gap:** We know SDK doesn't support per-agent tool filtering; workaround is prompt-level routing or custom handler logic.

**What we need to verify:**
- Prompt-level tool routing (agent prompt says "use tool X") actually prevents wrong tools from being called?
- Custom handler logic in `onPreToolUse` hook can effectively block/redirect tools without user experience breakage?
- Tool namespacing (e.g., `squad-agent1:tool_name`) survives export/import round-trip?

**Risk:** Medium — if tool routing doesn't work, agents in the same session will interfere

**Action:** Include in Spike 2 (adapter spike) — test multi-agent tool isolation

---

## 3. Integration Tests We Should Run First

### A. SDK + gh CLI Auth Handshake

**What to test:**
- `CopilotClient` can read auth from `gh` CLI without manual credential passing
- Token can be used to clone private agent repos
- Unauthenticated reads (public repos) work on fallback
- Token refresh doesn't break long-running operations

**How to test:**
- Spike 4 covers this

**Failure mode if skipped:**
- Users hit "permission denied" on import; no clear error message

---

### B. Agent Config Serialization (Export/Import)

**What to test:**
- Agent can be exported to JSON with full config (`CustomAgentConfig`)
- Exported JSON round-trips cleanly (parse → serialize → parse)
- Version mismatch detection works (if SDK version differs between export and import)
- Path separators normalize correctly (Windows backslashes ↔ POSIX forward slashes)

**How to test:**
- Spike 2 (adapter) should include a simple export test
- Export one local agent, parse JSON, import into a fresh session, verify it works

**Failure mode if skipped:**
- Marketplace import fails silently; JSON parsing errors go to logs, not user

---

### C. Tool Handler Routing (Single Session, Multiple Agents)

**What to test:**
- Two agents in one session call different tools without crosstalk
- Tool invocation includes sessionId so we can route to the correct agent
- `onPreToolUse` hook fires before each tool invocation, can access sessionId
- Tool result flows back to the correct agent

**How to test:**
- Spike 2 (adapter) should cover this
- Create adapter, spawn 2 agents in one session, have each call a different tool

**Failure mode if skipped:**
- Agents interfere; wrong agent gets wrong tool result

---

### D. MCP Server Discovery + Fallback

**What to test:**
- MCP server definition (via `mcpServers` config) is passed to SDK correctly
- MCP tools appear in agent's available tools
- If MCP server is offline, agent doesn't crash (graceful degradation per decision Q25)

**How to test:**
- Spike 3 (MCP passthrough) covers MCP server binding
- Add a test for offline MCP server: configure MCP server URL that doesn't exist, send message, verify graceful error

**Failure mode if skipped:**
- Imported agent with MCP dependency fails hard if MCP server unreachable

---

### E. Windows Path Handling

**What to test:**
- Exported JSON uses forward slashes (POSIX standard)
- Windows filesystem operations use `path.resolve()` (auto-converts slashes)
- Import on Windows doesn't break when reading paths from JSON

**How to test:**
- Spike 2 should include a basic path serialization test
- Verify on Windows: export → file write → parse → read → use paths

**Failure mode if skipped:**
- Export works on Mac; import fails on Windows with "file not found"

---

## 4. What's Safe to Start Without Spikes

These have **HIGH confidence** (either proven in current Squad, or clearly documented in SDK):

✅ **Agent routing logic (explicit + ambiguous)**
- Current implementation in `squad.agent.md` works; moving to TypeScript is straightforward
- Config-driven routing rules are simple to express

✅ **Agent spawning via task tool**
- SDK has `createSession()` API; well-documented
- We can wrap this in a spawn function immediately

✅ **PII/email policy enforcement**
- Current hooks in `squad.agent.md` are simple guards
- SDK's `onPreToolUse` hook can replicate this 1:1

✅ **Casting universe selection + scoring**
- Current implementation is deterministic (no randomness)
- Move to TypeScript typing without risk

✅ **Agent history persistence**
- Filesystem-based; no SDK dependency
- Just read/write `.squad/agents/{name}/history.md`

✅ **CLI scaffold structure (init)**
- Current templates are boilerplate files
- TypeScript can copy them as strings or load from filesystem

✅ **Directory conventions (.squad/, agents/, decisions/, etc.)**
- Decisions already finalized
- No SDK interaction; just filesystem paths

---

## 5. Recommended Spike Plan

**Run in this order** (parallelize Spikes 2+3 if possible):

| # | Spike | Dependencies | Est. Time | Owner | Blocker For |
|---|-------|--------------|-----------|-------|------------|
| 1 | Concurrent sessions + shared client | None (foundational) | 2h | SDK expert | All M0 agent spawning |
| 2 | Adapter pattern + tool routing | Spike 1 complete | 3h | SDK expert | M0 coordinator boot |
| 3 | MCP passthrough + namespacing | Spike 2 complete | 2h | SDK expert | M2 marketplace (can defer) |
| 4 | gh auth + import/export | Spike 2 complete | 1.5h | Toolkit expert | M0 init, M2 marketplace |
| 5 | resumeSession for Ralph | Spike 1 complete | 2h | Ralph owner / SDK expert | M1 Ralph heartbeat (can defer) |

**Total time:** ~10.5 hours (~1.3 days). Run Spike 1 alone, then parallelize 2+3+4, then Spike 5.

**Success criteria:**
- Spike 1: CopilotClient shared, 3 concurrent sessions complete without crosstalk ✅
- Spike 2: Adapter created, single agent + tool routing works ✅
- Spike 3: MCP tool invokes correctly; namespaced tool in prompt works ✅
- Spike 4: gh auth reads token; export/import round-trip succeeds ✅
- Spike 5: Session resumes with checkpoints; tool handlers work in resumed session ✅

**Deliverables from spikes:**
1. `test-concurrent-sessions.ts` (keep for regression testing)
2. `src/coordinator/adapter.ts` (starting code for M0 coordinator)
3. `test-mcp-passthrough.ts` (reference for MCP binding)
4. `test-gh-auth.ts` (keep for CI/regression)
5. `test-resume-session.ts` (reference for Ralph spike later)

---

## 6. Risk Mitigation Strategies

### If Spike 1 Fails (Concurrent Sessions Don't Work)

**Mitigation:** Move to session pool pattern (one client per concurrent agent, pooled).
- Impact: Bundle size grows slightly; memory overhead increases
- Timeline: +3 days to refactor coordinator to use pool
- Acceptable? Yes — can still ship M0

### If Spike 2 Fails (Adapter Can't Route Tools Correctly)

**Mitigation:** Pre-allocate tool namespaces; separate sessions per agent team.
- Impact: Resource overhead; can't mix agent teams in one session
- Timeline: +5 days to redesign coordinator
- Acceptable? Maybe — might affect use cases with 50+ concurrent agents

### If Spike 3 Fails (MCP Passthrough Breaks)

**Mitigation:** Defer marketplace MCP features to v0.7 (M3); ship MVP without MCP import in M2.
- Impact: Marketplace agents without MCP support initially
- Timeline: No delay to M0/M1/M2; defer MCP marketplace to M3
- Acceptable? Yes — planned as M3 anyway per PRDs

### If Spike 4 Fails (gh Auth Doesn't Work)

**Mitigation:** Fall back to explicit GitHub token via environment variable; document requirement.
- Impact: Marketplace imports require `GH_TOKEN` env var; slightly worse UX
- Timeline: +1 day to add token validation logic
- Acceptable? Yes — still ships M0

### If Spike 5 Fails (resumeSession Doesn't Work)

**Mitigation:** Defer Ralph persistent monitoring to v0.7 (M3); use polling pattern in M1.
- Impact: Ralph re-initializes on each workflow run; lost context
- Timeline: No delay to M0/M1; Ralph redesigned for M3
- Acceptable? Yes — Ralph is PRD 8, can be iterative

---

## 7. Post-Spike Actions

**If all spikes pass:** ✅ **Green light to proceed with M0 implementation**
- Team can commit to TypeScript architecture
- Spike code becomes starting material for M0 coordinator
- Spike tests become regression suite

**If 1-2 spikes flag issues:** 🟡 **Yellow light — mitigations are cheap**
- Document mitigations in `decisions/inbox/keaton-spike-findings.md`
- Adjust timeline/scope for affected features
- Proceed with M0, defer higher-risk M2 features if needed

**If 3+ spikes fail:** 🔴 **Red light — reconsider architecture**
- Likely SDK limitations are more severe than expected
- May need to defer SDK replatform or choose different SDK
- Escalate to Brady for strategic decision

---

## 8. Questions Resolved by This Assessment

### Q: "Do we have enough information to start M0?"

**Answer:** Not quite. We have 95% of the architectural decisions. We're missing validation on:
- How SDK concurrency actually works (Spike 1)
- How adapter pattern maps Squad's config model to SDK's session model (Spike 2)
- Whether MCP and auth work as documented (Spikes 3-4)

These are **assumptions, not unknowns**. Run the spikes to convert assumptions to facts.

---

### Q: "What's the highest-risk assumption we're making?"

**Answer:** That multiple concurrent agent sessions can share a single CopilotClient without SDK state collision. (Spike 1)

If this fails, the entire session pooling / parallel agent architecture needs rework. It's foundational.

---

### Q: "Can we start some M0 work while spikes run?"

**Answer:** Yes — **low-risk tracks:**
- CLI scaffold (init, upgrade, basic commands) — no SDK interaction
- Agent registry + config schema (JSON structures) — no SDK yet
- Casting system (TypeScript logic) — can be built standalone
- Tests + CI setup — no SDK yet

**Blocked tracks:**
- Coordinator bootstrap — needs Spike 1 + 2
- Ralph heartbeat — needs Spike 5
- Marketplace import — needs Spike 4
- MCP integration — needs Spike 3

---

### Q: "Should we run spikes in parallel or serial?"

**Answer:** Serial for Spike 1 (foundational), then parallelize Spikes 2+3+4 (they only depend on Spike 1 results). Spike 5 can run in parallel with 2+3+4.

Estimated time: **1.3 days (10-11 hours)** if run with parallelization.

---

## 9. Definition of Done

This assessment is **ready to present to Brady** when:

✅ All spike plans are concrete (code outlines, test scenarios documented)  
✅ Success criteria are measurable (pass/fail tests, not subjective)  
✅ Risk mitigation strategies are documented (what if Spike X fails?)  
✅ Timeline is realistic (1.3 days, not 1 week)  
✅ M0 startup plan is clear (which work can start, which is blocked)

This document fulfills all of these.

---

## 10. Appendix: Spike Implementation Checklists

### Spike 1 Checklist: Concurrent Sessions

```
□ Create src/test/spike-concurrent-sessions.ts
□ Import CopilotClient, create one instance
□ Spawn 3 sessions: session1, session2, session3 = await client.createSession()
□ Define a simple test tool (echo_tool: returns input as-is)
□ Register tool on session (add to all 3 sessions)
□ Send different prompts to each: "Say hello", "Say world", "Say test"
□ Each prompt should trigger echo_tool
□ Verify: all 3 sessions complete; tool results don't cross-talk
□ Measure: memory before/after, check for leaks
□ Document: CopilotClient remains singleton throughout
□ Output: test-concurrent-sessions.ts passes
```

### Spike 2 Checklist: Adapter Pattern

```
□ Create src/coordinator/adapter.ts (stub)
□ Load one local agent from .squad/agents/{name}/
□ Convert agent charter → CustomAgentConfig
□ Create session with that config
□ Send message: "What's your charter?"
□ Verify: agent responds with charter content (proves config worked)
□ Add echo_tool; agent sends message that invokes echo_tool
□ Verify: tool handler fires, receives toolName + arguments
□ In handler, log invocation details; prove we can route by sessionId
□ Create second agent, spawn in same session
□ Send "second agent: invoke echo_tool"
□ Verify: correct agent gets tool result
□ Test hooks: add onPreToolUse, onPostToolUse, verify they fire in order
□ Output: src/coordinator/adapter.ts + test-adapter.ts passes
```

### Spike 3 Checklist: MCP Passthrough

```
□ Start local MCP server (stdio-based, simple echo tool)
□ Add MCPServerConfig to agent config (command + args + tools list)
□ Create session with agent + MCP server
□ Send message that references the MCP tool
□ Verify: tool invokes, result flows back
□ Rename tool to "squad-agent1:mcp_echo"
□ Update agent prompt to use namespaced name
□ Send message; verify namespaced tool works
□ Create second agent with different MCP tool
□ Both agents in one session, each calls their tool
□ Verify: no collision, each gets correct result
□ Test offline MCP: configure URL that doesn't exist, send message
□ Verify: graceful error (not crash), user gets helpful message
□ Output: test-mcp-passthrough.ts passes
```

### Spike 4 Checklist: gh Auth + Export/Import

```
□ Set GH_TOKEN=$(gh auth token)
□ Create CopilotClient with useLoggedInUser: true
□ Attempt to clone a public GitHub repo (simulate agent import)
□ Verify: clone succeeds without explicit githubToken
□ Attempt to clone a private GitHub repo
□ Verify: private clone succeeds
□ Create an agent locally
□ Export to JSON: agent → CustomAgentConfig → JSON string
□ Parse JSON back; verify round-trip clean
□ Create a second session, import from JSON, send message
□ Verify: imported agent works (same behavior as original)
□ Check: exported JSON uses forward slashes for paths
□ Output: test-gh-auth.ts + test-export-import.ts pass
```

### Spike 5 Checklist: resumeSession

```
□ Create session with infinite: true (enables workspace)
□ Send message: "Hello, I'm Agent Alice"
□ Verify: session.workspacePath exists, checkpoints/ created
□ Call client.resumeSession(sessionId) with that sessionId
□ Verify: session resumes, workspacePath restored
□ Send message: "Do you remember my name?"
□ Verify: agent references "Alice" (context preserved)
□ Add tool; resumed session can still invoke it
□ Verify: tool handler fires correctly
□ Export workspace snapshot (checkpoints) to JSON (for Scribe use case)
□ Output: test-resume-session.ts passes
```

---

## References

- **Architectural Decisions:** `.ai-team/docs/architectural-decisions.md` (27 decisions, Q1–Q46)
- **Open Questions (Resolved):** `.ai-team/docs/open-questions.md`
- **SDK Constraints:** `.ai-team/docs/import-export-sdk-constraints.md` (Kujan, comprehensive)
- **Feature Comparison:** `.ai-team/docs/feature-comparison.md` (62-feature inventory)
- **Feature Risk:** `.ai-team/docs/feature-risk-punchlist.md` (14 GRAVE, 12 AT RISK)
- **SDK Types:** `C:\src\copilot-sdk\nodejs\src\types.ts`
- **SDK Client:** `C:\src\copilot-sdk\nodejs\src\client.ts`
- **SDK Session:** `C:\src\copilot-sdk\nodejs\src\session.ts`
- **Squad Stubs:** `C:\src\squad-sdk\src\`

---

**Next Step:** Present this assessment to Brady. If Brady approves, assign spike work and begin parallel execution. Target: **spikes complete within 2 days, M0 implementation green-light by EOD Feb 23.**
