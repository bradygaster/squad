# Built-in Base Roles

## Overview

- Squad ships with 20 curated base roles covering software development and business operations.
- Base roles provide deep, substantive charter content out of the box — no LLM generation needed.
- During team casting, base roles serve as starting points that get refined for your project context.
- Role content is adapted from [agency-agents](https://github.com/msitarzewski/agency-agents) by AgentLand Contributors (MIT License).

## Why Base Roles?

- **Faster setup** — deterministic role selection instead of LLM improvisation.
- **Lower token cost** — base content provides 90% of the charter; only project-specific refinement needs the LLM.
- **Higher quality** — curated expertise, boundaries, and voice instead of generic boilerplate.
- **Broad coverage** — not just software dev; marketing, sales, product, game dev, and more.

## Software Development Roles (13)

| Emoji | ID | Title | Vibe |
|-------|----|-------|------|
| 🏗️ | `lead` | Lead / Architect | Designs systems that survive the team that built them. Every decision has a trade-off — name it. |
| ⚛️ | `frontend` | Frontend Developer | Builds responsive, accessible web apps with pixel-perfect precision. |
| 🔧 | `backend` | Backend Developer | Designs the systems that hold everything up — databases, APIs, cloud, scale. |
| 💻 | `fullstack` | Full-Stack Developer | Sees the full picture — from the database to the pixel. |
| 👁️ | `reviewer` | Code Reviewer | Reviews code like a mentor, not a gatekeeper. Every comment teaches something. |
| 🧪 | `tester` | Test Engineer | Breaks your API before your users do. |
| ⚙️ | `devops` | DevOps Engineer | Automates infrastructure so your team ships faster and sleeps better. |
| 🔒 | `security` | Security Engineer | Models threats, reviews code, and designs security architecture that actually holds. |
| 📊 | `data` | Data Engineer | Thinks in tables and queries. Normalizes first, denormalizes when the numbers demand it. |
| 📝 | `docs` | Technical Writer | Turns complexity into clarity. If the docs are wrong, the product is wrong. |
| 🤖 | `ai` | AI / ML Engineer | Builds intelligent systems that learn, reason, and adapt. |
| 🎨 | `designer` | UI/UX Designer | Pixel-aware and user-obsessed. If it looks off by one, it is off by one. |
| 🔍 | `fact-checker` | Fact Checker | Trust, but verify. Every claim gets a source check before it ships. |

## Business & Operations Roles (8)

| Emoji | ID | Title | Vibe |
|-------|----|-------|------|
| 📣 | `marketing-strategist` | Marketing Strategist | Drives growth through content and channels — every post has a purpose. |
| 💼 | `sales-strategist` | Sales Strategist | Closes deals with strategic precision — understand the buyer before pitching the solution. |
| 📋 | `product-manager` | Product Manager | Shapes what gets built and why — every feature earns its place. |
| 📅 | `project-manager` | Project Manager | Keeps the train on the tracks — scope, schedule, and sanity. |
| 🎧 | `support-specialist` | Support Specialist | First line of defense for users — solve fast, document everything. |
| 🎮 | `game-developer` | Game Developer | Builds worlds players want to live in — every mechanic serves the experience. |
| 📺 | `media-buyer` | Media Buyer | Maximizes ROI across ad channels — every dollar tracked, every impression measured. |
| ⚖️ | `compliance-legal` | Compliance & Legal | Ensures you ship safely and legally — compliance is a feature, not a blocker. |

## Using Base Roles

### During Init

```bash
$ squad init
What are you building? > A React + Node.js API with Stripe integration

Suggested team:
  🏗️  Lead / Architect
  ⚛️  Frontend Developer
  🔧  Backend Developer
  🧪  Test Engineer

Look right? [Yes] [Add someone] [Change a role] [Browse all roles]
```

### In squad.config.ts (SDK Mode)

```typescript
import { useRole, defineSquad } from '@bradygaster/squad-sdk';

export default defineSquad({
  agents: [
    useRole('lead', { name: 'ripley' }),
    useRole('frontend', { name: 'dallas' }),
    useRole('backend', { name: 'kane', expertise: ['Node.js', 'PostgreSQL', 'Stripe API'] }),
    useRole('tester', { name: 'lambert' }),
  ],
});
```

### CLI: Browse Roles

```bash
$ squad roles                          # list all 20 roles
$ squad roles --category engineering   # filter by category
$ squad roles --search "security"      # search by keyword
```

## Customization

- Override expertise, style, voice, or boundaries via `useRole()` options.
- Add extra ownership or approach items with `extraOwnership`/`extraApproach`.
- Base roles are starting points — the coordinator refines them for your project context during casting.

## Plugin-contributed roles

Marketplace plugins can extend the catalog with their own roles. A plugin ships a `roles/` directory containing JSON role definitions; Squad loads `.squad/plugins/<plugin>/roles/*.json` automatically when you run `squad`, `squad roles`, or `squad init`.

Plugin roles are **additive** — they cannot override a built-in role id. Use a namespaced id (for example `@acme/react-frontend`) so there's no collision:

```json
// .squad/plugins/@acme-frontend/roles/react.json
{
  "id": "@acme/react-frontend",
  "title": "Acme React Frontend",
  "category": "engineering",
  "emoji": "⚛️",
  "vibe": "Acme-flavored React specialist.",
  "expertise": ["React", "Testing Library", "State management"],
  "style": "Direct. Tested.",
  "ownership": ["Acme UI layer"],
  "approach": ["Measure-first"],
  "boundaries": { "handles": "React UI", "doesNotHandle": "Backend APIs" },
  "voice": "Crisp and opinionated.",
  "routingPatterns": ["react", "frontend", "acme"],
  "attribution": "Contributed by the @acme marketplace plugin."
}
```

Once the plugin is installed, the role resolves identically to a built-in:

```typescript
useRole('@acme/react-frontend', { name: 'ada' });
```

It also appears in `squad roles` under a **🔌 Plugin Roles** section grouped by plugin, and in `searchRoles()` / `listRoles()` / `getCategories()`.

For programmatic registration (tests, hot-reload, or a custom loader), import:

```typescript
import {
  registerPluginRoles,
  getPluginRoleRegistrations,
  loadPluginRolesFromDir,
} from '@bradygaster/squad-sdk';
```

`registerPluginRoles(plugin, roles)` throws if any `role.id` collides with a built-in and skips ids already registered by another plugin (reported via the `skipped` list).

## Attribution

Built-in role content is adapted from [agency-agents](https://github.com/msitarzewski/agency-agents) by AgentLand Contributors, released under the MIT License.

---

## See Also

- [Your Team](../concepts/your-team.md) — Team setup, roster, and role composition
- [Architecture](../concepts/architecture.md) — How agents with specific roles are orchestrated
- [Work Routing](./routing.md) — How work routes to agents based on their roles
