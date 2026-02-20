# Contributing to Squad

Squad is built by contributors who believe in democratizing multi-agent development. We're excited to have you join us ΓÇö and we want to make contributing as smooth as possible.

This guide covers everything you need to know: how to set up your environment, the branch model that keeps us sane, what files go where, and how to submit your work. **Pay special attention to the branch protection rules** ΓÇö we protect `main` and `preview` aggressively, and it's easier to get it right the first time.

---

## Getting Started

### Prerequisites

- **Node.js 22.0.0 or later** ΓÇö required by the `engines` field in package.json
- **Git** ΓÇö for cloning and branching
- **GitHub CLI (`gh`)** ΓÇö for interactions with Issues, PRs, and (optionally) Project Boards

### 1. Fork and Clone

```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/{your-username}/squad.git
cd squad
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Tests

```bash
npm test
# Or explicitly:
node --test test/*.test.js
```

All tests should pass. If anything fails, [open an issue](https://github.com/bradygaster/squad/issues).

---

## Branch Model

Squad uses a three-tier branch structure to protect production and staging while keeping development flexible.

```
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                                                                       Γöé
Γöé  dev ΓöÇΓöÇ Feature branches ΓöÇΓöÇΓåÆ dev ΓöÇΓöÇ (merge/rebase) ΓöÇΓöÇΓåÆ preview      Γöé
Γöé         (squad/{issue}-{slug})    Γò▓                       Γöé          Γöé
Γöé                                    ΓööΓöÇΓöÇΓåÆ Release tagged ΓöÇΓöÇΓöÇΓåÆ main     Γöé
Γöé                                                              Γöé        Γöé
Γöé  Γ£à ALL files allowed              ≡ƒÜ½ .squad/ BLOCKED     ≡ƒÜ½ BLOCKED Γöé
Γöé  (dev branch = safe sandbox)       team-docs/ BLOCKED     (except    Γöé
Γöé                                    (except blog/)          tagged    Γöé
Γöé                                                            releases) Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### Branch Purposes

| Branch | Purpose | Protection | Files Allowed |
|--------|---------|------------|---------------|
| **`dev`** | Development & integration | None | Γ£à Everything (including `.squad/`) |
| **`feature/squad/{issue}-{slug}`** | Feature work | None ΓÇö merge to dev | Γ£à Everything (including `.squad/`) |
| **`preview`** | Staging & release candidate | Guard checks for `.squad/`, `team-docs/` (except blog/) | Γ£à Most files ΓÇö see [Protected Files](#whats-protected) |
| **`main`** | Production & releases | Guard checks for `.squad/`, `team-docs/` (except blog/) | Γ£à Most files ΓÇö see [Protected Files](#whats-protected) |

### Creating a Feature Branch

Create branches from `dev` using the naming convention `squad/{issue-number}-{slug}`:

```bash
# Check out dev and get latest
git checkout dev
git pull origin dev

# Create feature branch
git checkout -b squad/42-auth-refresh
# Or for fixes without an issue:
git checkout -b squad/fix-silent-success-on-sync
```

### Merging to dev

When your work is ready, create a PR **targeting `dev`** (not `main` or `preview`). No guard checks apply to `dev` ΓÇö it's a safe sandbox for any changes.

```bash
git push origin squad/42-auth-refresh
# Then open PR on GitHub, targeting dev
```

---

## What's Protected

### ≡ƒÜ½ CRITICAL: Files Blocked from `main` and `preview`

These files are **runtime team state** and live on `dev` and feature branches. They are committed to git and flow freely between `dev` and feature branches, but the **guard workflow** (`squad-main-guard.yml`) blocks them from reaching `main` or `preview`:

| Path | Reason | Committed to `dev`? | Merged to `main`/`preview`? |
|------|--------|---------------------|---------------------------|
| **`.squad/**`** | Agent charters, routing, decisions, history, casting registry | Γ£à YES | Γ¥î NEVER ΓÇö guard blocks |
| **`team-docs/**`** | Internal team documentation, sprint plans, notes | Γ£à YES | Γ¥î NEVER ΓÇö guard blocks |

**Why?** `.squad/` contains persistent agent knowledge, routing rules, and decision history. `team-docs/` contains internal proposals, sprint plans, and working notes. Both are internal infrastructure that belongs on development branches ΓÇö not in production. The guard workflow is the enforcement mechanism, not `.gitignore`. `.squad/` is NOT in `.gitignore` ΓÇö it's a normal part of the `dev` branch. The `.npmignore` file ensures both are excluded from the published npm package. Blog posts live in `docs/blog/` and flow freely to all branches.

### Γ£à Files That Flow Freely

These files move between `dev` ΓåÆ `preview` ΓåÆ `main` with no restrictions:

- `index.js` ΓÇö CLI entry point
- `squad.agent.md` ΓÇö Squad coordinator
- `templates/` ΓÇö Agent templates
- `docs/` ΓÇö Public documentation (including `docs/blog/`)
- `test/` ΓÇö Test suite
- `.github/workflows/` ΓÇö GitHub Actions workflows
- `package.json` ΓÇö Dependencies
- `README.md`, `LICENSE` ΓÇö Project metadata
- `CHANGELOG.md` ΓÇö Release history
- `.gitignore`, `.gitattributes`, `.npmignore` ΓÇö Git configuration

---

## PR Process

### Step 1: Create Feature Branch from `dev`

```bash
git checkout dev
git pull origin dev
git checkout -b squad/123-your-feature
```

### Step 2: Make Changes, Commit, Push

```bash
# Edit files...
git add .
git commit -m "feat: add feature description"
git push origin squad/123-your-feature
```

Follow [commit message conventions](#commit-message-convention) (below).

### Step 3: Open PR Targeting `dev`

On GitHub, create a PR with:
- **Base branch:** `dev` ΓåÉ **Always target dev first**
- **Title:** Follows conventional commits (e.g., `feat: add auth refresh`, `fix: silent success bug`)
- **Description:** What changed, why, and any testing notes

### Step 4: Guard Checks (if targeting `preview` or `main`)

If you accidentally (or intentionally) target `preview` or `main`, the **guard workflow** (`squad-main-guard.yml`) runs:

```yaml
Γ£à If no forbidden files detected:
   PR checks pass, you can merge.

Γ¥î If forbidden files detected (.squad/, team-docs/ except blog/):
   Workflow fails with actionable error message.
   You must remove the files before merging.
```

### Step 5: Fixing a Blocked PR

If the guard blocks your PR because it contains `.squad/` or `team-docs/` files:

```bash
# Remove .squad/ from this PR (keeps local copies and dev branch copies safe)
git rm --cached -r .squad/

# Remove team-docs/ from this PR
git rm --cached -r team-docs/

# Commit and push
git commit -m "chore: remove internal team files from PR"
git push
```

The workflow will re-run and pass. Your local `.squad/` and `team-docs/` files remain untouched, and they continue to exist on `dev` normally.

---

## Running Tests

Squad uses Node's built-in test runner. No external dependencies.

```bash
# Run all tests
npm test

# Or explicitly:
node --test test/*.test.js
```

Tests should pass before you open a PR. If a test fails, check if it's related to your changes. If you're fixing a known failing test as part of your work, that's fine ΓÇö but don't introduce new failures.

---

## Commit Message Convention

Squad follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **`feat`** ΓÇö New feature
- **`fix`** ΓÇö Bug fix
- **`docs`** ΓÇö Documentation changes (README, guides, etc.)
- **`ci`** ΓÇö CI/CD changes (workflows, actions)
- **`chore`** ΓÇö Maintenance, dependencies, build changes
- **`refactor`** ΓÇö Code restructuring without behavior change
- **`test`** ΓÇö Adding or fixing tests

### Examples

```bash
git commit -m "feat: add history summarization for agents"
git commit -m "fix: silent success on async spawn"
git commit -m "docs: clarify branch protection in CONTRIBUTING.md"
git commit -m "chore: upgrade node engine requirement to 22.0.0"
git commit -m "ci: add PR guard workflow"
```

Scope is optional but helpful for clarity:

```bash
git commit -m "feat(spawn): parallel agent launch"
git commit -m "fix(history): truncate at 12K tokens"
```

---

## Code Style

Squad doesn't use a linter. Keep it consistent with the existing codebase:

- **Indentation:** 2 spaces (see `index.js`, `squad.agent.md`)
- **Naming:** camelCase for variables/functions, UPPER_CASE for constants
- **Strings:** Single quotes preferred (consistent with Node style)
- **Comments:** Only where logic needs clarification, not for obvious code
- **Functions:** Descriptive names; if it needs a comment to explain, rename it

### Example

```javascript
// Γ£à Good
const calculateContextUsage = (agentCount, decisionSize) => {
  return Math.min(agentCount * 45000, 200000 - decisionSize);
};

// Γ¥î Avoid
const calc = (a, b) => Math.min(a * 45000, 200000 - b); // calc context
```

---

## Labels

Squad uses a structured label system to organize work. When you open a PR or issue, use these namespaces:

| Label | Purpose | Examples |
|-------|---------|----------|
| **`squad:{name}`** | Assigned to a team member | `squad:Keaton`, `squad:Hockney` |
| **`type:*`** | Work category | `type:feature`, `type:bug`, `type:refactor`, `type:docs` |
| **`priority:*`** | Urgency | `priority:critical`, `priority:high`, `priority:low` |
| **`status:*`** | Progress | `status:blocked`, `status:in-progress`, `status:ready` |
| **`go:*`** | Release target | `go:v0.4.1`, `go:v0.5.0` |
| **`release:*`** | Release metadata | `release:major`, `release:minor`, `release:patch` |

You don't need to add these yourself ΓÇö the Lead will triage and label issues. But knowing the taxonomy helps you understand what's happening.

---

## What Files Go Where: Quick Reference

```
squad/
Γö£ΓöÇΓöÇ .squad/                    Γ£à Committed on dev & feature branches
Γöé   Γö£ΓöÇΓöÇ agents/                ≡ƒÜ½ Guard blocks from main/preview
Γöé   Γöé   Γö£ΓöÇΓöÇ {name}/charter.md  ≡ƒÜ½ Guard blocks from main/preview
Γöé   Γöé   ΓööΓöÇΓöÇ {name}/history.md  ≡ƒÜ½ Guard blocks from main/preview
Γöé   Γö£ΓöÇΓöÇ team.md                ≡ƒÜ½ Guard blocks from main/preview
Γöé   Γö£ΓöÇΓöÇ routing.md             ≡ƒÜ½ Guard blocks from main/preview
Γöé   Γö£ΓöÇΓöÇ decisions.md           ≡ƒÜ½ Guard blocks from main/preview
Γöé   ΓööΓöÇΓöÇ ...
Γöé
Γö£ΓöÇΓöÇ team-docs/                 ≡ƒÜ½ Guard blocks from main/preview (except blog/)
Γöé   Γö£ΓöÇΓöÇ sprint-plan.md         ≡ƒÜ½ Guard blocks from main/preview
Γöé   Γö£ΓöÇΓöÇ roadmap.md             ≡ƒÜ½ Guard blocks from main/preview
Γöé   ΓööΓöÇΓöÇ blog/                  Γ£à ALLOWED (public content)
Γöé       ΓööΓöÇΓöÇ 001-launch.md      Γ£à ALLOWED
Γöé
Γö£ΓöÇΓöÇ index.js                   Γ£à Flows freely
Γö£ΓöÇΓöÇ squad.agent.md             Γ£à Flows freely
Γö£ΓöÇΓöÇ README.md                  Γ£à Flows freely
Γö£ΓöÇΓöÇ CONTRIBUTING.md            Γ£à Flows freely (this file)
Γö£ΓöÇΓöÇ CHANGELOG.md               Γ£à Flows freely
Γö£ΓöÇΓöÇ package.json               Γ£à Flows freely
Γö£ΓöÇΓöÇ LICENSE                    Γ£à Flows freely
Γöé
Γö£ΓöÇΓöÇ docs/                      Γ£à Flows freely
Γöé   Γö£ΓöÇΓöÇ community.md           Γ£à Flows freely
Γöé   Γö£ΓöÇΓöÇ features/              Γ£à Flows freely
Γöé   ΓööΓöÇΓöÇ scenarios/             Γ£à Flows freely
Γöé
Γö£ΓöÇΓöÇ templates/                 Γ£à Flows freely
Γö£ΓöÇΓöÇ test/                      Γ£à Flows freely
Γö£ΓöÇΓöÇ .github/workflows/         Γ£à Flows freely
Γöé   ΓööΓöÇΓöÇ squad-main-guard.yml   Γ£à Flows freely
Γöé
Γö£ΓöÇΓöÇ .gitignore                 Γ£à Flows freely
Γö£ΓöÇΓöÇ .gitattributes             Γ£à Flows freely
ΓööΓöÇΓöÇ .npmignore                 Γ£à Flows freely
```

---

## How the Guard Works

When you open a PR to `main` or `preview`, the workflow `.github/workflows/squad-main-guard.yml` automatically runs. It:

1. **Fetches all files changed in your PR** (paginated for large PRs)
2. **Checks each file against forbidden path rules:**
   - If filename starts with `.squad/` ΓåÆ BLOCKED
   - If filename starts with `team-docs/` ΓåÆ BLOCKED
   - Otherwise ΓåÆ ALLOWED
3. **Reports results:**
   - Γ£à **Pass:** "No forbidden paths found" ΓÇö you're good to merge
   - Γ¥î **Fail:** Lists forbidden files and shows `git rm --cached` fix

The guard is **not a suggestion** ΓÇö it's a hard stop. This is the primary enforcement mechanism that keeps `.squad/` and internal `team-docs/` off `main` and `preview`. But it's easy to fix if it blocks you (see [Fixing a Blocked PR](#fixing-a-blocked-pr)).

---

## FAQ

### Q: I accidentally committed `.squad/` to my feature branch. Do I have to delete it?

**A:** Nope ΓÇö `.squad/` files are **supposed** to be committed on `dev` and feature branches! They're part of the normal development workflow. The guard workflow (`squad-main-guard.yml`) prevents them from reaching `main` or `preview`. Just don't PR them to those branches.

If you're creating a PR to `main` or `preview` and the guard blocks it, remove the files from that PR only:

```bash
git rm --cached -r .squad/  # Untrack from this PR
git commit -m "chore: remove .squad/ from release PR"
git push
```

### Q: Can I PR to `main` directly?

**A:** Technically yes, but don't. Always target `dev` first. Releases flow dev ΓåÆ preview ΓåÆ main via controlled releases, not ad-hoc PRs. This keeps `main` a stable mirror of what's deployed.

### Q: The guard blocked my PR. What now?

**A:** Your PR targets `main` or `preview` and contains `.squad/` or `team-docs/` files. These files live on `dev` and feature branches but must not reach production. Follow [Fixing a Blocked PR](#fixing-a-blocked-pr) ΓÇö it's three `git rm --cached` commands and a push. The workflow will re-run and pass.

### Q: I want to commit `team-docs/sprint-plan.md` ΓÇö can I do that?

**A:** Not to `main` or `preview` ΓÇö it's internal. Commit it to `dev` and feature branches, and the guard will block it if you accidentally PR it to `main`. If it's public content (blog, guides, etc.), put it in `docs/blog/` and it flows freely.

### Q: What if I disagree with the branch protection?

**A:** [Open a discussion](https://github.com/bradygaster/squad/discussions). These rules exist because `.ai-team/` leaking to `main` has bitten us. But design decisions are made by consensus.

---

## Insider Program

Interested in cutting-edge builds? See [CONTRIBUTORS.md](CONTRIBUTORS.md#insider-program) for the Insider Program ΓÇö early access to development builds and a chance to shape Squad's future.

---

## Need Help?

- **Issues & Bugs:** [Open an issue](https://github.com/bradygaster/squad/issues)
- **Questions & Discussions:** [GitHub Discussions](https://github.com/bradygaster/squad/discussions)
- **Security Issues:** Report privately via [GitHub Security Advisory](https://github.com/bradygaster/squad/security/advisories)

Welcome aboard. Make Squad better. ≡ƒÜÇ

---

## Summary: What You Need to Know

1. **Clone from `dev`, create `squad/{issue}-{slug}` branch, PR back to `dev`**
2. **`.squad/` files are committed on `dev` and feature branches ΓÇö the guard workflow blocks them from `main`/`preview`**
3. **Run `npm test` before pushing**
4. **Follow conventional commits (feat:, fix:, docs:, etc.)**
5. **If the guard blocks your PR to `main`/`preview`, run `git rm --cached` and push again**

That's it. Happy contributing.
