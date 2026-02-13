**Note:** This is a companion research document. The consolidated spec is [Proposal 024](024-per-agent-model-selection.md).

# Proposal 024a: Model Catalog — Full Platform Research

**Status:** Research Complete  
**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-10  
**Companion to:** Proposal 024 (Per-Agent Model Selection)  
**Requested by:** bradygaster — *"we should have a much, much more broad list of models from which we'd choose and justifications as to why we'd choose one model or another."*

---

## Purpose

Proposal 024 designed the model selection architecture (4-layer priority, charter fields, auto-selection algorithm). But it hardcoded only 3 models: Opus for designers, Haiku for Scribe, Sonnet for everyone else. Brady correctly pushed back — the `task` tool supports **16 models across 3 providers**, and the selection algorithm should leverage the full catalog.

This document is the raw research. It catalogs every available model, characterizes strengths and weaknesses, and identifies which Squad roles and tasks each model fits best. **Verbal uses this to build the selection algorithm. This document does NOT define the algorithm itself.**

---

## Full Model Catalog

### Anthropic Models (5 models)

| Model ID | Display Name | Tier | Context | Strengths | Weaknesses | Best Squad Fit |
|----------|-------------|------|---------|-----------|------------|----------------|
| `claude-opus-4.6` | Claude Opus 4.6 | Premium | Large | Deepest reasoning in the Anthropic family. Extended thinking. Best-in-class for complex multi-step analysis, architecture decisions, and nuanced judgment calls. Strong instruction following even with very long prompts. | Slowest Anthropic model. Highest cost. Overkill for mechanical tasks. | Lead (architecture proposals), Designer (vision + deep reasoning), Reviewer gates (approval/rejection decisions), complex cross-cutting proposals |
| `claude-opus-4.6-fast` | Claude Opus 4.6 (fast mode) | Premium | Large | Same model weights as Opus 4.6 but with reduced thinking budget — trades some reasoning depth for significantly faster response time. Still premium-tier quality. | Still expensive. Less deep thinking than full Opus 4.6 — may miss subtle issues that extended thinking would catch. | Time-sensitive premium tasks: code reviews with deadlines, quick architecture gut-checks, reviewer gates where speed matters |
| `claude-opus-4.5` | Claude Opus 4.5 | Premium | Large | Previous-generation Opus. Strong creative and analytical reasoning. Vision-capable — can analyze images, diagrams, color systems. Proven track record. | Older generation — Opus 4.6 surpasses it on reasoning benchmarks. Still expensive. | Designer/Visual roles (vision capability confirmed), creative writing, tasks where vision analysis is required |
| `claude-sonnet-4.5` | Claude Sonnet 4.5 | Standard | Large | Excellent balance of quality and speed. Strong code generation. Good instruction following. Reliable for structured output (JSON, markdown). Handles long context well. | Not as deep as Opus for complex reasoning. Not as fast or cheap as Haiku. The "middle of the road" — which is often exactly right. | Core Dev, Backend, Frontend, DevRel/Writer, Platform/Infra — the workhorse tier |
| `claude-sonnet-4` | Claude Sonnet 4 | Standard | Large | Solid, well-tested model. Reliable code generation and prose. Good at following complex multi-step instructions. Well-understood behavior from extensive use. | Previous generation — Sonnet 4.5 is generally better. Still capable but no reason to prefer over 4.5 unless specific behavior is needed. | Fallback for any Sonnet-tier task. Good for consistency if the team has calibrated prompts against this specific version. |
| `claude-haiku-4.5` | Claude Haiku 4.5 | Fast/Cheap | Standard | Fastest Anthropic model. Lowest cost. Surprisingly capable for structured tasks — file manipulation, test generation, pattern-heavy work. Excellent latency for interactive workflows. | Weakest reasoning of the Anthropic lineup. Struggles with nuanced judgment, complex architecture decisions, and creative tasks. More prone to instruction-following errors on complex prompts. | Scribe (mechanical file ops), Tester/QA (structured test generation), simple code tasks (renames, typo fixes), any task where speed > depth |

### OpenAI Models (8 models)

| Model ID | Display Name | Tier | Strengths | Weaknesses | Best Squad Fit |
|----------|-------------|------|-----------|------------|----------------|
| `gpt-5.2-codex` | GPT-5.2-Codex | Standard | Latest OpenAI code-specialized model. Strong at code generation, refactoring, and understanding complex codebases. Likely optimized for developer workflows — completions, edits, test writing. | Newer model — less community feedback on edge cases. Code-specialized means potentially weaker at pure prose or creative tasks. | Core Dev, Backend, Frontend — heavy code generation tasks. Code reviews. Large refactoring operations. |
| `gpt-5.2` | GPT-5.2 | Standard | Latest general-purpose OpenAI model. Broad capabilities across reasoning, code, and prose. Benefits from the latest training data and techniques. | Newer model — behavior characteristics still being discovered. General-purpose means not specialized for any single task. | DevRel/Writer, Lead (general analysis), Platform — tasks needing broad capability without code specialization |
| `gpt-5.1-codex-max` | GPT-5.1-Codex-Max | Standard | Extended compute variant of GPT-5.1-Codex. More reasoning depth for complex code tasks — likely uses additional inference-time compute. Good for hard problems. | Higher latency and cost than base Codex. May be overkill for simple code tasks. | Complex architecture implementations, difficult debugging, large-scale code analysis, multi-file refactors |
| `gpt-5.1-codex` | GPT-5.1-Codex | Standard | Proven code-focused model. Strong code generation and comprehension. Well-established — more community usage data than 5.2. | Previous generation — 5.2-Codex likely superior. Still very capable. | Core Dev tasks where OpenAI code quality is preferred. Cross-provider diversity for code-heavy work. |
| `gpt-5.1` | GPT-5.1 | Standard | Solid general-purpose model. Good balance of reasoning, code, and prose. Well-tested in production. | Previous generation. No standout specialization. | General-purpose fallback in the OpenAI family |
| `gpt-5` | GPT-5 | Standard | First GPT-5 generation. Broad reasoning capabilities. Known behavior patterns. | Oldest in the GPT-5 family. Superseded by 5.1 and 5.2. | Legacy compatibility. Tasks where predictable, well-understood behavior matters more than cutting edge. |
| `gpt-5.1-codex-mini` | GPT-5.1-Codex-Mini | Fast/Cheap | Fast, cheap, code-aware. Good for simple code tasks — boilerplate generation, test scaffolding, file manipulation. Lower latency than full Codex. | Weaker reasoning. Struggles with complex multi-step code tasks. Less reliable instruction following. | Scribe-equivalent tasks in OpenAI ecosystem. Simple test generation. Boilerplate code. |
| `gpt-5-mini` | GPT-5 mini | Fast/Cheap | Fastest OpenAI model. Lowest cost. Good for simple, well-structured tasks. Quick responses. | Weakest in the OpenAI lineup. Not suitable for complex reasoning or nuanced tasks. Older generation mini. | Mechanical tasks where OpenAI provider is preferred. Simple file operations. Quick lookups. |
| `gpt-4.1` | GPT-4.1 | Fast/Cheap | Previous-generation model at budget pricing. Well-understood behavior. Strong instruction following for its tier. Good at structured output. | Not GPT-5 class. Weaker reasoning than any GPT-5 variant. | Budget tasks where behavior predictability matters more than capability ceiling. Structured output generation. |

### Google Models (1 model)

| Model ID | Display Name | Tier | Strengths | Weaknesses | Best Squad Fit |
|----------|-------------|------|-----------|------------|----------------|
| `gemini-3-pro-preview` | Gemini 3 Pro (Preview) | Standard | Google's latest reasoning model. Strong at analytical tasks, mathematical reasoning, and structured thinking. Different training approach than Anthropic/OpenAI — may catch issues others miss. Good multilingual capability. Large context window expected. | Preview status — behavior may change. Less battle-tested in agent workflows than Claude or GPT models. Single model offering limits tier flexibility within Google's lineup. | Second-opinion reviews, analytical tasks, cross-provider diversity assignments, tasks benefiting from a different "perspective" |

---

## Model Selection Dimensions

These are the factors that matter when choosing a model for a Squad agent or task. The selection algorithm should weigh these based on the agent's role and the task at hand.

### 1. Reasoning Depth

**What it means:** How well the model handles complex, multi-step reasoning — architecture decisions, cross-cutting analysis, subtle trade-off evaluation.

**Spectrum:**
- **Deep:** Opus 4.6, Opus 4.6-fast, GPT-5.1-Codex-Max
- **Strong:** Opus 4.5, Sonnet 4.5, GPT-5.2, GPT-5.2-Codex, Gemini 3 Pro
- **Adequate:** Sonnet 4, GPT-5.1, GPT-5.1-Codex, GPT-5
- **Light:** Haiku 4.5, GPT-5.1-Codex-Mini, GPT-5-Mini, GPT-4.1

**When it matters most:** Lead/Architect decisions, reviewer gates, complex proposals, security audits.

### 2. Code Generation Quality

**What it means:** Accuracy, idiom-correctness, and reliability of generated code. Includes understanding of codebases, refactoring, and test generation.

**Spectrum:**
- **Excellent:** GPT-5.2-Codex, GPT-5.1-Codex-Max, Sonnet 4.5, Opus 4.6
- **Strong:** GPT-5.1-Codex, Opus 4.5, Sonnet 4, GPT-5.2
- **Good:** GPT-5.1, GPT-5, Gemini 3 Pro
- **Adequate:** Haiku 4.5, GPT-5.1-Codex-Mini
- **Basic:** GPT-5-Mini, GPT-4.1

**When it matters most:** Core Dev implementation, test generation, refactoring, code review.

### 3. Speed / Latency

**What it means:** How fast the model returns a complete response. Critical for interactive workflows and mechanical tasks.

**Spectrum:**
- **Fastest:** Haiku 4.5, GPT-5-Mini, GPT-4.1, GPT-5.1-Codex-Mini
- **Fast:** Sonnet 4, Sonnet 4.5, GPT-5.1, GPT-5
- **Moderate:** GPT-5.2, GPT-5.1-Codex, GPT-5.2-Codex, Opus 4.6-fast, Gemini 3 Pro
- **Slow:** Opus 4.5, Opus 4.6, GPT-5.1-Codex-Max

**When it matters most:** Scribe operations, simple edits, interactive user-facing tasks, fan-out spawns where latency compounds.

### 4. Cost Efficiency

**What it means:** Token cost relative to capability. Burning premium tokens on simple tasks is waste; underinvesting on critical decisions is false economy.

**Spectrum:**
- **Budget:** Haiku 4.5, GPT-5-Mini, GPT-4.1, GPT-5.1-Codex-Mini
- **Moderate:** Sonnet 4, Sonnet 4.5, GPT-5.1, GPT-5, GPT-5.1-Codex, GPT-5.2
- **Elevated:** GPT-5.2-Codex, GPT-5.1-Codex-Max, Gemini 3 Pro
- **Premium:** Opus 4.5, Opus 4.6, Opus 4.6-fast

**When it matters most:** Always. But especially for high-frequency spawns (Scribe runs every session) and fan-out patterns (5 agents spawned simultaneously).

### 5. Instruction Following

**What it means:** How reliably the model follows complex, multi-part instructions — especially important for agents with long charters and specific behavioral requirements.

**Spectrum:**
- **Excellent:** Opus 4.6, Sonnet 4.5, GPT-5.2-Codex
- **Strong:** Opus 4.5, Sonnet 4, GPT-5.2, GPT-5.1-Codex
- **Good:** GPT-5.1, GPT-5, Gemini 3 Pro
- **Variable:** Haiku 4.5, GPT-5-Mini, GPT-4.1, GPT-5.1-Codex-Mini

**When it matters most:** Every Squad agent — the charter IS a complex instruction set. Agents with long charters (coordinator is 32KB+) need excellent instruction following. Lighter agents with simple charters can tolerate variable instruction following.

### 6. Vision Capability

**What it means:** Ability to analyze images, diagrams, screenshots, color systems, and visual composition.

**Models with vision:** Opus 4.5, Opus 4.6 (Anthropic vision models), GPT-5.x models (OpenAI multimodal), Gemini 3 Pro (Google multimodal)

**When it matters most:** Designer/Visual roles. Exclusively.

### 7. Context Window

**What it means:** How much input the model can process. Critical for agents that receive large charters + history + decisions + input artifacts.

**All models listed support at least 128K context** in the Copilot platform, which is the platform's constraint rather than the model's. This dimension is effectively equalized by the platform.

### 8. Structured Output

**What it means:** Reliability of generating valid JSON, markdown tables, YAML, and other structured formats without hallucination or formatting errors.

**Strongest:** GPT-5.2-Codex, Sonnet 4.5, GPT-5.1-Codex (code-trained models excel here)
**Weakest:** Mini/budget models under complex structure requirements

**When it matters most:** Registry operations, config generation, structured proposals, test output formatting.

---

## Provider Diversity

### Why Multi-Provider Support Matters

**1. Resilience**

Single-provider dependency is a single point of failure. If Anthropic has an outage or rate-limits heavily, a team running all agents on Claude is dead in the water. Multi-provider support means Squad can route around provider issues — Sonnet goes down, re-route to GPT-5.2-Codex for code tasks.

This isn't theoretical. Provider outages happen. Rate limits hit. Regional availability varies. A production-grade multi-agent system should not be fragile to one provider's uptime.

**2. Best-of-Breed Selection**

No single provider dominates every dimension:

| Dimension | Current Best-of-Breed |
|-----------|----------------------|
| Deep reasoning | Anthropic (Opus 4.6) |
| Code generation | OpenAI (Codex variants) |
| Speed + cost | Anthropic (Haiku 4.5) |
| Analytical diversity | Google (Gemini 3 Pro) |
| Instruction following | Anthropic (Opus/Sonnet) |
| Structured output | OpenAI (Codex variants) |

A selection algorithm that only considers Anthropic models leaves code generation quality on the table. One that ignores Google loses the "different perspective" advantage for reviews.

**3. Avoid Lock-In**

Squad's portable squads feature (Proposal 008) means teams export and import across projects. If model selection is hardcoded to one provider, portability is limited to environments where that provider is available. Multi-provider selection makes squads truly portable.

Provider lock-in also creates negotiation disadvantage, training data bias (all agents think alike because they're trained on similar data), and vulnerability to provider policy changes.

**4. Cognitive Diversity**

Different providers train on different data with different techniques. An Anthropic model and an OpenAI model may disagree on an architecture decision — and that disagreement is valuable signal. A reviewer using Gemini may catch issues that a Claude-based implementer missed, precisely because they "think differently."

This matters most for: code reviews, architecture proposals, security audits — any task where a second perspective has value.

### Provider Diversity Risks

- **Prompt tuning fragility.** A charter prompt optimized for Claude may underperform on GPT. The coordinator's instructions are Anthropic-optimized today.
- **Behavioral inconsistency.** Different providers interpret the same instruction differently. An agent might behave subtly differently on GPT vs. Claude.
- **Testing surface.** Multi-provider means multi-provider testing. Charter prompts should be validated against each provider they might run on.
- **Preview instability.** Gemini 3 Pro is in preview. Its behavior may change between sessions.

**Mitigation:** Start with Anthropic as the default family (proven, well-understood). Use OpenAI for code-specialized tasks where Codex variants excel. Use Google for diversity/review tasks. Expand cross-provider usage as prompt portability improves.

---

## Default vs. Specialist Recommendations

### Default Models — "Safe Choices"

These models should be the algorithm's first consideration for their respective tiers. They're well-tested, reliable, and provide the best general-purpose capability at their price point.

| Tier | Default Model | Why |
|------|--------------|-----|
| **Premium** | `claude-opus-4.6` | Deepest reasoning available. When you need premium, you want the best. |
| **Standard** | `claude-sonnet-4.5` | Best balance of quality, speed, and cost. The workhorse. |
| **Fast/Cheap** | `claude-haiku-4.5` | Fastest, cheapest, and capable enough for structured tasks. |

### Specialist Models — "Right Tool for the Job"

These models should be considered when the task has specific characteristics that make them a better fit than the default.

| Model | Specialist Use Case | When to Reach for It |
|-------|-------------------|---------------------|
| `claude-opus-4.6-fast` | Time-sensitive premium work | Reviewer gates with deadlines, quick architecture reviews — need premium quality but can't wait for full Opus |
| `claude-opus-4.5` | Vision-required tasks | Designer/Visual roles that need image analysis (proven vision capability) |
| `gpt-5.2-codex` | Heavy code generation | Large refactors, multi-file code changes, complex implementation tasks where code quality is the primary dimension |
| `gpt-5.1-codex-max` | Hard code problems | Debugging complex issues, analyzing large codebases, problems where extra inference-time compute pays off |
| `gpt-5.1-codex-mini` | Budget code tasks | Simple code scaffolding, boilerplate generation — code-aware but cheap |
| `gemini-3-pro-preview` | Cross-provider reviews | Code reviews, architecture reviews, security audits — value in a different perspective |
| `gpt-5.2` | General OpenAI alternative | When provider diversity is desired for non-code tasks |
| `gpt-4.1` | Ultra-budget tasks | When even Haiku feels expensive — very simple, well-structured tasks with clear instructions |

### Models to Avoid as Defaults

| Model | Why Not Default | Still Useful When |
|-------|----------------|-------------------|
| `claude-sonnet-4` | Superseded by Sonnet 4.5 | Prompt regression testing, when specific Sonnet 4 behavior is needed |
| `gpt-5.1-codex` | Superseded by GPT-5.2-Codex | Cross-version comparison, when 5.1 behavior is specifically needed |
| `gpt-5.1` | Superseded by GPT-5.2 | Stability preference, when 5.1's behavior is well-calibrated |
| `gpt-5` | Oldest GPT-5 generation | Legacy compatibility only |
| `gpt-5-mini` | GPT-4.1 or Haiku 4.5 are better budget choices | Specific OpenAI Mini behavior needed |

---

## Role-to-Model Mapping (Expanded)

This replaces the 3-model mapping from Proposal 024 with a catalog-aware version. The selection algorithm should use this as input, not as the final answer — task complexity overrides still apply.

| Role Category | Default Model | Specialist Alternative | When to Switch |
|---------------|--------------|----------------------|----------------|
| **Lead / Architect** | `claude-sonnet-4.5` | `claude-opus-4.6` | Architecture proposals, cross-cutting decisions, multi-agent coordination plans |
| **Core Dev / Backend** | `claude-sonnet-4.5` | `gpt-5.2-codex` | Heavy code generation, large refactors, multi-file implementations |
| **Frontend Dev** | `claude-sonnet-4.5` | `gpt-5.2-codex` | Complex UI implementations, component libraries |
| **Tester / QA** | `claude-haiku-4.5` | `gpt-5.1-codex-mini` | Cross-provider test validation, code-aware test generation |
| **Designer / Visual** | `claude-opus-4.5` | `claude-opus-4.6` | When design requires both vision AND deep reasoning (design system architecture) |
| **DevRel / Writer** | `claude-sonnet-4.5` | `gpt-5.2` | When OpenAI prose style is preferred, cross-provider content review |
| **Scribe / Logger** | `claude-haiku-4.5` | `gpt-4.1` | Ultra-budget mode, provider diversity for mechanical tasks |
| **Platform / Infra** | `claude-sonnet-4.5` | `gemini-3-pro-preview` | Platform analysis benefiting from Google's infrastructure perspective |
| **Prompt Engineer** | `claude-sonnet-4.5` | `claude-opus-4.6` | Complex prompt architecture, multi-agent coordination design |
| **Reviewer** | `claude-sonnet-4.5` | `gemini-3-pro-preview` | Cross-provider review for cognitive diversity |
| **Git / Release** | `claude-haiku-4.5` | `gpt-5.1-codex-mini` | Mechanical git operations, changelog generation |

---

## Honesty Notes — What I Know vs. Don't Know

**High confidence (well-established model families):**
- Anthropic Claude tier characteristics (Opus > Sonnet > Haiku)
- OpenAI Codex code specialization advantage
- Vision capability in Opus models
- General tier pricing (premium > standard > fast/cheap)

**Medium confidence (extrapolated from family patterns):**
- GPT-5.2 improvements over GPT-5.1 (assumed incremental, following GPT patterns)
- Opus 4.6 vs Opus 4.5 (assumed newer = better reasoning, following Anthropic patterns)
- Codex-Max extended compute behavior (inferred from naming convention and tier placement)

**Low confidence (limited information):**
- Gemini 3 Pro Preview — "preview" status means behavior may change. Characterization is based on Google's general model trajectory.
- GPT-5.2-Codex vs GPT-5.1-Codex-Max — which is better for hard code problems is genuinely unclear. Different optimization strategies (newer training vs. more compute).
- Exact cost ratios between providers — platform pricing may differ from direct API pricing.
- Cross-provider prompt portability — how well Squad's Anthropic-optimized charters work on GPT/Gemini models is untested.

**Unknown:**
- Whether the platform applies any model-level rate limits differently
- Whether all 16 models have identical context window support on the platform (128K is the platform constraint, but some models might have lower effective limits)
- Performance characteristics of models under Squad's specific prompt patterns (32KB+ coordinator, inline charter pattern)

---

## Summary for Verbal

You're building the selection algorithm. Here's what this research gives you:

1. **16 models, 3 providers, 3 tiers.** The full catalog is above. Every model has an exact ID string ready for the `task` tool's `model` parameter.

2. **8 selection dimensions.** Reasoning depth, code generation, speed, cost, instruction following, vision, context, structured output. Weight these based on role + task.

3. **3 defaults + 8 specialists.** Start with Sonnet 4.5 / Haiku 4.5 / Opus 4.6 as the base tier, then switch to specialists when task characteristics warrant it.

4. **Provider diversity is a feature, not a nice-to-have.** Resilience, best-of-breed, lock-in avoidance, and cognitive diversity all argue for cross-provider selection. But start conservative — Anthropic defaults, OpenAI for code specialization, Google for review diversity.

5. **Expanded role-to-model mapping.** The 3-model mapping from Proposal 024 is now an 11-role × 2-model matrix with clear switching criteria.

Build the algorithm. This is your input data.
