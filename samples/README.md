# Squad SDK Samples

Learn the Squad SDK by example. Each sample is a complete, working application demonstrating core patterns: agent casting, session management, streaming responses, governance, cost tracking, and real-time collaboration. Start with the beginner samples, then explore intermediate patterns, and finally the advanced showcase.

## Prerequisites

- **Node.js** ≥ 20 and npm
- **GitHub Token** (optional, for live LLM mode): `GITHUB_TOKEN=ghp_...` enables Copilot session samples

## Quick start

1. Clone the repository and navigate to the `hello-squad` sample:
   ```bash
   git clone <repo>
   cd samples/hello-squad
   ```

2. Install dependencies and start:
   ```bash
   npm install
   npm start
   ```

The `hello-squad` sample demonstrates core casting and onboarding mechanics in ~60 lines.

## Samples

| Sample | Difficulty | Description | Key Concepts |
|--------|-----------|-------------|--------------|
| [hello-squad](./hello-squad) | Beginner | Resolve `.squad/`, cast a team, onboard agents, print roster | `resolveSquad()`, `CastingEngine`, `onboardAgent()` |
| [knock-knock](./knock-knock) | Beginner | Two agents stream knock-knock jokes via `StreamingPipeline` | `StreamingPipeline`, `onDelta()`, session streaming |
| [rock-paper-scissors](./rock-paper-scissors) | Intermediate | Tournament: 9 agents with strategies compete; Sherlock learns opponent patterns | Multi-session pooling, strategy prompts, `EventBus`, learning |
| [hook-governance](./hook-governance) | Intermediate | File guards, PII scrubbing, reviewer lockout, rate limiting — all hooks demoed | `HookPipeline`, governance hooks, audit logging |
| [streaming-chat](./streaming-chat) | Intermediate | Interactive chat: user messages routed to agents, responses stream in real time | `SquadClient`, session routing, real-time streaming |
| [cost-aware-router](./cost-aware-router) | Intermediate–Advanced | Budget-aware routing: `CostTracker` monitors spend; router falls back to cheaper tiers | `CostTracker`, `EventBus`, cost monitoring, tier selection |
| [skill-discovery](./skill-discovery) | Intermediate | Agents write, share, and promote `SKILL.md` files; team knowledge base grows | Skills system, confidence levels, knowledge sharing |
| [autonomous-pipeline](./autonomous-pipeline) | Advanced | Full showcase: casting, governance, cost tracking, streaming, monitoring, live dashboard | All core APIs, terminal UI, comprehensive example |
| [azure-function-squad](./azure-function-squad) | Intermediate | Serverless multi-agent review: HTTP endpoint → three specialist agents → JSON report | Azure Functions v4, SDK-First builder, JSON output |

## Recommended learning path

**Beginner (start here):**
1. `hello-squad` — Understand casting and agent onboarding
2. `knock-knock` — See streaming and multi-agent patterns

**Intermediate (expand your skills):**
3. `rock-paper-scissors` — Learn multi-session management and learning
4. `streaming-chat` — Master real-time session routing and user interaction
5. `hook-governance` — Implement security and governance patterns
6. `skill-discovery` — Explore team knowledge sharing
7. `azure-function-squad` — Deploy to serverless; learn SDK-First patterns

**Advanced (integrate everything):**
8. `autonomous-pipeline` — See all patterns in one working showcase

## Running a sample

Each sample is standalone and ready to run. To run any sample:

```bash
cd samples/{sample-name}
npm install
npm start
```

Some samples require `GITHUB_TOKEN` for live LLM modes. Check each sample's README for specific setup instructions.

## Sample architecture

Each sample demonstrates distinct SDK capabilities:

- **Casting & Onboarding** — Define agents, cast them from a universe, onboard with persistent identity
- **Streaming** — Stream token-by-token responses via `StreamingPipeline`
- **Session Management** — Create, resume, pool, and coordinate multiple agent sessions
- **Governance** — Apply file guards, PII scrubbing, access control via hooks
- **Monitoring** — Track costs, events, and health via `CostTracker` and `EventBus`
- **Serverless** — Deploy agents as Azure Functions with SDK-First patterns

## Documentation

See each sample's `README.md` for detailed setup, expected output, and customization tips. The SDK documentation is at the root repository's `docs/` folder.

## Questions?

Open an issue or check the [Squad SDK documentation](../../README.md).

