📌 Team update (2026-03-05T22:46:00Z): Azure Function samples require \main\ field and build step — decided by Fenster
# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

---

## 📌 Phase 1 — 2026-03-05T21:37:09Z

**Fenster's Phase 1 SDK-First Work Complete.** Built `squad build` CLI command (Phase 1 scope: validation-only, not generation). Command supports `--check`, `--dry-run`, `--watch`. Works with `SquadSDKConfig` from builders. Generated files stamped with HTML headers. Wired into cli-entry.ts.

**Team Context:**
- **Keaton:** Phase 1 scoping — markdown as source of truth, TS as typed facade. Use runtime/config.ts types.
- **Edie:** Built builders. 8 functions with runtime validation, zero new deps.
- **Hockney:** 60 tests (36 builders, 24 CLI). All passing. Stubs documented.
- **Kujan:** OTel readiness ✅ — all 8 modules compile. Phase 3 unblocked.
- **Verbal:** Coordinator updated for SDK mode detection.

All Phase 1 decisions merged to decisions.md. Ready for Phase 2-4.

---

## Core Context

**Created:** 2026-02-21  
**Role:** Core Developer — Runtime implementation, CLI structure, shell infrastructure  
**Key Decisions Owned:** Test import patterns (vitest via dist/), CRLF normalization at parser entry, shell module structure (readline→ink progression), spawn lifecycle, SessionRegistry design

**Phase 1-2 Complete (2026-02-21 → 2026-02-22T041800Z):**
- M3 Resolution (#210/#211): `resolveSquad()` + `resolveGlobalSquadPath()` in src/resolution.ts, standalone concerns (no auto-fallback)
- CLI: --global flag routing, `squad status` command composition, command rename finalized (triage, loop, hire)
- Shell foundation: readline-based CLI shell, SessionRegistry (Map-backed, no persistence), spawn infrastructure (loadAgentCharter, buildAgentPrompt, spawnAgent)
- CRLF hardening: normalize-eol.ts applied to 8 parsers, one-line guard at entry point
- SDK/CLI split executed: 15 dirs + 4 files migrated to packages/, exports map updated (7→18 subpaths SDK, 14 subpaths CLI), 6 config files fixed, versions aligned to 0.8.0
- Test import migration: 56 test files migrated from ../src/ to @bradygaster/squad-sdk/* and @bradygaster/squad-cli/*, 26 SDK + 16 CLI subpath exports, vitest resolves via dist/, all 1719+ tests passing

### 📌 Team update (2026-02-22T10:03Z): PR #300 architecture review completed — REQUEST CHANGES verdict with 4 blockers (proposal doc, type safety on castingPolicy, missing sanitization, ambiguous .ai-team/ fallback) — decided by Keaton
- Zero-dependency scaffolding preserved, strict mode enforced, build clean (tsc 0 errors)

**Phase 3 Blocking (2026-02-22 onwards):**
- Ralph start(): EventBus subscription + health checks (14 TODOs)
- Coordinator initialize()/route(): CopilotClient wiring + agent manager (13 TODOs)
- Agents spawn(): SDK session creation + history injection (14 TODOs)
- Shell UI: Ink components not yet wired (readline only), streaming responses, agent status display
- Casting: registry.json parsing stub (1 TODO)
- Triage/Loop/Hire: placeholder commands (low priority, defer)

## 2026-03-02: Squad Aspire Timeline & Deprecation Archaeology

**Requested by:** Brady. "What happened to squad aspire? When did we deprecate it, and why?"

**Task:** Complete git archaeology — all commits, PRs, issues, branches, deprecation markers, blog posts.

**Findings:**

**Timeline:**
- **2026-02-22 (~c1d5c7c→992763e):** Feature introduced. PR #265 added `squad aspire` command (Issue #265) as the CLI entry point to launch .NET Aspire dashboard for Squad observability. Core file: `packages/squad-cli/src/cli/commands/aspire.ts` (175 lines).
- **2026-02-22 (PR #307):** OTel Phase 4 consolidation — aspire command + file watcher + event payloads merged.
- **2026-02-22 (PR #309):** Wave 2 merge added Aspire Playwright E2E tests, validating aspire.ts as a tested feature.
- **2026-02-25 onwards:** Multiple PRs (PR #539, #540, #546, #533) reference aspire in docs + help text — still treated as stable command.
- **Latest commit (c1d5c7c, Mar 2026):** `fix: make sendAndWait timeout configurable (#347)` — aspire tests still passing.

**Deprecation Status:**
- ❌ **NO git commits mentioning removal/deprecation** — searched `--all-match --grep="remove.*aspire|aspire.*remove|deprecat.*aspire|aspire.*deprecat"` — zero results.
- ❌ **NO GitHub issues labeled "aspire" requesting removal** — all open/closed issues show aspire as stable, documented feature.
- ❌ **NO GitHub PRs with deprecation plan** — PR #265 (aspire intro), PR #307 (OTel Phase 4), PR #309 (Wave 2) all finalize aspire as shipped feature.
- ❌ **NO deprecation markers in code** — aspire.ts has no @deprecated JSDoc, no console.warn(), no alpha/beta flag.
- ❌ **NO "planned removal" documentation** — docs/scenarios/aspire-dashboard.md (full guide, no sunset date), blog post 014-wave-1-otel-and-aspire.md (celebrates it as Wave 1 feature).

**Current Status:**
- ✅ **Fully wired:** Command routing at cli-entry.ts:822-829, help text at lines 396-416.
- ✅ **Documented:** Help text ("Launch Aspire Dashboard"), per-command help, scenario docs, blog post.
- ✅ **Tested:** Three test suites (aspire-command.test.ts, aspire-integration.test.ts, cli/aspire.test.ts) with passing tests.
- ✅ **Active:** Latest commit (Mar 2) touches related test infrastructure; aspire command is a dependency for observability workflows.

**Conclusion:** Squad aspire was **NEVER deprecated**. It is an actively maintained observability feature that shipped in Wave 1 (Feb 2026) and remains current and documented as of Mar 2026.

**Key Learning:** Aspire is not a transient feature or experiment—it's a core observability tool for multi-agent debugging. Wave 1 established it as stable; Wave 2 validated it with E2E tests. It's part of the "watching agents work" story alongside EventBus, OTel metrics, and SquadObserver.

### Connection promise dedup in SquadClient (2026-03-02)

**Task:** Fix race condition where concurrent `connect()` calls (eager warm-up + auto-cast) crash with "Connection already in progress" during `squad init "..."` with empty roster.

**Root cause:** `connect()` threw when `state === "connecting"` instead of letting callers share the in-flight connection promise.

**Fix:** Added `connectPromise: Promise<void> | null` field to `SquadClient`. When `connect()` is called and a connection is already in progress, it returns the existing promise instead of throwing. The promise is cleared on completion (success or failure), and also cleared in `disconnect()` / `forceDisconnect()`.

**Key decisions:**
- Promise dedup pattern: store the connection promise, return it to concurrent callers
- Span lifecycle: error status set inside the IIFE before `span.end()`, not in an outer catch after end
- `connectPromise` cleared in `disconnect()` and `forceDisconnect()` for clean state reset

**Files modified:** `packages/squad-sdk/src/adapter/client.ts`
**Verified:** Build clean (SDK + CLI).

### 📌 Team update (2026-03-01T20-24-57Z): CLI UI Polish PRD finalized — 20 issues created, team routing established
- **Status:** Completed — Parallel spawn of Redfoot (Design), Marquez (UX), Cheritto (TUI), Kovash (REPL), Keaton (Lead) for image review synthesis
- **Outcome:** Pragmatic alpha-first strategy adopted — fix P0 blockers + P1 quick wins, defer grand redesign to post-alpha
- **PRD location:** docs/prd-cli-ui-polish.md (authoritative reference for alpha-1 release)
- **Issues created:** GitHub #662–681 (20 discrete issues with priorities P0/P1/P2/P3, effort estimates, team routing)
- **Key decisions merged:**
  - Fenster: Cast confirmation required for freeform REPL casts
  - Kovash: ShellApi.setProcessing() exposed to prevent spinner bugs in async paths
  - Brady: Alpha shipment acceptable, experimental banner required, rotating spinner messages (every ~3s)
- **Timeline:** P0 (1-2 days) → P1 (2-3 days) → P2 (1 week) — alpha ship when P0+P1 complete
- **Session log:** .squad/log/2026-03-01T20-13-00Z-ui-polish-prd.md
- **Decision files merged to decisions.md:** keaton-prd-ui-polish.md, fenster-cast-confirmation-ux.md, kovash-processing-spinner.md, copilot directives

---

### 📌 PR #547 Review (2026-03-01) — External Contributor — Fenster
**Requested by:** Brady. Review "Squad Remote Control - PTY mirror + devtunnel for phone access" from tamirdresher.

**What It Does:**
- Adds `squad start --tunnel` command to run Copilot in a PTY and mirror terminal output over WebSocket + devtunnel
- Adds RemoteBridge (WebSocket server) that streams terminal sessions to a PWA (xterm.js) on phone/browser
- Uses Microsoft Dev Tunnels for authenticated relay (zero infrastructure)
- Bidirectional: phone keyboard input goes to Copilot stdin
- Session management dashboard (list/delete tunnels via `devtunnel list`)
- 18 tests (all failing due to export issues)

**Architecture:**
- **CLI commands:** `start.ts` (PTY+tunnel orchestration), `rc.ts` (bridge-only mode), `rc-tunnel.ts` (devtunnel lifecycle)
- **SDK bridge:** `packages/squad-sdk/src/remote/bridge.ts` (RemoteBridge class, WebSocket server, HTTP server, static file serving, sessions API)
- **Protocol:** `protocol.ts` (event serialization), `types.ts` (config types)
- **PWA UI:** `remote-ui/` (index.html, app.js, styles.css, manifest.json) — xterm.js terminal + session dashboard
- **Integration:** New `start` command in `cli-entry.ts` (lines 230-242)

**Dependencies Added:**
- `node-pty@1.1.0` — PTY for terminal mirroring (native addon, requires node-gyp)
- `ws@8.19.0` — WebSocket server (both CLI and SDK)
- `qrcode-terminal@0.12.0` — QR code display in terminal
- `@types/ws@8.18.1` (dev)

**Critical Issues — MUST FIX BEFORE MERGE:**

1. **Build broken (TypeScript errors):**
   - `start.ts:117` — Cannot find module 'node-pty' (missing in tsconfig paths or needs `@types/node-pty`)
   - `start.ts:177` — Binding element 'exitCode' implicitly has 'any' type (needs explicit type on `pty.onExit` callback)
   - **All 18 tests fail** due to RemoteBridge/protocol functions not being exported properly from SDK

2. **Security — Command Injection Risk (HIGH):**
   - `rc-tunnel.ts:47-49` — Uses `execFileSync` with string interpolation in `--labels` args. If `repo`, `branch`, or `machine` contain shell metacharacters, this is CWE-78. **MUST** pass label values as separate array elements without string interpolation.
   - `rc-tunnel.ts:62-64` — Same issue in `port create` command.
   - **Pattern violation:** Baer's decision (decisions.md) mandates `execFileSync` with array args, no string interpolation.

3. **Security — Environment Variable Blocklist (start.ts:135-148):**
   - Good defense-in-depth pattern (blocks `NODE_OPTIONS`, `LD_PRELOAD`, etc.) but **incomplete**.
   - Missing `PATH` restriction — allows PATH hijacking to inject malicious binaries.
   - Missing `HOME`/`USERPROFILE` restriction — allows access to dotfiles with secrets.
   - **Recommendation:** Explicitly allow-list safe vars (`TERM`, `LANG`, `TZ`, `COLORTERM`) instead of block-list. Current approach is fragile.

4. **Security — Hardcoded Path Assumption (Windows-only):**
   - `start.ts:119-122` and `rc.ts:184-188` — Hardcoded path `C:\ProgramData\global-npm\node_modules\@github\copilot\node_modules\@github\copilot-win32-x64\copilot.exe`.
   - This breaks on macOS/Linux (no fallback logic shown).
   - Cross-platform pattern should use `which copilot` or check `process.platform` and resolve from npm global dir programmatically.

5. **Rate Limiting — Weak HTTP Protection:**
   - `bridge.ts:94-106` — HTTP rate limit is 30 req/min per IP. WebSocket has per-connection limit but no global connection limit per IP.
   - **Attack vector:** Attacker can open 1000 WebSocket connections (each under rate limit) and DoS the bridge.
   - **Fix:** Add global connection limit per IP (e.g., max 3 concurrent WS connections per IP).

6. **Session Token Exposure:**
   - `start.ts:97-98` — Session token is appended to tunnel URL as query param and displayed in QR code + terminal output.
   - This token is logged to terminal history, potentially visible in screenshots, and sent over tunnel URL (visible in proxy logs).
   - **Better pattern:** Use the ticket exchange endpoint (`/api/auth/ticket`) instead — client POSTs token to get one-time ticket, uses ticket for WS connection.
   - **Why it matters:** Token has 4-hour TTL, ticket has 1-minute TTL. Reduces window for replay attacks.

7. **Audit Log Location:**
   - `bridge.ts:43` — Audit log goes to `~/.cli-tunnel/audit/`. This is not in `.squad/` directory.
   - **Inconsistency:** All Squad state is in `.squad/` (decisions.md), but audit logs are elsewhere.
   - **Recommendation:** Use `.squad/log/remote-audit-{timestamp}.jsonl` for consistency.

8. **Secret Redaction — Missing JWT Detection:**
   - `bridge.ts:377-393` — `redactSecrets()` has patterns for GitHub tokens, AWS keys, Bearer tokens, JWTs.
   - BUT: JWT regex `/eyJ.../` only matches base64 tokens. Doesn't catch Bearer-wrapped JWTs (`Bearer eyJ...`).
   - **Fix:** Combine patterns — check for `Bearer eyJ...` before stripping Bearer header.

9. **File Serving — Directory Traversal (Mitigated but Fragile):**
   - `start.ts:63-74` and `rc.ts:118-142` — Both implement directory traversal guards (`!filePath.startsWith(uiDir)`).
   - **Good:** Uses `path.resolve()` and prefix check.
   - **Fragile:** Relies on manual sanitization in multiple places. If one handler is added later without this pattern, vulnerability reintroduced.
   - **Recommendation:** Extract to shared `serveStaticFile(uiDir, req, res)` helper in SDK to enforce pattern.

10. **Test Failures — Export Configuration Broken:**
    - All 18 tests fail with "RemoteBridge is not a constructor" and "serializeEvent is not a function".
    - Root cause: `packages/squad-sdk/src/remote/index.ts` exports `RemoteBridge` from `./bridge.js` but `bridge.ts` may not be built or exported correctly.
    - **Build error** (from `npm run build`): TypeScript errors in `start.ts` block CLI build, so SDK may not have rebuilt.
    - **Fix:** Resolve TypeScript errors, rebuild SDK, verify tests pass.

**Non-Critical Issues:**

11. **node-pty Native Dependency:**
    - Requires node-gyp + C++ compiler on install. Will break in CI or Docker if build tools not installed.
    - **Mitigation:** Document in PR that `node-pty` requires native build, or consider optional dependency with graceful fallback.

12. **Windows-Centric Implementation:**
    - Most code assumes Windows (`C:\`, PowerShell paths, devtunnel CLI).
    - macOS/Linux support unclear. If intended as Windows-only, document clearly.

13. **Devtunnel Dependency:**
    - Requires `devtunnel` CLI installed + authenticated (`devtunnel user login`).
    - Not bundled, not auto-installed. User must manually install via `winget` or download.
    - **UX:** Should have better error message when devtunnel missing (currently just "⚠ devtunnel not installed" without link to install instructions).

14. **Passthrough Mode vs. PTY Mode:**
    - `rc.ts` spawns `copilot --acp` and pipes JSON-RPC (passthrough mode).
    - `start.ts` spawns Copilot in PTY and sends raw terminal bytes (PTY mode).
    - Two separate code paths for essentially the same feature. **Why not unify?**
    - If PTY mode is better (full TUI experience), deprecate `rc.ts`. If ACP passthrough is needed for API access, document the use case split.

**Integration with Existing CLI:**
- ✅ Command routing in `cli-entry.ts` follows existing pattern (dynamic import, options parsing)
- ✅ Help text added (lines 65-69)
- ✅ Flag passthrough works (`--yolo`, `--model`, etc. passed to Copilot)
- ❌ No integration with existing squad commands (`squad status`, `squad loop`, etc.) — isolated feature
- ❌ No integration with EventBus or Coordinator — doesn't participate in Squad agent orchestration

**Recommendation:**
- **DO NOT MERGE** until critical issues fixed (build errors, command injection, test failures).
- **After fixes:** This is a cool demo feature but needs architectural discussion:
  1. Is remote access in scope for Squad v1? (Not in any PRD I've seen.)
  2. Should this be a plugin or core feature?
  3. Native dependency (node-pty) adds install complexity — is that acceptable?
  4. Windows-only (effectively) — acceptable?
  5. Devtunnel dependency — acceptable external requirement?

**If Brady approves the concept:**
- Merge only after all security issues fixed + tests passing + cross-platform support clarified.
- Document clearly: experimental feature, Windows-only (if true), requires devtunnel CLI.
- Consider renaming `start` command to `squad remote` or `squad tunnel` to avoid confusion with future `squad start` (which might mean "start the squad daemon").

**Decision File Needed:**
- This introduces a new CLI command paradigm (interactive terminal mirroring vs. agent orchestration). Needs a decision: "Remote access via devtunnel is Squad's mobile UX strategy" or "This is an experimental plugin".


### 📌 Multi-Squad Phase 1: Core SDK + Config + Migration (PR #691, Issue #652)
**Requested by:** Brady. Implement foundational layer for multiple personal squads.

**What was built:**
- New module: `packages/squad-sdk/src/multi-squad.ts` — 7 exported functions + 3 types
- `getSquadRoot()` delegates to existing `resolveGlobalSquadPath()` for platform detection
- `resolveSquadPath(name?)` implements 5-step resolution chain: explicit → env → config → default → legacy
- `listSquads()`, `createSquad()`, `deleteSquad()`, `switchSquad()` — full CRUD for squad registry
- `migrateIfNeeded()` — non-destructive: registers legacy `~/.squad` as "default" in `squads.json`, never moves files
- Types `SquadEntry`, `MultiSquadConfig`, `SquadInfo` exported from SDK barrel + types.ts
- squads.json lives at global config root (`%APPDATA%/squad/` on Windows, `~/.config/squad/` on Linux)

**Key design choices:**
- Migration is registration-only. Files stay where they are. This avoids data loss risk on first upgrade.
- `deleteSquad()` blocks deletion of the active squad (safety valve).
- `resolveSquadPath()` calls `migrateIfNeeded()` on every invocation — idempotent, returns fast after first run.
- Re-used `resolveGlobalSquadPath()` from resolution.ts rather than duplicating platform logic.

**What's NOT included (Phase 2):**
- No CLI commands (`squad list`, `squad create`, `squad switch`, etc.)
- No changes to CLI entry point or existing resolution chain

**Verification:** tsc --noEmit clean. vitest run: 3217 passed, 126 failed (all pre-existing).

---

## 2025-07: cli.js shim replacement

**Task:** Replace the stale ~2000-line bundled `cli.js` with a thin ESM shim that forwards to the built CLI at `packages/squad-cli/dist/cli-entry.js`.

**What changed:**
- `cli.js` reduced from 1982 lines to 14 lines
- Shim imports `./packages/squad-cli/dist/cli-entry.js` which auto-executes `main()`
- Deprecation notice only shows when invoked via npm/npx (checks `process.env.npm_execpath`), silent for `node cli.js`

**Why:** The bundled cli.js was from the old GitHub-native distribution and was missing commands added after the monorepo migration (e.g., `aspire`). Running `node cli.js aspire` failed. Now it forwards to the real CLI entry point.

**Verification:** `node cli.js aspire --help` works. `node cli.js help` shows all commands. Test suite: 3333 passed, 10 failed (all pre-existing).

### 📌 Team update (2026-03-02T23:50:00Z): Knock-knock sample modernization complete
- **Status:** Completed — Fenster rewrote samples/knock-knock with production Copilot SDK patterns
- **Work:** SquadClientWithPool implementation, streaming deltas, system prompts, Dockerfile multi-stage build
- **Files updated:** samples/knock-knock/index.ts (rewritten), Dockerfile (production build), samples/README.md (integration examples)
- **Pattern established:** Connection pooling as reference implementation for SDK users
- **Session log:** `.squad/log/2026-03-02T23-50-00Z-migration-v060-knock-knock.md`

## Learnings

- Root package.json has `"type": "module"` — bare `import` works in cli.js (no dynamic import needed)
- `packages/squad-cli/dist/cli-entry.js` auto-executes `main().catch(...)` at module level — importing it is sufficient to run the CLI
- `process.env.npm_execpath` is set when running via npm/npx but absent for direct `node` invocation — good signal for conditional deprecation notices
- **2026-03-03:** Wired `squad nap` command into CLI entry point (cli-entry.ts lines 245-254). Full implementation existed in nap.ts (runNap, runNapSync, formatNapReport) and REPL already had `/nap` working. CLI was missing the routing — added flag parsing (--deep, --dry-run), squadRoot resolution via resolveSquad(), async runNap() call, formatNapReport() output. Help text and docs/reference/cli.md updated. TypeScript build verified clean.

- **2026-03-07 (Issue #190):** Fixed all `.squad-templates/` → `.squad/templates/` path references across source code (init.ts, migrate-directory.ts, cli-entry.ts), workflow templates (squad-heartbeat.yml, squad-promote.yml), and ralph-triage.js. Updated all 4 copies of each synced file (templates/, packages/squad-cli/templates/, .squad-templates/, .github/workflows/). Promote workflows: removed `.squad-templates/` from forbidden-path patterns since templates now nest under `.squad/` which is already stripped. TypeScript compiles clean.

### 2026-03-03: History Audit & Correction Pattern

**Context:** Brady requested correction of Kobayashi's history.md due to factual errors about version targets (v0.6.0 vs v0.8.17) and missing documentation of PR #582 GitHub merge failure.

**Pattern established:** When correcting history files:
1. **Never delete** — History is evidence, not fiction. Preserve what was attempted, even if wrong.
2. **Annotate inline** — Add `**[CORRECTED: actual truth]**` markers next to erroneous text
3. **Add Correction Log** — Append section documenting what was corrected, why, and verification of current state
4. **Explain the failure** — Future spawns need to understand WHY the mistake happened to avoid repeating it

**Key insight:** History file errors are data integrity bugs. If a spawn reads "Brady decided v0.6.0" when Brady actually decided v0.8.17, the spawn will propagate that error into code/docs. Corrections prevent error loops.

**Files corrected:**
- `.squad/agents/kobayashi/history.md` — 3 sections corrected (v0.6.0 references), 1 section added (PR #582 GitHub failure), Correction Log appended
- `.squad/decisions/inbox/fenster-kobayashi-history-corrections.md` — Decision documenting the corrections and audit findings

---

## 2025-07: Knock-Knock Multi-Agent Sample

**Requested by:** Brady. Create the simplest possible multi-agent sample: two agents trading knock-knock jokes in Docker, demonstrating Squad SDK patterns without requiring Copilot auth.

**What was built (INITIAL VERSION):** `samples/knock-knock/` — 6 files, ~200 lines total:
- `index.ts`: CastingEngine to cast 2 agents, StreamingPipeline for token-by-token output, 12 hardcoded jokes, infinite loop
- `package.json`, `tsconfig.json`: Minimal Node/TS config matching other samples
- `Dockerfile`: Multi-stage build, copies monorepo context for local SDK dependency resolution
- `docker-compose.yml`: Single service, runs the sample
- `README.md`: Quick start guide

**Key SDK patterns demonstrated:**
1. **CastingEngine.castTeam()** — Cast from "usual-suspects" universe with required roles
2. **StreamingPipeline** — Simulated token-by-token streaming via `onDelta()` callback
3. **Demo mode** — Hardcoded responses (no live Copilot connection) for Docker-friendly demos
4. **Session attachment** — `pipeline.attachToSession()` for each agent

**Design constraint: SIMPLEST POSSIBLE.** No EventBus complexity, no SquadClientWithPool, no real Copilot auth. Just casting + streaming + simulated jokes. Perfect for first-time users.

**Verification:** TypeScript compiles clean, sample runs locally, outputs joke exchange with emoji and streaming delays.

**🔴 STATUS UPDATE [CORRECTED]:** This initial version was **REJECTED by Brady** ("it doesn't look like it's using any type of LLM or copilot functionality"). See section "## 2025-07: Knock-Knock Sample Rewrite — Real LLM Integration" (line 341) for the superseding implementation that uses real Copilot sessions with SquadClientWithPool.

## Learnings

- StreamingPipeline's `onDelta()` is the core pattern for rendering agent output — accumulate or stream directly to stdout
- Simulated streaming (demo mode) is essential for Docker samples where GitHub auth isn't available
- The `file:../../packages/squad-sdk` dependency pattern in samples allows testing SDK changes without publishing
- Multi-stage Dockerfile needed: builder stage copies monorepo workspace structure to resolve local dependencies, production stage copies built artifacts


---

## 2025-07: Fix semver prerelease format in bump-build (#692)

**Task:** `scripts/bump-build.mjs` produced invalid semver like `0.8.16.1-preview` (build number before prerelease tag). Fixed to produce `0.8.16-preview.1` (build as dot-separated prerelease identifier, per semver spec).

**What changed:**
- `parseVersion` split into two regex paths: prerelease-first (`1.2.3-tag.N`) and non-prerelease (`1.2.3.N`)
- `formatVersion` places build number after the prerelease tag when one exists
- All 5 tests updated to use new format, all passing

## Learnings

- Semver prerelease identifiers are dot-separated after the hyphen: `1.2.3-preview.1` is valid, `1.2.3.1-preview` is not
- The bump-build test suite copies the real script to a temp dir and patches `__dirname` — any regex changes must not break the patching mechanism

---

## 2025-07: Knock-Knock Sample Rewrite — Real LLM Integration

**Requested by:** Brady. Rewrite `samples/knock-knock/index.ts` to use REAL Copilot sessions instead of hardcoded jokes. Original version rejected because "it doesn't look like it's using any type of LLM or copilot functionality."

**What changed:** `samples/knock-knock/` completely rewritten (~190 lines):
- **SquadClientWithPool integration**: Real GitHub Copilot connection with `GITHUB_TOKEN` auth
- **Live LLM sessions**: Two Copilot sessions with distinct system prompts (Teller generates jokes, Responder plays audience)
- **StreamingPipeline + message_delta**: Pattern from `streaming-chat` — register delta listener, feed to pipeline, capture full response
- **Graceful auth errors**: Clear error messages if `GITHUB_TOKEN` missing/invalid, no stack traces
- **Infinite joke loop**: Agents swap roles after each joke, LLM generates unique jokes every time
- **docker-compose.yml**: Added `GITHUB_TOKEN=${GITHUB_TOKEN}` environment variable
- **README.md**: Rewritten to document GITHUB_TOKEN requirement, setup instructions, Docker usage

**Key SDK patterns demonstrated:**
1. **SquadClientWithPool**: Connect with GitHub token, create/resume sessions
2. **CastingEngine**: Cast two agents (unchanged pattern)
3. **StreamingPipeline**: Token-by-token streaming from live LLM (not simulated)
4. **Session management**: Creating sessions with system prompts, resuming, registering delta handlers
5. **sendAndWait with fallback**: `session.sendAndWait()` with optional fallback to `sendMessage()`

**Architecture:**
- Two sessions created with different system prompts defining agent personas
- `sendAndCapture()` helper: registers delta handler, sends prompt, captures full response text
- Role swap: agents alternate between Teller and Responder after each joke
- Streaming output: delta events piped to StreamingPipeline → stdout

**Verification:** TypeScript compiles clean (`tsc --noEmit` passes).

## Learnings

- Real LLM integration pattern: SquadClientWithPool → createSession with systemPrompt → resumeSession → register message_delta handler → sendAndWait → capture response
- System prompts define agent personas — Teller generates jokes, Responder plays natural audience role
- `sendAndWait()` may be optional on session interface — use conditional check with fallback to `sendMessage()`
- Auth error UX: check `GITHUB_TOKEN` before connecting, provide actionable error with setup instructions
- Captured response text enables inter-agent conversation — Teller's joke becomes Responder's input

---

## 2025-07: Rock-Paper-Scissors Multi-Agent Arena

**Requested by:** Brady. Create `samples/rock-paper-scissors/index.ts` — multi-player RPS tournament with real Copilot sessions.

**What was built:** `samples/rock-paper-scissors/index.ts` (~430 lines):
- **Multi-session management:** Creates one session per player (7 players) + scorekeeper (8 total)
- **Match pairing logic:** Cycles through all pairings (player[i] vs player[j]) to avoid immediate rematches
- **Concurrent move collection:** `Promise.all([getPlayerMove(A), getPlayerMove(B)])` for parallel LLM calls
- **Context-aware prompting:** The Learner receives opponent history (last 5 moves) in prompt
- **Scorekeeper streaming:** Uses StreamingPipeline for token-by-token commentary on match results
- **Leaderboard tracking:** Internal stats (W/L/D), sorted display every 10 matches, scorekeeper commentary
- **Move parsing:** Extracts "rock"/"paper"/"scissors" from LLM response, takes last occurrence to handle reasoning + answer
- **Graceful forfeits:** If move unparseable, treat as forfeit and log warning
- **Console formatting:** Banner, player roster with emoji, match announcements, leaderboard display

**Architecture patterns:**
- `PlayerInfo` extends `PlayerStrategy` (imported from prompts.ts) with session state
- `MatchHistory` tracks opponent move sequences per pairing (for The Learner's context)
- `playMatch()` orchestrates single match: get moves → determine winner → update stats → announce result
- `getPlayerMove()` handles context injection for The Learner vs. simple "What do you throw?" for others
- `parseMove()` robust parsing: finds all rock/paper/scissors in response, returns last one
- `announceResult()` and `printLeaderboard()` both use StreamingPipeline for scorekeeper commentary

**SDK patterns used:**
- SquadClientWithPool with GITHUB_TOKEN auth
- CastingEngine.castTeam() for player names (universe: usual-suspects)
- StreamingPipeline with onDelta() callback for stdout streaming
- Session creation with systemPrompt per player
- message_delta event handlers with conditional field access (deltaContent/delta/content)
- sendAndWait() with fallback to sendMessage() for compatibility

**Key design choices:**
- All pairings pre-computed and cycled to ensure fair distribution
- Parallel move collection reduces per-match latency
- Move history stored per pairing (not global) — important for The Learner's opponent modeling
- Scorekeeper commentary after every match + leaderboard keeps output engaging
- Parse move from last occurrence in response — handles LLM reasoning patterns ("I think... so I'll throw rock")

**Verification:** TypeScript compiles clean (tsc --noEmit expected to pass after prompts.ts exists).

## Learnings

📌 Team update (2026-03-05T01:21:00Z): Worktree-based parallelism and multi-repo support now documented in git-workflow skill — agents can now spawn in parallel across multiple worktrees for same-repo concurrent issues, or separate clones for cross-repo downstream work — decided by Kobayashi

- Multi-session management pattern: create all sessions upfront, store sessionIds in player state, resume per request
- Context injection for adaptive agents: The Learner gets opponent history, others get static prompts
- Parallel LLM calls via Promise.all() for concurrent player moves — reduces total latency
- Robust move parsing: search all occurrences, take last one — handles reasoning-then-answer LLM patterns
- Match pairing cycling: pre-compute all [i,j] pairs, cycle through them to avoid immediate rematches
- Scorekeeper as streaming agent: commentary adds narrative to the arena, StreamingPipeline makes it feel live

## 📌 Team Update (2026-03-03T00:00:50Z)

**Session:** RPS Sample Complete — Verbal, Fenster, Kujan, McManus collaboration

Multi-agent build of Rock-Paper-Scissors game with 10 AI strategies, Docker infrastructure, and full documentation. Fenster (Coordinator) identified and resolved 3 integration bugs (ID mismatch, move parsing, history semantics). Sample ready for use.

**Verification:** tsc --noEmit clean. vitest run: 3217 passed, 126 failed (all pre-existing).

---

## 2025-07: cli.js shim replacement

**Task:** Replace the stale ~2000-line bundled `cli.js` with a thin ESM shim that forwards to the built CLI at `packages/squad-cli/dist/cli-entry.js`.

**What changed:**
- `cli.js` reduced from 1982 lines to 14 lines
- Shim imports `./packages/squad-cli/dist/cli-entry.js` which auto-executes `main()`
- Deprecation notice only shows when invoked via npm/npx (checks `process.env.npm_execpath`), silent for `node cli.js`

**Why:** The bundled cli.js was from the old GitHub-native distribution and was missing commands added after the monorepo migration (e.g., `aspire`). Running `node cli.js aspire` failed. Now it forwards to the real CLI entry point.

**Verification:** `node cli.js aspire --help` works. `node cli.js help` shows all commands. Test suite: 3333 passed, 10 failed (all pre-existing).

## Learnings

- Root package.json has `"type": "module"` — bare `import` works in cli.js (no dynamic import needed)
- `packages/squad-cli/dist/cli-entry.js` auto-executes `main().catch(...)` at module level — importing it is sufficient to run the CLI
- `process.env.npm_execpath` is set when running via npm/npx but absent for direct `node` invocation — good signal for conditional deprecation notices

---

## 2025-07: Fix semver prerelease format in bump-build (#692)

**Task:** `scripts/bump-build.mjs` produced invalid semver like `0.8.16.1-preview` (build number before prerelease tag). Fixed to produce `0.8.16-preview.1` (build as dot-separated prerelease identifier, per semver spec).

**What changed:**
- `parseVersion` split into two regex paths: prerelease-first (`1.2.3-tag.N`) and non-prerelease (`1.2.3.N`)
- `formatVersion` places build number after the prerelease tag when one exists
- All 5 tests updated to use new format, all passing

## Learnings

- Semver prerelease identifiers are dot-separated after the hyphen: `1.2.3-preview.1` is valid, `1.2.3.1-preview` is not
- The bump-build test suite copies the real script to a temp dir and patches `__dirname` — any regex changes must not break the patching mechanism
### 2026-02-28 : Implement Phase 1 of Consult Mode
**PRD:** `.squad/identity/prd-consult-mode.md`
**Requested by:** James Sturtevant

Implemented Phase 1 of consult mode — allows personal squad to "consult" on external projects without polluting either side.

**Changes:**
1. **SDK resolution.ts:**
   - Added `consult?: boolean` field to `SquadDirConfig` interface
   - Made `loadDirConfig()` public and updated to parse consult field
   - Added `isConsultMode(config)` helper function

2. **SDK index.ts:**
   - Exported `loadDirConfig` and `isConsultMode` from resolution module

3. **CLI commands/consult.ts (new):**
   - `squad consult` — creates `.squad/` with `consult: true`, points to personal squad
   - `--status` — shows current consult mode status
   - `--check` — dry-run preview of what would happen
   - Uses `git rev-parse --git-path info/exclude` for worktree/submodule compatibility
   - Adds `.squad/` to `.git/info/exclude` (git-internal, never committed)

4. **CLI cli-entry.ts:**
   - Registered `consult` command in routing
   - Added help text for `--help` flag
   - Added to main help output under Team Management

**Pattern followed:** `init-remote.ts` and `link.ts` for command structure. Dynamic import pattern for lazy loading.

**Learning:** The `.git/info/exclude` approach is perfect for invisibility — it's git-internal and never shows up in diffs or status. Using `git rev-parse --git-path` is essential for worktrees/submodules where `.git` is a file, not a directory.

**Next:** Phase 2 will add `squad extract` for bringing learnings back to personal squad.

---

## 📋 History Audit — 2026-03-03 (Fenster Self-Review)

**Context:** Brady requested team-wide history audits per the pattern in `.squad/skills/history-hygiene/SKILL.md`. Each agent audits their own history.md for conflicting entries, stale decisions, v0.6.0 references, intermediate states, and confusing entries.

**Audit Process:**
1. ✅ Checked for v0.6.0 migration target references (should be v0.8.17)
   - Found 3 references on lines 278, 286, 289 — all in the "2026-03-03: History Audit & Correction Pattern" section
   - **Verdict:** These are NOT errors in Fenster's history. They accurately document Brady's request to audit Kobayashi's history (which had v0.6.0 errors).

2. ✅ Checked for conflicting entries
   - Found knock-knock sample described twice: initial version (lines 294-313) and rewrite version (lines 341-351)
   - **Issue identified:** Initial version section didn't note it was rejected and superseded by the Real LLM Integration rewrite
   - **Fix applied:** Added [CORRECTED] annotation on line 313 noting "This initial version was REJECTED by Brady"

3. ✅ Checked for stale decisions
   - No stale or reversed decisions found. Team decisions are accurately reflected.

4. ✅ Checked for intermediate states recorded as final
   - Found one: knock-knock initial version (hardcoded jokes, no Copilot auth) was presented as complete without noting it was rejected
   - **Fix applied:** Added cross-reference to superseding version

5. ✅ Checked for confusing entries that would trouble a future spawn
   - File chronology is somewhat non-linear (2025-07 sections interspersed with 2026-03 entries) but this appears intentional based on task structure, not an error

**Corrections Made:**
- 1 inline [CORRECTED] annotation added (line 313) to knock-knock initial version section

**Verification:**
- All version references accurate (no v0.6.0 as migration target)
- All completed tasks documented with final outcomes, not intermediate requests
- No contradictory statements about what was shipped vs. rejected

**Result: CLEAN** (1 correction made for clarity, no data integrity issues)

---

### 2026-03-XX: Fix Missing Barrel Exports in squad-sdk index.ts
**Requested by:** Brady

The CLI couldn't run because `packages/squad-sdk/src/index.ts` was missing re-exports for symbols the CLI imports: `safeTimestamp`, `initSquadTelemetry`, `TIMEOUTS`, `recordAgentSpawn`, `recordAgentDuration`, `recordAgentError`, `recordAgentDestroy`, `getMeter`, and `RuntimeEventBus`.

**Changes (1 file, 7 insertions):**
- Added named exports for `MODELS`, `TIMEOUTS`, `AGENT_ROLES` from `runtime/constants.js` (used named instead of wildcard to avoid `AgentRole` collision with `casting/index.js`)
- Added `export *` for `runtime/otel-init.js` and `runtime/otel-metrics.js`
- Added named exports `getMeter`, `getTracer` from `runtime/otel.js` (wildcard would leak internal OTel types)
- Added `safeTimestamp` from `utils/safe-timestamp.js`
- Added `EventBus as RuntimeEventBus` alias from `runtime/event-bus.js`

**Verification:** `tsc --noEmit` passes clean for squad-sdk. Full build shows only pre-existing squad-cli errors (node-pty, rc.ts, consult mode symbols).

## Learnings

- Wildcard `export *` from `runtime/constants.js` causes TS2308 collision with `AgentRole` already exported from `casting/index.js` — use named exports when barrel already re-exports a module with overlapping symbol names
- Only use named exports for `otel.ts` to avoid leaking internal OTel SDK types into the public API surface

## Learnings
- Issue #188: doctor.ts existed at cli/commands/doctor.ts with full implementation (runDoctor, doctorCommand exports) but was never wired into cli-entry.ts command routing. Two additions needed: help text line + lazy-import route block before the Unknown command fatal. Docs already had the command listed. Always check CLI routing when adding new command files.


📌 Team update (2026-03-04T17:52:00Z): Migration docs file-safety guidance added — doctor command now live in CLI (fixes #188) — decided by Keaton, implemented by McManus

### 2026-03-05: Branching model implementation
- Created git-workflow skill file for 3-branch model (dev/insiders/main)
- Updated Kobayashi charter with branching rules
- Updated team.md with @copilot git workflow instructions
- Key: Skill file is the single source of truth — coordinator loads it and injects into spawn prompts
- Decision: `release` branch dropped per Keaton's recommendation (YAGNI pre-1.0)

---

### 2026-03-05: Workflow Filter Implementation Review (PR #201)

**Context:** Issue #201 changed `packages/squad-sdk/src/config/init.ts` to filter workflow installation to only Squad-framework workflows (4 files) instead of copying all workflows from templates/.

**Changes reviewed:**
- Added `FRAMEWORK_WORKFLOWS` constant (4 filenames: squad-heartbeat.yml, squad-issue-assign.yml, squad-triage.yml, sync-squad-labels.yml)
- Renamed `workflowFiles` → `allWorkflowFiles` in read step
- Filtered with `allWorkflowFiles.filter(f => FRAMEWORK_WORKFLOWS.includes(f))`
- Tests updated in `test/workflows.test.js` to validate framework workflows installed, CI/CD workflows excluded

**Implementation assessment:**
✅ Core logic sound — read all `.yml` → filter to framework → copy filtered list  
✅ Variable rename clean and semantically correct throughout loop  
✅ `Array.includes()` appropriate for 4-item array (no perf concern, matches existing patterns at lines 744, 768)  
✅ Edge cases handled gracefully:
  - Missing template files: silently skipped (no error, operates on disk-present files)
  - `skipExisting: true` applies correctly (filter happens before copy loop)
  - CLI layer has no bypass mechanism (filtering is SDK-internal, correct separation)
✅ Constant placement discoverable (module-scope, well-commented, before `initSquad()`)  
✅ No other callers to update (workflow logic self-contained in `includeWorkflows` block)  
✅ Tests updated correctly (validates framework installed, CI/CD excluded)

**Verdict:** APPROVED

**Minor observation:** Missing template file handling is acceptable but could be improved — if a file in `FRAMEWORK_WORKFLOWS` doesn't exist in templates/, it's silently skipped with no warning. Not a blocker, but future enhancement could log warning.

## Learnings

- For small constant arrays (≤5 items), `Array.includes()` is idiomatic and performs equivalently to `Set.has()` — prefer readability over premature optimization
- When filtering file lists before copy loops, operate on the disk-present files first (`readdirSync` → filter extensions → filter whitelist) — this makes missing template files self-healing (no error thrown)
- Workflow installation in init.ts is self-contained in the `includeWorkflows` block — SDK layer controls filtering, CLI layer only gates the feature on/off

📌 Team update (2026-03-05T10-35-50Z): PR #201 workflow filter approved by all reviewers — framework/scaffolding distinction, implementation pattern validated, test coverage noted — decided by Keaton, Fenster, Hockney, Edie

## 2026-03-05: PR #201 Implementation Review

**Task:** PR readiness review for issue #201 workflow filtering implementation.

**Implementation verified:**

✅ **FRAMEWORK_WORKFLOWS constant** (lines 446-451 in init.ts):
  - Correctly placed at module scope, well-commented
  - Contains exactly 4 framework workflows: heartbeat, issue-assign, triage, sync-labels
  - Declaration before `initSquad()` function — discoverable and maintainable

✅ **Filter logic** (lines 817-818):
  - Two-stage filter: `allWorkflowFiles` (all .yml) → `workflowFiles` (framework only)
  - Variable naming is clear and intentional
  - Pattern: `allWorkflowFiles.filter(f => FRAMEWORK_WORKFLOWS.includes(f))`

✅ **Edge case handling**:
  - If FRAMEWORK_WORKFLOWS file doesn't exist in templates/: silently skipped (operates on intersection)
  - This is acceptable — missing templates won't crash init, just fewer workflows installed
  - Could log warning in future enhancement, but not a blocker

✅ **includeWorkflows: true** confirmed in CLI init.ts (line 114) — no bypass paths

✅ **Upgrade gap acknowledged**:
  - templates.ts shows all 12 workflows in manifest
  - Upgrade command copies all 12 (lines 413-420 in upgrade.ts)
  - Acceptable to leave for follow-up — existing projects already have workflows

✅ **No other copy sites** — grep confirms workflow copying only in init.ts (SDK) and upgrade.ts (CLI)

**Verdict:** Implementation is solid. No concerns.

## 2026-03-06: squad build CLI command (Issue #194)

**Task:** Implement `squad build` — the bridge that compiles TypeScript squad definitions (SquadSDKConfig) into .squad/ markdown.

**Implementation:**
- Created `packages/squad-cli/src/cli/commands/build.ts`
- Config loading: discovers `squad/index.ts` > `squad.config.ts` > `squad.config.js` via dynamic import
- Generates: team.md, routing.md, agents/*/charter.md, ceremonies.md
- Stamps all generated files with `<!-- generated by squad build — do not edit -->` header
- Protected files (decisions.md, history.md, orchestration-log/) are NEVER touched
- Flags: --check (drift detection, exit 1 on mismatch), --dry-run (preview), --watch (stub for now)
- Wired into cli-entry.ts alongside existing commands
- Uses SquadSDKConfig from builders/types.ts (not the runtime SquadConfig)

## Learnings

- Two SquadConfig types exist: `config/schema.ts` (simple, has `team/agents/ceremonies`) and `runtime/config.ts` (full runtime, has `models.defaultModel`). The builders `SquadSDKConfig` from `builders/types.ts` is the correct type for SDK-first mode — it has `TeamDefinition`, `AgentDefinition`, `RoutingDefinition`, `CeremonyDefinition`.
- Config loading pattern: the existing `loadConfig()` in `runtime/config.ts` accepts `module.default || module.squadConfig`. Build command also accepts `module.config` for ergonomic default exports.
- Generated markdown format should match the test expectations in `test/build-command.test.ts` which has its own stub generators — when replacing stubs with real imports, align on content structure.

- Azure Functions v4 model for Node.js uses pp.http() registration with HttpRequest/HttpResponseInit types from @azure/functions. When running outside the Functions runtime (e.g., 
px tsx), it logs a test-mode warning but still validates config — useful for dry-run testing.
- Sample pattern: existing samples use ile:../../packages/squad-sdk for local SDK dependency, 	ype: module in package.json, and NodeNext module resolution. New samples should follow this exact pattern.
- The SDK builders (defineSquad, defineTeam, defineAgent, defineRouting) are imported from @bradygaster/squad-sdk/builders — the subpath export, not the barrel. This is the SDK-First pattern for programmatic config.

📌 Team update (2026-03-05T22-10-00Z): Azure Function sample implementation complete. samples/azure-function-squad/ (7 files, ~200 LOC). Dry-run flag added for validation. Foundation for future serverless variants. — decided by Fenster

## Learnings

- Azure Functions v4 Node.js programming model **requires** `"main"` in package.json to point to the compiled JS file containing `app.http()` registration. Without it, the runtime silently fails to discover functions → "No job functions found" error.
- For TypeScript Azure Functions: always add a `build` step (`tsc`) and ensure `main` points to `dist/` output (e.g., `"main": "dist/functions/squad-prompt.js"`). The `start` script should chain build + func start: `npm run build && func start`.
- A `prestart:func` npm script ensures `func start` always gets fresh compiled JS, preventing stale-build confusion.

📌 Team update (2026-03-06): Fixed Azure Function sample — added missing `main` field to package.json, updated `start` script to build-then-run, added build documentation to README. Root cause was runtime couldn't discover function registration without `main` pointing to compiled output. — decided by Fenster

