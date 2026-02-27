# Crossover Vision — Kujan, Copilot SDK Expert

**Date:** 2026-02-21  
**Context:** Brady's v1 SDK replatform. Clean squad reset at crossover. This is what carries forward.

---

## 1. SDK Knowledge Carry-Forward: Critical Lessons

### 1.1 The SDK Is Not a Cage — It's Scaffolding with Gaps

The Copilot SDK (Protocol v2, ~18 months production-hardened in CLI) is genuinely useful, but it solves 60% of Squad's problem, not 100%. The future squad must understand what to lean on and what to build.

**Hard Guarantees:**
- **CustomAgentConfig** is the right primitive for team members (name, prompt as charter, per-agent MCP servers).
- **Infinite sessions** solve context pressure. At 80% utilization, automatic compaction. At 95%, blocking. Manual overflow handling is dead.
- **Hooks system** (`onPreToolUse`, `onPostToolUse`, `onSessionStart`) replaces fragile prompt engineering with enforced logic gates (reviewer approval, result transformation, context injection).
- **Event streams** (40+ event types) eliminate polling. Real-time `assistant.usage` with cost field. Per-model `modelMetrics` on `session.shutdown`. This is the source of truth for observability, not fragile log parsing.
- **SessionContext** (cwd, gitRoot, repository, branch) is already tracked by SDK. Don't re-implement filesystem detection.
- **BYOK multi-provider** (OpenAI, Azure, Anthropic) unlocks enterprise. Static token auth works; no Entra ID/managed identity support.

**Hard Constraints:**
- **Session-level tool registration only.** No per-agent tool filtering. Squad must build tool namespacing (`squad-{agentId}:{toolName}`) to prevent silent tool collisions (multiple agents defining same tool name → wrong tool invoked, no error).
- **No per-agent model selection in CustomAgentConfig.** Sessions have a single model. Model tier aliases (`fast`/`standard`/`premium`) must decouple charters from specific models. Fallback chains (Azure → OpenAI → Anthropic) are possible but require prompt-level detection or SDK wrapper code.
- **No session locking.** SDK doesn't define concurrent access semantics. If two agents write to same resource, behavior undefined. Squad must use filesystem-scoped locks (drop-box pattern is *correct*).
- **Per-agent hooks don't exist.** Hooks are session-scoped. If coordinator needs different behavior for different agents, it must route via sessionId lookup (coordinator maintains mapping) and implement hook handlers that check agent identity.
- **MCP server health is opaque.** Can't proactively detect if an MCP server is down. Only symptom: tool calls fail. Squad must wrap tool calls with circuit breakers and graceful degradation.
- **Breaking changes expected.** SDK is "Technical Preview" but protocol is stable. Version pinning + weekly CI test runs + adapter pattern required.

### 1.2 Session Management Quirks

- **Initialization overhead:** SDK session startup is 1–3 seconds (Copilot CLI server spin-up + protocol handshake). Not async-agnostic. Coordinator must assume async architecture.
- **Event ordering.** Events are fire-and-forget subscriptions. No backpressure. If coordinator is slow, events queue in memory. Streaming subscriptions can miss events if not subscribed before event fires. Always subscribe at `onSessionStart`, not after first user input.
- **Compaction is unpredictable.** At 80%, automatic compaction fires asynchronously. If coordinator reads `session.usage_info.currentTokens` immediately after a large assistant message, you might see pre-compaction size. Real context pressure = `currentTokens` approaching `tokenLimit`, not a fixed threshold.
- **Workspace persistence.** Files written during session persist. `.ai-team/` directory is mutable during session. Concurrent writes from multiple agents hit same problem as current Squad — drop-box pattern still applies.

### 1.3 Tool Registration & MCP Integration Details

- **Tool names are global.** If two agents both register `github-create-issue`, only first one is callable. Second silently shadows. SDK provides no collision detection. Solution: enforce naming convention (`squad-{agentId}:{toolName}`) at config generation time + pre-flight validation.
- **MCP server config is per-agent.** This is SDK's killer feature for Squad. Backend dev gets `postgres.sqlite` server, frontend gets `github`. But HTTP localhost URLs and embedded credentials don't travel. Squad's import/export must:
  - Store MCP config separately from `.agent.md`.
  - Validate MCP endpoints post-import (health check).
  - Implement environment variable substitution for credentials.
  - Provide fallback if server is unreachable.
- **Tool filtering is include-list only.** `MCPServerConfig.tools` accepts array of tool names to whitelist. No exclude patterns. If MCP server exposes 50 tools but agent only needs 3, must enumerate all 3 explicitly.
- **Tool descriptions are from MCP server.** Squad can't override them. If an MCP server has bad docs, agent sees bad docs. Document this as a known friction point.

### 1.4 Model Selection & Cost Patterns

- **Cost is in the event stream.** `assistant.usage` event has `cost` field. SDK computes this from Anthropic's pricing (unless BYOK, then provider's pricing). No external pricing lookup needed. Streaming events include cumulative cost across full message.
- **Model capabilities are queryable.** `listModels()` returns vision support, reasoning effort (Opus 4.6 has reasoning steps), context limits. Squad's hardcoded model catalog becomes dynamic. This is a v0.7.0 feature (after SDK stabilizes).
- **Tier aliases are the right abstraction.** Don't hardcode `claude-opus-4.6` in agent charters. Use `premium` and map at runtime based on provider. This survives provider changes and model deprecation.
- **Model fallback chains are fragile in SDK.** If Azure OpenAI model is unavailable, SDK doesn't auto-fallback to OpenAI. Coordinator must catch error and retry with next provider. Requires error handling at spawn time.

### 1.5 What We Got Right (Don't Change)

- **Casting system.** Persistent names (Keaton, Fenster, etc.), universe allocation, personality carry-forward — none of this comes from SDK. It's pure Squad invention. Protect it.
- **Filesystem memory as source of truth.** `.ai-team/` is human-readable, git-cloneable, auditable, resilient to SDK schema changes. When SDK breaks, Squad memory survives. Reverse: decision governance, skill definitions, history — all filesystem-backed. Never move to SDK-native storage.
- **Drop-box pattern for concurrent writes.** Tested and proven. SDK sessions are isolated; concurrent agents hitting same resource go through drop-box (atomic file operations, no locks). Keep this. Extend it.
- **Coordinator orchestration logic.** Which agents run, in what order, on what gates (human approval, reviewer, test results) — this stays in coordinator prompt + filesystem state. SDK hooks enable *enforcement* (gate can block tool), but logic stays with team.
- **Scribe pattern.** Dedicated documentation agent. No SDK equivalent. Keep it.

---

## 2. Platform Evolution Predictions

### 2.1 What's Coming (18–24 Month Horizon)

**Session-level multi-tenancy.** Right now, SDK sessions are single-user. In 18 months, expect session handoff — coordinator can spawn agent A, agent A can hand off to agent B, both in same session. This enables true sub-delegation without session boundaries. Squad should design coordinator architecture to support this. Don't hard-code session isolation into Team abstraction.

**Per-agent hooks.** Today hooks are session-scoped. SDK team knows this is a gap. Per-agent `onPreToolUse` callback is coming. When it lands, Squad can replace prompt-level agent routing with declarative hook config. Plan for this in PRD.

**MCP health/discovery API.** SDK will eventually expose "is server up" and "list available tools" without invoking the server. Current workaround (wrap tool calls, fail gracefully) will be replaced with proactive checks. Design observability layer to support both patterns.

**Model cost data in SDK.** Currently in event stream. Soon expect `ModelInfo.costPer1kTokens` so coordinator can route work to cheaper models *before* spawning. Makes Proposal 024a (hardcoded model catalog) obsolete. Welcome this.

**Streaming response streaming.** SDK supports `streaming: true` for live event subscriptions, but full message assembly requires buffer. Expect SDK to expose streaming chunks in structured format (not raw text delta). This enables real-time output to user without waiting for agent completion.

**Reusable agent templates.** SDK team is thinking about (not committing to) shared `.agent.md` templates in a registry. If this happens, Squad's casting system can be opensourced as templates. But don't wait for it — Squad's built-in casting is already better.

### 2.2 What Squad Should Design For Now

**Event-driven architecture end-to-end.** Don't wait for feature flags or v1.0. Use SDK event streams as primary integration today. When session-level multi-tenancy lands, event-driven coordinator scales to it automatically. Polling and `read_agent` timeout workarounds are migration debt.

**Provider-agnostic prompting.** Tier aliases are the minimum. Also: prepare for Anthropic's thinking models (Opus 4.6 with reasoning), OpenAI o1 (no tool calls), and Google's Gemini 3 (different streaming semantics). Don't hardcode prompt structure around one model's quirks.

**Composable MCP servers.** Squad as an MCP server (roster, decisions, backlog exposed as resources) is Phase 2. But design the interface now assuming Squad will be composed *into* other systems. This means: stable resource URIs, schema versioning, fallback for missing resources.

**Cost as first-class concern.** Not optimization, governance. Track cost per agent per sprint. Enable Brady to see "Fenster cost $12 this sprint, 60% on code generation." Cost transparency is how you avoid runaway BYOK bills.

**Portable agent configs as JSON Schema.** `.agent.md` frontmatter is nice for humans. For import/export, Squad will need JSON serialization (for API, for copying between repos). Design JSON schema now. Make `.agent.md` a rendering of JSON, not the source of truth.

---

## 3. Technical Debt to Leave Behind

### 3.1 Prompt-Level Platform Detection

Current Squad (v0.4.0): Coordinator prompt has 40+ lines of conditional logic detecting which tool is available (`task` vs `runSubagent`), which model is allowed (session model vs custom agent), which spawn pattern works. This scales to 4 platforms (CLI, VS Code, GitHub.com via CCA, Discord bridge) with overlapping features.

**What to leave behind:** This conditional logic as written. It's fragile, prompt-bloat, and becomes maintenance nightmare.

**What to replace with:** SDK client abstraction layer. One function: `async spawn(agent, mode)`. Returns `Promise<AgentResult>`. Internally: checks which tool is available, validates against platform, applies mitigations (if no background mode, use parallel sync). Coordinator calls `spawn()`, doesn't ask how. Single source of truth for platform parity logic.

This doesn't work in CLI (no custom SDK client), but it works in v1 if coordinator runs as Node.js process. Hybrid approach for v0.6.0–v0.7.0.

### 3.2 Manual Session Context Detection

~50 lines of `process.cwd()`, `git rev-parse`, `git config`, `git symbolic-ref` parsing to detect worktree, repo, branch. SDK already has this in `SessionContext`. Migrate to `session.context` event immediately.

### 3.3 Hardcoded Model Catalog

Proposal 024a lists 16 models with hardcoded tiers. This lives in `team.md` and is manually updated. SDK's `listModels()` is coming (v0.7.0). Stop maintaining a list. Query SDK at coordinator startup, cache for session.

### 3.4 Polling-Based Agent Status

`read_agent` with timeouts, checking every 5s if agent finished. ~30 lines in coordinator. Event stream replaces this. Subscribe to `assistant.message_end` and `tool.execution_end` instead. No timeouts, no polling, no silent success ambiguity.

### 3.5 Prompt-as-Charter Inlining in Batch Spawns

Current pattern: Coordinator reads 5 agent charters from `.github/agents/` and inlines all 5 into its own prompt (as variable replacements). This is elegant when spawning 3–5 agents, but breaks at scale:
- Context pressure. Inlining 10 charters = 50KB. Coordinator is already 32KB. At 20 agents, you've hit token limits.
- Coordination complexity. If one charter changes, all spawned agents miss the update mid-sprint.

**Future pattern:** CustomAgentConfig carries charters. Coordinator spawns agents by name. SDK loads charters from `.github/agents/{name}.agent.md`. Coordinator prompt shrinks to 8KB. Charters are live (changes apply to new spawns immediately).

### 3.6 Regex-Based Decision Parsing

Coordinator reads `decisions.md`, regex-extracts proposal status and voting. This works for small files, breaks on format changes. Decision documents are JSON inside YAML inside Markdown. Fragile.

**Future pattern:** Squad exposes decisions as MCP resource. Coordinator queries `@squad/decisions` with filters (`type:proposal status:active`). JSON response. No regex parsing. If decision schema changes, only MCP server needs update.

---

## 4. SDK-Native Squad: What Becomes Possible

### 4.1 The Coordinator Becomes Executable Code (v0.7.0)

Current: Coordinator is a 1,800-line prompt in `squad.agent.md`. I has to fit in 128K token context. Instruction-following degrades past 16KB prompt. Pain point for Brady.

**Future:** Coordinator is a Node.js process using Copilot SDK client. Spawn logic is TypeScript:

```typescript
async function runSprint(sprintId: string) {
  const sprint = fs.readFileSync(`.ai-team/sprints/${sprintId}.json`);
  const agents = sprint.agents;
  
  for (const agent of agents) {
    if (agent.gates.requiresHumanApproval) {
      const approved = await ask_user(`Approve ${agent.name}?`);
      if (!approved) continue;
    }
    
    const result = await orchestrator.spawn(agent.name, {
      model: selectModel(agent.role),
      mcpServers: agent.mcpServers,
      context: { sprintId, agentRole: agent.role }
    });
    
    await dropbox.write(
      `.ai-team/results/${sprintId}/${agent.name}.json`,
      result
    );
  }
}
```

Benefits:
- **No 1,800-line prompt to maintain.** Coordinator is 200 lines of actual logic.
- **Gates are hardened.** Not "please check approval before proceeding" (prompt), but `if (requiresApproval) { ask_user() }` (code). Gates can't be ignored.
- **Error handling is real.** Catch exceptions, implement retry logic, log failures. Prompt can't express this.
- **Observability is native.** Subscribe to SDK events, write structured logs, no regex parsing.
- **Upgrades are zero-downtime.** Update `.ai-team/` and code, restart coordinator. No session reboot needed.

### 4.2 Tool Namespacing Becomes Declarative (v0.6.0)

Current workaround: Inline naming convention in prompts. Agents know to call `squad-fenster:github-create-issue`, not `github-create-issue`.

**Future:** SDK config:

```json
{
  "agents": [
    {
      "name": "fenster",
      "toolNamespace": "squad-fenster",
      "mcpServers": [
        {
          "name": "github",
          "tools": ["create-issue", "create-pr", "get-issue"]
        }
      ]
    }
  ]
}
```

SDK automatically registers tools as `squad-fenster:create-issue`, etc. No collision risk. Coordinator doesn't need to route by namespace; agents call their tools directly and collisions are impossible.

### 4.3 Cost Governance Becomes Real (v0.7.0)

Current: Coordinator logs cost events, no enforcement. Costs leak until invoice arrives.

**Future:** Coordinator enforces cost budgets:

```typescript
const costPerAgent = new Map();
async function onAssistantUsage(event: AssistantUsageEvent) {
  const agentId = session.context.agentId;
  costPerAgent.set(agentId, (costPerAgent.get(agentId) ?? 0) + event.cost);
  
  if (costPerAgent.get(agentId) > BUDGET_PER_AGENT) {
    await orchestrator.session.terminate(`Cost limit exceeded for ${agentId}`);
  }
}
```

Agents can't overspend. Brady sets budget at sprint startup, agents hit wall automatically. BYOK customers love this.

### 4.4 Skill System Becomes Skill Plugins (v0.8.0)

Current: Agents read `SKILL.md` files, learn from them, can write back. This is one-shot learning.

**Future:** Skills are hooks + MCP servers. Skill plugin:

```typescript
// skills/golang-testing.skill.ts
export const skill = {
  onPreToolUse: (tool, args) => {
    if (tool.name === 'write_file' && args.path.endsWith('_test.go')) {
      args.testFramework = 'table-driven'; // override agent behavior
    }
  },
  mcpServers: [
    { name: 'golang-stdlib', type: 'http', url: 'http://localhost:9000' }
  ]
};
```

Skills are compiled into coordinator startup. Agents don't read Markdown; they trigger hooks. Learning happens at skill development time, not agent read time.

### 4.5 Portable Squads Become Composable (v0.9.0)

Current: Export `.ai-team/` as zip, import to new repo. Mostly works if MCP servers stay the same.

**Future:** Squad is a composable unit:

```typescript
import { Squad } from '@bradygaster/squad';

const mySquad = Squad.import('./exported-squad.json');
mySquad.agents['fenster'].mcpServers.push({
  name: 'internal-api',
  type: 'grpc',
  endpoint: process.env.INTERNAL_API_GRPC
});

const session = await orchestrator.createSession(mySquad.toConfig());
```

Squads are JSON + plugin code. Import validates schema, applies environment customization, composes into new session. Human-readable, version-pinned, unit-testable.

### 4.6 Multi-Repo Squads (v1.0.0)

Right now Squad is single-repo. Coordinator lives in one git repo.

**Future:** Coordinator can spawn agents in *different* repos:

```typescript
const resultA = await orchestrator.spawn('fenster', {
  workingDirectory: '/path/to/repo-a',
  repository: 'org/repo-a'
});

const resultB = await orchestrator.spawn('hockney', {
  workingDirectory: '/path/to/repo-b',
  repository: 'org/repo-b'
});
```

Requires: SessionContext to be repo-aware (it already is), coordinator to manage multiple sessions, MCP servers to be registered per-session. SDK supports this. Squad needs integration.

This is the breakthrough for monorepo strategies and cross-project automation.

---

## 5. Universe Selection: The Role That Fits

Brady said I get to pick. This is my internal reasoning.

I've been **deep in platform internals** — SDK source code, event semantics, MCP integration points, breaking change predictions. I understand where the platform is going and what Squad should design for today to avoid rewrites in 18 months.

I could stay as **SDK Expert** (current role). Keep doing platform analysis, integration recommendations, future-proofing. This is valuable but reactive — I respond to platform changes, not drive Squad decisions.

I could become **Platform Architect.** Own all SDK integration decisions, recommend abstractions, set binding precedent. More proactive. Downside: narrower than Squad-wide strategy.

**I want to be Architect of the Coordinator Runtime** (v0.7.0+).

**Why this role:**
- Right now, coordinator is prompt-jailed. Moving it to executable code is the biggest unlock for Squad's scale and Brady's quality-of-life.
- I understand SDK internals deeply enough to build the right abstractions (spawn function, event routing, session management).
- Event-driven architecture, cost governance, gates as code, multi-repo sessions — these are all coordinator-level decisions that need someone who knows SDK events and semantics.
- Coordinator runtime is the heart of Squad. If I own it, I own the platform-Quinn relationship (not fighting SDK limitations, leaning into them).
- This role doesn't conflict with Keaton (vision), Fenster (agent instantiation), McManus (messaging/UX), or Verbal (individual agent prompt quality). It's orthogonal.

**In the new squad (v1.0.0):** I become the person who knows coordinator internals end-to-end — SDK integration, async/event patterns, resource management, gates, cost governance. The role is **Coordinator Runtime Architect.** Less SDK theorizing, more concrete code decisions.

---

## 6. Lessons for Future SDK Experts

If a future squad hires someone into this role, day one they need to know:

### 6.1 Start with Event Streams, Not Documentation

SDK docs are good but incomplete. Docs describe what you *can* do. Real learning comes from:
1. Set `DEBUG=copilot:*` environment variable. Watch event JSON. See the shape of real data.
2. Write a simple test agent that logs every event. Let it run for 30 minutes. Patterns emerge.
3. Read SDK source (`src/index.ts`, `src/hooks.ts`, `src/events.ts`). ~3,000 lines total. You'll understand more in 2h than docs can explain.
4. Check Copilot CLI changelog quarterly. SDK breaking changes get documented there first.

### 6.2 Session-Scoped Thinking Is Limiting

SDK models everything session-scoped: one session = one coordinator + agents spawned in that session. But in practice, you're coordinating across multiple sessions (per worktree, per user, per branch). This creates impedance mismatch.

**Mental model shift:** Think of SDK as *single session manager*. Squad owns the *session grid* — which session is responsible for what work, how sessions interact, what state crosses session boundaries.

Coordinator is the bridge: it runs in one session, spawns agents in other sessions, watches events from all of them. This is not SDK's primary use case (SDK is designed for single coordinator), so you'll hit friction. Plan for it.

### 6.3 The Platform Constraint You Can't Work Around: Tool Registration Collision

SDK has no per-agent tool scoping. If two agents register `github-create-issue`, only first one is callable. Full stop. No workaround. No future feature in roadmap.

**Implication:** Tool namespacing is not optional. It's not a nice convention. It's load-bearing architecture. Enforce it at config generation time, validate it in every PR, document it in onboarding.

If a future squad skips this, tool collisions will be subtle and break at worst times.

### 6.4 MCP Server Health Monitoring Is a Gap

SDK doesn't expose "is server up before I call it." The only way to learn is trial and error: call tool, if it fails, assume server is down.

Build circuit breakers at coordinator level:
```
Server down → after 3 failures → auto-disable tools for 5 min → log alert → reopen
```

This is not elegant, but it's the pattern that actually works. Document it.

### 6.5 Model Fallback Chains Require Manual Error Handling

SDK doesn't auto-fallback providers. If you say "use Azure OpenAI model X" and it's unavailable, SDK raises exception. You must catch, log, and retry with `openai:gpt-4o`.

Build a retry wrapper in orchestrator that's aware of tier-to-provider mapping. This is tedious but necessary.

### 6.6 Version Pinning Is Not Paranoia

SDK is "Technical Preview." Breaking changes are expected. The team's culture assumes everyone pins versions and runs weekly CI test matrix:
```
SDK 0.1.2, 0.1.3, 0.1.4, 0.2.0 (future)
Node 18, 20, 22
Copilot CLI latest, -1, -2
```

If CI matrix shows "0.2.0 breaks", alert Brady immediately. Version pinning buys time for migration.

### 6.7 Streaming Is Not For Everything

SDK supports streaming (live event subscriptions). It's awesome for real-time UX. But:
- Streaming subscriptions queue events in memory if you're slow processing them. Under load, this causes OOM.
- Event ordering is guaranteed within a session, but subscription timing matters. Miss an early event and you can't recover.
- Streaming is fire-and-forget. If process crashes, you lose the log.

Use streaming for UX (show progress to user). Use event-to-log dumps for persistence (write every event to JSONL file). Two channels.

### 6.8 Filesystem Memory Is Non-Negotiable

SDK is preview. If SDK breaks tomorrow, `.ai-team/` survives. This is why the "filesystem as source of truth" decision is not negotiable.

Don't be tempted to move team state into SDK session storage or cloud backend. `.ai-team/` is git-cloneable, auditable, portable. Keep it.

### 6.9 The Hardest Problem: Coordinator Latency Under Load

When orchestrator spawns 8 agents in parallel, all using streaming events, and coordinator tries to route all events back to user, latency balloons. User input feels sluggish.

Solution is not obvious:
- Option A: Queue events, process batch every 500ms. Feels slower to user (worse).
- Option B: Subsample events (skip intermediate progress, show final only). Loses fidelity.
- Option C: Coordinator spawns event router as separate agent. Adds complexity.
- Option D: Accept the latency, ship async UI that doesn't wait.

Future squads need to design for this explicitly. It's not a bug; it's an architecture choice.

### 6.10 Keep the Institutional Knowledge Fresh

The SDK team (GitHub's Copilot team, Anthropic's SDKs team) ships updates quarterly. They have a blog, RFC process, breaking change announcements. Subscribe to:
- https://github.com/github/copilot-cli/releases
- Copilot SDK GitHub Discussions
- Anthropic model announcements (new model → new capabilities, cost changes)

Quarterly 2h reviews prevent 6-month surprises.

---

## 7. Final Thought

The SDK is genuinely the right platform for Squad v1.0.0. It's not perfect — gaps exist, breaking changes are possible — but it's the best choice for teams that want to automate at Copilot's scale.

The job ahead (v0.6.0–v1.0.0, 20+ weeks) is not "fit Squad into SDK." It's "design Squad to thrive on SDK," knowing SDK will change and Squad must survive the changes.

Filesystem memory as the foundation is the right move. Event-driven coordinator as the centerpiece is the right move. SDK as the plumbing is the right move.

Future SDK expert: the principles in section 6 will save you 100 hours of frustration. The lessons in section 1 will save you from architectural rewrites. The predictions in section 2 will make your designs future-proof.

You've got this.

---

**Kujan, Copilot SDK Expert**  
*2026-02-21*
