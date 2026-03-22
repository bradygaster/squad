# Procedures — Project History

> Learnings, patterns, and context for the Prompt Engineer.

## Learnings

📌 **Team update (2026-03-22T09-35Z — Wave 1):** Economy mode governance proposal and personal squad consult-mode governance proposal authored for squad.agent.md — both DRAFT, awaiting Flight review before merging. Economy mode adds Layer 3 table + spawn convention (`💰 economy`) + model catalog audit. Personal squad adds consult mode detection, path reference table, spawn guidance. Persistent model preference (Layer 0) documented. Proposed new skill: `.squad/skills/consult-mode/SKILL.md` (post-approval). Deterministic skill pattern proven effective. PR #503 open with skills module. Next: Flight review → merge governance to squad.agent.md. No blocking issues.

### 2026-03-10: Deterministic skill pattern

**Problem:** Skills were too loose. The distributed-mesh skill was tested in a real project (mesh-demo), and agents generated 76 lines of validator code, 5 test files with 43 tests, regenerated sync scripts that should have been copied from templates, and left decision files empty. The skill document let agents interpret intent instead of following explicit steps.

**Solution:** Rewrite skills to be fully deterministic:

1. **SCOPE section** (right after frontmatter, before Context)
   - ✅ THIS SKILL PRODUCES — exact list of files/artifacts
   - ❌ THIS SKILL DOES NOT PRODUCE — explicit negative list to prevent scope creep

2. **AGENT WORKFLOW section** — Step-by-step deterministic instructions
   - ASK: exact questions to ask the user
   - GENERATE: exactly which files to create, with schemas
   - WRITE: exactly which decision entry to write, with template
   - TELL: exact message to output to user
   - STOP: explicit stopping condition, with negative list of what NOT to do

3. **Fix ambiguous language:**
   - "do the task" → clarify this means "the agent's normal work" not "build something for the skill"
   - "Agent adds the field" → clarify this describes what a consuming agent does with data it READ
   - Phase descriptions → note that phases are project-level decisions, not auto-advanced

4. **Decision template** — inline markdown showing exactly what to write

5. **Anti-patterns for code generation** — explicit list of things NOT to build

**Pattern for other skills:** All skills should have SCOPE (what it produces, what it doesn't) and AGENT WORKFLOW (deterministic steps with STOP condition). Same input → same output, every time. Zero ambiguity.

📌 Team update (2026-03-14T22-01-14Z): Distributed mesh integrated with deterministic skill pattern — decided by Procedures, PAO, Flight, Network

### 2026-03-15: Self-contained skills pattern (agent-skills spec)

**Problem:** The distributed-mesh skill had a manual gap — Step 4 told the user to copy sync scripts from templates/mesh/ manually. This violated the GitHub agent-skills spec, which says: "add scripts, examples or other resources to your skill's directory. The skill instructions should tell Copilot when, and how, to use these resources."

**Solution:** Skills are self-contained bundles. Resources live WITH the skill, not in separate template directories:

1. **Bundle resources IN the skill directory:** Copy `sync-mesh.sh`, `sync-mesh.ps1`, and `mesh.json.example` into `.squad/skills/distributed-mesh/`
2. **Update SKILL.md workflow:**
   - Step 2: Reference `mesh.json.example` from THIS skill's directory
   - Step 3: COPY sync scripts from THIS skill's directory to project root (agent does it, not user)
   - Step 4: RUN `--init` if Zone 2 state repo specified (agent does it, not user)
3. **Update SCOPE section:** Clarify the skill PRODUCES the copied scripts (bundled resources ≠ generated code)
4. **Replicate to templates:** Copy entire skill directory to `templates/skills/`, `packages/squad-cli/templates/skills/`, `packages/squad-sdk/templates/skills/`

**Pattern for all skills:** Skills are self-contained. Scripts, examples, configs, and resources travel WITH the skill. The agent reads SKILL.md, sees "copy X from this directory," and does it. Zero manual steps.

### 2026-03-15: Three new governance policies added to agent system

**Task:** Brady directive — implement three new policies across the agent system:

1. **Agent Error Lockout** — Added to squad.agent.md. After 2 cumulative errors (build/test failures or reviewer rejection) on the same task, agent is locked out for that task only. Different agent takes over. Coordinator tracks and enforces; Scribe logs lockout events.

2. **Product Isolation Rule** — Added to every charter and squad.agent.md Constraints. Tests, CI, and product code must NEVER depend on specific agent names from any squad. "Our squad" must not impact "the squad." Use generic/parameterized values (e.g., "test-agent-1") instead of real agent names (Flight, EECOM, FIDO).

3. **Peer Quality Check** — Added to every charter. Before finishing work, agents must verify their changes don't break existing tests. Run test suite for files touched. Update history.md when learning from mistakes.

**Implementation:** Updated `.github/agents/squad.agent.md` (new section + constraint) and all 19 active agent charters in `.squad/agents/*/charter.md`.

**Pattern:** Policies added as subsections under "How I Work" in charters to ensure they're loaded with agent context. Coordinator-level policies live in squad.agent.md with explicit enforcement instructions.

### 2026-03-16: Team-wide reskill — 17.4% reduction

**Context:** Routine maintenance reskill, one day after previous reskill (2026-03-15). Last reskill brought the system from 117.4KB to 51.7KB. This pass focused on remaining oversized charters.

**Work done:**
- **Scribe (2143→1557):** Compressed workflow steps, kept essential commit instructions
- **Handbook (1807→1529):** Removed repetitive LLM-FIRST DOCS emphasis
- **FIDO (1715→1370):** Consolidated verbose NEVER/ALWAYS sections
- **Booster (1583→1368):** Same NEVER/ALWAYS compression pattern

**Results:** 26,721→17,088 bytes (charters), 28,602→28,602 bytes (histories), total 55,323→45,690 bytes. 9,633 bytes saved (17.4% reduction). All charters now ≤1.5KB.

**Skill extraction:** No new patterns extracted. CastingEngine integration work (from EECOM March 15) is still evolving — not yet mature enough for skill template. Histories all <12KB, no compression needed.

**Pattern:** NEVER/ALWAYS sections in charters compress well — fold bullet lists into single-paragraph summaries. Essential workflow details (Scribe's commit steps) should stay verbose.

### 2026-03-22: Economy mode skill and personal squad governance (#500, #344)

**Task:** Two governance tasks — economy mode skill design and personal squad coordinator awareness.

**Economy mode (SKILL.md):**
- Created `.squad/skills/economy-mode/SKILL.md` as a Layer 3 modifier, not a new resolution layer
- Key design decision: economy mode ONLY affects Layer 3 auto-selection — Layer 0/1/2 (user intent) always wins
- `💰` indicator in spawn acknowledgments keeps it transparent
- Activation via session phrase, persistent config (`economyMode: true` in config.json), or CLI flag
- Architecture trips shift from opus → sonnet; code tasks shift from sonnet → gpt-4.1/gpt-5-mini
- Confidence: `low` — first implementation, not yet validated

**Personal squad governance (proposals):**
- Gap analysis: coordinator has no consult mode awareness despite full SDK implementation
- Five gaps identified: Init Mode missing personal squad resolution, no consult mode detection, TEAM_ROOT has no personal-squad semantics, charter templates lack consult-mode patterns, no consult-mode skill
- Proposed `CONSULT_MODE: true` as spawn prompt signal, `🧳 consult` in acknowledgments
- Proposed new consult-mode skill (after governance approval — skill after governance, not before)

**Governance workflow pattern:** When proposals touch squad.agent.md (governance territory), write to `decisions/inbox/` for Flight review. Don't directly edit squad.agent.md — Flight reviews governance changes.

**Catalog audit finding:** `claude-sonnet-4.6`, `gpt-5.4`, `gpt-5.3-codex` appear in model-selection SKILL.md fallback chains but are absent from squad.agent.md's "Valid models" catalog. Documented in economy-mode governance proposal for Flight to address.

