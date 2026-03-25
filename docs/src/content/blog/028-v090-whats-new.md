---
title: "What's New in v0.9.0: Personal Squad, Worktrees, Cooperative Rate Limiting, and More"
date: 2026-03-23
author: bradygaster
wave: 8
tags: [squad, release, v0.9.0, features, personal-squad, worktree, rate-limiting, economy-mode]
status: published
hero: "Squad's biggest release yet — personal agents that follow you across repos, isolated worktrees for conflict-free parallel work, cooperative rate limiting, economy mode for cost control, and a refreshed docs site."
---

# What's New in v0.9.0

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _This is Squad's biggest release. Personal Squad brings ambient agent discovery and project portability. Worktree spawning isolates each issue into its own branch. Cooperative rate limiting maps traffic across multi-agent teams. Economy Mode lets you budget costs. A complete docs refresh, security hardening, and community contributions make this one to upgrade for._

---

## What Shipped

### 1. Personal Squad — Ambient Agent Discovery (#508)

Your Squad follows you across repositories.

**Personal agents** are ambient: you configure them once, and they're automatically available in every project you work on — no per-repo setup needed. They discover the projects they work in through the Ghost Protocol: safe interaction that respects your project's boundaries without disrupting other work.

**CLI commands:**

```bash
squad personal init          # Declare your personal agents
squad personal list          # See what's available
```

**Governance layer** — Personal agents declare what they need (memory, tools, platforms) and operate within guardrails. A personal coding agent won't blindly touch your enterprise repo; it reads your project's agent charters and `.squad/config.json` first.

**What this enables:**
- One global Squad definition across all your repos
- Agents that know your coding style, tools, and preferences
- Safe cross-repo work without conflicts
- Team squads + personal squads = complete context

:::tip
Personal Squad is foundational. It's how your favorite coding agent follows you into a new project without needing re-hiring.
:::

---

### 2. Worktree Spawning — No More Branch Conflicts (#529)

Each issue gets its own git worktree.

Before: Agents working on multiple issues could block each other on branch conflicts. Now, every issue spawns an isolated worktree. Agents work in parallel, in separate filesystem branches, without touching the main worktree.

**What it solves:**
- ✅ Parallel agent work on different issues (no blocking)
- ✅ Clean, isolated branch per worktree
- ✅ Main worktree stays stable
- ✅ Automatic cleanup on issue completion

**How it works:**
- Coordinator detects a new issue → spawns `.worktrees/issue-{number}/`
- Agent checks out its issue's worktree
- Multiple agents can work simultaneously across different worktrees
- On completion, worktree is cleaned up automatically

This is the foundation for true parallel work at scale.

---

### 3. Machine Capability Discovery — Routing to Capable Hardware (#514)

Agents declare what they need. Ralph routes work to machines that can handle it.

Use `needs:*` labels to tell Ralph what hardware an issue requires:

```
needs:docker        # This agent needs Docker
needs:gpu           # CUDA-capable GPU required
needs:16gb-memory   # At least 16GB RAM
needs:k8s           # Kubernetes cluster access
```

Ralph's dispatcher reads these labels and routes the work to the machine in your squad pool that has those capabilities. No more "sorry, I can't run Docker here."

**Real-world scenarios:**
- ML agents tagged `needs:gpu` route to GPU-equipped machines
- Docker-based agents route to machines with Docker daemon running
- Multi-region squads balance load based on capabilities

:::note
Capability Discovery works with Ralph's mesh routing. If you're not running Ralph, this is aspirational.
:::

---

### 4. Cooperative Rate Limiting — Predictive Circuit Breaker (#515)

Multi-agent teams share rate limits responsibly.

Squad now implements **RAAS** — Rate-Aware Agent Scheduler. When your API calls trigger rate limiting, Squad maps `X-RateLimit-Remaining` headers to traffic light states:

- 🟢 **Green** — Normal traffic. Go.
- 🟡 **Amber** — Approaching limit. Back off by 30%.
- 🔴 **Red** — At/over limit. Wait 5–30 seconds; predictive circuit breaker handles recovery.

**Multi-agent coordination:**
All agents in your squad see the same traffic light state. When one agent hits amber, the entire team backs off. No thundering herd, no cascading failures.

**Error surfacing:**
Rate limit errors now surface with recovery suggestions:

```
⚠️ API rate limit reached. Waiting 15 seconds before retry.
Agent: MyAgent | Remaining: 0/60 | Resets: 14:32 UTC
Suggestion: 1 agent idle, 2 backing off. Try serial mode with --cooperative-delay=30s
```

---

### 5. Economy Mode — Cost-Conscious Model Selection (#500)

Budget-aware routing falls back to cheaper models when spend is high.

When your monthly LLM budget climbs, Economy Mode kicks in:

```bash
squad skill economy-mode enable --budget=50  # USD per agent per day
```

Now when Claude-Sonnet (expensive) would exceed budget, the router automatically falls back to Claude-Haiku (70% cheaper). The agent still completes the work — just with a more efficient model.

**Governance:**
```typescript
const role = await squad.resolveRole('coding-agent', {
  economyMode: true,  // Use cheaper models if budget allows
  budgetPerDay: 50,   // USD
});
```

**Real-world impact:**
- Reduces spend 40–60% for suitable tasks
- Agents choose the most cost-effective model for their task
- Human stays in budget control

---

### 6. Auto-Wired Telemetry (#281)

One call to wire up full observability.

`initSquadTelemetry()` now auto-creates the EventBus and CostTracker:

```typescript
import { initSquadTelemetry } from '@bradygaster/squad-sdk';

const { eventBus, costTracker } = await initSquadTelemetry({
  endpoint: 'https://my-telemetry.com',  // Optional; omit for in-process
});

// eventBus is live, costTracker is live
// All agent work auto-reports to both
```

**What you get:**
- ✅ Real-time cost visibility per agent
- ✅ Event stream for compliance/audit
- ✅ Custom event handlers (e.g., Slack alerts on high spend)
- ✅ Zero additional setup

No more hunting for telemetry wiring. One call, full observability.

---

### 7. Upgrade Path Overhaul — P0 Fixes (#544, #549)

**Windows EPERM handling** — File permission errors on Windows no longer break upgrades. Automatic retry with temporary directory fallback.

**Gitignore parent coverage** — Upgrade now respects `.gitignore` files in parent directories, preventing unintended file inclusion.

**Context-aware footer** — Upgrade footer includes your project's context: org name, repo, branch, so you know exactly what was upgraded.

**P0 fixes across the board:**
- Node <22.5.0 hard-fail with clear error message
- Memory safety caps to prevent runaway allocations
- ESM patch improvements for Node 22/24 compatibility
- Rate limit errors now surface with recovery options

---

### 8. Documentation Refresh

**README slimmed**: 512 → 218 lines. Removed noise, kept substance.

**Upgrade section**: New dedicated docs guide for trouble-free version bumps, with platform-specific steps for Windows, macOS, Linux.

**Consistent install path**: All user-facing docs now reference `npm install -g @bradygaster/squad-cli`.

**Astro features**: 10 new Astro features implemented — section badges, improved search with Pagefind, better syntax highlighting.

**Teams MCP refresh**: Microsoft Teams integration updated for Workflows webhooks. Full docs at [Teams integration guide](../features/mcp.md).

**Autonomous agents guide**: New guide for building agents that work unsupervised. How to set guardrails, declare intentions, handle escalation.

---

### 9. Quality & Stability

- ✅ Node <22.5.0 hard-fail with clear message (prevents silent failures)
- ✅ Memory safety caps (prevents runaway allocations on large codebases)
- ✅ ESM patch improvements for Node 22/24 compatibility
- ✅ Rate limit error surfacing with recovery options
- ✅ SIGINT/SIGTERM signal handling (graceful shutdown, 22 tests)
- ✅ Read-modify-write race condition fixed in history-shadow.ts
- ✅ ADO CLI exec timeout (prevent hanging on slow networks)

---

### 10. Community Contributions

**Worktree regression tests** — @diberry added tests that guard against regressions in worktree `.git` handling (file vs. directory).

**Docs improvements** — @diberry contributed docs expansion for CLI README and reference.

**Community security review** — Thanks to @wiisaacs and the community for 5-model security review of platform adapters.

---

## Quick Stats

- ✅ **5 major features** (Personal Squad, Worktrees, Capability Discovery, Cooperative Rate Limiting, Economy Mode)
- ✅ **Auto-wired telemetry** in one call
- ✅ **P0 upgrade fixes** across Windows, Node compatibility, and error surfacing
- ✅ **Docs refresh** — README -46%, new upgrade guide, consistent install path
- ✅ **3,963+ tests passing**, 150 test files
- ✅ **Community contributions** from 8+ contributors

---

## Breaking Changes

**None.** All changes are additive. Existing Squads work as-is. New features are opt-in via CLI or config.

---

## Upgrading

Upgrade to v0.9.0 with:

```bash
npm install -g @bradygaster/squad-cli
```

Then:

```bash
squad upgrade  # Walks you through any project-level config updates
```

**Docs:** [Upgrade Guide](../scenarios/upgrading.md) | [Troubleshooting](../scenarios/troubleshooting.md)

If you hit issues, [open a GitHub issue](https://github.com/bradygaster/squad/issues). We're here to help.

---

## What's Next

- **Persistent Ralph** — Watch mode with heartbeat improvements, multi-region mesh routing
- **Process template introspection** — Auto-detect ADO work item types at squad init
- **Teams webhook CommunicationAdapter** — Full implementation of Teams mobile notifications
- **SubSquad orchestration** — Compose squads from other squads; cross-team work at scale

This is an exciting time. v0.9.0 is the release where Squad scales from solo developers to distributed teams.

---

**Questions?** Drop by [Squad Discussions](https://github.com/bradygaster/squad/discussions) or ping us on [Discord](https://discord.gg/squad-community).

**Want to contribute?** Check out [Contributing Guide](../guide/contributing.md). We're hiring agents (and humans who build them).
