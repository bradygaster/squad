# Directives

A directive is a preference, rule, or constraint the team remembers across sessions. When you say "always do X" or "never do Y", Squad captures it as a directive, writes it to the decisions inbox, and the Scribe merges it into `.ai-team/decisions.md` — the team's permanent memory.

## How Directives Work

1. **Signal Word Detection** — The coordinator listens for: "always", "never", "from now on", "remember to", "don't", "make sure to".
2. **Capture** — Directive is written to `.ai-team/decisions/inbox/{timestamp}-{brief-slug}.md`.
3. **Scribe Merge** — Scribe consolidates inbox files into `decisions.md` during the next coordination cycle.
4. **Agent Awareness** — All agents read `decisions.md` before starting work. Directives shape behavior.

## Signal Words

| Phrase | Example |
|--------|---------|
| "always" | "Always use TypeScript strict mode" |
| "never" | "Never commit directly to main" |
| "from now on" | "From now on, prefix all commits with the issue number" |
| "remember to" | "Remember to run tests before pushing" |
| "don't" | "Don't use var — only let and const" |
| "make sure to" | "Make sure to document all public APIs" |

## Directive Scope

Directives can apply to:

- **Coding style** — Formatting, naming conventions, language features
- **Tool preferences** — Linters, formatters, test runners
- **Workflow rules** — Branch naming, commit messages, PR templates
- **Scope constraints** — "Don't touch legacy/ directory", "Only work on v2 features"
- **Review requirements** — "Always have Lead review security changes"

## Examples

> "Always use single quotes for strings in TypeScript"

**Captured:**
```markdown
# Single Quotes for Strings
Date: 2024-01-15
Scope: TypeScript code

Use single quotes for string literals. Avoid double quotes unless escaping is required.
```

> "Never deploy on Fridays"

**Captured:**
```markdown
# No Friday Deploys
Date: 2024-01-15
Scope: Release process

Do not trigger production deploys on Fridays. Schedule for Monday-Thursday only.
```

> "From now on, all API endpoints need integration tests"

**Captured:**
```markdown
# API Integration Test Coverage
Date: 2024-01-15
Scope: Testing

Every new API endpoint requires at least one integration test covering the happy path and one error case.
```

## Decisions Inbox

New directives land in `.ai-team/decisions/inbox/` as individual files:

```
.ai-team/decisions/inbox/
├── 2024-01-15-1420-single-quotes.md
├── 2024-01-15-1435-no-friday-deploys.md
└── 2024-01-15-1450-api-test-coverage.md
```

The Scribe periodically consolidates these into `decisions.md`:

```markdown
# Team Decisions

## Coding Style

### Single Quotes for Strings
Use single quotes for string literals in TypeScript. Avoid double quotes unless escaping is required.

## Testing

### API Integration Test Coverage
Every new API endpoint requires at least one integration test covering the happy path and one error case.

## Release Process

### No Friday Deploys
Do not trigger production deploys on Fridays. Schedule for Monday-Thursday only.
```

## Directive Conflicts

When a new directive contradicts an existing one:

1. **Scribe detects conflict** — Checks for semantic overlap during merge.
2. **User prompt** — "New directive conflicts with existing rule: {old rule}. Replace, merge, or skip?"
3. **Resolution** — Scribe updates `decisions.md` based on your choice.

## Viewing Directives

> "Show me the team directives"

Coordinator displays `decisions.md` content.

> "What's our rule on testing?"

Coordinator searches `decisions.md` for testing-related directives.

## Removing Directives

> "Remove the no-Friday-deploy rule"

Scribe edits `decisions.md` and removes that section.

Or edit `.ai-team/decisions.md` directly.

## Agent Directive Compliance

Agents are not hard-constrained by directives — they're context-aware guidelines. If an agent violates a directive:

- **Reviewer rejection** — Lead or Tester flags it during review.
- **User feedback** — You say "this violates our style rule" and the agent revises.

Directives shape behavior but don't replace code review or linting.

## Sample Prompts

```
Always use Prettier with single quotes and no semicolons
```
Creates a coding style directive. All agents will format code accordingly.

```
Never use `any` type in TypeScript — always define explicit types
```
Establishes a type safety directive. Agents will avoid `any` and use proper types.

```
From now on, all commit messages must follow Conventional Commits format
```
Sets a workflow directive. Agents will format commits as `feat:`, `fix:`, `docs:`, etc.

```
Remember to update the CHANGELOG.md for every user-facing change
```
Creates a release process directive. Agents will add changelog entries when appropriate.

```
Make sure all security-related PRs are reviewed by Lead before merging
```
Establishes a review requirement. Coordinator will route security PRs to Lead for approval.
