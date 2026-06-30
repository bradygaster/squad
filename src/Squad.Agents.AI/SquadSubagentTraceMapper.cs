using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using GitHub.Copilot;

namespace Squad.Agents.AI;

/// <summary>
/// Converts the GitHub.Copilot SDK's polymorphic <see cref="SessionEvent"/> stream into the typed
/// <see cref="SquadAgentTraceEvent"/> envelope and emits matching OpenTelemetry spans on
/// <see cref="SquadAgentDiagnostics.ActivitySource"/>.
/// </summary>
/// <remarks>
/// <para>
/// One <c>Activity</c> per subagent dispatch is opened on the LLM's <c>task</c> tool invocation
/// (a <see cref="ToolExecutionStartEvent"/> whose <c>Data.ToolName == "task"</c>) so the span's
/// display name and tags carry the real per-dispatch persona identity that the LLM supplied —
/// <c>name</c>, <c>description</c>, <c>agent_type</c>, <c>prompt</c>. The subsequent
/// <see cref="SubagentStartedEvent"/> only carries the agent_type's catalog identifiers
/// (e.g. <c>AgentName == "general-purpose"</c>), so opening the span earlier — at task dispatch —
/// is the only way to label it with the persona name.
/// </para>
/// <para>
/// The span is closed on the matching <see cref="SubagentCompletedEvent"/> /
/// <see cref="SubagentFailedEvent"/>. Live spans are tracked by their <c>ToolCallId</c> — the only
/// identifier that is present on all four lifecycle events (task dispatch, subagent started,
/// subagent completed, subagent failed). A secondary <c>SdkAgentId → ToolCallId</c> lookup is
/// maintained so <see cref="AssistantMessageEvent"/>s (which only carry the SDK agent id) can
/// still find the live subagent span and tag it with a reply preview.
/// </para>
/// <para>
/// If a <see cref="SubagentStartedEvent"/> arrives without a preceding task-dispatch event
/// (e.g. unit tests that drive the mapper directly, or SDK code paths that bypass the task
/// tool), a fallback activity is opened on that event so the legacy single-event flow keeps
/// working.
/// </para>
/// <para>
/// If the session ends without a matching completion event (e.g. an unhandled exception in the
/// SDK), <see cref="Dispose"/> drains the live-activity dictionary so spans still terminate
/// cleanly.
/// </para>
/// </remarks>
internal sealed class SquadSubagentTraceMapper : IDisposable
{
    private readonly Action<SquadAgentTraceEvent>? _onTrace;
    private readonly bool _emitActivities;

    // Primary store: one Activity per subagent dispatch, keyed by ToolCallId. ToolCallId is the
    // only identifier present on all four lifecycle events (ToolExecutionStartEvent[task],
    // SubagentStartedEvent, SubagentCompletedEvent, SubagentFailedEvent), making it the single
    // stable correlation key across the whole dispatch.
    private readonly ConcurrentDictionary<string, Activity> _activitiesByToolCallId = new(StringComparer.Ordinal);

    // Secondary index for AssistantMessageEvent correlation. AssistantMessageEvent only carries
    // SessionEvent.AgentId (a.k.a. SdkAgentId) — the SDK-assigned subagent id we learn on
    // SubagentStartedEvent. Populating this map there lets us find the live span when a
    // subagent's reply streams in.
    private readonly ConcurrentDictionary<string, string> _toolCallIdBySdkAgentId = new(StringComparer.Ordinal);

    // Stash of LLM-supplied persona arguments parsed from the task tool dispatch, keyed by
    // ToolCallId. Lets later events (SubagentStarted/Completed) enrich their typed envelope
    // with the persona identity that lives only on the dispatch event's Arguments JSON.
    private readonly ConcurrentDictionary<string, DispatchedPersona> _personasByToolCallId = new(StringComparer.Ordinal);

    private sealed record DispatchedPersona(string? Name, string? Description, string? AgentType, string? Prompt);

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
            SubagentStartedEvent s => Build(s, SquadAgentTraceEventKind.SubagentStarted, subagentName: s.Data?.AgentName, subagentDisplayName: s.Data?.AgentDisplayName, toolCallId: s.Data?.ToolCallId),
            SubagentCompletedEvent s => Build(s, SquadAgentTraceEventKind.SubagentCompleted, subagentName: s.Data?.AgentName, toolCallId: s.Data?.ToolCallId),
            SubagentFailedEvent s => Build(s, SquadAgentTraceEventKind.SubagentFailed, subagentName: s.Data?.AgentName, toolCallId: s.Data?.ToolCallId, success: false),
            AssistantMessageEvent a => Build(a, SquadAgentTraceEventKind.AssistantMessage, content: a.Data?.Content, requestedToolNames: ExtractToolNames(a.Data?.ToolRequests)),
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
            ApplyActivityForEnvelope(envelope);
        }

        // Deliver the typed event to the consumer last so any consumer-side side effects (logging,
        // UI updates) see the OTel span as already open/closed.
        InvokeConsumer(envelope);

        // Layer the per-dispatch persona path on top of the standard ToolStart envelope: when the
        // raw event is the `task` tool dispatch, emit an additional SubagentDispatched envelope
        // carrying the LLM-supplied persona name/description/prompt parsed from Arguments. This
        // is additive — consumers that subscribe to ToolStart see no behavior change.
        if (sessionEvent is ToolExecutionStartEvent toolStart &&
            string.Equals(toolStart.Data?.ToolName, "task", StringComparison.Ordinal))
        {
            OnTaskDispatch(toolStart);
        }
    }

    private void ApplyActivityForEnvelope(SquadAgentTraceEvent envelope)
    {
        switch (envelope.Kind)
        {
            case SquadAgentTraceEventKind.SubagentStarted when !string.IsNullOrEmpty(envelope.ToolCallId):
            {
                // If the task-dispatch handler already opened the span for this ToolCallId, just
                // augment it with the SDK-assigned identifiers we now have. Otherwise (legacy /
                // test path), open a fallback span keyed by ToolCallId so the rest of the
                // lifecycle still works end-to-end.
                var toolCallId = envelope.ToolCallId!;
                if (!_activitiesByToolCallId.TryGetValue(toolCallId, out var activity))
                {
                    activity = SquadAgentDiagnostics.ActivitySource.StartActivity(
                        $"squad.subagent {envelope.SubagentName ?? envelope.SdkAgentId ?? toolCallId}",
                        ActivityKind.Internal);
                    if (activity is not null)
                    {
                        _activitiesByToolCallId[toolCallId] = activity;
                    }
                }

                if (activity is not null)
                {
                    if (!string.IsNullOrEmpty(envelope.SubagentName))
                        activity.SetTag("squad.subagent.name", envelope.SubagentName);
                    if (!string.IsNullOrEmpty(envelope.SubagentDisplayName))
                        activity.SetTag("squad.subagent.display_name", envelope.SubagentDisplayName);
                    if (!string.IsNullOrEmpty(envelope.SdkAgentId))
                        activity.SetTag("squad.subagent.sdk_agent_id", envelope.SdkAgentId);
                    activity.SetTag("squad.subagent.tool_call_id", toolCallId);
                    activity.AddEvent(new ActivityEvent(
                        "squad.subagent.start",
                        tags: new ActivityTagsCollection
                        {
                            ["squad.subagent.name"] = envelope.SubagentName,
                            ["squad.subagent.display_name"] = envelope.SubagentDisplayName,
                            ["squad.subagent.sdk_agent_id"] = envelope.SdkAgentId,
                            ["squad.subagent.tool_call_id"] = toolCallId,
                        }));

                    if (!string.IsNullOrEmpty(envelope.SdkAgentId))
                    {
                        _toolCallIdBySdkAgentId[envelope.SdkAgentId!] = toolCallId;
                    }
                }
                break;
            }

            case SquadAgentTraceEventKind.AssistantMessage when !string.IsNullOrEmpty(envelope.SdkAgentId):
            {
                // The subagent's assistant message is the substantive output of that dispatch. Tag the
                // span with a short preview so backends can group spans by subagent and show the reply at
                // a glance. We bound the preview to a sane length even though backends are free to
                // truncate further. Also raise an ActivityEvent so the timeline shows when the reply was
                // produced (useful for streaming subagents that emit multiple messages).
                if (_toolCallIdBySdkAgentId.TryGetValue(envelope.SdkAgentId!, out var toolCallId) &&
                    _activitiesByToolCallId.TryGetValue(toolCallId, out var liveActivity))
                {
                    // Non-empty Content path: tag the spoken text on the span.
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

                    // Tool-only path: even if Content is empty, surface what tools the subagent invoked
                    // on this turn so the dashboard timeline shows "called gh, view, grep" instead of a
                    // blank marker. This is independent of the spoken-text path because a single turn
                    // can be both: text PLUS tool calls.
                    if (envelope.RequestedToolNames.Count > 0)
                    {
                        var toolNamesCsv = string.Join(",", envelope.RequestedToolNames);
                        liveActivity.AddEvent(new ActivityEvent(
                            "squad.subagent.tool_requests",
                            tags: new ActivityTagsCollection
                            {
                                ["squad.subagent.name"] = envelope.SubagentName,
                                ["squad.subagent.sdk_agent_id"] = envelope.SdkAgentId,
                                ["squad.subagent.tool_requests"] = toolNamesCsv,
                                ["squad.subagent.tool_requests_count"] = envelope.RequestedToolNames.Count,
                            }));
                    }
                }
                break;
            }

            case SquadAgentTraceEventKind.SubagentCompleted:
            case SquadAgentTraceEventKind.SubagentFailed:
            {
                // Close the live span. Prefer ToolCallId (the primary key); fall back to SdkAgentId via
                // the secondary map for completeness (shouldn't be needed, but harmless).
                var toolCallId = envelope.ToolCallId;
                if (string.IsNullOrEmpty(toolCallId) && !string.IsNullOrEmpty(envelope.SdkAgentId))
                {
                    _toolCallIdBySdkAgentId.TryGetValue(envelope.SdkAgentId!, out toolCallId);
                }

                if (!string.IsNullOrEmpty(toolCallId) &&
                    _activitiesByToolCallId.TryRemove(toolCallId!, out var completedActivity))
                {
                    _personasByToolCallId.TryRemove(toolCallId!, out _);
                    if (!string.IsNullOrEmpty(envelope.SdkAgentId))
                    {
                        _toolCallIdBySdkAgentId.TryRemove(envelope.SdkAgentId!, out _);
                    }

                    var isFailure = envelope.Kind == SquadAgentTraceEventKind.SubagentFailed;
                    completedActivity.AddEvent(new ActivityEvent(
                        isFailure ? "squad.subagent.failed" : "squad.subagent.completed",
                        tags: new ActivityTagsCollection
                        {
                            ["squad.subagent.name"] = envelope.SubagentName,
                            ["squad.subagent.sdk_agent_id"] = envelope.SdkAgentId,
                            ["squad.subagent.tool_call_id"] = toolCallId,
                        }));
                    completedActivity.SetStatus(isFailure ? ActivityStatusCode.Error : ActivityStatusCode.Ok);
                    completedActivity.Dispose();
                }
                break;
            }
        }
    }

    /// <summary>
    /// Handles the <c>task</c>-tool dispatch path: parses the LLM-supplied persona arguments,
    /// opens the OTel activity (so the span is labeled with the persona name from the very start
    /// of the dispatch), stashes the persona for downstream events to pick up, and emits a
    /// <see cref="SquadAgentTraceEventKind.SubagentDispatched"/> envelope so consumers can react.
    /// </summary>
    private void OnTaskDispatch(ToolExecutionStartEvent evt)
    {
        var toolCallId = evt.Data?.ToolCallId;
        if (string.IsNullOrEmpty(toolCallId))
        {
            return;
        }

        string? personaName = null;
        string? personaDesc = null;
        string? agentType = null;
        string? prompt = null;

        if (evt.Data?.Arguments is JsonElement args && args.ValueKind == JsonValueKind.Object)
        {
            if (args.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String)
                personaName = n.GetString();
            if (args.TryGetProperty("description", out var d) && d.ValueKind == JsonValueKind.String)
                personaDesc = d.GetString();
            if (args.TryGetProperty("agent_type", out var at) && at.ValueKind == JsonValueKind.String)
                agentType = at.GetString();
            // Some LLM revisions / catalog flavors emit `subagent_type` instead of `agent_type`.
            if (agentType is null && args.TryGetProperty("subagent_type", out var st) && st.ValueKind == JsonValueKind.String)
                agentType = st.GetString();
            if (args.TryGetProperty("prompt", out var p) && p.ValueKind == JsonValueKind.String)
                prompt = p.GetString();
        }

        _personasByToolCallId[toolCallId!] = new DispatchedPersona(personaName, personaDesc, agentType, prompt);

        if (_emitActivities)
        {
            // Open the activity as early as possible so the dashboard timeline shows the dispatch
            // moment, not the later SubagentStartedEvent. Display name prefers the persona over
            // the agent_type catalog identifier; both are typically more useful than the raw
            // ToolCallId.
            var displayName = !string.IsNullOrEmpty(personaName)
                ? personaName!
                : (!string.IsNullOrEmpty(agentType) ? agentType! : toolCallId!);

            var activity = SquadAgentDiagnostics.ActivitySource.StartActivity(
                $"squad.subagent {displayName}",
                ActivityKind.Internal);
            if (activity is not null)
            {
                activity.SetTag("squad.subagent.tool_call_id", toolCallId);
                if (!string.IsNullOrEmpty(personaName))
                    activity.SetTag("squad.subagent.persona.name", personaName);
                if (!string.IsNullOrEmpty(personaDesc))
                    activity.SetTag("squad.subagent.persona.description", personaDesc);
                if (!string.IsNullOrEmpty(agentType))
                    activity.SetTag("squad.subagent.agent_type", agentType);
                if (!string.IsNullOrEmpty(prompt))
                    activity.SetTag("squad.subagent.prompt", Truncate(prompt!, 1024));

                activity.AddEvent(new ActivityEvent(
                    "squad.subagent.dispatched",
                    tags: new ActivityTagsCollection
                    {
                        ["squad.subagent.persona.name"] = personaName,
                        ["squad.subagent.persona.description"] = personaDesc,
                        ["squad.subagent.agent_type"] = agentType,
                        ["squad.subagent.tool_call_id"] = toolCallId,
                    }));
                _activitiesByToolCallId[toolCallId!] = activity;
            }
        }

        var dispatchEnvelope = new SquadAgentTraceEvent
        {
            Kind = SquadAgentTraceEventKind.SubagentDispatched,
            RawEventType = evt.GetType().Name,
            Timestamp = evt.Timestamp,
            SdkAgentId = evt.AgentId,
            ToolCallId = toolCallId,
            // SubagentName mirrors the persona so existing consumers that read SubagentName still
            // surface a meaningful identity for dispatched-but-not-yet-started subagents.
            SubagentName = personaName,
            SubagentDisplayName = personaDesc,
            DispatchedPersonaName = personaName,
            DispatchedPersonaDescription = personaDesc,
            DispatchedAgentType = agentType,
            DispatchedPrompt = prompt,
            RawEvent = evt,
        };
        InvokeConsumer(dispatchEnvelope);
    }

    private void InvokeConsumer(SquadAgentTraceEvent envelope)
    {
        try
        {
            _onTrace?.Invoke(envelope);
        }
        catch
        {
            // Consumer callback exceptions must never tear down the SDK event loop.
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s.Substring(0, max) + "...";

    /// <summary>
    /// Extracts the tool names from an <c>AssistantMessageData.ToolRequests</c> array. Returns an empty
    /// list (never null) so consumers can iterate freely. Used so callers can see what an empty-content
    /// (tool-only) assistant turn was actually doing — e.g. "called gh, view, grep".
    /// </summary>
    private static IReadOnlyList<string> ExtractToolNames(AssistantMessageToolRequest[]? toolRequests)
    {
        if (toolRequests is null || toolRequests.Length == 0)
        {
            return Array.Empty<string>();
        }

        var names = new List<string>(toolRequests.Length);
        foreach (var req in toolRequests)
        {
            // Prefer the simple tool name; if that's empty fall back to the (more verbose) tool title.
            // Skip entries with no usable identifier to keep the output meaningful for consumers.
            var name = !string.IsNullOrEmpty(req?.Name)
                ? req!.Name
                : (!string.IsNullOrEmpty(req?.ToolTitle) ? req!.ToolTitle : null);
            if (!string.IsNullOrEmpty(name))
            {
                names.Add(name!);
            }
        }
        return names;
    }

    private static SquadAgentTraceEvent Build(
        SessionEvent sessionEvent,
        SquadAgentTraceEventKind kind,
        string? subagentName = null,
        string? subagentDisplayName = null,
        string? toolCallId = null,
        string? content = null,
        bool? success = null,
        IReadOnlyList<string>? requestedToolNames = null)
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
            RequestedToolNames = requestedToolNames ?? Array.Empty<string>(),
            RawEvent = sessionEvent,
        };
    }

    public void Dispose()
    {
        foreach (var (_, activity) in _activitiesByToolCallId)
        {
            try { activity.SetStatus(ActivityStatusCode.Error, "Session ended without matching SubagentCompletedEvent"); activity.Dispose(); }
            catch { }
        }
        _activitiesByToolCallId.Clear();
        _toolCallIdBySdkAgentId.Clear();
        _personasByToolCallId.Clear();
    }
}
