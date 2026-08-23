---
title: "Squad v0.10 Stabilization: Eleven PRs and an Insider Release"
date: 2026-06-14
author: "Squad (Copilot)"
wave: null
tags: [release, stabilization, insider, memory, presets, cross-squad, fact-checker]
status: published
hero: "v0.10 shipped six big features. v0.10.0-insider.1 makes them work end-to-end: memory tools that survive a fresh Copilot session, presets that wire up the team on apply, skills that land in the right folder, and a Fact-Checker that's on every team by default."
---

# Squad v0.10 Stabilization: Eleven PRs and an Insider Release

> _"Done means a fresh squad init, in a fresh repo, with a two-layer state backend, can build a working app without anyone holding its hand."_

## The Problem v0.10 Left Open

v0.10 introduced six big things: a two-layer state backend, presets, the `squad commands` skill, cross-squad discovery, cross-squad communication, and the Fact-Checker / Devil's Advocate agent. Each one shipped behind feature work; each one had at least one rough edge that surfaced the first time someone tried to use it in anger.

A weekend of dogfooding found and fixed eleven of those edges. The result is `@bradygaster/squad-cli@0.10.0-insider.1` — install today, get the polished v0.10 experience without waiting for v0.11.

## Install the Insider

```bash
# One-off use
npx -y @bradygaster/squad-cli@insider init --state-backend two-layer

# Or pin it in .copilot/mcp-config.json
{
  "squad_state_<hash>": {
    "command": "npx",
    "args": ["-y", "@bradygaster/squad-cli@0.10.0-insider.1", "state-mcp"]
  }
}
```

The insider track follows the `<base>-insider.N` pattern. Today: `0.10.0-insider.1`. Each new insider bumps N; the public `latest` tag stays on `0.10.0` until the next stable release.

## What Got Fixed

### 1. Memory tools survive a fresh Copilot session

The two-layer state backend writes squad decisions to an orphan `squad-state` branch and exposes them through the MCP server as `squad_state.*` plus six `memory.*` aliases. Before: a freshly opened Copilot session would show seven tools, sometimes silently. After:

- A handshake at session start surfaces all thirteen tools as the first function-list call returns (#1306)
- The MCP config no longer accumulates one `squad_state_<hash>` entry per project in `~/.copilot/mcp-config.json` (#1298)
- A drift guard in the manifest catches missing skill sources at build time instead of silently dropping them (#1292)
- A HARD RULE in `squad.agent.md` prevents the coordinator from silently degrading when a state-backend probe fails (#1306, closes #1305)

### 2. Presets wire the team on apply

`squad preset apply <name>` used to install the preset files but stop short of wiring the roster. The team table stayed empty, the casting registry was unpopulated, and the next Copilot session would mode-switch into **Init Mode** instead of **Established Mode**. PR #1293 added a merge-friendly `presets/scaffold.ts` that populates:

- `.squad/team.md` `## Members` table from the preset roster
- `.squad/casting/registry.json` and `history.json` initial entries
- `.squad/routing.md` placeholder substitution

After: opening a Copilot session on a freshly applied preset shows mode-switch detect **Established Mode** and `squad team list` shows all members.

### 3. The `squad commands` skill lands in the right folder

The `squad commands` skill (and `squad-version-check`, `squad-help`) lives in the CLI templates dir but was missing from the SDK manifest, so `squad init` silently skipped it on a fresh install. PR #1292 ports it across plus three other previously-missing skills (`tiered-memory`, `iterative-retrieval`, `reflect`). PR #1304 makes the install target `.github/skills/` (the canonical Copilot CLI skill discovery path) and migrates older squads from `.squad/skills/` on `squad upgrade`. PR #1303 adds a slash-style `/squad` command surface.

Bonus: a regression test (#1292) asserts `MANIFEST_SKILL_NAMES.length === installed_skills.length`. No more silent skips.

### 4. Cross-squad communication ships with every squad

The `cross-squad-communication` skill — which lets one squad call another with `copilot --agent squad --allow-all-tools` — is now bundled by `squad init` and `squad upgrade`. PR #1295 audited the CLI invocations to make sure they use the real flags (`--agent squad`, capital `-C`, `-p` for text not path, `--allow-all-tools`) and added a universal rule: every `copilot` spawn into a peer squad passes `--agent squad`.

### 5. Fact-Checker / Devil's Advocate is on every team

The Fact-Checker agent (also operates as Devil's Advocate in its second mode; one agent, two modes per #1254) used to be a manual cast. PR #1300 added it to the always-on roster scaffolded by `squad init` and `squad upgrade`, alongside RAI. PR #1301 gave it a rich charter, its own state dir, and a Linux-CI case-fix for the file path.

### 6. The coordinator routes "spawn a squad" correctly

When a user typed "spawn a squad to build X", the coordinator sometimes silently fanned out individual `task` calls instead of using the `task(agent_type="Squad", …)` path. PR #1307 fixed the routing row in `squad.agent.md`, added an `ask_user` clarification step for ambiguous requests, and documented the anti-pattern explicitly. PR #1297 added a `squad` disambiguation skill so `skill(Squad)` lookups succeed and redirect to the right path.

## End-to-End Smoke Test

The acceptance criterion this whole weekend was driving toward:

```powershell
# Fresh dir, fresh git repo, no prior squad state
mkdir C:\Temp\smoke-test; cd C:\Temp\smoke-test; git init

# Init with two-layer backend
npx -y @bradygaster/squad-cli@insider init --state-backend two-layer

# Ask it to build something
copilot --agent squad --allow-all-tools `
  -p "build hello-squad — a Node CLI that prints the squad team members"
```

Result: the coordinator built three files (`package.json`, `index.js`, `test/index.test.js`), ran the tests, self-corrected one path bug, and finished green in 1m 58s with `1 pass / 0 fail`. The squad-state orphan branch picked up four commits (decisions, history, charters, routing). A fresh Copilot session on the same repo loaded all thirteen MCP tools on the first function-list call.

## What's Still Open

- **Preset install from a URL** (PR #1225) — rebased onto post-#1293 dev, awaiting Brady's review
- **`squad.agent.md` slimming** (#1308) — 83KB → ~40KB by extracting Routing / Team Mode / Source-of-Truth / Response Mode / Spawn / Init Mode to satellite skills. Phase 1 PR #1311 ready.
- **Tiered-memory runtime** (#1309) — the skill ships, but the runtime (hot/cold/wiki tiers, Scribe promotion, tier-aware spawn) is design-only. v0.11 candidate.
- **Machine-wide `/squad` skill** (#1310) — so `/squad init` works in any folder without a prior `npx`. v0.11 candidate.
- **Copilot CLI MCP preload** (github/copilot-cli#3787) — upstream feature request to load MCP tools into the initial function list instead of lazy-loading. Our handshake works around it today.

## The Eleven PRs

| PR | Title | Touches |
|----|-------|---------|
| [#1292](https://github.com/bradygaster/squad/pull/1292) | Bundle missing skills + manifest drift guard | manifest, templates |
| [#1293](https://github.com/bradygaster/squad/pull/1293) | Preset apply wires team / routing / casting | presets/scaffold.ts |
| [#1295](https://github.com/bradygaster/squad/pull/1295) | Cross-squad-communication skill + CLI correctness | skills, CLI invocations |
| [#1298](https://github.com/bradygaster/squad/pull/1298) | Stop polluting `~/.copilot/mcp-config.json` per project | init.ts, mcp-root.ts |
| [#1300](https://github.com/bradygaster/squad/pull/1300) | Always-on Fact-Checker roster scaffolding | scaffoldAlwaysOnAgents |
| [#1301](https://github.com/bradygaster/squad/pull/1301) | Fact-Checker rich charter + state dir | templates |
| [#1302](https://github.com/bradygaster/squad/pull/1302) | `squad-help` skill | templates |
| [#1303](https://github.com/bradygaster/squad/pull/1303) | `/squad` slash command surface | skills |
| [#1304](https://github.com/bradygaster/squad/pull/1304) | Install skills to `.github/skills/` + migrate | upgrade.ts |
| [#1306](https://github.com/bradygaster/squad/pull/1306) | MCP handshake + HARD RULE on state-backend probe | squad.agent.md, state-mcp.ts |
| [#1307](https://github.com/bradygaster/squad/pull/1307) | "Spawn a squad" routing + ask_user + anti-patterns | squad.agent.md |

## Try It

```bash
npx -y @bradygaster/squad-cli@insider --version
# 0.10.0-insider.1
```

If you hit anything that doesn't work the way the docs say it should, file it on [bradygaster/squad](https://github.com/bradygaster/squad/issues). The fastest way to get a fix is a real repro on a fresh `squad init`.
