### What
<!-- One paragraph: what does this PR change? -->

### Why
<!-- Problem being solved. Link to the issue: Closes #N -->

### How
<!-- Approach taken. Key design decisions and trade-offs. -->

---

### PR Readiness Checklist

> The PR readiness bot will validate these automatically after push.
> Check each item before requesting review. See [CONTRIBUTING.md](../CONTRIBUTING.md) for full details.

#### Branch & Commit
- [ ] Branch created from `dev` (not `main`)
- [ ] Branch is up to date with `dev` (`git fetch upstream && git rebase upstream/dev`)
- [ ] PR is **not** in draft mode (mark ready when checks pass)
- [ ] Commit history is clean (squash fixups before review)

#### Build & Test
- [ ] `npm run build` passes
- [ ] `npm test` passes (all tests green)
- [ ] `npm run lint` passes (type check clean)
- [ ] `npm run lint:eslint` passes
- [ ] For migration PRs (>20 files): include test output summary in PR description

#### Changeset
- [ ] Changeset added via `npx changeset add` (if `packages/squad-sdk/src/` or `packages/squad-cli/src/` changed)
- [ ] Or direct `CHANGELOG.md` entry (maintainers only — write-protected for external contributors)
- [ ] Or `skip-changelog` label applied (if no user-facing changes)

#### Docs
<!-- "N/A" only if truly no user-facing change. -->
- [ ] README section updated (if new feature/module)
- [ ] Docs feature page (if new user-facing capability)

#### Exports
<!-- For SDK changes only. "N/A" if no new modules. -->
- [ ] package.json subpath exports updated (if new module)

---

### Breaking Changes
<!-- Any backward-incompatible changes. "None" if clean. -->

### Waivers
<!-- If skipping any REQUIRED item: 1) Request waiver in this section, 2) Named reviewer must approve in PR comments BEFORE merge. Format: "Waived: {item}, reason: {why}, approved by: {Flight|FIDO}" -->
