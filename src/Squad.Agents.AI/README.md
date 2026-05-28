# Squad.Agents.AI

Community NuGet that exposes the Squad multi-agent CLI as a `Microsoft.Agents.AI.AIAgent`, composable into any Microsoft Agent Framework (MAF) app or workflow.

## Quick start — with Aspire (recommended)

In your AppHost (uses `CommunityToolkit.Aspire.Hosting.Squad`):

```csharp
var squad = builder.AddSquad("squad")
    .WithTeamRoot("../my-team");

var api = builder.AddProject<Projects.MyApi>("api")
    .WithReference(squad);
```

In your `MyApi` (Program.cs):

```csharp
builder.Services.AddSquadAgent(); // picks up ConnectionStrings__squad
```

That's it. Aspire injects the connection string; SquadAgent parses it via `SquadConnectionFactory.FromConnectionString` and configures the underlying `CopilotClient`.

## Standalone (advanced — no Aspire)

If you're not using Aspire, configure directly:

```csharp
builder.Services.AddSquadAgent(opts =>
{
    opts.SquadFolderPath = "C:/my-team";
    opts.GitHubToken = Environment.GetEnvironmentVariable("GH_TOKEN");
});
```

## What you get

- **`SquadAgent : AIAgent`** — composes `GitHubCopilotAgent` from `Microsoft.Agents.AI.GitHub.Copilot 1.7.0-preview.*`
- **`SquadAgentOptions`** — DI-friendly options for CLI path, args, cwd, env, token
- **`SquadConnectionFactory.FromConnectionString`** — Hybrid PATH+URI parser
- **`IServiceCollection.AddSquadAgent(...)`** — DI registration

## Wire-format compatibility

Track B (`CommunityToolkit.Aspire.Hosting.Squad`) emits Hybrid connection strings: either a filesystem path (default) or a `squad://...` URI (when extra knobs needed). The URI form is reserved for future AFCP support. Today, both forms are parsed identically and only `teamRoot` / `cliPath` / etc. matter.

## Target framework

`net10.0` only (per Q6 lock — see Squad team `decisions.md` Decision 447). Multi-targeting to `net8;net9;net10` is on the roadmap if adoption demand emerges.

## Usage example

```csharp
using Microsoft.Agents.AI;
using Microsoft.Extensions.DependencyInjection;
using Squad.Agents.AI;

var services = new ServiceCollection();
services.AddSquadAgent(opts =>
{
    opts.SquadFolderPath = @"C:\path\to\your\team-root";
    opts.GitHubToken = Environment.GetEnvironmentVariable("GH_TOKEN");
    opts.Instructions = "You are a helpful Squad assistant.";
});

var provider = services.BuildServiceProvider();
var squad = provider.GetRequiredService<SquadAgent>();

var response = await squad.RunAsync("Hello Squad, what can you do?");
Console.WriteLine(response); // prints the agent's response
```

## Status

Draft preview. Surface may change before 1.0.

## License

MIT — same as Squad CLI and Microsoft Agent Framework.
