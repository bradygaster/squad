# Distributed Coordination Skills

> Four battle-tested skills for running multiple Squad agents reliably on the same machine or across machines.

When you scale Squad beyond a single agent loop — multiple Ralphs, multi-machine deployments, or concurrent
agent spawns — you start hitting classical distributed systems problems. These four skills encode the fixes,
each earned from a real production incident.

## gh-auth-isolation

**Problem:** Multiple Ralph instances on the same machine fight over `~/.config/gh/hosts.yml`. When one Ralph
calls `gh auth switch --user A`, it clobbers the auth state for every other Ralph on the machine, causing
cascading 401 failures.

**Fix:** Use `GH_CONFIG_DIR` to give each process a completely isolated `gh` config directory.

```powershell
# Each Ralph sets this before any gh calls
$account = if ((git remote get-url origin) -match "work-org") { "work" } else { "personal" }
$env:GH_CONFIG_DIR = Join-Path $env:USERPROFILE ".config\gh-$account"
```

No cross-talk between processes. No `gh auth switch` needed. See [`.squad/skills/gh-auth-isolation/`](../..)
for the full pattern including Linux/macOS equivalents.

**Distributed systems pattern:** State partitioning — give each process its own identity and storage instead of
sharing mutable global state.

## stale-lock-detection

**Problem:** When a Ralph crashes, it leaves a lock file behind. The next start refuses to run because it sees
the lock — guarding against a process that no longer exists.

**Fix:** Three-layer guard: named OS mutex (auto-released on crash) + PID validation (detect zombie processes)
+ lockfile cleanup on exit.

```powershell
# Layer 3: PID-validated lock file
if (Test-Path $lockFile) {
    $existing = Get-Content $lockFile | ConvertFrom-Json
    if (-not (Get-Process -Id $existing.pid -ErrorAction SilentlyContinue)) {
        Write-Warning "Clearing stale lock (PID $($existing.pid) no longer exists)"
        Remove-Item $lockFile -Force
    }
}
```

See [`.squad/skills/stale-lock-detection/`](../..) for the full three-layer implementation.

**Distributed systems pattern:** Lease-based locking with failure detection — the same problem ZooKeeper
ephemeral nodes and etcd leases solve.

## message-serialization

**Problem:** When spawning an agent with a large prompt via `Start-Process`, Windows interprets the entire
7KB prompt string as the command name. Result: "command not found: Ralph, Go! MAXIMIZE PARALLELISM..."

**Fix:** Write the prompt to a temp file, pass the file path as the argument.

```powershell
$promptFile = [System.IO.Path]::GetTempFileName() + ".txt"
$prompt | Out-File -FilePath $promptFile -Encoding utf8
try {
    Start-Process "agency" -ArgumentList @("copilot", "--yolo", "--prompt-file", $promptFile) -Wait
} finally {
    Remove-Item $promptFile -Force -ErrorAction SilentlyContinue
}
```

See [`.squad/skills/message-serialization/`](../..) for when to apply this and cleanup patterns.

**Distributed systems pattern:** Indirection — when your transport can't handle your message format, pass a
reference to the data instead.

## notification-routing

**Problem:** As the squad grows, all notifications flood a single channel. Failure alerts get buried in daily
tech digests. Signal becomes noise. People stop reading.

**Fix:** Define a channel routing config. Agents tag notifications by type. A dispatcher routes each to the
right destination.

```json
{
  "channels": {
    "notifications": "squad-alerts",
    "tech-news": "tech-news",
    "security": "security-findings"
  }
}
```

See [`.squad/skills/notification-routing/`](../..) for the full routing pattern and service discovery guidance.

**Distributed systems pattern:** Pub-sub with topic routing — the same principle as Kafka topics and RabbitMQ
routing keys.

## When Do You Need These?

| Situation | Skills to Apply |
|-----------|-----------------|
| Running 2+ Ralphs on the same machine | `gh-auth-isolation` |
| Ralph fails to start after a crash | `stale-lock-detection` |
| Agent spawn fails with "command not found" | `message-serialization` |
| Notification channel becoming noisy | `notification-routing` |
| Multi-machine Squad deployment | All four |

## Related

- [Streams / SubSquads](./streams.md) — partitioning work across machines
- [Ralph](./ralph.md) — persistent work monitor
- [Model Selection](./model-selection.md) — circuit breaker for rate limits
