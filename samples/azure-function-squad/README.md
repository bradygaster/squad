# Azure Function Squad

Content review squad deployed as an HTTP-triggered Azure Function. A multi-agent review pipeline analyzes submitted content through three specialist agents: tone reviewer, technical reviewer, and copy editor. Results are aggregated into a structured JSON response with per-agent scores and findings.

## Prerequisites

- Node.js >= 20
- npm
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-tools) (for `func start`)
- The SDK must be built first: `cd ../../ && npm run build`

## Quick start

1. Install dependencies: `npm install`
2. Build the TypeScript: `npm run build`
3. Start the Azure Functions runtime: `func start`
4. Send a request:
   ```bash
   curl -X POST http://localhost:7071/api/squad-prompt \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Azure Functions now supports Node.js v20. This is great!"}'
   ```

Or simply run: `npm start` (builds and starts the runtime automatically).

## What you'll learn

- How to use `defineSquad()`, `defineTeam()`, `defineAgent()`, and `defineRouting()` to compose a squad configuration
- How to wire an Azure Function HTTP trigger to a Squad SDK application
- How to aggregate results from multiple specialist agents into a structured response
- How to structure agent definitions with capabilities and model constraints
- How to deploy a Squad application to a serverless platform

## How it works

The sample defines a review squad with three specialist agents using the SDK builder API. When an HTTP POST is received at `/api/squad-prompt` with a `{"prompt": "..."}` body, the Azure Function loads the squad config, instantiates the review agents, and distributes the content for analysis. Each agent reviews the content according to its role: the tone reviewer assesses audience fit and engagement, the technical reviewer checks factual accuracy and code validity, and the copy editor reviews grammar and readability. The function aggregates results and returns a JSON response with per-agent scores, findings, and an overall consensus.

## Expected output

When you send a POST request:

```json
{
  "prompt": "Building multi-agent systems with the Squad SDK is straightforward...",
  "timestamp": "2026-03-06T10:30:00.000Z",
  "reviews": [
    {
      "agent": "tone-reviewer",
      "role": "Tone & Voice Analyst",
      "score": 7,
      "findings": [
        {
          "severity": "info",
          "message": "Code blocks detected. Ensure surrounding prose provides adequate context."
        }
      ],
      "summary": "Tone is neutral. Consider adding variety to maintain reader interest."
    },
    {
      "agent": "technical-reviewer",
      "role": "Technical Accuracy Checker",
      "score": 9,
      "findings": [
        {
          "severity": "info",
          "message": "Code blocks present. Verify snippets compile and match behavior."
        }
      ],
      "summary": "Technical review complete. Code blocks verified."
    },
    {
      "agent": "copy-editor",
      "role": "Copy Editor",
      "score": 8,
      "findings": [
        {
          "severity": "suggestion",
          "message": "Passive voice detected. Consider rewriting in active voice."
        }
      ],
      "summary": "Reviewed 6 sentences. Avg sentence length: 12 words."
    }
  ],
  "overallScore": 8,
  "consensus": "✅ Content is publication-ready with minor suggestions."
}
```

## Key files

| File | Purpose |
|---|---|
| `src/functions/squad-prompt.ts` | Azure Function HTTP trigger — entry point |
| `src/squad/config.ts` | Squad configuration using builder API |
| `src/squad/handlers.ts` | Agent review handlers (mock logic for demo) |
| `host.json` | Azure Functions host configuration |
| `local.settings.json` | Local development settings |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |

## Extending this sample

To make this production-ready:

1. Replace mock handlers with real `SquadClient` calls for live reviews
2. Add `StreamingPipeline` for long-running reviews
3. Wire up `CostTracker` for per-review cost monitoring
4. Add `defineHooks()` for PII scrubbing on submitted content
5. Deploy to Azure with `func azure functionapp publish`

## Building and running

TypeScript must be compiled before the Azure Functions runtime can find the function. `npm start` handles this automatically:

```bash
npm start   # npm run build && func start
```

Or build separately:

```bash
npm run build   # Compile TypeScript to dist/
func start      # Start runtime
```

## Next steps

- See [autonomous-pipeline](../autonomous-pipeline/README.md) for a full showcase of Squad SDK features
- Check the [Squad SDK documentation](../../README.md) for builder API details
- Review Azure Functions [documentation](https://learn.microsoft.com/en-us/azure/azure-functions/) for deployment options
