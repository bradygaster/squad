# Squad Evals

End-to-end evaluations for the Squad SDK using [@microsoft/vally](https://www.npmjs.com/package/@microsoft/vally-cli).

## Philosophy

These evals test **real agent behavior** — not SDK functions in isolation.
Each eval sends real user prompts to a Copilot agent configured with Squad
skills and fixtures, then grades the agent's actual responses using built-in
vally graders.

**What these evals are NOT:**
- Unit tests of SDK functions (those belong in `packages/squad-sdk/test/`)
- Reading comprehension tests ("given X.md, what should happen?")
- Mock-based synthetic checks

## Eval Suites

| Suite | What it tests |
|-------|---------------|
| `routing` | Given real prompts, does the agent route to the correct squad member? |
| `skill-invocation` | Given task prompts, does the agent apply the right skills? |
| `task-completion` | Given development prompts, does the agent produce working solutions? |

## Running Evals

### Prerequisites

- Node.js 22.5+
- `@microsoft/vally-cli` installed (workspace devDependency)
- Copilot SDK credentials (for `copilot-sdk` executor)

### Run all evals

```bash
npx vally eval --eval-spec evals/routing/eval.yaml --eval-spec evals/skill-invocation/eval.yaml --eval-spec evals/task-completion/eval.yaml
```

### Run a single suite

```bash
npx vally eval --eval-spec evals/routing/eval.yaml
npx vally eval --eval-spec evals/skill-invocation/eval.yaml
npx vally eval --eval-spec evals/task-completion/eval.yaml
```

### Schema validation (no credentials needed)

```bash
npx vally lint --eval evals/
```

## Structure

```
evals/
├── README.md
├── routing/
│   ├── eval.yaml           # Eval definition
│   └── fixtures/           # Squad workspace fixtures
│       ├── team.md
│       ├── routing.md
│       └── agents/         # Agent charters
├── skill-invocation/
│   ├── eval.yaml
│   └── fixtures/
│       ├── team.md
│       ├── routing.md
│       └── skills/         # Skill definitions (SKILL.md)
└── task-completion/
    ├── eval.yaml
    └── fixtures/
        ├── team.md
        ├── routing.md
        └── agents/
```

## Adding New Evals

1. Create a directory under `evals/`
2. Add an `eval.yaml` following the [vally eval schema](https://www.npmjs.com/package/@microsoft/vally)
3. Add fixtures in a `fixtures/` subdirectory
4. Use built-in graders: `output-matches`, `output-contains`, `skill-invocation`, `tool-call`, `prompt`, `pairwise`
5. Write real user prompts — no "Given the rules in X.md" preambles

## Grading

| Grader | Use for |
|--------|---------|
| `output-matches` | Regex match on agent output (fast, deterministic) |
| `output-contains` | Substring check (simpler than regex) |
| `prompt` | LLM-as-judge using rubric criteria |
| `pairwise` | Comparative grading between outputs |
| `skill-invocation` | Check which skills were/weren't called |
| `tool-call` | Check which tools were/weren't called |

## CI

Evals run in a dedicated workflow (`.github/workflows/evals.yml`) that:
- Triggers on changes to `evals/` or `packages/squad-sdk/src/`
- Requires Copilot SDK credentials (repository secret)
- Reports scores as PR comments
- Does NOT block merge — evals are advisory
