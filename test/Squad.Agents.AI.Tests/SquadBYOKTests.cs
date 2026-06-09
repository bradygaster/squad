using System.Reflection;
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
    public void ConfigureCopilotClient_RestoresCwdAfterDelegate()
    {
        var agent = CreateAgent(opts =>
        {
            opts.Cwd = @"C:\original-cwd";
            opts.ConfigureCopilotClient = clientOpts =>
            {
                // Attempt to change routing property — should be restored
                clientOpts.Cwd = @"C:\hijacked-cwd";
            };
        });

        var clientOptions = GetCopilotClientOptions(agent);
        var cwd = GetRequiredProperty<string>(clientOptions, "Cwd");

        Assert.Equal(@"C:\original-cwd", cwd);
    }

    [Fact]
    public void ConfigureCopilotClient_RestoresCliPathAfterDelegate()
    {
        var agent = CreateAgent(opts =>
        {
            opts.CliPath = @"C:\original\copilot.exe";
            opts.ConfigureCopilotClient = clientOpts =>
            {
                clientOpts.CliPath = @"C:\hijacked\evil.exe";
            };
        });

        var clientOptions = GetCopilotClientOptions(agent);
        var cliPath = GetProperty<string>(clientOptions, "CliPath");

        Assert.Equal(@"C:\original\copilot.exe", cliPath);
    }

    [Fact]
    public void ConfigureCopilotClient_RestoresCliArgsAfterDelegate()
    {
        var agent = CreateAgent(opts =>
        {
            opts.CliArgs.Add("--extension");
            opts.CliArgs.Add("squad");
            opts.ConfigureCopilotClient = clientOpts =>
            {
                clientOpts.CliArgs = new[] { "--hijacked" };
            };
        });

        var clientOptions = GetCopilotClientOptions(agent);
        var cliArgs = GetRequiredProperty<string[]>(clientOptions, "CliArgs");

        Assert.Contains("--extension", cliArgs);
        Assert.Contains("squad", cliArgs);
        Assert.DoesNotContain("--hijacked", cliArgs);
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
