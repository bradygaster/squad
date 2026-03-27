# Bleed-Check: Cross-Branch Audit

## Confidence
High

## Domain
Periodic cross-branch bleed audits, stowaway file detection

## Problem Statement
Features developed on forks can accidentally include files intended for \.squad/\, docs, or unrelated purposes. These "stowaway" files pollute the upstream repository if not caught before PR merge. A periodic audit across all open PRs by a contributor identifies and flags these stragglers before they reach main.

## High-Risk Shared Files

**These files are the #1 bleed vectors** — they appear in almost every docs PR and are where cross-branch contamination happens most:

- **`navigation.ts`** — contains site structure and nav entries for all features
- **`test/docs-build.test.ts`** — build verification tests that reference multiple PRs' output paths
- **`docs/` directories** — shared documentation structure

**When checking these files, verify entries are ONLY for this PR's content — not entries from other concurrent PRs or stale previous runs. Flag full-file rewrites of these shared files — surgical additions only.**

## Trigger

- **Scheduled**: Twice per session day (morning and afternoon sweeps)
- **Proactive**: If >4 hours since last check, coordinator offers proactive bleed audit reminder

## Scope

All open PRs by **diberry** targeting **bradygaster/squad**

Query:
\\\ash
gh pr list --author diberry --repo bradygaster/squad --base dev --state open
\\\

## Process

### 1. List PRs
Fetch all open PRs from diberry targeting bradygaster/squad.

### 2. For Each PR: Check File List
Retrieve the file list:
\\\ash
gh pr view {pr-number} --repo bradygaster/squad --json files
\\\

### 3. Flag Stowaways
Check each file against the PR's stated purpose (from title/description). Red flags:

| Red Flag | Example | Why It's Bad |
|---|---|---|
| \.squad/\ files | \.squad/decisions/...\, \.squad/agents/...\ | Should not ship in app PRs |
| Navigation entries | \.squad/routing.md\ changes | Wrong PR can cause nav breakage |
| Test expectations | \.squad/agents/*/expected-output\ | Unmaintainable across PRs |
| Full-file rewrites | Accidental large refactors | Out of scope, causes merge debt |
| Build artifacts | \dist/\, \uild/\, \.next/\ | Should be in \.gitignore\ |
| Root-level strays | Unexpected \.env.local\, \secrets.json\ | Likely accidental commits |

### 3.5: Convention Gate Checks

While auditing files, also check for house-style violations. **These are blockers, not nits — per team directive.**

| Convention | Rule | Blocker? |
|-----------|------|----------|
| Internal link format | Use bare paths like `/features/memory`, not `/docs/features/memory` | ✅ Yes |
| Blank lines | Single blank line between sections (not double) | ✅ Yes |
| Entry duplication | Each nav entry appears exactly once | ✅ Yes |
| Stale TDD comments | Clean up "RED PHASE", "TODO: implement", "WIP" markers before merge | ✅ Yes |

### 3.6: CI Path Debugging Pattern

When CI reports a step as successful but tests fail on a missing file, path mismatches often indicate cross-branch contamination or stale config:

Example: CI says "generator succeeded — output at docs/public/" but the test looks for docs/dist/ and fails.

**Check actual path**:
\\\ash
ls -la docs/public/
ls -la docs/dist/
grep "outDir" build.config.ts
grep "docs/dist" test/docs-build.test.ts
\\\

**Pattern**: Add `ls -la {expected-path}` verification steps when debugging CI file issues. This reveals if the build wrote to the wrong directory (often from stale config or entries from another PR).

### 4. Output Format: Emoji-Based Table

\\\
| PR # | Title | Status | Bleed? | Details |
|---|---|---|---|---|
| #42 | Add auth feature | 🟢 CLEAN | No | All files in scope |
| #43 | Refactor parser | 🔴 BLEED | Yes | \.squad/routing.md\ found (stowaway) |
| #44 | Update docs | 🟢 CLEAN | No | Docs changes as intended |
\\\

Status indicators:
- 🟢 CLEAN: All files align with PR purpose
- 🔴 BLEED: Stowaway files detected, PR needs cleanup

## Coordinator Behavior

The Copilot acting as coordinator:

1. **Track Last Check Time**: Record timestamp of last bleed audit
2. **Proactive Reminders**: After 4+ hours, suggest: "Hey, time for a bleed check? Want me to audit your open PRs?"
3. **Detailed Reports**: Show emoji table with file-by-file breakdown
4. **Actionable Guidance**: If bleed detected, suggest: "Pull request #43 has \.squad/routing.md\ - should this be removed before merging?"

## Session Integration

- Check at start of session for any overnight bleeds
- Offer mid-session reminder if threshold exceeded
- Report findings before upstream PR opens
- Track frequency for team metrics

## Example Session Flow

\\\
✓ Session starts
  "Last bleed check was 6 hours ago. Want me to run an audit?" 
  [User: Yes]
  
→ Auditing 4 open PRs by diberry...
  | #42 | auth feature | 🟢 CLEAN |
  | #43 | parser refactor | 🔴 BLEED | .squad/routing.md detected |
  | #44 | docs update | 🟢 CLEAN |
  | #45 | ui polish | 🟢 CLEAN |

⚠️ Found 1 bleed in PR #43. Recommend removing .squad/routing.md before merging.
\\\

## Files to Inspect

- PR title and description (stated purpose)
- \gh pr view --json files\ output (file manifest)
- Commit diff per file (spot-check suspect files)
- PR body for merge strategy notes

## Non-Bleed Scenarios

NOT considered bleed:
- Legitimate test files for the PR feature
- README or CONTRIBUTING updates (if PR documents the change)
- New src/ files (app code is in scope)
- Configuration files directly related to the feature (tsconfig.json tweaks, etc.)
