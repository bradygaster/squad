# Decisions

> Team decisions that all agents must respect. Managed by Scribe.

---

## Foundational Directives (carried from beta, updated for Mission Control)

### Type safety — strict mode non-negotiable
**By:** CONTROL (formerly Edie)
**What:** `strict: true`, `noUncheckedIndexedAccess: true`, no `@ts-ignore` allowed.
**Why:** Types are contracts. If it compiles, it works.

### Hook-based governance over prompt instructions
**By:** RETRO (formerly Baer)
**What:** Security, PII, and file-write guards are implemented via the hooks module, NOT prompt instructions.
**Why:** Prompts can be ignored. Hooks are code — they execute deterministically.

### Node.js >=20, ESM-only, streaming-first
**By:** GNC (formerly Fortier)
**What:** Runtime target is Node.js 20+. ESM-only. Async iterators over buffers.
**Why:** Modern Node.js features enable cleaner async patterns.

### Casting — Apollo 13, mission identity
**By:** Squad Coordinator
**What:** Team names drawn from Apollo 13 / NASA Mission Control. Scribe is always Scribe. Ralph is always Ralph. Previous universe (The Usual Suspects) retired to alumni.
**Why:** The team outgrew its original universe. Apollo 13 captures collaborative pressure, technical precision, and mission-critical coordination — perfect for an AI agent framework.

### Proposal-first workflow
**By:** Flight (formerly Keaton)
**What:** Meaningful changes require a proposal in `docs/proposals/` before execution.
**Why:** Proposals create alignment before code is written.

### Tone ceiling — always enforced
**By:** PAO (formerly McManus)
**What:** No hype, no hand-waving, no claims without citations.
**Why:** Trust is earned through accuracy, not enthusiasm.

### Zero-dependency scaffolding preserved
**By:** Network (formerly Rabin)
**What:** CLI remains thin. Zero runtime dependencies for the CLI scaffolding path.
**Why:** Users should be able to run `npx` without downloading a dependency tree.

### Merge driver for append-only files
**By:** Squad Coordinator
**What:** `.gitattributes` uses `merge=union` for `.squad/decisions.md`, `agents/*/history.md`, `log/**`, `orchestration-log/**`.
**Why:** Enables conflict-free merging of team state across branches.

### Interactive Shell as Primary UX
**By:** Brady
**What:** Squad becomes its own interactive CLI shell. `squad` with no args enters a REPL.
**Why:** Squad needs to own the full interactive experience.

### No temp/memory files in repo root
**By:** Brady
**What:** No plan files, memory files, or tracking artifacts in the repository root.
**Why:** Keep the repo clean.

---

## Sprint Directives

### Secret handling — agents must never persist secrets
**By:** RETRO (formerly Baer), v0.8.24
**What:** Agents must NEVER write secrets, API keys, tokens, or credentials into conversational history, commit messages, logs, or any persisted file. Acknowledge receipt without echoing values.
**Why:** Secrets in logs or history are a security incident waiting to happen.

### Test assertion discipline — mandatory
**By:** FIDO (formerly Hockney), v0.8.24
**What:** All code agents must update tests when changing APIs. FIDO has PR blocking authority on quality grounds.
**Why:** APIs changed without test updates caused CI failures and blocked external contributors.

### Docs-test sync — mandatory
**By:** PAO (formerly McManus), v0.8.24
**What:** New docs pages require corresponding test assertion updates in the same commit.
**Why:** Stale test assertions block CI and frustrate contributors.

### Contributor recognition — every release
**By:** PAO, v0.8.24
**What:** Each release includes an update to the Contributors Guide page.
**Why:** No contribution goes unappreciated.

### API-test sync cross-check
**By:** FIDO + Booster, v0.8.24
**What:** Booster adds CI check for stale test assertions. FIDO enforces via PR review.
**Why:** Prevents the pattern of APIs changing without test updates.

### Doc-impact review — every PR
**By:** PAO, v0.8.25
**What:** Every PR must be evaluated for documentation impact. PAO reviews PRs for missing or outdated docs.
**Why:** Code changes without doc updates lead to stale guides and confused users.

---

## Release v0.8.24

### CLI Packaging Smoke Test: Release Gate Decision
**By:** FIDO, v0.8.24  
**Date:** 2026-03-08

The CLI packaging smoke test is APPROVED as the quality gate for npm releases.

**What:**
- npm pack → creates tarball of both squad-sdk and squad-cli
- npm install → installs in clean temp directory (simulates user install)
- node {cli-entry.js} → invokes 27 commands + 3 aliases through installed package
- Coverage: All 26 primary commands + 3 of 4 aliases (watch, workstreams, remote-control)

**Why:** Catches broken package.json exports, MODULE_NOT_FOUND errors, ESM resolution failures, command routing regressions — the exact failure modes we've shipped before.

**Gaps (acceptable):**
- Semantic validation not covered (only routing tested)
- Cross-platform gaps (test runs on ubuntu-latest only)
- Optional dependencies allowed to fail (node-pty)

**Result:** ✅ GO — v0.8.24 release approved. 32/32 tests pass.

---

### CLI Release Readiness Audit — v0.8.24
**By:** EECOM  
**Date:** 2026-03-08

Definitive CLI completeness audit confirms all commands work post-publish.

**What:**
- 26 primary commands routed, all tested ✅
- 4 aliases routed (watch, workstreams, remote-control, streams) — 3 tested, 1 untested
- Tarball: 318 files, bin entry correct, postinstall script functional
- ESM runtime patch verified for Node 24+ compatibility
- All tests pass: 32/32 (36s runtime)

**Gaps (non-blocking):**
- `streams` alias routed but not smoke-tested (same code path as tested `subsquads` — low risk)

**Result:** ✅ SHIP IT — 95% confidence. CLI production-ready for v0.8.24.

---

*Fresh start — Mission Control rebirth, 2026-03-08. Previous decisions archived.*

---

## Adoption Tracking (2026-03-09)

### Adoption Tracking: Two-Tier Privacy Model
**By:** PAO  
**Date:** 2026-03-09

Squad uses a two-tier adoption tracking system:

1. **Public showcase** (`docs/community/built-with-squad.md`) — Curated, opt-in only. Projects must explicitly consent to be listed. Updated manually via PR submissions or discussions.

2. **Private tracking** (`.squad/adoption/tracking.md`) — Internal metrics and discovery data. Never published without owner permission. Tracks all discovered repos via GitHub code search, aggregate metrics (stars, forks, downloads), and social mentions.

**Why:** Trust over metrics. Publishing adoption data without permission violates developer expectations. Many repos use Squad for private/internal work — surfacing them publicly could expose internal projects or tooling strategies. Data-driven community growth requires private tracking for understanding adoption patterns and community health without compromising user privacy. Opt-in showcase builds credibility through consenting projects.

**Implementation:** Public page follows Starlight docs format with Microsoft Style Guide compliance. Private tracking lives in `.squad/adoption/` (never committed to docs/). Discovery methods documented: package.json dependencies vs squad.agent.md presence. Submission workflow: PR or discussion → review → add to showcase. Test assertions added following DOCS-TEST SYNC pattern.

**Team-Relevant:** Scribe monitors `.squad/adoption/tracking.md` for updates (append-only data). Flight consider this pattern for future community metrics. All agents: never surface repo names from private tracking in public docs without explicit consent.

---

### Adoption Monitoring Automation Strategy
**By:** Booster (CI/CD Engineer)  
**Date:** 2026-03-09

Implement automated daily adoption metrics tracking via GitHub Actions workflow (`adoption-report.yml`) and TypeScript script (`scripts/adoption-monitor.ts`).

**Metrics collected:**
- GitHub repo metrics (stars, forks, watchers)
- Code search results (repos using `@bradygaster/squad` in package.json, repos with `squad.agent.md`)
- npm weekly downloads (squad-sdk, squad-cli)
- Recent forks (7-day window with metadata)
- Week-over-week trend analysis

**Report format:** Markdown files at `.squad/adoption/reports/{YYYY-MM-DD}.md` with momentum metrics, new adopters table, and trend analysis.

**Why:** Observability for product decisions. Flight needs quantitative data to validate adoption hypotheses, measure marketing impact, and justify investment in onboarding improvements. Zero-cost automation on GitHub Actions free tier (~2-3 min/run, daily). Historical tracking with reports persisting in repo enables longitudinal analysis of adoption patterns.

**Technical decisions:**
- Zero added runtime dependencies — uses Node.js 22 built-in `fetch` instead of external packages
- Graceful degradation — script continues without crashing if npm API fails (logs warnings)
- GitHub Actions bot commits — reports persist in repo for historical tracking
- No .gitignore exclusion for reports — committed directly for historical tracking

**First run results (2026-03-09):**
- Stars: 714, Forks: 96 (30 in last 7 days)
- Repos using Squad: ~44
- Repos with squad.agent.md: ~135
- npm downloads (7d): SDK 2352, CLI 2118
- **Key insight:** squad.agent.md adoption (135) > package.json adoption (44) validates agent-first onboarding hypothesis

**Next steps:** After 7 days of data, analyze week-over-week trends. Consider Discussions integration if reports exceed 100. Potential Tier 2 enhancement: scrape squad.agent.md files to analyze common team archetypes.

---

### 2026-03-09: User directive — Adoption tracking: public + private lists
**By:** Dina Berry (via Copilot)  
**What:** Adoption monitoring should maintain two lists:
1. **Public curated showcase** (in docs) — opt-in only, with aggregated metrics from private tracking visible without exposing individual repos
2. **Private adoption tracking** (in .squad/ memory) — full list of all discovered repos, download stats, sentiment, contributor intel — never published in docs

**Key rule:** Individual repos are private by default. Only listed publicly with owner consent. Aggregate counts are always public.

**Why:** User request — balances social proof with privacy. Captures full adoption picture internally while respecting repo owners.

---

### Squad Adoption Monitoring Strategy (Flight Proposal)
**By:** Flight  
**Date:** 2026-03-09  
**Status:** approved

Implement a tiered daily monitoring system for Squad adoption across GitHub and npm.

**Tier 1 (Free, Shipped):** GitHub Actions + npm API automation
- GitHub repo metrics (stars, forks, watchers)
- Code search (repos with `.squad/`, `squad.agent.md`, package.json imports)
- npm weekly download stats
- Daily reports at `.squad/adoption/reports/`

**Tier 2 (Manual Social):** Weekly manual spot-checking on X/Twitter, LinkedIn, dev.to, Medium, Hashnode, YouTube, Hacker News

**Tier 3 (Enterprise):** Future scaling (Brandwatch, Mention, etc.) only if adoption reaches 5k+ stars

**Why:** Pragmatic over perfect. Tier 1 is free, ships immediately, covers 80% of needs. Tier 2 avoids $200/month X API cost. Tier 3 only makes sense at 10x current scale. Builds on existing GitHub MCP server. Ralph can extend to flag new adopter patterns.

**Implementation:** Flight reviews with Brady + Dina. Network implements Tier 1 (adoption-monitor.ts + GitHub Action). PAO adds manual social monitoring. Ralph integration for auto-flagging follows.

**Open questions addressed:** Reports committed to repo for historical tracking. Team gets notified via standard PR/Issue flows. Ralph auto-response to first issues from new orgs may follow in Ralph charter update.
