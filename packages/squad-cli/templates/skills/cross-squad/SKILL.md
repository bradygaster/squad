---
name: "cross-squad"
description: "Pathfinder patterns for multi-repo squad orchestration — HQ command, squad-to-squad protocol, fleet dispatch, and Unix-style AI composition"
domain: "orchestration, multi-repo, fleet"
confidence: "low"
source: "first capture from blog Part 8 — Pathfinder: When AI Squads Learn to Talk to Each Other"
---

## Context

When squads grow beyond a single repository, they need patterns for cross-repo communication, fleet-wide orchestration, and composable pipelines. This skill captures the "Pathfinder" patterns discovered when tamresearch1 became the HQ for a fleet of squads spanning multiple repos and machines.

These patterns apply when:
- One repo orchestrates work across multiple child repos (fleet command)
- Independent squads need to share decisions, skills, or status
- AI-powered steps mix with deterministic CLI tools in pipelines
- A watch loop monitors multiple repos simultaneously
- Tasks must route to specific machines based on capabilities (GPU, memory)

## Patterns

### 1. Squad HQ Pattern

One repo acts as fleet command, orchestrating squads across multiple repositories. Issues filed in HQ get triaged and routed to child squads.

**Structure:**
```
tamresearch1/          ← HQ repo (fleet command)
├── .squad/
│   ├── fleet.json     ← registry of child repos
│   ├── decisions/     ← fleet-wide decisions
│   └── agents/
│       └── ralph/     ← fleet-aware Ralph
├── squad-pr/          ← child: Squad CLI development
├── blog-repo/         ← child: blog content
└── infra-repo/        ← child: infrastructure
```

**Fleet registry (`fleet.json`):**
```json
{
  "hq": "tamirdresher/tamresearch1",
  "children": [
    {
      "name": "squad-cli",
      "repo": "tamirdresher/squad-pr",
      "capabilities": ["typescript", "cli", "sdk"],
      "labels": ["squad:cli"]
    },
    {
      "name": "blog",
      "repo": "tamirdresher/blog-repo",
      "capabilities": ["content", "markdown"],
      "labels": ["squad:blog"]
    }
  ]
}
```

**HQ routing:** When an issue arrives at HQ, the coordinator examines labels and content, then files a child issue in the appropriate repo:

```bash
# HQ receives: "Add built-in skill for cross-squad patterns"
# Coordinator routes to squad-cli repo:
gh issue create --repo tamirdresher/squad-pr \
  --title "[from-hq] Add cross-squad built-in skill" \
  --body "Routed from HQ issue #42. Context: ..." \
  --label "squad:cross-squad"
```

### 2. Squad-to-Squad (S2S) Protocol

How independent squads communicate without tight coupling. Four mechanisms:

**a) Shared decisions format:**
Every squad writes decisions in the same format to `.squad/decisions/inbox/`. When a decision affects another squad, the originating squad files a cross-repo issue referencing the decision.

```markdown
### 2026-03-14: Adopt markdown as universal interface
**By:** Picard (tamresearch1)
**What:** All cross-squad data exchange uses markdown
**Why:** Every agent can read/write it, git tracks it, humans can review it
**Affects:** squad-cli, blog-repo, infra-repo
```

**b) Cross-repo issue filing:**
Squad A files an issue in Squad B's repo when work crosses boundaries:

```bash
# Squad A (blog) needs a CLI feature from Squad B (squad-cli)
gh issue create --repo tamirdresher/squad-pr \
  --title "[s2s:blog→cli] Need --fleet flag for watch command" \
  --body "Blog squad's Ralph needs fleet mode. See blog#78 for context." \
  --label "squad:s2s"
```

**c) Shared skills library:**
Skills earned in one squad are available to others. When a squad learns a reusable pattern, it gets promoted to the built-in skills library so all squads benefit:

```
Squad A discovers pattern → writes SKILL.md locally
  → PR to squad-cli repo → merged as built-in skill
    → all squads get it on next `squad init` or `squad reskill`
```

**d) Status polling:**
Ralph checks multiple repos on each watch cycle, aggregating status across the fleet:

```bash
# Ralph's fleet poll cycle
for repo in $(jq -r '.children[].repo' .squad/fleet.json); do
  gh issue list --repo "$repo" --label "squad:active" --json number,title
done
```

### 3. Unix Philosophy Applied to AI Squads

Squads as composable Unix-style tools. The key insight: markdown is the universal interface (text in / text out), and AI-powered steps slot into pipelines alongside deterministic tools.

**Core principles:**
- **Text in / text out** — Markdown as the universal interface between steps
- **Single responsibility** — Each squad owns one domain
- **Composable pipelines** — Mix deterministic CLI steps with AI-powered steps

**Example pipeline:**
```bash
# Deterministic + AI pipeline
dir docs/*.md \
  | sed 's/\.md$//' \
  | squad ask "Analyze these doc names and suggest missing topics" \
  | squad ask "For each missing topic, write a one-paragraph outline" \
  | lint-markdown
```

**Mixed pipeline with explicit AI steps:**
```
INPUT (file list)
  → deterministic: find + filter
  → AI: ANALYZE (identify patterns, suggest improvements)
  → deterministic: lint + format
  → AI: REWRITE (apply suggestions)
  → deterministic: test + commit
```

**Why this works:** Each step consumes text and produces text. The AI steps are interchangeable — swap models, swap agents, swap squads. The deterministic steps provide guardrails and validation between AI steps.

### 4. Fleet Dispatch

The watch command's fleet/hybrid mode for multi-repo monitoring. Ralph runs in one repo but watches the entire fleet.

**Fleet watch cycle:**
```
Every 5-10 minutes:
  1. Pull HQ repo
  2. Read fleet.json for child repos
  3. For each child repo:
     a. Check open issues with squad:* labels
     b. Check PR status (pending reviews, failing CI)
     c. Check .squad/cross-machine/tasks/ for pending work
  4. Aggregate status → write to .squad/log/fleet-status.md
  5. Route urgent items → file issues or notify
```

**Hybrid mode:** Ralph on the laptop monitors issues and lightweight tasks. GPU-heavy or resource-intensive work gets routed to DevBox or cloud VMs via the cross-machine coordination pattern.

```bash
# Start fleet watch (monitors HQ + all children)
squad watch --fleet

# Hybrid: laptop watches, DevBox executes GPU work
squad watch --fleet --route-gpu=devbox
```

### 5. Cross-Machine Coordination

Machines publish capability manifests so the fleet dispatcher routes work to the right hardware.

**Machine capabilities (`machine.json`):**
```json
{
  "name": "devbox",
  "capabilities": {
    "gpu": true,
    "gpu_model": "NVIDIA A100",
    "memory_gb": 64,
    "cpu_cores": 16
  },
  "accepts": ["gpu_workload", "heavy_build", "model_training"],
  "poll_interval_seconds": 300
}
```

**Routing logic:** When a task requires GPU, the fleet dispatcher checks machine manifests and routes to a capable machine. Tasks flow through git (`.squad/cross-machine/tasks/`), results flow back the same way.

```
Laptop (no GPU) → creates task YAML → git push
  → DevBox Ralph pulls → validates → executes on GPU
    → writes result YAML → git push
      → Laptop Ralph reads result
```

See the `cross-machine-coordination` skill for full task/result YAML schemas, security model, and execution details.

## Anti-Patterns

- **Tight coupling between squads** — Don't depend on another squad's internal `.squad/` structure. Use issues and PRs as the communication protocol. Manifests are the public API.
- **Skipping HQ routing** — Don't have squads talk directly when there's an HQ. Route through HQ so there's a single audit trail and consistent triage.
- **Sharing full context dumps** — Send only what the target squad needs: a concise description, acceptance criteria, and a link back. Not your entire decision history.
- **Hardcoded repo paths** — Use `fleet.json` or manifest discovery. Repos move, orgs change, forks happen.
- **AI steps without guardrails** — In composable pipelines, always sandwich AI steps between deterministic validation (lint, test, schema check). Never chain AI → AI → AI without a checkpoint.
- **Ignoring the text interface** — If a step produces binary output or requires structured RPC, it breaks the Unix composition model. Convert to markdown/text at boundaries.
- **Circular delegation** — Track delegation chains. If Squad A delegates to B which delegates back to A, something is architecturally wrong. Escalate to HQ.
- **Fleet watch without rate limiting** — Polling N repos every 5 minutes can hit GitHub API limits. Use conditional requests (ETags) and back off on 403s.

## References

- Blog Part 8: "Pathfinder — When AI Squads Learn to Talk to Each Other"
- Skill: `cross-machine-coordination` — Full task/result YAML schemas, security model, execution isolation
- Skill: `agent-collaboration` — Single-repo collaboration patterns (decisions, cross-agent comms)
- File: `.squad/fleet.json` — Fleet registry (when using HQ pattern)
- File: `.squad/cross-machine/tasks/` — Cross-machine task queue
