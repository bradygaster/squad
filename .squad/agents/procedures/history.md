# Procedures

> Standard Operating Procedures & Spec Writer

## Learnings

### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

Procedures assigned:
- **#485 (Agent Specification PRD)** → squad:flight + squad:procedures (architecture decision + formal spec structure)

Pattern: Agent specification gap identified. Procedures owns formal spec structure and documentation; Flight owns architecture decisions.

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. Procedures owns Agent Specification PRD structure (#485). Architecture decisions from Flight. Coordinate on formal spec format and standard structure for future agent definitions.
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

### Session 2 Summary (2026-03-22)

Wave 1 governance work on #500 and #344: authored economy-mode skill (`SKILL.md`), economy-mode governance proposal, and personal-squad governance proposal. Caught `claude-sonnet-4.6` missing from valid models catalog. PR #503 (`squad/500-344-governance`) merged to dev.

### 2025-07: Spawn template `name` parameter fix (#577)

**Problem:** Agent cast names weren't displayed during work — the tasks panel showed generic slugs like "general-purpose-task" instead of the cast name. Root cause: spawn templates in `squad.agent.md` specified `description` but NOT the `name` parameter for the `task` tool. The `name` parameter generates the human-readable agent ID shown in the tasks panel.

**Fix:** Added `name: "{name}"` (lowercase cast name) to all spawn templates in `.squad-templates/squad.agent.md`:
- Lightweight Spawn Template
- Model-passing example
- Main full spawn template ("Template for any agent")
- Scribe spawn template (hardcoded `name: "scribe"`)

Also updated: examples section (showing `name` + `description` pairs), anti-pattern #4 (now covers both `name` and `description`), and Constraints section (requiring `name` on every spawn).

**Pattern:** Every `task` tool spawn MUST include `name` set to the agent's lowercase cast name. Without it, the platform defaults to generic slugs. The `description` parameter is for the human-readable summary; `name` is for the agent ID.

📌 **Team update (2026-03-23T23:15Z):** Orchestration complete. Agent name display refactor shipped: spawn templates updated with mandatory `name` parameter across all 4 template variants. VOX and FIDO coordinated on parser extraction and cascading pattern strategies. All decisions merged to decisions.md. Canonical source: `.squad-templates/squad.agent.md` (all derived copies secondary).

### 2025-07: Model catalog refresh (#588)

**Problem:** The valid models catalog, fallback chains, role-to-model mappings, and default model references in `squad.agent.md` were stale — missing `claude-sonnet-4.6`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`, `claude-opus-4.6-1m` and still referencing removed models `claude-opus-4.6-fast` and standalone `gpt-5`.

**Fix:** Full catalog refresh across all model-referencing sections:
- Catalog: added 5 new models, removed 2 stale ones
- Defaults: code-writing tasks bumped to `claude-sonnet-4.6` (newest standard); code specialist bumped to `gpt-5.3-codex`
- Fallback chains: restructured with new models in sensible positions (e.g., `gpt-5.4-mini` in fast tier, `gpt-5.4` in standard)
- All 5 copies synced via `sync-templates.mjs`

**Pattern:** Model catalogs drift. When the platform adds/removes models, every section referencing models needs updating — not just the catalog list. Search for all model name strings before considering the refresh complete.
