---
'@bradygaster/squad-cli': patch
---

fix(watch): wire missing CLI flags to config, validate --state-backend, fix auth stderr parsing (#834)

- Wire --notify-level, --overnight-start, --overnight-end, --sentinel-file to WatchConfig and loadWatchConfig merge
- Add --state-backend flag with upfront validation against allowed values (worktree, git-notes, orphan, external)
- Fix probeCurrentGhUser() to use `gh api user -q .login` (stdout) instead of parsing `gh auth status` stderr
- Also wire authUser through loadWatchConfig merge logic (was accepted but silently dropped)