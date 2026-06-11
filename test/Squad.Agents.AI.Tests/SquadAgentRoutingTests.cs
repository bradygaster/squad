using System.Reflection;
using Microsoft.Agents.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Squad.Agents.AI.Tests;

public class SquadAgentRoutingTests
{
    [Fact]
    public void AddSquadAgent_ResolvesAIAgentWithConfiguredPersonaName()
    {
        var provider = BuildProvider(options =>
        {
            options.AgentName = "Custom Coordinator";
        });

        var agent = provider.GetRequiredService<AIAgent>();
        var squadAgent = Assert.IsType<SquadAgent>(agent);

        Assert.Equal("Custom Coordinator", squadAgent.Name);
    }

    [Fact]
    public void AddSquadAgent_PassesBoundaryInstructionsToInnerSessionConfig()
    {
        const string instructions = "You are a coordinator. Stay inside the configured boundary.";
        var agent = CreateAgent(options =>
        {
            options.Instructions = instructions;
        });

        var sessionConfig = GetInnerSessionConfig(agent);
        var systemMessage = GetRequiredProperty<object>(sessionConfig, "SystemMessage");

        Assert.Equal(instructions, GetRequiredProperty<string>(systemMessage, "Content"));
    }

    [Fact]
    public void AddSquadAgent_UsesExplicitCwdForCopilotClientRouting()
    {
        var agent = CreateAgent(options =>
        {
            options.SquadFolderPath = @"C:\squad-team-root";
            options.Cwd = @"C:\isolated-working-directory";
        });

        var clientOptions = GetCopilotClientOptions(agent);

        Assert.Equal(@"C:\isolated-working-directory", GetRequiredProperty<string>(clientOptions, "WorkingDirectory"));
    }

    [Fact]
    public void AddSquadAgent_DefaultsCopilotClientCwdToSquadFolderPath()
    {
        var agent = CreateAgent(options =>
        {
            options.SquadFolderPath = @"C:\squad-team-root";
            options.Cwd = null;
        });

        var clientOptions = GetCopilotClientOptions(agent);

        Assert.Equal(@"C:\squad-team-root", GetRequiredProperty<string>(clientOptions, "WorkingDirectory"));
    }

    [Fact]
    public void AddSquadAgent_RoutesThroughCopilotClientOptionsNotAgentName()
    {
        var agent = CreateAgent(options =>
        {
            options.AgentName = "Custom Persona";
            options.CliArgs.Clear();
            options.CliArgs.Add("--extension");
            options.CliArgs.Add("squad");
            options.Environment["SQUAD_ROUTE"] = "enabled";
        });

        var inner = GetInnerAgent(agent);
        var sessionConfig = GetInnerSessionConfig(agent);
        var clientOptions = GetCopilotClientOptions(agent);
        var cliArgs = GetConnectionArgs(clientOptions);
        var environment = GetRequiredProperty<IReadOnlyDictionary<string, string>>(clientOptions, "Environment");

        Assert.Equal("Custom Persona", GetRequiredProperty<string>(inner, "Name"));
        Assert.True(string.IsNullOrEmpty(GetProperty<string>(sessionConfig, "Agent")));
        Assert.DoesNotContain("Custom Persona", cliArgs);
        Assert.Equal("enabled", environment["SQUAD_ROUTE"]);
    }

    [Fact]
    public void AddSquadAgent_CopiesConnectionStringCliArgsToCopilotClientOptions()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:squad"] = "squad://localhost?teamRoot=C:%5Csquad-team-root&cliArgs=--yolo;--model;gpt-5"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent(options =>
        {
            options.CliPath = @"C:\fake-copilot\copilot.exe";
            options.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var agent = provider.GetRequiredService<SquadAgent>();
        var clientOptions = GetCopilotClientOptions(agent);
        var cliArgs = GetConnectionArgs(clientOptions);

        Assert.Equal(new[] { "--yolo", "--model", "gpt-5" }, cliArgs);
    }

    private static SquadAgent CreateAgent(Action<SquadAgentOptions>? configure = null)
    {
        var provider = BuildProvider(configure);
        return provider.GetRequiredService<SquadAgent>();
    }

    private static ServiceProvider BuildProvider(Action<SquadAgentOptions>? configure = null)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent(options =>
        {
            options.AgentName = "Squad";
            options.SquadFolderPath = @"C:\squad-team-root";
            options.CliPath = @"C:\fake-copilot\copilot.exe";
            options.Cwd = @"C:\squad-team-root";
            options.GitHubToken = "test-token";
            options.CliArgs.Add("--extension");
            options.CliArgs.Add("squad");
            options.Environment["SQUAD_TEST"] = "true";
            options.Instructions = "Default test boundary instructions.";

            configure?.Invoke(options);
        });

        return services.BuildServiceProvider();
    }

    private static object GetCopilotClientOptions(SquadAgent agent)
    {
        var client = GetRequiredField<object>(agent, "_copilotClient");
        return GetRequiredField<object>(client, "_options");
    }

    /// <summary>
    /// In SDK 1.0.0 the CLI args live inside CopilotClientOptions.Connection (a
    /// RuntimeConnection — concrete type ChildProcessRuntimeConnection — exposing
    /// .Path and .Args). Older tests asserted against a flat clientOptions.CliArgs
    /// property; this helper hides the unwrap so each test stays readable.
    /// </summary>
    private static IList<string> GetConnectionArgs(object clientOptions)
    {
        var connection = GetRequiredProperty<object>(clientOptions, "Connection");
        var args = GetProperty<IList<string>>(connection, "Args");
        Assert.NotNull(args);
        return args!;
    }

    private static object GetInnerAgent(SquadAgent agent)
    {
        // InnerAgent is protected on DelegatingAIAgent; search the declaring base type.
        var prop = typeof(DelegatingAIAgent).GetProperty(
            "InnerAgent",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(prop);
        var value = prop.GetValue(agent);
        Assert.NotNull(value);
        return value!;
    }

    private static object GetInnerSessionConfig(SquadAgent agent)
    {
        var inner = GetInnerAgent(agent);
        return GetRequiredField<object>(inner, "_sessionConfig");
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
