# Contributing to Squad

Squad is built by contributors who believe in democratizing multi-agent development. We're excited to have you join us — and we want to make contributing as smooth as possible.

This guide covers everything you need to know: how to set up your environment, the branch model that keeps us sane, what files go where, and how to submit your work. **Pay special attention to the branch protection rules** — we protect `main` and `preview` aggressively, and it's easier to get it right the first time.

---

## Getting Started

### Prerequisites

- **Node.js 22.0.0 or later** — required by the `engines` field in package.json
- **Git** — for cloning and branching
- **GitHub CLI (`gh`)** — for interactions with Issues, PRs, and (optionally) Project Boards

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
┌─────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  dev ── Feature branches ──→ dev ── (merge/rebase) ──→ preview      │
│         (squad/{issue}-{slug})    ╲                       │          │
│                                    └──→ Release tagged ───→ main     │
│                                                              │        │
│  ✅ ALL files allowed              🚫 .ai-team/ BLOCKED   🚫 BLOCKED │
│  (dev branch = safe sandbox)       team-docs/ BLOCKED     (except   │
│                                    (except blog/)          tagged    │
│                                                            releases) │
└─────────────────────────────────────────────────────────────────────┘
```

### Branch Purposes

| Branch | Purpose | Protection | Files Allowed |
|--------|---------|------------|---------------|
| **`dev`** | Development & integration | None | ✅ Everything (including `.ai-team/`) |
| **`feature/squad/{issue}-{slug}`** | Feature work | None — merge to dev | ✅ Everything (including `.ai-team/`) |
| **`preview`** | Staging & release candidate | Guard checks for `.ai-team/`, `team-docs/` (except blog/) | ✅ Most files — see [Protected Files](#whats-protected) |
| **`main`** | Production & releases | Guard checks for `.ai-team/`, `team-docs/` (except blog/) | ✅ Most files — see [Protected Files](#whats-protected) |

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

When your work is ready, create a PR **targeting `dev`** (not `main` or `preview`). No guard checks apply to `dev` — it's a safe sandbox for any changes.

```bash
git push origin squad/42-auth-refresh
# Then open PR on GitHub, targeting dev
```

---

## What's Protected

### 🚫 CRITICAL: Files Blocked from `main` and `preview`

These files are **runtime team state** and live on `dev` and feature branches. They are committed to git and flow freely between `dev` and feature branches, but the **guard workflow** (`squad-main-guard.yml`) blocks them from reaching `main` or `preview`:

| Path | Reason | Committed to `dev`? | Merged to `main`/`preview`? |
|------|--------|---------------------|---------------------------|
| **`.ai-team/**`** | Agent charters, routing, decisions, history, casting registry | ✅ YES | ❌ NEVER — guard blocks |
| **`team-docs/**`** | Internal team documentation, sprint plans, notes | ✅ YES | ❌ NEVER — guard blocks |

**Why?** `.ai-team/` contains persistent agent knowledge, routing rules, and decision history. `team-docs/` contains internal proposals, sprint plans, and working notes. Both are internal infrastructure that belongs on development branches — not in production. The guard workflow is the enforcement mechanism, not `.gitignore`. `.ai-team/` is NOT in `.gitignore` — it's a normal part of the `dev` branch. The `.npmignore` file ensures both are excluded from the published npm package. Blog posts live in `docs/blog/` and flow freely to all branches.

### ✅ Files That Flow Freely

These files move between `dev` → `preview` → `main` with no restrictions:

- `index.js` — CLI entry point
- `squad.agent.md` — Squad coordinator
- `templates/` — Agent templates
- `docs/` — Public documentation (including `docs/blog/`)
- `test/` — Test suite
- `.github/workflows/` — GitHub Actions workflows
- `package.json` — Dependencies
- `README.md`, `LICENSE` — Project metadata
- `CHANGELOG.md` — Release history
- `.gitignore`, `.gitattributes`, `.npmignore` — Git configuration

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
- **Base branch:** `dev` ← **Always target dev first**
- **Title:** Follows conventional commits (e.g., `feat: add auth refresh`, `fix: silent success bug`)
- **Description:** What changed, why, and any testing notes

### Step 4: Guard Checks (if targeting `preview` or `main`)

If you accidentally (or intentionally) target `preview` or `main`, the **guard workflow** (`squad-main-guard.yml`) runs:

```yaml
✅ If no forbidden files detected:
   PR checks pass, you can merge.

❌ If forbidden files detected (.ai-team/, team-docs/ except blog/):
   Workflow fails with actionable error message.
   You must remove the files before merging.
```

### Step 5: Fixing a Blocked PR

If the guard blocks your PR because it contains `.ai-team/` or `team-docs/` files:

```bash
# Remove .ai-team/ from this PR (keeps local copies and dev branch copies safe)
git rm --cached -r .ai-team/

# Remove team-docs/ from this PR
git rm --cached -r team-docs/

# Commit and push
git commit -m "chore: remove internal team files from PR"
git push
```

The workflow will re-run and pass. Your local `.ai-team/` and `team-docs/` files remain untouched, and they continue to exist on `dev` normally.

---

## Running Tests

Squad uses Node's built-in test runner. No external dependencies.

```bash
# Run all tests
npm test

# Or explicitly:
node --test test/*.test.js
```

Tests should pass before you open a PR. If a test fails, check if it's related to your changes. If you're fixing a known failing test as part of your work, that's fine — but don't introduce new failures.

---

## Commit Message Convention

Squad follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **`feat`** — New feature
- **`fix`** — Bug fix
- **`docs`** — Documentation changes (README, guides, etc.)
- **`ci`** — CI/CD changes (workflows, actions)
- **`chore`** — Maintenance, dependencies, build changes
- **`refactor`** — Code restructuring without behavior change
- **`test`** — Adding or fixing tests

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
// ✅ Good
const calculateContextUsage = (agentCount, decisionSize) => {
  return Math.min(agentCount * 45000, 200000 - decisionSize);
};

// ❌ Avoid
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

You don't need to add these yourself — the Lead will triage and label issues. But knowing the taxonomy helps you understand what's happening.

---

## What Files Go Where: Quick Reference

```
squad/
├── .ai-team/                  ✅ Committed on dev & feature branches
│   ├── agents/                🚫 Guard blocks from main/preview
│   │   ├── {name}/charter.md  🚫 Guard blocks from main/preview
│   │   └── {name}/history.md  🚫 Guard blocks from main/preview
│   ├── team.md                🚫 Guard blocks from main/preview
│   ├── routing.md             🚫 Guard blocks from main/preview
│   ├── decisions.md           🚫 Guard blocks from main/preview
│   └── ...
│
├── team-docs/                 🚫 Guard blocks from main/preview (except blog/)
│   ├── sprint-plan.md         🚫 Guard blocks from main/preview
│   ├── roadmap.md             🚫 Guard blocks from main/preview
│   └── blog/                  ✅ ALLOWED (public content)
│       └── 001-launch.md      ✅ ALLOWED
│
├── index.js                   ✅ Flows freely
├── squad.agent.md             ✅ Flows freely
├── README.md                  ✅ Flows freely
├── CONTRIBUTING.md            ✅ Flows freely (this file)
├── CHANGELOG.md               ✅ Flows freely
├── package.json               ✅ Flows freely
├── LICENSE                    ✅ Flows freely
│
├── docs/                      ✅ Flows freely
│   ├── community.md           ✅ Flows freely
│   ├── features/              ✅ Flows freely
│   └── scenarios/             ✅ Flows freely
│
├── templates/                 ✅ Flows freely
├── test/                      ✅ Flows freely
├── .github/workflows/         ✅ Flows freely
│   └── squad-main-guard.yml   ✅ Flows freely
│
├── .gitignore                 ✅ Flows freely
├── .gitattributes             ✅ Flows freely
└── .npmignore                 ✅ Flows freely
```

---

## How the Guard Works

When you open a PR to `main` or `preview`, the workflow `.github/workflows/squad-main-guard.yml` automatically runs. It:

1. **Fetches all files changed in your PR** (paginated for large PRs)
2. **Checks each file against forbidden path rules:**
   - If filename starts with `.ai-team/` → BLOCKED
   - If filename starts with `team-docs/` → BLOCKED
   - Otherwise → ALLOWED
3. **Reports results:**
   - ✅ **Pass:** "No forbidden paths found" — you're good to merge
   - ❌ **Fail:** Lists forbidden files and shows `git rm --cached` fix

The guard is **not a suggestion** — it's a hard stop. This is the primary enforcement mechanism that keeps `.ai-team/` and internal `team-docs/` off `main` and `preview`. But it's easy to fix if it blocks you (see [Fixing a Blocked PR](#fixing-a-blocked-pr)).

---

## FAQ

### Q: I accidentally committed `.ai-team/` to my feature branch. Do I have to delete it?

**A:** Nope — `.ai-team/` files are **supposed** to be committed on `dev` and feature branches! They're part of the normal development workflow. The guard workflow (`squad-main-guard.yml`) prevents them from reaching `main` or `preview`. Just don't PR them to those branches.

If you're creating a PR to `main` or `preview` and the guard blocks it, remove the files from that PR only:

```bash
git rm --cached -r .ai-team/  # Untrack from this PR
git commit -m "chore: remove .ai-team/ from release PR"
git push
```

### Q: Can I PR to `main` directly?

**A:** Technically yes, but don't. Always target `dev` first. Releases flow dev → preview → main via controlled releases, not ad-hoc PRs. This keeps `main` a stable mirror of what's deployed.

### Q: The guard blocked my PR. What now?

**A:** Your PR targets `main` or `preview` and contains `.ai-team/` or `team-docs/` files. These files live on `dev` and feature branches but must not reach production. Follow [Fixing a Blocked PR](#fixing-a-blocked-pr) — it's three `git rm --cached` commands and a push. The workflow will re-run and pass.

### Q: I want to commit `team-docs/sprint-plan.md` — can I do that?

**A:** Not to `main` or `preview` — it's internal. Commit it to `dev` and feature branches, and the guard will block it if you accidentally PR it to `main`. If it's public content (blog, guides, etc.), put it in `docs/blog/` and it flows freely.

### Q: What if I disagree with the branch protection?

**A:** [Open a discussion](https://github.com/bradygaster/squad/discussions). These rules exist because `.ai-team/` leaking to `main` has bitten us. But design decisions are made by consensus.

---

## Need Help?

- **Issues & Bugs:** [Open an issue](https://github.com/bradygaster/squad/issues)
- **Questions & Discussions:** [GitHub Discussions](https://github.com/bradygaster/squad/discussions)
- **Security Issues:** Report privately via [GitHub Security Advisory](https://github.com/bradygaster/squad/security/advisories)

Welcome aboard. Make Squad better. 🚀

---

## Summary: What You Need to Know

1. **Clone from `dev`, create `squad/{issue}-{slug}` branch, PR back to `dev`**
2. **`.ai-team/` files are committed on `dev` and feature branches — the guard workflow blocks them from `main`/`preview`**
3. **Run `npm test` before pushing**
4. **Follow conventional commits (feat:, fix:, docs:, etc.)**
5. **If the guard blocks your PR to `main`/`preview`, run `git rm --cached` and push again**

That's it. Happy contributing.
