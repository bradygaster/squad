# Decision: Fix npx bin resolution for squad-cli

**Date:** 2026-02-22
**Author:** Rabin (Distribution)
**Status:** Implemented & Published

## Context
`npx @bradygaster/squad-cli@0.8.0 --version` printed "squad-cli placeholder — full CLI coming soon" instead of running the real CLI. The bin entry was `"squad": "./dist/cli-entry.js"` but npx resolves by unscoped package name (`squad-cli`), not by custom bin names.

## Decision
1. Added `"squad-cli"` as second bin entry pointing to `./dist/cli-entry.js`
2. Replaced orphaned placeholder `dist/cli.js` with redirect to `cli-entry.js`
3. Bumped version to 0.8.1 (0.8.0 immutable on npm)
4. Published @bradygaster/squad-cli@0.8.1 to npm

## Consequence
- `npx @bradygaster/squad-cli` now runs the real CLI
- `squad` command still works for global installs
- Both bin names resolve to the same entry point
- Future releases must keep both bin entries
