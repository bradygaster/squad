---
title: "When Eight Ralphs Fight Over One Login"
date: 2026-03-17
author: "Tamir Dresher"
wave: 7
tags: [squad, distributed-systems, multi-machine, ralph, auth-isolation, reliability]
status: published
hero: "Real distributed systems problems — and fixes — from running 8 AI agents in parallel across 8 repos."
---

When you scale Squad to multiple machines or multiple concurrent agent loops, you stop worrying about prompts
and start worrying about infrastructure. Auth races. Stale locks. Notification storms. Prompt serialization
failures.

Every bug described here links to a real incident. Every fix is battle-tested.

## The Auth Race (37 Consecutive Failures)

Eight Ralph instances on one machine. Each Ralph calls `gh auth switch` to set the right account. They clobber
each other's global `~/.config/gh/hosts.yml`. Ralph-A sets personal, Ralph-B overwrites with work, Ralph-A
fails. Cascades. 37 rounds of failures over three hours.

**Fix:** [`gh-auth-isolation`](./../features/distributed-coordination) — each process gets its own
`GH_CONFIG_DIR`. No shared state. No coordination needed.

## The Stale Lock

A crash left a lock file with PID 40544. The process was gone. The lock was not. Ralph refused to start.

**Fix:** [`stale-lock-detection`](./../features/distributed-coordination) — three-layer guard: named OS mutex
(auto-released on crash) + PID validation + lockfile cleanup on exit.

## The 7KB Prompt That Became a Command Name

`Start-Process` received a 7KB multiline prompt as an argument. Windows interpreted the entire string as the
executable name. "Command not found: Ralph, Go! MAXIMIZE PARALLELISM..."

**Fix:** [`message-serialization`](./../features/distributed-coordination) — write the prompt to a temp file,
pass the file path as the argument.

## The Notification Firehose

20+ notifications per day to one channel. Failure alerts buried in tech news. Everyone stopped reading.

**Fix:** [`notification-routing`](./../features/distributed-coordination) — define a channel routing config,
tag notifications by type, route each to the right destination.

## The Pattern

Every one of these bugs maps 1:1 to a textbook distributed systems problem:

| Incident | Classic Pattern | Fix |
|----------|-----------------|-----|
| Auth race | State partitioning | `gh-auth-isolation` |
| Stale lock | Failure detection / leases | `stale-lock-detection` |
| Prompt mangling | Message serialization | `message-serialization` |
| Notification flood | Pub-sub topic routing | `notification-routing` |

When you have multiple independent processes that need to coordinate — whether they're microservices,
Kubernetes pods, or AI agents — you hit the same fundamental problems. And the solutions are the same
fundamental patterns.

[Read the full post on Tamir's blog →](https://tamirdresher.github.io/blog/2026/03/17/scaling-ai-part4-distributed)
