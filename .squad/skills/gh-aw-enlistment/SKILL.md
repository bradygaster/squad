---
name: "gh-aw-enlistment"
description: "Enlist a repository into Squad by installing the supported GitHub Agentic Workflows (gh-aw) bootstrap — with strict compilation, an explicit safe-update allowlist, and a human-reviewed bootstrap PR. Never auto-merges."
domain: "github-integration, agentic-workflows, ci-bootstrap, safety-gated-automation"
confidence: "high"
source: "Operationalized from the authoritative Squad gh-aw guide (docs/src/content/docs/guide/gh-aw.md) covering the supported install → compile → validate → bootstrap-PR path."
triggers: [set up Squad agentic workflows, enlist this repo in Squad, enlist my repository in Squad, install Squad gh-aw workflows, install Squad agentic workflows, add Squad gh aw workflows, bootstrap Squad in this repo, onboard this repo to Squad, set up /squad slash commands, gh aw add squad]
tools:
  - name: "gh"
    description: "GitHub CLI — repo identity, Actions permissions, PR creation, review request, and check watching."
    when: "Every step: preflight identity/auth, enabling Actions-created PRs, opening and watching the bootstrap PR."
  - name: "gh aw"
    description: "GitHub Agentic Workflows extension (github/gh-aw) — installs and strictly compiles the Squad workflow set."
    when: "Installing the four @dev workflows and compiling them into deterministic .lock.yml files."
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

**Portability contract:** resolve every repository identifier (owner, repo, default
branch) **at runtime**. Never hardcode a placeholder like `{owner}/{repo}`. The only
fixed identifier is the Squad source itself — `bradygaster/squad/workflows/...@dev` —
because that is where the workflows are published.

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

# The gh-aw extension must be installed (install once if missing)
gh extension list | grep -q 'github/gh-aw' || gh extension install github/gh-aw

# Git state must be understood and clean enough to isolate the install
git status --short
```

> **Portability — extension check:** the `grep -q` above is bash/Git Bash. On Windows
> PowerShell use:
> `if (-not (gh extension list | Select-String -Quiet 'github/gh-aw')) { gh extension install github/gh-aw }`

- **STOP** if `gh auth status` is not logged in, or is logged in as the wrong
  identity for this repo (see the `gh-auth-isolation` skill to operate as a
  specific account without switching the global default).
- **STOP** if `owner_repo` or `default_branch` cannot be resolved.
- **STOP** if the working tree has unrelated uncommitted changes you cannot
  account for — the bootstrap must land as an isolated, reviewable change.
- Confirm Copilot is enabled for the repository where checkable; the activation
  run and the requested `@copilot` review both depend on it.

### 1. Allow Actions-created PRs while keeping the default token read-only

Squad opens PRs through GitHub Actions. Enable that **without** widening the
default workflow token:

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

### 3. Install the four supported workflows — in order, dispatcher first

```bash
gh aw add \
  bradygaster/squad/workflows/squad.md@dev \
  bradygaster/squad/workflows/squad-implement-worker.md@dev \
  bradygaster/squad/workflows/squad-deps-worker.md@dev \
  bradygaster/squad/workflows/squad-review.md@dev
```

Keep `squad.md` first: `gh aw add` discovers its worker/reviewer dependencies
while compiling it, and the explicit entries confirm the full surface without
creating duplicates. The installed top-level set is exactly:

- `squad.md` + `squad.lock.yml`
- `squad-implement-worker.md` + `squad-implement-worker.lock.yml`
- `squad-deps-worker.md` + `squad-deps-worker.lock.yml`
- `squad-review.md` + `squad-review.lock.yml`

`@dev` is intentional — it tracks the branch where new modes and fixes land first.

### 4. Review the first-install safe-update report — approve ONLY the documented entries

On a clean repo, `gh aw add` reports these expected safe updates and **nothing else**:

<!-- allowlist-start -->
- Restricted secrets: **`SQUAD_GITHUB_APP_PRIVATE_KEY`** and **`SQUAD_GITHUB_TOKEN`**
- Action: **`bradygaster/squad/.github/actions/squad-init`**
<!-- allowlist-end -->

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
gh aw compile --strict
```

This must run after any first-install approval and before committing. Success
criteria:

- All four workflows compile successfully.
- The **only** permitted warning is the known `squad.md` bot-trigger warning: it
  configures both slash-command and `github-actions[bot]` triggers, and the bot
  trigger is required for controlled worker-continuation dispatches.
- **STOP** on any error, or on **any additional warning** beyond that single
  documented one.

### 6. Require all four source/lock pairs to exist

```bash
for workflow in squad squad-implement-worker squad-deps-worker squad-review; do
  test -f ".github/workflows/${workflow}.md"      || { echo "MISSING ${workflow}.md"; exit 1; }
  test -f ".github/workflows/${workflow}.lock.yml" || { echo "MISSING ${workflow}.lock.yml"; exit 1; }
done
```

- **STOP** and rerun `gh aw compile --strict` if any `.lock.yml` is missing. Do not
  open or merge the bootstrap PR until all **eight** files exist and strict
  compilation passes.

> On Windows PowerShell, the `for`/`test -f` loop above is POSIX. Use an
> equivalent guard (e.g. `Test-Path`) or run it under Git Bash; the *logic* — all
> eight files must exist — is what matters.

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
- Make the two-PR flow explicit to the user: `/squad cast` runs **only after the
  bootstrap PR merges**. Casting analyzes the codebase and opens a **separate,
  human-reviewed Cast PR** containing the team, routing, charters, the Copilot
  agent, and `meet-the-squad.md`. If a work command (`/squad implement`,
  `/squad review`) is run before a team exists, it auto-opens that Cast PR first —
  merge it and rerun the original command; do not start a second cast.

## Examples

### ✓ Correct: runtime-resolved identity, allowlist honored, human-reviewed

```bash
owner_repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
default_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"

gh api --method PUT "repos/${owner_repo}/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

git switch -c chore/squad-gh-aw-bootstrap
gh aw add \
  bradygaster/squad/workflows/squad.md@dev \
  bradygaster/squad/workflows/squad-implement-worker.md@dev \
  bradygaster/squad/workflows/squad-deps-worker.md@dev \
  bradygaster/squad/workflows/squad-review.md@dev

# Safe-update report shows ONLY the two documented secrets + squad-init → approve once
gh aw compile --strict --approve
gh aw compile --strict           # final, no --approve; only the bot-trigger warning remains

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

# BAD: stages logs, .vscode settings, and anything else that changed
git add -A
git commit -m "add squad"
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
- ❌ **Auto-merging.** The bootstrap PR and the later Cast PR are both
  human-reviewed. `/squad cast` runs only after the bootstrap PR merges.
- ❌ **Opening the PR before all eight files exist and strict compile passes.**
