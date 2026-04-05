# Contributing to Squad

Squad is an open-source project built by contributors who believe in democratizing multi-agent development. Whether you're fixing a bug, adding a feature, or improving documentation, your work helps the entire community.

This guide covers everything you need to know: from setting up your local environment to opening a pull request.

## Prerequisites

Before contributing, ensure you have:

- **Node.js** ≥20.0.0
- **npm** ≥10.0.0 (for workspace support)
- **Git** with SSH agent (for package resolution)
- **gh CLI** (for GitHub integration testing)

## Monorepo Structure

Squad is an npm workspace monorepo with two packages:

```
squad/
├── packages/squad-cli/       # CLI tool (@bradygaster/squad-cli)
├── packages/squad-sdk/       # Runtime SDK (@bradygaster/squad-sdk)
├── src/                      # Legacy CLI code (migrating to packages/)
├── dist/                     # Compiled output
├── .squad/                   # Team state and agent history
├── docs/                     # Documentation and proposals
└── test-fixtures/            # Test data
```

### Package Independence

- **squad-sdk**: Core runtime, agent orchestration, tool registry. No CLI dependencies.
- **squad-cli**: Command-line interface. Depends on squad-sdk.

Each package has independent versioning via changesets. A change to squad-sdk may bump only squad-sdk; a change to CLI bumps only squad-cli.

## Getting Started

### 1. Clone and Install

**Step 1: Fork the repo on GitHub**

Go to [github.com/bradygaster/squad](https://github.com/bradygaster/squad) and click "Fork" to create your own copy.

**Step 2: Clone your fork**

```bash
git clone git@github.com:{yourusername}/squad.git
cd squad
```

**Step 3: Add upstream remote**

```bash
git remote add upstream git@github.com:bradygaster/squad.git
```

**Step 4: Fetch the dev branch**

```bash
git fetch upstream dev
```

**Step 5: Install dependencies**

```bash
npm install
```

npm workspaces automatically links local packages. `@bradygaster/squad-cli` can import from `@bradygaster/squad-sdk` without publishing.

### 2. Build

```bash
# Compile TypeScript to dist/
npm run build

# Build + bundle CLI (includes esbuild)
npm run build:cli

# Watch mode (auto-recompile on changes)
npm run dev
```

### 3. Test

```bash
# Run all tests (Vitest)
npm test

# Watch mode
npm run test:watch
```

### 4. Lint

```bash
# Type check only (no emit)
npm run lint
```

### 5. Keeping Your Fork in Sync

Before opening or updating a PR, rebase your branch on the latest upstream dev:

```bash
git fetch upstream
git rebase upstream/dev
git push origin your-branch --force-with-lease
```

Always rebase before opening or updating a PR to ensure your changes are based on the latest integration branch.

## Development Workflow

### Creating a Feature Branch

Follow the branch naming convention from `.squad/decisions.md`:

```bash
# For user-facing work, use user_name/issue-number-slug format
git checkout -b bradygaster/217-readme-help-update
# or
git checkout -b keaton/210-resolution-api

# For team-internal work, use agent_name/issue-number-slug
git checkout -b mcmanus/documentation
git checkout -b edie/refactor-router
```

### Before Committing

1. **Compile:** `npm run build` (or `npm run dev` watch mode)
2. **Test:** `npm test`
3. **Type check:** `npm run lint`

All checks must pass before commit.

### Commit Message Format

Keep messages clear and concise. Reference the issue number:

```
Brief description of change

Longer explanation if needed. Reference #210, #217, etc.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

The Co-authored-by trailer is **required** for all commits (added by Copilot CLI).

### Pull Request Process

1. Add a changeset: `changeset add` (required before PR — see Changesets section)
2. Push your branch: `git push origin {yourusername}/217-readme-help-update`
3. Create a PR with explicit base and head: `gh pr create --base dev --repo bradygaster/squad --head {yourusername}:your-branch`
4. Link the issue: Add `Closes #217` to PR description
5. Wait for CI checks to pass
6. Request review from the team (agents will respond via comments)

## Code Style & Conventions

Squad follows strict TypeScript conventions:

- **Type Safety:** `strict: true`, `noUncheckedIndexedAccess: true`
- **No `@ts-ignore`** — if a type error exists, fix the code
- **ESM-only** — no CommonJS, no dual-package
- **Async/await** — use async iterators for streaming
- **Error handling:** Structured errors with `fatal()`, `error()`, `warn()`, `info()`
- **No hype in docs** — factual, substantiated claims only (tone ceiling)

## Documentation

- **README.md** — User-facing guide, quick start, architecture overview
- **CONTRIBUTING.md** — Contributor guidelines (repo root)
- **docs/proposals/** — Design docs for significant changes (required before code)
- **.squad/agents/[name]/history.md** — Agent learnings and project context

All docs in v1 are **internal only**. No public docs site until v2.

## Local Development Versioning

When developing Squad locally, set the package version to `{next-version}-preview`. For example, if the last published version is `0.8.5.1`, the local dev version should be `0.8.6-preview`.

This convention makes `squad version` show the preview tag locally, clearly indicating you're running unreleased source code, not the published npm package. The release agent will bump this to the final version at publish time, then immediately back to the next preview version for continued development.

### Making the `squad` Command Use Your Local Build

To make the `squad` CLI command globally available and pointing to your local development build:

```bash
npm run build -w packages/squad-sdk && npm run build -w packages/squad-cli
npm link -w packages/squad-cli
```

After this, `squad version` will show `0.8.6-preview` (or the current preview version). When you make code changes and rebuild, the `squad` command automatically picks up the changes—no need to reinstall. To verify your local build is active, the version output should include the `-preview` tag.

To revert back to the globally installed npm package version, run:

```bash
npm unlink -w packages/squad-cli
```

## Changesets: Independent Versioning

Squad uses [@changesets/cli](https://github.com/changesets/changesets) for independent package versioning.

### Adding a Changeset

Before your PR is merged, add a changeset describing your changes:

```bash
changeset add
```

This prompts:
1. Which packages changed? (squad-sdk, squad-cli, both)
2. What type? (patch, minor, major)
3. Brief summary of changes

Creates a file in `.changeset/` that's merged with your PR.

### Example Changeset

```markdown
---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Update help text and README for npm distribution. Add squad status command to docs.
```

### Release Workflow

The team runs changesets on the `main` branch (via GitHub Actions):

```bash
changeset publish
```

This:
1. Bumps versions in `package.json`
2. Generates `CHANGELOG.md` entries
3. Publishes to npm
4. Creates GitHub releases

You don't need to manually version — changesets handle it.

## Branch Strategy

- **main** — Stable, published releases. All merges include changesets.
- **insider** — Pre-release features, edge cases. Tag releases as `@insider`.
- **bradygaster/dev** — Integration branch. **All PRs from forks must target this branch**, not `main`.
- **user/issue-slug** — Feature branches from users or agents.

## Continuous Integration

GitHub Actions runs on every push:

1. **Build:** `npm run build` and `npm run build:cli`
2. **Test:** `npm test`
3. **Lint:** `npm run lint`
4. **Changeset status:** `npm run changeset:check` (ensures PRs include a changeset)

All checks must pass before merge.

## Common Tasks

### Add a CLI Command

1. Create the command file in `src/cli/commands/[name].js`
2. Add the route in `src/index.ts` (the `main()` function)
3. Update help text in the `--help` handler
4. Add tests in `test/cli/commands/[name].test.ts`
5. Document in README.md

### Add an SDK Export

1. Implement the feature in `src/[module]/`
2. Export from `src/index.ts`
3. Add tests
4. Document in README.md SDK section

### Migrate Legacy Code

The `src/` directory contains legacy code migrating to `packages/squad-cli/` and `packages/squad-sdk/`. When moving code:

1. Create the new file in the target package
2. Update imports in both locations
3. Ensure tests follow the file
4. Delete the old `src/` file once all references are updated
5. Document the migration in `.squad/agents/[name]/history.md`

## Key Files

- **src/index.ts** — CLI entry point and routing
- **src/resolution.ts** — Squad path resolution (repo vs. global)
- **.squad/decisions.md** — Team decisions and conventions
- **.squad/agents/[name]/charter.md** — Agent identity and expertise
- **package.json** — Workspace and script definitions

## Questions?

Open an issue or ask in `.squad/` discussion channels. The team is here to help.

## License

All contributions are MIT-licensed. By submitting a PR, you agree to this license.
