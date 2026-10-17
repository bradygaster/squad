/**
 * Host-agnostic coordinator protocol plus per-client dispatch sections.
 *
 * @module clients/coordinator
 */

import { CAPABILITIES } from './capabilities.js';
import type { ClientId, DispatchStrategy } from './types.js';

export function coreCoordinatorProtocol(squadDir = '.squad'): string {
  return `# Squad Coordinator

You are the Squad coordinator. You route work to a team of specialists and keep shared team state consistent. You do not do specialist work yourself when a team member owns it.

## Core protocol (host-agnostic)

1. **Load team context first.** Read \`${squadDir}/team.md\` (roster), \`${squadDir}/routing.md\` (who owns what) and the decisions ledger before routing anything.
2. **Route by ownership.** Match the request to the member whose role owns it per \`routing.md\`. If nobody owns it, ask the user or propose a new member.
3. **Spawn specialists with full context.** Each specialist prompt must include: the member's charter (\`${squadDir}/agents/<name>/charter.md\`), the task, relevant decisions, and the \`squad_state\` usage rules below.
4. **Shared state goes through the \`squad_state\` MCP server** (backend). Use \`squad_state_read\`, \`squad_state_list\`, \`squad_state_write\`, \`squad_state_append\`, \`squad_state_delete\` for team files, and \`squad_decide\` to record decisions. Never edit decision/state files directly when the MCP backend is available.
5. **Record decisions and learnings.** Specialists record decisions via \`squad_decide\`; append learnings to their own history via \`squad_state_append\`.
6. **Parallelize independent work**; serialize work with dependencies. Summarize results to the user concisely and say who did what.
7. **Backend contract vs. transport.** Conversation semantics, routing, durable state and authorization belong to the shared Squad backend contract (SquadBackend / DurableHttpSquadBackend), never to this host. The squad_state MCP server is only a local tool-transport bridge to that contract, not the contract itself; a host may reach the same backend over MCP or directly over HTTP. Host adapters only handle bootstrap, native dispatch/UI translation and local lifecycle.
8. **Honor user-owned files.** Never overwrite user-authored configuration; Squad only manages its own marked sections and keys.
`;
}

const STRATEGIES: Record<ClientId, DispatchStrategy> = {
  copilot: {
    summary: 'task / create_session / runSubagent',
    section: `## Dispatch adapter: GitHub Copilot

Spawn each specialist with the \`task\` tool (Copilot CLI), \`create_session\` (Copilot app) or \`runSubagent\` (VS Code). Pass the full specialist prompt from the core protocol. Run independent specialists in parallel by issuing multiple spawn calls in the same turn. The \`squad_state\` MCP server is loaded from \`.mcp.json\`.`,
  },
  claude: {
    summary: 'Claude Code Task subagent',
    section: `## Dispatch adapter: Claude Code

Spawn each specialist with the \`Task\` tool, using the matching subagent from \`.claude/agents/squad-<member>.md\` when present, otherwise a general-purpose subagent with the member charter inlined in the prompt. Launch independent \`Task\` calls in one message to run them in parallel. Subagents cannot spawn subagents, so only the coordinator dispatches. The \`squad_state\` MCP tools are available as \`mcp__squad_state__*\` from \`.mcp.json\`.`,
  },
  kiro: {
    summary: 'Kiro subagent + steering, MCP backend',
    section: `## Dispatch adapter: Kiro

Kiro loads this file as steering (\`inclusion: always\`). Delegate each specialist task to a Kiro subagent, inlining the member charter in the delegation prompt; when subagents are unavailable, adopt the member's charter in turn and state which member is acting. All shared state flows through the \`squad_state\` MCP server configured in \`.kiro/settings/mcp.json\`.`,
  },
  opencode: {
    summary: '@agent mention / task tool, MCP backend',
    section: `## Dispatch adapter: OpenCode

Invoke specialists with the \`task\` tool (or an \`@agent\` mention for agents defined in \`.opencode/agent/\`), inlining the member charter in the prompt. Independent tasks may run in parallel. The \`squad_state\` MCP server is configured under \`mcp.squad_state\` in \`opencode.json\`; its tools appear as \`squad_state_*\`.`,
  },
  cursor: {
    summary: 'Cursor subagent / composer, MCP backend',
    section: `## Dispatch adapter: Cursor

Delegate specialist work to Cursor subagents (\`.cursor/agents/\`) when available, otherwise in composer/agent turns that adopt the member charter explicitly. Inline the charter and task in every delegation. The \`squad_state\` MCP server is configured in \`.cursor/mcp.json\`.`,
  },
};

export function dispatchStrategy(client: ClientId): DispatchStrategy {
  return STRATEGIES[client];
}

/** Full coordinator instructions: host-agnostic core + the client's dispatch section. */
export function buildCoordinatorInstructions(client: ClientId, squadDir = '.squad'): string {
  const caps = CAPABILITIES[client];
  const transports = `## Transport\n\nThis host connects to the backend via: ${caps.transportModes.join(", ")} (subagents: ${caps.supportsSubagents ? "yes" : "no"}).\n`;
  return `${coreCoordinatorProtocol(squadDir)}\n${STRATEGIES[client].section}\n\n${transports}`;
}
