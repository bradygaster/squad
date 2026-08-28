---
name: "release-process"
description: "Prepare, publish, recover, and verify Squad insider, preview, and stable releases"
domain: "release"
confidence: "high"
source: "earned"
---

# Release Process

This is the canonical Squad release runbook. Squad has three release channels
and two long-lived branches:

| Source | Version | GitHub | npm | Standalone | Homebrew/WinGet |
|--------|---------|--------|-----|------------|-----------------|
| Insider dispatch from `dev` | Generated `X.Y.Z-insider.N` | Prerelease | `insider` | Yes | Yes |
| Release dispatch from `dev` | `X.Y.Z-preview.N` | Prerelease | `preview` | Yes | Yes |
| Push to `main` by promotion workflow | `X.Y.Z` | Stable/latest | `latest` | Yes | Yes |

The repository does not use a staging `preview` branch. Preview is a release
channel, not a branch.

## Non-negotiable rules

1. Never create release tags or GitHub Releases manually. `squad-release.yml`
   creates both.
2. Never reuse a version. A preview such as `0.14.0-preview.1` and stable
   `0.14.0` are separate immutable releases.
3. Keep the root, SDK, and CLI versions identical.
4. Set the CLI's SDK dependency floor to `>=VERSION`; prerelease workspaces do
   not match an older stable range.
5. Add an exact `## [VERSION]` entry to `CHANGELOG.md`.
6. Merge release preparation to `dev` and wait for CI before dispatching.
7. Keep separate Homebrew casks and WinGet identifiers for each channel.

## Required credentials

Configure these GitHub Actions secrets:

- `NPM_TOKEN`: an automation-capable npm publish token that does not require an
  interactive OTP.
- `HOMEBREW_TAP_TOKEN`: a classic GitHub PAT with `public_repo`, owned by an
  account that has write access to `bradygaster/homebrew-squad`.
- `WINGET_CREATE_GITHUB_TOKEN`: a classic GitHub PAT with `public_repo`, owned
  by the account that maintains `tamirdresher/winget-pkgs`.

## Prepare a release

Verify `dev` and `main` share ancestry before changing versions:

```bash
git fetch origin dev main
git merge-base origin/dev origin/main
```

If that command returns no commit, stop and repair ancestry in a separate PR.

Choose a unique SemVer version and update all package manifests:

```bash
VERSION=0.14.0-preview.1
npm version "$VERSION" --workspaces --include-workspace-root --no-git-tag-version
npm pkg set "dependencies.@bradygaster/squad-sdk=>=$VERSION" \
  --workspace @bradygaster/squad-cli
npm install --package-lock-only
```

This updates the root package, both workspaces, and the lockfile. Confirm:

```bash
node -p "require('semver').valid('$VERSION')"
grep '"version"' package.json packages/squad-sdk/package.json packages/squad-cli/package.json
grep -F "## [$VERSION]" CHANGELOG.md
npm run build
npx vitest run
```

Release preparation lands through a normal PR to `dev`. Do not push directly to
`main`.

## Publish a preview release

Preview versions must contain a prerelease suffix, for example
`0.14.0-preview.1`.

After the release-preparation PR is merged and `dev` CI is green:

```bash
VERSION=0.14.0-preview.1
gh workflow run squad-release.yml \
  --ref dev \
  -f confirm_tag="v$VERSION"
gh run watch
```

The workflow:

1. Requires the dispatch ref to be `dev`.
2. Rejects a stable `X.Y.Z` version.
3. Creates `v$VERSION` and a GitHub prerelease.
4. Publishes both npm packages with `--tag preview`.
5. Uploads six standalone archives and `SHA256SUMS.txt`.
6. Updates the `squad-preview` Homebrew cask and
   `bradygaster.Squad.Preview` WinGet package.

Install the resulting preview:

```bash
npm install -g @bradygaster/squad-cli@preview
```

The same preview is available through `brew install --cask squad-preview` and
`winget install --id bradygaster.Squad.Preview --exact`.

## Publish an insider release

Start an on-demand snapshot from `dev`:

```bash
gh workflow run squad-insider-publish.yml --ref dev -f dry_run=false
gh run watch
```

The workflow computes the next immutable `X.Y.Z-insider.N` version, publishes
npm `insider`, creates a GitHub prerelease, uploads standalone bundles, updates
the `squad-insider` Homebrew cask, and opens or reuses the
`bradygaster.Squad.Insider` WinGet PR.

## Publish a stable release

Stable versions must be exactly `X.Y.Z`. Prepare and merge the stable version
to `dev`, then optionally validate the sanitized merge without changing
`main`:

```bash
gh workflow run squad-promote.yml --ref dev -f dry_run=true
gh run watch
```

Start the real promotion:

```bash
gh workflow run squad-promote.yml --ref dev -f dry_run=false
gh run watch
```

`squad-promote.yml`:

1. Merges `origin/dev` directly into `main`.
2. Removes `.ai-team/`, `.squad/`, `.ai-team-templates/`, `team-docs/`, and
   `docs/proposals/` from the release tree.
3. Rejects unresolved conflicts, prerelease versions, mismatched package
   versions, and missing changelog entries.
4. Installs dependencies, builds, and runs release tests.
5. Pushes `main` and explicitly dispatches `squad-release.yml`.

The explicit dispatch is required because GitHub suppresses push-triggered
workflow runs for commits authenticated with `GITHUB_TOKEN`. The release
workflow creates the stable tag and GitHub Release, publishes npm `latest`,
uploads standalone archives, updates Homebrew, and opens or reuses the WinGet
PR.

## Verify publication

Use `insider`, `preview`, or `latest` for `DIST_TAG`:

```bash
VERSION=0.14.0
DIST_TAG=latest

npm view @bradygaster/squad-sdk "dist-tags.$DIST_TAG"
npm view @bradygaster/squad-cli "dist-tags.$DIST_TAG"
gh release view "v$VERSION"
```

The npm values must equal `VERSION`. The GitHub Release must contain:

```text
squad-linux-x64.tar.gz
squad-linux-arm64.tar.gz
squad-darwin-x64.tar.gz
squad-darwin-arm64.tar.gz
squad-win32-x64.zip
squad-win32-arm64.zip
SHA256SUMS.txt
```

For every release, also verify the channel's Homebrew cask (`squad`,
`squad-preview`, or `squad-insider`) and WinGet identifier
(`bradygaster.Squad`, `.Preview`, or `.Insider`) reference the new version.

## Recovery

The top-level release workflow intentionally does not republish after its tag
already exists. Rerun the failed child job, or dispatch the reusable workflow
from the branch that owns that release channel while building from the
immutable tag.

Stable recovery:

```bash
VERSION=0.14.0
gh workflow run squad-npm-publish.yml --ref main \
  -f version="$VERSION" -f source_ref="v$VERSION"
gh workflow run squad-standalone-release.yml --ref main \
  -f upload=true -f release_tag="v$VERSION" -f source_ref="v$VERSION"
```

Preview recovery:

```bash
VERSION=0.14.0-preview.1
gh workflow run squad-npm-publish.yml --ref dev \
  -f version="$VERSION" -f source_ref="v$VERSION"
gh workflow run squad-standalone-release.yml --ref dev \
  -f upload=true -f release_tag="v$VERSION" -f source_ref="v$VERSION"
```

Publication is idempotent. Existing package versions and release assets are
verified rather than overwritten. npm publication fails instead of silently
moving `latest` or `preview` away from an existing version.

## After a stable release

Prepare the next development version in a normal PR to `dev`:

```bash
NEXT_VERSION=0.15.0-preview.1
npm version "$NEXT_VERSION" --workspaces --include-workspace-root --no-git-tag-version
npm pkg set "dependencies.@bradygaster/squad-sdk=>=$NEXT_VERSION" \
  --workspace @bradygaster/squad-cli
npm install --package-lock-only
```

Do not merge `main` back into `dev`; the promotion commit already has `dev` as
its parent, while the stripped internal state intentionally remains only on
`dev`.
