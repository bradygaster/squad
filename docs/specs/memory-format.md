# Squad Entry Markdown (SEM) Format Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-02-15  

---

## Overview

Squad Entry Markdown (SEM) is a structured markdown format for writing decisions, memories, notes, and directives in Squad team files. It balances human readability with machine parseability, enabling downstream tools to reliably extract and analyze team knowledge.

### Design Goals

1. **Human-readable first**: Entries remain scannable markdown
2. **Machine-parseable**: Structured format with clear delimiters and field markers
3. **Backwards compatible**: Old format entries coexist with SEM during migration
4. **Rich metadata**: Support for timestamps, tags, scopes, and cross-references
5. **Type-safe**: Distinguish decisions from memories from notes

---

## Entry Structure

### Anatomy of an Entry

```markdown
### {timestamp}: {type}: {summary}

**type:** {decision|memory|note|directive}  
**timestamp:** {ISO-8601-with-timezone}  
**author:** {agent-or-human-name}  
**scope:** {team|agent:name|project|skill:name}  
**tags:** {comma, separated, keywords}  

**summary:** {one-sentence-description}

**details:**

{markdown-body-with-full-context}

**rationale:** {why-this-decision-was-made}

**related:**
- {type}: {identifier}
- {type}: {identifier}

---
```

### Field Reference

#### Header Line

Format: `### {timestamp}: {type}: {summary}`

- **Level 3 heading** (`###`) marks entry start
- **timestamp**: ISO 8601 with timezone offset (required)
- **type**: Entry type (required, one of: `decision`, `memory`, `note`, `directive`)
- **summary**: Brief description (required, ≤120 characters)

Example:
```markdown
### 2026-02-15T14:32:15-0800: decision: Per-agent model selection
```

#### Required Fields

**type**
- **Values**: `decision`, `memory`, `note`, `directive`
- **Meaning**:
  - `decision`: Team-wide agreement affecting multiple agents
  - `memory`: Learning from work (agent-specific or shared)
  - `note`: Informational entry (no action required)
  - `directive`: User-stated rule ("always...", "never...")
- **Format**: `**type:** {value}`

**timestamp**
- **Format**: ISO 8601 with timezone offset
- **Pattern**: `YYYY-MM-DDTHH:MM:SS±HHMM`
- **Examples**:
  - `2026-02-15T14:32:15-0800` (PST)
  - `2026-02-15T22:32:15+0000` (UTC)
  - `2026-02-16T09:32:15+0900` (JST)
- **Format**: `**timestamp:** {value}`
- **Rationale**: Preserves local timezone for auditability; enables chronological sorting

**author**
- **Values**: Agent name (e.g., `Keaton`, `Verbal`) or human name (e.g., `bradygaster`)
- **Special value**: `Coordinator` for system-level decisions
- **Format**: `**author:** {value}`

**summary**
- **Length**: ≤120 characters
- **Purpose**: One-sentence description for quick scanning and search results
- **Format**: `**summary:** {value}`

#### Optional Fields

**scope**
- **Values**:
  - `team` — all agents should read this
  - `agent:{name}` — only specified agent should read this
  - `project` — project-specific context
  - `skill:{name}` — knowledge that should become a skill
- **Default**: `team` for decisions/directives; `agent:{author}` for memories
- **Format**: `**scope:** {value}`

**tags**
- **Format**: Comma-separated keywords
- **Purpose**: Enable filtering, search, and categorization
- **Examples**: `model-selection, cost-optimization, v0.3.0`
- **Format**: `**tags:** {keywords}`

**details**
- **Format**: Markdown body (any length)
- **Purpose**: Full context, implementation details, code examples
- **Format**: `**details:**` followed by blank line, then markdown content

**rationale**
- **Format**: Markdown body (any length)
- **Purpose**: Explains WHY the decision was made
- **Strongly recommended for**: `type: decision` and `type: directive`
- **Format**: `**rationale:**` followed by explanation

**related**
- **Format**: List of related entries, one per line
- **Pattern**: `- {type}: {identifier}`
- **Types**: `proposal`, `issue`, `decision`, `memory`, `pr`, `skill`
- **Examples**:
  - `- proposal: 024`
  - `- issue: #18`
  - `- decision: 2026-02-15T14:32:15-0800`
  - `- pr: #42`
- **Format**: `**related:**` followed by list

**supersedes**
- **Format**: ISO 8601 timestamp
- **Purpose**: Marks which previous entry this one replaces
- **Format**: `**supersedes:** {timestamp}`
- **Use case**: Decision evolution, deprecation

**expires**
- **Format**: ISO 8601 timestamp
- **Purpose**: When this decision should be reviewed or reconsidered
- **Format**: `**expires:** {timestamp}`
- **Use case**: Temporary policies, trial periods

#### Entry Termination

**Format**: `---` on its own line (triple dash)

Marks the end of the entry. Required between consecutive entries.

---

## Parsing Rules

### Entry Detection

**Regex pattern** (single line):
```regex
^###\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}):\s+(decision|memory|note|directive):\s+(.+)$
```

**Capture groups**:
1. `timestamp`: ISO 8601 with timezone
2. `type`: Entry type
3. `summary`: One-line description

**Example match**:
```
Input:  ### 2026-02-15T14:32:15-0800: decision: Per-agent model selection
Group 1: 2026-02-15T14:32:15-0800
Group 2: decision
Group 3: Per-agent model selection
```

### Field Extraction

**Regex pattern** (per line):
```regex
^\*\*(\w+):\*\*\s+(.+)$
```

**Capture groups**:
1. `field`: Field name (e.g., `author`, `type`, `tags`)
2. `value`: Field value (may span multiple lines for `details` and `rationale`)

**Multi-line field handling**:
- Fields like `details` and `rationale` continue until:
  - Next `**fieldname:**` pattern
  - Entry terminator (`---`)
  - Next entry header (`###`)

**Example**:
```markdown
**details:**

This is a multi-line
field that continues
until the next field.

**rationale:** This field starts here.
```

### Related Links Parsing

**Pattern**: Each line under `**related:**` is `{type}: {identifier}`

**Regex** (per line):
```regex
^\s*-?\s*(proposal|issue|decision|memory|pr|skill):\s+(.+)$
```

**Capture groups**:
1. `type`: Relation type
2. `identifier`: Reference (proposal number, issue number, timestamp, etc.)

**Examples**:
```
Input:  - proposal: 024
Type:   proposal
ID:     024

Input:  - decision: 2026-02-15T14:32:15-0800
Type:   decision
ID:     2026-02-15T14:32:15-0800
```

### Reference Implementation (TypeScript)

```typescript
interface SEMEntry {
  // Required
  type: 'decision' | 'memory' | 'note' | 'directive';
  timestamp: string; // ISO 8601
  author: string;
  summary: string;

  // Optional
  scope?: string;
  tags?: string[];
  details?: string;
  rationale?: string;
  related?: Array<{ type: string; identifier: string }>;
  supersedes?: string; // ISO 8601
  expires?: string; // ISO 8601
}

function parseSEMEntry(markdown: string): SEMEntry {
  const lines = markdown.split('\n');
  
  // Extract header
  const headerMatch = lines[0].match(
    /^###\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}):\s+(decision|memory|note|directive):\s+(.+)$/
  );
  
  if (!headerMatch) {
    throw new Error('Invalid SEM entry header');
  }

  const entry: SEMEntry = {
    timestamp: headerMatch[1],
    type: headerMatch[2] as SEMEntry['type'],
    summary: headerMatch[3],
    author: '', // Will be filled from fields
  };

  // Extract fields
  let currentField: string | null = null;
  let currentValue: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Check for entry terminator
    if (line.trim() === '---') {
      break;
    }

    // Check for field start
    const fieldMatch = line.match(/^\*\*(\w+):\*\*\s+(.*)$/);
    if (fieldMatch) {
      // Save previous field
      if (currentField) {
        setField(entry, currentField, currentValue.join('\n').trim());
      }
      
      // Start new field
      currentField = fieldMatch[1];
      currentValue = [fieldMatch[2]];
    } else if (currentField) {
      // Continue multi-line field
      currentValue.push(line);
    }
  }

  // Save last field
  if (currentField) {
    setField(entry, currentField, currentValue.join('\n').trim());
  }

  return entry;
}

function setField(entry: SEMEntry, field: string, value: string) {
  switch (field) {
    case 'type':
      entry.type = value as SEMEntry['type'];
      break;
    case 'timestamp':
      entry.timestamp = value;
      break;
    case 'author':
      entry.author = value;
      break;
    case 'summary':
      entry.summary = value;
      break;
    case 'scope':
      entry.scope = value;
      break;
    case 'tags':
      entry.tags = value.split(',').map(t => t.trim());
      break;
    case 'details':
    case 'rationale':
      entry[field] = value;
      break;
    case 'related':
      entry.related = value.split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => {
          const match = line.match(/^\s*-?\s*(proposal|issue|decision|memory|pr|skill):\s+(.+)$/);
          return match ? { type: match[1], identifier: match[2] } : null;
        })
        .filter(Boolean) as Array<{ type: string; identifier: string }>;
      break;
    case 'supersedes':
    case 'expires':
      entry[field] = value;
      break;
  }
}
```

---

## Examples

### Example 1: Decision (Full)

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
- `haiku` (fast) - Scribe, non-code agents ($0.25/1M tokens)
- `sonnet` (standard) - core dev, leads writing code ($3/1M tokens)
- `opus` (premium) - vision tasks, complex architecture ($15/1M tokens)

Charter `## Model` field specifies default. User can override via spawn parameter.

Auto-selection algorithm maps role category to model tier:
- Designer → opus (vision required)
- Tester/Scribe → haiku (speed over quality)
- Lead/Dev → sonnet (balance)

Task complexity can bump tier (architecture decisions → opus).

**rationale:** Brady's directive: optimize for cost unless code quality matters. At scale, the difference between haiku ($0.25) and sonnet ($3.00) per 1M tokens is significant. Scribe doing file merges doesn't need Sonnet; Keaton making architecture decisions needs more than Haiku.

**related:**
- proposal: 024
- issue: #18
- decision: 2026-02-10T09:15:00-0800

---
```

### Example 2: Memory (Agent-Specific)

```markdown
### 2026-02-15T15:45:30-0800: memory: Jest spy restoration pattern

**type:** memory  
**timestamp:** 2026-02-15T15:45:30-0800  
**author:** Hockney  
**scope:** agent:Hockney  
**tags:** testing, jest, mocking, test-pollution  

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

Without `mockRestore()`, subsequent tests see the spy instead of real `console.log`.

**rationale:** Hit this bug twice in PR #29 test failures. Tests passed in isolation but failed when run as part of the suite. Root cause: spy wasn't restored, next test inherited it.

---
```

### Example 3: Directive (User-Stated)

```markdown
### 2026-02-15T10:15:00-0800: directive: No force-adding .ai-team/ files

**type:** directive  
**timestamp:** 2026-02-15T10:15:00-0800  
**author:** bradygaster  
**scope:** team  
**tags:** git, state-hygiene, release-process, policy  

**summary:** Never use git add -f on .ai-team/ files — they must stay gitignored.

**details:**

.ai-team/ is runtime team state, not product. Three enforcement layers:
1. `.gitignore` — prevents accidental tracking
2. `squad-main-guard.yml` — CI blocks PRs containing .ai-team/ paths to main
3. `package.json` files array — prevents npm distribution even if tracked

If `.ai-team/` appears in `git status`, the correct fix is:
```bash
git rm --cached -r .ai-team/
```

NOT `git add -f .ai-team/`.

**rationale:** Repeated incidents where .ai-team/ leaked into main via force-add during merge conflict resolution. User directive after v0.3.0 release required manual cleanup of 121 tracked files.

**related:**
- issue: #66
- decision: 2026-02-13T11:00:00-0800

---
```

### Example 4: Note (Informational)

```markdown
### 2026-02-15T16:00:00-0800: note: VS Code agent spawning validated

**type:** note  
**timestamp:** 2026-02-15T16:00:00-0800  
**author:** Strausz  
**scope:** team  
**tags:** spike, vs-code, agent-spawning, runSubagent  

**summary:** runSubagent works for Squad spawning — no coordinator code changes needed.

**details:**

Spike findings from Issue #32:
- `runSubagent` (anonymous) spawns work
- `.ai-team/` file access validated (workspace-scoped)
- Parallel sync subagents replace CLI background mode
- Model selection requires custom `.agent.md` files (Phase 2)
- SQL tool is CLI-only (document in compatibility matrix)

Full research: `team-docs/proposals/032b-vs-code-runSubagent-spike.md`

**related:**
- proposal: 032b
- issue: #32
- issue: #33

---
```

---

## Migration from Legacy Format

### Legacy Format Pattern

Old entries look like:
```markdown
### 2026-02-10: User directive — model selection cost optimization
**By:** Brady (via Copilot)
**What:** Agents should pick their own models...
**Why:** User request — captured for team memory...
```

### Conversion Strategy

1. **Extract date**: `### YYYY-MM-DD: {title}`
2. **Infer type**:
   - "User directive" → `directive`
   - "Decision:" → `decision`
   - Agent-specific history → `memory`
   - Everything else → `note`
3. **Add time component**: Use `T00:00:00+0000` (midnight UTC) for missing times
4. **Map fields**:
   - `By:` → `author:`
   - `What:` → `details:`
   - `Why:` → `rationale:`
5. **Generate summary**: Extract first sentence from `What:` field

### Automated with Agent Review

The `squad convert-memory` command attempts automatic conversion but flags ambiguous entries for agent review:

```bash
npx github:bradygaster/squad convert-memory --dry-run

Converting .ai-team/decisions.md...
  ✅ Entry 1: Auto-converted (high confidence)
  ⚠️  Entry 2: Needs review (ambiguous type)
  ✅ Entry 3: Auto-converted (high confidence)
  
2 of 3 entries converted automatically.
1 entry needs manual review.

Run without --dry-run to apply changes.
```

### Coexistence During Migration

Both formats parse correctly:

```markdown
### 2026-02-10: Old format entry
**By:** Keaton
**What:** Some decision...

---

### 2026-02-15T14:32:15-0800: decision: New format entry

**type:** decision
**timestamp:** 2026-02-15T14:32:15-0800
**author:** Keaton

**details:** Some decision...

---
```

Parsers attempt SEM format first, fall back to legacy pattern if no match.

---

## Validation

### Required Field Validation

```typescript
function validateSEMEntry(entry: SEMEntry): string[] {
  const errors: string[] = [];

  if (!entry.type) errors.push('Missing required field: type');
  if (!entry.timestamp) errors.push('Missing required field: timestamp');
  if (!entry.author) errors.push('Missing required field: author');
  if (!entry.summary) errors.push('Missing required field: summary');

  // Validate timestamp format
  if (entry.timestamp && !isValidISO8601(entry.timestamp)) {
    errors.push(`Invalid timestamp format: ${entry.timestamp}`);
  }

  // Validate type enum
  if (entry.type && !['decision', 'memory', 'note', 'directive'].includes(entry.type)) {
    errors.push(`Invalid type: ${entry.type}`);
  }

  // Validate summary length
  if (entry.summary && entry.summary.length > 120) {
    errors.push(`Summary too long: ${entry.summary.length} chars (max 120)`);
  }

  return errors;
}

function isValidISO8601(timestamp: string): boolean {
  // Pattern: YYYY-MM-DDTHH:MM:SS±HHMM
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/;
  return pattern.test(timestamp);
}
```

---

## Best Practices

### For Agents

1. **Use the skill**: Reference `.ai-team/skills/squad-memory-format/SKILL.md` before writing
2. **Be specific in summaries**: 120 characters is enough for a full sentence
3. **Choose the right type**:
   - Cross-cutting team policy? → `decision`
   - Learned something working? → `memory`
   - Status update? → `note`
   - User stated a rule? → `directive`
4. **Always include rationale for decisions**: Future you (or other agents) will need context
5. **Tag generously**: Tags enable discovery months later
6. **Cross-reference related entries**: Helps trace decision evolution

### For Humans

1. **Commit early**: Don't wait for perfect entries; they evolve
2. **Review periodically**: Use `squad memory --recent 7d` to see what the team learned
3. **Edit directly**: SEM entries are just markdown; manual editing is fine
4. **Archive old entries**: Keep decisions.md under 100KB for fast parsing
5. **Use scopes intentionally**: Not everything needs to be `team` scope

### For Tool Builders

1. **Parse defensively**: Not all entries will be perfectly formatted
2. **Fall back gracefully**: Support legacy format during migration window
3. **Validate timestamps**: Some may be malformed; skip or flag
4. **Index by tags**: Enables fast filtering without full-text search
5. **Respect scope**: Don't surface `agent:Hockney` entries in team-wide views

---

## Changelog

### v1.0 (2026-02-15) — Initial Draft

- Defined SEM structure and field types
- Documented parsing rules and regex patterns
- Provided TypeScript reference implementation
- Created migration guide from legacy format
- Added validation rules and best practices

---

## References

- **Proposal 037**: Standardized Memory and Decision Format
- **SquadUI Project**: https://github.com/csharpfritz/SquadUI
- **ISO 8601**: https://en.wikipedia.org/wiki/ISO_8601
- **Markdown Spec**: https://spec.commonmark.org/

---

**End of Specification**
