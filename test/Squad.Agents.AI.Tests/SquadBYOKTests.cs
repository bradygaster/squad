using System.Reflection;
using GitHub.Copilot;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Validates ConfigureCopilotClient delegate behavior and routing gate
/// (Picard Condition 1, Worf SC-3).
/// </summary>
public class SquadBYOKTests
{
    [Fact]
    public void ConfigureCopilotClient_DelegateIsInvoked()
    {
        bool delegateCalled = false;
        var agent = CreateAgent(opts =>
        {
            opts.ConfigureCopilotClient = clientOpts =>
            {
                delegateCalled = true;
            };
        });

        Assert.True(delegateCalled);
    }

    [Fact]
    public void ConfigureCopilotClient_CanSetEnvironmentOnCopilotClient()
    {
        var agent = CreateAgent(opts =>
        {
            opts.ConfigureCopilotClient = clientOpts =>
            {
                clientOpts.Environment = new Dictionary<string, string>
                {
                    ["CUSTOM_VAR"] = "custom-value"
                };
            };
        });

        var clientOptions = GetCopilotClientOptions(agent);
        var env = GetRequiredProperty<IReadOnlyDictionary<string, string>>(clientOptions, "Environment");

        Assert.Equal("custom-value", env["CUSTOM_VAR"]);
    }

    [Fact]
    public void ConfigureCopilotClient_RestoresWorkingDirectoryAfterDelegate()
    {
        var agent = CreateAgent(opts =>
        {
            opts.Cwd = @"C:\original-cwd";
            opts.ConfigureCopilotClient = clientOpts =>
            {
                // Attempt to change routing property — should be restored
                clientOpts.WorkingDirectory = @"C:\hijacked-cwd";
            };
        });

        var clientOptions = GetCopilotClientOptions(agent);
        var workingDirectory = GetRequiredProperty<string>(clientOptions, "WorkingDirectory");

        Assert.Equal(@"C:\original-cwd", workingDirectory);
    }

    [Fact]
    public void ConfigureCopilotClient_RestoresConnectionAfterDelegate()
    {
        // SDK 1.0.0 collapsed CliPath/CliArgs into Connection (RuntimeConnection).
        // The routing gate now snapshots and restores the Connection reference.
        var agent = CreateAgent(opts =>
        {
            opts.CliPath = @"C:\original\copilot.exe";
            opts.CliArgs.Add("--extension");
            opts.CliArgs.Add("squad");
            opts.ConfigureCopilotClient = clientOpts =>
            {
                clientOpts.Connection = RuntimeConnection.ForStdio(@"C:\hijacked\evil.exe", new List<string> { "--hijacked" });
            };
        });

        var clientOptions = GetCopilotClientOptions(agent);
        var connection = GetRequiredProperty<object>(clientOptions, "Connection");
        var path = GetProperty<string>(connection, "Path");
        var args = GetProperty<IList<string>>(connection, "Args");

        Assert.Equal(@"C:\original\copilot.exe", path);
        Assert.NotNull(args);
        Assert.Contains("--extension", args);
        Assert.Contains("squad", args);
        Assert.DoesNotContain("--hijacked", args);
    }

    [Fact]
    public void ConfigureCopilotClient_AllowsTokenOverride()
    {
        var agent = CreateAgent(opts =>
        {
            opts.GitHubToken = "original-token";
            opts.ConfigureCopilotClient = clientOpts =>
            {
                // Token override IS allowed (BYOK use case)
                clientOpts.GitHubToken = "byok-token";
            };
        });

        var clientOptions = GetCopilotClientOptions(agent);
        var token = GetProperty<string>(clientOptions, "GitHubToken");

        Assert.Equal("byok-token", token);
    }

    [Fact]
    public void ConfigureCopilotClient_NullDelegate_DoesNotThrow()
    {
        var agent = CreateAgent(opts =>
        {
            opts.ConfigureCopilotClient = null;
        });

        Assert.NotNull(agent);
    }

    private static SquadAgent CreateAgent(Action<SquadAgentOptions>? configure = null)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent(options =>
        {
            options.AgentName = "BYOK Test";
            options.SquadFolderPath = @"C:\squad-team-root";
            options.CliPath = @"C:\fake-copilot\copilot.exe";
            options.Cwd = @"C:\squad-team-root";
            options.GitHubToken = "test-token";
            options.CliArgs.Add("--extension");
            options.CliArgs.Add("squad");

            configure?.Invoke(options);
        });

        return services.BuildServiceProvider().GetRequiredService<SquadAgent>();
    }

    private static object GetCopilotClientOptions(SquadAgent agent)
    {
        var client = GetRequiredField<object>(agent, "_copilotClient");
        return GetRequiredField<object>(client, "_options");
    }

    private static T GetRequiredField<T>(object instance, string fieldName)
    {
        var field = instance.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(field);
        var value = field.GetValue(instance);
        Assert.NotNull(value);
        return (T)value;
    }

    private static T GetRequiredProperty<T>(object instance, string propertyName)
    {
        var value = GetProperty<T>(instance, propertyName);
        Assert.NotNull(value);
        return value;
    }

    private static T? GetProperty<T>(object instance, string propertyName)
    {
        var property = instance.GetType().GetProperty(
            propertyName,
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(property);
        return (T?)property.GetValue(instance);
    }
}
