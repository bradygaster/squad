# Release Notes — v0.6.0

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


> ⚠️ **INTERNAL ONLY** — Do not distribute outside the Squad team until GA.

## Overview

**Squad v0.6.0** completes the SDK replatform from markdown-based configuration to a fully typed TypeScript runtime. This release spans milestones M0 through M6 and delivers a programmable multi-agent framework for GitHub Copilot.

---

## Highlights by Milestone

### M0 — Foundation
- Project scaffolding: TypeScript ESM, vitest, strict mode
- Core types: `SquadConfig`, `AgentConfig`, `RoutingRule`
- Initial test infrastructure

### M1 — Core Runtime
- `ConfigLoader` with `squad.config.ts` / `squad.config.json` support
- `Coordinator` message routing engine
- `AgentLifecycle` — spawn, monitor, retire agents
- `ResponseTier` system (direct / lightweight / standard / full)
- Event bus for inter-agent communication

### M2 — Config System
- Full `SquadConfig` schema with validation
- `defineConfig()` helper for type-safe authoring
- Config migrations (v0.4 → v0.6)
- Standard directory: `.squad/` for all team state
- `ConfigValidationError` with actionable messages

### M3 — Feature Parity
- Casting engine with history tracking
- Skill registry and tool management
- Hook pipeline (pre/post lifecycle hooks)
- Model selector with tier-based fallback chains
- Feature audit tool to verify parity with beta

### M4 — Distribution
- `BundleBuilder` (esbuild-based)
- `NpmPackageBuilder` for publish-ready packages
- `GitHubDistBuilder` for release artifacts
- `UpgradeCLI` with version pinning
- Marketplace foundation

### M5 — Sharing & Marketplace
- Config export/import for team sharing
- Marketplace registry with search and install
- Advanced sharing: versioning, conflict resolution
- Community template support

### M6 — Launch Preparation
- Architecture diagrams (Mermaid)
- Accessibility and i18n foundations
- Launch checklist and communication plan
- Blog post: SDK replatform announcement
- Final test hardening (1400+ tests)

---

## Breaking Changes

| Change | Migration |
|--------|-----------|
| Config file: `squad.agent.md` → `squad.config.ts` | Run `squad init` to generate typed config |
| Team dir: `.squad/` | Standard directory for all team state |
| Routing: markdown rules → typed `RoutingRule[]` | Export existing rules with `squad export` |
| Models: string names → tier-based `ModelConfig` | Use `defaultTier` + `fallbackChains` in config |

## Migration Instructions

1. **Install**: `npm install @bradygaster/squad@0.6.0`
2. **Init**: `squad init` — generates `squad.config.ts` from existing setup
3. **Verify**: `squad status` — confirms config loads and agents resolve
4. **Test**: Run your project's test suite to confirm no regressions
5. **Finalize**: Ensure `.squad/` contains all required team state files

## Test Summary

- **1400+** automated tests (vitest)
- **5** manual test scripts
- Config migration, legacy fallback, export/import roundtrip all verified

## Known Limitations

- Only English locale supported in v1 (i18n infrastructure in place)
- Marketplace is read-only in this release (publish coming in v0.7)
- Offline mode is best-effort; some features require network
