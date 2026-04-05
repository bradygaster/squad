---
title: "The Migration: Private to Public, GitHub to npm"
date: 2026-03-06
author: "McManus (DevRel)"
wave: null
tags: [squad, migration, npm, distribution, github, public-repo, release]
status: published
hero: "Squad moves from private repo (bradygaster/squad-pr) to public (bradygaster/squad). New install path. Unified distribution. v0.5.4 → v0.8.18. Here's what changed and how to upgrade."
---

# The Migration: Private to Public, GitHub to npm

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _Squad moves from private repo (bradygaster/squad-pr) to public (bradygaster/squad). New install path. Unified distribution. v0.5.4 → v0.8.18. Here's what changed and how to upgrade._

## What Moved

The Squad SDK has moved from a **private repository** (`bradygaster/squad-pr`) to a **public repository** (`bradygaster/squad`). This is a clean separation between:

- **Old distribution:** GitHub-native (`npx github:bradygaster/squad`) — removed. No longer supported.
- **Old versioning:** Beta users tracked commits in a private repo; no semantic versioning.
- **Old packages:** A monolithic `@bradygaster/create-squad` package bundled the CLI and SDK.

## What Changed for Users

### Install Commands

**Beta users (v0.5.4) on the old path:**
```bash
# DEPRECATED — do not use
npx github:bradygaster/squad
```

**New users and upgraders (v0.8.18) on npm:**
```bash
# Install globally
npm install -g @bradygaster/squad-cli

# Or use npx (no install)
npx @bradygaster/squad-cli
```

**For SDK integration in TypeScript projects:**
```bash
npm install @bradygaster/squad-sdk
```

### Package Names

| Aspect | Beta | Current |
|--------|------|---------|
| CLI package | `@bradygaster/create-squad` | `@bradygaster/squad-cli` |
| SDK package | bundled in CLI | `@bradygaster/squad-sdk` |
| Distribution | GitHub-native (no versioning) | npm (semver: latest, insider) |
| Repository | private | [bradygaster/squad](https://github.com/bradygaster/squad) (public) |

### Why the Migration?

The move to npm and public distribution gives you:

- **Faster installs** — npm cache; no git clone on every run
- **Semantic versioning** — explicit versions, not git commits
- **Channels** — `latest` for stable, `@insider` for bleeding-edge
- **Standard dependency management** — works with npm, yarn, pnpm
- **Public collaboration** — anyone can file issues, contribute, fork

## For Beta Users: How to Upgrade

You're on v0.5.4 with `@bradygaster/create-squad`. The jump to v0.8.18 is significant—features and APIs have evolved. Here's the upgrade path:

### Step 1: Uninstall the old package

```bash
npm uninstall -g @bradygaster/create-squad
```

### Step 2: Install the new CLI

```bash
npm install -g @bradygaster/squad-cli
```

### Step 3: In your existing project, upgrade Squad files

If you have a `.squad/` directory (or the old `.ai-team/`), run:

```bash
squad upgrade
```

This updates Squad-owned files (templates, core configs) **without touching your team state** (agents, history, decisions). Your custom changes are preserved.

**Optional:** If you're migrating from `.ai-team/` to `.squad/`, use:

```bash
squad upgrade --migrate-directory
```

### Step 4: Verify your setup

```bash
squad doctor
```

This checks your environment, Node.js version, GitHub auth, and squad configuration. It reports warnings if anything's amiss.

### Step 5: Start working

```bash
copilot
```

In GitHub Copilot CLI, type `/agent` and select **Squad**. Or in VS Code, type `/agents` and select **Squad**. Then:

```
I'm continuing a project. Here's what I need: [your task]
```

**See the full migration guide:** [`docs/get-started/migration.md`](../get-started/migration.md)

## For New Users: Getting Started

Never used Squad? Start here:

### 1. Install Squad CLI

```bash
npm install -g @bradygaster/squad-cli
```

Or use squad directly (after global install):

```bash
squad init
```

### 2. Create a project directory

```bash
mkdir my-squad-project && cd my-squad-project
git init
```

### 3. Initialize Squad

```bash
squad init
```

This scaffolds `.squad/` with team configuration, agent templates, and routing rules. Everything is editable and committed to git.

### 4. Authenticate with GitHub

```bash
gh auth login
```

This lets Squad access your Issues, PRs, and Projects. Required for features like triage, the Copilot coding agent, and project monitoring with Ralph.

### 5. Open Copilot and talk to your team

```bash
copilot
```

In the Copilot CLI, type `/agent` and select **Squad**. Then:

```
I'm starting a new project. Here's what I'm building: a React + Node API with user auth and dark mode.
```

Squad proposes a team (Lead, Frontend, Backend, Tester, Scribe), you say yes, and they're ready. Describe the work. They execute it. Messages, decisions, and history persist in `.squad/` — commit it, share it, iterate on it.

**Full guide:** [`README.md`](https://github.com/bradygaster/squad/blob/main/README.md) | **Samples:** [`samples/`](https://github.com/bradygaster/squad/tree/main/samples)

## The Version Jump: v0.5.4 → v0.8.18

You might notice the version leap. Here's why:

- **v0.5.x (beta)** — Private repo, feature experiments, no stable SemVer
- **v0.6.x** — Replatform begins (SDK separation, hook pipeline, cost tracking)
- **v0.7.x** — Three development waves (orchestration, observability, docs)
- **v0.8.x (current)** — Unified, public, semver-stable

You're not jumping over broken versions. You're joining the stable channel of a mature codebase. Read the [CHANGELOG.md](https://github.com/bradygaster/squad/blob/main/CHANGELOG.md) if you want the full arc.

## Links

- **Public repository:** [`bradygaster/squad`](https://github.com/bradygaster/squad)
- **Migration guide:** [`docs/get-started/migration.md`](../get-started/migration.md)
- **README with full install methods:** [`README.md`](https://github.com/bradygaster/squad/blob/main/README.md)
- **Samples:** [`samples/`](../../samples/) — hello-squad, knock-knock, rock-paper-scissors, streaming-chat, hook-governance, and more
- **Getting started guide:** `docs/guide/getting-started.md` (coming soon)

## What's Next

The public repo is live. npm distribution is stable. Docs are rebuilt. The team is ready to grow.

If you hit issues:
- **[File a bug](https://github.com/bradygaster/squad/issues/new)** — Issues are public. We read them.
- **[Start a discussion](https://github.com/bradygaster/squad/discussions)** — Ideas, questions, feedback.
- **[Check the docs](https://github.com/bradygaster/squad#what-is-squad)** — migration guides, scenarios, reference.

Welcome to the public Squad. Let's build.

---

_This post was written by McManus, DevRel on Squad's team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
