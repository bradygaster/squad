using GitHub.Copilot.SDK;
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

    // State-bag to thread pre-base-ctor state through chain constructors.
    // DelegatingAIAgent requires the inner AIAgent at base() call time, so we
    // build everything via static factory methods before invoking base().
    private readonly record struct SquadAgentState(
        AIAgent Inner,
        CopilotClient CopilotClient,
        ILogger? Logger,
        bool OwnsClient,
        SquadAgentOptions Options);

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
        var inner = client.AsAIAgent(instructions: options.Instructions, name: options.AgentName ?? "Squad");
        return new SquadAgentState(inner, client, lf?.CreateLogger<SquadAgent>(), true, options);
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

        var clientOptions = new CopilotClientOptions
        {
            CliPath = options.CliPath,
            Cwd = options.Cwd ?? options.SquadFolderPath,
            GitHubToken = resolvedToken
        };

        // Preserve CLI args parsed from connection strings or supplied by user code for the SDK's CLI invocation.
        if (options.CliArgs.Count > 0)
        {
            clientOptions.CliArgs = options.CliArgs.ToArray();
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
        if (options.ConfigureCopilotClient is not null)
        {
            // Snapshot routing properties before the delegate runs
            var snapshotCwd = clientOptions.Cwd;
            var snapshotCliPath = clientOptions.CliPath;
            // snapshot is a clone — in-place CliArgs mutation by SDK consumers is also caught
            var cliArgsSnapshot = clientOptions.CliArgs?.ToArray();

            options.ConfigureCopilotClient(clientOptions);

            // Restore routing properties if changed (SC-3: post-delegate warning)
            bool restored = false;
            if (!string.Equals(clientOptions.Cwd, snapshotCwd, StringComparison.Ordinal))
            {
                logger?.LogWarning(
                    "ConfigureCopilotClient delegate changed Cwd from '{Original}' to '{Changed}'; " +
                    "restoring original value to preserve Squad routing.",
                    snapshotCwd, clientOptions.Cwd);
                clientOptions.Cwd = snapshotCwd;
                restored = true;
            }

            if (!string.Equals(clientOptions.CliPath, snapshotCliPath, StringComparison.Ordinal))
            {
                logger?.LogWarning(
                    "ConfigureCopilotClient delegate changed CliPath from '{Original}' to '{Changed}'; " +
                    "restoring original value to preserve Squad routing.",
                    snapshotCliPath, clientOptions.CliPath);
                clientOptions.CliPath = snapshotCliPath;
                restored = true;
            }

            if (!(clientOptions.CliArgs ?? Array.Empty<string>()).SequenceEqual(cliArgsSnapshot ?? Array.Empty<string>()))
            {
                logger?.LogWarning(
                    "ConfigureCopilotClient delegate changed CliArgs; " +
                    "restoring original value to preserve Squad routing.");
                clientOptions.CliArgs = cliArgsSnapshot;
                restored = true;
            }

            if (restored)
            {
                logger?.LogWarning(
                    "One or more routing properties were restored after ConfigureCopilotClient delegate ran. " +
                    "To set Cwd, CliPath, or CliArgs, configure them on SquadAgentOptions instead.");
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

        _logger?.LogDebug("SquadAgent disposed");
    }
}
