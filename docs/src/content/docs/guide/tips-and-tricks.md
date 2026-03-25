# Tips & Tricks

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this:**
```
Team, build the login feature — include UI, API endpoints, and tests
```

Patterns that make Squad click. Skim the headers, steal what's useful.

---

## The Big Three

**Say "team" for parallel work.** The word "team" triggers fan-out — frontend, backend, testing, all at once.

**Name an agent for focused work.** `"Dallas, fix the login bug"` sends work to one specific agent. No team overhead.

**Set rules early.** First session, drop your conventions into a directive. Agents read `decisions.md` before every task — you only say things once.

---

## Write Better Prompts

```
❌ "Build the auth system"
✅ "Build JWT auth for login/logout/refresh. Redis sessions. 
   Bcrypt passwords. No OAuth yet — that's phase 2."
```

Be specific about scope. Tell the team what's in, what's out, what's next. Use bullet points for multi-part tasks — agents process lists better than paragraphs.

---

## Direct vs Team vs General

| When | Do this | Example |
|------|---------|---------|
| Parallel/cross-functional | Say "Team" | `Team, build the checkout flow` |
| Sequential/specialized | Name the agent | `Keaton, review this PR` |
| Don't care who | Just describe it | `Add error logging to the API` |

---

## Parallel Work — Let It Cook

Don't interrupt parallel work. Squad agents chain automatically — the tester catches failures, the backend fixes them, the tester re-runs. If you jump in after 2 minutes, you break the chain.

When they're done, ask Scribe:
```
What did the team just do?
```

---

## Ralph — Your Work Monitor

Got a backlog? Let Ralph handle it while you focus on the critical path.

```
Ralph, start monitoring
```

Ralph triages issues, assigns them, spawns agents, and reports every 3-5 rounds. Say `"Ralph, idle"` to stop.

The `squad-heartbeat` workflow runs Ralph on event-based triggers (issue close, PR merge, manual dispatch).

---

## Decisions & Memory

- **Set permanent rules:** `"Always use TypeScript strict mode"` → goes to `decisions.md`
- **Capture lessons:** `"Never include passwords in API responses"` → agents remember forever
- **Check alignment:** When agents disagree, the decision is probably missing. Add it.
- **Commit `.squad/`** — it's your team's brain. Anyone who clones gets the full team.

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Vague prompt → agents ask questions | Be specific about scope upfront |
| Interrupting parallel work | Let it finish, then review |
| Contradicting old decisions | Ask Scribe to remind you of rules |
| Not using Ralph on a full backlog | `Ralph, go` — let the bot grind |
| Too many agents | Start with 4-5, add specialists later |
| Lost team knowledge | Commit `.squad/` to git |

