# Procedures

## Core Context

Skills enable lazy-loading of domain knowledge. Respawn prompts carry critical context across session boundaries.

## Patterns

**Deterministic skill pattern (2026-03-10):** Skills were too loose. Agents interpreted intent instead of following explicit steps. Solution: rewrite skills to be fully deterministic with SCOPE section (✅ THIS SKILL PRODUCES, ❌ THIS SKILL DOES NOT PRODUCE) and AGENT WORKFLOW section (ASK/GENERATE/WRITE/TELL/STOP). Same input → same output, every time.

**Self-contained skills pattern (2026-03-15):** Skills are self-contained bundles per GitHub agent-skills spec. Resources live WITH the skill, not in separate template directories. Skills directory contains SKILL.md + scripts + examples + configs. Agent reads SKILL.md, sees "copy X from this directory," and does it. Zero manual steps.
