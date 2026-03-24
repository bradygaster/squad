# Spawn Template: Agent with Tiered Memory

Use this template when spawning any Squad agent. By default it loads **Hot tier only**. Add optional sections as needed.

---

## Task

{task_description}

## WHY

{why_this_matters}

## Success Criteria

- [ ] {criterion_1}
- [ ] {criterion_2}

---

## Memory Context

### 🔥 Hot (always included)

> Paste current session context here (2–4KB max):

```
Current task: {task_description}
Active decisions: {decisions_this_session}
Last actions: {last_3_to_5_actions}
Blockers: {current_blockers_or_none}
Talking to: {current_interlocutor}
```

---

### ❄️ Cold (include when task needs history — add `--include-cold`)

> Load on demand. Do not inline unless specifically needed.

Summarized cross-session history is at:  
`.squad/memory/cold/{agent-name}.md`

Include when:
- Resuming interrupted work
- Debugging a recurring issue  
- "What have we tried before?"

**To load cold memory, add this section and fetch the file before spawning:**

```
## Cold Memory Summary
{contents_of_.squad/memory/cold/{agent-name}.md}
```

---

### 📚 Wiki (include when task needs domain knowledge — add `--include-wiki`)

> Load on demand. Reference specific wiki docs by path.

Wiki entries are at: `.squad/memory/wiki/`

Include when:
- Implementing against an ADR or spec
- Onboarding to unfamiliar subsystem
- Need stable conventions or API contracts

**To load wiki, add this section and reference the specific doc:**

```
## Wiki Reference
{contents_of_.squad/memory/wiki/{topic}.md}
```

---

## Escalation

If blocked or uncertain:
- Architecture questions → @picard  
- Security concerns → @worf  
- Infrastructure/deployment → @belanna  
- Memory/history questions → @scribe  

---

## Notes

- Hot tier is always included and should stay under 4KB
- Cold adds ~8–12KB; only include when history is relevant
- Wiki adds variable size; only include specific relevant docs
- See `skills/tiered-memory/SKILL.md` for full tier reference
- See `docs/tiered-memory-guide.md` for wiring instructions