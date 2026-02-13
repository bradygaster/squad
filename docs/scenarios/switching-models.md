# Switching AI Models — Budget vs Quality

Model selection strategies for different needs. Squad supports 16 models with fallback chains.

---

## 1. The Default: Cost-First Strategy

Squad's default model configuration prioritizes cost-effectiveness:

- **Non-code tasks** (planning, triage, decisions) → `claude-haiku-4.5` (fast, cheap)
- **Code tasks** (implementation, refactoring) → `claude-sonnet-4.5` (balanced quality/cost)
- **Code review** (critical analysis) → `claude-sonnet-4.5`

This is optimized for **everyday use** — good quality without burning your API budget.

---

## 2. Budget Mode: Always Use Haiku

If you're cost-sensitive or working on a small project:

```
> Switch the entire team to claude-haiku-4.5 for all tasks.
```

```
✅ Model configuration updated

All agents now use claude-haiku-4.5 (fast/cheap tier)

Agents will be faster but may need more guidance on complex tasks.
```

This is written to `.ai-team/model-config.json`:

```json
{
  "default": "claude-haiku-4.5",
  "overrides": {}
}
```

Now every agent uses Haiku for everything. Faster responses, lower cost, slightly less nuanced reasoning.

---

## 3. Quality Mode: Use Opus for Critical Work

If you're working on architecture, security, or high-stakes features:

```
> Use claude-opus-4.6 for Neo (the Lead) and claude-sonnet-4.5
> for everyone else.
```

```
✅ Model configuration updated

Neo (Lead) → claude-opus-4.6 (premium tier)
All other agents → claude-sonnet-4.5 (standard tier)

Neo will give higher-quality code reviews and architectural guidance.
```

This is written to `.ai-team/model-config.json`:

```json
{
  "default": "claude-sonnet-4.5",
  "overrides": {
    "neo": "claude-opus-4.6"
  }
}
```

Neo gets the premium model for code reviews and decisions. Everyone else stays on Sonnet.

---

## 4. Per-Agent Overrides

You can set different models for different roles:

```
> Configure models like this:
> Neo (Lead) → opus (best quality for code review)
> Trinity (Frontend) → sonnet (balanced)
> Morpheus (Backend) → sonnet (balanced)
> Tank (Tester) → haiku (tests don't need premium reasoning)
```

```
✅ Model configuration updated

Neo → claude-opus-4.6 (premium)
Trinity → claude-sonnet-4.5 (standard)
Morpheus → claude-sonnet-4.5 (standard)
Tank → claude-haiku-4.5 (fast/cheap)
```

Tank doesn't need Opus to write tests. Neo does need it for code reviews. Balanced spend.

---

## 5. The 16-Model Catalog

Squad supports these models (as of v0.2.0):

**Premium tier** (highest quality, highest cost):
- `claude-opus-4.6` — latest Opus, best reasoning
- `claude-opus-4.6-fast` — Opus with faster response time
- `claude-opus-4.5` — previous Opus generation

**Standard tier** (balanced quality/cost):
- `claude-sonnet-4.5` — current default for code tasks
- `claude-sonnet-4` — previous Sonnet generation
- `gemini-3-pro-preview` — Google's latest
- `gpt-5.3-codex` — OpenAI Codex, code-specialized
- `gpt-5.2-codex`
- `gpt-5.2`
- `gpt-5.1-codex-max`
- `gpt-5.1-codex`
- `gpt-5.1`
- `gpt-5`

**Fast/cheap tier** (fast responses, lower cost):
- `claude-haiku-4.5` — current default for non-code tasks
- `gpt-5.1-codex-mini` — smaller Codex model
- `gpt-5-mini`
- `gpt-4.1`

**Note:** Model availability depends on your GitHub Copilot subscription tier.

---

## 6. Fallback Chains

If a model is unavailable, Squad falls back to the next tier:

```
claude-opus-4.6 → claude-sonnet-4.5 → claude-haiku-4.5
```

If Opus is unavailable (rate limit, quota), Squad automatically uses Sonnet. If Sonnet is unavailable, it falls back to Haiku.

You don't have to configure this — it's automatic.

---

## 7. When to Use Which Model

**Use Haiku (`claude-haiku-4.5`) when:**
- Writing tests
- Running triage or planning tasks
- Generating boilerplate code
- Refactoring (simple renames, restructuring)
- You're on a budget and speed matters more than depth

**Use Sonnet (`claude-sonnet-4.5`) when:**
- Writing feature code
- Implementing APIs or UI components
- Refactoring with logic changes
- Most everyday development tasks

**Use Opus (`claude-opus-4.6`) when:**
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
> Switch all agents to haiku. We're prototyping, speed matters
> more than perfection.
```

**Use premium for the Lead only:**

```
> Neo should use opus for code reviews. Everyone else stays on sonnet.
```

**Temporary override for a specific task:**

```
> Morpheus, use opus for this security-critical auth implementation.
```

**Reset to defaults:**

```
> Reset model configuration to Squad's defaults.
```

---

## Tips

- **Default is fine for most projects.** Haiku for planning, Sonnet for code. You don't need to change it.
- **Use Opus for the Lead.** Code reviews benefit most from premium reasoning. Opus catches edge cases Sonnet misses.
- **Haiku is underrated for tests.** Test writing doesn't require deep reasoning — Haiku is fast and accurate enough.
- **Per-agent overrides are cheap.** Put Opus on the Lead, Haiku on the Tester, Sonnet on everyone else. Balanced budget.
- **Model config is in `.ai-team/model-config.json`.** Commit it so your team uses the same models.
