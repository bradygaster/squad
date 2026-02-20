# Session Log: 2026-02-08 — Release Ritual

**Requested by:** Brady

## Who Worked

- **Kobayashi** — Designed the release checklist
- **Keaton** — Provided product perspective on release gates

## What Was Done

- Kobayashi created `docs/release-checklist.md` — a five-phase release ritual. All steps tagged HUMAN, AUTOMATED, or TEAM. Includes rollback procedures.
- Keaton provided Lead input on release gates: state integrity canary as hard gate, sign-off scaling (Kobayashi+Brady for 0.x, add Keaton for 1.0), blog posts proportional to release type (none for patches, encouraged for minors, required for 1.0).

## Decisions Made

- State integrity canary is a non-negotiable release gate. If it fails, the release does not ship.
- Sign-off: Kobayashi + Brady (0.x), Kobayashi + Keaton + Brady (1.0), revert to Kobayashi + Brady post-1.0 for patches/minors.
- Blog posts: optional for patches, encouraged for minors (48h), required for 1.0 (drafted before release day).
- README freshness: manual check for 0.x, gate for 1.0.

## Key Outcomes

- Release checklist codified at `docs/release-checklist.md`.
- Product-level release gate reasoning documented in decisions inbox for team reference.
