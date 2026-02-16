# Squad on Large Codebases

**Try this to understand before changing:**
```
This is a 200k line codebase — help me understand the architecture before we start making changes
```

**Try this to set up domain routing:**
```
Route all payment code work to the specialist who knows that domain
```

Squad handles scale: each agent gets their own 200K context window, routing ensures only the right agent looks at relevant code. No loading everything — just what's needed.

---

## 1. The Scale Problem

How Squad handles scale. Agents work in their own 200K context windows. Routing ensures only the right agent looks at code.

Large codebases overwhelm most AI tools:

- **500K+ lines of code** — can't fit in a single context window
- **Hundreds of files** — loading everything is slow and expensive
- **Deep module trees** — agents get lost in the structure
- **Multiple services** — monorepos with 10+ services

Squad doesn't try to load everything. Instead, **each agent gets its own 200K token context window**, and **routing ensures only the right agent works on relevant code**.

---

## 2. Each Agent Has Its Own Context Window

When you give a task:

```
> Team, add a payment processing feature.
```

Squad spawns multiple agents **in parallel**, each with their own context:

```
🏗️ Neo      — 200K token context (reviewing architecture)
⚛️ Trinity  — 200K token context (exploring frontend payment UI)
🔧 Morpheus — 200K token context (building backend payment API)
🧪 Tank     — 200K token context (writing payment tests)
```

**Each agent's context is isolated.** Trinity doesn't load backend code. Morpheus doesn't load frontend components. They only read what's relevant to their task.

Your **codebase size doesn't matter** — agents aren't loading all 500K lines.

---

## 3. Routing Directs Work to the Right Agent

Routing rules in `.ai-team/routing.md` keep agents focused:

```markdown
# Routing Rules

**Frontend changes** → Trinity
**Backend API work** → Morpheus
**Database migrations** → Morpheus
**UI component changes** → Trinity
**Test writing** → Tank
**Architecture decisions** → Neo
```

When you say:

```
> Fix the checkout button styling
```

The coordinator routes to Trinity. **Only Trinity** looks at frontend code. Morpheus and Tank don't load any of it.

When you say:

```
> Add a Stripe webhook handler
```

The coordinator routes to Morpheus. **Only Morpheus** looks at backend code.

This is how Squad scales — **selective loading**, not brute-force context.

---

## 4. History Summarization Keeps Memories Manageable

After 10 sessions, agent histories can grow large. The Scribe **archives old learnings** to keep histories focused:

```
📋 Scribe — archiving agent histories

Old learnings moved to .ai-team/history-archive/:
  - Neo's session logs from June
  - Trinity's session logs from July

Current histories now cover the last 3 sessions only.
Skills extracted from old sessions remain in .ai-team/skills/.
```

Agents don't forget — they just move old details to the archive. **Generic knowledge becomes skills**, and **specific session logs are archived**.

---

## 5. Skills Encode Patterns — No Rediscovery

After an agent solves a problem, it writes a skill file:

`.ai-team/skills/stripe-webhook-verification.md`:

```markdown
# Stripe Webhook Verification

Always verify webhook signatures using the Stripe SDK.

Example:
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
```

Next time **any agent** handles Stripe webhooks, they read this skill first. No rediscovery. No re-exploration.

Over time, your `.ai-team/skills/` directory becomes a **compressed knowledge base** — 50 skill files instead of 10,000 lines of history.

---

## 6. Be Explicit About Scope on Huge Repos

On truly massive codebases (monorepos with 10+ services), help agents focus:

```
> Team, we're working in the payment-service directory only.
> Ignore the other services for now.
```

```
📋 Scribe — scope limited to payment-service/ directory

Agents will focus on:
  payment-service/src/
  payment-service/tests/
  payment-service/package.json
```

Or route by service in `.ai-team/routing.md`:

```markdown
**Payment service work** → Morpheus
**Notification service work** → Linus
**Auth service work** → Rusty
```

Each agent becomes a **service owner**.

---

## 7. Sample Prompts for Large Codebases

**Initial exploration:**

```
> Team, this is a 600K-line monorepo with 8 microservices.
> Each of you, explore the service relevant to your role.
> Don't try to read everything — focus on your domain.
```

**Scoped task assignment:**

```
> Morpheus, add a retry mechanism to the payment processor.
> Only touch payment-service/. Don't explore other services.
```

**Routing-based work:**

```
> Team, add real-time notifications. Trinity handles the frontend
> notification UI, Linus handles the notification-service backend.
> Stay in your respective directories.
```

**Agent memory check:**

```
> Morpheus, what do you know about the payment service architecture?
```

If Morpheus's answer is stale or incomplete:

```
> Morpheus, re-explore the payment service. It's been refactored.
```

---

## 8. Workaround: Use File Paths in Prompts

If agents are getting lost in a huge codebase, give explicit file paths:

```
> Morpheus, refactor src/services/payment/stripe-adapter.ts.
> Don't touch anything else.
```

Agents load only the specified file and its immediate dependencies.

---

## Tips

- **Each agent has 200K tokens.** Even a 1M-line codebase isn't a problem — agents only load what's relevant.
- **Routing prevents over-exploration.** Route frontend work to frontend agents, backend to backend agents. Don't let everyone explore everything.
- **Skills are compressed knowledge.** After 5 sessions, your team has 30 skill files that encode months of learning. Agents read skills in seconds.
- **History archiving happens automatically.** The Scribe moves old session logs to the archive, keeping current histories lean.
- **Be explicit on monorepos.** In a 10-service monorepo, tell agents which service they're working on. Don't let them wander.
- **Agent context is isolated.** Frontend agents don't load backend code. Backend agents don't load frontend code. This is the key to scaling.
