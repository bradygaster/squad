---
name: "github-actions-automation"
description: "Patterns for using GitHub Actions as an automation backbone for Squad proposal lifecycle and CCA coordination"
domain: "platform-integration"
confidence: "medium"
source: "Proposal 032b design"
author: "Kujan"
---

## Context
GitHub Actions provides event-driven automation that runs independently of Copilot CLI sessions. Squad uses Actions to automate proposal lifecycle transitions, consensus detection, stale cleanup, and CCA work item dispatch. Actions operates on GitHub API state (issues, labels, comments), not Squad filesystem state (`.ai-team/`).

## Patterns

### Labels as State Machine
Proposal status is encoded in labels (`status:draft`, `status:approved`, `status:rejected`, `status:implementing`, `status:shelved`). Workflows trigger on `issues.labeled` events and perform transitions. Labels are the canonical state — not issue body fields, not custom properties. This keeps state visible in the GitHub UI and queryable via API.

### Owner-Only Approval
Consensus detection checks `context.payload.comment.user.login` against `context.repo.owner`. Only the repo owner's approval comment triggers the `status:approved` label transition. Agent comments and other collaborator comments do not trigger transitions.

### actions/github-script Over Shell gh CLI
Workflows use `actions/github-script@v7` for all GitHub API operations instead of shelling out to `gh` CLI. This is safer (no injection via variable interpolation), more readable (JavaScript vs. bash string manipulation), and more reliable (structured error handling).

### Workflows as Templates
Workflows ship in `templates/workflows/` and are installed opt-in during `squad init`. Users must audit and approve workflow installation. This avoids silently adding code that has write access to the repository.

### Standalone Over Reusable
Each workflow is self-contained — no cross-workflow dependencies, no shared composite actions. Users can read, modify, or delete any single workflow without breaking others. Extract shared patterns only after patterns stabilize across multiple release cycles.

### Two-Layer State Separation
Actions workflows operate on GitHub API state (issues, labels, comments). Agent memory operates on filesystem state (`.ai-team/`). These layers don't sync. This is intentional — `.ai-team/` is gitignored, so Actions can't read it. Actions doesn't need to. The separation keeps both layers simple.

### CCA Dispatch Gate
Never automate CCA assignment (`@copilot`) until CCA governance compliance is validated via E2E tests (Proposal 031). Automating CCA without governance evidence means CCA could work outside Squad conventions at scale.

## Anti-Patterns
- **Workflow-to-workflow chaining via repository_dispatch** — adds complexity. Use label transitions to trigger downstream workflows naturally via `issues.labeled` events.
- **Reading `.ai-team/` from workflows** — it's gitignored. All governance CCA needs lives in `.github/agents/squad.agent.md`.
- **Auto-merging CCA PRs without human review** — CCA is non-deterministic. Human review is always required.
- **Shell-based comment posting in workflows** — variable interpolation in shell is an injection risk. Use `actions/github-script` instead.
