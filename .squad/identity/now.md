---
updated_at: 2026-03-23T22:00:00Z
focus_area: Release Stabilized, Process Hardened, Community Engaged
version: v0.9.1
branch: main
tests_passing: 4655+
tests_todo: ~20
tests_skipped: ~5
test_files: 149
team_size: 19 active agents + Scribe + Ralph + @copilot
team_identity: Apollo 13 / NASA Mission Control
process: All work through PRs. Branch naming squad/{issue-number}-{slug}. Releases driven by Surgeon. Pre-flight gates mandatory. Never commit to main directly.
---

# What We're Focused On

**Status:** Release v0.9.1 stable on npm. Docs deployed with dark mode fix. 10 community PRs merged. Discussion board fully triaged. Release process hardened with 6 action items (A1–A6). 9 GitHub issues filed for improvements. Ready for next development cycle.

## Session Recap: Release Crisis Recovery & Governance Hardening (2026-03-23)

**Agents Deployed:** Flight (Lead), EECOM (SDK/CLI), Booster (DevOps), Surgeon (Release), PAO (DevRel), Coordinator

### Release Incident Resolved
**v0.9.0 → v0.9.1:** Critical defect in CLI package (dependency reference). Published with `"file:../squad-sdk"` (local path) instead of registry version. Broken on global install. Detected immediately; hotfix prepared in minutes. **Publish workflow infrastructure failed:** GitHub Actions cache race condition + npm workspace automation issues + npm 2FA hang. Extended resolution from 10 minutes to 8 hours.

**Root causes identified (5 total):**
1. Dependency validation gap (prefixable — no pre-publish checks)
2. GitHub workflow cache race condition (GitHub infrastructure bug)
3. npm workspace publish broken with 2FA enabled (tool gap)
4. Coordinator repeated failed approaches (process gap)
5. No pre-publish verification step (preventable)

**Outcomes:**
- ✅ v0.9.1 released and stable
- ✅ Preflight job added to publish pipeline (dependency scanning)
- ✅ Release governance hardened (Surgeon owns all publishing)
- ✅ 6 action items (A1–A6) documented for next release
- ✅ Release process skill created at `.squad/skills/release-process/SKILL.md`

### PRs Merged (10 total)
| PR | Title | Status |
|---|---|---|
| #569 | Docs deployment | ✅ Merged |
| #570 | Dark mode fix (ViewTransitions + 3-layer theme) | ✅ Merged |
| #571 | Docs features | ✅ Merged |
| #555 | Community contribution | ✅ Merged |
| #552 | Community contribution | ✅ Merged |
| #568 | Infrastructure improvement | ✅ Merged |
| #572 | Chinese README (PAO/community collab) | ✅ Merged |
| #513 | Earlier feature work | ✅ Merged |
| #573 | Community contribution | ✅ Merged |
| #574 | Community contribution | ✅ Merged |

**PR #507:** Closed (superseded by #572)

### Issues Filed (9 total)
**#556–#564:** Release process improvements documented by Flight:
- Dependency validation patterns
- npm workspace publish policy
- GitHub Actions cache handling
- Publish escalation protocol
- Pre-flight checklist
- Smoke test gating
- Runbook documentation

### Community Engagement
**Discussion Triage:** 15 discussions analyzed by PAO
- 4 close-as-resolved (features shipped)
- 1 consolidate (duplicate answer)
- 2 convert-to-issue (bugs/roadmap)
- 8 keep-open (ongoing feedback)

**Critical Finding:** Teams MCP docs need urgent update — Office 365 Connectors deprecated Dec 2024, needs Power Automate Workflows path.

### Governance Decisions Merged (12 total)
**Infrastructure & CI:** CI audit (15 workflows, lean + healthy), preflight job (dependency scanning), ghost workflow cleanup

**Release & Process:** Surgeon owns all publishing; strict playbooks; pre-publish validation; escalation protocol; smoke tests mandatory; npm-only distribution; runbooks in PUBLISH-README.md

**Community:** README slim-down (512 → 331 lines); discussion triage patterns; v0.9.0 blog structure; Teams MCP urgency

### Skills Created
**`.squad/skills/release-process/SKILL.md`:** Comprehensive skill documenting pre-publish validation, publish automation flow, GitHub Actions failure runbook, npm workspace policy, escalation protocol, post-publish verification.

### Team Learnings Documented
- **Flight:** Issue filing patterns, PR triage workflow
- **EECOM:** CLI version subcommand pattern (inline handlers)
- **Booster:** CI preflight patterns, workflow audit methodology
- **Surgeon:** Release governance rules, retrospective analysis patterns
- **PAO:** Discussion triage patterns, Teams MCP urgency, Chinese README workflow

## Current State

**Version:** v0.9.1 (released, on npm, stable)
- **Packages:** @bradygaster/squad-sdk@0.9.1, @bradygaster/squad-cli@0.9.1
- **Branch:** main (default)
- **Build:** ✅ clean (0 errors)
- **Tests:** 4,655+ passed, ~20 todo, ~5 skipped, 149 test files
- **Docs:** Deployed to production with dark mode fix

**Open Issues:** 9 filed for release improvements (#556–#564). PR #567 (StorageProvider) parked as draft. Ready for next development phase.

## Next Steps

### Immediate (This Sprint)
- [ ] Implement A1–A6 action items from release retrospective
- [ ] Delete ghost workflow (publish-npm.yml) via GitHub API
- [ ] Update Teams MCP docs (Office 365 → Power Automate)
- [ ] Enable Ralph's heartbeat cron if periodic triage desired

### Short-Term (Next Release)
- [ ] Mandatory pre-flight checklist before tagging any release
- [ ] Update PUBLISH-README.md with full runbook
- [ ] Add semver validation to bump-build.mjs
- [ ] Policy: 2FA must be auth-only; always `cd` into package for publish

### Backlog
- **#556–#564** — Release improvements (9 issues)
- **#567** — StorageProvider PRD (draft, parked for v1.0)

## Process

All work through PRs. Branch naming: `squad/{issue-number}-{slug}`. Releases driven by **Surgeon** (not Coordinator or user). **Pre-publish gates mandatory.** Never commit to main directly. All decisions in `.squad/decisions.md`; inbox files auto-merged by Scribe.

## Team Identity

**Apollo 13 / NASA Mission Control:** Flight (Lead), EECOM, FIDO, PAO, CAPCOM, CONTROL, SURGEON, Booster, GNC, Network, RETRO, INCO, GUIDO, Telemetry, VOX, DSKY, Sims, Handbook. Scribe (Session Logger), Ralph (Autonomy Agent). @copilot (Coordinator).

**Status:** Team stable, process hardened, community engaged, next cycle ready.
