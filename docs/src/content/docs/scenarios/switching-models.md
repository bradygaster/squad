# Switching AI Models — Budget vs Quality

**Try this to reduce costs temporarily:**
```
Switch everyone to Luna — I'm trying to save costs this sprint
```

**Try this to maximize quality:**
```
Use Sol for all agents — quality over cost for this session
```

**Try this to restore defaults:**
```
Reset to default model strategy
```

Squad supports 17 models across three tiers. Switch the entire team, set per-agent preferences, or let Squad auto-route based on task type.

---

## 1. The Default: Cost-First Strategy

Model selection strategies for different needs. Squad supports 17 models with fallback chains.

Squad's default model configuration prioritizes cost-effectiveness:

- **Non-code tasks** (planning, triage, decisions) → `gpt-5.6-luna` (fast, cheap)
- **Code tasks** (implementation, refactoring) → `gpt-5.6-terra` (balanced quality/cost)
- **Code review** (critical analysis) → `gpt-5.6-sol`

This is optimized for **everyday use** — good quality without burning your API budget.

---

## 2. Budget Mode: Always Use Luna

If you're cost-sensitive or working on a small project:

```
> Switch the entire team to gpt-5.6-luna for all tasks.
```

```
✅ Model configuration updated

All agents now use gpt-5.6-luna (fast/cheap tier)

Agents will be faster but may need more guidance on complex tasks.
```

This is written to `.ai-team/model-config.json`:

```json
{
  "default": "gpt-5.6-luna",
  "overrides": {}
}
```

Now every agent uses Luna for everything. Faster responses, lower cost, slightly less nuanced reasoning.

---

## 3. Quality Mode: Use Sol for Critical Work

If you're working on architecture, security, or high-stakes features:

```
> Use gpt-5.6-sol for Neo (the Lead) and gpt-5.6-terra
> for everyone else.
```

```
✅ Model configuration updated

Neo (Lead) → gpt-5.6-sol (premium tier)
All other agents → gpt-5.6-terra (standard tier)

Neo will give higher-quality code reviews and architectural guidance.
```

This is written to `.ai-team/model-config.json`:

```json
{
  "default": "gpt-5.6-terra",
  "overrides": {
    "neo": "gpt-5.6-sol"
  }
}
```

Neo gets the premium model for code reviews and decisions. Everyone else stays on Terra.

---

## 4. Per-Agent Overrides

You can set different models for different roles:

```
> Configure models like this:
> Neo (Lead) → sol (best quality for code review)
> Trinity (Frontend) → terra (balanced)
> Morpheus (Backend) → terra (balanced)
> Tank (Tester) → luna (tests don't need premium reasoning)
```

```
✅ Model configuration updated

Neo → gpt-5.6-sol (premium)
Trinity → gpt-5.6-terra (standard)
Morpheus → gpt-5.6-terra (standard)
Tank → gpt-5.6-luna (fast/cheap)
```

Tank doesn't need Sol to write tests. Neo does need it for code reviews. Balanced spend.

---

## 5. The 17-Model Catalog

Squad supports these models:

**Premium tier** (highest quality, highest cost):
- `gpt-5.6-sol` — premium model for visual and critical work
- `claude-opus-5` — latest Opus, best reasoning
- `claude-opus-4.8`
- `claude-opus-4.7`
- `claude-opus-4.6`

**Standard tier** (balanced quality/cost):
- `gpt-5.6-terra` — current default for code tasks
- `claude-sonnet-5`
- `claude-sonnet-4.6`
- `claude-sonnet-4.5`
- `gpt-5.5`
- `gpt-5.4`
- `gpt-5.3-codex` — OpenAI Codex, code-specialized
- `gemini-3.1-pro`

**Fast/cheap tier** (fast responses, lower cost):
- `gpt-5.6-luna` — lightweight model and first fast fallback
- `claude-haiku-4.5` — fast-tier fallback for non-code tasks
- `gpt-5.4-mini`
- `gpt-5-mini`

**Note:** Model availability depends on your GitHub Copilot subscription tier.

---

## 6. Fallback Chains

If a model is unavailable, Squad falls back to the next tier:

```
gpt-5.6-luna → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini
```

If Opus is unavailable (rate limit, quota), Squad automatically uses Sonnet. If Sonnet is unavailable, it falls back to Haiku.

You don't have to configure this — it's automatic.

---

## 7. When to Use Which Model

**Use Luna (`gpt-5.6-luna`) when:**
- Running triage or planning tasks
- Generating boilerplate code
- Refactoring (simple renames, restructuring)
- You're on a budget and speed matters more than depth

**Use Terra (`gpt-5.6-terra`) when:**
- Writing tests
- Writing feature code
- Implementing APIs or UI components
- Refactoring with logic changes
- Most everyday development tasks

**Use Sol (`gpt-5.6-sol`) when:**
- Code review (the Lead should catch subtle bugs)
- Architectural decisions
- Security-sensitive code
- Complex debugging
- Critical features where quality trumps cost

---

## 8. Sample Prompts for Model Configuration

**Check current model configuration:**

```
> What models is the team using?
```

**Switch everyone to budget mode:**

```
> Switch all agents to luna. We're prototyping, speed matters
> more than perfection.
```

**Use premium for the Lead only:**

```
> Neo should use sol for code reviews. Everyone else stays on terra.
```

**Temporary override for a specific task:**

```
> Morpheus, use sol for this security-critical auth implementation.
```

**Reset to defaults:**

```
> Reset model configuration to Squad's defaults.
```

---

## Tips

- **Default is fine for most projects.** Luna for planning, Terra for code. You don't need to change it.
- **Use Sol for the Lead.** Code reviews benefit most from premium reasoning. Sol catches edge cases Terra misses.
- **Luna is underrated for tests.** Test writing doesn't require deep reasoning — Luna is fast and accurate enough.
- **Per-agent overrides are cheap.** Put Sol on the Lead, Luna on the Tester, Terra on everyone else. Balanced budget.
- **Model config is in `.ai-team/model-config.json`.** Commit it so your team uses the same models.
