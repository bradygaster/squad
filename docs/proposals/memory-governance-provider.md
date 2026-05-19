# Proposal: Memory Governance Provider

**Issue:** bradygaster/squad#600
**Author:** tamirdresher
**Date:** 2026-05-18
**Status:** Design

---

## Problem Statement

Squad currently treats memory as files under `.squad/` loaded through state and storage
helpers. That is the right default for local worktrees, but it blurs three different
concerns:

1. Persisting bytes somewhere.
2. Deciding which memories are safe and useful to keep.
3. Retrieving the right memory for a task.

As provider work expands, especially around Copilot Memory and external memory systems,
Squad needs a higher-level memory governance layer without turning `StorageProvider` into
a semantic database, policy engine, or agent behavior system.

---

## Design Principles

### StorageProvider stays dumb

`StorageProvider` remains the low-level persistence abstraction. It should read, write,
list, and delete file/blob-like content. It should not:

- classify memories
- decide retention policy
- understand semantic similarity
- call LLMs
- enforce durable-memory safety rules
- know whether content is a decision, directive, policy, or transient note

This keeps the existing storage abstraction portable across local disk, worktree state,
remote blobs, and future plugin-backed state backends.

### Memory governance sits above state and storage

A new `MemoryGovernanceProvider` / `MemoryStore` should sit above `SquadState` and
`StorageProvider`.

```text
Agents / CLI / MCP tools
        |
        v
MemoryStore / MemoryGovernanceProvider
        |
        +--> classification, policy, routing, retrieval, promotion
        |
        v
SquadState
        |
        v
StorageProvider
```

`SquadState` remains the structured state surface for `.squad/` data. The governance
provider decides what should become memory, where it belongs, and whether it is allowed
to become durable.

---

## Memory Classes

Every proposed memory write should be classified before persistence.

| Class | Meaning | Default destination |
|-------|---------|---------------------|
| `TRANSIENT` | Short-lived task state, CI/PR status, scratch observations, temporary blockers | Do not persist as durable memory |
| `LOCAL` | Repo-specific context useful in this worktree, such as conventions, file locations, and implementation notes | `.squad/agents/{name}/history.md` or local inbox |
| `DECISION` | User-approved or team-relevant decision that should guide future work | `.squad/decisions/inbox/` then `decisions.md` |
| `POLICY` | Durable directive, security rule, workflow rule, or governance constraint | `.squad/decisions.md` / policy section |
| `COPILOT_MEMORY` | Safe, durable semantic memory intended for Copilot Memory or another semantic provider | Optional external semantic memory provider |
| `FORBIDDEN` | Secrets, PII, topology, raw logs, credentials, or other disallowed data | Reject and do not persist |

Classification should prefer safety over recall. If content is ambiguous, keep it local
or transient rather than writing to durable semantic memory.

---

## Provider Roles

### Worktree/local memory remains the default

For `squad init` and Copilot custom agents, local worktree memory remains the default:

- `.squad/decisions.md`
- `.squad/decisions/inbox/`
- `.squad/agents/{name}/history.md`
- `.squad/skills/{name}/SKILL.md`

This keeps Squad usable offline, reviewable in Git, and compatible with existing teams.
It also preserves the current prompt-only behavior for Copilot custom agents: when no
tool bridge is available, agents write `.squad/` files directly.

`StorageProvider` participates when Squad is running through SDK or runtime abstractions
that load state through provider-backed services. It is not automatically exercised by
`squad init` plus a Copilot CLI custom agent in prompt-only mode; that path relies on the
agent instructions and local `.squad/` files unless a CLI/MCP bridge is installed.

### Copilot Memory is optional semantic memory

Copilot Memory is not a `StorageProvider`. It is an optional semantic durable memory
destination behind `MemoryGovernanceProvider`.

The governance layer may route selected `COPILOT_MEMORY` entries to Copilot Memory when:

- the user or team has enabled it
- classification marks the content safe
- the entry is stable enough to be useful across sessions
- the write path supports auditability and deletion

The local `.squad/` files remain the source of truth unless a future configuration
explicitly selects another governance provider.

Current implementation does not include a real callable Copilot Memory API. Squad does not
ship, discover, or emulate a Copilot Memory service client, and `provider=copilot` fails
with an explicit "real Copilot Memory API unavailable" error unless a concrete provider
module is added. The only current bridge is named `hostInjectedCopilotAdapter`; hosts that
have access to a real API can inject a `CopilotMemoryProviderClient` into the governed
memory layer. When `.squad/memory/config.json` enables
`externalProviders.hostInjectedCopilotAdapter` but no client is supplied, writes, searches,
and deletes fail closed with clear errors and no fake persistence.

The provider path still goes through governance:

- `COPILOT_MEMORY` writes are classified before the provider is called.
- forbidden, transient, unapproved, or disabled-provider writes are rejected before any
  external call.
- audits record action, class, provider, ids, paths, reasons, and actor, but never raw
  memory content.
- deletes call the provider delete operation, mark the governed index entry deleted, and
  write a local tombstone for auditability.
- `squad memory provider` reports that real Copilot Memory is unavailable locally, whether
  `hostInjectedCopilotAdapter` is enabled, and whether the current process has a
  host-injected client.

### Tool bridge is required for pluggable providers

Copilot custom agents cannot reliably use pluggable memory providers through prompt
instructions alone. A CLI/MCP/tool bridge is needed so agents can call explicit
operations such as:

- `memory.classify`
- `memory.write`
- `memory.search`
- `memory.promote`
- `memory.delete`
- `memory.audit`

Without that bridge, the fallback is prompt-only local writes to `.squad/` files. That
fallback is intentionally limited: it preserves current behavior but cannot guarantee
provider routing, semantic indexing, policy enforcement, or remote deletion.

---

## Agent Responsibilities

Squad should not assume every team has the same named agents. Only the default team
roles should be required by the memory governance path; richer teams can add specialist
reviewers by capability.

| Role | Availability | Responsibility |
|------|--------------|----------------|
| Scribe | Default | Owns memory stewardship: consolidates inbox entries, summarizes local history, proposes promotions, detects directive conflicts, prepares candidate durable entries, and records audit metadata. |
| Ralph | Default | Monitors stale work, recurring failures, and backlog signals that may indicate missing or outdated memory. Ralph can suggest memory review, but does not approve policy-sensitive writes. |
| Domain/research specialist | Optional | Validates sources, retrieves historical context, distinguishes durable facts from transient findings, and identifies when the user should approve promotion. |
| Safety/review specialist | Optional | Enforces safety boundaries: rejects `FORBIDDEN` writes, reviews security-sensitive memory, and defines redaction requirements. |
| Framework/architecture specialist | Optional | Owns provider boundaries, schemas, classification taxonomy, tool bridge contracts, and compatibility with state backends. |
| Team lead/coordinator | Optional | Coordinates team-level policy and final decisions: approves governance defaults, user-facing behavior, and rollout sequencing. |

For example, Tamir's project Squad maps those optional capabilities to agents such as
Seven, Worf, Data, and Picard. That mapping is an implementation of the capability model,
not a requirement for every Squad installation.

### Default role decision

The governance model does not require a new always-created memory role at `squad init`
time. Scribe is already the default durable-record role, so memory governance should extend
Scribe's responsibilities and give it explicit tools, classification rules, and audit
obligations. A future `Memory Steward` template may be useful for larger teams, but it
should be optional unless Scribe's role becomes too broad in practice.

---

## Relationship to Existing Work

### Tiered memory (#600)

This design extends [Tiered Agent Memory](tiered-memory.md). The hot/cold/wiki model
describes context loading and promotion. Memory governance defines the provider boundary
and safety rules that decide what may enter those tiers or an external semantic memory.

The two designs are compatible:

- hot memory maps mostly to `TRANSIENT` and recent `LOCAL`
- cold memory maps to summarized `LOCAL`
- wiki memory maps to stable `DECISION`, `POLICY`, and selected durable knowledge
- semantic memory maps only to explicitly safe `COPILOT_MEMORY`

### State backend and plugin work

Provider work for state backends should stay focused on where bytes live. Memory
governance should decide what bytes are worth writing, how they are classified, and which
provider receives them.

This avoids coupling the memory policy model to any one runtime plugin, including the
separate mempalace runtime provider worktree.

---

## Upgrade Story

`squad upgrade` is the user-facing path that makes the new model usable in existing
repositories. The upgrade must be non-destructive, idempotent, and safe to re-run.

The upgrade should:

- detect the existing `.squad/` version, layout, and any memory/governance config
- preserve existing `decisions.md`, agent histories, skills, routing, `team.md`, and
  ceremony files
- create or migrate `.squad/memory/config.json` or an equivalent policy file with a
  local-only default
- add default memory governance policy without overwriting user-authored edits
- update Scribe's charter responsibilities for memory stewardship through a managed
  block, patch, or migration note pattern rather than replacing custom charter text
- preserve Ralph's role as a monitor for stale work and repeated rediscovery, not as the
  owner of memory policy
- add CLI/MCP bridge configuration only when the bridge is installed and available
- leave prompt-only local `.squad/` fallback in place when no bridge exists
- keep external semantic providers, including Copilot Memory, disabled unless explicitly
  opted in by the user or repository policy
- produce a migration report that lists created, changed, skipped, and manually required
  actions

Before changing existing files, `squad upgrade` should create a rollback point: either a
timestamped backup of changed `.squad/` files, a reversible migration journal, or a clear
Git-friendly migration report when the worktree itself is the rollback mechanism. The
rollback story must cover policy config, managed charter updates, and bridge config.

---

## E2E Validation Story

This model is not complete when the taxonomy, unit tests, or proposal text pass review.
It is complete only after a real human-style Squad workflow validates upgrade, fallback,
tool-backed memory, rejection, promotion, deletion, and audit behavior end to end.

The required scenario is:

1. Start with an existing repository that already has a `.squad/` directory from current
   or older Squad.
2. Run `squad upgrade`.
3. Verify the upgrade preserves existing `decisions.md`, agent histories, skills, routing,
   `team.md`, and ceremonies.
4. Verify the upgrade adds memory governance config and default local-only policy without
   overwriting user edits.
5. Select the Squad custom agent in Copilot CLI.
6. In prompt-only mode, verify the agent continues to use local `.squad/` memory safely.
7. With CLI/MCP memory tools installed and enabled, verify the agent uses
   `memory.classify`, `memory.write`, `memory.search`, `memory.promote`,
   `memory.delete`, and `memory.audit` rather than relying only on prompt instructions.
8. Verify Scribe proposes and promotes memory according to policy.
9. Verify Ralph detects repeated rediscovery or stale work and suggests memory review
   while leaving policy ownership with Scribe/governance.
10. Verify optional specialists participate only when configured by the team.
11. Attempt to store forbidden memory such as secrets, PII, topology, raw logs, or
    transient CI/PR status; verify the write is rejected and audited.
12. Attempt to store durable semantic memory; verify Copilot Memory or any external
    semantic provider is used only after opt-in and required approval.
13. Verify deletion removes or tombstones governed memory through the configured provider
    and that `memory.audit` reports writes, promotions, rejections, and deletes.

The E2E test should be run from the user's perspective: clone/open repo, upgrade, select
the Squad agent, perform normal work, observe what memory is proposed, and inspect the
resulting local files and audit output.

---

## Security and Retention Rules

The governance provider must not write the following to durable memory:

- secrets, credentials, tokens, keys, connection strings
- PII or customer data
- internal network topology or sensitive infrastructure details
- raw logs, traces, dumps, or telemetry payloads
- transient CI status, PR status, build output, or one-time task progress
- unreviewed vulnerability details that would increase risk if retained

Allowed durable memory should be distilled: decisions, policies, stable conventions,
safe architectural summaries, and reusable workflow knowledge.

### Provider guarantees

Any provider used behind `MemoryGovernanceProvider` must document its operational
guarantees before it is enabled by default:

- tenant and repository isolation
- path traversal and namespace confinement
- encryption expectations for local and remote storage
- atomic writes or explicit conflict behavior
- locking/concurrency behavior for concurrent Squad sessions
- deletion and rollback behavior
- audit records for durable writes, promotions, rejections, and deletes
- migration compatibility between provider versions

Prompt instructions are not enough for these guarantees. Prompt-only fallback is useful
for compatibility, but tool-backed or runtime-backed providers need deterministic checks,
tests, and audit output.

---

## Implementation Phases

### Phase 0: Documentation and taxonomy

- Document provider boundaries and memory classes.
- Add public-facing wording that local worktree memory remains the default.
- Cross-link the tiered memory proposal.

### Phase 1: Local governance shim

- Add a local-only `MemoryStore` facade over `SquadState`.
- Classify writes before they land in `.squad/`.
- Keep `StorageProvider` unchanged.
- Preserve prompt-only fallback for Copilot custom agents.

### Phase 2: CLI/MCP bridge

- Expose memory operations through CLI and MCP tools.
- Let Copilot custom agents call tool-backed classification, search, and writes.
- Add audit output so users can inspect what was stored and why.

### Phase 3: Optional semantic provider

- Add an opt-in provider adapter for Copilot Memory or another semantic memory system.
- Route only `COPILOT_MEMORY` entries after safety checks.
- Keep local `.squad/` memory as the default and fallback.
- Implemented only as an explicit `hostInjectedCopilotAdapter` contract; real
  `provider=copilot` remains blocked until a concrete callable API exists locally, and
  missing host clients fail closed rather than pretending to persist semantic memory.

### Phase 4: Promotion and lifecycle automation

- Let Scribe propose promotions from local/cold memory to wiki or semantic durable memory.
- Add retention, expiration, deletion, and conflict resolution flows.
- Validate behavior against tiered-memory context budgets.

---

## Acceptance Criteria

- `StorageProvider` remains a file/blob persistence interface.
- A higher-level `MemoryGovernanceProvider` / `MemoryStore` boundary is documented before runtime implementation.
- `squad init` and Copilot custom agents keep local worktree memory as the default.
- Copilot Memory is documented as optional semantic durable memory, not as storage.
- Prompt-only custom agents can still write `.squad/` files when no bridge exists.
- Tool-backed custom agents have a clear CLI/MCP bridge direction for pluggable providers.
- `squad upgrade` is non-destructive, idempotent, detects existing `.squad/` state, and
  preserves decisions, histories, skills, routing, `team.md`, and ceremonies.
- `squad upgrade` creates or migrates local-only memory governance policy without
  overwriting user edits and reports changed, skipped, and manual migration actions.
- Scribe receives memory stewardship responsibilities through managed updates or
  migration notes, while Ralph remains a monitor rather than policy owner.
- CLI/MCP bridge config is added only when available; otherwise prompt-only local
  `.squad/` fallback remains valid.
- External semantic providers, including Copilot Memory, require explicit opt-in and
  approval before durable semantic writes.
- Memory writes are classified as `TRANSIENT`, `LOCAL`, `DECISION`, `POLICY`, `COPILOT_MEMORY`, or `FORBIDDEN`.
- Durable memory rejects secrets, PII, topology, raw logs, and transient CI/PR status.
- Providers document isolation, deletion, audit, concurrency, and migration guarantees.
- Tests cover redaction, denied persistence, provider conformance, rollback/delete, and concurrent-write behavior.
- E2E validation covers an existing repo upgraded with `squad upgrade`, Copilot CLI
  custom-agent use, prompt-only fallback, tool-backed memory operations, Scribe/Ralph
  behavior, forbidden-memory rejection, semantic opt-in/approval, deletion, and audit.
- The relationship to #600 and state-backend/plugin work is explicit.

---

## References

- Issue: bradygaster/squad#600
- Related proposal: [Tiered Agent Memory](tiered-memory.md)
- Internal format: [Squad Entry Markdown Format](../_internal/specs/memory-format.md)
