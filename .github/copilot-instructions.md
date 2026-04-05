# Copilot Coding Agent — Squad Instructions

You are working on a project that uses **Squad**, an AI team framework. When picking up issues autonomously, follow these guidelines.

## Git Safety — Mandatory Rules

**These rules are non-negotiable. Violating them risks deleting production source code.**

### Staging
- ❌ **NEVER** use `git add .` or `git add -A` — these stage unintended deletions from incomplete working trees
- ❌ **NEVER** use `git commit -a` — same risk
- ✅ **ALWAYS** stage specific files: `git add path/to/file1.ts path/to/file2.ts`
- ✅ **ALWAYS** review before committing: run `git diff --cached --stat` and verify the file count matches your intent

### Pushing
- ❌ **NEVER** push directly to `dev` or `main` — always open a PR
- ❌ **NEVER** force push (`git push --force` or `--force-with-lease`) to shared branches
- ✅ **ALWAYS** work on a feature branch: `git checkout -b squad/{issue-number}-{slug}`
- ✅ **ALWAYS** open a PR: `gh pr create --base dev --draft`

### Pre-Push Checklist
Before pushing any commit, verify:
1. `git diff --cached --stat` — file count matches intent (expect ≤10 files for most fixes)
2. `git diff --cached --diff-filter=D --name-only` — NO unintended deletions
3. `npm run build` — build succeeds with your changes
4. Commit message references the issue: `Closes #N`

### Branch Contamination Prevention
- When creating PR branches, always branch from the latest upstream dev: `git fetch upstream && git checkout dev && git rebase upstream/dev && git checkout -b <branch>`
- NEVER use `git reset --soft` to squash on branches behind dev — it picks up all the delta between your branch and dev, contaminating the commit
- To squash safely: use `git rebase -i` or amend the single commit with `git commit --amend`
- Before committing, ALWAYS verify the diff: `git diff --cached --stat` should show ONLY your intended files
- If you see unexpected files in the diff, unstage them: `git reset HEAD <file>`

### Red Flags — STOP and Ask
If you see any of these, STOP immediately and comment on the issue asking for guidance:
- More than 20 files in your diff
- ANY file deletions you didn't explicitly intend
- Changes outside the scope of your assigned issue

## Protected Files — Zero External Dependencies

**Some files MUST only use Node.js built-in modules. Do NOT add npm packages, SDK imports, or any non-`node:*` dependencies to them.**

These are bootstrap utilities that run **before** the Squad SDK is loaded. If they import SDK code (e.g., `FSStorageProvider`, anything from `squad-sdk`), the CLI breaks at startup.

### Protected file list
| File | Purpose |
|------|---------|
| `packages/squad-cli/src/cli/core/detect-squad-dir.ts` | Finds `.squad/` directory at startup — runs before SDK init |
| `packages/squad-cli/src/cli/core/errors.ts` | Error classes (`SquadError`, `fatal()`) — used by all CLI entry points |
| `packages/squad-cli/src/cli/core/gh-cli.ts` | GitHub CLI wrapper — uses only `node:child_process` and `node:util` |
| `packages/squad-cli/src/cli/core/output.ts` | Color/emoji console output — pure ANSI codes, zero imports |
| `packages/squad-cli/src/cli/core/history-split.ts` | Separates portable knowledge from project data — pure string logic |

### Rules
- ❌ **NEVER** convert these files to use `FSStorageProvider`, `StorageProvider`, or any SDK abstraction
- ❌ **NEVER** add `import` or `require` statements referencing packages outside `node:*` built-ins
- ✅ **ONLY** use `node:fs`, `node:path`, `node:child_process`, `node:util`, and other Node.js built-in modules
- ✅ **DO** check this list before sweeping refactors (e.g., "convert all fs calls to StorageProvider")
- ✅ **LOOK** for `— zero dependencies` markers in file headers as a signal

### Why this matters
Regression tests guard these files (`detect-squad-dir-zero-deps.test.ts` verifies zero external dependencies), but **prevention is better than detection**. A broken bootstrap means the entire CLI fails to start — no helpful error, just a crash.

> **When adding new bootstrap utilities**, add them to this table and write a matching zero-dependency regression test.

### SDK/CLI package boundary
The CLI (`squad-cli`) depends on the SDK (`squad-sdk`). Some CLI files run **before** the SDK is fully loaded. The `packages/squad-cli/src/cli/core/` directory contains a mix of early-startup/bootstrap utilities and later SDK-dependent modules, so treat every file in it with extra caution. The protected list above is the authoritative set of zero-dependency bootstrap files. If you need to add SDK imports to another `core/` file, verify it is not in the protected list above and confirm the SDK is loaded at that point in the startup sequence.

## Sweeping Refactor Rules

When applying a codebase-wide pattern change (e.g., "convert all `fs` calls to `StorageProvider`"), follow these steps **before** converting each file:

1. **Check the Protected Files list above.** If the file is listed, do NOT convert it.
2. **Scan for zero-dependency markers.** Look for `— zero dependencies` in the file's header comment. If present, do NOT convert it.
3. **Verify imports resolve.** When adding `import { X } from '@bradygaster/squad-sdk'`, confirm `X` is actually exported from the SDK's barrel file (`packages/squad-sdk/src/index.ts`). Unresolved imports cause build failures.
4. **Never convert ALL files blindly.** Some files have specific constraints documented in their headers or in this instructions file. Read before you refactor.
5. **Test after each logical group.** Don't convert 30 files and then run the build — convert in small batches and verify each one compiles.

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

## PR Review Skills

When reviewing or creating PRs, consult these skills for domain-specific checklists:

- **Reviewer Protocol:** `.copilot/skills/reviewer-protocol/SKILL.md` — rejection workflow, lockout rules
- **Architectural Review:** `.copilot/skills/architectural-review/SKILL.md` — module boundaries, dependency safety, pattern consistency
- **Security Review:** `.copilot/skills/security-review/SKILL.md` — credentials, injection, workflow permissions, supply chain

Read the relevant skill(s) before submitting or reviewing a PR that touches their domain.

## PR Scope Rules

Scope is determined by PR labels, not by branch name. Continue using the squad branch convention: `squad/{issue-number}-{slug}`.
- **Repo-health PRs** (label `repo-health`): Only modify `.github/`, `scripts/`, root config files, test files, and docs. NEVER modify files under `packages/*/src/`.
- **Product PRs** (label `fix` or `feat`): May modify product source code. Must include changesets when required by the rules below.
- If a task requires both infrastructure and product changes, create separate PRs.

## Changeset Requirement

Any PR that modifies files under `packages/squad-cli/src/` or `packages/squad-sdk/src/` MUST include a changeset file.

- Run `npx changeset add` and select the affected package(s)
- Or manually create `.changeset/{descriptive-name}.md` with format:
  ```
  ---
  '@bradygaster/squad-cli': patch
  ---
  Brief description of the change
  ```
- Use `patch` for bug fixes, `minor` for new features, `major` for breaking changes
- The `changelog-gate` CI check will fail without this
- Escape hatch: add the `skip-changelog` label (use sparingly)

## Decisions

If you make a decision that affects other team members, write it to:
```
.squad/decisions/inbox/copilot-{brief-slug}.md
```
The Scribe will merge it into the shared decisions file.
