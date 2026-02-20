# Email Privacy Fix — 2026-02-20

**Session:** Email privacy issue fix
**Requested by:** Brady

## Brief

Brady identified that `git config user.email` was being stored in committed files (team.md, history.md). Coordinator fixed squad.agent.md to never read email and scrubbed 9 files of email addresses.

## What Was Done

1. Modified squad.agent.md Init Mode to remove git config user.email collection
2. Added explicit instruction: never store personal email addresses
3. Scrubbed email addresses from:
   - team.md
   - 8 agent history.md files
4. Created issue #108 for v0.5.0 migration email scrub validation

## Key Outcome

PII removed from source. Team memory architecture now excludes email by design.

## Related

- Issue #108: Privacy scrub validation for v0.5.0
- Epic #69: v0.5.0 roadmap
