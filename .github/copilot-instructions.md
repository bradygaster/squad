# Copilot Instructions — Squad Source Repository

<!-- This file is for the Squad source repo itself, not the template shipped to users.
     See templates/copilot-instructions.md for the user-facing version. -->

This is the **source repository** for Squad, an AI team framework for GitHub Copilot.

## Using the Squad Agent

This repo has an active Squad agent at `.github/agents/squad.agent.md`. For team operations, roster management, or multi-agent work, select **Squad** from the agent picker in VS Code rather than asking Copilot directly.

- Team roster: `.ai-team/team.md`
- Routing rules: `.ai-team/routing.md`

## Repository Structure

- `index.js` — CLI entry point (`npx create-squad`)
- `.github/agents/squad.agent.md` — The Squad coordinator agent (~1,800 lines)
- `templates/` — Files copied to consumer repos during `create-squad` init
- `.ai-team/` — This repo's own Squad team state (live, not a template)
- `docs/` — Documentation site source
- `test/` — Test suite (`node --test test/*.test.js`)

## Conventions

- **Branch naming:** `squad/{issue-number}-{kebab-case-slug}`
- **Decisions:** Write to `.ai-team/decisions/inbox/`
- **Testing:** Run `npm test` before opening PRs
- **Template vs. source:** Files in `templates/` are copied verbatim by `index.js` to consumer repos. The `.ai-team/` directory here is Squad's own team — don't confuse them.

## Quick Answers

Quick factual questions about file locations, build commands, or public API may be answered directly. Domain questions (architecture, prompt design, VS Code integration) should route through the Squad agent to reach the relevant specialist.
