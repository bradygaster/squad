---
name: fork-first-pipeline
description: Canonical fork-first pipeline with team review, Copilot gates, and upstream sync
domain: fork-workflow, pull-request-management, cross-account-sync
confidence: medium
version: 2.0
---

# Fork-First Pipeline — Canonical 4-Phase Workflow

The fork-first pipeline ensures clean, Copilot-reviewed code flows from development on the fork (diberry/squad) to publication on the canonical upstream (bradygaster/squad). All iteration, review, and refinement happens on the fork; only finished, clean PRs appear on upstream.

---

## Phase 1: DEVELOP (on diberry/squad)

Develop and iterate locally on the fork.

### Create branch and commit work
```powershell
git checkout -b squad/{issue-number}-{slug}
# Make changes
git add path/to/file1 path/to/file2
git commit -m "Your commit message"
```

### Team review (Flight + FIDO)
- Push branch: `git push -u origin squad/{branch}`
- Open PR on diberry/squad targeting `dev`
- Wait for Flight and FIDO to approve

### Request Copilot review
```powershell
gh pr edit {N} --repo diberry/squad --add-reviewer copilot
```

### Triage Copilot comments
For each Copilot comment:
- **Accept** — Fix the issue: `git add ... && git commit ... && git push`
- **Dismiss** — Reply on the comment explaining why

### Re-request if you made changes
```powershell
gh pr edit {N} --repo diberry/squad --add-reviewer copilot
```

### Iterate until Copilot clean
All Copilot comments must be resolved (fixed or explained) before moving to Phase 2.

### Squash to single commit
```powershell
git rebase -i upstream/dev  # Interactive rebase to squash
git push origin squad/{branch} --force-with-lease
```

**Gate:** PR must be:
- Copilot-clean (no unresolved comments)
- Team-approved (Flight + FIDO)
- Single squashed commit
- Ready for upstream sync

---

## Phase 2: PREPARE for upstream

Rebase, verify, and clean up before opening upstream PR.

### Fetch and rebase onto upstream/dev
```powershell
git fetch upstream && git rebase upstream/dev
# Resolve any conflicts
git push origin squad/{branch} --force-with-lease
```

### File bleed check
```powershell
git diff upstream/dev --stat
```
**Must show ONLY intended files.** NO:
- `.squad/` state files
- `node_modules/`
- `.env` or secrets
- Build artifacts (`dist/`, `build/`, `coverage/`)

If you see unexpected files, clean them and re-commit.

### Clean PR description with proper encoding
```powershell
$body = @'
# Title

Description with:
— em-dashes
→ arrows
• bullets
"quoted text"
'@

$tempBodyFile = Join-Path $pwd "pr-body.txt"
$body | Out-File $tempBodyFile -Encoding utf8NoBOM
```

### Verify encoding integrity
```powershell
gh pr view {N} --repo diberry/squad --json body -q '.body' | Select-String "ΓÇö"
# Should return nothing (no mangled characters)
```

**Gate:** PR must have:
- ✅ Single commit, rebased from latest upstream/dev
- ✅ CI passing
- ✅ No file bleed
- ✅ Clean encoding in description

---

## Phase 3: PUBLISH to bradygaster/squad

Open new draft PR on upstream; iterate until Copilot-clean.

### Open NEW draft PR on upstream
```powershell
$tempBodyFile = Join-Path $pwd "pr-body.txt"
gh pr create --repo bradygaster/squad `
  --base dev `
  --head diberry:{branch} `
  --title "Your title" `
  --body-file $tempBodyFile `
  --draft
```

### Wait for upstream CI
Let the upstream fork run CI checks. Do NOT undraft yet.

### Copilot may raise NEW comments
Copilot reviews with upstream context (different branch state, CI environment). New comments may appear even if fork PR was clean.

**Triage same as Phase 1:**
- Fix accepted feedback: `git add ... && git commit ... && git push`
- Dismiss with explanation: reply on comment
- Re-request Copilot review if changes made

Iterate until **upstream** PR is Copilot-clean.

### Ready-for-review checklist
Before undrafting, verify ALL true:

```
[ ] Single squashed commit
[ ] Rebased from latest upstream/dev
[ ] CI green (all checks pass)
[ ] Copilot clean (no unresolved comments on upstream PR)
[ ] PR description clean (no encoding issues, includes context)
```

### Undraft when ready
```powershell
gh pr ready {N} --repo bradygaster/squad
```

### Add reviewer and notify
```powershell
gh pr edit {N} --repo bradygaster/squad --add-reviewer bradygaster
gh pr comment {N} --repo bradygaster/squad --body "@bradygaster Ready for review. Copilot-clean, CI green, single commit."
```

**What bradygaster sees:** One clean PR. No iteration history, no AI review noise, no encoding garbage.

---

## Phase 4: CLOSE fork PR

After upstream merge:
```powershell
gh pr close {FORK_PR_NUMBER} --repo diberry/squad
git push origin --delete squad/{branch}  # Optional: clean up branch
```

---

## Encoding Rules & Verification

### ⚠️ NEVER use these patterns
❌ Inline `--body "text with — em-dashes"` (loses encoding)
❌ Double-quoted here-strings `@"....."@` (PowerShell mangles Unicode)
❌ Default `Out-File` (uses UTF-16 LE)
❌ `@"..."@` double-quoted here-strings for PR text

### ✅ ALWAYS use this pattern
```powershell
# Single-quoted here-string (no interpolation)
$body = @'
Description with — em-dashes → arrows • bullets
'@

# UTF-8 NoBOM encoding
$tempBodyFile = "pr-body.txt"
$body | Out-File $tempBodyFile -Encoding utf8NoBOM

# Use --body-file (NEVER inline --body)
gh pr create --body-file $tempBodyFile ...
```

### Verify no mangling
```powershell
gh pr view {N} --json body -q '.body' | Select-String "ΓÇö"
# If nothing returned: ✓ encoding is clean
```

---

## Anti-Patterns

❌ **NEVER open upstream PR before fork PR is Copilot-clean** — Wastes upstream CI time
❌ **NEVER undraft upstream PR with unresolved comments** — Always iterate until clean
❌ **NEVER @mention Brady before the checklist passes** — Ensures he only sees ready PRs
❌ **NEVER use inline `--body`** — Always use `--body-file` with utf8NoBOM
❌ **NEVER skip file bleed check** — Prevents node_modules, build artifacts, secrets from leaking
❌ **NEVER use `git add .` or `git add -A`** — Always stage specific files: `git add path/to/file1 path/to/file2`
❌ **NEVER fix code without replying to the Copilot comment that flagged it** — Always use `gh api ... /replies` to acknowledge the fix

---

## Copilot Review Gates

### Comment Response Protocol

When fixing a Copilot review comment:
1. **Fix the code** — Make the change Copilot flagged
2. **Reply to the comment** — Use this command to reply:
   ```powershell
   gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies -f body="Fixed — {brief description of what changed}"
   ```
3. **For dismissed comments** — Reply with explanation why, then resolve the thread

When **ALL comments are addressed**, every thread should be resolved — no orphaned comments left hanging.

### Gate A: Fork PR (diberry/squad)

After team approval, request Copilot review:
```powershell
gh pr edit {N} --repo diberry/squad --add-reviewer copilot
```

**Triage each comment:**
- **Accept** → Fix, reply to comment, and commit changes
- **Dismiss** → Reply with explanation, resolve thread

**Re-request if changes made.** Iterate until zero unresolved comments.

**GATE PASS:** All Copilot feedback addressed before Phase 2.

### Gate B: Upstream PR (bradygaster/squad)

After creating upstream PR, Copilot reviews with different context. NEW comments may appear.

**Same triage process.** Keep PR in DRAFT until Copilot-clean.

**GATE PASS:** All checklist items true + Copilot clean → undraft and notify.

---

## References

- [GitHub CLI: gh pr create/edit](https://cli.github.com/manual/gh_pr_create)
- [PowerShell UTF-8 Encoding](https://learn.microsoft.com/en-us/powershell/scripting/dev-cross-plat/command-line-encoding)
- [Out-File Encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/out-file)
