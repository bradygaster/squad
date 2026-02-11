# Per-Agent Model Selection

Squad routes each agent to the right model based on what they're doing — not a one-size-fits-all default. The governing principle: **cost first, unless code is being written.**

## How It Works

Model selection uses a layered system. First match wins:

1. **User Override** — You said "use opus" or "save costs"? Done. Session-wide directives persist until contradicted.
2. **Charter Preference** — The agent's charter specifies a `## Model` section with a preferred model.
3. **Task-Aware Auto-Selection** — The coordinator checks what the agent is actually doing:

| Task Output | Model | Tier |
|-------------|-------|------|
| Writing code (implementation, refactoring, tests, bug fixes) | `claude-sonnet-4.5` | Standard |
| Writing prompts or agent designs | `claude-sonnet-4.5` | Standard |
| Non-code work (docs, planning, triage, changelogs) | `claude-haiku-4.5` | Fast |
| Visual/design work requiring image analysis | `claude-opus-4.5` | Premium |

4. **Default** — If nothing matched, `claude-haiku-4.5`. Cost wins when in doubt.

## Role-to-Model Mapping

| Role | Default Model | Why |
|------|--------------|-----|
| Core Dev / Backend / Frontend | `claude-sonnet-4.5` | Writes code — quality first |
| Tester / QA | `claude-sonnet-4.5` | Writes test code |
| Lead / Architect | auto (per-task) | Mixed: code review vs. planning |
| Prompt Engineer | auto (per-task) | Prompt design is like code |
| DevRel / Writer | `claude-haiku-4.5` | Docs — not code |
| Scribe / Logger | `claude-haiku-4.5` | Mechanical file ops |
| Git / Release | `claude-haiku-4.5` | Changelogs, tags, version bumps |
| Designer / Visual | `claude-opus-4.5` | Vision capability required |

## 16-Model Catalog

Squad supports 16 models across three tiers:

- **Premium:** claude-opus-4.6, claude-opus-4.6-fast, claude-opus-4.5
- **Standard:** claude-sonnet-4.5, gpt-5.2-codex, claude-sonnet-4, gpt-5.2, gpt-5.1-codex, gpt-5.1, gpt-5, gemini-3-pro-preview
- **Fast/Cheap:** claude-haiku-4.5, gpt-5.1-codex-mini, gpt-4.1, gpt-5-mini, gpt-5.1-codex-mini

## Fallback Chains

If a model is unavailable (plan restriction, rate limit, deprecation), Squad silently retries with the next in chain:

```
Premium:  claude-opus-4.6 → claude-opus-4.6-fast → claude-opus-4.5 → claude-sonnet-4.5
Standard: claude-sonnet-4.5 → gpt-5.2-codex → claude-sonnet-4 → gpt-5.2
Fast:     claude-haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini
```

Never falls back UP in tier — a fast task won't land on a premium model.

## User Overrides

Tell the coordinator what you want:

- `"use opus for this"` — one-off premium
- `"always use haiku"` — session-wide cost savings
- `"use gpt-5.2-codex for Fenster"` — agent-specific override
