# Kobayashi — History

## Project Context

- **Owner:** bradygaster
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Product:** Squad — one command gives you a persistent AI team. Distributed via `npx github:bradygaster/squad`.
- **Distribution:** GitHub-only. No npm publish. Users get updates via `npx github:bradygaster/squad upgrade`.
- **State model:** `.ai-team/` is user-owned state (never touched on upgrade). `squad.agent.md` and templates are Squad-owned (overwritten on upgrade).

## Core Context

_Summarized from sessions through 2026-02-09. Full entries in `history-archive.md`._

- **GitHub-only distribution** — `npx github:bradygaster/squad` for install, `#v0.2.0` (not `@`) for version pinning. Brady explicitly rejected npm publish. `npx github:` pulls default branch HEAD unless `#ref` specified.
- **Branch strategy**: `main` is release-only (product files only, no `.ai-team/`), `dev` is development. Releases use filtered-copy (not git merge) from dev→main via `.github/workflows/release.yml`.
- **Three-layer distribution protection**: `package.json` `files` allowlist (primary gate), `.npmignore` (defense-in-depth), `.gitignore` (runtime state). `files` field IS respected by `npx github:` installs. `.gitattributes` `export-ignore` does NOT work for `npx github:`.
- **State integrity is CI-enforced** — upgrade test writes sentinel to `.ai-team/` and verifies survival. Tests are minimum release gate.
- **Release workflow**: tag push triggers CI → test → GitHub Release creation → verification. Pre-v1 releases marked `prerelease: true`. Tag format: `v{MAJOR}.{MINOR}.{PATCH}`.
- **Release ritual checklist** at `docs/release-checklist.md` — five phases (pre-release, execution, post-release, communication, rollback). Every step tagged HUMAN/AUTOMATED/TEAM.
- **Release process documented** at `team-docs/release-process.md` — branch flow, workflow mechanics, file filtering, npx distribution model.

## Recent Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.
📌 Team update (2026-02-08): CI pipeline created — release workflow should depend on CI passing. Tests are minimum release gate. — decided by Hockney
📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan
📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal
📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal
📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): Export + Import CLI shipped — squads are now fully portable via squad-export.json. Round-trip at 100% fidelity. History split is pattern-based. — decided by Fenster
📌 Team update (2026-02-09): Release ritual consolidated — checklist and lead recommendations merged — decided by Keaton, Kobayashi
📌 Team update (2026-02-09): docs/ and CHANGELOG.md now included in release pipeline (KEEP_FILES, KEEP_DIRS, package.json files, .npmignore updated). Brady's directive. — decided by Kobayashi
