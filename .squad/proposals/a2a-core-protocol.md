# A2A Core Protocol — Architecture Proposal

> **Author:** Flight (Lead)
> **Issue:** #332 — Core A2A/ACP Protocol Implementation
> **Status:** Proposal (awaiting sign-off)
> **Date:** 2026-03-16

---

## 1. Problem Statement

Squads are isolated. A squad in repo A cannot query decisions from repo B, delegate work across organizational boundaries, or share research artifacts. The only cross-squad mechanism today is the export/import JSON bundle — a manual, offline, snapshot-based transfer.

The A2A (Agent-to-Agent) protocol solves this by giving each squad an HTTP endpoint that other squads can discover and call programmatically. A remote squad can ask "what did you decide about authentication?" and get a structured answer without human intermediation.

**Why now:** Brady greenlit A2A as the next major feature. Tamir filed five issues (#332–#336) forming a dependency chain. #332 is the foundation — everything else blocks on it.

**Evidence of need:**
- The distributed-mesh extension (merged March 2026) proved agent-to-agent communication is wanted but git-as-transport is too coarse for real-time queries.
- The Remote Control bridge (`squad rc`) already runs an HTTP+WebSocket server for human-to-agent communication. A2A extends this to agent-to-agent.
- Export/import (`squad export`) serializes squad state but requires manual steps — no programmatic access.

---

## 2. Proposed Architecture

### 2.1 Module Structure

```
packages/
├── squad-sdk/src/
│   ├── a2a/                      ← NEW: A2A protocol core (SDK)
│   │   ├── types.ts              # Agent Card, JSON-RPC types, capability descriptors
│   │   ├── agent-card.ts         # Agent Card generator (reads squad state → card)
│   │   ├── methods.ts            # RPC method implementations (pure logic)
│   │   ├── client.ts             # Outbound A2A client (call remote squads)
│   │   ├── schema.ts             # JSON Schema definitions for validation
│   │   └── index.ts              # Public exports barrel
│   └── ...
├── squad-cli/src/
│   ├── cli/commands/
│   │   └── serve.ts              ← NEW: `squad serve` command
│   ├── cli/a2a/                  ← NEW: A2A server (CLI-only, needs HTTP)
│   │   ├── server.ts             # HTTP server + JSON-RPC dispatcher
│   │   ├── middleware.ts         # Auth, rate limiting, request validation
│   │   └── index.ts              # Barrel
│   └── ...
```

**Rationale for the split:**

| Component | Package | Why |
|-----------|---------|-----|
| Types, Agent Card, RPC logic | `squad-sdk` | SDK users can generate Agent Cards and call remote squads without the CLI. The card generator needs access to config/agents/skills/decisions parsers that already live in the SDK. |
| Outbound A2A client | `squad-sdk` | Programmatic consumers (CI scripts, Copilot Extensions) need to call remote squads. This is a library concern, not a CLI concern. |
| HTTP server, middleware | `squad-cli` | HTTP server is a runtime process — it belongs in the CLI. The SDK stays a library with zero server-side runtime. |
| `squad serve` command | `squad-cli` | CLI command wiring follows existing patterns (cli-entry.ts routing). |

This follows the established boundary: SDK = logic + types, CLI = runtime + commands. Same pattern as `sharing/export.ts` (SDK) vs `commands/export.ts` (CLI).

### 2.2 Layer Diagram

```
┌─────────────────────────────────────────────────┐
│  Remote Squad (A2A Client)                      │
│  POST /a2a/rpc  { "method": "squad.query..." }  │
└──────────────────┬──────────────────────────────┘
                   │ HTTP/1.1 (JSON-RPC 2.0)
                   ▼
┌─────────────────────────────────────────────────┐
│  squad-cli / a2a / server.ts                    │
│  ┌───────────────────────────────────────────┐  │
│  │ Middleware: auth → rate-limit → validate   │  │
│  └───────────────┬───────────────────────────┘  │
│                  ▼                               │
│  ┌───────────────────────────────────────────┐  │
│  │ JSON-RPC Dispatcher                        │  │
│  │  squad.queryDecisions → methods.ts         │  │
│  │  squad.delegateTask   → methods.ts         │  │
│  │  squad.shareResearch  → methods.ts         │  │
│  └───────────────┬───────────────────────────┘  │
│                  ▼                               │
│  ┌───────────────────────────────────────────┐  │
│  │ squad-sdk / a2a / methods.ts               │  │
│  │  Reads: .squad/decisions.md                │  │
│  │  Reads: .squad/agents/*/charter.md         │  │
│  │  Reads: .squad/skills/*/SKILL.md           │  │
│  │  Calls: gh CLI (issue creation)            │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 3. Technology Choices

### 3.1 HTTP Server: `node:http` (recommended)

**Recommendation:** Use Node.js built-in `http.createServer` — same as RemoteBridge.

**Alternatives considered:**

| Option | Size | Pros | Cons |
|--------|------|------|------|
| `node:http` | 0 KB (built-in) | Zero deps, matches RemoteBridge pattern, full control | Manual routing, no middleware chain |
| Express | ~200 KB + deps | Familiar, middleware ecosystem | New dependency, overkill for 3 routes, contradicts zero-dep scaffolding decision |
| Fastify | ~350 KB + deps | Fast, schema validation built-in | New dependency, more than we need |
| Hono | ~30 KB | Lightweight, modern | New unfamiliar dependency |

**Decision rationale:**
1. RemoteBridge already proves `node:http` works for this project — rate limiting, auth, static serving, all done inline.
2. We have exactly 3 routes (`POST /a2a/rpc`, `GET /a2a/card`, `GET /a2a/health`). A framework is overhead.
3. The zero-dependency scaffolding decision (decisions.md) means we resist new runtime deps.
4. `vscode-jsonrpc` is already a dependency in both packages — we can use its message types for JSON-RPC 2.0 framing.

**Pattern:** Extract the middleware patterns (rate limiting, auth check, security headers) from RemoteBridge into a shared utility. Both RemoteBridge and the A2A server use them.

### 3.2 JSON-RPC 2.0: Use `vscode-jsonrpc` types + custom dispatcher

`vscode-jsonrpc` (already in both package.json files) provides the message types (`RequestMessage`, `ResponseMessage`, `NotificationMessage`) and error codes. We don't need the full transport layer — just the type definitions and a thin dispatcher.

```typescript
// Custom dispatcher pattern (not the vscode-jsonrpc transport)
type MethodHandler = (params: unknown) => Promise<unknown>;

const methods = new Map<string, MethodHandler>();
methods.set('squad.queryDecisions', handleQueryDecisions);
methods.set('squad.delegateTask', handleDelegateTask);
methods.set('squad.shareResearch', handleShareResearch);
```

### 3.3 Protocol Versioning

Include protocol version in Agent Card and response headers:

```
X-Squad-A2A-Version: 0.1.0
```

Version format: `MAJOR.MINOR.PATCH` (semver). Breaking changes bump MAJOR. New optional fields bump MINOR.

---

## 4. Agent Card Design

### 4.1 Agent Card Schema

The Agent Card is auto-generated from squad state. Served at `GET /a2a/card` (and optionally at `/.well-known/agent-card.json` for A2A spec compatibility).

```typescript
interface SquadAgentCard {
  // A2A v0.3.0 required fields
  name: string;                    // From squad.config or team.md
  description: string;             // Team description
  url: string;                     // Base URL of this A2A server
  version: string;                 // A2A protocol version ("0.1.0")

  // A2A v0.3.0 capabilities
  capabilities: {
    methods: MethodDescriptor[];   // Available RPC methods
    streaming: boolean;            // false for Phase 1
    pushNotifications: boolean;    // false for Phase 1
  };

  // A2A v0.3.0 auth
  authentication: {
    schemes: AuthScheme[];         // ["bearer"] for MVP
    required: boolean;             // true
  };

  // Squad-specific extensions (prefixed)
  "x-squad": {
    teamSize: number;              // Count of active agents
    agents: AgentSummary[];        // Name + role (no charter content)
    skills: string[];              // Skill IDs available
    decisions: {
      count: number;               // Number of decisions
      lastUpdated: string;         // ISO 8601 timestamp
    };
    protocolVersion: string;       // Squad A2A protocol version
  };
}

interface MethodDescriptor {
  name: string;                    // e.g., "squad.queryDecisions"
  description: string;             // Human-readable purpose
  params: JsonSchemaRef;           // JSON Schema for params
  result: JsonSchemaRef;           // JSON Schema for result
}

interface AgentSummary {
  name: string;
  role: string;
  status: "active" | "inactive";
}
```

### 4.2 Mapping Squad State → Agent Card

| Agent Card Field | Source | How |
|-----------------|--------|-----|
| `name` | `squad.config.ts` → `team.name` OR `.squad/team.md` title | Config loader, fallback to markdown parser |
| `description` | `squad.config.ts` → `team.description` OR first line of team.md | Config loader |
| `url` | Runtime (bound address) | `http://127.0.0.1:{port}` |
| `x-squad.teamSize` | `.squad/agents/` directory listing | Count subdirectories with `charter.md` |
| `x-squad.agents` | `.squad/team.md` table rows | Parse markdown table (same pattern as `rc.ts`) |
| `x-squad.skills` | `.squad/skills/` directory listing | `loadSkillsFromDirectory()` → map to IDs |
| `x-squad.decisions.count` | `.squad/decisions.md` | Count `###` headings |
| `x-squad.decisions.lastUpdated` | `fs.statSync` on `decisions.md` | File mtime |
| `capabilities.methods` | Static (registered methods) | Hard-coded from method registry |

### 4.3 Generation Pattern

```typescript
// In squad-sdk/src/a2a/agent-card.ts
export function generateAgentCard(
  squadDir: string,
  serverUrl: string,
  options?: { includeAgentDetails?: boolean }
): SquadAgentCard {
  // Read squad state from filesystem
  // Return typed Agent Card
}
```

The card is generated on each `GET /a2a/card` request (not cached) to reflect current squad state. Cards are cheap to generate — just filesystem reads of files already in memory from other operations.

---

## 5. RPC Method Design

All methods use JSON-RPC 2.0 framing. Request envelope:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "squad.queryDecisions",
  "params": { ... }
}
```

### 5.1 `squad.queryDecisions`

**Purpose:** Search decisions in the local squad's `.squad/decisions.md`.

```typescript
// --- Request params ---
interface QueryDecisionsParams {
  query: string;            // Free-text search (case-insensitive substring)
  tags?: string[];          // Filter by decision author/category (optional)
  limit?: number;           // Max results (default: 10, max: 50)
  includeArchived?: boolean; // Search decisions-archive.md too (default: false)
}

// --- Response result ---
interface QueryDecisionsResult {
  decisions: DecisionMatch[];
  total: number;             // Total matches before limit
  source: string;            // Squad name (for attribution)
}

interface DecisionMatch {
  title: string;             // Decision heading text
  author: string;            // "By:" field value
  content: string;           // Full decision text (markdown)
  relevance: number;         // 0.0–1.0 match score
  section: string;           // Parent section heading
}
```

**Implementation approach:**
1. Read `.squad/decisions.md` (and optionally `decisions-archive.md`).
2. Parse into decision blocks (split on `###` headings).
3. Extract `By:` field, `What:` field, `Why:` field from each block.
4. Score by substring match on query against title + content.
5. Optionally filter by `tags` (matched against author names).
6. Sort by relevance descending, apply `limit`.

**Error codes:**
- `-32602` (Invalid params): Missing `query` field.
- `-32000` (Server error): `.squad/decisions.md` not found (squad not initialized).

### 5.2 `squad.delegateTask`

**Purpose:** A remote squad creates a GitHub issue in this squad's repo.

```typescript
// --- Request params ---
interface DelegateTaskParams {
  title: string;             // Issue title (required, max 256 chars)
  body: string;              // Issue body markdown (required, max 65536 chars)
  labels?: string[];         // Labels to apply (optional)
  assignee?: string;         // GitHub username (optional)
  priority?: "p0" | "p1" | "p2" | "p3"; // Maps to label
  sourceSquad?: string;      // Calling squad's name (for attribution)
  sourceUrl?: string;        // Calling squad's A2A URL (for callbacks)
}

// --- Response result ---
interface DelegateTaskResult {
  issueNumber: number;       // Created issue number
  issueUrl: string;          // Full GitHub URL
  repo: string;              // owner/repo
  status: "created";
}
```

**Implementation approach:**
1. Validate params (title required, length limits).
2. Prepend attribution header to body: `> 🤖 Delegated from {sourceSquad} via A2A protocol`
3. Shell out to `gh issue create --title ... --body ... --label ...`
4. Parse issue number from `gh` output.
5. Return structured result.

**Security constraints (MVP):**
- Label allowlist: only labels that already exist on the repo are accepted. Prevents label injection.
- Assignee validation: only assign if the user is a repo collaborator (or omit).
- Rate limit: max 5 issue creations per minute per client.
- Body size capped at 65536 chars (GitHub's limit).

**Error codes:**
- `-32602` (Invalid params): Missing title, body too long.
- `-32001`: `gh` CLI not available or not authenticated.
- `-32002`: GitHub API error (repo not found, permission denied).

### 5.3 `squad.shareResearch`

**Purpose:** A remote squad requests research documents (skills, proposals, specific files).

```typescript
// --- Request params ---
interface ShareResearchParams {
  type: "skill" | "decision" | "routing" | "team"; // What to share
  id?: string;               // Specific skill ID (for type="skill")
  query?: string;            // Search within type (optional)
  format?: "markdown" | "json"; // Response format (default: "markdown")
}

// --- Response result ---
interface ShareResearchResult {
  documents: ResearchDocument[];
  total: number;
  source: string;            // Squad name
}

interface ResearchDocument {
  id: string;                // Unique identifier
  title: string;             // Document title
  type: "skill" | "decision" | "routing" | "team";
  content: string;           // Full content (markdown or JSON)
  metadata: {
    lastModified: string;    // ISO 8601
    size: number;            // Bytes
  };
}
```

**Implementation approach:**

| `type` | Source | Behavior |
|--------|--------|----------|
| `skill` | `.squad/skills/{id}/SKILL.md` | If `id` specified, return that skill. If `query`, search by trigger keywords. Otherwise list all. |
| `decision` | `.squad/decisions.md` | Same as `queryDecisions` but returns full document. |
| `routing` | `.squad/routing.md` | Return routing rules (sanitized — no internal agent details beyond name/role). |
| `team` | `.squad/team.md` | Return team roster (name, role, status only — no charter content). |

**Security constraints:**
- Charter content (`.squad/agents/*/charter.md`) is NOT shared — contains internal prompts.
- History files are NOT shared — contain session-specific context.
- Only `.squad/` files explicitly listed above are accessible.
- File path traversal prevention: reject any `id` containing `..` or absolute paths.

**Error codes:**
- `-32602` (Invalid params): Unknown `type`, invalid `id`.
- `-32003`: Requested document not found.

### 5.4 Method Summary

| Method | Params | Returns | Side Effects |
|--------|--------|---------|-------------|
| `squad.queryDecisions` | query, tags?, limit? | Decision matches | None (read-only) |
| `squad.delegateTask` | title, body, labels? | Issue number + URL | Creates GitHub issue |
| `squad.shareResearch` | type, id?, query? | Research documents | None (read-only) |

---

## 6. Integration Points

### 6.1 CLI Command: `squad serve`

```
squad serve [options]

Options:
  --port <n>       Port to bind (default: 0 = random)
  --host <addr>    Bind address (default: 127.0.0.1)
  --token <t>      Bearer token (default: auto-generated UUID)
  --no-auth        Disable auth (local dev only)
  --verbose        Log all requests to stderr

Examples:
  squad serve                    # Random port, localhost only
  squad serve --port 3000        # Fixed port
  squad serve --port 3000 --verbose
```

**Wiring in cli-entry.ts:**

```typescript
if (cmd === 'serve') {
  const { runServe } = await import('./cli/commands/serve.js');
  const portIdx = args.indexOf('--port');
  const port = (portIdx !== -1 && args[portIdx + 1])
    ? parseInt(args[portIdx + 1]!, 10) : 0;
  const hostIdx = args.indexOf('--host');
  const host = (hostIdx !== -1 && args[hostIdx + 1])
    ? args[hostIdx + 1]! : '127.0.0.1';
  const tokenIdx = args.indexOf('--token');
  const token = (tokenIdx !== -1 && args[tokenIdx + 1])
    ? args[tokenIdx + 1]! : undefined;
  const noAuth = args.includes('--no-auth');
  const verbose = args.includes('--verbose');
  await runServe(process.cwd(), { port, host, token, noAuth, verbose });
  return;
}
```

**Startup output:**

```
🔌 Squad A2A server listening on http://127.0.0.1:3847
   Agent Card: http://127.0.0.1:3847/a2a/card
   RPC endpoint: http://127.0.0.1:3847/a2a/rpc
   Health: http://127.0.0.1:3847/a2a/health
   Auth: Bearer a1b2c3d4-...
   Press Ctrl+C to stop.
```

### 6.2 Server Lifecycle

```typescript
// In squad-cli/src/cli/commands/serve.ts
export async function runServe(cwd: string, options: ServeOptions): Promise<void> {
  const squadDir = detectSquadDir(cwd);
  if (!squadDir) fatal('No .squad/ directory found. Run `squad init` first.');

  const server = createA2AServer({
    squadDir,
    port: options.port,
    host: options.host,
    token: options.token ?? randomUUID(),
    auth: !options.noAuth,
    verbose: options.verbose,
  });

  const address = await server.start();
  // Print startup info...

  // Graceful shutdown
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

### 6.3 Relationship to Existing Commands

| Existing | Relationship to `squad serve` |
|----------|------------------------------|
| `squad start` | Starts Copilot + RemoteBridge (human-to-agent). Orthogonal — different server, different protocol. Could later embed A2A server in same process. |
| `squad rc` | Remote Control bridge (human-to-agent via WebSocket). Same pattern but different purpose. |
| `squad export` | Offline JSON snapshot. A2A `shareResearch` is the live equivalent. |
| `squad watch` / `squad loop` | Polling processes. `squad serve` is a long-running server. Similar lifecycle pattern (Ctrl+C to stop). |

### 6.4 No Changes to Existing Commands

`squad serve` is additive. No existing command behavior changes.

---

## 7. What Stays the Same

- **All existing CLI commands** — zero changes to init, export, import, watch, start, rc, etc.
- **SDK public API** — new `a2a/` module is additive, no breaking changes to existing exports.
- **Squad state format** — `.squad/` directory structure unchanged. A2A reads it, never writes to it (except `delegateTask` which creates GitHub issues, not local files).
- **RemoteBridge** — untouched. Future work (#334) may integrate A2A into the same server process, but that's not MVP.
- **Test suite** — existing 4,199 tests unaffected. New tests added for A2A module.
- **Package dependencies** — no new runtime dependencies. `node:http` is built-in, `vscode-jsonrpc` is already present.

---

## 8. Phase Boundaries

### Phase 1: #332 — Core Protocol (THIS PROPOSAL)

**In scope:**
- `packages/squad-sdk/src/a2a/` module (types, agent-card, methods, client, schema)
- `packages/squad-cli/src/cli/a2a/` module (server, middleware)
- `packages/squad-cli/src/cli/commands/serve.ts` command
- CLI entry point wiring for `squad serve`
- Three RPC methods: `queryDecisions`, `delegateTask`, `shareResearch`
- Agent Card generation from squad state
- Bearer token authentication (single static token)
- Localhost binding only (`127.0.0.1`)
- Unit + integration tests for all new code
- `package.json` exports for new modules

**Out of scope (deferred to later issues):**

| Feature | Deferred To | Why |
|---------|-------------|-----|
| Discovery (mDNS, file registry) | #333 | Discovery is how you find squads. #332 is how you talk to them once found. |
| `squad discover`, `squad ask` CLI commands | #334 | CLI integration depends on both #332 and #333. |
| TLS, mutual auth, API keys | #335 | Security beyond localhost is not needed for MVP. |
| Multi-repo coordination patterns | #336 | Documentation/playbook — can start anytime. |
| Streaming responses | Phase 3 | JSON-RPC 2.0 over HTTP is request/response. Streaming needs SSE or WebSocket. |
| gRPC transport | Phase 3 | HTTP/1.1 is sufficient for MVP. |
| Agent Card at `/.well-known/` path | #333 | Well-known path is a discovery convention. Serve it at `/a2a/card` for now. |
| Embedding A2A in RemoteBridge process | #334 | Optimization — run one server, not two. |

### Phase 2: #333 + #335 — Discovery + Security

- Local file registry (`~/.squad/registry.json`)
- Optional mDNS/DNS-SD broadcast
- TLS for non-localhost connections
- API key management
- `squad discover` command

### Phase 3: #334 — CLI Integration

- `squad ask <squad-name> <question>` — query remote squad from CLI
- `squad delegate <squad-name> --title "..." --body "..."` — delegate task from CLI
- Embed A2A server into `squad start` / interactive shell
- Background server mode (start with shell, stop with shell)

---

## 9. Risks and Open Questions

### Risk 1: `gh` CLI Dependency for `delegateTask`

**Risk:** `delegateTask` shells out to `gh issue create`. If `gh` is not installed or not authenticated, the method fails.
**Likelihood:** Medium — `gh` is already required by `squad watch`/`squad loop`.
**Impact:** Medium — one of three methods is unavailable.

**Mitigation:**
- Return clear error code (`-32001`) with actionable message: "gh CLI not available. Install from https://cli.github.com/"
- `squad serve --verbose` logs `gh` availability at startup.
- `GET /a2a/health` reports `gh` availability in health response.
- Future: GitHub REST API fallback using `GITHUB_TOKEN` directly (no `gh` CLI needed). Deferred.

### Risk 2: Decisions Parsing Fragility

**Risk:** `.squad/decisions.md` has no formal schema — it's free-form markdown. Parsing into structured `DecisionMatch` objects may break on non-standard formatting.
**Likelihood:** Medium — decisions.md has loose conventions but no enforced structure.
**Impact:** Low — `queryDecisions` degrades gracefully (returns full text with low relevance scores instead of structured matches).

**Mitigation:**
- Parse conservatively: split on `###` headings, extract `By:` / `What:` / `Why:` fields if present.
- If a block doesn't match the expected format, include it as a raw text match with `relevance: 0.1`.
- Add tests against this project's actual `decisions.md` as a smoke test (reading structure, not asserting agent names — Product Isolation Rule applies).

### Risk 3: Port Conflicts

**Risk:** `squad serve` on a fixed port may conflict with other services.
**Likelihood:** Low — default is random port (`:0`).
**Impact:** Low — clear error message, user picks another port.

**Mitigation:**
- Default to port 0 (OS-assigned random port).
- Print actual bound port on startup.
- `EADDRINUSE` handler with actionable message.

### Risk 4: Scope Creep into Discovery

**Risk:** Team may conflate "serving A2A" with "discovering A2A servers." These are separate concerns (#332 vs #333).
**Likelihood:** Medium — the issues are related and it's tempting to solve both.
**Impact:** Medium — delays #332 delivery.

**Mitigation:**
- This proposal explicitly excludes discovery. `squad serve` prints its URL; the user copies it manually in Phase 1.
- Phase 1 test: start server, call it with `curl`. No discovery needed.
- #333 is a separate proposal with its own architecture.

### Open Question 1: Should `squad serve` run alongside the interactive shell?

In the current proposal, `squad serve` is a standalone command. But users may want the A2A server running while using `squad` interactively. Options:

- **A) Standalone only (MVP):** `squad serve` is a separate process. User runs it in another terminal.
- **B) Embedded in shell:** The interactive shell starts the A2A server automatically. Adds complexity — the shell already manages Copilot sessions, RemoteBridge, PTY.

**Recommendation:** Option A for #332. Option B is #334 scope.

### Open Question 2: Response size limits for `shareResearch`

Sharing a full `decisions.md` (this project's is 254 KB) may be too large for a single JSON-RPC response. Options:

- **A) Pagination:** Add `offset` and `limit` params.
- **B) Truncation:** Cap at 100 KB, return `truncated: true`.
- **C) No limit:** Let HTTP handle it.

**Recommendation:** Option A (pagination). Add `offset` (default: 0) and `limit` (default: 10) to `shareResearch` params. Return `total` and `hasMore` in result. Consistent with `queryDecisions` which already has `limit`.

### Open Question 3: A2A spec compliance vs. pragmatism

The A2A v0.3.0 spec defines a full task lifecycle (SendMessage → Task → Artifact). Our methods are simpler (request/response). Should we wrap our responses in A2A Task objects?

**Recommendation:** No, not for MVP. Our methods are stateless request/response — no task lifecycle needed. We use `x-squad` extensions in the Agent Card to signal our methods. Full A2A Task compliance is a Phase 3 concern if/when we need streaming or long-running tasks.

---

## 10. Key Decisions Needed

### Decision 1: HTTP Server — `node:http` (recommended)

**Alternatives:** Express, Fastify, Hono.
**Rationale:** Zero new dependencies, matches RemoteBridge pattern, only 3 routes.
**Needs sign-off from:** EECOM (runtime owner), Brady (product direction).

### Decision 2: Module split — SDK (logic) + CLI (server)

**Alternatives:** All in CLI, all in SDK.
**Rationale:** SDK users need Agent Card generation and outbound client. HTTP server is CLI runtime.
**Needs sign-off from:** EECOM (SDK owner), CONTROL (type boundaries).

### Decision 3: Auth — Bearer token only for MVP

**Alternatives:** Mutual TLS, API keys, OAuth.
**Rationale:** Localhost-only means auth is minimal. Static bearer token is simple and sufficient. #335 adds real auth.
**Needs sign-off from:** Network (security), Brady.

### Decision 4: No new dependencies

**Alternatives:** Add Express or Fastify.
**Rationale:** Zero-dependency scaffolding decision still applies. `node:http` + `vscode-jsonrpc` covers everything.
**Needs sign-off from:** GNC (runtime standards).

### Decision 5: Charter content is NOT shared via A2A

**Alternatives:** Share charters, share redacted charters.
**Rationale:** Charters contain internal prompt engineering. Sharing them leaks squad implementation details. `shareResearch` returns name + role only.
**Needs sign-off from:** Procedures (prompt security), Brady.

---

## 11. Implementation Estimate

| Component | Effort | Dependency |
|-----------|--------|------------|
| `squad-sdk/src/a2a/types.ts` | 0.5 day | None |
| `squad-sdk/src/a2a/agent-card.ts` | 1 day | types.ts |
| `squad-sdk/src/a2a/methods.ts` | 1.5 days | types.ts |
| `squad-sdk/src/a2a/client.ts` | 1 day | types.ts |
| `squad-sdk/src/a2a/schema.ts` | 0.5 day | types.ts |
| `squad-cli/src/cli/a2a/server.ts` | 1 day | SDK a2a module |
| `squad-cli/src/cli/a2a/middleware.ts` | 0.5 day | server.ts |
| `squad-cli/src/cli/commands/serve.ts` | 0.5 day | a2a server |
| CLI entry wiring + help text | 0.5 day | serve.ts |
| Tests (unit + integration) | 2 days | All above |
| Package.json exports + build | 0.5 day | All above |
| **Total** | **~9–10 days** | 1 engineer |

---

## 12. Success Criteria

1. `squad serve` starts, prints URL, responds to Ctrl+C gracefully.
2. `curl http://127.0.0.1:{port}/a2a/card` returns valid Agent Card JSON.
3. `curl http://127.0.0.1:{port}/a2a/health` returns `{"status":"ok"}`.
4. JSON-RPC call to `squad.queryDecisions` returns matching decisions.
5. JSON-RPC call to `squad.delegateTask` creates a GitHub issue (with `gh` installed).
6. JSON-RPC call to `squad.shareResearch` returns requested documents.
7. All existing tests pass (zero regressions).
8. Works on Windows, macOS, and Linux.
9. No new runtime dependencies added.

---

## Appendix A: JSON-RPC 2.0 Request/Response Examples

### Query Decisions

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "squad.queryDecisions",
  "params": {
    "query": "ESM",
    "limit": 3
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "decisions": [
      {
        "title": "Node.js >=20, ESM-only, streaming-first",
        "author": "GNC",
        "content": "**What:** Runtime target is Node.js 20+...",
        "relevance": 0.95,
        "section": "Foundational Directives"
      }
    ],
    "total": 1,
    "source": "Squad"
  }
}
```

### Delegate Task

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "squad.delegateTask",
  "params": {
    "title": "Investigate shared auth patterns",
    "body": "Our squad needs to align on auth...",
    "labels": ["go:needs-research"],
    "sourceSquad": "Platform Squad",
    "sourceUrl": "http://127.0.0.1:4200"
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "issueNumber": 442,
    "issueUrl": "https://github.com/bradygaster/squad/issues/442",
    "repo": "bradygaster/squad",
    "status": "created"
  }
}
```

### Health Check

```json
// GET /a2a/health
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600,
  "squad": "Squad",
  "ghAvailable": true
}
```

---

## Appendix B: File Tree After Implementation

```
packages/squad-sdk/src/
  a2a/
    index.ts           # export * from './types.js'; etc.
    types.ts           # AgentCard, RPC param/result types
    agent-card.ts      # generateAgentCard(squadDir, url)
    methods.ts         # handleQueryDecisions, handleDelegateTask, handleShareResearch
    client.ts          # A2AClient class (call remote squads)
    schema.ts          # JSON Schema definitions

packages/squad-cli/src/
  cli/
    a2a/
      index.ts         # export * from './server.js';
      server.ts        # createA2AServer(), A2AServer class
      middleware.ts     # authMiddleware, rateLimiter, validateJsonRpc
    commands/
      serve.ts         # runServe() — `squad serve` implementation
  cli-entry.ts         # + route for 'serve' command

test/
  a2a/
    agent-card.test.ts
    methods.test.ts
    server.test.ts
    client.test.ts
```
