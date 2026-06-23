# Recipes & Advanced Scenarios


A compact cookbook of prompts, patterns, and power moves. Each recipe is a prompt you can paste straight into Squad.

---

## Starting Out

### New Project from Scratch

> "Set up Squad for a new React + Node.js app"

Create a repo, run `squad`, describe your project, and agents assemble a team based on your stack. Say "team" to trigger parallel work from the start. First session is the slowest — after 2–3 sessions, agents know your conventions.

### Joining Mid-Project

> "This project is already in progress — catch me up on what's been built and what's in the backlog"

Never too late. Run `squad`, describe the project as it is today, and let agents explore the codebase before giving tasks. Feed conventions they can't discover from code alone. After 2–3 sessions, agents are fully up to speed.

### Large Codebase (200K+ Lines)

> "This is a 200k line codebase — help me understand the architecture before we start making changes"

Each agent gets its own 200K context window. Routing ensures only the right agent looks at relevant code. Use routing rules in `.squad/routing.md` to keep agents focused on their domain. Be explicit about scope on monorepos.

---

## Team Management

### Running Multiple Squads

> "Export skills from my React project and import them into this new project"

Import one full squad, then cherry-pick skills from others. Skills are standalone markdown files — just copy them into `.copilot/skills/`. Best practice: merge knowledge, don't run parallel squads.

### Moving a Team Between Repos

> "Export my team from project-a so I can import it into project-b"

```bash
squad export                    # In source repo
squad import squad-export.json  # In target repo
```

Agents carry skills and portable knowledge. Project-specific details stay tagged so they don't bleed into the new project.

### Where to Store `.squad/`

> "Keep .squad/ out of my main branch"

Six storage options: committed (default), gitignored, separate branch, submodule, symlink, or dev-branch-only. Solo devs: just commit it. Enterprise: gitignore or submodule. Check the decision matrix above for your setup.

### Keeping Your Squad Across Projects

> "I want to keep my current team — don't cast a new one for this project"

Export often — at the end of each project or after a major milestone. Your squad gets smarter over time. Generic skills carry forward; project-specific details are stripped on export.

---

## Workflows

### Release Process

> "We're ready to ship v1.2.0 — run the release process: changelog, tags, and publish"

Squad uses a three-branch model: dev → preview → main. The guard workflow blocks `.squad/` from reaching production. Tag from main only. Full lifecycle: prepare on dev, validate on preview, merge to main, tag, release.

### Open Source Maintainer

> "Enable auto-triage for incoming issues on my OSS repo"

Ralph triages issues every 6 hours via the heartbeat workflow. Skills become living contributor docs. Export your squad for forks. `go:*` labels + auto-assign = autonomous issue processing with human approval on merge.

### Private Repos & Security

> "I need to know Squad's data security model"

Squad runs entirely in your Copilot session. Nothing leaves your machine beyond Copilot's standard operation. Skills are generic and safe to share. Review agent histories before exporting — they may contain project-specific details.

---

## Configuration

### Switching Models

> "Switch everyone to Haiku — I'm trying to save costs this sprint"

Squad supports 17 models across three tiers. Budget mode: `claude-haiku-4.5` for everything. Quality mode: `claude-opus-4.6` for the Lead, `claude-sonnet-4.5` for everyone else. Fallback chains handle unavailability automatically.

### Client Compatibility

> "Does Squad work in VS Code?"

CLI is the primary platform with full features. VS Code works with conditional support — parallel subagents, workspace-scoped file access, session model selection. JetBrains and GitHub.com are untested. Both CLI and VS Code share the same `.squad/` state.

---

## Recovery

### Disaster Recovery

> "My .squad/ directory was deleted — help me recover the team state"

If committed: `git checkout .squad/`. If not: rebuild with `squad` or import from a previous export. Override bad decisions with directives. Archive confused agent histories. Upgrades never touch `.squad/`.

---

## Pro Tips

> Patterns from real usage that make Squad click.

**Be specific about scope.** Describe the boundary, not just the task:
```
Build JWT auth for login/logout/refresh. Sessions in Redis. No OAuth yet — that's phase 2.
```

**Say "team" for parallel work.** Naming a specific agent sends work to just them:
```
Team, build the login page.
```

**Stack decisions in your prompt.** Early conventions prevent agents from asking questions later:
```
Always use TypeScript strict mode. Named exports only. React hooks, no class components.
```

**Use bullet points for multi-part tasks.** Agents process lists better than paragraphs.

**Don't interrupt parallel work.** Let agents chain their own follow-ups. Check the work log after, not during.

**Let Ralph grind the backlog.** Say `"Ralph, go"` and Ralph triages, assigns, spawns agents, and reports every 3–5 rounds. You focus on critical-path work.

**Decision first, implementation second.** Before agents write code, have the team agree on the design:
```
Team, design the user model. Don't code yet. Write decisions to decisions.md.
```

**Spike → Decision → Build.** For hard problems, have the Lead do a spike first:
```
Keaton, do a 20-minute spike on authentication patterns. Write a decision.
```

---

## Power Prompts

Copy these directly into Squad.

### Bootstrap a New Project

```
I'm building a CLI tool in Go that monitors AWS costs and sends Slack alerts
when spending exceeds thresholds. Set up the team. I want this done fast —
everyone works at once.
```

### Parallel Feature Work

```
Team, I want you to work on two things in parallel:

Feature A (Frontend + Backend):
- User profile page with avatar upload

Feature B (Backend + Tester):
- Rate limiting on API endpoints

Divide the team. Start both immediately.
```

### Architectural Spike

```
Keaton, do a 20-minute spike on authentication patterns for this stack.
Research JWT vs session-based auth. Write a decision with your recommendation.
```

### Issue-Driven Sprint

```
Connect to myorg/recipe-app
Show the backlog
Work on #7 and #12
```

### Code Review Request

```
Michael, review the cart app. Are there issues I should know about?
```

### Closing a Phase

```
Team, we're closing the MVP phase.
Keaton, what's the current architecture?
Kane, what's left to do on the backend?
Dallas, what UX work is pending?
Lambert, what tests are missing?
Write your summary to history.md.
```

### Status Check

```
What did the team accomplish last session? Any blockers?
```

---

## See Also

- [CLI Reference](../reference/cli.md) — Every command and config file
- [SDK Reference](../reference/sdk.md) — Programmatic API
- [Migration & Troubleshooting](../get-started/migration.md) — Upgrades and fixes
