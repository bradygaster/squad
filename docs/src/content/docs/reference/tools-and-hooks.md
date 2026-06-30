# Custom Tools & Hooks Guide
Squad ships with 5 built-in tools and a hook pipeline for policy enforcement. This guide covers extending both.
---
## ToolRegistry API
`ToolRegistry` manages tool definitions. Each tool has a name, JSON schema, and async handler:
```typescript
import { ToolRegistry, defineTool } from '@bradygaster/squad-sdk';
const registry = new ToolRegistry();
const myTool = defineTool({
  name: 'search-docs',
  description: 'Search internal documentation',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  handler: async (params) => {
    const results = await searchIndex(params.query);
    return { success: true, data: results };
  },
});
registry.register(myTool);
```
The handler returns a `ToolResult` with `success` flag and `data` payload.
**Built-in tools:**
| Tool | Purpose |
|------|---------|
| `route` | Dispatch to another agent |
| `decision` | Record a team decision |
| `memory` | Agent history |
| `status` | Session pool query |
| `skill` | Read/write skills |
---
## HookPipeline
`HookPipeline` intercepts tool calls at two points: before execution (`PreToolUseHook`) and after (`PostToolUseHook`). Hooks return a `HookAction`: `allow`, `block`, or `modify`.
```typescript
import { HookPipeline, PreToolUseHook } from '@bradygaster/squad-sdk';
const auditHook: PreToolUseHook = async (toolName, params, context) => {
  console.log(`Agent ${context.agentId} calling ${toolName}`);
  return { action: 'allow' };
};
const pipeline = new HookPipeline();
pipeline.addPreHook(auditHook);
```
---
## Writing Custom Hooks
Custom hooks receive the tool name, parameters, and agent context. Use them for logging, validation, or transformation:
```typescript
const sanitizeHook: PreToolUseHook = async (toolName, params, context) => {
  if (toolName === 'shell' && params.command.includes('rm -rf')) {
    return { action: 'block', reason: 'Destructive command blocked' };
  }
  return { action: 'allow' };
};
```
Post-tool hooks inspect results and can trigger follow-up actions like notifications or audit logging.
---
## Built-in Policies
Squad ships 5 policies configured via `PolicyConfig`:
1. **ReviewerLockoutHook** — Agents cannot edit files they are reviewing
2. **File guards** — Restrict write access to sensitive paths
3. **Shell restrictions** — Block dangerous shell commands
4. **Rate limits** — Cap tool invocations per agent per interval
5. **PII filters** — Redact sensitive data before model calls
Configure policies in `squad.config.ts` under the `hooks` key:
```typescript
export default defineConfig({
  hooks: {
    fileGuards: [{ pattern: /\.env/, action: 'block' }],
    shellRestrictions: { allowList: ['git', 'npm', 'node'] },
    rateLimits: { maxCallsPerMinute: 30 },
  },
});
```
---
## See Also
- [SDK API Reference](api-reference.md) — Full type and function reference
- [Integration Guide](integration.md) — Connecting to the Copilot SDK
- [Config Reference](config.md) — Configuration file options
