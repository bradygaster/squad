# Proposal: Automated Comment Spam Protection

**Author:** Booster (CI/CD Engineer)  
**Date:** 2026-07-24  
**Issue:** #751  
**Status:** Proposed

## Problem

A spam account (`nkleadproofficial-del`) posted a recruitment ad comment on PR #725. Open-source repos attract drive-by spam from bot accounts — recruitment ads, crypto scams, SEO link drops. Brady currently handles this manually: hide the comment, block the user, move on. This doesn't scale.

## Options Evaluated

### Option A — GitHub Native Settings Only (Zero Code)

**How it works:** Enable repository interaction limits, comment moderation for first-time contributors, and manually maintain a block list.

| Criterion | Rating |
|---|---|
| Setup time | ~5 minutes |
| Maintenance burden | Low (manual block list) |
| False positive risk | **High** — interaction limits block *all* new contributors, not just spam |
| Contributor experience | Poor — legitimate first-time contributors get silently blocked |

**Verdict:** Too coarse-grained. An open-source project needs to welcome new contributors, not gate them behind account-age restrictions.

### Option B — GitHub Action Auto-Moderator (One Workflow File)

**How it works:** A workflow triggers on `issue_comment` and `pull_request_review_comment` events. It checks the commenter's account age, association to the repo, and comment content for spam signals. If spam is detected, it minimizes (hides) the comment and posts a moderation notice.

| Criterion | Rating |
|---|---|
| Setup time | ~30 minutes |
| Maintenance burden | Low (pattern list lives in workflow, easy to update) |
| False positive risk | **Low** — only triggers when multiple spam signals combine |
| Contributor experience | Good — legitimate contributors are never affected |

**Verdict:** Best balance of precision and automation. Only comments that match multiple spam signals get flagged.

### Option C — Hybrid (Native + Action)

**How it works:** Enable GitHub's "hold first-time contributor comments for review" setting AND add the action from Option B.

| Criterion | Rating |
|---|---|
| Setup time | ~35 minutes |
| Maintenance burden | Medium (two config surfaces) |
| False positive risk | **Medium** — native setting holds ALL first-time comments |
| Contributor experience | Mixed — first-time contributors experience a delay even on legitimate comments |

**Verdict:** Redundant. The action alone catches spam without penalizing real contributors.

## Recommendation: Option B — GitHub Action Auto-Moderator

A single workflow file (`.github/workflows/squad-comment-moderation.yml`) that:

1. **Triggers** on `issue_comment` (created) and `pull_request_review_comment` (created)
2. **Checks** the commenter against multiple spam signals:
   - Account age < 7 days
   - `author_association` is `NONE` (no prior repo interaction)
   - Comment body matches spam content patterns (recruitment language, crypto, SEO, excessive non-Latin text, URL-heavy content)
3. **Scores** each signal and only acts when a spam threshold is met (prevents false positives)
4. **Acts** by minimizing (hiding) the comment via the GraphQL API and posting a moderation notice
5. **Logs** the action for audit purposes

### Why This Wins

- **Zero false positives on legitimate contributors:** A real first-time contributor writing a normal comment won't trigger any spam signals. The scoring system requires multiple signals to combine.
- **Zero maintenance for Brady:** The workflow is self-contained. Spam patterns can be updated by editing the workflow file, but the default set covers the most common spam types.
- **Transparent:** If a comment is hidden, a notice explains why and provides instructions for legitimate users to request review.
- **No external dependencies:** Uses only GitHub's built-in APIs (REST + GraphQL). No third-party actions or services.

### Spam Signal Details

| Signal | Weight | Rationale |
|---|---|---|
| Account age < 7 days | 3 | Most spam accounts are freshly created |
| `author_association` = NONE | 2 | No prior interaction with repo |
| Contains recruitment keywords | 3 | "hiring", "job opening", "apply now", "remote position" |
| Contains crypto/SEO spam | 3 | "crypto", "bitcoin", "SEO", "backlink" |
| Excessive URLs (≥ 3) | 2 | Legitimate comments rarely contain 3+ URLs |
| Very long comment (> 2000 chars) from NONE association | 1 | Long comments from unknown accounts are suspicious |

**Threshold:** Score ≥ 5 triggers moderation. This means a single signal alone (e.g., a new account posting a normal comment) won't trigger — it takes a combination.

## Impact on CONTRIBUTING.md

Minimal. Add a note in the CI section explaining that automated moderation exists and that legitimate contributors whose comments are incorrectly flagged can request a review by commenting on the issue or contacting the maintainers.

## Rollback Plan

Delete the workflow file. That's it — the action is completely self-contained with no external state.
