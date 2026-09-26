---
title: Agent identity provenance
description: The versioned Squad-owned contract for stable agent identity metadata.
---

Squad publishes authoritative agent identity metadata at
`.squad/casting/registry.json`. Consumers such as dashboards and renderers must
use this record instead of inferring identity from a roster row, goal owner,
issue assignee, pull request author or reviewer, workflow actor, branch name, or
any other incidental signal.

## Version 1 contract

The root schema identifier is `squad-agent-provenance/v1`. Each key in
`agents` is an immutable lowercase kebab-case agent ID. The record contains a
mutable `display_name`, a compatibility alias named `persistent_name`, the
agent role and universe, lifecycle timestamps, status, and an optional avatar.

```json
{
  "schema": "squad-agent-provenance/v1",
  "schema_version": 1,
  "revision": 4,
  "transaction_id": "52ab75df-79de-44e7-b0b7-521a45b49204",
  "generated_at": "2026-09-21T20:00:00.000Z",
  "agents": {
    "runtime-engineer": {
      "display_name": "Kepler",
      "persistent_name": "Kepler",
      "role": "Runtime Engineer",
      "universe": "descriptive",
      "status": "active",
      "created_at": "2026-09-20T20:00:00.000Z",
      "updated_at": "2026-09-21T20:00:00.000Z",
      "avatar": {
        "kind": "repository-path",
        "path": ".squad/agents/runtime-engineer/avatar.png"
      }
    }
  }
}
```

`persistent_name` is retained for older Squad readers and must equal
`display_name`. New consumers should use the object key as the stable ID and
`display_name` for presentation.

`transaction_id` is additive publication metadata. Managed
`casting/history.json` files carry the same `transaction_id` plus a
`registry_revision` equal to the registry `revision`. Consumers that require a
consistent registry/history pair must use the SDK pair reader, which validates
those fields and the durable commit manifest. Registry-only consumers may
continue reading `registry.json` directly.

## Lifecycle and collision rules

- **Uniqueness:** Canonical IDs use lowercase alphanumeric segments separated
  by single hyphens. IDs and case-folded display names are unique within one
  registry. Producers reject collisions rather than adding suffixes.
- **Rename or recast:** The producer must supply the existing stable ID
  explicitly; it never discovers identity from display name, role, roster,
  label, path, or other incidental data. Preserve `created_at` and immutable
  `role`; update `display_name`, `persistent_name`, `universe`, and `updated_at`.
- **Deletion:** Preserve a tombstone with `status: "retired"`, `retired_at`, and
  the original ID. An ID is never reassigned.
- **Reactivation:** A producer may reactivate the same logical agent under its
  original ID. It must not assign that ID to a different role.
- **Partial data:** Invalid individual records are excluded by the SDK parser
  and reported as a partial result. Consumers may render valid records but must
  expose that identity data is incomplete.
- **Missing or malformed data:** Treat identity provenance as unavailable. Do
  not fall back to owner, assignee, author, reviewer, actor, branch, or roster
  display data.
- **Legacy migration:** A legacy root is accepted only when every record has a
  canonical ID plus valid name, lifecycle, universe, and timestamps. Any
  malformed record rejects the whole producer update; migration never drops it.
- **Concurrent producers:** Presets and CLI Cast share one durable directory
  lock. Registry/history updates publish through a roll-forward transaction;
  pair readers accept only a complete legacy pair or a stable manifest-backed
  pair. Each successful update observes the latest revision, increments it,
  and preserves all unclaimed IDs as tombstones.

## Consistency, durability, and recovery boundaries

On a local filesystem that provides atomic same-filesystem rename, the shared
lock, transaction journal, commit manifest, and pair reader provide
**process-crash consistency**. A crash before the journal is durable leaves the
previous pair authoritative. After the journal is durable, recovery rolls the
transaction forward. Pair readers retry an in-progress state for a bounded
period and then reject it rather than returning a torn registry/history pair.

**Power-loss durability is conditional.** The implementation calls fsync on
each payload or replacement file and the relevant payload and parent
directories, but persistence across power loss depends on every fsync
succeeding and on the operating system, storage device, and filesystem
honoring those operations and atomic rename semantics. If a required file or
directory fsync reports an error, the writer fails closed; it does not report
the update as durably committed. A filesystem that does not provide local
atomic rename guarantees, including some network filesystems, is outside the
full guarantee: even if its APIs return success, power-loss durability and
cross-process consistency are only as strong as that filesystem's documented
semantics. Use a supported local filesystem when the full guarantee is
required.

Stale-lock recovery deliberately favors safety over availability. Squad
automatically removes an abandoned writer lock only when it is old, belongs to
the current host, and the owner PID is definitively dead. An owner on another
host, an indeterminate PID, or an abandoned recovery guard is not broken
automatically; writers time out and require operator intervention after
verifying that no writer or recovery operation is active. This can delay
updates, but prevents an uncertain recovery from admitting concurrent writers.

## Fetch, permissions, and caching

Reading the registry requires repository Contents read permission and one
content fetch. A repository-path avatar requires one additional content fetch
for that agent. Consumers should cache the registry by Git blob SHA, ETag, or
equivalent immutable revision marker and revalidate normally. The root
`revision` is monotonic producer metadata, not a substitute for transport cache
validation.

Avatar references are optional and restricted to the owning ID's exact,
case-sensitive `.squad/agents/{id}/` directory. Recasts preserve an existing
avatar when no avatar operation is supplied; an explicit producer clear removes
it. When the field is absent, stale, inaccessible, or malformed, render no avatar. Do not
generate initials, Gravatars, GitHub actor images, or other inferred identity.

## Work-to-agent binding contract

The registry does not identify which agent owns a particular goal, epic, or
task. Squad activation artifacts therefore include a non-empty `Activation
bindings:` JSON array using `squad-work-agent-binding/v1`:

```json
[
  {
    "binding_schema": "squad-work-agent-binding/v1",
    "binding_version": 1,
    "producer": "squad",
    "repository": "owner/repository",
    "origin_issue": 45,
    "artifact": "activated",
    "registry_schema": "squad-agent-provenance/v1",
    "registry_revision": 4,
    "task": "1",
    "issue": "#2066",
    "epic": "1.1",
    "epic_issue": "#2065",
    "agent_id": "runtime-engineer",
    "epic_agent_ids": ["runtime-engineer"]
  }
]
```

The repository and origin issue identify the goal, `issue` identifies the task,
and `epic_issue` identifies its parent work artifact. The producer copies
`agent_id` values directly from the committed registry revision into the
accepted plan and then the activation record. Display names, labels, owners,
assignees, authors, reviewers, workflow actors, branches, and roster rows are
never alternate binding sources.

Rename does not change historical bindings. Retirement leaves the ID resolvable
through its tombstone; it does not transfer work to another agent. A current
registry newer than `registry_revision` may resolve the historical ID. A
binding revision newer than the available registry is stale and unavailable.
Every row in one binding artifact names the same registry revision; consumers
reject mixed revisions rather than reconciling rows against different identity
snapshots.

Missing IDs are allowed only for explicitly external, non-roster, or legacy
plan assignments: `agent_id` is `null` and `identity_omission_reason` explains
why. If any epic member lacks an ID, its records add
`epic_identity_omission_reason: "partial"` and list only known IDs. Every row
for an epic carries the same sorted `epic_agent_ids` set, equal to all known
task-agent IDs for that epic. The partial marker appears on every row if any
task omits `agent_id`, and on no row when the epic identity set is complete.
One binding document uses one registry revision and maps each epic identifier
to exactly one epic issue, and each epic issue back to exactly one identifier.

Consumers fail closed for a missing, empty, malformed, partially valid,
wrong-repository, wrong-origin, unsupported-version, unknown-ID, or
future-revision binding array, and for duplicate task/issue bindings or
conflicting epic mappings, revisions, identity sets, or omission markers. A partial registry may still support plain
metadata rendering, but it cannot authoritatively resolve work bindings. They
must not salvage valid-looking rows or infer
the missing identity. Fetching the activation artifact requires Issues read;
resolving its IDs adds the same one Contents fetch for the registry described
above. No additional per-task fetch is required.
