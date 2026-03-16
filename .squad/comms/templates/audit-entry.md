---
timestamp: "{ISO-8601}"
action: "scan|draft|approve|edit|skip|post|halt|resume|delete|lint_failure|expire"
item_type: "issue|discussion|pr"
item_number: {number}
item_url: "{url}"
draft_id: "{N from review table}"
reviewer: "{github-username}"
outcome: "approved|edited|skipped|posted|halted|deleted"
---

## Context
- Thread depth: {comment count}
- Response type: {welcome|troubleshooting|feature-guidance|redirect|acknowledgment|closing|technical-uncertainty}
- Confidence: {🟢|🟡|🔴}
- Long thread flag: {true|false}

## Draft Content
{full draft text}

## Reviewer Notes
{any edits or comments from reviewer, or "—" if none}

## Post Result
{link to posted comment if posted, or "not posted" if skipped/halted}

## Conditional Fields

Not all fields apply to every action:

| Action | Required Fields | Optional Fields |
|--------|----------------|-----------------|
| scan | timestamp, action, outcome (item count) | — |
| draft | timestamp, action, item_type, item_number, draft_id, confidence, draft_content | thread_depth |
| approve | timestamp, action, draft_id, reviewer, outcome | reviewer_notes |
| edit | timestamp, action, draft_id, reviewer, outcome, draft_content | reviewer_notes |
| skip | timestamp, action, draft_id, reviewer, outcome | reviewer_notes |
| post | timestamp, action, item_number, draft_id, reviewer, post_result | — |
| halt | timestamp, action, reviewer (halter), outcome | reason |
| resume | timestamp, action, reviewer (resumer), outcome | — |
| delete | timestamp, action, item_number, post_result (deleted URL), outcome | reason |
| lint_failure | timestamp, action, draft_id, outcome (violation details) | — |
| expire | timestamp, action, draft_id, outcome | — |
