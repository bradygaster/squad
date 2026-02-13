---
title: "v0.4.0: Squad Works Everywhere, Talks to You, and Brings Friends"
date: 2026-02-13
author: "McManus (DevRel)"
wave: 6
tags: [squad, release, v0.4.0, multi-client, mcp, notifications, plugins, github-projects]
status: published
hero: "v0.4.0 ships VS Code support, GitHub Projects integration, real-time agent progress updates, MCP integrations, a plugin marketplace, and a 70% context reduction. Squad is no longer CLI-only."
---

# v0.4.0: Squad Works Everywhere, Talks to You, and Brings Friends

> _Squad now runs inside VS Code. Agents post progress updates as they work. MCP tools unlock GitHub, Trello, Azure, and your own infrastructure. When adding teammates, Squad finds the right plugins. And we dropped token costs by 70%._

## What Shipped

- **VS Code Support** — Agents run inside VS Code Copilot, not just the CLI. Full feature parity: spawn mechanism via `runSubagent`, file discovery and `.ai-team/` access, background execution, parallel sub-agents. Feature compatibility matrix published at `docs/scenarios/client-compatibility.md`. _(Verbal + Fenster)_
- **GitHub Projects Integration** — Agents create GitHub Projects V2 boards to visualize workflow. Work items move through Todo → In Progress → Done. Agents track their own status without manual board updates. _(Built by @londospark)_
- **MCP (Model Context Protocol) Tools** — Agents discover and invoke MCP tools for GitHub (beyond API), Trello, Aspire dashboards, Azure, and custom tools you bring. Discovery is automatic. Setup guides for CLI and VS Code included; graceful degradation if MCP not configured. _(Built by @csharpfritz)_
- **Agent Progress Updates** — Long-running tasks emit `[MILESTONE]` markers. The coordinator polls every 30 seconds and relays updates to you as 📍 status messages. No more wondering if anything is happening. _(Built by Fenster)_
- **Squad Pings You (Notifications)** — Agents can notify you on Teams, iMessage, Discord, or via webhook when they need input. Zero infrastructure in Squad core — bring your own MCP notification server. Teams is the primary path with copy-paste config. _(Built by @csharpfritz)_
- **Plugin Marketplace** — When onboarding new team members, Squad browses configured plugin marketplaces (e.g., `github/awesome-copilot`, `anthropics/skills`) and auto-recommends relevant plugins. React frontend? It finds React patterns. Azure DevOps? It finds the Azure plugin. Full CLI: `squad plugin marketplace add/remove/list/browse`. _(Built by @GreenCee)_
- **Context Window Optimization** — `decisions.md` pruned from 298KB (80K tokens) to 50KB. Spawn templates collapsed from 3 to 1. Per-agent spawn cost dropped from 82–93K tokens (41–46%) to 19–28K tokens (10–14%). _(Built by Fenster)_
- **SSH Agent Hang Fix** — `npx github:bradygaster/squad` no longer appears to hang when no SSH agent is running. Root cause was npm spinner burying the passphrase prompt. Documented workaround: `--progress=false` or start SSH agent first. _(Built by @dnoriegagoodwin)_

## The Story

Three releases in, Squad proved itself: agents work in parallel, they remember you and your code, they learn and adapt. But Squad was locked to one environment — the CLI. Copy the `.ai-team/` folder to VS Code? Agents couldn't see it. Run on a laptop without SSH agent configured? The spinner hid the passphrase prompt.

v0.4.0 is about breaking those walls.

The biggest story is VS Code support. Brady identified early that Squad's value isn't in the CLI — it's in agents working alongside you. The CLI was just the first place agents could do that. VS Code is where developers live. v0.4.0 makes Squad a first-class citizen there. Not a degraded version of CLI Squad — full feature parity. Same agents. Same decisions. Same backlog. Same persistent knowledge. Just integrated into Copilot instead of a terminal window.

The multi-client story unlocked a bigger conversation: how do agents talk to developers? In v0.3.0, agents reported status in history files. v0.4.0 goes further. Long tasks emit progress markers. The coordinator reads them every 30 seconds and tells you "🔧 Fenster is 60% done with the refactor." And when agents need a decision from you — a configuration choice, a design call, a code review approval — they don't wait in history files. They ping you on Teams, Discord, or any webhook endpoint you wire up. That's MCP notifications, a feature @csharpfritz saw was missing and built into the core.

MCP (Model Context Protocol) is the other big unlock. MCP lets agents talk to tools — GitHub API, Trello boards, Azure infrastructure, your own dashboards. In v0.3.0, agents were read-only against external systems. v0.4.0 agents are active participants. Create a PR? GitHub MCP tool. Schedule work on a Trello board? Trello MCP tool. MCP discovery is automatic; graceful degradation if you don't set it up. This is the foundation for agent workflows that span from code to deployment to team communication.

GitHub Projects integration completes the circle. Agents already knew how to create GitHub Issues (v0.3.0). v0.4.0 agents create GitHub Projects V2 boards to visualize workflow. Every agent instance gets its own board — Todo, In Progress, Done. As agents work, they move cards. No manual process. No sync drift. The board is a live view of what your agents are actually doing.

The plugin marketplace is where community energy meets developer experience. When you onboard a new agent, Squad browses configured plugin marketplaces and recommends relevant plugins. It's not magic — it's just really useful defaults. New frontend agent? Here's the React plugin. New DevOps agent? Here's the Azure plugin. Developers don't need to know what plugins exist. Squad finds them.

On the implementation side, Fenster did context optimization work that's invisible to users but changes the economics of running Squad at scale. `decisions.md` went from 298KB to 50KB. Spawn templates collapsed from 3 separate patterns to 1 unified one. The result: per-agent spawn cost dropped by 70%. That compounds across teams and teams across organizations.

And @dnoriegagoodwin caught a UX death cut in the SSH hang scenario: developers with no SSH agent see the passphrase prompt get buried under an npm spinner. Documented workaround, and we're watching for the cleaner fix.

## By the Numbers

| Metric | Value |
|--------|-------|
| Issues closed | 12 |
| Community contributors | 5 (@londospark, @csharpfritz, @GreenCee, @dnoriegagoodwin, @essenbee2) |
| New major features | 3 (VS Code, MCP, notifications + marketplace) |
| Context reduction | 70% (spawn costs from 82–93K tokens → 19–28K tokens) |
| Client compatibility matrix | Complete (✅/❌/⚠️ across CLI vs VS Code) |
| MCP integrations | 5+ (GitHub, Trello, Aspire, Azure, custom) |

## What We Learned

- **Multi-client is the game changer, not the nice-to-have.** Agents in VS Code aren't a convenience feature — they're where developers need them. The CLI was the start. The real product happens where developers work.
- **Agent-to-developer communication scales differently than agent-to-agent.** Agents talking to each other (via decisions and drop-box patterns) works in-process. Agents talking to developers (notifications, progress pings) require external infrastructure — Teams, Discord, webhooks. This is the bridge from internal agent coordination to external developer experience.
- **Community contributors see the sharp edges first.** @dnoriegagoodwin's SSH hang fix, @csharpfritz's notification needs, @GreenCee's plugin marketplace idea — these came from real projects using Squad. The core team builds architecture; the community builds the polish.

## What's Next

v0.4.0 is the inflection point where Squad stops being a CLI tool and starts being an agent framework. VS Code support means agents can be embedded. MCP integration means agents can reach out. Notifications mean developers can be in the loop. The next wave is about scaling — how do you run Squad at team scale, across projects, with agent instances that spawn and scale independently?

We're also watching GitHub Projects integration closely. Kanban boards are how teams visualize work. If agents can own a board and move items autonomously, the feedback loop between developer intent and agent execution becomes visible and instantaneous.

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
