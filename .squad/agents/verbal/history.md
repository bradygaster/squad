📌 Team update (2026-03-08): Secret handling skill created and deployed at `.squad/skills/secret-handling/SKILL.md` — canonical reference for all agents. Spawn templates hardened with explicit prohibitions (.env reads, secret writes). Agent charters updated with standard Security sections. First line of defense in 5-layer architecture. Fenster's hooks, Baer's audit, Hockney's tests provide enforcing layers. All 13 decisions merged. — decided by Verbal

📌 Team update (2026-03-07T17:35:45Z): Issue #255 — Skill-based orchestration deployed. Extracted 4 skills (init-mode, model-selection, client-compatibility, reviewer-protocol) from squad.agent.md (840→711 lines). Added defineSkill() builder to SDK. squad build generates .squad/skills/ from config. Lazy loading reduces context window. — decided by Verbal

# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21



## Learnings

### From Beta (carried forward)
- Tiered response modes (Direct/Lightweight/Standard/Full) — spawn templates vary by complexity
- Silent success detection: 6-line RESPONSE ORDER block prevents ~7-10% of background spawns from returning no text
- Skills system architecture: SKILL.md lifecycle with confidence progression (low → medium → high)
- Spawn template design: charter inline, history read, decisions read — ceremony varies by tier
- Coordinator prompt structure: squad.agent.md is the authoritative governance file
- respawn-prompt.md is the team DNA — owned by Verbal, reviewed by Keaton

### #241: Coordinator Session — Routing LLM Prompt + Parser
- Created `src/cli/shell/coordinator.ts` with three exports: `buildCoordinatorPrompt()`, `parseCoordinatorResponse()`, `formatConversationContext()`
- Prompt assembles from team.md (roster) + routing.md (rules) — graceful fallback if either is missing
- Response parser handles three routing modes: DIRECT (answer inline), ROUTE (single agent), MULTI (fan-out)
- Removed unused `resolveSquad` import from the task spec — kept imports clean for strict mode
- Exported all functions and types from `src/cli/shell/index.ts`
- PR #286 → bradygaster/dev

### Phase 1 SDK Mode Detection — 2026-03-05T21:37:09Z
- Updated `.github/agents/squad.agent.md` with SDK Mode Detection section
- Detection heuristic: session-start check for `squad/` directory or `squad.config.ts` at project root
- When detected: (1) structural changes go to `squad/*.ts` (not `.squad/*.md`), (2) after config changes, remind user to run `squad build`, (3) prefer typed builders over markdown parsing
- SDK mode *extends* markdown mode (never breaks existing projects)
- All agents inherit awareness through coordinator logic
- Ready for Phase 2+ when SDK projects start using builders

**Team Context:** Keaton scoped Phase 1 (5 success criteria). Edie built 8 builders. Fenster built `squad build --check`. Hockney wrote 60 tests (all passing). Kujan cleared OTel. Verbal updated coordinator. All decisions merged to decisions.md. Ready for Phase 2 scaffolding.

### #313: Remote Squad Mode — Coordinator Awareness
- Updated `.github/agents/squad.agent.md` Worktree Awareness section with third resolution strategy: remote squad mode via `.squad/config.json` `teamRoot` field
- Added `PROJECT_ROOT` variable to spawn template alongside `TEAM_ROOT`, with scope explanation (identity vs. project-local paths)
- Updated "Passing the team root to agents" section to describe dual-path passing in remote vs. local mode
- Added @copilot incompatibility note — remote mode is local-dev only
- Kept changes minimal: three targeted sections modified, no structural changes to existing content

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

### Rock-Paper-Scissors Sample — Prompt Architecture
- Created `samples/rock-paper-scissors/prompts.ts` with 10 player strategies and scorekeeper prompt
- **The Learner (Sherlock 🔍)** is the key demo agent — prompt instructs LLM to analyze opponent play history, detect patterns (frequency bias, sequences, cycles), predict next move, and counter strategically with reasoning
- Two-line response format for The Learner: [analysis sentence] + [move]. Makes logs showcase actual LLM pattern recognition
- Deterministic agents (Rocky, Edward, Papyrus) have absolute prompts: "ALWAYS throw X. Never deviate."
- Cycler uses modulo arithmetic in prompt: "Round % 3 == 1 → rock" (teaches LLM stateful behavior)
- Creative agents: Echo (copycat), Rebel (contrarian — intentionally loses), Poker (bluffer with fake tells)
- Scorekeeper prompt: entertaining commentary + mental leaderboard tracking + personality-driven announcements
- Design principle: prompts are code. Precision over prose. Each must be robust against LLM drift.

## 📌 Team Update (2026-03-03T00:00:50Z)

**Session:** RPS Sample Complete — Verbal, Fenster, Kujan, McManus collaboration

Multi-agent build of Rock-Paper-Scissors game with 10 AI strategies, Docker infrastructure, and full documentation. Fenster (Coordinator) identified and resolved 3 integration bugs (ID mismatch, move parsing, history semantics). Sample ready for use.

### Skill: history-hygiene (2026-03-04)
Created `.squad/skills/history-hygiene/SKILL.md` to codify lesson from Kobayashi v0.6.0 incident. Core rule: record final outcomes to history, not intermediate requests or reversed decisions. One read = one truth. No cross-referencing required. Team learned hard way that stale history entries poison future spawns. Formal intervention: Keaton rewrote charter guardrails, Fenster corrected 19 entries.

---

## History Audit — 2026-03-03

**Audit Results:** 0 corrections. File is clean.

**Checked for:**
- ✓ No conflicting entries
- ✓ No stale or reversed decisions
- ✓ No v0.6.0 target references (v0.6.0 appears only as historical incident context, which is correct)
- ✓ No intermediate states recorded as final (all entries document outcomes)
- ✓ All future-spawn-readable: no cross-reference dependencies

**Timeline integrity:** Forward-moving (2026-02-21 → 2026-03-04), no reversals.

**Note:** v0.6.0 reference in history-hygiene entry is correct as-written — it documents the *Kobayashi incident* that taught the team the skill itself. No change needed.

### #194: SDK Mode Detection — Coordinator Prompt Update
- Added `### SDK Mode Detection` section to `.github/agents/squad.agent.md` under `## Team Mode`, before `### Issue Awareness`
- Detection: coordinator checks for `squad/` directory or `squad.config.ts` at project root
- Three behavioral changes when active: edit redirection (target `squad/*.ts` not `.squad/*.md`), build reminder (`squad build`), richer config source from typed definitions
- Core principle baked into prompt: SDK mode extends markdown mode, `.squad/` remains the runtime format
- Kept to ~10 lines — prompt section, not documentation


### #255: Skill-Based Orchestration — Decompose squad.agent.md

**Problem:** squad.agent.md at 840 lines. Every feature adds inline instructions even when irrelevant to current task. Needed pluggable skills that load on demand.

**Solution — 4 parts:**

1. **Added `defineSkill()` builder to SDK** — New SkillDefinition type in `packages/squad-sdk/src/builders/types.ts` with fields: name, description, domain, confidence, source, content, tools. Builder function in `index.ts` with validation. Added `skills?: readonly SkillDefinition[]` to SquadSDKConfig. Exported as BuilderSkillDefinition to distinguish from runtime SkillDefinition (skill-loader.ts).

2. **Extracted 4 coordinator capabilities to skill files:**
   - `.squad/skills/init-mode/SKILL.md` — Phase 1 + Phase 2 team initialization (~100 lines from squad.agent.md)
   - `.squad/skills/model-selection/SKILL.md` — 4-layer hierarchy, role-to-model mapping, fallback chains (~90 lines)
   - `.squad/skills/client-compatibility/SKILL.md` — Platform detection, VS Code adaptations, SQL caveat (~60 lines)
   - `.squad/skills/reviewer-protocol/SKILL.md` — Rejection workflow, strict lockout semantics (~30 lines)
   - All marked `confidence: "high"`, `source: "extracted"`

3. **Updated squad.agent.md with lazy-loading references** — Replaced extracted sections with compact "Skill: Read .squad/skills/{name}/SKILL.md" + core rules summary. Result: 840 lines → 711 lines (15% reduction, ~130 lines removed).

4. **Updated `squad build` to generate SKILL.md from defineSkill()** — Added `generateSkillFile()` to `build.ts`, generates frontmatter + content. Added skills loop to `buildFilePlan()`. Import uses `@bradygaster/squad-sdk/builders` subpath to avoid type collision with runtime SkillDefinition.

**Key constraints respected:**
- Existing behavior unchanged — skills lazy-loaded (read on demand), coordinator gets same instructions
- squad.agent.md still works — enough context inline to know WHEN to load each skill
- Confidence is 'high' (extracted from authoritative source)
- Source is 'extracted' (marks decomposition origin)

**Builds passing:** squad-sdk and squad-cli compile cleanly with new types.


