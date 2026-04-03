---
name: "nap"
description: "Context hygiene — compress, prune, archive .squad/ state to reclaim context window budget"
license: "MIT"
metadata:
  domain: "context-management"
  confidence: "medium"
  source: "team vote (4-1) and initial implementation"
  compatibility: "GitHub Copilot CLI, VS Code Copilot Chat"
  triggers: [nap, context, hygiene, compress, prune, archive, history, cleanup]
  roles: [architect, lead, scribe]
---

# Skill: nap

> Context hygiene — compress, prune, archive .squad/ state

## What It Does

Reclaims context window budget by compressing agent histories, pruning old logs,
archiving stale decisions, and cleaning orphaned inbox files.

## When To Use

- Before heavy fan-out work (many agents will spawn)
- When history.md files exceed 15KB
- When .squad/ total size exceeds 1MB
- After long-running sessions or sprints

## Invocation

- CLI: `squad nap` / `squad nap --deep` / `squad nap --dry-run`
- REPL: `/nap` / `/nap --dry-run` / `/nap --deep`

## Confidence

medium — Confirmed by team vote (4-1) and initial implementation
