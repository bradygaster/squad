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

### Adoption Tracking — Opt-In Architecture
**By:** Flight  
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
