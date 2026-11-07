# Squad agentic workflows bootstrap prompt

```text
Bootstrap this repository with GitHub’s Squad agentic workflows from `github/squad`. Inspect the repo first, make only the necessary changes, validate them, and open a PR for human review if your tools permit it. Do not merge.

Before editing:
- Check the default branch, working tree, authentication, and existing `.github/aw/`, `.github/workflows/`, and `.github/skills/` files.
- If an installation is already present, or files conflict and you can’t verify their ownership, stop and report the paths—don’t overwrite them.
- Verify `gh aw --version` is exactly `v0.91.5`.
- Obtain an approved, immutable 40-character lowercase `SQUAD_SHA` from published guidance or a maintainer. Never guess or use a moving branch.
- Check that Issues are enabled and Actions permissions match the documented Profile A (`default_workflow_permissions=read`, `can_approve_pull_request_reviews=false`). Don’t change settings without explicit authorization.

Install on `chore/squad-gh-aw-bootstrap`, without overwriting existing work:
`gh aw add "github/squad/workflows@${SQUAD_SHA}"`

Do not run generic `gh aw init` or create Squad files by hand. If the install generates `.github/skills/agentic-workflows/SKILL.md`, remove only that tool-generated file as the guide directs. Don’t create the optional secrets. If a first-install safe-update approval is required, approve only when its report contains exactly `SQUAD_GITHUB_APP_PRIVATE_KEY`, `SQUAD_GITHUB_TOKEN`, and `github/squad/.github/actions/squad-init`; otherwise stop.

Run and require success:
1. `node .github/workflows/shared/squad-install-verifier.mjs --materialize-runtime`
2. `gh aw compile --strict`
3. `node .github/workflows/shared/squad-install-verifier.mjs --verify-install --source-revision "${SQUAD_SHA}" --strict-compile`
4. Stage only `.gitattributes`, `.github/aw/`, `.github/workflows/`, and `.github/skills/` (and only newly installed/materialized changed/owned paths within those surfaces; never stage whole directories containing unrelated files), review the staged diff, then run `node .github/workflows/shared/squad-install-verifier.mjs --verify-staged-install --stage-ownership --source-revision "${SQUAD_SHA}"`.

Confirm eight workflows and their generated lockfiles are present, review the compiled artifacts, and allow only the two documented v0.91.5 warnings: `squad-review.md` (`pull_request_target`) and `squad.md` (combined `slash_command` and `bots` triggers). Stop on any other warning, error, unexpected deletion, or unrelated change. Stage only `.gitattributes`, `.github/aw/`, `.github/workflows/`, and `.github/skills/`; review the staged diff before committing.

Open a PR against the default branch captured during inspection only after all checks pass. If you can’t verify a prerequisite, validate the install, push, or create the PR, report the exact blocker instead of claiming success. Report the PR URL and validation results if created; leave merge and post-merge activation to a human.
```
