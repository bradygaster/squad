# Starting a New Project with Squad

**Try this to bootstrap a modern web app:**
```
Set up Squad for a new React + Node.js app
```

**Try this to initialize with deployment target:**
```
Initialize a team for a task management app that can run in Azure Web App PaaS
```

Start from zero: new directory, new repo, full team in under a minute. Squad analyzes your description and assembles the right specialists.

---

## 1. Create the Repo

```bash
mkdir my-app && cd my-app
git init
```

---

## 2. Install Squad

```bash
npx github:bradygaster/squad
```

```
✅ .github/agents/squad.agent.md (v0.2.0)
✅ .github/workflows/ (10 workflows)
✅ .ai-team-templates/
✅ .ai-team/skills/ (starter skills)
✅ .ai-team/ceremonies.md
✅ .gitattributes (merge=union rules)

Squad is ready.

Next steps:
  1. Open Copilot:  copilot
  2. Select Squad from the /agents list
  3. Tell it what you're building
```

---

## 3. Open Copilot and Describe Your Project

```bash
copilot
```

Select **Squad** from the `/agents` list. Squad greets you:

```
Hey Jordan, what are you building?
```

Describe the project — language, stack, what it does:

```
> I'm building a CLI tool in Go that monitors AWS costs and sends
> Slack alerts when spending exceeds thresholds.
```

---

## 4. Confirm the Team

Squad proposes a team. Names come from a fictional universe:

```
Here's your team:

🏗️  Danny    — Lead          Scope, decisions, code review
🔧  Rusty    — Backend Dev   Go, AWS SDK, infrastructure
⚛️  Linus    — Frontend Dev  CLI interface, output formatting
🧪  Basher   — Tester        Tests, edge cases, quality
📋  Scribe   — (silent)      Memory, decisions, session logs

Look right? Say yes, add someone, or change a role.
(Or just give me a task to start!)
```

You can adjust the team or skip straight to work (which is implicit confirmation):

```
> Yes. Rusty, set up the Go module and project structure.
```

Squad creates `.ai-team/` (roster, charters, histories, routing rules, casting state) and spawns Rusty:

```
🔧 Rusty — setting up Go module and project structure

Rusty is on it.
```

---

## 5. Give a Bigger Task — Parallel Fan-Out

Use the word "team" to trigger parallel work:

```
> Team, build the cost monitoring feature. We need an AWS client
> that pulls Cost Explorer data and a Slack notifier that sends
> alerts when thresholds are exceeded.
```

Squad decomposes the work and launches agents simultaneously:

```
🏗️ Danny   — reviewing requirements, defining interfaces
🔧 Rusty   — building AWS Cost Explorer client
⚛️ Linus   — building Slack notification module
🧪 Basher  — writing test cases from requirements
📋 Scribe  — logging session
```

All five agents work at the same time in separate context windows.

---

## 6. Check Decisions

After agents finish, see what they decided:

```
> Show me the decisions
```

```
### 2025-07-15: AWS Cost Explorer polling interval
**By:** Rusty
**What:** Poll every 6 hours via cron, not real-time
**Why:** Cost Explorer data updates ~3x/day, more frequent polling wastes API calls

### 2025-07-15: Slack message format
**By:** Linus
**What:** Use Block Kit for alert messages with cost breakdown table
**Why:** Rich formatting, actionable buttons for drill-down
```

Every agent reads these decisions before their next task. As the list grows, the team self-aligns.

---

## 7. Commit Your Team

```bash
git add .ai-team/ .ai-team-templates/ .github/ .gitattributes
git commit -m "Add Squad team"
```

Commit `.ai-team/` — it's your team's brain. Anyone who clones the repo gets the full team with all their accumulated knowledge.

---

## Tips

- **First session is the slowest.** Agents have no history yet. After 2–3 sessions, they know your conventions and stop asking redundant questions.
- **Agents improve over sessions.** Each agent appends what it learned to its `history.md`. By week 2, they know your file structure, naming patterns, and preferences.
- **Say "team" for parallel work.** Naming a specific agent sends work to just that agent.
- **Directives are sticky.** Say `"Always use structured logging"` and it's captured permanently in `decisions.md`.
