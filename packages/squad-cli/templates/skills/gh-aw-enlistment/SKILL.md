---
name: "gh-aw-enlistment"
description: "Enlist a repository into Squad by installing the supported GitHub Agentic Workflows (gh-aw) bootstrap — with strict compilation, an explicit safe-update allowlist, and a human-reviewed bootstrap PR. Never auto-merges."
domain: "github-integration, agentic-workflows, ci-bootstrap, safety-gated-automation"
confidence: "high"
source: "Operationalized from the authoritative Squad gh-aw guide (docs/src/content/docs/guide/gh-aw.md) covering the supported install → compile → validate → bootstrap-PR path."
triggers: [set up Squad agentic workflows, enlist this repo in Squad, enlist my repository in Squad, install Squad gh-aw workflows, install Squad agentic workflows, add Squad gh aw workflows, bootstrap Squad in this repo, onboard this repo to Squad, set up /squad slash commands, gh aw add squad]
tools:
  - name: "gh"
    description: "GitHub CLI — repo identity, Issues and Actions settings, PR creation, review request, and check watching."
    when: "Every step: preflight identity/auth, requiring Issues, enabling Actions-created PRs, opening and watching the bootstrap PR."
  - name: "gh aw"
    description: "GitHub Agentic Workflows extension (github/gh-aw) — installs and strictly compiles the Squad workflow set."
    when: "Installing the immutable native Squad package and compiling its seven workflows into deterministic .lock.yml files."
---

## Context

Use this skill when a user wants to **enlist a repository into Squad** through
**GitHub Agentic Workflows (`gh aw`)** — e.g. "set up Squad agentic workflows",
"enlist this repo in Squad", or "install Squad gh-aw workflows". The end state is
the `/squad` slash command being live on the repo, delivered as a **human-reviewed
bootstrap pull request** — never an auto-merge.

This skill **operationalizes** the supported bootstrap path. It does not summarize
it: each step below is a gate with explicit success evidence and **STOP conditions**.
The authoritative source is `docs/src/content/docs/guide/gh-aw.md` (mirrored at
`https://bradygaster.github.io/squad/docs/guide/gh-aw/`). If that guide and this
skill ever disagree, the guide wins — re-read it before proceeding.

GitHub Issues are a hard prerequisite: `/squad` commands arrive as issue
comments, and the merged bootstrap creates a research/proposals issue. Detect
and enable Issues before creating the bootstrap branch or installing workflows,
so the install cannot produce a PR whose post-merge bootstrap is unable to
complete.

**Portability contract:** resolve every target repository identifier (owner, repo,
default branch) **at runtime**. Never hardcode a placeholder like `{owner}/{repo}`.
Resolve the supported Squad channel once to a 40-character commit SHA, then use
that one immutable revision for the complete package.

**Idempotency contract:** the bootstrap is re-runnable. Never clobber existing
workflows, prefer detecting prior state over duplicating it, and **stop clearly** on
any unsafe or ambiguous condition rather than guessing.

## Patterns

Run these steps in order. Treat every "STOP" as a hard halt: report the exact
condition and wait for a human decision — do not work around it.

### 0. Preflight — verify before you touch anything

```bash
# gh is authenticated
gh auth status

# Capture repository identity and default branch AT RUNTIME
owner_repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
default_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
echo "Repo: ${owner_repo}  Default branch: ${default_branch}"

# Install the package-capable compiler version used by the distribution contract
gh extension install --force --pin v0.89.21 github/gh-aw
test "$(gh aw --version | awk '{print $NF}')" = "v0.89.21"

# Git state must be understood and clean enough to isolate the install
git status --short
```

> **Portability — compiler check:** use the equivalent PowerShell commands to
> force-install `github/gh-aw` at `v0.89.21`, then confirm `gh aw --version`
> reports that exact version before installation.

- **STOP** if `gh auth status` is not logged in, or is logged in as the wrong
  identity for this repo (see the `gh-auth-isolation` skill to operate as a
  specific account without switching the global default).
- **STOP** if `owner_repo` or `default_branch` cannot be resolved.
- **STOP** if the working tree has unrelated uncommitted changes you cannot
  account for — the bootstrap must land as an isolated, reviewable change.
- Confirm Copilot is enabled for the repository where checkable; the activation
  run and the requested `@copilot` review both depend on it.

### 1. Require GitHub Issues, then allow Actions-created PRs with a read-only token

Check the REST API's `has_issues` field first. If Issues are disabled, enable
them before touching the install:

```bash
issues_enabled="$(gh api "repos/${owner_repo}" --jq '.has_issues')"
if [ "${issues_enabled}" != "true" ]; then
  echo "GitHub Issues are disabled; enabling them before workflow installation."
  if ! gh api --method PATCH "repos/${owner_repo}" \
    -F has_issues=true --silent; then
    echo "STOP: GitHub Issues are disabled and could not be enabled." >&2
    echo "A repository administrator must enable Settings > General > Features > Issues, then rerun enlistment." >&2
    exit 1
  fi
fi

test "$(gh api "repos/${owner_repo}" --jq '.has_issues')" = "true" || {
  echo "STOP: GitHub Issues must be enabled before installing Squad workflows." >&2
  exit 1
}
```

Reading `.has_issues` is non-mutating. Updating it through
`PATCH /repos/{owner}/{repo}` requires repository administration permission.
If the PATCH fails, **STOP before branch creation or `gh aw add`** and ask an
administrator to enable **Settings → General → Features → Issues**. Do not
continue with a bootstrap PR that cannot complete after merge.

Squad also opens PRs through GitHub Actions. Enable that **without** widening
the default workflow token:

```bash
gh api --method PUT "repos/${owner_repo}/actions/permissions/workflow" \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true
```

Without this, Squad still pushes the generated branch but falls back to an issue
with a manual PR link — and a self-authored PR cannot be self-approved. Keep
`default_workflow_permissions=read`; do not set it to `write`.

### 2. Isolate the install on a bootstrap branch (preserve existing workflows)

```bash
git switch -c chore/squad-gh-aw-bootstrap
```

- If the branch already exists (a re-run), switch to it instead of recreating it.
- **Never overwrite** an existing `.github/workflows/*.md` or `*.lock.yml` that is
  not part of the Squad set. `gh aw add` is additive; if you see it about to
  replace an unrelated workflow, **STOP**.

### 3. Resolve one immutable revision and install the native package

```bash
SQUAD_SHA="$(gh api repos/bradygaster/squad/commits/dev --jq '.sha')"
[[ "${SQUAD_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "STOP: could not resolve an immutable 40-character Squad commit SHA." >&2
  exit 1
}
gh aw add "bradygaster/squad@${SQUAD_SHA}"
```

The root `aw.yml` is the only supported distribution registration. It installs
the complete set at the same resolved revision:

- `squad.md` + `squad.lock.yml`
- `squad-implement-worker.md` + `squad-implement-worker.lock.yml`
- `squad-review.md` + `squad-review.lock.yml`
- `squad-deps-worker.md` + `squad-deps-worker.lock.yml`
- `squad-retro.md` + `squad-retro.lock.yml`
- `squad-improvement-worker.md` + `squad-improvement-worker.lock.yml`
- `squad-bootstrap.md` + `squad-bootstrap.lock.yml`

`squad-improvement-worker` is part of the standard, coherent install above —
not a separate opt-in add-on. It stays dormant until a maintainer approves a
governance-scoped retrospective proposal (see the gh-aw guide's retrospective
auto-implementation section); installing it alongside the other six keeps the
full stack consistent and avoids a second bootstrap pass later.

Report/proposal-only is the default. Ordinary fixes require the explicit
`"squadRetroAutoImplement": "allow"` setting in `.squad/config.json`;
five action issues and three dispatches per wakeup remain separate caps.
An improvement requires `/squad approve-improvement`, `Approved-Revision:`
and exact `Approved-Path:` lines from a human with write/maintain/admin access.
The dispatcher sends nested issue and approval-comment IDs to the worker;
manual retries use those same IDs. `/squad revoke-improvement` is reserved
without dispatch and is rechecked before outputs. Draft PRs and human merge
remain mandatory; closed-unmerged PRs never cause automatic replacements.
See the guide for content-hash calculation and the one-retry recovery policy.

The `dev` channel is used only to resolve `SQUAD_SHA`; the install itself never
uses a moving branch reference.

### 4. Review the first-install safe-update report — approve ONLY the documented entries

On a clean repo, `gh aw add` reports these expected safe updates and **nothing else**:

<!-- allowlist-start -->
- Restricted secrets: **`SQUAD_GITHUB_APP_PRIVATE_KEY`** and **`SQUAD_GITHUB_TOKEN`**
- Action: **`bradygaster/squad/.github/actions/squad-init`**
<!-- allowlist-end -->

> **These are referenced names, not prerequisites.** `gh aw add` lists the secrets
> the workflows *reference* so you can approve that surface — it is not asking you
> to supply them. Both secrets are optional, they need not exist, and neither is
> required to enlist a repository. Single-repo activation runs on the built-in
> `github.token`. Configure them only for cross-repo access or elevated
> permissions. Auth precedence: GitHub App token, then the PAT, then
> `github.token`. Never block an enlistment waiting for a credential.

If — and only if — the report contains exactly those documented entries, complete
the one-time approval:

```bash
gh aw compile --strict --approve   # first install only, when the safe-update warning appears
```

- **STOP** if the report lists **any other secret** or **any other action**. Do not
  approve. Report the unexpected entry verbatim and wait for a human.
- This `--approve` step is *only* the first-install unblock. It is **not** a
  substitute for the final strict compile in the next step.

### 5. Always run the final strict compile WITHOUT `--approve`

```bash
node .github/workflows/shared/squad-install-verifier.mjs --materialize-runtime
gh aw compile --strict
node .github/workflows/shared/squad-install-verifier.mjs \
  --verify-install \
  --source-revision "${SQUAD_SHA}" \
  --strict-compile
```

This must run after any first-install approval and before committing. Success
criteria:

- All seven workflows compile successfully.
- The **only** permitted warning is the known `squad.md` bot-trigger warning: it
  configures both slash-command and `github-actions[bot]` triggers, and the bot
  trigger is required for controlled worker-continuation dispatches.
- **STOP** on any error, or on **any additional warning** beyond that single
  documented one.

### 6. Require the verifier to prove the complete consumer contract

- **STOP** if the verifier reports a missing source/lock pair, missing package
  ownership record, stale source/resource digest, incomplete seven-workflow
  registration, or mixed revision.
- Use only the recovery commands printed by the verifier. They reinstall the
  complete package at one immutable revision; never repair one workflow or
  resource in isolation.

### 7. Inspect generated files, then stage only the documented surfaces

Downloaded workflow audit data is local diagnostic output — **do not commit it**.
If `.github/aw/logs/` lacks a `.gitignore`, add one there:

```gitignore
# Ignore all downloaded workflow logs
*

# But keep this file
!.gitignore
```

`gh aw add` may also create `.vscode/settings.json` (enables Copilot for Markdown
workflow files). This is an **optional editor setting** — the stage command below
intentionally leaves it untracked. Delete it if unwanted, or stage it explicitly
if your team wants to share it. Decide deliberately; do not stage it by accident.

Stage **only** the documented generated surfaces, then verify the staged set:

```bash
git add -- .gitattributes .github/aw/ .github/workflows/ .github/skills/
git diff --cached --stat
# No deletions should be staged:
test -z "$(git diff --cached --diff-filter=D --name-only)" || { echo "STOP: staged deletions"; exit 1; }
```

- **STOP** if the staged diff shows **unexpected deletions**, **unexpected secrets**,
  edits to **unrelated files**, or committed **log/diagnostic output**. Re-scope with
  explicit `git add -- <path>` — never `git add .`, `git add -A`, or `git commit -a`.

### 8. Commit, push, and open the bootstrap PR to the captured default branch

```bash
git commit -m "ci: add Squad agentic workflow"
git push -u origin HEAD
gh pr create \
  --base "${default_branch}" \
  --title "ci: add Squad agentic workflow" \
  --body "Installs and strictly compiles the supported Squad GH-AW workflows."
gh pr edit --add-reviewer @copilot
gh pr checks --watch
```

- Open the PR against the **runtime-captured** `${default_branch}`, not a hardcoded
  `main`.
- Request Copilot review, address feedback, and wait for required checks.

### 9. Never auto-merge — and explain what comes next

- **Never** merge the bootstrap PR yourself. Merge happens **only** after human
  approval.
- Make the two-PR flow explicit to the user: after the workflow-installation PR
  reaches the default branch, `squad-bootstrap` automatically creates one
  **draft, human-reviewed Cast PR** and one linked
  `[Research Proposals] Agent-discovered repo opportunities` issue from the same
  validated repository analysis. The user reviews and merges the Cast PR, then
  follows the issue's `/squad research`, `/squad triage`, `/squad plan`, and
  `/squad activate` instructions until assignable implementation issues exist.

## Examples

### ✓ Correct: runtime-resolved identity, allowlist honored, human-reviewed

```bash
owner_repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
default_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"

issues_enabled="$(gh api "repos/${owner_repo}" --jq '.has_issues')"
if [ "${issues_enabled}" != "true" ]; then
  if ! gh api --method PATCH "repos/${owner_repo}" \
    -F has_issues=true --silent; then
    echo "STOP: GitHub Issues are disabled and could not be enabled." >&2
    echo "A repository administrator must enable Settings > General > Features > Issues, then rerun enlistment." >&2
    exit 1
  fi
fi

test "$(gh api "repos/${owner_repo}" --jq '.has_issues')" = "true" || {
  echo "STOP: GitHub Issues must be enabled before installing Squad workflows." >&2
  exit 1
}

gh api --method PUT "repos/${owner_repo}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

git switch -c chore/squad-gh-aw-bootstrap
SQUAD_SHA="$(gh api repos/bradygaster/squad/commits/dev --jq '.sha')"
[[ "${SQUAD_SHA}" =~ ^[0-9a-f]{40}$ ]]
gh aw add "bradygaster/squad@${SQUAD_SHA}"

# Safe-update report shows ONLY the two documented secrets + squad-init → approve once
gh aw compile --strict --approve
node .github/workflows/shared/squad-install-verifier.mjs --materialize-runtime
gh aw compile --strict           # final, no --approve; only the bot-trigger warning remains
node .github/workflows/shared/squad-install-verifier.mjs \
  --verify-install --source-revision "${SQUAD_SHA}" --strict-compile

git add -- .gitattributes .github/aw/ .github/workflows/ .github/skills/
git commit -m "ci: add Squad agentic workflow"
git push -u origin HEAD
gh pr create --base "${default_branch}" \
  --title "ci: add Squad agentic workflow" \
  --body "Installs and strictly compiles the supported Squad GH-AW workflows."
gh pr edit --add-reviewer @copilot   # then wait for review + checks; DO NOT merge
```

### ✓ Correct: STOP on an undocumented safe-update entry

```text
gh aw add reports a third secret: `ACME_DEPLOY_KEY`.
→ This is NOT in the allowlist (SQUAD_GITHUB_APP_PRIVATE_KEY, SQUAD_GITHUB_TOKEN)
  and is NOT the squad-init action. Do NOT run `--approve`.
  Halt, report "unexpected safe-update entry: ACME_DEPLOY_KEY", and wait.
```

### ✗ Incorrect: hardcoded target and blanket staging

```bash
# BAD: hardcoded owner/repo and default branch
gh api --method PUT "repos/acme/widgets/actions/permissions/workflow" ...
gh pr create --base main ...        # wrong if the default branch isn't `main`

# BAD: blanket staging captures logs, editor settings, and unrelated changes
# Stage only the generated bootstrap paths listed above.
```

### ✗ Incorrect: skipping the final strict compile or auto-merging

```bash
gh aw compile --strict --approve    # approved first install...
# ...then committed WITHOUT the final `gh aw compile --strict` (no --approve). WRONG.
gh pr merge --squash                # auto-merge before human review. NEVER.
```

## Anti-Patterns

- ❌ **Hardcoding repository identifiers.** Always resolve `owner/repo` and the
  default branch at runtime with `gh repo view`.
- ❌ **Installing while GitHub Issues are disabled.** `/squad` commands and the
  bootstrap research/proposals issue require Issues. Enable them first, or stop
  before installation if repository administration permission is unavailable.
- ❌ **Blanket staging** (`git add .` / `-A` / `git commit -a`). Stage only
  `.gitattributes`, `.github/aw/`, `.github/workflows/`, `.github/skills/`, by path.
- ❌ **Approving unknown safe updates.** Approve ONLY `SQUAD_GITHUB_APP_PRIVATE_KEY`,
  `SQUAD_GITHUB_TOKEN`, and `bradygaster/squad/.github/actions/squad-init`. Anything
  else is a STOP.
- ❌ **Treating `--approve` as the final compile.** Always finish with a plain
  `gh aw compile --strict` (no `--approve`).
- ❌ **Tolerating extra warnings.** Only the `squad.md` bot-trigger warning is
  allowed; every other warning or error halts the run.
- ❌ **Committing diagnostics.** Never commit `.github/aw/logs/` output; add the
  log `.gitignore` if missing.
- ❌ **Clobbering existing workflows.** The install is additive; preserve unrelated
  `.github/workflows/` files.
- ❌ **Widening the default token.** Keep `default_workflow_permissions=read`.
- ❌ **Auto-merging.** The workflow-installation PR and automatic Cast PR are
  both human-reviewed. The dedicated bootstrap wakes only after installation
  lands on the default branch.
- ❌ **Opening the PR before the package verifier and strict compile pass.**
