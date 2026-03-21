# Streaming-chat

Interactive multi-agent streaming chat demonstrating how to route user messages to the right agent, display token-by-token responses, and work with both live Copilot sessions and demo mode for testing.

## Prerequisites

- Node.js >= 20
- npm
- GitHub personal access token with Copilot access (optional; demo mode works without auth)

To set up your token (for live mode):

1. Generate a token at https://github.com/settings/tokens
2. Verify your account has GitHub Copilot enabled
3. Set the token in your environment

## Quick start

1. Install dependencies: `npm install`
2. Choose a mode:
   - **Demo mode** (no auth needed): `npm start` or `SQUAD_DEMO_MODE=true npm start`
   - **Live mode** (requires GITHUB_TOKEN): Set your token, then `npm start`
3. Type a message to chat with the agents

## What you'll learn

- How to cast multiple agents with `CastingEngine` and create a session per agent
- How `SquadClientWithPool` manages concurrent sessions with rate limiting
- How to route messages to agents by keyword matching
- How `StreamingPipeline` captures and displays token-by-token output in real time
- How the `EventBus` emits and subscribes to session lifecycle events
- How demo mode simulates streaming when authentication isn't available

## How it works

The sample creates three agents: McManus (Backend), Kobayashi (Frontend), and Fenster (Tester). Each agent has a set of keywords that route messages to them. When a user types a message, the routing logic checks which keywords are present and selects the matching agent; if no keywords match, the message routes to Backend by default. In live mode, the message is sent to that agent's Copilot session and responses stream token-by-token via the streaming pipeline. In demo mode, pre-written responses are delivered word-by-word with realistic timing. Users can type `/quit` to exit.

## Expected output

```
  ╔═══════════════════════════════════════════════╗
  ║   🎬  Squad Streaming Chat  ·  MVP Summit    ║
  ╚═══════════════════════════════════════════════╝

  Cast:
    ● McManus — Backend (A bold architect, always thinking ahead.)
    ● Kobayashi — Frontend (Sharp-eyed designer with an eye for detail.)
    ● Fenster — Tester (Eccentric tester, spots bugs nobody else can.)

  Running in demo mode — responses are simulated

  ◆ you > How do I set up a REST API?

  McManus (Backend)
  Sure thing. I'd scaffold that with an Express router...

  ◆ you > /quit

  👋 Goodbye!
```

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Main interactive chat application with routing and streaming |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration (ESM, strict) |
| `tests/streaming-chat.test.ts` | Unit tests for routing and streaming |

## Routing keywords

- **Backend (McManus):** api, server, database, backend, endpoint, rest, sql, auth
- **Frontend (Kobayashi):** ui, frontend, component, css, react, style, layout, ux
- **Tester (Fenster):** test, bug, qa, coverage, assert, fixture, mock, spec

Messages without keyword matches default to Backend.

## Next steps

- Check [cost-aware-router](../cost-aware-router/README.md) to learn tier selection and budget tracking
- See [rock-paper-scissors](../rock-paper-scissors/README.md) for advanced multi-agent competition with learning
- Read the [Squad SDK documentation](../../README.md) for more routing and session patterns
