# Squad Entry Markdown (SEM) Format — Team Discussion Summary

**Date:** 2026-02-15  
**Discussed by:** Full Squad  
**For:** Brady (Review & Approval)  
**Related:** Issue from SquadUI project (https://github.com/csharpfritz/SquadUI)

---

## Problem Statement

The SquadUI project team gave us feedback: they're building VS Code tooling to surface Squad's memories and decisions, but the current format is hard to parse reliably because:

1. **Date-only stamps** (no times) — can't distinguish entries from the same day
2. **Inconsistent structure** — some entries have metadata fields, others don't  
3. **No type indicators** — can't tell decisions from memories without reading content
4. **Mixed formats** — different agents write slightly different styles
5. **No formal schema** — downstream tools resort to brittle regex patterns

Additionally, you mentioned we need **timestamps, not just dates** — the current format only tracks to the day, not the hour/minute.

---

## What We Propose

### Unified Format: Squad Entry Markdown (SEM)

A structured markdown format that's both **human-readable** and **machine-parseable**. All decisions, memories, notes, and directives use the same structure:

```markdown
### 2026-02-15T14:32:15-0800: decision: Per-agent model selection

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Verbal  
**scope:** team  
**tags:** model-selection, cost-optimization, v0.3.0  

**summary:** Agents choose models based on task type - cost-first unless writing code.

**details:**

Three tiers: haiku (non-code), sonnet (standard), opus (vision/complex).
Charter specifies default, user can override.

**rationale:** Your directive: optimize for cost unless code quality matters. 
$0.25/1M (haiku) vs $3/1M (sonnet) is significant at scale.

**related:**
- proposal: 024
- issue: #18

---
```

### Key Improvements

1. **ISO 8601 timestamps** with timezone — precise to the second
2. **Explicit type field** — `decision`, `memory`, `note`, or `directive`
3. **Structured fields** — consistent format, easy to parse
4. **Entry terminators** — `---` marks boundaries clearly
5. **Rich metadata** — tags, scope, cross-references
6. **Still markdown** — human-readable, not JSON/YAML

---

## Migration Strategy (Zero Breaking Changes)

### Phase 1: Dual Format (v0.5.0)

- **Backwards compatible** — both old and new formats work
- New entries use SEM format
- Old entries stay as-is (no forced rewrite)
- Agents learn to read BOTH formats
- SquadUI parses SEM, falls back to regex for legacy entries

### Phase 2: Conversion Tool (v0.5.x)

- CLI command: `npx github:bradygaster/squad convert-memory`
- Attempts automatic conversion with agent review
- Creates backups before changing anything
- Ships when community requests it (not blocking Phase 1)

### Phase 3: SEM-Only (v1.0.0)

- All new squads use SEM format exclusively
- Legacy format still readable (never breaks)
- No forced migrations until v1.0

---

## What We've Built

### 1. Full Proposal (Proposal 037)

**File:** `team-docs/proposals/037-standardized-memory-and-decision-format.md`

- Problem statement
- Complete format specification
- Migration strategy (3 phases)
- Examples for all entry types
- Benefits analysis
- Testing strategy
- Success criteria

**Length:** ~1,600 lines  
**Status:** Ready for your review

### 2. Format Specification (User Documentation)

**File:** `docs/specs/memory-format.md`

- Field-by-field definitions
- Parsing rules (with regex patterns)
- TypeScript reference implementation
- Validation rules
- Best practices for humans and tool builders

**Length:** ~1,200 lines  
**Audience:** Developers building tools like SquadUI

### 3. Agent Skill (Teaching Agents the Format)

**File:** `.ai-team/skills/squad-memory-format/SKILL.md`

- When to use each entry type
- How to generate timestamps (PowerShell/Bash/Node.js)
- Pattern library (7 common scenarios with examples)
- Anti-patterns (common mistakes to avoid)
- Quick reference card
- Integration with Squad workflows

**Length:** ~750 lines  
**Audience:** Squad agents (this is how they learn)

### 4. Coordinator Updates (Optional - Phase 1)

**Files to Update:**
- `.github/agents/squad.agent.md` (2 sections)
  - Directive capture format (line ~170)
  - Agent spawn decision format (line ~695)

**Changes:** Reference the new skill and format. Agents will learn from the skill naturally.

---

## Benefits

### For Downstream Tools (SquadUI)

✅ Reliable parsing — no more regex brittleness  
✅ Type filtering — show only decisions, hide agent memories  
✅ Timeline visualization — precise timestamps enable time-series  
✅ Rich search — tags and structured fields improve precision  
✅ Cross-referencing — `related:` links enable knowledge graphs  

### For Agents

✅ Clear contract — skill documents exactly how to write entries  
✅ Consistency — no "should I include Why?" ambiguity  
✅ Self-validating — structured format makes missing fields obvious  
✅ Cross-referencing — `related:` field enables natural linking  

### For Humans

✅ Still readable — markdown-first, not JSON  
✅ Scannable — bold field labels make entries easy to skim  
✅ Complete — rationale is always included for decisions  
✅ Auditable — timestamps answer "who decided when"  

---

## Examples

### Decision (Team-Wide)

```markdown
### 2026-02-15T14:32:15-0800: decision: Use PostgreSQL for primary database

**type:** decision  
**timestamp:** 2026-02-15T14:32:15-0800  
**author:** Keaton  
**scope:** team  
**tags:** database, architecture, postgresql  

**summary:** Primary database is PostgreSQL 16 with pgvector extension.

**details:**

Chose PostgreSQL over MongoDB/MySQL:
- Native vector similarity search via pgvector
- JSONB for flexible schema
- ACID compliance
- Team has production experience

**rationale:** Embedding similarity search is core. MongoDB's vector search is less mature. MySQL requires separate vector store. PostgreSQL unifies relational + vector + JSON.

**related:**
- proposal: 025
- issue: #45

---
```

### Memory (Agent-Specific)

```markdown
### 2026-02-15T15:45:30-0800: memory: Jest spy restoration pattern

**type:** memory  
**timestamp:** 2026-02-15T15:45:30-0800  
**author:** Hockney  
**scope:** agent:Hockney  
**tags:** testing, jest, mocking  

**summary:** Always restore spies in afterEach to prevent test pollution.

**details:**

Pattern:
\`\`\`javascript
let consoleSpy;
beforeEach(() => { consoleSpy = jest.spyOn(console, 'log'); });
afterEach(() => { consoleSpy.mockRestore(); });
\`\`\`

**rationale:** Hit this bug twice in PR #29 — tests passed alone, failed in suite.

---
```

### Directive (User-Stated Rule)

```markdown
### 2026-02-15T10:15:00-0800: directive: Always use single quotes in TypeScript

**type:** directive  
**timestamp:** 2026-02-15T10:15:00-0800  
**author:** bradygaster  
**scope:** team  
**tags:** code-style, typescript  

**summary:** TypeScript code must use single quotes, not double quotes.

**rationale:** User directive — consistency across codebase.

---
```

---

## Risk Assessment

### Low Risk

- **Additive change** — no breaking changes in Phase 1
- **Backwards compatible** — old entries continue to work
- **Opt-in migration** — conversion tool runs when users want it
- **Agent adoption** — skill reference means agents learn naturally
- **Zero dependencies** — pure markdown conventions, no npm packages

### Open Questions for You

1. **Timezone handling**: Should we preserve local timezone (recommended) or normalize everything to UTC?
   
2. **Scope inheritance**: Should agent memories auto-inherit from team decisions, or stay explicit?
   
3. **Expiry enforcement**: Should expired decisions trigger warnings in future (v0.6.0+)?

4. **Phase 1 timing**: Ship in v0.5.0 alongside `.ai-team/` → `.squad/` rename, or earlier?

---

## Recommendation

**✅ Approve Phase 1 for v0.5.0**

- Low risk, high value
- Unblocks SquadUI and future tooling
- Agents learn the format via skill reference
- No forced migrations
- Clear path forward

**Phase 2 (conversion tool) ships when community requests it.**

**Phase 3 (legacy removal) waits for v1.0.0.**

---

## What We Need From You

1. **Review the format**: Does the SEM structure make sense?
2. **Check the examples**: Are they clear and representative?
3. **Open questions**: Your answers to the 4 questions above
4. **Approve for v0.5.0**: Green light to proceed with implementation?

---

## Files to Review (Priority Order)

### Essential Reading (15 min)

1. **This summary** — you're already here
2. **Example decision** — see above (PostgreSQL example)
3. **Example memory** — see above (Jest spy example)

### Deep Dive (45 min)

4. **Proposal 037** — `team-docs/proposals/037-standardized-memory-and-decision-format.md`
5. **Skill file** — `.ai-team/skills/squad-memory-format/SKILL.md`

### Reference (when needed)

6. **Spec document** — `docs/specs/memory-format.md`

---

## Next Steps (If Approved)

1. **Fenster** — Update coordinator prompt templates (2 sections, ~20 lines)
2. **Verbal** — Add skill reference to spawn templates
3. **McManus** — Add format docs to user guide
4. **Keaton** — Plan v0.5.0 scope (SEM + `.squad/` rename + ?)
5. **Hockney** — Write tests for parsing and validation
6. **Community notification** — Update SquadUI project on the new format

---

## Alternative Considered (and Rejected)

### YAML Frontmatter

```yaml
---
type: decision
timestamp: 2026-02-15T14:32:15-0800
author: Keaton
---
Details here...
```

**Why rejected:** Not scannable by humans, breaks existing entries, requires YAML parser.

### JSON Blocks

```markdown
### 2026-02-15: Some decision

\`\`\`json
{"type": "decision", "timestamp": "2026-02-15T14:32:15-0800"}
\`\`\`

Details here...
```

**Why rejected:** Not human-scannable, cluttered, mixed format.

### SEM (Chosen)

**Why chosen:** Best balance of human readability and machine parseability. Markdown-native. Backwards-compatible-ish.

---

## Community Impact

**SquadUI project gets:**
- Reliable parsing (no regex fallbacks)
- Type filtering (show decisions, hide memories)
- Rich metadata (tags, scope, timestamps)
- Cross-reference graph (related links)

**Other tool builders get:**
- Clear specification to implement against
- Reference TypeScript parser
- JSON schema for validators
- Validation rules

---

## Summary

We've designed a structured markdown format (SEM) that solves the parsing problem for SquadUI and future tools while keeping entries human-readable. The migration strategy is backwards-compatible with zero breaking changes. Implementation is straightforward: agents learn from a skill, tools parse structured fields, users see no disruption.

**Vote:** ✅ Approve for v0.5.0  

---

**Questions? Concerns? Changes?**

Let us know and we'll adjust before implementation.

— Squad Team (Keaton, Verbal, Fenster, Hockney, McManus)
