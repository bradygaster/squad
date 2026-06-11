using System.Diagnostics;

namespace Squad.Agents.AI;

/// <summary>
/// Diagnostic constants for Squad.Agents.AI. Consumers wiring OpenTelemetry should
/// add <see cref="ActivitySourceName"/> to their tracer provider to surface subagent
/// dispatch spans (one span per <c>task</c>-tool invocation) in their backend.
/// </summary>
/// <example>
/// <code>
/// builder.Services.AddOpenTelemetry()
///     .WithTracing(t => t.AddSource(SquadAgentDiagnostics.ActivitySourceName));
/// </code>
/// </example>
public static class SquadAgentDiagnostics
{
    /// <summary>
    /// Name of the <see cref="System.Diagnostics.ActivitySource"/> Squad.Agents.AI emits spans on.
    /// </summary>
    public const string ActivitySourceName = "Microsoft.Agents.AI.Squad";

    /// <summary>
    /// Singleton <see cref="System.Diagnostics.ActivitySource"/> used internally to emit subagent
    /// dispatch spans. Consumers normally do not interact with this directly; subscribe via
    /// <c>AddSource(SquadAgentDiagnostics.ActivitySourceName)</c> on their OpenTelemetry tracer.
    /// </summary>
    public static readonly ActivitySource ActivitySource = new(ActivitySourceName);
}

/// <summary>
/// Categorises the underlying <c>GitHub.Copilot.SessionEvent</c> for consumers who want a typed view
/// without depending directly on the SDK's polymorphic event hierarchy.
/// </summary>
public enum SquadAgentTraceEventKind
{
    /// <summary>An event that does not match any of the well-known categories below.</summary>
    Other = 0,

    /// <summary>The coordinator selected a custom agent to dispatch to (precedes <see cref="SubagentStarted"/>).</summary>
    SubagentSelected,

    /// <summary>A subagent process started (the coordinator's <c>task</c> tool spawned it).</summary>
    SubagentStarted,

    /// <summary>A subagent finished and returned its result back to the coordinator.</summary>
    SubagentCompleted,

    /// <summary>A subagent terminated abnormally.</summary>
    SubagentFailed,

    /// <summary>An assistant turn completed (from the coordinator OR a subagent — see <see cref="SquadAgentTraceEvent.SdkAgentId"/>).</summary>
    AssistantMessage,

    /// <summary>A tool started executing (the <c>task</c> tool is what spawns subagents).</summary>
    ToolStart,

    /// <summary>A tool finished executing.</summary>
    ToolComplete,

    /// <summary>The session became idle (the run is complete).</summary>
    SessionIdle,
}

/// <summary>
/// Typed envelope around a <c>GitHub.Copilot.SessionEvent</c> for consumers who want to surface
/// subagent dispatch + assistant messages in a UI (e.g. an Aspire dashboard) without writing their
/// own polymorphic dispatch over the raw SDK event hierarchy.
/// </summary>
/// <remarks>
/// <para>
/// Squad.Agents.AI converts the raw event stream into <see cref="SquadAgentTraceEvent"/> instances
/// inside its own <c>OnEvent</c> handler when <see cref="SquadAgentOptions.OnSubagentTrace"/> is set,
/// then invokes the consumer's callback. Consumers therefore do not need a transitive reference to
/// <c>GitHub.Copilot.SDK</c> to subscribe to subagent activity.
/// </para>
/// <para>
/// The full underlying <c>GitHub.Copilot.SessionEvent</c> is preserved on <see cref="RawEvent"/> for
/// advanced consumers that need access to the original payload.
/// </para>
/// </remarks>
public sealed record SquadAgentTraceEvent
{
    /// <summary>The categorised kind of event.</summary>
    public required SquadAgentTraceEventKind Kind { get; init; }

    /// <summary>The raw <c>GitHub.Copilot.SessionEvent</c> type name, e.g. <c>SubagentStartedEvent</c>.</summary>
    public required string RawEventType { get; init; }

    /// <summary>Server-assigned timestamp on the SDK event.</summary>
    public DateTimeOffset Timestamp { get; init; }

    /// <summary>
    /// The SDK agent identifier (e.g. <c>toolu_vrtx_01Fc3uBTKapUoDDMnPUSe2ww</c>) the event is attributed to.
    /// Null for events emitted by the root coordinator; non-null for subagent-scoped events when
    /// <see cref="SquadAgentOptions.IncludeSubAgentStreamingEvents"/> is on.
    /// </summary>
    public string? SdkAgentId { get; init; }

    /// <summary>Display-friendly name of the spawning subagent (e.g. <c>Picard</c>), when known.</summary>
    public string? SubagentName { get; init; }

    /// <summary>Long-form display name of the spawning subagent, when known.</summary>
    public string? SubagentDisplayName { get; init; }

    /// <summary>SDK <c>ToolCallId</c> for <see cref="SquadAgentTraceEventKind.ToolStart"/> / <see cref="SquadAgentTraceEventKind.ToolComplete"/>.</summary>
    public string? ToolCallId { get; init; }

    /// <summary>
    /// Assistant message content for <see cref="SquadAgentTraceEventKind.AssistantMessage"/>; null for other kinds.
    /// Consumers may treat this as the subagent's reply when <see cref="SdkAgentId"/> is non-null.
    /// </summary>
    public string? Content { get; init; }

    /// <summary>Tool success flag, for <see cref="SquadAgentTraceEventKind.ToolComplete"/>.</summary>
    public bool? Success { get; init; }

    /// <summary>
    /// The original underlying <c>GitHub.Copilot.SessionEvent</c> instance. Kept as <see cref="object"/> on this
    /// type so consumers do not need a transitive reference to the SDK. Cast to the concrete event type for advanced
    /// scenarios.
    /// </summary>
    public object? RawEvent { get; init; }
}
