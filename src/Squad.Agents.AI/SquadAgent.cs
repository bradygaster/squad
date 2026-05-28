using GitHub.Copilot.SDK;
using Microsoft.Agents.AI;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Squad.Agents.AI;

/// <summary>
/// A Squad-flavored <see cref="AIAgent"/> that composes a GitHub Copilot
/// agent configured for Squad multi-agent CLI.
///
/// Value-add over bare MAF GitHubCopilotAgent:
/// <list type="bullet">
///   <item>Squad boundary instructions injected at construction time.</item>
///   <item>Squad-specific configuration (team root, CLI path, env vars).</item>
///   <item>DI-friendly: registered via <see cref="SquadServiceCollectionExtensions.AddSquadAgent"/>.</item>
/// </list>
/// </summary>
public sealed class SquadAgent : AIAgent, IAsyncDisposable
{
    private readonly CopilotClient _copilotClient;
    private readonly AIAgent _inner;
    private readonly ILogger? _logger;
    private readonly bool _ownsClient;
    private readonly SquadAgentOptions _options;

    /// <summary>
    /// Initializes a <see cref="SquadAgent"/> from fully-resolved options.
    /// The <see cref="CopilotClient"/> is created and owned by this instance.
    /// </summary>
    public SquadAgent(SquadAgentOptions options, ILoggerFactory? loggerFactory = null)
        : this(CreateCopilotClient(options, loggerFactory), options, loggerFactory, ownsClient: true)
    {
    }

    /// <summary>
    /// Initializes a <see cref="SquadAgent"/> from IOptions pattern.
    /// </summary>
    public SquadAgent(IOptions<SquadAgentOptions> options, ILoggerFactory? loggerFactory = null)
        : this(options.Value, loggerFactory)
    {
    }

    private SquadAgent(CopilotClient copilotClient, SquadAgentOptions options, ILoggerFactory? loggerFactory, bool ownsClient)
    {
        _copilotClient = copilotClient ?? throw new ArgumentNullException(nameof(copilotClient));
        _logger = loggerFactory?.CreateLogger<SquadAgent>();
        _ownsClient = ownsClient;
        _options = options;

        // Create the inner AIAgent via AsAIAgent extension — NO CAST
        _inner = _copilotClient.AsAIAgent(
            instructions: options.Instructions,
            name: options.AgentName ?? "Squad");

        _logger?.LogInformation("SquadAgent initialized with name '{AgentName}', team root '{TeamRoot}'",
            options.AgentName, options.SquadFolderPath);
    }

    private static CopilotClient CreateCopilotClient(SquadAgentOptions options, ILoggerFactory? loggerFactory)
    {
        var clientOptions = new CopilotClientOptions
        {
            CliPath = options.CliPath,
            Cwd = options.Cwd ?? options.SquadFolderPath,
            GitHubToken = options.GitHubToken
        };

        // Copy CLI args
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

        return new CopilotClient(clientOptions);
    }

    // AIAgent abstract method overrides — delegate to _inner

    public override string? Name => _options.AgentName ?? _inner.Name;
    
    public override string? Description => _inner.Description ?? "Squad multi-agent CLI participant";

    protected override ValueTask<AgentSession> CreateSessionCoreAsync(CancellationToken cancellationToken = default)
    {
        return _inner.CreateSessionAsync(cancellationToken);
    }

    protected override Task<AgentResponse> RunCoreAsync(
        IEnumerable<Microsoft.Extensions.AI.ChatMessage> messages,
        AgentSession? session = null,
        AgentRunOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        return _inner.RunAsync(messages, session, options, cancellationToken);
    }

    protected override IAsyncEnumerable<AgentResponseUpdate> RunCoreStreamingAsync(
        IEnumerable<Microsoft.Extensions.AI.ChatMessage> messages,
        AgentSession? session = null,
        AgentRunOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        return _inner.RunStreamingAsync(messages, session, options, cancellationToken);
    }

    protected override ValueTask<JsonElement> SerializeSessionCoreAsync(
        AgentSession session,
        JsonSerializerOptions? jsonSerializerOptions = null,
        CancellationToken cancellationToken = default)
    {
        return _inner.SerializeSessionAsync(session, jsonSerializerOptions, cancellationToken);
    }

    protected override ValueTask<AgentSession> DeserializeSessionCoreAsync(
        JsonElement sessionState,
        JsonSerializerOptions? jsonSerializerOptions = null,
        CancellationToken cancellationToken = default)
    {
        return _inner.DeserializeSessionAsync(sessionState, jsonSerializerOptions, cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (_ownsClient)
        {
            await _copilotClient.DisposeAsync().ConfigureAwait(false);
        }

        if (_inner is IAsyncDisposable innerDisposable)
        {
            await innerDisposable.DisposeAsync().ConfigureAwait(false);
        }

        _logger?.LogDebug("SquadAgent disposed");
    }
}
