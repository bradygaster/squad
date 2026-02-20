# Work Routing

**Try this to set domain-specific routing:**
```
Route all database-related work to Basher
```

**Try this to direct work explicitly:**
```
Fenster, fix the login validation bug
```

**Try this to check routing logic:**
```
Who handles src/api/ changes?
```

The coordinator routes work to the right agent using named routing (explicit), domain routing (pattern matching), and skill-aware routing (capability checking). No manual triage needed.

---

## Routing Strategies

The coordinator decides who handles each piece of work using a three-layer routing system: named routing (explicit assignments), domain routing (pattern matching), and skill-aware routing (capability checking). The goal: get work to the right agent without manual triage overhead.

## Routing Strategies

### 1. Named Routing

You explicitly name who should do the work:

> "Fenster, fix the login validation bug"

Coordinator assigns directly to Fenster. No lookup required.

### 2. Domain Routing

The coordinator checks `.ai-team/routing.md` for pattern matches:

```markdown
## Routing Table

| Pattern | Owner | Reason |
|---------|-------|--------|
| `src/api/**` | Backend | API implementation |
| `src/components/**/*.tsx` | Frontend | React components |
| `*.test.ts` | Tester | Test files |
| `docs/**` | DevRel | Documentation |
| `package.json`, `tsconfig.json` | Lead | Config changes |
```

When work involves `src/api/auth.ts`, it routes to Backend automatically.

### 3. Skill-Aware Routing

If no domain match, the coordinator checks `.ai-team/skills/` for capability fit:

```markdown
# authentication.md
Members with authentication expertise:
- Backend (OAuth, JWT, session management)
- Lead (security review, architecture)
```

Work tagged with authentication routes to Backend or Lead based on task type (implementation vs. review).

## The Routing Table

`.ai-team/routing.md` is the canonical routing manifest. It's structured as:

```markdown
# Work Routing

Default assignments for common patterns.

## Routing Table

| Pattern | Owner | Reason |
|---------|-------|--------|
| `src/frontend/**` | Frontend | UI implementation |
| `src/backend/**` | Backend | Server logic |
| `*.test.js` | Tester | Test coverage |
| `README.md`, `docs/**` | DevRel | User-facing docs |
| `.github/workflows/**` | Lead | CI/CD config |

## Fallback

If no match: route to Lead for triage.
```

## Adding Routing Rules

Tell the coordinator:

> "From now on, route all database migrations to Backend"

Coordinator adds to routing.md:

```markdown
| `migrations/**`, `*.sql` | Backend | Database schema changes |
```

Or edit `.ai-team/routing.md` directly.

## Routing Ambiguity

When multiple patterns match:

1. **Most specific wins** — `src/api/auth.ts` matches both `src/api/**` and `src/**`, but `src/api/**` is more specific.
2. **Named > Domain > Skill** — Explicit assignment always overrides pattern matching.
3. **Fallback to Lead** — If no clear owner, route to Lead for triage.

## Issue Label Routing

GitHub issues with `squad:{member}` labels route directly:

- `squad:fenster` → Fenster picks it up
- `squad:mcmanus` → McManus handles it
- No `squad:*` label → Coordinator triages and assigns

Ralph (the work monitor) uses this to auto-assign based on routing rules.

## Multi-Agent Work

Some tasks require multiple agents:

> "Fenster, implement the API. Hockney, write the tests."

Coordinator spawns both agents in parallel. They work independently and coordinate via the shared `.ai-team/` state.

## Routing Logs

The coordinator logs routing decisions to `.ai-team/orchestration-log/`:

```
[2024-01-15 14:23:10] ROUTE: Issue #42 → Backend (pattern: src/api/**)
[2024-01-15 14:24:05] ROUTE: Issue #43 → Lead (no match, fallback)
[2024-01-15 14:25:30] ROUTE: "Fenster, fix bug" → Fenster (named)
```

Useful for debugging why work went to a specific agent.

## Sample Prompts

```
Route all CSS files to Frontend
```
Adds a routing rule: `*.css` → Frontend.

```
Who handles authentication work?
```
Coordinator checks routing.md and skills/authentication.md, reports the responsible agent(s).

```
From now on, McManus reviews all user-facing documentation before merge
```
Creates a routing rule + directive: docs/** routes to McManus for review.

```
Why did issue #42 go to Backend?
```
Coordinator explains the routing decision based on pattern match or skill fit.

```
Fenster, implement the new search API. Hockney, write integration tests for it.
```
Named routing to two agents. Both spawn in parallel.
