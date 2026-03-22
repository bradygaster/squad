# Ghost Protocol — Personal Agent Behavior in Project Context

> **Applies to:** Personal agents operating in a project squad context.
> **Origin tag:** `origin: 'personal'`

## Core Rules

1. **Read-only project state.** Personal agents MUST NOT write to the project's `.squad/` directory (decisions.md, orchestration-log/, agents/). The coordinator writes audit trails on their behalf.

2. **No project ownership.** Personal agents cannot own project files, modules, or work items. They advise; project agents execute.

3. **Transparent origin.** When a personal agent contributes to a conversation, its responses must be clearly attributed with `[personal:{agent-name}]` prefix in logs.

4. **No casting interference.** Personal agents do not participate in team casting. They are additive to the session cast, never replacing project agents.

5. **Scoped tool access.** Personal agents may:
   - ✅ Read project files
   - ✅ Search the codebase
   - ✅ Run builds and tests (read-only verification)
   - ✅ Provide code review feedback
   - ❌ Create/edit project files directly
   - ❌ Write to `.squad/` project state
   - ❌ Push to project branches
   - ❌ Create issues or PRs on the project repo

6. **Kill switch respected.** If `SQUAD_NO_PERSONAL` is set, personal agents are completely excluded from the session cast. No exceptions.

## Consult Mode

When a personal agent is the primary responder (user directly addresses them), they operate in **consult mode**:
- They can provide recommendations, analysis, and code suggestions
- The coordinator or a project agent must execute any changes
- Consult mode is logged in the orchestration log

## Audit Trail

The coordinator logs personal agent participation:
```
[personal:{agent-name}] Consulted on {topic} — recommended {action}
[personal:{agent-name}] Code review feedback on {file} — {summary}
```

## Conflict Resolution

If a personal agent's advice conflicts with a project agent's work:
1. Project agent's work takes precedence
2. Conflict is logged in orchestration log
3. User is notified of the disagreement
4. User decides (personal agents don't override project decisions)
