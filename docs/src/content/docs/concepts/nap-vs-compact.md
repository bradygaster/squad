---
title: Nap vs /compact
description: How Squad nap and Copilot CLI /compact solve different memory problems at different layers.
---

# Nap vs /compact

Users hit memory limits in two ways: the chat gets too big, or agent memory piles up over time.

The pain shows up for users as slow agents, lost context, or token pressure — even though the fixes happen behind the scenes.

## How each one works

**Squad Nap** fixes a long-term team problem by archiving shared memory to disk. Nothing is lost, and future agents stay lean.

**/compact** fixes a right-now chat problem by summarizing and freeing tokens. Original messages are gone.

## Comparison

| | Squad Nap | /compact |
|---|---|---|
| Purpose | Archive squad memory | Shrink current chat |
| Scope | Persistent, shared | Ephemeral, session-only |
| Method | Move full data to disk | Replace with summary |
| Logic | Size + age rules | One-pass LLM |
| Trigger | Thresholds hit | User or token pressure |
| Benefit | Future agents | Current conversation |
| Recovery | Full (archives exist) | None |
| Model | Filing cabinet | Whiteboard erase |

## When to use each

**Use `squad nap` when:**
- Your `.squad/` files are growing and agents feel slower
- You've completed a phase and want to archive old work
- You're preparing to spawn new agents (smaller state = cheaper spawns)
- You want to keep a permanent archive of past decisions (they go to `-archive.md`)

**Use `/compact` when:**
- Your current conversation is getting long and token-heavy
- You want to continue the session but free up context space for new questions
- You're running out of conversation tokens within a single session
- You want a summary of your chat history before moving on

## Using both together

They're **not** mutually exclusive — use both in sequence for optimal team hygiene:

1. **In your Squad session:** Tell the team to `take a nap`. This cleans up persistent state files, making future agent spawns lighter and faster.
2. **After the session:** If your conversation was long, use `/compact` in the CLI to summarize the transcript. This frees tokens for the next session.

**Bottom line: /compact helps this conversation. Squad Nap helps every conversation after this.**
