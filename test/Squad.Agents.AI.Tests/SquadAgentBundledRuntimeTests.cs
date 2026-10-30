using System.Reflection;
using Microsoft.Agents.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Without <see cref="SquadAgentOptions.CliPath"/>, the SDK launches its bundled
/// <c>copilot-runtime</c> embedded host, which rejects interactive-CLI flags such as
/// <c>--allow-all</c> and <c>--agent</c> and requires an extension SDK path when
/// standalone extensions are requested. These tests pin the bundled-runtime defaults
/// and confirm the full-CLI defaults still apply when a custom CLI path is configured.
/// </summary>
public class SquadAgentBundledRuntimeTests : IDisposable
{
    private readonly string _tempRoot;

    public SquadAgentBundledRuntimeTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "squad-agents-ai-tests", Guid.NewGuid().ToString("n"));
        var agentsDir = Path.Combine(_tempRoot, ".github", "agents");
        Directory.CreateDirectory(agentsDir);
        File.WriteAllText(Path.Combine(agentsDir, "squad.agent.md"), "# squad\n\nstub agent file for tests");
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, recursive: true); }
        catch { /* best effort */ }
    }

    [Fact]
    public void BundledRuntime_DoesNotOverrideConnection_WhenNoCliArgsSupplied()
    {
        var agent = CreateAgent(cliPath: null);

        var clientOptions = GetCopilotClientOptions(agent);

        Assert.Null(GetProperty<object>(clientOptions, "Connection"));
    }

    [Fact]
    public void BundledRuntime_PassesHostCliArgsVerbatim()
    {
        var agent = CreateAgent(cliPath: null, opts =>
        {
            opts.CliArgs.Add("--log-level");
            opts.CliArgs.Add("debug");
        });

        var args = GetConnectionArgs(agent);

        Assert.Equal(new[] { "--log-level", "debug" }, args);
    }

    [Fact]
    public void BundledRuntime_DisablesStandaloneExtensions()
    {
        var agent = CreateAgent(cliPath: null);

        var sessionConfig = GetInnerSessionConfig(agent);

        Assert.Equal(false, GetProperty<bool?>(sessionConfig, "RequestExtensions"));
        Assert.Equal("Squad", GetProperty<string>(sessionConfig, "Agent"));
        Assert.Equal(true, GetProperty<bool?>(sessionConfig, "EnableConfigDiscovery"));
    }

    [Fact]
    public void FullCli_KeepsPermissionAndAgentDefaults()
    {
        var agent = CreateAgent(cliPath: @"C:\fake-copilot\copilot.exe");

        var args = GetConnectionArgs(agent);
        var sessionConfig = GetInnerSessionConfig(agent);

        Assert.Equal(new[] { "--allow-all", "--agent", "squad" }, args);
        Assert.Null(GetProperty<bool?>(sessionConfig, "RequestExtensions"));
    }

    [Fact]
    public void BundledRuntime_ConfigureSessionCanReenableExtensions()
    {
        var agent = CreateAgent(cliPath: null, opts =>
        {
            opts.ConfigureSession = sc =>
                sc.GetType().GetProperty("RequestExtensions")!.SetValue(sc, (bool?)true);
        });

        var sessionConfig = GetInnerSessionConfig(agent);

        Assert.Equal(true, GetProperty<bool?>(sessionConfig, "RequestExtensions"));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private SquadAgent CreateAgent(string? cliPath, Action<SquadAgentOptions>? configure = null)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddLogging();
        services.AddSquadAgent(opts =>
        {
            opts.SquadFolderPath = _tempRoot;
            opts.Cwd = _tempRoot;
            opts.CliPath = cliPath;
            opts.GitHubToken = "test-token";
            configure?.Invoke(opts);
        });
        return services.BuildServiceProvider().GetRequiredService<SquadAgent>();
    }

    private static object GetCopilotClientOptions(SquadAgent agent)
    {
        var client = GetField<object>(agent, "_copilotClient");
        return GetField<object>(client, "_options");
    }

    private static IList<string> GetConnectionArgs(SquadAgent agent)
    {
        var connection = GetProperty<object>(GetCopilotClientOptions(agent), "Connection");
        Assert.NotNull(connection);
        var args = GetProperty<IList<string>>(connection!, "Args");
        Assert.NotNull(args);
        return args!;
    }

    private static object GetInnerSessionConfig(SquadAgent agent)
    {
        var innerProp = typeof(DelegatingAIAgent).GetProperty(
            "InnerAgent",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(innerProp);
        var inner = innerProp!.GetValue(agent);
        Assert.NotNull(inner);
        return GetField<object>(inner!, "_sessionConfig");
    }

    private static T GetField<T>(object instance, string fieldName)
    {
        var f = instance.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(f);
        var v = f!.GetValue(instance);
        Assert.NotNull(v);
        return (T)v!;
    }

    private static T? GetProperty<T>(object instance, string propertyName)
    {
        var p = instance.GetType().GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        Assert.NotNull(p);
        return (T?)p!.GetValue(instance);
    }
}
