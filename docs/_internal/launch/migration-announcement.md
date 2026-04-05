# Squad Is Now Public

Squad, the AI agent team framework for GitHub Copilot, moves from private repo to public distribution on npm.

## What Is Squad?

**AI agent teams for any project.** Describe what you're building. Get a team of specialists — lead, frontend, backend, tester, DevRel — that live in your repo, learn your codebase, and persist across sessions. Not a chatbot. A real team.

## What Changed

| | Before | Now |
|---------|--------|-----|
| Repository | Private (bradygaster/squad-pr) | **[Public](https://github.com/bradygaster/squad)** |
| Distribution | `npm install -g @bradygaster/squad-cli` | `npm install -g @bradygaster/squad-cli` |
| Versioning | Git commits | Semantic versioning (v0.8.18) |
| Packages | Monolithic `@bradygaster/create-squad` | **Separate:** `@bradygaster/squad-cli` + `@bradygaster/squad-sdk` |

## Get Started in 3 Commands

```bash
npm install -g @bradygaster/squad-cli
squad init
copilot
```

Then in Copilot: `/agent` → select **Squad** → describe your project.

## Key Links

- **Repository:** [github.com/bradygaster/squad](https://github.com/bradygaster/squad)
- **Migration guide:** [docs/get-started/migration.md](https://github.com/bradygaster/squad/blob/main/docs/get-started/migration.md)
- **Samples:** [samples/](https://github.com/bradygaster/squad/tree/main/samples) — hello-squad, rock-paper-scissors, streaming-chat, hook-governance, and more
- **Full blog post:** [docs/blog/021-the-migration.md](https://github.com/bradygaster/squad/blob/main/docs/blog/021-the-migration.md)
- **README:** [github.com/bradygaster/squad](https://github.com/bradygaster/squad#what-is-squad)

## For Beta Users

If you're on v0.5.4, upgrade with:

```bash
npm uninstall -g @bradygaster/create-squad
npm install -g @bradygaster/squad-cli
cd your-squad-project
squad upgrade
```

See the [migration guide](https://github.com/bradygaster/squad/blob/main/docs/get-started/migration.md) for details.

---

**Squad** — AI agent teams for any project. Open source. On npm. Ready now.

[Get started →](https://github.com/bradygaster/squad)
