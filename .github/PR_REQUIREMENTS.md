# PR Requirements — Squad Repository

> **This file is the canonical source of truth for PR requirements.**
> Issue #106 tracks the PRD; this file is the versioned spec.
> Changes to this file must go through PR review (audit trail).

---

## Definition of "User-Facing Change"

A PR contains a **user-facing change** if it introduces a CRUD operation to the CLI or SDK layer that is exposed in TypeScript or true executable functionality.

"User-facing" is anchored to two concrete package boundaries:
- **SDK layer**: `packages/squad-sdk/src/` exports exposed in `package.json` subpath exports
- **CLI layer**: `packages/squad-cli/src/cli/` commands and subcommands

### CRUD Operations — What Counts as User-Facing

| Operation | SDK Layer | CLI Layer |
|-----------|-----------|-----------|
| **Create** | New export added to `packages/squad-sdk/src/`; new subpath export added to `package.json` | New CLI command or subcommand added to `packages/squad-cli/src/cli/commands/` |
| **Read** | N/A — reading doesn't change the surface | N/A — reading doesn't change the surface |
| **Update** | Change to existing public API signature (parameters, return types, behavior) | Change to CLI command flags, behavior, or subcommand structure |
| **Delete** | Remove a previously public export from `package.json` | Remove a CLI command or subcommand |

### What Is NOT User-Facing

- `.squad/` state files (decisions, history, skills, templates)
- Internal refactors that don't change the public API surface
- Infrastructure (CI, GitHub Actions, workflows)
- Documentation-only changes
- Dependency updates that don't change API surface

Why this matters: The requirement categories below apply conditionally to user-facing changes. Knowing what counts as user-facing prevents disputes about "does this need a CHANGELOG entry?"

### Examples of "new module"

- Adding a new directory under packages/squad-sdk/src/ (e.g., src/storage/, src/casting/)
- Adding a new subpath export to package.json (e.g., ./storage, ./casting)
- Adding a new CLI command file under packages/squad-cli/src/cli/commands/

### NOT a new module

- Adding a new function to an existing module
- Refactoring internals without changing the public API surface
- Adding test files

---

## PR Requirements by Category

Requirements are ordered by review flow. All marked **REQUIRED** must be satisfied before merge. Some are automatically enforced (CI gates); others require human review.

### a) Git Hygiene (REQUIRED — automated)

- [ ] Commits reference the issue number: `Closes #N` or `Part of #N` in commit message
- [ ] No binary files or build artifacts committed (`dist/`, `node_modules/`, `.DS_Store`, etc.)
- [ ] No unrelated file changes (bleed check: only files needed for the stated goal)
- [ ] Clean commit history: logical commits or squashed to a single coherent commit
- [ ] No force-pushes to shared branches (`dev`, `main`)

**Enforced by**: squad-ci.yml bleed check + git hooks

### b) CI / Build (REQUIRED — automated)

- [ ] Build passes: `npm run build` completes successfully
- [ ] All existing tests pass: `npm test` or `npm run test`
- [ ] No new build warnings introduced without justification in PR description
- [ ] Feature flags documented in code and CHANGELOG if gating new behavior

**Enforced by**: GitHub Actions CI pipeline

### c) Code Quality (REQUIRED — manual review for completeness, automated for linting)

- [ ] All new public APIs have JSDoc/TSDoc comments
- [ ] No lint errors: `eslint` passes
- [ ] No type errors: `tsc --noEmit` passes
- [ ] Tests written for all new functionality
- [ ] All tests pass: `vitest` exits 0

**Enforced by**: eslint in CI + manual code review

### d) Documentation (REQUIRED for user-facing changes — manual review)

- [ ] CHANGELOG.md entry under `[Unreleased]` following Keep-a-Changelog format
  - Example: `### Added — FeatureName (#N) — short description`
  - Required when: `packages/squad-sdk/src/` or `packages/squad-cli/src/` changes
- [ ] README.md section updated if adding a new feature or module to the SDK
- [ ] Docs feature page added under `docs/src/content/docs/features/` if adding a user-facing capability
- [ ] `docs/src/navigation.ts` updated if a new docs page is added
- [ ] Docs build test updated if a new feature page is added (Playwright test in CI)

**Enforced by**: Manual PR review (FIDO, Flight) + future automated checks in #104

### e) Package / Exports (REQUIRED for new modules — manual review)

- [ ] `package.json` subpath exports updated when new modules are added
  - Both types (`.d.ts`) and import (`.js`) entries required per export
  - Example: the `/storage` export was missing from #640 until the audit caught it
- [ ] No accidental dependency additions: `package-lock.json` changes reviewed for unexpected deps
- [ ] No export regressions: existing exports remain present and functional

**Enforced by**: Manual PR review + future export audit gate in #104

### f) Samples (REQUIRED when API changes — manual review)

- [ ] Existing sample projects updated if the PR changes a public API they use
- [ ] New user-facing features include at least one sample demonstrating usage
- [ ] Sample README.md explains what the sample does and how to run it
- [ ] Samples build and run: `npm run build` in sample directory succeeds

**Enforced by**: Manual PR review + #103 (Samples CI coverage)

---

## Breaking Change Policy

Any PR that changes the public API in a backward-incompatible way (removal, signature change, behavior change) must:

- [ ] Document the breaking change in CHANGELOG.md under a `[BREAKING]` section
- [ ] Add a migration guide as a docs note in the affected feature page
- [ ] Update all sample projects to use the new API
- [ ] Include the migration path in the PR description (`## Breaking Changes` section)

**Examples of breaking changes:**
- Removing an export that was previously public
- Changing function signature (parameter name, order, type)
- Changing CLI command name or subcommand structure
- Changing configuration file format in backward-incompatible way

**Examples NOT breaking:**
- Adding new optional parameters
- Adding new exports
- Adding new subcommands (existing ones unchanged)
- Fixing documented behavior that was incorrect

---

## Exception / Waiver Process

Emergencies (security fixes, critical bugs) require flexibility. Any requirement can be waived if documented and approved.

### How to Request a Waiver

Add to PR description under a `## Waivers` section:

```
## Waivers

- Item waived: (d) Documentation CHANGELOG entry
- Reason: Security fix needs urgent release (CVE-2024-XXXXX)
- Approval by: [Flight/FIDO to be stated in PR review comment]
```

### Waiver Approval Authority

- **Flight (architecture decisions)**: Internal refactors, infrastructure, module reorganization
- **FIDO (quality decisions)**: Bug fixes, test improvements, samples, CI changes
- **Both**: External API changes, breaking changes

### Waiver Approval Examples

| Scenario | Waivable Items | Approver |
|----------|----------------|----------|
| Internal refactor (no API change) | Documentation, Samples | Flight |
| Security fix | Documentation, Samples (with follow-up issue) | FIDO |
| Test infrastructure change | Documentation, Exports, Samples | FIDO |
| CI/GitHub Actions update | Documentation, Exports, Samples | FIDO |
| Documentation-only change | Code Quality (tests), Exports, Samples | FIDO |
| Non-breaking SDK bugfix | Samples | FIDO |

### Self-Waiving Is Not Allowed

- Do NOT use skip labels without explicit reviewer approval in PR comments
- Do NOT remove requirements from checklist without documented waiver
- Do NOT claim "documentation will follow" without a tracked follow-up issue

---

## Edge Case Exemptions

Certain PR types are categorically exempt from specific requirements by nature. These are **NOT** waivers (no approval needed); they are structural exemptions.

| PR Type | Exempt From | Reason |
|---------|-------------|--------|
| Internal refactor (no public API change) | (d) Docs, (f) Samples | No user-visible change |
| Test-only changes | (d) Docs, (e) Exports, (f) Samples | No production code changed |
| CI/GitHub Actions workflow changes | (d) Docs, (e) Exports, (f) Samples | Infrastructure only |
| Documentation-only changes | (c) Code Quality (tests), (e) Exports, (f) Samples | No code changes |
| Dependency bumps (routine maintenance) | (d) Docs feature page, (f) Samples | Routine dependency update |

**Important**: Exemptions apply only when the PR genuinely affects NO code in the exempted categories. A PR touching both infrastructure AND public APIs is NOT exempt.

---

## PR Size Guidelines

| Size | Files Changed | Guidance |
|------|---------------|----------|
| Small | < 10 files | Preferred. Fast to review, easy to revert. |
| Medium | 10–20 files | Acceptable. Justify scope in PR description. |
| Large | > 20 files | Must be split or justified with written explanation. |
| Red flag | > 50 files | STOP — split the PR or get explicit written approval before proceeding. |

For migration PRs (> 20 files): include test output summary in the PR description.

---

## Known Limitations

### 1. Enforceability Gap

9 of 18 requirements are manual-only with no CI gate (README updates, docs page relevance, sample completeness, migration guide quality). Enforcement depends on consistent reviewer judgment.

**Automation dependency**: 9 of 18 requirements are manual-only. Issue #104 (PR completeness gates) is the critical path to automated enforcement. Until #104 ships, this spec depends on reviewer discipline.

**Mitigation**: Phase 4 (Flight/FIDO checklist) codifies consistent judgment. Regular enforcement audits catch drift.

### 2. Theater Risk

Calling something "REQUIRED" without automated enforcement creates appearance of rigor without substance. Phase 3 (#104) prioritizes high-leverage automated gates (CHANGELOG, exports, build). Manual-only items are clearly labeled.

### 3. Silent Drift Risk

This requirements file is the source of truth. CI gate scripts (#104) and reviewer checklists (#100) must be manually updated if requirements change. Quarterly review cycle to resync.

### 4. Ambiguities

- **"Module" definition**: new directory under `packages/squad-sdk/src/` or new export namespace. Refactoring existing module does not trigger export requirement.
- **"User-facing" detection for CHANGELOG**: Currently manual. #104 will implement export-diff detection.

---

## Relationship to Other Issues

| Issue | Role |
|-------|------|
| #100 (Review completeness) | Defines the review *process* — this file defines *what reviewers check against* |
| #103 (Samples CI coverage) | Implements the "samples" requirement category (f) |
| #104 (PR completeness gates) | Implements automated enforcement of REQUIRED items as CI gates |

This file is the source of truth. #100 and #104 derive their checklists from it.
