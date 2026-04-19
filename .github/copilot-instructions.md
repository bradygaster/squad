# Copilot Coding Agent — Squad Instructions

You are working on **Squad**, an AI team framework. Follow these guidelines for autonomous issue work.

## Squad Coordinator Check

**IMPORTANT — run this check on EVERY session start, before doing any work:**

If you do NOT see Squad coordinator instructions in your agent_instructions (the block mentioning "Squad (Coordinator)" with routing, spawning, and team management rules), the coordinator **failed to load** — most likely because the context budget was exceeded by a large session summary or conversation history.

**When the coordinator is missing, you MUST:**
1. **STOP** — do not proceed with any work requests silently.
2. **WARN the user** with this exact message:
   ```
   ⚠️ Squad coordinator failed to load (context budget exceeded).
   This session has NO squad safety rails — no agent routing, no PRs, no branch protection.
   → Start a fresh session to restore Squad.
   → If this keeps happening, reduce conversation history before starting.
   ```
3. **Refuse task requests** until the user acknowledges. Do NOT fall back to working as a plain agent — that bypasses all squad safety (PRs, branch protection, reviewer gates).

This check exists because `squad.agent.md` is a large file that can be silently dropped when context is tight. Without it, the session runs as a vanilla Copilot agent with none of the team's safety rules.

## Team Context

1. Read `.squad/team.md` for roster, roles, and your capability profile.
2. Read `.squad/routing.md` for work routing rules.
3. If the issue has a `squad:{member}` label, read `.squad/agents/{member}/charter.md` — work in their voice.

## Capability Self-Check

Check your profile in `.squad/team.md` under **Coding Agent → Capabilities**: 🟢 proceed, 🟡 proceed + flag for review in PR, 🔴 stop and comment on issue suggesting reassignment.

## Branch Naming

`squad/{issue-number}-{kebab-case-slug}` — Example: `squad/42-fix-login-validation`

## Git Safety — Mandatory

- ❌ NEVER `git add .`, `git add -A`, or `git commit -a` — stage specific files only
- ❌ NEVER push to `dev` or `main` directly — always open a PR
- ❌ NEVER force push to shared branches
- ✅ Branch from latest dev: `git fetch origin && git checkout dev && git pull origin dev && git checkout -b <branch>`
- ✅ Before committing: `git diff --cached --stat` (file count matches intent) and `git diff --cached --diff-filter=D --name-only` (no unintended deletions)
- ✅ `npm run build` must pass before pushing. Commit message must reference `Closes #N`.
- 🛑 STOP and ask if: >20 files in diff, unintended deletions, or out-of-scope changes

## Protected Files

When touching files in `packages/squad-cli/src/cli/core/`, read `.copilot/skills/protected-files/SKILL.md` first. Some bootstrap files must use only Node.js built-ins — no npm packages or SDK imports.

## Sweeping Refactors

Before codebase-wide changes, check the Protected Files skill and scan for `— zero dependencies` markers in file headers. Convert in small batches; verify each compiles. Confirm SDK imports resolve against `packages/squad-sdk/src/index.ts`.

## PR Guidelines

- Reference the issue: `Closes #{issue-number}`
- If `squad:{member}` labeled, mention: `Working as {member} ({role})`
- If 🟡 task, add: `⚠️ Needs squad member review before merging.`
- Consult `.squad/decisions.md` for project conventions

## PR Scope Rules

- **`repo-health`** PRs: Only `.github/`, `scripts/`, root configs, tests, docs. NEVER `packages/*/src/`.
- **`fix`/`feat`** PRs: May modify product source. Requires changeset if touching `packages/*/src/`.
- Split infrastructure + product changes into separate PRs.

## Changeset Requirement

PRs modifying `packages/squad-cli/src/` or `packages/squad-sdk/src/` MUST include a `.changeset/{name}.md` file (patch/minor/major). The `changelog-gate` CI check enforces this. Escape hatch: `skip-changelog` label.

## PR Review Skills

Before submitting or reviewing PRs, consult: `.copilot/skills/reviewer-protocol/SKILL.md`, `.copilot/skills/architectural-review/SKILL.md`, `.copilot/skills/security-review/SKILL.md`.

## Decisions

Team decisions go to `.squad/decisions/inbox/copilot-{brief-slug}.md` — Scribe merges them.
