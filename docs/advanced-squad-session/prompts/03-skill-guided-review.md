# Demo Prompt: Skill-Guided Review

## Prompt

```text
Review this PR as Squad. Use the reviewer, architecture, and security review protocols before commenting.
Only surface issues that matter.
```

## Expected tool calls

- Read relevant skill files such as `.copilot/skills/reviewer-protocol/SKILL.md`.
- Read architectural/security review skills when applicable.
- Inspect the diff and affected files.

## Expected output

A high-signal review with material correctness, security, or maintainability findings only. No style-only comments.

## Fallback

Open the skill file and show the reviewer rules directly, then show a prepared review summary that maps each finding back to a skill rule.

