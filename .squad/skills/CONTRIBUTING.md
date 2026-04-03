# Contributing to Squad Skills

This guide explains how to add, modify, and review skills in the Squad system.

---

## Skill Locations

Skills live in three directories, each with a distinct purpose:

| Directory | Purpose |
|-----------|---------|
| `.squad/skills/` | Team patterns — earned and manual skills authored by squad agents |
| `.copilot/skills/` | Coordinator playbook — skills loaded by the Copilot CLI coordinator |
| `templates/skills/` | Product templates — reusable skill scaffolds for new projects |

The eval runner and schema validator scan `.squad/skills/`, `.copilot/skills/`, and `templates/skills/`.

---

## Schema Format

Skills use the [agentskills.io specification](https://agentskills.io/specification) with Squad SDK extensions.

### Required fields

```yaml
---
name: "skill-name"          # kebab-case, matches directory name
description: "..."          # ≤ 1024 chars; used by SDK trigger matching
---
```

### Optional standard fields

All optional fields go inside the `metadata:` block:

```yaml
metadata:
  domain: "area, sub-area"    # comma-separated taxonomy tags
  confidence: "low|medium|high"
  source: "manual|extracted|earned|..."
  compatibility: "GitHub Copilot CLI, VS Code Copilot Chat"
  # SDK extensions — the SDK's simple parser flattens metadata, so these are
  # accessible as top-level fields at runtime. Move to top-level if a full
  # YAML parser is adopted.
  triggers:
    - "phrase that activates this skill"
    - "another trigger pattern"
  roles:
    - "coordinator"
    - "developer"
```

Non-standard fields also go inside `metadata:`:

```yaml
metadata:
  author: "squad"
  version: "1.0.0"
  last_validated: "2026-01-01"
```

**Only `name`, `description`, `license`, and `allowed-tools` belong at top-level.** All other fields — including `domain`, `confidence`, `source`, `triggers`, `roles`, and `compatibility` — must be inside `metadata:`.

---

## Confidence Lifecycle

| Level | Meaning |
|-------|---------|
| `low` | New skill; not yet validated in production. Use with caution. |
| `medium` | Validated in ≥ 1 session; passing evals. Ready for general use. |
| `high` | Earned through repeated production use; evals passing; peer-reviewed. |

Promote confidence by running the eval suite and updating the frontmatter after the skill passes.

---

## How to Add a New Skill

1. **Check for overlap** — search existing skills for similar names and descriptions.  
   If overlap exists, extend the existing skill rather than creating a new one.

2. **Create the directory and file:**
   ```
   .squad/skills/my-skill/SKILL.md
   ```

3. **Write the frontmatter:**
   ```yaml
   ---
   name: "my-skill"
   description: "One sentence that describes what this skill does and when to use it."
   license: "MIT"
   metadata:
     domain: "your-domain"
     confidence: "low"
     source: "manual"
   ---
   ```

4. **Write the body** — include Context, Patterns, Examples, and Anti-Patterns sections.

5. **Write evals:**
   ```
   .squad/skills/evals/my-skill.eval.yaml
   ```
   See the [Eval Framework README](evals/README.md) for the fixture format.

6. **Run validation:**
   ```sh
   node .squad/skills/evals/validate-schema.mjs
   node .squad/skills/evals/run-evals.mjs
   ```

7. **Open a PR** targeting `dev`. Assign a reviewer from the squad roster.

---

## How to Modify an Existing Skill

1. Edit the `SKILL.md` file directly.
2. If the description changes, update the corresponding `.eval.yaml` to reflect new trigger expectations.
3. If the `name` changes, rename both the directory and the `.eval.yaml` file.
4. Run validation:
   ```sh
   node .squad/skills/evals/validate-schema.mjs
   node .squad/skills/evals/run-evals.mjs
   ```
5. Update `confidence` if the change is significant enough to reset trust.

---

## Writing Effective Descriptions

Following [agentskills.io guidance](https://agentskills.io/specification), write descriptions that are:

- **Imperative & User-Centric** — Start with "Use this skill when..." not "This skill does..."
  - ❌ "This skill provides automated testing patterns"
  - ✅ "Use this skill when writing test suites for TypeScript APIs, covering error paths and mocking"

- **Include Real Trigger Contexts** — List situations where the skill applies, even if users don't name the domain directly
  - ✅ Include: "when debugging flaky tests", "for contract testing", "when mocking external services"

- **Focus on User Intent Over Implementation** — Emphasize the problem being solved, not how
  - ❌ "Uses keyword-based matching for skill discovery"
  - ✅ "Use this skill when matching user prompts to agent capabilities"

- **Be Pushy on Applicability** — Err on the side of being trigger-happy; false negatives are worse than false positives
  - Include case variations: "when", "whenever", "if you're", "if you need to"

- **Keep Under 1024 Characters** — Room for context but short enough to index efficiently

**Validation:** Test descriptions with near-miss queries (see Eval Best Practices below) to ensure users with different phrasing find the skill.

---

## Eval Best Practices

### Design Comprehensive Test Cases

Create ~20 queries per skill with this distribution:

- **8–10 positive cases** — Queries that SHOULD trigger the skill
  - Vary phrasing: "Use this when...", "I need to...", "How do I...?"
  - Include explicit skill name mentions and implicit (keyword-only) contexts
  - Test different detail levels: simple ("testing"), complex ("property-based testing with Quickcheck")

- **8–10 negative cases** — Queries that should NOT trigger the skill
  - **Use near-misses** — Queries with overlapping keywords but requiring a different skill
  - Example: If your skill is about "TypeScript type safety", a near-miss might be "Python type hints"
  - Avoid unrelated queries; they're too easy to pass

- **2–4 edge cases** — Boundary queries where behavior is explicitly defined
  - Ambiguous prompts where multiple skills could reasonably apply
  - Use `expect: not:other-skill-name` to clarify which skill should NOT win in a tie

### Run Multiple Times for Nondeterminism

- Run each eval fixture **≥ 3 times** to catch nondeterministic scoring (randomness in stopword filtering, ordering)
- Automate with: `for i in 1 2 3; do node .squad/skills/evals/run-evals.mjs; done`

### Use Train/Validation Split

- **Train set (60%)** — 12 cases used to tune the description and triggers
- **Validation set (40%)** — 8 cases held back to verify the skill generalizes
- Document which cases belong to which set in the fixture's `metadata:` section (if needed for review)

---

## Skill Quality Principles

### Start from Real Expertise

- Extract patterns from actual hands-on tasks, not generic LLM knowledge
- If you haven't used the pattern in production, mark confidence as `low`
- Include gotchas sections for domain-specific corrections and traps

### Keep Skills Focused and Reusable

- **SKILL.md should be ≤500 lines** — Use `references/` subdirectory for overflow (detailed examples, FAQs, runbooks)
- Include what the agent lacks, omit what it already knows (e.g., don't explain "what is TypeScript" in a type-checking skill)
- Favor procedures and patterns over declarations and theory

### Include Validation Loops

- Encourage: do work → validate → fix → repeat
- Provide concrete validation steps (e.g., "run `npm test`", "check output against spec")
- Call out common failure modes and how to debug them

### Domain & Confidence

- Assign a domain (e.g., "testing", "type-safety", "performance") to enable clustering and avoid overlap
- Use confidence levels to gate skill promotions:
  - `low` — New skill, experimental, not validated in production yet
  - `medium` — Validated in ≥1 production session, evals passing, ready for general use
  - `high` — Earned through repeated production use, peer-reviewed, fully battle-tested

---

## Running Validation

### Phase 1: Keyword Matching (Fast, CI-Ready)

```sh
# Validate YAML frontmatter and field rules for all skills
node .squad/skills/evals/validate-schema.mjs

# Run trigger-matching eval suite (exit 0 = ≥80% pass rate)
node .squad/skills/evals/run-evals.mjs
```

Both scripts are pure Node.js ESM with no external dependencies.

### Phase 2: LLM-Based Matching (Accurate, Uses Copilot Models)

For high-confidence skill promotions or before publishing to wider audiences, run the LLM-based eval suite:

```sh
# Dry-run: show which queries would trigger (no API calls)
node .squad/skills/evals/run-llm-evals.mjs --dry-run

# Full run: invoke Copilot model to score trigger relevance (requires credentials)
node .squad/skills/evals/run-llm-evals.mjs
```

Phase 2 catches subtle mismatches that keyword-only scoring might miss (e.g., "I'm debugging a race condition" should trigger the concurrency skill even without the word "concurrency").

---

## References

- **Specification:** [agentskills.io/specification](https://agentskills.io/specification)
- **Guide: Writing Effective Descriptions** — https://agentskills.io/guide/descriptions
- **Guide: Designing Evals** — https://agentskills.io/guide/evals
- **Guide: Skill Quality** — https://agentskills.io/guide/quality

---

## Reviewing Skills

When reviewing a skill PR, use the checklist at [`.squad/templates/skill-review-checklist.md`](../../templates/skill-review-checklist.md).
