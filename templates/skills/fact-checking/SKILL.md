---
name: fact-checking
description: Review scoped claims against available evidence with counter-hypothesis testing. Use when the user requests verification or the coordinator selects a bounded Fact Checker review.
license: MIT
compatibility: Requires access to external references and APIs
metadata:
  author: squad
  version: "1.0.0"
  domain: quality, verification
  confidence: low
  last_validated: "2026-03-01"
---

# Skill: Fact Checking

## Context
Codifies the challenger agent review output format and methodology so any agent performing fact-checking or review produces consistent, structured output.

## Pattern

### Review Methodology

For each claim selected for review:
1. State its exact scope, origin, and the decision it could change.
2. Ask what direct evidence would support or weaken it; check the underlying source, not a search summary alone.
3. Distinguish source existence from claim support, and independent corroboration from repeated or circular sources.
4. Report ✅ Verified, ⚠️ Unverified, ❌ Contradicted, or 🔍 Needs Investigation with evidence and limits.
5. Separate factual status from whether work is authorized or useful; identify only the dependent action affected.

No results, rarity, novelty, missing access, or a failed tool call do not prove a claim false or impossible. If evidence is unavailable, state that the claim remains unknown or unverified. Keep fictional, hypothetical, and supplied private context in scope without investigating private identity or disclosing private details.

### Review Output Format

When reviewing another agent's work, use this template:

```
### Fact Check — {deliverable name}
**Claims reviewed:** {count}
**Issues found:** {count}

| # | Claim | Status | Evidence/Notes |
|---|-------|--------|---------------|
| 1 | {claim} | ✅/⚠️/❌ | {supporting or contradicting evidence} |

**Counter-hypotheses tested:**
- {alternative explanation + result}

**Evidence summary:** {supported / unverified / contradicted / needs investigation, with scope}
**Review status:** {advisory / selected-gate finding}
```

### Confidence Levels

- ✅ **Verified** — evidence confirms the claim
- ⚠️ **Unverified** — cannot confirm or deny; suggest verification method
- ❌ **Contradicted** — evidence disproves the claim

### Activation

Use this skill only when the user explicitly requests verification or Devil's Advocate analysis, or when the coordinator selects Fact Checker as a review gate under active team governance. Superlatives, architecture decisions, and agent confidence are signals to assess—not automatic triggers. The coordinator's ordinary premise screen does not itself spawn a reviewer.

For a selected bounded review, the coordinator supplies:

```
Fact Checker — assess this scoped claim: "{claim}"
Origin, evidence, decision affected, and tool limits: {context}
Report support and counter-evidence; do not infer falsehood from missing evidence.
```