# Squad 2.0 Overview

> **Canonical Published Docs:** For the full architectural reference and multi-host guides on the published Astro documentation site, see [Squad 2.0 Architecture](src/content/docs/concepts/squad-2-0-architecture.md), [Using Squad Across Clients](src/content/docs/scenarios/using-squad-across-clients.md), and the [SDK Reference](src/content/docs/reference/sdk.md).

Squad 2.0 decouples the client host, the conversation backend, and the execution harness so the same `.squad/` team works natively across all **7 supported hosts**:

- **GitHub Copilot** (`copilot`)
- **Claude Code** (`claude`)
- **Kiro** (`kiro`)
- **OpenCode** (`opencode`)
- **Cursor** (`cursor`)
- **OpenAI Codex** (`codex`)
- **Google Antigravity** (`antigravity`)

---

## The 3-plane architecture

```mermaid
flowchart LR
    user[Developer] --> client

    subgraph CP[Client Plane\n@bradygaster/squad-sdk/client]
      client[Host-native adapter\nCopilot / Claude / Kiro / OpenCode / Cursor / Codex / Antigravity]
      projection[HostProjection\nagent files + MCP config + rules]
      caps[ClientCapabilities\ncapability tokens + dispatch]
      client --> projection
      client --> caps
    end

    subgraph BP[Control / Broker Plane\n@bradygaster/squad-sdk/backend]
      backend[SquadBackend / IConversationBackend]
      log[Durable ordered event log\nBackendEnvelope + monotonic seq]
      auth[Capability negotiation\nclient ∩ backend ∩ policy]
      approvals[Versioned approvals\nv1 requested -> v2 decided]
      resume[Opaque resume cursor\nlastAcceptedSeq + resumable]
      backend --> log
      backend --> auth
      backend --> approvals
      backend --> resume
    end

    subgraph EP[Execution Plane\nHarnessAdapter SPI]
      harness[HarnessAdapter]
      exec[Agent runs, tools, streaming, tasks]
      fence[Lease / epoch fencing\n(runId, seq) dedupe]
      harness --> exec
      harness --> fence
    end

    client --> backend
    backend --> harness
```

### Plane 1: Client Plane (`@bradygaster/squad-sdk/client`)

`@bradygaster/squad-sdk/client` (with `@bradygaster/squad-sdk/clients` retained as a deprecated alias) projects the Squad coordinator into each host's native configuration without owning routing, durable state, or authorization:

| Host (`ClientId`) | Generated files |
|---|---|
| GitHub Copilot (`copilot`) | `.github/agents/squad.agent.md`, `.mcp.json` |
| Claude Code (`claude`) | `.claude/agents/squad.md`, `CLAUDE.md` (managed marker block), `.mcp.json`, `# squad:claude` `.gitignore` line for `.claude/worktrees/` |
| Kiro (`kiro`) | `.kiro/steering/squad.md` (`inclusion: manual`), `.kiro/agents/squad.json`, `.kiro/settings/mcp.json` |
| OpenCode (`opencode`) | `.opencode/agent/squad.md`, `opencode.json` / `opencode.jsonc` |
| Cursor (`cursor`) | `.cursor/agents/squad.md`, `.cursor/rules/squad.mdc` (`alwaysApply: false`), `.cursor/mcp.json` |
| OpenAI Codex (`codex`) | `.codex/agents/squad.toml` (Codex custom agent with `developer_instructions`), `AGENTS.md` (short pointer block), `.codex/config.toml` (`[mcp_servers.squad_state]`) |
| Google Antigravity (`antigravity`) | `.agents/agents/squad.md` (with `squad_state` MCP server in frontmatter), `GEMINI.md` (pointer block) |

Persisted `clients[]` in `.squad/config.json` contains only canonical slugs validated by `normalizeClientIds()` and `assertPortableClients()`.

### Plane 2: Control / Broker Plane (`@bradygaster/squad-sdk/backend`)

> **Experimental Preview — Bring Your Own Server:** `@bradygaster/squad-sdk/backend` is an experimental extension contract (`BACKEND_CONTRACT_STAGE = 'experimental'`). Squad ships the `SquadBackend` / `HarnessAdapter` interfaces, the local file/state-store backend, and the outbound `durable-http` client — it does **not** bundle a remote DurableSquad server, and server-side DurableSquad Phase 2 integration (remote durable approvals and lease-epoch coordination) is pending. Use `durable-http` when connecting to your own external or managed `/v1/conversations` server.

`SquadBackend` / `IConversationBackend` defines the conversation contract:

- **Ordered event log (`BackendEnvelope`)** with monotonic per-conversation `seq` and `(runId, seq)` deduplication;
- **Opaque cursor reconnect** (`readEvents(conversationId, { after, limit, stream })` returning `nextCursor`, `lastAcceptedSeq`, and `resumable`);
- **Capability negotiation** (`effectiveCapabilities = clientCapabilities ∩ backendCapabilities ∩ policyCapabilities`);
- **Versioned hash-bound approvals** (`v1` requested → `v2` decided with immutable payload `hash`);
- **`runId`-scoped cancellation** (`cancelRun(conversationId, runId, reason?)`).

In `squad state-mcp`, the 11 `squad_backend_*` MCP conversation tools are opt-in via `--experimental-backend` or `SQUAD_EXPERIMENTAL_BACKEND=1`. `SQUAD_BACKEND_URL` alone does not enable them. The bridge ships no execution harness: `squad_backend_health` / `squad_backend_negotiate` report `executionAvailable: false`, and `squad_backend_send_message` refuses instead of queueing (`unavailable` when no harness is registered; auto-selects a single registered in-process harness when `harness` is omitted, or refuses with `invalid-request` when multiple harnesses are registered), so over MCP the bundled backend is a transcript and event-log surface.

### Plane 3: Execution Plane (`HarnessAdapter` SPI)

`HarnessAdapter` (`submit`, `subscribe`, `cancel`, `respondApproval`, `describe`) connects execution runtimes to the broker. Vendor extensions stay isolated in `x-<harness>.*` namespaces (`validateExtensions()`), and lease/epoch fencing prevents stale workers from overwriting newer broker state.

---

## Security and conformance gates (`G1`–`G9`)

| Gate | What it proves |
|---|---|
| `G1` | stable `runId` exists independently from turn ordering |
| `G2` | per-conversation ordering stays monotonic by `seq` |
| `G3` | approvals are durable, versioned resources with immutable payload hashes |
| `G4` | effective capabilities are negotiated as `client ∩ backend ∩ policy` |
| `G5` | reconnect is cursor-based and reports `lastAcceptedSeq` + `resumable` |
| `G6` | cancellation targets `runId`, not host-local completion state |
| `G7` | health probes stay outside the versioned protocol resource tree |
| `G8` | projections are loss-tolerant for unknown durable events and extensions |
| `G9` | the frozen fixtures and cross-adapter trace pass unchanged |

The canonical golden conformance trace (`squad-protocol-v2.0-rc1`) verifies `TurnAccepted(runId, seq) -> ApprovalRequested(v1) -> disconnect -> reconnect(cursor) -> ApprovalDecided(v2) -> CancellationRequested(runId) -> terminal state` across all 7 host projections (`GitHub Copilot, Claude Code, Kiro, OpenCode, Cursor, OpenAI Codex, and Google Antigravity`).

---

## Related docs

- [Squad 2.0 Architecture (Astro docs)](src/content/docs/concepts/squad-2-0-architecture.md)
- [Using Squad Across Clients (Astro docs)](src/content/docs/scenarios/using-squad-across-clients.md)
- [Client Compatibility Matrix (Astro docs)](src/content/docs/scenarios/client-compatibility.md)
- [SDK Reference (Astro docs)](src/content/docs/reference/sdk.md)
- [Multi-client quickstart](tutorials/multi-client-quickstart.md)
- [Durable backend and custom harness tutorial](tutorials/durable-backend-and-custom-harness.md)
