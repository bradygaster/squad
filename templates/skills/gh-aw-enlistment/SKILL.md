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
    when: "Installing the immutable native Squad package and compiling its eight workflows into deterministic .lock.yml files."
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

# Prove the exact package-capable compiler version before creating artifacts
# gh-aw-exact-version-start
required_gh_aw_version="v0.91.5"
gh_aw_version_output="$(gh aw --version 2>&1)" || gh_aw_version_output=""
gh_aw_version="$(printf '%s\n' "${gh_aw_version_output}" | awk 'END {print $NF}')"

if [ "${gh_aw_version}" != "${required_gh_aw_version}" ]; then
  echo "Installing exact supported gh-aw ${required_gh_aw_version}."
  gh extension remove gh-aw >/dev/null 2>&1 || true
  gh extension install --pin "${required_gh_aw_version}" github/gh-aw
  gh_aw_version_output="$(gh aw --version 2>&1)" || {
    echo "STOP: gh-aw version could not be verified after clean installation." >&2
    exit 1
  }
  gh_aw_version="$(printf '%s\n' "${gh_aw_version_output}" | awk 'END {print $NF}')"
fi

test "${gh_aw_version}" = "${required_gh_aw_version}" || {
  echo "STOP: required gh-aw v0.91.5, but found ${gh_aw_version:-unavailable} after clean installation." >&2
  exit 1
}
# gh-aw-exact-version-end

# Capture repository identity and default branch AT RUNTIME
owner_repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
default_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
echo "Repo: ${owner_repo}  Default branch: ${default_branch}"

# Git state must be understood and clean enough to isolate the install
git status --short
```

> **Portability — compiler check:** use the equivalent PowerShell commands to
> capture both output streams from `gh aw --version`. On any mismatch, remove
> `github/gh-aw`, cleanly install the exact `v0.91.5` pin, and verify both
> streams again. Stop before branch creation or file generation unless that
> second check proves exactly `v0.91.5`; never select a newer release.

- **STOP** if `gh auth status` is not logged in, or is logged in as the wrong
  identity for this repo (see the `gh-auth-isolation` skill to operate as a
  specific account without switching the global default).
- **STOP** if `owner_repo` or `default_branch` cannot be resolved.
- **STOP** if exact gh-aw `v0.91.5` cannot be proven after the clean pinned
  reinstall. Do not create a branch or generate repository files.
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
  -F can_approve_pull_request_reviews=false
```

`can_approve_pull_request_reviews` is a single, combined GitHub toggle: it
does not just govern whether `GITHUB_TOKEN` can *submit an approving review*
— the same switch also gates whether `GITHUB_TOKEN` is permitted to *create*
pull requests at all (GitHub returns the literal error "GitHub Actions is not
permitted to create or approve pull requests" for both operations; they
cannot be separated via job-level `permissions:` alone). GitHub's own API
reference calls enabling it a security risk, so Squad keeps it `false` for
least privilege and never relies on `GITHUB_TOKEN` to self-approve.

With it `false`, the bootstrap job's own `github.rest.pulls.create` call will
fail with that exact error. Squad's bootstrap workflow catches only that
specific error and falls back automatically: it still pushes the
`squad/bootstrap-cast` branch (the Cast PR's own branch — distinct from the
`chore/squad-gh-aw-bootstrap` branch you create by hand in step 2 below),
then opens (or, on a rerun, reuses) a tracking issue containing a
ready-to-click GitHub compare URL
(`.../compare/<base>...squad/bootstrap-cast?expand=1&title=...`) so a
human can open the PR manually in one click. Any other pull-request creation
error (for example, a PR that already exists) still fails the job normally —
only this one documented, exact permission error is treated as expected.
Every bootstrap and Cast PR, whichever way it is opened, still requires an
independent human (or `@copilot`) approving review before merge. Keep
`default_workflow_permissions=read`; do not set it to `write`.

### 2. Isolate the install on a bootstrap branch (preserve existing workflows)

```bash
git switch -c chore/squad-gh-aw-bootstrap
```

- If the branch already exists (a re-run), switch to it instead of recreating it.
- **Never overwrite** an existing `.github/workflows/*.md` or `*.lock.yml` that is
  not part of the Squad set. `gh aw add` is additive; if you see it about to
  replace an unrelated workflow, **STOP**.

### 3. Install the native package at an explicit, maintainer-approved revision

`SQUAD_SHA` must be supplied by the caller before this step — a specific,
already-reviewed 40-character commit SHA. Never derive it by resolving the
`dev` branch's current tip: `dev` is a continuously moving integration branch,
so resolving it at install time installs whatever happens to be on it at that
exact moment, with no maintainer vetting of that specific revision. Obtain the
current supported revision from the Squad maintainers or the project's
published release guidance, then set it once:

```bash
# SQUAD_SHA="<40-character commit SHA supplied by the maintainers>"
: "${SQUAD_SHA:?STOP: set SQUAD_SHA to an explicit, maintainer-approved 40-character Squad commit SHA before installing.}"
[[ "${SQUAD_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "STOP: SQUAD_SHA must be the exact 40-character commit SHA, not a branch name or shortened hash." >&2
  exit 1
}
gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"
rm -f .github/skills/agentic-workflows/SKILL.md
```

The nested `workflows/aw.yml` is the only supported distribution registration.
It isolates package auto-discovery from unrelated repository skills and agents,
and installs exactly eight workflows, seventeen runtime resources, and one
`gh-aw-enlistment` skill at the same resolved revision:

- `squad.md` + `squad.lock.yml`
- `squad-implement-worker.md` + `squad-implement-worker.lock.yml`
- `squad-review.md` + `squad-review.lock.yml`
- `squad-deps-worker.md` + `squad-deps-worker.lock.yml`
- `squad-retro.md` + `squad-retro.lock.yml`
- `squad-improvement-worker.md` + `squad-improvement-worker.lock.yml`
- `squad-bootstrap.md` + `squad-bootstrap.lock.yml`
- `squad-command-router.md` + `squad-command-router.lock.yml`

`squad-improvement-worker` is part of the standard, coherent install above —
not a separate opt-in add-on. It stays dormant until a maintainer approves a
governance-scoped retrospective proposal (see the gh-aw guide's retrospective
auto-implementation section); installing it alongside the other seven keeps the
full stack consistent and avoids a second bootstrap pass later.

gh-aw v0.91.5 also materializes
`.github/skills/agentic-workflows/SKILL.md`. That generic tool-owned router is
not part of the Squad package and directs agents to mutable prompts from the
current `github/gh-aw` repository rather than the pinned Squad revision. Remove
that exact file after every `gh aw add`. Keep
`.github/skills/gh-aw-enlistment/SKILL.md`: it is the one Squad-owned skill and
the verifier requires its exact package bytes. Do not adopt or vendor the rest
of gh-aw's generic scaffold.

Report/proposal-only is the default. Ordinary fixes require the explicit
`"squadRetroAutoImplement": "allow"` setting in `.squad/config.json`;
five action issues and three dispatches per wake-up remain separate caps.
An improvement requires `/squad approve-improvement`, `Approved-Revision:`
and exact `Approved-Path:` lines from a human with write/maintain/admin access.
The dispatcher sends nested issue and approval-comment IDs to the worker;
manual retries use those same IDs. `/squad revoke-improvement` is reserved
without dispatch and is rechecked before outputs. Draft PRs and human merge
remain mandatory; closed-unmerged PRs never cause automatic replacements.
See the guide for content-hash calculation and the one-retry recovery policy.

`SQUAD_SHA` is supplied explicitly by the caller, never resolved from `dev`'s
moving tip; the install itself only ever installs that one immutable,
already-approved revision.

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

- All eight workflows compile successfully.
- With gh-aw v0.91.5, require exactly two warnings, one occurrence of each
  exact diagnostic header below (including its workflow path):

<!-- compile-warning-allowlist-start -->
```text
.github/workflows/squad-review.md: warning: pull_request_target is a very dangerous trigger.
.github/workflows/squad.md: warning: Both slash_command and bots triggers are configured. If a bot listed in bots: posts a comment that starts with the slash command text (e.g., /command-name), it will trigger the workflow and occupy the concurrency slot, potentially blocking simultaneous manual invocations. To ensure the workflow only runs on explicit user commands, remove the 'bots:' field.
```
<!-- compile-warning-allowlist-end -->

The native review advisory includes the compiler's standard explanation and
Security Lab link. The following guard-policy dry-run lines are informational,
not another warning. The bot-trigger warning is expected because
`github-actions[bot]` enables controlled worker-continuation dispatches.

Accept the native review advisory **only while all existing controls remain**:
same-repository head restriction, base-controlled workflow source,
`checkout: false` agent path, API-only inspection, exact run/head/attempt guard,
least-privilege jobs, advisory verdict, and independent human approval.
`pull_request_target` is not generally safe; this narrow exception neither
weakens those controls nor authorizes PR-head execution.

**STOP** on any error, or on **any additional warning** beyond these two exact
documented diagnostics. Also STOP if either warning is missing, duplicated,
changed, or attributed to another path, if the summary is not
`Compiled 8 workflows: 8 succeeded, 2 warnings`, or if any required control is
absent. Do not suppress warnings or use `--approve` to bypass this gate.

### 6. Require the verifier to prove the complete consumer contract

- **STOP** if the verifier reports a missing source/lock pair, missing package
  ownership record, stale source/resource digest, incomplete eight-workflow
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
node .github/workflows/shared/squad-install-verifier.mjs \
  --verify-staged-install --stage-ownership --source-revision "${SQUAD_SHA}" || exit 1
git diff --cached --stat
unexpected_deletions="$(
  git diff --cached --diff-filter=D --name-only |
    grep -vxF '.github/skills/agentic-workflows/SKILL.md' || true
)"
test -z "${unexpected_deletions}" || {
  printf 'STOP: unexpected staged deletions:\n%s\n' "${unexpected_deletions}" >&2
  exit 1
}
```

- The only permitted staged deletion is
  `.github/skills/agentic-workflows/SKILL.md`, when upgrading a repository that
  previously committed gh-aw's mutable router.
- **STOP** if the staged diff shows any other **unexpected deletions**, **unexpected secrets**,
  edits to **unrelated files**, or committed **log/diagnostic output**. Re-scope with
  explicit `git add -- <path>` — never `git add .`, `git add -A`, or `git commit -a`.

Consumer rules such as `packages/` can silently ignore the required ownership
JSON under `.github/aw/packages/`. The staged verifier force-adds only the exact
native package ownership JSON when it is ignored and untracked. It then verifies
every manifest-required source, lock, runtime, skill, manifest and ownership
file against the validated working-tree bytes in a snapshot of the Git index.
**STOP before commit/push** on missing metadata, a staging failure, an omitted
required file or a staged digest mismatch. Never force-add a directory or glob.
Rerun this gate after changing or restaging any installation file.

### 8. Commit, push, and open the bootstrap PR to the captured default branch

```bash
git commit -m "ci: add Squad agentic workflow"
git push -u origin HEAD
gh pr create \
  --base "${default_branch}" \
  --title "ci: add Squad agentic workflow" \
  --body "Installs and strictly compiles the supported Squad GH-AW workflows."

# Copilot's review identity is a GraphQL Bot, not a User/Team — the REST
# `gh pr edit --add-reviewer @copilot` path silently no-ops for it. Request the
# review through the verified GraphQL path instead:
pr_node_id="$(gh pr view --json id --jq '.id')"
gh api graphql -f query='
  mutation($pr: ID!) {
    requestReviewsByLogin(input: { pullRequestId: $pr, botLogins: ["copilot-pull-request-reviewer"] }) {
      pullRequest { number }
    }
  }' -f pr="${pr_node_id}" || echo "Could not request a Copilot review via GraphQL; open the PR in the GitHub UI and add Copilot as a reviewer manually (Reviewers -> Copilot)." >&2
gh pr checks --watch
```

- Open the PR against the **runtime-captured** `${default_branch}`, not a hardcoded
  `main`.
- Request Copilot review via the GraphQL `requestReviewsByLogin` mutation
  (never the REST `--add-reviewer` shortcut, which silently no-ops for the
  Copilot Bot reviewer), address feedback, and wait for required checks. If
  the GraphQL call fails, add Copilot as a reviewer manually from the PR's
  GitHub UI.

### 9. Verify the native review contract after merge

The installation PR remains an explicit human trust boundary. After a human
merges it, inspect the Cast PR — automatically opened, or manually opened by a
human from the bootstrap fallback issue's compare-URL link when
`GITHUB_TOKEN` cannot create it directly — and require the native
`Squad Review / review` job from the base-controlled `pull_request_target`
workflow to succeed. Verify the exact workflow path, immutable base/workflow
SHA, PR base/head, run ID and attempt, successful `review` job, and exact-head
GitHub Actions check-run binding.

This review path uses only the native GitHub Actions/gh-aw runtime identity.
Never request or provision a reviewer PAT, GitHub App, private key, secret,
environment, hosted attestor, callback, or external service. The optional
`SQUAD_GITHUB_APP_*` and `SQUAD_GITHUB_TOKEN` activation credentials remain
unrelated to reviewer authority.

For authoritative merge enforcement, use a source-bound required-workflow or
equivalent ruleset when available. A context-only requirement for
`Squad Review / review` is advisory because a PR-controlled workflow may be
able to emit the same workflow/job name through the shared GitHub Actions
identity. If source-bound enforcement is unavailable, retain independent human
review rather than relying on that context alone or adding a credential-based
publisher. Require branches to be up to date before merge (or use an equivalent
merge-queue freshness guarantee), and enable the required context only after
the workflow installation is merged and the post-merge Cast canary succeeds.

### 10. Never auto-merge — and explain what comes next

- **Never** merge the bootstrap PR yourself. Merge happens **only** after human
  approval.
- Make the two-PR flow explicit to the user: after the workflow-installation PR
  reaches the default branch, `squad-bootstrap` normally creates one **draft,
  human-reviewed Cast PR** and one linked
  `[Research Proposals] Agent-discovered repo opportunities` issue from the
  same validated repository analysis. If `can_approve_pull_request_reviews`
  is `false` (the recommended, least-privilege setting from step 4),
  `GITHUB_TOKEN` cannot open that PR either; `squad-bootstrap` instead opens a
  **bot-authored fallback issue** carrying a signed provenance record and a
  ready-to-click compare URL, and Squad Review accepts the resulting
  manually-opened PR in that one narrowly-scoped case (see "Optional: PAT
  fallback" and the fallback-issue provenance contract in
  `docs/src/content/docs/guide/gh-aw.md` for the exact trust conditions).
  On the fallback path, no automatic trigger re-runs `squad-bootstrap` at any
  point — **not** when the human opens that compare-URL PR, and **not** when
  they later merge it either: `squad-bootstrap`'s push trigger only watches
  the Squad workflow-source paths (for example `.github/workflows/squad*.md`),
  and the manually-opened PR never touches any of those paths. The fallback
  issue itself tells the user to manually re-run the Squad Bootstrap workflow
  (`workflow_dispatch`) — either now, while the PR is still open, or anytime
  after merging it — which deterministically detects the PR (open or merged)
  and creates the linked research-proposals issue; no automatic trigger ever
  does this for them. Either way, the user reviews and merges the Cast PR, then follows the
  research issue's `/squad research`, `/squad triage`, `/squad plan`, and
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
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

git switch -c chore/squad-gh-aw-bootstrap
# SQUAD_SHA is supplied explicitly (maintainer-approved), never resolved from dev's tip
: "${SQUAD_SHA:?STOP: set SQUAD_SHA to an explicit, maintainer-approved 40-character Squad commit SHA.}"
[[ "${SQUAD_SHA}" =~ ^[0-9a-f]{40}$ ]] || {
  echo "STOP: SQUAD_SHA must be an explicit, maintainer-approved 40-character lowercase hex commit SHA." >&2
  exit 1
}
gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"
rm -f .github/skills/agentic-workflows/SKILL.md

# Safe-update report shows ONLY the two documented secrets + squad-init → approve once
gh aw compile --strict --approve
node .github/workflows/shared/squad-install-verifier.mjs --materialize-runtime
gh aw compile --strict           # final, no --approve; exactly the two documented warnings remain
node .github/workflows/shared/squad-install-verifier.mjs \
  --verify-install --source-revision "${SQUAD_SHA}" --strict-compile

git add -- .gitattributes .github/aw/ .github/workflows/ .github/skills/
node .github/workflows/shared/squad-install-verifier.mjs \
  --verify-staged-install --stage-ownership --source-revision "${SQUAD_SHA}" || exit 1
git commit -m "ci: add Squad agentic workflow"
git push -u origin HEAD
gh pr create --base "${default_branch}" \
  --title "ci: add Squad agentic workflow" \
  --body "Installs and strictly compiles the supported Squad GH-AW workflows."
pr_node_id="$(gh pr view --json id --jq '.id')"
gh api graphql -f query='
  mutation($pr: ID!) {
    requestReviewsByLogin(input: { pullRequestId: $pr, botLogins: ["copilot-pull-request-reviewer"] }) {
      pullRequest { number }
    }
  }' -f pr="${pr_node_id}"   # Bot-aware review request; then wait for review + checks; DO NOT merge
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
- ❌ **Committing gh-aw's mutable router.** Remove only
  `.github/skills/agentic-workflows/SKILL.md`; keep the exact Squad-owned
  `.github/skills/gh-aw-enlistment/SKILL.md`.
- ❌ **Approving unknown safe updates.** Approve ONLY `SQUAD_GITHUB_APP_PRIVATE_KEY`,
  `SQUAD_GITHUB_TOKEN`, and `bradygaster/squad/.github/actions/squad-init`. Anything
  else is a STOP.
- ❌ **Treating `--approve` as the final compile.** Always finish with a plain
  `gh aw compile --strict` (no `--approve`).
- ❌ **Tolerating extra warnings.** Only the documented `squad-review.md`
  `pull_request_target` advisory and `squad.md` bot-trigger warning are allowed;
  every other warning or error halts the run.
- ❌ **Committing diagnostics.** Never commit `.github/aw/logs/` output; add the
  log `.gitignore` if missing.
- ❌ **Clobbering existing workflows.** The install is additive; preserve unrelated
  `.github/workflows/` files.
- ❌ **Widening the default token.** Keep `default_workflow_permissions=read`.
- ❌ **Auto-merging.** The workflow-installation PR and the Cast PR (automatic
  or manually opened from the fallback issue) are both human-reviewed. The
  dedicated bootstrap wakes only after installation lands on the default
  branch.
- ❌ **Opening the PR before the package verifier and strict compile pass.**
