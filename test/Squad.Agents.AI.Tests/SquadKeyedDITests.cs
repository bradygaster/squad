using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Validates keyed DI registration and resolution (Round 2 feature).
/// </summary>
public class SquadKeyedDITests
{
    [Fact]
    public void AddKeyedSquadAgent_ResolvesViaKeyedService()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedSquadAgent("research", opts =>
        {
            opts.SquadFolderPath = @"C:\research-team";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var agent = provider.GetRequiredKeyedService<SquadAgent>("research");

        Assert.NotNull(agent);
        Assert.Equal("Squad", agent.Name);
    }

    [Fact]
    public void AddKeyedSquadAgent_TwoKeys_ResolveSeparately()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedSquadAgent("research", opts =>
        {
            opts.AgentName = "Research Squad";
            opts.SquadFolderPath = @"C:\research";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });
        services.AddKeyedSquadAgent("platform", opts =>
        {
            opts.AgentName = "Platform Squad";
            opts.SquadFolderPath = @"C:\platform";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var research = provider.GetRequiredKeyedService<SquadAgent>("research");
        var platform = provider.GetRequiredKeyedService<SquadAgent>("platform");

        Assert.Equal("Research Squad", research.Name);
        Assert.Equal("Platform Squad", platform.Name);
    }

    [Fact]
    public void AddKeyedSquadAgent_WithConnectionString_BindsOptions()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:squad-research"] = @"C:\conn-str-team"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedSquadAgent("research", opts =>
        {
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var agent = provider.GetRequiredKeyedService<SquadAgent>("research");

        Assert.NotNull(agent);
    }

    [Fact]
    public void AddKeyedSquadAgent_DoesNotRegisterNonKeyed()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedSquadAgent("research", opts =>
        {
            opts.SquadFolderPath = @"C:\research";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var nonKeyed = provider.GetService<SquadAgent>();

        // Keyed registration should NOT be resolvable via non-keyed
        Assert.Null(nonKeyed);
    }

    [Fact]
    public void AddKeyedSquadAgent_ThrowsOnNullOrWhitespaceKey()
    {
        var services = new ServiceCollection();

        Assert.Throws<ArgumentException>(() =>
            services.AddKeyedSquadAgent("", opts => { }));

        Assert.Throws<ArgumentException>(() =>
            services.AddKeyedSquadAgent("   ", opts => { }));
    }
}
