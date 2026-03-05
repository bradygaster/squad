---
"@bradygaster/squad-cli": patch
---

Fix migration experience for users upgrading from v0.5.x

- Shell now scaffolds `.squad/` via `sdkInitSquad()` when `team.md` is absent, instead of blocking all input with a circular "Run /init" message
- Add `squad migrate` command: backs up `.squad/`, cleans squad-owned files, reinitializes, then restores user-owned files. Supports `--dry-run` and `--backup-dir` flags
- Fix `scrub-emails` default directory (`.ai-team/` → `.squad/`)
- Rewrite `docs/scenarios/upgrading.md`: remove stale `npx github:bradygaster/squad` references, add correct commands for global/local/npx install methods
- Update `docs/scenarios/troubleshooting.md`: fix Node.js version requirement (22→20), remove SSH hang section specific to removed distribution
- Update `docs/get-started/migration.md`: fix Node.js version (18→20), use `@latest` instead of pinned version, document all three install methods, add `squad migrate` usage
