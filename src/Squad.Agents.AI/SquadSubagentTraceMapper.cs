using System.Diagnostics;
using GitHub.Copilot;

namespace Squad.Agents.AI;

/// <summary>
/// Converts the GitHub.Copilot SDK's polymorphic <see cref="SessionEvent"/> stream into the typed
/// <see cref="SquadAgentTraceEvent"/> envelope and emits matching OpenTelemetry spans on
/// <see cref="SquadAgentDiagnostics.ActivitySource"/>.
/// </summary>
/// <remarks>
/// One <c>Activity</c> per subagent dispatch is opened on <see cref="SubagentStartedEvent"/> and
/// disposed on the matching <see cref="SubagentCompletedEvent"/> / <see cref="SubagentFailedEvent"/>.
/// Inactive subagent <c>Activity</c> instances are tracked by their <c>SdkAgentId</c> so concurrent
/// dispatches each get their own span. The activity is kept alive in a <see cref="System.Collections.Concurrent.ConcurrentDictionary{TKey, TValue}"/>
/// for the duration of the subagent run; if the session ends without a matching completion event
/// (e.g. an unhandled exception in the SDK), <see cref="DisposeAll"/> drains the dictionary so spans
/// still terminate cleanly.
/// </remarks>
internal sealed class SquadSubagentTraceMapper : IDisposable
{
    private readonly Action<SquadAgentTraceEvent>? _onTrace;
    private readonly bool _emitActivities;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, Activity> _liveSubagentActivities = new(StringComparer.Ordinal);

    public SquadSubagentTraceMapper(Action<SquadAgentTraceEvent>? onTrace, bool emitActivities = true)
    {
        _onTrace = onTrace;
        _emitActivities = emitActivities;
    }

    /// <summary>Hook to set on <see cref="SessionConfigBase.OnEvent"/>.</summary>
    public void OnSessionEvent(SessionEvent sessionEvent)
    {
        if (sessionEvent is null) return;

        SquadAgentTraceEvent? envelope = sessionEvent switch
        {
            SubagentSelectedEvent s => Build(s, SquadAgentTraceEventKind.SubagentSelected, subagentName: s.Data?.AgentName),
            SubagentStartedEvent s => Build(s, SquadAgentTraceEventKind.SubagentStarted, subagentName: s.Data?.AgentName, subagentDisplayName: s.Data?.AgentDisplayName),
            SubagentCompletedEvent s => Build(s, SquadAgentTraceEventKind.SubagentCompleted, subagentName: s.Data?.AgentName),
            SubagentFailedEvent s => Build(s, SquadAgentTraceEventKind.SubagentFailed, subagentName: s.Data?.AgentName, success: false),
            AssistantMessageEvent a => Build(a, SquadAgentTraceEventKind.AssistantMessage, content: a.Data?.Content),
            ToolExecutionStartEvent t => Build(t, SquadAgentTraceEventKind.ToolStart, toolCallId: t.Data?.ToolCallId),
            ToolExecutionCompleteEvent t => Build(t, SquadAgentTraceEventKind.ToolComplete, toolCallId: t.Data?.ToolCallId, success: t.Data?.Success),
            SessionIdleEvent _ => Build(sessionEvent, SquadAgentTraceEventKind.SessionIdle),
            _ => null,
        };

        if (envelope is null) return;

        // OpenTelemetry: open/annotate/close one Activity per subagent run when activity emission is on.
        // Lifecycle events (start / message / completed / failed) are added as ActivityEvents on the live
        // subagent span so backends with timeline views (e.g. Aspire dashboard) show one annotated marker
        // per state transition.
        if (_emitActivities)
        {
            if (envelope.Kind == SquadAgentTraceEventKind.SubagentStarted &&
                !string.IsNullOrEmpty(envelope.SdkAgentId))
            {
                var activity = SquadAgentDiagnostics.ActivitySource.StartActivity(
                    $"squad.subagent {envelope.SubagentName ?? envelope.SdkAgentId}",
                    ActivityKind.Internal);
                if (activity is not null)
                {
                    activity.SetTag("squad.subagent.name", envelope.SubagentName);
                    activity.SetTag("squad.subagent.display_name", envelope.SubagentDisplayName);
                    activity.SetTag("squad.subagent.sdk_agent_id", envelope.SdkAgentId);
                    activity.AddEvent(new ActivityEvent(
                        "squad.subagent.start",
                        tags: new ActivityTagsCollection
                        {
                            ["squad.subagent.name"] = envelope.SubagentName,
                            ["squad.subagent.display_name"] = envelope.SubagentDisplayName,
                            ["squad.subagent.sdk_agent_id"] = envelope.SdkAgentId,
                        }));
                    _liveSubagentActivities[envelope.SdkAgentId!] = activity;
                }
            }
            else if (envelope.Kind == SquadAgentTraceEventKind.AssistantMessage &&
                     !string.IsNullOrEmpty(envelope.SdkAgentId) &&
                     _liveSubagentActivities.TryGetValue(envelope.SdkAgentId!, out var liveActivity))
            {
                // The subagent's assistant message is the substantive output of that dispatch. Tag the
                // span with a short preview so backends can group spans by subagent and show the reply at
                // a glance. We bound the preview to a sane length even though backends are free to
                // truncate further. Also raise an ActivityEvent so the timeline shows when the reply was
                // produced (useful for streaming subagents that emit multiple messages).
                if (!string.IsNullOrEmpty(envelope.Content))
                {
                    var preview = envelope.Content!.Length > 512
                        ? envelope.Content.Substring(0, 512) + "..."
                        : envelope.Content;
                    liveActivity.SetTag("squad.subagent.reply_preview", preview);
                    liveActivity.AddEvent(new ActivityEvent(
                        "squad.subagent.message",
                        tags: new ActivityTagsCollection
                        {
                            ["squad.subagent.name"] = envelope.SubagentName,
                            ["squad.subagent.sdk_agent_id"] = envelope.SdkAgentId,
                            ["squad.subagent.message_preview"] = preview,
                        }));
                }
            }
            else if (envelope.Kind is SquadAgentTraceEventKind.SubagentCompleted or SquadAgentTraceEventKind.SubagentFailed &&
                     !string.IsNullOrEmpty(envelope.SdkAgentId) &&
                     _liveSubagentActivities.TryRemove(envelope.SdkAgentId!, out var completedActivity))
            {
                var isFailure = envelope.Kind == SquadAgentTraceEventKind.SubagentFailed;
                completedActivity.AddEvent(new ActivityEvent(
                    isFailure ? "squad.subagent.failed" : "squad.subagent.completed",
                    tags: new ActivityTagsCollection
                    {
                        ["squad.subagent.name"] = envelope.SubagentName,
                        ["squad.subagent.sdk_agent_id"] = envelope.SdkAgentId,
                    }));
                completedActivity.SetStatus(isFailure ? ActivityStatusCode.Error : ActivityStatusCode.Ok);
                completedActivity.Dispose();
            }
        }

        // Deliver the typed event to the consumer last so any consumer-side side effects (logging,
        // UI updates) see the OTel span as already open/closed.
        try
        {
            _onTrace?.Invoke(envelope);
        }
        catch
        {
            // Consumer callback exceptions must never tear down the SDK event loop.
        }
    }

    private static SquadAgentTraceEvent Build(
        SessionEvent sessionEvent,
        SquadAgentTraceEventKind kind,
        string? subagentName = null,
        string? subagentDisplayName = null,
        string? toolCallId = null,
        string? content = null,
        bool? success = null)
    {
        return new SquadAgentTraceEvent
        {
            Kind = kind,
            RawEventType = sessionEvent.GetType().Name,
            Timestamp = sessionEvent.Timestamp,
            SdkAgentId = sessionEvent.AgentId,
            SubagentName = subagentName,
            SubagentDisplayName = subagentDisplayName,
            ToolCallId = toolCallId,
            Content = content,
            Success = success,
            RawEvent = sessionEvent,
        };
    }

    public void Dispose()
    {
        foreach (var (_, activity) in _liveSubagentActivities)
        {
            try { activity.SetStatus(ActivityStatusCode.Error, "Session ended without matching SubagentCompletedEvent"); activity.Dispose(); }
            catch { }
        }
        _liveSubagentActivities.Clear();
    }
}
