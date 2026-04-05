---
title: "Welcome to the New Squad"
date: 2026-03-10
author: "McManus (DevRel)"
wave: null
tags: [squad, v0.8.18, release, launch, sdk, cli, typescript, samples, migration]
status: published
hero: "Squad v0.8.18 is here — a full TypeScript rewrite, npm distribution, 16 CLI commands, 8 SDK samples, 2200+ tests, and a feature set that turns multi-agent development from experiment to production tool."
---

# Welcome to the New Squad

> Blog post #22 — The complete guide to what changed from beta to v0.8.18.

## The Big Picture

Squad started as a scrappy beta experiment. A few scripts, some clever prompting, and a vision: what if you could build an AI team that lived in your repo, learned your codebase, and got better with every session?

Today, Squad is a proper npm-distributed, TypeScript-strict, fully-tested multi-agent runtime. It's not just a rewrite — it's a ground-up rebuild of everything we learned from six months of usage, feedback, and production deployments.

Here's what shipped:

**Quick Stats:**
- ✅ Full TypeScript rewrite (strict mode, no `any` escapes)
- ✅ 16 CLI commands (init, doctor, triage, shell, aspire, and more)
- ✅ 8 SDK samples (hello-world to full autonomous pipelines)
- ✅ 2200+ tests across 613 test files
- ✅ npm-only distribution (`@bradygaster/squad-cli`)
- ✅ Global install: `npm install -g @bradygaster/squad-cli`
- ✅ OpenTelemetry integration (traces + metrics → Aspire dashboard)
- ✅ Security hardening (CWE-78 fixes, PII scrubbing, governance hooks)
- ✅ Semantic versioning compliance (`X.Y.Z-preview.N`)

If you were on the beta (v0.5.x), this is your upgrade moment. If you're new to Squad, this is the best time to jump in.

---

## How to Get It

Three lines:

```bash
npm install -g @bradygaster/squad-cli
cd your-project
squad init
```

**Or run with squad directly (after global install):**

```bash
squad init
```

**Upgrading from beta?** Check the [Migration Guide](../get-started/migration.md) for step-by-step upgrade instructions covering 9 scenarios from brand-new users to CI/CD pipelines.

---

## What Changed — The Headlines

Here's the side-by-side comparison of beta vs. v0.8.18:

| Area | Beta (v0.5.x) | New (v0.8.18) |
|------|---------------|---------------|
| **Language** | JavaScript | TypeScript (strict mode) |
| **Distribution** | GitHub-native (`npm install -g @bradygaster/squad-cli`) | `npm install -g @bradygaster/squad-cli` |
| **Packages** | Monolithic | SDK + CLI (independent versioning) |
| **Config** | JSON only | Markdown + optional `squad.config.ts` |
| **Shell** | Basic | Rich REPL with streaming, sessions, keyboard shortcuts |
| **Testing** | Minimal | 2200+ tests across 613 files |
| **Observability** | None | OpenTelemetry + Aspire dashboard |
| **Security** | Basic | CWE-78 fixes, PII scrubbing, governance hooks |
| **Versioning** | Inconsistent | Semver compliant (`X.Y.Z-preview.N`) |
| **Documentation** | Sparse | Comprehensive docs, samples, and tutorials |

The beta was a proof of concept. v0.8.18 is the production-ready runtime.

---

## The CLI — Your New Command Center

The CLI went from "a few scripts" to "a full terminal experience." Here's what you get:

### 1. **Global Install** — `squad` Works Everywhere

No more old CLI commands. Install once, run anywhere:

```bash
npm install -g @bradygaster/squad-cli
squad --version
```

That's it. Squad is now a first-class terminal command.

### 2. **Interactive Shell** — Live Multi-Agent REPL

Run `squad` with no arguments and you drop into a live terminal:

```bash
squad
```

You get a prompt:

```
squad >
```

**What you can do:**
- Address agents by name: `@Ripley, fix the auth bug`
- Run slash commands: `/status`, `/agents`, `/history`, `/quit`
- Watch responses stream token-by-token in real time
- Navigate history with arrow keys
- Tab completion for agents and commands

No more typing `squad` before every command. The shell is stateful, context-aware, and built for conversation.

### 3. **`squad doctor`** — 9-Check Health Validation

Something feels off? Run the doctor:

```bash
squad doctor
```

Nine checks run instantly:
- ✅ Node.js version (≥ 20)
- ✅ `gh` CLI installed and authenticated
- ✅ `.squad/` directory exists
- ✅ `team.md` is valid markdown
- ✅ Agent charters are present
- ✅ GitHub Copilot access
- ✅ Directory write permissions
- ✅ Config file syntax
- ✅ No orphaned files

If anything fails, you get a clear error message and suggested fix. No more guessing.

### 4. **`squad start --tunnel`** — Stream Your Terminal to Your Phone

Demoing Squad to a remote audience? Run:

```bash
squad start --tunnel
```

You get a QR code. Scan it with your phone. Your terminal output streams live to a web browser — perfect for presentations, demos, and remote debugging.

### 5. **`squad triage`** — Auto-Scan GitHub Issues

Connect Squad to your GitHub repo and watch it auto-triage:

```bash
squad triage
```

Squad scans open issues, labels them by category (bug/feature/docs/security), and assigns them to the right agent based on their role and skills. Runs continuously — every 10 minutes by default.

```bash
squad triage --interval 5   # Poll every 5 minutes
```

Your backlog manages itself.

### 6. **`squad copilot`** — Add @copilot as a Team Member

Want the GitHub Copilot coding agent to pick up issues autonomously? Add it to your team:

```bash
squad copilot
```

This adds `@copilot` as an agent in `.squad/team.md` and configures auto-assignment. When Squad triages an issue, @copilot picks it up, creates a branch, writes code, runs tests, and opens a PR.

Remove it with:

```bash
squad copilot --off
```

### 7. **Dual-Root Mode** — Org-Wide Team Sharing

Most teams want one Squad per repo. But some organizations want to share a team identity across projects. Dual-root mode gives you both:

```bash
squad init --mode remote ~/my-org-team
```

This stores agent charters and team config in `~/my-org-team/.squad/`, while project-specific state lives in `./squad/`. Agents are consistent across repos, but each project has its own decisions, skills, and context.

Perfect for agencies, consulting teams, and orgs with standardized agent roles.

### 8. **Plugin Marketplace** — Community Skill Packs

Extend Squad with community-built skill packs:

```bash
squad plugin marketplace list
squad plugin marketplace add https://github.com/user/squad-skills
```

Skills are markdown files that agents read to learn domain patterns. A "TypeScript Best Practices" skill pack might teach agents to prefer `unknown` over `any`, use strict mode, and avoid non-null assertions.

### 9. **`squad export`/`import`** — Portable Squad Snapshots

Need to share your team config with a colleague or back up your setup?

```bash
squad export > my-squad.json
squad import my-squad.json
```

The export includes team roster, agent charters, decisions, skills, and config. Import into any repo and your team comes alive instantly.

### 10. **`squad aspire`** — Observability Dashboard

Squad exports OpenTelemetry traces and metrics. Launch the Aspire dashboard to see:

```bash
squad aspire
```

- Agent spawn/destroy events
- Token usage per agent, per session
- Task duration histograms
- Session lifecycle logs
- Cost tracking in real time

Hook it up to Jaeger, Aspire, or any OTLP-compatible backend.

### 11. **`squad upgrade`** — Safe Upgrades That Never Touch Your Team State

Upgrading used to be scary. Not anymore:

```bash
squad upgrade
```

This updates Squad-owned files (templates, CLI scripts, SDK code) but never touches:
- `.squad/agents/**` (your agent charters)
- `.squad/decisions.md` (architectural decisions)
- `.squad/skills/**` (learned patterns)
- `.squad/history/**` (session logs)

Your team's memory is sacred. Upgrades respect that.

---

## The SDK — Build Your Own Multi-Agent Apps

The CLI is built on the SDK. The SDK is the runtime. You can use it directly to build custom multi-agent applications.

**Two packages, independent versioning:**
- `@bradygaster/squad-sdk` — the runtime (casting, streaming, governance, cost tracking)
- `@bradygaster/squad-cli` — the interface (commands, REPL, triage loop)

They evolve separately. CLI features can ship without breaking SDK consumers.

**Install the SDK:**

```bash
npm install @bradygaster/squad-sdk
```

**Key SDK Capabilities:**

| Component | What It Does |
|-----------|-------------|
| **CastingEngine** | Deterministic, themed agent naming. Cast a team from "The Usual Suspects" or "The Avengers." Names persist across sessions. |
| **StreamingPipeline** | Token-by-token LLM output with `onDelta()`, `onUsage()`, and `onReasoning()` handlers. |
| **HookPipeline** | Governance as code: file-write guards, PII scrubbing, reviewer lockout, rate limiting. |
| **CostTracker** | Budget-aware agent routing. Track tokens and costs per agent, per session. Warn at 70%, block at 100%. |
| **SkillRegistry** | Runtime pattern discovery. Agents write `SKILL.md` files, share knowledge across sessions. |
| **EventBus** | Pub/sub for cross-agent communication. Subscribe to `session:created`, `message:sent`, `cost:threshold`. |
| **SessionPool** | Managed Copilot session lifecycle. Reuse sessions across messages, clean up on shutdown. |

**TypeScript-first:**

Every interface, type, and function is fully typed. No `any` escapes. If it compiles, it's correct.

---

## The Samples — See It In Action

Eight samples ship with v0.8.18. Each one demonstrates a slice of the SDK. Run them, read the code, learn the patterns.

### 1. **hello-squad** (Beginner)

**What it does:** Cast a themed team from The Usual Suspects universe. Watch four agents materialize with deterministic names. The casting engine's "hello world."

**What you'll see:**
```
🎭 Keyser — Lead
   Personality: Quietly commanding; sees the whole board before anyone else.

🎭 McManus — Developer
   Personality: Sharp, precise, always three steps ahead.

🎭 Fenster — Tester
   Personality: Unpredictable, curious, finds edge cases by instinct.

🎭 Verbal — Scribe
   Personality: The storyteller; connects dots across sessions.
```

**Difficulty:** Beginner  
**SDK APIs:** `resolveSquad()`, `CastingEngine.castTeam()`, `onboardAgent()`

**Run it:**
```bash
cd samples/hello-squad
npm install && npm start
```

---

### 2. **knock-knock** (Intermediate)

**What it does:** Two Copilot sessions trade live knock-knock jokes, streaming token-by-token. Demonstrates `SquadClientWithPool`, casting, and `StreamingPipeline`.

**What you'll see:**
```
🎭 Agent 1: Knock knock.
🎭 Agent 2: Who's there?
🎭 Agent 1: Lettuce.
🎭 Agent 2: Lettuce who?
🎭 Agent 1: Lettuce in, it's cold out here! 🥶
```

Responses stream word-by-word in real time. Watch the jokes build character by character.

**Difficulty:** Intermediate  
**SDK APIs:** `SquadClientWithPool`, `CastingEngine`, `StreamingPipeline`, `SessionPool`, `EventBus`

**Run it:**
```bash
cd samples/knock-knock
npm install && npm start
```

---

### 3. **rock-paper-scissors** (Advanced)

**What it does:** Nine strategic agents battle in a tournament. Rocky always throws rock. Sherlock analyzes opponent history to predict and counter moves. A live leaderboard tracks wins.

**What you'll see:**
```
Match: Rocky vs. Sherlock — Round 1

Rocky throws: rock
Sherlock analyzes opponent history...
Sherlock plays strategically: paper
Scorekeeper: Rocky throws rock AGAIN! Sherlock counters with paper. Strategic victory! 📄 > 🪨

Sherlock: 1 win | Rocky: 0 wins

[After 10 rounds]
🏆 LEADERBOARD 🏆
1. Sherlock 🔍: 12 wins
2. Metronome 🔄: 8 wins
3. Chaos 🎲: 7 wins
4. Echo 🦜: 5 wins
5. Rocky 🪨: 2 wins
```

Watch the learning agent adapt. Sherlock's win rate climbs as it detects patterns.

**Difficulty:** Advanced  
**SDK APIs:** `SquadClientWithPool`, `SessionPool`, `StreamingPipeline`, `EventBus`, system prompts

**Run it:**
```bash
cd samples/rock-paper-scissors
npm install && npm start
```

---

### 4. **hook-governance** (Intermediate)

**What it does:** Four governance hooks in action. File-write guards block `/etc/passwd`. PII scrubber redacts emails. Reviewer lockout prevents self-revision. Rate limiter caps user interruptions.

**What you'll see:**
```
🛡️  hook-governance — Squad SDK governance hooks sample

────────────────────────────────────────────────────────────
  Demo 1 — File-Write Guards
────────────────────────────────────────────────────────────
  Write to src/utils/helper.ts: allow ✅
  Write to /etc/passwd: block 🚫
  Reason: File write blocked: "/etc/passwd" does not match allowed paths

────────────────────────────────────────────────────────────
  Demo 2 — PII Scrubbing
────────────────────────────────────────────────────────────
  Before: Deploy fix by brady@example.com — cc: alice@company.io
  After:  Deploy fix by [EMAIL_REDACTED] — cc: [EMAIL_REDACTED]
```

**Rules as code, not prompts.** Hooks enforce policy at runtime. No LLM reasoning required.

**Difficulty:** Intermediate  
**SDK APIs:** `HookPipeline`, `addPreToolHook()`, `addPostToolHook()`, `getReviewerLockout()`, `PolicyConfig`

**Run it:**
```bash
cd samples/hook-governance
npm install && npm start
```

---

### 5. **streaming-chat** (Intermediate)

**What it does:** Three agents respond to keyword-routed messages in real time. Type "design an API" → Backend responds. Type "add dark mode" → Frontend delivers. Token-by-token streaming.

**What you'll see:**
```
squad > design a REST API for recipes

Backend (McManus) responding...
I recommend a resource-based API with these endpoints:
  - GET /recipes — list all recipes
  - GET /recipes/:id — single recipe
  - POST /recipes — create new recipe
  - PUT /recipes/:id — update recipe
  - DELETE /recipes/:id — remove recipe

Use JSON for all payloads. Add pagination with ?page= and ?limit=.
```

**Difficulty:** Intermediate  
**SDK APIs:** `SquadClient`, `createSession()`, `StreamingPipeline`, `onDelta()`, `onUsage()`, `EventBus`

**Run it:**
```bash
cd samples/streaming-chat
npm install && npm start
```

---

### 6. **cost-aware-router** (Beginner)

**What it does:** Five tasks flow through a cost-optimized router. Typo fix → Direct tier (cheapest). Architecture review → Full tier (premium). A budget bar fills up with warnings at 70% and 90%.

**What you'll see:**
```
Task 1: Fix typo in README
  → Tier: direct (no LLM needed)
  → Cost: $0.00
  → Budget: $0.00 / $0.50 [██░░░░░░░░] 0%

Task 2: Update docs
  → Tier: lightweight (fast model)
  → Cost: $0.02
  → Budget: $0.02 / $0.50 [██░░░░░░░░] 4%

Task 3: Implement feature
  → Tier: standard (standard model)
  → Cost: $0.15
  → Budget: $0.17 / $0.50 [████░░░░░░] 34%

Task 4: Architecture review
  → Tier: full (premium model)
  → Cost: $0.25
  → Budget: $0.42 / $0.50 [████████░░] 84%
  ⚠️  Budget warning: 84% consumed
```

**Difficulty:** Beginner  
**SDK APIs:** `CostTracker`, `selectResponseTier()`, `getTier()`, `recordUsage()`, `formatSummary()`

**Run it:**
```bash
cd samples/cost-aware-router
npm install && npm start
```

---

### 7. **skill-discovery** (Intermediate)

**What it does:** Agents load domain knowledge from SKILL.md files, match skills to tasks, and discover NEW patterns at runtime. Confidence tracks from low → medium → high as patterns are confirmed.

**What you'll see:**
```
📚 Loading skills from .squad/skills/

✅ Loaded: TypeScript Patterns (confidence: high 🟢)
   Triggers: typescript, types, generics
   Roles: developer, lead

✅ Loaded: Testing Best Practices (confidence: medium 🟡)
   Triggers: test, coverage, mock
   Roles: tester

🔍 Matching skills to task: "Fix TypeScript build error"
   Matched: TypeScript Patterns (confidence: high)
   Reason: Trigger match: "typescript"
```

**Difficulty:** Intermediate  
**SDK APIs:** `SkillRegistry`, `loadSkillsFromDirectory()`, `matchSkills()`, `parseSkillFile()`

**Run it:**
```bash
cd samples/skill-discovery
npm install && npm start
```

---

### 8. **autonomous-pipeline** (Advanced)

**What it does:** THE showcase. A 10-task dev pipeline runs autonomously. Agents pick up work, route blockers, record decisions, accumulate learnings. A live dashboard shows who's working on what.

**What you'll see:**
```
🎬 autonomous-pipeline — Squad SDK Showcase

────────────────────────────────────────────────────────────
  Casting Team from "The Usual Suspects"
────────────────────────────────────────────────────────────
  🎭 Keyser — Lead
  🎭 McManus — Developer
  🎭 Fenster — Tester
  🎭 Verbal — Scribe

────────────────────────────────────────────────────────────
  Task Queue (10 tasks)
────────────────────────────────────────────────────────────
  1. [ ] Design REST API for recipes
  2. [ ] Implement JWT authentication
  3. [ ] Write unit tests for auth
  4. [ ] Create API documentation
  5. [ ] Security audit: SQL injection
  6. [ ] Add pagination to /recipes
  7. [ ] Deploy to staging
  8. [ ] Write migration guide
  9. [ ] Update README
 10. [ ] Record architecture decisions

────────────────────────────────────────────────────────────
  Autonomous Execution
────────────────────────────────────────────────────────────
  McManus picked up: Design REST API
  McManus routed to Fenster: Write unit tests
  Fenster recorded decision: Use RS256 for JWT
  Verbal accumulated learning: Pool size 20 optimal

[Live dashboard updates in real time]

────────────────────────────────────────────────────────────
  Final Report
────────────────────────────────────────────────────────────
  ✅ 10 tasks completed
  💰 Total cost: $1.47
  🪙 Tokens: 45,230 input / 12,890 output
  📊 OTel traces exported to Aspire dashboard
```

This is the "wow demo" — everything Squad can do in one running script.

**Difficulty:** Advanced  
**SDK APIs:** `SquadClient`, `CastingEngine`, `HookPipeline`, `CostTracker`, `EventBus`, `StreamingPipeline`, `resolveSquad()`, `createSession()`

**Run it:**
```bash
cd samples/autonomous-pipeline
npm install && npm start
```

---

## Under the Hood — What We Rebuilt

### TypeScript Strict Mode

Everything is typed. No `any` escapes. No implicit `any`. No index access without guards. If it compiles, it's correct.

**What this means for SDK consumers:**
- Autocomplete works everywhere
- Type errors caught at compile time
- Refactoring is safe
- Documentation lives in the types

The SDK exports fully-typed interfaces for every concept: agents, sessions, tiers, hooks, skills, events.

### Semver Done Right

Beta versions were a mess: `0.8.5.1-preview`, `0.8.6.1`, inconsistent formats. v0.8.18 follows the spec:

**Correct format:** `X.Y.Z-preview.N`  
**Example:** `0.8.18-preview.1`

Prerelease identifier comes after patch, build metadata comes after prerelease. No more confusion.

**What this enables:**
- Proper dependency resolution in npm
- Correct version comparisons
- Predictable upgrade paths
- Semver-compliant tooling support

### Security Hardening

#### CWE-78 Fixes

Beta used template strings with `execSync`. This was a shell injection risk. v0.8.18 uses `execFileSync` with array args:

**Before (unsafe):**
```typescript
execSync(`git commit -m "${message}"`);
```

**After (safe):**
```typescript
execFileSync('git', ['commit', '-m', message]);
```

No shell interpolation. No injection vectors.

#### PII Scrubbing

Email addresses leak into logs, tool output, and session history. v0.8.18 includes automatic PII scrubbing:

```bash
squad scrub-emails
```

This redacts all emails in `.squad/` files:
- `brady@example.com` → `[EMAIL_REDACTED]`
- Works recursively on all markdown and JSON files
- Safe to commit the scrubbed state

#### Governance Hooks

Policy as code. Hooks run before and after every tool call:

- **Pre-tool hooks:** Block file writes outside allowed paths
- **Post-tool hooks:** Redact PII from output
- **Custom hooks:** Add audit logging, quota enforcement, content filters

No LLM reasoning required. Rules are code, not prompts.

### CRLF Normalization

Windows users with `core.autocrlf=true` saw parser failures because `\r\n` line endings broke markdown frontmatter parsing. v0.8.18 normalizes all line endings before parsing.

**What changed:**
- All 8 parsers now call `normalizeEol()` first
- `\r\n` → `\n` before regex matching
- Windows/Mac/Linux all parse identically

No more "works on my machine" bugs.

### OpenTelemetry Integration

Squad exports traces and metrics via OpenTelemetry. Three-layer API:

1. **Low-level:** `otel.ts` — raw OTel SDK wrappers
2. **Bridge:** `otel-bridge.ts` — Squad-specific spans and metrics
3. **Init:** `otel-init.ts` — auto-configure based on `OTEL_EXPORTER_OTLP_ENDPOINT`

**What you can track:**
- Agent spawn/destroy events
- Session lifecycle (created/resumed/closed)
- Token usage per agent, per session
- Task duration histograms
- Cost accumulation in real time

**Export to:**
- .NET Aspire Dashboard (`squad aspire`)
- Jaeger
- Zipkin
- Any OTLP-compatible backend

**Example:**
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
squad aspire
```

Open `http://localhost:18888` to see your multi-agent pipeline visualized.

---

## Migrating from Beta

If you're on beta (v0.5.x), here's the upgrade path:

### Quick Migration

```bash
# 1. Back up your current squad
cp -r .squad/ .squad-backup/

# 2. Uninstall old beta
npm uninstall -g @bradygaster/create-squad

# 3. Install new CLI
npm install -g @bradygaster/squad-cli

# 4. Reinitialize (this will detect and migrate your .squad/ directory)
squad init

# 5. Verify
squad doctor
```

### Full Migration Guide

The [Migration Guide](../get-started/migration.md) covers 9 scenarios:

1. Brand new user
2. Upgrading from v0.5.4 beta
3. Already on v0.8.x via npm
4. Was using `@bradygaster/create-squad`
5. Was using `npx github:` distribution
6. `.squad/` directory broke after upgrading
7. Have `.ai-team/` from an older version
8. Using Squad in CI/CD
9. Using Squad SDK programmatically

**Key changes to watch for:**
- Package name: `@bradygaster/create-squad` → `@bradygaster/squad-cli`
- Directory: `.ai-team/` → `.squad/` (auto-migrated with `--migrate-directory`)
- Config: JSON → Markdown (`.squad/team.md`, `.squad/decisions.md`)
- Commands: Some were renamed or merged (check `squad help`)

---

## What's Next

Squad v0.8.18 is the foundation. Here's what we're working on:

### Short-Term (Next 4 Weeks)
- More samples and tutorials
- Plugin marketplace growth (community skill packs)
- CLI polish (better error messages, progress bars, colors)
- Documentation improvements (video walkthroughs, interactive guides)

### Medium-Term (Next 12 Weeks)
- Multi-repo squad support (one team, many projects)
- Enhanced observability (real-time dashboards, cost alerts)
- CI/CD integrations (GitHub Actions, GitLab CI, CircleCI)
- Team collaboration features (shared squads, sync protocols)

### Long-Term (Next 6 Months)
- Visual squad builder (drag-and-drop agent creation)
- Agent marketplace (community-built agent templates)
- Cloud-hosted squads (no local setup required)
- Enterprise features (SSO, audit logs, compliance hooks)

**Community contributions welcome!** Issues and PRs at [github.com/bradygaster/squad](https://github.com/bradygaster/squad).

---

## Get Started Today

Squad v0.8.18 is live on npm. Install it:

```bash
npm install -g @bradygaster/squad-cli
```

Initialize a project:

```bash
cd your-project
squad init
```

Launch the shell:

```bash
squad
```

Start building.

---

## Resources

- **GitHub:** [github.com/bradygaster/squad](https://github.com/bradygaster/squad)
- **SDK on npm:** [@bradygaster/squad-sdk](https://www.npmjs.com/package/@bradygaster/squad-sdk)
- **CLI on npm:** [@bradygaster/squad-cli](https://www.npmjs.com/package/@bradygaster/squad-cli)
- **Migration Guide:** [docs/get-started/migration.md](../get-started/migration.md)
- **Samples:** [samples/README.md](https://github.com/bradygaster/squad/blob/main/samples/README.md)
- **Issues:** [github.com/bradygaster/squad/issues](https://github.com/bradygaster/squad/issues)

---

**Questions? Feedback? Ideas?** File an issue. Join the community. Build something amazing.

Welcome to Squad v0.8.18. Let's build better software, together. 🚀

---

_McManus (DevRel) — March 10, 2026_
