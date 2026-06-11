using GitHub.Copilot;
using Microsoft.Agents.AI;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Squad.Agents.AI;

/// <summary>
/// Microsoft Agent Framework agent that delegates to a GitHub Copilot SDK client configured for a Squad team root.
/// Extends <see cref="DelegatingAIAgent"/> — Core* pass-through overrides are provided by the base class.
/// </summary>
/// <remarks>
/// <para>
/// Use <see cref="SquadServiceCollectionExtensions.AddSquadAgent(Microsoft.Extensions.DependencyInjection.IServiceCollection, Action{SquadAgentOptions}?)"/>
/// for DI registration in applications. Direct construction is useful for tests or simple console hosts.
/// </para>
/// <example>
/// <code>
/// var agent = new SquadAgent(@"C:\repo");
/// var response = await agent.RunAsync("Summarize the team.");
/// </code>
/// </example>
/// </remarks>
public sealed class SquadAgent : DelegatingAIAgent, IAsyncDisposable
{
    private readonly CopilotClient _copilotClient;
    private readonly ILogger? _logger;
    private readonly bool _ownsClient;
    private readonly SquadAgentOptions _options;
    private readonly SquadSubagentTraceMapper? _traceMapper;

    // State-bag to thread pre-base-ctor state through chain constructors.
    // DelegatingAIAgent requires the inner AIAgent at base() call time, so we
    // build everything via static factory methods before invoking base().
    private readonly record struct SquadAgentState(
        AIAgent Inner,
        CopilotClient CopilotClient,
        ILogger? Logger,
        bool OwnsClient,
        SquadAgentOptions Options,
        SquadSubagentTraceMapper? TraceMapper);

    /// <summary>
    /// Initializes a new <see cref="SquadAgent"/> with the Squad team root as the primary required parameter.
    /// </summary>
    /// <param name="squadFolderPath">Path to the initialized Squad team root. Required.</param>
    /// <param name="options">
    /// Optional options. When <see langword="null"/> a default <see cref="SquadAgentOptions"/> is used.
    /// <see cref="SquadAgentOptions.SquadFolderPath"/> is overwritten by <paramref name="squadFolderPath"/>
    /// so there is exactly one source of truth for the team root.
    /// </param>
    /// <param name="loggerFactory">Optional logger factory; inject via DI or supply directly.</param>
    public SquadAgent(string squadFolderPath, SquadAgentOptions? options = null, ILoggerFactory? loggerFactory = null)
        : this(BuildState(squadFolderPath, options, loggerFactory))
    {
    }

    /// <summary>
    /// Initializes a new <see cref="SquadAgent"/> from the options pattern (DI-friendly).
    /// </summary>
    /// <param name="options">
    /// Options wrapper. <see cref="SquadAgentOptions.SquadFolderPath"/> must be set via a configure callback
    /// or connection string before the agent is resolved from DI.
    /// </param>
    /// <param name="loggerFactory">Optional logger factory.</param>
    /// <exception cref="ArgumentException">
    /// Thrown when <see cref="SquadAgentOptions.SquadFolderPath"/> is <see langword="null"/> or whitespace.
    /// </exception>
    public SquadAgent(IOptions<SquadAgentOptions> options, ILoggerFactory? loggerFactory = null)
        : this(BuildStateFromOptions(options, loggerFactory))
    {
    }

    private SquadAgent(SquadAgentState state)
        : base(state.Inner)
    {
        _copilotClient = state.CopilotClient;
        _logger = state.Logger;
        _ownsClient = state.OwnsClient;
        _options = state.Options;
        _traceMapper = state.TraceMapper;
        _logger?.LogInformation("SquadAgent initialized with name '{AgentName}', team root '{TeamRoot}'",
            state.Options.AgentName, state.Options.SquadFolderPath);
    }

    private static SquadAgentState BuildState(string squadFolderPath, SquadAgentOptions? options, ILoggerFactory? lf)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(squadFolderPath);
        var resolved = options ?? new SquadAgentOptions();
        resolved.SquadFolderPath = squadFolderPath; // ctor param wins
        return BuildStateInternal(resolved, lf);
    }

    private static SquadAgentState BuildStateFromOptions(IOptions<SquadAgentOptions> options, ILoggerFactory? lf)
    {
        ArgumentNullException.ThrowIfNull(options);
        var opts = options.Value ?? throw new ArgumentException("Options.Value cannot be null.", nameof(options));
        if (string.IsNullOrWhiteSpace(opts.SquadFolderPath))
            throw new ArgumentException(
                "SquadAgentOptions.SquadFolderPath must be set (via configure callback or connection string).",
                nameof(options));
        return BuildStateInternal(opts, lf);
    }

    private static SquadAgentState BuildStateInternal(SquadAgentOptions options, ILoggerFactory? lf)
    {
        var client = CreateCopilotClient(options, lf);

        // Build the SessionConfig. Two non-obvious settings are critical here for the
        // SquadAgent to actually work end-to-end against a `.squad/`-initialised team:
        //
        //   1. ConfigDir + EnableConfigDiscovery = true
        //      Points the Copilot CLI at the .squad/ folder so it auto-discovers the
        //      team's agents, skills, instructions, and MCP servers at session start.
        //      Without these, the agent has to read .squad/team.md (and per-agent
        //      charters) via runtime file tools — every read becomes a permission
        //      request, the agent eventually gives up and reports "permission errors".
        //
        //   2. OnPermissionRequest = PermissionHandler.ApproveAll
        //      Required by the SDK (CreateSessionAsync throws without it). This is the
        //      SDK-protocol layer; the CLI also has its own per-tool gate which we
        //      open with --allow-all in CreateCopilotClient.
        //
        // Callers can override any of this via SquadAgentOptions.ConfigureSession.
        var teamRoot = options.Cwd ?? options.SquadFolderPath;
        var squadConfigDir = !string.IsNullOrEmpty(teamRoot)
            ? Path.Combine(teamRoot, ".squad")
            : null;

        var sessionConfig = new SessionConfig
        {
            OnPermissionRequest = PermissionHandler.ApproveAll,
            WorkingDirectory = teamRoot,
            ConfigDirectory = squadConfigDir,
            EnableConfigDiscovery = true,
        };
        if (!string.IsNullOrEmpty(options.Instructions))
        {
            sessionConfig.SystemMessage = new SystemMessageConfig { Content = options.Instructions };
        }

        // Install the subagent trace mapper when EITHER:
        //   - EmitSubagentActivities is on (default true) — to emit OTel spans + events
        //   - OnSubagentTrace is set — to forward typed events to the consumer
        // The two concerns are independent; the mapper handles whichever combination is active.
        SquadSubagentTraceMapper? traceMapper = null;
        if (options.EmitSubagentActivities || options.OnSubagentTrace is not null)
        {
            traceMapper = new SquadSubagentTraceMapper(
                options.OnSubagentTrace,
                emitActivities: options.EmitSubagentActivities);
            sessionConfig.IncludeSubAgentStreamingEvents = true;
            sessionConfig.OnEvent = traceMapper.OnSessionEvent;
        }

        options.ConfigureSession?.Invoke(sessionConfig);

        var inner = client.AsAIAgent(
            sessionConfig: sessionConfig,
            ownsClient: true,
            id: null,
            name: options.AgentName ?? "Squad",
            description: null);

        return new SquadAgentState(inner, client, lf?.CreateLogger<SquadAgent>(), true, options, traceMapper);
    }

    // ── Extensibility seam ──────────────────────────────────────────────
    // CreateCopilotClient is the single factory method that translates
    // SquadAgentOptions into a live CopilotClient. Three extension points
    // feed into it:
    //   1. GitHubTokenProvider / GitHubToken — credential override.
    //   2. ConfigureCopilotClient — BYOK delegate for advanced SDK tuning.
    //   3. Connection-string binding (handled before this method by the
    //      SquadAgentOptionsConfigurator).
    // Any future credential-store or model-property hooks should integrate
    // through SquadAgentOptions and be applied inside this method.
    // ────────────────────────────────────────────────────────────────────
    private static CopilotClient CreateCopilotClient(SquadAgentOptions options, ILoggerFactory? loggerFactory)
    {
        var logger = loggerFactory?.CreateLogger<SquadAgent>();

        // Resolve token: provider takes precedence over direct property
        string? resolvedToken = null;
        if (options.GitHubTokenProvider is not null)
        {
            // Call provider synchronously (constructor context requires sync)
            resolvedToken = options.GitHubTokenProvider(CancellationToken.None).GetAwaiter().GetResult();
        }
        else
        {
            resolvedToken = options.GitHubToken;
        }

        // ── CLI path resolution ────────────────────────────────────────────
        // When this package is consumed via NuGet, GitHub.Copilot.SDK's build
        // targets download the copilot CLI binary and copy it to bin/.../runtimes/
        // {rid}/native/copilot.exe. The SDK runtime looks there by default, so
        // most consumers don't need to set anything.
        //
        // (Squad.Agents.AI keeps a *direct* PackageReference to GitHub.Copilot.SDK
        // exactly to force those build targets to fire — without it the SDK is only
        // a transitive dependency of Microsoft.Agents.AI.GitHub.Copilot and its
        // build/ targets don't propagate. Once microsoft/agent-framework#6457
        // merges, this dance will no longer be required.)
        //
        // SquadAgentOptions.CliPath / CliArgs remain explicit overrides for advanced
        // scenarios: custom CLI builds, sandboxed runners, air-gapped environments.
        // SDK 1.0.0 expresses both via RuntimeConnection.ForStdio(path, args), so we
        // build a single Connection when either is supplied.
        // ───────────────────────────────────────────────────────────────────
        var clientOptions = new CopilotClientOptions
        {
            WorkingDirectory = options.Cwd ?? options.SquadFolderPath,
            GitHubToken = resolvedToken,
        };

        // ── CLI permission flags ───────────────────────────────────────────
        // The Copilot CLI enforces THREE independent permission gates:
        //   1. Tools   (--allow-all-tools)  — which tool kinds may run
        //   2. Paths   (--allow-all-paths)  — which filesystem paths may be read/written
        //   3. URLs    (--allow-all-urls)   — which URLs may be fetched
        //
        // The SDK-level `OnPermissionRequest` handler only covers the SDK protocol;
        // each CLI gate is a separate verification step. We pass `--allow-all` by
        // default so the SquadAgent can actually drive tool calls end-to-end against
        // the entire Squad workspace. Hosts that want stricter behavior can replace
        // this via SquadAgentOptions.CliArgs / the ConfigureCopilotClient delegate.
        // ───────────────────────────────────────────────────────────────────
        // Skip our `--allow-all` default if the host already opted in via any of the
        // CLI's permission-opening flags (or the omnibus `--yolo` alias). Comparison is
        // case-insensitive because `copilot --help` documents the flags in lowercase but
        // CLI argument parsers on Windows are commonly forgiving of case differences.
        var combinedCliArgs = new List<string>();
        bool hostAlreadyOpenedPermissions = options.CliArgs.Any(a =>
            string.Equals(a, "--allow-all", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--allow-all-tools", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--allow-all-paths", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--allow-all-urls", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--yolo", StringComparison.OrdinalIgnoreCase));
        if (!hostAlreadyOpenedPermissions)
        {
            combinedCliArgs.Add("--allow-all");
        }

        // ── Default coordinator agent selection ────────────────────────────
        // SquadAgent wraps a Squad coordinator team. The CLI's `--agent squad`
        // flag is what teaches the coordinator to eager-execute, fan out, and
        // dispatch via the task tool by loading `.github/agents/squad.agent.md`
        // as the agent definition. Without it the CLI uses its built-in generic
        // agent and the coordinator role-plays responses inline instead of
        // spawning real subagents — producing SDK behaviour that does NOT match
        // running `copilot --agent squad` interactively against the same team
        // root.
        //
        // Note on SessionConfig.Agent: that SDK property exists but selects
        // from the SDK's CustomAgents registry, NOT from `.github/agents/*.agent.md`
        // files (verified at v1.0.0 — setting it without populating CustomAgents
        // produces `Custom agent 'squad' not found`). The CLI `--agent` flag is
        // currently the only path that reads the on-disk agent definition.
        //
        // We auto-add `--agent {AgentFileName}` (default "squad") unless:
        //   1. The host already supplied --agent explicitly in CliArgs
        //   2. AgentFileName is null or whitespace (explicit opt-out)
        //   3. The agent file does not exist at the conventional path on disk
        //      (graceful degradation for folders that are not yet Squad-initialized,
        //      where the CLI would error on `--agent squad`)
        // ───────────────────────────────────────────────────────────────────
        bool hostSuppliedAgent = options.CliArgs.Any(a =>
            string.Equals(a, "--agent", StringComparison.OrdinalIgnoreCase));
        if (!hostSuppliedAgent && !string.IsNullOrWhiteSpace(options.AgentFileName))
        {
            var defaultAgentTeamRoot = options.Cwd ?? options.SquadFolderPath;
            if (!string.IsNullOrWhiteSpace(defaultAgentTeamRoot))
            {
                var agentFilePath = Path.Combine(defaultAgentTeamRoot, ".github", "agents", $"{options.AgentFileName}.agent.md");
                if (File.Exists(agentFilePath))
                {
                    combinedCliArgs.Add("--agent");
                    combinedCliArgs.Add(options.AgentFileName);
                }
                else
                {
                    logger?.LogDebug(
                        "SquadAgentOptions.AgentFileName is '{AgentFileName}' but the file was not found at '{AgentFilePath}'. Skipping --agent argument; the CLI will fall back to its default agent.",
                        options.AgentFileName, agentFilePath);
                }
            }
        }

        combinedCliArgs.AddRange(options.CliArgs);

        // Only override the SDK's default child-process connection when the consumer
        // supplied a custom CLI path or any extra CLI args. Otherwise let the SDK
        // resolve its own bundled binary (downloaded via the build/ targets).
        if (!string.IsNullOrEmpty(options.CliPath) || combinedCliArgs.Count > 0)
        {
            clientOptions.Connection = RuntimeConnection.ForStdio(options.CliPath, combinedCliArgs);
        }

        // Copy environment variables
        if (options.Environment.Count > 0)
        {
            var envDict = new Dictionary<string, string>();
            foreach (var kvp in options.Environment)
            {
                if (kvp.Value != null)
                    envDict[kvp.Key] = kvp.Value;
            }
            clientOptions.Environment = envDict;
        }

        // Set logger if trace events enabled
        if (options.TraceEvents && loggerFactory != null)
        {
            clientOptions.Logger = loggerFactory.CreateLogger<CopilotClient>();
        }

        // ── BYOK / ConfigureCopilotClient delegate ─────────────────────
        // Allow consumers to customize the CopilotClientOptions after Squad
        // applies its standard values. After the delegate runs, snapshot and
        // restore routing-critical properties to prevent accidental or
        // malicious changes that would route the agent to a different CLI
        // process. (Picard Condition 1: hard routing gate.)
        //
        // SDK 1.0.0 collapsed CliPath/CliArgs into Connection (RuntimeConnection),
        // so the routing gate now snapshots WorkingDirectory and Connection.
        if (options.ConfigureCopilotClient is not null)
        {
            var snapshotWorkingDirectory = clientOptions.WorkingDirectory;
            var snapshotConnection = clientOptions.Connection;

            options.ConfigureCopilotClient(clientOptions);

            bool restored = false;
            if (!string.Equals(clientOptions.WorkingDirectory, snapshotWorkingDirectory, StringComparison.Ordinal))
            {
                logger?.LogWarning(
                    "ConfigureCopilotClient delegate changed WorkingDirectory from '{Original}' to '{Changed}'; " +
                    "restoring original value to preserve Squad routing.",
                    snapshotWorkingDirectory, clientOptions.WorkingDirectory);
                clientOptions.WorkingDirectory = snapshotWorkingDirectory;
                restored = true;
            }

            if (!ReferenceEquals(clientOptions.Connection, snapshotConnection))
            {
                logger?.LogWarning(
                    "ConfigureCopilotClient delegate replaced Connection; " +
                    "restoring original value to preserve Squad routing. " +
                    "Configure CLI path / args via SquadAgentOptions.CliPath / CliArgs instead.");
                clientOptions.Connection = snapshotConnection;
                restored = true;
            }

            if (restored)
            {
                logger?.LogWarning(
                    "One or more routing properties were restored after ConfigureCopilotClient delegate ran. " +
                    "To set the team root, CLI path, or CLI args, configure them on SquadAgentOptions instead.");
            }
        }

        return new CopilotClient(clientOptions);
    }

    /// <summary>
    /// Gets the display name exposed by this agent.
    /// Prefers <see cref="SquadAgentOptions.AgentName"/> over the inner agent's name.
    /// </summary>
    public override string? Name => _options.AgentName ?? base.Name;

    /// <summary>
    /// Gets the agent description, falling back to a Squad-specific default when the inner agent provides none.
    /// </summary>
    public override string? Description => base.Description ?? "Squad multi-agent CLI participant";

    /// <summary>
    /// Disposes the owned Copilot client and disposable inner agent resources.
    /// </summary>
    /// <returns>A value task that completes when disposal finishes.</returns>
    public async ValueTask DisposeAsync()
    {
        if (_ownsClient)
            await _copilotClient.DisposeAsync().ConfigureAwait(false);

        if (InnerAgent is IAsyncDisposable innerDisposable)
            await innerDisposable.DisposeAsync().ConfigureAwait(false);

        // Drain any subagent activities that never received a matching SubagentCompletedEvent
        // (e.g. session ended mid-dispatch). Failing to do so leaks Activity instances.
        _traceMapper?.Dispose();

        _logger?.LogDebug("SquadAgent disposed");
    }
}
