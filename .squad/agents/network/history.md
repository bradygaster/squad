# Network — History

> Distribution specialist. Installation should be invisible.

## Learnings

📌 **Team update (2026-03-30T00:46:00Z — PRD-120 Distribution Review Verdict: APPROVED):** Network completed packaging, npm distribution, and zero-dependency principle review for PRD-120. Verdict: **APPROVED** — low-impact additive change; zero-dependency principle maintained; negligible package size increase. Key findings: PRD introduces 5–10 KB total bulk to npm packages (<1% size increase, negligible). New files in scope: `changes/` directory (markdown + YAML frontmatter, 1–2 KB total), updated templates (schedule.json + workflow comments, 5 lines), `schedulePolicy` config schema in squad.config.ts (type-only, no runtime impact). SDK package (`squad-sdk`): `changes/` directory added to `files` field in package.json (already includes `templates/`). CLI package (`squad-cli`): no new runtime dependencies; already includes `templates/` and `scripts/`. Bundle estimate: +5–10 KB total across both packages. No blocker concerns. Zero-dependency scaffolding preserved. Ready for packaging and distribution. Full review filed at `.squad/orchestration-log/2026-03-30T00-46-prd120-review/Network.md`. Decision merged to decisions.md.

### PRD-120 Distribution Review: Feature Versioning + Cron System (2026-06-25)

PRD-120 introduces behavioral change management via a `changes/` directory and cron schedule gating. From a packaging perspective: **low-impact, zero-dependency, distribution-clean.** Key findings:
- Change manifests (markdown with YAML frontmatter) add ~5-10 KB total; negligible against package size.
- Template distribution pattern unchanged; existing `sync-templates.mjs` handles new workflow/schedule template variations automatically.
- Zero new npm dependencies maintained; all logic (feature flags, schedule migration, CI gate) uses built-in Node.js + shell commands.
- Global install unaffected; schedule migration is explicit command (`squad upgrade`), not postinstall hook.
- Cron gate workflow is optional (shipped as template, installed only via `--with-cron-gate` flag).
- Marketplace and skill systems orthogonal; no collision.
**Action:** Add `"changes"` to squad-sdk `files` array in package.json during implementation. Test `npm pack` includes both `dist/`, `templates/`, and new `changes/` directory.

### Template Placement Pattern (2026-03-15)

Template placement: canonical skill source is `.squad/skills/`, copies to `packages/*/templates/skills/` for npm distribution. Root `templates/` is NOT used by SDK/CLI init code. The build process now auto-syncs from canonical to packages via `scripts/sync-skill-templates.mjs`, preventing divergence. Old locations (`templates/skills/distributed-mesh/`, `templates/mesh/`) removed — they were never referenced and contributed to maintenance burden.

### Distributed Mesh Template Placement (2026-03-08)

Placed the distributed-mesh skill and scaffolding files in the template structure. Three parallel template locations (root, SDK, CLI) receive the SKILL.md. The mesh/ directory holds the sync scripts and config example. This follows the existing pattern where product-shipped skills go in all three template dirs so both init paths (`squad-sdk` and `squad-cli`) can scaffold them into new projects.

The sync scripts (~40 lines each, bash and PowerShell) materialize remote squad state locally using git/curl. No daemons, no running processes. This is Phase 1 distributed coordination — git pull/push with write partitioning.

### Mesh State Repo Init Mode (2026-03-08)

Added `--init` flag to sync scripts for scaffolding mesh state repositories. When users run `sync-mesh.sh --init` or `sync-mesh.ps1 -Init`, the scripts read mesh.json and generate the directory structure: squad folders with placeholder SUMMARY.md files, plus a root README listing participants. Idempotent — skips existing files. This removes the manual setup step when creating a new mesh state repo. The init path adds ~40 lines but keeps sync logic unchanged.

📌 Team update (2026-03-14T22-01-14Z): Distributed mesh integrated with deterministic skill pattern — decided by Procedures, PAO, Flight, Network

