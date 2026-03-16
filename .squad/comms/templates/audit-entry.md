---
timestamp: "{ISO-8601}"
action: "scan|draft|approve|edit|skip|post|halt|resume|delete"
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
