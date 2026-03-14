# Network — History

> Distribution specialist. Installation should be invisible.

## Learnings

### Template Placement Pattern (2026-03-15)

Template placement: canonical skill source is `.squad/skills/`, copies to `packages/*/templates/skills/` for npm distribution. Root `templates/` is NOT used by SDK/CLI init code. The build process now auto-syncs from canonical to packages via `scripts/sync-skill-templates.mjs`, preventing divergence. Old locations (`templates/skills/distributed-mesh/`, `templates/mesh/`) removed — they were never referenced and contributed to maintenance burden.

### Distributed Mesh Template Placement (2026-03-08)

Placed the distributed-mesh skill and scaffolding files in the template structure. Three parallel template locations (root, SDK, CLI) receive the SKILL.md. The mesh/ directory holds the sync scripts and config example. This follows the existing pattern where product-shipped skills go in all three template dirs so both init paths (`squad-sdk` and `squad-cli`) can scaffold them into new projects.

The sync scripts (~40 lines each, bash and PowerShell) materialize remote squad state locally using git/curl. No daemons, no running processes. This is Phase 1 distributed coordination — git pull/push with write partitioning.

### Mesh State Repo Init Mode (2026-03-08)

Added `--init` flag to sync scripts for scaffolding mesh state repositories. When users run `sync-mesh.sh --init` or `sync-mesh.ps1 -Init`, the scripts read mesh.json and generate the directory structure: squad folders with placeholder SUMMARY.md files, plus a root README listing participants. Idempotent — skips existing files. This removes the manual setup step when creating a new mesh state repo. The init path adds ~40 lines but keeps sync logic unchanged.

📌 Team update (2026-03-14T22-01-14Z): Distributed mesh integrated with deterministic skill pattern — decided by Procedures, PAO, Flight, Network

