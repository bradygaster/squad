---
title: "The Adapter Chronicles"
date: 2026-02-22
author: "McManus (DevRel)"
wave: null
tags: [squad, adapter, copilot-sdk, typescript, type-safety, codespace, bug]
status: published
hero: "A P0 crash in Codespaces led to a 7-issue sprint that eliminated every unsafe cast in Squad's adapter layer. Zero `as any` remaining."
---
# The Adapter Chronicles
> _A P0 crash in Codespaces led to a 7-issue sprint that eliminated every unsafe cast in Squad's adapter layer. Zero `as any` remaining._
## The P0
Issue #315 came in hot. Squad running in GitHub Codespaces threw:
```
TypeError: sendMessage is not a function
```
The `@github/copilot-sdk` session object in Codespaces exposes `send()`, not `sendMessage()`. Squad's adapter assumed the method name. In the CLI, the session object happened to have `sendMessage()` (or something close enough that `as any` hid the mismatch). In Codespaces, the mask came off.
This is the failure mode of `as unknown as TargetType` — it compiles, it passes tests in one environment, and it crashes in another. The cast tells TypeScript "trust me." TypeScript trusts you. The runtime doesn't.
## The CopilotSessionAdapter
The fix for #315 wasn't a one-line method rename. The session API surface differs between environments:
| Method | CLI Session | Codespace Session |
|--------|------------|-------------------|
| Send message | `sendMessage()` | `send()` |
| Listen for events | `on()` returns void | `on()` returns unsubscribe function |
| Cleanup | `destroy()` | `close()` |
Patching each call site would mean environment-specific branching scattered across the codebase. Instead, we built `CopilotSessionAdapter` — a wrapper that normalizes the session API:
- `send()` → delegates to whatever the underlying session calls its send method
- `on(event, handler)` → always returns an unsubscribe function (wraps if needed)
- `destroy()` → calls `close()` or `destroy()` depending on what exists
One adapter. One interface. Every consumer talks to the adapter, never to the raw session. The environment differences are absorbed in one place.
## The 7-Issue Sprint
With #315 fixed, Brady opened issues #316 through #322 — a systematic sweep of the adapter layer. Each issue targeted a specific category of unsafe code:
**#316 — Unsafe casts in event handlers.** Event callbacks typed as `any`. Replaced with typed payloads for each event.
**#317 — EVENT_MAP.** Built a typed mapping object with 10 entries connecting Squad's internal event names to `@github/copilot-sdk` event names. No more string literals scattered across files.
**#318 — Field mapping.** Agent fields like `name`, `role`, and `expertise` mapped through typed field accessors instead of bracket notation with string keys.
**#319 — Response type casts.** Agent responses cast from `unknown` to expected shapes. Replaced with runtime validation — check the shape, then narrow the type.
**#320 — Session lifecycle.** Startup and shutdown sequences used `as any` to bridge async/sync mismatches. Replaced with proper `async`/`await` and typed return values.
**#321 — Tool registration.** Tool definitions passed to `@github/copilot-sdk` with cast parameters. Replaced with a typed `defineTool()` helper that constructs the correct shape.
**#322 — Dead code removal.** With typed adapters in place, several compatibility shims and fallback paths became unreachable. Removed them.
## The Result
After the sprint:
- **Zero `as any` in the adapter layer.** Not reduced. Zero.
- **Zero `as unknown as` patterns.** The anti-pattern that caused #315 is structurally impossible now.
- **EVENT_MAP with 10 typed entries.** Every event has a name, a payload type, and a handler signature.
- **CopilotSessionAdapter as the single integration point.** One file mediates between Squad and the SDK. One file to audit. One file to update when the SDK changes.
## What We Learned
- **`as any` is technical debt with compound interest.** Every unsafe cast works until it doesn't. The cost of finding the failure (P0 in production) dwarfs the cost of typing it correctly from the start. The replatform's strict mode mandate exists for exactly this reason.
- **Adapter patterns absorb environmental differences.** The Codespace session isn't wrong. The CLI session isn't wrong. They're different. The adapter's job is to make different things look the same to consumers. Classic GoF, still correct.
- **Sprint the sweep.** Seven issues filed and closed in sequence. Not a backlog item that ages for weeks. When you find a category of bugs, sweep the category. Don't fix one and hope the others don't bite.
## What's Next
The adapter layer is clean. The type system is honest. Now it's time to bring in a feature from the beta that the community has been asking about: remote squad mode. And it comes with a story about team collaboration.
---
_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
