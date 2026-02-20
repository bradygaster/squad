# Baer — Security Audit v1

**Date:** 2026-02-21  
**Agent:** Baer (Security Specialist)  
**Mode:** background  
**Requested by:** Brady  

## Work Summary

Baer completed a full security audit of Squad covering PII handling, GitHub platform compliance, third-party data flows, git history exposure, and threat modeling.

## Files Read

- `squad.agent.md` (coordinator prompt, init mode, prompt injection scope)
- `index.js` (export command, plugin marketplace, browse command)
- `templates/` directory (history.md, roster.md placeholders)
- `.github/workflows/squad-main-guard.yml` (branch protection)
- `.ai-team/` files (decisions, logs, agent histories)
- MCP config patterns and examples

## Files Produced

1. **Decision document:** `.ai-team/decisions/inbox/baer-security-audit-v1.md` (302 lines)
   - 12 detailed findings across 6 areas
   - Threat model with 8 vectors and 4 attack scenarios
   - 12 recommendations (1 v0.4.x hotfix, 7 v0.5.0, 4 v0.6.0+)

2. **Skill created:** `.ai-team/skills/squad-security-review/SKILL.md`
   - Reusable security review protocol for future audits

3. **Agent history updated:** `.ai-team/agents/baer/history.md`
   - Security review scope documented
   - Future audit schedule noted

## Findings (Actionable)

### Severity: CRITICAL (v0.4.x hotfix)
- **Finding 1.1:** Template `{user email}` placeholders in `templates/history.md`, `templates/roster.md`, `.ai-team-templates/history.md` create ambiguity — remove email portion, keep name only. Owner: Fenster.

### Severity: MODERATE (v0.5.0)
- **Finding 2.2:** MCP configs risk hardcoded secrets; add warnings to documentation and MCP skill. Owner: McManus.
- **Finding 3.2:** Plugin marketplace lacks confirmation + content review before installation; implement preview step. Owner: Fenster.
- **Finding 4.1:** Issue/PR body injection risk; add "untrusted input" warning to agent spawn templates. Owner: Verbal.

### Severity: LOW (v0.5.0+)
- Finding 1.2 (name PII in committed files — by design, document)
- Finding 1.3 (export command warning — enhance PII mention)
- Finding 1.4 (history accumulation — handled by migration tool #108)
- Finding 2.1 (GitHub prompt size limit — monitor for enforcement)
- Finding 2.3 (public repo `.ai-team/` visibility — document)
- Finding 3.1 (third-party data flow — add to MCP docs)
- Finding 4.2 (decisions.md unbounded growth — v0.6.0+ archival)

## Outcome

**Security posture:** Solid for v0.4.x. Product is well-designed with appropriate defaults (email prohibition in coordinator, history caps, branch guards). Three actionable vectors identified (template placeholders, plugin injection, issue injection) requiring attention in v0.5.0+.

**Reusable asset:** Security review skill created for team reuse.

**Next:** Fenster to schedule template hotfix. McManus, Fenster, Verbal, Kobayashi to roadmap v0.5.0 items.
