---
title: Error Recovery — Standard Failure Patterns
description: Built-in skill teaching agents to adapt when things fail — retry with backoff, fallback alternatives, diagnose-and-fix, and escalation patterns.
---

# Error Recovery — Standard Failure Patterns

The `error-recovery` skill teaches every squad agent to **adapt** when something fails, not just report the failure. It ships as a built-in skill at `.copilot/skills/error-recovery/SKILL.md` and is available to every spawned agent.

Without this skill, agents tend to encounter a failure (CI test red, API timeout, missing dependency) and stop. With it, they apply standard patterns to diagnose, retry, or escalate the right way.

---

## The five recovery patterns

### 1. Retry with Backoff

**When:** Transient failures — API timeouts, rate limits, network errors, temporary service unavailability.

**Pattern:**
1. Wait briefly, then retry (start at 2s, double each attempt)
2. Maximum 3 retries before escalating
3. Log each attempt with the error received

**Example:** API call returns `429 Too Many Requests` → wait 2s → retry → wait 4s → retry → wait 8s → retry → escalate if still failing.

### 2. Fallback Alternatives

**When:** Primary tool or approach fails and an alternative exists.

**Pattern:**
1. Attempt primary approach
2. On failure, identify alternative tool/method
3. Try the alternative with the same intent
4. Document which alternative was used and why

**Example:** Primary CLI tool fails → fall back to direct API call for the same operation. Or: `gh pr comment` rate-limited → fall back to `gh api -X POST .../issues/{n}/comments`.

### 3. Diagnose-and-Fix

**When:** Build failures, test failures, linting errors — structured errors with actionable output.

**Pattern:**
1. Read the full error output carefully (not just the last line)
2. Identify the root cause from error messages
3. Attempt a targeted fix
4. Re-run to verify the fix
5. If 3 fix attempts fail, escalate with a diagnostic summary

**Example:** TypeScript build fails with `Cannot find module '@x/y'` → check `package.json`, run `npm install`, re-run build.

### 4. Reframe-and-Retry

**When:** The approach itself is wrong (not just the implementation). User feedback like *"that won't work because..."* or *"try a different way"*.

**Pattern:**
1. Stop the current approach immediately
2. Re-read the original task description
3. Identify what assumption was wrong
4. Propose 2 alternative approaches before picking one
5. Get user confirmation if the cost of being wrong again is high

### 5. Escalation

**When:** Three attempts have failed, OR the failure is outside the agent's domain, OR fixing it would violate a team decision.

**Pattern:**
1. Stop attempting fixes
2. Summarize: what was tried, what failed, what's known
3. Surface to coordinator with a clear ask (*"need lead's call on architecture"* vs. *"need human approval"* vs. *"need access to X system"*)
4. Document the escalation in `decisions/inbox/` if it's a recurring pattern

---

## When NOT to apply these patterns

- **Don't retry on user-input errors.** If the user typed `gh repo create my-typo`, don't retry with `my-typoo`. Surface and ask.
- **Don't fall back silently on security-sensitive operations.** If `git push origin main` fails because of branch protection, do NOT fall back to `--force`.
- **Don't escalate without context.** *"It failed"* isn't an escalation; *"three attempts, each with `EACCES`, suggests user lacks write to `.squad/`, recommend chmod or different storage path"* is.

---

## Integration with Reviewer Rejection Protocol

When the failure is a Reviewer rejection (a Reviewer agent rejects an artifact), the [Reviewer Rejection Protocol](/squad/docs/features/reviewer-protocol/) takes precedence. The original author is locked out and a different agent must own the revision. Error-recovery patterns apply within that constraint — the revision agent can use retry/fallback/diagnose patterns freely.

---

## See also

- [Reflect](/squad/docs/features/reflect/) — learning from corrections
- [Reviewer Protocol](/squad/docs/features/reviewer-protocol/) — when a Reviewer rejects work
- [Skills](/squad/docs/features/skills/) — how built-in skills work
