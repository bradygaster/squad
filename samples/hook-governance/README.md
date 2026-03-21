# Hook-governance

Beginner sample for the Squad SDK that demonstrates the four governance hooks, which enforce rules as code rather than as prompt instructions. Hooks run deterministically and can't be bypassed, making them ideal for security and policy enforcement.

## Prerequisites

- Node.js >= 20
- npm
- The SDK must be built first: `cd ../../ && npm run build`

## Quick start

1. Install dependencies: `npm install`
2. Run the sample: `npm start`

## What you'll learn

- How to use file-write guards to block writes outside safe zones (e.g., prevent writes to `/etc/passwd`)
- How PII scrubbing automatically redacts email addresses from tool output
- How reviewer lockout prevents a locked-out agent from editing files after a review rejection
- How rate limiting caps the number of times an agent can prompt the user per session

## How it works

The sample demonstrates four independent hook demos. The first demo creates a hook pipeline with allowed write paths and shows how attempts to write to prohibited paths are blocked. The second demo scrubs personally identifiable information (emails) from tool output strings and nested objects. The third demo simulates a reviewer lockout: once an agent is locked out of a file, attempts to edit that file are denied, but other agents can still access it. The fourth demo implements a per-session rate limiter that allows three user prompts and blocks any additional ones. Each demo shows the allow/block decision and the reason it was made.

## Expected output

```
🛡️  hook-governance — Squad SDK governance hooks sample

────────────────────────────────────────────────────────────
  Demo 1 — File-Write Guards
────────────────────────────────────────────────────────────
  Write to src/utils/helper.ts: allow ✅
  Write to /etc/passwd: block 🚫

────────────────────────────────────────────────────────────
  Demo 2 — PII Scrubbing
────────────────────────────────────────────────────────────
  Before: Deploy fix by brady@example.com — cc: alice@company.io
  After:  Deploy fix by [EMAIL_REDACTED] — cc: [EMAIL_REDACTED]

────────────────────────────────────────────────────────────
  Demo 3 — Reviewer Lockout
────────────────────────────────────────────────────────────
  Backend edits src/auth.ts: block 🚫
  Frontend edits src/auth.ts: allow ✅

────────────────────────────────────────────────────────────
  Demo 4 — Ask-User Rate Limiter
────────────────────────────────────────────────────────────
    Ask #1: allow ✅
    Ask #2: allow ✅
    Ask #3: allow ✅
    Ask #4: block 🚫
```

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Main demo script running all four hook scenarios |
| `tests/hook-governance.test.ts` | Acceptance tests validating each hook behavior |
| `TEST-SCRIPT.md` | Manual test walkthrough |

## Next steps

- Move on to [streaming-chat](../streaming-chat/README.md) to see agents interact in real time
- Read about the [Hook Pipeline API](../../README.md#hooks) in the main documentation
- See [rock-paper-scissors](../rock-paper-scissors/README.md) for advanced multi-agent scenarios
