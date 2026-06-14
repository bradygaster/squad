---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Slim squad.agent.md by extracting 3 sections to satellite skills (closes #1308 phase 1)

## Symptom

`squad.agent.md` is loaded as the agent prompt at every Copilot session start. As of v0.10.0-insider.1 it sits at **81 KB / 1,137 lines** and was steadily growing — the v0.10 stabilisation pass alone added +10.6 KB / +114 lines. Every byte of that file is paid at every session.

## Phase 1 fix (this PR)

Extract three **low-cross-reference, high-byte** sections into satellite skills the coordinator loads on demand via the `skill` tool. Same pattern that already worked for `cross-squad-communication` (#1295).

| Extracted to satellite skill | Bytes saved in main file |
|---|---|
| `coordinator-init-mode` (Init Mode Phase 1 + Phase 2) | 5.4 KB |
| `coordinator-source-of-truth` (Source of Truth Hierarchy table) | 4.4 KB |
| `coordinator-response-mode` (Response Mode Selection + Lightweight Spawn Template) | 3.9 KB |

### Result

- `squad.agent.md`: **81 KB → 70 KB** (-13.9%, -140 lines)
- Three new bundled skills (`coordinator-source-of-truth`, `coordinator-response-mode`, `coordinator-init-mode`) installed alongside the existing 16 — total 19 skills at `.github/skills/`
- Behaviour unchanged: each removed section is replaced with a stub that names the trigger condition and instructs the coordinator to `skill(coordinator-X)` before acting

## Stubs left in `squad.agent.md`

Each extracted section keeps a short stub (4-12 lines) so the coordinator still knows the section exists and what triggers it. The full algorithm/table/template lives in the satellite skill.

Example (Source of Truth, was 30+ lines, now 9):

```markdown
## Source of Truth Hierarchy

Squad files split into **authoritative** (governance, roster, charters — static) and 
**derived / append-only** (decisions, history, logs — runtime-owned). The four 
governing rules:

1. **`squad.agent.md` wins** any conflict with another file.
2. **Append-only files** are never retroactively edited.
3. **Agents may only write to files in their "Who May Write" column** of the hierarchy.
4. **Only Squad (Coordinator)** records accepted decisions in `.squad/decisions.md`.

**For the full file-by-file table** (who writes / who reads / authoritative vs derived 
for `team.md`, `decisions.md`, `routing.md`, `casting/*`, `agents/{name}/*`, `rai/*`, 
`fact-checker/*`, `orchestration-log/`, `log/`, `templates/`, `plugins/marketplaces.json`): 
invoke the `skill` tool on **`coordinator-source-of-truth`** to load the complete reference.
```

## What is NOT extracted (intentional)

These sections stay in `squad.agent.md` because they're loaded on EVERY prompt and / or are load-bearing for first-touch behaviour:

- **Team Mode + state-backend handshake + HARD RULE** (#1306) — handshake must fire before any state write
- **Routing table** — the trigger table for every user prompt
- **Hard trigger — keyword-to-skill match** paragraph (#1307) — load-bearing for the spawn-routing fix
- **How to Spawn an Agent** — referenced from every routing-table action
- **Coordinator Identity / Personal Squad / Memory Governance Tools** — frequently re-read inline

Follow-up issues will tackle these one at a time if/when needed.

## Wired changes

- New: `.squad/skills/coordinator-{source-of-truth,response-mode,init-mode}/SKILL.md` are the **canonical source files** kept in the squad repo itself (the same convention every other bundled skill follows). At install/upgrade time they are copied to `.github/skills/coordinator-{x}/SKILL.md` in the user's repo — that's the Copilot CLI custom-skills location adopted by #1304 (formerly `.copilot/skills/`).
- Mirrored at build time to `packages/squad-cli/templates/skills/` and `packages/squad-sdk/templates/skills/` via `scripts/sync-skill-templates.mjs` (same path every other manifest skill takes).
- `MANIFEST_SKILL_NAMES` in `packages/squad-sdk/src/config/init.ts` grows by 3 entries (now 19)
- `TEMPLATE_MANIFEST` in `packages/squad-cli/src/cli/core/templates.ts` grows by 3 entries with `../.github/skills/` destinations (matching the post-#1304 install location)
- `.squad-templates/squad.agent.md` replaces each extracted section with a stub
- 4 mirrored copies re-synced via `scripts/sync-templates.mjs --sync`

## Tests

- `test/init.test.ts > should install every manifest-curated skill (regression: bradygaster/squad#1289, #1264)` — already imports `MANIFEST_SKILL_NAMES` and iterates it, so it automatically asserts the 3 new skills install. **287/287 tests pass.**
- Smoke test: fresh `squad init` produces 19 skills at `.github/skills/`, `squad.agent.md` is 70 KB.

## Composability

Disjoint from all other open PRs. Pure file moves + a few line replacements + 3 manifest entries.

## Follow-ups (separate PRs)

The remaining high-bloat sections in `squad.agent.md` are stickier and need careful design to extract:

- **Routing table** (9.2 KB) — needed on every prompt; can't be lazy-loaded as-is. May be slimmable by moving the action-cell verbiage into satellite skills (the trigger table stays, the action prose moves).
- **Team Mode** (5.5 KB) — contains the state-backend handshake, which MUST fire on every session. Maybe extract the worktree-awareness / casting-migration sub-sections.
- **How to Spawn an Agent** (3.2 KB) — could extract the role-emoji catalog.

Target: get the coordinator down to **~45 KB** in 2-3 follow-up PRs.
