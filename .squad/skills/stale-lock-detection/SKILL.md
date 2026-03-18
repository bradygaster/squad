---
name: stale-lock-detection
description: Three-layer guard to detect and clear stale process locks from crashed agents
domain: reliability, multi-machine, process-management
confidence: high
source: earned (stale PID 40544 incident — 2026-03-14, tamirdresher/tamresearch1)
---

## Context

When a Ralph (or any long-running agent) crashes or is killed, it may leave a lock file behind. On the next start,
the agent sees the lock and refuses to run — guarding against a process that no longer exists. This is the
**failure detection problem**: how do you know if a process that holds a lock is actually alive?

Traditional distributed systems solve this with heartbeats and lease-based locking (ZooKeeper ephemeral nodes,
etcd leases, Consul health checks). For a local agent loop, a three-layer guard provides equivalent guarantees
without external infrastructure.

**Trigger symptoms:**
- Ralph refuses to start with "already running" error after a machine restart or crash
- Lock file references a PID that no longer exists
- Agent loop stuck, never starting new rounds

## Patterns

### Three-Layer Guard

Apply all three layers in order. Each layer handles a different failure mode:

**Layer 1 — Named Mutex (OS-enforced):**
```powershell
$mutexName = "Global\RalphWatch_$(Split-Path $PWD -Leaf)"
$mutex = $null
try {
    $mutex = [System.Threading.Mutex]::new($false, $mutexName)
    $acquired = $mutex.WaitOne(0)   # Non-blocking — fail fast
    if (-not $acquired) {
        Write-Error "Another Ralph is running for this repo (mutex held)"
        exit 1
    }
} catch [System.Threading.AbandonedMutexException] {
    # Previous process crashed without releasing mutex — we inherit it
    Write-Warning "Acquired abandoned mutex — previous Ralph crashed ungracefully"
    $acquired = $true
}
```

The OS releases the mutex when the process exits, even on crash. `AbandonedMutexException` means the previous
holder crashed — we can safely take over.

**Layer 2 — PID Scan (Zombie killer):**
```powershell
# Kill any stale Ralph for THIS directory (not all Ralphs!)
$currentDir = $PWD.Path
$staleRalphs = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match 'ralph-watch' -and $_.CommandLine -match [regex]::Escape($currentDir) } |
    Where-Object { $_.ProcessId -ne $PID }

foreach ($stale in $staleRalphs) {
    Write-Warning "Killing stale Ralph PID $($stale.ProcessId)"
    Stop-Process -Id $stale.ProcessId -Force -ErrorAction SilentlyContinue
}
```

This handles the case where the mutex was abandoned but the process is somehow still listed (zombie state on
some platforms).

**Layer 3 — Lockfile with PID Validation:**
```powershell
$lockFile = Join-Path $PWD ".squad\ralph.lock"

# Read existing lock and validate
if (Test-Path $lockFile) {
    $existing = Get-Content $lockFile | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($existing -and $existing.pid) {
        $isAlive = Get-Process -Id $existing.pid -ErrorAction SilentlyContinue
        if ($isAlive) {
            Write-Error "Ralph already running (PID $($existing.pid) is alive)"
            exit 1
        } else {
            Write-Warning "Clearing stale lock (PID $($existing.pid) no longer exists)"
            Remove-Item $lockFile -Force
        }
    }
}

# Write our own lock
@{ pid = $PID; started = (Get-Date -Format "o"); directory = $PWD.Path } |
    ConvertTo-Json | Set-Content $lockFile

# Always clean up on exit
Register-EngineEvent PowerShell.Exiting -Action { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
trap { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
```

**Lockfile schema** (`.squad/ralph.lock`):
```json
{
  "pid": 12345,
  "started": "2026-03-14T09:12:04Z",
  "directory": "C:\\repos\\myproject"
}
```

The lockfile exists for **observability** — external tools (squad-monitor, dashboards) read it to know Ralph's
state. The mutex and PID scan do the actual locking.

### Linux/macOS Equivalent

```bash
LOCK_FILE=".squad/ralph.lock"
MUTEX_FILE="/tmp/ralph-$(basename $PWD).lock"

# PID-validated lock
if [ -f "$LOCK_FILE" ]; then
    OLD_PID=$(jq -r .pid "$LOCK_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Ralph already running (PID $OLD_PID)" >&2
        exit 1
    else
        echo "Clearing stale lock (PID $OLD_PID no longer exists)"
        rm -f "$LOCK_FILE"
    fi
fi

echo "{\"pid\": $$, \"started\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"directory\": \"$PWD\"}" > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT
```

## Anti-Patterns

**NEVER trust a lock file without validating the PID:**
```powershell
if (Test-Path $lockFile) {
    exit 1   # ❌ Dead process can hold a lock forever
}
```

**NEVER use file-based locking as your only mechanism:**
```powershell
# ❌ Lock files survive process crashes — you need OS-level mutex or PID check
New-Item $lockFile   # If the process crashes, this file stays forever
```

## Distributed Systems Pattern

This is **lease-based locking with failure detection** — the same problem that ZooKeeper ephemeral nodes,
etcd leases, and Consul health checks solve. A lock is only valid if you can verify the holder is alive.
Defense in depth: mutex covers normal exit, PID scan handles abandoned mutexes, lockfile provides observability.
