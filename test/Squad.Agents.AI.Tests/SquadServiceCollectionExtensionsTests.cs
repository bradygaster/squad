using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace Squad.Agents.AI.Tests;

public class SquadServiceCollectionExtensionsTests
{
    [Fact]
    public void AddSquadAgent_WithoutConfig_RegistersAIAgent()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent();

        var provider = services.BuildServiceProvider();
        var agent = provider.GetService<SquadAgent>();

        Assert.NotNull(agent);
    }

    [Fact]
    public void AddSquadAgent_WithConnectionString_BindsSquadFolderPath()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:squad"] = @"C:\team-root"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent();

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<SquadAgentOptions>>().Value;

        Assert.Equal(@"C:\team-root", options.SquadFolderPath);
        Assert.Equal(@"C:\team-root", options.Cwd);
    }

    [Fact]
    public void AddSquadAgent_UserCallbackOverridesConnectionString()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:squad"] = @"C:\team-root"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent(opts =>
        {
            opts.SquadFolderPath = @"C:\user-override";
        });

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<SquadAgentOptions>>().Value;

        Assert.Equal(@"C:\user-override", options.SquadFolderPath);
    }

    [Fact]
    public void AddSquadAgent_WithUriConnectionString_ParsesAllFields()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:squad"] = "squad://localhost?teamRoot=C:%5Cteam&cliPath=C:%5Cbin%5Ccopilot.exe"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent();

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<SquadAgentOptions>>().Value;

        Assert.Equal(@"C:\team", options.SquadFolderPath);
        Assert.Equal(@"C:\bin\copilot.exe", options.CliPath);
    }

    [Fact]
    public void AddSquadAgent_WithNoConnectionString_DoesNotThrow()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent();

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<SquadAgentOptions>>().Value;

        // Should get default SquadAgentOptions
        Assert.Null(options.SquadFolderPath);
    }

    [Fact]
    public void AddSquadAgent_MergesCliArgsFromConnectionString()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:squad"] = "squad://localhost?teamRoot=/team&cliArgs=--verbose"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSquadAgent(opts =>
        {
            opts.CliArgs.Add("--user-arg");
        });

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<SquadAgentOptions>>().Value;

        Assert.Contains("--verbose", options.CliArgs);
        Assert.Contains("--user-arg", options.CliArgs);
    }
}
