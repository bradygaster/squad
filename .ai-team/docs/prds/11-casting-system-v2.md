# PRD 11: Casting System v2

**Owner:** Verbal (Prompt Engineer & AI Strategist)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 2
**Dependencies:** PRD 4 (Agent Session Lifecycle), PRD 2 (Charter Compilation)

## Problem Statement

Squad's casting system — the feature that gives AI agents persistent character names from thematic universes — is the project's signature identity. Currently, casting lives as JSON files (`registry.json`, `universes/*.json`) interpreted by coordinator prompt logic. Name selection, overflow handling (diegetic expansion, thematic promotion, structural mirroring), and collision avoidance are all prompt-engineered behaviors with no tests, no types, and no compile-time guarantees. Brady's directive is unambiguous: **casting must harden and evolve**. Harden means: typed, tested, deterministic. Evolve means: capabilities that weren't possible before — things like cross-repo casting awareness, user-defined universes, and casting themes as a first-class concept. The SDK replatform is the moment to rebuild casting as code, not prompts.

## Goals

1. Rebuild the casting system as a typed TypeScript module with compile-time validation
2. Make universe selection deterministic, tested, and reproducible
3. Codify overflow handling (diegetic expansion, thematic promotion, structural mirroring) as typed functions, not prompt instructions
4. Guarantee name persistence — names never collide, never change, never get lost
5. Integrate cast identity into SDK session config so agents carry their persona
6. Define a clear migration path from JSON-based casting to typed casting
7. Enable new capabilities: user-defined universes, cross-repo casting awareness, casting themes
8. Achieve 100% test coverage on the casting module — no prompt-only logic for identity

## Non-Goals

- Changing existing agent names (migration preserves all current names)
- Building a universe editor UI (CLI is sufficient for v2)
- Automatic re-casting based on project type (manual universe selection stays)
- Integrating with external name databases
- Casting for non-Squad agents (casting is a Squad-specific feature)

## Background

The SDK analysis (`.ai-team/docs/sdk-agent-design-impact.md`) confirmed that `CustomAgentConfig` supports `name`, `displayName`, and `description` fields — cast identity maps directly. The analysis also noted that Squad keeps the casting system unchanged during replatform. This PRD defines *how* casting evolves alongside the SDK migration.

Current casting architecture:
- **Universe files:** `.squad/casting/universes/{name}.json` — character pools with roles, descriptions, traits
- **Registry:** `.squad/casting/registry.json` — maps `role → character name` for the active universe
- **Coordinator logic:** ~200 lines of prompt instructions in `squad.agent.md` handling selection, overflow, collision avoidance
- **Overflow strategies:** Diegetic expansion (generate new characters that fit the universe), thematic promotion (elevate minor characters), structural mirroring (adapt character archetypes)

What "harden" means: Every casting decision is made by typed code, verified by tests, and deterministic given the same inputs. No prompt interprets casting rules.

What "evolve" means: The typed module enables capabilities the prompt-based system couldn't reliably support — cross-repo awareness, user-defined universes, thematic variants, and casting ceremonies.

## Proposed Solution

### TypeScript Casting Module

```typescript
// .squad/src/casting/types.ts

interface CastUniverse {
  id: string;                    // 'the-usual-suspects', 'alien', etc.
  name: string;                  // display name
  description: string;
  theme: CastTheme;
  characters: CastCharacter[];
  overflow: OverflowConfig;
}

interface CastCharacter {
  name: string;                  // 'Keaton', 'Ripley', etc.
  role: CharacterRole;           // 'leader', 'builder', 'reviewer', etc.
  traits: string[];              // personality markers for prompt injection
  description: string;           // one-line character summary
  available: boolean;            // false if already assigned
}

type CharacterRole =
  | 'leader'        // maps to: Lead / Architect
  | 'builder'       // maps to: Core Developer / Backend
  | 'specialist'    // maps to: Tester / Security / DevRel
  | 'observer'      // maps to: Reviewer / Monitor
  | 'scribe'        // maps to: Scribe / Documentation
  | 'coordinator';  // maps to: Coordinator / Orchestrator

interface CastRegistry {
  universe: string;              // active universe ID
  assignments: CastAssignment[];
  created: string;               // ISO 8601
  version: number;               // increments on every assignment change
}

interface CastAssignment {
  agentRole: string;             // Squad role (e.g., 'lead-architect')
  characterName: string;         // cast name (e.g., 'Keaton')
  assignedAt: string;            // ISO 8601
  source: 'initial' | 'overflow' | 'user-defined';
}

interface CastTheme {
  genre: string;                 // 'crime-thriller', 'sci-fi', 'western', etc.
  era: string;                   // '1990s', '2100s', etc.
  tone: string;                  // 'gritty', 'hopeful', 'cerebral'
  nameStyle: NameStyleConfig;    // how names feel in this universe
}

interface NameStyleConfig {
  pattern: 'surname' | 'firstname' | 'callsign' | 'title-surname';
  examples: string[];            // ['Keaton', 'Fenster', 'McManus']
}
```

### Deterministic Universe Selection

The selection algorithm becomes a pure function with testable inputs and outputs:

```typescript
// .squad/src/casting/selection.ts

interface SelectionInput {
  teamSize: number;              // number of agents to cast
  roles: CharacterRole[];        // required roles
  preferences?: {
    universe?: string;           // user-preferred universe
    theme?: string;              // preferred genre/theme
  };
  existing?: CastRegistry;       // current assignments (for migration/stability)
}

interface SelectionResult {
  universe: CastUniverse;
  assignments: CastAssignment[];
  overflow: OverflowAction[];    // any overflow needed
  warnings: string[];            // e.g., 'universe has only 7 characters for 9 roles'
}

function selectUniverse(
  input: SelectionInput,
  universes: CastUniverse[]
): SelectionResult {
  // 1. If user specified a universe, use it
  if (input.preferences?.universe) {
    const universe = universes.find(u => u.id === input.preferences!.universe);
    if (universe) return assignCharacters(universe, input);
  }

  // 2. Score universes by fit
  const scored = universes
    .map(u => ({ universe: u, score: scoreUniverse(u, input) }))
    .sort((a, b) => b.score - a.score);

  // 3. Deterministic tiebreak: alphabetical by ID
  const best = scored[0];
  return assignCharacters(best.universe, input);
}

function scoreUniverse(universe: CastUniverse, input: SelectionInput): number {
  let score = 0;

  // Character count coverage (0-40 points)
  const coverage = Math.min(universe.characters.length / input.teamSize, 1);
  score += coverage * 40;

  // Role match quality (0-40 points)
  const roleMatches = input.roles.filter(role =>
    universe.characters.some(c => c.role === role && c.available)
  ).length;
  score += (roleMatches / input.roles.length) * 40;

  // Theme preference match (0-20 points)
  if (input.preferences?.theme &&
      universe.theme.genre.includes(input.preferences.theme)) {
    score += 20;
  }

  return score;
}
```

### Codified Overflow Handling

Overflow strategies move from prompt instructions to typed functions:

```typescript
// .squad/src/casting/overflow.ts

type OverflowStrategy = 'diegetic-expansion' | 'thematic-promotion' | 'structural-mirroring';

interface OverflowAction {
  strategy: OverflowStrategy;
  generatedCharacter: CastCharacter;
  reason: string;
}

interface OverflowConfig {
  strategies: OverflowStrategy[];  // priority order
  maxExpansion: number;            // max characters to generate
  nameConstraints: NameConstraints;
}

interface NameConstraints {
  minLength: number;
  maxLength: number;
  bannedNames: string[];           // names that must never be generated
  existingNames: string[];         // currently assigned (collision avoidance)
  style: NameStyleConfig;          // must match universe style
}

function handleOverflow(
  universe: CastUniverse,
  unfilledRoles: CharacterRole[],
  config: OverflowConfig
): OverflowAction[] {
  const actions: OverflowAction[] = [];

  for (const role of unfilledRoles) {
    for (const strategy of config.strategies) {
      const action = executeStrategy(strategy, universe, role, config.nameConstraints);
      if (action) {
        actions.push(action);
        config.nameConstraints.existingNames.push(action.generatedCharacter.name);
        break;
      }
    }
  }

  return actions;
}

function executeStrategy(
  strategy: OverflowStrategy,
  universe: CastUniverse,
  role: CharacterRole,
  constraints: NameConstraints
): OverflowAction | null {
  switch (strategy) {
    case 'diegetic-expansion':
      // Generate a new character that fits the universe's world
      return diegeticExpand(universe, role, constraints);
    case 'thematic-promotion':
      // Elevate a minor/background character to fill the role
      return thematicPromote(universe, role, constraints);
    case 'structural-mirroring':
      // Create a character that mirrors an archetype from the universe
      return structuralMirror(universe, role, constraints);
  }
}
```

### Name Persistence Guarantees

Names are immutable once assigned. The registry is append-only:

```typescript
// .squad/src/casting/registry.ts

class CastRegistryManager {
  private registry: CastRegistry;

  assign(agentRole: string, characterName: string, source: CastAssignment['source']): void {
    // Collision check — O(1) via Set
    if (this.assignedNames.has(characterName)) {
      throw new CastingCollisionError(
        `Character "${characterName}" is already assigned to "${this.getAssignee(characterName)}"`
      );
    }

    // Immutability check — once assigned, a role keeps its name
    const existing = this.registry.assignments.find(a => a.agentRole === agentRole);
    if (existing) {
      throw new CastingImmutabilityError(
        `Role "${agentRole}" is already cast as "${existing.characterName}". Names are permanent.`
      );
    }

    this.registry.assignments.push({
      agentRole,
      characterName,
      assignedAt: new Date().toISOString(),
      source,
    });
    this.registry.version++;
    this.persist();
  }

  private get assignedNames(): Set<string> {
    return new Set(this.registry.assignments.map(a => a.characterName));
  }
}
```

### Cast Identity in SDK Sessions

Agents carry their cast identity in the session config:

```typescript
function buildSessionWithCasting(
  agent: CompiledAgent,
  registry: CastRegistry
): SessionConfig {
  const assignment = registry.assignments.find(a => a.agentRole === agent.config.name);

  return {
    sessionId: `squad-${assignment?.characterName.toLowerCase() ?? agent.config.name}`,
    customAgents: [{
      ...agent.config,
      displayName: assignment?.characterName ?? agent.config.displayName,
      description: buildCastDescription(agent, assignment),
    }],
    systemMessage: {
      mode: 'append',
      content: buildCastContext(agent, assignment, registry),
    },
    // ... rest of session config
  };
}

function buildCastContext(
  agent: CompiledAgent,
  assignment: CastAssignment | undefined,
  registry: CastRegistry
): string {
  if (!assignment) return '';

  const universe = loadUniverse(registry.universe);
  const character = universe.characters.find(c => c.name === assignment.characterName);

  return `
## Your Identity
You are **${assignment.characterName}** — ${character?.description ?? agent.config.description}.
${character?.traits.length ? `Personality: ${character.traits.join(', ')}.` : ''}
Universe: ${universe.name} (${universe.theme.genre}).

Your teammates: ${registry.assignments
    .filter(a => a.characterName !== assignment.characterName)
    .map(a => a.characterName)
    .join(', ')}.
  `.trim();
}
```

### Migration Path: JSON → TypeScript

**Phase 1 (v0.6.0): Parallel operation**
- New TypeScript casting module reads existing JSON files
- `registry.json` and `universes/*.json` remain the source of truth
- TypeScript module validates JSON on load, reports type errors
- All casting tests written against TypeScript interfaces

**Phase 2 (v0.7.0): TypeScript as source of truth**
- Universe definitions compiled from TypeScript objects
- JSON files generated from TypeScript (reverse of Phase 1)
- Registry managed by `CastRegistryManager` class
- Coordinator prompt casting logic replaced by module calls

**Phase 3 (v0.8.0): JSON removed**
- JSON files no longer read or written
- Full TypeScript casting pipeline
- Coordinator prompt shrinks by ~200 lines

### New Capabilities (Evolve)

**User-Defined Universes:**
```bash
squad cast universe create --name "star-wars" --genre "sci-fi" --era "far-far-away"
# Interactive: define characters, roles, traits
# Generates: .squad/casting/universes/star-wars.ts
```

**Cross-Repo Casting Awareness:**
```typescript
// When importing a squad, check for name collisions with local team
async function importWithCastingAwareness(
  importedRegistry: CastRegistry,
  localRegistry: CastRegistry
): Promise<MergeResult> {
  const collisions = findNameCollisions(importedRegistry, localRegistry);
  if (collisions.length > 0) {
    // Imported agents get re-cast with overflow strategies
    return recastImported(importedRegistry, localRegistry, collisions);
  }
  return { merged: true, collisions: [] };
}
```

**Casting Themes:**
```typescript
// Theme-based customization of agent behavior
interface CastThemeOverrides {
  responseStyle?: 'terse' | 'verbose' | 'dramatic';  // universe tone affects output
  namingConvention?: 'formal' | 'casual' | 'military';
  teamDynamic?: 'cooperative' | 'competitive' | 'hierarchical';
}
```

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| TypeScript module replaces prompt logic | ✅ Decided | Brady directive: "harden" = typed, tested, deterministic |
| Names are immutable once assigned | ✅ Decided | Name persistence is a product guarantee |
| Cast identity injected via `systemMessage` append | ✅ Decided | Consistent with PRD 4 context injection pattern |
| Three-phase migration (parallel → primary → sole) | ✅ Decided | Low risk: JSON backup available throughout Phase 1-2 |
| Universe scoring is deterministic (alphabetical tiebreak) | ✅ Decided | Reproducible results across runs |
| Overflow strategies are priority-ordered | ✅ Decided | `diegetic-expansion` first, then `thematic-promotion`, then `structural-mirroring` |
| User-defined universes use CLI creation flow | 🔲 Needs discussion | Alternative: YAML/JSON file that user writes manually |
| Cast traits affect agent prompt style | 🔲 Needs discussion | How much should character personality leak into work output? |

## Implementation Notes

### Test Coverage Requirements

The casting module must have **100% branch coverage**. Critical test cases:

```typescript
// test/casting.test.ts

// Selection
test('selects user-preferred universe when specified');
test('scores universes by character count coverage');
test('breaks ties alphabetically by universe ID');
test('preserves existing assignments when re-running selection');

// Overflow
test('diegetic expansion generates universe-consistent names');
test('thematic promotion elevates minor characters correctly');
test('structural mirroring creates role-appropriate archetypes');
test('overflow respects name constraints (length, banned, collision)');

// Registry
test('assign() rejects duplicate character names');
test('assign() rejects reassignment of existing roles');
test('registry version increments on every change');
test('registry serialization is deterministic');

// Integration
test('full casting pipeline: empty team → fully cast');
test('migration: JSON registry → TypeScript registry lossless');
test('cast identity appears in session systemMessage');
test('cross-repo import detects and resolves collisions');
```

### Casting Module File Structure

```
.squad/src/casting/
├── types.ts           # all interfaces and type definitions
├── selection.ts       # universe selection algorithm
├── overflow.ts        # overflow strategy implementations
├── registry.ts        # CastRegistryManager class
├── migration.ts       # JSON → TypeScript migration utilities
├── themes.ts          # theme definitions and overrides
└── index.ts           # public API
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Overflow-generated names feel generic | Agents lose personality | Overflow tests include "vibes check" — generated names must match universe style. Manual review of overflow output in CI. |
| Migration breaks existing registries | Teams lose their cast names | Phase 1 is read-only from JSON. No destructive operations until Phase 3. Migration test: round-trip JSON → TS → JSON produces identical output. |
| User-defined universes have bad characters | Offensive or inappropriate names | Input validation on character names. Banned-word list. Universe review command. |
| Cast personality affects work quality | Agent outputs become gimmicky | Personality traits are descriptive context, not behavioral directives. Prompt: "Your personality informs your communication style, not your technical judgment." |
| 100% test coverage is expensive to maintain | Slows development | Tests are the point. Casting is identity. Identity bugs are trust-breaking. The test investment is non-negotiable. |

## Success Metrics

1. **Zero prompt-only casting logic:** All casting decisions made by TypeScript code, not coordinator prompt interpretation
2. **100% test coverage:** Every branch in the casting module is tested
3. **Deterministic selection:** Same inputs produce same outputs across runs (verified by snapshot tests)
4. **Name collision rate: 0%** — no two agents ever share a name within a team
5. **Migration fidelity: 100%** — every existing JSON registry converts losslessly to TypeScript
6. **New capability shipped:** At least one "evolve" feature (user-defined universes OR cross-repo awareness) in v0.8.0

## Open Questions

1. **Character trait depth:** How detailed should character definitions be? Current: name + role. Proposed: name + role + traits + description. Is that enough, or do we need backstory/motivation for richer agent personality?
2. **Universe versioning:** If a universe file is updated (new characters added), do existing assignments stay stable? (Yes — registry is append-only. But should new characters be available for future overflow?)
3. **Casting ceremonies:** The current system has a "casting ceremony" concept for the initial team setup. How does this translate to the typed module? Is it a CLI command? A hook on first `squad init`?
4. **Multi-universe teams:** Can a team use characters from multiple universes? (Current: no. Proposed: still no, but cross-repo import may force it.)
5. **Casting in CI/CD:** Agents running in GitHub Actions need cast names. Does the registry file travel with the repo? (Yes — `.squad/casting/registry.json` is committed.)
