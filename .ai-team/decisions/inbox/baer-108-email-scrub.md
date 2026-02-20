# Decision: Email Scrubbing Implementation for Squad State Files

**Status:** Implemented  
**Date:** 2026-02-11  
**Author:** Baer (Security Specialist)  
**Issue:** #108  
**PR:** #110  

## Context

Squad historically stored `git config user.email` in committed files (team.md, agent histories). These files are pushed to remotes, exposing PII. The immediate fix (removing email collection from squad.agent.md) shipped in v0.4.2. This decision documents the migration scrubber implementation.

## Decision

Implemented email address scrubbing in three layers:

### 1. Core Scrubbing Function (`scrubEmailsFromDirectory()`)

**Scope:**
- Root files: `team.md`, `decisions.md`, `routing.md`, `ceremonies.md`
- Agent histories: `.ai-team/agents/*/history.md`
- Log files: `.ai-team/log/*.{md,txt,log}`

**Patterns:**
- `name (email@domain.com)` → `name` (identity attribution)
- Bare `email@domain.com` → `[email scrubbed]` (context-aware)

**Exclusions (preserve emails in):**
- URLs (`http://`, `https://`)
- Code blocks (````)
- Examples (`example.com`)
- Comments (`//`, `#`)

**Regex:** `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`

### 2. CLI Command (`squad scrub-emails [directory]`)

**Usage:**
```bash
squad scrub-emails              # Defaults to .ai-team/
squad scrub-emails .ai-team/    # Explicit directory
```

**Output:**
- Reports files scrubbed
- Warns about git history containing emails
- Points to `git-filter-repo` for complete scrub

**Exit behavior:** Safe — logs and continues on errors

### 3. Automatic Migration (v0.5.0)

**Trigger:** `squad upgrade` from pre-v0.5.0 to v0.5.0+

**Behavior:**
- Runs `scrubEmailsFromDirectory()` on `.ai-team/`
- Reports how many files were cleaned
- Non-blocking — failures logged, upgrade continues

**Migration registry entry:**
```javascript
{
  version: '0.5.0',
  description: 'Scrub email addresses from Squad state files (privacy fix)',
  run(dest) {
    const aiTeamDir = path.join(dest, '.ai-team');
    if (fs.existsSync(aiTeamDir)) {
      const scrubbedFiles = scrubEmailsFromDirectory(aiTeamDir);
      if (scrubbedFiles.length > 0) {
        console.log(`${GREEN}✓${RESET} Privacy migration: scrubbed email addresses from ${scrubbedFiles.length} file(s)`);
      }
    }
  }
}
```

## Rationale

**Why not strip all emails?**  
- Preserving emails in URLs, code examples, and documentation is critical to avoid breaking content
- Context-aware scrubbing balances privacy with usability

**Why `[email scrubbed]` instead of deletion?**  
- Maintains audit trail — users know scrubbing occurred
- Avoids breaking attribution lines (`By: [email scrubbed]` vs. `By:`)

**Why not scrub git history automatically?**  
- `git filter-repo` is destructive — requires force-push, coordination with team
- User must opt-in to history rewrite (Squad warns but doesn't enforce)

## Alternatives Considered

1. **Delete emails entirely (no replacement text)**  
   ❌ Breaks attribution, harder to audit  
   ✅ Chosen: `[email scrubbed]` placeholder

2. **Scrub git history automatically during migration**  
   ❌ Destructive, requires force-push, breaks forks  
   ✅ Chosen: Warn user, provide `git-filter-repo` link

3. **Block commits containing emails (git hook)**  
   ❌ Too aggressive — breaks legitimate uses (documentation, examples)  
   ✅ Chosen: Scrub on migration, warn on export

## Implementation Notes

**Bug fixes bundled in #110:**
- Fixed missing `squadInfo` declaration (replaced `detectSquadDir()` calls)
- Fixed `showDeprecationWarning()` → `showDeprecationBanner()` typos
- These were pre-existing issues in dev branch (unfinished v0.5.0 work)

**Test coverage:**
- All 53 existing tests pass
- Manual verification: `squad scrub-emails .ai-team` (no emails found in Squad source repo after v0.4.2 cleanup)

**Files modified in #110:**
- `index.js` — scrubEmailsFromDirectory(), CLI command, migration entry, squadInfo fix
- `.ai-team/skills/human-notification/SKILL.md` — replaced `brady@example.com` with `+15551234567`

## Consequences

### Positive
✅ Consumer repos automatically scrubbed on upgrade to v0.5.0  
✅ Manual scrubbing available via CLI for pre-upgrade cleanup  
✅ Email addresses no longer committed to new Squad repos (v0.4.2+ coordinator doesn't collect them)  
✅ Git history caveat clearly documented

### Negative
❌ Git history still contains emails (requires manual `git-filter-repo`)  
❌ Scrubbing is heuristic — may miss edge cases or over-scrub  
❌ `[email scrubbed]` placeholder is visible (audit trail vs. clean removal trade-off)

### Neutral
⚪ Scrubbing only runs during migration or manual command (not on every `squad upgrade` if already on v0.5.0+)  
⚪ Regex may need tuning if false positives/negatives emerge

## Follow-Up

1. **Monitor for false positives** — if scrubber breaks legitimate content, refine exclusion rules
2. **Consider pre-commit hook** — warn (not block) if PR diffs contain `user.email` references
3. **Track git history scrub adoption** — if users don't clean history, consider stronger warnings or tooling
4. **Document in CONTRIBUTORS.md** — add "Squad never stores your email" privacy statement

## References

- Issue: https://github.com/bradygaster/squad/issues/108
- PR: https://github.com/bradygaster/squad/pull/110
- Related: #102 (email collection removal from squad.agent.md)
- `git-filter-repo`: https://github.com/newren/git-filter-repo
