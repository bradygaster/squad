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

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.
