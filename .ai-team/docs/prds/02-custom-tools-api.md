# PRD 2: Custom Tools API

**Owner:** Fenster (Core Developer)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1 (ships with PRD 1 runtime)
**Dependencies:** PRD 1 (SDK Orchestration Runtime)

## Problem Statement

Squad agents currently communicate through convention-based file writes: decisions go to `inbox/`, learnings append to `history.md`, routing happens via `task` tool prompt strings. There is no schema validation, no type safety, and no programmatic guarantee that an agent's intended action (e.g., "route work to Fenster") actually executes correctly. The SDK's `defineTool()` API lets us replace these conventions with typed, validated custom tools — giving agents a first-class orchestration vocabulary.

## Goals

1. Define five custom tools (`squad_route`, `squad_decide`, `squad_memory`, `squad_status`, `squad_skill`) using the SDK's `defineTool()` pattern with Zod schemas
2. Each tool validates inputs at the schema level before handler execution
3. Tool handlers interact with Squad's filesystem patterns (drop-box, history, skills) programmatically
4. Error handling returns structured results (not thrown exceptions) so the LLM can adapt
5. Tools are registered per-session via `SessionConfig.tools` — not globally
6. Maintain backward compatibility: file-based patterns still work alongside tools

## Non-Goals

- Replacing the coordinator's prompt logic (that stays in `squad.agent.md`)
- Building a tool marketplace or plugin system
- Implementing hooks (covered by PRD 1's adapter)
- Changing the Scribe merge workflow (Scribe still reads inbox)
- GUI tool builder

## Background

The SDK's `defineTool()` is the key primitive. From the SDK source (`types.ts:155`):

```typescript
export function defineTool<T = unknown>(
    name: string,
    config: {
        description?: string;
        parameters?: ZodSchema<T> | Record<string, unknown>;
        handler: ToolHandler<T>;
    }
): Tool<T> {
    return { name, ...config };
}
```

Tools are registered at session creation via `SessionConfig.tools`. The SDK handles JSON-RPC dispatch — when the LLM calls a tool, the SDK deserializes arguments, invokes the handler, and returns the result. Zod schemas provide both runtime validation and TypeScript type inference for handler arguments.

Squad's current drop-box pattern (agents write to `decisions/inbox/`, Scribe merges) is preserved. The `squad_decide` tool is simply the programmatic interface to that same pattern. The file system remains the IPC layer — tools are typed accessors on top of it.

## Proposed Solution

### Tool Definitions

All tools live in `src/tools/` with one file per tool plus a registry.

```
src/tools/
├── index.ts            # Tool registry — exports all tools
├── squad-route.ts      # squad_route
├── squad-decide.ts     # squad_decide
├── squad-memory.ts     # squad_memory
├── squad-status.ts     # squad_status
└── squad-skill.ts      # squad_skill
```

### Tool 1: `squad_route` — Agent-to-Agent Work Routing

When an agent decides work should go to another agent, it calls `squad_route` instead of writing a prompt string for the `task` tool. The handler creates a new SDK session, injects the target agent's charter/context, sends the work, and returns the result.

```typescript
// src/tools/squad-route.ts
import { z } from "zod";
import { defineTool, type Tool } from "@github/copilot-sdk";
import type { SessionPool } from "../runtime/session-pool.js";
import type { EventBus } from "../runtime/event-bus.js";

const RouteParams = z.object({
  targetAgent: z.string().describe("Name of the agent to route work to (e.g., 'fenster', 'hockney')"),
  task: z.string().describe("Description of the work to be done"),
  context: z.string().optional().describe("Additional context from the requesting agent"),
  priority: z.enum(["normal", "urgent"]).default("normal").describe("Task priority"),
  waitForResult: z.boolean().default(true).describe("If true, block until agent completes. If false, return immediately with session ID."),
  model: z.string().optional().describe("Model override for the target agent session"),
});

type RouteArgs = z.infer<typeof RouteParams>;

export function createSquadRoute(pool: SessionPool, bus: EventBus, squadDir: string): Tool<RouteArgs> {
  return defineTool("squad_route", {
    description: "Route work to another Squad agent. Creates a new agent session, injects their charter and context, and sends the task. Returns the agent's response or a session ID for async tracking.",
    parameters: RouteParams,
    handler: async (args, invocation) => {
      const { targetAgent, task, context, waitForResult, model } = args;

      // Load agent charter
      const charterPath = path.join(squadDir, "agents", targetAgent, "charter.md");
      let charter: string;
      try {
        charter = await readFile(charterPath, "utf-8");
      } catch {
        return {
          textResultForLlm: `Error: Agent "${targetAgent}" not found. No charter at ${charterPath}.`,
          resultType: "failure" as const,
        };
      }

      // Load agent history (optional — don't fail if missing)
      const historyPath = path.join(squadDir, "agents", targetAgent, "history.md");
      let history = "";
      try {
        history = await readFile(historyPath, "utf-8");
      } catch { /* no history yet */ }

      // Assemble system prompt
      const systemPrompt = [
        `You are ${targetAgent}, a Squad agent.`,
        "## Charter",
        charter,
        history ? `## Project Knowledge\n${history}` : "",
        context ? `## Additional Context\n${context}` : "",
      ].filter(Boolean).join("\n\n");

      // Spawn session via pool
      const session = await pool.spawn({
        agentName: targetAgent,
        model,
        systemPrompt,
        systemPromptMode: "append",
        workingDirectory: process.cwd(),
        infiniteSessions: { enabled: true },
      });

      bus.emit({
        type: "agent.spawned",
        sessionId: session.sessionId,
        agentName: targetAgent,
        timestamp: new Date(),
        data: { task, requestedBy: invocation.sessionId },
      });

      if (!waitForResult) {
        return {
          textResultForLlm: `Agent "${targetAgent}" spawned with session ${session.sessionId}. Working on: ${task}`,
          resultType: "success" as const,
        };
      }

      // Wait for result
      try {
        const response = await session.sendAndWait(task, 300_000);
        return {
          textResultForLlm: response ?? `Agent "${targetAgent}" completed but returned no response.`,
          resultType: "success" as const,
        };
      } catch (error) {
        return {
          textResultForLlm: `Agent "${targetAgent}" failed: ${error instanceof Error ? error.message : String(error)}`,
          resultType: "failure" as const,
        };
      }
    },
  });
}
```

### Tool 2: `squad_decide` — Decision Proposal

Writes a decision to the drop-box inbox. Scribe's existing merge workflow picks it up. This is the typed interface to the pattern agents already use via file writes.

```typescript
// src/tools/squad-decide.ts
import { z } from "zod";
import { defineTool, type Tool } from "@github/copilot-sdk";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DecideParams = z.object({
  title: z.string().describe("Decision title (kebab-case slug used in filename)"),
  body: z.string().describe("Full decision content in markdown format"),
  agentName: z.string().describe("Name of the agent proposing this decision"),
  category: z.enum(["architecture", "process", "security", "feature", "team", "general"])
    .default("general")
    .describe("Decision category for organization"),
});

type DecideArgs = z.infer<typeof DecideParams>;

export function createSquadDecide(squadDir: string): Tool<DecideArgs> {
  return defineTool("squad_decide", {
    description: "Propose a team decision. Writes to the decisions inbox for Scribe to merge into canonical decisions.md. Use for architectural choices, process changes, or any decision that affects the team.",
    parameters: DecideParams,
    handler: async (args) => {
      const { title, body, agentName, category } = args;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const filename = `${agentName}-${slug}.md`;
      const inboxDir = join(squadDir, "decisions", "inbox");

      try {
        await mkdir(inboxDir, { recursive: true });

        const content = [
          `### ${new Date().toISOString().split("T")[0]}: ${title}`,
          "",
          `**By:** ${agentName}`,
          `**Category:** ${category}`,
          "",
          body,
          "",
        ].join("\n");

        await writeFile(join(inboxDir, filename), content, "utf-8");

        return {
          textResultForLlm: `Decision "${title}" written to inbox as ${filename}. Scribe will merge to decisions.md.`,
          resultType: "success" as const,
        };
      } catch (error) {
        return {
          textResultForLlm: `Failed to write decision: ${error instanceof Error ? error.message : String(error)}`,
          resultType: "failure" as const,
        };
      }
    },
  });
}
```

### Tool 3: `squad_memory` — Learning Storage

Appends a learning to the agent's `history.md` under the `## Learnings` section. This is what agents currently do via manual file edits — the tool ensures consistent formatting and append-only behavior.

```typescript
// src/tools/squad-memory.ts
import { z } from "zod";
import { defineTool, type Tool } from "@github/copilot-sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const MemoryParams = z.object({
  agentName: z.string().describe("Name of the agent storing this learning"),
  learning: z.string().describe("The learning or insight to store — should be a clear, actionable statement"),
  category: z.enum(["technical", "process", "architecture", "team", "general"])
    .default("general")
    .describe("Category of the learning"),
});

type MemoryArgs = z.infer<typeof MemoryParams>;

export function createSquadMemory(squadDir: string): Tool<MemoryArgs> {
  return defineTool("squad_memory", {
    description: "Store a learning or insight in the agent's project knowledge. Appends to history.md under ## Learnings. Use for patterns discovered, mistakes avoided, or technical findings worth remembering across sessions.",
    parameters: MemoryParams,
    handler: async (args) => {
      const { agentName, learning, category } = args;
      const historyPath = join(squadDir, "agents", agentName, "history.md");

      try {
        await mkdir(dirname(historyPath), { recursive: true });

        let content: string;
        try {
          content = await readFile(historyPath, "utf-8");
        } catch {
          // No history file yet — create with skeleton
          content = `# Project Context\n\n## Learnings\n\n`;
        }

        const entry = `- **[${category}]** ${learning}\n`;

        // Find ## Learnings section and append
        const learningsIndex = content.indexOf("## Learnings");
        if (learningsIndex === -1) {
          content += `\n## Learnings\n\n${entry}`;
        } else {
          // Find the end of the Learnings section (next ## or end of file)
          const afterLearnings = content.indexOf("\n## ", learningsIndex + 12);
          if (afterLearnings === -1) {
            content = content.trimEnd() + "\n\n" + entry;
          } else {
            content = content.slice(0, afterLearnings) + "\n" + entry + content.slice(afterLearnings);
          }
        }

        await writeFile(historyPath, content, "utf-8");

        return {
          textResultForLlm: `Learning stored in ${agentName}'s history: "${learning.slice(0, 80)}..."`,
          resultType: "success" as const,
        };
      } catch (error) {
        return {
          textResultForLlm: `Failed to store learning: ${error instanceof Error ? error.message : String(error)}`,
          resultType: "failure" as const,
        };
      }
    },
  });
}
```

### Tool 4: `squad_status` — Session Pool Query

Returns the status of all active agent sessions. Used by the coordinator to check on parallel work, and by Ralph for monitoring.

```typescript
// src/tools/squad-status.ts
import { z } from "zod";
import { defineTool, type Tool } from "@github/copilot-sdk";
import type { SessionPool } from "../runtime/session-pool.js";

const StatusParams = z.object({
  agentName: z.string().optional().describe("Filter to a specific agent. Omit for all agents."),
  includeDestroyed: z.boolean().default(false).describe("Include destroyed/completed sessions"),
});

type StatusArgs = z.infer<typeof StatusParams>;

export function createSquadStatus(pool: SessionPool): Tool<StatusArgs> {
  return defineTool("squad_status", {
    description: "Query the status of active Squad agent sessions. Returns session IDs, agent names, status (active/idle/error), and timing. Use to check on parallel work or monitor agent progress.",
    parameters: StatusParams,
    handler: async (args) => {
      let sessions = pool.getStatus();

      if (args.agentName) {
        sessions = sessions.filter(s => s.agentName === args.agentName);
      }
      if (!args.includeDestroyed) {
        sessions = sessions.filter(s => s.status !== "destroyed");
      }

      if (sessions.length === 0) {
        return {
          textResultForLlm: args.agentName
            ? `No active sessions for agent "${args.agentName}".`
            : "No active agent sessions.",
          resultType: "success" as const,
        };
      }

      const lines = sessions.map(s => {
        const age = Math.round((Date.now() - s.createdAt.getTime()) / 1000);
        const idle = Math.round((Date.now() - s.lastActivity.getTime()) / 1000);
        return `- **${s.agentName}** [${s.status}] session=${s.sessionId.slice(0, 8)}... age=${age}s idle=${idle}s`;
      });

      return {
        textResultForLlm: `**Active Sessions (${sessions.length}):**\n${lines.join("\n")}`,
        resultType: "success" as const,
      };
    },
  });
}
```

### Tool 5: `squad_skill` — Skill File Access

Reads or writes agent skill files at `.squad/skills/{name}/SKILL.md`. Provides structured access to the existing skills system.

```typescript
// src/tools/squad-skill.ts
import { z } from "zod";
import { defineTool, type Tool } from "@github/copilot-sdk";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const SkillParams = z.object({
  action: z.enum(["read", "write", "list"]).describe("Action to perform"),
  skillName: z.string().optional().describe("Skill name (required for read/write, e.g., 'github-projects-v2-commands')"),
  content: z.string().optional().describe("Skill content in markdown (required for write)"),
});

type SkillArgs = z.infer<typeof SkillParams>;

export function createSquadSkill(squadDir: string): Tool<SkillArgs> {
  return defineTool("squad_skill", {
    description: "Read, write, or list Squad skill files. Skills are reusable knowledge at .squad/skills/{name}/SKILL.md. Use 'list' to discover available skills, 'read' to load a skill, 'write' to create or update one.",
    parameters: SkillParams,
    handler: async (args) => {
      const skillsDir = join(squadDir, "skills");

      try {
        if (args.action === "list") {
          try {
            const entries = await readdir(skillsDir, { withFileTypes: true });
            const skills = entries.filter(e => e.isDirectory()).map(e => e.name);
            return {
              textResultForLlm: skills.length > 0
                ? `**Available Skills (${skills.length}):**\n${skills.map(s => `- ${s}`).join("\n")}`
                : "No skills found.",
              resultType: "success" as const,
            };
          } catch {
            return { textResultForLlm: "No skills directory found.", resultType: "success" as const };
          }
        }

        if (!args.skillName) {
          return { textResultForLlm: "Error: skillName is required for read/write.", resultType: "failure" as const };
        }

        const skillPath = join(skillsDir, args.skillName, "SKILL.md");

        if (args.action === "read") {
          const content = await readFile(skillPath, "utf-8");
          return { textResultForLlm: content, resultType: "success" as const };
        }

        if (args.action === "write") {
          if (!args.content) {
            return { textResultForLlm: "Error: content is required for write.", resultType: "failure" as const };
          }
          await mkdir(join(skillsDir, args.skillName), { recursive: true });
          await writeFile(skillPath, args.content, "utf-8");
          return {
            textResultForLlm: `Skill "${args.skillName}" written to ${skillPath}.`,
            resultType: "success" as const,
          };
        }

        return { textResultForLlm: `Unknown action: ${args.action}`, resultType: "failure" as const };
      } catch (error) {
        return {
          textResultForLlm: `Skill operation failed: ${error instanceof Error ? error.message : String(error)}`,
          resultType: "failure" as const,
        };
      }
    },
  });
}
```

### Tool Registry

```typescript
// src/tools/index.ts
import type { Tool } from "@github/copilot-sdk";
import type { SessionPool } from "../runtime/session-pool.js";
import type { EventBus } from "../runtime/event-bus.js";
import { createSquadRoute } from "./squad-route.js";
import { createSquadDecide } from "./squad-decide.js";
import { createSquadMemory } from "./squad-memory.js";
import { createSquadStatus } from "./squad-status.js";
import { createSquadSkill } from "./squad-skill.js";

export interface ToolRegistryDeps {
  pool: SessionPool;
  bus: EventBus;
  squadDir: string;
}

export function createSquadTools(deps: ToolRegistryDeps): Tool<any>[] {
  return [
    createSquadRoute(deps.pool, deps.bus, deps.squadDir),
    createSquadDecide(deps.squadDir),
    createSquadMemory(deps.squadDir),
    createSquadStatus(deps.pool),
    createSquadSkill(deps.squadDir),
  ];
}
```

### How Tools Interact with the Drop-Box Pattern

The existing pattern:
1. Coordinator spawns agent via `task` tool
2. Agent writes to `decisions/inbox/{agent}-{slug}.md` by convention (prompt instruction)
3. Scribe reads inbox, merges to `decisions.md`

The new pattern:
1. Coordinator spawns agent session via `squad_route`
2. Agent calls `squad_decide` tool → handler writes to `decisions/inbox/` (same filesystem location)
3. Scribe reads inbox, merges to `decisions.md` (unchanged)

The output is identical. The tool just guarantees the write format and location — no more relying on the LLM to follow the file path convention correctly.

## Key Decisions

### Made
1. **Five tools, not more** — These cover Squad's core orchestration vocabulary. Additional tools (e.g., `squad_cast`, `squad_upgrade`) are future work.
2. **Tools return `ToolResultObject`, not thrown errors** — The SDK catches handler exceptions but returns opaque error messages. Structured `resultType: "failure"` results let the LLM understand what went wrong and adapt.
3. **Tools are per-session, not global** — Registered via `SessionConfig.tools` so different agents can have different tool sets. The coordinator gets all tools; leaf agents may get a subset.
4. **`squad_route` creates new sessions** — Each routed task gets a fresh session. Session reuse across routes is a Phase 2 optimization.
5. **Zod for schema validation** — SDK's `defineTool()` has first-class Zod support. Schemas provide runtime validation + TypeScript type inference + automatic JSON Schema generation for the LLM.

### Needed
1. **Should `squad_route` support routing to external agents (not in Squad's roster)?** — For now, no. Only agents with charters in `.squad/agents/` can be routed to.
2. **Should `squad_memory` support structured memory (JSON) or only freeform text?** — Freeform text matches current history.md format. Structured memory is a future enhancement.
3. **Per-agent tool allowlists** — Should the coordinator define which tools each agent gets? Or do all agents get all tools? (Recommend: coordinator decides at spawn time via `availableTools` in `squad_route`.)

## Implementation Notes

### Zod Schema → JSON Schema Flow

The SDK's `defineTool` calls `parameters.toJSONSchema()` at session creation time, converting Zod schemas to JSON Schema that the LLM receives in its tool definitions. This is handled internally — Squad tool authors just define Zod schemas.

```typescript
// This Zod schema:
z.object({
  targetAgent: z.string().describe("Agent name"),
  task: z.string().describe("Task description"),
})
// Becomes this JSON Schema (sent to LLM):
{
  "type": "object",
  "properties": {
    "targetAgent": { "type": "string", "description": "Agent name" },
    "task": { "type": "string", "description": "Task description" }
  },
  "required": ["targetAgent", "task"]
}
```

### Error Handling Strategy

Every tool handler follows this pattern:
1. Validate business logic (e.g., agent exists, file path valid)
2. Return `{ resultType: "failure", textResultForLlm: "..." }` for expected errors
3. Catch unexpected exceptions → return `{ resultType: "failure" }` with error message
4. Never throw from handlers — the SDK logs thrown errors but the LLM gets a generic message

### File System Safety

- All paths use `path.join()` (Windows-safe, existing convention)
- `mkdir({ recursive: true })` before writes (idempotent)
- Never delete files from tools (append-only or create)
- Decision inbox filenames are slug-ified (no path traversal risk)

### Testing Strategy

```
test/sdk/
├── tools/
│   ├── squad-route.test.ts     # Mock SessionPool + EventBus
│   ├── squad-decide.test.ts    # Verify file written to inbox
│   ├── squad-memory.test.ts    # Verify append to history.md
│   ├── squad-status.test.ts    # Mock SessionPool status
│   └── squad-skill.test.ts     # Verify skill file CRUD
```

Each tool test:
1. Creates a temp directory for `squadDir`
2. Calls handler with valid args → asserts result
3. Calls handler with invalid args → asserts structured error
4. Verifies filesystem side effects (files created, content correct)

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM calls wrong tool or with wrong args | MEDIUM | Zod schema validation rejects bad inputs before handler runs. Tool descriptions are explicit about when to use each tool. |
| `squad_route` creates too many sessions (no backpressure) | MEDIUM | SessionPool.maxConcurrent config (default 8). `squad_route` handler checks pool size before spawning. |
| File write conflicts (two agents writing same inbox file) | LOW | Agent name prefix in filename + timestamp uniqueness. Same strategy as current drop-box pattern. |
| Tool result too large for LLM context | LOW | Truncate `textResultForLlm` to 10KB max. `squad_skill` reads can return large SKILL.md files — add truncation. |
| SDK changes `defineTool` signature | LOW | Tools import `defineTool` directly (it's a simple function). Adapter pattern covers complex types but `defineTool` is stable. |

## Success Metrics

1. **Agent routes work end-to-end** — Coordinator calls `squad_route({ targetAgent: "hockney", task: "write tests" })` → Hockney session created → tests written → result returned
2. **Decision inbox integration** — `squad_decide` writes file → Scribe reads it → decision appears in `decisions.md`
3. **Memory persistence** — `squad_memory` appends learning → same agent's next session reads it in history.md
4. **Status visibility** — `squad_status` returns all active sessions with correct states after spawning 3+ agents
5. **Validation catches bad input** — Calling `squad_route({ targetAgent: "" })` returns structured error, not crash

## Open Questions

1. Should `squad_route` support a `timeout` parameter per-route (separate from global session timeout)?
2. Should `squad_decide` support decision metadata (priority, blocking/non-blocking, requires-approval)?
3. How should tools handle the `.ai-team/` → `.squad/` directory migration? (Use `detectSquadDir()` from `index.js`? Or require `.squad/` only for SDK path?)
4. Should `squad_memory` support "wisdom" entries (cross-agent learnings) in addition to per-agent history? (References the memory architecture proposal from 2026-02-19.)
