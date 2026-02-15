# Squad in Monorepos

> **Try this:**  
> `"I'm building a microservices platform in a monorepo with 8 services — set up specialists for each domain"`  
> `"Add a payments specialist who knows Stripe integration"`

One squad per monorepo, not per service. Squad adds specialists per domain and routes work to the right agent based on which service is being modified.

---

## 1. The Monorepo Challenge

You have a monorepo with 8 services:

```
monorepo/
├── services/
│   ├── auth-service/
│   ├── payment-service/
│   ├── notification-service/
│   ├── api-gateway/
│   ├── analytics-service/
│   ├── user-service/
│   ├── product-service/
│   └── order-service/
├── shared/
│   ├── types/
│   ├── utils/
│   └── config/
└── infra/
```

Do you need 8 squads (one per service)? **No. One squad with specialists.**

---

## 2. One Squad, Multiple Specialists

Tell Squad about your monorepo structure:

```
> I'm building a microservices platform in a monorepo. We have 8 services:
> auth, payments, notifications, API gateway, analytics, users, products,
> and orders. I need specialists for each service domain.
```

```
Here's your team:

🏗️  Michael      — Lead             Scope, decisions, code review
🔐  Fredo        — Auth Specialist  Auth service, JWT, sessions
💳  Sonny        — Payments Dev     Payment service, Stripe, billing
📧  Tom          — Notifications    Notification service, email, SMS
🌐  Kay          — Gateway Dev      API gateway, routing, rate limiting
📊  Luca         — Analytics Dev    Analytics service, tracking, metrics
👤  Vito         — User Service     User service, profiles, preferences
📦  Clemenza     — Products Dev     Product service, catalog, inventory
🛒  Tessio       — Orders Dev       Order service, checkout, fulfillment
🧪  Hagen        — Tester           Tests across all services
📋  Scribe       — (silent)         Memory, decisions, session logs

Look right? I can adjust if you want fewer specialists.
```

That's a **10-agent team** (9 active + Scribe). You can trim it if you want:

```
> That's too many. Let's have 3 domain specialists: backend (auth, payments,
> users), frontend (gateway, notifications), and infra (analytics, products,
> orders). Plus a Lead and Tester.
```

---

## 3. Routing Rules Direct Work to the Right Specialist

Edit `.ai-team/routing.md`:

```markdown
# Routing Rules

**Auth service work** → Fredo
**Payment service work** → Sonny
**Notification service work** → Tom
**API gateway work** → Kay
**Analytics service work** → Luca
**User service work** → Vito
**Product service work** → Clemenza
**Order service work** → Tessio

**Shared utilities** → Michael (Lead decides who takes it)
**Infrastructure changes** → Michael
**Cross-service refactoring** → Michael
**Testing** → Hagen
```

Now when you give a task:

```
> Add two-factor authentication to the auth service.
```

The coordinator routes to Fredo (auth specialist). **Only Fredo** loads the auth service code.

```
> Add Stripe subscription management to the payment service.
```

Routes to Sonny (payments specialist).

---

## 4. Worktree Awareness — Multiple Services Simultaneously

You can work on multiple services at once:

```
> Team, we're adding a loyalty points feature. This spans three services:
> users (store points balance), orders (award points on purchase),
> and products (display points earned per product).
```

Squad decomposes and routes:

```
🏗️ Michael  — coordinating cross-service feature
👤 Vito     — adding points balance to user service
🛒 Tessio   — awarding points in order service
📦 Clemenza — displaying points in product service
🧪 Hagen    — writing integration tests across services
```

All four work in parallel, each in their own service directory.

---

## 5. Skills That Span Services

Some patterns apply **across all services**:

`.ai-team/skills/service-logging-pattern.md`:

```markdown
# Service Logging Pattern

All services use structured logging with Winston.

Log format:
{
  "timestamp": "ISO 8601",
  "service": "service-name",
  "level": "info|warn|error",
  "message": "human-readable message",
  "context": { /* additional fields */ }
}

Every service must log:
- Request IDs for tracing
- User IDs (if authenticated)
- Error stack traces
```

This skill is read by **all agents**, regardless of which service they're working on. Consistent logging across the monorepo.

`.ai-team/skills/inter-service-communication.md`:

```markdown
# Inter-Service Communication

Services communicate via HTTP REST APIs (synchronous) or RabbitMQ messages
(asynchronous events).

Rules:
- Never import code from another service
- Use the service's public API only
- All inter-service calls must have timeouts and retries
- Use circuit breakers for downstream failures
```

Agents know: **don't tightly couple services**.

---

## 6. Shared Code in `/shared`

The `/shared` directory has utilities, types, and config used by all services:

```
> Kay, refactor the rate limiting utility in /shared/utils/rate-limit.ts.
> This is used by 5 services, so be careful.
```

```
🌐 Kay — refactoring rate limiting utility in /shared

Kay is checking which services import this utility before changing it.
```

Kay knows changes to `/shared` affect multiple services.

---

## 7. Sample Prompts for Monorepo Workflows

**Cross-service feature:**

```
> Team, we're adding real-time notifications. This requires:
> notification-service (WebSocket server), api-gateway (WebSocket proxy),
> and user-service (notification preferences). Split the work.
```

**Service-specific task:**

```
> Sonny, add support for Stripe payment intents in the payment service.
> Don't touch other services.
```

**Shared utility change:**

```
> Michael, we need to update the /shared/types/User.ts type.
> This affects auth, users, and orders services. Coordinate the change.
```

**Infrastructure change:**

```
> All services need to switch from Winston to Pino for logging.
> Team, update each service. Use the same Pino config across all services.
```

**Integration test:**

```
> Hagen, write an integration test for the checkout flow. It spans
> orders, payments, and notifications services.
```

**Explore a new service:**

```
> Clemenza, review the product service. We haven't touched it in weeks.
> Tell me what's there and what needs work.
```

---

## 8. One Squad, Not Eight

**Why one squad instead of one per service?**

- **Shared knowledge.** Patterns that span services (logging, auth, error handling) are encoded once in skills.
- **Cross-service coordination.** Michael (the Lead) sees the whole monorepo, not just one service.
- **Fewer exports/imports.** You don't have to export/import squads between services.
- **Consistent conventions.** All services follow the same patterns because the same agents work on them.

If you had 8 separate squads, they'd diverge. One squad keeps the monorepo aligned.

---

## Tips

- **One squad per monorepo.** Add specialists per service, but keep them in one team.
- **Routing rules are critical.** Route work to the right specialist so agents don't wander across services.
- **Skills that span services are gold.** Logging, error handling, API conventions — document them once, use everywhere.
- **Shared code needs careful handling.** Changes to `/shared` affect multiple services. Route those to the Lead.
- **Agents become service owners.** After a few sessions, each specialist knows their service deeply.
- **Cross-service features need coordination.** Use the Lead to decompose features that span services, then route to specialists.
