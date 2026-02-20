## Session: Open Questions Iteration

**Date:** 2026-02-20  
**Requested by:** Brady

### What happened

Brady iterated through open questions one-by-one with a "cat" gate (must type "cat" to advance).

### Resolved

- Q1: Directory convention → gents/{github_username}/{squad_name}/{agent_name}/
- Q2: Auth for private places repos → gh CLI token (zero extra config)

### Pending

- Q3 presented (teams vs agents-only for v1) — awaiting Brady's answer
- 23 questions remain unresolved

### Next

Resume open questions iteration at Q3 when Brady returns.

### Update — Q3 resolved
- Q3: Teams vs agents-only → Both first-class. Export/import a single agent OR a full squad.
- Q4 presented (versioning for upstream updates) — awaiting Brady's answer
- 22 questions remain unresolved

### Update — Q4 resolved
- Q4: Versioning → Pin to commit SHA at import. Explicit upgrade flow. (Team decision, Brady deferred)
- Q5 presented (import conflict handling) — awaiting Brady's answer
- 21 questions remain unresolved

### Update — Q5 resolved, Agent Repo Backend complete
- Q5: Import conflict → DISALLOWED. Block + require rename. Never overwrite.
- All 5 Agent Repository Backend questions now resolved
- Q6 presented (SDK npm availability) — awaiting Brady's answer
- 20 questions remain unresolved

### Update — Q6 resolved
- Q6: SDK distribution → Keep on GitHub via npx. Not npmjs.com.
- Q7 presented (AgentSource + casting interaction) — awaiting Brady's answer
- 19 questions remain unresolved

### Update — Q7 resolved
- Q7: AgentSource + casting → Hybrid. Re-cast by default, opt-out flag to keep original name.
- Q8 presented (skills from places repos) — awaiting Brady's answer
- 18 questions remain unresolved
