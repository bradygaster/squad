# Skill-discovery

Demonstrates the Squad SDK skills system, showing how agents load domain knowledge from `SKILL.md` files, match skills to tasks by triggers and role affinity, discover new patterns at runtime, and track skill confidence as it evolves from low to high.

## Prerequisites

- Node.js >= 20
- npm
- The SDK must be built first: `cd ../../ && npm run build`

## Quick start

From the repository root:

```bash
npx tsx samples/skill-discovery/index.ts
```

Or from this directory:

```bash
npm install
npm start
```

## What you'll learn

- How to use `loadSkillsFromDirectory()` to load skills from `SKILL.md` files
- How to register skills in a `SkillRegistry` and query them
- How `matchSkills()` scores skills by trigger keywords and role affinity
- How agents discover new patterns at runtime via `parseSkillFile()`
- How the confidence lifecycle (low → medium → high) tracks skill maturity
- How to understand the `SKILL.md` format with YAML frontmatter

## How it works

The sample walks through six steps. First, it creates three sample `SKILL.md` files with different domains (development, architecture, quality) and loads them using `loadSkillsFromDirectory()`. Next, it registers all skills in a `SkillRegistry`. Then it demonstrates matching: four different tasks are tested against the registry, and matching skills are returned scored by trigger keyword overlap and role affinity. In step 4, the sample simulates an agent discovering a new pattern during work and creating a new skill at runtime using `parseSkillFile()`. The newly discovered skill is registered and tested against error-handling tasks. Finally, the sample explains the confidence lifecycle: low (first observation), medium (confirmed across sessions), and high (established team standard).

## Expected output

```
╔════════════════════════════════════════════════════════════╗
  🔍 Squad SDK — Skill Discovery Demo
╚════════════════════════════════════════════════════════════╝

  Creating temporary skill files...
  📁 Skills directory: /tmp/squad-skills-demo-abc123/.squad/skills
  📄 Created 3 skill files

  ── Step 1: Load Skills from Directory ──

  🔴 TypeScript Patterns
     ID: typescript-patterns
     Domain: development
     Triggers: [typescript, types, generics, inference, strict]
     Confidence: low

  ── Step 3: Match Skills to Tasks ──

  📋 Task: "Add TypeScript generics to the data layer"
     Role: developer
     → TypeScript Patterns (score: 85%) — trigger match + role affinity

  ── Step 4: Agent Discovers a New Pattern ──

  🤖 Agent is working on error handling...
  💡 Pattern detected: "Always use Result<T, E> for error handling"

  ✅ New skill registered: "Error Handling Patterns"

  ── Step 6: Confidence Lifecycle ──

  🔴 LOW    — First observation
  🟡 MEDIUM — Confirmed across sessions
  🟢 HIGH   — Established team standard
```

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Main demo walking through skill loading, matching, and discovery |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration (ESM, strict) |
| `tests/skill-discovery.test.ts` | Tests for skill loading, matching, and confidence tracking |

## SKILL.md format

Skills are stored as markdown files with YAML frontmatter:

```markdown
---
name: TypeScript Patterns
domain: development
triggers: [typescript, types, generics]
roles: [developer, lead]
confidence: low
---

## TypeScript Patterns

Prefer `unknown` over `any` for type-safe narrowing.
```

### Confidence levels

| Level | Icon | Meaning |
|-------|------|---------|
| low | 🔴 | First observation — pattern just noticed |
| medium | 🟡 | Confirmed — validated across sessions |
| high | 🟢 | Established — proven team standard |

## Matching algorithm

`SkillRegistry.matchSkills(task, role)` scores skills by:
- **+0.5** per trigger keyword found in the task (capped at 0.7)
- **+0.3** if the agent's role matches the skill's `roles` list
- Scores clamped to [0, 1] and sorted descending

## Next steps

- See [rock-paper-scissors](../rock-paper-scissors/README.md) for a showcase using skills in a competitive agent scenario
- Check [autonomous-pipeline](../autonomous-pipeline/README.md) for a full integration combining skills with routing and cost tracking
- Read the [Skills Documentation](../../README.md#skills) for more details
