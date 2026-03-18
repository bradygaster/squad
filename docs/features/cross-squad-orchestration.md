# Cross-Squad Orchestration

**Try this to discover known squads:**
```
squad discover
```

**Try this to delegate work:**
```
squad delegate backend-squad "Optimize the API response time"
```

**Try this to see squad details:**
```
squad discover backend-squad
```

Cross-squad orchestration lets you discover other squads' capabilities and delegate work directly to them. Build a mesh of specialized squads that work together.

---

## What Cross-Squad Orchestration Does

Cross-squad orchestration enables squads to **discover each other** and **delegate work**. Instead of work bouncing between teams via email, or squads working in isolation, they form a connected mesh:

1. **Discover** — Find known squads and their capabilities
2. **Understand** — See what work types each squad accepts
3. **Delegate** — Create issues directly in another squad with context
4. **Route** — Issues arrive with proper labels and metadata

## Quick Start

### Discover Other Squads

List all discoverable squads in your network:
```bash
squad discover
```

Output:
```
Known Squads:
  backend-squad (github.com/org/backend-squad)
    Capabilities: api, database, performance
    Contact: @backend-team
    Accepts: issues, pull-requests

  frontend-squad (github.com/org/frontend-squad)
    Capabilities: ui, ux, accessibility
    Contact: @frontend-team
    Accepts: issues, pull-requests

  infra-squad (github.com/org/infra-squad)
    Capabilities: kubernetes, terraform, ci-cd
    Contact: @infra-team
    Accepts: issues
```

Get details about one squad:
```bash
squad discover backend-squad
```

### Delegate Work

Create an issue in another squad:
```bash
squad delegate backend-squad "Implement caching for user profiles API endpoint"
```

The issue is created in backend-squad's repository with:
- Proper labels (automatically applied based on squad manifest)
- Cross-squad metadata in the issue body
- Link back to your squad
- Assignment to the squad's triage team

Provide more context in a file:
```bash
squad delegate infra-squad --file deployment-request.md
```

### Remove an Upstream

Stop tracking a squad:
```bash
squad delegate remove backend-squad
```

## Configuration

Squads publish their capabilities via `.squad/manifest.json`:

```json
{
  "name": "backend-squad",
  "repo": "github.com/org/backend-squad",
  "description": "API and database services",
  "capabilities": [
    "api",
    "database",
    "performance",
    "caching"
  ],
  "accepts": [
    "issues",
    "pull-requests"
  ],
  "contact": {
    "team": "Backend Engineering",
    "labels": ["squad:backend", "needs-review"]
  }
}
```

- **name**: Unique squad identifier
- **repo**: GitHub repository URL
- **description**: What the squad does
- **capabilities**: Skills and services offered
- **accepts**: What work types the squad will take on
- **contact**: How to reach them (labels, team mentions)

## How Discovery Works

Discovery reads upstream squad manifests:

1. Find `.squad/upstream.json` in your squad
2. For each upstream, fetch `.squad/manifest.json`
3. Build a local index of known squads
4. Cache the index locally in `.squad/.discovery-cache.json`

Discovery is **read-only**—it doesn't modify other squads.

## Use Cases

### Multi-Team Organization

- **Platform Squad**: Infrastructure, databases, deployments
- **Feature Squad A**: Mobile and API clients
- **Feature Squad B**: Web frontend and analytics
- **Infra Squad**: CI/CD, monitoring, on-call

Teams discover each other's capabilities and delegate work instead of context-switching.

### Distributed Org

- Multiple orgs, each with their own squads
- Cross-org upstreams link squads (with permission)
- Feature team can delegate testing to central QA squad
- QA squad can delegate infrastructure to platform team

### Specialized Service Squads

- DevOps squad publishes "kubernetes", "terraform", "monitoring" capabilities
- Any team discovering DevOps can delegate infrastructure tasks
- No need to find the right person—just find the right squad

## Manifest Best Practices

### Be Descriptive

```json
{
  "capabilities": [
    "rest-api",
    "graphql",
    "websockets",
    "performance-optimization"
  ]
}
```

Not just `["backend"]` — be specific about what you can do.

### Label for Routing

```json
{
  "contact": {
    "labels": ["squad:backend", "epic:api", "priority:high"]
  }
}
```

Labels help delegates find the right backlog and priority.

### Document Acceptance Criteria

```json
{
  "description": "API and database services. We accept issues that involve REST/GraphQL APIs, query optimization, and data modeling."
}
```

Delegates know whether their work fits.

## See Also

- [Upstream Auto-Sync](/features/upstream-sync) — Keep squads in sync automatically
- [Persistent Ralph](/features/persistent-ralph) — Track all squad activity
- [Generic Scheduler](/features/generic-scheduler) — Schedule cross-squad workflows
