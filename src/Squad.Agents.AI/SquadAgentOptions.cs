using System.Text.Json.Serialization;
using GitHub.Copilot;

namespace Squad.Agents.AI;

/// <summary>
/// Configures <see cref="SquadAgent"/> construction, connection-string binding, and Copilot CLI process settings.
/// </summary>
/// <example>
/// <code>
/// var options = new SquadAgentOptions
/// {
///     SquadFolderPath = @"C:\repo",
/// };
/// options.CliArgs.Add("--yolo");
/// </code>
/// </example>
public sealed class SquadAgentOptions
{
    /// <summary>
    /// Gets or sets the initialized Squad team root.
    /// </summary>
    public string? SquadFolderPath { get; set; }

    /// <summary>
    /// Gets or sets an explicit Copilot CLI executable path. When unset, the SDK resolves the default CLI from `PATH`.
    /// </summary>
    public string? CliPath { get; set; }

    /// <summary>
    /// Gets additional CLI arguments appended when the Copilot CLI process is started.
    /// </summary>
    public IList<string> CliArgs { get; } = new List<string>();

    /// <summary>
    /// Gets or sets the CLI process working directory. When unset, <see cref="SquadFolderPath"/> is used.
    /// </summary>
    public string? Cwd { get; set; }

    /// <summary>
    /// Gets additional environment variables injected into the CLI process.
    /// </summary>
    /// <remarks>
    /// <para>
    /// This dictionary is excluded from JSON serialization to prevent credential leakage.
    /// Values for keys matching token/secret patterns are redacted in <see cref="ToString"/>.
    /// </para>
    /// <para>Avoid placing user-controlled values in this dictionary.</para>
    /// </remarks>
    [JsonIgnore]
    public IDictionary<string, string?> Environment { get; } = new Dictionary<string, string?>();

    /// <summary>
    /// Gets or sets a direct GitHub token for advanced host-controlled authentication scenarios.
    /// </summary>
    /// <remarks>
    /// The value is ignored by JSON serialization and redacted by <see cref="ToString"/>, but still lives in the options object.
    /// Prefer leaving this unset for local signed-in user authentication; use <see cref="GitHubTokenProvider"/> for production hosts that retrieve tokens dynamically.
    /// </remarks>
    [JsonIgnore]
    public string? GitHubToken { get; set; }

    /// <summary>
    /// Gets or sets the callback that provides a GitHub token during agent construction.
    /// </summary>
    /// <remarks>
    /// When set, this provider takes precedence over <see cref="GitHubToken"/>.
    /// </remarks>
    [JsonIgnore]
    public Func<CancellationToken, ValueTask<string?>>? GitHubTokenProvider { get; set; }

    /// <summary>
    /// Gets or sets whether verbose Copilot SDK logging is enabled.
    /// </summary>
    /// <remarks>
    /// The DI registration emits a startup warning whenever this is enabled because traces may contain sensitive details.
    /// </remarks>
    public bool TraceEvents { get; set; } = false;

    /// <summary>
    /// Gets or sets the display name for the resulting <see cref="Microsoft.Agents.AI.AIAgent"/>.
    /// </summary>
    public string AgentName { get; set; } = "Squad";

    /// <summary>
    /// Gets or sets optional system instructions passed to the inner Copilot-backed agent.
    /// </summary>
    public string? Instructions { get; set; }

    /// <summary>
    /// Gets or sets a delegate that customizes the underlying <see cref="CopilotClientOptions"/> after Squad
    /// applies its standard values. Use this for advanced scenarios such as injecting custom environment
    /// variables, setting timeouts, or providing a custom logger to the Copilot SDK.
    /// </summary>
    /// <remarks>
    /// <para><b>Security note:</b> Do not override <c>Cwd</c>, <c>CliPath</c>, or <c>CliArgs</c> through this
    /// delegate — Squad enforces routing invariants and will restore its own values if they are changed.
    /// A warning is logged when this occurs.</para>
    /// <para>The delegate has full read/write access to <see cref="CopilotClientOptions"/>, including
    /// <c>GitHubToken</c>. If the delegate replaces the token, the replacement takes effect.
    /// Document this as the final authority on token value.</para>
    /// </remarks>
    /// <example>
    /// <code>
    /// options.ConfigureCopilotClient = clientOpts =>
    /// {
    ///     clientOpts.Environment["MY_CUSTOM_VAR"] = "custom-value";
    /// };
    /// </code>
    /// </example>
    [JsonIgnore]
    public Action<CopilotClientOptions>? ConfigureCopilotClient { get; set; }

    /// <summary>
    /// Gets or sets a delegate that customizes the <see cref="SessionConfig"/> used to
    /// construct the inner <see cref="Microsoft.Agents.AI.AIAgent"/>. The delegate runs
    /// after Squad has applied its defaults (including an <c>ApproveAll</c>
    /// <see cref="SessionConfig.OnPermissionRequest"/> handler and the
    /// <see cref="Instructions"/> as the appended system message), so it can override or
    /// extend any session-scoped setting such as the permission handler, tool list,
    /// model name, or hooks.
    /// </summary>
    /// <remarks>
    /// <para>Use this to inject a stricter permission handler, restrict the available tools,
    /// or pin the model used by the inner Copilot session.</para>
    /// </remarks>
    /// <example>
    /// <code>
    /// options.ConfigureSession = sessionConfig =>
    /// {
    ///     sessionConfig.OnPermissionRequest = MyCustomPermissionHandler;
    ///     sessionConfig.Model = "claude-sonnet-4.6";
    /// };
    /// </code>
    /// </example>
    [JsonIgnore]
    public Action<SessionConfig>? ConfigureSession { get; set; }

    /// <summary>
    /// Gets or sets a callback that receives <see cref="SquadAgentTraceEvent"/> instances for every
    /// notable session event from the underlying Copilot SDK — including subagent dispatch lifecycle
    /// (<c>task</c>-tool spawn / completion), tool calls, and assistant messages from both the root
    /// coordinator AND each spawned subagent.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Setting this callback has two side effects:
    /// </para>
    /// <list type="number">
    /// <item><see cref="GitHub.Copilot.SessionConfigBase.IncludeSubAgentStreamingEvents"/> is forced to
    /// <see langword="true"/> so subagent assistant messages flow up to the parent session (otherwise
    /// the subagent's reply stays inside its own session and never reaches the callback).</item>
    /// <item><see cref="ConfigureSession"/> may still override <see cref="GitHub.Copilot.SessionConfigBase.OnEvent"/>
    /// or <see cref="GitHub.Copilot.SessionConfigBase.IncludeSubAgentStreamingEvents"/>; consumers
    /// that need a stacked event handler should call <c>OnSubagentTrace</c> from inside their
    /// <see cref="ConfigureSession"/> callback to compose the two.</item>
    /// </list>
    /// <para>
    /// OpenTelemetry telemetry is independent — it is controlled by
    /// <see cref="EmitSubagentActivities"/> (default <see langword="true"/>) and emits whether or
    /// not this callback is set. Use <c>OnSubagentTrace</c> when you want to layer extra behaviour
    /// (custom logging, dashboards, audit trails) on top of the built-in spans.
    /// </para>
    /// <para>
    /// Consumer callback exceptions are caught and swallowed so a misbehaving subscriber cannot tear
    /// down the SDK event loop. Add your own try/catch + logging inside the callback if you need to
    /// surface those errors.
    /// </para>
    /// </remarks>
    /// <example>
    /// <code>
    /// options.OnSubagentTrace = trace =>
    /// {
    ///     if (trace.Kind == SquadAgentTraceEventKind.SubagentStarted)
    ///         Console.WriteLine($"[spawn] {trace.SubagentName} (id={trace.SdkAgentId})");
    ///     else if (trace.Kind == SquadAgentTraceEventKind.AssistantMessage && trace.SdkAgentId is not null)
    ///         Console.WriteLine($"[{trace.SdkAgentId}] {trace.Content}");
    /// };
    /// </code>
    /// </example>
    [JsonIgnore]
    public Action<SquadAgentTraceEvent>? OnSubagentTrace { get; set; }

    /// <summary>
    /// Gets or sets whether to emit OpenTelemetry <see cref="System.Diagnostics.Activity"/> spans
    /// and lifecycle events for each subagent dispatch. Defaults to <see langword="true"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// When <see langword="true"/>, an <see cref="System.Diagnostics.ActivitySource"/> named
    /// <see cref="SquadAgentDiagnostics.ActivitySourceName"/> opens one
    /// <see cref="System.Diagnostics.Activity"/> per subagent dispatch (tagged with
    /// <c>squad.subagent.name</c>, <c>squad.subagent.display_name</c>, <c>squad.subagent.sdk_agent_id</c>,
    /// and <c>squad.subagent.reply_preview</c>). Each subagent lifecycle phase
    /// (<c>squad.subagent.start</c>, <c>squad.subagent.message</c>, <c>squad.subagent.completed</c>,
    /// <c>squad.subagent.failed</c>) is also added as a <see cref="System.Diagnostics.ActivityEvent"/>
    /// on the live subagent span so the timeline view in dashboards (e.g. Aspire) shows annotated
    /// timestamps for every state transition.
    /// </para>
    /// <para>
    /// Hosts that <c>.AddSource(SquadAgentDiagnostics.ActivitySourceName)</c> on their OpenTelemetry
    /// tracer get these spans in their backend automatically — no need to set
    /// <see cref="OnSubagentTrace"/>.
    /// </para>
    /// <para>
    /// Set this to <see langword="false"/> to disable Squad's built-in telemetry (e.g. when you
    /// want to handle observability entirely from your own <see cref="OnSubagentTrace"/> callback,
    /// or to avoid double-counting if another layer in your stack is already emitting equivalent
    /// spans).
    /// </para>
    /// </remarks>
    /// <example>
    /// <code>
    /// // Default (recommended): just AddSource and the dashboard lights up.
    /// builder.Services.AddOpenTelemetry()
    ///     .WithTracing(t => t.AddSource(SquadAgentDiagnostics.ActivitySourceName));
    ///
    /// builder.Services.AddSquadAgent(opts => opts.SquadFolderPath = "/team");
    ///
    /// // Opt out (custom telemetry):
    /// builder.Services.AddSquadAgent(opts =>
    /// {
    ///     opts.SquadFolderPath = "/team";
    ///     opts.EmitSubagentActivities = false;
    ///     opts.OnSubagentTrace = trace => MyMetrics.Increment(trace.Kind.ToString());
    /// });
    /// </code>
    /// </example>
    public bool EmitSubagentActivities { get; set; } = true;

    private static readonly string[] TokenPatterns = { "TOKEN", "KEY", "SECRET", "HMAC", "PASSWORD", "CREDENTIAL" };

    private static bool IsTokenKey(string key)
    {
        var upper = key.ToUpperInvariant();
        foreach (var pattern in TokenPatterns)
        {
            if (upper.Contains(pattern))
                return true;
        }
        return false;
    }

    /// <summary>
    /// Returns a diagnostic representation with sensitive values redacted.
    /// </summary>
    /// <remarks>
    /// <para><c>GitHubToken</c> is always shown as <c>[REDACTED]</c>.</para>
    /// <para><c>Environment</c> values whose keys match token/secret patterns
    /// (<c>*TOKEN*</c>, <c>*KEY*</c>, <c>*SECRET*</c>, <c>*HMAC*</c>, <c>*PASSWORD*</c>, <c>*CREDENTIAL*</c>)
    /// are shown as <c>[REDACTED]</c>; other environment entries show their value.</para>
    /// </remarks>
    /// <returns>A string containing non-secret option values.</returns>
    public override string ToString()
    {
        var envDisplay = "{}";
        if (Environment.Count > 0)
        {
            var entries = Environment.Select(kvp =>
                IsTokenKey(kvp.Key)
                    ? $"{kvp.Key}=[REDACTED]"
                    : $"{kvp.Key}={kvp.Value}");
            envDisplay = $"{{ {string.Join(", ", entries)} }}";
        }

        return $"SquadAgentOptions {{ SquadFolderPath = {SquadFolderPath}, AgentName = {AgentName}, " +
               $"GitHubToken = [REDACTED], Environment = {envDisplay}, TraceEvents = {TraceEvents} }}";
    }
}
