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
📌 Team update (2026-02-09): Release workflow split into two-phase pipeline — preview (builds `preview` branch for human review) and ship (pushes to main, tags, creates GitHub Release). Single workflow with `action` choice input (preview/ship). KEEP_FILES/KEEP_DIRS DRY via workflow-level env vars. Ship phase validates preview branch contains only product files before pushing to main. — decided by Kobayashi

📌 Team update (2026-02-10): v0.3.0 sprint plan approved — per-agent model selection, team backlog, Demo 1. — decided by Keaton


📌 Team update (2026-02-10): 0.3.0 priorities set — async comms, GitHub-native, CCA adoption — decided by bradygaster


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Provider abstraction is prompt-level command templates, not JS interfaces. Platform section replaces Issue Source in team.md. — decided by Fenster, Keaton

📌 Team update (2026-02-10): Actions automation ships as opt-in templates in templates/workflows/, 3 workflows in v0.3.0. — decided by Keaton, Kujan

📌 Team update (2026-02-10): Label taxonomy (39 labels, 7 namespaces) drives entire GitHub-native workflow. — decided by bradygaster, Verbal

📌 Team update (2026-02-10): CCA governance must be self-contained in squad.agent.md (cannot read .ai-team/). — decided by Kujan

📌 Team update (2026-02-10): Proposal migration uses three-wave approach — active first, shipped second, superseded/deferred last. — decided by Keaton

📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

📌 Team update (2026-02-11): MCP Integration Direction for Squad approved — Option B (Awareness Layer) chosen. Phase 1 spike (WI-1) validates platform MCP support. See decisions.md for rationale and timeline. — decided by Keaton

## Learnings

- **v0.3.0 release entry created** — Added comprehensive CHANGELOG.md entry documenting five shipped features (per-agent model selection, Ralph work monitor, @copilot integration, universe expansion, milestones rename), four Changed items (tests, emoji fixes, agent.md expansion, index.js upgrade fix), and community contributions (2 PRs from @spboyer, 4 new issues from external contributors). Entry follows v0.2.0 format (Added/Changed/Community sections) and preserves content tree with v0.2.0 and v0.1.0 below. Date: 2026-02-11.

- **v0.4.0 release process documentation complete** — Created `docs/scenarios/release-process.md` with comprehensive maintainer guide: branch model (dev → preview → main), full release lifecycle with six phases (prep, preview, merge, tag, verify, sync), exact git commands, `gh` CLI commands, guard workflow mechanics, guard testing procedures (three test scenarios: block .ai-team/, block team-docs/internal, allow team-docs/blog), troubleshooting section (SSH hangs, .ai-team/ tracking leaks, missing workflows, missing releases), and sample Copilot prompts. Also updated CHANGELOG.md with v0.4.0 entry (12 issues/features, 6 workflows, 11 new universes, MCP integration, notifications, guard, docs). Guard workflow validates forbidden paths on main/preview via GitHub Script pagination, blocks .ai-team/** (zero exceptions) and team-docs/** (except team-docs/blog/**), provides actionable fix instructions in failure message. Release distribution model confirmed: npx pulls from main only; .ai-team/ protected by .gitignore, package.json files array, .npmignore (three-layer defense). Date: 2026-02-15.

- **CI/CD workflow pipeline created** — Three workflows added to `.github/workflows/` and mirrored in `templates/workflows/`: (1) `squad-ci.yml` — runs tests on PR to dev/preview/main and push to dev, Node 22, read-only permissions; (2) `squad-preview.yml` — validates preview branch on push: runs tests, checks no `.ai-team/` tracked, validates package.json version field; (3) `squad-release.yml` — automates release on push to main: reads version from package.json, idempotent tag check (skips if `v{version}` tag exists), creates annotated tag + GitHub Release with auto-generated notes via `gh` CLI, verifies release. Uses `GITHUB_TOKEN` (no PATs), minimal permissions (contents:write only on release). All workflows follow squad-main-guard.yml YAML style. Date: 2026-02-13.

📌 Team update (2026-02-12):Cross-client sub-agent API research complete — squad.agent.md uses task tool exclusively for CLI platform, VS Code uses runSubagent, no unification planned — research by Kujan
📌 Team update (2026-02-13): go:/release: label automation shipped — Four-workflow system enforces label namespace integrity (go:* triage verdicts, release:* version targets). Workflows: squad-label-enforce.yml (mutual exclusivity), sync-squad-labels.yml (sync 8 static labels), squad-triage.yml (default go:needs-research), squad-heartbeat.yml (detect label gaps). Labels-as-state-machine is foundational to GitHub-native workflow. — decided by Fenster

📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

