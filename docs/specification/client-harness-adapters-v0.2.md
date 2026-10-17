# Squad Client and Harness Adapter Profile v0.2

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-client-harness-adapters/v0.2`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** GitHub Copilot projections exist today, and the
repository already carries portable agent, rules, and MCP artifacts, but the
host-specific adapter seam is not yet codified as one SDK surface.

**Known deviations:** Host discovery, approvals, session spawning, and MCP
config projection vary across Copilot, Claude Code, Kiro, OpenCode, and
Cursor.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-client-backend-decoupling/v0.2`

## 1. Scope and non-goals

This profile defines the host-facing service provider interface that bridges
Squad's portable client plane to concrete agent hosts and execution harnesses.
It covers the `ClientAdapter` and `HarnessAdapter` contracts, the workspace
projection they expose, and the authoritative file paths each supported host
uses for agent and MCP wiring.

It does not standardize the internal tool catalog of any host, the visual
presentation of approvals, extension packaging, or provider-specific pricing
and authentication.

This profile follows the same Q and Bubu convergence rule: adapters own native
host bootstrap, transport mechanics, event parsing, tool registration, UI
rendering, and translation to canonical envelopes. They do not own
conversation semantics, routing, durable state, authorization policy, or the
canonical command and event vocabulary.

## 2. Adapter roles

Two related adapters project the same portable conversation model:

| Adapter | Plane boundary | Responsibility |
|---|---|---|
| `ClientAdapter` | client plane to broker plane | translates host turns, approvals, and transcript subscriptions into backend calls |
| `HarnessAdapter` | broker plane to execution plane | translates portable run and task operations into the host's agent execution primitive |

The client adapter is closest to the end-user surface. The harness adapter is
closest to spawned work, subagents, sessions, or durable workers. Some hosts
can implement both in one package, but the interfaces remain separate so local
UI behavior does not leak into execution orchestration.

The client adapter therefore ends at the host capability boundary: auth,
session bootstrap, user-visible event rendering, approval affordances, and
subscription plumbing. The harness adapter ends at the execution capability
boundary: task launch, cancellation, tool invocation mechanics, and local
lifecycle management. Everything beyond those boundaries is expressed in the
shared backend contract from `squad-client-backend-decoupling/v0.2`.

## 3. Portable TypeScript SPI

```ts
export interface AdapterDescription {
  adapterId: string;
  hostKind:
    | 'github-copilot'
    | 'claude-code'
    | 'kiro'
    | 'opencode'
    | 'cursor';
  hostVariant?: string;
  displayName: string;
  capabilities: {
    approvals: boolean;
    backgroundRuns: boolean;
    mcpConfig: boolean;
    subagents: boolean;
  };
  projectedFiles: string[];
}

export interface AdapterCapabilityProjection {
  clientCapabilities: string[];
  backendCapabilities: string[];
  policyCapabilities: string[];
  effectiveCapabilities: string[];
}

export interface ProjectWorkspaceProjection {
  repoRoot: string;
  workingDirectory: string;
  workspaceKind: 'repository' | 'folder' | 'multi-root' | 'cloud';
  branch?: string;
  squadAgentPath: string;
  mcpConfigPath?: string;
  supportFiles: string[];
}

export interface AdapterSubmission {
  conversationId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface AdapterSubscription {
  conversationId: string;
  cursor?: string;
}

export interface ApprovalResponse {
  approvalId: string;
  requestHash: string;
  decision: 'approved' | 'rejected' | 'cancelled';
  responseText?: string;
}

export interface ClientAdapter {
  submit(input: AdapterSubmission): Promise<{ admissionId: string; runId: string }>;
  subscribe(
    input: AdapterSubscription,
    onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  ): Promise<() => Promise<void>>;
  cancel(conversationId: string, runId: string, reason?: string): Promise<void>;
  respondApproval(conversationId: string, response: ApprovalResponse): Promise<void>;
  getCapabilities(conversationId?: string): Promise<AdapterCapabilityProjection>;
  describe(): Promise<AdapterDescription>;
  projectWorkspace(): Promise<ProjectWorkspaceProjection>;
}

export interface HarnessAdapter {
  submit(input: AdapterSubmission): Promise<{ taskId: string; runId: string }>;
  subscribe(
    input: AdapterSubscription,
    onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  ): Promise<() => Promise<void>>;
  cancel(conversationId: string, runId: string, reason?: string): Promise<void>;
  respondApproval(conversationId: string, response: ApprovalResponse): Promise<void>;
  getCapabilities(conversationId?: string): Promise<AdapterCapabilityProjection>;
  describe(): Promise<AdapterDescription>;
  projectWorkspace(): Promise<ProjectWorkspaceProjection>;
}
```

The method set is intentionally identical. `describe` and `projectWorkspace`
let the broker reason about host capabilities and file projection without
special-casing each client in coordinator logic.

Adapters translate host-native events and commands into canonical envelopes.
They do not redefine turn ordering, causation, correlation, cancellation,
artifact semantics, resumability, or canonical error classes.

Projection is loss-tolerant. Unknown event kinds are preserved and forwarded as
opaque canonical envelopes rather than crashing the adapter. Disposable
telemetry remains separate from durable conversation events.

## 4. Host projection contract

Every host projection publishes the same minimum facts:

- the authoritative Squad agent file path for that host;
- the authoritative MCP configuration path for that host, if the host supports
  MCP;
- the host execution primitive used for `submit`;
- the workspace root and working directory used for `projectWorkspace`;
- whether approvals and background work are supported directly or must be
  broker-mediated.

If a host requires more than one file, the agent file remains the anchor and
all companion files are listed under `supportFiles`.

Capability reporting is descriptive. A host may advertise that it can render
approvals or run background work, but the policy for whether a run may do so
still lives in the shared contract and broker state.

Workspace projection config is also descriptive only. Persisted `clients[]`
entries in `.squad/config.json` are for workspace projection and host wiring,
not for authority. They exclude credentials, provider thread ids, machine
paths, leases, checkpoints, and any other mutable runtime state.

## 5. Canonical file paths and execution primitives

| Host | Agent anchor | MCP config | Support files | `submit` projection |
|---|---|---|---|---|
| GitHub Copilot | `.github/agents/squad.agent.md` | `.mcp.json` | `.github/copilot-instructions.md` when present | `create_session`, `task`, or `runSubagent` depending on surface |
| Claude Code | `.claude/agents/squad.md` | `.mcp.json` | `CLAUDE.md` | Claude `Task` subagent tool |
| Kiro | `.kiro/steering/squad.md` | `.kiro/settings/mcp.json` | Kiro spec and steering hooks | Kiro agent or spec execution hook |
| OpenCode | `.opencode/agent/squad.md` | `opencode.json` | host agent and MCP definition blocks in `opencode.json` | OpenCode agent execution entry declared in `opencode.json` |
| Cursor | `.cursor/agents/squad.md` | `.cursor/mcp.json` | `.cursor/rules/squad.mdc` | Cursor agent dispatch or inline agent run with projected rules |

These file paths are the portable contract. A host-specific installer may
write additional generated files, but it may not move the canonical anchor
without changing the projection version.

The `submit` column describes the host execution primitive only. It is not the
portable conversation wire contract. MCP-backed projections are still host
transport details behind the shared backend semantics.

The capability view exposed by an adapter mirrors the backend intersection
model. `clientCapabilities` come from the adapter, `backendCapabilities` come
from the shared service, `policyCapabilities` come from authorization policy,
and `effectiveCapabilities` are the only capabilities a projected client can
actually exercise.

## 6. GitHub Copilot projection

GitHub Copilot is treated as one host family with three common surfaces:
CLI, Copilot App, and editor-hosted subagents.

### 6.1 Canonical files

- agent anchor: `.github/agents/squad.agent.md`
- MCP config: `.mcp.json`
- support files: `.github/copilot-instructions.md`, host-specific generated
  artifacts under `.github/` when present

### 6.2 `submit`

`submit` selects one execution primitive based on the live surface:

- Copilot App prefers `create_session` for commit-producing or long-lived work;
- Copilot CLI prefers `task` for background fan-out and read-only specialists;
- editor-hosted Copilot surfaces may project `runSubagent` when available.

The adapter returns one portable run identity regardless of which primitive was
selected.

That portable run identity is `runId`, not turn sequence. Host completion or
UI status remains projection evidence and does not replace broker lifecycle
state.

### 6.3 `projectWorkspace`

The adapter reports the repository root, the active working directory, the
branch when known, `.github/agents/squad.agent.md` as the agent anchor, and
`.mcp.json` as the MCP config path. If the host requires an explicit
`--additional-mcp-config @.mcp.json` workaround, that remains an execution
detail inside the harness adapter rather than a different workspace contract.

## 7. Claude Code projection

### 7.1 Canonical files

- agent anchor: `.claude/agents/squad.md`
- MCP config: `.mcp.json`
- support files: `CLAUDE.md`

### 7.2 `submit`

`submit` maps to Claude Code's `Task` subagent tool. The harness adapter is
responsible for shaping the portable prompt, handling streaming callbacks, and
projecting Claude's task identity into the broker run identity.

### 7.3 `projectWorkspace`

The adapter reports the repository root, current working directory, and the
pair `.claude/agents/squad.md` plus `CLAUDE.md` so the broker can verify that
the projected host files are in sync with the portable Squad contract.

## 8. Kiro projection

### 8.1 Canonical files

- agent anchor: `.kiro/steering/squad.md`
- MCP config: `.kiro/settings/mcp.json`
- support files: any Kiro spec hook definitions that import the Squad steering
  file

### 8.2 `submit`

`submit` maps to the Kiro execution surface that can launch an agent or spec
hook with the projected Squad steering context. The portable adapter contract
does not require Kiro to expose the same tool names as Copilot.

### 8.3 `projectWorkspace`

The workspace projection always returns `.kiro/steering/squad.md` as the
authoritative Squad steering file and `.kiro/settings/mcp.json` as the MCP
config anchor for state and broker tools.

## 9. OpenCode projection

### 9.1 Canonical files

- agent anchor: `.opencode/agent/squad.md`
- MCP config: `opencode.json`
- support files: any agent and server definition sections nested in
  `opencode.json`

### 9.2 `submit`

`submit` maps to the agent execution entry declared by the OpenCode host.
Because OpenCode centralizes both agent and MCP definitions in `opencode.json`,
the harness adapter treats that file as the durable projection source even when
generated helpers exist elsewhere.

### 9.3 `projectWorkspace`

The adapter reports `.opencode/agent/squad.md` as the stable prompt anchor and
`opencode.json` as the host manifest that binds MCP servers and agent
definitions together.

## 10. Cursor projection

### 10.1 Canonical files

- agent anchor: `.cursor/agents/squad.md`
- MCP config: `.cursor/mcp.json`
- support files: `.cursor/rules/squad.mdc`

### 10.2 `submit`

`submit` maps to Cursor's agent dispatch surface when available. If the host
only exposes inline execution, the harness adapter still uses the same
submission payload but records `backgroundRuns: false` in `describe`.

### 10.3 `projectWorkspace`

`projectWorkspace` returns both `.cursor/agents/squad.md` and
`.cursor/rules/squad.mdc`. The rule file is part of the portable projection
because it carries the host-specific behavioral glue that accompanies the agent
prompt.

## 11. SDK file layout

The reference SDK should keep the portable adapter contracts in a host-neutral
module and keep host projections in one sibling folder per host family.

| Concern | Canonical TypeScript path |
|---|---|
| backend conversation contracts | `packages/squad-sdk/src/client/backend-contract.ts` |
| client and harness adapter SPI | `packages/squad-sdk/src/client/adapter-contract.ts` |
| host projection implementations | `packages/squad-sdk/src/client/adapters/` |
| backend implementations | `packages/squad-sdk/src/client/backends/` |
| public exports | `packages/squad-sdk/src/client/index.ts` |

This profile fixes the contract locations so backend work, client work, and
contract validation can proceed in parallel without rediscovering file layout.

Those files also enforce the architectural boundary:

- `backend-contract.ts` owns conversation, participant, turn, task, artifact,
  lease, cancellation, resumability, observability, and canonical error
  semantics;
- `adapter-contract.ts` owns host capability description, workspace
  projection, and translation hooks only.

## 12. Promotion criteria

Promote this draft only after the suite has:

1. contract tests that run the same `ClientAdapter` and `HarnessAdapter`
   assertions against at least GitHub Copilot plus one non-Copilot host;
2. fixtures that verify the canonical file-path projection for all five host
   families;
3. approval and cancellation traces that demonstrate host-specific UI behavior
   still round-trips through the same portable response envelope;
4. MCP projection tests that prove `.mcp.json`, `.kiro/settings/mcp.json`,
   `opencode.json`, and `.cursor/mcp.json` are emitted with stable semantics;
5. broker-to-harness replay tests showing that the chosen host primitive
   preserves run identity, transcript ordering, and background capability
   reporting;
6. golden-trace validation proving that adapters survive disconnect and
   reconnect without losing unknown events, durable approval versions, or
   stable `runId` cancellation targeting.
