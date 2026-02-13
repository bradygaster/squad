# Proposal 024: Per-Agent Model Selection

**Status:** Approved ✅  
**Authors:** Verbal (original design + algorithm), Kujan (model catalog research), Keaton (consolidation + approval)  
**Date:** 2026-02-08 (original), 2026-02-10 (consolidated)  
**Sprint:** v0.3.0 Wave 1, Items 4.1–4.4  
**Companion documents:** [024a — Model Catalog](024a-model-catalog.md) (full 8-dimension analysis), [024b — Algorithm Detail](024b-model-selection-algorithm.md) (design rationale + integration notes)

---

## Problem

Every agent spawn uses the same model — `claude-sonnet-4` via `general-purpose` agent type. This is wrong for at least three cases:

1. **Capability mismatch.** Redfoot (Graphic Designer) needs a vision-capable model to reason about imagery, color systems, and visual composition. Claude Sonnet is a text-first model. Spawning Redfoot on Sonnet is like hiring a painter and handing them a typewriter.

2. **Cost mismatch.** Scribe merges inbox files into `decisions.md` — mechanical file manipulation. Burning premium Sonnet tokens on Scribe is like flying first class to the mailbox. Haiku handles this in a fraction of the cost and latency.

3. **Depth mismatch.** Keaton (Lead) making an architecture decision that propagates across 8 agents and 3 sprints should get Opus-tier reasoning. A quick test scaffold from Hockney doesn't need that depth. One-size-fits-all wastes money on simple tasks and undersells complex ones.

Brady's directive: *"We don't want Redfoot using Claude Sonnet to design imagery."* The model must match the agent's capabilities.

---

## Design

### Selection Priority (4-Layer)

The coordinator resolves a model for every spawn. Four layers, checked in order. First match wins.

| Priority | Source | Example | Override Behavior |
|----------|--------|---------|-------------------|
| **1. User Override** | User explicitly names a model or gives a budget/quality directive | "Use opus for this" / "Save costs" | Overrides all other layers. Session-wide directives persist until contradicted. |
| **2. Charter Preference** | Agent's charter `## Model` section with `Preferred` ≠ `auto` | `Preferred: claude-opus-4.5` (Designer needs vision) | Agent declared its own needs with rationale. |
| **3. Task-Aware Auto-Selection** | Coordinator evaluates role + task characteristics → picks best model | Lead doing architecture proposal → bumped to premium | The core algorithm. See below. |
| **4. Default Fallback** | No other layer matched | Any agent, any task | `claude-sonnet-4.5`. Always works with zero configuration. |

**Layer 1 — User override detection:**
- Explicit model name: "use claude-opus-4.6", "spawn on haiku", "use gpt-5.2-codex"
- Budget directives: "save costs" → drop all non-essential spawns to fast/cheap tier
- Quality directives: "use the best model" → bump all spawns to premium tier
- Per-agent override: "use opus for Keaton" → applies only to that agent
- Session-wide: "always use sonnet" → applies to all spawns until contradicted

### Task-Aware Auto-Selection Logic

When Layers 1–2 don't apply, the coordinator uses role + task signals. This is the 80% case.

**Step 1 — Role-Based Default:**

| Role Category | Default Model | Tier | Why |
|---------------|--------------|------|-----|
| Lead / Architect | `claude-sonnet-4.5` | Standard | Strong reasoning + balanced cost. Bumped to premium for proposals. |
| Core Dev / Backend / Frontend | `claude-sonnet-4.5` | Standard | Best general code generation quality at reasonable cost. |
| Tester / QA | `claude-haiku-4.5` | Fast | Test generation is structured, pattern-heavy. Speed > depth. |
| Designer / Visual | `claude-opus-4.5` | Premium | Vision-capable. Required for image analysis and visual reasoning. |
| DevRel / Writer | `claude-sonnet-4.5` | Standard | Prose quality needs solid reasoning. Not as deep as architecture. |
| Scribe / Logger | `claude-haiku-4.5` | Fast | Mechanical file operations. Speed and cost matter, depth doesn't. |
| Platform / Infra | `claude-sonnet-4.5` | Standard | Platform analysis needs standard reasoning. |
| Prompt Engineer | `claude-sonnet-4.5` | Standard | Meta-reasoning about agents. Bumped to premium for complex designs. |
| Reviewer | `claude-sonnet-4.5` | Standard | Judgment calls. Bumped to premium for gate decisions. |
| Git / Release | `claude-haiku-4.5` | Fast | Mechanical operations. Changelogs, tags, version bumps. |

**Step 2 — Task Complexity Override** (apply at most ONE — no cascading):

- **Bump UP to premium:** architecture proposals, reviewer gates, security audits, multi-agent coordination (output feeds 3+ agents), design system architecture, complex prompt architecture
- **Bump DOWN to fast/cheap:** typo fixes, renames, boilerplate, scaffolding, changelogs, version bumps, mechanical file operations
- **Switch to code specialist (`gpt-5.2-codex`):** large multi-file refactors, complex implementation from detailed spec, heavy code generation (500+ lines)
- **Switch to analytical diversity (`gemini-3-pro-preview`):** code reviews where a second perspective helps, security reviews, architecture reviews after a rejection

**Step 3 — Provider Diversity Triggers** (optional — a tool, not a religion):

| Trigger | Consider | Why |
|---------|----------|-----|
| Code review (not implementation) | `gemini-3-pro-preview` | Different training data catches different issues. |
| Heavy code generation (multi-file) | `gpt-5.2-codex` | OpenAI Codex variants optimized for code generation. |
| Second-opinion after a rejection | Different provider than original reviewer | Cognitive diversity on re-review. |

**When NOT to diversify:** first-time spawns with complex charters (stick to Anthropic — charters are Anthropic-optimized), Scribe or mechanical tasks (use cheapest), when user set a provider preference.

### Charter Template — `## Model` Section

Add to `templates/charter.md` after `## Boundaries`, before `## Collaboration`:

```markdown
## Model

- **Preferred:** auto
- **Rationale:** Coordinator selects the best model based on role and task complexity
- **Fallback:** Standard chain — the coordinator handles fallback automatically
```

| Field | Values | Meaning |
|-------|--------|---------|
| `Preferred` | A valid model ID (e.g., `claude-opus-4.5`) or `auto` | The model this agent should spawn on. `auto` delegates to auto-selection. |
| `Rationale` | Free text | Why this model. Forces justification. Prevents "opus for everything" cargo-culting. |
| `Fallback` | `Premium chain`, `Standard chain`, `Fast chain` | Which fallback chain when preferred model is unavailable. Defaults to the chain matching the preferred model's tier. |

**Examples:**

```markdown
## Model
- **Preferred:** claude-opus-4.5
- **Rationale:** Vision-capable model required for image analysis, color reasoning, visual composition
- **Fallback:** Premium chain
```

```markdown
## Model
- **Preferred:** claude-haiku-4.5
- **Rationale:** Mechanical file operations — speed and cost matter, depth doesn't
- **Fallback:** Fast chain
```

### Registry Integration

Add a `model` field to `casting/registry.json` entries:

```json
{
  "redfoot": {
    "persistent_name": "Redfoot",
    "model": "claude-opus-4.5"
  },
  "hockney": {
    "persistent_name": "Hockney",
    "model": "claude-haiku-4.5"
  }
}
```

**Resolution order:** User override → Charter `## Model` → Registry `model` → Auto-selection.

Charter wins over registry on conflict. The agent's self-declared needs (with rationale) are more authoritative than the casting-time default. Registry exists for the team-level view — the coordinator reads it during routing to quickly see model assignments without opening every charter.

### Delegation Support

Model selection works for **every spawn path:**

- **Coordinator → Agent:** Full 4-layer algorithm. The primary path.
- **Agent → Sub-agent:** Read target's charter `## Model` → use `Preferred` value. If `auto` or missing, omit `model` parameter (platform default). Agents don't need the full auto-selection algorithm.
- **Ceremony → Agent:** Coordinator controls these spawns. Same as coordinator → agent.

**Key principle:** The charter `## Model` field travels with the agent. Anyone spawning that agent reads the same charter and gets the same model preference.

---

## Model Catalog

16 models across 3 providers. Full characterization in [Proposal 024a](024a-model-catalog.md).

| Model ID | Provider | Tier | Best Fit |
|----------|----------|------|----------|
| `claude-opus-4.6` | Anthropic | Premium | Deepest reasoning. Architecture proposals, reviewer gates, complex cross-cutting decisions. |
| `claude-opus-4.6-fast` | Anthropic | Premium | Time-sensitive premium work. Reviews with deadlines, quick architecture gut-checks. |
| `claude-opus-4.5` | Anthropic | Premium | Vision-capable. Designer/Visual roles, creative + analytical reasoning. |
| `claude-sonnet-4.5` | Anthropic | Standard | The workhorse. Core Dev, Backend, Frontend, DevRel, Platform. Best balance of quality/speed/cost. |
| `claude-sonnet-4` | Anthropic | Standard | Previous-gen fallback. Reliable when Sonnet 4.5 specific behavior is needed. |
| `claude-haiku-4.5` | Anthropic | Fast | Fastest, cheapest. Scribe, Tester, simple code tasks, mechanical ops. |
| `gpt-5.2-codex` | OpenAI | Standard | Heavy code generation. Large refactors, multi-file implementations. |
| `gpt-5.2` | OpenAI | Standard | General OpenAI alternative. Provider diversity for non-code tasks. |
| `gpt-5.1-codex-max` | OpenAI | Standard | Hard code problems. Complex debugging, large-scale codebase analysis. |
| `gpt-5.1-codex` | OpenAI | Standard | Proven code-focused. Cross-provider diversity for code-heavy work. |
| `gpt-5.1` | OpenAI | Standard | Solid general-purpose fallback in the OpenAI family. |
| `gpt-5` | OpenAI | Standard | Legacy compatibility. Predictable, well-understood behavior. |
| `gpt-5.1-codex-mini` | OpenAI | Fast | Budget code tasks. Simple scaffolding, boilerplate. Code-aware but cheap. |
| `gpt-5-mini` | OpenAI | Fast | Fastest OpenAI. Mechanical tasks where OpenAI provider is preferred. |
| `gpt-4.1` | OpenAI | Fast | Ultra-budget. Structured output, well-understood behavior at lowest cost. |
| `gemini-3-pro-preview` | Google | Standard | Cross-provider reviews, analytical diversity. Different "perspective" on problems. |

**Default models by tier:**
- **Premium:** `claude-opus-4.6` — deepest reasoning available
- **Standard:** `claude-sonnet-4.5` — best balance of quality, speed, cost
- **Fast/Cheap:** `claude-haiku-4.5` — fastest, cheapest, capable enough for structured tasks

---

## Fallback Resilience

**This is the most important section.** Brady's critical directive: the system must NOT break when a model is unavailable. Models may be blocked by Copilot plan restrictions, org policy, regional availability, deprecation, rate limiting, or any other reason.

### Detection

The coordinator detects model unavailability when:
1. Spawn returns an error message mentioning the model, availability, or access
2. Agent completes instantly with no meaningful work and an error in its output
3. Platform rejects the model parameter before the agent starts

On any of these signals: **do not narrate the failure.** Silently retry with the next model in the fallback chain.

### Fallback Chains by Tier

Each tier has an ordered fallback chain. The coordinator walks the chain top-to-bottom. Cross-provider by design — if an Anthropic model fails, the next attempt is often OpenAI, handling provider-wide outages, not just single-model issues.

```
Premium Chain:
  claude-opus-4.6
  → claude-opus-4.6-fast
  → claude-opus-4.5
  → claude-sonnet-4.5
  → (omit model param)

Standard Chain:
  claude-sonnet-4.5
  → gpt-5.2-codex
  → claude-sonnet-4
  → gpt-5.2
  → (omit model param)

Fast/Cheap Chain:
  claude-haiku-4.5
  → gpt-5.1-codex-mini
  → gpt-4.1
  → gpt-5-mini
  → (omit model param)
```

### Fallback Rules

1. **Maximum 3 retries.** If the first 3 models in a chain fail, skip directly to `(omit model param)`. Don't burn time walking a 5-model chain.
2. **Silent by default.** The user sees the final successful spawn, not the failures. The coordinator does NOT say "Tried X, failed. Trying Y..."
3. **Log failures internally.** When a fallback occurs, note it in the orchestration log: `Model fallback: claude-opus-4.6 → claude-sonnet-4.5 (original unavailable)`. Internal only — user doesn't see it unless they ask.
4. **Respect user provider preferences.** If the user said "use Claude," fall back within Anthropic only: `opus-4.6 → opus-4.6-fast → opus-4.5 → sonnet-4.5 → sonnet-4 → (omit model param)`. Don't cross to GPT unless the user didn't specify a provider.
5. **Never fall back UP in tier.** A fast/cheap fallback should not land on a premium model. Chains are tier-scoped.

### Nuclear Fallback

`(omit model param)` — calling the `task` tool WITHOUT specifying `model` at all — lets the platform choose its own default. This is the bottom of every chain because:
- It always works (the platform always has a default)
- It requires no user configuration
- It's the behavior Squad had before model selection existed
- If even this fails, the spawn has a platform-level problem, not a model problem

---

## Charter Template Section

Add to `templates/charter.md`:

```markdown
## Model

- **Preferred:** auto
- **Rationale:** Coordinator selects the best model based on role and task complexity
- **Fallback:** Standard chain — the coordinator handles fallback automatically
```

---

## Coordinator Prompt Section

Ready-to-paste `### Model Selection` text for `squad.agent.md`:

```markdown
### Model Selection

Before spawning an agent, determine which model to use. Check these layers in order — first match wins:

**Layer 1 — User Override:** Did the user specify a model? ("use opus", "save costs", "use gpt-5.2-codex for this"). If yes, use that model. Session-wide directives ("always use haiku") persist until contradicted.

**Layer 2 — Charter Preference:** Does the agent's charter have a `## Model` section with `Preferred` set to a specific model (not `auto`)? If yes, use that model.

**Layer 3 — Task-Aware Auto-Selection:** Match the agent's role to a default model, then adjust for task complexity:

| Role | Default Model | Bump to Premium When |
|------|--------------|---------------------|
| Lead / Architect | `claude-sonnet-4.5` | Architecture proposals, cross-cutting decisions, multi-agent coordination plans |
| Core Dev / Backend / Frontend | `claude-sonnet-4.5` | — (use Codex specialist for heavy code gen — see below) |
| Tester / QA | `claude-haiku-4.5` | Complex test strategy requiring analysis (bump to sonnet) |
| Designer / Visual | `claude-opus-4.5` | Design system architecture needing deep reasoning (bump to opus-4.6) |
| DevRel / Writer | `claude-sonnet-4.5` | — |
| Scribe / Logger | `claude-haiku-4.5` | — (never bump Scribe) |
| Platform / Infra | `claude-sonnet-4.5` | Security audits, threat modeling |
| Prompt Engineer | `claude-sonnet-4.5` | Complex multi-agent pattern design, prompt architecture |
| Reviewer | `claude-sonnet-4.5` | Approval/rejection gates with downstream consequences |
| Git / Release | `claude-haiku-4.5` | — (never bump mechanical ops) |

**Task Complexity Adjustments** (apply at most ONE):
- **Bump UP to premium:** architecture proposals, reviewer gates, security audits, multi-agent coordination, design system architecture
- **Bump DOWN to fast/cheap:** typo fixes, renames, boilerplate, scaffolding, changelogs, version bumps
- **Switch to code specialist (`gpt-5.2-codex`):** large multi-file refactors, complex implementation from spec, heavy code generation
- **Switch to analytical diversity (`gemini-3-pro-preview`):** code reviews where a second perspective helps, security reviews, architecture reviews after a rejection

**Layer 4 — Default:** If nothing else matched, use `claude-sonnet-4.5`. This always works with zero configuration.

**Fallback Chains — when a model is unavailable:**

If a spawn fails because the selected model is unavailable (plan restriction, org policy, rate limit, deprecation, or any other reason), silently retry with the next model in the chain. Do NOT tell the user about fallback attempts. Maximum 3 retries before jumping to the nuclear fallback.

```
Premium:  claude-opus-4.6 → claude-opus-4.6-fast → claude-opus-4.5 → claude-sonnet-4.5 → (omit model param)
Standard: claude-sonnet-4.5 → gpt-5.2-codex → claude-sonnet-4 → gpt-5.2 → (omit model param)
Fast:     claude-haiku-4.5 → gpt-5.1-codex-mini → gpt-4.1 → gpt-5-mini → (omit model param)
```

`(omit model param)` = call the `task` tool WITHOUT the `model` parameter. The platform uses its built-in default. This is the nuclear fallback — it always works.

**Fallback rules:**
- If the user specified a provider ("use Claude"), fall back within that provider only before hitting nuclear
- Never fall back UP in tier — a fast/cheap task should not land on a premium model
- Log fallbacks to the orchestration log for debugging, but never surface to the user unless asked

**Spawn output format — show the model choice:**

When spawning, include the model in your acknowledgment:

```
🔧 Fenster (claude-sonnet-4.5) — refactoring auth module
🎨 Redfoot (claude-opus-4.5 · vision) — designing color system
📋 Scribe (claude-haiku-4.5 · fast) — logging session
⚡ Keaton (claude-opus-4.6 · bumped for architecture) — reviewing proposal
🔬 Hockney (gpt-5.2-codex · code specialist) — large refactor across 12 files
```

Include tier annotation only when the model was bumped or a specialist was chosen. Default-tier spawns just show the model name.

**Adding the model parameter to spawns:**

Pass the resolved model as the `model` parameter on every `task` tool call:

```
agent_type: "general-purpose"
model: "claude-sonnet-4.5"
mode: "background"
description: "Fenster: refactoring auth module"
prompt: |
  ...
```

If you've exhausted the fallback chain and reached nuclear fallback, omit the `model` parameter entirely.

**Valid models (current platform catalog):**

Premium: `claude-opus-4.6`, `claude-opus-4.6-fast`, `claude-opus-4.5`
Standard: `claude-sonnet-4.5`, `claude-sonnet-4`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1`, `gpt-5`, `gemini-3-pro-preview`
Fast/Cheap: `claude-haiku-4.5`, `gpt-5.1-codex-mini`, `gpt-5-mini`, `gpt-4.1`
```

---

## Implementation Plan

From [Proposal 027](027-v030-sprint-plan.md) — v0.3.0 Wave 1, Items 4.1–4.4.

| ID | Item | Owner | Effort | Depends On |
|----|------|-------|--------|------------|
| **4.1** | Model auto-selection algorithm in coordinator — add `### Model Selection` section to `squad.agent.md`, 4-layer priority, role-to-model mapping, task complexity overrides, `model` parameter on all `task` calls | Verbal + Kujan | 3–4h | — |
| **4.2** | Charter `## Model` section + template update — `Preferred`, `Rationale`, `Fallback` fields, delegation support, default `auto` | Verbal | 1–2h | 4.1 |
| **4.3** | Registry `model` field + migration — schema update, `templates/casting-registry.json` update, additive upgrade migration populating defaults from role-to-model mapping | Fenster | 2–3h | 4.1 |
| **4.4** | Model selection tests — registry model field in migration, charter template validation, registry schema, upgrade path tests | Hockney | 2–3h | 4.1, 4.2, 4.3 |

**Phase 1 (Items 4.1):** Coordinator instructions + auto-selection. Zero code changes — pure prompt engineering. The coordinator already spawns agents; this adds a `model` parameter to existing spawns.

**Phase 2 (Items 4.2–4.3):** Charter + registry integration. Template additions + additive migration. No destructive changes.

**Wave 2 follow-up (Item 5.3):** Model visibility in spawn output — Verbal, 1h, depends on 4.1.

---

## Success Criteria

- [ ] Redfoot spawns on a vision-capable model (Opus) without any user configuration
- [ ] Scribe/Hockney spawn on Haiku by default, cutting cost and latency for mechanical tasks
- [ ] User can say "use opus for everything" and it works
- [ ] User can say "save costs" and the coordinator drops all agents to the cheapest viable model
- [ ] Model choice is visible and explainable at spawn time
- [ ] Zero existing behavior breaks — agents without model config get Sonnet 4.5 (current default)
- [ ] Agent-to-agent delegation respects the target agent's charter model preference
- [ ] Model unavailability is handled silently — fallback chains terminate, nuclear fallback always works
- [ ] No user-facing error when any single model or provider is unavailable

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| Charter model > Registry model | Agents can "demand" expensive models. Mitigated by coordinator judgment + user override. |
| Haiku default for Tester/Scribe | Risk of quality issues on complex test scenarios. Mitigated by task complexity bumps. |
| Deterministic algorithm over LLM judgment | Less flexible, but predictable and debuggable. Coordinator can still apply judgment on top. |
| Cross-provider fallback chains | Prompt portability risk — charters are Anthropic-optimized. Mitigated by conservative cross-provider usage. |
| Silent fallback (no user notification) | Users may not know they're on a fallback model. Mitigated by orchestration log capture. |
| 3-retry max before nuclear | May skip viable models in the chain. Acceptable — nuclear fallback always works, and 3 retries covers the common cases. |

---

## What's Deferred

| Feature | Why Not Now | Revisit When |
|---------|-------------|--------------|
| **Model cost reporting** | Polish, not leverage. Auto-selection delivers 90% of value. | User feedback requests it |
| **Override persistence** | Session-level overrides work. Persistence can wait. | v0.4.0 |
| **Prompt portability testing** | Cross-provider execution works but charters are untested on non-Anthropic models. | After cross-provider spawns are observed in production |
| **Budget mode** | Team-level cost cap. Needs model cost data first. | After cost reporting ships |
| **Model performance tracking** | Log model × task outcomes over time. Needs production data. | v0.4.0+ |
| **Skills model requirements** | SKILL.md declaring model preferences. Needs proven skills system. | v0.4.0+ |

---

## Open Questions (Resolved)

1. ~~Should the coordinator log model selection reasoning?~~ **Yes** — to orchestration log, not user-facing.
2. ~~Should model selection be part of portable squad export?~~ **Yes** — it's part of the agent's identity.
3. ~~Should there be a team-level "budget mode"?~~ **Deferred** — needs cost reporting first.
