# PRD 7: Skills Migration

**Owner:** Verbal (Prompt Engineer & AI Strategist)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 2
**Dependencies:** PRD 4 (Agent Session Lifecycle), PRD 2 (Charter Compilation)

## Problem Statement

Squad's skills system currently works through markdown files (`.squad/skills/{name}/SKILL.md`) that agents read via file I/O when prompted. Skills are template files copied on `squad init`, read by agents at runtime, and written back when agents learn something new. This works, but it's invisible to the SDK — skills are just files the agent happens to read, not first-class configuration. The SDK provides native `skillDirectories` config that loads skill content at session creation, making skills part of the agent's foundation rather than something it discovers mid-conversation. We need to migrate without breaking the confidence lifecycle (low → medium → high) that makes earned skills valuable.

## Goals

1. Migrate skill loading from runtime file reads to SDK `skillDirectories` session config
2. Define a skill manifest schema that captures metadata the SDK doesn't natively handle (confidence, authorship, version)
3. Preserve the confidence lifecycle (low → medium → high) with SDK-compatible mechanics
4. Enable per-agent skill configuration — agents load only skills relevant to their role
5. Support both compile-time embedding (session creation) and runtime loading (mid-session skill acquisition)
6. Design the skill directory structure for SDK compatibility
7. Lay groundwork for plugin marketplace integration — skills from external repos

## Non-Goals

- Building the marketplace itself (future PRD)
- MCP server packaging of skills (explored in analysis, deferred to post-MVP)
- Skill deduplication across teams (cross-repo concern)
- Rewriting existing skill content (migration is structural, not content)

## Background

Skills were shipped in two phases (see history.md):
- **Phase 1 (v0.3.0):** Template + Read — agents read `SKILL.md` files before working
- **Phase 2 (v0.3.0):** Earned Skills — agents write `SKILL.md` files from real work, with confidence levels

The SDK analysis identified `skillDirectories` as a session config option that loads skill content at creation time. From the SDK source (`types.ts`):

```typescript
interface SessionConfig {
  skillDirectories?: string[];  // directories to load skills from
  disabledSkills?: string[];    // skill names to exclude
}
```

This is a direct path: point `skillDirectories` at `.squad/skills/` and the SDK loads them. But Squad's skills have metadata (confidence, authorship, version) that the SDK doesn't model. We need a manifest layer on top.

The MCP integration analysis (Issue #11) also identified a future path: skills as MCP servers with tool definitions. This PRD focuses on the SDK-native path; MCP packaging is a Phase 3 concern.

## Proposed Solution

### Skill Directory Structure (SDK-Compatible)

```
.squad/skills/
├── git-workflow/
│   ├── SKILL.md              # skill content (SDK reads this)
│   ├── manifest.json         # Squad metadata (confidence, version, agents)
│   └── examples/             # optional: worked examples
│       └── rebase-flow.md
├── mcp-tool-discovery/
│   ├── SKILL.md
│   └── manifest.json
└── code-review-patterns/
    ├── SKILL.md
    └── manifest.json
```

The SDK loads `SKILL.md` files from `skillDirectories`. Squad's `manifest.json` adds metadata the SDK doesn't handle.

### Skill Manifest Schema

```typescript
interface SkillManifest {
  name: string;                    // unique skill identifier (kebab-case)
  version: string;                 // semver
  description: string;             // one-line summary
  confidence: 'low' | 'medium' | 'high';
  author: {
    type: 'system' | 'earned' | 'imported';
    agent?: string;                // agent that earned it (if earned)
    source?: string;               // external repo (if imported)
  };
  agents: string[] | '*';         // which agents should load this skill (* = all)
  tags: string[];                  // for discovery and filtering
  created: string;                 // ISO 8601
  updated: string;                 // ISO 8601
  requires?: string[];             // dependency skills
}
```

**Example manifest:**

```json
{
  "name": "git-workflow",
  "version": "1.2.0",
  "description": "Git branching, commit message, and PR conventions for this project",
  "confidence": "high",
  "author": { "type": "earned", "agent": "keaton" },
  "agents": ["keaton", "ripley", "dallas", "fenster"],
  "tags": ["git", "workflow", "conventions"],
  "created": "2026-02-08T00:00:00Z",
  "updated": "2026-02-15T12:00:00Z"
}
```

### Loading Strategy: Compile-Time + Runtime Hybrid

**At session creation (compile-time):**

```typescript
function buildSkillDirectories(agentName: string): string[] {
  const skillsRoot = resolve(TEAM_ROOT, 'skills');
  const allSkills = readdirSync(skillsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory());

  return allSkills
    .filter(dir => {
      const manifest = loadManifest(resolve(skillsRoot, dir.name, 'manifest.json'));
      return manifest.agents === '*' || manifest.agents.includes(agentName);
    })
    .filter(dir => {
      const manifest = loadManifest(resolve(skillsRoot, dir.name, 'manifest.json'));
      return manifest.confidence !== 'low';  // low-confidence skills are opt-in
    })
    .map(dir => resolve(skillsRoot, dir.name));
}

// In session config
const session = await client.createSession({
  // ...agent config...
  skillDirectories: buildSkillDirectories(agent.config.name),
  disabledSkills: getDisabledSkills(agent),
});
```

**At runtime (earned skills):**

When an agent earns a new skill mid-session, it writes `SKILL.md` + `manifest.json` to `.squad/skills/{name}/`. The skill becomes available to **future sessions** automatically. The current session doesn't hot-reload — this is acceptable because earned skills are validated in later work, not immediate re-use.

```typescript
// onPostToolUse hook detects skill creation
hooks: {
  onPostToolUse: async (input, invocation) => {
    if (input.toolName === 'create' && input.toolArgs.path?.includes('.squad/skills/')) {
      const skillDir = dirname(input.toolArgs.path);
      await ensureManifest(skillDir, invocation.sessionId);
      return {
        additionalContext: '📚 New skill registered. Available to future sessions.',
      };
    }
    return undefined;
  },
}
```

### Confidence Lifecycle in SDK World

The confidence lifecycle governs how skills graduate from tentative to authoritative:

| Level | Meaning | SDK Behavior |
|-------|---------|-------------|
| **low** | Just learned, unvalidated | NOT loaded via `skillDirectories`. Available only if agent explicitly reads the file. Agents are told the skill exists but isn't proven. |
| **medium** | Used successfully 2+ times | Loaded via `skillDirectories` for assigned agents. SDK includes content in session context. |
| **high** | Battle-tested, team-endorsed | Loaded for ALL agents (regardless of `agents` field). Foundational knowledge. |

**Promotion logic:**

```typescript
async function evaluateSkillConfidence(skillName: string): Promise<void> {
  const manifest = loadManifest(skillPath(skillName));
  const usageCount = await countSkillUsages(skillName);  // from agent history references

  if (manifest.confidence === 'low' && usageCount >= 2) {
    manifest.confidence = 'medium';
    manifest.updated = new Date().toISOString();
    writeManifest(skillPath(skillName), manifest);
  }

  if (manifest.confidence === 'medium' && usageCount >= 5) {
    manifest.confidence = 'high';
    manifest.updated = new Date().toISOString();
    writeManifest(skillPath(skillName), manifest);
  }
}
```

Promotion is evaluated at team load — before sessions are created. This ensures the skill directory list is stable for the session's lifetime.

### Per-Agent Skill Configuration

Agents load skills based on manifest `agents` field + confidence threshold:

```
Agent: Ripley (Backend Developer)
├── Loaded at session creation:
│   ├── git-workflow (high confidence, agents: *)
│   ├── api-design-patterns (medium confidence, agents: ["ripley", "dallas"])
│   └── database-query (medium confidence, agents: ["ripley"])
├── Available but not loaded:
│   └── frontend-testing (medium confidence, agents: ["dallas", "hockney"])
└── Discoverable but unloaded:
    └── new-caching-pattern (low confidence, agents: ["ripley"])
```

The `disabledSkills` config allows explicit opt-out:

```typescript
// Agent charter can specify skill exclusions
disabledSkills: ['frontend-testing', 'css-patterns'],
```

### Plugin Marketplace Integration (Future-Ready)

Skills from external repos follow the same structure. Import adds files to `.squad/skills/` with `author.type: 'imported'`:

```typescript
interface ImportedSkillManifest extends SkillManifest {
  author: {
    type: 'imported';
    source: 'github:org/repo/skills/skill-name';
  };
  // Imported skills always start at 'low' confidence
  confidence: 'low';
}
```

**Import flow:**
1. User: `squad skill import github:someorg/repo/skills/advanced-testing`
2. Squad copies `SKILL.md` + `manifest.json` to `.squad/skills/advanced-testing/`
3. Manifest rewritten: `author.type = 'imported'`, `confidence = 'low'`
4. Skill is available but not auto-loaded until confidence reaches `medium`
5. Security: imported skill content is untrusted (per security policy — user confirmation required)

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| SDK `skillDirectories` as primary loading mechanism | ✅ Decided | Native SDK support; no custom loading code needed |
| `manifest.json` for Squad-specific metadata | ✅ Decided | SDK doesn't model confidence/authorship; manifest is our extension layer |
| Low-confidence skills excluded from `skillDirectories` | ✅ Decided | Unvalidated skills shouldn't auto-inject into context; agents can still read them manually |
| Earned skills available in next session, not current | ✅ Decided | Hot-reload adds complexity; skills need validation before trust |
| Imported skills start at low confidence | ✅ Decided | Aligns with security policy — untrusted content until proven |
| Skill promotion evaluated at team load | 🔲 Needs discussion | Alternative: evaluate on session idle. Trade-off: load-time cost vs. freshness. |
| Skill content size limits | 🔲 Needs discussion | Large skills consume context budget. Should we cap `SKILL.md` at N tokens? |

## Implementation Notes

### Migration from Current Skills

Existing skills in `.squad/skills/{name}/SKILL.md` are already directory-structured. Migration adds `manifest.json`:

```typescript
async function migrateExistingSkills(): Promise<void> {
  const skillsRoot = resolve(TEAM_ROOT, 'skills');
  const dirs = readdirSync(skillsRoot, { withFileTypes: true }).filter(d => d.isDirectory());

  for (const dir of dirs) {
    const manifestPath = resolve(skillsRoot, dir.name, 'manifest.json');
    if (!existsSync(manifestPath)) {
      const manifest: SkillManifest = {
        name: dir.name,
        version: '1.0.0',
        description: extractFirstLine(resolve(skillsRoot, dir.name, 'SKILL.md')),
        confidence: 'medium',  // existing skills are pre-validated
        author: { type: 'system' },
        agents: '*',
        tags: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }
}
```

### Skill Context Budget

Each skill loaded via `skillDirectories` consumes context tokens. Budget considerations:

- Average `SKILL.md`: ~500-2000 tokens
- Agent with 5 skills: ~2500-10000 tokens of skill context
- With infinite sessions at 128K context: ~2-8% budget for skills (acceptable)
- Without infinite sessions (lightweight mode): skills not loaded (by design)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Too many skills overwhelm context | Agent performance degrades | Per-agent skill limits (max 8 skills loaded). Confidence-based filtering. Lightweight mode loads zero skills. |
| Manifest drift from SKILL.md content | Metadata doesn't match actual skill | Validate manifest on load. Warn on version/description mismatch. |
| Imported skills contain prompt injection | Security vulnerability | All imported skills start at `low` confidence. User confirmation required. Content scanning (future). |
| SDK `skillDirectories` behavior changes | Breaking change in skill loading | Pin SDK version. Integration tests verify skill loading. |
| Confidence promotion is too aggressive | Low-quality skills get trusted | Require 5 usages for `high` (not 2). Add team override for manual demotion. |

## Success Metrics

1. **Zero runtime file reads for skills:** All skills load via `skillDirectories` at session creation — no mid-conversation `view` calls to read SKILL.md
2. **Per-agent skill relevance:** Agents load only role-appropriate skills (backend agent doesn't get CSS skills)
3. **Confidence lifecycle functional:** New earned skills start at `low`, promote to `medium` after 2 successful uses, `high` after 5
4. **Migration is transparent:** Existing `.squad/skills/` directories work without manual intervention after upgrade
5. **Context budget under control:** Skill context never exceeds 15% of available context window

## Open Questions

1. **SDK skill format:** Does the SDK expect any specific file structure inside `skillDirectories` beyond markdown files? Need to verify if `manifest.json` is ignored or causes issues.
2. **Skill versioning across teams:** If two projects import the same skill at different versions, how do we handle conflicts during squad export/import?
3. **Skill deprecation:** How do we sunset a skill? `confidence: 'deprecated'` as a fourth level? Or just delete?
4. **Cross-session skill tracking:** Usage counting for confidence promotion currently requires scanning agent history files. Could SDK session events provide a cleaner signal?
5. **Skill size guardrails:** Should `squad skill create` enforce a max SKILL.md size? What's the right limit?
