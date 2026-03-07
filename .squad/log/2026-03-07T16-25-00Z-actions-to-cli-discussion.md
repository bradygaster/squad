# Session Log: Actions → CLI Migration Discussion
**Timestamp:** 2026-03-07T16:25:00Z  
**Topic:** Strategic review of GitHub Actions usage and CLI-first migration  
**Agents Involved:** Keaton (Lead), Fenster (Core Dev), Kobayashi (Git & Release), McManus (DevRel)  
**Coordinator:** Brady (Product Lead)

---

## What Happened

Brady raised a strategic concern: Squad's automated GitHub Actions installation during `squad init` creates surprise friction for customers. Actions run in the background without explicit user intent, consuming API quota and creating a perception of loss of control.

**Brady's directive:** "The more we can stop relying on actions to do things and start relying on the cli to do things, it puts more emphasis and control in the user's hand."

**Additional insight:** CLI-first makes Squad portable. If automation lives in CLI commands instead of Actions, Squad can run anywhere — Codespaces, devcontainers, local terminals, persistent ACA containers. Actions lock the control loop to GitHub's event system.

---

## Key Decisions Made

### ✅ **Unanimous Consensus: 5 Squad-Specific Workflows Migrate to CLI**

**Workflows to migrate (5 total, 12 min/month):**
- `sync-squad-labels.yml` → `squad labels sync`
- `squad-triage.yml` → `squad triage` / enhance `squad watch`
- `squad-issue-assign.yml` → Keep as workflow (requires PAT + bot API)
- `squad-heartbeat.yml` → Already implemented as `squad watch`
- `squad-label-enforce.yml` → `squad labels enforce`

**Workflows to keep (9 total, 215 min/month):**
- Standard CI/CD: squad-ci, squad-release, squad-promote, squad-main-guard, squad-preview, squad-docs, publish, squad-publish, squad-insider-release, squad-insider-publish
- Rationale: Load-bearing infrastructure. Event-driven guardrails that feed branch protection, trigger tag creation, manage npm distribution. Cannot be replicated CLI-side.

### ✅ **Zero Actions Required Vision**

Squad can work with ONLY 3 standard workflows: CI, Release, Docs. All Squad logic moves to CLI commands that users invoke explicitly.

**User workflow (CLI-first):**
```bash
squad triage      # User runs triage at their terminal
squad watch       # User watches for new work (optional)
squad doctor      # User checks health periodically
```

**Benefits:**
- Zero API usage surprises — users invoke Squad when they want it
- Zero hidden costs — no cron jobs running every 30min
- Full transparency — users see Squad's decisions
- User control — users can override before applying

### ✅ **Phased Migration Path**

**v0.8.22 (Deprecation Warnings):**
- Add deprecation warnings to 5 workflows
- Implement CLI commands: `squad labels sync`, `squad labels enforce`
- Ship docs: `docs/migration/actions-to-cli.md`

**v0.9.0 (Remove Workflows):**
- Remove all 5 workflows from `.github/workflows/`
- Update `squad init` to NOT install these workflows
- Add `squad upgrade` to remove deprecated workflows

**v0.9.x (Optional Automation):**
- Add opt-in GitHub Actions workflow for users who want automation
- Users who want automation can install it themselves

### ✅ **Brady's Portability Insight Captured**

CLI-first = runs anywhere. Containers, Codespaces, on-prem servers, CI/CD pipelines outside GitHub Actions. This is a **competitive differentiator** — Squad becomes portable infrastructure, not GitHub-specific automation.

### ✅ **Customer Communication Strategy (3-Tier Model)**

**Tier 1: Manual CLI (Default)** — `squad init` installs no workflows  
**Tier 2: Semi-Automated (Opt-In)** — `squad init --with-automation` for normal teams  
**Tier 3: Full Automation (Enterprise)** — `squad init --with-full-automation` for power users  

**Core messaging:** "Squad puts *you* in control. No surprise automations."

---

## Quick Wins for v0.8.22

Per Fenster's feasibility analysis, these can ship immediately (4-7 hours):
1. `squad labels sync` — Reuse existing parsers, zero new deps (2-3h)
2. `squad labels enforce` — Label mutual-exclusivity logic (2-4h)

Per Keaton's roadmap directive:
- `squad labels sync` enhancement
- `squad labels enforce` command
- `squad triage` enhancement
- `squad watch` enhancement

---

## Technical Findings

### Fenster's Key Discovery
`squad watch` already does 80% of heartbeat work. The local equivalent already exists. Just needs comment posting feature (4-6 hours) to match workflow behavior.

### Kobayashi's CI/CD Assessment
- 5 workflows to remove = 12 min/month (safe, negligible cost)
- 9 workflows to keep = 215 min/month (load-bearing, event-driven guarantees)
- **Risk:** ZERO. All operations within merge-driver constraints. Idempotent migrations.

### McManus's Perception Finding
Billing reality: ~92 min/month.  
Perception reality: Trust > math. Users see unfamiliar automation and assume hidden costs.

---

## Decisions Documentation

All four agents documented their findings in `.squad/decisions/inbox/`:
- `keaton-actions-to-cli-strategy.md` — Full strategic analysis + UX design
- `fenster-cli-feasibility.md` — Technical implementation roadmap
- `kobayashi-ci-impact.md` — CI/CD risk assessment + backward compatibility
- `mcmanus-customer-impact.md` — Customer communication strategy + tier model

---

## Next Steps (Brady's Authority)

1. **Align on quick wins:** Implement `squad labels sync` + `squad labels enforce` in v0.8.22?
2. **Design UX:** Finalize `squad init --with-actions` flag implementation
3. **Update docs:** README → CLI-first narrative (start with README.md)
4. **Create migration playbook:** For Beta users transitioning from actions-first
5. **Blog post:** Announce CLI-first shift with empathy + clarity

---

## Team Outcomes

✅ **Keaton:** Strategic decision framework. 15 workflows classified. Phased roadmap.  
✅ **Fenster:** Implementation feasibility confirmed. Quick wins identified. PAT-only workflows flagged.  
✅ **Kobayashi:** Risk assessment: ZERO. Backward compatibility guaranteed. Migration is safe.  
✅ **McManus:** Customer message clarified. 3-tier model proposed. Trust restored.  

**Team Status:** All agents aligned. Ready for Brady's go/no-go decision.
