# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Vision, architecture, product decisions | Keaton | What Squad becomes, where it goes, roadmap priorities |
| AI strategy, agent design, prompt engineering | Verbal | Agent experiences, predicting dev needs, multi-agent patterns |
| DevRel, demos, messaging, open source polish | McManus | READMEs, demo scripts, amplifying the message, community engagement |
| Core implementation, tooling, runtime | Fenster | Coordinator logic, spawning system, casting engine, file operations |
| Testing, quality, edge cases | Hockney | Breaking parallel spawning, reviewer gates, casting overflow scenarios |
| Copilot SDK optimization, platform alignment | Kujan | Copilot CLI patterns, tool usage, SDK opportunity assessment |
| Git, releases, CI/CD, distribution, versioning | Kobayashi | GitHub Releases, Actions, tags, branch strategy, npx distribution, state integrity |
| VS Code extension, editor integration, runSubagent, file discovery | Strausz | VS Code API research, extension packaging, CLI↔VS Code parity, graceful degradation |
| Visual identity, logos, brand assets, design | Redfoot | Logo design, icons, brand guidelines, visual consistency |
| Code review | Keaton | Review PRs, check quality, architectural consistency |
| Session logging | Scribe | Automatic — never needs routing |
| Bug fixes, test coverage, lint fixes, small features, scaffolding | @copilot 🤖 | Auto-assigned when issue matches 🟢 capability profile |

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn Hockney to write test cases from requirements simultaneously.
7. **Verbal is the edgy one** — AI bro energy, predicting trends, pushing boundaries.
8. **McManus makes it look good** — polish, clarity, amplification.
