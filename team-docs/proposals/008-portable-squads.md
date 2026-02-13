# Proposal 008: Portable Squads

**Status:** Approved ✅ Shipped  
**Authored by:** Keaton (Lead)  
**Date:** 2026-02-08  
**Requested by:** bradygaster

---

## Summary

Let users export their Squad — names, personalities, learned preferences — and import it into a new project. The team travels with you. Project-specific knowledge stays behind; the *people* come along.

This is the feature that makes Squad about **your team**, not just your project.

---

## Problem

Today, a Squad is born inside a project and dies with it. You run `npx create-squad`, agents get cast, they learn your style over weeks — and when the project ends, all of that evaporates. Next project, you start from zero. New names, new universe, no memory of how you work.

Brady's words: *"I work on a project with my squad, and I end up loving my squad, but my project ends and I want to take my squad with me."*

This is the right instinct. The casting system already treats agent names as persistent identifiers. The history system already captures learnings about the user. But there's no mechanism to carry either across project boundaries.

The deeper problem: **Squad currently conflates team identity with project context.** Agent histories contain both "Brady prefers explicit error handling" (portable) and "the auth module is in src/auth/" (not portable). Casting state contains both universe metadata (portable) and assignment timestamps tied to the current project (not portable). There's no seam between what's *yours* and what's *here*.

Without portability, Squad is a per-project tool. With it, Squad becomes a personal AI team that follows you across your career.

---

## Solution

### The Conceptual Model

A Squad has two layers of identity:

| Layer | What it contains | Portable? | Example |
|-------|-----------------|-----------|---------|
| **Team Identity** | Names, universe, roles, personalities, user preferences | ✅ Yes | "Keaton is the Lead. Universe is The Usual Suspects. Brady likes explicit error handling." |
| **Project Context** | Codebase knowledge, architecture decisions, file locations, project-specific conventions | ❌ No | "The auth module is in src/auth/. We chose REST over GraphQL." |

Export captures Team Identity. Import restores it. Project Context is left behind — it belongs to the old repo.

### What Gets Exported

An export produces a single JSON file: a **squad manifest**.

```json
{
  "squad_manifest_version": "1.0",
  "exported_at": "2026-02-08T14:30:00.000Z",
  "exported_from": "bradygaster/my-api-project",

  "casting": {
    "universe": "The Usual Suspects",
    "policy": {
      "casting_policy_version": "1.1",
      "allowlist_universes": ["The Usual Suspects", "..."]
    },
    "agents": {
      "keaton": {
        "persistent_name": "Keaton",
        "universe": "The Usual Suspects",
        "role": "Lead",
        "status": "active"
      },
      "verbal": {
        "persistent_name": "Verbal",
        "universe": "The Usual Suspects",
        "role": "Prompt Engineer",
        "status": "active"
      }
    }
  },

  "charters": {
    "keaton": "# Keaton — Lead\n> The one who sees the whole picture...",
    "verbal": "# Verbal — Prompt Engineer\n> ..."
  },

  "portable_knowledge": {
    "keaton": [
      "User prefers explicit error handling over silent failures",
      "User values compound decisions — each feature should make the next easier",
      "User is opinionated about architecture and expects pushback"
    ],
    "verbal": [
      "User values personality in tooling — it's a feature, not a distraction",
      "User prefers agents that think strategically, not just execute"
    ]
  },

  "team_meta": {
    "agent_count": 6,
    "roles": ["Lead", "Prompt Engineer", "DevRel", "Core Dev", "Tester", "SDK Expert"],
    "formation_date": "2026-02-07",
    "sessions_together": 14
  }
}
```

### What Gets Exported — By Source File

| Source | Exported? | What's included | What's excluded |
|--------|-----------|-----------------|-----------------|
| `casting/registry.json` | ✅ Full | Agent names, universe, roles, status | `created_at` (reset on import) |
| `casting/policy.json` | ✅ Full | Universe allowlist, capacity | — |
| `casting/history.json` | ⚠️ Partial | Universe selection only | Project-specific assignment timestamps |
| `agents/{name}/charter.md` | ✅ Full | Identity, style, voice, boundaries | — |
| `agents/{name}/history.md` | ⚠️ Extracted | Portable knowledge (user preferences, style observations) | Project-specific learnings (file paths, architecture, codebase details) |
| `decisions.md` | ❌ No | — | All project-specific |
| `decisions/inbox/*` | ❌ No | — | All project-specific |
| `orchestration-log/*` | ❌ No | — | Session artifacts |
| `team.md` / `roster.md` / `routing.md` | ❌ No | — | Regenerated on import |

### The Hard Problem: Splitting History

Agent histories contain both portable and non-portable knowledge. We need a reliable way to separate them.

**The approach: structured history sections.**

This builds on Proposal 007's progressive history summarization. We formalize the split:

```markdown
# Project Context

- **Owner:** bradygaster
- **Project:** My API Project
- **Stack:** Node.js, Express, PostgreSQL
- **Created:** 2026-02-07

## Portable Knowledge
<!-- Observations about the USER, not the project. These travel. -->

- Brady prefers explicit error handling over silent failures
- Brady values meaningful error messages with context
- Brady likes opinionated tools that push back
- Brady prefers proposals before execution
- Team style: The Usual Suspects universe. Names matter.

## Project Learnings
<!-- Observations about THIS project. These stay. -->

### 2026-02-07: Initial architecture review
Core insight: Squad's architecture is based on distributed context windows...
```

**The extraction rule is simple:** `## Portable Knowledge` travels. `## Project Learnings` stays.

**Who maintains this split?** Each agent, during their history append. The spawn prompt template gets a new instruction:

```markdown
When appending to history.md, categorize your learnings:
- **Portable Knowledge** — observations about the user's preferences, style,
  communication patterns, decision-making approach. Things that are true
  regardless of which project you're on.
- **Project Learnings** — observations about this codebase, its architecture,
  file structure, technology choices. Things that only matter here.
```

For **existing histories** that don't have the split yet, the export command uses a heuristic: lines referencing specific files, directories, modules, or technology choices are classified as project-specific. Lines about user preferences, style, and process are classified as portable. The user can review and edit the manifest before import.

### CLI Interface

#### Export

```bash
npx create-squad export
```

Reads the current project's `.ai-team/` directory and produces `squad-export.json` in the current directory.

Options:
```
npx create-squad export                        # → ./squad-export.json
npx create-squad export --out ~/my-squad.json  # → custom path
npx create-squad export --review               # → opens manifest for review before saving
```

The `--review` flag prints the extracted portable knowledge and asks the user to confirm or edit before finalizing. This is important for v1 — the heuristic extraction won't be perfect, and users should see what's being captured.

#### Import (New Project)

```bash
npx create-squad --from ./squad-export.json
```

This replaces the normal init flow. Instead of casting from scratch:

1. Creates `.github/agents/squad.agent.md` (same as today)
2. Creates `.ai-team/` directory structure (same as today)
3. Restores `casting/registry.json` from manifest (names preserved)
4. Restores `casting/policy.json` from manifest
5. Creates `casting/history.json` with a new assignment entry referencing the import
6. Writes each agent's `charter.md` from manifest
7. Seeds each agent's `history.md` with portable knowledge only
8. Copies templates (same as today)

The result: agents arrive with their names, personalities, and knowledge of the *user* — but with no knowledge of the new project. First session feels like onboarding a trusted team to a new codebase, not meeting strangers.

#### Example Flow

```
$ npx create-squad --from ~/squad-export.json

✓ .github/agents/squad.agent.md
✓ .ai-team-templates/

Importing squad from The Usual Suspects universe...
  ✓ Keaton (Lead)
  ✓ Verbal (Prompt Engineer)
  ✓ McManus (DevRel)
  ✓ Fenster (Core Dev)
  ✓ Hockney (Tester)
  ✓ Kujan (SDK Expert)

6 agents imported with portable knowledge.
Project-specific context was not imported — your team will learn this codebase fresh.

Squad is ready.

Next steps:
  1. Open Copilot:  copilot
  2. Select Squad from the /agents list
  3. Your team already knows how you work — tell them about this project
```

### Conflict Resolution

**What if the target project already has a Squad?**

```bash
npx create-squad --from ./squad-export.json
# Error: .ai-team/ already exists.
# Use --force to replace the existing squad, or --merge to combine.
```

**`--force`:** Replaces the existing squad entirely. Old squad's history is archived to `.ai-team/archive/`.

**`--merge`:** Attempts to merge. Rules:
- If universes match: merge agent lists (imported agents take precedence for duplicates)
- If universes differ: error. You can't have Keaton and Neo on the same team. Pick one.
- Portable knowledge from both squads is concatenated per agent
- Project learnings from the existing squad are preserved

For v1, `--merge` is out of scope. Ship `--force` only. Merge is a v2 problem.

---

## Data Structures

### Squad Manifest Schema (v1)

```typescript
interface SquadManifest {
  squad_manifest_version: "1.0";
  exported_at: string;           // ISO 8601
  exported_from: string;         // "owner/repo" or project name

  casting: {
    universe: string;
    policy: CastingPolicy;       // Full policy.json
    agents: Record<string, {
      persistent_name: string;
      universe: string;
      role: string;
      status: "active" | "inactive";
    }>;
  };

  charters: Record<string, string>;  // agent key → charter markdown

  portable_knowledge: Record<string, string[]>;  // agent key → list of observations

  team_meta: {
    agent_count: number;
    roles: string[];
    formation_date: string;
    sessions_together: number;   // estimated from history entries
  };
}
```

### Modified history.md Template

```markdown
# Project Context

- **Owner:** {user name} ({user email})
- **Project:** {project description}
- **Stack:** {languages, frameworks, tools}
- **Created:** {date}

## Portable Knowledge

<!-- Observations about the USER that travel across projects. -->

## Project Learnings

<!-- Observations about THIS project's codebase, architecture, and decisions. -->
```

---

## Implementation Plan

### Phase 1: History Split (prerequisite)

1. Update `templates/history.md` to include `## Portable Knowledge` and `## Project Learnings` sections
2. Update spawn prompt template in `squad.agent.md` to instruct agents on categorizing learnings
3. Existing projects: agents naturally adopt the split on their next history write. No migration needed — the export heuristic handles unsplit histories.

**Effort:** ~1 hour. Changes to templates and `squad.agent.md` only.

### Phase 2: Export Command

1. Add `export` subcommand to `index.js`
2. Read `.ai-team/` directory, extract portable data per the rules above
3. For unsplit histories, apply heuristic extraction (regex-based: references to file paths, imports, and module names → project-specific; everything else → portable)
4. Write `squad-export.json`
5. Support `--out` and `--review` flags

**Effort:** ~3 hours. New code in `index.js`, no breaking changes.

### Phase 3: Import Flow

1. Add `--from` flag to `index.js`
2. When `--from` is provided, skip casting and use manifest data instead
3. Restore casting state, charters, and seeded histories
4. Print import summary

**Effort:** ~3 hours. Modifies init flow in `index.js`, adds new code path.

### Phase 4: Conflict Handling

1. Detect existing `.ai-team/` when `--from` is used
2. Implement `--force` with archival
3. Stub `--merge` as "not yet implemented"

**Effort:** ~1 hour.

### Total: ~8 hours across all phases.

---

## Trade-offs

**What we gain:**
- Squads become persistent across projects — users invest in their team, not just their codebase
- Casting (names, personality) becomes a long-term relationship, not per-project ephemera
- Opens the door to squad sharing (v2) and squad registries (v3)
- Differentiates Squad from every other multi-agent tool: your team is YOURS

**What we give up:**
- History format changes (mild migration friction for existing users, though backward-compatible)
- Export heuristic for unsplit histories won't be perfect — users need to review
- `index.js` complexity increases (export + import paths in addition to init)
- Manifest schema is a new versioned contract we'll need to maintain

**What gets harder:**
- History template changes need to coordinate with Proposal 007 (progressive summarization). Both modify history structure. They're complementary, not conflicting — summarization applies to both Portable Knowledge and Project Learnings sections.
- Testing. Export/import is a round-trip that needs integration tests (aligns with Hockney's testing infrastructure push).

---

## Alternatives Considered

### Alternative 1: Just copy `.ai-team/`

**What:** Tell users to `cp -r .ai-team/ ../new-project/.ai-team/` and done.

**Why not:** Brings project-specific decisions, file-path-laden histories, and stale orchestration logs. The new project starts with wrong context that agents will trust as truth. Worse than starting fresh — it's starting with confidently wrong knowledge.

### Alternative 2: Git submodule for squad identity

**What:** Store squad identity in a separate repo, reference it as a submodule.

**Why not:** Submodules are universally hated. Adds git complexity for a problem that's fundamentally about data extraction, not version control. Also, it means squad identity lives outside the project — violating Squad's "everything is filesystem, everything is in your repo" principle.

### Alternative 3: npm package per squad

**What:** `npx create-squad --squad @bradygaster/my-usual-suspects-squad`

**Why not:** Requires publishing to npm, which is heavyweight for personal squads. Also leaks agent histories into a public (or private) registry, which has privacy implications. Good idea for *shared* squads (v2), wrong abstraction for *personal* portability (v1).

### Alternative 4: Cloud-hosted squad profiles

**What:** Squad identity lives in a cloud service. `npx create-squad --profile bradygaster` pulls your team from the cloud.

**Why not:** Violates "stay independent, optimize around Copilot" decision. Introduces a service dependency. Goes against Squad's filesystem-first philosophy. Maybe v4, but definitely not v1.

### Alternative 5: Export as tarball of `.ai-team/`

**What:** `tar -czf squad.tar.gz .ai-team/` with some filtering.

**Why not:** Tarballs are opaque. Users can't review what's being exported without extracting. JSON manifest is human-readable, inspectable, and editable. It's also easier to version the schema.

---

## The Bigger Picture

### V1: Personal Portability (this proposal)

You export your squad, you import your squad. It's yours. It travels with you.

### V2: Squad Sharing

```bash
npx create-squad --from https://gist.github.com/bradygaster/squad-manifest.json
```

Users publish their manifests (minus portable knowledge — that's personal). Someone shares "Here's my React + TailwindCSS frontend squad" with curated charters and role definitions. The casting and personality come along. Your own preferences layer on top over time.

This turns Squad from a tool into a **community**. People share team configurations the way they share dotfiles.

### V3: Squad Registry

A curated directory of squad configurations. Browse by stack, by team size, by universe. "Show me 4-person squads for Go backend projects in the Firefly universe."

This is the long game. But it only works if v1 gets the data model right — which is why the manifest schema matters now.

### What This Changes About Squad's Positioning

Today: "Add an AI agent team to any project."
Tomorrow: "**Your** AI agent team. Any project."

The emphasis shifts from the project to the relationship. Squad stops being infrastructure you install and becomes a team you build. That's a fundamentally different product — and a fundamentally stickier one.

---

## Success Criteria

1. **Round-trip fidelity:** Export from Project A → Import into Project B → agents have same names, universe, roles, personalities, and user-preference knowledge. Zero loss on Team Identity layer.
2. **Clean separation:** Imported agents have NO knowledge of Project A's codebase. No file paths, no architecture decisions, no stale context. First session on Project B feels like onboarding, not confusion.
3. **User confidence:** The `--review` flag lets users see exactly what's being exported. No surprises in the manifest.
4. **Backward compatibility:** Projects that never export/import work exactly as before. No changes to the default `npx create-squad` flow.
5. **History split adoption:** Within 2 sessions after template update, agents naturally categorize learnings into Portable Knowledge vs Project Learnings without explicit prompting.
6. **CLI discoverability:** `npx create-squad --help` shows export and `--from` options. Users find them without reading docs.

---

## Open Questions

1. **Should portable knowledge be per-agent or shared?** Currently per-agent (each agent learns different things about the user). But some knowledge is universal — "Brady prefers proposals before execution" applies to everyone. Should there be a `team_portable_knowledge` section in the manifest?

2. **How many sessions before export is meaningful?** Exporting after one session gives you names and charters but almost no portable knowledge. Should we warn? `"⚠️ Your squad has only had 2 sessions. Export will contain limited portable knowledge. Continue?"`

3. **What about the Scribe?** Scribe is a special agent — it's defined in `squad.agent.md`, not as a standalone charter. Does it travel? Probably yes (its role is universal), but it doesn't appear in the manifest the same way.

4. **Versioning the manifest:** If we change the schema in v1.1, old manifests need to still import. JSON schema versioning is straightforward (`squad_manifest_version` field), but we need a migration path from day one.

5. **Privacy:** Portable knowledge contains observations about the user. If squad sharing becomes real (v2), users need to be able to strip portable knowledge from shared manifests. The `--review` flag helps, but we might need explicit `--strip-knowledge` for sharing.

---

**Review requested from:** Verbal (knowledge extraction strategy), Fenster (CLI implementation), Hockney (testing the round-trip), bradygaster (final sign-off — this is his vision)  
**Approved by:** bradygaster  
**Implemented:** Wave 2 — Export CLI shipped  
**Retrospective:** [Pending]
