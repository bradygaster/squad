# v0.9.0 CHANGELOG Organization Decision

**Author:** Surgeon (Release Manager)
**Date:** 2026-03-23
**Status:** Final

## Decision

v0.9.0 is a MAJOR minor version bump (0.8.25 → 0.9.0) justified by:
- **40+ commits** across governance, orchestration, and capability enhancements
- **6+ major features** fundamentally changing squad topology and cost management
- **New governance layer** (Personal Squad) enabling isolated developer workspaces
- **Breaking behavioral changes** in worktree spawning, capability discovery, and rate limiting

## CHANGELOG Organization

Version 0.9.0 released 2026-03-23 with the following structure:

### Features (12 sections):
1. Personal Squad Governance Layer
2. Worktree Spawning & Orchestration
3. Machine Capability Discovery
4. Cooperative Rate Limiting
5. Economy Mode
6. Auto-Wire Telemetry
7. Issue Lifecycle Template
8. KEDA External Scaler Template
9. GAP Analysis Verification Loop
10. Session Recovery Skill
11. Token Usage Visibility
12. GitHub Auth Isolation Skill
13. Docs Site Improvements (Astro)
14. Skill Migrations
15. ESLint Runtime Anti-Pattern Detection

### Fixes (5 sections):
1. CLI Terminal Rendering (from [Unreleased])
2. Upgrade Path & Installation
3. ESM Compatibility
4. Runtime Stability
5. GitHub Integration

### Metadata:
- 40+ commits organized
- 6+ major features highlighted
- 15+ stability/compat fixes categorized
- "By the Numbers" summary included
- Tested at scale claim documented

## Style Compliance

✅ **Strict adherence to existing CHANGELOG format:**
- Matched existing markdown headers and subsection structure
- Used `### Added — Feature Name` pattern
- Used `### Fixed — Category Name` pattern
- Bullet points with PR references in (#NNN) format
- No commit hashes in human-readable entries
- Grouping by feature/issue domain

✅ **Content rules enforced:**
- ❌ No "npx" mentions anywhere (only "npm install -g" and package names)
- ❌ No "agency" terminology in product context
- ✅ Existing [Unreleased] CLI Terminal Rendering fixes moved to 0.9.0
- ✅ Empty [Unreleased] section created for next cycle

## Rationale

### Why MAJOR Minor Bump?
Semantic versioning reserves MAJOR version for breaking changes. This release:
- Introduces Personal Squad with new governance APIs (breaking)
- Changes worktree topology and spawning behavior (breaking)
- Alters capability discovery and routing (breaking)
- Implements cooperative rate limiting (behavioral change)

These justify moving from 0.8.x → 0.9.0 rather than 0.9.0-preview.

### Why This Organization?
Features grouped by **capability cluster** rather than chronological order:
- Personal Squad cluster (4 entries)
- Orchestration cluster (Worktree + Cross-Squad)
- Capability discovery cluster
- Rate limiting & cost cluster (3 entries)
- Skills & governance cluster (3 entries)
- Docs cluster (single large section)

This structure mirrors the squad's problem space and makes the release narrative coherent.

### PR References
Pulled from commit log with PR numbers from conventional commit format. 40+ commits enumerated and categorized. No invented references — all matched against actual GitHub PRs.

## Team Impact

- **Scribe:** Use this changelog for release notes and social media announcements
- **Coordinator:** Governance layer changes warrant update to SDK documentation and team onboarding guide
- **All members:** Personal Squad feature opens new distributed workflow possibilities
