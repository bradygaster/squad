# Messaging Platform Discussion
**Date:** 2026-02-11
**Requested by:** bradygaster

## Participants
- Keaton (facilitation, architecture)
- Brady (decision authority, preference)
- Kujan (platform feasibility, technical analysis)
- Verbal (experience design, UX)

## What Happened
Brady initiated discussion on messaging platform selection for Squad DM. Initial inclination toward Discord; some users want Teams support. Keaton facilitated technical and UX analysis.

## Key Input
- **Brady:** Prefers Discord over Telegram. Concerned about GitHub lock-in affecting future Azure DevOps and GitLab support.
- **Kujan:** Confirmed platform feasibility. Discord build cost is ~30-70 LOC over Telegram. discord.js is mature. Channel-per-repo is native.
- **Verbal:** Discord delivers superior UX for "text my squad from my phone." Rich embeds with per-agent colors. 2000-char limit enforces summary mode. Dev community already there.

## Decisions Made
1. **Discord is v0.3.0 MVP connector** — Three-tier approach: (1) CCA via GitHub Issues, (1b) Discord webhooks for alerts, (2) Discord conversational bridge via Copilot SDK.
2. **Teams is v0.4.0** — Second connector target for future release.
3. **Gateway must be platform-agnostic** — Zero GitHub-specific imports. Adapter pattern preserves path to ADO/GitLab support. Only adapters are platform-specific.
4. **DM output mode is platform-neutral** — Prompt produces markdown; adapters handle platform-specific rendering (Discord embeds, Teams Adaptive Cards).

## Outcomes
- Messaging platform locked to Discord for v0.3.0
- Architectural pattern established for multi-platform support
- Lock-in risk mitigated via adapter pattern
- Work prioritization updated: Telegram deprioritized, Teams scheduled for v0.4.0
