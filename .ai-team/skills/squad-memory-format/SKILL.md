---
name: "squad-memory-format"
description: "How to write standardized decisions, memories, notes, and directives using Squad Entry Markdown (SEM) format"
domain: "documentation, memory-management, knowledge-capture"
confidence: "high"
source: "manual"
version: "1.0"
---

## Context

Squad uses a structured markdown format called **Squad Entry Markdown (SEM)** for all decisions, memories, notes, and directives. This format balances human readability with machine parseability, enabling downstream tools (like SquadUI) to reliably extract and analyze team knowledge.

**When to use this skill:**
- Writing to `.ai-team/decisions.md` or `decisions/inbox/`
- Appending to your `history.md` file
- Recording any team knowledge (decisions, learnings, directives, notes)

**Key principle:** Every entry MUST include a timestamp (not just a date), structured fields, and a terminator.

---

## Entry Types

Choose the right type for your entry:

| Type | When to Use | Scope Default |
|------|-------------|---------------|
| **decision** | Team-wide agreement affecting multiple agents, architectural choice, policy adoption | `team` |
| **memory** | Learned pattern from work, bug encountered, API quirk, test strategy | `agent:{you}` |
| **note** | Status update, pointer to resource, informational only | `team` |
| **directive** | User explicitly stated a rule ("always...", "never...") | `team` |

**Examples:**
- User says "always use single quotes" → `directive`
- You chose to use PostgreSQL over MySQL → `decision`
- You discovered Jest requires spy restoration → `memory`
- You completed a spike and documented findings → `note`

---

## Format Template

```markdown
### {timestamp}: {type}: {summary}

**type:** {decision|memory|note|directive}  
**timestamp:** {ISO-8601-with-timezone}  
**author:** {your-name}  
**scope:** {team|agent:name|project|skill:name}  
**tags:** {comma, separated, keywords}  

**summary:** {one-sentence-description}

**details:**

{Full context, implementation details, code examples}

**rationale:** {why-this-decision-was-made}

**related:**
- {type}: {identifier}
- {type}: {identifier}

---
```

### Required Fields

1. **type**: `decision`, `memory`, `note`, or `directive`
2. **timestamp**: ISO 8601 with timezone (see Timestamp Generation below)
3. **author**: Your name (e.g., `Keaton`, `Verbal`, `bradygaster`)
4. **summary**: One sentence, ≤120 characters

### Optional Fields (Use When Relevant)

- **scope**: Who should read this (default: `team` for decisions, `agent:{you}` for memories)
- **tags**: Keywords for filtering (e.g., `testing, jest, mocking`)
- **details**: Full context (strongly recommended)
- **rationale**: Why (strongly recommended for decisions and directives)
- **related**: Links to proposals, issues, other entries
- **supersedes**: Timestamp of entry this replaces
- **expires**: When to review this decision

### Entry Terminator

**Always end with `---` on its own line.** This marks the entry boundary.

---

## Timestamp Generation

**Format:** `YYYY-MM-DDTHH:MM:SS±HHMM`

**How to generate:**

### PowerShell (Windows)
```powershell
Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz" | ForEach-Object { $_ -replace ':', '' -replace '(\d{2})$', '$1' }
```

### Bash (Linux/Mac)
```bash
date +"%Y-%m-%dT%H:%M:%S%z"
```

### Node.js (if available)
```javascript
new Date().toISOString().replace(/\.\d{3}Z$/, '') + 
  new Date().toTimeString().match(/([+-]\d{4})/)[1]
```

**Examples:**
- `2026-02-15T14:32:15-0800` (PST)
- `2026-02-15T22:32:15+0000` (UTC)
- `2026-02-16T09:32:15+0900` (JST)

**Important:** Preserve the local timezone offset. Don't convert to UTC.

---

## Patterns

### Pattern 1: Writing a Decision

**Scenario:** You made an architectural choice affecting the whole team.

```markdown
### 2026-02-15T14:32:15-0800: decision: Use PostgreSQL for primary database

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Keaton  
**scope:** team  
**tags:** database, architecture, postgresql, v0.3.0  

**summary:** Primary database is PostgreSQL 16 with pgvector extension for embeddings.

**details:**

Evaluated three options:
1. PostgreSQL — mature, pgvector for embeddings, strong JSONB support
2. MongoDB — flexible schema, but lacks ACID guarantees
3. MySQL — familiar, but weak JSON/vector support

Chose PostgreSQL because:
- Native vector similarity search via pgvector
- JSONB for flexible schema where needed
- ACID compliance for transactions
- Team has production experience

**rationale:** The embedding similarity search is a core feature. MongoDB's vector search is less mature. MySQL would require a separate vector store. PostgreSQL unifies relational + vector + JSON in one database.

**related:**
- proposal: 025
- issue: #45

---
```

**Key points:**
- `type: decision` because it affects the whole team
- `scope: team` (default for decisions)
- Tags include the version where this ships
- **rationale** explains why, not just what

---

### Pattern 2: Writing a Memory (Agent-Specific)

**Scenario:** You learned something while working that's useful for future work.

```markdown
### 2026-02-15T15:45:30-0800: memory: Jest spy restoration pattern

**type:** memory  
**timestamp:** 2026-02-15T15:45:30-0800  
**author:** Hockney  
**scope:** agent:Hockney  
**tags:** testing, jest, mocking, test-pollution  

**summary:** Always restore spies in afterEach to prevent test pollution.

**details:**

Pattern:
```javascript
let consoleSpy;
beforeEach(() => {
  consoleSpy = jest.spyOn(console, 'log').mockImplementation();
});
afterEach(() => {
  consoleSpy.mockRestore();
});
```

Without `mockRestore()`, subsequent tests inherit the spy.

**rationale:** Hit this bug twice in PR #29. Tests passed in isolation, failed in suite. Root cause: spy wasn't restored.

---
```

**Key points:**
- `type: memory` because it's a learning, not a policy
- `scope: agent:Hockney` because it's testing-specific knowledge
- Code example in **details**
- **rationale** explains the pain point

---

### Pattern 3: Writing a Directive (User-Stated Rule)

**Scenario:** The user says "always..." or "never..." — capture it immediately.

```markdown
### 2026-02-15T10:15:00-0800: directive: Always use single quotes in TypeScript

**type:** directive  
**timestamp:** 2026-02-15T10:15:00-0800  
**author:** bradygaster  
**scope:** team  
**tags:** code-style, typescript, conventions  

**summary:** TypeScript code must use single quotes for strings, not double quotes.

**details:**

Applies to:
- All `.ts` and `.tsx` files
- String literals, imports, JSX attributes

Exceptions:
- Strings containing single quotes (escape with double quotes)
- JSON (always double quotes per spec)

**rationale:** User directive — consistency across codebase, matches team's existing JavaScript style.

---
```

**Key points:**
- `type: directive` because user stated it explicitly
- `author: bradygaster` (the human who said it)
- **details** includes exceptions
- Don't question directives — just record them

---

### Pattern 4: Writing a Note (Informational)

**Scenario:** You completed a spike or want to document findings without making a decision.

```markdown
### 2026-02-15T16:00:00-0800: note: VS Code agent spawning validated

**type:** note  
**timestamp:** 2026-02-15T16:00:00-0800  
**author:** Strausz  
**scope:** team  
**tags:** spike, vs-code, agent-spawning  

**summary:** runSubagent works for Squad spawning — no code changes needed.

**details:**

Spike findings:
- `runSubagent` (anonymous) spawns work
- `.ai-team/` file access validated
- Parallel sync subagents replace background mode
- Model selection requires custom `.agent.md` files (Phase 2)

Full research: team-docs/proposals/032b.md

**related:**
- proposal: 032b
- issue: #32

---
```

**Key points:**
- `type: note` because it's informational, not a policy change
- No **rationale** needed (notes are observations, not decisions)
- **related** links to the full proposal

---

### Pattern 5: Cross-Referencing Related Entries

When your entry builds on or relates to previous work:

```markdown
**related:**
- proposal: 024
- issue: #18
- decision: 2026-02-10T09:15:00-0800
- memory: 2026-02-12T14:00:00-0800
- pr: #42
- skill: jest-testing-patterns

---
```

**Supported relation types:**
- `proposal` — Reference to `team-docs/proposals/{number}.md`
- `issue` — GitHub issue `#{number}`
- `decision` — Another decision entry (by timestamp)
- `memory` — Another memory entry (by timestamp)
- `pr` — GitHub pull request `#{number}`
- `skill` — Reference to `.ai-team/skills/{name}/SKILL.md`

---

### Pattern 6: Superseding an Old Entry

When a decision evolves or gets replaced:

```markdown
### 2026-02-16T10:00:00-0800: decision: Use Haiku for Scribe, not Sonnet

**type:** decision  
**timestamp:** 2026-02-16T10:00:00-0800  
**author:** Verbal  
**scope:** team  
**tags:** model-selection, cost-optimization, scribe  
**supersedes:** 2026-02-15T14:32:15-0800  

**summary:** Scribe uses haiku model for cost optimization — sonnet is overkill.

**details:**

Changed Scribe's default model from `sonnet` to `haiku`:
- Scribe does file merging and session logging (mechanical work)
- Quality difference is negligible (tested over 20 sessions)
- Cost: $0.25/1M vs $3.00/1M tokens — 12x cheaper

**rationale:** Brady's directive: cost-first unless writing code. Scribe doesn't write code.

---
```

**Key points:**
- **supersedes** field links to the old entry's timestamp
- Both entries remain in history for auditability
- New entry explains what changed and why

---

### Pattern 7: Temporary Decisions with Expiry

When a decision is time-bound or should be reviewed later:

```markdown
### 2026-02-15T11:00:00-0800: decision: Trial period for Haiku model on Scribe

**type:** decision  
**timestamp:** 2026-02-15T11:00:00-0800  
**author:** Keaton  
**scope:** team  
**tags:** model-selection, trial, scribe  
**expires:** 2026-03-01T00:00:00-0800  

**summary:** Scribe uses haiku for 2-week trial period — review quality by March 1.

**details:**

Trial parameters:
- Scribe switches from sonnet to haiku
- Monitor for dropped information, merge errors, formatting issues
- If quality degrades, revert to sonnet
- If quality holds, make permanent

**rationale:** Cost optimization hypothesis. Needs production validation before permanent adoption.

---
```

**Key points:**
- **expires** field sets review date
- Trial decisions should document success criteria
- After expiry, write a new entry with findings

---

## Anti-Patterns

### ❌ Don't: Skip the timestamp

**Bad:**
```markdown
### 2026-02-15: decision: Use PostgreSQL
```

**Good:**
```markdown
### 2026-02-15T14:32:15-0800: decision: Use PostgreSQL
```

**Why:** Downstream tools can't distinguish entries created on the same day, and chronological ordering breaks.

---

### ❌ Don't: Mix old and new formats in the same file

**Bad:**
```markdown
### 2026-02-15T14:32:15-0800: decision: New format

**type:** decision
...

---

### 2026-02-15: Old format
**By:** Keaton
**What:** Some decision
```

**Good:** Stick to SEM format for all new entries. Old entries can stay until migration.

---

### ❌ Don't: Forget the entry terminator

**Bad:**
```markdown
### 2026-02-15T14:32:15-0800: decision: First entry

**type:** decision
**timestamp:** 2026-02-15T14:32:15-0800
**author:** Keaton

**details:** Some content.

### 2026-02-15T15:00:00-0800: decision: Second entry
```

**Good:**
```markdown
### 2026-02-15T14:32:15-0800: decision: First entry

**type:** decision
**timestamp:** 2026-02-15T14:32:15-0800
**author:** Keaton

**details:** Some content.

---

### 2026-02-15T15:00:00-0800: decision: Second entry
```

**Why:** The terminator (`---`) marks entry boundaries for parsers.

---

### ❌ Don't: Write vague summaries

**Bad:**
```markdown
**summary:** Updated the model selection logic.
```

**Good:**
```markdown
**summary:** Scribe now uses haiku model instead of sonnet for cost optimization.
```

**Why:** Summaries are used in search results and tooling. Be specific.

---

### ❌ Don't: Omit rationale for decisions

**Bad:**
```markdown
### 2026-02-15T14:32:15-0800: decision: Use PostgreSQL

**type:** decision
**timestamp:** 2026-02-15T14:32:15-0800
**author:** Keaton

**details:** We're using PostgreSQL.

---
```

**Good:**
```markdown
### 2026-02-15T14:32:15-0800: decision: Use PostgreSQL

**type:** decision
**timestamp:** 2026-02-15T14:32:15-0800
**author:** Keaton

**details:** Primary database is PostgreSQL 16 with pgvector extension.

**rationale:** pgvector provides native vector similarity search, eliminating need for separate vector store. JSONB handles flexible schema. Team has production experience.

---
```

**Why:** Future agents (and humans) need to understand WHY decisions were made, not just WHAT was decided.

---

## Quick Reference Card

### Minimal Valid Entry

```markdown
### 2026-02-15T14:32:15-0800: decision: Brief title

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** YourName  
**summary:** One-sentence description.

---
```

### Recommended Full Entry

```markdown
### 2026-02-15T14:32:15-0800: decision: Descriptive title

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** YourName  
**scope:** team  
**tags:** relevant, keywords, here  

**summary:** One-sentence description under 120 characters.

**details:**

Full context, implementation details, code examples.

**rationale:** Why this decision was made.

**related:**
- proposal: 024
- issue: #18

---
```

---

## Writing Workflow

1. **Identify type**: Decision, memory, note, or directive?
2. **Generate timestamp**: Use PowerShell/Bash/Node.js command
3. **Write header**: `### {timestamp}: {type}: {summary}`
4. **Fill required fields**: type, timestamp, author, summary
5. **Add optional fields**: scope, tags, details, rationale, related
6. **Terminate entry**: `---` on its own line
7. **Commit**: Write to appropriate file (decisions.md, history.md, or inbox)

---

## Integration with Squad Workflows

### When Writing to Decisions Inbox

**Pattern:**
```markdown
# File: .ai-team/decisions/inbox/keaton-use-postgresql.md

### 2026-02-15T14:32:15-0800: decision: Use PostgreSQL for primary database

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Keaton  
**scope:** team  
**tags:** database, architecture, postgresql  

**summary:** Primary database is PostgreSQL 16 with pgvector extension.

**details:**

Chose PostgreSQL over MongoDB/MySQL because...

**rationale:** pgvector provides native vector similarity search...

---
```

Scribe will merge this into the canonical `.ai-team/decisions.md`.

---

### When Appending to Your History

**Pattern:**
```markdown
# File: .ai-team/agents/keaton/history.md

[... existing entries ...]

### 2026-02-15T14:32:15-0800: memory: Database evaluation process

**type:** memory  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Keaton  
**scope:** agent:Keaton  
**tags:** architecture, database-selection  

**summary:** Evaluated PostgreSQL, MongoDB, MySQL for primary database.

**details:**

Evaluation criteria:
- Vector similarity search support
- ACID compliance
- JSON/flexible schema support
- Team experience

PostgreSQL scored highest across all criteria.

**related:**
- decision: 2026-02-15T14:32:15-0800

---
```

---

## Tools That Consume SEM

These tools expect SEM format:

1. **SquadUI** (VS Code extension) — parses decisions and memories for IDE display
2. **squad memory** CLI — query and filter team knowledge
3. **Notification triggers** — structured `type:` field enables smart routing
4. **Analytics** — timestamp precision enables time-series analysis
5. **Cross-referencing** — `related:` field powers knowledge graph visualization

---

## Migration Notes

### Coexistence Period

During v0.5.0, both old and new formats coexist:

**Old format (still readable):**
```markdown
### 2026-02-10: Some decision
**By:** Keaton
**What:** Details here
**Why:** Rationale here
```

**New format (SEM):**
```markdown
### 2026-02-15T14:32:15-0800: decision: Some decision

**type:** decision
**timestamp:** 2026-02-15T14:32:15-0800
**author:** Keaton

**details:** Details here

**rationale:** Rationale here

---
```

**Your job:** Write all NEW entries in SEM format. Leave old entries alone until the conversion tool runs.

---

## Summary

**Core principles:**
1. Always include ISO 8601 timestamp with timezone
2. Use correct type (decision/memory/note/directive)
3. Write summaries under 120 characters
4. Include rationale for decisions
5. Terminate entries with `---`
6. Tag generously for future discovery
7. Cross-reference related work

**When in doubt:** Copy an example from this skill and adapt it.

---

**Full specification:** `docs/specs/memory-format.md`  
**Proposal:** `team-docs/proposals/037-standardized-memory-and-decision-format.md`
