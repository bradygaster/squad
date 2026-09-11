---
name: "ci-validation-gates"
description: "Defensive CI/CD patterns: semver validation, token checks, retry logic, and draft detection"
domain: "ci-cd"
confidence: "high"
source: "extracted from release and CI incident lessons"
---

## Context

CI workflows must be defensive. These patterns capture lessons from prior release incidents;
they are maintained as version-agnostic gates rather than claims about a particular repository
release.

## Patterns

### Semver Validation Gate
Every publish workflow MUST validate version format before `npm publish`. 4-part versions (e.g., 0.8.21.4) are NOT valid semver — npm mangles them.

```yaml
- name: Validate semver
  run: |
    VERSION="${{ github.event.release.tag_name }}"
    VERSION="${VERSION#v}"
    if ! npx semver "$VERSION" > /dev/null 2>&1; then
      echo "❌ Invalid semver: $VERSION"
      echo "Only 3-part versions (X.Y.Z) or prerelease (X.Y.Z-tag.N) are valid."
      exit 1
    fi
    echo "✅ Valid semver: $VERSION"
```

### NPM Token Type Verification
NPM_TOKEN MUST be an Automation token, not a User token with 2FA:
- User tokens require OTP — CI can't provide it → EOTP error
- Create Automation tokens at npmjs.com → Settings → Access Tokens → Automation
- Verify before first publish in any workflow

### Retry Logic for npm Registry Propagation
npm registry uses eventual consistency. After `npm publish` succeeds, the package may not be immediately queryable.
- Propagation: typically 5-30s, up to 2min in rare cases
- All verify steps: 5 attempts, 15-second intervals
- Log each attempt: "Attempt 1/5: Checking package..."
- Exit loop on success, fail after max attempts

```yaml
- name: Verify package (with retry)
  run: |
    MAX_ATTEMPTS=5
    WAIT_SECONDS=15
    for attempt in $(seq 1 $MAX_ATTEMPTS); do
      echo "Attempt $attempt/$MAX_ATTEMPTS: Checking $PACKAGE@$VERSION..."
      if npm view "$PACKAGE@$VERSION" version > /dev/null 2>&1; then
        echo "✅ Package verified"
        exit 0
      fi
      [ $attempt -lt $MAX_ATTEMPTS ] && sleep $WAIT_SECONDS
    done
    echo "❌ Failed to verify after $MAX_ATTEMPTS attempts"
    exit 1
```

### Draft Release Detection
Draft releases don't emit `release: published` event. Workflows MUST:
- Trigger on `release: published` (NOT `created`)
- If using workflow_dispatch: verify release is published via GitHub API before proceeding

### Installer and Generated-Artifact Gates

- Pin downloaded scripts and binaries to an immutable release or commit; never execute a moving
  branch reference.
- Use `curl -f` (normally `curl -fsSL`) so HTTP failures cannot be interpreted as scripts.
- Download to a named file before execution when practical, then remove it after a successful
  install. This leaves a diagnosable artifact if the installer fails.
- Use `set -euo pipefail` in Bash steps. When a download must feed an extractor, `pipefail`
  prevents the extractor from masking a failed download.
- Lint and validate canonical workflow sources and every committed generated/template mirror.
  A successful source-only check does not prove the artifact that executes is valid.
- Keep suppressions narrow: exact tool diagnostic plus exact affected path, and revalidate them
  when the pinned tool changes.

The root build invokes `scripts/bump-build.mjs`, which can mutate package versions. For local
root validation, run `SKIP_BUILD_BUMP=1 npm run build`; do not run a bare `npm run build`.
Alternatively, use an existing CI environment that guarantees no mutation. In either case,
MUST verify the package manifests and lockfile are unchanged afterward. Prefer an affected
workspace build when it covers the check. Never let a validation build rewrite package
versions or create a version-only diff.

## Known Failure Modes

| # | What Happened | Root Cause | Prevention |
|---|---------------|-----------|------------|
| 1 | Invalid version published, registry mangled it | No semver validation gate | `npx semver` check before every publish |
| 2 | CI failed 5+ times with EOTP | User token with 2FA | Automation token only |
| 3 | Verify returned false 404 | No retry logic for propagation | 5 attempts, 15s intervals |
| 4 | Workflow never triggered | Draft release doesn't emit event | Never create draft releases |

## Anti-Patterns
- ❌ Publishing without semver validation gate
- ❌ Single-shot verification without retry
- ❌ Hard-coded secrets in workflows
- ❌ Silent CI failures — every error needs actionable output with remediation
- ❌ Assuming npm publish is instantly queryable
