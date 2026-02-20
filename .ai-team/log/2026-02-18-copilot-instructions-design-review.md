# Design Review: `.github/copilot-instructions.md` for Squad Repo

**Date:** 2026-02-18  
**Facilitator:** Keaton (Lead)  
**Participants:** Verbal (Prompt Engineer), Strausz (VS Code Extension Expert), Kujan (Copilot SDK Expert)  
**Context:** Brady noticed inconsistent routing behavior when using Squad in VS Code — sometimes Copilot answers directly instead of routing through the team. Squad repo has no `.github/copilot-instructions.md` despite shipping a template for consumer repos.

---

## Agenda

1. Should we create a `.github/copilot-instructions.md` file for this repo?
2. What should it contain — specifically around routing behavior?
3. Will this help the VS Code experience where users have noticed inconsistencies?
4. If yes, what's the content? If no, why not and what's the alternative?

---

## Key Decisions

### Decision 1: Create `.github/copilot-instructions.md` for the Squad Repo

**Result:** ✅ **YES — unanimous consensus**

**Rationale:**
- **File does not exist** — Squad repo has a template at `templates/copilot-instructions.md` for consumer repos, but the Squad repo itself has no instructions file
- **Different purposes** — Template is for coding agent issue workflow in consumer repos; this file is for contributors working on Squad's source
- **Closes a real gap** — When contributors open Squad repo in VS Code and use Copilot without explicitly selecting the Squad agent, they get zero Squad-specific context
- **Platform standard** — `copilot-instructions.md` is GitHub Copilot's standard mechanism for repo-level instructions, injected into all Copilot interactions automatically

### Decision 2: Scope and Content Strategy

**Result:** Short, surgical, architecture-focused file (~250-300 tokens)

**Content blocks:**
1. **Project identity** (1 line) — "This is the Squad source repo"
2. **Agent routing hint** — Suggest using `@squad` agent for team operations, without claiming enforcement
3. **Architecture pointers** — Key file paths (`.github/agents/squad.agent.md`, `.ai-team/`, `templates/`, `index.js`)
4. **Codebase conventions** — Branch naming (`squad/{issue}-{slug}`), test command, template vs. source distinction
5. **Do NOT duplicate team roster or routing rules** — Reference `.ai-team/team.md` and `.ai-team/routing.md` by path instead

**Keep under 50 lines** to avoid context pollution.

### Decision 3: What This Does AND Does NOT Solve

**Will improve:**
- Copilot has context about Squad's architecture when used without agent selection
- Reduces hallucinated answers about Squad structure
- Nudges users toward `@squad` agent for team operations
- Provides conventions for code edits to this repo

**Will NOT fix:**
- Cannot force routing through Squad agent — that requires explicit user agent selection
- VS Code has no mechanism to auto-select agents based on repo context
- Platform limitation, not a file limitation
- **Brady's routing inconsistency may be a separate issue** — possibly stale agent cache, missing `@squad` invocation, or VS Code extension version issue

**Action:** File separate issue to investigate root cause of routing bypass behavior.

### Decision 4: Critical Risk — Upgrade Logic Collision

**Risk identified by Strausz:**  
`index.js` lines 854-865 copy `templates/copilot-instructions.md` to `.github/copilot-instructions.md` during `squad upgrade`. If someone runs `squad upgrade` in the Squad repo itself, it would overwrite our custom file with the consumer template.

**Mitigation:**  
Add safeguard to `squad upgrade` logic:
- Check if running in Squad source repo (package.json name === "squad")
- Skip `.github/copilot-instructions.md` upgrade step if so
- Log warning: "Skipping copilot-instructions.md (running in Squad source repo)"

**Owner:** Fenster (implementation expert)  
**Timeline:** Before v0.5.0 ships (HIGH priority — data loss risk)

### Decision 5: Content Ownership and Maintenance

**Owner:** Keaton (Lead)  
**Rationale:** This is a `.github/` infrastructure file defining repo-level conventions and architecture. Falls under Lead's domain (architectural decisions, code review standards, repo structure).

**Review process:**
- Content changes require design review if they alter routing guidance or architectural descriptions
- Typo/path corrections do not require review
- Version or staleness markers should be added to detect drift from `squad.agent.md`

---

## Action Items

| Task | Owner | Timeline | Blocker? |
|------|-------|----------|----------|
| **Create `.github/copilot-instructions.md`** — content per synthesis below | Keaton | Before v0.5.0 | No |
| **Add upgrade safeguard** — prevent `squad upgrade` from overwriting this file when run in Squad repo | Fenster | Before v0.5.0 | ⚠️ YES (data loss risk) |
| **File separate issue** — investigate root cause of Brady's routing bypass (agent cache? missing `@squad`? extension version?) | Keaton | This week | No |
| **Document template vs. source distinction** — add comment to both files explaining their different purposes | Keaton | With file creation | No |

---

## Recommended File Content

```markdown
# Copilot Instructions — Squad Source Repository

<!-- This file is for the Squad source repo itself, not the template shipped to users.
     See templates/copilot-instructions.md for the user-facing version. -->

This is the **source repository** for Squad, an AI team framework for GitHub Copilot.

## Using the Squad Agent

This repo has an active Squad agent at `.github/agents/squad.agent.md`. For team operations, roster management, or multi-agent work, select **Squad** from the agent picker in VS Code rather than asking Copilot directly.

- Team roster: `.ai-team/team.md`
- Routing rules: `.ai-team/routing.md`

## Repository Structure

- `index.js` — CLI entry point (`npx create-squad`)
- `.github/agents/squad.agent.md` — The Squad coordinator agent (~1,800 lines)
- `templates/` — Files copied to consumer repos during `create-squad` init
- `.ai-team/` — This repo's own Squad team state (live, not a template)
- `docs/` — Documentation site source
- `test/` — Test suite (`node --test test/*.test.js`)

## Conventions

- **Branch naming:** `squad/{issue-number}-{kebab-case-slug}`
- **Decisions:** Write to `.ai-team/decisions/inbox/`
- **Testing:** Run `npm test` before opening PRs
- **Template vs. source:** Files in `templates/` are copied verbatim by `index.js` to consumer repos. The `.ai-team/` directory here is Squad's own team — don't confuse them.

## Quick Answers

Quick factual questions about file locations, build commands, or public API may be answered directly. Domain questions (architecture, prompt design, VS Code integration) should route through the Squad agent to reach the relevant specialist.
```

---

## Risks & Concerns Raised

### 1. Token Budget (Verbal, Kujan)
- `copilot-instructions.md` is prepended to every Copilot interaction
- Competes for context window space with 108KB `squad.agent.md`
- **Mitigation:** Keep under 50 lines (~300 tokens). Content above is ~250 tokens — safe.

### 2. Instruction Conflict (Verbal)
- If `copilot-instructions.md` routing guidance contradicts `squad.agent.md` routing rules, behavior is non-deterministic
- Example: instructions say "always route" but `squad.agent.md` says "quick facts → answer directly"
- **Mitigation:** Align language. Instructions say "domain questions should route," matching `squad.agent.md` routing rule #3.

### 3. Template vs. Source Confusion (Strausz, Verbal)
- Two files with similar names, different purposes
- Risk of conflating them or accidentally syncing content
- **Mitigation:** Add HTML comment at top of both files explaining distinction.

### 4. Staleness (Strausz, Kujan)
- If `squad.agent.md` structure changes, instructions could mislead
- **Mitigation:** Add version or date marker to detect drift. Reference files by path instead of duplicating content.

### 5. Won't Fully Solve Routing Inconsistency (All)
- Platform limitation: `copilot-instructions.md` cannot force agent selection
- User must explicitly pick Squad agent from picker
- **Mitigation:** Set expectations correctly. File helps but doesn't guarantee routing. Investigate separate root cause.

---

## Disagreements and Resolutions

**None.** All participants agreed on core approach: create the file, keep it small, acknowledge platform limitations, investigate routing bypass separately.

---

## Next Steps

1. Keaton creates `.github/copilot-instructions.md` per content above
2. Keaton files issue: "Investigate routing bypass in VS Code (Copilot answering directly instead of routing to Squad)"
3. Fenster adds upgrade safeguard to prevent file clobber (HIGH priority)
4. Test file with Brady's workflow to confirm improvement

---

**Ceremony complete.**  
**Signed:** Keaton (Lead)
