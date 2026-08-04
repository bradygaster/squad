---
name: Squad Backlog Triage
description: Uses Squad (bradygaster/squad) multi-agent review to triage this repo's open issues and file a single prioritized triage report
# Manual-trigger only so it can never surprise a maintainer. To run it on a cadence,
# uncomment the `schedule:` block below (weekly, Mondays 14:00 UTC shown as an example).
on:
  workflow_dispatch:
  # schedule:
  #   - cron: "0 14 * * 1"
permissions:
  contents: read
  issues: read
  pull-requests: read
  copilot-requests: write
network:
  allowed:
    - defaults
imports:
  - shared/squad.md
tools:
  bash: true
  github:
    mode: gh-proxy
    toolsets: [default]
safe-outputs:
  create-issue:
    title-prefix: "[squad:triage] "
    labels: [squad:triage]
    max: 1
    expires: 7
    close-older-issues: true
    close-older-key: squad-backlog-triage
---

# Squad Backlog Triage

Use the Squad (https://github.com/bradygaster/squad) team already initialized
during activation to triage this repository's open issues and produce a single,
prioritized triage report.

## Task

1. Confirm Squad is initialized: `.squad/team.md` should exist. If it does not,
   the activation bootstrap failed — call `noop` with a short explanation
   instead of proceeding.
2. Read the repository's open issues (use the GitHub tools). Focus on issues
   that are unlabeled, stale, or missing a clear owner.
3. Work with the Squad team to triage the backlog. For each notable issue,
   recommend:
   - a priority (P0 / P1 / P2),
   - the most appropriate routing (see `.squad/routing.md` for who owns what),
     and
   - the single next action that would unblock it.
4. File **one** tracking issue titled with today's date (for example
   `Backlog triage — 2026-08-03`) summarizing the triage. In the body:
   - group recommendations by priority,
   - link each source issue by number, and
   - name the Squad team member best suited to each item.
   Do not modify, comment on, or relabel the source issues — this workflow only
   has read access to them and files a single advisory report.

## Notes

- This report auto-closes after 7 days; `close-older-issues` retires the
  previous report so the tracker only ever shows the latest triage.
- Squad runs here with the `local` state backend and no MCP state bridge, and
  nothing persists between runs. Base every recommendation on what you can read
  in this run (open issues, PRs, and the committed `.squad/` files) — do not
  assume memory of a prior triage.
- If the team cannot produce a useful triage (for example the CLI bootstrap
  failed or there are no actionable issues), call `noop` with a short
  explanation rather than filing an empty report.
