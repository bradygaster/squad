# Release Process

> Earned knowledge from the v0.9.0→v0.9.1 incident. Every agent involved in releases MUST read this before starting release work.

## SCOPE

✅ THIS SKILL PRODUCES:
- Pre-release validation checks that prevent broken publishes
- Correct npm publish commands (never workspace-scoped)
- Fallback procedures when CI workflows fail
- Post-publish verification steps

❌ THIS SKILL DOES NOT PRODUCE:
- Feature implementation or test code
- Architecture decisions
- Documentation content

## Confidence: high

Established through the v0.9.1 incident (8-hour recovery). Every rule below is battle-tested.

## Context

Squad publishes two npm packages: `@bradygaster/squad-sdk` and `@bradygaster/squad-cli`. The release pipeline flows: dev → preview → main → GitHub Release → npm publish. Brady (project owner) triggers releases — the coordinator does NOT.

## Rules (Non-Negotiable)

### 1. Coordinator Does NOT Publish

The coordinator routes work and manages agents. It does NOT run `npm publish`, trigger release workflows, or make release decisions. Brady owns the release trigger. If an agent or the coordinator is asked to publish, escalate to Brady.

### 2. Pre-Publish Dependency Validation

Before ANY release is tagged, scan every `packages/*/package.json` for:
- `file:` references (workspace leak — the v0.9.0 root cause)
- `link:` references
- Absolute paths in dependency values
- Non-semver version strings

**Command:**
```bash
grep -r '"file:\|"link:\|"/' packages/*/package.json
```
If anything matches, STOP. Do not proceed. Fix the reference first.

### 3. Never Use `npm -w` for Publishing

`npm -w packages/squad-sdk publish` hangs silently when 2FA is enabled. Always `cd` into the package directory:

```bash
cd packages/squad-sdk && npm publish --access public
cd packages/squad-cli && npm publish --access public
```

### 4. Fallback Protocol

If `workflow_dispatch` or the publish workflow fails:
1. Try once more (ONE retry, not four)
2. If it fails again → local publish immediately
3. Do NOT attempt GitHub UI file operations to fix workflow indexing
4. GitHub has a ~15min workflow cache TTL after file renames/deletes — waiting helps, retrying doesn't

### 5. Post-Publish Smoke Test

After every publish, verify in a clean shell:
```bash
npm install -g @bradygaster/squad-cli@latest
squad --version    # should match published version
squad doctor       # should pass in a test repo
```

If the smoke test fails, rollback immediately.

### 6. npm Token Must Be Automation Type

NPM_TOKEN in CI must be an Automation token (not a user token with 2FA prompts). User tokens with `auth-and-writes` 2FA cause silent hangs in non-interactive environments.

### 7. No Draft GitHub Releases

Never create draft GitHub Releases. The `release: published` event only fires when a release is published — drafts don't trigger the npm publish workflow.

### 8. Version Format

Semantic versioning only: `MAJOR.MINOR.PATCH` (e.g., `0.9.1`). Four-part versions like `0.8.21.4` are NOT valid semver and will break npm publish.

### 9. SKIP_BUILD_BUMP=1 in CI

Set this environment variable in all CI build steps to prevent the build script from mutating versions during CI runs.

## Release Checklist (Quick Reference)

```
□ All tests passing on dev
□ No file:/link: references in packages/*/package.json
□ CHANGELOG.md updated
□ Version bumps committed (node -e script)
□ npm auth verified (Automation token)
□ No draft GitHub Releases pending
□ Local build + test: npm run build && npx vitest run
□ Push dev → CI green
□ Promote dev → preview (squad-promote workflow)
□ Preview CI green (squad-preview validates)
□ Promote preview → main
□ squad-release auto-creates GitHub Release
□ squad-npm-publish auto-triggers
□ Monitor publish workflow
□ Post-publish smoke test
```

## Known Gotchas

| Gotcha | Impact | Mitigation |
|--------|--------|------------|
| npm workspaces rewrite `"*"` → `"file:../path"` | Broken global installs | Preflight scan in CI (squad-npm-publish.yml) |
| GitHub Actions workflow cache (~15min TTL) | 422 on workflow_dispatch after file renames | Wait 15min or use local publish fallback |
| `npm -w publish` hangs with 2FA | Silent hang, no error | Never use `-w` for publish |
| Draft GitHub Releases | npm publish workflow doesn't trigger | Never create drafts |
| User npm tokens with 2FA | EOTP errors in CI | Use Automation token type |

## Related

- Issues: #556–#564 (release:next)
- Retro: `.squad/decisions/inbox/surgeon-v091-retrospective.md`
- CI audit: `.squad/decisions/inbox/booster-ci-audit.md`
- Playbook (for Brady's review): session files/release-playbook.md
