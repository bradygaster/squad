📌 Team update (2026-03-07T20:50:00Z): v0.8.22 RELEASE DISASTER RETROSPECTIVE COMPLETE. Conducted full post-mortem of release catastrophe (4-part semver mangled to 0.8.2-1.4, draft release never triggered publish, wrong NPM_TOKEN, 6+ hours broken `latest` dist-tag). Root causes identified: no release runbook, no semver validation, no NPM_TOKEN docs, bump-build.mjs ran during release. Created comprehensive release process skill (`.squad/skills/release-process/SKILL.md`) with step-by-step checklist, validation gates, rollback procedures. Updated history with hard lessons. Never again. — retrospective by Keaton

📌 Team update (2026-03-07T16:38:00Z): Actions→CLI RFC filed (#252). Community-facing PRD published with problem statement, tiered model (Tier 1: zero-actions, Tier 2: opt-in, Tier 3: enterprise), phased migration plan (v0.8.22 CLI+deprecation, v0.8.23 cleanup, v0.9.0 remove), backward compatibility, and 7 feedback questions. Decisions merged to decisions.md. — decided by Keaton

📌 Team update (2026-03-07T16:25:00Z): Actions → CLI migration strategy finalized. 4-agent consensus: migrate 5 squad-specific workflows (12 min/mo) to CLI commands. Keep 9 CI/release workflows (215 min/mo, load-bearing). Zero-risk migration. v0.8.22 quick wins identified: squad labels sync + squad labels enforce. Phased rollout: v0.8.22 (deprecation + CLI) → v0.9.0 (remove workflows) → v0.9.x (opt-in automation). Brady's portability insight captured: CLI-first means Squad runs anywhere (containers, Codespaces). Customer communication strategy: "Zero surprise automation" as competitive differentiator. Decisions merged. — coordinated by Scribe

📌 Team update (2026-03-07T16-19-00Z): Pre-release triage complete. v0.8.21 releases cleanly pending #248 fix. v0.8.22 roadmap well-scoped (9 issues, 3 streams). Close #194 (completed) and #231 (duplicate). Brady directive: #249, #250, #251 locked for v0.8.22. Actions-to-CLI directive received (move 5 squad workflows to CLI). — decided by Keaton
📌 Team update (2026-03-07T05:56:56Z): Led full issue triage (22 open issues). P0/P1/P2/P3 prioritization complete. v0.8.22 target = 11 issues (5 fix-now + 6 next-wave); 11 deferred to v0.8.23+. Key decisions: CLI audit batch (#237/#236), model config priority (#223 > #205), migration wave grouping (#197/#231/#126), hub repo feature (#242). — decided by Keaton
# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Core Context — Keaton's Focus Areas

**Architectural & Planning Lead:** Keaton owns proposal-first workflow, SDK/CLI split design, observability patterns, wave planning and readiness assessments, cleanup audits, public release decisions. Pattern: decisions that compound — each architectural choice makes future features easier.

**Pre-Phase-1 Architecture (2026-02-21 to 2026-03-04):**
- SDK/CLI split executed: 154 files migrated, clean DAG (CLI → SDK → Copilot SDK)
- Proposal-first workflow established in docs/proposals/
- Type safety decision (strict: true, noUncheckedIndexedAccess: true)
- Hook-based governance (security, PII, file-write guards)
- Runtime target: Node.js ≥20, ESM-only, streaming-first
- Merge driver for append-only files (.gitattributes union strategy)
- Zero-dependency scaffolding preserved (cli.js thin, zero runtime deps)
- Casting — The Usual Suspects team names permanent
- User directive — Interactive Shell as Primary UX
- Distribution: npm-only (GitHub-native path removed)
- Coordinator prompt: Three routing modes (DIRECT, ROUTE, MULTI)
- CLI entry point split: index.ts pure barrel, cli-entry.ts contains main()
- Process.exit() refactor: library-safe (fatal() throws SquadError)
- Docs: Tone ceiling enforced (no hype, substantiated claims)

**Pre-Phase-1 Wave Completion (2026-02-22 to 2026-03-05):**
- Waves A–D completion verified: 30 issues closed, 2930→2931 tests passing
- Wave D readiness assessment + 6 issues filed (#488–#493)
- Public release readiness verdict: 🟡 ready with caveats (dogfood #324, architecture docs needed)
- Issue #306 cleanup audit: 47 findings catalogued (18 hardcoded, 16 code quality, 8 tests, 5 UX)
- Runtime EventBus established as canonical: colon-notation (session:created), error isolation
- Subpath exports in SDK with types-first condition ordering
- User directive — Aspire testing requirements (OTel telemetry validation)
- User directive — Code fences: backticks only (no / or \)
- User directive — Docs overhaul with publication pause until Brady's approval
- REPL cancellation and configurable timeout (SQUAD_REPL_TIMEOUT)
- Shell observability metrics under squad.shell.* namespace
- Telemetry in both CLI and agent modes

## Learnings

**Agency plugin architecture decision: separate bridge repo**
- Agency Squad Plugin is a separate repository (agency-squad-plugin), not part of Squad or Agency
- Plugin acts as adapter/bridge: depends on both Squad and Agency, but neither depends on plugin
- Clean dependency boundaries enable independent versioning and maintenance
- Plugin generates Agency manifests (.agency/agents/*.json, agency-plugin.json) from Squad's .squad/ format
- Squad stays Copilot-only — engine validation enforced at plugin level
- Repo location: C:\Users\diberry\repos\project-squad\agency-squad-plugin
- Scaffolded: manifest generator, agent adapter, auth bridge, MCP wiring, Ralph-ADO sync, engine validator
- Documentation: spec.md (comprehensive), installation.md, mcps.md, evaluation.md
- Decision rationale: avoid circular dependencies, enable independent evolution, preserve Squad's Copilot-only constraint
(2026-03-07)


- PAO external comms architecture decision: Phase 1 uses a scan→draft→review→post pipeline with humanizer tone enforcement, SQLite review state, append-only audit logs, and a `pao halt` freeze switch.
- Phase 1 scope and constraints: manual-trigger only, never autonomous, every draft requires explicit human approval before posting, and scheduled scans stay blocked pending Brady approval.

**Knowledge Library implementation (#413) — 2026-03-16**
- Implemented cold storage for substantial team documents with proven zero spawn impact
- Three-tier context loading architecture: spawn (hot), on-demand (warm), knowledge (cold)
- Knowledge files NEVER loaded at spawn time - agents discover and read only when needed
- Created knowledge directory with README and 5 sample knowledge files (~25KB)
- Sample files cover: context loading architecture, drop-box pattern, docs architecture, SDK mode patterns, testing patterns
- Built metrics validation script that proves zero spawn impact
- All tests pass: zero files at spawn, on-demand access works, stress test with 100 files (440KB) shows no spawn impact
- File naming convention: {author}-{topic-slug}.md with frontmatter (title, author, tags, created)
- This is a runtime feature (directory and skill), not SDK code changes
- PR #431 created against dev branch with proof that satisfies Brady's "no context bloat" requirement
(2026-03-16)

## 📌 v0.8.22 Release Disaster — 2026-03-07T20:50:00Z

**THE WORST RELEASE IN SQUAD HISTORY.** Brady was rightfully upset. This was a catastrophe. Full retrospective written with brutal honesty.

**What went wrong:**
1. **GitHub Release created as DRAFT** — didn't trigger `release: published` event, so publish.yml never ran automatically
2. **NPM_TOKEN was User token with 2FA** — CI failed 5+ times with EOTP errors (can't provide OTP in automation)
3. **`bump-build.mjs` ran locally 4 times during debugging** — silently mutated version from 0.8.21 → 0.8.21.4 (4-part version, INVALID semver)
4. **Kobayashi committed 0.8.21.4 without validation** — 4-part versions are NOT valid semver
5. **npm MANGLED 0.8.21.4 into 0.8.2-1.4** — parser misinterpreted it as major.minor.patch-prerelease. This went to the registry. `latest` dist-tag pointed to a phantom version for 6+ hours.
6. **Verify step had no retry logic** — npm propagation delay caused 404s even when publish succeeded

**Root cause:** No release runbook. Agents improvised. Improvisation during releases = disaster.

**Lessons learned (hard):**
1. **Process documentation prevents disasters.** No release without a runbook = no release. Period.
2. **Semver validation is mandatory.** 4-part versions (0.8.21.4) look valid to humans but npm mangles them. Must run `require('semver').valid()` before ANY commit.
3. **Token types matter.** User tokens with 2FA ≠ Automation tokens. This should have been documented on day one.
4. **Draft releases are a footgun.** The difference between "draft" and "published" is invisible in the UI but breaks automation. Document this.
5. **Validation gates catch mistakes before they ship.** No more trusting package.json versions. Validate everything.
6. **Agents need checklists, not autonomy, for critical flows.** Releases are not the place for creativity.

**What we shipped:**
- Comprehensive retrospective: `.squad/decisions/inbox/keaton-v0822-retrospective.md`
- Release process skill: `.squad/skills/release-process/SKILL.md` — definitive step-by-step runbook with validation gates, rollback procedures, common failure modes
- Action items assigned to Keaton (skill doc, bump-build.mjs protection, NPM_TOKEN docs) and Kobayashi (pre-release validation script)

**Never again.** This was bad. We own it. We fixed it. We document it so future teams learn from it.

## 📌 Community Contributors Documentation — 2026-03-07T20:45:00Z

**COMMUNITY CREDIT SYSTEM ESTABLISHED.** Updated CONTRIBUTORS.md to formally recognize external contributors who shaped Squad through issues, discussions, and feature requests.

## 📌 Knowledge Library Context Bloat Analysis — 2026-03-17

**CONTEXT BUDGET RISK ASSESSMENT COMPLETE.** Analyzed Brady's concern about Knowledge Library (#413) causing context bloat. Key findings:

**Current spawn-time context:** ~360 KB per agent (charter 2 KB, history 24 KB, decisions 333 KB, plus optional wisdom/now/skills). Already consuming 45-70% of LLM context windows.

**Bloat tipping point identified:** If knowledge files were naively loaded at spawn, system becomes unusable at ~25 files (50 KB). Silent degradation is the real danger — "everything works fine" at 10 files, system breaks at 80 files, users suffer before we notice.

**Recommended solution:** Pure on-demand loading (Solution 1) — knowledge files NEVER loaded at spawn time, agents explicitly invoke `read_knowledge(topic_slug)` when needed. Zero spawn impact, infinite scalability, agents pay only for what they use. Alternative: Semantic index with lazy loading (Solution 2) — lightweight index (~5-10 KB) loaded at spawn, full files on-demand.

**Files vs Issues storage:** Files-on-disk wins for agent access (fast, version-controlled, offline-first, no API dependency). Hybrid approach: files as source of truth, optional `squad knowledge publish` to sync to GitHub Issues for web discoverability.

**Proof strategy:** Demo with baseline → 50 files → 150 files showing zero spawn-time change. Success criteria: spawn time unchanged, context at spawn +0-10 KB max, knowledge loaded only when requested, no silent degradation.

**Architectural insight:** Cold storage architecture requires explicit access barriers. Default-off prevents silent decay. Coordinator can hint at available knowledge in routing ("Knowledge available: react-perf — read if needed"), but agents must choose to load it.

Analysis written to `C:\Users\diberry\repos\project-squad\personal-board\knowledge-library-context-bloat-analysis.md` for Dina to share with Brady.

**Key additions:**
- **v0.8.21 section expanded:** Added SDK-first work shipped by Fenster (SDK-first init flag), Verbal (defineSkill() builder), Edie (squad migrate command), Hockney (66 new tests), McManus (SDK-first docs)
- **Community Contributors section:** 19 external contributors credentialed by GitHub handle with linked issues and contribution types
- **Community highlights:** Notable external impact: @csharpfritz's model-per-agent feature shipped in SDK; @williamhallatt's 4-issue batch spanning UX/docs/bugs; @swnger's discussion led to defineSkill() feature (#255 shipped)

**Recognition principle:** Community contributions aren't just bug reports — they're strategic inputs that shaped architectural decisions (SDK design, model configuration, multi-repo workflows, CLI-first direction). Documenting them builds contributor loyalty and transparency.

## 📌 Phase 1 Completion — 2026-03-05T21:37:09Z

**PHASE 1 SDK-FIRST COMPLETE.** Keaton's scoping decision + Edie's builders + Fenster's CLI + Hockney's tests + Kujan's OTel assessment + Verbal's coordinator update. 6 agents fanned out in parallel.

**Team Cross-Pollination:**
- **Edie:** Built 8 builder functions + type surface in packages/squad-sdk/src/builders/. Zero new deps. Runtime validation included. Type unification: runtime/config.ts canonical.
- **Fenster:** Implemented squad build --check CLI command. Works with SquadSDKConfig. Generated files stamped with HTML headers. Wired into cli-entry.ts.
- **Hockney:** 60 contract-first tests (36 builders, 24 build command). All passing. Stubs in place.
- **Kujan:** OTel readiness: all 8 runtime modules compile cleanly. Phase 3 unblocked.
- **Verbal:** Coordinator prompt updated with SDK Mode Detection section. Session-start heuristic for squad/ or squad.config.ts.

**Next:** Phase 2 (scaffolding + markdown generation), Phase 3 (SDK runtime + OTel), Phase 4 (migrations).

## 📌 Phase 2 Community PR Merges — 2026-03-07T01-13-00Z

**PHASE 2 COMMUNITY PR MERGES COMPLETE.** Brady approved 3 community PRs from external contributors. All merged to dev successfully.

- PR #230 (EmmittJ): CLI wire-up for squad link + squad init --mode remote (6d0bd56)
- PR #217 (williamhallatt): TUI /init no-args flow fix (20970f9)
- PR #219 (williamhallatt): Fork contribution workflow docs in CONTRIBUTING.md (157b8c0)

**Zero conflicts.** All three showed UNSTABLE merge state (dev progressed past their base), but all merged cleanly. Fork-first contributor procedure now standardized. 52+ tests passing.

**Team Status:** External contributors now viable for parallel work. Merge conflicts due to base drift, not code — low friction, normal pattern. Fork-first procedure repeatable.

📌 Team update (2026-03-07T15-55-00Z): v0.8.21 approved for release (Hockney: test validation passed; McManus: blog published). SDK-First init/migrate features remain deferred to v0.8.22 per previous decision. — coordinated by Scribe

## 📌 Actions → CLI Migration Strategy — 2026-03-07T17:30:00Z

**STRATEGIC ANALYSIS COMPLETE.** Brady raised concern about Squad's automated GitHub Actions consuming API quota and surprising users with automation. Keaton analyzed all 15 workflows.

**Classification:**
- **🟢 KEEP (10 workflows):** Standard CI/CD (squad-ci, squad-release, squad-promote, squad-main-guard, squad-preview, squad-docs, publish, squad-publish, squad-insider-release, squad-insider-publish)
- **🟡 MIGRATE TO CLI (5 workflows):** Squad-specific automation (sync-squad-labels, squad-triage, squad-issue-assign, squad-heartbeat, squad-label-enforce)

**Migration Path:**
- **v0.8.22:** Add deprecation warnings + implement CLI commands (`squad labels sync`, `squad triage`, `squad assign`, `squad watch`, `squad labels check`)
- **v0.9.0:** Remove 5 squad-specific workflows entirely. CLI-first is the only path.
- **Post-v0.9.0:** Add opt-in automation for users who want it (they install a workflow that calls CLI commands)

**Zero Actions Required Vision:** Squad can work with ONLY 3 standard workflows (CI, release, docs). All Squad logic moves to CLI commands that users invoke explicitly.

**Core Principle:** Squad should be a CLI-first tool that users control, not an automation layer that surprises them. Users invoke Squad when they want it — no background automation without explicit opt-in.

**Document:** `.squad/decisions/inbox/keaton-actions-to-cli-strategy.md` — full analysis with tradeoffs, UX design, technical approach, and implementation roadmap.

## 📌 Actions → CLI RFC Filed — 2026-03-07T18:00:00Z

**RFC ISSUE FILED.** Created [#252](https://github.com/bradygaster/squad/issues/252) — comprehensive PRD for migrating Squad automation from GitHub Actions to CLI commands. Community-facing RFC with full problem statement, tiered model (Tier 1: zero-actions default, Tier 2: opt-in, Tier 3: enterprise), migration plan across v0.8.22/v0.8.23/v0.9.0, backward compatibility guarantees, and 7 specific feedback questions. References #248 (triage wiring) and #236 (persistent watch). Labels: `type:rfc`, `priority:p1`. Reflects unanimous team consensus from 4-agent analysis session.



📌 Discussions-to-Issues batch (2026-03-07T17:07:51Z): Filed 5 issues from actionable community discussions with follow-up replies. #256 (GitHub App auth), #257 (Coordinator delegation), #258 (Teams MCP docs), #259 (VS Code crash), #260 (GitHub.com-based experience). All with discussion references and proper labels.

## 📌 Community Issue Triage Sweep — 2026-03-07T18:15:00Z

**CLOSED 7 BACKLOG ISSUES.** Executed community-friendly close sweep with personalized messaging. Brady directive: close #205, #184, #157, #156, #148 as addressed-in-spirit (pointing to foundational work underway), #211 and #241 as superseded (redirected to #242 and #208 respectively).

**Closed as addressed-in-spirit:**
- **#205** (Model config per agent) → Redirected to #223 (model priority); foundations laid in charter system
- **#184** (Concurrent agent commit collisions) → Addressed by SDK-first coordination improvements; worktree strategy tracked for v0.8.23+
- **#157** (CFO/accounting role for cost tracking) → Custom roles via charter system (v0.8.23+)
- **#156** (Learn from external PRs) → Memory/context injection patterns in v0.8.23+ roadmap
- **#148** (GitHub Agent Workflows integration) → CLI-first direction (vs. workflow-centric); see #252 RFC

**Closed as superseded:**
- **#211** (Multi-level squad setup: org/repo/personal/local) → Addressed by #242 (charter/SDK design consolidation)
- **#241** (Dedicated docs squad member) → Addressed by #208 (broader docs/knowledge consolidation)

**Key principle:** These weren't false closes — they represent real community concerns being addressed through architectural decisions (SDK, charter system, CLI-first migration). Community felt acknowledged, roadmap clarity improved, backlog reduced.

## 📌 Community Issue Triage Sweep — 2026-03-07T18:15:00Z

**CLOSED 7 BACKLOG ISSUES.** Brady directive: close #205, #184, #157, #156, #148 as addressed-in-spirit (pointing to foundational work underway), #211 and #241 as superseded (redirected to #242 and #208 respectively).

**Closed as in-progress/addressed:**
- **#205** (Model config per agent) → Redirected to #223 (model priority); foundations laid in charter system
- **#184** (Concurrent agent commit collisions) → Addressed by SDK-first coordination improvements; worktree strategy tracked for v0.8.23+
- **#157** (CFO/accounting role for cost tracking) → Custom roles via charter system (v0.8.23+)
- **#156** (Learn from external PRs) → Memory/context injection patterns in v0.8.23+ roadmap
- **#148** (GitHub Agent Workflows integration) → CLI-first direction (vs. workflow-centric); see #252 RFC

**Closed as superseded:**
- **#211** (Multi-level squad setup: org/repo/personal/local) → Addressed by #242 (charter/SDK design consolidation)
- **#241** (Dedicated docs squad member) → Addressed by #208 (broader docs/knowledge consolidation)

**Key principle:** These weren't "false closes" — they represent real community concerns that are being addressed through architectural decisions (SDK, charter system, CLI-first migration). Community felt acknowledged, roadmap clarity improved, backlog reduced.

## 📌 CI/CD & GitOps PRD Synthesis — 2026-03-07

**UNIFIED PRD CREATED.** Synthesized Trejo's GitOps/release audit (27KB) and Drucker's CI/CD pipeline audit (29KB) into single actionable PRD (docs/proposals/cicd-gitops-prd.md, ~34KB).

**Synthesis Approach:**
- **Deduplication:** Both audits identified same critical issues (squad-release.yml broken, semver validation missing, bump-build.mjs footgun, dev branch unprotected). Merged into single prioritized list.
- **Prioritization Framework:** P0 (blocks releases) → P1 (hardening) → P2 (quality of life). 29 work items total: 5 P0, 10 P1, 14 P2.
- **Architecture Decisions:** 5 key choices require Brady input: (1) consolidate publish.yml/squad-publish.yml, (2) delete or fix squad-release.yml, (3) bump-build.mjs behavior, (4) dev branch protection strategy, (5) preview branch architecture.
- **Implementation Phases:** 6 phases from "unblock releases" (1-2 days) to "quality of life" (backlog). Defense-in-depth for publish pipeline.

**Key Learnings from Synthesis:**
1. **Trejo vs. Drucker alignment is high:** Both identified same P0 issues. Differences were tactical (timing, approach), not strategic.
2. **v0.8.22 disaster exposed systemic gaps:** Not a single failure — cascade of missing validation gates. PRD adds multiple layers (pre-commit, CI, publish.yml).
3. **Workflow inventory reveals redundancy:** 15 workflows, 3 are unclear/redundant (squad-publish.yml, preview workflows, heartbeat). Consolidation is P1.
4. **Test failures are the blocker:** squad-release.yml has 9+ consecutive failures (ES module syntax). Fixing tests unblocks everything else.
5. **Branch model needs clarity:** Preview branch referenced but doesn't exist. Insider/insiders naming inconsistent. Decision required: implement or remove.

**What Makes This PRD Actionable:**
- **Concrete work items:** Each has description, source, effort estimate (S/M/L), dependencies.
- **Code snippets for fixes:** Ready-to-copy validation gates, CI checks, workflow improvements.
- **Success criteria:** Measurable outcomes (zero invalid semver for 6 months, MTTR <1 hour, CI success rate ≥95%).
- **Phased rollout:** Implementable in order — Phase 1 unblocks releases, Phase 2 disaster-proofs, later phases harden.

**Architecture Insight — Defense-in-Depth:**
Single validation layer failed in v0.8.22. PRD adds **3 layers**:
1. **Pre-commit:** Semver validation before commit (hook or manual check)
2. **CI checks:** squad-ci.yml validates versions, tests pass
3. **Publish gates:** publish.yml validates semver, SKIP_BUILD_BUMP, dry-run before npm publish

**Outcome:** 29 work items, 5 architecture decisions, 6 implementation phases. Ready for agent execution. No more v0.8.22-style disasters.

## 📌 Agency Plugin Spec — 2026-03-07T22:00:00Z

**AGENCY INTEGRATION ARCHITECTURE COMPLETE.** Dina Berry requested spec for how Squad becomes an Agency plugin. Agency = Microsoft's thin wrapper around agentic CLIs (Copilot CLI, Claude Code, Codex) with Microsoft-specific integrations (ADO MCPs, Bluebird, SSO auth).

**Key Architectural Calls:**

1. **Squad IS a Repo Agent** — Slots into Agency's Layer 2 (Agent Definitions), repo-scoped by design. Not a tool/MCP, not a company agent. Squad scaffolds `.squad/` team infrastructure.

2. **Copilot-Only Constraint is Acceptable** — Squad requires Copilot CLI engine (built on `@github/copilot-sdk`). Agency supports multiple engines, but explicit validation at install time is sufficient. Ship Copilot-only; revisit multi-engine only if demand exists.

3. **Ralph + ADO MCP = Killer Feature** — Ralph (work monitor) syncs GitHub Issues ↔ ADO Work Items via Agency's ADO MCP. This is IMPOSSIBLE in standalone Squad. Cross-system work orchestration is the value multiplier.

4. **Company-Wide Templates** — Agency enables org-level squad templates. Microsoft defines standard `.squad/` configurations that all repos inherit. Solves consistency problem at scale.

5. **Auth Abstraction Layer** — Agency handles Microsoft SSO (Entra ID). Squad reads `GITHUB_TOKEN` from Agency environment. Fallback to `gh` CLI if Agency auth unavailable. Zero additional auth flow for users.

6. **Evaluation Integration** — Squad emits structured telemetry events (coordination, routing, skill accumulation). Agency ingests for team-level evaluation (not just agent-level). New capability: measure multi-agent system effectiveness.

**What We'd Build:**

- `agency-plugin.json` — Plugin manifest for Agency registry
- `squad init --agency` — Scaffolds `.squad/config/agency-integration.json`
- `squad build --agency` — Generates `.agency/agents/*.json` manifests from `.squad/` directory
- Engine validation hooks — Rejects non-Copilot engines at install time
- MCP loader — Wires ADO/Bluebird MCPs to all squad agents
- Ralph + ADO sync — Cross-references GitHub ↔ ADO work items
- Telemetry emitter — Sends squad events to Agency evaluation endpoint

**Squad Inside Agency vs. Standalone:**

| Capability | Standalone | Agency | Impact |
|-----------|-----------|--------|--------|
| Work systems | GitHub only | GitHub + ADO + internal | Ralph = cross-system monitor |
| Knowledge | Repo only | Bluebird + internal wikis | Agents learn company patterns |
| Auth | `gh auth login` | Microsoft SSO | One login → all tools |
| Execution | Local + GH Actions | CLI + ADO pipelines + IDE | Consistent everywhere |
| Evaluation | None | Team-level metrics | Measure coordination quality |
| Templates | DIY per repo | Org-wide standards | Consistency at scale |

**The Insight:** Agency's Microsoft-specific tooling makes Squad 10x more valuable. Squad provides team infrastructure; Agency provides enterprise integrations. Natural composition.

**Friction Points:**

1. **Engine lock-in** — Squad = Copilot-only; Agency = multi-engine. Mitigation: explicit validation + clear errors.
2. **Filesystem state** — `.squad/` in git vs. cloud-native expectations. Mitigation: git-based state is a feature (audit trail).
3. **Repo-scoped** — Squad is repo-level; orgs want consistency. Mitigation: template system.

**Recommendation:** Ship 4-phase rollout. Phase 1 (now): Copilot-only, repo-scoped, CLI-first. Phase 2 (3mo): MCP integration + Ralph enhancements. Phase 3 (6mo): Templates + multi-surface. Phase 4 (12mo): Multi-engine IF demand exists.

**Document:** `agency-plugin-spec.md` — 27KB comprehensive spec with architecture mapping, installation flow, MCP integration, auth strategy, evaluation hooks, deliverables list, and success metrics.

### Agency-Squad Plugin — Milestone Complete (2026-03-16T14:39:05Z)
- Agency plugin spec complete (27KB, docs/spec.md in agency-squad-plugin repo)
- Separate bridge repo scaffolded at agency-squad-plugin/ with full TypeScript structure
- Decision: plugin lives in its own repo (Agency ← plugin → Squad), clean dependency direction
- Jack Batzner presenting today on how he built his Agency integration — reference for validation
- Phase 1 ready to prototype when Agency team confirms plugin registry and agent definition format
- 7 open questions for Brady and Agency team documented in spec
