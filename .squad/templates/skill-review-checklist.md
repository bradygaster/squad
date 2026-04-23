# Skill Review Checklist

Use this checklist when reviewing skill PRs to ensure quality and consistency with [agentskills.io best practices](https://agentskills.io/specification).

---

## Metadata & Schema

- [ ] **Skill name** matches directory name (lowercase, hyphens only)
- [ ] **Description** is ≤ 1024 characters
- [ ] **Description uses imperative phrasing** — "Use this skill when..." not "This skill does..."
- [ ] **Confidence level** is set (low | medium | high)
- [ ] **Domain** is assigned and non-overlapping with adjacent skills
- [ ] **Frontmatter fields** follow schema placement:
  - Top-level only: `name`, `description`, `license`, `allowed-tools`
  - Inside `metadata:`: `domain`, `confidence`, `source`, `compatibility`, `triggers`, `roles`
  - Non-standard fields also go in `metadata:` block

---

## Description Quality

### User Intent & Applicability

- [ ] Description focuses on **when to use**, not implementation details
- [ ] Description includes **real trigger contexts** (even implicit ones without skill name)
  - Example: "when debugging flaky tests" without requiring the word "testing"
- [ ] Description lists **multiple activation scenarios** (use, when, if you're, if you need to)
- [ ] Description is **"pushy"** — favors false positives over false negatives

### Validation

- [ ] Description was tested with **near-miss queries** during development
- [ ] Examples show skill correctly activates when keywords vary from description

---

## Eval Quality & Completeness

### Case Distribution

- [ ] ≥ 5 **positive cases** (should trigger the skill)
  - [ ] Mix of explicit (skill name mentioned) and implicit (keywords only)
  - [ ] Vary phrasing: "Use this when", "I need to", "How do I", etc.
  - [ ] Test simple and complex variations

- [ ] ≥ 3 **negative cases** (should NOT trigger)
  - [ ] **Near-misses** included — same keywords but different skill applies
  - [ ] NOT just unrelated queries (those are too easy)

- [ ] ≥ 2 **edge cases** (boundary behavior)
  - [ ] Ambiguous prompts with multiple potential matches
  - [ ] Uses `expect: not:other-skill-name` to clarify tiebreaker

### Nondeterminism & Robustness

- [ ] Evals **run 3+ times** consistently
- [ ] No flaky cases that pass/fail randomly

### Train/Validation Split

- [ ] Fixtures use **60% train, 40% validation** split
- [ ] Reviewer can identify which cases are held-back for validation (or documented in PR)

---

## Phase 1: Keyword Matching (Fast)

- [ ] **Schema validation passes**: `node .squad/skills/evals/validate-schema.mjs` exits 0
- [ ] **Keyword evals pass**: `node .squad/skills/evals/run-evals.mjs` shows ≥80% pass rate for this skill

---

## Phase 2: LLM-Based Matching (For High Confidence)

For skills being promoted to `medium` or `high` confidence, or before wider publication:

- [ ] **LLM evals pass**: `node .squad/skills/evals/run-llm-evals.mjs` (if running full mode)
- [ ] **Dry-run evals reviewed**: `node .squad/skills/evals/run-llm-evals.mjs --dry-run` shows reasonable behavior
- [ ] **No obvious LLM mismatches** — Copilot-based scoring aligns with intent

---

## Content Quality

### Structure

- [ ] **Context section** explains when/why skill applies (non-obvious)
- [ ] **Patterns section** includes concrete patterns, conventions, approaches
- [ ] **Examples section** provides code samples or references (not just theory)
- [ ] **Anti-Patterns section** calls out what to avoid

### Domain Specificity

- [ ] Content assumes **agent doesn't know the domain** (no "as you already know...")
- [ ] Content includes **domain-specific gotchas** and traps
- [ ] Content includes **validation loops** (do → validate → fix → repeat)

### Length & Overflow

- [ ] **SKILL.md is ≤500 lines** (rough target; exceptions ok if justified)
- [ ] Overflow content moved to `references/` subdirectory (FAQs, runbooks, detailed examples)

---

## Domain & Confidence

- [ ] **Domain assignment** avoids overlap with related skills
  - Review `.squad/skills/*/SKILL.md` for domain conflicts
- [ ] **Confidence level is justified**:
  - `low` — New skill, not validated in production
  - `medium` — Validated in ≥1 session, evals passing, ready for general use
  - `high` — Earned through repeated use, peer-reviewed, production battle-tested
- [ ] If promoting to `medium` or higher, evidence is cited (sessions, evals, reviews)

---

## Prior to Merge

- [ ] All checks above pass
- [ ] No blockers in automation (CI gates, lint, schema validation)
- [ ] Reviewer adds approval comment (or assigns to another squad member if not their domain)
- [ ] PR description references the skill name and confidence target

---

## Red Flags 🚩

Stop and request changes if:

- ❌ Description uses passive voice ("This skill does") instead of imperative
- ❌ Eval cases are all unrelated negatives (should be near-misses)
- ❌ Positive cases don't cover multiple phrasing variations
- ❌ Train/validation split not documented or 60/40 ratio violated
- ❌ Schema validation or Phase 1 evals fail
- ❌ Domain overlaps significantly with adjacent skills
- ❌ Content assumes reader already knows the domain
- ❌ Confidence promoted without Phase 1 evals or evidence

---

## References

- [agentskills.io/specification](https://agentskills.io/specification) — Formal spec
- [agentskills.io/guide/descriptions](https://agentskills.io/guide/descriptions) — Writing effective descriptions
- [agentskills.io/guide/evals](https://agentskills.io/guide/evals) — Designing eval fixtures
- [agentskills.io/guide/quality](https://agentskills.io/guide/quality) — Skill quality principles
- [Eval Framework README](./../skills/evals/README.md) — Local eval system
- [Contributing Guide](./../skills/CONTRIBUTING.md) — Full contribution workflow
