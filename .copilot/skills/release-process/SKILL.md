---
name: "release-process"
description: "Operate Squad's automated preview and stable release channels safely"
domain: "release-management"
confidence: "high"
source: "team-decision"
---

# Squad Release Process

Read `.squad/skills/release-process/SKILL.md` for the canonical runbook and
recovery commands. The operational model is:

| Release | Trigger | Required version | Result |
|---------|---------|------------------|--------|
| Preview | Manual `squad-release.yml` dispatch from `dev` | `X.Y.Z-preview.N` | GitHub prerelease, npm `preview`, standalone archives |
| Stable | Manual `squad-promote.yml` dispatch from `dev` | `X.Y.Z` | Sanitized `main` push, GitHub stable release, npm `latest`, standalone archives, Homebrew, WinGet |

There is no staging `preview` branch. Do not create tags or GitHub Releases
manually.

## Preconditions

Before either channel:

```bash
git fetch origin dev main
git merge-base origin/dev origin/main
grep '"version"' package.json packages/squad-sdk/package.json packages/squad-cli/package.json
node -p "require('./packages/squad-cli/package.json').dependencies['@bradygaster/squad-sdk']"
grep -F "## [$VERSION]" CHANGELOG.md
npm run build
npx vitest run
```

The ancestry command must return a commit, all three versions must match, the
CLI SDK dependency floor must be `>=VERSION`, and the changelog must contain
the exact release version.

Required Actions secrets:

- `NPM_TOKEN`: automation-capable npm publish token.
- `HOMEBREW_TAP_TOKEN`: classic PAT with `public_repo` from a collaborator with
  write access to `bradygaster/homebrew-squad`.
- `WINGET_CREATE_GITHUB_TOKEN`: classic PAT with `public_repo` for
  `tamirdresher/winget-pkgs`.

## Preview

After a PR sets an immutable prerelease version on `dev` and CI passes:

```bash
VERSION=0.14.0-preview.1
gh workflow run squad-release.yml --ref dev -f confirm_tag="v$VERSION"
gh run watch
```

The release workflow rejects stable versions on manual dispatch, creates a
GitHub prerelease, publishes npm `preview`, and uploads standalone bundles.
Homebrew, WinGet, the activation pin, and insider-tag promotion remain
stable-only.

## Stable

After a PR replaces the preview version with `X.Y.Z` on `dev` and CI passes:

```bash
gh workflow run squad-promote.yml --ref dev -f dry_run=true
gh run watch

gh workflow run squad-promote.yml --ref dev -f dry_run=false
gh run watch
```

Promotion merges `dev` directly into `main`, strips internal team state,
validates the release tree, builds it, runs tests, and pushes `main`. It then
explicitly dispatches `squad-release.yml` because `GITHUB_TOKEN` pushes do not
start another workflow. The release creates the tag and stable GitHub Release
and directly invokes npm and standalone publication.

## Verify

```bash
npm view @bradygaster/squad-sdk dist-tags.preview
npm view @bradygaster/squad-cli dist-tags.preview
npm view @bradygaster/squad-sdk dist-tags.latest
npm view @bradygaster/squad-cli dist-tags.latest
gh release view "v$VERSION"
```

Use the tag for the channel being released. Verify the GitHub Release contains
all six OS/architecture archives and `SHA256SUMS.txt`. Stable releases must also
update the Homebrew cask and create or reuse a WinGet PR.

## Recovery

Do not recreate or overwrite the tag. Rerun a failed child job, or dispatch the
reusable npm/standalone workflow with `source_ref=v$VERSION`. Use `--ref dev`
for previews and `--ref main` for stable releases. The canonical runbook
contains the exact commands.

After a stable release, prepare the next `X.Y.Z-preview.1` version in a normal
PR to `dev`.
