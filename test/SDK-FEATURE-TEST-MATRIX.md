# SDK Feature Test Matrix

> Audit of test coverage across all 50 SDK features for issue [#347](https://github.com/bradygaster/squad/issues/347) / [#341](https://github.com/bradygaster/squad/issues/341).
>
> **Generated from:** `upstream/dev` (commit `0d86da3`) + PR #425 (64 additional tests)

## Summary

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Verified (HIGH confidence) | 32 | 64% |
| 🟡 Partial (MEDIUM confidence) | 11 | 22% |
| ❌ No coverage (LOW confidence) | 7 | 14% |
| **Total** | **50** | — |

**Verified + Partial = 43/50 (86%)** — approaching the 90%+ threshold from the PRD.

---

## Full Matrix

### Init & Setup (Features 1–6)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 1 | `squad init` creates `.squad/` structure | ✅ | init.test.ts, cli/init.test.ts | "initSquad", "CLI: init command" | ~52 |
| 2 | `squad init --sdk` creates `squad.config.ts` | ✅ | init-sdk.test.ts, cli/init.test.ts | "squad init --sdk flag" | ~32 |
| 3 | Team casting / universe selection | ✅ | casting.test.ts, cast-parser.test.ts | "CastingEngine", "castTeam — usual-suspects / oceans-eleven" | ~45 |
| 4 | Casting state files | ✅ | casting-history.test.ts | "CastingHistory", "recordCast", "serialization" | ~24 |
| 5 | `.gitattributes` merge drivers | ✅ | init.test.ts, cli/init.test.ts | "should create .gitattributes for merge drivers" | ~3 |
| 6 | Config stays in sync with team.md | ✅ | agent-doc.test.ts, config-integration.test.ts, config.test.ts | "syncDocToConfig", "syncConfigToDoc", "detectDrift" | ~117 |

### Team Management (Features 7–11)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 7 | Adding team members (markdown) | ✅ | agent-doc.test.ts | "syncDocToConfig" — create stub agent, update tools | ~35 |
| 8 | Adding members updates config | ✅ | agent-doc.test.ts, config-integration.test.ts | "syncConfigToDoc", integration pipeline | ~95 |
| 9 | Removing team members | 🟡 | agent-doc.test.ts | Handles empty/missing sections; no explicit removal test | ~35 |
| 10 | Removing members updates config | 🟡 | agent-doc.test.ts, config-integration.test.ts | Inferred from sync tests, not explicitly tested | ~95 |
| 11 | Plugin marketplace check | ✅ | marketplace.test.ts, marketplace-advanced.test.ts, marketplace-integration.test.ts | "validateManifest", "searchMarketplace", "validateEntry" | ~159 |

### Spawning (Features 12–17)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 12 | Agent spawn with charter inline | ✅ | shell.test.ts, coordinator.test.ts, agent-session-manager.test.ts | "Spawn infrastructure", "spawn()", "loadAgentCharter" | ~115 |
| 13 | Model selection (4-layer) | ✅ | agents.test.ts, models.test.ts, model-fallback.test.ts | "ModelRegistry", "getFallbackChain", "Cross-tier fallback" | ~58 |
| 14 | Response mode selection | ✅ | response-tiers.test.ts, direct-response.test.ts | "selectResponseTier", "DirectResponseHandler" | ~60 |
| 15 | Parallel fan-out | ✅ | fan-out.test.ts, coordinator.test.ts | "spawnParallel", "aggregateSessionEvents" | ~55 |
| 16 | Drop-box pattern | ❌ | — | No dedicated tests found | 0 |
| 17 | Skill-aware routing | 🟡 | coordinator-routing.test.ts, skills.test.ts | "matchSkills", routing integration | ~56 |

### Routing (Features 18–21)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 18 | Routing table | ✅ | routing.test.ts, coordinator-routing.test.ts | "parseRoutingMarkdown", "matchRoute", "matchIssueLabels" | ~45 |
| 19 | Directive capture | ❌ | — | No dedicated tests found | 0 |
| 20 | Eager execution | ❌ | — | No dedicated tests found | 0 |
| 21 | Orchestration logging | 🟡 | otel-coordinator-traces.test.ts | "Coordinator routing tracing", "span hierarchy" | ~12 |

### Issues (Features 22–25)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 22 | GitHub repo connection | ✅ | platform-adapter.test.ts | "detectPlatformFromUrl", "parseGitHubRemote" | ~92 |
| 23 | Issue triage | ✅ | ralph-triage.test.ts, platform-adapter.test.ts | "triageIssue()", "triage parity" | ~121 |
| 24 | Issue→PR lifecycle | 🟡 | platform-adapter.test.ts | "WorkItem type", "PlatformAdapter createWorkItem" | ~92 |
| 25 | Label routing | ✅ | streams.test.ts, routing.test.ts | "getSubSquadLabelFilter", "filterIssuesBySubSquad", "matchIssueLabels" | ~62 |

### Ceremonies (Features 26–28)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 26 | Auto-triggered ceremonies | ✅ | builders.test.ts, sdk-feature-parity-batch2.test.ts | "defineCeremony()" — pr-merged & schedule triggers | ~12 |
| 27 | Manual ceremonies | ✅ | builders.test.ts, sdk-feature-parity-batch2.test.ts | "SDK Feature: Manual Ceremonies (#27)" | ~12 |
| 28 | Ceremony cooldown | ✅ | sdk-feature-parity-batch2.test.ts | "SDK Feature: Ceremony Cooldown (#28)" | ~4 |

### Ralph (Features 29–32)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 29 | Ralph activation | 🟡 | ralph-board.test.ts, ralph-monitor.test.ts | "watch board reporting", "board state compatibility" | ~42 |
| 30 | Work-check cycle | 🟡 | ralph-monitor.test.ts, ralph-board.test.ts | "event handling", "healthCheck()", "getStatus()" | ~15 |
| 31 | Idle-watch mode | 🟡 | ralph-monitor.test.ts, cli/watch.test.ts | "getStatus()", "CLI: watch command" | ~10 |
| 32 | Watch mode | ✅ | cli/watch.test.ts, squad-observer.test.ts | "CLI: watch command", "SquadObserver" | ~20 |

### PRD Mode (Features 33–35)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 33 | PRD intake | ❌ | — | No dedicated tests found | 0 |
| 34 | Lead decomposition | ❌ | — | No dedicated tests found | 0 |
| 35 | Work item routing | ✅ | coordinator-routing.test.ts, routing.test.ts | "Coordinator route()", routing rules compilation | ~45 |

### Human & Copilot (Features 36–38)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 36 | Human team members | ✅ | sdk-feature-parity-batch2.test.ts, human-journeys.test.ts | "SDK Feature: Human Team Members (#36)", journey roster coverage | ~20 |
| 37 | @copilot member | ✅ | cli/copilot.test.ts, cli/copilot-bridge.test.ts | "CLI: copilot command", "CLI: copilot-bridge command" | ~14 |
| 38 | @copilot auto-assign | 🟡 | cli/copilot.test.ts, type-extensions.test.ts | "--auto-assign test", "ParsedAgent: autoAssign field" | ~4 |

### Skills (Features 39–41)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 39 | Skill extraction | ✅ | cli/extract.test.ts, skills.test.ts | "CLI: extract command", "SkillRegistry" | ~32 |
| 40 | Skill confidence lifecycle | ✅ | sdk-feature-parity.test.ts, skills.test.ts | "SDK Feature: Skill Confidence Lifecycle", "matchSkills" | ~9 |
| 41 | Skills directory structure | ✅ | skill-source.test.ts, skills.test.ts | "LocalSkillSource", "SkillSourceRegistry" | ~26 |

### Worktree & Git (Features 42–44)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 42 | Worktree awareness | ✅ | sdk-feature-parity.test.ts, dual-root-resolver.test.ts | "SDK Feature: Worktree Awareness", "resolveSquadPaths()" | ~21 |
| 43 | Scribe git commits | ❌ | — | No dedicated tests found | 0 |
| 44 | Merge drivers | 🟡 | init.test.ts | "initSquad" — merge drivers test | ~1 |

### Reviewer (Features 45–46)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 45 | Reviewer lockout | ✅ | sdk-feature-parity.test.ts, sdk-feature-parity-batch2.test.ts | "SDK Feature: Reviewer Lockout", lockout integration | ~12 |
| 46 | Deadlock handling | 🟡 | sdk-feature-parity.test.ts | "SDK Feature: Deadlock Handling" | ~2 |

### Platform (Features 47–50)

| # | Feature | Status | Test File(s) | Key Describe Blocks | Tests |
|---|---------|--------|-------------|---------------------|-------|
| 47 | Client compatibility | ✅ | client.test.ts, adapter-client.test.ts, compat-v041.test.ts | "SquadClient", "SessionPool", compat tests | ~104 |
| 48 | MCP integration | ❌ | — | No dedicated tests found | 0 |
| 49 | Constraint budget | ✅ | sdk-feature-parity-batch2.test.ts, hooks.test.ts | "SDK Feature: Constraint Budget (#49)", hook pipeline tests | ~60 |
| 50 | Multi-agent artifact | ✅ | sdk-feature-parity-batch2.test.ts | "SDK Feature: Multi-Agent Artifact Coordination (#50)" | ~6 |

---

## Gap Analysis

### ❌ Untested Features (7)

| # | Feature | Notes |
|---|---------|-------|
| 16 | Drop-box pattern | No implementation or tests found — may be a planned feature |
| 19 | Directive capture | No test coverage; may be embedded in routing logic |
| 20 | Eager execution | No test coverage; may be embedded in coordinator logic |
| 33 | PRD intake | No test coverage; PRD mode features may be runtime-only |
| 34 | Lead decomposition | No test coverage; requires investigation into implementation status |
| 43 | Scribe git commits | No dedicated tests; Scribe agent behavior is charter-driven |
| 48 | MCP integration | No dedicated tests; platform adapter tests cover adjacent ground |

### 🟡 Partially Tested Features (11)

| # | Feature | Gap |
|---|---------|-----|
| 9 | Removing team members | Sync tests exist but no explicit "remove member" scenario |
| 10 | Removing members updates config | Inferred from sync, not explicitly tested |
| 17 | Skill-aware routing | Skill matching tested, but routing-to-skill integration is implicit |
| 21 | Orchestration logging | OTel traces tested, but orchestration-specific logging is thin |
| 24 | Issue→PR lifecycle | Platform adapter types tested, but full lifecycle flow isn't |
| 29 | Ralph activation | Board/monitor tested, but activation trigger logic is thin |
| 30 | Work-check cycle | Monitor tested, but cycle timing/state transitions aren't |
| 31 | Idle-watch mode | Watch command tested, but idle-to-active transition isn't |
| 38 | @copilot auto-assign | Type exists, CLI flag exists, but assignment logic isn't tested |
| 44 | Merge drivers | Init creates `.gitattributes`, but driver behavior isn't tested |
| 46 | Deadlock handling | Feature parity test exists but only ~2 tests — thin coverage |

---

## Recommendations to Reach 90%+

To move from 86% (43/50) to 90%+ (45/50), the most impactful additions would be:

1. **Feature 48 (MCP integration)** — Add tests for MCP protocol handling if implementation exists
2. **Feature 43 (Scribe git commits)** — Add tests for Scribe's commit formatting/behavior
3. **Feature 16 (Drop-box pattern)** — Determine if this is implemented; if so, add tests

Features 19, 20, 33, 34 may be runtime/behavioral features that are difficult to unit test, or may not yet have SDK-level implementations.
