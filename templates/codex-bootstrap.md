# Codex Bootstrap

This repository uses `.squad/` as shared agent memory and routing.

## Startup

Before substantial work, read these files:

1. `.squad/guardrails.md` if present
2. `.squad/codex.md`
3. `.squad/shared-knowledge.md`
4. `.squad/routing.md`
5. `.squad/identity/now.md`

For quick factual questions, answer directly after reading only the files needed.

## Squad Mapping

When the user asks for "squad", "team", or named squad members, use `.squad/routing.md` to decide who participates.

Codex sub-agent role names may differ from Squad member names. Map Squad members into available Codex agent types by passing the member charter in the delegated prompt.

Keep active sub-agents within the limit defined by local guardrails.

## Shared Knowledge

Treat `.squad/shared-knowledge.md` as reusable project memory. Add durable, task-independent facts there when they would help future sessions avoid rediscovery.

Use `.squad/identity/wisdom.md` for distilled lessons and heuristics.
Use `.squad/decisions.md` or `.squad/decisions/inbox/` for decisions that affect the team.

## Git Safety

This repo may contain user changes. Before editing, inspect status. Do not revert unrelated changes.

Prefer scoped edits. If a task needs broad changes, state the intended write set before editing.
