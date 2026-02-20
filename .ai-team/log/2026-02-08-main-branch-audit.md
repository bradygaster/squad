# Main Branch Forensic Audit — 2026-02-08

**Auditor:** Kobayashi
**Requested by:** Brady
**Branch:** `main`
**Total files on main:** 24

## Verdict: CLEAN — Minor Concerns

Main is tight. Every file justifies its presence. Two minor concerns flagged for discussion (CHANGELOG.md coverage in `.npmignore`, and `.gitattributes` redundancy on main), neither is a shipping risk.

## File-by-File Audit

| File | Verdict | Justification |
|------|---------|---------------|
| `.gitattributes` | ⚠️ FLAG | Merge=union rules for `.ai-team/` paths — but `.ai-team/` doesn't exist on main. This file exists so it's available to the release workflow's filtered copy, but `index.js` already generates `.gitattributes` at the user's destination. **Not harmful** (`.npmignore` excludes it from distribution), but it's dead weight on main. See recommendation below. |
| `.github/agents/squad.agent.md` | ✅ KEEP | The coordinator agent. Core product file. Listed in `package.json` `files`. Ships to users. |
| `.github/workflows/ci.yml` | ✅ KEEP | CI pipeline — tests on push to main/dev and PR to main. Must live on main for GitHub Actions to trigger. Excluded from distribution by `.npmignore` and `files` allowlist. |
| `.github/workflows/release.yml` | ✅ KEEP | Release automation — filtered-copy from dev→main, tagging, GitHub Release creation, verification. Must live on main for `workflow_dispatch` to work. Excluded from distribution. |
| `.gitignore` | ✅ KEEP | Blocks `.ai-team/`, `docs/`, `.ai-team-templates/`, `node_modules/`, OS/editor files. Correct and necessary. |
| `.npmignore` | ✅ KEEP | Defense-in-depth exclusion layer. Blocks `.ai-team/`, `test/`, `docs/`, `.gitattributes`, `.github/workflows/`. Redundant with `files` allowlist but catches mistakes. |
| `CHANGELOG.md` | ✅ KEEP | Release history for v0.1.0. Standard practice. Not in `files` array so not distributed. Not in `.npmignore` either, but `files` takes precedence — npm only includes what's in `files` + package.json/README/LICENSE. No action needed. |
| `LICENSE` | ✅ KEEP | MIT license. Always included by npm regardless of `files` array. Required. |
| `README.md` | ✅ KEEP | Product documentation. Always included by npm regardless of `files` array. Required. |
| `index.js` | ✅ KEEP | The entire CLI runtime (~140 lines). Core product file. Listed in `files`. |
| `package.json` | ✅ KEEP | Package manifest. Always included by npm. `files` array correctly limits distribution to `index.js`, `.github/agents/squad.agent.md`, `templates/**/*`. |
| `templates/casting-history.json` | ✅ KEEP | Empty casting history seed. Copied to `.ai-team-templates/` at init. Used by coordinator to initialize `.ai-team/casting/history.json`. |
| `templates/casting-policy.json` | ✅ KEEP | Casting configuration with universe allowlist and capacity. Copied to `.ai-team-templates/` and then to `.ai-team/casting/policy.json`. |
| `templates/casting-registry.json` | ✅ KEEP | Empty agent registry seed. Used by coordinator to initialize `.ai-team/casting/registry.json`. |
| `templates/ceremonies.md` | ✅ KEEP | Ceremony definitions (design review, retrospective). **Dual use:** (1) copied individually to `.ai-team/ceremonies.md` on init, (2) copied with all templates to `.ai-team-templates/`. |
| `templates/charter.md` | ✅ KEEP | Agent charter template with placeholder fields. Used by coordinator when creating new agents. |
| `templates/history.md` | ✅ KEEP | Agent history template with project context seed fields. Used by coordinator when creating new agents. |
| `templates/orchestration-log.md` | ✅ KEEP | Orchestration log entry format. Referenced by coordinator for per-spawn logging format. |
| `templates/raw-agent-output.md` | ✅ KEEP | Raw output appendix format. Referenced by coordinator for multi-agent artifact assembly. |
| `templates/roster.md` | ✅ KEEP | Team roster template. Used by coordinator when creating `.ai-team/team.md`. |
| `templates/routing.md` | ✅ KEEP | Work routing template. Used by coordinator when creating `.ai-team/routing.md`. |
| `templates/run-output.md` | ✅ KEEP | Run output template for multi-agent artifacts. Referenced by coordinator for final artifact assembly format. |
| `templates/scribe-charter.md` | ✅ KEEP | Scribe agent charter. Used by coordinator when creating the Scribe's charter at `.ai-team/agents/scribe/charter.md`. |
| `test/index.test.js` | ✅ KEEP | 27 tests covering init, re-init, upgrade, flags, error handling. Required on main because `ci.yml` runs `npm test` on push to main. Excluded from distribution by `.npmignore` and `files` allowlist. |

## Template Usage Analysis

All 12 template files are accounted for:

| Template | How it's used |
|----------|---------------|
| `ceremonies.md` | Copied directly to `.ai-team/ceremonies.md` by `index.js` on init; also bulk-copied to `.ai-team-templates/` |
| `charter.md` | Format guide in `.ai-team-templates/` — coordinator reads when creating agent charters |
| `history.md` | Format guide in `.ai-team-templates/` — coordinator reads when seeding agent history |
| `roster.md` | Format guide in `.ai-team-templates/` — coordinator reads when creating `team.md` |
| `routing.md` | Format guide in `.ai-team-templates/` — coordinator reads when creating `routing.md` |
| `orchestration-log.md` | Format guide in `.ai-team-templates/` — coordinator reads for log entry format |
| `run-output.md` | Format guide in `.ai-team-templates/` — coordinator reads for multi-agent artifact format |
| `raw-agent-output.md` | Format guide in `.ai-team-templates/` — coordinator reads for appendix format |
| `scribe-charter.md` | Format guide in `.ai-team-templates/` — coordinator reads when creating Scribe |
| `casting-policy.json` | Copied to `.ai-team/casting/policy.json` by coordinator at team creation |
| `casting-registry.json` | Seed for `.ai-team/casting/registry.json` by coordinator at team creation |
| `casting-history.json` | Seed for `.ai-team/casting/history.json` by coordinator at team creation |

**Verdict: No templates can be trimmed.** All 12 are consumed at runtime.

## Protection Layers

| Layer | Status | Notes |
|-------|--------|-------|
| `.gitignore` | ✅ Solid | Blocks `.ai-team/`, `.ai-team-templates/`, `docs/`, `node_modules/`, OS/editor files. Correct. |
| `package.json` `files` | ✅ Solid | Allowlist: `index.js`, `.github/agents/squad.agent.md`, `templates/**/*`. Only these three patterns ship. This is the primary distribution gate. |
| `.npmignore` | ✅ Solid | Defense-in-depth. Blocks `.ai-team/`, `test/`, `docs/`, `.gitattributes`, `.github/workflows/`. Redundant with `files` but catches mistakes if `files` is ever removed. |
| `files` + `.npmignore` interaction | ✅ Correct | When `files` is present, it takes precedence — npm only includes listed files plus `package.json`, `README.md`, and `LICENSE`. `.npmignore` is insurance. |

### Missing from `.npmignore`

| File | Risk | Action |
|------|------|--------|
| `CHANGELOG.md` | **None** — `files` allowlist excludes it. npm won't ship it. | Optional: add to `.npmignore` for completeness |
| `test/` directory | Already listed in `.npmignore` ✅ | — |

## Recommendations

1. **`.gitattributes` on main is harmless but orphaned.** The merge=union rules reference `.ai-team/` paths that don't exist on main. The file ships via release workflow's filtered copy, and `index.js` generates it at the user's destination anyway. **No action required** — the `.npmignore` already excludes it from distribution. If you want to trim main to absolute minimum, it could be removed, but it costs nothing where it is.

2. **CHANGELOG.md not in `.npmignore`.** Not a risk because `files` takes precedence, but for defense-in-depth consistency, consider adding `CHANGELOG.md` to `.npmignore`. This is cosmetic — the file will never ship regardless.

3. **No missing files.** Main has everything it needs for: (a) user installation via `npx`, (b) CI testing via GitHub Actions, (c) release automation, (d) product documentation.

4. **Template count is justified.** All 12 templates are consumed by the runtime. The coordinator (`squad.agent.md`) references every template when creating team files. No trimming possible.

5. **`test/index.test.js` belongs on main.** CI runs `npm test` on push to main. Tests must exist on main for CI to pass. The file is excluded from distribution by both `files` allowlist and `.npmignore`.

## Summary

Main branch is clean. 24 files, all justified. Distribution is locked down by a three-layer system (`files` allowlist → `.npmignore` → `.gitignore`). The only file that could theoretically be removed is `.gitattributes` (orphaned merge rules), but it's harmless and excluded from distribution. No action items are blocking.
