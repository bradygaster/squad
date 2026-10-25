---
title: Multi-Machine Watch with Work Claims
description: Run squad watch --execute on several machines or pods without two of them working on the same issue, using opt-in Git-ref work claims.
---

# Multi-Machine Watch with Work Claims

> Run `squad watch --execute` on more than one machine, dev box, or pod
> against the same repository, and let work claims decide which watcher
> works on each issue.

Work claims are opt-in and off by default. The design and its guarantees
are recorded in
[ADR-002: Work Claims and External Work Queues](https://github.com/bradygaster/squad/blob/dev/docs/specification/adr-002-work-claims-and-external-queues.md).

## Why: double-pick

Without claims, every watcher fetches the same open, unassigned issues and
hands them to its own agent session. Nothing arbitrates between watchers,
so the same issue is worked on more than once when:

- two machines run `squad watch --execute` against one repository;
- several [KEDA](../features/keda-scaling.md) pods run watchers;
- one watcher runs `dispatchMode: hybrid`, where `execute` and
  `fleet-dispatch` both see overlapping issues.

Assigning the issue does not help. `gh issue edit --add-assignee` is
additive, pods that share one account all "win", and Azure DevOps `@me`
does nothing.

The hybrid case is fixed for everyone: one watch round never dispatches an
issue twice, with or without claims. Claims are for the cross-process
cases.

## How claims work

Before dispatching an issue, the watcher writes a claim: one Git ref on a
shared remote, created with an atomic compare-and-swap push. The Git server
decides every race, so at most one watcher wins.

| Item | Value |
|---|---|
| Work key | `<platform>:<owner/repo>#<id>`, lower-cased platform and repository, for example `github:bradygaster/squad#123` |
| Claim ref | `refs/squad/claims/<sha1 of the work key>` |
| Claim commit | Empty tree; the message is a JSON record with holder, epoch, and expiry; authored as `squad-claims <squad-claims@invalid>` |
| Lease | 15 minutes by default, renewed every 5 minutes (one third of the lease) while the agent runs |
| Release | The ref is deleted when the agent session ends |

Each round, for each eligible issue the watcher gets one of three answers:

- **Won**: the issue is dispatched. The agent prompt lists it as claimed
  for this session, and the agent is told to work only on claimed issues.
- **Held**: another watcher holds an unexpired claim. The issue is skipped.
- **Unavailable**: the remote could not be read or written (network,
  authentication, rejected ref). The issue is skipped and a warning is
  printed. The watcher never dispatches work it could not claim.

If a renewal shows that another watcher took the claim over (`fenced`), or
renewals keep failing until the lease is about to expire (`lost`), the
watcher kills the agent's whole process tree. A claim left behind by a
crashed watcher expires and another watcher takes it over.

Claims are acquired one issue at a time. If acquiring the rest of a batch
takes so long that an earlier claim reaches its renewal deadline, the watcher
renews that claim before dispatch and skips the issue if the renewal fails.

## Enable claims

Every watcher that may compete for the same issues must enable claims with
the **same remote repository** and the **same `refPrefix`**. A watcher
without claims, or one that writes to a different namespace, is invisible to
the others.

From the command line:

```bash
squad watch --execute --claims git-ref
```

Or in `.squad/config.json`, so every machine that shares the team picks it
up:

```json
{
  "watch": {
    "claims": "git-ref"
  }
}
```

With tuning options:

```json
{
  "watch": {
    "claims": {
      "provider": "git-ref",
      "ttlMs": 900000,
      "skewMarginMs": 120000,
      "remote": "origin",
      "refPrefix": "refs/squad/claims/"
    }
  }
}
```

| Key | Default | Meaning |
|---|---|---|
| `provider` | `none` | `none` (no cross-process exclusion) or `git-ref` |
| `ttlMs` | `900000` (15 minutes) | Lease length. Renewal runs every `ttlMs / 3` |
| `skewMarginMs` | `120000` (2 minutes) | Clock-skew allowance before an expired claim may be taken over |
| `remote` | `origin` | Remote name or URL that holds the claim refs |
| `refPrefix` | `refs/squad/claims/` | Ref namespace for claims; must start with `refs/` and end with `/` |

Rules:

- `--claims` overrides the provider in `config.json`; the other keys are
  kept.
- Lease timing must satisfy 30 seconds ≤ `ttlMs` ≤ 24 hours,
  `skewMarginMs` ≤ 1 hour, and `ttlMs` > 2 × `skewMarginMs`. Otherwise
  watch refuses to start.
- A `.squad/config.json` that is not valid JSON, or a `watch.claims` value
  that does not parse, stops watch instead of running without claims.
  Unknown keys under `watch.claims` print a warning and are ignored.
- Claims need a stable repository for the work key. Watch reads it from
  the issue URL or the `origin` remote; without one, issues are skipped as
  unavailable.

Keep `ttlMs` well above your Git round-trip time. Long agent sessions are
fine: the watcher keeps renewing for as long as the agent runs.

## Identity

Each claim record names its holder:

| Field | Source |
|---|---|
| `machineId` | First set of: `SQUAD_MACHINE_ID`, the `machine` field of the machine capabilities file, `SQUAD_POD_ID` (each used verbatim), otherwise `h-` plus 12 hex digits of a salted hostname hash |
| `instanceId` | A random UUID per watch process, so two watchers on one machine are distinct holders |
| `actor` | The watch auth user, when configured; informational only |

Set `SQUAD_MACHINE_ID` to a stable, readable name so you can tell holders
apart when you inspect claims:

```bash
export SQUAD_MACHINE_ID=devbox-7
squad watch --execute --claims git-ref
```

```powershell
$env:SQUAD_MACHINE_ID = 'devbox-7'
squad watch --execute --claims git-ref
```

Claim records are readable by anyone who can fetch the remote, and claim
commits can still be fetched by SHA after release. On public repositories,
use a pseudonym rather than a real hostname or person's name. The hashed
fallback exists so hostnames are not published by default; `capabilities`
`machine` and `SQUAD_POD_ID` values are published as written.

## Credentials and least privilege

The watcher needs **push rights to the claim remote**. It pushes and deletes
refs under `refPrefix` with the Git credentials of the team root checkout.

On most hosts, a token that can push any ref can push every ref, including
branches and workflow files. To limit what a leaked claim credential can do:

- Point `remote` at a **dedicated, claims-only repository** that holds no
  code, and give watchers write access only there. Every watcher must use
  the same claims repository.

  ```bash
  git remote add claims https://github.com/my-org/squad-claims.git
  ```

  ```json
  { "watch": { "claims": { "provider": "git-ref", "remote": "claims" } } }
  ```

- Or, per pod, use a GitHub App installation token with contents write
  and **without** `workflows` or administration permissions.

Remember that every agent session the watcher spawns runs with the same
credentials and reads untrusted issue text. Claims prevent duplicate work
between honest watchers; they are not a defense against prompt injection.
Keep agent effects repeat-safe and reviewable.

## What you'll see

At startup, watch prints the provider and its timing:

```text
🔒 Claims: git-ref — distributed exclusion, leases on, fencing on (ttl 15m, renew every 5m, skew 2m, remote origin)
```

With `--verbose`, watch also prints the holder identity
(`Claim holder: <machineId>/<instanceId>`) and the work repository.

Each round report adds a claims line when anything happened:

```text
  🔒 Claims (git-ref): won 2 · contended 1 · released 2 (completed 2)
```

| Counter | Meaning |
|---|---|
| `won` | Claims this watcher acquired |
| `contended` | Issues skipped because another watcher holds them |
| `unavailable` | Issues skipped because the claim could not be decided |
| `fenced` | Claims another watcher took over while this one held them; the agent was killed (or never started) |
| `lost` | Claims not renewed before expiry; the agent was killed (or never started) |
| `released` | Claims released, by outcome: `completed`, `cancelled`, or `abandoned` |
| `implausible` | Malformed or implausible claim records taken over as expired |

`squad watch --health` shows the same counters since startup for the
running watcher. With `OTEL_EXPORTER_OTLP_ENDPOINT` or `SQUAD_TELEMETRY=1`
set, they are also exported as OpenTelemetry counters
`squad.watch.claims.*`. See [Ralph — Work Monitor](../features/ralph.md)
for details. With `--claims none`, output is unchanged.

Warnings to watch for:

- `claim #123 unavailable: … — skipping`: the remote rejected or could not
  be reached. Check credentials and ref rules.
- `claim #123 fenced by <machineId>/<instanceId> — killing agent`: another
  watcher took the claim. Expect at most one renew interval of overlap.
- `claim … is implausible: … — taking it over as expired`: a malformed
  record was overwritten. Someone with push access wrote it.

## Troubleshooting

### An issue is never picked up

The issue shows up as `contended` (held) or `unavailable` every round.

1. List the claims on the remote:

   ```bash
   git ls-remote origin 'refs/squad/claims/*'
   ```

2. Find the ref for one issue. It is the SHA-1 of the work key:

   ```bash
   key='github:my-org/my-repo#123'
   ref="refs/squad/claims/$(printf '%s' "$key" | sha1sum | cut -c1-40)"
   ```

   ```powershell
   $key = 'github:my-org/my-repo#123'
   $bytes = [System.Text.Encoding]::UTF8.GetBytes($key)
   $hash = -join ([System.Security.Cryptography.SHA1]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
   $ref = "refs/squad/claims/$hash"
   ```

3. Read the claim record:

   ```bash
   git fetch origin "$ref"
   git log -1 --format=%B FETCH_HEAD
   ```

   Check `holder`, and `expiresAt` (Unix milliseconds).

What to do depends on the record:

- **Holder is alive and `expiresAt` keeps moving.** A watcher is still
  running an agent on it, which is expected for long sessions. Stop that
  watcher if the session is stuck.
- **`expiresAt` is in the past.** Do nothing. The next watcher round takes
  the claim over once `expiresAt` plus `skewMarginMs` has passed.
- **The record does not parse, or `expiresAt` is far in the future and no
  watcher owns it.** Watchers will not overwrite it. Confirm the holder is
  not running, then delete the ref. Prefer a lease-safe delete that fails
  if the claim changed since you looked:

  ```bash
  sha=$(git ls-remote origin "$ref" | cut -f1)
  git push --force-with-lease="$ref:$sha" origin ":$ref"
  ```

  The unconditional form, `git push origin --delete "$ref"`, also works but
  can remove a claim that a live watcher just renewed. If you delete a live
  claim, its watcher is fenced at its next renewal and kills its agent, and
  another watcher may start the same issue in the meantime.

### Every claim is unavailable: the host rejects custom refs

Some hosts and rulesets reject pushes outside `refs/heads/` and
`refs/tags/`. Use the fallback namespace on **every** watcher:

```json
{
  "watch": {
    "claims": { "provider": "git-ref", "refPrefix": "refs/heads/squad-claims/" }
  }
}
```

Claims then appear as branches named `squad-claims/<sha1>`. Every acquire
and release creates or deletes a branch, so:

- exclude `squad-claims/**` from workflow `push` and `create` / `delete`
  triggers (for example with `branches-ignore`);
- exclude `squad-claims/**` from branch protection rules and rulesets that
  would block force-with-lease pushes or deletions.

### Watch refuses to start

- `Invalid claims configuration` or a `.squad/config.json watch.claims`
  error: fix the value; watch fails closed rather than running without
  claims.
- Lease timing errors: adjust `ttlMs` and `skewMarginMs` to the bounds
  above.

## Limits

- **At-least-once delivery.** Claims exclude other watchers while a lease
  is valid, but duplicates are still possible: clock skew larger than
  `skewMarginMs`, a suspended or hung holder, a deleted claim, or a crash
  after the agent pushed. Keep effects idempotent: deterministic
  `squad/{issue}-{slug}` branch names, a check for an existing pull
  request, and marker-keyed comments.
- **Killing an agent doesn't undo its effects.** Pushes, pull requests, and
  comments made before the kill remain.
- **No janitor yet.** Claims left by crashed watchers stay on the remote
  until another watcher takes them over (only while the issue is still
  eligible) or you delete them, and claim commits stay reachable by SHA.
  Prune by hand if the namespace grows.
- **Process tree kill.** On Linux and macOS, agents run in their own
  process group, which is sent `SIGKILL` when a claim is fenced or lost,
  and when watch exits. On Windows, watch runs `taskkill /T /F` on the
  agent's process tree; if that fails, only the direct child is killed and
  grandchild processes can survive.
- **Batches.** When one agent session gets several issues, every claim is
  held and renewed for the whole session, which delays other watchers.
- **Shared namespace.** Exclusion only covers watchers that use the same
  claims remote and `refPrefix`.

## gh-aw work queue

Squad is not a worker for the
[GitHub Agentic Workflows](../guide/gh-aw.md) (gh-aw) work queue. gh-aw
queue workers are gh-aw-compiled Actions workflows launched by the queue,
and a local `squad watch` process cannot be one. Work claims don't depend
on gh-aw and work the same with or without it.

Integration with the gh-aw work queue is deferred until the gates in
[ADR-002](https://github.com/bradygaster/squad/blob/dev/docs/specification/adr-002-work-claims-and-external-queues.md#gh-aw-adapter-gates)
pass, including a stable queue protocol and daily use of `git-ref` claims
on at least two machines.

## See also

- [Ralph — Work Monitor](../features/ralph.md): all `squad watch` flags
- [KEDA Autoscaling](../features/keda-scaling.md): running watchers as pods
- [Capability Routing](../features/capability-routing.md): send work to
  machines with specific hardware using `needs:*` labels
- [Multi-Codespace](multi-codespace.md): split work between instances by
  label with SubSquads
