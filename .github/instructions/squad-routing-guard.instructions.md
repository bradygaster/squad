---
description: 'Squad routing guard — explicit routing rules so the Copilot CLI routes tasks to the right Squad agent instead of handling them directly.'
applyTo: '**'
---

# 🚦 Squad Routing Guard

**Read this before handling ANY non-trivial task in this repository.**

If you are a generic Copilot session (not a named squad agent), your first job is to route — not to act. Specialist squad agents own well-defined domains. Taking over their work produces inconsistent results and loses their accumulated context.

---

## Step 1 — Am I Already a Named Agent?

If you were spawned as a named Squad agent (any cast name in `.squad/casting/registry.json`), **skip this file — your charter governs you.** Proceed with your charter from `.squad/agents/{your-name}/charter.md`.

If you are a **generic Copilot CLI session**, continue reading.

---

## Step 2 — Routing Decision Tree

```
Is this a trivial one-off question (no code/file changes needed)?
  └─ YES → Answer directly. No routing required.
  └─ NO  → Continue ↓

Does the issue/PR/task have a squad:{name} label?
  └─ YES → That agent owns it. Do NOT handle it. Route it. (See §4)
  └─ NO  → Continue ↓

Does the work type match a specialist domain? (See §3 + .squad/routing.md)
  └─ YES → Route to that specialist. (See §4)
  └─ NO  → Handle it yourself as a generic task.
```

---

## Step 3 — Routing Table

Read `.squad/routing.md` and use its current `Work Type` and `Route To`/`Agent`
columns. That file is the only authoritative work-to-agent mapping. Do not cache
agent names in this instruction file or infer ownership from a previous cast.

Before routing:

1. Confirm the destination appears in the active `## Members` table in
   `.squad/team.md`.
2. Use the member name exactly as written there when constructing a
   `squad:{slug}` label or spawning the agent.
3. If no routing row matches, use the active Lead identified by role in
   `team.md`. If no Lead exists, handle the task as generic work rather than
   inventing an owner.

### Examples — what NOT to grab

```
❌ "Fix the TypeScript compilation error in src/adapter/"
   → Look up the current runtime owner in routing.md

❌ "Add tests for the casting module"
   → Look up the current quality owner in routing.md

❌ "Update the README with the new CLI flags"
   → Look up the current documentation owner in routing.md

✅ "What does .squad/routing.md say about label taxonomy?"
   → Trivial lookup question — answer directly

✅ "Help me write a quick git commit message"
   → Generic, no specialist needed — handle directly
```

---

## Step 4 — How to Route

When you determine a task belongs to a specialist, do NOT silently attempt it. Instead:

1. **State clearly** which current agent owns it and why:
   > "This task matches the type-system route and belongs to **{current member name}**."

2. **Surface the routing path** to the user:
   > To proceed: apply that member's current `squad:{slug}` label on issue #NNN,
   > or spawn the member directly with the task context.

3. **Do not partially complete the task** then hand off — partial work in the wrong agent context creates merge conflicts and inconsistency.

4. **Exception:** If no squad agent is reachable and the task is urgent/blocking, you may handle it but MUST leave a comment noting that a specialist should review.

---

## Step 5 — When to Read routing.md

Read `.squad/routing.md` **before handling any non-trivial task**, not just during triage. Specifically:

- ✅ Before writing any code that touches a specialized domain
- ✅ Before triaging or assigning any issue
- ✅ Before making any architecture or infrastructure change
- ✅ Before publishing any content (docs, blog, briefing)

---

## Why This Matters

Squad agents carry:
- **Accumulated domain context** (history.md, decisions.md, past patterns)
- **Validated skills** (`.squad/skills/`) for their domain
- **Charter constraints** that prevent mistakes in their area

A generic CLI session lacks all of this. Routing correctly is not a courtesy — it's how the squad maintains quality and consistency.
