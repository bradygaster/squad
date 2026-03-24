# Release Playbook

This living playbook documents how to publish Squad releases to npm. Follow the recommended CI path whenever possible; use manual publish only as an emergency fallback.

## Overview

Squad publishes two npm packages:
- `@bradygaster/squad-sdk` — the core SDK
- `@bradygaster/squad-cli` — the CLI tool (depends on the SDK)

**Package order matters:** always publish the SDK first, then the CLI. The CLI declares a version range dependency on the SDK, and npm registry needs time to propagate the SDK before the CLI can reference it safely.

Two publish channels exist:
- **Stable:** triggered by GitHub Release (recommended path)
- **Insider:** triggered by push to `insider` branch (for testing pre-release builds)

## Pre-Flight Checklist

Complete this before any publish attempt:

- [ ] All tests pass: `npm test` (expect 3,900+ tests)
- [ ] No `file:` references in any `packages/*/package.json`
  - Check: `grep -r "file:" packages/*/package.json` should return nothing
- [ ] All `package.json` versions use valid semver (no `-preview` suffix for release)
  - Release versions: `1.2.3`
  - Pre-release versions: `1.2.3-preview.1`
- [ ] SDK dependency in `packages/squad-cli/package.json` is a version range, not `file:../squad-sdk`
  - Example valid: `"@bradygaster/squad-sdk": "^0.9.2"`
- [ ] Build succeeds clean: `npm run build` (no TypeScript errors)
- [ ] Package validation passes: 
  ```bash
  npm -w packages/squad-sdk pack --dry-run
  npm -w packages/squad-cli pack --dry-run
  ```
- [ ] Git tag matches version: `git tag` shows `v<VERSION>`
- [ ] `CHANGELOG.md` updated for this version
- [ ] GitHub Release draft created with notes

## Publish via CI (Recommended Path)

**This is the standard path for all releases.**

### Steps

1. In the GitHub UI, go to **Releases** → **Draft**
2. Finalize the release notes and click **Publish Release**
3. This triggers `squad-npm-publish.yml` automatically

### What the workflow does

The workflow runs four jobs in sequence:

1. **Preflight** — validates no `file:` dependencies exist
2. **Smoke test** — runs `npm pack --dry-run` and CLI integration tests
3. **Publish SDK** — publishes `@bradygaster/squad-sdk` with provenance attestation
4. **Publish CLI** — waits for SDK to succeed, then publishes `@bradygaster/squad-cli`

Each publish step:
- Verifies version matches the release tag
- Uses `npm -w packages/<pkg> publish --access public --provenance`
- Retries registry verification up to 5 times (15-second intervals) to account for propagation delay

### Monitor the workflow

Go to **Actions** → **Squad npm Publish** → select the latest run. All jobs must pass. If any job fails, see "Troubleshooting" below.

## Publish via workflow_dispatch (Manual Trigger)

**Use this when you need to republish without creating a new GitHub Release.**

### Steps

1. Go to **Actions** → **Squad npm Publish**
2. Click **Run workflow**
3. Enter the version string (e.g., `0.9.2`)
4. Click **Run workflow**

Same workflow runs as above. Use this to retry after a transient npm registry issue.

## Insider Channel

**For pre-release testing only.**

Pushes to the `insider` branch auto-trigger `squad-insider-publish.yml`, which:
- Publishes both SDK and CLI with `--tag insider`
- Skips the preflight job (insider builds may have experimental dependencies)
- Uses tag `insider` instead of `latest`

Install insider builds with:
```bash
npm install -g @bradygaster/squad-cli@insider
```

Users see the latest `latest` tag by default; they opt in to `insider` explicitly.

## Workspace Publish Policy

**NEVER use `npm publish` from the repo root.**

Using `npm publish` without workspace scope publishes the root `package.json` instead of the intended package. This breaks everything.

**ALWAYS use:**
```bash
npm -w packages/squad-sdk publish --access public
npm -w packages/squad-cli publish --access public
```

The CI workflows enforce this automatically via a lint rule. If you add any publish step to a workflow, it will be caught at CI gate.

For more details on this policy, see `.github/workflows/squad-ci.yml` → `publish-policy` job.

## Manual Local Publish (Emergency Fallback)

**Use this only when CI is broken and you must publish NOW.**

Prerequisites:
- `npm login` completed (or `NPM_TOKEN` environment variable set with a token from npmjs.com)
- Build succeeds locally: `npm run build`
- Pre-flight checklist passes

### Steps

1. Install dependencies and build:
   ```bash
   npm ci && npm run build
   ```

2. Run the pre-flight checklist manually (above)

3. Publish SDK:
   ```bash
   cd packages/squad-sdk
   npm publish --access public --otp=<CODE>
   cd ../..
   ```
   Replace `<CODE>` with your 2FA code from the authenticator app.

4. Verify SDK is live (wait up to 60 seconds for registry propagation):
   ```bash
   npm view @bradygaster/squad-sdk@<VERSION> version
   ```

5. Publish CLI:
   ```bash
   cd packages/squad-cli
   npm publish --access public --otp=<CODE>
   cd ../..
   ```

6. Verify CLI is live:
   ```bash
   npm view @bradygaster/squad-cli@<VERSION> version
   ```

### Critical rule

**Always publish SDK before CLI.** The CLI declares a dependency on the SDK, and npm needs the SDK version to exist in the registry.

### If SDK succeeds but CLI fails

Do NOT unpublish the SDK. Fix the CLI issue and republish the CLI. Both versions are already incremented; re-running the publish is safe.

## 422 Race Condition & npm Errors

During the v0.9.1 release, npm returned a 422 error ("Version already exists") even though the version hadn't been published yet. This was caused by `file:` dependencies confusing the version check.

### Error: 422 "Version already exists"

**First, verify whether the package is actually published:**
```bash
npm view @bradygaster/squad-<pkg>@<VERSION> version
```

- **If npm returns the version:** The publish succeeded. The 422 was a race condition. Move on.
- **If npm returns "404 Not Found":** The publish failed. Bump the version, fix the root issue, and re-publish.

### Error: 403 "Forbidden"

Your `NPM_TOKEN` is expired or missing. Regenerate it at npmjs.com → **Access Tokens** → **Generate New Token** (Automation, no expiration).

### Error: ETARGET "No matching version"

You published the SDK, but the CLI can't find the SDK version in the registry yet. **Wait 60 seconds** and retry. The CI workflow automatically retries 5 times with 15-second intervals.

### npm registry propagation

npm takes 15–60 seconds to propagate a new package version to all edge caches. The CI workflow accounts for this with retry logic. If manual publishing, retry the CLI publish after waiting.

## Post-Publish Verification

After publish completes (via CI or manual), verify both packages are live:

```bash
npm view @bradygaster/squad-sdk@<VERSION> version
npm view @bradygaster/squad-cli@<VERSION> version
npx @bradygaster/squad-cli@<VERSION> --version
```

The third command does a fresh install and tests the CLI from npm. This confirms the build, packaging, and CLI entrypoint are all working.

Check GitHub Releases and confirm the release is marked as **Latest**.

## Version Bump After Publish

After a stable release, bump the repository versions for continued development:

1. Update all `package.json` files to the next preview version:
   - `package.json` (root)
   - `packages/squad-sdk/package.json`
   - `packages/squad-cli/package.json`
   - Format: `<MAJOR>.<MINOR>.<PATCH+1>-preview.1`

2. Commit to the dev branch (NOT main):
   ```bash
   git add package.json packages/squad-sdk/package.json packages/squad-cli/package.json
   git commit -m "chore: bump to next preview version"
   git push origin dev
   ```

Example: if you just released `0.9.2`, bump to `0.9.3-preview.1`.

## Legacy Publish Scripts (Deprecated)

The repo contains version-specific publish scripts:
- `publish-0.8.21.ps1`
- `publish-0.8.22.ps1`
- `publish-0.9.1.ps1`

These are **deprecated.** They are version-specific and no longer maintained.

**Do NOT create new version-specific publish scripts.** The CI workflows are the standard path. Existing scripts may be deleted in a future cleanup.
