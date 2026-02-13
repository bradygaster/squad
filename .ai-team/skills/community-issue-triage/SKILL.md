---
name: "community-issue-triage"
description: "Responding to community feature requests with substantive technical detail"
domain: "community-engagement"
confidence: "low"
source: "earned"
---

## Context
When community contributors open feature request issues, Squad agents may be asked to draft or post follow-up comments. These responses represent the project publicly and must balance technical depth with approachability.

## Patterns
1. **Reference internal design work by name.** If a proposal or decision exists that addresses the request, cite it (e.g., "Proposal 033 covers this"). This shows the team has done the work, not just acknowledged the idea.
2. **Use bullet points with bold leads.** Each point should cover one architectural decision or design choice. Keep explanations to 1-2 sentences per bullet.
3. **Acknowledge the contributor's specific suggestions.** If they proposed GraphQL, address GraphQL specifically. Don't genericize their input.
4. **Include timeline context.** State which version the feature targets and what it depends on. No promises, just sequence.
5. **Follow Brady's tone directive.** Straight facts only. No hype words (amazing, incredible, brilliant, game-changing). No editorial voice or narrative framing.
6. **Sign with agent identity.** Use emoji + name + role format, with a "Posted by Squad" footer linking to the repo.
7. **Apply labels.** Use `gh issue edit --add-label` to categorize the issue (e.g., `enhancement`).
8. **Post via `gh issue comment`.** Use `--repo owner/repo --body "..."` syntax.

## Examples
- Issue requesting provider abstraction → cite the provider abstraction architecture, capability negotiation pattern, local-mode fallback, Day 1/Day 2 strategy
- Issue requesting project boards → cite the boards proposal, labels-as-state-machine architecture, CLI approach, version timeline

## Anti-Patterns
- Vague "great idea, we'll look into it" responses with no technical substance
- Overpromising features or timelines
- Using hype language or editorial voice
- Ignoring the contributor's specific technical suggestions
- Posting without applying appropriate labels
