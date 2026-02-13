# 2026-02-13: VS Code Parity Spike

**Requested by:** Brady (bradygaster)

## Participants

- **Strausz** (VS Code Extension Expert) — `runSubagent` API research
- **Kujan** (Copilot SDK Expert) — CLI `task` tool spawn parity analysis

## Work

Strausz and Kujan researched parallel spawn mechanisms across CLI and VS Code:
- Analyzed `runSubagent` API (VS Code) vs `task` tool (CLI)
- Compared platform capabilities, parameter mapping, inheritance, model selection
- Identified viability path and architectural implications for Squad v0.4.0

## Decisions Logged

Two proposals written to `.ai-team/decisions/inbox/`:
- `strausz-runsubagent-findings.md` — `runSubagent` viable with platform detection and custom `.agent.md` files
- `kujan-spawn-parity.md` — Full parity analysis; spawn patterns all map successfully; model selection is the gap; recommendation: prompt-level platform detection, no abstraction layer

## Key Findings

- **runSubagent is synchronous** but supports parallel execution (concurrent sub-agents)
- **Spawn patterns map 1:1** (standard, lightweight, explore, scribe, ceremony facilitator)
- **Model selection is the gap** — CLI has per-spawn parameter; VS Code routes through `.agent.md` frontmatter
- **MCP tool inheritance differs** — CLI is opt-in; VS Code is default (positive for Squad)
- **Platform detection strategy** — check tool availability (`task` = CLI, `agent` = VS Code)
- **Graceful degradation** — coordinator works inline if neither tool available

## Team Updates

Strausz joined the team this session as VS Code Extension Expert.
Diegetic Expansion from *The Usual Suspects* (new casting role: The Fixer — keeps Squad moving across platforms).

## Outcomes

Unblocks issues #32 (release:v0.4.0), #33 (file discovery), #34 (model selection), #35 (compatibility matrix).
Next phase: implement platform detection in coordinator, create custom `.agent.md` files per Squad role.
