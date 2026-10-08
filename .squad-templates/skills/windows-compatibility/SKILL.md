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

### Path Comparison (Case Sensitivity)
- **Never use naive prefix checks to confine paths:** a bare substring/prefix match can let sibling paths escape the intended root
- **Never infer case-insensitive behavior from `process.platform` alone:** Windows is case-insensitive, but Darwin volumes are not all case-insensitive. APFS and HFS+ can be case-sensitive; a blanket lowercase conversion on macOS can conflate distinct sibling directories.
- **Use filesystem-aware case handling:** Only fold case when the relevant volume has been explicitly identified as case-insensitive. Otherwise, compare the resolved path case-sensitively.
- **Current implementation caveat:** This is the safe target pattern, not a claim about every existing repository implementation. `FSStorageProvider` currently folds case for all Darwin paths, so its root confinement is not volume-aware on case-sensitive macOS filesystems.
- **Resolve first, compare second:** resolve both paths before comparing; do not compare user input or unresolved relative segments.
- **Root confinement must be exact-match-or-separator:** a path is within `rootDir` only when it equals the normalized root exactly or starts with `rootDir + path.sep`; a bare substring/prefix match lets `/root-escape` slip past `/root`. Filesystem roots are valid roots and must remain exact-match-or-separator checks.
- **Where it matters:** security checks such as path-traversal prevention, `rootDir` confinement, and any validation that a resolved path stays under an allowed directory
- **Pattern:**
  ```typescript
  import path from 'node:path';

  function normalizeForRootComparison(value: string, volumeIsCaseInsensitive = false): string {
    return volumeIsCaseInsensitive ? value.toLowerCase() : value;
  }

  function isPathWithin(candidate: string, rootDir: string, volumeIsCaseInsensitive = false): boolean {
    const a = normalizeForRootComparison(path.resolve(candidate), volumeIsCaseInsensitive);
    const b = normalizeForRootComparison(path.resolve(rootDir), volumeIsCaseInsensitive);
    const boundary = b.replace(/[\\/]+$/, '') + path.sep;
    return a === b || a.startsWith(boundary);
  }
  ```
- **Resolve first, compare second:** compare normalized absolute paths; only treat a case mismatch as equivalent when the relevant filesystem volume has already been confirmed to be case-insensitive

### Repairing Stale LF-Pinned Working Trees

An `eol=lf` attribute affects checkout behavior; it does not repair files that were already
materialized with CRLF. For the known shebang failure mode, use the repository's
`scripts/fix-crlf-worktree.mjs` rather than a broad renormalization:

1. Identify LF-pinned files that are CRLF on disk.
2. Exclude files with a real content difference from the index.
3. Rewrite only content-clean paths from the index with `git checkout-index -f`.
4. Re-measure the complete repair set and report repaired, skipped, and remaining paths.

This is a local repair, not a source rewrite. Do not use `git add --renormalize .`; it rewrites
the index and creates unrelated line-ending churn. Do not force-checkout a locally modified file.

## Examples

✓ **Correct:**
```powershell
# Timestamp utility
$safeTimestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ssZ')

# Git workflow (PowerShell)
cd $teamRoot
# NEVER use `git add .squad/` or broad globs — only stage files you intentionally changed
# Stage only files you actually modified — use git status to build explicit list
$filesToStage = git status --porcelain | Where-Object { $_.Length -gt 3 } | ForEach-Object { $_.Substring(3) -replace '^.* -> ','' } | Where-Object {
  $_ -eq '.squad/decisions.md' -or
  $_ -eq '.squad/decisions-archive.md' -or
  $_ -like '.squad/agents/*/history.md' -or
  $_ -like '.squad/agents/*/history-archive.md'
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
- Assuming all Darwin filesystems are case-insensitive for root-confinement checks
