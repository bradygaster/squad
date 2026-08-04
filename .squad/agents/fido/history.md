# FIDO

> Flight Dynamics Officer

## Core Context

Quality gate authority for all PRs. Test assertion arrays (EXPECTED_GUIDES, EXPECTED_FEATURES, EXPECTED_SCENARIOS, etc.) MUST stay in sync with files on disk. When reviewing PRs with CI failures, always check if dev branch has the same failures — don't block PRs for pre-existing issues. 3,931 tests passing, 149 test files, ~89s runtime.

📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution & Community PR Review):** Post-CLI crash recovery completed: Round 1 baseline verified (5,038 tests ✅ green), Round 2 executed duplicate closures (#605/#604/#602) and 9-PR community batch review. FIDO approved 3 PRs (#625 notification-routing, #603 Challenger agent, #608 security policy—merged via Coordinator) and issued change requests on 6 PRs identifying systemic issues: changeset package naming (4 PRs used unscoped `squad-cli` instead of `@bradygaster/squad-cli`); file paths (2 PRs placed files at root instead of correct package structure). Quality gate result: high-bar community acceptance—approved 3/9 (33%), change-request 6/9 (67%), 0 rejections. PR #592 (legacy, high-quality) also merged. All actions complete; dev branch remains green.

📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review Batch):** FIDO reviewed 10 open PRs for quality and merge readiness. Identified 3 duplicate/overlap pairs consolidating 6 PRs into 4: #607 (retro enforcement, comprehensive) approved for merge, #605 closed as duplicate. #603 (Challenger agent, correct paths) approved, #604 closed as duplicate. #606 (tiered memory superset) approved, #602 closed as duplicate. Merge-ready: #611 (blocked on #610), #592 (joniba wiring guide, high-quality). Decisions merged.

## Key Learnings

### Test Assertion Sync Discipline
EXPECTED_* arrays in docs-build.test.ts must match filesystem reality. When PRs add new content files, verify the corresponding test arrays are updated. Consider dynamic discovery pattern (used for blog posts) for resilience against content additions. Stale assertions that block CI are FIDO's responsibility. **Fixed PR #331:** EXPECTED_SCENARIOS expanded to 25 entries, EXPECTED_FEATURES array created with 32 entries (commit 6599db6).

### PR Quality Gate Pattern
Verdict scale: GO (merge), FAIL (block until fixed), NO-GO (reject). Always verify: test discipline (assertions synced), CI status (distinguish pre-existing vs new failures), content accuracy, cross-reference validity. When detecting CI failures, run baseline comparison (dev branch vs PR branch) to isolate regressions.

### Name-Agnostic Testing
Tests reading live .squad/ files must assert structure/behavior, not specific agent names. Names change during team rebirths. Two test classes: live-file tests (survive rebirths, property checks) and inline-fixture tests (self-contained, can hardcode).

### Dynamic Content Discovery
Blog tests use filesystem discovery (readdirSync) instead of hardcoded arrays. Pattern: discover from disk, sort, validate build output exists.

### Command Wiring Regression Test
cli-command-wiring.test.ts prevents "unwired command" bug: verifies every .ts file in commands/ is imported in cli-entry.ts. Bidirectional validation.

### CLI Packaging Smoke Test
cli-packaging-smoke.test.ts validates packaged CLI artifact (npm pack → install → execute). Tests 27 commands + 3 aliases. Catches: missing imports, broken exports, bin misconfiguration, ESM resolution failures. Windows cleanup requires retry logic (EBUSY errors) — use rmSync with maxRetries + retryDelay, wrap in try/catch.

### Agent Name Extraction Test Coverage (#577)
Extracted inline regex-based agent name parsing from `shell/index.ts` into testable pure function `parseAgentFromDescription` in `shell/agent-name-parser.ts`. 30 tests across 7 categories. 3-tier matching: (1) leading emoji+name+colon regex, (2) name+colon anywhere, (3) fuzzy word-boundary match. Shell index.ts delegates to this function.

### Init Scaffolding Completeness Tests (#579)
`test/init-scaffolding.test.ts` — 15 tests: casting directory scaffolding (verifies .squad/casting/ + all 3 JSON files), no-remote resilience (init succeeds without git remote), doctor validation after init (zero failures). Follows existing test conventions — vitest, randomBytes temp dirs in cwd, compiled dist imports.

### Personal Squad Init Discovery Tests (#576)
`test/personal-squad-init.test.ts` — 35 tests, 10 describe blocks. Key finding: `resolvePersonalSquadDir()` is install-method-agnostic — resolves from env vars and `os.homedir()`, never from `process.argv`. npx issue #576 is NOT in path resolution but in CLI command wiring or `--global` flag routing. SDK layer works correctly.

### Publish Policy CI Gate (#557)
Added `publish-policy` job to squad-ci.yml: scans `.github/workflows/*.yml` for bare `npm publish` commands missing `-w`/`--workspace`. `test/publish-policy.test.ts` (36 tests). Meta-references (echo, grep, YAML name keys) must be excluded from lint.

### PR Review Batch — Community PRs
Community contributors consistently struggle with: (a) scoped npm package names in changesets (use `@bradygaster/squad-cli` not `squad-cli`), (b) monorepo file placement (skills in `packages/squad-cli/templates/skills/`). Both preventable with better contributor docs. Changeset package name mismatch is most common error (4/9 Tamir PRs).

📌 **Team update (2026-07-29T17:11:56+10:00 — Issue #1556 / PR #1557):** A new required CI check `squad-workflow-lint` now exists in `.github/workflows/squad-workflow-lint.yml`. It runs actionlint 1.7.12 + shellcheck 0.10.0 against all 5 workflow/template directories, including the canonical `.squad-templates/workflows/` sources. FIDO should treat this as a required gate alongside existing CI checks — PRs that introduce SC2086, unquoted variables, or invalid action syntax in workflow files will fail this check. All known SC2086 findings across Squad's own workflows were fixed in PR #1557.

### 📌 Team update — 2026-08-03: gh-aw integration proposal
Flight's gh-aw integration proposal is awaiting Brady's review and may generate owner-specific follow-up work. No product source changes yet.
### 📌 Team update — 2026-08-03: gh-aw round-2 revision
gh-aw round 2: tests should cover gh-aw import wiring, headless coordinator behavior, installer fallbacks, SEA packaging, and no accidental engine/substrate framing.

### 📌 gh-aw shared component shipped — 2026-08-03
Adapted Peli de Halleux's gh-aw integration into this repo on branch
`squad/gh-aw-shared-component`. Added `.github/workflows/shared/squad.md`
(activation/agent split, auth ladder, no `on:`), sample
`.github/workflows/squad-backlog-triage.md` (`workflow_dispatch`), and
`docs/src/content/docs/features/gh-aw.md` (+ nav). Four intentional deltas from
Peli's reference: documented repo-local + SHA-pinned remote imports; pinned
`--state-backend local` (agent runs `--disable-builtin-mcps`); dropped the false
`--agent squad` claim; noted `SQUAD_CLI_VERSION` bump-per-release. Validated with
`gh aw compile` (v0.81.6, strict, 0 errors) — lock confirmed the state-backend
flag, `.github/agents` sub-agent pickup, and `--disable-builtin-mcps`. Drive-by:
synced `EXPECTED_GUIDES` (missing `agent-framework-integration` from #1574).
docs-build 22/22, cspell + markdownlint clean.

---

## 2026-08-04 — PR #1587 follow-up: `--ignore-scripts` supply-chain hardening

Peli de Halleux's review of PR #1587 asked for `--ignore-scripts` on the activation
`npx`. Empirically verified before adopting: `@bradygaster/squad-cli@0.11.0` DOES ship a
postinstall (`patch-esm-imports.mjs` + `patch-ink-rendering.mjs`, both in the tarball).
`patch-esm-imports.mjs` is load-bearing (patches `vscode-jsonrpc` exports for Copilot SDK
sessions, bradygaster/squad#449) but `squad init` is pure file scaffolding and never opens
an SDK session. A/B test on Node v24.16.0: `init` with vs without `--ignore-scripts`
produced byte-identical `.squad/` trees (only timestamps + temp-dir name differed),
`squad.agent.md` byte-identical. Added flag BEFORE the package spec in
`.github/workflows/shared/squad.md` + a header comment crediting Peli so nobody removes it.
Recompiled lock with `gh aw compile` (v0.81.6, strict, 0 errors) — lock run line now
matches source byte-for-byte (grep: 1 occurrence each). Updated docs table. docs-build
22/22, cspell clean on in-scope docs. Staged only my 4 files — left the ~28 unrelated
loose worktree changes untouched. Branch `squad/gh-aw-shared-component` only; dev untouched.
