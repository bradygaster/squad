---
"@bradygaster/squad-sdk": patch
---

fix(sdk): normalize dotted ToolRegistry names at Copilot external-tool boundary

Squad's ToolRegistry uses canonical dotted names (e.g. `memory.classify`) but the
Copilot SDK CLI server enforces `^[a-zA-Z0-9_-]+$` on external tool names, rejecting
dots. This caused `createSession({ tools: registry.getTools() })` to fail.

Adds `normalizeToolNameForCopilot()` and `normalizeToolsInConfig()` at the adapter
boundary to convert dots to underscores before forwarding to the SDK. Hook callbacks
(`onPreToolUse`/`onPostToolUse`) reverse-map wire names back to canonical so consumers
always receive `memory.classify`, not `memory_classify`. Both functions are exported
from `@bradygaster/squad-sdk/client` for consumer use.
