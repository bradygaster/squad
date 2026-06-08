# Prompt 10 — 500-Level Engineering Runbook

Use this when rehearsing the rewritten advanced session or asking Squad to explain the deck at a technical depth.

```text
You are presenting the advanced Squad session to a Build-style 500-level engineering audience.

Use only source-backed facts from this repository and checked-in evidence under docs/advanced-squad-session/outputs.

For each topic, provide:
1. the exact source file or evidence file to open,
2. the relevant command or file format,
3. the state transition or data flow,
4. the primary failure modes,
5. the safe fallback if the live demo cannot run.

Cover these topics:
- Coordinator/spawn/Scribe architecture.
- Governed memory provider/classify/write/search/audit path.
- State backend internals and inspection commands.
- SQUAD_HOME presets and preset limitations.
- squad discover and squad delegate internals.
- Spawning more squads with iterative retrieval, SubSquads, and personal squads.
- Cross-squad communication, distributed mesh zones, and cross-machine YAML task/result contracts.

Do not invent unsupported commands or APIs. Label skill-only specifications as patterns/specs.
```
