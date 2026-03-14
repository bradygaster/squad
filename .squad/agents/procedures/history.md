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

