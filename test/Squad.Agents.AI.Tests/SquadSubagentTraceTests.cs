using System.Diagnostics;
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
}
