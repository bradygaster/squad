**Note:** This is a companion algorithm document. The consolidated spec is [Proposal 024](024-per-agent-model-selection.md).

# Proposal 024b: Model Selection Algorithm

**Status:** Draft  
**Author:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-10  
**Companion to:** Proposal 024 (Per-Agent Model Selection), Proposal 024a (Model Catalog)  
**Sprint:** v0.3.0 Wave 1, Item 4.1  
**Requested by:** bradygaster — graceful fallback when a model isn't available

---

## Purpose

This document defines the model selection algorithm — the exact coordinator prompt instructions that determine which model each agent spawns on, and what happens when that model isn't available. Kujan's catalog (024a) provides the raw data. This document turns it into decisions.

Brady's critical directive: **the system must NOT break when a model is unavailable.** Models may be blocked by Copilot plan restrictions, org policy, regional availability, deprecation, rate limiting, or any other reason. The coordinator must fall back gracefully — and silently.

---

## 1. Selection Priority (4-Layer)

The coordinator resolves a model for every spawn. Four layers, checked in order. First match wins.

| Priority | Source | Example | Override Behavior |
|----------|--------|---------|-------------------|
| **1. User Override** | User explicitly names a model in the current message or a session-wide directive | "Use opus for this" / "Save costs, use haiku for everything" | Overrides all other layers. Session-wide directives persist until contradicted. |
| **2. Charter Preference** | Agent's charter has a `## Model` section with a `Preferred` value other than `auto` | `Preferred: claude-opus-4.5` (Designer needs vision) | Overrides auto-selection. The agent declared its own needs with rationale. |
| **3. Task-Aware Auto-Selection** | Coordinator evaluates role + task characteristics → picks best model | Lead doing architecture proposal → bumped to premium | The core algorithm. See Section 2. |
| **4. Default Fallback** | No other layer matched | Any agent, any task | `claude-sonnet-4.5`. Always. This is the "no config needed" baseline. |

**Layer 1 detail — user override detection:**
- Explicit model name: "use claude-opus-4.6", "spawn on haiku", "use gpt-5.2-codex"
- Budget directives: "save costs" → drop all non-essential spawns to fast/cheap tier
- Quality directives: "use the best model" → bump all spawns to premium tier
- Per-agent override: "use opus for Keaton" → applies only to that agent
- Session-wide: "always use sonnet" → applies to all spawns until contradicted

---

## 2. Task-Aware Auto-Selection Logic

When Layers 1-2 don't apply, the coordinator uses role + task signals to pick a model. This is the 80% case — most spawns hit Layer 3 or 4.

### Step 1: Role-Based Default

Start with the agent's role category. This is the baseline before task signals adjust it.

| Role Category | Default Model | Tier | Why |
|---------------|--------------|------|-----|
| Lead / Architect | `claude-sonnet-4.5` | Standard | Strong reasoning + balanced cost. Bumped to premium for proposals. |
| Core Dev / Backend | `claude-sonnet-4.5` | Standard | Best general code generation quality at reasonable cost. |
| Frontend Dev | `claude-sonnet-4.5` | Standard | Same reasoning — UI code benefits from structured output. |
| Tester / QA | `claude-haiku-4.5` | Fast | Test generation is structured, pattern-heavy. Speed > depth. |
| Designer / Visual | `claude-opus-4.5` | Premium | Vision-capable. Required for image analysis and visual reasoning. |
| DevRel / Writer | `claude-sonnet-4.5` | Standard | Prose quality needs solid reasoning. Not as deep as architecture. |
| Scribe / Logger | `claude-haiku-4.5` | Fast | Mechanical file operations. Speed and cost matter, depth doesn't. |
| Platform / Infra | `claude-sonnet-4.5` | Standard | Platform analysis needs standard reasoning. |
| Prompt Engineer | `claude-sonnet-4.5` | Standard | Meta-reasoning about agents. Bumped to premium for complex designs. |
| Reviewer | `claude-sonnet-4.5` | Standard | Judgment calls. Bumped to premium for gate decisions. |
| Git / Release | `claude-haiku-4.5` | Fast | Mechanical operations. Changelogs, tags, version bumps. |

### Step 2: Task Complexity Override

After selecting the role default, the coordinator checks the task for signals that warrant a tier bump (up or down). Apply AT MOST ONE override — no cascading.

**Bump UP to premium** when the task involves:
- Architecture proposals or cross-cutting design decisions
- Reviewer approval/rejection gates (the decision has downstream consequences)
- Multi-agent coordination plans (output feeds 3+ other agents)
- Security audits or threat modeling
- Complex prompt architecture or multi-agent pattern design
- Design system architecture (Designer needing both vision AND deep reasoning)

**Bump DOWN to fast/cheap** when the task involves:
- Simple renames, typo fixes, or single-line changes
- Boilerplate generation or scaffolding
- Changelog updates or version bumps
- File operations with clear, mechanical instructions
- Status checks that don't require analysis

**Switch to code-specialized** when the task involves:
- Large multi-file refactoring (consider `gpt-5.2-codex`)
- Complex implementation from a detailed spec (consider `gpt-5.2-codex`)
- Hard debugging across multiple modules (consider `gpt-5.1-codex-max`)

### Step 3: Provider Diversity Triggers

These are OPTIONAL. The coordinator should consider them but not force them. Provider diversity is a tool, not a religion.

| Trigger | Consider | Why |
|---------|----------|-----|
| Code review (not implementation) | `gemini-3-pro-preview` | Different training data catches different issues. Cognitive diversity. |
| Heavy code generation (500+ lines, multi-file) | `gpt-5.2-codex` | OpenAI Codex variants are optimized for code generation. |
| Second-opinion review after a rejection | Different provider than the original reviewer | If Claude rejected, try GPT or Gemini for the re-review. |
| Analytical task benefiting from a "different lens" | `gemini-3-pro-preview` | Google's reasoning approach may surface insights others miss. |

**When NOT to diversify:**
- First-time spawns for agents with complex charters (stick to Anthropic — charters are Anthropic-optimized)
- Scribe or mechanical tasks (provider doesn't matter, use the cheapest)
- When the user has set a provider preference ("use Claude for everything")

---

## 3. Fallback Chains — The Critical Part

### The Problem

A selected model may fail to spawn for any reason: plan restrictions, org policy, regional availability, deprecation, rate limiting, capacity limits, or unknown platform errors.

The coordinator must handle this silently. The user should never see "Model unavailable, trying another..." unless they ask what happened.

### How the Coordinator Detects Failure

When the `task` tool is called with a `model` parameter and that model is unavailable, the task tool will return an error or the spawned agent will fail immediately. The coordinator detects this by:

1. **Spawn returns an error message** mentioning the model, availability, or access
2. **Agent completes instantly** with no meaningful work done and an error in its output
3. **Platform rejects the model parameter** before the agent starts

On any of these signals: **do not narrate the failure.** Silently retry with the next model in the fallback chain.

### Fallback Chains by Tier

Each tier has an ordered fallback chain. The coordinator walks the chain top-to-bottom. The final entry — `(omit model param)` — means calling the `task` tool WITHOUT the `model` parameter, letting the platform use its built-in default. This is the nuclear fallback. It always works.

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

### Cross-Provider Fallback Logic

The chains are intentionally cross-provider. If an Anthropic model fails, the next attempt is often OpenAI (and vice versa). This handles provider-wide outages, not just single-model issues.

The ordering within each chain follows these principles:
1. **Best-in-tier first** — the model that would produce the highest quality for this tier
2. **Cross-provider second** — if the first model fails, try a different provider
3. **Same-provider previous-gen third** — older models from the original provider
4. **Alternative provider fourth** — broader cross-provider coverage
5. **Nuclear last** — omit the parameter entirely

### Fallback Behavior Rules

1. **Maximum 3 retries.** If the first 3 models in a chain fail, skip directly to `(omit model param)`. Don't burn time walking a 5-model chain.
2. **Silent by default.** The user sees the final successful spawn, not the failures. The coordinator does NOT say "Tried claude-opus-4.6, failed. Trying claude-opus-4.6-fast..."
3. **Log failures if Scribe is running.** When a fallback occurs, note it in the orchestration log: `Model fallback: claude-opus-4.6 → claude-sonnet-4.5 (original unavailable)`. This is internal — the user doesn't see it unless they check the log.
4. **Respect user overrides during fallback.** If the user said "use Claude," fall back within Anthropic only: `opus-4.6 → opus-4.6-fast → opus-4.5 → sonnet-4.5 → sonnet-4 → (omit model param)`. Don't cross to GPT unless the user didn't specify a provider.
5. **Never fall back UP in tier.** A fast/cheap fallback should not land on a premium model. The chains are tier-scoped.

### The Nuclear Fallback

`(omit model param)` — calling the `task` tool without specifying `model` at all — lets the platform choose its own default. This is the bottom of every chain because:

- It always works (the platform always has a default)
- It requires no user configuration
- It's the behavior Squad had before model selection existed
- If even this fails, the spawn itself has a platform-level problem (not a model problem)

---

## 4. Coordinator Prompt Section

This is the deliverable — the actual prompt text to add to `squad.agent.md` under a new `### Model Selection` section. Ready to paste.

---

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

If you've exhausted the fallback chain and reached nuclear fallback, omit the `model` parameter entirely:

```
agent_type: "general-purpose"
mode: "background"
description: "Fenster: refactoring auth module"
prompt: |
  ...
```

**Valid models (current platform catalog):**

Premium: `claude-opus-4.6`, `claude-opus-4.6-fast`, `claude-opus-4.5`
Standard: `claude-sonnet-4.5`, `claude-sonnet-4`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1`, `gpt-5`, `gemini-3-pro-preview`
Fast/Cheap: `claude-haiku-4.5`, `gpt-5.1-codex-mini`, `gpt-5-mini`, `gpt-4.1`
```

---

## 5. Charter Template Update

Add this section to `templates/charter.md` after the `## Boundaries` section and before `## Collaboration`:

```markdown
## Model

- **Preferred:** auto
- **Rationale:** Coordinator selects the best model based on role and task complexity
- **Fallback:** Standard chain — the coordinator handles fallback automatically
```

### Field Definitions

| Field | Values | Meaning |
|-------|--------|---------|
| `Preferred` | A valid model ID (e.g., `claude-opus-4.5`) or `auto` | The model this agent should spawn on. `auto` delegates to the coordinator's auto-selection algorithm. |
| `Rationale` | Free text | Why this model. Forces the charter author to justify the choice. Prevents "opus for everything" cargo-culting. |
| `Fallback` | `Premium chain`, `Standard chain`, `Fast chain`, or a custom chain | Which fallback chain to use when the preferred model is unavailable. Defaults to the chain matching the preferred model's tier. |

### Examples

**Designer (needs vision):**
```markdown
## Model

- **Preferred:** claude-opus-4.5
- **Rationale:** Vision-capable model required for image analysis, color reasoning, and visual composition
- **Fallback:** Premium chain
```

**Scribe (needs speed):**
```markdown
## Model

- **Preferred:** claude-haiku-4.5
- **Rationale:** Mechanical file operations — speed and cost matter, depth doesn't
- **Fallback:** Fast chain
```

**Core Dev (auto-selection is fine):**
```markdown
## Model

- **Preferred:** auto
- **Rationale:** Coordinator selects based on task — sonnet for most work, codex for heavy code gen
- **Fallback:** Standard chain — the coordinator handles fallback automatically
```

---

## 6. Design Decisions

### Why cross-provider fallback chains?

Single-provider chains are fragile. If Anthropic has an outage, every fallback attempt fails. Cross-provider chains route around provider-level issues. The ordering ensures the best model for the tier is tried first, then a comparable model from a different provider.

### Why 3-retry maximum?

Walking a 5-model chain with API timeouts at each step could add 30-60 seconds of invisible latency. Three retries is enough to handle transient issues and single-provider outages. After that, the nuclear fallback is faster than continuing to iterate.

### Why silent fallback?

Users don't care which model runs their agent. They care about results. Narrating "tried X, failed, trying Y" creates anxiety and delays the acknowledgment. The orchestration log captures fallbacks for debugging — the user sees results.

### Why `(omit model param)` as nuclear?

It's the only option that is guaranteed to work regardless of plan tier, org policy, or platform state. It's also backward-compatible — Squad worked this way before model selection existed. Worst case: every agent runs on the platform default. That's degraded, not broken.

### Why not retry with the same model?

Rate limits and capacity issues are often persistent for minutes to hours. Retrying the same model wastes time. Moving to the next option in the chain is faster and more likely to succeed.

### Why provider diversity is optional, not forced?

Squad's charters are Anthropic-optimized. Cross-provider execution introduces prompt portability risk — the same charter may produce subtly different behavior on GPT vs Claude. Provider diversity is valuable for reviews and code generation, but shouldn't be forced where instruction following fidelity matters most.

---

## 7. Integration with Existing Coordinator Patterns

### Lightweight Spawns

Lightweight spawns (the minimal template) also get model selection. The coordinator applies the same 4-layer algorithm but uses the Lightweight Spawn Template format. The `model` parameter is added to the `task` call regardless of spawn weight.

### Explore Agent Type

For `agent_type: "explore"` spawns (read-only queries), the model parameter is still valid. The coordinator can pass `model: "claude-haiku-4.5"` for fast reads or `model: "gemini-3-pro-preview"` for analytical queries. Fallback works the same way.

### Delegation (Agent-to-Agent Spawns)

When an agent spawns another agent directly (Pattern B from Proposal 024), the spawning agent should:
1. Read the target agent's charter `## Model` → use the `Preferred` value
2. If `auto` or no `## Model` section → omit the `model` parameter (let the platform default)

Agents don't need the full auto-selection algorithm. They don't need fallback chains. The coordinator handles complexity; agents keep it simple.

---

## 8. Future Considerations (Not in v0.3.0)

- **Budget mode:** A team-level directive that caps all spawns at standard or fast tier. "We're on a tight budget this month."
- **Model performance tracking:** Log model × task outcomes over time. Surface which models produce the best results for which task types.
- **Prompt portability testing:** Validate that key charters produce consistent behavior across Anthropic, OpenAI, and Google models.
- **Skills model requirements:** SKILL.md files could declare model preferences — "this skill works best on Codex models."
- **Cost reporting:** Show estimated token cost per spawn tier in the "where are we?" output.

---

## Summary

The algorithm is simple at its core: **check four layers, pick the first match, fall back gracefully if it doesn't work.** 80% of spawns will use Layer 4 (default sonnet) or Layer 3 (role-based auto-selection) and never need a fallback. The complexity exists for the 20% where the right model genuinely matters — and for the edge cases where models aren't available.

The fallback chain is the critical safety net. It terminates. It's silent. It always works. That's the contract.
