# Squad 2.0 — Security, Threat Model & Isolation Gates

**Status:** Proposal · **Owner:** Worf (Security & Reliability) · **Scope:** Client/Backend decoupling and multi-client projections (Claude Code, Kiro, OpenCode, Cursor, GitHub Copilot) plus the `DurableSquad` remote backend.
**Executable contract:** `test/squad-20-security-contracts.test.ts`

## 1. Trust model

| Actor | Trust | Notes |
|---|---|---|
| Client / harness (any of the five) | **Untrusted caller** | Prompt-injectable; may replay, reorder, or tamper with requests. |
| Projected files (`.claude/`, `.kiro/`, `.opencode/`, `.cursor/`, `.github/`, `.agents/`, `.squad/`, MCP configs) | **Untrusted input** | Writable by the user, other tools, and cloned repos. |
| Control Plane / Broker | **Trusted** | Sole authority for state writes, memory governance, approvals, leases. |
| `DurableSquad` remote backend | Trusted only through broker-issued epochs and idempotency keys | Network is hostile; replays and partitions are expected. |

### Control Plane / Broker invariants
- **B1** Clients never write `.squad/` state, decisions, or memory directly; every mutation is a broker proposal.
- **B2** Approvals are **hash-bound**: approval = SHA-256 over canonicalized `{runId, action, args, epoch}` (sorted keys). Any change to the proposal invalidates it (no TOCTOU).
- **B3** Approvals are single-use; replay of the same `(runId, seq)` returns the recorded result, never re-executes.
- **B4** Broker never trusts client-supplied identity, epoch, or paths; they are re-derived/validated.
- **B5** Secrets are never persisted into projections, logs, or proposals; env values matching `token|secret|key|password|pat` are redacted in all diagnostics.

## 2. Safe MCP configuration merging

Targets: `.mcp.json`, `.kiro/settings/mcp.json`, `opencode.json` (key `mcp`), `.cursor/mcp.json` (refs #1893, #1296).

- **M1** Merge is additive and scoped to Squad-owned server names; unrelated servers and top-level keys are preserved byte-semantically.
- **M2** Existing user `env` values win over Squad defaults; user env is never dropped or rewritten.
- **M3** Malformed JSON, non-object roots, or wrong-typed containers abort with no write (never "repair by overwrite").
- **M4** Server names must match `^[A-Za-z0-9._-]{1,64}$`; `__proto__`/`constructor` rejected; objects built without prototype pollution.
- **M5** `command` is a single executable token: no whitespace or shell metacharacters (`; & | \` $ < > \n`), and shell interpreters (`sh`, `bash`, `cmd`, `powershell`, `pwsh`) are rejected. Arguments must be strings; remote `url` must be `https`.
- **M6** Writes are atomic (temp file + rename in same dir), idempotent, and validated before touching disk.
- **M7** Secrets are referenced (env passthrough / `${VAR}`), never inlined by Squad.

## 3. Path, symlink & reparse-point guards

Applies to every skill/agent/config path under `.claude/`, `.kiro/`, `.opencode/`, `.cursor/`, `.github/`, `.agents/`, `.squad/`.

- **P1** Reject `..` segments (both `/` and `\`), absolute paths, drive-relative paths, UNC paths, NUL bytes, and NTFS alternate data streams (`:`).
- **P2** Walk each path segment with `lstat`; reject any symlink, dangling symlink, or NTFS junction/mount point (`FILE_ATTRIBUTE_REPARSE_POINT`, 0x400) — including the client directory itself.
- **P3** Verify the final path is within `realpath(root)` after resolution.
- **P4** Guards run on read **and** write, and again immediately before use (re-check to narrow TOCTOU; prefer `O_NOFOLLOW`/handle-based opens where available).
- **P5** Windows tests must exercise a real `mklink /J` junction.

## 4. State-backend isolation

- **S1** Each worktree has its own state namespace; no shared mutable file between worktrees. Cross-worktree reads go through the broker.
- **S2** Single writer via lease. Every lease acquisition bumps a strictly monotonic **epoch**; every write carries `(holder, epoch)`.
- **S3** Writes from a stale epoch or non-holder are **fenced** (rejected) with no partial effect.
- **S4** `DurableSquad` conversations are addressed by `(runId, seq)`; the backend treats duplicates as idempotent replays and out-of-order/gapped sequences as errors.
- **S5** A fenced client must re-acquire and re-read state before retrying; it cannot "resume" an old epoch.

## 5. Security gates (CI-blocking)

| Gate | Requirement |
|---|---|
| G1 | Contract suite `squad-20-security-contracts.test.ts` passes on Linux, macOS **and Windows**. |
| G2 | Every client projection routes all file access through the shared path guard (P1–P4); no direct `fs` on projected paths. |
| G3 | Every MCP writer uses the shared merge function (M1–M7); golden tests per client file. |
| G4 | Broker rejects unsigned/unbound approvals; fuzz test on proposal tampering. |
| G5 | Fencing integration test with two concurrent worktrees and a simulated lease takeover. |
| G6 | Secret scan on generated projections and logs. |
| G7 | `clients[]` non-authority: capability negotiation test (exhaustive ∩) and portable-config rejection tests pass (§7). |
| G8 | Versioned approval + `runId` cancellation contract tests pass (§8). |
| G9 | Golden Cross-Adapter Conformance Trace passes for all five projections (§9). |

## 6. Known gaps / follow-ups
- Reference guards live in the test file; production code must adopt them and the suite should then import the real modules.
- Windows attribute-bit detection relies on Node reporting junctions as symlinks; add a native check if that changes.
- `DurableSquad` wire protocol auth (token binding to epoch) is not yet specified.
- Cursor expiry/retention policy is unspecified; the reference accepts any previously issued cursor.

## 7. Configured vs. negotiated capabilities

Persisted `clients[]` in `.squad/config.json` is **projection config only**. It decides which client files are generated; it never grants execution authority.

- **C1** `effectiveCapabilities = clientCapabilities ∩ backendCapabilities ∩ policyCapabilities`, computed at session negotiation, not at config load.
- **C2** Any capability a client adapter requests that is absent from `backendCapabilities`, explicitly denied, or not granted by `policyCapabilities` is **stripped** and reported with a reason (`not-in-backend`, `denied-by-policy`, `not-granted-by-policy`). Explicit deny beats grant.
- **C3** With no negotiated session, authorization fails closed. Widening `clients[]` on disk can never widen `effectiveCapabilities`.
- **C4** In projection artifacts, `clients[].capabilities` is emitted as `requestedCapabilities`. Artifacts are built from a field whitelist; unknown fields are dropped, not copied.
- **C5** Portable `clients[]` and every client projection artifact MUST NOT contain credentials (key or value), provider thread IDs, machine-specific absolute paths (POSIX, drive, UNC, `~`), lease tokens, or raw checkpoint state. Loading a config that violates this is refused.

## 8. Versioned durable approvals & `runId` cancellation

An approval is a versioned resource: `{ approvalId, version, scope, expiresAt, status, runId, payloadHash }`.

- **A1** `version` increments on every state transition: `v1` requested → `v2` decided (or expired).
- **A2** `payloadHash = sha256(canon({runId, scope, payload}))`. A decision carrying a stale `version` or a mismatched `payloadHash` is rejected with no state change.
- **A3** A decided or expired approval is terminal; replaying the v1 decision is rejected as stale, so side effects run at most once.
- **A4** Expiry is durable and enforced at decision time (`now >= expiresAt`).
- **A5** Cancellation targets the stable `runId`, never a turn `seq`. It is idempotent, and a no-op once the run is terminal. Exactly one terminal event per run; the first terminal transition wins a cancel-vs-complete race.
- **A6** Turn acceptance is sequenced by `seq` (gap/duplicate-runId rejected; same `(runId, seq)` is an idempotent replay), but `seq` is not an identifier for control operations.

## 9. Loss-tolerant projection & golden conformance trace

- **L1** Unknown future event kinds (e.g. `x-future.event`, or a missing/non-string `kind`) are preserved verbatim in canonical history (malformed input becomes `x-unknown` with the raw payload). Projections pass them through and clients render `unsupported:<kind>`; none may crash.
- **L2** Disposable telemetry (`telemetry.*`) is separate from durable events: bounded, never replayed, never part of canonical history or event ids.
- **L3** Client cursor payload exposes only `{ cursor, lastAcceptedSeq, resumable }`. Lease tokens and checkpoint state stay server-side behind the opaque cursor; forged, tampered, or cross-session cursors are rejected.

**Golden Cross-Adapter Conformance Trace** (must pass for `copilot`, `claude`, `kiro`, `opencode`, `cursor`):

`TurnAccepted(runId, seq)` → stream partial output → `ApprovalRequested(v1)` → disconnect → `reconnect(cursor)` → `ApprovalDecided(v2)` → race `CancellationRequested(runId)` against completion → terminal state

Assertions: identical canonical history across all five projections (wire formats may differ); no duplicate events or side effects on reconnect or stale-decision retry; exactly one terminal state; no lease/checkpoint material in any client-visible payload.
