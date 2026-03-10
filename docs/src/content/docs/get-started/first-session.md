# Your First Session

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


A step-by-step walkthrough from install to parallel fan-out. Follow along in your terminal.

---

## Try this:

```bash
mkdir my-app && cd my-app && git init
squad
```

Then tell your team what you're building.

---

## 1. Install Squad

Start with a git repo — new or existing:

```bash
mkdir my-app && cd my-app
git init
squad
```

You'll see:

```
✅ Squad installed.
   .github/agents/squad.agent.md — coordinator agent
   .squad/templates/ — 11 template files

Open GitHub Copilot and select Squad from the agent list.
```

---

## 2. Open Copilot — Your Team Forms

Start the Copilot CLI:

```bash
copilot
```

Select **Squad** from the `/agent` list (CLI) or `/agents` (VS Code). Squad greets you by name (pulled from `git config user.name`):

```
Hey Brady, what are you building?
```

Describe your project:

```
> I'm building a recipe sharing app with React and Node.js. Users can
> post recipes, search by ingredient, and save favorites.
```

Squad proposes a team. Names come from a fictional universe — the exact universe depends on your project shape and history:

```
Here's your team:

🏗️  Hicks    — Lead          Scope, decisions, code review
⚛️  Ripley   — Frontend Dev  React, UI, components
🔧  Dallas   — Backend Dev   Node.js, APIs, database
🧪  Lambert  — Tester        Tests, quality, edge cases
📋  Scribe   — (silent)      Memory, decisions, session logs

Look right? Say yes, add someone, or change a role.
(Or just give me a task to start!)
```

---

## 3. Confirm and Give Your First Task

Say "yes" or skip straight to a task (which is implicit confirmation):

```
> Yes. Dallas, set up the Express server with basic routing.
```

Squad creates the `.squad/` directory structure — team roster, routing rules, casting state, ceremony config, agent charters, and histories — all seeded with your project context.

### What's inside .squad/?

| File/Directory | Purpose |
|---|---|
| `team.md` | Team roster, roles, and member info |
| `routing.md` | Work routing rules (which agent handles what) |
| `decisions.md` | Team decisions — all agents read this before working |
| `agents/` | Each agent's charter and history (their memory) |
| `ceremonies.md` | Ceremony schedule (retrospectives, reviews, etc.) |
| `casting/` | Team formation history and casting state |
| `skills/` | Reusable capabilities agents can learn |
| `templates/` | Format reference files for docs, PRDs, charters |

**You own these files.** Edit them anytime — change roles, add routing rules, fix decisions. Squad reads them before every spawn.

**Commit `.squad/` to version control.** It's your team's brain. Anyone who clones the repo gets the team with all their knowledge.

Then it spawns Dallas:

```
🔧 Dallas — setting up Express server with routing

Dallas is on it — building the Express server now.
```

---

## 4. Parallel Fan-Out — The Launch Table

Now give a bigger task to see parallel work:

```
> Team, build the recipe listing page. We need an API endpoint
> that returns recipes and a React component that displays them.
```

Squad decomposes the work and launches agents simultaneously:

```
🏗️ Hicks   — reviewing requirements, defining API contract
⚛️ Ripley  — building RecipeList component
🔧 Dallas  — creating GET /api/recipes endpoint
🧪 Lambert — writing test cases from requirements
📋 Scribe  — logging session
```

All five agents are working at the same time in separate context windows. The tester writes test cases from the requirements *while* the implementation is being built — no waiting.

---

## 5. Results Labeled by Agent

When agents finish, you see results tagged with each agent's identity:

```
🏗️ Hicks — Defined API contract: GET /api/recipes returns
   { recipes: [{ id, title, ingredients, prepTime }] }.
   Decided on cursor-based pagination for large result sets.

⚛️ Ripley — Built RecipeList component at src/components/RecipeList.tsx.
   Uses React Query for data fetching. Card layout with title,
   prep time, and ingredient count.

🔧 Dallas — Created GET /api/recipes endpoint at src/routes/recipes.ts.
   Connected to MongoDB. Supports ?cursor= pagination per Hicks' spec.
   Also added GET /api/recipes/:id for detail view (proactive).

🧪 Lambert — Wrote 8 test cases in test/recipes.test.ts:
   📌 Proactive: Written from requirements while Dallas was building.
   May need adjustment once implementation is final.
   - List returns paginated results
   - Empty database returns empty array
   - Invalid cursor returns 400
   - Detail endpoint returns 404 for missing recipe
   [+4 more]
```

Behind the scenes, the Scribe merged decisions from each agent into `decisions.md` and logged the session.

---

## 6. Ask "Where Are We?" — Instant Status

At any point, check status:

```
> Where are we?
```

This is a Direct mode response — no agent spawn, just the coordinator reading recent logs:

```
Last session: Recipe listing page (15 minutes ago)

Who worked:
- Hicks defined the API contract (cursor pagination)
- Ripley built RecipeList component
- Dallas created recipes endpoint + detail endpoint
- Lambert wrote 8 test cases

Key decisions:
- Cursor-based pagination for recipe lists
- React Query for frontend data fetching
- MongoDB as database

3 decisions in decisions.md, 4 agent history entries updated.
```

---

## 7. Follow-Up — Watch Decisions Accumulate

Give a follow-up task:

```
> Now add a search feature. Users should be able to search
> recipes by ingredient name.
```

Squad fans out again:

```
🔧 Dallas  — adding search endpoint with ingredient filtering
⚛️ Ripley  — building search UI with ingredient input
🧪 Lambert — writing search test cases
📋 Scribe  — logging session
```

After completion, check decisions:

```
> Show me the decisions
```

```
### 2025-07-15: Cursor-based pagination for recipe lists
**By:** Hicks
**What:** All list endpoints use cursor-based pagination
**Why:** Scales better than offset pagination for growing datasets

### 2025-07-15: React Query for data fetching
**By:** Ripley
**What:** All API calls use React Query with stale-while-revalidate
**Why:** Built-in caching, refetching, and loading states

### 2025-07-15: Full-text search via MongoDB text index
**By:** Dallas
**What:** Search uses $text index on recipe title and ingredients array
**Why:** Native MongoDB capability, no external search service needed
```

Every agent reads these decisions before working. As the list grows, the team self-aligns — agents respect each other's architectural choices without you repeating them.

---

## 8. Set a Directive

You notice something you want to standardize:

```
> Always use Zod for API input validation
```

Squad captures it — no agent spawn needed:

```
📌 Captured. All API input validation must use Zod.
```

This gets written to `decisions.md`. Every agent will see it in their next spawn.

---

## 9. Export Your Squad

After a productive session, export your team for portability:

```bash
squad export
```

```
✅ Exported to squad-export.json
   5 agents, 3 skills, 6 decisions
```

This snapshot contains everything — charters, histories, casting state, skills, and decisions. Import into another repo anytime:

```bash
cd ../other-project
squad
squad import ../my-app/squad-export.json
```

---

## Tips

- **First session is the slowest.** Agents have no history yet. After 2–3 sessions, they know your conventions and stop asking repeated questions.
- **Commit `.squad/`.** It's your team's brain. Anyone who clones the repo gets the team with all their knowledge.
- **Say "team" for big tasks.** The word "team" triggers parallel fan-out across multiple agents.
- **Name an agent for focused work.** `"Dallas, fix the login bug"` sends work to one specific agent.
- **Directives are sticky.** Once captured, they persist across all future sessions.

---

## What to Try Next

- [**Your Team**](../concepts/your-team.md) — How agents form, specialize, and collaborate
- [**Memory & Knowledge**](../concepts/memory-and-knowledge.md) — Decisions, skills, and persistent context
- [**Existing Repo Scenario**](../scenarios/existing-repo.md) — Bring Squad into a project that's already in flight
