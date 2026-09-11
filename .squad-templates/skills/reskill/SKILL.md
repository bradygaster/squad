---
name: "reskill"
description: "Extract durable operating knowledge before slimming or replacing team charters"
domain: "team-optimization"
confidence: "high"
source: "manual — reduce per-agent context overhead"
---

## Context

When the coordinator hears "team, reskill" (or similar: "optimize context", "slim down charters"), trigger a team-wide optimization pass. The goal: reduce per-agent context consumption by extracting shared patterns from charters and histories into reusable skills.

This is a periodic maintenance activity. Run whenever charter/history bloat is suspected or a
team will be re-cast. Charters and histories are evidence, not the authority for current product
behavior: reconcile candidates against current source, workflows, tests, documentation, skills,
and decisions before preserving them.

## Process

### Step 1: Audit
Read all active agent charters and histories, then inventory existing skills. Measure byte sizes.
Identify:

- **Boilerplate** — sections repeated across ≥3 charters with <10% variation (collaboration, model, boundaries template)
- **Shared knowledge** — domain knowledge duplicated in 2+ charters (incident postmortems, technical patterns)
- **Mature learnings** — recurring history lessons that should be promoted to skills
- **Retirement-critical knowledge** — any still-current reusable procedure, constraint, incident
  lesson, or repository operating fact that would be lost if a charter or history were deleted

### Step 2: Extract
For each reconciled pattern:
1. Create or update the skill in the location that matches its activation surface:
   `.copilot/skills/{skill-name}/SKILL.md` for reusable local skills,
   `.squad/skills/{skill-name}/SKILL.md` for Squad-specific coordinator procedures, or
   `.github/skills/{skill-name}/SKILL.md` for GitHub Agentic Workflow procedures
2. Follow the skill template format (frontmatter + Context + Patterns + Examples + Anti-Patterns)
3. Keep the location consistent with the procedure's real entry point instead of copying the same
   contract into multiple trees without intent
4. Set confidence from the evidence, not the number of charters that contained it

### Step 3: Trim
**Charters** — target ≤1.5KB per agent:
- Remove Collaboration section entirely (spawn prompt + agent-collaboration skill covers it)
- Remove Voice section (tagline blockquote at top of charter already captures it)
- Trim Model section to single line: `Preferred: {model}`
- Remove "When I'm unsure" boilerplate from Boundaries
- Remove durable operating knowledge now covered by a skill — add a skill reference only when it
  helps the role activate the procedure
- Keep: Identity, What I Own, unique How I Work patterns, Boundaries (domain list only)

**Histories** — target ≤8KB per agent:
- Apply history-hygiene only when a retained history would otherwise assert a materially false
  operational fact
- Promote reusable current patterns even when found in one retiring charter or history
- Summarize old entries into `## Core Context` section
- Remove session-specific metadata (dates, branch names, requester names)

For a planned re-cast, avoid cosmetic history rewrites. Extract the reusable lesson, document
stale or conflicting material in the reskill report, and leave archival cleanup to the re-cast.

### Step 4: Report
Output a savings table:

| Agent | Charter Before | Charter After | History Before | History After | Saved |
|-------|---------------|---------------|----------------|---------------|-------|

Include totals and percentage reduction.

## Patterns

### Minimal Charter Template (target format after reskill)

```
# {Name} — {Role}

> {Tagline — one sentence capturing voice and philosophy}

## Identity
- **Name:** {Name}
- **Role:** {Role}
- **Expertise:** {comma-separated list}

## What I Own
- {bullet list of owned artifacts/domains}

## How I Work
- {unique patterns and principles — NOT boilerplate}

## Boundaries
**I handle:** {domain list}
**I don't handle:** {explicit exclusions}

## Model
Preferred: {model}
```

### Skill Extraction Threshold
- **Normal maintenance:** extract repeated operational knowledge; retain genuinely role-specific
  identity and working style.
- **Before a re-cast:** extract every still-current reusable operating rule, even if it appears in
  a single retiring charter or history.

### Conflict Resolution
1. Current implementation, executable workflows, and tests
2. Current user-facing documentation and current skills
3. Decisions that remain applicable
4. Charter and history records

Do not preserve historical assignments, status reports, personality, ownership, stale version
facts, or obsolete workarounds. Record intentionally discarded conflicts in the reskill report.

### Source and Mirror Discipline

`.squad-templates/skills/` is the canonical source for shipped Squad skill templates. After
changing a shipped template, run the repository's skill-template sync command and verify the
root, CLI, and SDK mirrors are byte-identical. Local `.copilot/skills/` guidance is maintained
separately and must not be treated as a generated mirror unless its sync contract says so.

## Anti-Patterns
- Don't delete unique per-agent identity or domain-specific knowledge
- Don't leave reusable knowledge in a retiring charter just because only one agent recorded it
- Don't merge unrelated patterns into a single mega-skill
- Don't remove Model preference line (coordinator needs it for model selection)
- Don't touch `.squad/decisions.md` during reskill
- Don't remove the tagline blockquote — it's the charter's soul in one line
