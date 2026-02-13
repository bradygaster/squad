# Squad Documentation

Public-facing documentation for Squad. GitHub Pages ready.

## Guides

- [Product Guide](guide.md) — Complete reference for all Squad features
- [Sample Prompts](sample-prompts.md) — Ready-to-use prompts showing what Squad can do

## Feature Reference

### Core
- [Team Setup](features/team-setup.md) — Init mode, first session, team creation
- [Work Routing](features/routing.md) — How work gets assigned to agents
- [Parallel Execution](features/parallel-execution.md) — Background vs sync, fan-out
- [Response Modes](features/response-modes.md) — Tiered response speed/depth
- [Memory System](features/memory.md) — How agents learn and remember
- [Directives](features/directives.md) — Capturing team rules and preferences
- [Reviewer Protocol](features/reviewer-protocol.md) — Rejection lockout and revision routing

### Workflow
- [GitHub Issues Mode](features/github-issues.md) — Issue-driven development
- [PRD Mode](features/prd-mode.md) — Product requirements decomposition
- [Labels & Triage](features/labels.md) — go:/release:/type:/priority: taxonomy
- [Ralph — Work Monitor](features/ralph.md) — Autonomous backlog processing
- [Project Boards](features/project-boards.md) — GitHub Projects V2 integration

### Team
- [Human Team Members](features/human-team-members.md) — Mixed AI/human teams
- [@copilot Coding Agent](features/copilot-coding-agent.md) — Autonomous issue agent
- [Skills System](features/skills.md) — Earned knowledge with confidence lifecycle
- [Ceremonies](features/ceremonies.md) — Team meetings and rituals
- [Notifications](features/notifications.md) — Ping via Teams/MCP

### Infrastructure
- [Per-Agent Model Selection](features/model-selection.md) — Cost-first model routing
- [Git Worktrees](features/worktrees.md) — Multi-branch team state
- [Export & Import](features/export-import.md) — Portable team snapshots

## Walkthroughs

- [First Session](tour-first-session.md) — Your first time using Squad
- [GitHub Issues](tour-github-issues.md) — Issue-driven development walkthrough

## Scenarios

### Getting Started
- [Starting a New Project](scenarios/new-project.md) — Greenfield setup
- [Adding to an Existing Repo](scenarios/existing-repo.md) — Drop Squad into existing code
- [Mid-Project Onboarding](scenarios/mid-project.md) — Adding Squad halfway through
- [Upgrading Squad](scenarios/upgrading.md) — Update to the latest version

### Team Management
- [Solo Developer](scenarios/solo-dev.md) — Is Squad overkill for one person?
- [Mixed Human + AI Team](scenarios/team-of-humans.md) — Humans and agents working together
- [Keeping Your Squad](scenarios/keep-my-squad.md) — Persistence across projects
- [Combining Old Squads](scenarios/multiple-squads.md) — Cherry-picking from multiple teams

### Project Types
- [Large Codebases](scenarios/large-codebase.md) — Will Squad choke on a big repo?
- [Monorepos](scenarios/monorepo.md) — Multiple services, one squad
- [Open Source Projects](scenarios/open-source.md) — Triage, contributors, community

### Operations
- [Client Compatibility Matrix](scenarios/client-compatibility.md) — What works on CLI, VS Code, JetBrains, GitHub.com
- [Issue-Driven Development](scenarios/issue-driven-dev.md) — End-to-end issue workflow
- [CI/CD Integration](scenarios/ci-cd-integration.md) — Squad + GitHub Actions
- [Moving a Team](scenarios/team-portability.md) — Export and import between repos
- [Team State Storage](scenarios/team-state-storage.md) — Gitignore, submodules, branches, and more
- [Model Selection Strategies](scenarios/switching-models.md) — Budget vs quality tradeoffs
- [Privacy & Security](scenarios/private-repos.md) — What stays private
- [Disaster Recovery](scenarios/disaster-recovery.md) — When things go wrong
