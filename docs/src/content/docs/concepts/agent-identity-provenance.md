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

## Lifecycle and collision rules

- **Uniqueness:** Agent IDs and case-folded display names are unique within one
  registry. Producers reject collisions rather than adding suffixes.
- **Rename or recast:** Preserve the agent ID and `created_at`; update
  `display_name`, `persistent_name`, `universe`, and `updated_at`.
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

## Fetch, permissions, and caching

Reading the registry requires repository Contents read permission and one
content fetch. A repository-path avatar requires one additional content fetch
for that agent. Consumers should cache the registry by Git blob SHA, ETag, or
equivalent immutable revision marker and revalidate normally. The root
`revision` is monotonic producer metadata, not a substitute for transport cache
validation.

Avatar references are optional and restricted to `.squad/agents/`. When the
field is absent, stale, inaccessible, or malformed, render no avatar. Do not
generate initials, Gravatars, GitHub actor images, or other inferred identity.
