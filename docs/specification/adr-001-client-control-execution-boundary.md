# ADR 001: Client, Control, and Execution Boundary

**Status:** Accepted draft baseline

**Protocol baseline:** `squad-protocol-v2.0-rc1`

## Context

Squad 2.0 needs one protocol baseline that survives multiple clients, multiple
execution fabrics, disconnect and reconnect, and background work that outlives
one host session.

The design pressure comes from five host families and more than one transport.
If conversation semantics lived inside each adapter, or if MCP became the
conversation wire contract, protocol behavior would drift with host quirks and
transport limitations.

## Decision

Squad 2.0 is split into three planes:

| Plane | Owns |
|---|---|
| Client | local UX, auth bootstrap, host event parsing, rendering, and transport adaptation |
| Control and Broker | conversation identity, sequencing, capabilities, approvals, routing, cancellation, durable event history, and compatibility policy |
| Execution | task workers, tool execution, checkpoints, retries, and transient telemetry |

MCP is treated as an execution or tool bridge. It is useful for local broker
projection and host integration, but it is not the canonical conversation wire
contract.

Future compatibility claims are gated by `G1` through `G9`:

| Gate | Requirement |
|---|---|
| `G1` | stable `runId` independent from `seq` |
| `G2` | monotonic per-conversation ordering by `seq` |
| `G3` | durable versioned approvals with immutable payload hashes |
| `G4` | effective capabilities negotiated as `client ∩ backend ∩ policy` |
| `G5` | cursor-based recovery with `lastAcceptedSeq` and `resumable` |
| `G6` | cancellation scoped to `runId` |
| `G7` | operational health kept outside the protocol resource tree |
| `G8` | loss-tolerant projection of unknown durable events and extensions |
| `G9` | immutable golden fixtures in `test-fixtures/spec/suite-v0.2/` |

## Consequences

- adapters stay narrow and host-specific
- backend semantics stay portable and versioned
- transport swaps do not rewrite conversation meaning
- fixture drift becomes visible through the protocol baseline instead of being
  silently absorbed by one host

## Related artifacts

- [Squad Client and Backend Decoupling v0.2](client-backend-decoupling-v0.2.md)
- [Squad Client and Harness Adapter Profile v0.2](client-harness-adapters-v0.2.md)
- `test-fixtures/spec/suite-v0.2/golden-trace.json`
- `test-fixtures/spec/suite-v0.2/capability-matrix.json`
