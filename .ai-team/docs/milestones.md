# Squad SDK Replatform — Milestones & Work Items

**Owner:** Keaton (Lead)  
**Requested by:** Brady  
**Status:** Planning Gate (Implementation begins after approval)  
**Created:** 2026-02-21  
**Version:** 1.0 (Final Planning)

---

## Executive Summary

Squad's SDK replatform is organized into **6 milestones** spanning **3 phases** over approximately **21–32 weeks**. Each milestone represents a shippable increment with clear dependencies, exit criteria, and owner accountability.

**Critical Path:** M0 → M1 → M2 → {M3, M4, M5 in parallel} → M6

- **M0: Foundation** (Weeks 1–4) — TypeScript project, SDK adapter, session management
- **M1: Core Runtime** (Weeks 3–9) — Custom tools, policy hooks, coordinator replatform, agent lifecycle
- **M2: Configuration & Initialization** (Weeks 5–12) — Config-driven architecture, init migration, team loading
- **M3: Feature Parity** (Weeks 10–18) — All current features working in SDK runtime, migration registry
- **M4: Distribution** (Weeks 19–26) — Packaging, install/update mechanisms, npm bundling
- **M5: Agent Repository** (Weeks 22–32) — Import/export, marketplace, remote agent resolution
- **M6: Polish & Launch** (Weeks 28–32) — Docs, demos, migration guide, v0.6.0 release

---

## Milestone Breakdown

### **M0: Foundation — TypeScript Project Setup & SDK Integration**

**Phase:** 1 (Core)  
**Duration:** Weeks 1–4  
**Owner:** Fenster (Core Dev)  
**Depends On:** None  

#### Description

Establish the TypeScript project infrastructure alongside existing `index.js` installer. The foundation includes SDK connection management, adapter layer for breaking change isolation, session pool management, event infrastructure, and health monitoring. This milestone produces a working `SquadClient` wrapper that Squad code depends on (never on SDK types directly).

#### Work Items

| # | Title | PRD Ref | Details | Owner | Est. Effort |
|---|-------|---------|---------|-------|-------------|
| M0-1 | TypeScript project structure & build setup | PRD 1 | Create `src/` directory, set up esbuild/tsc, npm scripts for build/test/watch. Add `@github/copilot-sdk` to package.json (exact version pin). | Fenster | 2d |
| M0-2 | SDK adapter layer (types) | PRD 1 | Implement `src/adapter/types.ts` with Squad-stable interfaces: `SquadSessionConfig`, `SquadSession`, `SquadSessionHooks`, `SquadMCPServerConfig`. Detach Squad from SDK types. | Fenster | 3d |
| M0-3 | SquadClient wrapper | PRD 1 | Implement `src/adapter/client.ts` — wraps `CopilotClient`, manages connection lifecycle, error recovery, automatic reconnection, protocol version validation (`sdkProtocolVersion`). | Fenster | 4d |
| M0-4 | Session pool manager | PRD 1 | Implement `src/runtime/session-pool.ts` — create, track, resume, list, delete agent sessions. Per-agent session isolation. Persistent registry in `.squad/.cache/sessions.json`. | Fenster | 4d |
| M0-5 | Event bus & lifecycle events | PRD 1 | Implement `src/runtime/event-bus.ts` — cross-session event aggregation. Events: `session:created`, `session:idle`, `session:error`, `session:destroyed`. All components subscribe. | Fenster | 3d |
| M0-6 | Error hierarchy & telemetry | PRD 1 | Implement `src/adapter/errors.ts` — SDK-specific errors wrapped in Squad exceptions with context. Add basic telemetry hooks (latency tracking, error rates). | Fenster | 2d |
| M0-7 | Configuration loader (foundation) | PRD 1, 14 | Implement `src/runtime/config.ts` — loads `squad.config.ts` or `squad.config.json`. Validates schema, resolves model config, defines agent sources (foundation for PRD 15). Typed defaults. | Fenster | 3d |
| M0-8 | Health monitor & diagnostics | PRD 1 | Implement `src/runtime/health.ts` — monitors CopilotClient connection state, logs diagnostics on failure. Provides `check()` API for startup validation. | Fenster | 2d |
| M0-9 | SDK integration tests | PRD 1 | Write tests against real SDK (if available in CI) or mocks. Verify: connection lifecycle, session CRUD, event streaming, protocol version validation. Minimum 80% coverage on adapter layer. | Fenster | 4d |
| M0-10 | Documentation: SDK Integration Guide | PRD 1 | Write `.ai-team/docs/sdk-integration-guide.md` — explains adapter pattern, how Squad code depends on stable interfaces, how to upgrade SDK safely. | Fenster | 2d |
| M0-11 | Blog Post: Foundation Spike Results | McManus Strategy | Write internal tech post: "Building the Foundations — SDK Spike Results." Audience: team + SDK adopters. Topics: SDK architecture choices, why TypeScript, initial performance metrics. Published to `.ai-team/blog/`. | Verbal | 2d |
| M0-12 | Carry-forward Inventory: Foundation Learning | Cross-Cutting | Document what M0 team learns: SDK viability assessment, adapter pattern validation, session pool assumptions proven/disproven. Capture decisions made (PRD 1 viability criteria met). Record which agents (Fenster primarily) built what, and what patterns proved essential. Archive to `.ai-team/decisions/archive/`. | Keaton | 1d |

**Exit Criteria:**
- `SquadClient` initializes in < 2 seconds with real Copilot CLI connection
- `createSession()` + `sendAndWait()` round-trip completes deterministically
- Session pool persists and recovers across CLI restarts
- Event bus aggregates and fans out events correctly
- `npm run build` succeeds, TypeScript strict mode passes
- All tests pass (unit + integration vs. SDK)
- Brady approval before M1 begins

**Key Decisions / Knowns:**
- SDK is Technical Preview (v0.1.x). Version is pinned exactly in `package.json`
- Adapter pattern ensures Squad code never imports `@github/copilot-sdk` directly — only from `src/adapter/`
- AgentSource interface (PRD 15) is defined in M0-7 but `LocalAgentSource` implementation deferred to M2
- Configuration uses `squad.config.ts` (TypeScript) as primary, with `.json` fallback for customers who prefer it

---

### **M1: Core Runtime — Custom Tools, Hooks & Agent Session Lifecycle**

**Phase:** 1 (Core)  
**Duration:** Weeks 3–9 (overlaps with M0 final weeks, peaks Weeks 5–9)  
**Owner:** Fenster (M1-1,2,8,9), Baer (M1-3,4), Verbal (M1-5,6,7)  
**Depends On:** M0 (SquadClient, session pool, event bus, config)  

#### Description

Implement the SDK's custom tools (squad_route, squad_decide, squad_memory, squad_status), policy hooks (onPreToolUse, onPostToolUse) for governance and reviewer lockouts, and agent session lifecycle management (spawn → active → idle → cleanup). These components are independent layers that all feed into the coordinator replatform (PRD 5).

#### Work Items

| # | Title | PRD Ref | Details | Owner | Est. Effort |
|---|-------|---------|---------|-------|-------------|
| M1-1 | Custom tools API foundation | PRD 2 | Implement `src/tools/index.ts` — tool registry, tool registration, type definitions. Set up SDK hooks integration. | Fenster | 3d |
| M1-2 | squad_route tool | PRD 2 | Implement deterministic routing tool. Inputs: user message, agent roster, routing rules. Output: selected agent(s) + tier. Handles ambiguous cases via routing.json LLM fallback. | Fenster | 4d |
| M1-3 | squad_decide tool | PRD 2 | Implement decision capture tool. Writes to `.squad/decisions/inbox/{uuid}.md` with problem/solution/trade-offs structure. Returns confirmation + decision ID. Replaces file-write conventions. | Baer | 3d |
| M1-4 | squad_memory & squad_status tools | PRD 2 | Implement memory (read/write agent history shadows), status (report progress, token tracking, session metrics). Both expose SDK session metadata to agents. | Baer | 3d |
| M1-5 | Hooks & policy enforcement layer | PRD 3 | Implement `src/runtime/hooks.ts` — onPreToolUse/onPostToolUse handlers. Enforce: reviewer lockout protocol, PII rules (email scrubbing), file-write authorization (Source of Truth per agent). | Baer | 5d |
| M1-6 | Reviewer lockout protocol (via hooks) | PRD 3 | Enforce: Baer (Security) cannot write decisions, cannot spawn other agents, cannot access certain tools. Semantic check: detect if tool call violates policy. Non-blocking error with clear message. | Baer | 2d |
| M1-7 | Agent session lifecycle implementation | PRD 4 | Implement `src/runtime/agent-lifecycle.ts` — agent spawn (charter compilation to `CustomAgentConfig`), session pooling, persistent workspace setup, history shadow creation (for remote agents), session cleanup on idle. | Verbal | 5d |
| M1-8 | Charter compilation to CustomAgentConfig | PRD 4 | Implement charter markdown → `CustomAgentConfig` transformation. Inputs: `{name}/charter.md`, team.md, routing.md, decisions.md. Output: typed `CustomAgentConfig` object ready for SDK session. | Verbal | 4d |
| M1-9 | Per-agent model selection (4-layer priority) | PRD 4 | Implement model resolution: (1) charter override, (2) agent config, (3) registry, (4) auto-select. Fallback chains per tier. Preserves existing system. | Verbal | 3d |
| M1-10 | Parallel fan-out session spawning | PRD 5 | Implement background agent spawning. Multiple agents created in parallel (async batch), events aggregated by coordinator. Replaces prompt-based task call fan-out. | Fenster | 3d |
| M1-11 | Session history shadows for remote agents | PRD 7, 15 | When importing agents (PRD 15), create local history shadow at `.squad/agents/{name}/history.md` to capture project-specific learnings. Separate from portable agent definition. | Verbal | 2d |
| M1-12 | Integration tests: tools + hooks + lifecycle | PRD 2, 3, 4 | Test tool execution, hook enforcement, session creation, lifecycle. Verify custom tools work end-to-end with hooks. Minimum 75% coverage. | Fenster | 4d |
| M1-13 | Documentation: Custom Tools & Hooks Guide | PRD 2, 3 | Write docs explaining tool contract, hook points, governance model. Examples: routing decisions, policy enforcement. Includes troubleshooting. | Verbal | 2d |
| M1-14 | Blog Post: Agent Lifecycle Redesigned | McManus Strategy (Week 8) | Write post: "Agent Lifecycle Redesigned — how v1 agents run differently, benefits." Audience: current Squad users. Content: reliability, session recovery, isolation improvements. v1-content: true. | Verbal | 2d |
| M1-15 | Carry-forward Inventory: Core Runtime Learning | Cross-Cutting | Document M1 learnings: which tools proved essential, hook patterns that work, session lifecycle gotchas. Record agent contributions (Fenster on tools, Baer on hooks, Verbal on lifecycle). Note patterns for v1 SDK agents. | Keaton | 1d |

**Exit Criteria:**
- All 4 custom tools execute correctly and return expected values
- Hooks enforce reviewer lockouts and PII rules without breaking normal workflow
- Agent sessions spawn in parallel and complete without interference
- Charter compilation produces valid `CustomAgentConfig` objects
- Per-agent model selection resolves correctly for all 4 priority tiers
- Tests pass (tools, hooks, lifecycle at 75%+ coverage)
- Policy enforcement logs clear diagnostic messages when violations occur
- Ready for M2 (coordinator integration)

**Key Decisions / Knowns:**
- Tools are synchronous helpers, not user-visible. They augment the coordinator's decision-making, not replace it.
- Hooks execute before tool execution, blocking on policy violations (non-blocking error UX).
- Remote agent history shadows (M1-11) require AgentSource abstraction (PRD 15) to be designed in M0-7.
- Model selection preserves all 4 tiers and fallback chains from current system.

---

### **M2: Configuration & Initialization — Config-Driven Architecture**

**Phase:** 1 (Core) / 2 (transition)  
**Duration:** Weeks 5–12 (overlaps M0/M1 final weeks, peaks Weeks 8–12)  
**Owner:** Keaton (M2-1,7,11), Fenster (M2-2,3,4,8,9), Verbal (M2-6,10)  
**Depends On:** M0 (config loader), M1 (tools, hooks, lifecycle)  

#### Description

Extract all customizable behavior from prompt into config files (JSON/YAML). Define the Squad configuration schema, implement config loading and validation, create the init flow for new users, and handle migration from current markdown-based configuration to structured config.

#### Work Items

| # | Title | PRD Ref | Details | Owner | Est. Effort |
|---|-------|---------|---------|-------|-------------|
| M2-1 | Squad configuration schema (squad.config.ts) | PRD 14, PRD 5 | Define TypeScript schema: `agentSources[]`, `models`, `routing`, `hooks`, `tools`, `mcp`. JSON/YAML-compatible. Includes validation + defaults. Generate from TypeScript for full type safety. | Keaton | 4d |
| M2-2 | Configuration loader & validator | PRD 14 | Implement config loading pipeline: detect `squad.config.ts` or `.json`, parse, validate against schema, apply defaults, return typed config object. Fast-fail on schema errors with helpful messages. | Fenster | 3d |
| M2-3 | Routing configuration migration | PRD 5, 14 | Convert `routing.md` (markdown) → `routing` section in `squad.config.ts`. Deterministic and LLM-based routing rules both supported. Validate no loss of logic. | Fenster | 3d |
| M2-4 | Model configuration & registry | PRD 4, 14 | Restructure model selection config. Define per-agent model overrides, tier-based fallback chains, global defaults. All in `squad.config.ts`. | Fenster | 2d |
| M2-5 | Agent source registry (AgentSource interface) | PRD 15 | Implement agent source configuration. `agentSources[]` in config defines which sources to check and in what order. First-listed source wins on name collision. Foundation for multi-source agent loading. | Keaton | 3d |
| M2-6 | Squad init replatform (new user experience) | PRD 14 | Redesign `squad init` flow: (1) Team name/members, (2) Agent roles (predefined vs. custom), (3) Routing preferences, (4) Config generation. Creates minimal `.squad/` with `squad.config.ts` + agent charters, no bloat. | Verbal | 5d |
| M2-7 | Migration registry (versioned upgrades) | PRD 12, 14 | Implement migration framework: version-keyed upgrade functions. Supports: directory migrations (`.ai-team/` → `.squad/`), new file creation (skills/, plugins/), email scrubbing, config format changes. Atomic with rollback. | Keaton | 4d |
| M2-8 | LocalAgentSource implementation | PRD 15 | Implement first AgentSource: `LocalAgentSource` reads agents from `.squad/agents/{name}`. Integrates with config's `agentSources[]`. Returns `AgentManifest[]` + loads `CustomAgentConfig` on demand. | Fenster | 3d |
| M2-9 | Config-driven charter compilation | PRD 4, 5 | Refactor charter compilation (M1-8) to use typed config. Routing rules, model selection, casting behavior all sourced from `squad.config.ts`, not hardcoded. Enables runtime customization without rewriting TypeScript. | Fenster | 3d |
| M2-10 | Agent introduction & onboarding | PRD 4, 11 | Implement agent onboarding flow: charter read, history/decisions loaded, casting universe assigned. All driven by config, no hardcoded persona logic. Supports both local and remote agents. | Verbal | 3d |
| M2-11 | Configuration migration from markdown to typed config | PRD 14 | Write migration helper: parses `team.md`, `routing.md`, agent charters, generates equivalent `squad.config.ts`. Users review, validate, then old markdown files become reference docs only. | Keaton | 3d |
| M2-12 | squad.agent.md as reference doc (not runtime) | PRD 5, 14 | Mark squad.agent.md as "documentation only" post-migration. Include migration guide explaining which behaviors moved where (config vs. code vs. hooks). Explains customization paths. | Verbal | 2d |
| M2-13 | Integration tests: config loading & migration | PRD 14, 15 | Test config parsing, validation, migration pipeline. Verify: new init flow, config override, multi-source resolution, migration preserves user customizations. 70%+ coverage. | Fenster | 4d |
| M2-14 | Documentation: Configuration Guide | PRD 14, 15 | Write `.ai-team/docs/configuration-guide.md` — schema reference, customization examples, migration instructions, troubleshooting. | Keaton, Verbal | 3d |
| M2-15 | Blog Post: Configuring Your Squad in v1 | McManus Strategy (Week 12) | Write post: "Configuring Your Squad in v1 — new config.json, migration path." Audience: users ready to upgrade from v0.5.2. Content: step-by-step config migration, backward compat promise. v1-content: true. | Verbal | 2d |
| M2-16 | Carry-forward Inventory: Config Architecture Learning | Cross-Cutting | Document M2 learnings: config schema decisions, migration strategy effectiveness, agent source abstraction design. Record which agents shaped config design (Keaton on schema, Fenster on loading, Verbal on init flow). Archive patterns for future squads. | Keaton | 1d |

**Exit Criteria:**
- `squad.config.ts` schema is complete, typed, validated, documented
- Config loading pipeline works for TS and JSON variants
- New `squad init` flow is clean, interactive, creates minimal structure
- Migration registry handles atomic upgrades with rollback
- `LocalAgentSource` integrates with agent lifecycle
- All routing, model selection, charter compilation reads from config
- `squad.agent.md` is marked reference-only with clear migration guide
- Tests pass (config loading, init, migration at 70%+ coverage)
- Brady approval before M3 begins

**Key Decisions / Knowns:**
- Configuration is the primary customization surface post-migration. TypeScript code should NOT be modified by users.
- `squad.config.ts` is preferred (full TS type safety), JSON fallback for users who avoid TypeScript.
- Migration must be atomic — if fails halfway, user can roll back to previous version without data loss.
- AgentSource abstraction defined here (M2-5) enables multi-source resolution in M5 (agent repository).

---

### **M3: Feature Parity — All Current Features in SDK Runtime**

**Phase:** 2 (Extensions, begin after M1 M2 stable)  
**Duration:** Weeks 10–18 (parallel after M2)  
**Owner:** Fenster (M3-1,5,6), Verbal (M3-2,3,4), Kujan (M3-7)  
**Depends On:** M1 (tools, hooks, lifecycle), M2 (config, init)  

#### Description

Migrate all features currently in `squad.agent.md` to SDK runtime. This includes parallel agent execution, model fallback chains, direct responses (no spawning for simple queries), the casting system, skills migration, and the migration registry system that ensures smooth upgrades. Exit criterion: feature parity with v0.4.1.

#### Work Items

| # | Title | PRD Ref | Details | Owner | Est. Effort |
|---|-------|---------|---------|-------|-------------|
| M3-1 | Coordinator replatform (main coordinator logic) | PRD 5 | Implement primary coordinator in TypeScript. Takes user message, routes to agent(s), spawns sessions in parallel, listens to events, synthesizes final response. Replaces 32KB prompt orchestration with ~500 lines of code + config. | Fenster | 7d |
| M3-2 | Casting system v1 migration | PRD 11 | Migrate casting logic to TypeScript. Deterministic universe selection, name collision detection, overflow handling (diegetic/thematic/structural). Reads `squad.config.ts` casting rules. Replaces JSON file CRUD. | Verbal | 5d |
| M3-3 | Skills system migration | PRD 7 | Migrate skills from `.squad/skills/` directory to SDK `skillDirectories` config. Implement skill loading, confidence lifecycle (low→medium→high). SKILL.md format preserved but loaded by code, not LLM. | Verbal | 4d |
| M3-4 | Response tier selection (Direct/Lightweight/Standard/Full) | PRD 5 | Implement tier selection logic in coordinator. Deterministic rules for simple queries (Direct), token budget decisions (Lightweight vs Standard), special cases (Full). Maps to SDK session config. | Verbal | 3d |
| M3-5 | Model fallback chains & tier-based selection | PRD 4, 5 | Fully implement 4-tier model fallback: Premium (best) → Standard (good) → Fast (cheap) → Fallback (last resort). Per-agent overrides. Agent selection respects tier constraints. | Fenster | 3d |
| M3-6 | Direct responses (no-spawn path) | PRD 5 | Implement coordinator's direct response mode for simple queries (no agent spawn needed). Coordinator itself handles via LLM, not via agent session. Preserves token budget efficiency. | Fenster | 2d |
| M3-7 | Migration registry finalization | PRD 12 | Implement complete migration system. Supports: directory renames, new files, version stamping, email scrubbing, schema transformations. Each migration is atomic, reversible. | Kujan | 4d |
| M3-8 | Streaming event pipeline (foundation) | PRD 6 | Implement event aggregation from all sessions: token counts, tool executions, errors. Events piped to orchestration log (JSONL format). Foundation for M4 dashboard. | Kujan | 4d |
| M3-9 | Backwards compatibility: squad.agent.md reading (fallback) | PRD 5, 14 | Add fallback: if `squad.agent.md` exists and config doesn't, read identity + model preferences from old format for backward compatibility during transition period. | Fenster | 2d |
| M3-10 | Casting history + registry in config | PRD 11, 14 | Migrate casting registry to structured format. Implement O(1) collision detection via CastRegistry typed class. Store in `.squad/.cache/casting.json` (runtime) vs config (policy). | Verbal | 3d |
| M3-11 | Integration tests: feature parity | PRD 5, 7, 11 | Test all feature parity items: routing, parallel spawn, model selection, casting, skills, direct responses, migration. Compare output against v0.4.1 for regression. 80%+ coverage. | Fenster | 5d |
| M3-12 | Compatibility tests vs. v0.4.1 | PRD 5 | Create test suite: run identical scenarios (same team, same user input) against v0.4.1 coordinator and new SDK coordinator. Compare routing decisions, agent selections, response structure. Document any behavioral changes. | Fenster | 4d |
| M3-13 | Feature risk punch list (resolution) | Kujan's List | Address Kujan's 14 GRAVE items + 12 AT RISK items from feature risk punch list. Ensure every current feature has explicit coverage in this milestone or flagged as intentional drop. | Keaton | 3d |
| M3-14 | Documentation: Feature Migration Guide | PRD 5, 7, 11 | Write detailed guide explaining where each feature went: routing (config), casting (TypeScript), skills (config), model selection (config+code). Troubleshooting section for common regressions. | Verbal | 2d |
| M3-15 | Blog Post: Routing Redone — SDK-Native Policy Engine | McManus Strategy (Week 16) | Write post: "Routing Redone: SDK-native Policy Engine" — how SDK routing improves reliability vs. prompt-based routing. Audience: operators, team leads. v1-content: true. | Fenster | 2d |
| M3-16 | Blog Post: Squad Goes Universal — Multi-Language Support | McManus Strategy (Week 20) | Write post: "Squad Goes Universal" — multi-language support, project detection. Audience: non-Node.js users (Python, Go, .NET teams). v1-content: true. | Verbal | 2d |
| M3-17 | Carry-forward Inventory: Feature Parity Achievement | Cross-Cutting | Document M3 learnings: which features translated cleanly to SDK, which required design evolution, casting/skills patterns proven. Record agent contributions (Fenster on routing/coordinator, Verbal on casting/skills, Kujan on migration registry). Note technical decisions for v1 design. | Keaton | 1d |

**Exit Criteria:**
- Coordinator runs as TypeScript program on SDK, not as 32KB prompt
- All routing decisions identical to v0.4.1 within 95% accuracy
- Parallel agent spawning works correctly
- Casting system assigns names deterministically
- Model fallback chains resolve correctly
- Skills load and confidence tracking works
- Direct response mode handles simple queries
- Migration registry works (test with actual user repos)
- Tests pass (feature parity at 80%+ coverage)
- No regressions vs. v0.4.1 in critical path tests
- Brady approval on feature parity before M4 begins

**Key Decisions / Knowns:**
- Feature parity is target, not requirement. Some features may be intentionally replaced or enhanced (flagged in M3-13).
- v0.4.1 is the baseline. Any behavioral change must be documented and approved.
- Casting and skills move from file I/O to config + code. Performance should improve (fewer reads).
- Migration registry must handle both `.ai-team/` → `.squad/` AND user repos already using `.squad/`.

---

### **M4: Distribution & In-Copilot Install**

**Phase:** 2 (Extensions)  
**Duration:** Weeks 19–26 (after M3)  
**Owner:** Kujan (SDK Expert)  
**Depends On:** M1 (complete core), M3 (feature parity)  

#### Description

Package Squad as a single installable artifact. Implement install/update mechanisms, bundling strategy (embed SDK + templates + runtime), and distribution via npm + GitHub. Define how users install Squad inside Copilot and how `squad upgrade` works.

#### Work Items

| # | Title | PRD Ref | Details | Owner | Est. Effort |
|---|-------|---------|---------|-------|-------------|
| M4-1 | Bundle strategy & esbuild configuration | PRD 12, 14 | Define what ships with Squad: SDK, runtime TypeScript, templates, default charters. Bundle into single installable. esbuild config for tree-shaking, code splitting. Target bundle size ~5MB. | Kujan | 4d |
| M4-2 | npm bundling & npm registry publication | PRD 12 | Create npm package: name (`@bradygaster/squad` or `create-squad`), entry points (CLI bin), distribution to npmjs.com. Supports `npm install -g` and `npx create-squad`. | Kujan | 3d |
| M4-3 | GitHub distribution (npx github:bradygaster/squad) | PRD 12 | Maintain GitHub distribution as primary alias. Users can still run `npx github:bradygaster/squad` (no npm registry required). CI publishes tagged releases to both. | Kujan | 2d |
| M4-4 | squad upgrade command (self-update) | PRD 12, 14 | Implement `squad upgrade` — checks for new Squad version, downloads, applies migrations, validates, restarts. No breaking changes mid-upgrade. Supports rollback on failure. | Kujan | 4d |
| M4-5 | squad upgrade --sdk flag | PRD 20 (Q20) | Implement `squad upgrade --sdk` — upgrades pinned SDK version only. Tests suite against new version before commit. Validates compatibility. | Kujan | 3d |
| M4-6 | In-Copilot installation path | PRD 12 | Define how Squad installs/runs inside Copilot CLI and VS Code. Document: environment setup, CopilotClient initialization, session persistence across CLI restarts. | Kujan | 3d |
| M4-7 | Telemetry & update notifications | PRD 6, 12 | Implement: version check on CLI start (async, non-blocking), notification of available updates. Collect anonymized telemetry (runtime errors, feature usage) — opt-in during init. | Kujan | 3d |
| M4-8 | Copilot Extensions marketplace readiness | PRD 12 | Prepare Squad for Copilot Extensions marketplace submission (if applicable at v0.6.0). Document requirements, metadata, submission process. | Kujan | 2d |
| M4-9 | CI/CD pipeline for distribution | PRD 12 | Set up CI: build, test, bundle, publish. Triggers on version tag. Publishes to npm + GitHub simultaneously. Includes rollback procedure if publish fails. | Kujan | 4d |
| M4-10 | Version stamping & CHANGELOG | PRD 12 | Implement version stamping: written to package.json, `.squad/identity/version.txt`, squad.agent.md. CHANGELOG follows semver. Users see version on CLI start. | Kujan | 2d |
| M4-11 | Migration for install path changes | PRD 14 | If moving from GitHub-only to npm registry, implement seamless migration. Old `npx github:...` still works, points to npm registry. | Kujan | 2d |
| M4-12 | Download & install tests (real artifacts) | PRD 12 | Test suite: `npm install create-squad` → `npx create-squad` → init flow. `squad upgrade` → new version running. Test on real machines (macOS, Linux, Windows). | Kujan | 3d |
| M4-13 | Documentation: Installation & Distribution Guide | PRD 12, 14 | Write: installation methods (npm, GitHub, Copilot Extensions), `squad upgrade` process, troubleshooting. Include system requirements, bandwidth needs. | Kujan | 2d |
| M4-14 | Blog Post: How Squad Ships — Packaging & Distribution | McManus Strategy | Write post: "How Squad Ships" — bundling strategy, npm + GitHub dual distribution, upgrade mechanics. Audience: contributors, maintainers, users curious about internals. v1-content: true. | Kujan | 2d |
| M4-15 | Carry-forward Inventory: Distribution Validation | Cross-Cutting | Document M4 learnings: bundling strategy effectiveness, install path resilience, upgrade mechanism reliability. Record agent work (Kujan on all distro items). Note gotchas for future squads adopting distribution model. | Kujan | 1d |

**Exit Criteria:**
- Bundle size is ~5MB (lean target from Q30)
- Both npm and GitHub distribution work correctly
- `squad upgrade` applies migrations, validates, succeeds/rolls back cleanly
- `squad upgrade --sdk` works, validates SDK compatibility
- Version checks run async without blocking CLI
- CI/CD pipeline publishes to both npm + GitHub on tag
- Users can install via `npm install -g create-squad` or `npx create-squad`
- Users can install via `npx github:bradygaster/squad` (backward compat)
- In-Copilot initialization works (CLI and VS Code)
- Tests pass (real artifact downloads, installs, runs)
- Brady approval before M5 begins

**Key Decisions / Knowns:**
- npm registry is primary for new users; GitHub remains as alias for backward compatibility.
- SDK version is pinned exactly; users upgrade explicitly with `--sdk` flag.
- Bundle is single artifact — no separate downloads or dependencies required at runtime.
- Rollback on failed upgrade is automatic (previous version restored).

---

### **M5: Agent Repository — Import/Export & Marketplace**

**Phase:** 3 (Identity & Distribution, parallel with M4)  
**Duration:** Weeks 22–32 (overlaps M4, peaks Weeks 28–32)  
**Owner:** Fenster (M5-1,2,3,9), Verbal (M5-4,5,6), Kujan (M5-7,8)  
**Depends On:** M2 (AgentSource abstraction), M3 (feature parity)  

#### Description

Implement the agent repository system: export/import for portable squads, history splitting (portable vs. project-specific), remote agent resolution (GitHub, API), and a marketplace for sharing agents and skills. This milestone enables the "agent repository backend" from Brady's requirements.

#### Work Items

| # | Title | PRD Ref | Details | Owner | Est. Effort |
|---|-------|---------|---------|-------|-------------|
| M5-1 | Export command (squad export) | PRD 16, 24 | Implement `squad export` — packages team into portable JSON: agents, charters, casting rules, skills. Separates portable (exportable) from project-specific (decisions, history). Creates `squad-export.json`. | Fenster | 4d |
| M5-2 | Import command (squad import) | PRD 16, 24 | Implement `squad import {json-file}` — loads exported squad, validates schema, renames on conflict (never overwrites), creates agents + config. History splitting: portable history loaded, project history starts fresh. | Fenster | 4d |
| M5-3 | History splitting logic | PRD 16, 24 | Implement history splitting on import: (1) Mark portable history lines (from previous projects). (2) Project-specific history begins fresh. (3) Both appended to per-agent history.md. Preserves knowledge portability. | Fenster | 3d |
| M5-4 | AgentSource: GitHub repository support | PRD 15, 24 | Implement `GitHubAgentSource` — loads agents from `agents/{username}/{squad}/ on GitHub repo. Uses gh CLI token (already authenticated). Supports public + private repos. Returns AgentManifest[]. | Verbal | 5d |
| M5-5 | SkillSource interface & implementation | PRD 7, 15 | Implement `SkillSource` interface (mirrors AgentSource). Default: `LocalSkillSource` reads from `.squad/skills/`. Enable future: `GitHubSkillSource`, `APISkillSource`. Skills are independently shareable. | Verbal | 3d |
| M5-6 | Agent versioning (commit SHA pinning) | PRD 24 (Q4) | Implement: imported agents pinned to commit SHA (not branch/tag). `squad places check` lists available updates. `squad places upgrade {agent}` pulls new SHA. No auto-refresh. | Verbal | 3d |
| M5-7 | Agent repository configuration | PRD 15, 24 | Implement agent source registry in config: `agentSources[]` list. First-listed source wins on name collision. Supports: local, GitHub, API. Resolution order deterministic. | Kujan | 3d |
| M5-8 | Caching strategy for remote agents | PRD 24 (Q10) | Implement: remote agents cached locally in `.squad/.cache/agents/`. Cache persists until explicit `upgrade`. If remote unavailable, use cache + warn. Never fail silently, always inform user. | Kujan | 3d |
| M5-9 | Conflict resolution on import | PRD 24 (Q8) | Implement: if importing agent with same name, block import. Require rename (flag: `--as new-name`). Never auto-namespace, never overwrite. Forces intent. | Fenster | 2d |
| M5-10 | Marketplace schema & structure | PRD 16, 24 | Define marketplace format: agent manifest schema, skill manifest, versioning, metadata (description, author, tags). Aligns with existing skill marketplace conventions (awesome-copilot style). | Verbal | 3d |
| M5-11 | Marketplace browser CLI (squad places browse) | PRD 16, 24 | Implement CLI: `squad places list`, `squad places search {query}`, `squad places info {agent}`, `squad places import {agent}`. Queries marketplace metadata, suggests versions. | Kujan | 4d |
| M5-12 | Marketplace backend (reference) | PRD 16, 24 | Document marketplace backend design: GitHub as primary source (repos with `squad-manifest.json`), registry index (optional). Enable self-hosted marketplaces. | Verbal | 2d |
| M5-13 | Security model: remote agent validation | PRD 24 (Q15) | Implement: on import, validate agent structure (schema check), warn on suspicious patterns (requests for elevated permissions, unsafe tool access). Never sandbox — user chose to import. | Verbal | 2d |
| M5-14 | Offline mode graceful degradation | PRD 24 (Q11) | Implement: if agent repository unreachable, use cache if available (log warning). If no cache, fail gracefully with helpful error (not hard fail, not silent). | Kujan | 2d |
| M5-15 | Integration tests: export/import/marketplace | PRD 16, 24 | Test suite: export round-trip (export → import → export = identical), history splitting, remote agent loading, marketplace search, conflict detection. 70%+ coverage. | Fenster | 4d |
| M5-16 | Documentation: Agent Repository & Marketplace Guide | PRD 16, 24 | Write: export/import workflow, remote agent setup, marketplace publishing (for authors), security considerations, caching behavior. Examples: importing from awesome-copilot. | Verbal | 2d |
| M5-17 | Blog Post: Agent Marketplace Preview | McManus Strategy (Week 24) | Write post: "Agent Marketplace Preview" — export/import, sharing agents, marketplace vision. Audience: community, early adopters building reusable agents. v1-content: true. | Verbal | 2d |
| M5-18 | Carry-forward Inventory: Repository & Marketplace Learning | Cross-Cutting | Document M5 learnings: export/import round-trip patterns, remote agent loading reliability, marketplace schema decisions. Record agent work (Fenster on export/import, Verbal on marketplace, Kujan on sources/caching). Archive for distributed squad adoption. | Fenster | 1d |

**Exit Criteria:**
- `squad export` produces valid portable JSON
- `squad import` loads exported squads, splits history, renames on conflict
- GitHub agent loading works (supports public + private repos via gh CLI)
- Skills are independently shareable via SkillSource
- Agent versioning (SHA pinning) works, upgrades tracked
- Remote agents cached, offline mode graceful
- Marketplace schema defined, browser CLI works
- Security validation prevents dangerous imports without sandboxing
- Tests pass (export/import/marketplace at 70%+ coverage)
- Brady approval before M6 begins

**Key Decisions / Knowns:**
- Export/import is the portability story. Teams can move between projects, share configurations.
- GitHub is primary remote source; other sources (API, cloud) are extensible.
- Marketplace is reference design. Early versions use GitHub repos as sources; later can add formal marketplace backend.
- Agent source priority: first-listed wins. No ambiguity, no prompts.
- Conflict resolution on import is strict: block + require rename. Never auto-namespace.

---

### **M6: Polish & Launch — Documentation, Migration Guide, v0.6.0 Release**

**Phase:** 3 (Identity)  
**Duration:** Weeks 28–32 (final sprint)  
**Owner:** Keaton (M6-1,6), Verbal (M6-2,3), Kujan (M6-4,5)  
**Depends On:** M3 (feature parity), M4 (distribution), M5 (agent repository)  

#### Description

Final polish before v0.6.0 release. Comprehensive documentation, migration guide for existing users, feature comparison diagrams, technical deep dives, and launch announcement. Ensures users understand what changed and how to migrate.

#### Work Items

| # | Title | PRD Ref | Details | Owner | Est. Effort |
|---|-------|---------|---------|-------|-------------|
| M6-1 | SDK Replatform Technical Deep Dive | Arch Docs | Write: why replatform, what changed, architecture before/after (diagrams), new capabilities (hooks, tools, sessions, event streaming). Target: technical users + team members. | Keaton | 4d |
| M6-2 | Migration Guide for v0.5.1 → v0.6.0 users | PRD 14, 24 | Write: step-by-step migration. `squad upgrade` does most work (automatic migrations). Manual steps (config review, optional customizations). Rollback procedure. Troubleshooting (common issues). | Verbal | 3d |
| M6-3 | Feature Comparison Diagrams (Mermaid) | PRD 5, 11 | Create high-quality Mermaid diagrams: (1) Routing flow before/after, (2) Agent lifecycle before/after, (3) Tool architecture, (4) Event bus. For docs + marketing. | Verbal | 3d |
| M6-4 | API Reference (public exports) | PRD 1, 2, 4 | Document public APIs: `SquadClient`, `CustomAgentConfig`, tool contracts, hook signatures, error types. Examples for each. | Kujan | 2d |
| M6-5 | Operational Runbooks | PRD 12 | Write: common debugging scenarios (agent not spawning, tool failures, session crashes, upgrade issues). Root cause analysis + remediation steps. | Kujan | 2d |
| M6-6 | Launch Checklist & Release Notes | PRD 12 | Prepare: CHANGELOG, release notes highlighting SDK replatform. Backward compatibility statement. Known limitations. Performance metrics (latency improvements). | Keaton | 2d |
| M6-7 | Demo scenarios (video + docs) | Demos | Prepare 3 demo scenarios: (1) `squad init` in clean-slate world, (2) `squad import` from marketplace, (3) Custom agent with hooks. Include video walkthrough + transcript. | Verbal | 4d |
| M6-8 | FAQs & Troubleshooting | Docs | Write: common questions (SDK replatform why, customization how, breaking changes what). Troubleshooting (socket errors, version mismatches, migration failures). | Keaton | 2d |
| M6-9 | Blog post (optional): SDK Replatform Announcement | Marketing | Write: vision for AI teams on Copilot, replatform benefits (observability, hooks, extensibility), next chapters (marketplace, enterprise). For GitHub Blog if time. | Keaton | 3d |
| M6-10 | Testing: end-to-end migration path | PRD 14, 24 | Final test: real user repo at v0.5.1, run `squad upgrade`, verify all migrations apply correctly, squad runs without regression. Test with 3–5 real repos. | Kujan | 3d |
| M6-11 | Performance profiling & benchmarks | PRD 5, 6 | Benchmark: latency (session creation, message round-trip), memory (concurrent sessions), token usage (coordinator vs. old prompt). Document improvements. | Fenster | 3d |
| M6-12 | Accessibility & internationalization review | Docs | Review: docs accessibility (screen reader friendly), no hard-coded UI strings in code. Prepare for future i18n (identify translatable strings). | Verbal | 2d |
| M6-13 | Release candidate build & validation | PRD 12 | Build v0.6.0-rc.1, test on real machines (macOS, Linux, Windows). Run full test suite + migration test against v0.5.1. Brady final approval. | Kujan | 2d |
| M6-14 | v0.6.0 launch & communication | PRD 12 | Publish v0.6.0 to npm + GitHub. Announce on community channels (if applicable). Direct message to early users with migration guide. | Keaton | 1d |
| M6-15 | Blog Post: v0.6.0 — The Replatform | McManus Strategy (Week 29) | Write launch announcement: what changed, what didn't, why it matters, migration path (optional), zero-friction promise. Audience: all Squad users. v1-content: true. | Keaton | 2d |
| M6-16 | Blog Post: Migration Guide for v0.6.0 | McManus Strategy (Week 30) | Write pinned post (also in docs/): step-by-step upgrade, rollback plan, FAQ. Audience: v0.5.2 users. v1-content: true (framed for easy downgrade). | Verbal | 2d |
| M6-17 | Blog Post: What's Next for Squad | McManus Strategy (Week 31) | Write: v0.7.0 preview, roadmap, next challenges. Audience: contributors, team members. v1-content: true. | Verbal | 2d |
| M6-18 | Carry-forward Inventory: Launch Execution & v1 Foundation | Cross-Cutting | Final carry-forward doc: all learnings from M0-M6, decisions made, patterns proven, agent contributions across entire replatform journey. This is the seed document for v1 Squad templates and future squads. Archive as `.ai-team/docs/v1-foundation-learnings.md`. | Keaton | 2d |

**Exit Criteria:**
- Comprehensive documentation covers all major topics
- Migration guide is clear, step-by-step, tested on real repos
- Feature comparison diagrams are high-quality (Mermaid or similar)
- API reference covers all public exports
- Runbooks exist for common failure modes
- Demo scenarios are polished, walkthrough-ready
- End-to-end migration tested on 3–5 real user repos (zero regressions)
- Performance benchmarks show improvements (or explain trade-offs)
- v0.6.0-rc.1 passes full test suite
- Brady final approval on launch readiness
- v0.6.0 published to npm + GitHub

**Key Decisions / Knowns:**
- Documentation is the primary launch deliverable. Code is stable by M6 start (M5 complete).
- Migration must be truly automatic. Users should upgrade with `squad upgrade` and see no breaking changes (unless intentional).
- Backward compatibility is explicit: if users don't upgrade, old prompt-based system still works (via squad.agent.md fallback).
- Launch is coordinated: announcement, docs, migration guide, and code all published simultaneously.

---

## Cross-Milestone Considerations

### **Parallel Execution**

- **M0 and M1 overlap:** M1 begins when M0 is 60% complete (connection working, config loader in place)
- **M1 and M2 overlap:** M2 begins when M1 tools/hooks work; config migration can start independently
- **M2 and M3 overlap:** M3 feature parity work proceeds as M2 config stabilizes
- **M3, M4, M5 are parallel:** After M3 ships feature parity, M4 (distribution) and M5 (marketplace) run independently
- **M6 is sequential:** Begins only after M3, M4, M5 all complete (no blocking paths, but all need to be stable)

### **Critical Dependencies**

1. **M0 is the gate.** PRD 1 viability (SDK connection, session management) must be proven before M1 commits.
2. **M1 feeds into M2 and M3.** Tools, hooks, lifecycle are foundations for both.
3. **M2 (config) enables M3 (feature parity).** Config-driven behavior is how M3 features migrate.
4. **M3 (feature parity) enables M4+M5.** Distribution and marketplace assume SDK runtime works correctly.
5. **M6 depends on M3, M4, M5 all complete.** Documentation and launch require all features working.

### **Risk Mitigation**

- **PRD 1 viability gate:** If M0 finds SDK unsuitable, stop after 2 days. Pivot to template-only path.
- **Rollback at every phase:** Template system unchanged. Features behind feature flags. Migration registry supports atomic rollback.
- **Brady checkpoints:** After M0 (viability), M3 (parity), M5 (marketplace) — explicit approval before proceeding.
- **Real repo testing:** Every milestone includes testing against real user repos, not just synthetic tests.

---

## Success Criteria by Milestone

| Milestone | Primary Success Criterion | Verification |
|-----------|--------------------------|--------------|
| **M0** | SDK connection lifecycle works, session pool manages agents | PRD 1 viability criteria met; tests pass; Brady approval |
| **M1** | Custom tools execute, hooks enforce policy, agents spawn in parallel | Integration tests pass; feature regression tests pass |
| **M2** | Config-driven initialization works, migrations are atomic | New users can init, existing users can migrate with rollback safety |
| **M3** | Feature parity achieved, routing matches v0.4.1 | 80%+ test coverage; comparison tests pass; zero regressions in critical path |
| **M4** | Distribution works across npm + GitHub, upgrade succeeds | Real-machine install tests pass; `squad upgrade` works on real repos |
| **M5** | Export/import round-trips correctly, remote agents load | Marketplace queries work; import history-splits correctly; offline mode graceful |
| **M6** | Documentation complete, migration path validated, launch ready | v0.6.0-rc.1 passes all tests; 5 real repos migrate successfully; Brady green light |

---

## Owner Assignments & Load Distribution

| Team Member | Role | Milestones | Key PRDs | Weeks | Load |
|-------------|------|-----------|----------|-------|------|
| **Fenster** | Core Dev | M0, M1, M2, M3, M5 | 1, 2, 5, 8, 15, 16 | 1–18, 22–32 | **Heavy** (critical path) |
| **Baer** | Security | M1 | 3 | 5–9 | Focused (2–3 weeks) |
| **Verbal** | Prompt Engineer | M1, M2, M3, M5, M6 | 4, 5, 7, 11, 13, 16 | 5–18, 22–32 | **Sustained** |
| **Keaton** | Lead | M0, M2, M3, M5, M6 | 5, 14, 15, 24 | 1–4, 5–12, 28–32 | **Strategic** (design + approval) |
| **Kujan** | SDK Expert | M3, M4, M5, M6 | 6, 9, 10, 12 | 10–32 | Heavy (extension phase) |

---

## Timeline Summary

```
Weeks 1–4:     M0 Foundation (Fenster) — SDK integration, adapter, session pool
Weeks 3–9:     M1 Core Runtime (Fenster, Baer, Verbal) — tools, hooks, lifecycle
Weeks 5–12:    M2 Config & Init (Keaton, Fenster, Verbal) — config-driven architecture
Weeks 10–18:   M3 Feature Parity (Fenster, Verbal, Kujan) — migration, casting, skills
Weeks 19–26:   M4 Distribution (Kujan) — bundling, install, upgrade
Weeks 22–32:   M5 Agent Repository (Fenster, Verbal, Kujan) — export/import, marketplace
Weeks 28–32:   M6 Polish & Launch (Keaton, Verbal, Kujan) — docs, migration guide, v0.6.0
```

**Total duration:** ~32 weeks (7.5 months) from start to v0.6.0 release.

---

## Cross-Cutting Concerns: Docs, Blogs & Carry-Forward

Brady's directive: "Docs and blogs are a part of all of it." These are non-negotiable requirements that apply to **every milestone** (M0–M6).

### Documentation Requirements (Every Milestone)

Every milestone MUST include at least one documentation work item that covers:
- **Architecture changes** — What changed in the system, why, how it impacts users
- **Configuration** — How to configure new features (if applicable)
- **Migration** — For existing users, how to adopt new capability without breaking changes
- **Troubleshooting** — Common issues, root causes, solutions

**Mapping:**
- **M0:** SDK Integration Guide (M0-10) — Foundation concepts
- **M1:** Custom Tools & Hooks Guide (M1-13) — Policy enforcement, tool contract
- **M2:** Configuration Guide (M2-14) — Schema, migration, examples
- **M3:** Feature Migration Guide (M3-14) — Where features live, compatibility
- **M4:** Installation & Distribution Guide (M4-13) — Install paths, upgrade process
- **M5:** Agent Repository & Marketplace Guide (M5-16) — Export/import, sharing
- **M6:** Deep Dive + Comprehensive Migration Guide (M6-1, M6-2) — Full user guide + technical deep dive

### Blog Cadence (per McManus v1 Content Strategy)

Every milestone ships with a blog post (or multiple, in M3 and M6). All posts carry `v1-content: true` (except M0, which is internal).

**Mapping:**
- **M0 (Week 4):** "Building the Foundations — SDK Spike Results" (M0-11) — internal, team audience
- **M1 (Week 8):** "Agent Lifecycle Redesigned" (M1-14) — current users
- **M2 (Week 12):** "Configuring Your Squad in v1" (M2-15) — users ready to upgrade
- **M3 (Weeks 16, 20):** "Routing Redone" (M3-15) + "Squad Goes Universal" (M3-16) — operators, non-Node users
- **M4 (Week 22):** "How Squad Ships" (M4-14) — contributors, maintainers, curious users
- **M5 (Week 24):** "Agent Marketplace Preview" (M5-17) — community, early adopters
- **M6 (Weeks 29–31):** "v0.6.0 — The Replatform" (M6-15) + "Migration Guide" (M6-16) + "What's Next" (M6-17) — all users, transition focus

### Carry-Forward Inventory (Every Milestone)

Every milestone MUST include a "Carry-forward Inventory" work item that explicitly documents:
1. **Learnings & Patterns** — What worked, what didn't, what surprised us, what we'd do differently
2. **Agent Contributions** — Which agents built what, their key contributions, their learnings (feeds crossover-vision-{agent}.md)
3. **Decisions Made** — Explicit architectural choices, trade-offs, alternatives considered
4. **Technical Debt or Wins** — Patterns to replicate, gotchas to avoid, technical wins to carry forward

**Mapping:**
- **M0:** M0-12 — SDK viability, adapter pattern, session pooling assumptions
- **M1:** M1-15 — Tools, hooks, lifecycle patterns, session management
- **M2:** M2-16 — Config schema, migration strategy, agent source abstraction
- **M3:** M3-17 — Feature parity, routing decisions, casting/skills redesign
- **M4:** M4-14 — Bundling, distribution, upgrade resilience
- **M5:** M5-18 — Export/import patterns, marketplace schema, multi-source loading
- **M6:** M6-18 — **Final carry-forward:** comprehensive v1 foundation doc (`.ai-team/docs/v1-foundation-learnings.md`) that seeds all future Squad templates

**Output Archive:** All carry-forward documents go to `.ai-team/decisions/archive/` during M6 cleanup, and are synthesized into the final `.ai-team/docs/v1-foundation-learnings.md` document that becomes the reference for creating new Squads.

---

## Reference to Key Decisions

The following decisions from `.ai-team/decisions.md` are baked into these milestones:

- **Q19:** SDK-free init by default; `--include-sdk` flag for users who want full package upfront (M2-6)
- **Q20:** Pin exact SDK version during Technical Preview (M0, M4-5)
- **Q23:** Config-driven architecture — extract customizable behavior into JSON/YAML (M2)
- **Q24:** Export/import as part of agent marketplace (PRD 16, M5)
- **Q25:** Kobayashi owns workflow migration (M3-13, outside these milestones)
- **Q27:** Planning first, then implementation (this document is the planning gate)

---

## What's Not in These Milestones

The following are explicitly deferred or out-of-scope for v0.6.0:

1. **Copilot Extensions marketplace submission** (M4-8 is readiness only)
2. **Full cloud agent repository backend** (GitHub is MVP; API sources deferred to Phase 3)
3. **Advanced MCP integration** (basic structure in M0-1, full integration PRD 10 in Phase 2)
4. **Template system rewrite** — existing `squad init` / `squad upgrade` preserved (PRD 14 deferred to Phase 3)
5. **.squad/ directory restructure** — minimal changes in v0.6.0, full clean-slate in v0.8+ (PRD 14 Phase 3)
6. **Casting system rewrite to TypeScript** — config-driven but file-based (PRD 11 Phase 3 for full runtime generation)
7. **Ralph persistent monitoring redesign** — SDK migration (PRD 8) in Phase 2

---

## Version & Status

- **Created:** 2026-02-21
- **Version:** 1.0 (Final Planning)
- **Status:** Ready for Brady review + team kickoff
- **Next step:** Brady approval → milestone kickoff starts with M0

---

*This document is maintained by Keaton (Lead). It is the planning gate for the SDK replatform. No implementation begins until Brady approves.*
