using System.Diagnostics;
using System.Text.Json;
using GitHub.Copilot;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Tests for the typed subagent observability surface added in 0.3.0.
/// Mapper is exercised directly via InternalsVisibleTo so tests stay hermetic
/// (no live CLI session); a real end-to-end smoke test runs through the sample.
/// </summary>
[Collection("SquadActivityListeners")]
public class SquadSubagentTraceTests
{
    private static SubagentStartedData MakeStartedData(string name, string? displayName = null) => new()
    {
        AgentName = name,
        AgentDisplayName = displayName ?? name,
        AgentDescription = $"{name} test agent",
        ToolCallId = $"toolu_{name.ToLowerInvariant()}",
    };

    private static SubagentCompletedData MakeCompletedData(string name) => new()
    {
        AgentName = name,
        AgentDisplayName = name,
        ToolCallId = $"toolu_{name.ToLowerInvariant()}",
    };

    private static SubagentFailedData MakeFailedData(string name) => new()
    {
        AgentName = name,
        AgentDisplayName = name,
        ToolCallId = $"toolu_{name.ToLowerInvariant()}",
        Error = "test failure",
    };

    private static AssistantMessageData MakeAssistantData(string content) => new()
    {
        Content = content,
        MessageId = Guid.NewGuid().ToString("n"),
    };

    [Fact]
    public void Mapper_MapsSubagentStartedEvent_ToTypedEnvelope()
    {
        SquadAgentTraceEvent? captured = null;
        var mapper = new SquadSubagentTraceMapper(evt => captured = evt);

        var raw = new SubagentStartedEvent
        {
            AgentId = "toolu_subagent_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeStartedData("Picard", "Captain Picard"),
        };
        mapper.OnSessionEvent(raw);

        Assert.NotNull(captured);
        Assert.Equal(SquadAgentTraceEventKind.SubagentStarted, captured!.Kind);
        Assert.Equal("Picard", captured.SubagentName);
        Assert.Equal("Captain Picard", captured.SubagentDisplayName);
        Assert.Equal("toolu_subagent_1", captured.SdkAgentId);
        Assert.Equal("SubagentStartedEvent", captured.RawEventType);
        Assert.Same(raw, captured.RawEvent);
    }

    [Fact]
    public void Mapper_MapsAssistantMessageEvent_ToTypedEnvelopeWithContent()
    {
        SquadAgentTraceEvent? captured = null;
        var mapper = new SquadSubagentTraceMapper(evt => captured = evt);

        var raw = new AssistantMessageEvent
        {
            AgentId = "toolu_subagent_2",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeAssistantData("Hello from the subagent."),
        };
        mapper.OnSessionEvent(raw);

        Assert.NotNull(captured);
        Assert.Equal(SquadAgentTraceEventKind.AssistantMessage, captured!.Kind);
        Assert.Equal("Hello from the subagent.", captured.Content);
        Assert.Equal("toolu_subagent_2", captured.SdkAgentId);
    }

    [Fact]
    public void Mapper_DoesNotEmitTypedEnvelopeForUnknownEvents()
    {
        var deliveries = new List<SquadAgentTraceEvent>();
        var mapper = new SquadSubagentTraceMapper(deliveries.Add);

        // A bare SessionEvent doesn't match any of the well-known categories the mapper switches on;
        // it must be silently dropped, not surfaced as a generic envelope.
        mapper.OnSessionEvent(new SessionEvent
        {
            AgentId = "x",
            Timestamp = DateTimeOffset.UtcNow,
        });

        Assert.Empty(deliveries);
    }

    [Fact]
    public void Mapper_ConsumerCallbackException_DoesNotPropagate()
    {
        var mapper = new SquadSubagentTraceMapper(_ => throw new InvalidOperationException("boom"));

        var ex = Record.Exception(() => mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "x",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeStartedData("Picard"),
        }));
        Assert.Null(ex);
    }

    [Fact]
    public void Mapper_EmitsActivityForSubagentStartedAndDisposesOnCompleted()
    {
        var startedActivities = new List<Activity>();
        var stoppedActivities = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => startedActivities.Add(a),
            ActivityStopped = a => stoppedActivities.Add(a),
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null);

        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_otel_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeStartedData("Picard", "Captain Picard"),
        });
        mapper.OnSessionEvent(new SubagentCompletedEvent
        {
            AgentId = "toolu_otel_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeCompletedData("Picard"),
        });

        Assert.Single(startedActivities);
        Assert.Single(stoppedActivities);
        Assert.Equal("squad.subagent Picard", startedActivities[0].DisplayName);
        Assert.Equal("Picard", startedActivities[0].GetTagItem("squad.subagent.name"));
        Assert.Equal("Captain Picard", startedActivities[0].GetTagItem("squad.subagent.display_name"));
        Assert.Equal("toolu_otel_1", startedActivities[0].GetTagItem("squad.subagent.sdk_agent_id"));
        Assert.Equal(ActivityStatusCode.Ok, stoppedActivities[0].Status);
    }

    [Fact]
    public void Mapper_MarksActivityErrorOnSubagentFailedEvent()
    {
        Activity? stopped = null;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = a => stopped = a,
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null);
        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_fail_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeStartedData("Worf"),
        });
        mapper.OnSessionEvent(new SubagentFailedEvent
        {
            AgentId = "toolu_fail_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeFailedData("Worf"),
        });

        Assert.NotNull(stopped);
        Assert.Equal(ActivityStatusCode.Error, stopped!.Status);
    }

    [Fact]
    public void Mapper_AssistantMessageOnLiveSubagent_TagsActivityWithReplyPreview()
    {
        Activity? activity = null;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => activity = a,
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null);
        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_msg_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeStartedData("Data"),
        });
        mapper.OnSessionEvent(new AssistantMessageEvent
        {
            AgentId = "toolu_msg_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeAssistantData("Captain, the answer is 42."),
        });

        Assert.NotNull(activity);
        Assert.Equal("Captain, the answer is 42.", activity!.GetTagItem("squad.subagent.reply_preview"));
    }

    [Fact]
    public void Mapper_DisposesAllLiveActivities_WhenSessionEndsMidDispatch()
    {
        var stoppedCount = 0;
        Activity? lastStopped = null;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = a => { stoppedCount++; lastStopped = a; },
        };
        ActivitySource.AddActivityListener(listener);

        var mapper = new SquadSubagentTraceMapper(onTrace: null);
        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_leak_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeStartedData("Seven"),
        });
        // never send completion — simulate abrupt session shutdown
        mapper.Dispose();

        Assert.Equal(1, stoppedCount);
        Assert.Equal(ActivityStatusCode.Error, lastStopped!.Status);
    }

    // ─── Per-dispatch persona path (task tool dispatch) ──────────────────────

    /// <summary>
    /// Builds a <see cref="ToolExecutionStartEvent"/> whose <c>ToolName == "task"</c> with a
    /// fully-populated <c>Arguments</c> JSON object so the mapper can parse the LLM-supplied
    /// per-dispatch persona identity (<c>name</c>, <c>description</c>, <c>agent_type</c>,
    /// <c>prompt</c>) — the values that the standard <see cref="SubagentStartedEvent"/>
    /// silently drops.
    /// </summary>
    private static ToolExecutionStartEvent MakeTaskDispatch(
        string toolCallId,
        string? personaName,
        string? personaDescription,
        string? agentType = "general-purpose",
        string? prompt = "Investigate the issue and report back.",
        string argsKeyForAgentType = "agent_type")
    {
        var argsObj = new Dictionary<string, object?>
        {
            ["name"] = personaName,
            ["description"] = personaDescription,
            [argsKeyForAgentType] = agentType,
            ["prompt"] = prompt,
            ["mode"] = "sync",
            ["model"] = "claude-opus-4.7",
        };
        var argsJson = JsonSerializer.SerializeToElement(argsObj);

        return new ToolExecutionStartEvent
        {
            AgentId = "coordinator-agent",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new ToolExecutionStartData
            {
                ToolName = "task",
                ToolCallId = toolCallId,
                Arguments = argsJson,
            },
        };
    }

    [Fact]
    public void Mapper_TaskDispatch_EmitsSubagentDispatchedEnvelopeWithPersonaFields()
    {
        var events = new List<SquadAgentTraceEvent>();
        var mapper = new SquadSubagentTraceMapper(events.Add);

        mapper.OnSessionEvent(MakeTaskDispatch(
            toolCallId: "toolu_dispatch_1",
            personaName: "cipher",
            personaDescription: "🛡️ Cipher: Build the threat model for the checkout flow",
            agentType: "general-purpose",
            prompt: "You are Cipher, the security lead. Threat-model the checkout flow."));

        // Two envelopes must fire for a single task dispatch:
        //   1. The standard ToolStart (kept for backward-compat with existing consumers)
        //   2. The new SubagentDispatched (carries the LLM-supplied persona identity)
        var toolStart = Assert.Single(events, e => e.Kind == SquadAgentTraceEventKind.ToolStart);
        Assert.Equal("toolu_dispatch_1", toolStart.ToolCallId);

        var dispatched = Assert.Single(events, e => e.Kind == SquadAgentTraceEventKind.SubagentDispatched);
        Assert.Equal("toolu_dispatch_1", dispatched.ToolCallId);
        Assert.Equal("cipher", dispatched.DispatchedPersonaName);
        Assert.Equal("🛡️ Cipher: Build the threat model for the checkout flow", dispatched.DispatchedPersonaDescription);
        Assert.Equal("general-purpose", dispatched.DispatchedAgentType);
        Assert.Equal("You are Cipher, the security lead. Threat-model the checkout flow.", dispatched.DispatchedPrompt);

        // Persona is also surfaced on the existing SubagentName/SubagentDisplayName fields so
        // consumers that already render SubagentName see a meaningful identity at dispatch time.
        Assert.Equal("cipher", dispatched.SubagentName);
        Assert.Equal("🛡️ Cipher: Build the threat model for the checkout flow", dispatched.SubagentDisplayName);
    }

    [Fact]
    public void Mapper_TaskDispatch_OpensActivityTaggedWithPersona()
    {
        var startedActivities = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => startedActivities.Add(a),
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null);
        mapper.OnSessionEvent(MakeTaskDispatch(
            toolCallId: "toolu_dispatch_2",
            personaName: "data",
            personaDescription: "🔧 Data: Review PR #1378 coordinator inline-dispatch gate"));

        var activity = Assert.Single(startedActivities);
        // Activity display name surfaces the persona, not the catalog agent_type ("general-purpose").
        // This is the whole point of opening the span on the task dispatch event rather than on
        // the later SubagentStartedEvent.
        Assert.Equal("squad.subagent data", activity.DisplayName);
        Assert.Equal("data", activity.GetTagItem("squad.subagent.persona.name"));
        Assert.Equal("🔧 Data: Review PR #1378 coordinator inline-dispatch gate", activity.GetTagItem("squad.subagent.persona.description"));
        Assert.Equal("general-purpose", activity.GetTagItem("squad.subagent.agent_type"));
        Assert.Equal("toolu_dispatch_2", activity.GetTagItem("squad.subagent.tool_call_id"));
    }

    [Fact]
    public void Mapper_TaskDispatch_AcceptsSubagentTypeKeyAsAgentTypeFallback()
    {
        // Some LLM revisions / catalog flavors emit `subagent_type` instead of `agent_type` —
        // the mapper must accept either so we don't lose the dispatch label.
        var events = new List<SquadAgentTraceEvent>();
        var mapper = new SquadSubagentTraceMapper(events.Add);

        mapper.OnSessionEvent(MakeTaskDispatch(
            toolCallId: "toolu_dispatch_3",
            personaName: "vault",
            personaDescription: "🔐 Vault: AppSec review",
            agentType: "general-purpose",
            argsKeyForAgentType: "subagent_type"));

        var dispatched = Assert.Single(events, e => e.Kind == SquadAgentTraceEventKind.SubagentDispatched);
        Assert.Equal("general-purpose", dispatched.DispatchedAgentType);
    }

    [Fact]
    public void Mapper_TaskDispatchThenSubagentStarted_AugmentsExistingActivity()
    {
        var startedActivities = new List<Activity>();
        var stoppedActivities = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => startedActivities.Add(a),
            ActivityStopped = a => stoppedActivities.Add(a),
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null);

        mapper.OnSessionEvent(MakeTaskDispatch(
            toolCallId: "toolu_join_1",
            personaName: "probe",
            personaDescription: "🕵️ Probe: threat-modeling"));
        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_sdk_probe_xyz",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new SubagentStartedData
            {
                AgentName = "general-purpose",
                AgentDisplayName = "General Purpose Agent",
                AgentDescription = "Full-capability agent…",
                ToolCallId = "toolu_join_1",
            },
        });        // Exactly ONE activity must exist — the task dispatch opened it; SubagentStarted must
        // augment, not duplicate. Without this guarantee the dashboard shows two spans per
        // dispatch which is exactly the regression this whole change is here to prevent.
        var activity = Assert.Single(startedActivities);
        Assert.Empty(stoppedActivities);
        Assert.Equal("squad.subagent probe", activity.DisplayName);
        Assert.Equal("probe", activity.GetTagItem("squad.subagent.persona.name"));
        Assert.Equal("general-purpose", activity.GetTagItem("squad.subagent.name"));
        Assert.Equal("General Purpose Agent", activity.GetTagItem("squad.subagent.display_name"));
        Assert.Equal("toolu_sdk_probe_xyz", activity.GetTagItem("squad.subagent.sdk_agent_id"));
        Assert.Equal("toolu_join_1", activity.GetTagItem("squad.subagent.tool_call_id"));
    }

    [Fact]
    public void Mapper_TaskDispatchThenSubagentCompleted_ClosesActivity()
    {
        var stoppedActivities = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = a => stoppedActivities.Add(a),
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null);

        mapper.OnSessionEvent(MakeTaskDispatch(
            toolCallId: "toolu_close_1",
            personaName: "sentinel",
            personaDescription: "🔑 Sentinel: secrets review"));
        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_sentinel_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new SubagentStartedData
            {
                AgentName = "general-purpose",
                AgentDisplayName = "General Purpose Agent",
                AgentDescription = "Full-capability agent…",
                ToolCallId = "toolu_close_1",
            },
        });
        mapper.OnSessionEvent(new SubagentCompletedEvent
        {
            AgentId = "toolu_sentinel_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new SubagentCompletedData
            {
                AgentName = "general-purpose",
                AgentDisplayName = "General Purpose Agent",
                ToolCallId = "toolu_close_1",
            },
        });

        var stopped = Assert.Single(stoppedActivities);
        Assert.Equal(ActivityStatusCode.Ok, stopped.Status);
        Assert.Equal("sentinel", stopped.GetTagItem("squad.subagent.persona.name"));
    }

    [Fact]
    public void Mapper_TaskDispatchThenAssistantMessage_TagsReplyPreviewOnPersonaSpan()
    {
        Activity? activity = null;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => activity = a,
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null);

        mapper.OnSessionEvent(MakeTaskDispatch(
            toolCallId: "toolu_msg_link_1",
            personaName: "aegis",
            personaDescription: "⚔️ Aegis: infra hardening"));
        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_aegis_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new SubagentStartedData
            {
                AgentName = "general-purpose",
                AgentDisplayName = "General Purpose Agent",
                AgentDescription = "Full-capability agent…",
                ToolCallId = "toolu_msg_link_1",
            },
        });
        // AssistantMessageEvent carries SdkAgentId only (no ToolCallId) — the mapper must use the
        // SubagentStarted-populated SdkAgentId → ToolCallId map to find the right activity.
        mapper.OnSessionEvent(new AssistantMessageEvent
        {
            AgentId = "toolu_aegis_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeAssistantData("Hardening complete. Three findings filed."),
        });

        Assert.NotNull(activity);
        Assert.Equal("Hardening complete. Three findings filed.", activity!.GetTagItem("squad.subagent.reply_preview"));
    }

    [Fact]
    public void Mapper_NonTaskToolExecutionStart_DoesNotEmitSubagentDispatchedOrActivity()
    {
        var startedActivities = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => startedActivities.Add(a),
        };
        ActivitySource.AddActivityListener(listener);

        var events = new List<SquadAgentTraceEvent>();
        using var mapper = new SquadSubagentTraceMapper(events.Add);

        mapper.OnSessionEvent(new ToolExecutionStartEvent
        {
            AgentId = "coord",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new ToolExecutionStartData
            {
                ToolName = "bash",
                ToolCallId = "toolu_bash_1",
                Arguments = JsonSerializer.SerializeToElement(new { command = "ls" }),
            },
        });

        // The bash tool isn't a subagent dispatch — only the standard ToolStart envelope fires
        // (no SubagentDispatched, no activity).
        Assert.Single(events, e => e.Kind == SquadAgentTraceEventKind.ToolStart);
        Assert.DoesNotContain(events, e => e.Kind == SquadAgentTraceEventKind.SubagentDispatched);
        Assert.Empty(startedActivities);
    }

    [Fact]
    public void Mapper_TaskDispatchWithMissingArguments_StillEmitsEnvelopeAndActivity()
    {
        // Defensive: the LLM may call task with no Arguments (very unusual but possible). The
        // mapper must still emit the envelope (so consumers see the dispatch attempt) and open
        // an activity tagged with the ToolCallId as a last-resort label.
        var events = new List<SquadAgentTraceEvent>();
        var startedActivities = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => startedActivities.Add(a),
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(events.Add);
        mapper.OnSessionEvent(new ToolExecutionStartEvent
        {
            AgentId = "coord",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new ToolExecutionStartData
            {
                ToolName = "task",
                ToolCallId = "toolu_bare_1",
                Arguments = null,
            },
        });

        var dispatched = Assert.Single(events, e => e.Kind == SquadAgentTraceEventKind.SubagentDispatched);
        Assert.Equal("toolu_bare_1", dispatched.ToolCallId);
        Assert.Null(dispatched.DispatchedPersonaName);

        var activity = Assert.Single(startedActivities);
        Assert.Equal("squad.subagent toolu_bare_1", activity.DisplayName);
    }

    [Fact]
    public void Mapper_AssistantMessageWithToolRequests_PopulatesRequestedToolNames()
    {
        // When the subagent's turn is tool-only (Content empty, ToolRequests populated),
        // the mapper must surface the tool names on the envelope so consumers can render
        // "called gh, view, grep" instead of a blank reply line.
        SquadAgentTraceEvent? captured = null;
        var mapper = new SquadSubagentTraceMapper(evt => captured = evt);

        var raw = new AssistantMessageEvent
        {
            AgentId = "toolu_worf_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new AssistantMessageData
            {
                Content = string.Empty,
                MessageId = Guid.NewGuid().ToString("n"),
                ToolRequests = new[]
                {
                    new AssistantMessageToolRequest { Name = "gh", ToolCallId = "tc_1" },
                    new AssistantMessageToolRequest { Name = "view", ToolCallId = "tc_2" },
                    new AssistantMessageToolRequest { Name = "grep", ToolCallId = "tc_3" },
                },
            },
        };
        mapper.OnSessionEvent(raw);

        Assert.NotNull(captured);
        Assert.Equal(SquadAgentTraceEventKind.AssistantMessage, captured!.Kind);
        Assert.Equal(string.Empty, captured.Content);
        Assert.Equal(new[] { "gh", "view", "grep" }, captured.RequestedToolNames);
    }

    [Fact]
    public void Mapper_AssistantMessageWithoutToolRequests_EmitsEmptyRequestedToolNames()
    {
        // The default (no ToolRequests) must be an empty, non-null list so consumers can
        // iterate without null-checking.
        SquadAgentTraceEvent? captured = null;
        var mapper = new SquadSubagentTraceMapper(evt => captured = evt);

        mapper.OnSessionEvent(new AssistantMessageEvent
        {
            AgentId = "toolu_data_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = MakeAssistantData("Just a text reply, no tools."),
        });

        Assert.NotNull(captured);
        Assert.NotNull(captured!.RequestedToolNames);
        Assert.Empty(captured.RequestedToolNames);
    }

    [Fact]
    public void Mapper_ToolOnlyAssistantMessage_AddsToolRequestsActivityEventToLiveSpan()
    {
        // Verify that even when Content is empty, the OTel span gets a `squad.subagent.tool_requests`
        // ActivityEvent so the Aspire dashboard shows which tools the subagent invoked. This is the
        // OTel counterpart to the typed-envelope path tested above.
        Activity? activity = null;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => activity = a,
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(_ => { });

        // Open the span via the task-dispatch path so SubagentStartedEvent can wire SdkAgentId → ToolCallId.
        mapper.OnSessionEvent(new ToolExecutionStartEvent
        {
            AgentId = "coord",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new ToolExecutionStartData
            {
                ToolName = "task",
                ToolCallId = "toolu_scribe_dispatch",
                Arguments = JsonSerializer.SerializeToElement(new
                {
                    name = "scribe",
                    description = "Log the session",
                    agent_type = "general-purpose",
                }),
            },
        });

        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_scribe_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new SubagentStartedData
            {
                AgentName = "general-purpose",
                AgentDisplayName = "general-purpose",
                AgentDescription = "test",
                ToolCallId = "toolu_scribe_dispatch",
            },
        });

        // Tool-only turn — Content empty, ToolRequests populated.
        mapper.OnSessionEvent(new AssistantMessageEvent
        {
            AgentId = "toolu_scribe_sdk",
            Timestamp = DateTimeOffset.UtcNow,
            Data = new AssistantMessageData
            {
                Content = string.Empty,
                MessageId = Guid.NewGuid().ToString("n"),
                ToolRequests = new[]
                {
                    new AssistantMessageToolRequest { Name = "view", ToolCallId = "tc_a" },
                    new AssistantMessageToolRequest { Name = "edit", ToolCallId = "tc_b" },
                },
            },
        });

        Assert.NotNull(activity);
        var toolEvent = activity!.Events.FirstOrDefault(e => e.Name == "squad.subagent.tool_requests");
        Assert.NotEqual(default, toolEvent);
        var tags = toolEvent.Tags.ToDictionary(t => t.Key, t => t.Value);
        Assert.Equal("view,edit", tags["squad.subagent.tool_requests"]);
        Assert.Equal(2, tags["squad.subagent.tool_requests_count"]);
        // reply_preview should NOT be set (Content was empty).
        Assert.Null(activity.GetTagItem("squad.subagent.reply_preview"));
    }
}
