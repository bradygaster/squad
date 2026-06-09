# Squad.Agents.AI

> **Preview package.** `Squad.Agents.AI` is a `0.1.0-preview` NuGet package for early adopters. It targets `net10.0` and depends on preview Microsoft Agent Framework / GitHub Copilot SDK packages, so APIs may change before a stable release.

## What it does

`Squad.Agents.AI` exposes a Squad team as a Microsoft Agent Framework `AIAgent`. `SquadAgent` composes the Squad CLI through the GitHub Copilot SDK, delegates MAF sessions/runs/streaming to the inner Copilot agent, and gives .NET consumers a DI-friendly wrapper instead of hand-rolling CLI process setup.

Public surface in this preview:

- `SquadAgent` — sealed `AIAgent` wrapper over the Copilot-backed inner agent. Supports both non-streaming and streaming via `RunStreamingAsync`.
- `SquadAgentOptions` — team root, CLI path/args, environment, token, logging, instruction settings, and a `ConfigureCopilotClient` delegate for advanced SDK customization.
- `SquadConnectionFactory` — parses PATH or `squad://` connection strings into options.
- `SquadServiceCollectionExtensions` — registers `SquadAgent` and base `AIAgent` in DI, with standard and keyed overloads.

Repository: <https://github.com/bradygaster/squad>

## Install

```bash
dotnet add package Squad.Agents.AI --prerelease
```

If you are consuming the PR before publish, pack it locally and add the generated package source:

```bash
dotnet pack src/Squad.Agents.AI/Squad.Agents.AI.csproj -c Release -o nupkgs
dotnet add package Squad.Agents.AI --prerelease --source ./nupkgs
```

## Prerequisites

- .NET 10 SDK.
- GitHub Copilot CLI available on `PATH` (`copilot --version`).
- Squad CLI and an initialized Squad team root; see the [Squad CLI repo](https://github.com/bradygaster/squad).
- GitHub Copilot authentication through the signed-in user. The quickstart below does not require an app key or environment variable.

## Five-line quickstart

```csharp
using Microsoft.Agents.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Squad.Agents.AI;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSquadAgent(o =>
{
    o.SquadFolderPath = @"C:\path\to\your\team-root";
});

using var host = builder.Build();
var squad = host.Services.GetRequiredService<AIAgent>();
var session = await squad.CreateSessionAsync();
var response = await squad.RunAsync("What can this Squad team do?", session);
Console.WriteLine(response.Text);
```

## Streaming

`SquadAgent` supports streaming via the MAF `RunStreamingAsync` method. The inner Copilot-backed agent streams response updates as they arrive from the CLI process:

```csharp
var squad = host.Services.GetRequiredService<SquadAgent>();
var session = await squad.CreateSessionAsync();

await foreach (var update in squad.RunStreamingAsync("Summarize the team.", session))
{
    Console.Write(update.Text);
}
```

## Keyed DI

Register multiple Squad teams in the same DI container using .NET 8+ keyed services:

```csharp
builder.Services.AddKeyedSquadAgent("research", o =>
{
    o.SquadFolderPath = @"C:\research-team";
});

builder.Services.AddKeyedSquadAgent("platform", o =>
{
    o.SquadFolderPath = @"C:\platform-team";
});

// Resolve in a minimal API endpoint:
app.MapGet("/ask-research", async ([FromKeyedServices("research")] SquadAgent agent) =>
{
    var session = await agent.CreateSessionAsync();
    var response = await agent.RunAsync("What's the latest?", session);
    return response.Text;
});
```

Keyed registrations include `AddKeyedSquadAgent` overloads for service key, optional connection-string name, and lifetime. Keyed and non-keyed registrations can coexist.

## Advanced: ConfigureCopilotClient (BYOK)

Use `ConfigureCopilotClient` to customize the underlying `CopilotClientOptions` after Squad applies its standard values. This is the extension point for injecting custom environment variables, providing a BYOK token, or tuning SDK settings:

```csharp
builder.Services.AddSquadAgent(o =>
{
    o.SquadFolderPath = @"C:\team";
    o.ConfigureCopilotClient = clientOpts =>
    {
        // Inject a BYOK token from your own credential store
        clientOpts.GitHubToken = myVault.GetSecret("copilot-token");

        // Add custom environment variables for the CLI process
        clientOpts.Environment = new Dictionary<string, string>
        {
            ["MY_CUSTOM_VAR"] = "value"
        };
    };
});
```

> **Routing guard:** Squad enforces a hard routing gate — if the delegate changes `Cwd`, `CliPath`, or `CliArgs`, the original values are restored and a warning is logged. Configure these via `SquadAgentOptions` instead.

## GitHub Copilot authentication

The default path mirrors the base GitHub Copilot SDK examples: leave `GitHubToken` and `GitHubTokenProvider` unset, then run with a locally signed-in GitHub Copilot user. For local development, sign in before running the app, for example with `gh auth login`, the Copilot CLI sign-in flow, or a Copilot-supported local sign-in that the SDK runtime can access.

The SDK documents the credential priority order in [Authenticate Copilot SDK](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md) and the broader [authentication overview](https://github.com/github/copilot-sdk/blob/main/docs/auth/index.md). Explicit tokens and environment variables are supported by the SDK, but they are not required for the minimal happy path.

Use `GitHubTokenProvider` only when the host owns token retrieval, such as Key Vault, managed identity, or CI secret flow scenarios. Use `GitHubToken` only when you already have a Copilot-supported token in process and cannot use a provider callback. Use `ConfigureCopilotClient` when you need full control over the SDK's `CopilotClientOptions`, including BYOK token injection.

## Aspire / configuration path

`AddSquadAgent()` reads `ConnectionStrings:squad` through `IConfiguration.GetConnectionString("squad")`. In environment variables, use `ConnectionStrings__squad`.

Named registrations select a named connection string. For example, `AddSquadAgent("research")` reads `ConnectionStrings:squad-research`; in environment variables, use `ConnectionStrings__squad-research`.

Supported connection string forms:

```text
C:\path\to\team-root
squad://localhost?teamRoot=C%3A%5Cteam&cliPath=C%3A%5Ctools%5Ccopilot.exe&cliArgs=--yolo&env=KEY=value
```

Parsed URI query keys: `teamRoot`, `cliPath`, `cwd`, `cliArgs` (semicolon-separated), and `env` (`key=value;key2=value2`). Unknown URI host/protocol values are reserved for future use.

## Key options

| Option | Purpose |
|---|---|
| `SquadFolderPath` | Squad team root; PATH connection strings set this and `Cwd`. |
| `CliPath` / `CliArgs` | Override the Copilot CLI executable and add extra CLI flags. |
| `Cwd` | Working directory for the Copilot CLI process; defaults to `SquadFolderPath`. |
| `Environment` | Additional environment variables for the CLI process. Excluded from JSON serialization; token-pattern keys are redacted in `ToString()`. |
| `GitHubToken` | Advanced direct token escape hatch; excluded from JSON serialization and redacted by `ToString()`. |
| `GitHubTokenProvider` | Advanced callback for secure token retrieval; wins over `GitHubToken`. |
| `ConfigureCopilotClient` | Advanced delegate for customizing `CopilotClientOptions`. Routing properties are guarded; see BYOK section. |
| `TraceEvents` | Enables verbose SDK logging and emits a startup warning when enabled. |
| `AgentName` | Display name for the resulting `AIAgent`; defaults to `Squad`. |
| `Instructions` | Optional system instructions passed to the inner Copilot agent. |

## Security

- **Credential redaction:** `GitHubToken` and `Environment` values whose keys match `*TOKEN*`, `*KEY*`, `*SECRET*`, `*HMAC*`, `*PASSWORD*`, or `*CREDENTIAL*` are always redacted in `ToString()` output.
- **JSON safety:** `GitHubToken`, `GitHubTokenProvider`, `Environment`, and `ConfigureCopilotClient` are marked `[JsonIgnore]` and will not appear in JSON serialization output.
- **Routing guard:** The `ConfigureCopilotClient` delegate cannot change `Cwd`, `CliPath`, or `CliArgs` — changes are silently restored to prevent routing the agent to an unintended CLI process.
- **TraceEvents warning:** Enabling `TraceEvents` logs a startup warning because verbose SDK traces may include sensitive operational details.
- **Avoid hardcoded tokens:** Never embed tokens in source code. Use `GitHubTokenProvider` for production token retrieval from Key Vault, managed identity, or similar secure stores.

## Notes for v0.1-preview

- Default DI lifetime is scoped. An overload accepts any `ServiceLifetime`.
- DI registers both `SquadAgent` and base `AIAgent` (non-keyed). Keyed DI registers both `SquadAgent` and `AIAgent` under the same key.
- Multi-targeting and Aspire telemetry remain candidates for a later preview.
- The package does not validate that `SquadFolderPath` exists; consumers should validate their deployment paths.
- `TraceEvents` can log sensitive operational details. Keep it off unless debugging.

## Package contents

- `lib/net10.0/Squad.Agents.AI.dll`
- `lib/net10.0/Squad.Agents.AI.xml` for IntelliSense / API docs
- `README.md` for NuGet.org rendering
- `.nuspec` metadata with authors, tags, repository, and readme pointer
- `LICENSE` copied from the repository root

## Sample

A runnable console application is included at
`src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/`. It demonstrates the four
core integration patterns in one place: basic DI, keyed DI with multiple agents,
the `ConfigureCopilotClient` BYOK delegate, and streaming via `RunStreamingAsync`.

### Prerequisites

| Prerequisite | Notes |
|---|---|
| [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) | `dotnet --version` should print `10.x.x` |
| GitHub Copilot CLI on `PATH` | Install from [github.com/github/copilot-cli](https://github.com/github/copilot-cli); verify with `copilot --version` |
| Squad CLI installed | Follow the install guide in the [Squad repository README](https://github.com/bradygaster/squad#readme) |
| Initialized Squad team root | Run `squad init` in a directory; this becomes your team root |
| GitHub Copilot authentication | Run `gh auth login` or `copilot auth login` once before running the sample |

Set the team root path before running:

```bash
# Linux / macOS
export SQUAD_TEAM_ROOT=/path/to/your/team-root

# Windows PowerShell
$env:SQUAD_TEAM_ROOT = "C:\path\to\your\team-root"
```

### Run

Run all four flows in sequence:

```bash
dotnet run --project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/
```

Run a single flow (1–4):

```bash
dotnet run --project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/ -- --flow=1
dotnet run --project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/ -- --flow=2
dotnet run --project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/ -- --flow=3
dotnet run --project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/ -- --flow=4
```

### Flow walkthrough

**Flow 1 — Basic DI registration** — `AddSquadAgent` registers `SquadAgent` and the
base `AIAgent` interface. Resolves the agent from DI, creates a session, calls
`RunAsync`, and prints `AgentResponse.Text`.

**Flow 2 — Keyed DI (multiple agents)** — `AddKeyedSquadAgent` registers two agents
under keys `"alpha"` and `"beta"`. Resolution uses
`GetRequiredKeyedService<SquadAgent>("alpha")`.

**Flow 3 — BYOK / `ConfigureCopilotClient` delegate** — the delegate receives
`CopilotClientOptions` after Squad has applied its defaults. Inject a custom token
or environment variable. The routing gate prevents accidental redirection of
`Cwd`, `CliPath`, or `CliArgs` — configure those on `SquadAgentOptions` directly.

**Flow 4 — Streaming** — `RunStreamingAsync` returns
`IAsyncEnumerable<AgentResponseUpdate>`. Each `update.Text` fragment is written to
`Console.Write` without a newline for live token-by-token output.

### Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `GitHub Copilot CLI was not found on PATH` | `copilot` binary is missing or not on `PATH` | Install from [github.com/github/copilot-cli](https://github.com/github/copilot-cli); verify with `copilot --version` |
| `Authentication failed` / `401` | Copilot CLI is not signed in | Run `gh auth login` or `copilot auth login` |
| `SquadFolderPath does not exist` | `SQUAD_TEAM_ROOT` points to a non-existent path | Set `SQUAD_TEAM_ROOT` to an initialized Squad team directory |
| `The system cannot find the file specified` (Win32Exception) | Copilot CLI not found | Same as first row above |
| Build error: `Package Squad.Agents.AI not found` | Sample uses a project reference; ensure you run from the repo root | Run `dotnet build` from the repository root or pass `--project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/` |

## See also

- Root repo: <https://github.com/bradygaster/squad>
- Microsoft Agent Framework: <https://github.com/microsoft/agents>
- GitHub Copilot SDK authentication: <https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md>
- GitHub Copilot CLI: <https://github.com/github/copilot-cli>
- Changelog: <https://github.com/bradygaster/squad/blob/main/CHANGELOG.md>

License: MIT.
