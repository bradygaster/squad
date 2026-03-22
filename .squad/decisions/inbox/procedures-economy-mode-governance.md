# Proposal: Economy Mode Integration in squad.agent.md

**By:** Procedures (Prompt Engineer)  
**Date:** 2026-03-22  
**Issues:** #500  
**Status:** DRAFT — for Flight review before merging to squad.agent.md

---

## Summary

Economy mode is a new session/persistent modifier that shifts Layer 3 (Task-Aware Auto-Selection) to cost-optimized alternatives. This proposal documents the governance additions needed in `squad.agent.md`.

**Note to Flight:** Procedures owns the skill design. Squad.agent.md is governance — Flight reviews before commit.

---

## 1. New Paragraph After Layer 0 (Per-Agent Model Selection section)

Insert after the existing Layer 0 bullet points and before "**Layer 1 — Session Directive**":

---

**Economy Mode — Cost Modifier (Layer 3 override):** Economy mode shifts all Layer 3 auto-selection to cost-optimized alternatives. It does NOT override Layer 0 (persistent config), Layer 1 (explicit session directive), or Layer 2 (charter preference) — user intent always wins.

- **Activation (session):** User says "use economy mode", "save costs", "go cheap" → activate for this session only.
- **Activation (persistent):** User says "always use economy mode" OR `"economyMode": true` in `.squad/config.json` → persists across sessions.
- **Deactivation:** "turn off economy mode" or remove `economyMode` from `config.json`.
- **On session start:** Read `.squad/config.json`. If `economyMode: true`, activate economy mode before any spawns.

---

## 2. Economy Model Selection Table

Add after Layer 3 normal table:

---

**Economy Mode Layer 3 Table** (active when economy mode is on):

| Task Output | Normal Mode | Economy Mode |
|-------------|-------------|--------------|
| Writing code (implementation, refactoring, bug fixes) | `claude-sonnet-4.5` | `gpt-4.1` or `gpt-5-mini` |
| Writing prompts or agent designs | `claude-sonnet-4.5` | `gpt-4.1` or `gpt-5-mini` |
| Docs, planning, triage, changelogs, mechanical ops | `claude-haiku-4.5` | `gpt-4.1` or `gpt-5-mini` |
| Architecture, code review, security audits | `claude-opus-4.5` | `claude-sonnet-4.5` |
| Scribe / logger / mechanical file ops | `claude-haiku-4.5` | `gpt-4.1` |

Prefer `gpt-4.1` over `gpt-5-mini` for structured output or tool use. Prefer `gpt-5-mini` for pure text generation.

---

## 3. Spawn Acknowledgment Convention

Add to the spawn acknowledgment format guidance:

---

When economy mode is active, include `💰 economy` after the model name in spawn acknowledgments:

```
🔧 Fenster (gpt-4.1 · 💰 economy) — fixing auth bug
📋 Scribe (gpt-4.1 · 💰 economy) — logging decision
```

This gives the user instant visibility that cost-optimized models are in use.

---

## 4. Valid Models Catalog Audit

Current "Valid models" section lists:

```
Premium: claude-opus-4.6, claude-opus-4.6-fast, claude-opus-4.5
Standard: claude-sonnet-4.5, claude-sonnet-4, gpt-5.2-codex, gpt-5.2, gpt-5.1-codex-max, gpt-5.1-codex, gpt-5.1, gpt-5, gemini-3-pro-preview
Fast/Cheap: claude-haiku-4.5, gpt-5.1-codex-mini, gpt-5-mini, gpt-4.1
```

**Audit findings:**
- `claude-opus-4.6` and `claude-opus-4.6-fast` are listed but not used in the Layer 3 table (table uses `claude-opus-4.5`). The Layer 3 table should reference `claude-opus-4.6` as the premium default for consistency with the catalog.
- `claude-sonnet-4.6` appears in the model-selection SKILL.md but is absent from the valid models list in squad.agent.md. Add it under Standard.
- Economy mode introduces `gpt-4.1` and `gpt-5-mini` as primary alternatives — both are already in the Fast/Cheap catalog. No additions needed.

**Proposed updated catalog:**

```
Premium: claude-opus-4.6, claude-opus-4.6-fast, claude-opus-4.5
Standard: claude-sonnet-4.6, claude-sonnet-4.5, claude-sonnet-4, gpt-5.4, gpt-5.3-codex, gpt-5.2-codex, gpt-5.2, gpt-5.1-codex-max, gpt-5.1-codex, gpt-5.1, gpt-5, gemini-3-pro-preview
Fast/Cheap: claude-haiku-4.5, gpt-5.1-codex-mini, gpt-5-mini, gpt-4.1
```

(Added `claude-sonnet-4.6`, `gpt-5.4`, `gpt-5.3-codex` which appear in the model-selection SKILL.md fallback chains but are missing from squad.agent.md's catalog.)

---

## 5. Config Schema Addition

Add `economyMode` to the config schema reference in squad.agent.md (wherever `defaultModel` is documented):

```json
{
  "version": 1,
  "defaultModel": "claude-sonnet-4.6",
  "economyMode": true,
  "agentModelOverrides": {
    "fenster": "claude-sonnet-4.6"
  }
}
```

---

## Rationale

Economy mode solves a real user need: "I want all agents to run cheaper, but I don't want to set each one individually." It's a session-level modifier that works orthogonally to the existing hierarchy — no layer gets changed, only Layer 3's lookup table swaps. The `💰` indicator keeps it transparent.

The skill (`economy-mode/SKILL.md`) covers the coordinator behavior in detail. This proposal is the governance side — ensuring squad.agent.md is the authoritative source for the feature.

---

## References

- Skill: `.squad/skills/economy-mode/SKILL.md`
- Issue: #500
- Model selection skill: `.squad/skills/model-selection/SKILL.md`
