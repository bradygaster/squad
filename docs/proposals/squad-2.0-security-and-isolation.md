# Squad 2.0 — Security, Threat Model & Isolation

**Status:** Proposal, partially implemented · **Owner:** Worf (Security & Reliability) · **Scope:** Client/Backend decoupling and multi-client projections (Claude Code, Kiro, OpenCode, Cursor, GitHub Copilot, OpenAI Codex, Google Antigravity) plus the `DurableSquad` remote backend.
**Contract suite:** `test/squad-20-security-contracts.test.ts` exercises the shipped product modules (`@bradygaster/squad-sdk/backend`, `@bradygaster/squad-sdk/client`, `squad-cli/core/backend-mcp`) for every property marked **Implemented** below. Properties marked **Not implemented** have no test on purpose; they are design intent, not shipped behavior.

## 1. Trust model

| Actor | Trust | Notes |
|---|---|---|
| Client / harness (any of the seven hosts: `copilot`, `claude`, `kiro`, `opencode`, `cursor`, `codex`, `antigravity`) | **Untrusted caller** | Prompt-injectable; may replay, reorder, or tamper with requests. |
| Projected files (`.claude/`, `.kiro/`, `.opencode/`, `.cursor/`, `.codex/`, `.github/`, `.agents/`, `.squad/`, MCP configs) | **Untrusted input** | Writable by the user, other tools, and cloned repos. |
| Control Plane / Broker (`LocalSquadBackend`) | **Trusted process** | Owns conversation state, admission, approvals and lease epochs. Today it runs in the same process (or the same user account) as its callers, so it is a correctness boundary, not a privilege boundary. |
| `DurableSquad` remote backend | Trusted through its bearer token and TLS | Network is hostile; replays and partitions are expected. |

### Control Plane / Broker — what is shipped

- **B1 (Implemented)** Clients never write `.squad/backend/**` directly; every mutation goes through a `SquadBackend` method and a lock-protected read-modify-write of the conversation snapshot.
- **B2 (Implemented, weaker than originally proposed)** Approval binding is an **opaque echo**. The harness supplies `ApprovalRequest.hash` when it raises an approval; the broker stores it and `respondApproval` succeeds only when the response echoes the exact same string (`approval-hash-mismatch` otherwise). The broker does **not** compute or verify the hash: its meaning (SHA-256 of a canonical payload, a nonce, anything) is entirely up to the harness.
- **B3 (Implemented)** Approvals are single-use. A decided approval is `version: 2` and any later decision — identical or different — is rejected with `approval-not-pending`. The same `(runId, seq)` message replays as `duplicate: true`; a different payload under the same key is a `conflict`.
- **B4 (Not implemented — see §4)** The broker **does** trust client-supplied epochs. Anything the broker receives (ids, epochs, hashes) is validated for shape only, never re-derived from an authenticated identity.
- **B5 (Partially implemented)** The MCP bridge returns a generic message for non-contract failures so absolute paths and stack details do not leak to the host; `normalizeClientIds` redacts values that look sensitive. There is no general secret scrubber for logs or projections.

## 2. Safe MCP configuration merging (Implemented)

Targets: `.mcp.json`, `.kiro/settings/mcp.json`, `opencode.json` (key `mcp`), `.cursor/mcp.json`. Implementation: `mergeMcpServer` and `applyProjection` in `packages/squad-sdk/src/client/adapters/`.

- **M1** Merge is additive and scoped to the Squad-owned `squad_state` entry; unrelated servers and top-level keys are preserved.
- **M2** Existing user `env` and any custom field on the `squad_state` entry are kept; Squad only owns the launch fields (`command`, `args`).
- **M3** Malformed JSON and non-object roots or containers abort that file with an `error` result and no write (never "repair by overwrite").
- **M4** Existing `__proto__` keys are copied as plain data and never pollute `Object.prototype`.
- **M5 (Not implemented)** There is no validation of `command`/`args` content (shell metacharacters, interpreters, `https`-only `url`). Squad writes the launch spec it is given.
- **M6 (Partially implemented)** Writes are idempotent (`unchanged` when nothing differs) and validated before touching disk, but they are plain `writeFileSync`, not temp-file + rename.
- **M7** Secrets are never inlined by Squad; the projected `env` is `{}` unless the user already had one.

## 3. Path, symlink & reparse-point guards (Implemented)

Two independent guards exist and are tested:

- `createFileStateStore` (backend state under `.squad/backend/`): rejects any key whose resolved path leaves the state root, walks every path component with `lstat`, and refuses symlinks/junctions anywhere between the root (and its `.squad` parent) and the target. The check runs on read, write, lock and again after `mkdir -p` so a link introduced between the two calls is still caught.
- `resolveInsideRoot` (client projections): rejects absolute paths and `..` segments, then walks every component and refuses symlinked components, including a client directory that was itself replaced by a link.

Conversation ids are restricted to `[A-Za-z0-9._-]{1,128}` and Windows reserved device names (`CON`, `NUL`, `COM1`…) are rejected. Guards rely on Node reporting junctions as symbolic links; a real `mklink /J` junction is exercised on Windows.

## 4. State-backend isolation and lease epochs

- **S1 (Implemented)** Each `.squad` directory is its own state namespace; conversations are `.squad/backend/conversations/<id>.json`, locks are `.squad/backend/locks/<id>.lock`. Both paths are git-ignored by `squad upgrade`.
- **S2 / S3 (Implemented as cooperative fencing)** A conversation carries a single integer `epoch`. A writer may present an epoch: a lower one is rejected with `stale-epoch`, and once any writer has presented one the conversation is *fenced* and omitting the epoch is also rejected. Harness output tagged with an older epoch is dropped and leaves a `harness.epoch-rejected` control event.
- **Not a security boundary.** Epochs are **client-asserted**. There is no lease holder identity, no broker-issued token and no expiry: *any* caller presenting a larger integer takes over the conversation and fences everybody else. This protects against a crashed or paused writer resuming with stale state; it does not protect against a malicious or buggy co-tenant. Treat it like an optimistic-concurrency version, not like a lock.
- **S4 (Implemented)** Messages are addressed by `(runId, seq)`; duplicates are idempotent replays and payload changes are conflicts. Gaps in `seq` are not rejected.
- **S5 (Implemented)** A fenced writer has to learn the current epoch (returned on every admission) and present it; it cannot "resume" an old one.

Cross-process mutual exclusion uses `wx` lock files with owner tokens, a bounded wait, and stale-lock recovery. The lock root is deterministic: the `.squad` directory for the local backend, a file-backed state backend's own root, or — for backends whose data lives outside the working tree (git-notes, orphan) — a machine-local directory derived from the backend identity, so a configured state backend never materializes `.squad/backend/` in the team directory. `createStateBackendStore` refuses to run with a backend that cannot provide one rather than falling back to a per-process temp directory. Lock waits in the async backend methods are timer based so a contended conversation never stalls the MCP server's event loop.

## 5. Contract suite

`test/squad-20-security-contracts.test.ts` is organized by the gates below. It is part of the normal test run; it is not a release gate on its own and does not run a Windows junction case outside Windows.

| Gate | What the suite exercises (product code) |
|---|---|
| G1 | Path containment: `createFileStateStore` and `resolveInsideRoot` reject escapes, symlinks and junctions; id validation |
| G2 | `mergeMcpServer` / `installClients`: additive merge, user env preserved, malformed JSON left untouched, prototype safety, idempotence |
| G3 | `(runId, seq)` idempotency and conflict detection, across a backend restart |
| G4 | `intersectCapabilities` / `negotiate()` / `resolveEffectiveCapabilityTokens` strict intersection; `normalizeClientIds` redaction |
| G5 | Cooperative epoch fencing incl. the documented take-over behavior and fenced harness output |
| G6 | Opaque approval hash echo, single-use decisions, `cancelRun` by `runId` closing pending approvals, no revival of terminal runs |
| G7 | Cursors: cross-conversation and malformed cursors rejected, unresumable position reported, no lease material in pages |
| G8 | MCP bridge: explicit opt-in, canonical `BackendErrorInfo`, generic message for non-contract failures, refusal without a harness |
| G9 | `DurableHttpSquadBackend`: `https` only (plain `http` for loopback), `redirect: 'error'`, per-attempt timeouts, token sent only to the configured origin |

## 6. Configured vs. negotiated capabilities (Implemented)

Persisted `clients[]` in `.squad/config.json` is **projection config only**. It decides which client files are generated; it never grants execution authority.

- **C1** `effectiveCapabilities = clientCapabilities ∩ backendCapabilities ∩ policyCapabilities`, computed by `negotiate()` (backend) and `resolveEffectiveCapabilityTokens` (client), never at config load.
- **C2** Unknown capability tokens are dropped silently (there is no per-token reason reporting).
- **C3** Widening `clients[]` on disk cannot widen `effectiveCapabilities`.
- **C4 / C5** `normalizeClientIds` keeps only canonical client slugs and reports everything else as `unknown` or `sensitive` (redacted); `assertPortableClients` throws without echoing the offending values.

## 7. Approvals & `runId` cancellation (Implemented)

An approval record is `{ approvalId, version, scope, action, hash, payload?, state, runId, requestedAt, decidedAt?, decision?, reason? }`.

- **A1** `version` is 1 while pending and incremented on the decision (or on cancellation of the run).
- **A2** `hash` is the opaque string supplied by the harness; a response with a different string is rejected without state change. There is no `payloadHash`, no canonicalization and no `version` check on the response.
- **A3** Decided or cancelled approvals are terminal; replaying the decision is `approval-not-pending`.
- **A5** Cancellation targets the stable `runId` across all its turns, is idempotent, and is a no-op once terminal. A late harness `state`/`message` for a cancelled run is ignored.
- **A6** Same `(runId, seq)` is an idempotent replay; `seq` is not an identifier for control operations.

## 8. Cursors and loss tolerance

- **L3 (Implemented, unsigned)** Cursors are opaque `base64url("c1:<conversationId>:<sequence>")`. The broker validates the conversation id and the numeric form; a cursor ahead of the log yields `resumable: false`. Cursors are **not signed**: a client can mint a cursor for any position of a conversation it can already read. Pages expose only `events`, `nextCursor`, `lastAcceptedSeq` and `resumable`.
- **L1 / L2 (Not implemented)** There is no loss-tolerant projection layer for unknown event kinds and no separate telemetry channel in the SDK backend.

## 9. Future work / not implemented

Earlier drafts of this proposal described the following as shipped. They are not, and the contract suite does not pretend otherwise:

- broker-computed approval hashes (`sha256(canon({runId, action, args, epoch}))`), `payloadHash`, `expiresAt` and version-checked decisions;
- broker-issued leases with holder identity, so a client cannot fence others by asserting a larger epoch;
- signed or forgery-resistant cursors and cursor expiry;
- `command`/`args`/`url` validation in MCP config merges (M5) and atomic temp-file writes (M6);
- a general secret scrubber for diagnostics and projections (B5 beyond the MCP error surface);
- loss-tolerant projection of unknown event kinds and a separate telemetry stream (L1/L2);
- a bundled execution harness: the `squad_backend_*` MCP tools are a transcript/event-log surface, `squad_backend_send_message` is refused with `unavailable` while no harness is registered, and `health`/`negotiate` report `executionAvailable: false`.
