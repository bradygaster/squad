# SDK Replatforming Proposal — Squad on @github/copilot-sdk

**Author:** Keaton (Lead)  
**Requested by:** Brady  
**Date:** 2026-02-20  
**Status:** Proposal — pending team review

---

## Executive Summary

Squad today is a scaffolding tool (`npx github:bradygaster/squad`) that copies template files — a coordinator agent markdown, workflow YAMLs, skill directories, and ceremony docs — into consumer repos. The agent intelligence lives entirely in `squad.agent.md`, a ~32KB prompt that runs inside Copilot CLI's native agent system. We have zero runtime code: no sessions, no programmatic tool registration, no lifecycle hooks, no event streams. Every capability we want but don't have — streaming orchestration logs, programmatic agent handoff, tool-call interception, multi-session parallelism, token usage tracking — requires building from scratch on top of raw CLI interactions.

The GitHub Copilot SDK (`@github/copilot-sdk`, v0.1.8, Technical Preview) gives us all of that as a typed, event-driven Node.js library. It wraps the same Copilot CLI engine Squad already depends on, but exposes it through `CopilotClient` → `CopilotSession` → event/hook APIs. Custom tools, system message injection, MCP server integration, infinite sessions with auto-compaction, custom agents, skill directories, and pre/post tool-use hooks are all first-class. Replatforming Squad's CLI entry point to be an SDK-powered orchestrator — not just a file copier — would transform us from a "team template kit" into a **programmable multi-agent runtime** that ships as a single `npm install`.

My verdict: **Conditional Go.** The SDK gives us a legitimate architectural upgrade path, strategic partnering value with the Copilot team, and distribution simplification. The Technical Preview status is a real risk but a manageable one — we're already on preview-quality footing with our prompt-only approach. The benefits compound: every SDK feature we adopt is one less thing we build, and being an early adopter/showcase positions Squad as the reference implementation for multi-agent development on Copilot.

---

## What We Gain

### 1. Programmatic Agent Orchestration (the big one)

Today, Squad's coordinator is a prompt. It "spawns" agents by asking Copilot CLI to run `task` tool calls with inline instructions. There is no session isolation, no event capture, no ability to intercept or modify what agents do.

With the SDK:
- **`CopilotClient.createSession()`** gives each agent its own session with its own model, system message, tools, and hooks.
- **`session.on("tool.execution_start")`** lets the coordinator observe what every agent is doing in real time.
- **`hooks.onPreToolUse`** lets us enforce policies (e.g., "Tester cannot merge", "no shell access for Designer") at the SDK level, not prompt level.
- **`hooks.onPostToolUse`** lets us inject context ("here's what the other agent found") between tool calls.
- **`session.sendAndWait()`** gives us deterministic handoff — wait for an agent to finish, capture its output, route to the next agent.
- **Multiple sessions** means true parallel agent execution with isolated context windows.

This is the architectural unlock. We go from "coordinator describes what to do in a prompt and hopes the runtime does it" to "coordinator programmatically orchestrates sessions, captures events, and enforces policies."

### 2. Distribution Simplification

**Current:** `npx github:bradygaster/squad` — GitHub-tarball-only. No npm registry presence. Brady killed npm publish deliberately to keep things simple and GitHub-native.

**With SDK:** Squad becomes `npm install @bradygaster/squad` (or stays GitHub-only — our choice). The SDK is `npm install @github/copilot-sdk`. Either way, the dependency chain is clean: Squad → SDK → Copilot CLI.

**Key insight:** The SDK bundles `@github/copilot` (the CLI itself, v0.0.411+) as a dependency. This means users who install Squad get the CLI for free — no separate install step. This removes a friction point we currently document as a prerequisite.

### 3. Custom Tools — Squad-Specific Capabilities

The SDK's `defineTool()` API lets us register tools that Copilot can call. Imagine:

- **`squad_route`** — agent calls this to hand work to another agent. The SDK handler creates a new session, injects context, returns the result. Real orchestration, not prompt gymnastics.
- **`squad_decide`** — agent proposes a decision. The SDK handler writes to `decisions/inbox/`, notifies the coordinator.
- **`squad_memory`** — agent stores a learning. The SDK handler appends to the right `history.md`.
- **`squad_status`** — coordinator queries all active sessions, gets token counts, completion status.

These tools replace the "convention-based" approach (agents must know to write to specific files) with programmatic guarantees.

### 4. Session Hooks — Policy Enforcement Without Prompt Bloat

Our coordinator prompt is ~32KB. A significant portion is rules: "you may NOT generate domain artifacts", "you may NOT bypass reviewer approval", "NEVER read git config user.email". These are prompt-level guardrails that cost tokens every turn.

With SDK hooks:
- `onPreToolUse` enforces file-write policies, shell restrictions, PII scrubbing — in code, not prompt.
- `onUserPromptSubmitted` can inject team context, routing rules, or project conventions — dynamically, without burning prompt tokens.
- `onSessionStart` can seed each agent's context from their `history.md` — programmatically, not by hoping the agent reads it.

This could cut the coordinator prompt by 30-50%, freeing context for actual reasoning.

### 5. MCP Server Integration

The SDK natively supports MCP servers. Squad can expose its own state (team roster, decisions, backlog) as an MCP server that all agent sessions connect to. Or integrate third-party MCP servers (GitHub, databases, file systems) per-agent.

### 6. Streaming & Observability

`session.on("assistant.message_delta")` gives us real-time streaming from every agent. Combined with `tool.execution_start` and `tool.execution_complete` events, we can build:
- Live orchestration dashboards
- Token usage tracking per agent
- Audit logs for compliance
- The "Squad DM" interface (Proposal 017) becomes trivially implementable

### 7. Infinite Sessions — Context Compaction for Free

The SDK's `infiniteSessions` config handles automatic context compaction — exactly what we've been designing around manually. Long-running agent sessions won't hit context limits; the SDK handles background compaction transparently.

### 8. Partnering & Strategic Position

- **Showcase value:** Being an early, sophisticated consumer of the SDK gives Squad visibility with the Copilot team. We become the "this is what the SDK can do" reference.
- **Feedback loop:** We find SDK bugs and gaps before most consumers. We get heard when we need features.
- **Ecosystem alignment:** The SDK is GitHub's official path for embedding Copilot. Building on it means we ride every improvement — new models, new tools, new CLI features — for free.
- **Competitive moat:** Other multi-agent approaches (AutoGen, CrewAI, LangGraph) don't have native GitHub integration. Squad-on-SDK would be the only multi-agent framework with first-party Copilot and GitHub support.

---

## What We Lose or Risk

### 1. Technical Preview Instability (HIGH)

The SDK is v0.1.8 in Technical Preview. The README says "may change in breaking ways." This is real:
- API surface could change between minor versions
- CLI protocol version coupling means SDK updates may require CLI updates
- No production-readiness guarantee from GitHub

**Mitigation:** We're already in the same boat — Squad is pre-1.0 itself. We can pin SDK versions and update deliberately. Our test suite covers the integration surface. And we're not migrating users' running systems — we're migrating a scaffolding tool.

### 2. Copilot CLI Dependency (MEDIUM)

The SDK requires Copilot CLI in PATH (or bundled via `@github/copilot`). Users need a Copilot subscription (or BYOK). This is already true for Squad — we're a Copilot extension. No new dependency here.

### 3. Runtime Complexity Increase (MEDIUM)

Today, Squad has zero runtime dependencies. The CLI tool is `index.js` — pure Node.js, no packages. Moving to SDK means:
- `@github/copilot-sdk` → `@github/copilot` + `vscode-jsonrpc` + `zod` — three transitive deps
- A JSON-RPC connection to manage
- Session lifecycle to handle
- Error recovery patterns to implement

**Mitigation:** This complexity is the *point*. We're trading "no runtime" for "a real runtime." The SDK handles the hard parts (process management, RPC, reconnection). We just use the API.

### 4. Bifurcated User Experience During Migration (LOW)

Existing Squad users have template-based installations. They don't run Squad as a persistent process. Moving to SDK-powered orchestration changes the interaction model.

**Mitigation:** Phased migration (see below). Phase 1 keeps the template copier. Phase 2 adds SDK orchestration as opt-in. Phase 3 makes it default.

### 5. Node.js 20+ Requirement (LOW)

SDK requires Node.js >= 20. Squad currently requires >= 22. No issue — we're already ahead.

---

## Discovery: Unexpected Benefits

Brady hinted others have found unexpected wins. Based on the SDK's capabilities, here's what I see:

### Custom Agents as Session Config

The SDK supports `customAgents` in session config — agent definitions loaded dynamically. This means Squad's team members don't need to be `.agent.md` files discovered by the platform. We can define them programmatically:

```js
const session = await client.createSession({
  customAgents: [{
    name: team.lead.name.toLowerCase(),
    displayName: team.lead.name,
    description: team.lead.charter,
    prompt: team.lead.systemPrompt,
  }],
});
```

This unifies the "casting system" with the runtime. Agent definitions live in `.squad/team.md` and get loaded into SDK sessions — no file-system discovery needed.

### Skill Directories Map to Squad's Template Skills

The SDK's `skillDirectories` config is essentially what Squad's `templates/skills/` already does. We can ship Squad-specific skills (conventions checker, ceremony runner) as SDK skill packs that agents load at session creation. This replaces the file-copy approach with a load-at-runtime approach.

### User Input Handler Fixes the ask_user Problem

We have a standing team decision: "If ask_user returns < 10 characters, treat as ambiguous." The SDK's `onUserInputRequest` handler gives us full control over how user input requests work — we can implement the 10-character guard in code, not prompt.

### BYOK Opens Enterprise Use

The SDK supports Bring Your Own Key — users can plug in their own OpenAI/Azure/Anthropic keys. This means Squad can work in enterprises that have their own LLM contracts, not just Copilot subscribers. Brady may not have realized this widens our addressable market significantly.

### Resume Sessions Enables Long-Running Agents

`client.resumeSession(sessionId)` means agents can survive across CLI restarts. Ralph's watch mode (polling every N minutes) could resume a persistent session instead of starting fresh each time. Agents accumulate knowledge across runs without re-reading history from disk.

---

## Recommended Architecture

### High-Level: Squad as SDK-Powered CLI

```
User
  ↓ npx github:bradygaster/squad
Squad CLI (index.js)
  ↓ init / upgrade / watch / orchestrate
  ├── Template Engine (existing: file copy, scaffolding)
  └── Orchestration Engine (new: SDK-powered)
        ↓
    CopilotClient
        ↓
    ┌─────────────┬──────────────┬────────────────┐
    │ Session:     │ Session:     │ Session:        │
    │ Coordinator  │ Agent (Lead) │ Agent (Backend) │ ...
    │ gpt-5        │ claude-4.5   │ haiku-4.5       │
    │ + routing    │ + charter    │ + charter       │
    │ + hooks      │ + skills     │ + tools         │
    └─────────────┴──────────────┴────────────────┘
```

### Key Design Decisions

1. **Single CopilotClient, multiple sessions.** The coordinator runs in one session. Each agent runs in its own session. The coordinator creates/manages agent sessions programmatically.

2. **System messages replace prompt files.** Instead of a 32KB `squad.agent.md`, the coordinator's identity and rules are injected via `systemMessage.content`. Agent charters are injected per-session. Hooks enforce rules that were previously prompt-based.

3. **Custom tools are the handoff mechanism.** `squad_route`, `squad_decide`, `squad_memory` tools registered on every session give agents a typed API for coordination. No more "write to a file and hope someone reads it."

4. **Skill directories for domain knowledge.** Squad's conventions, ceremonies, and workflows become SDK skill packs loaded via `skillDirectories`.

5. **Template engine stays.** The init/upgrade commands still copy scaffolding files. But now they also generate an `orchestrator.js` (or similar) that users can customize.

6. **Watch mode becomes session-based.** Ralph's polling loop creates/resumes a persistent SDK session, accumulating state across runs.

---

## Migration Path

### Phase 1: SDK as Optional Dependency (2-3 weeks)

- Add `@github/copilot-sdk` as an optional/peer dependency
- Build a minimal `orchestrate` subcommand: `npx github:bradygaster/squad orchestrate`
- This command starts a CopilotClient, creates a coordinator session, and runs a single prompt
- Existing init/upgrade/watch commands unchanged
- Ship as experimental — gather feedback

### Phase 2: Hooks and Tools (3-4 weeks)

- Implement `squad_route`, `squad_decide`, `squad_memory` as SDK custom tools
- Add `onPreToolUse` hook for policy enforcement
- Add `onSessionStart` hook for context seeding from `history.md`
- Move Ralph's watch mode to SDK sessions
- Coordinator prompt shrinks as rules move to hooks

### Phase 3: Multi-Session Orchestration (4-6 weeks)

- Coordinator creates per-agent sessions with distinct models
- Implement parallel fan-out: coordinator spawns N agent sessions simultaneously
- Event-driven handoff: coordinator listens for `session.idle` on agent sessions, routes results
- Streaming orchestration log: real-time output from all agents

### Phase 4: Template Migration (2-3 weeks)

- New installs get SDK-powered orchestrator by default
- `squad.agent.md` becomes a legacy compatibility layer
- Upgrade command migrates existing installs to SDK orchestration
- Template skills become SDK skill directories

### What Stays

- `.squad/` directory structure (team.md, routing.md, decisions/, agents/)
- GitHub workflows (heartbeat, triage, CI)
- Casting system (names, universes, registry)
- Proposal-first workflow
- `npx github:bradygaster/squad` as the entry point

### What Changes

- `index.js` grows an `orchestrate` command backed by SDK
- Coordinator intelligence moves from prompt → SDK hooks + smaller prompt
- Agent handoff moves from task-tool-with-inline-instructions → named SDK sessions
- Policy enforcement moves from prompt rules → `onPreToolUse` hooks
- Watch mode moves from `execSync('gh issue list')` → persistent SDK session

---

## Decision: Conditional Go ✅

**Verdict: GO — with conditions.**

### Conditions

1. **Phase 1 must prove viability** before committing to Phase 2+. If the SDK's event model doesn't support our orchestration patterns, or if latency is unacceptable, we stop.

2. **Pin the SDK version.** We do not float on `^0.1.x`. We pin to a specific version and upgrade deliberately after testing.

3. **Keep the template engine.** The SDK orchestrator is additive, not replacement. Users who want "just the templates" still get them. The orchestrator is opt-in until Phase 4.

4. **No external shipping dependency.** If the SDK breaks in a release, Squad's core (init, upgrade, watch) must still work. The orchestration layer degrades gracefully.

5. **Brady reviews Phase 1 output** before Phase 2 starts. This is a strategic direction change — it needs the owner's eyes.

### Why Go

- The SDK gives us **everything we've been building toward** — programmatic orchestration, policy enforcement, multi-session parallelism, streaming observability — as a library we import.
- The partnering value is real. Being the reference multi-agent implementation on Copilot SDK is a strategic position we can't buy later.
- The competitive landscape favors this. AutoGen/CrewAI/LangGraph all require separate LLM plumbing. Squad-on-SDK is the only approach with native GitHub Copilot integration.
- The risk is bounded. Phase 1 is small. We learn fast. We can stop.

### Why Not Wait

- The SDK is in Technical Preview *now*. Early adopters shape the API. If we wait until GA, we're using someone else's design.
- Our prompt-only approach has a ceiling. The coordinator can't get much smarter without a runtime.
- Brady asked for this evaluation because he sees the opportunity. The window for being "first and best" on the SDK narrows every week.

---

*This proposal was written by Keaton (Lead) at Brady's request. It represents a strategic assessment, not a commitment. Team review and Brady's approval required before any implementation begins.*
