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

## Adoption & Community

### `.squad/` Directory Scope — Owner Directive
**By:** Brady (project owner, PR #326 review)  
**Date:** 2026-03-10  

**Directive:** The `.squad/` directory is **reserved for team state only** — roster, routing, decisions, agent histories, casting, and orchestration logs. Non-team data (adoption tracking, community metrics, reports) must NOT live in `.squad/`. Use `.github/` for GitHub platform integration or `docs/` for documentation artifacts.

**Source:** [PR #326 comment](https://github.com/bradygaster/squad/pull/326#issuecomment-4029193833)

---

### No Individual Repo Listing Without Consent — Owner Directive
**By:** Brady (project owner, PR #326 review)  
**Date:** 2026-03-10  

**Directive:** Growth metrics must report **aggregate numbers only** (e.g., "78+ repositories found via GitHub code search") — never name or link to individual community repos without explicit opt-in consent. The monitoring script and GitHub Action concepts are approved, but any public showcase or tracking list that identifies specific repos is blocked until a community consent plan exists.

**Source:** [PR #326 comment](https://github.com/bradygaster/squad/pull/326#issuecomment-4029222967)

---

### Adoption Tracking — Opt-In Architecture
**By:** Flight (implementing Brady's directives above)  
**Date:** 2026-03-09  

Privacy-first adoption monitoring using a three-tier system:

**Tier 1: Aggregate monitoring (SHIPPED)**
- GitHub Action + monitoring script collect metrics
- Reports moved to `.github/adoption/reports/{YYYY-MM-DD}.md`
- Reports show ONLY aggregate numbers (no individual repo names):
  - "78+ repositories found via code search"
  - Total stars/forks across all discovered repos
  - npm weekly downloads

**Tier 2: Opt-in registry (DESIGN NEXT)**
- Create `SHOWCASE.md` in repo root with submission instructions
- Opted-in projects listed in `.github/adoption/registry.json`
- Monitoring script reads registry, reports only on opted-in repos

**Tier 3: Public showcase (LAUNCH LATER)**
- `docs/community/built-with-squad.md` shows opted-in projects only
- README link added when ≥5 opted-in projects exist

**Rationale:**
- Aggregate metrics safe (public code search results)
- Individual projects only listed with explicit owner consent
- Prevents surprise listings, respects privacy
- Incremental rollout maintains team capacity

**Implementation (PR #326):**
- ✅ Moved `.squad/adoption/` → `.github/adoption/`
- ✅ Stripped tracking.md to aggregate-only metrics
- ✅ Removed individual repo names, URLs, metadata
- ✅ Updated adoption-report.yml and scripts/adoption-monitor.mjs
- ✅ Removed "Built with Squad" showcase link from README (Tier 2 feature)

---

### Adoption Tracking Location & Privacy
**By:** EECOM  
**Date:** 2026-03-10  

Implementation decision confirming Tier 1 adoption tracking changes.

**What:** Move adoption tracking from `.squad/adoption/` to `.github/adoption/`

**Why:**
1. **GitHub integration:** `.github/adoption/` aligns with GitHub convention (workflows, CODEOWNERS, issue templates)
2. **Privacy-first:** Aggregate metrics only; defer individual repo showcase to Tier 2 (opt-in)
3. **Clear separation:** `.squad/` = team internal; `.github/` = GitHub platform integration
4. **Future-proof:** When Tier 2 opt-in launches, `.github/adoption/` is the natural home

**Impact:**
- GitHub Action reports write to `.github/adoption/reports/{YYYY-MM-DD}.md`
- No individual repo information published until Tier 2
- Monitoring continues collecting aggregate metrics via public APIs
- Team sees trends without publishing sensitive adoption data

---

### Append-Only File Governance
**By:** Flight  
**Date:** 2026-03-09  

Feature branches must never modify append-only team state files except to append new content.

**What:** If a PR diff shows deletions in `.squad/agents/*/history.md` or `.squad/decisions.md`, the PR is blocked until deletions are reverted.

**Why:** Session state drift causes agents to reset append-only files to stale branch state, destroying team knowledge. PR #326 deleted entire history files and trimmed ~75 lines of decisions, causing data loss.

**Enforcement:** Code review + future CI check candidate.

---

### Documentation Style: No Ampersands
**By:** PAO  
**Date:** 2026-03-09  

Ampersands (&) are prohibited in user-facing documentation headings and body text, per Microsoft Style Guide.

**Rule:** Use "and" instead.

**Why:** Microsoft Style Guide prioritizes clarity and professionalism. Ampersands feel informal and reduce accessibility.

**Exceptions:**
- Brand names (AT&T, Barnes & Noble)
- UI element names matching exact product text
- Code samples and technical syntax
- Established product naming conventions

**Scope:** Applies to docs pages, README files, blog posts, community-facing content. Internal files (.squad/** memory files, decision docs, agent history) have flexibility.

**Reference:** https://learn.microsoft.com/en-us/style-guide/punctuation/ampersands

---

## Sprint Directives

### Secret handling — agents must never persist secrets
**By:** RETRO (formerly Baer), v0.8.24
**What:** Agents must NEVER write secrets, API keys, tokens, or credentials into conversational history, commit messages, logs, or any persisted file. Acknowledge receipt without echoing values.
**Why:** Secrets in logs or history are a security incident waiting to happen.

---

## Squad Ecosystem Boundaries & Content Governance

### Squad Docs vs Squad IRL Boundary (consolidated)
**By:** PAO (via Copilot), Flight  
**Date:** 2026-03-10  
**Status:** Active pattern for all documentation PRs

**Litmus test:** If Squad doesn't ship the code or configuration, the documentation belongs in Squad IRL, not the Squad framework docs.

**Categories:**

1. **Squad docs** — Features Squad ships (routing, charters, reviewer protocol, config, behavior)
2. **Squad IRL** — Infrastructure around Squad (webhooks, deployment patterns, logging, external tools, operational patterns)
3. **Gray area:** Platform features (GitHub Issue Templates) → Squad docs if framed as "how to configure X for Squad"

**Examples applied (PR #331):**

| Document | Decision | Reason |
|----------|----------|--------|
| ralph-operations.md | DELETE → IRL | Infrastructure (deployment, logging) around Squad, not Squad itself |
| proactive-communication.md | DELETE → IRL | External tools (Teams, WorkIQ) configured by community, not built into Squad |
| issue-templates.md | KEEP, reframe | GitHub platform feature; clarify scope: "a GitHub feature configured for Squad" |
| reviewer-protocol.md (Trust Levels) | KEEP | Documents user choice spectrum within Squad's existing review system |

**Enforcement:** Code review + reframe pattern ("GitHub provides X. Here's how to configure it for Squad's needs."). Mark suspicious deletions for restore (append-only governance).

**Future use:** Apply this pattern to all documentation PRs to maintain clean boundaries.

---

### Content Triage Skill — External Content Integration
**By:** Flight  
**Date:** 2026-03-10  
**Status:** Skill created at `.squad/skills/content-triage/SKILL.md`

**Pattern:** External content (blog posts, sample repos, videos, conference talks) that helps Squad adoption must be triaged using the "Squad Ships It" boundary heuristic before incorporation.

**Workflow:**
1. Triggered by `content-triage` label or external content reference in issue
2. Flight performs boundary analysis
3. Sub-issues generated for Squad-ownable content extraction (PAO responsibility)
4. FIDO verifies docs-test sync on extracted content
5. Scribe manages IRL references in `.github/irl/references.yml` (YAML schema)

**Label convention:** `content:blog`, `content:sample`, `content:video`, `content:talk`

**Why:** Pattern from PR #331 (Tamir Dresher blog) shows parallel extraction of Squad-ownable patterns (scenario guides, reviewer protocol) and infrastructure patterns (Ralph ops, proactive comms). Without clear boundary, teams pollute Squad docs with operational content or miss valuable patterns that should be generalized.

**Impact:** Enables community content to accelerate Squad adoption without polluting core docs. Flight's boundary analysis becomes reusable decision framework. Prevents scope creep as adoption grows.

---

### PR #331 Quality Gate — Test Assertion Sync
**By:** FIDO (Quality Owner)  
**Date:** 2026-03-10  
**Status:** 🟢 CLEARED (test fix applied, commit 6599db6)

**What was blocked:** Merge blocked on stale test assertions in `test/docs-build.test.ts`.

**Critical violations resolved:**
1. `EXPECTED_SCENARIOS` array stale (7 vs 25 disk files) — ✅ Updated to 25 entries
2. `EXPECTED_FEATURES` constant undefined (32 feature files) — ✅ Created array with 32 entries
3. Test assertion incomplete — ✅ Updated to validate features section

**Why this matters:** Stale assertions that don't reflect filesystem state cause silent test skips. Regression: If someone deletes a scenario file, the test won't catch it. CI passing doesn't guarantee test coverage — only that the test didn't crash.

**Lessons:**
- Test arrays must be refreshed when filesystem content changes
- Incomplete commits break the test-reality sync contract
- FIDO's charter: When adding test count assertions, must keep in sync with disk state

**Outcome:** Test suite: 6/6 passing. Assertions synced to filesystem. No regression risk from stale assertions.

---

### Communication Patterns and PR Trust Models
**By:** PAO  
**Date:** 2026-03-10  
**Status:** Documented in features/reviewer-protocol.md (trust levels section) and scenarios/proactive-communication.md (infrastructure pattern)

**Decision:** Document emerging patterns in real Squad usage: proactive communication loops and PR review trust spectrum.

**Components:**

1. **Proactive communication patterns** — Outbound notifications (Teams webhooks), inbound scanning (Teams/email for work items), two-way feedback loop connecting external sources to Squad workflow

2. **PR trust levels spectrum:**
   - **Full review** (default for team repos) — All PRs require human review
   - **Selective review** (personal projects with patterns) — Domain-expert or routine PRs can auto-merge
   - **Self-managing** (solo personal repos only) — PRs auto-merge; Ralph's work monitoring provides retroactive visibility

**Why:** Ralph 24/7 autonomous deployment creates an awareness gap — how does the human stay informed? Outbound notifications solve visibility. Inbound scanning solves "work lives in multiple places." Trust levels let users tune oversight to their context (full review for team repos, selective for personal projects, self-managing for solo work only).

**Important caveat:** Self-managing ≠ unmonitored; Ralph's work monitoring and notifications provide retroactive visibility.

**Anti-spam expectations:** Don't spam yourself outbound (notification fatigue), don't spam GitHub inbound (volume controls).

---

### Remote Squad Access — Phased Rollout (Proposed)
**By:** Flight  
**Date:** 2026-03-10  
**Status:** Proposed — awaits proposal document in `docs/proposals/remote-squad-access.md`

**Context:** Squad currently requires a local clone to answer questions. Users want remote access from mobile, browser, or different machine without checking out repo.

**Phases:**

**Phase 1: GitHub Discussions Bot (Ship First)**
- Surface: GitHub Discussions
- Trigger: `/squad` command or `@squad` mention
- Context: GitHub Actions workflow checks out repo → full `.squad/` state
- Response: Bot replies to thread
- Feasibility: 1 day
- Why first: Easy to build, zero hosting, respects repo privacy, async Q&A, immediately useful

**Phase 2: GitHub Copilot Extension (High Value)**
- Surface: GitHub Copilot chat (VS Code, CLI, web, mobile)
- Trigger: `/squad ask {question}` in any Copilot client
- Context: Extension fetches `.squad/` files via GitHub API (no clone)
- Response: Answer inline in Copilot
- Feasibility: 1 week
- Why second: Works everywhere Copilot exists, instant response, natural UX

**Phase 3: Slack/Teams Bot (Enterprise Value)**
- Surface: Slack or Teams channel
- Trigger: `@squad` mention in channel
- Context: Webhook fetches `.squad/` via GitHub API
- Response: Bot replies in thread
- Feasibility: 2 weeks
- Why third: Enterprise teams live in chat; high value for companies using Squad

**Constraint:** Squad's intelligence lives in `.squad/` (roster, routing, decisions, histories). Any remote solution must solve context access. GitHub Actions workflows provide checkout for free. Copilot Extension and chat bots use GitHub API to fetch files.

**Implementation:** Before Phase 1 execution, write proposal document. New CLI command: `squad answer --context discussions --question "..."`. New workflow: `.github/workflows/squad-answer.yml`.

**Privacy:** All approaches respect repo visibility or require authentication. Most teams want private by default.

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

### 2026-03-14T14:40:47Z: LLM Backend — Copilot-only, BYOK not supported
**By:** Copilot (via Copilot CLI)  
**Date:** 2026-03-14  
**Status:** Decision — Product Constraint

**What:** GitHub Copilot is the **only supported LLM backend**. BYOK (Bring Your Own Key) is **NOT a supported feature**. The `SquadProviderConfig` interface in `packages/squad-sdk/src/adapter/types.ts` should be marked as `@internal`. Docs must clearly state that Squad requires GitHub Copilot.

**Why:** Product clarification on AI backend strategy. Squad's vision couples tightly with Copilot's capabilities. No multi-backend abstraction layer planned. Simplifies architecture, improves integration depth, focuses team effort.

**Closure:** Issue #323 — answered by PR #385 with documentation clarification across README, installation guides, model selection docs, and FAQ.

---

*Fresh start — Mission Control rebirth, 2026-03-08. Previous decisions archived.*
