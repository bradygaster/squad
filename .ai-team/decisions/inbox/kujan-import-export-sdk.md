# Decision: SDK Import/Export Constraints Analysis

**Requester:** Brady  
**Requestor Role:** Founder / Product  
**Decision Date:** 2026-02-21  
**Status:** ANALYSIS FOR REVIEW  
**Urgency:** P2 — Informs v0.5.0+ architecture (post-v0.4.0 SDK replatform)  

---

## Request

Brady asked: "Analyze how the Copilot SDK supports or constrains the import/export of agents and skills. I need to understand platform-level limitations that could cause customers to fall through cracks."

**Specific Questions:**
1. Can an agent's SDK session config be serialized/deserialized? What's session-bound vs. portable?
2. How do imported agents bring their tools? What prevents conflicts?
3. What are the gh CLI token implications for reading public/private registries?
4. How do SHA pinning + SDK version interactions affect portability?
5. Are there platform-specific limitations (file size, encoding, paths)?
6. Where does the SDK help vs. where is Squad on its own?

---

## Findings

### TL;DR

✅ **SDK's CustomAgentConfig format is portable** (name, prompt, MCP servers).  
❌ **But SDK's session model, tool registration, and auth layer create friction** that customers will hit during import.  
⚠️ **Squad must build transaction safety, tool conflict detection, MCP validation, and version adapters** — SDK doesn't cover these.

### 1. Session Model Portability

**SDK Architecture:** Sessions are ephemeral. State lives in `~/.copilot/session-state/{sessionId}/` when infinite sessions enabled, but **there is no export mechanism**. Session config is separate from session state.

**Portable:** Agent prompts, tool definitions, MCP server configs.  
**Not Portable:** Session state (conversation history, learned preferences), tool handlers (functions can't serialize), session-scoped hooks.

**Squad Impact:** Export = agent charter + prompt. Import = cold start (no learned context). Customers expect agents to "remember" but won't see team learnings (those stay in source project).

### 2. Tool Registration & Conflicts

**SDK Design:** Tools are session-scoped (passed at `SessionConfig.tools[]`). All agents in a session see all tools. No per-agent tool filtering. No namespacing.

**Failure Mode:** Imported Agent A defines tool `query_kb`. Existing Agent B also defines `query_kb`. Both invoke the same handler → wrong tool for Agent A.

**Squad Solution:** Export tool names as `squad-{agent}:{tool}`, update agent prompt to reference namespaced names. Import validates no collisions.

**Risk Level:** MEDIUM — silent data corruption if tools silently invoked wrong handler.

### 3. Authentication & Rate Limiting

**GitHub API:** 5K req/hr authenticated, 60 req/hr unauthenticated. SDK handles token priority well (explicit token → env vars → stored OAuth).

**Constraint:** Bulk imports without auth hit rate limits. Token expiry mid-import (e.g., OAuth session expires) leaves partial state with no rollback.

**Squad Solution:** Pre-flight token validation. Implement retry + exponential backoff for 429. Archive on conflict so partial import can be recovered.

### 4. Versioning & Breaking Changes

**SDK Status:** Technical Preview. CustomAgentConfig schema has no version marker. Breaking changes expected (no SemVer guarantee yet).

**Scenario:** Agent built on SDK v0.1.x, consumer has v0.2.x with schema changes. Unknown fields silently dropped.

**Squad Solution:** Record `sdk_version` in export manifest. Implement schema adapters for ≥2 major versions. Warn on mismatch.

### 5. Platform Constraints

**File Size:** Agent prompts >100KB cause latency. Export manifest >5MB may exceed JSON protocol limits.  
**Paths:** Windows backslashes vs. Unix forward slashes. Normalize JSON to POSIX (forward slashes), resolve on import.  
**Encoding:** Non-UTF8 in agent history breaks JSON parsing. Validate UTF-8 on export.  
**MCP Servers:** HTTP localhost URLs not portable across environments. Embedded auth credentials are security risk. Must validate post-import.

---

## Recommendations (for Brady Review)

### Immediate (v0.4.0 SDK replatform prep)

1. **Version-pin export manifests:** Add `sdk_version` field. Warn on import mismatch.
2. **Implement tool namespacing:** Export as `squad-{agent}:{tool}`. Update prompt references. Validate collisions on import.
3. **Pre-flight auth validation:** Check token scopes + test connectivity before bulk import. Implement rollback on auth failure.
4. **Path normalization:** JSON exports use forward slashes. `path.resolve()` on import auto-converts to OS native.

### Medium-term (v0.5.0+)

5. **MCP server validation:** Implement `test_mcp_server()` that probes connectivity post-import. Warn if localhost URL or embedded credentials.
6. **Schema adapter layer:** Support import of agents from SDK v0.1, v0.2 into v0.3+ environments. Maintain converters for ≥2 major versions.
7. **History truncation:** Warn on export if >5MB. Implement configurable history depth (keep last N lines) to control manifest size.
8. **Tool conflict detection:** Export includes tool definitions. Import checks for collisions, suggests namespacing or upgrade path.

### Messaging to Customers

- **No session state migration:** Imported agents start cold. Team learnings stay in source project.
- **Tool dependencies:** Provide compatibility matrix. Document which tools each agent needs.
- **Manual MCP setup:** HTTP-based MCP servers require environment-specific config. Export only references, not credentials.
- **Rate limits:** Bulk imports (100+ agents) require authentication. Document GitHub API limits.
- **Version windows:** Agents stay portable within ±1 major SDK version. Crossing major versions requires adapter.

---

## Decision Points for Brady

**Does Squad commit to tool namespacing in export?** (impacts import complexity, agent prompt modifications)  
**How many SDK major versions should Squad support simultaneously?** (v0.1 agents in v0.3 environment: support or require upgrade?)  
**Should import be transaction-safe (atomic)?** Or acceptable to leave partial state on failure?  
**For MCP servers:** Reference-only export (user must set up), or attempt to auto-provision known server types?

---

## Output Location

`.ai-team/docs/import-export-sdk-constraints.md` — 7 sections (session model, tools, auth, versioning, platform constraints, SDK help/build, customer impact matrix) + recommendations + appendix.

---

## References

- Copilot SDK: types.ts (CustomAgentConfig, SessionConfig, Tool, MCP definitions)
- Squad Export/Import: index.js lines 836-1029
- Auth Docs: docs/auth/index.md (token priority, rate limits)
- Related: kujan-sdk-analysis.md, kujan-feature-comparison.md (prior SDK replatform work)
