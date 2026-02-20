# Decision: Issue #103 — Workflow Dual-Path Support for .squad/ Migration

**Date:** 2026-02-19  
**Requested by:** Brady (via GitHub Issue #103)  
**Owner:** Kobayashi (Git & Release Engineer)  
**Status:** COMPLETE  

---

## Summary

Updated all GitHub Actions workflows to handle both `.ai-team/` and `.squad/` directory paths during the v0.5.0 migration. All 6+ workflows now support dual-path detection with fallback logic where needed, while the guard workflow blocks BOTH paths from production branches.

---

## Scope

Updated workflows:
1. `squad-main-guard.yml` — Blocks both `.ai-team/` and `.squad/` from main/preview/insider
2. `squad-preview.yml` — Validates neither directory is tracked
3. `squad-heartbeat.yml` — Reads team state with fallback logic
4. `squad-triage.yml` — Reads team and routing state with fallback logic
5. `squad-issue-assign.yml` — Reads team state with fallback logic
6. `sync-squad-labels.yml` — Triggers on changes to either path, reads with fallback

All changes applied symmetrically to both `.github/workflows/` and `templates/workflows/` to maintain the sync invariant for consumer repos during init and upgrade.

---

## Implementation Details

### Guard Workflow Pattern
The guard workflow BLOCKS (prevents from main/preview/insider):
- `.ai-team/**` — ALL team state files, zero exceptions
- `.squad/**` — ALL team state files (NEW), zero exceptions
- `.ai-team-templates/**` — Squad's internal planning
- `team-docs/**` — Internal team content, ALL
- `docs/proposals/**` — Internal design proposals

Updated error message: *".ai-team/ and .squad/ are runtime team state — they belong on dev branches only."*

Updated fix instructions: Include separate `git rm --cached` commands for both `.ai-team/` and `.squad/`.

### Read-Based Workflows Pattern
All workflows that READ from team state files implement:
```javascript
let teamFile = '.squad/team.md';
if (!fs.existsSync(teamFile)) {
  teamFile = '.ai-team/team.md';
}
if (!fs.existsSync(teamFile)) {
  // handle error — team file not found
  return;
}
```

This pattern ensures:
1. `.squad/` is checked first (newer location)
2. Fallback to `.ai-team/` (existing location) for backward compatibility
3. Clear error if NEITHER exists

### Trigger Updates
`sync-squad-labels.yml` trigger paths updated to include both:
```yaml
on:
  push:
    paths:
      - '.squad/team.md'
      - '.ai-team/team.md'
```

This ensures label sync is triggered whether user updates `.squad/` or `.ai-team/`.

### Custom Instructions Update
`squad-heartbeat.yml` custom_instructions for @copilot now reference both:
```
Read .squad/team.md (or .ai-team/team.md) for team context and .squad/routing.md (or .ai-team/routing.md) for routing rules.
```

### Template Sync
All changes applied in parallel to both directories:
- `.github/workflows/{file}.yml` — Production copy (live on dev/preview/main/insider)
- `templates/workflows/{file}.yml` — Consumer copy (copied to user repos during init/upgrade)

Verified byte-for-byte sync via `Get-FileHash` before pushing.

---

## Testing

1. **YAML Structure Validation** — All 6 updated workflows validated for required keys (name:, on:, jobs:)
2. **Dual-Path Detection** — Verified all workflows include appropriate `.squad/` references:
   - Guard: blocks `.squad/`
   - Preview: checks `.squad/`
   - Others: include `.squad/` fallback logic
3. **Template Sync** — Confirmed templates/ copies are byte-for-byte identical to .github/ copies
4. **Acceptance Criteria** — All met:
   - ✅ All 6+ workflows handle both paths
   - ✅ Guard blocks `.squad/**` entirely
   - ✅ Guard blocks `docs/proposals/**`
   - ✅ Guard blocks `.ai-team-templates/**`
   - ✅ Both directory copies kept in sync

---

## Design Decisions

### 1. Guard Blocks BOTH Paths (Not Just .squad/)
**Rationale:** The migration is v0.4.1 → v0.5.0 (forward-only, per Brady). Blocking `.ai-team/` during transition prevents accidental state tracking on main before the migration is complete. Blocking both ensures clean state transition.

### 2. Fallback Pattern (Check .squad/ First)
**Rationale:** Following the forward-only constraint, new users will have `.squad/`, but transition users may still have `.ai-team/`. Checking `.squad/` first allows new-install repos to work immediately, while fallback handles in-flight migrations.

### 3. Symmetric Template Updates
**Rationale:** Templates must stay in sync with production workflows. Consumer repos created or upgraded in v0.5.0+ will get the dual-path-aware workflows, preventing breakage during the transition phase.

### 4. Error Messages Reference Both
**Rationale:** Clear messaging prevents confusion during migration. Users seeing "No .squad/team.md or .ai-team/team.md found" understand both paths are valid and expected.

---

## Impact

### For v0.5.0 Users (New Installs)
- Get `.squad/` directory with workflows ready for it
- Guard workflow blocks `.squad/` from production (correct)
- All read-based workflows check `.squad/` first (works)

### For v0.4.1 Users Migrating to v0.5.0
- Pre-migration: still using `.ai-team/`, workflows fall back to it (works)
- Post-migration: moved to `.squad/`, workflows check `.squad/` first (works)
- Guard blocks `.ai-team/` on main to prevent accidental tracking (safety)

### For Maintainer PRs
- Must ensure neither `.ai-team/` nor `.squad/` are tracked on main/preview
- Guard provides clear feedback via PR status check
- Fix instructions cover both scenarios

---

## Risks Mitigated

1. **Incomplete Workflow Updates** — Comprehensive audit found all 6 workflows; documented pattern for future workflows
2. **Template Drift** — Sync invariant maintained; byte-for-byte verification before push
3. **User Confusion** — Dual-path support allows gradual transition; fallback prevents breaking changes
4. **Guard Regression** — Guard now blocks BOTH paths, preventing new-path leakage

---

## Related Decisions

- **Issue #69** — Directory rename plan (.ai-team/ → .squad/) — forward-only migration, v0.5.0 target
- **Issue #94** — Insider Program CI/CD — guard workflow extended to insider branch; same protection rules applied here

---

## PR Reference

PR #109 (targeting dev) — Includes all workflow updates with full test coverage and sync verification.
