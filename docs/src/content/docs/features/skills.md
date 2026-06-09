# Skills System

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to see what your team learned:**
```
Show me what skills this team has learned
```

**Try this to list all accumulated knowledge:**
```
List all skills
```

**Try this to document a reusable pattern:**
```
Create a skill for our deployment process
```

Agents learn from real work and write skill files — reusable patterns, conventions, and techniques. Skills compound over time, making your team smarter with each project.

---

## Where Skills Live

```
.copilot/skills/{skill-name}/SKILL.md
```

Each skill is a directory containing a `SKILL.md` file. Skills are **team-wide knowledge** — not tied to individual agents. All agents can read and use any skill.

> **Note:** `.squad/skills/` is a supported legacy path. Skills there are still discovered at read time and take **highest** scan precedence. The CLI, SDK tool, and `squad init` all write to `.copilot/skills/` by default. See [Skill directory precedence](#skill-directory-precedence) below.

> **Portable across projects**: Skills export and import with your team. When you move a trained team to a new repo, all their earned knowledge comes with them.

---

## Skill directory precedence

Squad scans five directories for skills at read time. When the same skill name appears in more than one location, the highest-precedence copy wins:

| Priority | Directory | Notes |
|----------|-----------|-------|
| 1 | `.squad/skills/` | Legacy path — **highest** scan priority for backward compatibility |
| 2 | `.copilot/skills/` | **Current write target** — CLI commands, SDK tool, and `squad init` write here |
| 3 | `.github/skills/` | GitHub-native path |
| 4 | `.claude/skills/` | Claude-specific path |
| 5 | `.agents/skills/` | Generic agents path |

**Writes default to `.copilot/skills/`** — that is what the CLI `skill` commands, the SDK skill tool, sharing/consult, and `squad init` create. `.squad/skills/` is retained for backward compatibility; any skill already there continues to work and takes highest precedence if a same-named skill also exists in `.copilot/skills/`.

> **Tip:** If you have skills in `.squad/skills/` from an older install, they continue to work as-is. To consolidate, move them to `.copilot/skills/` — but remove the `.squad/skills/` copy first, otherwise the old location will shadow the new one.
---

## Types of Skills

### Built-in Skills

Squad ships with **8 built-in skills** that provide foundational patterns for every squad. These are automatically installed during `squad init` and refreshed during `squad upgrade`:

1. **squad-conventions** — Core squad patterns and file layout
2. **error-recovery** — Graceful failure handling and retry patterns
3. **secret-handling** — Credential safety and secrets management
4. **git-workflow** — Branch naming, commit conventions, PR flow
5. **session-recovery** — Checkpoint and recovery after restarts
6. **reviewer-protocol** — Code review gates and approval flow
7. **test-discipline** — Test-first discipline and coverage expectations
8. **agent-collaboration** — Multi-agent handoff and parallel work patterns

Built-in skills are prefixed with their domain (e.g., `github-`, `secrets-`, `session-`). They're overwritten on upgrade to ensure you always have the latest patterns.

### Starter skills

Legacy term for built-in skills. Previously called "starter skills" and prefixed with `squad-` (e.g., `squad-conventions`). Now standardized as domain-prefixed built-in skills.

### Session Recovery

The `session-recovery` skill teaches agents to find and resume interrupted Copilot CLI sessions. When a session is interrupted (terminal crash, network drop, machine restart), in-progress work may be left incomplete. This skill uses `session_store` SQL queries to detect abandoned sessions, inspect checkpoint progress, and resume work. See [`.squad/skills/session-recovery/SKILL.md`](https://github.com/bradygaster/squad/blob/dev/.squad/skills/session-recovery/SKILL.md) for query patterns and examples.

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
.copilot/skills/ci-github-actions/SKILL.md
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
- Built-in skills are overwritten on upgrade. Earned skills are never touched.
- **Skills are shared across the whole team** — any agent can read any skill. They're stored in a flat `.copilot/skills/` directory by default, not per-agent files. (`.squad/skills/` is still scanned as a legacy fallback — see [Skill directory precedence](#skill-directory-precedence).)
- You can manually edit skill files if you want to seed knowledge (e.g., paste your team's existing conventions into a `SKILL.md`).
- **Skills survive export/import** — your team's accumulated knowledge is fully portable across projects.

## Sample Prompts

```
list all skills
```

Shows all skill files in `.copilot/skills/` (and `.squad/skills/` if present) with confidence levels for earned skills.

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
