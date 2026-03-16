# CI Tone Lint Gate

> Automated quality checks for PAO community response drafts.

## When This Runs

- Before any draft enters the review table
- As part of PR review when modifying humanizer or external-comms skills
- Weekly tone analytics (manual trigger via `pao analytics`)

## Checks

### Mandatory (blocks draft)

1. **Anti-pattern scan** — Run all `reject_patterns` from `tone-validation.json` against draft
2. **Profanity filter** — Zero tolerance, even in quotes
3. **Minimum substance** — Draft must be >50 characters (no empty acknowledgments)
4. **Thread read verification** — Confirm all comments in thread were read before drafting

### Warning (flags but doesn't block)

1. **Positive pattern check** — Warn if response type should contain patterns from `require_patterns`
2. **Length check** — Warn if draft >500 words (may be too verbose for a GitHub comment)
3. **Emoji count** — Warn if >2 emoji in draft
4. **Similarity check** — Warn if tone similarity to gold standard <80%

### Informational

1. **Response type classification** — Log which template was used
2. **Confidence level** — Log confidence flag and rationale
3. **Thread depth** — Log comment count for analytics

## Output Format

```
✅ PASS: Anti-pattern scan (0 violations)
✅ PASS: Profanity filter (clean)
✅ PASS: Minimum substance (127 chars)
⚠️ WARN: Positive pattern — missing action-oriented close
⚠️ WARN: Similarity to GS-2: 72% (threshold: 80%)
ℹ️ INFO: Response type: troubleshooting | Confidence: 🟡 | Thread: 4 comments
```

## Failure Mode

If ANY mandatory check fails:
1. Draft is NOT added to review table
2. Error message shown to PAO with specific violation
3. PAO must redraft before presenting to reviewer
4. Failure logged to audit trail (action: "lint_failure")
