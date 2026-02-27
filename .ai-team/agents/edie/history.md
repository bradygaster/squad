# Edie — TypeScript Engineer

## Core Context
- **Project:** Squad — AI agent teams for GitHub Copilot
- **Owner:** Brady (bradygaster)
- **Stack:** TypeScript, Node.js ≥20, ESM, @github/copilot-sdk
- **Focus:** Replatforming Squad from prompt-only architecture to Copilot SDK runtime
- **New repo:** C:\src\squad-sdk (bradygaster/squad-pr on GitHub)
- **Language decision:** TypeScript locked in (unanimous team recommendation)
- **Key PRDs:** 1 (SDK Runtime), 2 (Tools), 3 (Hooks), 4 (Agent Lifecycle), 5 (Coordinator)
- **Key directives:** Single .squad/ directory, global install, agent repositories, zero-config

## Learnings
- Joined 2026-02-20 as part of the replatform recruitment wave
- Squad's current implementation is in index.js (vanilla Node.js) — being rebuilt in TypeScript
- Copilot SDK is at C:\src\copilot-sdk — TypeScript, ESM, Node.js ≥20
- squad-sdk repo already has typed stubs in src/ — client/, tools/, hooks/, agents/, coordinator/, casting/, ralph/
- 14 PRDs define the full replatform plan, stored at C:\src\squad\.ai-team\docs\prds\

### SDK Type System Deep Dive (2026-02-20)
- SDK has `strict: true`, exactly one `any` (in `SessionConfig.tools` — correctly annotated), zero `as unknown`/`@ts-ignore`
- `SessionEvent` is a ~700-line discriminated union (35+ event types) generated from JSON schema — the star type
- `SessionEventPayload<T>` uses `Extract<SessionEvent, { type: T }>` for narrowed typed event handlers
- `defineTool<T>()` uses `ZodSchema<T>` phantom type (`_output: T`) for generic inference from Zod schemas to handlers
- Generated RPC layer (`createServerRpc`, `createSessionRpc`) uses `Omit<Params, "sessionId">` for session-scoped method signatures
- SDK uses `vscode-jsonrpc` which returns untyped responses — all `sendRequest()` calls require `as` casts in client.ts
- SDK tsconfig lacks `noUncheckedIndexedAccess` and uses legacy `moduleResolution: "node"` (esbuild does actual bundling)
- Hook system has per-hook-type Input/Output interfaces — fully typed, no generic `Function` types
- `MCPServerConfig` is a discriminated union: `MCPLocalServerConfig | MCPRemoteServerConfig`
- SDK depends on Zod v4.x (`^4.3.6`) — we need to match this version exactly
- No branded/nominal types for IDs (sessionId, toolCallId, messageId all plain `string`)
- No custom error hierarchy — all errors are plain `Error` with string messages

### Squad Stub Alignment Issues Found (2026-02-20)
- Our `CustomAgentConfig.displayName`/`description` are required but SDK has them optional
- Our `McpServerConfig` is `{ command, args?, env? }` — missing remote server support and required `tools` field
- `ToolRegistry` uses `Map<string, unknown>` — should be `Map<string, Tool<any>>`
- `SquadEvent.payload` is `unknown` — should be a discriminated union per event type
- Hook types add `agentName` not in SDK — need adapter layer to bridge
- `@types/node` version mismatch: ours `^22`, SDK has `^25`
- Missing `zod` dependency in squad-sdk package.json (needed for PRD 2)
- Missing `noUncheckedIndexedAccess: true` in our tsconfig

## Recent Updates
### Template Migration for PRD 16 (2026-02-20)
- Copied 34 template files from beta repo (C:\src\squad\templates\) to squad-sdk repo
- Includes squad.agent.md coordinator prompt, workflows, casting data, template files
- Created `src/cli/core/templates.ts` with TypeScript manifest
- Manifest categorizes files: squad-owned (overwriteOnUpgrade: true) vs user-owned (false)
- Squad-owned: coordinator, workflows, casting system, template files
- User-owned: ceremonies.md, routing.md, identity/, agent-specific files
- Exported via cli/index.ts barrel, build verified
- PR #172 created: https://github.com/bradygaster/squad-pr/pull/172

### PRD 17: Upgrade Command (2026-02-21)
- Implemented full upgrade command from beta CLI (1,500+ LOC port)
- Created `src/cli/core/upgrade.ts` — main upgrade logic with version comparison
- Created `src/cli/core/migrations.ts` — version-based additive migration runner
- Created `src/cli/core/email-scrub.ts` — PII cleanup utility (scrubs email addresses)
- Created `src/cli/core/migrate-directory.ts` — .ai-team/ → .squad/ migration
- Zero-dep implementation using Node.js stdlib only (fs, path)
- Squad-owned file overwrite (uses TEMPLATE_MANIFEST.overwriteOnUpgrade flags)
- Project-type detection (npm/go/python/java/dotnet/unknown)
- Workflow generation (project-type-aware stubs for non-npm projects)
- Version stamping on squad.agent.md (HTML comment + Identity section)
- Migration registry: v0.2.0 (skills/), v0.4.0 (plugins/), v0.5.0 (email scrub)
- --migrate-directory flag: renames .ai-team/ → .squad/, updates .gitattributes/.gitignore
- Wired into CLI router (src/index.ts) — async main() function
- Fixed type conflicts between cli/core/upgrade.ts and cli/upgrade.ts (SDK stub)
- Fixed stampVersion export conflict (build/versioning.ts vs cli/core/version.ts)
- Build passes, tests pass (43/43 in cli.test.ts, 2 unrelated failures elsewhere)
- PR #174 created: https://github.com/bradygaster/squad-pr/pull/174
