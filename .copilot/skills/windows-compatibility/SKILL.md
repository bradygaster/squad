---
name: "windows-compatibility"
description: "Cross-platform path handling and command patterns"
domain: "platform"
confidence: "high"
source: "earned (multiple Windows-specific bugs: colons in filenames, git -C failures, path separators)"
---

## Context

Squad runs on Windows, macOS, and Linux. Several bugs have been traced to platform-specific assumptions: ISO timestamps with colons (illegal on Windows), `git -C` with Windows paths (unreliable), forward-slash paths in Node.js on Windows.

## Patterns

### Filenames & Timestamps
- **Never use colons in filenames:** ISO 8601 format `2026-03-15T05:30:00Z` is illegal on Windows
- **Use `safeTimestamp()` utility:** Replaces colons with hyphens → `2026-03-15T05-30-00Z`
- **Centralize formatting:** Don't inline `.toISOString().replace(/:/g, '-')` — use the utility

### Git Commands
- **Never use `git -C {path}`:** Unreliable with Windows paths (backslashes, spaces, drive letters)
- **Always `cd` first:** Change directory, then run git commands
- **Check for changes before commit:** `git diff --cached --quiet` (exit 0 = no changes)

### Commit Messages
- **Never embed newlines in `-m` flag:** Backtick-n (`\n`) fails silently in PowerShell
- **Use temp file + `-F` flag:** Write message to file, commit with `git commit -F $msgFile`

### Paths
- **Never assume CWD is repo root:** Always use `TEAM ROOT` from spawn prompt or run `git rev-parse --show-toplevel`
- **Use path.join() or path.resolve():** Don't manually concatenate with `/` or `\`

## Examples

✓ **Correct:**
```powershell
// Timestamp utility
const safeTimestamp = () => new Date().toISOString().replace(/:/g, '-').split('.')[0] + 'Z';

// Git workflow (PowerShell)
cd $teamRoot
# ⚠️ NEVER use `git add .squad/` or broad globs — only stage files you intentionally changed
# Stage only files you actually modified — use git status to build explicit list
$filesToStage = git status --porcelain | Where-Object { $_.Length -gt 3 } | ForEach-Object { $_.Substring(3) -replace '^.* -> ','' } | Where-Object {
  $_ -eq '.squad/decisions.md' -or
  $_ -eq '.squad/decisions-archive.md' -or
  $_ -like '.squad/agents/*/history.md' -or
  $_ -like '.squad/agents/*/history-archive.md' -or
  $_ -like '.squad/log/*' -or
  $_ -like '.squad/orchestration-log/*'
}
if ($filesToStage) { $filesToStage | Where-Object { $_ } | ForEach-Object { git add -- $_ } }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  $msg = @"
docs(ai-team): session log

Changes:
- Added decisions
"@
  $msgFile = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $msgFile -Value $msg -Encoding utf8
  git commit -F $msgFile
  Remove-Item $msgFile
}
```

✗ **Incorrect:**
```javascript
// Colon in filename
const logPath = `.squad/log/${new Date().toISOString()}.md`; // ILLEGAL on Windows

// git -C with Windows path
exec('git -C C:\\src\\squad add .squad/'); // UNRELIABLE

// Inline newlines in commit message
exec('git commit -m "First line\nSecond line"'); // FAILS silently in PowerShell
```

## Anti-Patterns

- Testing only on one platform (bugs ship to other platforms)
- Assuming Unix-style paths work everywhere
- Using `git -C` because it "looks cleaner" (it doesn't work)
- Skipping `git diff --cached --quiet` check (creates empty commits)
