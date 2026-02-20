---
name: "cca-squad-integration"
description: "Patterns for making Copilot Coding Agent work as a Squad team member"
domain: "platform-integration"
confidence: "medium"
source: "Proposal 030 feasibility analysis"
author: "Kujan"
---

## Context
GitHub's Copilot Coding Agent (CCA) can be assigned issues via `@copilot` and works autonomously in GitHub Actions. CCA reads `.github/agents/*.agent.md` for project guidance. Since Squad's coordinator prompt IS `squad.agent.md` in that same directory, CCA naturally discovers Squad governance.

## Patterns

### CCA Reads squad.agent.md
CCA reads any `.agent.md` file in `.github/agents/`. Squad's coordinator prompt lives at `.github/agents/squad.agent.md`. Adding a CCA-specific guidance section to this file makes CCA work under Squad governance with zero additional infrastructure.

### CCA Cannot Spawn Sub-Agents
CCA operates as a single agent in a sandboxed GitHub Actions environment. It does NOT have access to the `task` tool and cannot spawn sub-agents. CCA-as-squad-member is single-agent work governed by Squad conventions, not multi-agent orchestration.

### CCA Works on copilot/* Branches
CCA creates `copilot/` prefixed branches and opens draft PRs. It cannot merge its own work. Human review is always required. This aligns with Squad's proposal-first workflow.

### GitHub Issues Are Inherently Per-Repo
Issues belong to repos. Assigning an issue to @copilot on a specific repo means CCA works in that repo's context, reads that repo's Squad state. Per-repo async comms is free with CCA.

### Drop-Box Pattern Works for CCA
CCA can write to `.ai-team/decisions/inbox/cca-{slug}.md` following the same drop-box pattern other agents use. Scribe merges these on the next cycle.

## Anti-Patterns
- **Expecting CCA to have multi-agent orchestration** — CCA is one agent, not a coordinator spawning five.
- **Expecting CCA personality** — CCA follows conventions but does not adopt Fenster's or Keaton's personality. It's CCA, guided by Squad rules.
- **Assuming CCA has session persistence** — Each issue assignment is a fresh session. CCA reads `.ai-team/` state each time but has no memory across assignments.
