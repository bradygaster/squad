# Quick start

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Your first 5 minutes with Squad. Prove it works before you learn anything.

---

## Prerequisites

- **Node.js 20+** — Check with `node --version`
- **Git repository** — New or existing

---

## Install

```bash
npm install --save-dev @bradygaster/squad-cli
```

Then initialize:

```bash
npx squad init
```

You'll see:

```
✅ Squad installed.
   .github/agents/squad.agent.md — coordinator agent
   .squad/templates/ — 11 template files

Open GitHub Copilot and select Squad from the agent list.
```

---

## Validate

Check that Squad created your team directory:

```bash
ls .squad/
```

You should see: `team.md`, `routing.md`, `decisions.md`, `agents/`, and more.

Confirm Squad is ready:

```bash
npx squad status
```

---

## Try it

Open GitHub Copilot in your terminal or VS Code. Select **Squad** from the agent list (`/agent Squad` in CLI or `/agents` in VS Code).

Say something simple:

```
> I'm building a task management app with React and Node.js.
> Users can create, update, and delete tasks.
```

Squad forms your team and responds with agent names and roles. Say yes, or just give your first task:

```
> Team, create a basic Express server with a /health endpoint.
```

Squad spawns agents and does the work.

---

## What just happened?

Squad read your description, formed a team of specialists, wrote their charters to `.squad/agents/`, and coordinated parallel work. Check `.squad/decisions.md` to see what they decided.

---

## Next steps

[**Your first session**](first-session) — Step-by-step walkthrough of parallel work, decisions, and memory.
