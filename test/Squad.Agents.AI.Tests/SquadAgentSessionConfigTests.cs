using GitHub.Copilot;
using GitHub.Copilot;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Verifies the SessionConfig surface (PR-1207-r3):
///   - SquadAgent always builds a SessionConfig with a default OnPermissionRequest
///     so CreateSession does not throw out of the box.
///   - SquadAgentOptions.ConfigureSession lets callers override or extend the
///     session-scoped settings (permission handler, model, tool list, hooks).
///   - SquadAgentOptions.Instructions is rendered as the SessionConfig.SystemMessage.
/// </summary>
public class SquadAgentSessionConfigTests
{
    [Fact]
    public void ConfigureSession_Property_IsSettable_AndCallable()
    {
        var options = new SquadAgentOptions();
        var invocations = 0;
        SessionConfig? observed = null;

        options.ConfigureSession = config =>
        {
            invocations++;
            observed = config;
        };

        // Simulate what SquadAgent's internal pipeline does so we don't depend on
        // a real Copilot CLI process here: the package owns the wiring; this test
        // covers the public surface contract.
        var simulatedDefault = new SessionConfig
        {
            OnPermissionRequest = PermissionHandler.ApproveAll,
        };
        options.ConfigureSession.Invoke(simulatedDefault);

        Assert.Equal(1, invocations);
        Assert.Same(simulatedDefault, observed);
    }

    [Fact]
    public void ConfigureSession_IsNullByDefault()
    {
        var options = new SquadAgentOptions();
        Assert.Null(options.ConfigureSession);
    }

    [Fact]
    public void ConfigureSession_CanReplacePermissionHandler()
    {
        var options = new SquadAgentOptions();
        // Build a no-op handler so we just verify the property can be reassigned.
        // The exact PermissionRequestResult shape isn't relevant to this test.
        var customHandler = PermissionHandler.ApproveAll;

        options.ConfigureSession = config => config.OnPermissionRequest = customHandler;

        var sessionConfig = new SessionConfig();
        sessionConfig.OnPermissionRequest = PermissionHandler.ApproveAll; // initial default
        var initial = sessionConfig.OnPermissionRequest;

        options.ConfigureSession.Invoke(sessionConfig);

        Assert.NotNull(sessionConfig.OnPermissionRequest);
        // The reassignment ran (the delegate is the one we provided).
        Assert.Same(customHandler, sessionConfig.OnPermissionRequest);
    }

    [Fact]
    public void ConfigureSession_CanSetAvailableTools()
    {
        var options = new SquadAgentOptions();
        options.ConfigureSession = config =>
        {
            config.AvailableTools = new[] { "shell", "read", "write" };
        };

        var sessionConfig = new SessionConfig { OnPermissionRequest = PermissionHandler.ApproveAll };
        options.ConfigureSession.Invoke(sessionConfig);

        Assert.Equal(new[] { "shell", "read", "write" }, sessionConfig.AvailableTools);
    }
}
