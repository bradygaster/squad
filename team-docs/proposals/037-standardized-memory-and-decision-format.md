# Proposal 037: Standardized Memory and Decision Format

**Status:** Draft  
**Author:** Squad (Team Response)  
**Date:** 2026-02-15  
**Issue:** Community feedback from SquadUI project  

---

## Problem

The SquadUI project (https://github.com/csharpfritz/SquadUI) is building tooling to surface Squad's memory and decisions in VS Code. However, the current format is difficult to parse reliably:

1. **Date-only stamps**: Entries use `### YYYY-MM-DD: description` with no time component
2. **Inconsistent structure**: Some entries have metadata fields (By, What, Why), others don't
3. **No formal schema**: Parsing requires brittle regex patterns that break on variations
4. **Mixed formats**: Different agents write entries in slightly different styles
5. **No type indicators**: Can't distinguish decisions from memories from notes without context

**Root cause**: The current format evolved organically from human-readable markdown. It works well for agents reading the full file but is hard for downstream tools to parse individual entries reliably.

---

## Solution

### Standardized Entry Format (SEM - Squad Entry Markdown)

Every decision, memory, and note uses this structure:

```markdown
### 2026-02-15T14:32:15-0800: decision: Per-agent model selection

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Verbal  
**scope:** team  
**tags:** model-selection, cost-optimization, v0.3.0  

**summary:** Agents choose their own models based on task type - cost-first unless writing code.

**details:**

Implemented per-agent model selection with three tiers:
- `haiku` (fast) - Scribe, non-code agents
- `sonnet` (standard) - core dev, leads writing code  
- `opus` (premium) - vision tasks, complex architecture

Charter `## Model` field specifies default. User can override. Auto-selection algorithm maps role → tier.

**rationale:** Brady's directive: optimize for cost unless code quality matters. $0.25/1M tokens (haiku) vs $3/1M (sonnet) is significant at scale.

**related:**
- proposal: 024
- issue: #18
- decision: 2026-02-10T09:15:00-0800

---
```

### Field Definitions

#### Required Fields

- **type**: `decision | memory | note | directive`
  - `decision`: Team-wide agreement affecting all agents
  - `memory`: Learning from work (agent-specific or shared)
  - `note`: Informational entry (no action required)
  - `directive`: User-stated rule ("always...", "never...")

- **timestamp**: ISO 8601 with timezone (e.g., `2026-02-15T14:32:15-0800`)

- **author**: Agent name, human name, or "Coordinator"

- **summary**: One sentence describing the entry (≤120 chars)

#### Optional Fields

- **scope**: `team | agent:{name} | project | skill:{name}`
  - Indicates who should read this entry
  - Default: `team` for decisions, `agent:{author}` for memories

- **tags**: Comma-separated keywords for filtering/search

- **details**: Markdown body with full context (the "What")

- **rationale**: Why this decision was made (the "Why")

- **related**: Links to other entries, proposals, issues
  - Format: `{type}: {identifier}` per line
  - Examples: `proposal: 024`, `issue: #18`, `decision: {timestamp}`

- **supersedes**: Timestamp of entry this replaces (for deprecations)

- **expires**: ISO 8601 timestamp when this decision should be reviewed

---

## Migration Strategy

### Phase 1: Dual Format (v0.5.0)

**Backwards compatible.** Both old and new formats coexist:

- Existing entries stay as-is (no rewrite)
- New entries use SEM format
- Agents learn to read BOTH formats
- SquadUI parses SEM entries, falls back to regex for old entries

### Phase 2: Conversion Tool (v0.5.x)

**CLI subcommand: `npx github:bradygaster/squad convert-memory`**

- Scans `.ai-team/decisions.md` and `agents/*/history.md`
- Attempts to parse old entries and convert to SEM
- Agent reviews conversions, fixes ambiguities
- Creates backup before overwriting

### Phase 3: SEM-Only (v1.0.0)

- Conversion tool runs automatically on `squad init` for repos with legacy entries
- All templates and skills reference SEM format only
- Old format is still parseable but not generated

---

## Schema Specification

### JSON Schema (for validators)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Squad Entry Markdown (SEM)",
  "type": "object",
  "required": ["type", "timestamp", "author", "summary"],
  "properties": {
    "type": {
      "type": "string",
      "enum": ["decision", "memory", "note", "directive"]
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 with timezone"
    },
    "author": {
      "type": "string",
      "minLength": 1
    },
    "summary": {
      "type": "string",
      "maxLength": 120
    },
    "scope": {
      "type": "string",
      "pattern": "^(team|project|agent:\\w+|skill:\\w+)$"
    },
    "tags": {
      "type": "string",
      "description": "Comma-separated keywords"
    },
    "details": {
      "type": "string",
      "description": "Markdown body"
    },
    "rationale": {
      "type": "string",
      "description": "Why this decision was made"
    },
    "related": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "identifier"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["proposal", "issue", "decision", "memory", "pr"]
          },
          "identifier": {
            "type": "string"
          }
        }
      }
    },
    "supersedes": {
      "type": "string",
      "format": "date-time"
    },
    "expires": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

### Parsing Rules

1. **Entry delimiter**: `### {timestamp}: {type}: {summary}`
   - Regex: `^###\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}):\s+(decision|memory|note|directive):\s+(.+)$`

2. **Field extraction**: `**{field}:** {value}`
   - Regex: `^\*\*(\w+):\*\*\s+(.+)$`
   - Multi-line fields continue until next `**field:**` or `---` delimiter

3. **Entry termination**: `---` on its own line (triple dash)

4. **Related links parsing**: Each line is `{type}: {identifier}`

---

## Skill: Writing Standardized Entries

The implementation is a single skill file that agents reference:

**Location:** `.ai-team/skills/squad-memory-format/SKILL.md`

**Teaches:**
- When to write decisions vs memories vs notes
- How to format SEM entries correctly
- Required vs optional fields
- Timestamp generation
- Scope selection
- Examples for each entry type

See implementation in "Files to Create" section below.

---

## Benefits

### For Downstream Tools (SquadUI, Extensions, Analyzers)

- **Reliable parsing**: Structured format with clear delimiters
- **Type filtering**: `type: decision` entries can be surfaced separately from memories
- **Rich metadata**: Tags, scope, related links enable powerful filtering
- **Timeline visualization**: Timestamps enable chronological views, time-series analysis
- **Scope filtering**: Show only team decisions, hide agent-specific memories
- **Search**: Tags and structured fields improve search precision
- **Diff detection**: Tools can detect when entries supersede each other

### For Agents

- **Clear contracts**: Skill documents exactly how to write entries
- **Self-validating**: Structured format makes it obvious when fields are missing
- **Consistency**: No ambiguity about "should I include 'Why'?" — rationale field is always available
- **Cross-referencing**: `related:` field enables agents to link decisions naturally

### For Humans

- **Still readable**: SEM is markdown-first, not JSON or YAML
- **Scannable**: Bold field labels make entries easy to skim
- **Complete**: No more "what was the rationale?" — it's required for decisions
- **Auditable**: Timestamps enable "who decided what when" questions

---

## Examples

### Decision Entry

```markdown
### 2026-02-15T14:32:15-0800: decision: GitHub Issues as proposals

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Keaton  
**scope:** team  
**tags:** proposals, github-integration, v0.3.0  

**summary:** Proposals are GitHub Issues, not markdown files in team-docs/.

**details:**

Proposals transition from `team-docs/proposals/*.md` to GitHub Issues with labels:
- `status:draft`, `status:approved`, etc. for lifecycle
- `squad:{agent}` for routing
- `type:feature`, `type:architecture` for categorization

Team iterates via issue comments. Owner approves via label change or comment.

**rationale:** Proposals as files are invisible to external contributors. Issues enable collaboration, notification, mobile access, and normal git flow.

**related:**
- proposal: 028
- issue: #10
- decision: 2026-02-10T16:20:00-0800

---
```

### Memory Entry (Agent-Specific)

```markdown
### 2026-02-15T15:45:30-0800: memory: Jest spy restoration pattern

**type:** memory  
**timestamp:** 2026-02-15T15:45:30-0800  
**author:** Hockney  
**scope:** agent:Hockney  
**tags:** testing, jest, mocking  

**summary:** Always restore spies in afterEach to prevent test pollution.

**details:**

Pattern for test setup:
```javascript
let consoleSpy;
beforeEach(() => {
  consoleSpy = jest.spyOn(console, 'log').mockImplementation();
});
afterEach(() => {
  consoleSpy.mockRestore();
});
```

Without mockRestore(), subsequent tests see the spy instead of real console.log.

**rationale:** Hit this bug twice in PR #29 test failures. Tests passed in isolation, failed in suite.

---
```

### Directive Entry (User-Stated Rule)

```markdown
### 2026-02-15T10:15:00-0800: directive: No force-adding .ai-team/ files

**type:** directive  
**timestamp:** 2026-02-15T10:15:00-0800  
**author:** bradygaster  
**scope:** team  
**tags:** git, state-hygiene, release-process  

**summary:** Never use git add -f on .ai-team/ files — they must stay gitignored.

**details:**

.ai-team/ is runtime team state, never product. Three enforcement layers:
1. .gitignore (prevents accidental tracking)
2. squad-main-guard.yml (CI blocks PRs to main)
3. package.json files array (prevents npm distribution)

If .ai-team/ appears in git status, the correct fix is git rm --cached, not git add -f.

**rationale:** Repeated incidents where .ai-team/ leaked into main via force-add. User directive after v0.3.0 release cleanup.

---
```

### Note Entry (Informational)

```markdown
### 2026-02-15T16:00:00-0800: note: VS Code agent spawning tested

**type:** note  
**timestamp:** 2026-02-15T16:00:00-0800  
**author:** Strausz  
**scope:** team  
**tags:** spike, vs-code, agent-spawning  

**summary:** runSubagent works for Squad spawning — no code changes needed.

**details:**

Spike findings:
- runSubagent (anonymous) spawns work
- .ai-team/ file access validated
- Parallel sync subagents replace background mode
- Model selection requires custom .agent.md files (Phase 2)

Full research: team-docs/proposals/032b-vs-code-runSubagent-spike.md

**related:**
- proposal: 032b
- issue: #32

---
```

---

## Files to Create

### 1. Schema Specification

**File:** `docs/specs/memory-format.md`

User-facing documentation:
- Format overview
- Field definitions
- Parsing rules
- Examples
- Migration guide

### 2. Skill Implementation

**File:** `.ai-team/skills/squad-memory-format/SKILL.md`

Agent-facing skill:
- When to write each entry type
- How to generate timestamps
- Field selection guidance
- Required vs optional fields
- Complete examples

### 3. Conversion Tool

**Code:** `index.js` (new subcommand)

```bash
npx github:bradygaster/squad convert-memory [--dry-run]
```

- Scans decisions.md and history files
- Attempts auto-conversion with agent review
- Creates backups
- Logs conversion success/failure per entry

---

## Testing Strategy

### Unit Tests

- **Parsing**: Ensure regex correctly extracts fields from SEM entries
- **Validation**: Verify required fields are enforced
- **Round-trip**: Write entry → parse → verify fields match
- **Legacy fallback**: Old format entries still parse

### Integration Tests

- **Agent writes**: Spawn agent with SEM skill, verify output format
- **Scribe merge**: Inbox entries in SEM format merge correctly
- **SquadUI compatibility**: Sample SEM entries parse in SquadUI

### Smoke Tests

- **Mixed format**: File with both old and new entries parses
- **Conversion tool**: Legacy decisions.md converts successfully
- **Backward compat**: v0.4.0 squads read v0.5.0 SEM entries

---

## Breaking Changes

**None in Phase 1.** The format is additive:

- Existing entries remain valid
- Agents learn to write new format
- Parsing supports both formats
- No user action required

**Phase 3 (v1.0.0)** removes old format generation but reads remain compatible.

---

## Dependencies

- **Phase 1 (v0.5.0)**: Skill creation, template updates, dual-format parsing
- **Phase 2 (v0.5.x)**: Conversion tool implementation
- **Phase 3 (v1.0.0)**: Legacy format deprecation

**No external dependencies**: Pure markdown with structured conventions.

---

## Success Criteria

- [ ] SquadUI can parse 100% of new entries without regex fallbacks
- [ ] Agents adopt SEM format within 2 sessions of skill exposure
- [ ] Conversion tool migrates 90%+ of legacy entries automatically
- [ ] Human readability remains high (tested with Brady)
- [ ] Time-series analysis possible (entries timeline chronologically)
- [ ] Zero breaking changes for existing squads until v1.0.0

---

## Future Enhancements

### Query Language (v0.6.0+)

```
squad memory --type decision --author Keaton --after 2026-02-01 --tags v0.3.0
```

Structured format enables rich CLI queries.

### Memory Analytics (v0.7.0+)

- Decision velocity (decisions per week)
- Agent contribution metrics
- Knowledge growth curves
- Scope analysis (team vs agent-specific ratios)

### Cross-Squad Knowledge Transfer

SEM entries in `.ai-team/skills/` can be shared across squads:

```bash
squad export --skills
squad import --from other-squad.json --skills-only
```

Portable, structured knowledge.

---

## Open Questions

1. **Timezone handling**: Should timestamps always be UTC, or preserve local timezone?
   - Recommendation: Preserve local, require explicit offset

2. **Scope inheritance**: Should agent memories auto-inherit from team scope?
   - Recommendation: No. Explicit scope encourages intentional sharing.

3. **Expiry enforcement**: Should expired decisions trigger warnings?
   - Recommendation: Yes, in v0.6.0+ via `squad health` command

4. **Multi-author entries**: How to handle decisions made by multiple agents?
   - Recommendation: Primary author field, add `contributors: agent1, agent2` optional field

---

## Recommendation

**Ship Phase 1 in v0.5.0.**

- Low risk: additive, backwards compatible
- High value: unblocks SquadUI and future tooling
- Clear path: skill + template updates only, no core logic changes
- Testable: unit tests for parsing, integration tests for agent adoption

Phase 2 (conversion tool) ships when community requests it. Not blocking.

Phase 3 (legacy removal) waits for v1.0.0 — no forced migrations before major version.

---

## Related Work

- Issue #29: SquadUI parsing feedback (catalyst)
- Proposal 034: Notification architecture (uses structured entries for trigger detection)
- Proposal 028: GitHub-native planning (cross-references to decision entries)
- Feature: Skills system (SEM-formatted skill entries enable skill versioning)

---

## Appendix A: Regex Patterns

### Entry Header Extraction

```regex
^###\s+(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}):\s+(?<type>decision|memory|note|directive):\s+(?<summary>.+)$
```

Named capture groups:
- `timestamp`: ISO 8601 with timezone
- `type`: Entry type
- `summary`: One-line description

### Field Extraction

```regex
^\*\*(?<field>\w+):\*\*\s+(?<value>.+)$
```

Named capture groups:
- `field`: Field name (lowercase)
- `value`: Field content (may be multi-line)

### Entry Termination

```regex
^---$
```

Triple dash on its own line ends the entry.

---

## Appendix B: Comparison with Alternatives

### Alternative 1: YAML Frontmatter

```yaml
---
type: decision
timestamp: 2026-02-15T14:32:15-0800
author: Keaton
summary: GitHub Issues as proposals
---

Details here...
```

**Pros:** Machine-readable, well-supported parsers  
**Cons:** Not scannable by humans, breaks existing entries, requires YAML parser

**Verdict:** Rejected. Markdown-first is a Squad principle.

### Alternative 2: JSON Blocks

```markdown
### 2026-02-15: GitHub Issues as proposals

```json
{
  "type": "decision",
  "timestamp": "2026-02-15T14:32:15-0800",
  "author": "Keaton"
}
```

Details here...
```

**Pros:** Perfect machine parsing  
**Cons:** Not human-scannable, mixed format, cluttered

**Verdict:** Rejected. Human readability suffers.

### Alternative 3: Structured Markdown (SEM - chosen)

```markdown
### 2026-02-15T14:32:15-0800: decision: GitHub Issues as proposals

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Keaton  

Details here...
```

**Pros:** Human-readable, parseable, markdown-native, backwards-compatible-ish  
**Cons:** Requires custom parser (not standard YAML/JSON)

**Verdict:** Chosen. Best balance of human/machine readability.

---

## Appendix C: SquadUI Integration Points

Based on feedback from csharpfritz, SquadUI needs:

1. **Entry type detection** → `type:` field
2. **Timestamp parsing** → ISO 8601 in header
3. **Author identification** → `author:` field
4. **Filtering by scope** → `scope:` field (team vs agent)
5. **Search by tags** → `tags:` field
6. **Related entry links** → `related:` field

SEM provides all six out of the box.

---

## Appendix D: Memory vs Decision Distinction

**When to use `type: decision`:**
- Team-wide agreement affecting multiple agents
- User directive ("always...", "never...")
- Architectural choice with cross-cutting impact
- Policy or convention adoption

**When to use `type: memory`:**
- Learned pattern from completing work
- Bug encountered and fixed
- API quirk or tool behavior observed
- Test strategy that worked well

**When to use `type: note`:**
- Status update (spike completed, test passed)
- Pointer to external resource
- Observation without action
- Informational only

**When to use `type: directive`:**
- User explicitly stated a rule
- Captured from "always...", "from now on..." phrasing
- Authoritative (came from human, not inferred by agent)

---

**End of Proposal 037**
