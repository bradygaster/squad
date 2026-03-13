# Network — History

> Distribution specialist. Installation should be invisible.

## Learnings

### Distributed Mesh Template Placement (2026-03-08)

Placed the distributed-mesh skill and scaffolding files in the template structure. Three parallel template locations (root, SDK, CLI) receive the SKILL.md. The mesh/ directory holds the sync scripts and config example. This follows the existing pattern where product-shipped skills go in all three template dirs so both init paths (`squad-sdk` and `squad-cli`) can scaffold them into new projects.

The sync scripts (~40 lines each, bash and PowerShell) materialize remote squad state locally using git/curl. No daemons, no running processes. This is Phase 1 distributed coordination — git pull/push with write partitioning.
