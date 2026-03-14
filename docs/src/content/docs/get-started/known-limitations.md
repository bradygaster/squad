# Known Limitations

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad is in active preview. This page documents current limitations and expected behaviors so you can work confidently and know what to expect.

---

## Stability

### Session crashes are normal

During preview, sessions may crash and restart. This is expected behavior — not a sign of misconfiguration. Your work is safe:

- ✅ Files you've saved are in your working tree
- ✅ Skills, decisions, and history persist in `.squad/`
- ✅ Commits and branches are in Git
- ❌ Conversation context is lost — restart with a brief summary of what you were doing

### Long sessions may degrade

Very long sessions (many hours, hundreds of tool calls) can experience slowdowns or context overflow. Consider:

- Asking Scribe to checkpoint progress before ending a long session
- Starting fresh sessions for new topics
- Keeping per-session scope focused

---

## Tool Approval

### Copilot requires tool call approval by default

Without `--yolo` mode, Copilot prompts for approval on every tool call (file reads, git operations, agent spawns). Squad sessions involve many tool calls, so this creates significant friction.

**Recommendation:** Use `--yolo` mode for Squad sessions:

```bash
copilot --yolo
```

This is the single most impactful change for Squad usability. See [Quick Start](five-minute-start) for setup.

---

## Context and Memory

### Conversation context doesn't persist across sessions

When you close a session and start a new one, the live conversation is gone. Agents retain what they wrote to skills, decisions, and history files — but not the conversational back-and-forth. See [Session Model](../concepts/session-model) for details.

### Agent memory has limits per session

Each agent reads from its own history file at session start. Very large history files may exceed context limits. The team periodically compacts history during ceremonies.

---

## Multi-Surface

### Switching tools creates new sessions

Moving from CLI to VS Code (or vice versa) starts a fresh session. The persisted `.squad/` state is shared, but conversation context does not transfer. This is by design — each surface is independent.

### VS Code Copilot Chat has shorter context

VS Code chat threads have a smaller context window than CLI sessions. Complex multi-agent work is more reliable in the CLI.

---

## Platform

### Path handling differs across operating systems

Squad generates paths in agent output. On Windows, some paths may use forward slashes or Unix-style `~/.squad/` notation. The runtime handles this correctly, but log output may look inconsistent.

### Git operations require a clean repo root

Running `squad init` inside a subdirectory of an existing Git repo can cause agents to be invisible or misconfigured. Always initialize at the Git repository root.

---

## What's Improving

These limitations are actively being addressed. Check [What's New](../whatsnew) for the latest fixes, or watch the [GitHub repo](https://github.com/bradygaster/squad) for releases.

---

## Next Steps

- [Quick Start](five-minute-start) — get set up with recommended defaults
- [Troubleshooting](../scenarios/troubleshooting) — common problems and fixes
- [Session Model](../concepts/session-model) — understand session boundaries
