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
| **`preview`** | Staging & release candidate | None | Γ£à All files |
| **`main`** | Production & releases | None | Γ£à All files |

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

### Team State Files

`.squad/` and `team-docs/` are **runtime team state** committed to all branches:

| Path | Reason | Committed Everywhere? |
|------|--------|----------------------|
| **`.squad/**`** | Agent charters, routing, decisions, history, casting registry | Γ£à YES |
| **`team-docs/**`** | Internal team documentation, sprint plans, notes | Γ£à YES |

**How to exclude them:** `.squad/` and `team-docs/` are not in `.gitignore` by default. If you want to keep them local and prevent accidental commits, add them to your local `.gitignore` or use `git update-index --assume-unchanged`. The `.npmignore` file ensures both are excluded from the published npm package, so they never reach users of the CLI.

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

### Step 4: PR Checks

Standard branch protection and CI checks apply. No workflow guards block specific files anymore ΓÇö you control what gets committed via `.gitignore` and your own development practices.

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
Γö£ΓöÇΓöÇ .squad/                    Γ£à Committed everywhere
Γöé   Γö£ΓöÇΓöÇ agents/
Γöé   Γöé   Γö£ΓöÇΓöÇ {name}/charter.md
Γöé   Γöé   ΓööΓöÇΓöÇ {name}/history.md
Γöé   Γö£ΓöÇΓöÇ team.md
Γöé   Γö£ΓöÇΓöÇ routing.md
Γöé   Γö£ΓöÇΓöÇ decisions.md
Γöé   ΓööΓöÇΓöÇ ...
Γöé
Γö£ΓöÇΓöÇ team-docs/                 Γ£à Committed everywhere
Γöé   Γö£ΓöÇΓöÇ sprint-plan.md
Γöé   Γö£ΓöÇΓöÇ roadmap.md
Γöé   ΓööΓöÇΓöÇ blog/                  Γ£à Public content
Γöé       ΓööΓöÇΓöÇ 001-launch.md
Γöé
Γö£ΓöÇΓöÇ index.js
Γö£ΓöÇΓöÇ squad.agent.md
Γö£ΓöÇΓöÇ README.md
Γö£ΓöÇΓöÇ CONTRIBUTING.md            (this file)
Γö£ΓöÇΓöÇ CHANGELOG.md
Γö£ΓöÇΓöÇ package.json
Γö£ΓöÇΓöÇ LICENSE
Γöé
Γö£ΓöÇΓöÇ docs/
Γöé   Γö£ΓöÇΓöÇ community.md
Γöé   Γö£ΓöÇΓöÇ features/
Γöé   ΓööΓöÇΓöÇ scenarios/
Γöé
Γö£ΓöÇΓöÇ templates/
Γö£ΓöÇΓöÇ test/
Γö£ΓöÇΓöÇ .github/workflows/
Γöé
Γö£ΓöÇΓöÇ .gitignore
Γö£ΓöÇΓöÇ .gitattributes
ΓööΓöÇΓöÇ .npmignore
```

---



---

## FAQ

### Q: I accidentally committed `.squad/` to my feature branch. Do I have to delete it?

**A:** Nope ΓÇö `.squad/` files are **supposed** to be committed on all branches! They're part of the normal development workflow. If you don't want them in your local repo, add `.squad/` to your personal `.gitignore`. Or use `git update-index --assume-unchanged .squad/` to keep them committed on the repo but not tracked locally.

### Q: Can I PR to `main` directly?

**A:** Technically yes, but don't. Always target `dev` first. Releases flow dev ΓåÆ preview ΓåÆ main via controlled releases, not ad-hoc PRs. This keeps `main` a stable mirror of what's deployed.



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
2. **`.squad/` files are committed everywhere by default. Use `.gitignore` to exclude them locally if you prefer**
3. **Run `npm test` before pushing**
4. **Follow conventional commits (feat:, fix:, docs:, etc.)**

That's it. Happy contributing.
