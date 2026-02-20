### 2026-02-19: squad.agent.md path migration to .squad/ (#102)

**By:** Verbal (via bradygaster)

**What:** Migrated all `.ai-team/` and `.ai-team-templates/` path references in `squad.agent.md` and templates to `.squad/` and `.squad/templates/`. Updated 13 files with 93 path reference changes in the coordinator prompt alone. Changed deprecation banner to Migration Banner (v0.5.0) to reflect that the migration IS happening in this version.

**Why:** Part of the v0.5.0 path migration (#69). This PR updates the coordinator's own governance file — the prompt that drives Squad behavior. All path references now point to `.squad/` as the canonical location. Backward-compatibility fallback language preserved for legacy repos (e.g., "Check if `.squad/` exists, fall back to `.ai-team/`"). The dual-path infrastructure from Fenster's #101 enables graceful migration.

**Impact:**
- squad.agent.md now references `.squad/` as the primary path throughout
- All templates (charter, scribe, copilot-instructions, workflows) use `.squad/` paths
- `.gitattributes` examples updated to `.squad/` paths
- Git commit messages now use `docs(squad):` prefix instead of `docs(ai-team):`
- 4 backward-compat references remain (intentional — for legacy detection)

**⚠️ Self-development note:** squad.agent.md has been updated. Brady should restart the session to pick up the new coordinator behavior. This applies to any project where agents modify their own governance files — the current session runs on stale instructions until restart.

**Related:**
- Depends on #101 (Fenster's runtime path migration — dual-path infrastructure)
- Pairs with #104 (template directory merge — `.ai-team-templates/` → `.squad/templates/`)
- PR: #113

**Testing:** 52/53 tests passing. The 1 failing test (marketplace state persistence) is pre-existing — `index.js` still writes to `.ai-team/`, which Fenster fixes in #101.
