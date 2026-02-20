---
name: "github-issue-proposals"
description: "Patterns for creating and managing proposals as GitHub Issues instead of markdown files"
domain: "platform-integration"
confidence: "low"
source: "Proposal 032 design, validated by slidemaker reference implementation"
author: "Keaton"
---

## Context
When Squad manages proposals as GitHub Issues rather than markdown files, agents need to follow specific patterns for issue creation, comment signing, approval detection, and work decomposition. This skill documents those patterns for any agent participating in the proposal lifecycle.

## Patterns

### Issue Creation Template
Proposals are created as GitHub Issues by the coordinator using `gh issue create` with labels `squad,proposal,status:draft`. The issue body follows a standard template: Problem, Solution, Trade-offs, Alternatives, Implementation sections. The coordinator — not individual agents — creates the issue.

### Agent Comments Are Signed
Agent analysis is posted as issue comments, not edits to the issue body. Each comment includes a header (`### {emoji} {Name} ({Role})`) and footer (`*Posted by Squad — {Name} ({Role})*`). This distinguishes AI from human comments without requiring bot accounts.

### Two-Channel Pattern
Read operations use MCP tools (structured, parseable). Write operations use `gh` CLI (only option for issues). This matches the pattern documented in Proposal 028a.

### Approval Is Explicit
Approval comes from the repo owner via label change (`status:approved`) or approval comment. Reactions (👍) are not sufficient. The coordinator detects approval and triggers work decomposition.

### Work Items Follow User Story Format
Decomposed work items use the slidemaker-validated format: User Story → Acceptance Criteria (checkboxes) → Notes (Squad member, primary files, dependencies, parent proposal reference). Labels: `squad`, `squad:{agent-name}`.

### Offline Fallback
If `gh` CLI is unavailable, the proposal falls back to a markdown file. No errors, no degradation. The filesystem is always the fallback.

## Anti-Patterns
- **Editing the issue body instead of commenting** — the body is the initial request; all analysis goes in comments to preserve the conversation history
- **Agents creating issues directly** — issue creation is a coordinator responsibility, not an agent action
- **Using reactions for approval** — too ambiguous; use labels or explicit approval comments
- **Bot accounts for agent identity** — too much infrastructure; use signature blocks instead
