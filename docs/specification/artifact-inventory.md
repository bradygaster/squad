# Squad Artifact Inventory

**Audit date:** 2026-09-24

**Purpose:** Profile planning and parser-drift evidence for issue #2069.

Paths in this table are Squad-root-relative. Repository-local installations
render them beneath `.squad/`.

| Artifact | Artifact class | Current authority/consumer | Maturity | Proposed profile |
|---|---|---|---|---|
| `agents/{id}/charter.md` | required | `packages/squad-sdk/src/agents/charter-compiler.ts` | Draft profile shipped here | Charter v0.1 |
| `team.md` | required | config Markdown migration, presets, coordinator | Multiple table shapes remain | Roster and routing |
| `routing.md` | required | `packages/squad-sdk/src/config/routing.ts` | Parsed but not formally versioned | Roster and routing |
| `config.json` | optional | config schema/loaders | Structured schema exists | Configuration and casting |
| `casting/registry.json` | runtime-state | casting provenance/state APIs | Versioned implementation schema | Configuration and casting |
| `casting/history.json` | runtime-state | casting atomic update path | Backend-sensitive | Configuration and casting |
| `skills/{name}/SKILL.md` | optional | skill loader and coordinator discovery | Frontmatter conventions exist | Skills |
| `decisions.md` | runtime-state | state bridge, coordinator, Scribe | Authority/backend semantics evolving | Decisions and memory |
| `decisions/inbox/**` | runtime-state | governed state bridge | Drop-box protocol, backend-sensitive | Decisions and memory |
| `agents/{id}/history.md` | runtime-state | history/state APIs | Backend-sensitive | Decisions and memory |
| `identity/**` | runtime-state | coordinator/state bridge | Backend-sensitive | Deferred state profile |
| generated capability blocks | generated | `team-capabilities` generator | Reproducible output | Implementation profile |
| `.github/agents/squad.agent.md` | generated/runtime prompt | Copilot surfaces | Product integration artifact | Implementation profile |

## Charter conformance audit

The active repository charters demonstrate three families:

1. Specialist charters use `Identity ID`, `Identity Purpose`, and the canonical
   responsibility headings selected by Charter Profile v0.1.
2. Built-in support charters use legacy `Name`/`Role` identity fields and
   `What I Own`/`Boundaries` variants.
3. The distributed charter template uses legacy `Name`, `Role`, `Expertise`,
   `Style`, `What I Own`, `Boundaries`, and `Collaboration`.

Before this profile, the parser recognized only the third family for
responsibility sections, while the active specialists used the first. It also
parsed `Reasoning Effort` and `Context Tier`, but the charter serializer omitted
both fields. The reference implementation now recognizes canonical and legacy
aliases, preserves both behavioral fields in serialization, and exposes a
deterministic validator.

## Profile sequencing

1. Charter v0.1: identity, responsibility semantics, behavioral preferences,
   diagnostics, legacy aliases, and fixtures.
2. Roster and routing: joins among agent ID, directory, roster, and ownership.
3. Configuration and casting: schemas, provenance, revisions, and precedence.
4. Skills: discovery, metadata, trust, and compatibility.
5. Decisions, memory, and mutable state after backend authority stabilizes.

Runtime protocols, prompts, CLI UX, telemetry, and hosted publication remain
informative or implementation-specific until a profile explicitly adopts them.
