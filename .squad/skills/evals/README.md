# Skill Eval Framework

Comprehensive eval system for Squad skills with three phases:
1. **Keyword Matching** — fast, deterministic, CI-ready
2. **LLM Trigger + Execution Evals** — quality validation using Copilot CLI models
3. **Description Optimization** — iterative improvement loop

---

## Files

| File | Purpose |
|------|---------|
| `run-evals.mjs` | Phase 1: Fast keyword-matching evals for CI gates (80% threshold) |
| `run-llm-evals.mjs` | Phase 2: LLM-based trigger and execution evals with configurable runs and train/validation split |
| `validate-schema.mjs` | Validates YAML frontmatter for all skills |
| `*.eval.yaml` | Phase 1 trigger-matching fixtures — one file per skill |
| `*.exec-eval.yaml` | Phase 2 execution evals — test actual skill output quality |

---

## Three-Phase Eval System

### Phase 1: Keyword Matching (`run-evals.mjs`)

Fast, deterministic evaluation using weighted keyword scoring. Suitable for CI gates and regression testing.

**When to use:** Continuous integration, quick feedback loops, ensuring skills remain discoverable.

**Algorithm:** Scores prompts against skill name and description via weighted keywords (see [Scoring Algorithm](#scoring-algorithm) below). The skill with the highest score must match expectations.

**Pass threshold:** 80% across all fixtures

```bash
node .squad/skills/evals/run-evals.mjs
```

---

### Phase 2: LLM Trigger + Execution Evals (`run-llm-evals.mjs`)

Uses Copilot CLI models for reasoning-based evaluation. Tests either which skill the LLM selects (trigger) or whether a skill produces correct output (execution).

**When to use:** Quality validation, description optimization, stress-testing edge cases, evaluating LLM nondeterminism.

**Trigger Mode** (`--type trigger`):
- Tests which skill the LLM selects given a prompt
- Validates that skill descriptions properly guide LLM routing
- Uses trigger eval fixtures (`.eval.yaml` format)
- Useful for finding description gaps or overlaps

**Execution Mode** (`--type exec`):
- Tests whether a skill produces correct output for a given prompt
- Compares actual output against expected output using LLM-as-judge
- Uses execution eval fixtures (`.exec-eval.yaml` format)
- Graded based on assertions defined in the fixture

**Options:**
- `--type trigger|exec` — Which evaluation mode to run
- `--dry-run` — Print prompts without calling the LLM
- `--model <name>` — LLM model to use (default: claude-haiku-4.5)
- `--runs N` — Run each case N times to test for nondeterminism (default: 1, use 3+ for variance testing)
- `--split` — Split cases 60/40 train/validation and report both sets separately
- `--skill <name>` — Only run evals for the specified skill
- `--batch N` — Process at most N cases

```bash
# Dry run before actual evaluation
node .squad/skills/evals/run-llm-evals.mjs --type trigger --dry-run

# Test trigger matching with 3 runs (nondeterminism testing)
node .squad/skills/evals/run-llm-evals.mjs --type trigger --runs 3

# Test execution quality
node .squad/skills/evals/run-llm-evals.mjs --type exec --dry-run
node .squad/skills/evals/run-llm-evals.mjs --type exec --runs 3

# Test with train/validation split to prevent overfitting
node .squad/skills/evals/run-llm-evals.mjs --type trigger --split --runs 3
```

---

### Phase 3: Description Optimization (`optimize-description.mjs`)

Iterative loop that identifies failing test cases, uses an LLM to generate improved descriptions, and re-evaluates.

**When to use:** Improving skill trigger accuracy, reducing false negatives or false positives.

**Workflow:**
1. Run Phase 2 evals and identify failures
2. LLM analyzes failures and generates improved description
3. Re-run evals with new description
4. Train/validation split prevents overfitting to specific cases

**Options:**
- `--skill <name>` — Which skill to optimize
- `--iterations N` — How many optimization cycles to run (default: 3)
- `--dry-run` — Preview changes without writing

```bash
# Preview optimization for a skill
node .squad/skills/evals/optimize-description.mjs --skill model-selection --dry-run

# Run optimization (uses train/validation split internally)
node .squad/skills/evals/optimize-description.mjs --skill model-selection --iterations 3
```

---

## Eval Fixture Formats

### Trigger Eval (`.eval.yaml`)

Tests whether the skill is recognized by keyword matching (Phase 1) and LLM routing (Phase 2).

```yaml
skill: skill-name
cases:
  - id: "skill-name-pos-01"
    prompt: "user message describing what they want"
    type: positive          # positive | negative | edge
    expect: match           # match | no-match | not:other-skill-name
    reason: "Why this case matters"
    category: "positive"    # optional: for grouping
    notes: "additional context"
```

**Case Types:**

| Type | Meaning | Expect Values |
|------|---------|---------------|
| `positive` | Prompt SHOULD trigger this skill | `match` — skill must score highest |
| `negative` | Prompt should NOT trigger this skill | `no-match` — skill must not score highest; `not:other-skill` — specific skill must lose |
| `edge` | Ambiguous or boundary case | `match` or `no-match` depending on intended behavior |

**Minimum Requirements:**
- ≥ 5 positive cases
- ≥ 3 negative cases
- ≥ 2 edge cases

---

### Execution Eval (`.exec-eval.yaml`)

Tests whether a skill produces correct output (Phase 2, execution mode only).

```yaml
skill: skill-name
cases:
  - id: "skill-name-exec-01"
    prompt: "user request to the skill"
    skill_context: "full"   # "full" | "minimal" — how much context to provide the skill
    expected_output: "description of what correct output looks like"
    assertions:
      - "Verifiable statement about the output"
      - "Another specific claim the output should make"
    category: "execution"
    notes: "why this matters"
```

**Assertions Guide:**

Write assertions that are specific, verifiable, and testable by an LLM:

✅ **Good assertions:**
- "Recommends claude-sonnet-4.6 for code tasks"
- "Lists at least 3 pre-publish checks"
- "Explains the train/validation split for preventing overfitting"
- "Does NOT suggest npm -w for publishing"

❌ **Bad assertions:**
- "Output is correct" — too vague
- "Uses exact phrase 'Layer 3'" — too brittle (exact wording matters)
- "Mentions optimization" — not specific enough

**Minimum Requirements:**
- ≥ 3 assertions per case
- Assertions must be falsifiable (LLM can determine true/false)

---

## Scoring Algorithm (Phase 1)

Weighted keyword matching scored against skill name and description:

| Signal | Weight |
|--------|--------|
| Exact skill name substring in prompt | +5 |
| Each word from skill name found in prompt | +3 |
| Each word from description found in prompt | +1 |

**Stopwords ignored:** the, a, an, is, it, to, for, and, or, of, in, on, with, this, that, when, how, do, does, what, which, should, can, my, i, we, you

The skill with the highest total score wins. For `expect: match`, the target skill must be the top scorer.

---

## Writing Good Eval Prompts

### Trigger Evals

**Vary phrasing:**
```yaml
# Same intent, different language
- prompt: "Model selection: apply the hierarchy"         # Direct
- prompt: "Which LLM should I use for this task?"        # Question
- prompt: "Use the model selection policy"                # Direct phrasing variant
```

**Vary explicitness:**
```yaml
# Explicit skill name
- prompt: "Apply the model-selection skill to choose an LLM"
# Implicit (domain context)
- prompt: "For architectural reasoning, which LLM is best?"
```

**Include realistic context:**
```yaml
- prompt: "In my agent spawner at squad/agents/code-review/agent.yaml, which model should run?"
- prompt: "We're seeing slowness with haiku on complex tasks — model selection help?"
```

**Near-miss negatives (test boundaries):**
```yaml
# economy-mode skill should win, not model-selection
- prompt: "Enable economy mode to save on LLM costs"
# Different 'model' context (data modeling, not LLM)
- prompt: "Design a data model for the user entity"
```

### Execution Evals

**Test accuracy:**
```yaml
- prompt: "Explain the three-phase eval system"
  expected_output: "Clear explanation of keyword matching, LLM evals, and optimization"
  assertions:
    - "Describes all three phases"
    - "Explains when to use each phase"
```

**Test edge cases:**
```yaml
- prompt: "How would you optimize a skill with very low LLM trigger accuracy?"
  expected_output: "Mentions Phase 3 optimization loop and train/validation split"
  assertions:
    - "Recommends using train/validation split"
    - "Does NOT just say 'rewrite the description'"
```

---

## Running Evals

```bash
# Validate all skill schemas first
node .squad/skills/evals/validate-schema.mjs

# Phase 1 — Keyword matching (fast, CI-ready)
node .squad/skills/evals/run-evals.mjs

# Phase 2 — LLM trigger matching
node .squad/skills/evals/run-llm-evals.mjs --type trigger --dry-run
node .squad/skills/evals/run-llm-evals.mjs --type trigger --runs 3

# Phase 2 — LLM execution evals
node .squad/skills/evals/run-llm-evals.mjs --type exec --dry-run
node .squad/skills/evals/run-llm-evals.mjs --type exec --runs 3 --split

# Phase 3 — Description optimization
node .squad/skills/evals/optimize-description.mjs --skill model-selection --dry-run
node .squad/skills/evals/optimize-description.mjs --skill model-selection --iterations 3
```

All scripts are pure Node.js ESM — no `npm install` required.

---

## Adding a New Trigger Eval Fixture

1. Create `.squad/skills/evals/{skill-name}.eval.yaml`
2. Set `skill:` to the exact `name` from the skill's YAML frontmatter
3. Write ≥ 5 positive, ≥ 3 negative, ≥ 2 edge cases following the format above
4. Run Phase 1 validation: `node .squad/skills/evals/run-evals.mjs`
5. Confirm the skill reaches ≥ 80% pass rate

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full workflow.

---

## Adding a New Execution Eval Fixture

1. Create `.squad/skills/evals/{skill-name}.exec-eval.yaml`
2. Set `skill:` to the exact `name` from the skill's YAML frontmatter
3. Write cases with realistic prompts, expected outputs, and ≥ 3 specific assertions
4. Run Phase 2: `node .squad/skills/evals/run-llm-evals.mjs --type exec --dry-run`
5. Review LLM grading, refine assertions if needed, then run with actual model

---

## References

- [Agent Skills Specification](https://agentskills.io/specification)
- [Evaluating Skills](https://agentskills.io/skill-creation/evaluating-skills)
- [Optimizing Descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
