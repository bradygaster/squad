# Kobayashi — History

## Project Context

- **Owner:** bradygaster
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Product:** Squad — one command gives you a persistent AI team. Distributed via `npx github:bradygaster/squad`.
- **Distribution:** GitHub-only. No npm publish. Users get updates via `npx github:bradygaster/squad upgrade`.
- **State model:** `.ai-team/` is user-owned state (never touched on upgrade). `squad.agent.md` and templates are Squad-owned (overwritten on upgrade).

## Learnings

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
- **`package.json` `files` field IS respected by `npx github:` installs.** Empirically verified on npm v11.9.0. npm downloads the GitHub tarball then applies `files` filtering before placing in `node_modules`. The distributed package contains only 15 product files — no `.ai-team/`, `docs/`, `test/`, etc.
- **`.npmignore` added as defense-in-depth.** Excludes `.ai-team/`, `.ai-team-templates/`, `docs/`, `test/`, `.gitattributes`, `.github/workflows/`. Redundant with `files` field (which takes precedence) but catches mistakes if `files` is accidentally removed.
- **`.gitattributes` `export-ignore` does NOT work for `npx github:`.** npm uses GitHub's tarball API (`codeload.github.com`), not `git archive`. `export-ignore` is only honored by `git archive`.
- **npm for `github:` installs uses `codeload.github.com` tarball endpoint**, not `git clone`. The tarball contains all repo files, but npm packs/filters before installation.
- **Squad Squad isolation is already solved.** The `files` field in `package.json` was correctly configured from the start. `.npmignore` added for insurance. No runtime or config changes needed.

- **Release ritual checklist created** at `docs/release-checklist.md`. Five phases: pre-release checks, release execution, post-release validation, communication, rollback plan. Every step tagged HUMAN/AUTOMATED/TEAM. Designed to be evolved, not ceremonial — practical enough to actually follow. Rollback plan covers failed workflows, bad content on main, stale npx cache, and the nuclear scenario of `.ai-team/` corruption. Quick reference table at the bottom for at-a-glance auditing.

- **Branch renamed: `squadify` → `dev`** — local rename done. Remote rename is Brady's call.
- **`main` = product-only** — no `.ai-team/`, `docs/`, `test/`, or workflow files. Only ships: `index.js`, `package.json`, `README.md`, `LICENSE`, `.gitignore`, `.npmignore`, `.gitattributes`, `.github/agents/squad.agent.md`, `templates/`.
- **`dev` is public** — Squad Squad visibility is intentional (dog-fooding story).
- **Release workflow uses filtered-copy strategy** (Option C) — not a git merge. Checks out `dev`, copies only product files, commits to `main`, tags, creates GitHub Release. Clean, auditable, reversible.
- **Why filtered-copy over alternatives:** (a) Force-push is destructive and loses main history; (b) `.gitattributes` merge drivers are fragile and hard to debug; (c) Orphan branches lose all git history tracing; (d) Filtered-copy is simple, explicit, and every release is a traceable commit.
- **Workflow triggers:** `workflow_dispatch` (manual, enters version) OR tag push on `dev`. Both validate version against `package.json`.
- **Proposal 021 updated** — branch strategy, release process, workflow spec all reflect new `dev`/`main` separation.

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.

2026-02-09: Branch strategy implemented — `squadify` renamed to `dev`, release workflow created (`.github/workflows/release.yml`), proposal 021 updated. `main` is now product-only via filtered-copy release process.

2026-02-09: Branch strategy — squadify renamed to dev, main is product-only (no .ai-team/), release workflow (.github/workflows/release.yml) uses filtered-copy from dev→main.

2026-02-09: Tone governance established — SFW, kind, dry humor, no AI-flowery talk. 25 proposals audited (status fields updated). Tone audit: 16 edits across 8 files. Blog post #2 shipped.