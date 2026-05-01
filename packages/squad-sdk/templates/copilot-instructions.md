# Copilot Coding Agent — Squad Instructions

You are working on a project that uses **Squad**, an AI team framework. When picking up issues autonomously, follow these guidelines.

## Squad Coordinator Check

**IMPORTANT — run this check on EVERY session start, before doing any work:**

Look for the exact canary token `SQUAD_COORDINATOR_CANARY_a8f3` in your agent_instructions. This token is placed at the end of `squad.agent.md` — if it's missing, the coordinator either failed to load or was truncated.

**When the canary token is missing, you MUST:**
1. **STOP** — do not proceed with any work requests silently.
2. **WARN the user** with this exact message:
   ```
   ⚠️ Squad coordinator failed to load (context budget exceeded or file truncated).
   This session has NO squad safety rails — no agent routing, no PRs, no branch protection.
   → Start a fresh session to restore Squad.
   → If this keeps happening, reduce conversation history before starting.
   ```
3. **Refuse task requests** until the user acknowledges. Do NOT fall back to working as a plain agent — that bypasses all squad safety (PRs, branch protection, reviewer gates).

This check exists because `squad.agent.md` is a large file that can be silently dropped when context is tight. Without it, the session runs as a vanilla Copilot agent with none of the team's safety rules.

## Team Context

Before starting work on any issue:

1. Read `.squad/team.md` for the team roster, member roles, and your capability profile.
2. Read `.squad/routing.md` for work routing rules.
3. If the issue has a `squad:{member}` label, read that member's charter at `.squad/agents/{member}/charter.md` to understand their domain expertise and coding style — work in their voice.

## Capability Self-Check

Before starting work, check your capability profile in `.squad/team.md` under the **Coding Agent → Capabilities** section.

- **🟢 Good fit** — proceed autonomously.
- **🟡 Needs review** — proceed, but note in the PR description that a squad member should review.
- **🔴 Not suitable** — do NOT start work. Instead, comment on the issue:
  ```
  🤖 This issue doesn't match my capability profile (reason: {why}). Suggesting reassignment to a squad member.
  ```

## Branch Naming

Use the squad branch convention:
```
squad/{issue-number}-{kebab-case-slug}
```
Example: `squad/42-fix-login-validation`

## PR Guidelines

When opening a PR:
- Reference the issue: `Closes #{issue-number}`
- If the issue had a `squad:{member}` label, mention the member: `Working as {member} ({role})`
- If this is a 🟡 needs-review task, add to the PR description: `⚠️ This task was flagged as "needs review" — please have a squad member review before merging.`
- Follow any project conventions in `.squad/decisions.md`

## Decisions

If you make a decision that affects other team members, write it to:
```
.squad/decisions/inbox/copilot-{brief-slug}.md
```
The Scribe will merge it into the shared decisions file.
