# Proposal: Personal Squad Governance Awareness in squad.agent.md

**By:** Procedures (Prompt Engineer)  
**Date:** 2026-03-22  
**Issues:** #344  
**Status:** DRAFT — for Flight review before merging to squad.agent.md

---

## Summary

Squad has a consult mode (implemented, per `prd-consult-mode.md`) and personal squad semantics (via `resolveGlobalSquadPath()`), but `squad.agent.md` doesn't tell the coordinator how to reason about either. This proposal documents the gaps and the governance additions needed.

---

## Gap Analysis

### Gap 1: Init Mode references `--global` without explaining personal squad resolution

Current Init Mode says "run `squad init --global` for a personal squad" (implied by CLI docs) but squad.agent.md doesn't explain what a personal squad IS or how the coordinator should detect it.

**What agents need to know:**
- Personal squad = a squad at the global path (resolved via `resolveGlobalSquadPath()`)
  - Linux/macOS: `~/.config/squad/.squad`
  - macOS (alt): `~/Library/Application Support/squad/.squad`
  - Windows: `%APPDATA%\squad\.squad`
- If `.squad/config.json` contains `"consult": true`, the coordinator is working inside a consult session
- `sourceSquad` in `config.json` points to the original personal squad (for Scribe extraction context)

### Gap 2: No coordinator guidance for consult mode

`squad.agent.md` mentions nothing about consult mode. The coordinator doesn't know:
- How to recognize it's in a consult session
- That writes go to the project `.squad/` (isolated copy) — NOT the personal squad
- That Scribe's charter is patched with extraction instructions
- That `.squad/extract/` is a staging area for generic learnings

### Gap 3: TEAM_ROOT works, but personal squad semantics are absent

The coordinator resolves `TEAM_ROOT` correctly (Worktree Awareness section), but:
- No distinction between "project squad" vs "personal squad copy in consult mode"
- No guidance on what to tell agents about their squad context when in consult mode

### Gap 4: Charter templates have no personal-squad-aware patterns

Agent charters have no concept of:
- Consult mode restrictions (agents shouldn't commit to project, shouldn't pollute personal squad)
- Extraction tagging (Scribe needs to flag decisions as generic vs project-specific)

### Gap 5: No skill for consult-mode behavior

There is no skill for consult-mode coordinator behavior, even though consult mode has distinct patterns (invisibility, extraction, isolation).

---

## Proposed squad.agent.md Additions

### Addition 1: Consult Mode Detection (in Team Mode → On Session Start)

After "resolve the team root" and before Issue Awareness, add:

---

**Consult Mode Detection:** After resolving team root, check `.squad/config.json` for `"consult": true`.

- If `consult: true` → **Consult mode is active.** This is a personal squad consulting on a project.
  - The `.squad/` directory is an isolated copy of the user's personal squad.
  - `sourceSquad` in `config.json` contains the path to the original personal squad.
  - Do NOT read or write to `sourceSquad` — it's out of scope. Only operate within TEAM_ROOT.
  - Scribe's charter is already patched with extraction instructions — no coordinator action needed.
  - Include `🧳 consult` in your session acknowledgment: `Squad v{version} (🧳 consult — {projectName})`
  - Remind agents: decisions they make here are project-isolated until explicitly extracted.
- If `consult: false` or absent → Normal mode. Team root is authoritative.

---

### Addition 2: Personal Squad Path Reference

Add a new subsection under "Worktree Awareness":

---

**Personal Squad Paths:** The global squad path is resolved by `resolveGlobalSquadPath()`:

| Platform | Path |
|----------|------|
| Linux | `~/.config/squad/.squad` |
| macOS | `~/Library/Application Support/squad/.squad` |
| Windows | `%APPDATA%\squad\.squad` |

The coordinator should NEVER hard-code these paths. Use `squad --global` or `resolveGlobalSquadPath()` to resolve. Only relevant in consult mode (to understand the `sourceSquad` field) — the coordinator does NOT read the personal squad directly during a session.

---

### Addition 3: Consult Mode Spawn Guidance

Add to the spawn template section:

---

**In consult mode:** Pass `CONSULT_MODE: true` and `PROJECT_NAME: {projectName}` in spawn prompts alongside `TEAM_ROOT`. This lets agents know:
1. Their decisions will be reviewed for extraction — keep project-specific and generic reasoning separate
2. They should NOT reference personal squad paths or personal squad agent names
3. Scribe will classify their decisions — agents should write clear, extractable decision rationale

---

### Addition 4: Consult Mode Acknowledgment Format

Add to spawn acknowledgment conventions:

```
🧳 consult mode active — Fenster (claude-sonnet-4.5) — refactoring auth module
     ↳ decisions staged in .squad/extract/ for review before extraction
```

---

## Proposed New Skill

**Skill needed:** `.squad/skills/consult-mode/SKILL.md`

Should cover:
- Detecting consult mode from config.json
- Coordinator behavior changes (CONSULT_MODE in spawn prompts)
- Scribe extraction workflow (already documented in prd-consult-mode.md — condense into skill)
- Acknowledgment format conventions
- STOP: extraction is always user-driven via `squad extract` — coordinator never auto-extracts

This skill should be authored after this governance proposal is approved, to avoid the skill getting ahead of the governance.

---

## Charter Template Additions

All agent charter templates should include a note in "How I Work":

```markdown
**Consult Mode Awareness:** If `CONSULT_MODE: true` is in my spawn prompt, I'm working on a project outside my home squad. My decisions here are project-isolated. Write extractable rationale so Scribe can classify them for `squad extract` review.
```

This should be added to `.squad/templates/charter.md` (if it exists) and `.squad/agents/scribe/charter.md` (Scribe already has extraction logic, but clarifying the classification responsibility is valuable).

---

## Rationale

Consult mode is fully implemented at the SDK level (`prd-consult-mode.md`, `squad consult` command) but the coordinator has no awareness of it. The result: agents running in a consult session have no context that they're in a temporary, isolated copy of a personal squad. They might make decisions as if they're permanent, or reference the project in ways that pollute the personal squad on extraction.

These governance additions close the loop between the implementation (CLI + SDK) and the runtime behavior (coordinator + agents).

---

## References

- Consult mode PRD: `.squad/identity/prd-consult-mode.md`
- Issue: #344
- Flight ambient personal squad note: `.squad/decisions/inbox/flight-ambient-personal-squad.md`
