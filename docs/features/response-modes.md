# Response Modes

> **Try this:**  
> `"Respond in terse mode — just the facts"`  
> `"Use lightweight mode for quick fixes"`

Squad automatically picks the right response mode based on complexity — from instant direct answers (2s) to full multi-agent parallel work (60s). You can override anytime.

---

## The Four Modes

Not every request needs the full agent machinery. Squad automatically selects a response mode based on the complexity of your message.

---

## The Four Modes

| Mode | Time | What Happens | When Used |
|------|------|-------------|-----------|
| **Direct** | ~2–3s | Coordinator answers from memory — no agent spawned | Status checks, factual questions |
| **Lightweight** | ~8–12s | One agent, minimal prompt — no charter/history/decisions reads | Small fixes, quick follow-ups |
| **Standard** | ~25–35s | Full agent spawn with charter, history, and decisions | Normal work requests |
| **Full** | ~40–60s | Multi-agent parallel spawn | Complex multi-domain tasks |

---

## Direct

The coordinator handles it alone. No sub-agent is spawned.

```
> What port does the server run on?
> Where are we on the auth work?
> Who's on the team?
```

Fast answers from context the coordinator already has.

## Lightweight

One agent is spawned with a reduced prompt — skips loading charter, history, and decisions to save time.

```
> Fix the typo in the README
> Add that missing import
> Update the version number
```

Good for small, well-defined tasks where full context isn't needed.

## Standard

Full agent spawn. The agent reads its charter, history, and team decisions before working.

```
> Build the user profile API endpoint
> Refactor the auth middleware
> Write tests for the payment module
```

This is the default mode for most work.

## Full

Multiple agents spawn in parallel, each with full context. A [design review ceremony](ceremonies.md) may trigger first.

```
> Team, build the dashboard
> Rebuild the authentication system
> Implement the search feature end-to-end
```

Used for complex tasks that span multiple domains (frontend, backend, testing).

---

## How Modes Are Selected

The coordinator picks the mode automatically based on:

- **Complexity** of the request
- **Number of domains** involved
- **Whether context is needed** (history, decisions, skills)

You don't need to specify a mode. When uncertain, the coordinator biases toward upgrading — it's better to spend a few extra seconds loading context than to miss something.

---

## Tips

- If a response feels slow for a simple question, it's likely using Standard when Direct would suffice. This is rare — the coordinator is good at picking the right mode.
- "Team, ..." prompts typically trigger Full mode.
- Direct-named agent prompts ("Kane, ...") typically trigger Standard mode.
- Response times depend on the Copilot platform. The numbers above are approximate.

## Sample Prompts

```
force lightweight mode for this quick fix
```

Explicitly requests a reduced-context spawn for a simple task.

```
what port does the API run on?
```

Quick factual question that triggers Direct mode with no agent spawn.

```
Kane, do a thorough analysis of the auth system
```

Requests Standard mode with full context load for complex work.

```
what response mode was used for that last task?
```

Checks which mode the coordinator selected for the previous request.

```
Team, rebuild the authentication system end-to-end
```

Multi-domain prompt that triggers Full mode with parallel agent spawns.
