# Release Checklist

This document outlines the steps for preparing and shipping Squad releases. Follow the appropriate checklist based on the release type.

## Pre-Release Steps (All Releases)

- [ ] Ensure all PRs targeting the release branch are merged and reviewed
- [ ] Pull latest `dev` branch: `git pull origin dev`
- [ ] Run full test suite: `npm test`
- [ ] All tests pass (53+ tests for current version)
- [ ] Review CHANGELOG.md for accuracy and completeness
- [ ] Verify package.json version matches intended release version

## Patch Release (e.g., 0.4.2 → 0.4.3)

**Purpose:** Bug fixes and patches with no new features or breaking changes.

### Steps

1. Create patch branch: `git checkout -b squad/patch-{version}`
2. Update `package.json` version: increment patch number (e.g., 0.4.2 → 0.4.3)
3. Add `CHANGELOG.md` entry with date:
   ```markdown
   ## [0.4.3] — YYYY-MM-DD
   
   ### Fixed
   - Description of fix
   ```
4. Commit: `git commit -m "chore: v0.4.3 patch release"`
5. Push and create PR: `git push origin squad/patch-{version}`
6. Get review and merge to `dev`
7. Merge `dev` → `main`
8. CI automatically creates GitHub release

## Minor Release (e.g., 0.4.2 → 0.5.0)

**Purpose:** New features with backward compatibility. Commonly used for feature cadence releases.

### Steps

1. Create release branch: `git checkout -b squad/{issue}-release-hardening`
2. Update `package.json` version: increment minor number (e.g., 0.4.2 → 0.5.0)
3. Update all affected workflow files and templates:
   - `.github/workflows/squad-preview.yml`
   - `.github/workflows/squad-release.yml`
   - `templates/workflows/squad-preview.yml`
   - `templates/workflows/squad-release.yml`
4. Add `CHANGELOG.md` entry with new features:
   ```markdown
   ## [0.5.0] — Unreleased
   
   ### Added
   - Feature description
   - Another feature
   ```
5. Test all changes locally and in CI
6. Commit: `git commit -m "chore: v0.5.0 release hardening — version bump, CI validation, docs"`
7. Push and create PR: `git push origin squad/{issue}-release-hardening`
8. Get review and merge to `dev`
9. Merge `dev` → `main`
10. CI automatically creates GitHub release

## Major Release (e.g., 0.4.2 → 1.0.0)

**Purpose:** Breaking changes, significant refactors, or major feature releases.

### Steps

1. Create release branch: `git checkout -b squad/major-{version}-release`
2. Update `package.json` version: increment major number (e.g., 0.4.2 → 1.0.0)
3. Add migration guide if needed (breaking changes documentation)
4. Update all affected files (same as minor release)
5. Update `CHANGELOG.md` with detailed breaking changes section:
   ```markdown
   ## [1.0.0] — Unreleased
   
   ### Breaking Changes
   - Clear description of breaking change
   - Migration guidance
   
   ### Added
   - New feature
   ```
6. Comprehensive testing and validation
7. Commit and push with clear messaging
8. Create PR with detailed description of breaking changes
9. Get thorough review and merge to `dev`
10. Merge `dev` → `main`
11. CI automatically creates GitHub release

## CI Validation Steps

The following checks run automatically in CI (no manual action required):

### In `squad-preview.yml` (Preview Branch)

- Runs full test suite
- Validates no `.ai-team/` or `.squad/` files are tracked
- Validates package.json contains a version
- **NEW:** Validates version consistency with CHANGELOG.md

### In `squad-release.yml` (Main Branch)

- Runs full test suite
- Reads version from package.json
- Checks if tag already exists (prevents duplicate releases)
- **NEW:** Validates version consistency with CHANGELOG.md
- Creates git tag (e.g., `v0.5.0`)
- Creates GitHub Release with auto-generated notes
- Verifies release was created successfully

## Key Requirements

- **CHANGELOG.md must have entry** for every release version (validated in CI)
- **Version consistency** between `package.json` and CHANGELOG.md is enforced
- **All tests must pass** before release can proceed
- **No `.ai-team/` or `.squad/` files** on preview or main branches

## References

- [GitHub Actions Workflows](.github/workflows/)
- [Package Configuration](package.json)
- [Changelog](CHANGELOG.md)
