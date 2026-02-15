# Adding Squad Mid-Project

> **Try this:**  
> `"This project is already in progress — catch me up on what's been built and what's in the backlog"`  
> `"We're 3 months into development — help us add Squad"`

Never too late to add Squad. Agents discover what's there, learn your patterns, and get up to speed in 2–3 sessions. No rewrite needed.

---

## 1. You're Halfway Through — Is It Too Late?

Never too late to add Squad. Agents discover what's there, learn your patterns, and get up to speed in 2–3 sessions.

No. Squad is designed for **existing codebases**. Whether you're 3 weeks in or 3 years in, agents adapt.

You don't have to start from scratch. You don't have to rewrite anything. Install Squad, let agents explore, and keep building.

---

## 2. Install Squad

```bash
cd ~/projects/halfway-done-app
npx github:bradygaster/squad
```

```
✅ .github/agents/squad.agent.md (v0.2.0)
✅ .ai-team-templates/
✅ .ai-team/skills/ (starter skills)
✅ .ai-team/ceremonies.md
✅ .gitattributes (merge=union rules)

Squad is ready.
```

---

## 3. Open Copilot and Describe What Exists

```bash
copilot
```

Select **Squad** from `/agents`. Describe the project **as it is today**, not as you originally planned it:

```
> This is an e-commerce platform. We're 4 months into development.
> React frontend, Django backend, PostgreSQL database.
> We've built user auth, product catalog, and shopping cart.
> We're halfway through the checkout flow.
```

Squad proposes a team:

```
Here's your team:

🏗️  Michael — Lead          Scope, decisions, code review
⚛️  Fredo   — Frontend Dev  React, UI components
🔧  Sonny   — Backend Dev   Django, PostgreSQL, APIs
🧪  Tom     — Tester        Tests, edge cases
📋  Scribe  — (silent)      Memory, decisions, session logs

Look right?
```

---

## 4. Let Agents Explore What's Already There

Before giving new tasks, let agents discover the codebase:

```
> Team, review the codebase and tell me what you find.
```

Agents explore in parallel:

```
🏗️ Michael — reviewing overall architecture
⚛️ Fredo   — exploring frontend structure and component patterns
🔧 Sonny   — exploring backend: models, views, API endpoints
🧪 Tom     — reviewing test suite and coverage
```

Results come back:

```
🏗️ Michael — Architecture overview:
   Monorepo with /frontend and /backend directories.
   React 18 with TypeScript, Django 4.2 with DRF.
   15 API endpoints, 47 React components, 123 tests (~68% coverage).
   Auth uses JWT tokens via djangorestframework-simplejwt.

⚛️ Fredo — Frontend findings:
   Component structure: /components/{domain}/{ComponentName}/
   State management: React Context (no Redux or Zustand).
   Each component has a .tsx, .module.css, and .test.tsx.
   Shopping cart state is in CartContext.tsx.

🔧 Sonny — Backend findings:
   Django apps: users, products, cart, orders (checkout is incomplete).
   Models use Django ORM, migrations in /backend/migrations/.
   API uses DRF viewsets with token auth.
   Incomplete: order creation, payment integration.

🧪 Tom — Test suite:
   Jest for frontend (87 tests), pytest for backend (36 tests).
   Missing: checkout flow tests, payment mocking.
   Coverage gaps in the cart and orders apps.
```

These findings are written to agent histories. Agents now know your project structure.

---

## 5. Feed Conventions and Decisions You've Already Made

Agents discovered the code structure, but they don't know **why** you made certain choices:

```
> Here are conventions we've established:
> - All API endpoints use DRF viewsets, no function-based views.
> - Frontend components are grouped by domain (user, product, cart, checkout).
> - We use Zod for form validation on the frontend.
> - All database changes go through Django migrations, no raw SQL.
> - Payment integration will use Stripe (not implemented yet).
```

```
📋 Scribe — logged 5 directives

These conventions are now in decisions.md. All agents will follow them.
```

---

## 6. Agents Learn Fast — 2-3 Sessions

After the initial exploration and 2–3 real tasks, agents are up to speed:

- **Session 1:** Exploration — agents map the codebase
- **Session 2:** First task — agents implement a feature, learn your patterns
- **Session 3:** Second task — agents already know the structure, make fewer mistakes

By session 3, agents are making decisions that align with your existing code style without you having to explain.

---

## 7. Start with a Real Task

Now give a task:

```
> Sonny, finish the checkout flow. We need an order creation endpoint
> that validates the cart, calculates total, and saves the order to
> the database. No payment integration yet.
```

```
🔧 Sonny — building order creation endpoint

Sonny is reading existing cart and product models before starting.
```

Sonny knows:
- The Django app structure (from exploration)
- The ORM patterns (from exploration)
- The DRF viewset convention (from your directives)

No guessing. He builds it correctly on the first try.

---

## 8. Use the Lead to Review What's Already There

If you're unsure about code quality in the existing codebase:

```
> Michael, review the cart app. Are there issues I should know about?
```

```
🏗️ Michael — reviewing cart app

Issues found:
  - CartItem model doesn't enforce quantity > 0
  - add_to_cart view doesn't check if product is in stock
  - Cart total calculation isn't atomic — race condition risk

Recommendations:
  - Add model-level validation for quantity
  - Add stock check in add_to_cart view
  - Use database transactions for cart operations
```

Michael just gave you a code review of code **you already wrote**. Now you can fix it or add it to the backlog.

---

## 9. Sample Prompts for Mid-Project Onboarding

**Initial exploration:**

```
> Team, explore the codebase. We're 4 months in, so there's a lot here.
> Focus on understanding the architecture, conventions, and what's complete.
```

**Feed existing conventions:**

```
> We have conventions I need to tell you about. All components use
> TypeScript strict mode. All API calls go through the apiClient
> utility in /frontend/lib/api.ts. Never use any or unknown types.
```

**Identify technical debt:**

```
> Michael, review the codebase and identify areas of technical debt
> or code that needs refactoring.
```

**Continue unfinished work:**

```
> Sonny, the previous developer started the payment integration but
> didn't finish. Review /backend/payments/ and tell me what's missing.
```

**Backfill tests:**

```
> Tom, we're at 68% test coverage. Review the codebase and identify
> the highest-risk areas that need tests.
```

---

## Tips

- **Start with exploration, not implementation.** Let agents map the codebase before giving tasks. They'll make fewer mistakes.
- **Feed conventions explicitly.** Agents can discover file structure, but they can't discover team norms. Tell them: "We always X," "We never Y."
- **Use the Lead to audit existing code.** Michael can review code that was written before Squad was added.
- **Skills accumulate fast.** After 2–3 sessions, agents know your patterns. By session 5, they're as good as a developer who's been on the project for weeks.
- **Never too late.** Squad works on 3-week projects and 3-year projects. Agents adapt to what's there.
