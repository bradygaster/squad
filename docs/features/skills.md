# Skills System

Skills are reusable knowledge files that agents read before working. They encode patterns, conventions, and techniques learned from real work.

---

## Where Skills Live

```
.ai-team/skills/{skill-name}/SKILL.md
```

Each skill is a directory containing a `SKILL.md` file.

---

## Types of Skills

### Starter skills

Bundled when you initialize Squad. Prefixed with `squad-` (e.g., `squad-conventions`). These encode baseline patterns for working with Squad.

### Earned skills

Written by agents from real work on your project. When an agent discovers a reusable pattern — a deployment strategy, a testing technique, an API integration approach — it writes a skill file.

---

## Confidence Lifecycle

Earned skills have a confidence level that reflects how battle-tested they are:

| Level | Meaning |
|-------|---------|
| **Low** | First written — based on a single experience |
| **Medium** | Applied successfully in multiple contexts |
| **High** | Well-established, consistently reliable |

Confidence only goes up, never down. A skill that reaches `high` stays there.

---

## How Skills Are Used

1. **Before working**, agents read skill files relevant to the task at hand
2. **Skill-aware routing** — the coordinator checks available skills when deciding which agent to spawn. An agent with a relevant earned skill may be preferred over one without.
3. **After working**, agents may write new skills or update existing ones based on what they learned

---

## Example

After successfully setting up a CI pipeline, an agent might create:

```
.ai-team/skills/ci-github-actions/SKILL.md
```

```markdown
# CI with GitHub Actions

**Confidence:** medium

## Pattern
- Use `actions/checkout@v4` for repo access
- Cache node_modules with `actions/cache@v4` using hash of package-lock.json
- Run lint, test, and build as separate jobs for parallel execution
- Use `concurrency` groups to cancel superseded runs

## Learned from
- Initial CI setup (session 3)
- Pipeline optimization after slow builds (session 7)
```

---

## Tips

- Skills compound over time. A mature project has skills covering testing patterns, deployment procedures, API conventions, and more.
- Starter skills (`squad-*`) are overwritten on upgrade. Earned skills are never touched.
- Skills are shared across the whole team — any agent can read any skill.
- You can manually edit skill files if you want to seed knowledge (e.g., paste your team's existing conventions into a `SKILL.md`).

## Sample Prompts

```
list all skills
```

Shows all skill files in `.ai-team/skills/` with confidence levels for earned skills.

```
what's the confidence level for the CI skill?
```

Checks how battle-tested a specific earned skill is.

```
create a skill for our deployment process
```

Manually creates a new skill file and guides you through documenting the pattern.

```
which skills have low confidence?
```

Finds recently-created skills that haven't been validated across multiple contexts yet.

```
bump the testing skill to high confidence
```

Manually increases the confidence level after successful repeated use.
