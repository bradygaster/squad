# Release Process for Squad Maintainers

Squad has two automated release channels:

| Channel | Source | Version | npm tag | Package managers |
|---------|--------|---------|---------|------------------|
| Preview | Manual dispatch from `dev` | `X.Y.Z-preview.N` | `preview` | Not updated |
| Stable | Sanitized promotion to `main` | `X.Y.Z` | `latest` | Homebrew and WinGet |

There is no staging `preview` branch. The word preview refers to a GitHub
prerelease and npm dist-tag.

## Prepare the version

Create a normal release-preparation PR targeting `dev`. Keep the root, SDK, and
CLI versions in lockstep:

```bash
VERSION=1.2.0-preview.1
npm version "$VERSION" --workspaces --include-workspace-root --no-git-tag-version
npm pkg set "dependencies.@bradygaster/squad-sdk=>=$VERSION" \
  --workspace @bradygaster/squad-cli
npm install --package-lock-only
```

Add an exact changelog heading:

```markdown
## [1.2.0-preview.1] - YYYY-MM-DD
```

Before merging, verify:

```bash
node -p "require('semver').valid('$VERSION')"
grep '"version"' package.json packages/squad-sdk/package.json packages/squad-cli/package.json
grep -F "## [$VERSION]" CHANGELOG.md
npm run build
npx vitest run
```

Wait for `dev` CI to pass after the PR merges.

## Publish a preview

Use a unique prerelease version such as `1.2.0-preview.1`:

```bash
VERSION=1.2.0-preview.1
gh workflow run squad-release.yml \
  --ref dev \
  -f confirm_tag="v$VERSION"
gh run watch
```

The workflow validates that it is running on `dev` and that the version is not
stable. It then:

1. Creates the immutable tag.
2. Creates a GitHub prerelease.
3. Publishes the SDK and CLI to npm `preview`.
4. Uploads standalone archives for macOS, Linux, and Windows.
5. Skips Homebrew and WinGet.

Install the preview with:

```bash
npm install -g @bradygaster/squad-cli@preview
```

## Publish stable

Prepare another PR that changes all package versions and the changelog heading
from the prerelease version to stable `1.2.0`. A preview version cannot be
converted in place after publication; `1.2.0-preview.1` and `1.2.0` are
different releases.

After the stable preparation lands on `dev`, test the promotion:

```bash
gh workflow run squad-promote.yml --ref dev -f dry_run=true
gh run watch
```

Then run it:

```bash
gh workflow run squad-promote.yml --ref dev -f dry_run=false
gh run watch
```

The promotion workflow merges `dev` directly into `main`, removes internal team
state from the release tree, validates versions and the changelog, builds, runs
tests, and pushes `main`.

Promotion explicitly dispatches `squad-release.yml` after pushing `main`,
because GitHub does not start another workflow from a `GITHUB_TOKEN` push. The
release workflow creates the stable tag and GitHub Release, publishes npm
`latest`, uploads standalone archives, updates the Homebrew cask, and opens or
reuses the WinGet manifest PR.

## What gets removed from `main`

The promotion workflow strips:

```text
.ai-team/
.squad/
.ai-team-templates/
team-docs/
docs/proposals/
```

Those paths remain on `dev`; no force push or staging branch is needed.

## Verify a release

For preview:

```bash
npm view @bradygaster/squad-sdk dist-tags.preview
npm view @bradygaster/squad-cli dist-tags.preview
```

For stable:

```bash
npm view @bradygaster/squad-sdk dist-tags.latest
npm view @bradygaster/squad-cli dist-tags.latest
```

The values must equal the release version. The GitHub Release must contain six
archives and `SHA256SUMS.txt`. Stable releases must also update
`bradygaster/homebrew-squad/Casks/squad.rb` and create or reuse a WinGet PR.

## Recover a failed publication

Do not recreate the tag or GitHub Release. Rerun the failed job. If a reusable
workflow must be dispatched directly, build from the immutable tag:

```bash
VERSION=1.2.0
gh workflow run squad-npm-publish.yml --ref main \
  -f version="$VERSION" -f source_ref="v$VERSION"
gh workflow run squad-standalone-release.yml --ref main \
  -f upload=true -f release_tag="v$VERSION" -f source_ref="v$VERSION"
```

Use `--ref dev` for preview-release recovery. Publication steps verify existing
versions and assets instead of overwriting them.

## After stable

Open a normal PR to `dev` that sets the next development version, for example:

```bash
NEXT_VERSION=1.3.0-preview.1
npm version "$NEXT_VERSION" --workspaces --include-workspace-root --no-git-tag-version
npm pkg set "dependencies.@bradygaster/squad-sdk=>=$NEXT_VERSION" \
  --workspace @bradygaster/squad-cli
npm install --package-lock-only
```
