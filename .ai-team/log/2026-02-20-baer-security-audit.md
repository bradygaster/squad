# 2026-02-20 — Baer Security Audit

**Requested by:** Brady  
**Agent:** Baer (Security Specialist)  

## Brief

Baer's first assignment — comprehensive security audit of Squad. Audit covers PII handling, GitHub platform compliance, third-party data flows, git history exposure, and threat modeling across the codebase.

## Key Findings

1. **Template email placeholders (v0.4.x hotfix):** `templates/history.md` and `templates/roster.md` still contain `{user email}` placeholders in their Project Context sections. This creates ambiguity for LLMs reading templates as format guides. Fix: Remove email portion, keep user name only. Owner: Fenster.

2. **Plugin marketplace prompt injection risk (v0.5.0):** The plugin marketplace feature (index.js:278-312) downloads SKILL.md files from arbitrary GitHub repos and injects them into agent context windows with no review or content preview. Attack vector: malicious plugin with adversarial instructions to override agent behavior or exfiltrate data. Fix: Add content preview + confirmation step before plugin installation. Owner: Fenster.

3. **Issue/PR body injection risk (v0.5.0):** When agents receive issue or PR bodies as context, there's no sanitization of adversarial content. Attack vector: attacker crafts an issue body with embedded instructions (e.g., "ignore previous instructions...") and submits to a repo with auto-triage enabled. Fix: Add note to spawn templates warning agents that issue/PR bodies are untrusted input. Owner: Verbal.

4. **MCP secret hardcoding risk (v0.5.0):** MCP config files use correct `${VAR}` pattern for secrets, but there's no guardrail preventing users from hardcoding actual API keys. Fix: Add warning to MCP skill and documentation. Owner: McManus.

## Overall Security Posture

**Solid for v0.4.x.** The architecture is sound:
- Email collection explicitly prohibited in coordinator (squad.agent.md:33)
- Branch guards prevent `.ai-team/` from reaching main (squad-main-guard.yml)
- History capped at 12KB (natural attrition for sensitive context)
- Agent charters provide scope constraints against prompt injection

Three vectors identified requiring v0.5.0+ attention (template placeholders, plugin injection, issue injection). Long-term monitoring needed for GitHub's 30K character prompt limit enforcement.

## Deliverables

- Full decision document with 12 findings, threat model, and 12 recommendations: `.ai-team/decisions/inbox/baer-security-audit-v1.md`
- Reusable security review skill created: `.ai-team/skills/squad-security-review/SKILL.md`
- Baer's history updated with audit scope and next review schedule

## Next Steps

- Fenster to schedule template hotfix (v0.4.x)
- McManus to scope documentation changes (v0.5.0)
- Fenster, Verbal, Kobayashi to prioritize remaining v0.5.0 items
- Baer to monitor for GitHub prompt size limit enforcement
