# Prompt-First Documentation Analysis

**Goal:** Pivot Squad docs to lead with example prompts users can give to Squad, followed by feature explanations. This makes docs more actionable and demonstrates Squad's prompt-driven nature.

**Principle:** "Show, don't tell" — users see what to say first, then understand how it works.

---

## Top-Level Docs

| File | Current State | Change? | Proposed Lead Prompt (if applicable) |
|------|---------------|---------|--------------------------------------|
| `README.md` | Project overview, install steps | **Keep** | N/A (landing page, not feature-specific) |
| `guide.md` | Comprehensive reference guide | **Keep** | N/A (reference material, not workflow-driven) |
| `community.md` | Contribution guidelines | **Keep** | N/A (meta documentation) |
| `sample-prompts.md` | Already prompt-focused | **Keep** | N/A (already perfect for the pattern) |
| `tips-and-tricks.md` | Collection of techniques | **Enhance** | Add prompts to each tip section (many tips are explanatory, could show the prompt that triggers the behavior) |
| `tour-first-session.md` | Tutorial walkthrough | **Keep** | Already conversational/prompt-driven |
| `tour-github-issues.md` | GitHub Issues tutorial | **Keep** | Already conversational/prompt-driven |

---

## Features (23 files)

Core feature documentation. **High-value target** for prompt-first transformation.

| File | Current State | Change? | Proposed Lead Prompt |
|------|---------------|---------|---------------------|
| `features/ceremonies.md` | Explains ceremony system | **Change** | `"Schedule a daily standup at 9am and a sprint retro every Friday"` |
| `features/copilot-coding-agent.md` | Technical explanation of Copilot integration | **Keep** | N/A (meta/technical, not user-facing workflow) |
| `features/directives.md` | Explains directive system | **Change** | `"From now on, all tests must use Jest instead of Mocha"` |
| `features/export-import.md` | Export/import mechanics | **Change** | `"Export my team to a file — I want to use them on another project"` |
| `features/github-issues.md` | GitHub Issues integration | **Change** | `"Show me the open issues for this repo"` |
| `features/human-team-members.md` | Human roster support | **Change** | `"Add Sarah (sarah@example.com) as a frontend developer to the team"` |
| `features/labels.md` | Label taxonomy explanation | **Enhance** | `"Apply the go:yes label to issue #42 and target it for v0.5.0"` (add prompt section at top, keep taxonomy reference below) |
| `features/mcp.md` | MCP server integration | **Change** | `"Show me which MCP servers are available"` |
| `features/memory.md` | Memory system explanation | **Change** | `"What decisions has the team made about testing strategy?"` |
| `features/model-selection.md` | Model routing explanation | **Change** | `"Have all agents use Opus for the rest of this session"` |
| `features/notifications.md` | Notification system | **Change** | `"Notify me when the build finishes"` |
| `features/parallel-execution.md` | Parallel agent patterns | **Change** | `"Have three agents work on this in parallel: UI mockups, API spec, and database schema"` |
| `features/plugins.md` | Plugin system | **Change** | `"Install the AWS deployment plugin"` |
| `features/prd-mode.md` | PRD-driven workflow | **Change** | `"Write a PRD for a user authentication system with OAuth support"` |
| `features/project-boards.md` | Project board integration | **Change** | `"Create a project board for v0.5.0 with columns for each workflow stage"` |
| `features/ralph.md` | Ralph work monitor | **Enhance** | `"Ralph, show me what everyone is working on"` (add prompt, keep technical explanation) |
| `features/response-modes.md` | Response mode selection | **Change** | `"Respond in terse mode — just the facts"` |
| `features/reviewer-protocol.md` | Review workflow | **Change** | `"Review the changes in src/auth/ and check for security issues"` |
| `features/routing.md` | Agent routing system | **Change** | `"Route all database-related work to Basher"` |
| `features/skills.md` | Skills system | **Change** | `"Show me what skills this team has learned"` |
| `features/team-setup.md` | Team composition | **Change** | `"Set up a team for a React + Node.js API with PostgreSQL"` |
| `features/vscode.md` | VS Code integration | **Keep** | N/A (platform-specific guide, not workflow-driven) |
| `features/worktrees.md` | Git worktree support | **Change** | `"Use worktree-local mode — I want each branch to have its own team state"` |

---

## Scenarios (21 files)

Real-world use cases. **Already workflow-driven** — many just need prompts surfaced at the top.

| File | Current State | Change? | Proposed Lead Prompt |
|------|---------------|---------|---------------------|
| `scenarios/ci-cd-integration.md` | CI/CD setup workflow | **Change** | `"Set up GitHub Actions to run tests on every PR and deploy to staging on merge to main"` |
| `scenarios/client-compatibility.md` | Platform compatibility matrix | **Keep** | N/A (reference material, not workflow) |
| `scenarios/disaster-recovery.md` | Recovery procedures | **Change** | `"My .ai-team/ directory was deleted — help me recover the team state"` |
| `scenarios/existing-repo.md` | Adding Squad to existing project | **Change** | `"I have an existing repo with 50k lines of code — set up Squad to help with refactoring"` |
| `scenarios/issue-driven-dev.md` | Issue workflow end-to-end | **Enhance** | Already has prompts, but bury the "Prerequisite" section below the first prompt (lead with action) |
| `scenarios/keep-my-squad.md` | Team preservation strategies | **Change** | `"I want to keep my current team — don't cast a new one for this project"` |
| `scenarios/large-codebase.md` | Working with big repos | **Change** | `"This is a 200k line codebase — help me understand the architecture before we start making changes"` |
| `scenarios/mid-project.md` | Joining mid-sprint | **Change** | `"This project is already in progress — catch me up on what's been built and what's in the backlog"` |
| `scenarios/monorepo.md` | Monorepo strategy | **Change** (already has one, move to top) | `"I'm building a microservices platform in a monorepo with 8 services — set up specialists for each domain"` |
| `scenarios/multiple-squads.md` | Multi-squad coordination | **Change** | `"I have two teams — one on frontend, one on backend. How do I coordinate work between them?"` |
| `scenarios/new-project.md` | Starting from scratch | **Enhance** (already has prompts) | Move "Hey Jordan, what are you building?" to the very top |
| `scenarios/open-source.md` | OSS contribution workflow | **Change** | `"Help me contribute to this open source project — review their CONTRIBUTING.md and set up a team"` |
| `scenarios/private-repos.md` | Private repo setup | **Change** | `"Set up Squad for a private repo with GitHub Enterprise"` |
| `scenarios/release-process.md` | Release automation | **Change** | `"We're ready to ship v1.2.0 — run the release process: changelog, tags, and publish"` |
| `scenarios/solo-dev.md` | Single-person projects | **Change** | `"I'm working alone on a side project — set up a minimal squad to help with code review and testing"` |
| `scenarios/switching-models.md` | Model switching guide | **Change** | `"Switch everyone to Haiku — I'm trying to save costs this sprint"` |
| `scenarios/team-of-humans.md` | All-human teams | **Change** | `"My team is all human devs — I just want Squad to help with coordination and memory"` |
| `scenarios/team-portability.md` | Moving teams between repos | **Change** | `"Export my team from project-a so I can import it into project-b"` |
| `scenarios/team-state-storage.md` | State management explanation | **Keep** | N/A (technical architecture doc) |
| `scenarios/troubleshooting.md` | Debugging guide | **Keep** | N/A (reference for when things break) |
| `scenarios/upgrading.md` | Version upgrade guide | **Keep** | N/A (maintenance procedure) |

---

## Specs (1 file)

Technical specifications for tool builders.

| File | Current State | Change? | Proposed Lead Prompt (if applicable) |
|------|---------------|---------|--------------------------------------|
| `specs/memory-format.md` | SEM format specification | **Keep** | N/A (technical spec, not user-facing) |

---

## Summary Stats

| Category | Total Files | Keep As-Is | Enhance (minor) | Change (major) |
|----------|-------------|------------|-----------------|----------------|
| Top-level | 7 | 5 | 1 | 1 |
| Features | 23 | 3 | 2 | 18 |
| Scenarios | 21 | 6 | 2 | 13 |
| Specs | 1 | 1 | 0 | 0 |
| **Total** | **52** | **15 (29%)** | **5 (10%)** | **32 (62%)** |

---

## Implementation Pattern

For docs that need prompt-first treatment, use this structure:

```markdown
# Feature Name

> **Try this:**  
> `"Your example prompt here"`

Brief 1-sentence outcome statement (what Squad does when you say this).

---

## How It Works

[Existing technical explanation]

---

## Examples

[More prompts and variations]

---

## Configuration / Advanced Usage

[Edge cases, options, troubleshooting]
```

### Rationale

1. **Blockquote + bold** makes the prompt visually distinct (not just another code block)
2. **One-liner outcome** shows immediate value before diving into mechanics
3. **Examples section** reinforces pattern with variations
4. **Technical details below** — available for those who need depth, but not blocking the quick start

---

## High-Priority Changes (Top 10)

These docs get the most traffic and would benefit most from prompt-first approach:

1. **features/team-setup.md** — First thing users do
2. **features/github-issues.md** — Core workflow
3. **scenarios/new-project.md** — Onboarding flow
4. **features/model-selection.md** — Cost optimization is a top concern
5. **features/parallel-execution.md** — Power user feature, needs discoverability
6. **scenarios/existing-repo.md** — Common entry point
7. **features/skills.md** — New in v0.2.0, needs visibility
8. **features/export-import.md** — Underutilized, prompt would help
9. **scenarios/monorepo.md** — Enterprise use case
10. **features/memory.md** — Core value prop

---

## TOC Impact

**Good news:** Minimal TOC restructuring needed. The structure (Features / Scenarios) stays the same. Individual doc titles stay the same. Only the *interior* of each doc changes — opening with a prompt doesn't affect navigation.

**One optional change:** Consider adding a "Quick Start Prompts" section to the sidebar that links to the top prompt in each high-priority doc. This would be a nav convenience, not a requirement.

---

## Example Transformation

### Before: `features/model-selection.md`

```markdown
# Per-Agent Model Selection

Squad routes each agent to the right model based on what they're doing — not a one-size-fits-all default. The governing principle: **cost first, unless code is being written.**

## How It Works

Model selection uses a layered system. First match wins:
[...1500 words of explanation...]
```

### After: `features/model-selection.md`

```markdown
# Per-Agent Model Selection

> **Try this:**  
> `"Have all agents use Opus for the rest of this session"`  
> `"Switch to Haiku — I'm trying to save costs"`  
> `"Use Sonnet for code, Haiku for everything else"`

Squad adjusts model selection based on your directive. Agents writing code get quality models (Sonnet/Opus), agents doing docs/logs get cost-optimized models (Haiku).

---

## How It Works

Model selection uses a layered system. First match wins:

1. **User Override** — You said "use opus" or "save costs"? Done.
[...rest of technical explanation...]
```

---

## Non-Goals

- **Not changing blog posts** — blog content is historical record
- **Not changing team-docs/proposals** — internal research, not user-facing
- **Not changing .ai-team/ templates** — those are internal formats
- **Not creating new docs** — just transforming existing ones

---

## Open Questions

1. **Should we add a "Prompt Index" page?** A single page listing all the opening prompts from each doc, organized by category. This would be a prompt cookbook.

2. **Should prompts use first person ("I want...") or imperative ("Set up...")?** Currently Squad handles both, but consistency in docs would help users learn the interaction model.

3. **Should we show the Squad response in the opening section?** e.g., show both the prompt AND the typical response Squad gives. This demonstrates the interaction loop.

4. **Do we want a "Copy prompt" button in the docs site?** Technical enhancement — adds a copy-to-clipboard button next to each prompt in the docs.

---

## Next Steps

1. **Get feedback on this approach** — does the pattern feel right?
2. **Prioritize the high-value 10** — ship those first
3. **Batch the rest** — features and scenarios in separate PRs
4. **Update build.js if needed** — if we want special styling for prompt blockquotes
