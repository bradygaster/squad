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

### Red Flags — STOP and Ask
If you see any of these, STOP immediately and comment on the issue asking for guidance:
- More than 20 files in your diff
- ANY file deletions you didn't explicitly intend
- Changes outside the scope of your assigned issue

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

## PR Requirements — Pre-Push Quality Checklist

Before pushing code that will become a PR, run these checks locally. These mirror what CI will catch, but running them early saves a round-trip.

### 1. CHANGELOG gate
If you changed files in `packages/squad-sdk/src/` or `packages/squad-cli/src/`, you **must** also update `CHANGELOG.md` with an entry under `[Unreleased]`. CI will block if you forget. Bypass: `skip-changelog` label (requires reviewer approval).

### 2. Exports map check
Run `node scripts/check-exports-map.mjs` before pushing. If you added a new `src/*/index.ts` barrel directory, it must have a matching entry in `packages/squad-sdk/package.json` exports. CI will block if missing. Bypass: `skip-exports-check` label (requires reviewer approval).

### 3. Samples build (planned — PR #674)
If you changed SDK source files, verify your changes don't break sample projects by running `npm run build` in any affected sample directory. A CI gate (`samples-build`) covering all 9 samples is planned in PR #674 but not yet active — this is a manual pre-push check until that PR merges. Bypass (once active): `skip-samples-ci` label (requires reviewer approval).

### 4. PR description completeness
Fill in all sections of the PR template (What, Why, How, Testing). If your changes are user-facing (SDK exports or CLI commands), the Docs section must include a CHANGELOG entry reference. Empty template sections will be flagged during review.

### 5. User-facing change detection
A change is **user-facing** if it touches:
- `packages/squad-sdk/src/` (SDK exports consumers import)
- `packages/squad-cli/src/cli/` (CLI commands users run)

User-facing changes require: CHANGELOG entry, README update (if new feature), docs page (if new capability), package.json exports (if new module), and sample updates (if API changed).

### 6. Escape hatches
All CI gates have skip labels and global feature flags. **Self-waiving is not allowed** — another reviewer must agree before you add a skip label. See `.github/PR_REQUIREMENTS.md` for the full spec.

## Decisions

If you make a decision that affects other team members, write it to:
```
.squad/decisions/inbox/copilot-{brief-slug}.md
```
The Scribe will merge it into the shared decisions file.
