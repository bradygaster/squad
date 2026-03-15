# Network

## Core Context

Template placement: canonical skill source is `.squad/skills/`, copies to `packages/*/templates/skills/` for npm distribution. Root `templates/` is NOT used by SDK/CLI init code. Build auto-syncs from canonical to packages via `scripts/sync-skill-templates.mjs`.

## Patterns

**Distributed mesh template placement:** Three parallel template locations (root, SDK, CLI) receive the SKILL.md. The mesh/ directory holds sync scripts and config example. Both init paths (`squad-sdk` and `squad-cli`) can scaffold them into new projects.

**Mesh state repo init mode:** --init flag in sync scripts for scaffolding mesh state repositories. Generates directory structure: squad folders with placeholder SUMMARY.md files, plus root README listing participants. Idempotent — skips existing files.
