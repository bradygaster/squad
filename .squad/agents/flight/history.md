# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution Complete):** Post-CLI crash recovery executed in 3 rounds. Round 1: Flight audited PR/issue state (found #617 merged, #619 conflicting, 3 dupes #605/#604/#602 open); FIDO verified baseline (5,038 tests ✅ green); Scribe merged stale inbox. Round 2: Flight closed 3 duplicate PRs with rationale; Procedures rebased PR #619 (model catalog) onto dev, resolved 3 merge conflicts, merged; FIDO reviewed 9 community PRs—approved 3 (#625/#603/#608), requested changes on 6 (package naming, file paths). Round 3: Coordinator merged 3 approved PRs. **10 PRs merged total** (6 merge-plan, 3 community, 1 legacy #592). **3 PRs closed** as duplicates. **6 PRs awaiting author revisions**. **Dev branch green** (5,038 tests). All merge-plan sequence complete.

📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review):** Flight triaged 14 untriaged GitHub issues, created prioritized work session plan. Identified high-value quick wins (P1): #610 (docs broken link), #590 (getPersonalSquadRoot bug, P0), #591 (hiring wiring docs). Deferred community feature contributions (#601–#595) pending PR review. FIDO reviewed 10 open PRs, identified 3 duplicate/overlap pairs. Work session priority: #610→PAO, #590→EECOM, #592/#611→Flight review, #588→Procedures. Tamir PRs require proposal-first discipline. Merge-ready: #611 (blocked on #610), #592.

📌 **Team update (2026-03-23T22:00Z — Release Crisis Recovery):** v0.9.0→v0.9.1 incident resolved. Released v0.9.1 stable on npm after 8-hour debugging marathon. Root causes: dependency validation gap (file: refs in packages), GitHub workflow cache race, npm workspace publish automation broken, no pre-publish verification. Created comprehensive retrospective with 5 root causes and 6 action items (A1–A6). Filed 9 GitHub issues (#556–#564). Pre-flight job added to publish pipeline. Surgeon charter hardened. 10 community PRs merged. Release process skill created at `.squad/skills/release-process/SKILL.md`.

📌 **Team update (2026-03-22T09-35Z — Wave 1):** Ambient personal squad design validated and 19-task implementation plan authored across 4 PRs. EECOM executing Phase 1–2 (SDK + CLI), Procedures executing Phase 3 (governance) concurrently. All design gaps resolved; dependency graph established.

## Core Context

Three-branch model (main/dev/insiders). Apollo 13 team, 3931 tests. Boundary review heuristic: "Squad Ships It" — if Squad doesn't ship the code, it's IRL content. Proposal-first: meaningful changes need docs/proposals/ before code. Two-error lockout policy: agent locked out after 2 errors in a session. Test name-agnosticism: framework tests must never depend on dev team's agent names.

## Historical Learnings Summary (condensed)

- **Issue filing pattern:** When a major incident occurs, file 9+ GitHub issues documenting root causes and improvements. One issue per root cause + one per action item. Creates accountability and accelerates fixes.
- **Release governance:** Brady established strict governance — Surgeon owns all publishing; strict playbook adherence; CI/CD is top priority; pre-flight gates mandatory before any release tagging.
- **Adoption tracking architecture:** Three-tier opt-in system: Tier 1 (aggregate-only `.github/adoption/`), Tier 2 (opt-in registry), Tier 3 (public showcase ≥5 projects). `.squad/` is team state only.
- **Content triage skill:** "Squad Ships It" litmus test. Triggered by `content-triage` label. Output: boundary analysis, sub-issues for PAO, IRL reference for Scribe.
- **Sprint prioritization:** Rank by: (1) bugs with active user impact, (2) quality/test gaps blocking GA, (3) high-ROI features unblocking downstream work. Interleave stability + velocity.
- **Distributed mesh integration:** Zero code changes. Convention-first additive layer (skills + scripts + docs). 125:1 ratio. mesh.json stays separate from squad.config.ts.
- **Remote squad access:** Three-phase rollout: Phase 1 GitHub Discussions bot (1 day, zero hosting), Phase 2 Copilot Extension via Contents API (1 week), Phase 3 Slack/Teams bot (2 weeks). Must solve `.squad/` context access.
- **PR #331 boundary review:** "Squad Ships It" pattern — remove external infrastructure docs, reframe platform integration docs, keep Squad behavior/config docs.
- **SDK Init Shore-Up PRD:** 6 SDK issues consolidated into 3-phase initiative: Phase 1 fixes gaps (config sync, built-in member exclusion), Phase 2 wires CastingEngine, Phase 3 test matrix. Owners: EECOM + CAPCOM.
- **Ambient personal squad (#329/#344):** 5 gaps identified: resolvePersonalAgents() function, ghost protocol for orchestration log, --team-root scope, squad personal init command, SQUAD_NO_PERSONAL env var. ensureSquadPathTriple() required in resolution.ts to enforce ghost protocol.
- **Release hardening plan:** PUBLISH-README.md rewrite (#564, absorbs #558-560), CI lint rule rejecting non-workspace npm publish (#557), ghost workflow deletion (#562). Lint rule: scan `.github/workflows/*.yml` for `npm publish` without `-w` flag.
- **Issue triage (2026-03-24 — 14 issues):** P0: #590 (getPersonalSquadRoot broken). P1: #610 (broken docs), #591 (hiring wiring). P2: #597, #588, #554. Questions: #589, #494. Deferred: #581 (ADO PRD, blocked until #341).
- **Community PR quality tiers:** Diberry (MSFT-level, architecturally-sound, merge-ready). Joniba (consistently high-quality, matches team standards). Tamir (technically strong, needs proposal-first discipline + monorepo placement guidance).