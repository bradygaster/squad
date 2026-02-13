---
name: "platform-adapter-pattern"
description: "How to design multi-platform integrations with thin adapters and a platform-agnostic gateway"
domain: "architecture"
confidence: "low"
source: "earned"
---

## Context
When building features that must work across multiple platforms (messaging, git hosting, CI), use a thin adapter pattern: platform-specific libraries live only in adapters, the shared gateway/core has zero platform-specific imports. This keeps options open for future platform support without architectural changes.

## Patterns
- **Gateway is platform-agnostic.** The shared core (routing, agent spawning, response formatting) never imports platform-specific libraries. It produces a neutral format (e.g., structured markdown) that adapters transform.
- **Adapters are thin and replaceable.** Each adapter imports exactly one platform SDK (`discord.js`, Bot Framework SDK, `telegraf`, etc.) and handles only: receiving messages, formatting responses in native rendering (embeds, Adaptive Cards, etc.), and sending replies.
- **Platform capabilities vary — design for the intersection.** All platforms support: agent identity (name + emoji), summary text, artifact links, and action buttons/reactions. Render these differently per platform, but the data model is the same.
- **One-way notifications are free.** GitHub Actions webhooks can push events to Discord/Teams without a bot. Use this for Tier 1b (alerts). Full conversation requires a bot (Tier 2+).
- **Evaluate platforms on feel, not just feasibility.** Discord feels like texting your team. Teams feels like checking work comms. The emotional register of the platform affects adoption.

## Examples
- Discord adapter: receives message via `discord.js` event → extracts text + channel (repo) context → passes to gateway → gateway returns structured response → adapter renders as rich embed with agent color sidebar
- Teams adapter: same gateway call → adapter renders as Adaptive Card with action buttons
- Adding a new platform: write ~80-200 LOC adapter, zero gateway changes

## Anti-Patterns
- Importing platform SDKs in the gateway/core layer
- Making prompts platform-specific instead of keeping them neutral and adapting at the rendering layer
- Building a "universal message format" that's actually just one platform's format with translation layers
- Evaluating platforms only on technical feasibility without considering how the UX feels on mobile
