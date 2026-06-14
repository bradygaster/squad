using System.Diagnostics;
using GitHub.Copilot;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Tests for the 0.4.0 behaviours added on top of 0.3.0's typed-trace surface:
///   - EmitSubagentActivities option (default-on telemetry, opt-out without losing callback)
///   - ActivityEvents on the live subagent span (start / message / completed / failed)
///   - Aspire-style direct connection-string name lookup (ConnectionStrings:{name})
///     with a legacy fallback to ConnectionStrings:squad-{name}
/// </summary>
[Collection("SquadActivityListeners")]
public class SquadAgentDefaultObservabilityTests
{
    private static SubagentStartedData StartedData(string name) => new()
    {
        AgentName = name,
        AgentDisplayName = name,
        AgentDescription = $"{name} test agent",
        ToolCallId = $"toolu_{name.ToLowerInvariant()}",
    };

    private static SubagentCompletedData CompletedData(string name) => new()
    {
        AgentName = name,
        AgentDisplayName = name,
        ToolCallId = $"toolu_{name.ToLowerInvariant()}",
    };

    private static SubagentFailedData FailedData(string name) => new()
    {
        AgentName = name,
        AgentDisplayName = name,
        ToolCallId = $"toolu_{name.ToLowerInvariant()}",
        Error = "test failure",
    };

    private static AssistantMessageData AssistantData(string content) => new()
    {
        Content = content,
        MessageId = Guid.NewGuid().ToString("n"),
    };

    // ── EmitSubagentActivities option ───────────────────────────────────────

    [Fact]
    public void Mapper_EmitsActivities_ByDefault_EvenWhenOnTraceIsNull()
    {
        Activity? started = null;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = a => started = a,
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(onTrace: null, emitActivities: true);
        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_default_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = StartedData("Morpheus"),
        });

        Assert.NotNull(started);
        Assert.Equal("squad.subagent Morpheus", started!.OperationName);
    }

    [Fact]
    public void Mapper_DoesNotEmitActivities_WhenEmitActivitiesIsFalse_ButStillFiresCallback()
    {
        var callbackInvoked = false;
        var activityStarted = false;
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = _ => activityStarted = true,
        };
        ActivitySource.AddActivityListener(listener);

        using var mapper = new SquadSubagentTraceMapper(
            onTrace: _ => callbackInvoked = true,
            emitActivities: false);

        mapper.OnSessionEvent(new SubagentStartedEvent
        {
            AgentId = "toolu_optout_1",
            Timestamp = DateTimeOffset.UtcNow,
            Data = StartedData("Trinity"),
        });

        Assert.True(callbackInvoked, "Consumer callback must still fire when activities are disabled.");
        Assert.False(activityStarted, "No span should be created when EmitSubagentActivities is false.");
    }

    [Fact]
    public void Options_EmitSubagentActivities_DefaultsToTrue()
    {
        var options = new SquadAgentOptions();
        Assert.True(options.EmitSubagentActivities);
    }

    // ── ActivityEvents at every lifecycle boundary ──────────────────────────

    [Fact]
    public void Mapper_AddsStartEvent_OnSubagentStarted()
    {
        var events = CollectEvents(() =>
        {
            using var mapper = new SquadSubagentTraceMapper(onTrace: null, emitActivities: true);
            mapper.OnSessionEvent(new SubagentStartedEvent
            {
                AgentId = "toolu_evt_start",
                Timestamp = DateTimeOffset.UtcNow,
                Data = StartedData("Oracle"),
            });
            mapper.Dispose();
        });

        Assert.Contains(events, e => e.Name == "squad.subagent.start");
    }

    [Fact]
    public void Mapper_AddsMessageEvent_OnAssistantMessage_WithPreviewTag()
    {
        var events = CollectEvents(() =>
        {
            using var mapper = new SquadSubagentTraceMapper(onTrace: null, emitActivities: true);
            mapper.OnSessionEvent(new SubagentStartedEvent
            {
                AgentId = "toolu_evt_msg",
                Timestamp = DateTimeOffset.UtcNow,
                Data = StartedData("Tank"),
            });
            mapper.OnSessionEvent(new AssistantMessageEvent
            {
                AgentId = "toolu_evt_msg",
                Timestamp = DateTimeOffset.UtcNow,
                Data = AssistantData("running the program now"),
            });
            mapper.OnSessionEvent(new SubagentCompletedEvent
            {
                AgentId = "toolu_evt_msg",
                Timestamp = DateTimeOffset.UtcNow,
                Data = CompletedData("Tank"),
            });
        });

        var msgEvent = events.FirstOrDefault(e => e.Name == "squad.subagent.message");
        Assert.NotEqual(default, msgEvent);
        var preview = msgEvent.Tags.FirstOrDefault(kv => kv.Key == "squad.subagent.message_preview").Value;
        Assert.Equal("running the program now", preview);
    }

    [Fact]
    public void Mapper_AddsCompletedEvent_OnSubagentCompleted()
    {
        var events = CollectEvents(() =>
        {
            using var mapper = new SquadSubagentTraceMapper(onTrace: null, emitActivities: true);
            mapper.OnSessionEvent(new SubagentStartedEvent
            {
                AgentId = "toolu_evt_ok",
                Timestamp = DateTimeOffset.UtcNow,
                Data = StartedData("Picard"),
            });
            mapper.OnSessionEvent(new SubagentCompletedEvent
            {
                AgentId = "toolu_evt_ok",
                Timestamp = DateTimeOffset.UtcNow,
                Data = CompletedData("Picard"),
            });
        });

        Assert.Contains(events, e => e.Name == "squad.subagent.completed");
    }

    [Fact]
    public void Mapper_AddsFailedEvent_OnSubagentFailed()
    {
        var events = CollectEvents(() =>
        {
            using var mapper = new SquadSubagentTraceMapper(onTrace: null, emitActivities: true);
            mapper.OnSessionEvent(new SubagentStartedEvent
            {
                AgentId = "toolu_evt_fail",
                Timestamp = DateTimeOffset.UtcNow,
                Data = StartedData("Worf"),
            });
            mapper.OnSessionEvent(new SubagentFailedEvent
            {
                AgentId = "toolu_evt_fail",
                Timestamp = DateTimeOffset.UtcNow,
                Data = FailedData("Worf"),
            });
        });

        Assert.Contains(events, e => e.Name == "squad.subagent.failed");
    }

    private static List<ActivityEvent> CollectEvents(Action action)
    {
        var allEvents = new List<ActivityEvent>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = a => allEvents.AddRange(a.Events),
        };
        ActivitySource.AddActivityListener(listener);

        action();
        return allEvents;
    }

    // ── Connection-string lookup chain ──────────────────────────────────────

    [Fact]
    public void Configurator_PrefersDirectNameOverPrefixedName_AspireStyle()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:research-squad"] = @"C:\aspire-research",
                ["ConnectionStrings:squad-research-squad"] = @"C:\legacy-fallback",
            })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSquadAgent("research-squad");

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptionsMonitor<SquadAgentOptions>>().Get("research-squad");

        Assert.Equal(@"C:\aspire-research", options.SquadFolderPath);
    }

    [Fact]
    public void Configurator_FallsBackToLegacyPrefixedName_WhenDirectNameMissing()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:squad-research"] = @"C:\legacy-team",
            })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSquadAgent("research");

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptionsMonitor<SquadAgentOptions>>().Get("research");

        Assert.Equal(@"C:\legacy-team", options.SquadFolderPath);
    }

    [Fact]
    public void KeyedConfigurator_PrefersDirectNameOverPrefixedName_AspireStyle()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:dev-squad"] = @"C:\aspire-dev",
                ["ConnectionStrings:squad-dev-squad"] = @"C:\should-not-win",
            })
            .Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddKeyedSquadAgent("dev-squad");

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptionsMonitor<SquadAgentOptions>>().Get("dev-squad");

        Assert.Equal(@"C:\aspire-dev", options.SquadFolderPath);
    }
}
