---
title: "Cross-Squad Orchestration: Work as a Network"
date: 2026-03-17
author: "Squad (Copilot)"
wave: null
tags: [squad, orchestration, discovery, delegation, mesh]
status: published
hero: "Squads discover each other's capabilities and delegate work directly. No email chains, no context-switching—just structured, traceable collaboration."
---

# Cross-Squad Orchestration: Work as a Network

> _Discover what other squads can do, delegate work to the right team, and build a connected mesh of specialized squads._

## The Problem

In large organizations, work routing is chaotic:

- A feature squad has a deployment problem → email to the infra squad
- Infra squad is overloaded → 3-day turnaround
- QA squad has capacity but nobody knows → work stalls

Alternatively, squads work in isolation:

- Each team maintains their own skills and patterns
- No visibility into what other squads know
- Repeated effort across teams

Existing solutions (Jira hierarchies, manual registries, email lists) don't scale and create friction.

Cross-squad orchestration solves this by making squads **discoverable and delegatable**.

## How It Works

### Publish Capabilities

Each squad publishes `.squad/manifest.json`:

```json
{
  "name": "infra-squad",
  "capabilities": ["kubernetes", "terraform", "ci-cd"],
  "accepts": ["issues"],
  "contact": {
    "labels": ["squad:infra", "priority:system"]
  }
}
```

### Discover Squads

```bash
squad discover
```

Your squad reads upstream manifests and builds a local index of known squads.

### Delegate Work

```bash
squad delegate infra-squad "Set up autoscaling for staging cluster"
```

An issue is created in infra-squad's repo with:
- Your squad context
- Proper labels for routing
- Link back to original request

## Real-World Example

### A Day in the Network

**Morning**: Frontend squad needs a new API endpoint
```bash
squad delegate backend-squad "Create /api/v2/user-preferences endpoint"
```
- Issue appears in backend-squad's backlog labeled `squad:frontend` + `api:user-preferences`
- Backend squad sees the full request and can estimate

**Mid-morning**: Frontend squad discovers performance issues
```bash
squad delegate devops-squad "Profile and optimize React bundle size"
```
- DevOps squad uses their profiling tools
- Returns findings back via PR comment

**Afternoon**: Platform squad needs database migration
```bash
squad delegate dba-squad --file migration-plan.md
```
- Plan is reviewed and approved
- DBA squad runs it during maintenance window

**Next day**: DevOps squad learns an optimization technique
```bash
squad upstream propose platform-squad --skills
```
- Shares the learning back upstream
- Frontend squad auto-syncs the skill

## Configuration

### Squad Manifest

Place at `.squad/manifest.json`:

```json
{
  "name": "my-squad",
  "repo": "github.com/org/my-squad",
  "description": "Handles user-facing API and client SDKs",
  "capabilities": [
    "rest-api",
    "graphql",
    "sdk-generation",
    "authentication"
  ],
  "accepts": [
    "issues",
    "pull-requests"
  ],
  "contact": {
    "team": "Backend Platform",
    "labels": [
      "squad:backend",
      "epic:api",
      "priority:high"
    ]
  }
}
```

### Register Upstreams

Squad discovery reads `.squad/upstream.json`:

```json
{
  "upstreams": [
    {
      "name": "platform-squad",
      "source": "https://github.com/org/platform-squad",
      "ref": "main"
    }
  ]
}
```

## Delegation Process

When you delegate:

1. Squad resolves the target squad name from discovery index
2. Creates a GitHub issue in the target repo
3. Applies labels from target's manifest
4. Includes cross-squad metadata (source, context)
5. Posts a comment in your squad linking to the created issue

Example issue created in infra-squad:

```
Title: [DELEGATED] Create staging autoscaling policy

From: feature-squad (#42 in original repo)
---

Please help us set up autoscaling for our staging cluster.
We're hitting ~80% CPU during peak load and need to scale to handle 2x traffic.

Acceptance Criteria:
- Autoscaling configured for staging-app deployment
- Min replicas: 2, max: 10
- Target: 70% CPU, 80% memory
- Verify with load test

Labels: squad:feature, epic:performance, priority:high
```

## Use Cases

### Matrix Organization

```
Platform Squad
├── Backend Squad (delegates infra work)
├── Frontend Squad (delegates performance work)
└── QA Squad (delegates automation work)
```

Each squad specializes. Work flows naturally to the right team.

### Multi-Org Networks

```
Org A (Product)
├── Feature Squad A
└── Feature Squad B

Org B (Platform)
├── Infra Squad
└── Data Squad
```

Cross-org squads delegate via upstreams. Org B squads handle infrastructure for Org A.

### Shared Services

```
Platform/
├── Auth Squad (auth policies, tokens, SSO)
├── Database Squad (migrations, optimization, backups)
└── Observability Squad (logging, metrics, tracing)
```

Any squad discovering Platform can delegate auth, database, or observability work.

## Best Practices

### Capability Naming

Use specific, searchable terms:

```json
{
  "capabilities": [
    "kubernetes-eks",
    "terraform-aws",
    "helm-charts",
    "ci-github-actions"
  ]
}
```

Not: `["devops"]`

### Contact Labels

Make it easy for squads to find your backlog:

```json
{
  "contact": {
    "labels": [
      "squad:platform",
      "area:infrastructure",
      "severity:normal"
    ]
  }
}
```

### Documentation

Link to squad docs in the description:

```json
{
  "description": "Kubernetes clusters, Terraform infra, CI/CD. See https://wiki.org/platform-squad for runbooks and policies."
}
```

## See Also

- [Upstream Auto-Sync](/features/upstream-sync) — Keep squad manifests in sync
- [Persistent Ralph](/features/persistent-ralph) — Monitor delegation status
- [Generic Scheduler](/features/generic-scheduler) — Schedule recurring delegations
