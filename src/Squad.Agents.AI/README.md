# Squad.Agents.AI

> ⚠️ **Preview package.** This NuGet depends on the preview `Microsoft.Agents.AI.GitHub.Copilot` SDK (`1.7.0-preview.*`). Expect breaking changes until Microsoft Agent Framework (MAF) ships a stable release. Use the `0.1.0-preview` package only for evaluation, prototyping, and early-adopter feedback — not for production workloads.

## What is Squad.Agents.AI?

**Squad.Agents.AI** lets you embed the [Squad multi-agent CLI](https://github.com/bradygaster/squad) as a standard Microsoft Agent Framework (`AIAgent`) inside any .NET application. Instead of spawning a subprocess or calling `npx squad-cli` from your code, you get a first-class agent that integrates with dependency injection (DI), structured logging, lifecycle management, and composition — just like any other MAF agent.

**Why use it?** If you've built a Squad team to coordinate multiple agents, you can now consume that team's brainpower directly from your .NET app without shell-out overhead. You get an `AIAgent` you can compose, await, and stream from.

### What is Squad?

Squad is an open-source multi-agent CLI framework that orchestrates autonomous agents via a local `.squad/` directory. For a full introduction, see the [bradygaster/squad repository](https://github.com/bradygaster/squad).

## Prerequisites

- **[.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)** — required to build and run the application
- **GitHub Copilot CLI** — must be on your PATH
  - Install: `npm install -g @github/copilot-cli`
  - Or: follow the [Copilot CLI install docs](https://github.com/github/copilot-cli)
  - Verify: run `copilot --version` in a terminal
- **GitHub Personal Access Token** — for authentication
  - Create a token at https://github.com/settings/tokens
  - Store in environment variable: `GH_TOKEN` or `GITHUB_TOKEN`
  - Scopes needed: at minimum `read:user` and `repo` (if accessing private repos)
- **A Squad team root** — either:
  - An existing `.squad/` directory from a Squad-managed repository, OR
  - Create a new one: run `npx @bradygaster/squad-cli init` in an empty folder
- **[.NET Aspire 9.x+](https://learn.microsoft.com/en-us/dotnet/aspire/get-started/aspire-overview)** *(optional, Aspire path only)*

## Quick start — Hello World console app

1. **Create a console app:**
   ```bash
   dotnet new console -o squad-hello
   cd squad-hello
   dotnet add package Squad.Agents.AI --prerelease
   dotnet add package Microsoft.Extensions.Hosting
   ```

2. **Replace `Program.cs` with:**
   ```csharp
   using Microsoft.Agents.AI;
   using Microsoft.Extensions.DependencyInjection;
   using Microsoft.Extensions.Hosting;
   using Squad.Agents.AI;

   var builder = Host.CreateApplicationBuilder(args);
   builder.Services.AddSquadAgent(opts =>
   {
       opts.SquadFolderPath = @"C:\path\to\your\team-root";   // point to your .squad/ parent
       opts.GitHubToken = Environment.GetEnvironmentVariable("GH_TOKEN");
       opts.Instructions = "You are a helpful assistant.";
   });

   using var host = builder.Build();
   var squad = host.Services.GetRequiredService<AIAgent>();
   var response = await squad.RunAsync("What can you do?");
   Console.WriteLine(response.Text);
   ```

3. **Set your environment variable and run:**
   ```bash
   # Windows
   $env:GH_TOKEN = "ghp_your_token_here"
   dotnet run

   # macOS / Linux
   export GH_TOKEN="ghp_your_token_here"
   dotnet run
   ```

   **Expected output:** A printed response from your Squad team.

## Aspire vs. Standalone — when to use which

| Scenario | Use Aspire | Use Standalone |
|---|---|---|
| Building an Aspire AppHost that orchestrates multiple services | ✅ | |
| Single console or worker app | | ✅ |
| Web API or service that consumes Squad | ✅ (if AppHost-managed) | ✅ (if standalone) |
| Unit tests or test fixtures | | ✅ |

### Aspire path (3 lines + 1 line)

In your **AppHost**:
```csharp
var squad = builder.AddSquad("squad")
    .WithTeamRoot("../my-team-root");
```

In your **consumer service** (Program.cs):
```csharp
builder.Services.AddSquadAgent();  // Aspire auto-injects ConnectionStrings__squad
```

### Standalone path

See **Quick start** above — configure manually with `SquadAgentOptions`.

## Configuration options

All options are members of `SquadAgentOptions`:

| Option | Type | Default | Description | Security Note |
|---|---|---|---|---|
| `SquadFolderPath` | `string?` | `null` | Path to the Squad team root (parent of `.squad/` directory). Required unless using Aspire. | Must be readable by the application |
| `CliPath` | `string?` | `null` | Override the Copilot CLI executable path. If `null`, uses the default system PATH lookup. | If specified, ensure the path is trusted and not user-controllable |
| `CliArgs` | `IList<string>` | empty | Extra CLI arguments to pass to the Copilot/Squad CLI process. Example: `["--yolo"]` for non-interactive mode. | Avoid unsanitized user input |
| `Cwd` | `string?` | `SquadFolderPath` | Working directory for the CLI process. Defaults to `SquadFolderPath`. | |
| `Environment` | `IDictionary<string, string?>` | empty | Environment variables to inject into the CLI process. | Secrets should use `GitHubToken` property, not this dictionary |
| `GitHubToken` | `string?` | from `GH_TOKEN` env var | GitHub Personal Access Token for Copilot CLI authentication. If `null`, honors the `GH_TOKEN` or `GITHUB_TOKEN` environment variable. | **Always load from environment variables or secure vaults; never hardcode.** Minimum scopes: `read:user`, `repo` |
| `TraceEvents` | `bool` | `false` | Enable verbose event tracing via `ILogger`. If `true` in non-Development environments, `AddSquadAgent` logs a warning. | Trace logs may contain sensitive information; disable in production |
| `AgentName` | `string` | `"Squad"` | Display name for the resulting `AIAgent`. Used in logs and agent composition. | |
| `Instructions` | `string?` | `null` | Optional system message / instructions passed as `SessionConfig.SystemMessage`. Useful for injecting custom Squad boundary rules. | |

## Connection string format

If you're using Aspire, the AppHost emits a connection string that `SquadAgent` parses automatically — you don't need to know the format. If you're calling `SquadConnectionFactory.FromConnectionString` directly (standalone or advanced scenarios), understand these two forms:

### PATH form (default)
```
C:\path\to\team-root
/Users/me/team-root
```
Treated as a literal filesystem path to your Squad team root. `Cwd` defaults to the same path.

### URI form (escape hatch)
```
squad://localhost?teamRoot=C:\path\to\team-root&cliPath=C:\custom\copilot&protocol=maf-1.0
```
Used when you need to customize multiple options. Supported query parameters:
- `teamRoot` — path to team root
- `cliPath` — override CLI executable path
- `cwd` — working directory
- `cliArgs` — CLI args (semicolon-separated)
- `env` — environment variables (format: `key1=val1;key2=val2`)
- `protocol` — reserved for future use (AFCP — Agent-to-Agent Communication Protocol)

**Current status:** Both forms are supported; the URI form is reserved for future extensibility.

## Troubleshooting

### `copilot: command not found`
The Copilot CLI is not on your PATH.
- **Fix:** Install with `npm install -g @github/copilot-cli`
- **Or:** Verify installation: `which copilot` (macOS/Linux) or `where copilot` (Windows)
- **Or:** Specify the path explicitly: `opts.CliPath = @"C:\path\to\copilot.exe"`

### `Team root not found at {path}`
The `SquadFolderPath` points to a directory that doesn't exist or isn't accessible.
- **Fix:** Verify the path exists and contains a `.squad/` subdirectory
- **Fix:** If starting fresh, run `npx @bradygaster/squad-cli init` to create a team root
- **Fix:** Check file permissions — the app process must be able to read the path

### `Unauthorized (401)` or `authentication failed`
Your GitHub token is missing, expired, or lacks required scopes.
- **Fix:** Verify `GH_TOKEN` or `GITHUB_TOKEN` is set: `echo $env:GH_TOKEN` (PowerShell) or `echo $GH_TOKEN` (bash)
- **Fix:** Generate a new token at https://github.com/settings/tokens
- **Fix:** Ensure the token has scopes: `read:user`, `repo`
- **Fix:** If using `opts.GitHubToken` directly, verify it's not hardcoded or committed

### `Timeout` or agent hangs indefinitely
The Copilot CLI is waiting for interactive input but your app can't provide it.
- **Fix:** Pass `--yolo` flag to bypass interactivity: `opts.CliArgs.Add("--yolo")`
- **Fix:** Check that `SquadFolderPath` points to a valid, initialized Squad team
- **Fix:** Increase timeout in `AgentRunOptions` if the agent is genuinely busy

### `GitHubCopilot not found` or missing transitive dependency
The NuGet depends on `Microsoft.Agents.AI.GitHub.Copilot 1.7.0-preview.*`, which must be available.
- **Fix:** Ensure your NuGet feed includes the preview package source (usually the default NuGet.org)
- **Fix:** Confirm you've run `dotnet restore`

## FAQ

### Do I need a GitHub Copilot subscription?
Yes. The GitHub Copilot CLI requires an active GitHub Copilot subscription to authenticate and function.

### Can I use this without Aspire?
Yes. See the **Standalone path** section and the **Quick start** console example above. Aspire is optional and meant for multi-service orchestration scenarios.

### Is this production-ready?
No. See the **Preview package** callout at the top. This package depends on preview MAF transitive dependencies. Use only for evaluation, prototyping, and early-adopter feedback.

### How is this different from calling the CLI directly?
Instead of forking a subprocess with `Process.Start("npx squad-cli ...")`, you get:
- Dependency injection and composability
- Structured logging and tracing
- Automatic resource cleanup (via `IAsyncDisposable`)
- First-class MAF agent composition and streaming
- Better error handling and lifecycle management

### Where do I report issues or contribute?
- Issues: [Squad GitHub repository](https://github.com/bradygaster/squad/issues)
- Track A (this NuGet): [PR #3 on tamirdresher/squad](https://github.com/tamirdresher/squad/pull/3)
- Feedback on preview: Please comment on the PR with use cases and pain points

## Status & roadmap

### v0.1.0-preview (current)
- ✅ `SquadAgent` wraps `GitHubCopilotAgent` for DI composition
- ✅ `SquadAgentOptions` configuration
- ✅ Hybrid PATH+URI connection string parsing
- ✅ Aspire integration (via Track B: `CommunityToolkit.Aspire.Hosting.Squad`)

### v0.2 candidates
- Event streaming hooks (structured observability)
- Keyed DI for multi-tenant / multiple Squad teams in one app
- Health checks and readiness probes
- Multi-target `net8;net9;net10` (currently `net10` only)
- AFCP (Agent-to-Agent Communication Protocol) support via URI form

### See also
- [Squad CLI repository](https://github.com/bradygaster/squad)
- [Microsoft Agent Framework (MAF)](https://github.com/microsoft/agents)
- [GitHub Copilot CLI](https://github.com/github/copilot-cli)

---

**License:** MIT — same as Squad CLI and Microsoft Agent Framework.
