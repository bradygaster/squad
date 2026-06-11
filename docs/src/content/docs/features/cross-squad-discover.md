---
title: Cross-Squad Discover & Delegate
description: Discover other squads across repository boundaries and delegate work to them via squad discover and squad delegate.
---

# Cross-Squad Discover & Delegate

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to see what squads you can reach:**
```bash
squad discover
```

**Try this to send work to another squad:**
```bash
squad delegate platform-squad "Add monitoring dashboard for the auth service"
```

When you have multiple Squad-enabled repositories — a platform squad, a frontend squad, a data squad — you often need to ask the other squad to do something for you. Cross-squad orchestration lets a squad **discover** other squads and **delegate** issues to them, with proper labels and contact info, so the right team picks it up automatically.

Both commands work via GitHub issues — no shared infrastructure required. Each squad's manifest declares what it accepts and how to reach it.

---

## How it works

Each squad publishes a `.squad/manifest.json` file declaring:
- Its name and capabilities (e.g., `kubernetes`, `helm`, `monitoring`)
- Its GitHub repo (the contact)
- The labels to apply to cross-squad issues
- What work types it accepts (`issues`, `prs`)
- Named skills it offers

When you run `squad discover`, Squad reads manifests from:
- **Upstream** — repos declared in your `.squad/upstreams/`
- **Registry** — any registry sources configured
- **Local** — manifests inside the current repo

When you run `squad delegate <squad> "<description>"`, Squad finds the target manifest, creates a properly-labeled GitHub issue in its repo, and includes structured cross-squad metadata so the other squad's coordinator picks it up correctly.

---

## Commands

### `squad discover`

List known squads and their capabilities:

```bash
$ squad discover

Discovered Squads (3):

  Name             Capabilities                Repo                    Accepts
  ──────────────   ──────────────────────────  ──────────────────────  ────────
  platform-squad   kubernetes, helm, infra     myorg/platform          issues
  frontend-squad   react, design-system, ui    myorg/web-app           issues
  data-squad       etl, dbt, pipelines, ml     myorg/data-platform     issues, prs
```

If no squads are discovered, the output reminds you to configure upstreams or check that other repos have published `manifest.json` files.

### `squad delegate <squad-name> "<description>"`

Create a cross-squad work request in another squad's repository:

```bash
squad delegate platform-squad "Add Grafana dashboards for the auth service's p95 latency"
```

This creates an issue in `myorg/platform` titled `[cross-squad] Add Grafana dashboards...` with:
- Squad's discovered labels applied automatically
- A structured body with the originating repo, target squad, description, and acceptance criteria
- The created issue's URL printed to your terminal

Required:
- The target squad's manifest must include the work type — `accepts: ["issues"]` for the default delegation flow
- GitHub CLI (`gh`) installed and authenticated with permission to create issues in the target repo

---

## Publishing a manifest for your own squad

To make your squad discoverable by others, create `.squad/manifest.json`:

```json
{
  "name": "platform-squad",
  "version": "1.0.0",
  "description": "Infrastructure, Kubernetes, and platform services",
  "capabilities": ["kubernetes", "helm", "monitoring", "infra"],
  "contact": {
    "repo": "myorg/platform",
    "labels": ["cross-squad", "needs-triage"]
  },
  "accepts": ["issues"],
  "skills": ["k8s-deployment", "helm-chart-authoring", "prometheus-alerting"]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ | Human-readable name (e.g., `platform-squad`). Used in `squad delegate <name>`. |
| `version` | optional | Schema version for forward compatibility |
| `description` | optional | One-line summary shown in `discover` output |
| `capabilities` | ✅ | Tags other squads use to find you (`squad discover` filters here in future versions) |
| `contact.repo` | ✅ | GitHub repo in `owner/repo` format where issues get created |
| `contact.labels` | optional | Labels applied to every cross-squad issue (so your triage automation can find them) |
| `accepts` | ✅ | Work types: `["issues"]`, `["prs"]`, or both |
| `skills` | optional | Named skills your squad offers — informational today, filterable in future |

Commit `manifest.json` to your repo's `.squad/` directory and push. Other squads that have your repo in their upstream list will pick it up on next `squad discover`.

---

## What the delegated issue looks like

When `squad delegate` creates an issue, it uses this structured body so the receiving squad's coordinator can recognize and route it correctly:

```markdown
## Cross-Squad Work Request

**From:** this repository
**To:** platform-squad (myorg/platform)

### Description

Add Grafana dashboards for the auth service's p95 latency

### Acceptance Criteria

- [ ] Work completed and verified
- [ ] Originating squad notified of completion

*Created by squad cross-squad orchestration*
```

The receiving squad sees an issue with their `cross-squad` (and any custom) labels, structured metadata in the body, and clear acceptance criteria.

---

## Limitations in v0.10

- **No automatic completion notification.** When the receiving squad closes the issue, the originating squad doesn't get notified back automatically. Today you watch the issue manually or via standard GitHub notifications.
- **Discovery is upstream-driven.** A squad has to know about another squad (via an upstream declaration) before `discover` can see it. There's no global registry.
- **No capability filtering on delegate.** `squad delegate <name>` requires the exact squad name. You can't say "delegate this to any squad that has the `kubernetes` capability" — yet.
- **PRs aren't supported in the default flow.** Even though manifests can declare `accepts: ["prs"]`, the v0.10 `delegate` command only creates issues.

These are tracked for follow-up. For now, cross-squad orchestration is a useful but minimal MVP — it removes the "where do I file this?" friction and ensures the right team gets a properly-formatted request.

---

## See also

- [Distributed Mesh](/squad/docs/features/distributed-mesh/) — the broader cross-repo coordination architecture
- [Multiple Squads](/squad/docs/scenarios/multiple-squads/) — running several squads in one organization
- [Upstream Inheritance](/squad/docs/features/upstream-inheritance/) — how upstreams get discovered
