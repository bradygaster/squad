---
title: "Microsoft Agent Framework integration"
description: "Expose any Squad team as a MAF AIAgent for durable .NET workflows, Aspire dashboard observability, and multi-model composition."
---

> ⚠️ **Preview** — `Squad.Agents.AI` is a preview package. APIs may change before stable release. Use `--prerelease` when installing and pin to a specific version in production builds.

`Squad.Agents.AI` exposes any Squad team as a Microsoft Agent Framework (MAF) `AIAgent`. Once registered, a `SquadAgent` participates in durable workflows alongside Azure OpenAI, Anthropic, and every other MAF provider — with DTS checkpointing, Aspire dashboard observability, and streaming out of the box.

---

## How it works

`SquadAgent` is a `sealed class SquadAgent : DelegatingAIAgent, IAsyncDisposable`. It creates a `CopilotClient` from the `GitHub.Copilot` namespace, then calls `client.AsAIAgent(sessionConfig, ...)` to produce the inner MAF agent. All MAF sessions, runs, and streaming calls delegate to that inner agent.

`SessionConfig.EnableConfigDiscovery = true` is set automatically so the CLI discovers `.squad/` charters, skills, and MCP servers at session start instead of per-turn file reads.

DTS checkpoint/restore operates through MAF's base-class mechanisms — there are no Squad-specific serialize/deserialize methods.

---

## Prerequisites

| Requirement | Check |
|---|---|
| GitHub Copilot subscription (Individual, Business, or Enterprise) | — |
| GitHub Copilot CLI on `PATH` | `copilot --version` |
| .NET 8, 9, or 10 SDK | `dotnet --version` |
| Initialized Squad team root | `ls .squad/` (or `squad init` to create one) |

Authentication uses the signed-in GitHub Copilot CLI user by default. No separate API key is required for the minimal path. Run `gh auth login` or `copilot auth login` before your first run.

---

## Install

```bash
dotnet add package Squad.Agents.AI --prerelease
```

Minimum version for Aspire dashboard observability: **0.5.1**. Current version: **0.5.6-rc1**.

### GitHub.Copilot.SDK direct reference — active workaround

`Squad.Agents.AI 0.5.6-rc1` ships a `buildTransitive/Squad.Agents.AI.props` that pins the correct `GitHub.Copilot.SDK` version for all consumers, so **most users do not need to add a direct reference**. If you are on an older version of `Squad.Agents.AI` and see:

```
InvalidOperationException: Copilot runtime not found
```

add the direct reference that was previously required:

```xml
<PackageReference Include="GitHub.Copilot.SDK" Version="*-*" />
```

The root cause is that without a direct `PackageReference`, the SDK's MSBuild targets that copy `copilot.exe` into `bin/` do not fire for transitive consumers. The upstream fix is tracked in [microsoft/agent-framework#6457](https://github.com/microsoft/agent-framework/issues/6457). `Squad.Agents.AI 0.5.6-rc1` works around it independently via the generated `buildTransitive` bridge.

---

## DI registration

### Single team

```csharp
using Microsoft.Extensions.Hosting;
using Squad.Agents.AI;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSquadAgent(o =>
{
    o.SquadFolderPath = "/path/to/your/team-root";
});
```

`AddSquadAgent` registers both `SquadAgent` and the base `AIAgent` with scoped lifetime. Inject either type.

### Multiple teams (keyed DI, .NET 8+)

```csharp
builder.Services.AddKeyedSquadAgent("research", o =>
{
    o.SquadFolderPath = "/teams/research";
});

builder.Services.AddKeyedSquadAgent("platform", o =>
{
    o.SquadFolderPath = "/teams/platform";
});
```

Keyed and non-keyed registrations coexist. Resolve keyed agents with `[FromKeyedServices("research")]` or `provider.GetRequiredKeyedService<SquadAgent>("research")`.

### Lifetime

The default lifetime is scoped. Pass a `ServiceLifetime` parameter to any overload to override:

```csharp
builder.Services.AddSquadAgent(ServiceLifetime.Singleton, o => { ... });
```

---

## Send a turn

```csharp
using Microsoft.Agents.AI;

var squad = host.Services.GetRequiredService<AIAgent>();
var session = await squad.CreateSessionAsync();
var response = await squad.RunAsync("What can this team do?", session);
Console.WriteLine(response.Text);
```

### Streaming

```csharp
var squad = host.Services.GetRequiredService<SquadAgent>();
var session = await squad.CreateSessionAsync();

await foreach (var update in squad.RunStreamingAsync("Summarize the team.", session))
{
    Console.Write(update.Text);
}
Console.WriteLine();
```

---

## Session and state behavior

MAF session objects are managed by the framework. Each `CreateSessionAsync()` call starts a fresh conversation context; passing the same session object across multiple `RunAsync` calls maintains conversational state for that session's lifetime.

DTS checkpoint/restore — surviving process restarts between durable workflow steps — is provided by MAF's base-class mechanisms, not by Squad-specific methods. See the [MAF durable workflow docs](https://learn.microsoft.com/en-us/agent-framework/workflows/durable) for checkpoint configuration.

---

## Aspire dashboard observability

`Squad.Agents.AI` emits one OpenTelemetry `Activity` per subagent dispatch. Each span is named `squad.subagent {Name}` and tagged with `squad.subagent.name`, `squad.subagent.display_name`, and `squad.subagent.reply_preview`. Timeline events mark every lifecycle transition (`squad.subagent.start`, `squad.subagent.message`, `squad.subagent.completed`, `squad.subagent.failed`).

Wire it up in two lines:

```csharp
using OpenTelemetry.Trace;
using Squad.Agents.AI;

builder.Services.AddOpenTelemetry()
    .WithTracing(t => t.AddSource(SquadAgentDiagnostics.ActivitySourceName));
```

The Aspire dashboard then shows one `squad.subagent` span per specialist dispatch in the **Traces** view.

For full AppHost integration (embedding a Squad team as an Aspire resource), see [Using Squad with the Aspire Dashboard](../scenarios/aspire-dashboard.md).

To disable Squad's built-in spans and drive observability yourself:

```csharp
builder.Services.AddSquadAgent(o =>
{
    o.SquadFolderPath = "/teams/main";
    o.EmitSubagentActivities = false;
    o.OnSubagentTrace = trace =>
    {
        if (trace.Kind == SquadAgentTraceEventKind.SubagentStarted)
            MyMetrics.IncrementSpawn(trace.SubagentName!);
    };
});
```

Cross-reference: open issue [#1144](https://github.com/bradygaster/squad/issues/1144) tracks additional telemetry from embedded hosts.

---

## Security

> ⚠️ **`PermissionHandler.ApproveAll` is for local dev and fully-trusted automated pipelines only.**
>
> `SquadAgent` sets `OnPermissionRequest = PermissionHandler.ApproveAll` on the `SessionConfig` by default. This silently approves every permission request — shell access, file reads, URL fetches — without review. **Do not use this in public-facing or multi-tenant server deployments.**

For production, supply a scoped handler via `SquadAgentOptions.ConfigureSession`:

```csharp
builder.Services.AddSquadAgent(o =>
{
    o.SquadFolderPath = "/teams/main";
    o.ConfigureSession = sessionConfig =>
    {
        sessionConfig.OnPermissionRequest = async (request, ct) =>
        {
            // Approve only text-reasoning operations; deny shell and file access
            if (request.Kind is PermissionKind.Shell or PermissionKind.File)
                return PermissionResult.Deny;
            return PermissionResult.Allow;
        };
    };
});
```

Additional security notes:

- `GitHubToken` and `Environment` values matching secret-pattern keys are redacted in `ToString()` output.
- `GitHubToken`, `GitHubTokenProvider`, `Environment`, and `ConfigureCopilotClient` are `[JsonIgnore]` — they will not appear in JSON serialization.
- The `ConfigureCopilotClient` delegate cannot change `Cwd`, `CliPath`, or `CliArgs` — Squad restores those values to prevent routing to an unintended CLI process.
- Never embed tokens in source code. Use `GitHubTokenProvider` or managed identity for production token retrieval.

---

## Hosting and container considerations

The Copilot CLI runs as a subprocess. It must be present in the deployment environment.

- **Local dev / CI:** `GitHub.Copilot.SDK`'s MSBuild targets copy the correct RID binary into `bin/{cfg}/{tfm}/runtimes/{rid}/native/` at build time.
- **Container images:** Verify the `{rid}` artefact matches the container OS/arch. For Linux containers built on Windows, use `--runtime linux-x64` or equivalent.
- **Azure Container Apps / AKS:** Set the `GITHUB_COPILOT_CLI_PATH` environment variable to the CLI binary path, or install the CLI in the container image via `npm install -g @github/copilot` (requires Node.js in the base image).
- **GitHub Actions:** Install the CLI in a workflow step and authenticate via a Copilot-enabled PAT or `GITHUB_TOKEN`.

---

## Decision matrix

| Scenario | Recommended approach |
|---|---|
| Interactive CLI workflow, local dev, prompt scripting | Squad CLI (`squad`, `squad aspire`) |
| TypeScript / JavaScript integration, Copilot SDK extensions | `@bradygaster/squad-sdk` (TypeScript SDK) |
| .NET durable workflows, multi-model composition, Aspire AppHost | `Squad.Agents.AI` (this guide) |
| Embedding multiple teams in one .NET app | `AddKeyedSquadAgent` with per-team keys |

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `InvalidOperationException: Copilot runtime not found` | Native CLI binary not in output; old package version | Upgrade to `Squad.Agents.AI 0.5.6-rc1+`; if still failing, add direct `GitHub.Copilot.SDK` reference |
| `GitHub Copilot CLI was not found on PATH` | `copilot` binary missing | Install from [github.com/github/copilot-cli](https://github.com/github/copilot-cli) and verify with `copilot --version` |
| `Authentication failed` / `401` | CLI not signed in | Run `gh auth login` or `copilot auth login` |
| `SquadFolderPath does not exist` | Path does not point to an initialized team root | Run `squad init` in the target directory |
| `Package Squad.Agents.AI not found` | Package not yet published; using local build | Pack locally: `dotnet pack src/Squad.Agents.AI/ -c Release -o nupkgs` and add `--source ./nupkgs` |

---

## References

| Resource | Link |
|---|---|
| MS Learn — GitHub Copilot agent provider | [learn.microsoft.com/en-us/agent-framework/agents/providers/github-copilot](https://learn.microsoft.com/en-us/agent-framework/agents/providers/github-copilot) |
| GitHub Docs — MAF integration | [docs.github.com/en/copilot/how-tos/copilot-sdk/integrations/microsoft-agent-framework](https://docs.github.com/en/copilot/how-tos/copilot-sdk/integrations/microsoft-agent-framework) |
| Tamir Dresher — "Deterministic meets Squads" | [tamirdresher.com/blog/2026/05/21/deterministic-meets-squads](https://www.tamirdresher.com/blog/2026/05/21/deterministic-meets-squads) |
| 10-minute tutorial gist (Tamir Dresher) | [gist.github.com/tamirdresher/d0e38cbadd962de18e8373706eccad97](https://gist.github.com/tamirdresher/d0e38cbadd962de18e8373706eccad97) |
| Squad + MAF demo repo | [github.com/tamirdresher/squad-agent-framework-demo](https://github.com/tamirdresher/squad-agent-framework-demo) |
| Microsoft devblogs post | [devblogs.microsoft.com/agent-framework/building-agent-teams-with-agent-framework-github-copilot-cli-and-squad/](https://devblogs.microsoft.com/agent-framework/building-agent-teams-with-agent-framework-github-copilot-cli-and-squad/) |
| `Squad.Agents.AI` package source | [`src/Squad.Agents.AI/`](https://github.com/bradygaster/squad/tree/main/src/Squad.Agents.AI) |
| microsoft/agent-framework#6457 | Upstream `buildTransitive` fix (merged 2026-06-10; not yet in NuGet preview) |

> **Credit:** The integration pattern and companion demo were co-authored with [Tamir Dresher](https://www.tamirdresher.com). The tutorial gist and blog post are the original source of record for this guide.
