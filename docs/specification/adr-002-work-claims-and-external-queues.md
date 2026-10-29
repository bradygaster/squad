# ADR 002: Work Claims and External Work Queues

**Status:** Proposed

**Implements:** `work.claim` from `squad-work-lifecycle/v0.1` and the
compare-and-swap claim requirement from `squad-automation/v0.1`

**Binding impact:** `squad-work-github/v0.1` §2 (claimed workspace)

**External reference:** gh-aw work queue at tag
[`v0.93.3`](https://github.com/github/gh-aw/tree/v0.93.3) (experimental)

## Context

### Double-pick today

`squad watch --execute` has no atomic claim. The execute capability
(`packages/squad-cli/src/cli/commands/watch/capabilities/execute.ts`) fetches
open issues, drops those that already have an assignee, and hands the rest to
one agent session whose prompt asks it to "pick up" unassigned work. Nothing
arbitrates between executors, so the same issue is dispatched more than once
when:

- two machines run `watch --execute` against one repository;
- several KEDA pods run watchers (`SQUAD_POD_ID`, squad-per-pod deployment);
- one process runs `dispatchMode: hybrid`, where `execute` and
  `fleet-dispatch` both run in the post-execute phase over overlapping issue
  sets.

GitHub "assign and verify" cannot arbitrate. `gh issue edit --add-assignee` is
additive, executors that share one account (the normal pod setup) all "win",
the GitHub adapter keeps only the first assignee, and Azure DevOps
`setAssignee('@me')` does nothing. This binding already says assignees are not
portable ownership.

The claim seam also cannot live on `PlatformAdapter`
(`packages/squad-sdk/src/platform/types.ts`): new required members would break
every GitHub, Azure DevOps, and Planner implementer. External watch
capabilities (`watch/external-loader.ts`) cannot replace the built-in
`execute` capability and have no claim hook.

### gh-aw work queue status

gh-aw ships a Git-backed work queue (`tools.work-queue`). At `v0.93.3`:

| Property | Evidence |
|---|---|
| Workers are gh-aw-compiled Actions workflows that accept `work_queue_assignment` (`worker: true`, `require-assignment: true`) | [reference L16][ref-l16], [L82-83][ref-l82] |
| Launch is one `workflow_dispatch` at a verified SHA tag `gh-aw/work-queue/<SHA>` | [reference L70][ref-l70], [ADR-68348][adr-68348] |
| Claims are bound to the Actions run (`Dispatch(bound, run_id)`, `run_attempt=1`) | [spec L1136][spec-l1136], [L1233][spec-l1233] |
| Running claims have no lease; lease expiry never releases them | [reference L135][ref-l135], [spec L1260][spec-l1260] |
| Finishing is an in-worker intent; operators can only cancel; agent-selected claiming and run-ID adoption are unsupported | [reference L101][ref-l101], [L237][ref-l237], [L360][ref-l360] |
| The Git ledger is authoritative; Issues are a one-way mirror | [reference L6][ref-l6], [ADR-67025][adr-67025] (Accepted) |
| Ledger writes compare-and-swap the exact expected ref | [spec L844][spec-l844] |
| Protocol is draft and current-only, with breaking upgrades | [spec L188][spec-l188], [ADR-64955][adr-64955] (Draft), [protocol upgrades][adr-upgrades] (Draft), [ADR-68827][adr-68827] (Proposed) |

The feature is published but pre-1.0, and its maintainer has said it is not
ready. A local `squad watch` process can therefore never be a gh-aw queue
worker. Squad's own gh-aw worker workflows (`workflows/package/squad-*-worker.md`,
pinned to gh-aw `v0.91.7`) are the natural future queue workers.

## Decision

### Two roles

| Role | Used when | Claim authority |
|---|---|---|
| `WorkClaimProvider` | Squad runs the executor: local watch, pods, dev boxes | Squad, through the provider in this ADR |
| External work dispatcher (future) | Another system runs the executor: gh-aw `submit-work` / `submit-graph`, cross-squad issues | The external system; Squad only produces and observes |

A gh-aw adapter never implements `WorkClaimProvider`. No gh-aw types or adapter
code are added until gates G1-G7 pass. Only vocabulary is aligned now: an
opaque claim `handle`, and `completed` / `cancelled` outcomes.

### Primitive: Git ref compare-and-swap

Each claim is one ref on the shared remote (default `origin` of the team root
repository). Every executor that may contend for the same work must use the
same remote.

- **Work key string:** `<platform>:<repo>#<id>`, with `platform` and `repo`
  lower-cased (for example `github:bradygaster/squad#123`).
- **Ref:** `refs/squad/claims/<sha1-hex(work key string)>`.
- **Commit:** empty tree; message is the JSON claim record below; parent is the
  previous claim commit for renew and takeover, none for acquire. Author and
  committer are always `squad-claims <squad-claims@invalid>` with a `+0000`
  date from the provider clock, never the local Git identity or time zone.
- **Handle:** the commit SHA the caller last observed or wrote. It is the
  expected old value for every later compare-and-swap.

```json
{
  "schema": "squad.claim/v1",
  "key": { "platform": "github", "repo": "bradygaster/squad", "id": "123" },
  "holder": { "machineId": "devbox-7", "instanceId": "1b4e…", "actor": "example-user" },
  "epoch": 1,
  "acquiredAt": 1793000000000,
  "expiresAt": 1793000900000,
  "nonce": "5f0c…"
}
```

Times are Unix milliseconds. `nonce` is random per commit, so two writes by
one holder at the same instant never produce the same commit SHA. The server's
atomic ref update decides every race; wall-clock time only decides when
takeover may be attempted.

**Plausibility.** Anyone who can push can write any record, so a reader treats
a claim commit as implausible, and takes it over as if expired (epoch restarts
at 1, compare-and-swap on the observed SHA, with an operator-visible warning
naming the ref), when it is larger than 64 KiB, its tree is not the empty tree,
it has more than one parent, its `epoch` exceeds 2^52, its `acquiredAt` is more
than 1 hour ahead of the reader's clock, or its `expiresAt` is more than
25 hours (maximum `ttlMs` plus 1 hour) ahead. A record that fails to parse
stays `unavailable`, so a newer schema is never overwritten.

| Operation | Transport | Result on CAS rejection |
|---|---|---|
| Acquire | Root commit, epoch 1; `git push --force-with-lease=<ref>: <remote> <sha>:<ref>` (ref must not exist) | Fetch the ref; `held` with the observed record |
| Renew | Child of `handle`, same holder, epoch + 1, new `expiresAt`; push with `--force-with-lease=<ref>:<handle>` | `fenced` with the observed record |
| Takeover | Only when observed `expiresAt + skewMarginMs < now`, or the record is implausible (below); child of the observed SHA, new holder, epoch + 1; push with lease on the observed SHA | `held` with the new observed record |
| Release | `git push --force-with-lease=<ref>:<handle> <remote> :<ref>` | Ref missing: `already-released`; ref moved: `fenced` |

Renew and takeover are fast-forwards, so hosts that block non-fast-forward
updates still accept them. Network or authentication failures return
`unavailable`; they never count as winning or losing.

**Fallback namespace.** If a host or ruleset rejects `refs/squad/*`, the
provider uses `refs/heads/squad-claims/<sha1-hex>` instead (configurable
prefix). Repositories using the fallback must exclude `squad-claims/**` from
workflow triggers and branch rules. The `git-ref-provider` spike decides
whether GitHub and Azure DevOps need it.

**Mirrors.** A provider may mirror a claim to an issue label, assignee, or
comment for people. Mirrors are informational and are never read to decide
ownership, the same stance gh-aw takes for its Issue mirror.

### Delivery semantics

- **At-least-once.** A claim excludes other holders while it is unexpired. A
  crash leaves the claim to expire, and another executor takes it over.
- **Fencing.** The holder renews every `ttlMs / 3`. A `fenced` result kills the
  spawned agent process tree. If renewals keep returning `unavailable`, the
  holder fences itself (kills the agent) once `now >= expiresAt - skewMarginMs`.
  That deadline remains armed while a renewal request is pending, so a hung
  provider cannot extend the agent's authority. Agent timeouts use the same
  whole-tree termination path, and claim release waits until termination has
  completed.
  Takeover waits until `expiresAt + skewMarginMs`, so overlap requires clock
  skew larger than the margin or a hung holder.
- **Idempotent effects.** Because duplicates remain possible, effects must be
  repeat-safe: deterministic `squad/{issue}-{slug}` branch names, an
  "open pull request already exists" check, and marker-keyed comments.
- **Batches.** When one agent session receives several issues, the executor
  holds and renews every claim for the whole session and releases each in
  `finally`. Claims are acquired one at a time, so before dispatch the
  executor renews in parallel any claim that reached
  `expiresAt - skewMarginMs` while the rest of the batch was being acquired,
  then performs one final liveness check across the whole batch. Any claim
  that is no longer live at that handoff is dropped, including an earlier
  renewal that became stale while another renewal was slow.
- **In-process dedupe.** One watch round never dispatches an issue twice
  (hybrid `execute` plus `fleet-dispatch`), whatever provider is configured.
  This is a bug fix, not opt-in behavior.

Initial defaults, tunable per provider: `ttlMs` 15 minutes, renew every 5
minutes, `skewMarginMs` 2 minutes. Configured values must satisfy
30 seconds ≤ `ttlMs` ≤ 24 hours, `skewMarginMs` ≤ 1 hour, and
`ttlMs` > 2 × `skewMarginMs`; otherwise watch refuses to start, because the
renew timer would fire back to back.

### Default and opt-in

The default provider is `none` (`NoopClaimProvider`), which preserves today's
cross-process behavior. Executors opt in with:

- `squad watch --claims <none|git-ref>`; or
- `.squad/config.json` `watch.claims`: either `"git-ref"` or
  `{ "provider": "git-ref", "ttlMs", "skewMarginMs", "remote", "refPrefix" }`.

The flag overrides the config. `claims` becomes a reserved watch config key;
unknown keys under it are warned about. Only an absent `.squad/config.json`
selects defaults: an unreadable, empty, or unparsable file stops watch instead
of silently running without claims.
Whether a later major version makes `git-ref` the default is decided after
gate G7.

### Contract

The SDK module is `packages/squad-sdk/src/ralph/claims.ts`, exported as
`@bradygaster/squad-sdk/ralph/claims`. The Git provider is `GitRefClaimProvider`
in `ralph/claims-git.ts`, with an injectable `GitTransport` and clock. Watch
receives the provider through `WatchContext.claims` and the identity through
`WatchContext.executor`; `PlatformAdapter` is unchanged.

```ts
export interface WorkKey {
  platform: string; // 'github' | 'azure-devops' | 'planner' | …
  repo: string;     // owner/name, org/project, or plan id
  id: string;       // issue or work item id
}

export interface ExecutorIdentity {
  machineId: string;
  instanceId: string; // crypto.randomUUID(), once per process
  actor?: string;     // platform login; informational only
}

export interface ClaimRecord {
  key: WorkKey;
  handle: string; // opaque CAS token; commit SHA for git-ref
  holder: ExecutorIdentity;
  epoch: number;
  acquiredAt: number; // Unix ms
  expiresAt: number;  // Unix ms
}

export type AcquireResult =
  | { status: 'acquired'; claim: ClaimRecord }
  | { status: 'held'; by: ClaimRecord }
  | { status: 'unavailable'; reason: string };

export type FinishOutcome = 'completed' | 'cancelled' | 'abandoned';

export interface WorkClaimProvider {
  readonly name: string;
  readonly guarantees: {
    exclusion: 'none' | 'local' | 'distributed';
    leases: boolean;
    fencing: boolean;
  };
  acquire(key: WorkKey, o: { ttlMs: number }): Promise<AcquireResult>;
  renew(
    c: ClaimRecord,
    o: { ttlMs: number },
  ): Promise<{ status: 'renewed'; claim: ClaimRecord } | { status: 'fenced'; by?: ClaimRecord }>;
  release(
    c: ClaimRecord,
    outcome: FinishOutcome,
  ): Promise<{ status: 'released' | 'fenced' | 'already-released' }>;
  inspect?(key: WorkKey): Promise<ClaimRecord | null>;
}

export function workKeyToString(key: WorkKey): string;

export function resolveExecutorIdentity(opts?: {
  capabilities?: { machine?: string } | null;
  actor?: string;
  env?: NodeJS.ProcessEnv;
}): ExecutorIdentity;

export class NoopClaimProvider implements WorkClaimProvider {}     // today's behavior
export class InMemoryClaimProvider implements WorkClaimProvider {} // tests, single process
```

Provider obligations:

- `acquire` is atomic: concurrent callers on one unexpired key get at most one
  `acquired`. Contention returns `held`; transport failure returns
  `unavailable`. Neither throws.
- `renew` and `release` compare-and-swap on `handle`. Renew increments `epoch`.
  Releasing a missing claim returns `already-released`.
- `resolveExecutorIdentity` takes `machineId` from the first value set, in
  order: `SQUAD_MACHINE_ID`, `capabilities.machine`, `SQUAD_POD_ID` (each used
  verbatim), then `h-` plus the first 12 hex digits of
  `sha256(os.hostname() + "\0" + salt)`, because claim records are readable by
  everyone who can fetch the remote. Watch salts with the absolute team root
  path, which is never published; the SDK default is the working directory.
  `instanceId` is generated once per process, so two watchers on one machine
  are distinct holders.

| Provider | `exclusion` | `leases` | `fencing` | Behavior |
|---|---|---|---|---|
| `NoopClaimProvider` | `none` | `false` | `false` | `acquire` always returns `acquired` with a synthetic record |
| `InMemoryClaimProvider` | `local` | `true` | `true` | Map plus injectable clock; one process only |
| `GitRefClaimProvider` | `distributed` | `true` | `true` | Git ref compare-and-swap as above |

### gh-aw adapter gates

Work on a gh-aw dispatcher or worker integration starts only when all pass:

| Gate | Requirement |
|---|---|
| `G1` | A maintainer declares the queue ready; ADR-64955 and the protocol-upgrades ADR are Accepted |
| `G2` | A tagged release ships with no outstanding major work-queue changesets, or a 1.0 compatibility promise exists |
| `G3` | Spec §9.1 gates for hosted SHA dispatch and supported-host refinement are green |
| `G4` | `stats`, `state`, and `inspect` have a versioned, stable `--json` schema |
| `G5` | gh-aw offers an external-worker or lease mode, or Squad decides that cloud execution means gh-aw workers and local watch only produces work |
| `G6` | Cross-repository routing (squad A's queue to squad B's workers) is answered |
| `G7` | This ADR's `git-ref` provider has run in daily use on at least two machines |

## Consequences

- Squad's `work.claim` and `automation.claim` drafts get one concrete,
  host-neutral implementation with no new dependencies.
- Watch gains exclusion without changing `PlatformAdapter` or the external
  capability contract.
- Executors that opt in need push rights to the claim namespace.
- Each eligible issue costs one push per round plus renewals, adding latency
  and ref churn.
- gh-aw stays decoupled: its protocol can break without touching the claim
  seam.

Accepted risks from the claim security review:

- **Writers are trusted.** Anyone with push access to the claim remote can
  forge, delete, or flood claim refs. Deleting a live claim lets another
  executor dispatch the same issue until the holder's next renewal fences
  it (at most one renew interval of duplicate work). A forged, unexpired,
  plausible record starves its issue until it expires or someone deletes
  it. This matches gh-aw's trust model.
- **Writers include agent sessions.** Every agent session spawned with the
  watcher's credential can write claim refs, and those sessions read
  untrusted issue text. Claims arbitrate between honest executors; they are
  not a prompt-injection defense. Idempotent effects bound the damage.
- **Least privilege depends on the host.** GitHub write tokens cover every
  ref, not just the claim namespace. Operators who need isolation point
  `remote` at a dedicated claims-only repository, or give each pod a GitHub
  App token without `workflows` or administration permissions.
- **Overlap is possible.** Clock skew larger than `skewMarginMs`, or a
  suspended holder, can overlap with a takeover until the holder's next
  renewal.
- **Kills do not roll back.** Killing a fenced agent does not undo pushes,
  pull requests, or comments it already made; delivery is at-least-once.
- **Claim records are visible.** `machineId`, `actor`, and timestamps are
  readable by anyone who can fetch the remote, and claim commits stay
  fetchable by SHA after release. Public repositories should set
  `SQUAD_MACHINE_ID` to a pseudonym.
- **No janitor.** Claims orphaned by crashes, and claim history, accumulate
  until pruned. In the fallback `refs/heads/squad-claims/` namespace every
  acquire and release creates or deletes a branch, and those events can
  trigger workflows.

## Risks

- Hosts or rulesets may reject custom ref namespaces; mitigated by the fallback
  namespace and the spike.
- Anyone with write access can forge or delete claim refs. This is the same
  trust model gh-aw accepts and is covered by the claim threat review.
- Clock skew beyond `skewMarginMs`, partitions, and hung holders can produce
  duplicates; idempotent effects bound the damage.
- Batch sessions hold claims for their whole duration and delay other
  executors.
- Remote state-ref compare-and-swap (#1211) must share conventions with this
  ADR rather than diverge.

## Alternatives considered

| Alternative | Outcome |
|---|---|
| Assign-and-verify on the issue | Rejected: additive, shared identities all win, Azure DevOps `@me` is a no-op |
| Claim methods on `PlatformAdapter` | Rejected: breaks existing adapters; claims are a separate concern |
| gh-aw backend through `loadExternalCapabilities` | Rejected: external capabilities cannot replace `execute` and have no claim hook |
| gh-aw queue as the claim backend | Rejected: gh-aw forbids external and agent-selected claiming |
| Machine-local locks or the local state backend | Rejected: exclusion only within one machine |
| Option B: lowest claim-comment ID wins after a settle delay | Alternative only if refs are blocked: needs no refs, but is noisy, depends on eventually consistent listing, and has no compare-and-swap for renew or release |
| Durable HTTP backend lease | Deferred: requires a server; may become another `WorkClaimProvider` |

## Related artifacts

- [Squad Work Lifecycle v0.1](work-lifecycle-v0.1.md) §4-6
- [Squad Automation v0.1](automation-v0.1.md)
- [Squad GitHub Work Lifecycle Binding v0.1](github-work-lifecycle-binding-v0.1.md) §2
- [ADR 001: Client, Control, and Execution Boundary](adr-001-client-control-execution-boundary.md)
- Issues #1211 (state-backend ref compare-and-swap), #1717 (worktree lease),
  #1477 (unattended watch hardening)

[ref-l6]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L6
[ref-l16]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L16
[ref-l70]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L70
[ref-l82]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L82-L83
[ref-l101]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L101
[ref-l135]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L135
[ref-l237]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L237
[ref-l360]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/reference/work-queue.md#L360
[spec-l188]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/specs/work-queue-specification.md#L188
[spec-l844]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/specs/work-queue-specification.md#L844
[spec-l1136]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/specs/work-queue-specification.md#L1136
[spec-l1233]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/specs/work-queue-specification.md#L1233
[spec-l1260]: https://github.com/github/gh-aw/blob/v0.93.3/docs/src/content/docs/specs/work-queue-specification.md#L1260
[adr-64955]: https://github.com/github/gh-aw/blob/v0.93.3/docs/adr/64955-git-backed-work-queue-coordination.md
[adr-67025]: https://github.com/github/gh-aw/blob/v0.93.3/docs/adr/67025-mirror-work-queue-work-to-github-issues.md
[adr-68348]: https://github.com/github/gh-aw/blob/v0.93.3/docs/adr/68348-dispatch-queue-launches-via-verified-sha-tags.md
[adr-68827]: https://github.com/github/gh-aw/blob/v0.93.3/docs/adr/68827-trusted-work-queue-dispatch-and-cached-control-client.md
[adr-upgrades]: https://github.com/github/gh-aw/blob/v0.93.3/docs/adr/work-queue-protocol-upgrades.md
