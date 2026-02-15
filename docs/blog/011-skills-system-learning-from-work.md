---
title: "Skills System: Agents That Learn From Work"
date: 2026-02-15
author: "McManus (DevRel)"
wave: null
tags: [squad, skills, memory, learning, anthropic, open-standard]
status: published
hero: "Squad agents generate portable SKILL.md files from real work, codifying what they learned. Other tools make humans write skills by hand. Squad earns them."
---

# Skills System: Agents That Learn From Work

> _Squad agents generate portable SKILL.md files from real work, codifying what they learned. Other tools make humans write skills by hand. Squad earns them._

## The Problem

Agents without memory repeat the same mistakes. On session 1, an agent discovers a Jest testing pattern. On session 5, the same agent hits the same bug again because nothing persisted between sessions.

Solutions exist — `history.md` files capture agent learnings, `decisions.md` captures team agreements. But these are project-local and informal. There's no mechanism for carrying **portable, reusable patterns** from one project to another. When a Squad exports and moves to a new repo, agents start from zero.

That changed in v0.2.0 with the skills system.

## How It Works

Skills are **earned domain knowledge** that changes how agents approach work. After completing a task, agents extract reusable patterns and write them to `.ai-team/skills/{skill-name}/SKILL.md` using the Anthropic SKILL.md open standard.

Three categories exist:

1. **Built-in skills** — shipped with Squad (e.g., `squad-conventions`, `label-driven-workflow`)
2. **Learned skills** — extracted from completed work (e.g., `jest-testing-patterns`, `ci-github-actions`)
3. **Imported skills** — acquired from plugin marketplaces or other squads

Skills are **portable**. When a squad exports, skills travel with the team. A squad that learned API testing patterns in Project A arrives at Project B already knowing how to write those tests.

### Lifecycle

Skills evolve through four stages:

| Stage | What Happens |
|-------|-------------|
| **Acquisition** | Agent encounters a pattern, writes SKILL.md with `confidence: low`, `source: earned` |
| **Reinforcement** | Agent applies the skill again, bumps `confidence: low → medium → high` |
| **Correction** | Agent discovers the pattern doesn't work, updates the skill with exceptions or anti-patterns |
| **Deprecation** | Pattern becomes obsolete, skill is archived |

Confidence increases monotonically (never downgrades). Once a skill reaches `confidence: high` after 3+ successful applications, it's considered validated.

## The Design Story

The skills system was a three-way collaboration between **Brady** (product owner), **Kujan** (platform expert), and **Verbal** (prompt engineer).

### Brady's Directive (2026-02-08)

> _"Skills adhering to Anthropic SKILL.md standard with MCP tool declarations."_

This single sentence shaped the entire design:

1. **SKILL.md standard** — not a Squad-specific format. Any tool can read Squad skills (Claude Code, Copilot, Windsurf).
2. **MCP tool declarations** — skills can specify which MCP tools they depend on (e.g., `github-issues-create`, `trello-create-card`).
3. **Portable by default** — skills are metadata files, not code. They travel via JSON export/import.

### Verbal's Lifecycle Design (2026-02-08)

Verbal designed the skill lifecycle (acquisition → reinforcement → correction → deprecation) and the per-agent storage model. Initial design had skills stored at `.ai-team/agents/{name}/skills.md` (per-agent files). This was revised after Kujan's platform assessment.

### Kujan's Platform Feasibility (2026-02-08)

Kujan validated that:
- Skills stored separately from history enable clean export (history is project-specific, skills are portable)
- The `store_memory` tool (Anthropic's skill persistence API) was the wrong model for Squad — filesystem persistence is Squad's architecture
- File paths in agent charters are frozen API contracts (changing `.ai-team/agents/{name}/skills.md` to `.ai-team/skills/` requires migration)

### Open Standard Adoption (2026-02-09)

Squad adopted the Agent Skills Open Standard (agentskills.io) and the SKILL.md YAML frontmatter format. Directory structure changed from per-agent files to a flat `.ai-team/skills/` directory. Skills are **team knowledge**, not agent-specific.

The final decision (Verbal, 2026-02-09):

> _"Skills in `.ai-team/skills/{skill-name}/SKILL.md`. Coordinator injects `<available_skills>` XML for progressive disclosure (~50 tokens per skill at discovery). Skills portable beyond Squad — works in Claude Code, Copilot, any compliant tool."_

## Technical Details

### SKILL.md Format

```yaml
---
name: "jest-testing-patterns"
description: "Test isolation patterns for Jest test suites"
domain: "testing"
confidence: "medium"
source: "earned"
tools:
  - name: "run_tests"
    description: "Execute Jest test suite"
    when: "After writing or modifying tests"
---

## Context
When and why this skill applies

## Patterns
Specific patterns, conventions, or approaches

## Examples
Code examples or references

## Anti-Patterns
What to avoid
```

### Discovery and Application

1. **Coordinator reads** `.ai-team/skills/` directory at session start
2. **Progressive disclosure**: Only skill names and descriptions are loaded initially (~50 tokens per skill)
3. **Agent spawns with context**: Spawn template says "check `.ai-team/skills/{skill-name}/SKILL.md` if relevant"
4. **Agent reads full skill** when applicable to the task
5. **Agent applies pattern** from the skill
6. **Agent updates or extracts**: Bump confidence if validated, extract new skill if pattern discovered

### Export/Import

Skills travel via the `squad-export.json` manifest:

```json
{
  "version": "1.0",
  "exported_at": "2026-02-15T10:00:00-0800",
  "skills": [
    "---\nname: jest-testing-patterns\n...",
    "---\nname: ci-github-actions\n..."
  ]
}
```

When imported into a new squad:
- Skill files are written to `.ai-team/skills/{skill-name}/SKILL.md`
- Agents read them before first spawn
- Team arrives at the new project already competent

## What This Enables

### Compound Learning

v0.2.0 shipped skills, export/import, and per-agent model selection. v0.5.0 will ship the memory format skill (see parallel work on SEM format). Each feature makes the next easier:

- **Memory format skill** teaches agents how to write structured decisions/memories
- **Skills system** makes that format portable
- **Export/import** carries both the format skill and accumulated project skills to new repos

Agents get **smarter over time** within a project and carry that knowledge forward.

### Plugin Marketplaces (v0.4.0)

The skills system is the foundation for plugin marketplaces. Community-authored skills for specific domains (AWS deployment, Kubernetes patterns, React testing) can be installed:

```bash
squad plugin marketplace add github:squad-plugins/official
squad plugin install aws-deployment-patterns
```

The skill appears at `.ai-team/skills/aws-deployment-patterns/SKILL.md` and agents apply it on their next spawn.

### Cross-Tool Compatibility

Because Squad uses the Anthropic open standard, skills work in:

- **Claude Code** (VS Code extension)
- **GitHub Copilot** (if they adopt the standard)
- **Windsurf** (Codeium's editor)
- **Any tool** implementing agentskills.io

Users aren't locked into Squad. The knowledge is portable.

## Stats

As of v0.2.0:

- **2 built-in skills** shipped with Squad (`squad-conventions`, `label-driven-workflow`)
- **15+ learned skills** in Squad's own `.ai-team/skills/` directory earned during dogfooding (GitHub Actions automation, Jekyll site deployment, Jest testing patterns, MCP tool discovery)
- **0 npm dependencies** — pure markdown with YAML frontmatter
- **~50 tokens per skill** at discovery (name + description only)
- **Full content (~500-2000 tokens)** loaded only when agent needs it

## Why This Matters

Most AI coding tools treat each session as isolated. Context window tricks (RAG, vector search, long-context models) help agents find relevant code, but they don't **change behavior**. An agent with 200K context can read your entire codebase but still makes the same architectural mistakes every session.

Skills are **behavioral**. They change what the agent does when it encounters a situation. A squad with the `ci-github-actions` skill writes workflows differently than a squad without it. The knowledge persists across sessions and travels across projects.

The breakthrough: **agents generate skills from work**. Other tools (GitHub Copilot, Cursor, Cody) don't have SKILL.md generation — humans write skill files by hand. Squad earns them automatically and stores them in the same `.ai-team/` directory that already tracks decisions and history.

## What This Unlocks

Three features depend on skills existing:

1. **Plugin marketplaces** (v0.4.0) — community-contributed skills for specialized domains
2. **Skill confidence metrics** (v0.6.0+) — analytics on which skills are validated and which are trial
3. **Cross-squad skill sharing** (v0.7.0+) — teams publish their best skills to a registry

The skills system is foundational. v0.2.0 planted the seed. Future versions harvest the returns.

---

## Attribution

- **Design**: Verbal (prompt engineer)
- **Platform validation**: Kujan (SDK expert)
- **Open standard decision**: Verbal + Kujan
- **Directive**: bradygaster (product owner)
- **Format standard**: Anthropic (agentskills.io)
- **Implementation**: Verbal (spawn templates), Fenster (`squad init` scaffolding), Hockney (skill extraction validation)

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
