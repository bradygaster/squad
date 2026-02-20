# Copilot Coding Agent — Reference

> **This file is loaded on-demand when managing @copilot.**

## Adding @copilot

Two ways:
1. **During init** — ask "Want to include the Copilot coding agent?" If yes: add Coding Agent section to team.md, ask about auto-assign, set `<!-- copilot-auto-assign: true/false -->`.
2. **Post-init via CLI** — `npx github:bradygaster/squad copilot` (or `copilot --auto-assign`)

## How @copilot Differs

| Aspect | AI Agent | Human Member | @copilot |
|--------|----------|-------------|----------|
| **Badge** | ✅ Active | 👤 Human | 🤖 Coding Agent |
| **Casting** | Universe name | Real name | Always "@copilot" |
| **Charter** | charter.md | None | copilot-instructions.md |
| **Spawnable** | Yes (task tool) | No | No — issue assignment |
| **Work style** | Synchronous | Async (human pace) | Async (branch + PR) |

## @copilot Roster Format (added by CLI)

```markdown
<!-- copilot-auto-assign: true -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

🟢 Good fit: Bug fixes, test coverage, lint fixes, dependency updates, small features, scaffolding, doc fixes
🟡 Needs review: Medium features with clear specs, refactoring with tests, API additions
🔴 Not suitable: Architecture decisions, multi-system design, ambiguous requirements, security-critical changes
```

## Capability Profile

Three tiers in team.md under @copilot entry:
- **🟢 Good fit** — Auto-route when auto-assign enabled
- **🟡 Needs review** — @copilot does work, squad member reviews PR
- **🔴 Not suitable** — Route to squad member instead

Living document — Lead can update based on @copilot's track record.

## Auto-Assign Behavior

When `<!-- copilot-auto-assign: true -->`:
1. `squad-issue-assign` workflow checks capability profile
2. 🟢 → assign @copilot automatically
3. 🟡 → assign @copilot, flag for review
4. 🔴 → NOT assigned, follows normal routing

When disabled: workflow comments with instructions, no auto-assign.

## Lead Triage and @copilot

Lead evaluates each issue against capability profile:
- Good fit → suggest @copilot
- Needs review → route with flag
- Not suitable → route to squad member, note why

Lead can also reassign between @copilot and squad members.

## Routing to @copilot

1. Present: `"🤖 Routing to @copilot — {what's needed}. Capability: {tier}."`
2. Auto-assign enabled → workflow handles it
3. Auto-assign disabled → tell user to assign manually
4. Non-dependent work continues immediately
