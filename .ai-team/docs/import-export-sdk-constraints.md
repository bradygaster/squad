# SDK Session Model & Import/Export Constraints

**Author:** Kujan  
**Date:** 2026-02-21  
**Status:** Analysis for Brady review  
**Target:** Customer-facing SDK limitations that expose gaps in portable agent ecosystems

---

## Overview

This document maps Copilot SDK capabilities and constraints against Squad's portable agent architecture. The goal is to identify platform-level gaps where agents/skills could fail silently during import/export workflows, and where SDK behavior differs from Squad's serialization model.

**Key Finding:** SDK supports agent portability at the code/config level (CustomAgentConfig), but session state, tool registration, and authentication layer create practical friction that customers will experience. Squad's filesystem-centric approach is more resilient than SDK's session-scoped model.

---

## 1. SDK Session Model Implications

### Session-Bound vs. Portable State

**SDK Architecture:**
- Each `CopilotSession` is ephemeral (created, used, destroyed within a single context)
- Session state lives in `~/.copilot/session-state/{sessionId}/` when infinite sessions enabled
- Session metadata includes `workspacePath`, `startTime`, `modifiedTime`, context (cwd, gitRoot, branch)
- Sessions are **NOT serializable** — no `toJSON()` or export mechanism
- Session config is separate from session instance: config is passed at creation, state evolves during use

**Portability Impact:**
- ✅ **Agent prompt configs ARE portable:** `CustomAgentConfig` = {name, displayName, description, prompt, tools[], mcpServers}
- ❌ **Session state is NOT portable:** conversation history, workspace checkpoints, model affinity learned during session
- ❌ **Tool registration is session-scoped:** tools bound to `SessionConfig.tools[]` at creation time, cannot be added/removed mid-session
- ⚠️ **MCP server config is portable but not replicable:** Squad can export `CustomAgentConfig.mcpServers` definition, but whether an imported agent's MCP servers connect successfully depends on target environment (local server availability, network access, auth)

**Constraint for Squad:**
- Exporting `agent.charter + agent.prompt` is fine; exporting learned session optimizations (model affinity, tool preference stats, conversation context) requires custom instrumentation
- Import process cannot restore "warm" session state — imported agents start cold
- MCP servers must be validated post-import; cannot assume imported agent's MCP config will work in new environment

### CustomAgentConfig Portability

**SDK Definition (from types.ts):**
```typescript
interface CustomAgentConfig {
    name: string;                           // portable
    displayName?: string;                   // portable
    description?: string;                   // portable
    tools?: string[] | null;                // portable (tool names)
    prompt: string;                         // portable
    mcpServers?: Record<string, MCPServerConfig>;  // conditionally portable
    infer?: boolean;                        // portable
}
```

**Constraints:**
- `prompt` field is **100% portable** — plain text, no session references
- `tools[]` is portable **IFF** tools exist in target environment (name match required)
- `mcpServers` are portable **IF** server configs are environment-independent:
  - ✅ Local stdio MCP: `command`, `args`, `env` all portable *if absolute paths normalize*
  - ⚠️ Remote HTTP MCP: URL may be environment-specific (localhost:8000 won't work in cloud)
  - ❌ No portability mechanism for auth credentials in MCP config — if MCP server requires API key, it must already be set up in target environment
- `name` field is **non-portable across major SDK versions** (if CustomAgentConfig schema changes)

**Constraint for Squad:**
- Squad should validate MCP server portability on export (warn if HTTP URL is localhost)
- Tool name collisions: if squad-core defines tool `foo` and imported agent also defines tool `foo`, SDK takes first match (unclear precedence — check via `availableTools` filtering)
- No mechanism to version-pin agent config to SDK version (agent.md files contain no schema version marker)

---

## 2. SDK Tool Registration & Conflicts

### Tool Definition Model

**How SDK Handles Tools:**

1. **Session-level registration:** Tools passed via `SessionConfig.tools[]` at creation
2. **Tool scope:** Session-wide; all agents/models in session see all registered tools
3. **Tool availability control:**
   - `availableTools?: string[]` = allowlist (takes precedence)
   - `excludedTools?: string[]` = blocklist (ignored if availableTools set)
   - **No per-agent tool filtering** — must control at session level or via prompt

**Tool Handler Invocation:**
- Handler signature: `(args: TArgs, invocation: {sessionId, toolCallId, toolName}) => Promise<ToolResult>`
- Handler **cannot determine which agent called it** — only sessionId is available
- This means Squad's per-agent tool routing must be implemented in **handler logic**, not SDK infrastructure

### Imported Agent Tool Conflicts

**Scenario:** Squad exports Agent A with tool `query_knowledgebase`. Importing project has existing Agent B that also defines `query_knowledgebase` with different semantics.

**SDK Behavior:**
- No built-in conflict detection — first registration wins (by insertion order)
- Tool name is the **only lookup key** — no namespacing (no `squad:query_knowledgebase`)
- If both agents called via `task` tool, both would invoke the **same handler**

**Constraint for Squad:**
- Must implement tool namespace prefixing at export/import time: `squad-{agent-name}:{tool-name}`
- Update imported agent's `prompt` field to reference namespaced tool names
- Risk: if imported agent prompt says "use query_knowledgebase" but tool is registered as "squad-imported:query_knowledgebase", agent will error

### Custom Tool Definitions Portability

**SDK `Tool` Type:**
```typescript
interface Tool<TArgs = unknown> {
    name: string;
    description?: string;
    parameters?: ZodSchema<TArgs> | Record<string, unknown>;
    handler: ToolHandler<TArgs>;
}
```

**Portability Status:**
- ❌ `handler` is a **function** — cannot serialize
- ✅ `name`, `description`, `parameters` (JSON schema) are portable
- ❌ **Tool cannot be exported** — only agent prompts that reference tools can be exported; tool implementations must exist in target environment

**Constraint for Squad:**
- Tools are environment-specific — exported agent configs are tool references, not tool definitions
- Importing agent into project without required tools will cause agent to fail at runtime when tool is invoked
- Must document tool dependencies in agent metadata; provide tool installation script

### MCP Server Configs Portability

**SDK `MCPServerConfig` Type:**
```typescript
type MCPServerConfig = 
  | MCPLocalServerConfig {
      type?: "local" | "stdio";
      command: string;
      args: string[];
      env?: Record<string, string>;
      cwd?: string;
      tools: string[];  // include-list only
    }
  | MCPRemoteServerConfig {
      type: "http" | "sse";
      url: string;
      headers?: Record<string, string>;
      tools: string[];
    }
```

**Portability Constraints:**

| Aspect | Status | Notes |
|--------|--------|-------|
| **Local stdio** | ⚠️ Conditional | `command` + `args` portable if: (1) absolute paths work in target, (2) command is in PATH, (3) `env` vars resolve same way |
| **Remote HTTP** | ❌ Usually not | URL embedded in config; localhost/IP:port not portable across environments |
| **Tool filtering** | ✅ Yes | `tools: ["*"]` vs `tools: ["specific_tool"]` both portable |
| **Auth headers** | ❌ No | Headers with API keys/tokens are hardcoded — security risk on export |
| **Timeout** | ✅ Yes | `timeout?: number` is portable |

**Constraint for Squad:**
- Cannot safely export MCP server configs with embedded credentials
- Must validate MCP server availability post-import (probe with simple tool call; fail gracefully if server offline)
- Document that HTTP-based MCP servers require manual setup in target environment

---

## 3. Authentication Flow for Registries

### GitHub Token Requirements

**SDK Authentication Priority** (from docs):
1. Explicit `githubToken` option
2. HMAC key (`COPILOT_HMAC_KEY`)
3. Direct API token (`GITHUB_COPILOT_API_TOKEN` + `COPILOT_API_URL`)
4. Environment vars (`COPILOT_GITHUB_TOKEN` → `GH_TOKEN` → `GITHUB_TOKEN`)
5. Stored OAuth creds (`~/.copilot/auth`)
6. `gh` CLI auth

**For Reading Public Repos (Registry Catalog):**
- GitHub API supports **unauthenticated reads** (5,000 reqs/hour REST, reduced rate)
- SDK default: `useLoggedInUser: true` attempts OAuth first, falls back to unauthenticated
- Public agent registries can be cloned without auth, but metadata fetch may hit rate limits

**For Reading Private Repos:**
- **Requires authentication** — token must have at least `repo:read` scope
- OAuth tokens from GitHub Apps require explicit repo approval
- Fine-grained PATs can scope to specific repos (`repository_access: selected`)

### Rate Limiting on Registry Imports

**GitHub API Rate Limits:**
- Authenticated: 5,000 req/hr (REST) + 5,000 req/hr (GraphQL)
- Unauthenticated: 60 req/hr
- Per-endpoint custom limits (e.g., search = 30 req/min)

**Squad Import/Export Scenarios:**
- **Metadata fetch (list agents):** ~5 requests per page
- **Agent download (git clone/archive):** 1 request per agent
- **Dependency resolution (if agents import skills):** N requests

**Constraint for Squad:**
- Importing 100+ agents in bulk will hit rate limits on unauthenticated sessions
- Batch imports must authenticate (set `COPILOT_GITHUB_TOKEN`)
- Implement exponential backoff + retry logic for 429 (Too Many Requests)

### Token Expiry During Import

**Failure Mode:**
1. User starts large import with valid token
2. Token expires mid-operation (e.g., session-scoped OAuth token, 8-hour lifetime)
3. Some agents imported, others fail
4. **No atomic guarantees** — partial import left in unknown state

**SDK Behavior:**
- SDK will error on tool invocation, not at session creation
- No proactive token validation — `CopilotClient.start()` doesn't check auth
- Token used per-request; refresh happens implicitly if handler needed

**Constraint for Squad:**
- Implement pre-flight token validation before bulk import
- Validate token scopes: must have `repo` (private) or public access
- Catch auth errors mid-import and provide rollback path (archive imported partial state)
- For long-running imports (>1h), document token refresh requirements

---

## 4. Versioning Constraints

### SDK Version Interactions

**Current State:**
- Copilot SDK has **protocol version** (tracked in `sdk-protocol-version.json`)
- `CustomAgentConfig` schema defined in `types.ts` — no schema versioning marker
- SDK is "Technical Preview" — breaking changes expected

**Scenario: Version Mismatch**
1. Agent A built on SDK v0.1.x with `CustomAgentConfig` containing field X
2. Consumer project has SDK v0.2.x where field X was removed
3. Agent import attempts to pass config with unknown field
4. **Unknown field is typically silently ignored** (JSON schema validation is permissive)

**Constraint for Squad:**
- No built-in version pinning for agent configs
- Squad export should record SDK version: `manifest.sdk_version: "0.1.4"`
- Import validation should warn if versions differ: "Agent built on SDK 0.1.4, you have 0.2.1"
- If major version differs, require explicit override flag

### Breaking Changes in CustomAgentConfig Schema

**Historical Changes (hypothetical):**
- v0.1.x: `{name, prompt, tools, mcpServers}`
- v0.2.x: Added `infer` field (default true)
- v0.3.x: Changed `mcpServers` structure (new auth field)
- v1.0.x: Removed `tools` field (use hooks instead)

**Adapter Pattern Requirement:**

Squad must implement schema translation layer:
```
Exported agent.json (v0.1 schema)
    ↓
Normalize to canonical form
    ↓
Check target SDK version
    ↓
Transform to v0.2/v0.3/v1.0 as needed
    ↓
Import into target environment
```

**Constraint for Squad:**
- Maintain backward-compatible schema converters for ≥2 major SDK versions
- After N versions, deprecate old schema (require manual upgrade)
- Test imports with both old and new SDK versions in CI

### Handling Tool/MCP Server Deprecation

**Scenario:** Imported agent references tool that SDK removed in v0.3.x

**SDK Behavior:**
- Tool handler not found → runtime error when agent tries to use it
- No validation at agent definition time

**Constraint for Squad:**
- Post-import validation: extract tool names from agent prompt, verify existence
- Provide "tool compatibility report" on import: "Agent references 5 tools: 4 found, 1 missing"
- Fall back to prompt-level tool simulation if tool is common (e.g., provide stub tool that returns "tool not available in this version")

---

## 5. Platform-Specific Limitations

### File Size & Path Constraints

**Agent Definition Size:**

- SDK has no documented limit on `CustomAgentConfig.prompt` field
- Copilot CLI protocol (JSON-RPC) typically supports ~100MB messages
- **Practical limit:** Agent prompts >100KB start causing latency issues (parsing, model context pressure)

**Squad Impact:**
- Agent charters (imported as `prompt`) typically 5-50KB
- Agent history (appended for context) can grow unbounded
- Export manifest can exceed 10MB with large team (100 agents × 50KB each = 5MB)
- **Constraint:** Warn on export if manifest >5MB; implement history truncation (keep last 500 lines)

**Path Separator Issues:**

- Squad's export process writes JSON with file paths: `"casting/registry.json"`
- Import assumes POSIX-style paths (forward slashes)
- **On Windows:** `fs.readFileSync(path)` auto-converts slashes, but JSON comparison may fail
- Exported paths must be normalized: always use forward slashes in JSON, normalize on read

**Constraint for Squad:**
- Normalize all exported paths to forward slashes: `path.sep === '/' ? path : path.replace(/\\/g, '/')`
- On import, normalize to OS-native format: `path.resolve(path)` auto-converts
- Store paths in manifest as POSIX (forward slashes) for cross-platform portability

### Character Encoding Issues

**SDK Constraint:**
- CLI and SDK expect UTF-8 encoding for all text
- Agent prompts with non-UTF8 characters will corrupt during transmission

**Squad Impact:**
- Agent charters may contain Markdown with special Unicode (emoji, arrows, etc.)
- JSON export must be valid UTF-8 with proper escaping

**Constraint for Squad:**
- Validate exported JSON as valid UTF-8 before writing
- On import, enforce UTF-8 parsing: `JSON.parse(fs.readFileSync(path, 'utf8'))`
- If agent history contains binary data (logs), store base64-encoded
- Test with non-ASCII: emoji, CJK characters, right-to-left text

### Git LFS Considerations

**Scenario:** Agent history files are large (>100MB team memory), or agent definitions include binary assets (diagrams, code samples).

**Git Behavior:**
- Git LFS tracks large files separately (not in git history)
- Cloning without LFS installed misses binary files (~300 bytes pointer files)
- Export/import of LFS-backed files breaks if target doesn't have LFS

**Squad Impact:**
- `.ai-team/` is gitignored on main (per decision), so LFS not typically needed
- But if customers customize export to include team history in git, they may hit LFS issues
- Imported squads on new machine may fail if binary assets not fetched via LFS

**Constraint for Squad:**
- Document that exported squads are **not git-backed** (they're JSON files)
- If customers commit imported `.ai-team/` to git, remind them to install LFS for large files
- Export manifest should NOT include binary assets; store as file references only

### Cross-Platform Path Separators

**Already covered above** but explicit constraint:
- Windows: `C:\src\squad` (backslashes)
- Unix: `/home/user/squad` (forward slashes)
- JSON should always use forward slashes; fs operations normalize on read

---

## 6. Where SDK Helps vs. Where Squad is on Its Own

### SDK Provides (Leverage These)

✅ **CopilotClient session lifecycle**
- Session creation, resumption, event streaming
- No need for Squad to implement session management

✅ **CustomAgentConfig as portable agent spec**
- Squad can use this directly as export format for agent definitions
- MCP server config bundled in SDK (no custom serialization needed)

✅ **Event-based tool invocation**
- SDK's tool handler + hooks system replaces Squad's manual prompt adherence
- `onPreToolUse` hook enables guard rails (not just prompt-level)
- `onPostToolUse` hook enables result transformation

✅ **Infinite sessions + context compaction**
- Solves Proposal 007 (context pressure) automatically
- Session workspace persistence + checkpoints provided
- No custom compaction code needed

✅ **Authentication abstraction**
- SDK handles token priority, OAuth, BYOK internally
- Squad doesn't need to manage credential routing

✅ **Model capabilities query**
- `listModels()` returns vision/reasoning support, context limits dynamically
- Replaces Squad's hardcoded model list (Proposal 024a)

### Squad Must Build (SDK Doesn't Cover)

❌ **Cross-project agent portability**
- SDK has no export/import mechanism
- Squad owns the JSON manifest format, validation, migration logic

❌ **Tool namespacing / conflict resolution**
- SDK doesn't prevent tool name collisions
- Squad must implement namespace prefixing or conflict detection

❌ **MCP server validation post-import**
- SDK doesn't probe server connectivity
- Squad must validate MCP servers are reachable before agent use

❌ **Agent version pinning**
- No schema versioning in SDK
- Squad must track SDK version, implement schema adapters

❌ **Casting system** (universal agent names across projects)
- SDK has no concept of agent identity persistence
- Squad's filesystem-based casting (agent name → charter mapping) is custom

❌ **Skill definitions**
- SDK has no skill/capability abstraction
- Squad implements skills as agent learning format (SKILL.md)

❌ **Import transaction safety**
- No atomic rollback on partial import failure
- Squad must implement archive-on-conflict, cleanup on error

### SDK Makes Harder (Mitigate These)

⚠️ **Tool availability control without SDK bindings**
- Tools are session-scoped, not agent-scoped
- Squad must route tool calls via prompt or custom handler logic
- Workaround: implement tool namespacing + routing table in onPreToolUse hook

⚠️ **Session state export**
- Infinite sessions have workspace (checkpoints, plan.md) but no export format
- Squad cannot replicate learned session state across projects
- Mitigate: export only agent definitions (prompt + MCP config), reset to cold start on import

⚠️ **Per-agent model selection in SDK context**
- Session has single model, all agents use it
- Squad's per-agent model tiers (Proposal 024a) requires prompt-level routing or custom client logic
- Mitigate: coordinator selects model for session based on agent roster

⚠️ **MCP credential management**
- MCP server auth headers embedded in config
- Cannot export configs with secrets
- Mitigate: document that MCP servers must be set up independently in target; export only server references, not credentials

---

## 7. Customer Impact: Failure Modes

### Silent Failures (High Risk)

| Scenario | Root Cause | Impact | Mitigation |
|----------|-----------|--------|-----------|
| Imported agent references missing tool | Tool not in registry | Agent errors at runtime, user has no warning | Pre-import validation: parse prompt, check tool names |
| MCP server offline in target env | Network/setup issue | MCP tool calls fail, agent degrades | Post-import probe: test each MCP server with dummy call |
| Token expires mid-bulk-import | Long-running auth | Partial import, inconsistent state | Pre-flight token check, implement rollback on auth error |
| Tool name collision | Two agents define same tool | Wrong tool invoked, data corruption risk | Export with namespaced names, import with conflict detection |
| Large agent history truncated | JSON size limit | Lost knowledge, agent usefulness degraded | Validate manifest size on export, warn if >5MB |

### Recoverable Failures (Medium Risk)

| Scenario | Root Cause | Impact | Mitigation |
|----------|-----------|--------|-----------|
| SDK version mismatch | Schema incompatibility | Import succeeds but unknown fields dropped | Version validation, schema adapter layer |
| Path separator wrong on import | OS mismatch | File read fails | Normalize paths in JSON, use path.resolve() on read |
| Encoding issue (non-UTF8) | Text encoding mismatch | JSON parse error | Validate UTF-8 on export, test with diverse charsets |
| MCP server HTTP localhost URL | Environment-specific config | MCP won't connect in target | Validate URLs on export, warn about localhost |

### Non-Recoverable Failures (Low Risk)

| Scenario | Root Cause | Impact | Mitigation |
|----------|-----------|--------|-----------|
| Agent history too large for session | Context window exhausted | Session fails to initialize | Implement history truncation, context budgeting |
| SDK major version breaking change | API incompatibility | Agent definition schema invalid | Version pinning, major-version support window |

---

## Recommendations

### For SDK Usage in Squad

1. **Adopt CustomAgentConfig as portable format**
   - Agent export = `{name, displayName, description, prompt, tools[], mcpServers}`
   - Version-pin with `sdk_version` in manifest

2. **Implement tool namespacing**
   - Export tool names as `squad-{agent}:{tool}`, update prompt
   - On import, validate no collisions with existing tools
   - Provide tool install script for complex tools

3. **Validate MCP servers post-import**
   - Implement `test_mcp_server(config)` that probes connectivity
   - Document setup requirements for HTTP-based servers
   - Warn if auth credentials embedded in config

4. **Pre-flight auth validation**
   - Check token scopes before bulk import
   - Implement retry on auth errors, preserve partial state
   - Document token refresh for long operations (>1h)

5. **Version adapter layer**
   - Track SDK version in export manifest
   - Implement schema converters for ≥2 major versions
   - Warn on mismatch, require override for major version gaps

### For Customer Communication

- **No session state export:** Imported agents start cold (no warm-up knowledge)
- **Tool dependencies:** Provide compatibility matrix for tools agents need
- **Environment setup:** HTTP MCP servers, private registries require manual config
- **Rate limits:** Bulk imports should authenticate; document 5000 req/hr GitHub API limits
- **Disaster recovery:** Export includes full team state; can restore on emergency but not back-compatible across major SDK versions

---

## Appendix: SDK Constraints Matrix

| Constraint | Level | Portability | Migration Path |
|-----------|-------|-------------|-----------------|
| Session model | ARCHITECTURE | ❌ State not portable | Export configs, import fresh sessions |
| Tool handlers | FUNCTION | ❌ Functions not serializable | Export tool definitions, require target impl |
| MCP credentials | SECURITY | ❌ No safe export | Manual setup in target, reference-only export |
| Token expiry | OPERATIONAL | ⚠️ Conditional | Pre-flight validation, retry logic |
| Version mismatch | SCHEMA | ⚠️ Conditional | Schema adapters, version pinning |
| Path separators | ENCODING | ✅ Mitigable | Normalize to POSIX in JSON, resolve on import |
| Character encoding | ENCODING | ✅ Mitigable | Enforce UTF-8, validate on export |
| File size limits | OPERATIONAL | ✅ Mitigable | History truncation, context budgeting |
| Tool conflicts | DESIGN | ✅ Mitigable | Namespacing, collision detection |
| MCP availability | OPERATIONAL | ✅ Mitigable | Post-import probes, graceful degradation |

---

## References

- Copilot SDK: `@github/copilot-sdk` types.ts, session.ts, client.ts
- Copilot SDK Docs: `docs/auth/index.md`, `docs/auth/byok.md`, README.md
- Squad Export/Import: `index.js` lines 836-1029 (`export` / `import` subcommands)
- Squad History: `.ai-team/agents/kujan/history.md` (SDK analysis entries 2026-02-19 through 2026-02-20)
- Related Decisions: `decisions/inbox/kujan-sdk-analysis.md`, `kujan-feature-comparison.md`
