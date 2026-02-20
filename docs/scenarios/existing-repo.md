# Adding Squad to an Existing Repo

**Try this to initialize Squad on your project:**
```
This is a SaaS app with React frontend, Node.js API, and PostgreSQL — set up Squad
```

**Try this to get an architecture overview:**
```
Team, review the codebase and tell me what you find
```

**Try this to establish coding standards:**
```
We always use Zod for API validation and Prisma for database queries
```

Squad discovers your existing project — stack, patterns, conventions — and proposes a team that fits. Agents explore the codebase first, then start working with full context.

---

## 1. Install Squad

You have a project with code, conventions, and history. Squad discovers what's already there.

Navigate to your existing repo and run:

```bash
cd ~/projects/my-saas-app
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
  2. Select Squad from the /agent list (CLI) or /agents (VS Code)
  3. Tell it what you're building
```

If you already have a `.gitattributes` file, Squad appends `merge=union` rules for append-only team state files. Your existing rules are untouched.

---

## 2. Open Copilot and Describe What Exists

```bash
copilot
```

Select **Squad** from the `/agent` list (CLI) or `/agents` (VS Code). When Squad asks what you're building, describe the project as it exists today:

```
> This is a SaaS invoicing app. React frontend, Node.js/Express API,
> PostgreSQL database. We use TypeScript everywhere, Jest for testing,
> and Prisma as the ORM. The app has been in production for 8 months.
```

Squad proposes a team based on your stack:

```
Here's your team:

🏗️  Neo      — Lead          Scope, decisions, code review
⚛️  Trinity  — Frontend Dev  React, TypeScript, UI
🔧  Morpheus — Backend Dev   Node.js, Express, Prisma, PostgreSQL
🧪  Tank     — Tester        Jest, integration tests, edge cases
📋  Scribe   — (silent)      Memory, decisions, session logs

Look right? Say yes, add someone, or change a role.
```

---

## 3. Let the Team Explore First

Before giving implementation tasks, let agents discover your codebase:

```
> Team, review the codebase and tell me what you find.
```

Agents explore in parallel — each from their own perspective:

```
🏗️ Neo — reviewing architecture and project structure
⚛️ Trinity — exploring frontend: components, routing, state management
🔧 Morpheus — exploring backend: API routes, models, middleware
🧪 Tank — reviewing test suite: coverage, patterns, fixtures
📋 Scribe — logging findings
```

Results come back labeled by agent:

```
🏗️ Neo — Architecture overview:
   Monorepo with /client and /server directories.
   12 API routes, 34 React components, 89 tests.
   Prisma schema has 8 models. Auth uses passport-jwt.

⚛️ Trinity — Frontend findings:
   React 18 with React Router v6. State via Zustand.
   Component pattern: each in its own directory with index.tsx,
   styles.module.css, and ComponentName.test.tsx.

🔧 Morpheus — Backend findings:
   Express with middleware chain: auth → validate → handler.
   All routes in /server/routes/, each file exports a router.
   Prisma client instantiated in /server/lib/prisma.ts.

🧪 Tank — Test suite review:
   89 tests across 23 files. Jest with ts-jest preset.
   ~72% coverage. No integration tests for the payment flow.
   Test fixtures in /server/test/fixtures/.
```

These findings are written to each agent's `history.md`. From now on, agents know your project structure, patterns, and conventions.

---

## 4. Give Context About Conventions

Feed agents information they can't discover from code alone:

```
> We always use Zod for API validation. Never use any/unknown casts
> in TypeScript. All database queries go through Prisma — no raw SQL.
> The payment integration with Stripe is fragile, be careful around it.
```

```
📌 Captured. 4 directives added to decisions.md:
   - Zod for all API validation
   - No any/unknown casts in TypeScript
   - All queries through Prisma, no raw SQL
   - Stripe payment integration is fragile — handle with care
```

These directives persist across every future session. Every agent reads them before working.

---

## 5. Start Working

Now give a real task:

```
> Morpheus, add a recurring invoices feature to the API.
> We need a cron job that generates invoices from recurring templates.
```

```
🔧 Morpheus — building recurring invoices feature

Morpheus is reading existing invoice models and API patterns
before starting implementation.
```

Because Morpheus already explored the codebase, he knows the Prisma schema, the router pattern, and the validation conventions. No guessing.

---

## 6. Commit Your Team

```bash
git add .ai-team/ .ai-team-templates/ .github/ .gitattributes
git commit -m "Add Squad team"
```

---

## Tips

- **Explore first, build second.** On an existing repo, the initial codebase review pays for itself immediately. Agents make fewer mistakes when they know what's already there.
- **Share your conventions.** Agents can discover file structure from code, but they can't discover your team norms. Tell them: naming conventions, banned patterns, areas of tech debt.
- **Mention fragile areas.** If a module is known to be brittle, say so. Agents will be more cautious and add extra test coverage around it.
- **Existing `.gitattributes` is safe.** Squad only appends `merge=union` rules. Your existing rules are preserved.
- **History accumulates fast.** After the exploration task, agents already have useful context. After 2–3 real tasks, they're significantly better than cold-start agents.
