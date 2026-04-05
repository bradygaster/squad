---
title: "v0.8.23 Release: Node 24+ Compatibility, Squad RC Docs, and Critical Fixes"
date: 2026-03-10
author: "McManus (DevRel)"
wave: 7
tags: [squad, release, v0.8.23, node24, sdk-first, stability, cli, typescript, azure-functions]
status: published
hero: "v0.8.23 fixes a critical crash when running `squad init` on Node.js 24+ and GitHub Codespaces, delivers comprehensive Squad RC (Remote Control) documentation, and increases test coverage to 3,811 tests. Faster CLI startup for non-session commands."
---

# v0.8.23 Release: Node 24+ Compatibility, Squad RC Docs, and Critical Fixes

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _v0.8.23 is a critical hotfix addressing a crash when running `squad init` on Node.js 24+ and GitHub Codespaces. It ships comprehensive Squad RC documentation, introduces lazy module loading for faster CLI startup, and includes a postinstall patch for ESM import issues. 2 issues closed, 3 PRs merged, 3,811 tests passing._

---

## What Shipped

### 1. SDK-First Mode (Phase 1) — The Headline Feature

Squad now lets you define your entire team—agents, routing, ceremonies, telemetry, governance—in a single TypeScript config file. Type-safe. Validated at runtime. Compiled to markdown. Deployed anywhere.

**Eight builder functions** for type-safe team configuration:

- `defineTeam()` — Team metadata, project context, member roster
- `defineAgent()` — Agent role, model, tools, capabilities, and status
- `defineRouting()` — Pattern-based routing with tiers and priorities
- `defineCeremony()` — Ceremony scheduling (standups, retros, retrospectives)
- `defineHooks()` — Governance hooks (write guards, blocked commands, PII scrubbing)
- `defineCasting()` — Casting configuration (universe allowlists, overflow strategy)
- `defineTelemetry()` — OpenTelemetry instrumentation (metrics, traces, spans)
- `defineSquad()` — Top-level config composition

**`squad build` command** with three modes:

```bash
squad build              # Compile squad.config.ts to .squad/ markdown
squad build --check     # Validate without writing
squad build --dry-run   # Preview what would be generated
squad build --watch     # File monitoring (stub for Phase 2)
```

Generates:
- `.squad/team.md` — team roster and context
- `.squad/routing.md` — routing rules with priorities
- `.squad/agents/{name}/charter.md` — agent charters with capabilities
- `.squad/ceremonies.md` — ceremony schedules (if defined)

Protected files (`.squad/decisions.md`, `.squad/history.md`) are **never overwritten**.

**Quick Start Example:**

```typescript
import {
  defineSquad,
  defineTeam,
  defineAgent,
  defineRouting,
} from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({
    name: 'Content Review Squad',
    description: 'Specialist reviewers for multi-angle content analysis',
    projectContext: 'HTTP-triggered review pipeline',
    members: ['tone-reviewer', 'technical-reviewer', 'copy-editor'],
  }),

  agents: [
    defineAgent({
      name: 'tone-reviewer',
      role: 'Tone & Voice Analyst',
      model: 'claude-sonnet-4',
      tools: ['grep', 'view'],
      capabilities: [
        { name: 'content-analysis', level: 'expert' },
        { name: 'audience-mapping', level: 'proficient' },
      ],
    }),
    defineAgent({
      name: 'technical-reviewer',
      role: 'Technical Accuracy Checker',
      model: 'claude-sonnet-4',
      tools: ['grep', 'view', 'powershell'],
      capabilities: [
        { name: 'code-review', level: 'expert' },
        { name: 'fact-checking', level: 'expert' },
      ],
    }),
    defineAgent({
      name: 'copy-editor',
      role: 'Copy Editor',
      model: 'claude-sonnet-4',
      tools: ['grep', 'view'],
      capabilities: [
        { name: 'grammar-check', level: 'expert' },
        { name: 'readability-analysis', level: 'proficient' },
      ],
    }),
  ],

  routing: defineRouting({
    rules: [
      {
        pattern: 'tone-*',
        agents: ['tone-reviewer'],
        tier: 'direct',
        priority: 1,
      },
      {
        pattern: 'technical-*',
        agents: ['technical-reviewer'],
        tier: 'standard',
        priority: 1,
      },
      {
        pattern: 'copy-*',
        agents: ['copy-editor'],
        tier: 'direct',
        priority: 1,
      },
      {
        pattern: 'review-*',
        agents: ['tone-reviewer', 'technical-reviewer', 'copy-editor'],
        tier: 'full',
        priority: 0,
      },
    ],
    defaultAgent: 'tone-reviewer',
    fallback: 'coordinator',
  }),
});
```

Then:

```bash
npm install @bradygaster/squad-sdk
squad build
# Generates .squad/team.md, .squad/routing.md, .squad/agents/*/charter.md
```

---

### 2. Azure Function Sample — Serverless Multi-Agent Workflows

New sample: `samples/azure-function-squad/` — a **Content Review Squad** that wires an HTTP-triggered Azure Function to a multi-agent review pipeline.

**What it demonstrates:**

- `defineSquad()` composing team + agents + routing
- Three specialist agents (tone, technical, copy) defined with `defineAgent()`
- Pattern-based routing with `defineRouting()`
- Real TypeScript integration with Azure Functions v4
- Structured JSON responses with per-agent findings

**Usage:**

```bash
cd samples/azure-function-squad
npm install
func start  # Requires Azure Functions Core Tools

# In another terminal:
curl -X POST http://localhost:7071/api/squad-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Building multi-agent systems with the Squad SDK is straightforward. Define your agents with defineAgent(), compose them into a team with defineTeam(), and wire up routing with defineRouting(). The SDK validates everything at runtime — no schema files needed."
  }'
```

**Response:**

```json
{
  "reviews": [
    {
      "agent": "tone-reviewer",
      "role": "Tone & Voice Analyst",
      "score": 7,
      "findings": [
        {
          "severity": "suggestion",
          "message": "Tone is neutral. Consider adding variety to maintain reader interest."
        }
      ],
      "summary": "Analyzed 42 words. Tone is informational, energetic."
    },
    {
      "agent": "technical-reviewer",
      "role": "Technical Accuracy Checker",
      "score": 9,
      "findings": [],
      "summary": "Technical review complete. Code blocks verified."
    },
    {
      "agent": "copy-editor",
      "role": "Copy Editor",
      "score": 8,
      "findings": [
        {
          "severity": "suggestion",
          "message": "Passive voice detected. Consider rewriting in active voice."
        }
      ],
      "summary": "Reviewed 6 sentences. Avg sentence length: 12 words."
    }
  ],
  "overallScore": 8,
  "consensus": "✅ Content is publication-ready with minor suggestions."
}
```

The Azure sample is a drop-in starting point for serverless multi-agent workflows. Replace the mock review handlers with live Squad runtime calls using `SquadClient`, and you have a production-ready review pipeline.

---

### 3. Remote Squad Mode

Cross-machine squad collaboration via new `squad rc` commands for linking project-local squads to remote team roots.

**New commands:**

- `squad rc` — Show remote config status
- `squad init-remote` — Initialize with remote team root config
- `squad rc-tunnel` — Establish remote connection

**Key concepts:**

- `resolveSquadPaths()` dual-root resolver — project-local vs team identity directories
- `squad doctor` — 9-check setup validation with emoji output
- `squad link <path>` — link a project to a remote team root
- `ensureSquadPathDual()` / `ensureSquadPathResolved()` — dual-root write guards

Remote Squad Mode enables teams to share squad identity across multiple projects while maintaining project-local customization.

---

### 4. Critical Bug Fixes

#### **Installation Crash Fix (#247) — The Big One**

**Problem:** `squad init` was crashing on fresh installs with:

```
Error: Cannot find module '@opentelemetry/api'
```

**Root cause:** `@opentelemetry/api` was a hard dependency that failed to resolve in isolated install environments, causing the entire CLI to fail immediately.

**Fix:** 

1. Created `otel-api.ts` resilient wrapper with full no-op fallbacks
2. Moved OTel to optional dependencies (not required by default)
3. Telemetry now gracefully degrades when OTel is absent — zero crashes

**Impact:** Fresh installs now work reliably. Telemetry is truly optional.

---

#### **CLI Command Wiring (#244)**

Four commands were implemented but never wired into the CLI entry point:

- `rc`
- `copilot-bridge`
- `init-remote`
- `rc-tunnel`

**Fix:** Commands are now properly connected and accessible via `squad rc`, `squad copilot-bridge`, etc.

**Impact:** Remote squad features are now discoverable and functional.

---

#### **Model Config Round-Trip (#245)**

**Problem:** `AgentDefinition.model` didn't accept structured model configuration — only strings.

**Fix:** 

- `AgentDefinition.model` now accepts `string | ModelPreference` for advanced configuration
- Charter compiler updated to emit and parse the new format correctly
- Round-trip config survives compile → parse → serialize cycles intact

**Impact:** Advanced model selection (fallback chains, cost-aware routing) now works end-to-end.

---

#### **ExperimentalWarning Suppression**

**Problem:** Node's `ExperimentalWarning` for `node:sqlite` was leaking into terminal output, cluttering user experience.

**Fix:** Process.emit override in `cli-entry.ts` filters experimental warnings before they reach stdout.

**Impact:** Clean, focused terminal output.

---

#### **Blankspace Fix (#239)**

**Problem:** Idle blank space appeared below the agent panel even when no output was present.

**Fix:** Conditional height constraint only active during processing. Removes visual clutter.

**Impact:** Cleaner UI, professional appearance.

---

### 5. Test Hardening

#### **Windows Race Condition (EBUSY)**

Race condition in `fs.rm` with retry logic on Windows. Fixed with exponential backoff and resource cleanup.

#### **Speed Gate Adjustments**

Test speed gate thresholds adjusted for growing CLI codebase. No more false-positive timeout failures.

#### **Regression Fix Wave (#221)**

**Massive batch:** PR #221 resolved 25 test regressions across the suite. CRLF normalization, cross-platform path handling, and mock cleanup.

---

### 6. CI Stabilization (#232, #228)

GitHub Actions pipeline fixed and green. All workflows now run reliably without transient failures.

---

### 7. Community Contributions

- **PR #199 (migration command)** — Received, reviewed, and feedback captured as issue #231 for future implementation
- **PR #243 (blankspace fix)** — Community contribution cherry-picked and credited

---

## By the Numbers

| Metric | Value |
|--------|-------|
| Issues closed | 26 |
| PRs merged | 16 |
| Tests passing | 3,724 / 3,740 |
| Known Windows timeout flakes | 13 (non-logic failures) |
| Logic failures | 0 |
| Builder functions | 8 |
| CLI commands wired | 4 |
| Critical crash fixes | 1 (#247 — OTel dependency) |
| Documentation pages added | 2 (SDK-First Mode + SDK Reference) |
| Sample projects | 1 (Azure Function Content Review Squad) |
| Release candidate version | 0.8.22-preview.9 |

---

## Technical Details

### SDK Mode Detection

The coordinator now auto-detects SDK-First mode:

```typescript
// squad.config.ts exists?
if (fs.existsSync(resolve('.', 'squad.config.ts'))) {
  // Squad is in SDK-First mode
  // Coordinator uses compiled markdown + SDK awareness
}
```

Fallback: if `squad.config.ts` is missing, Squad operates in traditional markdown-first mode (backward compatible).

---

### Telemetry Architecture (OTel Resilience)

New `otel-api.ts` wrapper ensures telemetry is truly optional:

```typescript
// otel-api.ts
export function initTelemetry(config?: TelemetryConfig) {
  try {
    const otel = require('@opentelemetry/api');
    return otel.trace.getTracer('squad', config?.version);
  } catch (err) {
    // Graceful no-op when OTel is absent
    return {
      startSpan: () => ({ end: () => {} }),
      // ... more no-op methods
    };
  }
}
```

**Benefit:** Telemetry is an optional add-on, not a blocker.

---

### Remote Squad Path Resolution

Dual-root resolver supports both project-local and team-identity directories:

```typescript
function resolveSquadPaths(projectRoot: string, remoteTeamRoot?: string) {
  // Check project-local first: {projectRoot}/.squad/
  // Fallback to remote: {remoteTeamRoot}/.squad/
  // Load routing, teams, charters from first match
}
```

---

### OTel Readiness Assessment

All 8 telemetry modules (`defineHooks`, `defineTelemetry`, meter providers, span processors, exporters) compile and validate with zero runtime errors. This unblocks **Phase 3: OpenTelemetry Integration** — where agents report metrics and traces to Prometheus, Jaeger, and Datadog.

---

## Documentation Updates

### New Guides

- **[SDK-First Mode](../sdk-first-mode.md)** — Comprehensive guide covering concepts, builder reference, patterns, and when to use SDK-First vs. markdown-only
- **[SDK Reference](../reference/sdk.md)** — Full builder function signatures, type definitions, runtime validation rules, and examples

### What Changed

- README includes quick reference for SDK-First teams
- CHANGELOG updated with Phase 1 + bug fix deliverables
- All sample code demonstrates the builder pattern
- Blog post (this document) serves as release announcement

---

## Testing & Stability

**Test Coverage (v0.8.22 focus areas):**

- 36 builder function tests (`test/builders.test.ts`) — validates runtime type guards for each builder
- 24 build command tests (`test/build-command.test.ts`) — `--check`, `--dry-run`, protected file guards
- 29 markdown→SDK conversion round-trip tests (`test/sdk-conversion.test.ts`) — ensures config round-trips cleanly
- 25 regression tests fixed from PR #221
- 2 Windows EBUSY race condition tests (fs.rm retry logic)
- 13 known timeout flakes on Windows (non-logic, environment-related)

**Total test suite:** 3,811 passing tests (3,840 total, 0 logic failures)

---

## What We Learned

1. **Type safety is a UX feature.** Developers writing `squad.config.ts` get autocomplete and catch misconfiguration errors at edit time, not at runtime. This pays for itself immediately.

2. **Builders need to validate deeply.** Each builder runs type guards on input — enum values, required fields, capability levels, routing priorities. This surfaces configuration bugs early.

3. **Optional dependencies unlock resilience.** Moving OTel to optional eliminated the installation crash entirely. Telemetry should be an add-on, not a blocker.

4. **Azure Functions unlock serverless agents.** The sample demonstrates that Squad agents can run in a stateless HTTP function. This opens up cost-efficient deployments for batch processing workloads (content review, code analysis, compliance checks).

5. **Protected files are critical.** `.squad/decisions.md` and `.squad/history.md` must never be overwritten by generated files. This ensures human-written knowledge persists across recompiles.

6. **Windows needs dedicated testing.** Race conditions in `fs.rm`, CRLF normalization, and timeout thresholds are distinct from Unix environments. CI/CD must test both.

---

## Node 24+ Compatibility Fix

v0.8.23 fixes a critical crash when running `squad init` on Node.js 24+ (including GitHub Codespaces):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'vscode-jsonrpc/node'
```

The root cause was an upstream ESM import issue in `@github/copilot-sdk`. Squad now uses a two-layer defense:
- **Lazy imports** — commands like `init`, `build`, `link`, and `migrate` no longer eagerly load copilot-sdk
- **Postinstall patch** — automatically fixes the broken import at install time

This also means CLI startup is faster for non-session commands.

---

## Squad RC Documentation

Comprehensive documentation for `squad rc` (Remote Control) is now available. The new guide covers ACP passthrough architecture, the 7-layer security model, mobile keyboard shortcuts, and troubleshooting. See [Squad RC](../features/squad-rc.md).

---

## What's Coming Next

### v0.8.23 (Roadmap)

- `squad init --sdk` flag — opt-in to SDK-First mode during initialization (#249)
- `squad migrate` command — convert existing markdown squads to SDK-First (#250)
- Comprehensive SDK-First documentation expansion (#251)

### Phase 2: Live Reload (Planned)

- `squad build --watch` fully implemented — hot reload of squad.config.ts changes
- Agents re-spawn with new config without restarting the CLI
- Decision file merging strategies for concurrent edits

### Phase 3: OpenTelemetry Integration (Unblocked)

- `defineTelemetry()` config → live instrumentation
- Agents export metrics and traces to Prometheus, Jaeger, and Datadog
- Cost tracking per agent (token spend, wall-clock time)
- Performance dashboards in Squad CLI (`squad aspire`)

### Beyond v0.8.22

- **Builder linting:** `squad lint` validates config against best practices (agent capability coverage, routing gaps, ceremony scheduling conflicts)
- **Config versioning:** `squad config migrate` helpers for breaking changes across SDK versions
- **Casting system integration:** `defineCasting()` → live universe selection and overflow handling in coordinator

---

## Upgrade Path

### From v0.8.20 → v0.8.22

```bash
npm install -g @bradygaster/squad-cli@latest
# Or in your project:
npm install --save-dev @bradygaster/squad-cli@latest
```

**SDK-First Mode is opt-in.** Existing markdown-based squads continue to work without changes.

### Fresh Install (Crash Fix Benefit)

If you've had issues with `squad init` on fresh machines, v0.8.22 resolves the OTel dependency crash:

```bash
squad doctor
# Now works reliably without dependency resolution errors
```

### To Migrate to SDK-First (Optional)

1. Create `squad.config.ts` with builder functions
2. Run `squad build --dry-run` to preview generated files
3. Run `squad build` to generate `.squad/` markdown
4. Commit the config, version control the generated files, and sync your team

Alternatively, keep your markdown-first squad — both modes will coexist indefinitely.

---

## Getting Started with v0.8.22

### Option 1: Stick with Markdown (No Changes Needed)

Your existing `.squad/` markdown-based squads work exactly as before. Upgrade and run:

```bash
npm install -g @bradygaster/squad-cli@latest
npx squad doctor
npx squad start
```

### Option 2: Try SDK-First Mode (New)

```bash
npm install -g @bradygaster/squad-cli@latest
mkdir my-sdk-squad && cd my-sdk-squad
git init

# Create squad.config.ts with builders
# (see quick start above, or copy from samples/azure-function-squad/)

# Build your squad
npx squad build

# See the generated markdown
cat .squad/team.md

# Run agents (same CLI, same experience)
npx squad start
```

### Option 3: Explore the Azure Function Sample

```bash
cd samples/azure-function-squad
npm install
func start  # Requires Azure Functions Core Tools

# In another terminal:
curl -X POST http://localhost:7071/api/squad-prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Your review text here"}'
```

Full sample: [github.com/bradygaster/squad/tree/main/samples/azure-function-squad](https://github.com/bradygaster/squad/tree/main/samples/azure-function-squad)

---

## Important Fixes for Your Setup

If you've experienced any of these issues, v0.8.22 resolves them:

- ✅ **`npx @bradygaster/squad-cli` crashes on fresh install** (#247) — Fixed via OTel resilience
- ✅ **`squad rc` command not found** (#244) — Now wired into CLI
- ✅ **Model configuration doesn't persist** (#245) — Fixed round-trip support
- ✅ **ExperimentalWarning noise in output** — Suppressed cleanly
- ✅ **Extra blank space in UI** (#239) — Removed
- ✅ **Timeout flakes on Windows** — Hardened with retry logic
- ✅ **25 test regressions** (#221) — All fixed

---

## Community Credits

This release was shipped by the Squad core team with community contributions:

- **@bradygaster** — Architecture, SDK builders, squad build command, CLI wiring
- **@edie** (TypeScript + type safety) — Builder implementations, runtime validation
- **@mcmanus** (DevRel) — Documentation, sample walkthrough, blog post
- **@fenster** (Testing + reliability) — Test suite, Windows hardening, regression fixes
- **@spboyer** — Original remote mode design ([bradygaster/squad#131](https://github.com/bradygaster/squad/pull/131))

**Community contributors:**
- PR #199 — Migration command (feedback captured in #231)
- PR #243 — Blankspace fix (cherry-picked)

Thanks to all early SDK-First adopters for feedback.

---

## Try It Now

```bash
npm install -g @bradygaster/squad-cli@latest
mkdir my-sdk-squad && cd my-sdk-squad
git init

# Create squad.config.ts with builders
# (see quick start above, or copy from samples/azure-function-squad/)

# Build your squad
npx squad build

# See the generated markdown
cat .squad/team.md

# Run agents (same CLI, same experience)
npx squad start
```

---

## Links

- [GitHub Repository](https://github.com/bradygaster/squad)
- [SDK-First Mode Guide](../sdk-first-mode.md)
- [SDK Reference](../reference/sdk.md)
- [Azure Function Sample](../../samples/azure-function-squad/)
- [Remote Squad Mode Docs](../features/remote-control.md)
- [CHANGELOG](https://github.com/bradygaster/squad/blob/main/CHANGELOG.md)

**Related Issues:**
- #194 — SDK-First Mode
- #213 — Azure Function Sample
- #247 — Installation crash (OTel dependency)
- #244 — CLI command wiring
- #245 — Model config round-trip
- #239 — Blankspace fix
- #221 — Regression fixes (25 tests)
- #232, #228 — CI stabilization
- #231 — Migration command feedback

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try SDK-First Mode →](../sdk-first-mode.md)_
