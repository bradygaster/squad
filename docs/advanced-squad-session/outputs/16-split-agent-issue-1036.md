# 1036: Split squad.agent.md to reduce system-prompt overhead via lazy loading
State: OPEN
URL: https://github.com/bradygaster/squad/issues/1036

## Problem

`squad.agent.md` is ~95k characters and is loaded into every session's system prompt in full. Most of that content is reference material the coordinator only needs *sometimes* — casting algorithms, ceremony config, PRD intake, issue lifecycle, plugin marketplace, etc.

Impact on any LLM harness:

- **Per-turn input cost** — the full charter is re-sent on every API call. Prompt caching helps but cache misses (session start, idle gaps beyond cache TTL) pay the full cost.
- **Context window consumed** — a fixed window means every character in the system prompt is unavailable for conversation, tool output, or file content. Long sessions hit compaction sooner.
- **Time-to-first-token** — the model must process the full prompt before emitting. Scales with size.

The charter already marks ~11 sections as *"on-demand reference"* with pointers to template files — but the full body is duplicated inline. That duplication is the root cause.

## Proposed approach

For each "on-demand reference" section, remove the full body from `squad.agent.md` and keep only a **trigger stub** — enough for the coordinator to know *when* to read the template, not *what it says*.

Example stub:

```markdown
## Ceremonies

Structured team alignment meetings (design reviews, retros, planning).

**Triggers:** user requests a ceremony by name; auto-triggered \`before\`/\`after\` rules in \`.squad/ceremonies.md\`.
**On-demand reference:** Read \`.squad/templates/ceremony-reference.md\` for config format, facilitator spawn template, and execution rules.
```

**Stays inline** (always-loaded core, critical path):
- Coordinator identity, refusal rules, mode detection
- Routing table, Response Mode Selection, Eager Execution
- Per-harness spawn templates
- Drop-box pattern, Worktree Awareness, Orchestration Logging
- Reviewer Rejection Protocol, Source of Truth Hierarchy
- Anti-patterns

**Moves out** (on-demand, loaded only when triggered):
- Casting algorithm + universe table
- Ceremony config schema + facilitator template
- PRD intake flow
- Issue lifecycle (branch/PR/merge spawn prompts)
- Human / coding-agent member details
- Ralph's full work-check cycle + idle-watch
- Plugin marketplace installation flow
- MCP config + per-service fallback rules
- Multi-agent artifact format, constraint budget tracking

## Expected impact

Charter drops from ~95k → estimated 35–45k chars. On-demand sections load only when triggered — zero cost on turns that don't touch them. Benefits all supported harnesses, not just ones that surface size warnings.

## Open questions

1. **Stale references** — install/upgrade should verify all referenced template files exist.
2. **Discoverability** — readers browsing the charter on GitHub lose the full prose; README should index template files.
3. **Trigger fidelity** — stubs need enough signal for the coordinator to know when to load the template. Too terse and routing breaks.
4. **Import chains** — do the supported harnesses follow transitive includes inside instruction files? If yes, stubs could include templates for single-source behavior. If no, agents must read templates at runtime.
5. **Version stamping** — the HTML version comment must stay in whichever file the install script checks.

## Acceptance criteria

- [ ] All "on-demand reference" sections moved to their existing template paths
- [ ] Each stub names the template path explicitly
- [ ] Install/upgrade verifies referenced templates exist
- [ ] Smoke test: fresh init + full routing pass (Init, Team, Ralph, PRD, Issues) still works
- [ ] Measurable system-prompt size reduction (document before/after)
