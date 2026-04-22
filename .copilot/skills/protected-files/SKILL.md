---
name: "protected-files"
description: "Zero-dependency bootstrap files that must never import npm packages or SDK code"
domain: "dependency-safety"
confidence: "high"
source: "earned — CLI startup crashes when bootstrap files import SDK code"
---

## Context

The CLI (`squad-cli`) has bootstrap utilities that run **before** the Squad SDK is loaded. If these files import SDK code (e.g., `FSStorageProvider`, anything from `squad-sdk`), the CLI breaks at startup — no helpful error, just a crash.

This skill applies when:
- Touching any file in `packages/squad-cli/src/cli/core/`
- Running sweeping refactors (e.g., "convert all `fs` calls to `StorageProvider`")
- Adding new bootstrap utilities

## Protected File List

| File | Purpose |
|------|---------|
| `packages/squad-cli/src/cli/core/detect-squad-dir.ts` | Finds `.squad/` directory at startup — runs before SDK init |
| `packages/squad-cli/src/cli/core/errors.ts` | Error classes (`SquadError`, `fatal()`) — used by all CLI entry points |
| `packages/squad-cli/src/cli/core/gh-cli.ts` | GitHub CLI wrapper — uses only `node:child_process` and `node:util` |
| `packages/squad-cli/src/cli/core/output.ts` | Color/emoji console output — pure ANSI codes, zero imports |
| `packages/squad-cli/src/cli/core/history-split.ts` | Separates portable knowledge from project data — pure string logic |

## Rules

- ❌ **NEVER** convert these files to use `FSStorageProvider`, `StorageProvider`, or any SDK abstraction
- ❌ **NEVER** add `import` or `require` statements referencing packages outside `node:*` built-ins
- ✅ **ONLY** use `node:fs`, `node:path`, `node:child_process`, `node:util`, and other Node.js built-in modules
- ✅ **DO** check this list before sweeping refactors
- ✅ **LOOK** for `— zero dependencies` markers in file headers as a signal

## SDK/CLI Package Boundary

The `packages/squad-cli/src/cli/core/` directory contains a mix of early-startup bootstrap utilities and later SDK-dependent modules. The protected list above is the **authoritative set** of zero-dependency bootstrap files. If you need to add SDK imports to another `core/` file, verify it is not in the protected list and confirm the SDK is loaded at that point in the startup sequence.

## Anti-Patterns

- Converting all `fs` calls to `StorageProvider` without checking this list first
- Adding `import { X } from '@bradygaster/squad-sdk'` to a bootstrap file
- Assuming every file in `core/` can safely import SDK code

## Adding New Bootstrap Utilities

When adding a new file that runs before SDK init:
1. Add it to the Protected File List table above
2. Write a matching zero-dependency regression test (see `detect-squad-dir-zero-deps.test.ts` for the pattern)
3. Add `— zero dependencies` marker in the file header

Regression tests guard these files, but **prevention is better than detection**.
