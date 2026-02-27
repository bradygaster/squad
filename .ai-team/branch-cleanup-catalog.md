# Squad Repository Branch Cleanup Catalog

**Prepared by:** Kobayashi (Git & Release Engineer)  
**Date:** 2026-02-24  
**Status:** ⚠️ **CATALOG ONLY** — No branches deleted. Awaiting Brady's approval.

---

## 1. Safe to Delete (Merged into main)

These 21 branches are fully merged into `main` and can be safely deleted without losing any work:

| Branch | Last Commit | Notes |
|--------|-------------|-------|
| `preview` | 2026-02-20 04:10:09 -0800 | Behind main by 22 commits; fully merged |
| `squad/101-cli-dual-path-squad-migration` | 2026-02-19 23:23:03 -0800 | Feature complete |
| `squad/102-agent-md-path-migration` | 2026-02-19 23:37:26 -0800 | Migration complete |
| `squad/103-workflow-dual-path` | 2026-02-19 23:14:35 -0800 | Workflow documented |
| `squad/105-docs-test-updates` | 2026-02-19 23:00:26 -0800 | Aggressive archive completed |
| `squad/107-identity-layer` | 2026-02-20 00:28:48 -0800 | Identity layer feature merged |
| `squad/108-email-privacy-scrub` | 2026-02-19 23:19:32 -0800 | Privacy updates documented |
| `squad/30-ssh-agent-hang-fix` | 2026-02-12 23:26:18 -0800 | Workaround documented |
| `squad/59-fix-too-many-arguments-v2` | 2026-02-13 16:02:30 -0800 | Logo fix merged |
| `squad/62-release-hardening` | 2026-02-20 00:25:19 -0800 | v0.5.0 release complete |
| `squad/64-scrub-docs-formatting` | 2026-02-13 16:02:30 -0800 | Logo fix merged |
| `squad/65-blog-toc-ordering` | 2026-02-13 16:02:30 -0800 | Logo fix merged |
| `squad/71-remove-deprecation-banner` | 2026-02-20 00:03:52 -0800 | v0.5.0 PR merged |
| `squad/82-skills-export-import` | 2026-02-20 00:20:22 -0800 | Skill portability verified |
| `squad/84-iso-8601-timestamps` | 2026-02-20 00:15:27 -0800 | Cold-path extracted |
| `squad/85-decision-lifecycle` | 2026-02-20 00:17:40 -0800 | Decision system merged |
| `squad/98-extract-cold-sections` | 2026-02-20 00:03:52 -0800 | Cold sections extracted |
| `squad/v040-docs-mcp-notifications-plugins` | 2026-02-13 03:09:31 -0800 | MCP docs complete |
| `squad/v040-tests-mcp-plugins` | 2026-02-13 03:15:00 -0800 | Plugin tests complete |
| `wave-2` | 2026-02-09 15:00:22 -0800 | v0.2.0 release complete |

**Action:** These can be deleted without review.

---

## 2. Evaluate (Unmerged Branches)

These 13 branches are **NOT** merged into `main`. Review before cleanup decision:

### Critical/Recent Branches (May Be In-Progress)

| Branch | Last Commit | Remote Status | Notes |
|--------|-------------|---------------|-------|
| `dev` | 2026-02-23 14:54:34 -0800 (implied) | `origin/dev` (tracking) | **PRIMARY DEVELOPMENT BRANCH** — do not delete |
| `insider` | 2026-02-15 16:28:56 -0800 (implied) | `origin/insider` (tracking) | **RELEASE TRACK** — keep for versioning |

### Squad Feature Branches (Unmerged)

| Branch | Last Commit | Remote Status | Notes |
|--------|-------------|---------------|-------|
| `squad/104-merge-ai-team-templates` | 2026-02-19 23:29:22 -0800 | Ahead of origin by 2 | **UNMERGED** — needs merge or close |
| `squad/108-email-scrub-migration` | 2026-02-20 00:36:13 -0800 | No local; origin only | **ORPHAN** — created on origin but lost locally |
| `squad/11-enable-mcp-use` | 2026-02-13 03:22:52 -0800 | origin/squad/11-enable-mcp-use: gone | **GONE** — remote deleted, branch obsolete |
| `squad/29-plugin-marketplace` | 2026-02-13 03:17:57 -0800 | origin/squad/29-plugin-marketplace: gone | **GONE** — remote deleted, branch obsolete |
| `squad/58-fix-team-md-header` | 2026-02-14 19:28:43 -0800 | No local match | **ORPHAN** — origin only |
| `squad/59-fix-cli-error` | 2026-02-14 20:46:28 -0800 | Ahead of origin by 4 | **UNMERGED** — needs merge or close |
| `squad/66-init-skips-confirmation` | 2026-02-15 01:13:12 -0800 | No local match | **ORPHAN** — origin only |
| `squad/73-emoji-description-field` | 2026-02-15 02:29:30 -0800 | No local match | **ORPHAN** — origin only |
| `squad/86-prevent-git-checkout-data-loss` | 2026-02-20 01:21:31 -0800 | No local match | **ORPHAN** — origin only |
| `squad/87-project-type-detection` | 2026-02-20 01:28:57 -0800 | Has stash@{1} | **STASHED WORK** — see stash section |
| `squad/issues-49-50-51` | 2026-02-13 12:37:42 -0800 | No local match | **ORPHAN** — origin only |
| `squad/npmignore-cleanup` | 2026-02-13 12:13:20 -0800 | No local match | **ORPHAN** — origin only |
| `squad/ralph-watch` | 2026-02-20 02:27:40 -0800 | Ahead by 2, behind by 6 | **DIVERGED** — tracked from `spboyer/squad/ralph-watch` |

---

## 3. Remote-Only Branches (No Local Tracking)

These 10 remote branches exist but have no corresponding local branch checked out:

| Remote Branch | Status | Action |
|---------------|--------|--------|
| `origin/squad/93-fix-agent-command-docs` | Merged into main | Safe to prune |
| `origin/squad/98-extract-cold-path-sections` | Merged into main | Safe to prune |
| `spboyer/feature/copilot-coding-agent-member` | External contributor | Check with spboyer |
| `spboyer/feature/issue-assignment-triage` | External contributor | Check with spboyer |
| `spboyer/feature/ralph-work-monitor` | External contributor | Check with spboyer |
| `spboyer/feature/issues-prd-humans` | External contributor | Check with spboyer |
| `spboyer/main` | External contributor | Check with spboyer |
| `spboyer/squad/ralph-idle-watch` | External contributor | Check with spboyer |

---

## 4. Candidate Branches for Origin Cleanup

These remote branches have been **merged into `origin/main`** and can be pruned from the remote:

```
origin/preview
origin/squad/101-cli-dual-path-squad-migration
origin/squad/102-agent-md-path-migration
origin/squad/103-workflow-dual-path
origin/squad/107-identity-layer
origin/squad/108-email-privacy-scrub
origin/squad/108-email-scrub-migration
origin/squad/59-fix-too-many-arguments-v2
origin/squad/62-release-hardening
origin/squad/71-remove-deprecation-banner
origin/squad/82-skills-export-import
origin/squad/84-iso-8601-timestamps
origin/squad/85-decision-lifecycle
origin/squad/98-extract-cold-path-sections
```

**Command to prune:** (Brady to approve before running)
```bash
git push origin --delete preview squad/101-cli-dual-path-squad-migration squad/102-agent-md-path-migration ...
```

---

## 5. Stash Inventory

**11 stashes** exist in the repository. These contain uncommitted work that should be reviewed before cleanup:

| Stash | Branch | Description |
|-------|--------|-------------|
| `stash@{0}` | `main` | WIP on main: dfbc625 (Revert commit) |
| `stash@{1}` | `squad/87-project-type-detection` | WIP on squad/87 (Issues #86 & #87 completion) |
| `stash@{2}` | `dev` | WIP on dev: e9c4954 (Email scrub repair + test fixes) |
| `stash@{3}` | `squad/85-decision-lifecycle` | WIP on squad/85 (Remove deprecation banner) |
| `stash@{4}` | `squad/71-remove-deprecation-banner` | WIP on squad/71 (v0.5.0 PR merge completion) |
| `stash@{5}` | `squad/98-extract-cold-path-sections` | WIP on squad/98 (Remove deprecation banner) |
| `stash@{6}` | `squad/103-workflow-dual-path` | WIP on squad/103 (Workflow dual-path work) |
| `stash@{7}` | `squad/93-fix-agent-command-docs` | WIP on squad/93 (Blog post #9 GitHub Trending) |
| `stash@{8}` | `main` | On main: **temp stash for PR 74 investigation** |
| `stash@{9}` | `squad/11-enable-mcp-use` | On squad/11: `fenster-wip` |
| `stash@{10}` | `squad/v040-tests-mcp-plugins` | WIP on squad/v040 (Context window optimization #37) |

**Recommendation:** Before cleanup, run `git stash show -p stash@{N}` on high-value stashes to ensure no work is lost.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Total local branches | 38 |
| Safe to delete (merged) | 21 |
| Unmerged (evaluate) | 13 |
| Development branches (keep) | 2 (`dev`, `insider`) |
| Remote-only branches | 10 |
| Remote candidates for pruning | 14 |
| Total stashes | 11 |

---

## Next Steps

1. **Brady reviews** this catalog
2. **Brady approves** deletion list for local branches
3. **Brady approves** prune list for remote branches
4. **Brady decides** on high-value stashes (potential restore)
5. Kobayashi executes approved deletions

---

## Commands Ready for Execution (Pending Approval)

### Delete merged local branches:
```bash
git branch -d preview squad/101-cli-dual-path-squad-migration squad/102-agent-md-path-migration \
  squad/103-workflow-dual-path squad/105-docs-test-updates squad/107-identity-layer \
  squad/108-email-privacy-scrub squad/30-ssh-agent-hang-fix squad/59-fix-too-many-arguments-v2 \
  squad/62-release-hardening squad/64-scrub-docs-formatting squad/65-blog-toc-ordering \
  squad/71-remove-deprecation-banner squad/82-skills-export-import squad/84-iso-8601-timestamps \
  squad/85-decision-lifecycle squad/98-extract-cold-sections squad/v040-docs-mcp-notifications-plugins \
  squad/v040-tests-mcp-plugins wave-2
```

### Prune merged remote branches:
```bash
git push origin --delete preview squad/101-cli-dual-path-squad-migration squad/102-agent-md-path-migration \
  squad/103-workflow-dual-path squad/107-identity-layer squad/108-email-privacy-scrub \
  squad/108-email-scrub-migration squad/59-fix-too-many-arguments-v2 squad/62-release-hardening \
  squad/71-remove-deprecation-banner squad/82-skills-export-import squad/84-iso-8601-timestamps \
  squad/85-decision-lifecycle squad/98-extract-cold-path-sections
```

