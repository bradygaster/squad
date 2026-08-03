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

Read `.squad/routing.md` for the project-specific routing table. For generic Squad questions:

| Work type | Route to | Examples |
|-----------|----------|---------|
| Core runtime, adapter, spawn orchestration | **EECOM** | CopilotClient, session pool, tools module |
| Prompt architecture, coordinator logic | **Procedures** | Agent charters, spawn templates, response tier selection |
| Type system, TypeScript strictness | **CONTROL** | Discriminated unions, generics, tsconfig |
| SDK integration | **CAPCOM** | @github/copilot-sdk usage, CopilotSession lifecycle |
| Tests & quality, CI/CD | **FIDO** | Test coverage, Vitest, edge cases, CI/CD gates |
| Docs, README, API docs | **PAO** | README, getting-started, demos, contributor recognition |
| Architecture, product direction, review | **Flight** | Architectural decisions, code review, scope/trade-offs |
| Session logging, decision merge, DispatchGuard audit | **Scribe** | Auto — never needs explicit routing |
| Work queue, backlog, DispatchGuard verdict alerts | **Ralph** | GitHub issues, PR state, idle-watch, violations |

**Full project routing table:** `.squad/routing.md`

### Examples — what NOT to grab

```
❌ "Fix the TypeScript compilation error in src/adapter/"
   → Core runtime → Route to EECOM

❌ "Add tests for the casting module"
   → Tests & quality → Route to FIDO

❌ "Update the README with the new CLI flags"
   → Docs → Route to PAO

✅ "What does .squad/routing.md say about label taxonomy?"
   → Trivial lookup question — answer directly

✅ "Help me write a quick git commit message"
   → Generic, no specialist needed — handle directly
```

---

## Step 4 — How to Route

When you determine a task belongs to a specialist, do NOT silently attempt it. Instead:

1. **State clearly** which agent owns it and why:
   > "This task (TypeScript type error) belongs to **CONTROL**. I'll note the routing and stop here."

2. **Surface the routing path** to the user:
   > To proceed: apply the `squad:control` label on issue #NNN, or spawn CONTROL directly with the task context.

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
