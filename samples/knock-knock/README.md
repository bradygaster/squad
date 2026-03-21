# Knock-Knock

Two Copilot sessions trade knock-knock jokes forever, generating unique content via live LLM responses. This intermediate sample demonstrates how agents interact with real GitHub Copilot sessions, stream responses token-by-token, and sustain multi-turn conversations.

## Prerequisites

- Node.js >= 20
- npm
- GitHub personal access token with Copilot access (GITHUB_TOKEN)

To set up your token:

1. Generate a token at https://github.com/settings/tokens
2. Verify your account has GitHub Copilot enabled
3. Set the token in your environment:
   ```bash
   export GITHUB_TOKEN=ghp_...          # macOS/Linux
   $env:GITHUB_TOKEN = "ghp_..."       # PowerShell
   ```

## Quick start

1. Set your GitHub token (see Prerequisites)
2. Install dependencies: `npm install`
3. Run the sample: `npm start`

Watch the agents trade knock-knock jokes with LLM-generated responses.

## What you'll learn

- How to connect to GitHub Copilot using `SquadClientWithPool`
- How to cast multiple agents and assign each a system prompt personality
- How to create concurrent Copilot sessions with `createSession()`
- How to capture streaming responses via the `StreamingPipeline` and `message_delta` events
- How agents maintain multi-turn conversation state for realistic interaction

## How it works

The sample creates two agents from The Usual Suspects universe. Each agent gets its own Copilot session with a distinct system prompt: one is the teller (comedian), the other is the responder (audience). The main loop executes a full five-turn knock-knock joke exchange: the teller opens with "Knock knock!", the responder answers "Who's there?", the teller provides the setup, the responder asks for the punchline, and the teller delivers the final joke. After each turn, the agents swap roles and the loop repeats. Real LLM responses stream token-by-token, making every joke unique.

## Expected output

```
🎭 Knock-Knock Comedy Hour (Live LLM Edition)

   McManus (Teller) vs. Fenster (Responder)

   Connecting to Copilot...

   ✓ Connected. Let the jokes begin!

🎭 McManus: Knock knock!
🎭 Fenster: Who's there?
🎭 McManus: TypeScript.
🎭 Fenster: TypeScript who?
🎭 McManus: TypeScript checking your jokes for type safety! 🔍

...
```

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Main interactive loop with agent role swapping |
| `package.json` | Dependencies (squad-sdk, copilot-sdk) |
| `tsconfig.json` | TypeScript configuration (ESM, strict) |

## Next steps

- See [hook-governance](../hook-governance/README.md) to learn how to enforce rules with SDK hooks
- Check [rock-paper-scissors](../rock-paper-scissors/README.md) for a more complex multi-agent system with strategy and learning
- Read the [Squad SDK documentation](../../README.md) for session management patterns
