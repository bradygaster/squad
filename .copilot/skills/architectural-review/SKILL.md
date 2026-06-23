---
name: "architectural-review"
description: "How to review PRs for architectural quality — module boundaries, dependency direction, export surface, pattern consistency"
domain: "architecture"
confidence: "medium"
source: "extracted from copilot-instructions.md patterns and codebase conventions"
---

## Context

When reviewing a PR that touches core architecture, the reviewer must verify that structural invariants are preserved. This skill covers **reviewing existing PRs** for architectural quality — not writing proposals (see `architectural-proposals/SKILL.md` for that).

Use this skill when a PR includes any of:
- New modules, packages, or directories
- Dependency changes (`package.json`, `import` additions across package boundaries)
- API surface changes (new or modified exports from `index.ts` barrel files)
- Cross-package imports (anything crossing the SDK/CLI boundary)
- New abstractions (interfaces, base classes, registries, factories)
- Sweeping refactors (file renames, pattern migrations, bulk conversions)

## Patterns

### 1. Module Boundary Enforcement

The Squad codebase has two core packages with a strict dependency direction:

```
squad-cli → depends on → squad-sdk
squad-sdk → NEVER depends on → squad-cli
```

**Check every new `import` statement in the PR:**
- CLI files may import from SDK (`@bradygaster/squad-sdk`)
- SDK files must NEVER import from CLI
- If a PR adds an SDK import that pulls in CLI code, reject it

### 2. Zero-Dependency Bootstrap Contract

The CLI has **protected bootstrap files** that must use ONLY Node.js built-in modules (`node:fs`, `node:path`, `node:child_process`, `node:util`). These files run before the SDK is loaded.

**Protected files (authoritative list from copilot-instructions.md):**

| File | Purpose |
|------|---------|
| `packages/squad-cli/src/cli/core/detect-squad-dir.ts` | Finds `.squad/` at startup |
| `packages/squad-cli/src/cli/core/errors.ts` | Error classes (`SquadError`, `fatal()`) |
| `packages/squad-cli/src/cli/core/gh-cli.ts` | GitHub CLI wrapper |
| `packages/squad-cli/src/cli/core/output.ts` | Color/emoji console output |
| `packages/squad-cli/src/cli/core/history-split.ts` | Portable knowledge separator |

**Review checklist for bootstrap files:**
- ❌ No new `import` or `require` of anything outside `node:*`
- ❌ No conversion to `FSStorageProvider`, `StorageProvider`, or SDK abstractions
- ✅ Look for `— zero dependencies` markers in file headers
- ✅ If the PR adds a new bootstrap utility, it must be added to this table and have a zero-dependency regression test

### 3. Export Surface Safety

Changes to barrel files (`index.ts`) have downstream impact. Barrel files define the public API of a package.

**Review checklist:**
- **Adding exports:** Is the new export intentional? Does it expose implementation details that should stay internal?
- **Removing exports:** Are downstream consumers accounted for? Removing an export is a breaking change.
- **Renaming exports:** Same as remove + add — breaks anyone using the old name. Look for typos (e.g., `FSStorageProvidr` vs. `FSStorageProvider`).
- **Re-exports:** If the PR adds `export * from './internal-module'`, verify that the internal module doesn't accidentally expose private types.

### 4. Sweeping Refactor Safety

When a PR applies a codebase-wide pattern change (e.g., "convert all `fs` calls to `StorageProvider`"), verify the 5-step checklist from project instructions:

1. **Protected Files checked** — None of the protected bootstrap files were converted
2. **Zero-dependency markers scanned** — Files with `— zero dependencies` headers were skipped
3. **Imports resolve** — Every `import { X } from '@bradygaster/squad-sdk'` references an export that actually exists in the SDK barrel file
4. **Not blindly applied** — File-specific constraints were respected
5. **Batched testing** — Changes were tested in logical groups, not all 30 files at once

### 5. Template Sync Awareness

Template files exist in **four locations** and must stay consistent:

```
templates/                          # Source of truth
.squad-templates/                   # Local project templates
packages/squad-cli/templates/       # CLI-bundled templates
.github/workflows/                  # Workflow templates
```

If a PR modifies a template in one location, check:
- Was the change mirrored to other locations where the same template exists?
- Does `TEMPLATE_MANIFEST` in `templates.ts` still correctly map files to agents?
- Were any new templates added to the manifest?

### 6. `.squad/` Leakage Check

`.squad/` files (team config, decisions, agent charters) must NOT leak into feature PRs that are about code changes.

**Check:**
- If the PR is labeled as a feature or bugfix, it should not modify `.squad/team.md`, `.squad/decisions.md`, `.squad/routing.md`, or agent charters — unless the issue specifically calls for it
- `.squad/decisions/inbox/` files are acceptable if the PR documents a decision made during implementation
- `.squad-templates/` changes are acceptable only if the PR is about template functionality

### 7. Pattern Consistency

New code should follow established patterns in the codebase. Look for:
- **Naming conventions:** Does the new module follow existing naming? (e.g., `kebab-case` file names, `PascalCase` classes)
- **Error handling:** Does the new code use `SquadError` and `fatal()` from `errors.ts`, or does it invent its own error patterns?
- **Storage abstraction:** Does the new code use `StorageProvider` for file I/O (except in protected bootstrap files)?
- **Test patterns:** Does the PR include tests that follow the existing test structure?

### 8. Dependency Direction in `core/`

The `packages/squad-cli/src/cli/core/` directory contains a **mix** of:
- Early-startup bootstrap utilities (zero external deps — protected)
- Later SDK-dependent modules (may import from SDK)

When reviewing changes to `core/` files:
- Verify the file is not in the protected list before accepting SDK imports
- Confirm the SDK is loaded at the point where the file runs in the startup sequence
- Watch for new files added to `core/` — determine if they are bootstrap or post-SDK and document accordingly

## Examples

**Example 1: Reject — SDK import in bootstrap file**
```
PR adds to detect-squad-dir.ts:
  import { FSStorageProvider } from '@bradygaster/squad-sdk';

Finding: REJECT — detect-squad-dir.ts is a protected bootstrap file.
It runs before the SDK is loaded. This import will crash the CLI at startup.
Recommendation: Use node:fs directly. See Protected Files table.
```

**Example 2: Reject — Reverse dependency**
```
PR adds to packages/squad-sdk/src/storage.ts:
  import { detectSquadDir } from '@bradygaster/squad-cli';

Finding: REJECT — SDK must never depend on CLI. Dependency direction is
CLI → SDK, not reverse. Move the shared logic to SDK or extract to a
shared utility within the SDK package.
```

**Example 3: Approve with note — Template change in one location**
```
PR modifies templates/squad.agent.md but not .squad-templates/squad.agent.md

Finding: APPROVE with note — Template was updated in templates/ but the
same file in .squad-templates/ was not synced. Verify whether .squad-templates/
should match or if it intentionally diverges.
```

**Example 4: Reject — Sweeping refactor hits protected file**
```
PR titled "Convert all fs calls to StorageProvider" modifies 15 files,
including packages/squad-cli/src/cli/core/output.ts

Finding: REJECT — output.ts is a protected zero-dependency bootstrap file.
The PR must skip this file. See Sweeping Refactor Rules step 1.
```

**Example 5: Flag — Mass file deletion**
```
PR deletes 25 files as part of "cleanup unused modules"

Finding: FLAG — More than 20 files deleted. This exceeds the red flag
threshold. Verify each deletion is intentional and no downstream imports
are broken. Recommend splitting into smaller PRs.
```

## Review Output Format

Structure your architectural review as:

```
## Architectural Review

**Verdict:** APPROVE | APPROVE WITH NOTES | REQUEST CHANGES | REJECT

### Findings

1. [severity: critical|high|medium|low] — description
   - File(s): path/to/file.ts
   - Recommendation: what to fix

2. [severity: ...] — ...

### Summary
Brief explanation of architectural impact and any required follow-ups.
```

## Anti-Patterns

- ❌ Approving SDK imports in protected bootstrap files ("it's just one import")
- ❌ Ignoring barrel file changes ("it's just adding an export")
- ❌ Skipping template sync check ("they probably know about the other locations")
- ❌ Accepting sweeping refactors without verifying the 5-step checklist
- ❌ Allowing `.squad/` config changes in feature PRs without justification
- ❌ Approving reverse dependencies (SDK importing from CLI) for "convenience"
- ❌ Letting new `core/` files slip in without classifying them as bootstrap vs. post-SDK
- ❌ Rubber-stamping PRs that delete >20 files without line-by-line deletion review
