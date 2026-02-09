# Kobayashi — History Archive

Archived entries from sessions through 2026-02-09. These entries were summarized into `## Core Context` in history.md.

---

## Archived: Original Learnings

- Squad has 12 tests (node:test, zero deps), run via `npm test`
- index.js is 88 lines — the entire runtime
- File ownership model: Squad-owned (squad.agent.md, .ai-team-templates/) vs user-owned (.ai-team/)
- Currently on `squadify` branch
- No CI pipeline exists yet (Wave 1 item)
- No release process exists yet — this is my first task
- Brady explicitly rejected npm publish — GitHub is the only distribution channel
- `npx github:bradygaster/squad` is the install/init command
- `npx github:bradygaster/squad upgrade` is the update command
- **Version pinning uses `#` not `@`:** `npx github:bradygaster/squad#v0.2.0` (not `@v0.2.0`). This is a GitHub URL fragment, not an npm scope.
- **`npx github:` pulls default branch HEAD unless a `#ref` is specified.** This means `main` must always be release-worthy.
- **Branch strategy decided:** `main` is release-only (stable), `squadify` is development. Merges to `main` only happen during releases.
- **Tag format:** `v{MAJOR}.{MINOR}.{PATCH}` — immutable once created.
- **Release workflow:** Tag push triggers CI → test → GitHub Release creation → verification pipeline.
- **State integrity is CI-enforced:** Upgrade test in CI writes a sentinel file to `.ai-team/` and verifies it survives upgrade.
- **`.ai-team/` is NOT in `.gitignore`** — it's user state that should be committed. Current `.gitignore` is correct.
- **No `.github/workflows/` directory exists yet.** Creating both `ci.yml` and `release.yml` is blocked on proposal approval.
- **GitHub Releases for pre-v1 are marked `prerelease: true`** — signals to users these are early versions.
- Proposal 021 written and filed — covers distribution, versioning, CI, release automation, branch strategy, state integrity.
- **`package.json` `files` field IS respected by `npx github:` installs.** Empirically verified on npm v11.9.0.
- **`.npmignore` added as defense-in-depth.** Excludes `.ai-team/`, `.ai-team-templates/`, `docs/`, `test/`, `.gitattributes`, `.github/workflows/`.
- **`.gitattributes` `export-ignore` does NOT work for `npx github:`.** npm uses GitHub's tarball API, not `git archive`.
- **npm for `github:` installs uses `codeload.github.com` tarball endpoint**, not `git clone`.
- **Squad Squad isolation is already solved.** The `files` field in `package.json` was correctly configured from the start.
- **Release ritual checklist created** at `docs/release-checklist.md`. Five phases: pre-release checks, release execution, post-release validation, communication, rollback plan.
- **Branch renamed: `squadify` → `dev`** — local rename done. Remote rename is Brady's call.
- **`main` = product-only** — no `.ai-team/`, `docs/`, `test/`, or workflow files.
- **`dev` is public** — Squad Squad visibility is intentional (dog-fooding story).
- **Release workflow uses filtered-copy strategy** (Option C) — not a git merge. Clean, auditable, reversible.
- **Main branch audit (2026-02-08):** All 24 files on main verified. Verdict: CLEAN. Three-layer distribution protection solid.
- **Template audit result:** All 12 templates are essential — none can be trimmed.
- **Release process documented** at `team-docs/release-process.md`.
- **v0.2.0 prep completed:** CHANGELOG.md updated, package.json bumped to 0.2.0, squad.agent.md version header confirmed. 92 tests pass.
- **v0.2.0 release pipeline audit:** SAFE. Three independent protection layers confirmed working. `npm pack --dry-run` verified: exactly 19 product files, zero internal state.
- **docs/ and CHANGELOG.md added to release pipeline (2026-02-09):** Brady's directive. Changes to release.yml, package.json, .npmignore.

## Archived: Team Updates (from original Learnings)

- docs/ directory structure: user-facing only on main, internal planning on dev branches
- Recovered docs/sample-prompts.md from git history (commit 7909935~1)
- .gitignore no longer blocks docs/
- .npmignore excludes docs/ from npm distribution
- Docs constitution: docs/ = public (GitHub Pages), team-docs/ = internal (proposals, sprints), .ai-team/ = runtime state (gitignored)
- Brady's directive: never mix product and team files. Three-tier separation is permanent.
