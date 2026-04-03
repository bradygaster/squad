---
name: "fact-checking"
description: "Counter-hypothesis testing for claims and deliverables. Use when verifying technical content, checking references, validating API endpoints, fact-checking agent output, or performing quality assurance on deliverables."
license: "MIT"
metadata:
  domain: "quality, verification"
  confidence: "low"
  source: "manual"
  compatibility: "GitHub Copilot CLI, VS Code Copilot Chat"
  triggers: [fact-check, verify, validate, counter-hypothesis, quality-assurance, claim-verification, review]
  roles: [developer, tester, coordinator]
---

# Skill: Fact Checking

## Context
Codifies the challenger agent review output format and methodology so any agent performing fact-checking or review produces consistent, structured output.

## Pattern

### Review Methodology

For every claim or deliverable under review:
1. Ask: "What evidence supports this? What would disprove it?"
2. Generate counter-hypotheses and test them against available data
3. Verify URLs, package names, API endpoints, and external references actually exist
4. Flag confidence levels: ✅ Verified, ⚠️ Unverified, ❌ Contradicted

### Review Output Format

When reviewing another agent's work, use this template:

```
### Fact Check — {deliverable name}
**Claims verified:** {count}
**Issues found:** {count}

| # | Claim | Status | Evidence/Notes |
|---|-------|--------|---------------|
| 1 | {claim} | ✅/⚠️/❌ | {supporting or contradicting evidence} |

**Counter-hypotheses tested:**
- {alternative explanation + result}

**Verdict:** {PASS / PASS WITH NOTES / NEEDS REVISION}
```

### Confidence Levels

- ✅ **Verified** — evidence confirms the claim
- ⚠️ **Unverified** — cannot confirm or deny; suggest verification method
- ❌ **Contradicted** — evidence disproves the claim

### Ceremony Integration

Auto-trigger this skill before any architecture decision, or when an agent claim contains superlatives or percentage thresholds (e.g., "saves 75%", "always", "never"). The coordinator spawns the challenger agent with:

```
Challenger — fact-check {agent}'s claim: "{claim}"
Cite evidence for every verdict. Max 3 investigation cycles.
```