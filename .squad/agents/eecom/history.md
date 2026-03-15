# EECOM

## Core Context

CLI entry point (cli-entry.ts) routes ~30+ commands using dynamic imports for lazy-loading. The cli-command-wiring.test.ts regression test verifies every .ts file in cli/commands/ is imported, preventing "unwired command" bugs.

## Patterns

**ESM runtime patch:** Module._resolveFilename interceptor patches broken ESM import in @github/copilot-sdk@0.1.32 (vscode-jsonrpc/node missing .js extension). Required for Node 24+ strict ESM enforcement. Works on npx cache hits where postinstall scripts don't run.

**Lazy import pattern:** All command imports use `await import('./cli/commands/xxx.js')` to minimize startup time. All .js extensions required for Node 24+ strict ESM.

**CLI packaging:** `npm pack` produces complete, installable tarball (~275KB packed, 1.2MB unpacked). Package includes dist/, templates/, scripts/, README.md per package.json "files" field. Postinstall script (patch-esm-imports.mjs) patches @github/copilot-sdk for Node 24+ compatibility.

**Packaging smoke test:** test/cli-packaging-smoke.test.ts validates the packaged artifact (not source). Uses npm pack + install in temp dir + command routing verification. Windows cleanup requires retry logic due to EBUSY errors.

**Cross-platform fixes:** Timestamp formatting uses safeTimestamp() utility (replaces colons with hyphens for Windows). teamRoot field removed from config.json to prevent baking absolute paths.
