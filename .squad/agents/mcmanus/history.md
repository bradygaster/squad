# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### 2026-02-24: Issue #338 — Copy polish: human, fun, action-oriented
**Status:** Complete. PR #358 created.
**Changes made:**
1. **packages/squad-cli/src/cli-entry.ts** — 16 user-facing message rewrites:
   - Help text: "Add an AI agent team..." → "Team of AI agents at your fingertips"
   - Command descriptions simplified: e.g., "Create .squad/ in this repo" (was "Initialize Squad")
   - Triage message: removed corporate "Squad triage — scanning" → "Scanning issues and categorizing"
   - Loop message: "Squad loop starting..." → "Starting work loop (Ralph mode)..."
   - Hire message: "Team creation wizard starting..." → "Building your team..."
   - Status output: "Active squad" label → "Here: " + human-centered output
   - Error hint: "Hint: Run 'squad doctor'..." → "Tip: Run 'squad doctor'..."
   - All imports/exports copy shortened and action-focused
   - Scrub-emails output: "(email) address(es)" → human pluralization

2. **packages/squad-cli/src/cli/shell/commands.ts** — Slash command rewrites:
   - /help: 10 lines → 6 lines. "Available commands" → "Commands:". Removed verbose examples.
   - /status: "Squad Status" → "Your Team:". Labels: "Registered agents" → "Size:", "Active" → "Active now:"
   - /history: "Recent messages (N)" → "Last N message(s)"
   - /agents: "No agents registered" → "No team members yet"
   - Unknown command: "Unknown command: /X" → "Hmm, /X? Type /help for commands." (more conversational)

3. **packages/squad-cli/src/cli/shell/components/AgentPanel.tsx** — 2 message updates:
   - Empty state: "Type a message to start, or run /help for commands" → "Send a message to start. /help for commands."
   - Idle state: "all idle" label removed (was redundant)

4. **packages/squad-cli/src/cli/shell/components/InputPrompt.tsx** — Placeholder text:
   - Hint: "Type a message or @agent-name..." → "Type a message or @agent..."

5. **packages/squad-cli/src/cli/shell/components/App.tsx** — 2 UX messages:
   - Setup hint: "Run 'squad init' to set up your team" → "Run 'squad init' to get started"
   - Instructions: 2 lines → 1 line: "↑↓ history · @Agent to direct · /help · Ctrl+C exit"
   - SDK error: "SDK not connected — agent routing unavailable" → "SDK not connected. Check your setup."

6. **test/cli-shell-comprehensive.test.ts** — Updated 9 test assertions to match new copy
7. **test/ux-gates.test.ts** — Updated 2 UX gate assertions to match new copy

**Build:** SDK + CLI built successfully. All 125 tests passed (11 tests updated to match new copy).
**Tone applied:** Every message is now:
   - **Human:** No corporate speak, no "squad" as a formal noun in every sentence
   - **Fun:** "Hmm, /X?" instead of "Unknown command", "Tip:" instead of "Hint:", professional warmth
   - **Action-oriented:** Messages guide users to their next step (run squad init, check setup, use /help)
   - **Short:** One line when possible, no redundant status labels

**Key rewrites exemplify the goal:**
- Before: "No message history yet" → After: "No messages yet" (3 words saved, same meaning)
- Before: "Unknown command: /foobar. Type /help for available commands" → After: "Hmm, /foobar? Type /help for commands." (more conversational, same info)
- Before: "Squad Status\n  Active squad: repo\n  Reason: Found .squad/ in repo tree" → After: "Squad Status\n  Here: repo (in .squad/)" (cleaner structure, less explanation noise)

**PR:** https://github.com/bradygaster/squad-pr/pull/358
**Notes:**
- All changes backward-compatible; no API breaking changes
- Test updates validate that new copy passes UX gates (width, structure, completeness)
- Ready to merge and deploy—no documentation changes needed (copy IS the docs)

### 2026-02-23: Personal Squad tutorial — docs/guide/personal-squad.md
**Status:** Complete.
**Changes made:**
1. **docs/guide/personal-squad.md** — End-to-end tutorial (201 lines) covering:
   - What a personal squad is and why it matters
   - Step-by-step setup: global CLI install, `squad init --global`, connecting projects
   - Behind the scenes: `~/.squad/` structure, config.json teamRoot pointer, local vs. remote mode, resolution system
   - 5 use cases: side projects sharing a team, cross-repo code review, learning new codebases, skills that grow across projects, personal workflow automation
   - Honest "where it's headed" section acknowledging limitations (no sync, no conflict handling, project keys unused)
   - Practical tips section
2. **docs/build.js** — Added 'personal-squad' to SECTION_ORDER for 'guide' section
**Build:** 40 pages generated without errors (`node docs/build.js`). Page appears in Guide nav as "Your Personal Squad".
**Tone applied:** Matched existing Squad docs exactly — `**Try this:**` opener, `---` dividers, `## N. Title` numbered sections, casual/direct/action-oriented, terminal output examples, no hype. Followed "it's still very new" energy per Brady's direction.
**Notes:**
- Technical details grounded in actual source: resolution.ts (resolveSquadPaths, remote mode, SquadDirConfig), cli-entry.ts (--global flag)
- Use cases show cross-project value without overpromising — each is plausible today
- "Where It's Headed" section is honest about rough edges (no sync, local-only, no UI)
- Length target 200-300 hit at 201 lines

### 2026-02-23: Blog posts 013–020 — v1 replatform blog coverage
**Status:** Complete.
**Changes made:**
1. **docs/blog/013-the-replatform-begins.md** — The decision to rewrite from JS to TypeScript. SDK + CLI split. npm workspace. Wave-based development plan.
2. **docs/blog/014-wave-1-otel-and-aspire.md** — Wave 1: 3-layer OTel API, SquadObserver file watcher, Aspire dashboard integration. Issues #254–#268, PRs #307–#308.
3. **docs/blog/015-wave-2-the-repl-moment.md** — Wave 2: Interactive shell wow moment, CWE-78 security fix (execFileSync over execSync), config extraction to constants.ts, 119 new tests. PR #309.
4. **docs/blog/016-wave-3-docs-that-teach.md** — Wave 3: Custom markdown-it site generator, 5 initial guides, scenario-first philosophy. PR #310, 11 issues closed.
5. **docs/blog/017-version-alignment.md** — v0.8.2 version snap across root/SDK/CLI. npm publishing. CI build-order discovery.
6. **docs/blog/018-the-adapter-chronicles.md** — P0 Codespace bug (#315), CopilotSessionAdapter, 7-issue adapter hardening sprint (#316–#322), zero `as any` remaining.
7. **docs/blog/019-shaynes-remote-mode.md** — Port of @spboyer's PR #131: dual-root resolver, doctor command, squad link, init --mode remote. Full attribution to Shayne Boyer.
8. **docs/blog/020-docs-reborn.md** — Docs restructure: 77 pages, 6 sections, beta UI port (dark mode, search, sidebar), GitHub Pages pipeline, tone pass on 62 docs.
**Build:** 85 pages generated without errors (`node docs/build.js`).
**Tone applied:** Beta blog voice — light, personal, story-driven. No corporate. No hype. Led with human story, grounded in specific issues/PRs/commits. Maintained tone ceiling throughout.
**Notes:**
- Posts numbered 013–020, continuing from beta blog's 001–012
- Dates spread across Feb 20–23, 2026 (chronologically sensible with the git log)
- @spboyer credited in #019 per CHANGELOG attribution
- Frontmatter follows exact beta format: title, date, author, wave, tags, status, hero

### 2026-02-25: Issues #419/#424 — Help text restructuring (default vs. full)
**Status:** Complete. PR #438 created (branch `fix/issue-421`).
**Problem:** `/help` output was overwhelming for new users (9 lines). Brady requested: default help showing 3-5 essentials, with pointer to `/help full` for complete reference.
**Changes made:**
1. **packages/squad-cli/src/cli/shell/commands.ts** — `handleHelp()` function restructured:
   - Default `/help`: 4 lines (commands on 2 lines, blank, callout to `/help full`)
   - `/help full`: Complete list with descriptions (previous behavior, now conditional)
   - Maintains terminal-width detection for narrow terminals
   - Args parsing: `args[0] === 'full'` routes to complete reference

**Before (default):**
```
Commands:
  /status   — Check your team & what's happening
  /history  — See recent messages
  /agents   — List all team members
  /clear    — Clear the screen
  /quit     — Exit

Talk to your squad:
  Just type naturally — the coordinator routes it to the right agent.
  @AgentName message  — Send directly to one agent.
```

**After (default):**
```
Commands:
  /status — Check your team    /history — Recent messages
  /agents — List team           /quit — Exit

Type /help full for complete docs.
```

**Outcome:** New users see 4 scannable lines. Power users get `Type /help full` to see everything (9 lines including natural language guidance). Reduces cognitive load on first interaction.
**Build:** TypeScript compilation successful. All 125 tests pass.
**Tone applied:** Conversational, scannable, self-service (user asks for more → gets more). No hype. CTA is subtle and clear.
- Each post ends with standard McManus attribution footer pointing to squad-pr repo

---

📌 Team update (2026-02-23T09:25Z): Personal Squad tutorial (docs/guide/personal-squad.md) + blog coverage complete. Streaming diagnostics infrastructure finished. Kovash added SQUAD_DEBUG logging. Hockney identified root cause. Kobayashi bumped version to 0.8.5.1. — decided by Scribe

### 2026-02-22: GitHub Actions workflow for docs publishing
**Status:** Complete.
**Changes made:**
1. **`.github/workflows/squad-docs.yml`** — Updated to deploy from main branch:
   - Changed trigger branch from `preview` to `main`
   - Simplified build steps: use `npm ci` + `npm run docs:build` instead of manual markdown-it install
   - Changed artifact path from `_site` to `docs/dist` (matches build output)
   - Updated Node.js version to 20
   - Fixed concurrency setting: `cancel-in-progress: false` to prevent interrupting ongoing deployments
   - Reordered deploy job steps to match Brady's specification
2. **`docs/template.html`** — Updated footer GitHub link:
   - Changed from `https://github.com/bradygaster/squad` to `https://github.com/bradygaster/squad-pr`
   - Maintains link consistency with current repository
**Tone applied:** Clean, operational. Docs publishing is infrastructure — focus on what changed and why (repository URL accuracy).
**Notes:** 
- Workflow now targets main branch deployments, aligning with standard GitHub Pages practices
- Build script (`npm run docs:build`) must exist in package.json to avoid workflow failures
- Documentation template footer now correctly points to the active squad-pr repository

### From Beta (carried forward)
- Tone ceiling enforcement: ALWAYS — no hype, no hand-waving, no unsubstantiated claims
- Celebration blog structure: wave:null, parallel narrative format
- docs/proposals/ pattern: meaningful changes require proposals before execution
- v1 docs are internal only — no published docs site for v1
- Distribution message: `npx github:bradygaster/squad` — always GitHub-native, never npmjs.com

### 2026-02-21: Issue #217 — README and help output update for npm distribution
**Status:** Complete.
**Changes made:**
1. **README.md**: Added npm-based installation as primary path with legacy GitHub-native as fallback. New sections:
   - "Install Squad" with Option A (npm) and Option B (Legacy/GitHub-native)
   - "Monorepo Development" section documenting workspace structure, build/test/lint commands, and changesets workflow
   - Updated command table to show `squad` command format instead of `npx github:bradygaster/squad-sdk`
   - Updated "Insider Channel" section with both npm and legacy examples
2. **src/index.ts help output**: Updated to reflect npm-based distribution:
   - Usage line changed from `npx github:bradygaster/squad-sdk [command]` to `squad [command] [options]`
   - Added `--global` flag documentation to init and upgrade entries
   - Moved `status` command to top of commands list (for discoverability)
   - Added Installation and Insider channel sections showing npm commands
   - Removed reference to legacy GitHub-native in help (users get that from README)
3. **CONTRIBUTING.md**: Created comprehensive monorepo development guide:
   - Prerequisites, monorepo structure, getting started (clone, install, build, test, lint)
   - Development workflow (branch naming, commit format, PR process)
   - Code style conventions (TypeScript strict mode, ESM-only, error handling, tone ceiling)
   - Changesets independent versioning workflow (add, release process)
   - Branch strategy (main, insider, user feature branches)
   - Common tasks (add CLI command, add SDK export, migrate legacy code)
   - Key files reference
**Tone applied:** No hype, factual, references back to decisions.md (changesets decision, zero-dependency scaffolding, ESM-only, TypeScript strict mode, tone ceiling)
**Notes:** 
- Help text changed from npx-based to direct `squad` command, reflecting the fact that squad-cli is now a proper npm package that gets installed as a binary (when installed via `npm install @bradygaster/squad-cli`)
- README maintains historical context by keeping GitHub-native option visible but secondary, per decision #2026-02-21
- CONTRIBUTING.md focuses on development experience, not user experience (kept separate from README per v1 internal-only docs decision)

### 📌 Team update (2026-02-21T22:25Z): Decision inbox merged — decided by Scribe
- M5 round complete: McManus (docs PR #280), Fenster (guard PR #279), Kobayashi (blocked #209)
- Decisions merged: ensureSquadPath() guard, CLI routing testability pattern

### 2026-02-21: Epic #181 P0 docs — CHANGELOG and SquadUI integration guide
**Status:** Complete.
**Changes made:**
1. **CHANGELOG.md** — Created with [Unreleased] section documenting three P0 items:
   - Breaking: CLI entry point moved to `dist/cli-entry.js`
   - Fixed: CRLF normalization across 8 parsers
   - Fixed: `process.exit()` removed from library functions
   - Internal: Notes on new `normalizeEol()` utility and `src/cli-entry.ts`
   - Also backfilled v0.6.0 section for context
2. **docs/squadui-integration.md** — Created practical integration guide for SquadUI team:
   - Three subsections matching the P0 work (CRLF, entry point, process.exit)
   - Code snippets showing safe import patterns for extensions
   - Simple table summarizing breaking changes and migration paths
   - Brief P1 roadmap section (type extensions, subpath exports, error types)
3. **Commit on branch `squad/181-squadui-p0`** with proper Co-authored-by trailer
**Tone notes:**
- No hype in CHANGELOG — factual, issue-linked, clear scope
- SquadUI guide is practical not promotional — code-first, minimal prose, brief sections
- Separated "What Changed" (P0) from "What's Coming" (P1) to set expectations
- Breaking changes table is explicit (Impact + Migration Path) to reduce support burden
**Process:** Read history.md and decisions.md for context; verified tone ceiling; no source changes — docs-only.



### 📌 Team update (2026-02-22T020714Z): SquadUI integration docs complete
McManus updated CHANGELOG.md with v0.6.0 entries and created docs/squadui-integration.md. Documentation captures the SquadUI integration work (library-safe CLI, error handling patterns, cross-platform robustness). User directive decision merged: docs as you go during integration. Epic #181 archived.

### 2026-02-22: Issue #231 — SquadUI v2 type mapping corrections
**Status:** Complete.
**Changes made:**
1. **docs/squadui-type-corrections.md** — Created comprehensive type alignment document for SquadUI team:
   - 4 type mapping errors clearly documented with before/after comparisons
   - Error 1: `SkillDefinition` — proposal wrong on `description` (should be `content`), `requiredTools` (should be `agentRoles`), missing `id`, `domain`
   - Error 2: `ParsedCharter` — proposal assumes flat object, actual is nested `identity: { name?, role?, expertise?, style? }`, no `voice` (use `collaboration`), no `owns` (use `ownership`)
   - Error 3: `RoutingConfig` — missing `issueRouting`, `governance`, `copilotEvaluation`; `RoutingRule` uses `workType` not `pattern`
   - Error 4: `parseDecisionsMarkdown()` returns `{ decisions, warnings }` not `ParsedDecision[]` directly
   - 2 architectural clarifications: two routing parsers (parseRoutingRulesMarkdown vs parseRoutingMarkdown) and orchestration log parsing is out of scope
   - Correct type shapes with exact interfaces from source
   - Migration path table for each error
2. **Commit on branch `squad/181-squadui-p2`** with closes #231 reference
**Tone applied:** 
- No hype — factual, error-driven ("Here's what's wrong and why")
- Action-oriented table mapping proposal assumptions to correct reality
- Citations to exact source files (line numbers not included per "tone ceiling" — readers can verify easily)
- Closing with "Questions? Contact the SDK team" rather than "let us know" (professional, boundaried)
**Process:** 
- Read all type definitions from source (skills/skill-loader.ts, agents/charter-compiler.ts, runtime/config.ts, config/markdown-migration.ts, config/routing.ts)
- Verified return types by examining function signatures and actual code
- Cross-referenced parser locations to clarify "two routing parsers" architectural issue
- No speculative content — every statement grounded in actual type inspection
**Notes:**
- Document serves as a blocker for SquadUI adapter development (prevents costly refactors)
- Type corrections enable them to build adapters on correct assumptions from day one
- Orchestration log parsing note prevents scope creep (that's SquadUI's responsibility)

### 2026-02-22: Issue #302 — Upstream inheritance feature documentation
**Status:** Complete.
**Changes made:**
1. **docs/guide/upstream-inheritance.md** — Comprehensive 21KB guide covering:
   - Overview: why upstream inheritance matters (knowledge sharing without duplication)
   - Core concepts: three source types (local/git/export), hierarchy (Org→Team→Repo), closest-wins resolution
   - What gets inherited: skills, decisions, wisdom, casting policy, routing
   - Getting started: quick-start examples for local, git, and export sources
   - CLI reference: all 4 commands (`add`, `remove`, `list`, `sync`) with signatures, examples, and behavior
   - SDK API reference: 5 types (`UpstreamType`, `UpstreamSource`, `UpstreamConfig`, `ResolvedUpstream`, `UpstreamResolution`) and 4 functions (`readUpstreamConfig`, `resolveUpstreams`, `buildInheritedContextBlock`, `buildSessionDisplay`) with TypeScript signatures and usage examples
   - All 6 end-to-end scenarios with detailed narrative:
     1. Platform Team at Scale — org-wide practices flowing to product teams
     2. Open-Source Framework with Community Plugins — community alignment without forking
     3. Consultancy Methodology Across Client Projects — consistent engagement model across clients
     4. Multi-Team Shared Domain Model — single source of truth for domain models
     5. Post-Acquisition Engineering Convergence — merging two organizations' practices
     6. Enterprise Application Modernization — architectural coherence during microservices migration
   - Troubleshooting: 6 common issues (git clone failures, local path issues, export validation, missing context, stale caches, ordering conflicts) with solutions
**Tone applied:** 
- Grounded in actual implementation (CLI commands read from upstream.ts, SDK API from resolver.ts and types.ts)
- No hype — each feature explained with "what" and "why" separately
- Scenarios are realistic narratives grounded in actual engineering problems, not idealized cases
- Every claim about behavior verified against source code (type definitions, function signatures, error handling)
- Troubleshooting section prevents support burden by addressing real failure modes
**Process:**
- Read implementation files: upstream.ts (all CLI commands), resolver.ts (resolution algorithm), types.ts (public API)
- Built type reference from actual interface definitions
- Derived CLI examples from command argument parsing and flag handling
- Scenarios drawn from real patterns: org hierarchy, open-source governance, consultancy standardization, domain-driven design, M&A integration, monolith→microservices migration
- Verified each scenario's code structure against resolution algorithm (what gets inherited, in what order)
**Notes:**
- Document is internal-only per v1 decision; targets team and early adopters
- Closest-wins resolution algorithm and ordering importance emphasized to prevent user error
- Troubleshooting focuses on common paths (git auth, local path validation, cache invalidation, order dependency)
- All SDK examples use actual public exports from `@bradygaster/squad-sdk`

### 2026-02-22: Issue #206, #203, #201, #199, #196 — Five documentation guides
**Status:** Complete.
**Changes made:**
1. **docs/guide/architecture.md** — 15.2KB architecture overview:
   - System diagram showing SDK, CLI, SquadUI, and Copilot integration
   - Package boundaries: Squad SDK (core runtime), Squad CLI (entry point + commands), SquadUI (VS Code extension)
   - Complete module map with subdirectories and key types (Agents, Casting, Routing, Tools, Config, Upstream, Adapter, Runtime)
   - OTel 3-layer observability pipeline (low-level: initializeOTel/getTracer; mid-level: bridgeEventBusToOTel; high-level: initSquadTelemetry)
   - Trace flow from user input → SDK spans → EventBus → OTLP → Aspire
   - Execution flows for CLI shell and SquadUI
   - Development workflow patterns (adding CLI command, adding tool, adding SDK export)

2. **docs/guide/migration.md** — 9.6KB migration from beta to v1:
   - Directory rename: `.ai-team/` → `.squad/` (automated with `squad upgrade --migrate-directory`)
   - Package names: monolithic SDK → separate SDK + CLI (`@bradygaster/squad-sdk`, `@bradygaster/squad-cli`)
   - CLI commands: all work with global install, no more `npx github:bradygaster/squad-sdk`
   - Config changes: .agent.md still exists but no longer baked into routing (now programmatic)
   - Charter format: still markdown but structured sections (Identity, Knowledge, Tools, Collaboration)
   - 10-step migration checklist with validation at each step
   - What's new: deterministic routing, OTel observability, upstream inheritance, response tiers, independent versioning
   - Troubleshooting: command not found, missing directories, agent load failures, model availability, script updates

3. **docs/guide/cli-install.md** — 8.1KB CLI installation guide:
   - Three install methods: global (npm), one-off (npx), GitHub native (development)
   - How resolution works: global PATH lookup vs. npx on-demand vs. git clone
   - Personal squad: `squad init --global` for shared ~/.squad/ across projects
   - Global vs. local squad comparison table
   - Resolution order: ./.squad/ → parents → ~/.squad/ → fallback
   - Command compatibility matrix (which commands work with which install methods)
   - When to use each method (frequency, CI/CD, testing, GitHub native)
   - Version management: check, update, pin, insider channel
   - Troubleshooting: command not found, missing .squad/, permissions, version mismatch, Docker setup

4. **docs/guide/vscode-integration.md** — 10KB SquadUI integration for extension developers:
   - User flow: user → SquadUI → runSubagent → SDK spawns agent
   - Client compatibility modes: CLI (interactive shell, full filesystem) vs. VS Code (no interactive, scoped file ops)
   - Extension developer checklist: 7 items (detect mode, import safely, load config, call agents, stream, error handling, user context)
   - API reference: CastMember, AgentCharter, RoutingDecision, ConfigLoadResult types
   - Safe patterns: read-only status, non-blocking spawn, stream output
   - Detailed troubleshooting: Squad not found, process.exit() crashes, non-streaming responses, import paths
   - Emphasis on never importing CLI entry point (it calls process.exit())

5. **docs/guide/sdk-api-reference.md** — 20.3KB complete SDK API reference:
   - Barrel export overview (all imports work from @bradygaster/squad-sdk)
   - **Resolution**: resolveSquad, resolveGlobalSquadPath, ensureSquadPath
   - **Runtime Constants**: MODELS, TIMEOUTS, AGENT_ROLES with examples
   - **Configuration**: loadConfig, loadConfigSync with types (ConfigLoadResult, AgentConfig, RoutingConfig)
   - **Agents**: onboardAgent with full usage example
   - **Casting**: CastingEngine, CastingHistory with examples
   - **Coordinator**: SquadCoordinator class, selectResponseTier, getTier with complete types
   - **Tools**: defineTool helper, ToolRegistry, built-in tool table
   - **OTel (3-layer)**:
     - Layer 1: initializeOTel, shutdownOTel, getTracer, getMeter (low-level control)
     - Layer 2: bridgeEventBusToOTel, createOTelTransport (mid-level bridge)
     - Layer 3: initSquadTelemetry with lifecycle handle (high-level convenience)
     - Zero overhead guarantee: no-op if no TracerProvider configured
   - **Streaming**: createReadableStream
   - **Upstream**: readUpstreamConfig, resolveUpstreams, buildInheritedContextBlock, buildSessionDisplay
   - **Skills**: loadSkills, readSkill, writeSkill
   - Final glossary table of all exports

**Tone applied:**
- No hype — each API presented matter-of-factly with code examples
- Every export grounded in actual source code (verified against packages/squad-sdk/src/index.ts)
- OTel 3-layer structure explained with zero-overhead guarantee (prevents unfounded adoption fears)
- Migration guide balances pragmatism (automated rename) with honest troubleshooting (what can go wrong)
- CLI install guide emphasizes resolution and decision-making (which method when) rather than prescriptiveness
- SquadUI guide warns against common mistakes (process.exit crash, importing CLI) with concrete fixes
- Architecture guide uses diagrams and module maps (not narrative prose) for clarity
- All five guides cross-reference each other (Next Steps sections)

**Process:**
- Read actual source: packages/squad-sdk/src/index.ts (all exports), src/runtime/otel*.ts, src/tools/index.ts, src/agents/, src/coordinator/, src/upstream/
- Verified CLI structure: packages/squad-cli/src/cli-entry.ts, cli/commands/, cli/shell/
- Verified casting: packages/squad-sdk/src/casting/casting-engine.ts, casting-history.ts
- Verified adapter: packages/squad-sdk/src/adapter/types.ts, client.ts
- Verified upstream: packages/squad-sdk/src/upstream/resolver.ts, types.ts
- Checked history.md for prior tone decisions (ALWAYS: no hype, no unsubstantiated claims)
- All code examples use actual API signatures (not invented)
- Glossaries and index sections for cross-referencing

**Notes:**
- All five guides marked "⚠️ INTERNAL ONLY" per v1 policy (no published docs site)
- Architecture guide serves as central reference; other guides link back to it
- Migration guide is safety-first: backup, validate, rollback instructions
- CLI install guide clarifies confusing resolution behavior (global vs. npx vs. GitHub)
- SquadUI guide prevents costly mistakes (extension crashes, wrong import paths)
- SDK API reference is exhaustive (every export from index.ts) and grouped by domain
- OTel reference emphasizes 3-layer structure matching Issue #266 decision
- No screenshots or videos (text-only for internal review)
- Troubleshooting sections in migration, CLI, and SquadUI guides address real failure modes from beta feedback

### 2026-02-22: GitHub Pages content research — docs + blog structure
**Status:** Research complete. Recommendations documented.
**Findings:**
1. **Current v1 docs inventory** (14 guide files + 2 launch files + 1 audit):
   - Core guides span installation, config, SDK API, architecture, tools, marketplace, shell, VS Code integration, upstream inheritance, feature migration, migration pathways
   - Release notes and migration guides in /docs/launch/
   - One technical audit (adapter safety)
   - docs/guide/index.md already functions perfectly as a homepage/landing page with navigation, Getting Started, Core Guides, Reference sections
2. **Old repo (bradygaster/squad) blog structure:**
   - 12+ posts spanning beta releases (v0.2.0–v0.4.0) and milestones (wave-0, team formation, community highlights, trending on GitHub)
   - Naming convention: NNN-slug.md (sequential numbering) with YAML front matter (title, date, author, tags, status)
   - Blog posts were narrative + technical, mixing release announcements, team stories, and feature deep-dives
   - /docs/blog/ existed and was actively populated during beta
3. **Old repo navigation pattern:**
   - Single guide.md as main reference, sectioned with README anchors
   - Separate blog folder tracked momentum and community stories
   - Release notes and feature specs lived in parallel directories (migration/, scenarios/, features/)
   - build.js script suggests GitHub Pages static generation
4. **Old repo findings on structure and patterns:**
   - Blog posts were numbered sequentially (001, 001a, 002, etc.) — wave/series tracking
   - Authorship tracked (wave-0 post shows "McManus (DevRel)" as author)
   - Tags used for categorization (team-formation, releases, features, learnings)
   - Posts ranged 2.5KB–9.8KB (narrative-focused, not exhaustive specs)
**Recommendations (5 items):**
- **Homepage:** Use docs/guide/index.md as-is — already has navigation, Getting Started, Core Guides sections. No changes needed.
- **Docs organization:** Keep /docs/guide/ structure (14 guides). /docs/launch/ stays in repo but not published (release notes → CHANGELOG.md at root). /docs/audits/ publishes as-is (transparency/compliance value). Root-level asymmetry (internal launch/ stays internal) acceptable per v1 decision.
- **Blog folder (recreate):** Establish /docs/blog/ with fresh v1 content. Old beta blog (12 posts tracking v0.2–v0.4) provides pattern inspiration but not content. New blog should tell v1 story: why replatform, what stability means, team integration experiences, community wins. Dating convention: YYYY-MM-DD-slug.md (searchable, SEO-friendly vs. old NNN numbering).
- **Navigation:** Docs (sidebar tree: Installation→Getting Started→Guides→Reference→Troubleshooting) + Blog (main nav, latest first, tagged) + Quick Links footer (GitHub, NPM, Discussions, Issues, Status).
- **URL patterns:** /docs/guide/installation, /docs/getting-started, /blog/2026-02-21-v1-launch, / → homepage. Avoid old /docs/launch/ in published nav (keep in repo for internal historical record).
**Why fresh blog for v1:**
- Old blog authentically tracks beta (valuable historical artifact). Mixing into v1 site confuses new users ("which version is this for?").
- v1 replatform is significant enough to warrant new origin story (why we moved, what changed, what's more stable).
- Team maturity arc is different: beta was "building Squad while Squad builds itself"; v1 is "production runtime proven, adding team/integration layers."
- Fresh blog positions v1 as its own milestone, not a continuation of beta momentum.
**Notes:**
- Tone ceiling applies: all blog posts follow "no hype, no unsubstantiated claims" decision from decisions.md
- Blog serves DevRel goals (community, transparency, learnings) while docs serve product goals (installation, configuration, troubleshooting)
- Separation of /docs/launch/ (internal only) from published blog allows historical record preservation without confusing new users
- build.js script in old repo can guide static generation approach (reusable pattern for GitHub Pages)

### 2026-02-22: Port beta docs site UI to squad-pr
**Status:** Complete.
**Changes made:**
1. **docs/template.html** — Replaced with beta site template:
   - New layout: `.layout` > `.sidebar` + `.main` (replaces `.container` > `.main-wrapper`)
   - Dark mode support via `data-theme` attribute (auto/dark/light)
   - Search box with `{{SEARCH_INDEX}}` placeholder for client-side search
   - Theme toggle button, hamburger menu for mobile
   - Uses `<article class="content">` instead of `<main class="content">`
2. **docs/assets/style.css** — Replaced with beta site CSS:
   - CSS custom properties for light/dark theming
   - `prefers-color-scheme` media query + manual `[data-theme]` override
   - Fixed sidebar navigation (position:fixed, full height)
   - Sticky topbar with search and theme toggle
   - Responsive: sidebar slides in/out on mobile (translateX transform)
   - Print styles hide sidebar and topbar
3. **docs/assets/script.js** — New file (replaces app.js):
   - Theme persistence via localStorage (`squad-theme` key)
   - `toggleTheme()`: cycles auto → dark → light → auto
   - `updateThemeBtn()`: emoji indicator (☀️/🌙/💻)
   - `toggleSidebar()`: mobile sidebar open/close
   - Client-side search: filters `searchIndex` array, renders dropdown results
4. **docs/assets/app.js** — Deleted (superseded by script.js)
5. **docs/assets/squad-logo.png** — Downloaded from beta repo (bradygaster/squad)
6. **docs/build.js** — Updated nav generation + search index:
   - `buildNavHtml()`: generates `<nav class="sidebar" id="sidebar">` with logo header, close button, Home link, and `<details class="nav-section" open>` groups
   - `buildSearchIndex()`: generates JSON array of `{title, href, preview}` for each page
   - Build injects search index via `{{SEARCH_INDEX}}` placeholder
7. **test/docs-build.test.ts** — Updated 2 tests for new template:
   - `app.js` → `script.js` in asset check
   - `<main>` → `<article>` in content area check
**Build:** All 14 pages generate without errors.
**Tests:** 30/30 passing.
**Credits:** UI design ported from beta site. Hat tip to @spboyer (Shayne Boyer) for the original beta docs CSS/JS patterns.
**Tone applied:** Surgical port — matched beta site exactly per Brady's request, no creative additions.

### 2026-02-22: Beta docs download and docs restructure
**Status:** Complete.
**Changes made:**
1. **New directory structure:** Created `docs/scenarios/`, `docs/features/`, `docs/cli/`, `docs/sdk/`
2. **Downloaded 21 scenario docs** from bradygaster/squad beta repo to `docs/scenarios/`
3. **Downloaded 23 feature docs** from beta repo to `docs/features/` (includes worktrees.md)
4. **Downloaded 5 top-level guides** from beta repo to `docs/guide/`: first-session.md, github-issues-tour.md, tips-and-tricks.md, sample-prompts.md, whatsnew.md
5. **Restructured existing docs into CLI and SDK sections:**
   - `docs/cli/`: shell.md, installation.md (from cli-install.md), vscode.md (from vscode-integration.md)
   - `docs/sdk/`: api-reference.md (from sdk-api-reference.md), integration.md (from sdk-integration.md), tools-and-hooks.md
6. **Moved feature docs out of guide/:** upstream-inheritance.md → features/, marketplace.md → features/
7. **Removed architecture.md** from guide/ (internal implementation details)
8. **Kept in guide/:** index.md, installation.md, configuration.md, migration.md, feature-migration.md (user-facing)
9. **Tone pass on all 62 pages:**
   - Removed "⚠️ INTERNAL ONLY" banners from downloaded and existing docs
   - Updated `npx github:bradygaster/squad` → `squad` (v1 npm command)
   - Updated `https://github.com/bradygaster/squad` → `https://github.com/bradygaster/squad-pr`
10. **Updated `test/docs-build.test.ts`** to reflect new multi-directory structure:
    - EXPECTED_GUIDES now lists 10 guide/ files (was 14)
    - Added EXPECTED_CLI (3 files) and EXPECTED_SDK (3 files) lists
    - Updated readHtml helper to support subdirectory paths
    - Updated all nav link assertions for relative path format (../guide/, ../cli/)
**Build:** 62 pages generated without errors.
**Tests:** 2232/2232 passing (85 test files).
**Credits:** Scenario, feature, and tour docs originally authored in beta by @spboyer and team.
**Tone applied:** Light, prompt-first (beta tone preserved). No hype, no internal markers, CLI commands updated for v1 distribution.
**Notes:**
- docs/build.js already supported multi-directory sections — no build script changes needed
- docs/launch/ left untouched (internal release notes, separate concern)
- migration-github-to-npm.md at root left as-is (separate migration doc, not part of restructure)

### 2026-03-XX: Issue #421 — CLI help leads with default behavior
**Status:** Complete. PR #438 created.
**Changes made:**
1. **packages/squad-cli/src/cli-entry.ts** — Restructured help output (lines 68–115):
   - Before: Listed commands first, with "(default)" as an entry
   - After: Opens with headline "Just type — squad routes your message to the right agent automatically"
   - Added two quick examples: `squad` and `squad --global` before the full command list
   - Moved from command-focused to usage-focused messaging
**Tone applied:** 
- **Clear:** Lead with the main use case (natural language routing) before listing commands
- **Inviting:** "Just type" phrasing makes entry feel effortless
- **Grounded:** All examples are real and verified (no hype)
**Build:** TypeScript compilation succeeded. CLI help output now prioritizes user experience over exhaustive command listing.
**Notes:**
- Change is message-only; no API or behavior changes
- Help text is the first thing users see when confused — leading with primary use case reduces friction
- Examples placed before full Usage section so users understand the concept before diving into options
**PR:** https://github.com/bradygaster/squad-pr/pull/438
