# Decision: Import/Export Failure Mode Mitigation

**Author:** Keaton (Lead)  
**Date:** 2026-02-22  
**Status:** PROPOSED  
**Requested by:** Brady (identify customer risk points in import/export)

---

## Problem

Import/export is a critical feature for the Squad marketplace (PRD 16). However, current design and implementation decisions create 14 customer risk points where failure modes are either silent (user unaware something went wrong) or confusing (user sees error but doesn't understand cause or recovery). 

Analysis in `.ai-team/docs/import-export-flow.md` identifies:
- 4 HIGH severity cracks (data loss, silent failures, auth confusion)
- 8 MEDIUM severity cracks (stale cache, version drift, missing validation)
- 2 LOW severity cracks (missing feedback, edge cases)

**Most critical:** Aggressive caching (Decision Q10) + no update notification = consumer runs stale agent unaware for weeks. Combined with no MCP validation on import (Decision Q26 validates structure only) = potential for silent partial failures.

---

## Key Findings

### Silent Failures (Undetected by User)

1. **Broken MCP Config Silent** — Agent imports successfully even if required MCP servers aren't installed. Feature gracefully degrades at runtime (MCP calls fail). User has no idea.
   - Root: Decision Q26 validates structure, not dependencies.
   - Fix: Validate MCP servers on import, warn if missing.

2. **Stale Agent Unaware** — Consumer imported 4 weeks ago, new version available, consumer never runs `squad places upgrade`. Using outdated agent unaware.
   - Root: Decision Q10 (aggressive caching, no TTL, no auto-refresh) + Decision Q25 (offline graceful).
   - Fix: Log on every coordinator message: "Agent 'baer' cached 4 weeks ago. Update available: run `squad places upgrade baer`"

3. **History Shadow Lost** — Re-importing same agent overwrites history shadow, erasing project-specific learnings.
   - Root: Import process doesn't check if history exists before creating.
   - Fix: Merge history instead of overwriting. Separate definition cache from history shadow.

### Confusing States

4. **SDK Version Drift** — Agent published for SDK v0.1.8, consumer has v0.1.7. Import succeeds, agent works partially, features incomplete. No error message.
   - Root: Import doesn't validate SDK compatibility.
   - Fix: Include `sdkVersion` in metadata. Check on import, warn if mismatch.

5. **MCP Override Mismatch** — Agent requires PostgreSQL MCP, consumer overrides with MySQL MCP. Import succeeds, but agent fails at runtime on SQL operations.
   - Root: No validation that charter requirements match configured servers.
   - Fix: Validate charter MCP requirements against configured servers on import.

6. **Collision Detection Bypassed** — User imports "baer", gets renamed to "baer-imported". Minutes later, imports again (accident), gets same rename. Two agents with identical name.
   - Root: Rename logic is applied independently each time; not tracked.
   - Fix: Implement import manifest (`.squad/.cache/imports.json`). Track original name, commit SHA, rename applied. Prevent duplicates.

### Missing Feedback

7. **Export Success Not Confirmed** — `squad export` completes silently. User unsure if it worked, where file is, how to share it.
   - Root: CLI provides no feedback.
   - Fix: Print success summary: file size, agent count, version, next steps.

8. **Import Progress Hidden** — Large import (50 MB) takes 2 minutes. No progress output. User thinks process is hung, interrupts.
   - Root: No progress indicator.
   - Fix: Show progress bar, step-by-step feedback.

9. **Offline Mode Ambiguity** — Consumer tries import while offline, no cache exists. Error: "Can't reach marketplace repo." Unclear if issue is network, auth, or repo gone.
   - Root: Error message doesn't explain root cause (offline) or recovery options.
   - Fix: Detailed error: "Offline (no internet). Recovery: (1) go online, (2) use cached version, (3) check docs."

### Edge Cases (Rare, High Impact)

10. **Circular Dependency** — Agent "orchestrator" spawns agent "baer" (remote). Import both. Orchestrator hangs or fails.
    - Root: No validation that spawned agents are resolvable locally.
    - Fix: Scan charter for agent references. Resolve locally. Warn on circular deps.

11. **Conflicting Skills** — Import Squad A (has skill "API Testing"). Import Squad B (also has skill "API Testing"). Decision Q23 says first-listed wins. But which was first?
    - Root: Import order determines precedence, but user doesn't control it explicitly.
    - Fix: Warn on name conflicts. Offer rename or show precedence. Track in manifest.

12. **Large Agent Timeout** — Marketplace publishes 500 MB agent. Consumer tries import on slow network. Times out. No resume capability.
    - Root: No timeout config, no resume logic.
    - Fix: Warn on export if >50 MB. Implement resume: `squad import baer --resume`

13. **Permission Denied Auth Failure** — Consumer imports from private marketplace. gh CLI is authenticated, but user lacks access. Error: "404 Not Found — agent not found?"
    - Root: No pre-flight auth validation. Error message is ambiguous (404 could mean repo gone, not permission denied).
    - Fix: Pre-flight check. Different errors for 403 (permission) vs 404 (not found).

14. **Export Data Loss** — Agent charter has invalid Markdown (unclosed code block). Export succeeds. Imported charter renders broken.
    - Root: Export doesn't validate charter syntax.
    - Fix: Validate charter Markdown on export. Warn on syntax errors.

---

## Decisions (Proposed)

### 1. Enhance Import Validation on Entry

**Decision:** On `squad import`, perform pre-flight validation:
- Validate charter Markdown syntax
- Check MCP servers are installed (warn if missing)
- Check SDK version compatibility (warn if mismatch)
- Pre-flight auth for private marketplaces (return 403/404 appropriately)

**Why:** Catches errors early, before writing to disk. Prevents silent failures and confusing states.

**Trade-off:** Slightly slower import (validation overhead). But prevents weeks of debugging stale cache or broken MCP config.

**Implementation:** Add to M5 (Import/Export) work items.

---

### 2. Separate Definition Cache from History Shadow

**Decision:** Never overwrite history shadow on re-import. Keep definitions and history in separate locations:
- Definition cache: `.squad/.cache/{agent-name}.json` (updated on upgrade)
- History shadow: `.squad/agents/{agent-name}/history.md` (append-only, never deleted)

**Why:** History is permanent project context. Should never be lost due to re-import or upgrade accident.

**Trade-off:** Two files instead of one. But separation is cleaner architecturally.

**Implementation:** Change import flow in M5. Add merge logic for history.

---

### 3. Implement Import Manifest

**Decision:** Create `.squad/.cache/imports.json` tracking all imported artifacts:
```json
{
  "agents": [
    {
      "name": "baer-prod",
      "originalName": "baer",
      "source": "bradygaster/squad-marketplace",
      "pinnedToCommit": "abc123...",
      "importedAt": "2026-02-22T10:00:00Z",
      "lastUpdatedAt": "2026-02-22T10:00:00Z",
      "cacheLocation": ".squad/.cache/baer-prod.json",
      "historyLocation": ".squad/agents/baer-prod/history.md"
    }
  ]
}
```

**Why:** Enables duplicate detection, import tracking, and clear recovery path. User can see exactly what's imported and when.

**Trade-off:** One more file to maintain. But prevents accidents and supports debugging.

**Implementation:** Add to M5 work items. Use on every subsequent import to check for duplicates.

---

### 4. Stale Cache Warning Signal

**Decision:** On every coordinator session, check imported agent cache timestamps. If agent cached >7 days ago, log:
```
⚠️  Agent 'baer' cached 2 weeks ago (2026-02-08).
    Update available: 0.2.1 (2026-02-22)
    Run: squad places upgrade baer
```

**Why:** Aggressive caching is correct (Decision Q10), but users must be aware they're running stale code.

**Trade-off:** Adds one log message per session. But prevents weeks of unknowing stale usage.

**Implementation:** In coordinator session startup (M1). Read imports.json, check timestamps, log warnings.

---

### 5. Export Validation & Feedback

**Decision:** On `squad export`:
- Validate charter Markdown syntax
- Warn if agent >50 MB
- Generate success summary: file size, agent count, version, MCP servers
- Provide next steps: how to push to registry, how to share

**Why:** Prevents invalid exports reaching consumers. Gives users confidence export succeeded.

**Trade-off:** Adds validation overhead. But catches errors early.

**Implementation:** Add to M5 export work items.

---

### 6. Detailed Error Messages & Recovery Paths

**Decision:** When import/export fails, provide structured error with:
1. What happened (specific error)
2. Why it happened (root cause)
3. How to fix it (recovery options)
4. Where to get help (docs link)

**Example:**
```
❌ Can't reach marketplace: bradygaster/squad-marketplace
   Root cause: You don't have access to this private repo (403 Forbidden)
   Recovery: (1) Request access from team lead
            (2) Use a public marketplace
            (3) Check your gh CLI auth: gh auth status
   Help: https://docs.squad.dev/marketplace/troubleshooting
```

**Why:** Users currently see opaque errors. Clear error messages reduce frustration and support burden.

**Trade-off:** More code for error handling. But essential UX improvement.

**Implementation:** Error handling layer in M1. Apply to all CLI commands.

---

### 7. MCP Server Validation Framework

**Decision:** Charter markdown should document MCP requirements. On import, validate and store MCP validation report:
```
# Agent charter
Requires PostgreSQL MCP for database queries.
Requires Redis MCP for caching.

---
(Auto-generated validation report below)
## MCP Validation on Import (2026-02-22)
- PostgreSQL MCP: ❌ not installed (import allowed, feature may degrade)
- Redis MCP: ✅ installed
```

**Why:** Makes MCP dependencies explicit. Prevents runtime surprises.

**Trade-off:** Adds validation overhead. But prevents MCP-related silent failures.

**Implementation:** Add to M5. Charter template should include MCP section.

---

## Trade-offs & Alternatives

### Alternative 1: Auto-Refresh on Startup
**Rejected:** Decision Q10 explicitly says "local copy is source of truth, no auto-refresh." Auto-refresh breaks reproducibility. Violates user control principle.

### Alternative 2: Mandatory Upgrade Before Use
**Rejected:** Too strict. Forces users online. Blocks offline workflows. Violates Decision Q25.

### Alternative 3: No Caching (Always Fetch Latest)
**Rejected:** Breaks offline workflows. Too many network requests. Violates Decision Q10.

### Alternative 4: Validation Warnings Only (No Blocking)
**Considered:** But MCP validation and SDK compatibility are too important. Non-blocking warnings go unread. Should block on critical mismatches.

---

## Success Criteria

- [ ] All 14 identified cracks have mitigation (fixes listed above)
- [ ] No silent failures (all errors surfaced to user)
- [ ] Export/import provide clear feedback (success messages, progress)
- [ ] History shadow never lost on re-import
- [ ] Import manifest prevents duplicates
- [ ] Stale cache warning shown every session
- [ ] Error messages include root cause and recovery path
- [ ] MCP validation on import
- [ ] SDK version compatibility checked
- [ ] Pre-flight auth validation for private marketplaces

---

## Implementation Timeline

**Quick wins (before M5):**
- Export/import feedback messages (Cracks 7, 8, 9) — 1 week
- Pre-flight validation (Cracks 1, 5, 6, 13) — 2 weeks
- Error message framework (Crack 9) — 1 week

**M5 (Import/Export & Marketplace):**
- History shadow preservation (Crack 3) — 2 days
- Import manifest (Crack 4) — 2 days
- Cache staleness indicator (Crack 2) — 1 day
- Charter validation on export (Crack 14) — 1 day
- MCP validation framework (Crack 1, 6) — 2 days

**Phase 2+:**
- Charter dependency scanning (Crack 10) — 3 days
- Skill conflict resolution (Crack 11) — 3 days
- Import resume + timeout (Crack 12) — 3 days

---

## Open Questions

1. **History shadow merge strategy:** When re-importing same agent, should we append to history or offer user choice (skip/merge/replace)?
   - Recommended: Merge by default. Require explicit `--replace-history` flag.

2. **Stale cache TTL:** Should we recommend 7 days before warning? Or should warning be configurable?
   - Recommended: 7 days default. Allow override with `--cache-ttl` flag.

3. **MCP validation strictness:** Should missing MCP servers block import, or just warn?
   - Recommended: Warn, allow import. Some agents work without all MCP servers.

4. **Backward compatibility:** Existing users have imported agents without manifest or history separation. How do we migrate?
   - Recommended: On first run after update, generate manifest retroactively. Move history to correct location if needed.

---

## Related Decisions

- Decision Q10: Aggressive caching (no TTL, no auto-refresh)
- Decision Q25: Offline graceful (use cache + warn, or friendly error)
- Decision Q26: Validation on import (structure only, currently)
- Decision Q5: Collision blocking (DISALLOWED, require rename)
- PRD 16: Export/Import & Marketplace

---

**Decision Status:** PROPOSED — awaiting Brady approval before M5 implementation begins.

**Next:** Incorporate into M5 (Agent Repository) milestone work items. Each recommendation becomes a story.
