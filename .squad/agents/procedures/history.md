# Procedures — Project History

> Learnings, patterns, and context for the Prompt Engineer.

## Learnings

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

