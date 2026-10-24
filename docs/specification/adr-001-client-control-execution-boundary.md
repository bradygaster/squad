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
contract. The bridge that ships today (`squad state-mcp --experimental-backend`)
exposes the `SquadBackend` contract as `squad_backend_*` tools but bundles no
execution harness: it is a transcript and event-log surface that refuses to
admit turns (`unavailable`) and reports `executionAvailable: false` until a
harness is registered.

The source of truth for the contract is
`packages/squad-sdk/src/backend/types.ts`. Where this ADR or the companion
specifications and the code disagree, the code wins and the documents are
corrected.

Future compatibility claims are gated by `G1` through `G9`:

| Gate | Requirement | Status |
|---|---|---|
| `G1` | stable `runId` independent from `seq` | implemented |
| `G2` | monotonic per-conversation ordering by `seq` | implemented |
| `G3` | durable versioned approvals echoing the harness-supplied opaque `hash` | implemented (broker-computed digests, expiry and version-checked responses are future work) |
| `G4` | effective capabilities negotiated as `client ∩ backend ∩ policy` | implemented |
| `G5` | cursor-based recovery with `lastAcceptedSeq` and `resumable` | implemented (cursors are unsigned) |
| `G6` | cancellation scoped to `runId` | implemented |
| `G7` | operational health kept outside the protocol resource tree | implemented |
| `G8` | loss-tolerant projection of unknown durable events and extensions | extension validation only; unknown event kinds are not yet projected |
| `G9` | golden fixtures in `test-fixtures/spec/suite-v0.2/` pass against the shipped backends | implemented (fixture event names are the real `BackendEnvelope.type` values) |

Lease epochs are cooperative and client-asserted: a stale epoch is fenced but
any caller presenting a larger epoch takes over. Broker-issued leases with
holder identity are future work; see
`docs/proposals/squad-2.0-security-and-isolation.md`.

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
