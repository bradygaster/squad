---
title: Model Pinning for Cost Optimization
description: Control which AI models your Squad agents use — per-agent, per-session, or project-wide — to optimize costs without sacrificing quality.
order: 35
---

# Model Pinning for Cost Optimization

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Different agents have different needs. Your **Scribe** just writes documentation — it doesn't need premium reasoning. Your **Code Lead** solves complex architectural problems — it absolutely needs top-tier reasoning. But if you're running all agents on the same model, you're paying premium prices across the board.

**Model pinning** solves this: assign cheaper models to agents that don't need them, reserve premium models for the agents doing heavy lifting. Teams cut their model costs by 40–60% without sacrificing agent quality.

> **Related:** [Per-Agent Model Selection](/features/model-selection) covers runtime directives and auto-selection. This page focuses on persistent configuration for cost optimization.

---

## Quick start

Set a project-wide default and override individual agents:

```bash
# Set Sonnet as the default for all agents
squad config model claude-sonnet-4.5

# Pin Scribe to Haiku (cheaper — it only writes docs)
squad config model claude-haiku-4.5 --agent scribe

# Pin Tester to Haiku (cheaper — simple test scaffolding)
squad config model claude-haiku-4.5 --agent tester
```

Verify your configuration:

```bash
squad config model
```

```
Model configuration:
  Default model: claude-sonnet-4.5

  Agent overrides:
    scribe → claude-haiku-4.5
    tester → claude-haiku-4.5
```

That's it — your Scribe and Tester now run on cheaper models. Code Lead and Researcher get Sonnet-level reasoning. You've balanced cost with capability.

---

## Configuration layers

Squad resolves which model to use through a 5-layer hierarchy. First match wins:

| Layer | Source | Scope | Persistence |
|-------|--------|-------|-------------|
| **0 — Persistent config** | `.squad/config.json` | Per-agent or global | Survives across sessions |
| **1 — Session directive** | "Use opus for this session" | All agents in session | Until session ends |
| **2 — Charter preference** | Agent's `## Model` section | Single agent | Until charter changes |
| **3 — Task-aware auto-selection** | Coordinator logic | Per-task | Dynamic |
| **4 — Default** | `claude-haiku-4.5` | Global | Always |

**Layer 0** (persistent config) is what this page focuses on — it's the primary lever for cost optimization.

### What the config file looks like

Squad stores your model preferences in `.squad/config.json`:

```json
{
  "version": 1,
  "defaultModel": "claude-sonnet-4.6",
  "agentModelOverrides": {
    "scribe": "claude-haiku-4.5",
    "tester": "claude-haiku-4.5"
  }
}
```

- **`defaultModel`** — applies to ALL agents unless overridden. Set with "always use X".
- **`agentModelOverrides`** — per-agent overrides. Set with "use X for {agent}".
- **Clear with** "switch back to automatic" — removes `defaultModel` and returns to auto-selection.

---

## Per-agent overrides

Pin specific agents to specific models using the CLI or natural language:

### CLI commands

```bash
# Set global default
squad config model claude-sonnet-4.5

# Pin an agent to a specific model
squad config model claude-haiku-4.5 --agent scribe

# Clear the global default (revert to auto-selection)
squad config model --clear

# Clear a specific agent's override
squad config model --clear --agent scribe
```

### Natural language (in a session)

You can also set model preferences conversationally:

- **"Always use Opus"** — writes `defaultModel` to `.squad/config.json`
- **"Use Haiku for Scribe"** — writes to `agentModelOverrides.scribe`
- **"Switch back to automatic"** — removes `defaultModel`, returns to auto-selection

Squad acknowledges each change:

```
✅ Model preference saved: claude-opus-4.6 — all future sessions will use this until changed.
```

```
✅ Scribe will always use claude-haiku-4.5 — saved to config.
```

```
✅ Model preference cleared — returning to automatic selection.
```

---

## Cost-first principle

The governing rule for model selection: **cost first, unless code is being written.**

This means Squad automatically routes non-code work to cheaper models — you only pay for premium reasoning when agents are writing code.

| Task output | Model | Tier | Rule |
|-------------|-------|------|------|
| Writing code (implementation, refactoring, tests, bug fixes) | `claude-sonnet-4.6` | Standard | Quality and accuracy matter for code |
| Writing prompts or agent designs | `claude-sonnet-4.6` | Standard | Prompts are executable — treat like code |
| Non-code work (docs, planning, triage, logs, changelogs) | `claude-haiku-4.5` | Fast | Cost first — Haiku handles non-code tasks |
| Visual/design work requiring image analysis | `claude-opus-4.6` | Premium | Vision capability required — overrides cost rule |

If nothing else matches, Squad defaults to `claude-haiku-4.5`. Cost wins when in doubt, unless code is being produced.

---

## Role-to-model mapping

Each agent role maps to a default model based on what that role typically does:

| Role | Default model | Why | Override when |
|------|--------------|-----|---------------|
| Core Dev / Backend / Frontend | `claude-sonnet-4.6` | Writes code — quality first | Heavy code gen → `gpt-5.3-codex` |
| Tester / QA | `claude-sonnet-4.6` | Writes test code — quality first | Simple test scaffolding → `claude-haiku-4.5` |
| Lead / Architect | auto (per-task) | Mixed: code review needs quality, planning needs cost | Architecture proposals → premium; triage → haiku |
| Prompt Engineer | auto (per-task) | Prompt design is like code, research is not | Prompt architecture → sonnet; research → haiku |
| SDK Expert | `claude-sonnet-4.6` | Technical analysis that often touches code | Pure research → `claude-haiku-4.5` |
| Designer / Visual | `claude-opus-4.6` | Vision-capable model required | Never downgrade — vision is non-negotiable |
| DevRel / Writer | `claude-haiku-4.5` | Docs and writing — not code | — |
| Scribe / Logger | `claude-haiku-4.5` | Mechanical file ops — cheapest possible | Never bump Scribe |
| Git / Release | `claude-haiku-4.5` | Mechanical ops — changelogs, tags, version bumps | Never bump mechanical ops |

---

## Task complexity adjustments

Sometimes the default model isn't the right fit. Squad applies at most ONE complexity adjustment per task:

- **Bump UP to premium:** Architecture proposals, reviewer gates, security audits, multi-agent coordination (output feeds 3+ agents)
- **Bump DOWN to fast/cheap:** Typo fixes, renames, boilerplate, scaffolding, changelogs, version bumps
- **Switch to code specialist (`gpt-5.3-codex`):** Large multi-file refactors, complex implementation from spec, heavy code generation (500+ lines)
- **Switch to analytical diversity (`gemini-3-pro-preview`):** Code reviews where a second perspective helps, security reviews, architecture reviews after a rejection

---

## Session directives

Override the model for a single session without changing persistent config:

```
use opus for this session
```

```
save costs — use haiku for everything
```

```
have all agents use sonnet for the rest of this session
```

Session directives apply to all agents until the session ends or you contradict them. They take precedence over charter preferences and auto-selection (layers 2–4), but persistent config (layer 0) still wins.

To go back to automatic selection mid-session:

```
switch back to automatic model selection
```

> **Tip:** Use session directives for one-off situations — a docs sprint where you want everything on Haiku, or an architecture review where you want everything on Opus.

---

## Fallback chains

If a model is unavailable (plan restriction, org policy, rate limit, or deprecation), Squad silently retries with the next model in chain. You don't see the retries — your agent just works.

```
Premium:  claude-opus-4.6 → claude-opus-4.6-fast → claude-opus-4.5 → claude-sonnet-4.6
Standard: claude-sonnet-4.6 → gpt-5.4 → claude-sonnet-4.5 → gpt-5.3-codex → claude-sonnet-4 → gpt-5.2
Fast:     claude-haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini
```

**Rules:**
- Never falls back UP in tier — a fast/cheap task won't land on a premium model
- If the entire chain is exhausted, Squad falls back to `claude-haiku-4.5` (nuclear fallback) with up to 3 retries
- If you specified a provider ("use Claude"), Squad falls back within that provider first

---

## Practical examples

### Save costs on a docs sprint

Pin every agent to Haiku for a session of documentation work:

```
switch to haiku — I'm doing a docs sprint and want to save costs
```

Or make it persistent:

```bash
squad config model claude-haiku-4.5
```

### Bump quality for an architecture review

Override to premium for a high-stakes architecture discussion:

```
use opus for this architecture review
```

Or pin your architect permanently:

```bash
squad config model claude-opus-4.6 --agent flight
```

### Mixed-tier team strategy

Set up a 4-agent team with cost-conscious pinning:

```bash
# Sonnet as the default for code-writing agents
squad config model claude-sonnet-4.5

# Haiku for non-code agents
squad config model claude-haiku-4.5 --agent scribe
squad config model claude-haiku-4.5 --agent tester
```

Result: Code Lead and Researcher get Sonnet-level reasoning. Scribe and Tester run on Haiku. You've cut costs on half your agents without sacrificing code quality.

### Available models

Squad supports models across three tiers:

| Tier | Models |
|------|--------|
| **Premium** | `claude-opus-4.6`, `claude-opus-4.6-fast`, `claude-opus-4.5` |
| **Standard** | `claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-sonnet-4`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex`, `gpt-5.1`, `gemini-3-pro-preview` |
| **Fast/Cheap** | `claude-haiku-4.5`, `gpt-5.1-codex-mini`, `gpt-5-mini`, `gpt-4.1` |

---

## What's next

This page covers persistent model pinning via `config.json` and the CLI. For runtime model switching, see [Per-Agent Model Selection](/features/model-selection). For economy mode (automatic cost reduction under rate pressure), see the economy mode section on that page.
