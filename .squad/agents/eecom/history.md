# EECOM

> Environmental, Electrical, and Consumables Manager

## Learnings

### CLI Entry Point Architecture
cli-entry.ts is the central router for ~30+ CLI commands using dynamic imports (lazy-loading). Commands are routed via if-else blocks. Has a recurring "unwired command" bug class — implementations exist in cli/commands/ but aren't routed in cli-entry.ts. The cli-command-wiring.test.ts regression test catches this by verifying every .ts file in cli/commands/ is imported.

### ESM Runtime Patch
Module._resolveFilename interceptor in cli-entry.ts (lines 47-54) patches broken ESM import in @github/copilot-sdk@0.1.32 (vscode-jsonrpc/node missing .js extension). Required for Node 24+ strict ESM enforcement. Works on npx cache hits where postinstall scripts don't run.

### Lazy Import Pattern
All command imports use `await import('./cli/commands/xxx.js')` to minimize startup time. Copilot SDK is lazily loaded only when shell is invoked. All .js extensions required for Node 24+ strict ESM.

### CLI Packaging & Distribution
`npm pack` produces a complete, installable tarball (~275KB packed, 1.2MB unpacked). Package includes dist/, templates/, scripts/, README.md per package.json "files" field. Postinstall script (patch-esm-imports.mjs) patches @github/copilot-sdk for Node 24+ compatibility. Tarball can be installed locally (`npm install ./tarball.tgz`) and commands execute via `node node_modules/@bradygaster/squad-cli/dist/cli-entry.js`. Both squad-cli and squad-sdk must be installed together — cli depends on sdk with "*" version specifier. All 27+ CLI commands are lazy-loaded at runtime; `--help` validates command routing without executing full logic.

### Packaging Smoke Test Strategy
test/cli-packaging-smoke.test.ts validates the packaged artifact (not source). Uses npm pack + install in temp dir + command routing verification. Commands are expected to fail (no .squad/ dir) — test verifies routing only (no "Unknown command", no MODULE_NOT_FOUND for the command itself). Exception: node-pty is an optional dependency for the `start` command and MODULE_NOT_FOUND for node-pty is allowed. Windows cleanup requires retry logic due to EBUSY errors — use rmSync with maxRetries + retryDelay options, wrap in try/catch to fail silently since tests have passed.

### v0.8.24 Release Readiness Audit
CLI completeness audit (2026-03-08) confirmed: 26 primary commands routed in cli-entry.ts, all present in smoke test. 4 aliases (watch→triage, workstreams→subsquads, remote-control→rc, streams→subsquads). 3 aliases tested, 1 untested ("streams"). Packaging verified: dist/, templates/, scripts/, README.md in tarball; bin entry points to dist/cli-entry.js; postinstall script included and working. All 32 smoke tests pass. Package.json files array correct. npm pack output shows 318 files, 275KB packed. No missing command implementations. Optional dep (node-pty) handled correctly. Only gap: "streams" alias not in smoke test (routed correctly but test coverage incomplete). Confidence: 95% — all critical paths covered, minor alias test gap non-blocking.

📌 **Team update (2026-03-08T21:18:00Z):** FIDO + EECOM released unanimous GO verdict for v0.8.24. Smoke test approved as release gate. FIDO confirmed 32/32 pass + publish.yml wired correctly. EECOM confirmed 26/26 commands + packaging complete (minor gap: "streams" alias untested, non-blocking).

### Cross-Platform Filename and Config Fixes (#348, #356) (2026-03-15T05:30:00Z)

**Context:** Two cross-platform bugs broke Squad on Windows: (1) log filenames contained colons in ISO 8601 timestamps (illegal on Windows), (2) `.squad/config.json` contained absolute machine-specific `teamRoot` path.

**Investigation:**
- Searched SDK for all timestamp usage in filenames — found `safeTimestamp()` utility already existed but wasn't consistently used
- `comms-file-log.ts` (line 32) used inline `toISOString().replace(/:/g, '-')` instead of utility
- `init.ts` (line 612) wrote absolute `teamRoot` to config.json on every init
- Session-store already used `safeTimestamp()` correctly (line 71)

**Fixes:**
1. **Bug #348:** Updated `comms-file-log.ts` to import and use `safeTimestamp()` utility instead of inline timestamp formatting
2. **Bug #356:** Removed `teamRoot` field from config.json (can be computed at runtime via `git rev-parse --show-toplevel`)
3. Updated live `.squad/config.json` in repo to remove machine-specific path

**Pattern:** Centralized timestamp formatting in `safeTimestamp()` utility (replaces colons + truncates milliseconds). Windows-safe format: `2026-03-15T05-30-00Z` instead of `2026-03-15T05:30:00.123Z`.

**Test Impact:** All 150 tests pass. Communication adapter test doesn't validate specific filename format (structural test, not behavioral).

**PR:** #404 opened targeting dev.

### CastingEngine CLI Integration (#342) (2026-03-15T11:20:00Z)

**Context:** CastingEngine class (Issue #138, M3-2) existed in SDK with curated universe templates (The Usual Suspects, Ocean's Eleven) but was completely bypassed during `squad init`. LLM picked arbitrary names, and charter generation used regex-based `personalityForRole()` instead of template backstories.

**Investigation:**
- CastingEngine.castTeam() was never called in CLI flow
- coordinator.ts buildInitModePrompt() let LLM pick any universe without guidance
- cast.ts generateCharter() used fallback personality logic instead of engine data
- SDK exports two AgentRole types: broad one in casting-engine.ts, restrictive one in runtime/constants.ts

**Integration Strategy (Augment, Not Replace):**
- LLM still proposes roles and team composition (the beloved casting experience)
- CastingEngine augments with curated names when universe is recognized
- Mapping: "The Usual Suspects" → 'usual-suspects', "Ocean's Eleven" → 'oceans-eleven'
- Unrecognized universes (Matrix, Alien, etc.) preserve LLM's arbitrary names

**Implementation:**
1. Added `augmentWithCastingEngine()` in cast.ts to replace LLM names with engine characters
2. Updated coordinator prompt to suggest preferred universes (Usual Suspects, Ocean's Eleven)
3. Extended `generateCharter()` to use engine personalities/backstories when available
4. Attached `_personality` and `_backstory` to CastMember objects for charter generation
5. Role mapping: CLI role strings → engine AgentRole enum (lead, developer, tester, etc.)

**Type Import Pattern:**
- Import CastingEngine from `@bradygaster/squad-sdk/casting` (not main barrel export)
- Use casting-engine.ts AgentRole type (9 roles) not runtime/constants.ts (6 roles)
- Partial mapping: unmapped roles log warning and skip engine casting

**Tests:**
- Created test/casting-engine-integration.test.ts (5 tests, all pass)
- Validates augmentation for both universes, case-insensitive matching, fallback behavior
- All 45 existing cast-parser/casting tests still pass

**PR:** #417 opened targeting dev.

### Adoption Tracking Tier 1 Implementation (2026-03-10)
Implemented Flight's privacy-first adoption monitoring strategy on PR #326 branch. Moved `.squad/adoption/` → `.github/adoption/` for better GitHub integration. Stripped tracking.md to aggregate-only metrics (removed all individual repo names/URLs). Updated GitHub Action workflow (adoption-report.yml) and monitoring script (scripts/adoption-monitor.mjs) to write reports to `.github/adoption/reports/`. Removed "Built with Squad" showcase link from README.md (deferred to Tier 2 opt-in feature). This honors the principle: collect aggregate metrics via public APIs, but never publish individual repo lists without explicit consent. Test discipline: verified npm run build passes; docs-build.test.ts passed structure tests (Astro build failure unrelated to changes). Committed with clear message explaining privacy rationale.

📌 **Team update (2026-03-10T12-55-49Z):** Adoption tracking Tier 1 complete and merged to decisions.md. Privacy-first architecture confirmed: aggregate metrics only, opt-in for individual repos, public showcase only when 5+ projects opt in. Append-only file governance enforced (no deletions in history.md or decisions.md). Microsoft ampersand style guide adopted for documentation.
