---
title: Capability Routing
description: Machine capability discovery and needs:* label routing for hardware-specific and OS-specific work.
order: 35
---

# Capability Routing

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to declare machine capabilities:**
```
This machine has a GPU — tag it for GPU-required work
```

**Try this to route an issue to a capable machine:**
```
Label issue #42 with needs:gpu so it goes to the right runner
```

Squad discovers what each machine can do and routes issues only to machines that meet the requirements. No manual assignment needed for hardware- or OS-specific work.

---

## What Are Capabilities?

A capability is a label that describes what a machine can do — hardware, OS, or environment attributes that not every runner has. You declare capabilities in `machine-capabilities.json` at the project root or home directory; Squad reads them when routing issues.

Examples: `gpu`, `windows`, `macos`, `arm64`, `high-memory`, `docker`.

## Declaring Capabilities

Add a `capabilities` array to `machine-capabilities.json` at the project root or home directory on each machine:

```json
["gpu", "cuda", "high-memory"]
```

Squad reads this file at startup. The declared capabilities are available to the routing system immediately.

## The `needs:*` Label Pattern

Apply a `needs:*` label to any GitHub issue to require a specific capability:

| Label | Meaning |
|-------|---------|
| `needs:gpu` | Must run on a machine with GPU |
| `needs:windows` | Must run on Windows |
| `needs:macos` | Must run on macOS |
| `needs:arm64` | Must run on ARM64 architecture |
| `needs:docker` | Must run where Docker is available |

You can combine multiple `needs:*` labels — all must match.

## How Routing Works

When Ralph picks up an issue:

1. It reads all `needs:*` labels on the issue.
2. It compares them against the current machine's declared capabilities.
3. If the machine satisfies all requirements, it proceeds. If not, it skips the issue and leaves it for a capable machine to claim.

No central scheduler needed. Each machine self-selects based on what it can do.

## Example Flow

```
Issue #99  labels: needs:gpu, needs:windows
Machine A  capabilities: ["gpu", "windows", "cuda"]  ← picks it up
Machine B  capabilities: ["macos"]                   ← skips it
```

## See Also

- [Work Routing](routing.md) — pattern-based and skill-aware routing
- [Ralph — Work Monitor](ralph.md) — how Ralph polls and claims issues
