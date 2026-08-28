# Release Checklist

Squad supports on-demand insider and preview releases from `dev`, plus stable
releases from `main`. Channel names identify release streams, not branches.

## All releases

- [ ] `git merge-base origin/dev origin/main` returns a commit.
- [ ] The root, SDK, and CLI `package.json` versions are identical.
- [ ] The CLI SDK dependency and lockfile entry are `>=VERSION`.
- [ ] The version is valid SemVer and has never been published.
- [ ] `CHANGELOG.md` contains `## [VERSION]`.
- [ ] The release-preparation PR is merged to `dev`.
- [ ] `dev` CI is green.
- [ ] `NPM_TOKEN` is configured for non-interactive publishing.
- [ ] `HOMEBREW_TAP_TOKEN` is a classic PAT with `public_repo` from a
      collaborator on `bradygaster/homebrew-squad`.
- [ ] `WINGET_CREATE_GITHUB_TOKEN` is a classic PAT with `public_repo`.

## Preview release

- [ ] Version is `X.Y.Z-preview.N`, not stable `X.Y.Z`.
- [ ] Dispatch:

  ```bash
  gh workflow run squad-release.yml --ref dev -f confirm_tag=vX.Y.Z-preview.N
  ```

- [ ] GitHub marks `vX.Y.Z-preview.N` as a prerelease.
- [ ] npm `preview` points to the version for both packages.
- [ ] The release has six standalone archives and `SHA256SUMS.txt`.
- [ ] `squad-preview` references the new Homebrew version.
- [ ] A `bradygaster.Squad.Preview` WinGet PR exists or is already upstream.

## Insider release

- [ ] Dispatch `squad-insider-publish.yml` from `dev`.
- [ ] npm `insider` points to the generated `X.Y.Z-insider.N` version.
- [ ] GitHub marks the same version as a prerelease.
- [ ] The release has six standalone archives and `SHA256SUMS.txt`.
- [ ] `squad-insider` references the new Homebrew version.
- [ ] A `bradygaster.Squad.Insider` WinGet PR exists or is already upstream.

## Stable release

- [ ] Version is exactly `X.Y.Z`.
- [ ] Optional dry run passes:

  ```bash
  gh workflow run squad-promote.yml --ref dev -f dry_run=true
  ```

- [ ] Dispatch the promotion:

  ```bash
  gh workflow run squad-promote.yml --ref dev -f dry_run=false
  ```

- [ ] The promotion merges `dev` directly to `main`.
- [ ] `.ai-team/`, `.squad/`, `.ai-team-templates/`, `team-docs/`, and
      `docs/proposals/` are absent from `main`.
- [ ] Promotion explicitly dispatches `squad-release.yml` after pushing `main`.
- [ ] GitHub marks `vX.Y.Z` as the latest stable release.
- [ ] npm `latest` points to the version for both packages.
- [ ] The release has six standalone archives and `SHA256SUMS.txt`.
- [ ] The Homebrew cask references the new version.
- [ ] A WinGet update PR exists or the version is already upstream.

## Do not do manually

- Do not create or push the release tag.
- Do not create or edit the GitHub Release.
- Do not move npm dist-tags manually.
- Do not push directly to `main`.
- Do not use or recreate a staging `preview` branch.

## Recovery

Fix the credential or service failure and rerun the failed child job. If a
manual backfill is required, dispatch `squad-npm-publish.yml` or
`squad-standalone-release.yml` with `source_ref=vVERSION`. Use `--ref dev` for
preview or insider releases and `--ref main` for stable releases.
