---
name: gh-auth-isolation
description: Per-process GH_CONFIG_DIR isolation to prevent multi-Ralph auth race conditions
domain: security, multi-machine, github-cli
confidence: high
source: earned (37-consecutive-failure incident — 2026-03-16, tamirdresher/tamresearch1)
---

## Context

When multiple Ralph instances (or any concurrent Squad agents) run on the same machine, they all share a single `gh` CLI
auth state at `~/.config/gh/hosts.yml`. If one process calls `gh auth switch --user A` and another calls
`gh auth switch --user B`, they clobber each other's state. The result: cascading authentication failures across all
instances.

This is the **shared mutable global state** problem — the same issue that causes microservices to fail when they share a
database connection without tenant isolation. The fix is to partition the state.

**Trigger symptoms:**
- Multiple Ralph instances showing consecutive auth failures
- `gh` CLI operations failing with 401 after another agent ran nearby
- A `gh auth switch` call in one process breaking another process's auth state

## Patterns

### Option A — GH_CONFIG_DIR Isolation (Preferred)

Give each process its own completely isolated `gh` config directory. No cross-talk is possible.

```powershell
# At the top of ralph-watch.ps1, before any gh calls:
$account = if ($remoteUrl -match "your-work-org") { "work" } else { "personal" }
$env:GH_CONFIG_DIR = Join-Path $env:USERPROFILE ".config\gh-$account"

# Ensure the config dir is initialized for this account
if (-not (Test-Path (Join-Path $env:GH_CONFIG_DIR "hosts.yml"))) {
    Write-Warning "GH_CONFIG_DIR $env:GH_CONFIG_DIR not initialized. Run: GH_CONFIG_DIR=$env:GH_CONFIG_DIR gh auth login"
}
```

Each account has its own config directory:
- `~/.config/gh-personal/` — personal GitHub account
- `~/.config/gh-work/` — work/EMU GitHub account

No process can interfere with another's auth state. This is the approach used by
[gh-public-gh-emu-setup](https://github.com/jongio/gh-public-gh-emu-setup).

### Option B — GH_TOKEN Per-Process (Simpler, Less Complete)

If you only need to isolate the auth token (not other gh config), read the token once and set it as a
process-local environment variable:

```powershell
# Step -1: Self-healing auth — set process-local GH_TOKEN
$remoteUrl = & git remote get-url origin 2>&1 | Out-String
$requiredAccount = if ($remoteUrl -match "work-org") { "work-account" } else { "personal-account" }
$token = & gh auth token --user $requiredAccount 2>&1 | Out-String
if ($token -and $token.Trim().StartsWith("gho_")) {
    $env:GH_TOKEN = $token.Trim()   # Process-local only — no global mutation
}
```

This works because `GH_TOKEN` is read by the `gh` CLI per-call. No `gh auth switch` needed. No global state mutated.

### Shell/Bash Equivalent

```bash
# In ralph-watch.sh, before any gh calls:
ACCOUNT=$(git remote get-url origin | grep -q "work-org" && echo "work" || echo "personal")
export GH_CONFIG_DIR="$HOME/.config/gh-$ACCOUNT"
```

## Anti-Patterns

**NEVER do this in a multi-Ralph setup:**
```powershell
gh auth switch --user $account   # ❌ Mutates global ~/.config/gh/hosts.yml
```

**NEVER assume gh auth state is stable across concurrent processes:**
```powershell
gh auth status   # ❌ The status can change between this check and the next command
gh api /user     # ❌ May now use a different account than the line above
```

## Verification

After applying GH_CONFIG_DIR isolation, verify each Ralph uses independent state:

```powershell
# Should print different directories for each Ralph process
$env:GH_CONFIG_DIR

# Should succeed for the correct account without affecting other processes
gh api /user --jq .login
```

## Distributed Systems Pattern

This is **state partitioning** — the same fix for microservices sharing a database without tenant isolation.
Each process carries its own identity. No coordination needed. No locks needed.

Related upstream PR: [#416 — product isolation](https://github.com/bradygaster/squad/pull/416)
