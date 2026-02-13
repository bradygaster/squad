# Squad for Open Source Projects

Autonomous issue triage, community contributor support, and architectural knowledge sharing.

---

## 1. The Open Source Maintainer Problem

You maintain an open source project. Issues pile up. PRs from new contributors need guidance. Questions repeat. Triaging takes hours.

Squad helps:
- **Triage incoming issues** automatically
- **Guide contributors** with documented patterns
- **Handle good-first-issue tasks** autonomously
- **Keep architecture decisions visible** in `.ai-team/decisions.md`

---

## 2. Install Squad and Set Up Triage

```bash
cd ~/projects/my-open-source-lib
npx github:bradygaster/squad
```

Enable the Ralph heartbeat workflow:

```bash
cp .ai-team-templates/ralph-heartbeat.yml .github/workflows/
git add .github/workflows/ralph-heartbeat.yml
git commit -m "Enable Squad auto-triage"
git push
```

Ralph now runs every 6 hours, reading new issues and applying labels:

```
Issue #142: "Add support for custom themes"
  → squad:trinity (frontend work)
  → type:feature
  → priority:medium

Issue #143: "Documentation typo in README"
  → squad:scribe (docs work)
  → type:docs
  → priority:low
  → good-first-issue
```

---

## 3. Community Contributors File Issues, Squad Triages

A contributor files an issue:

```
Issue #144: "Add TypeScript type definitions"
```

Ralph (heartbeat workflow) reads the issue, applies:
- `squad:morpheus` (backend/tooling work)
- `type:feature`
- `priority:high`
- `good-first-issue` (if it's suitable)

You review triaged issues and add `go:morpheus` if you approve.

---

## 4. @copilot Picks Up Good-First-Issue Tasks Autonomously

Enable the auto-assign workflow:

```bash
cp .ai-team-templates/copilot-auto-assign.yml .github/workflows/
git add .github/workflows/copilot-auto-assign.yml
git commit -m "Enable Squad auto-assign"
git push
```

When you add `go:morpheus` to issue #144, GitHub Actions triggers:

```
GitHub Actions → Copilot session spawns Morpheus
Morpheus reads issue #144 → implements TypeScript definitions
Morpheus opens PR #145 → "Add TypeScript type definitions"
```

You review PR #145, approve, merge. Issue #144 closed.

**The contributor filed the issue. Squad handled it.**

---

## 5. Skills Document Your Project's Patterns

After Squad works on your project for a few weeks, `.ai-team/skills/` becomes a **living contributor guide**:

`.ai-team/skills/testing-conventions.md`:

```markdown
# Testing Conventions

All new features must include tests. Use Jest for unit tests.

Test file naming: `{module}.test.ts`
Test structure: describe → it blocks
Mock external dependencies with `jest.mock()`
```

Contributors can **read this file** to understand your testing norms. No need to repeat it in every PR review.

`.ai-team/skills/api-design-patterns.md`:

```markdown
# API Design Patterns

All API endpoints follow RESTful conventions:
- GET for read operations
- POST for create
- PUT for full update
- PATCH for partial update
- DELETE for removal

Use HTTP status codes correctly:
- 200 OK for success
- 201 Created for resource creation
- 400 Bad Request for invalid input
- 404 Not Found for missing resources
- 500 Internal Server Error for server issues
```

**These skills are contributor documentation** that stays up to date because agents use them.

---

## 6. Decisions.md is Your Architecture Decision Record (ADR)

`.ai-team/decisions.md` becomes your **public ADR**:

```markdown
### 2025-07-10: Use esbuild instead of Webpack
**By:** Neo
**What:** Migrated build system from Webpack to esbuild
**Why:** 10x faster builds, simpler config, better DX for contributors

### 2025-07-12: Stick with CommonJS for now
**By:** Neo
**What:** Not migrating to ESM yet
**Why:** Too many compatibility issues with downstream tools
       Will revisit in 6 months

### 2025-07-15: Use Zod for runtime validation
**By:** Morpheus
**What:** All API input validation uses Zod schemas
**Why:** Type-safe, composable, generates TypeScript types
```

Contributors see **why you made decisions**, not just what the code does.

---

## 7. Export Your Squad for Forks

When someone forks your project, they can **import your squad**:

```bash
npx github:bradygaster/squad export
```

Share `squad-export-{date}.zip` in your repo's releases or documentation.

Forkers import it:

```bash
git clone https://github.com/forker/my-lib-fork.git
cd my-lib-fork
npx github:bradygaster/squad import squad-export-2025-07-15.zip
```

Now they have **your team's knowledge** — skills, decisions, conventions. They're not starting from scratch.

---

## 8. Sample Prompts for Open Source Workflows

**Triage a batch of issues:**

```
> Ralph, triage the 15 newest issues. Apply squad labels based on
> routing rules. Flag any that are duplicates or need clarification.
```

**Check which issues are ready for autonomous work:**

```
> Show me all issues labeled good-first-issue and squad:morpheus.
> Which ones are clear enough for Morpheus to handle autonomously?
```

**Autonomous issue processing:**

```
> Issue #152 is labeled go:morpheus. Morpheus, implement the feature,
> write tests, and open a PR.
```

**Generate contributor documentation from skills:**

```
> Scribe, create a CONTRIBUTING.md file based on our accumulated
> skills and conventions. Include testing patterns, code style,
> and PR guidelines.
```

**Review contributor PRs:**

```
> Neo, review PR #160 from @contributor. Check if it follows our
> conventions (skills, decisions). If not, suggest changes.
```

**Handle a repeat question:**

```
> Issue #175 is asking how to add a custom validator again.
> Scribe, write a skill file for this so we can point future
> contributors to it.
```

---

## 9. Label Your Repo as Squad-Enabled

Add a badge to your README:

```markdown
## Contributing

This project uses [Squad](https://github.com/bradygaster/squad) for AI-assisted development.

- **Triaging:** Issues are auto-labeled by Squad's Ralph agent
- **Patterns:** See `.ai-team/skills/` for coding conventions
- **Decisions:** See `.ai-team/decisions.md` for architectural rationale
- **Import the squad:** `npx github:bradygaster/squad import squad-export.zip`
```

Contributors know what to expect.

---

## Tips

- **Ralph triages issues for you.** Run the heartbeat workflow every 6 hours to auto-label new issues.
- **Skills are living contributor docs.** As your squad learns, `.ai-team/skills/` becomes a knowledge base contributors can read.
- **Decisions.md is your ADR.** Architectural decisions are visible and explained, not hidden in Git history.
- **Export your squad for forks.** Forkers get your team's accumulated knowledge — skills, conventions, decisions.
- **good-first-issue + go:* = autonomous processing.** Mark issues as safe to auto-process, and Squad handles them.
- **Agents don't merge without approval.** PRs created by agents still require human review before merging.
