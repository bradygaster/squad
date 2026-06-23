using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Tests for the 0.5.x behaviour where SquadAgent auto-injects
/// <c>--agent {AgentFileName}</c> into the underlying copilot.exe CLI args, so
/// the wrapped agent picks up <c>.github/agents/squad.agent.md</c> by default
/// — matching <c>copilot --agent squad</c> from a terminal.
/// </summary>
/// <remarks>
/// Note: an earlier 0.5.0 attempt set <c>SessionConfig.Agent</c> instead, which
/// turned out to look up the name in the SDK's <c>CustomAgents</c> registry
/// rather than from <c>.github/agents/*.agent.md</c> on disk (produces
/// <c>Custom agent 'squad' not found</c>). The CLI's <c>--agent</c> flag is
/// currently the only path that reads the on-disk agent definition, so 0.5.1
/// reverts to the CLI-args approach.
/// </remarks>
public class SquadAgentDefaultAgentFlagTests : IDisposable
{
    private readonly string _tempRoot;

    public SquadAgentDefaultAgentFlagTests()
    {
        // Each test gets its own throwaway team root so file-existence checks
        // are deterministic and we can scaffold or omit the squad.agent.md file
        // per scenario without contaminating siblings.
        _tempRoot = Path.Combine(Path.GetTempPath(), "squad-agents-ai-tests", Guid.NewGuid().ToString("n"));
        Directory.CreateDirectory(_tempRoot);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, recursive: true); }
        catch { /* best effort */ }
    }

    private string ScaffoldAgentFile(string agentName)
    {
        var dir = Path.Combine(_tempRoot, ".github", "agents");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"{agentName}.agent.md");
        File.WriteAllText(path, $"# {agentName}\n\nstub agent file for tests");
        return path;
    }

    [Fact]
    public void Options_AgentFileName_DefaultsToSquad()
    {
        var options = new SquadAgentOptions();
        Assert.Equal("squad", options.AgentFileName);
    }

    [Fact]
    public void AddSquadAgent_AutoInjectsAgentSquad_WhenSquadAgentMdExists()
    {
        ScaffoldAgentFile("squad");

        var agent = CreateAgent(opts =>
        {
            opts.SquadFolderPath = _tempRoot;
            opts.Cwd = _tempRoot;
        });

        var args = GetConnectionArgs(agent);
        AssertContainsAgent(args, "squad");
    }

    [Fact]
    public void AddSquadAgent_DoesNotInjectAgent_WhenAgentFileMissing()
    {
        // No .github/agents/squad.agent.md scaffolded — the SDK should NOT
        // pass --agent squad because the CLI would error on a missing file.
        var agent = CreateAgent(opts =>
        {
            opts.SquadFolderPath = _tempRoot;
            opts.Cwd = _tempRoot;
        });

        var args = GetConnectionArgs(agent);
        Assert.DoesNotContain("--agent", args);
    }

    [Fact]
    public void AddSquadAgent_RespectsExplicitAgentInCliArgs()
    {
        // Scaffold the default file so we'd auto-inject if the consumer hadn't
        // already supplied --agent.
        ScaffoldAgentFile("squad");
        ScaffoldAgentFile("data");

        var agent = CreateAgent(opts =>
        {
            opts.SquadFolderPath = _tempRoot;
            opts.Cwd = _tempRoot;
            opts.CliArgs.Add("--agent");
            opts.CliArgs.Add("data");
        });

        var args = GetConnectionArgs(agent);

        // Exactly ONE --agent in the args, and it's "data" (the user-supplied one).
        var agentIndices = args.Select((a, i) => (a, i))
                                .Where(t => string.Equals(t.a, "--agent", StringComparison.OrdinalIgnoreCase))
                                .Select(t => t.i)
                                .ToList();
        Assert.Single(agentIndices);
        Assert.Equal("data", args[agentIndices[0] + 1]);
    }

    [Fact]
    public void AddSquadAgent_RespectsCustomAgentFileName_WhenFileExists()
    {
        ScaffoldAgentFile("data");

        var agent = CreateAgent(opts =>
        {
            opts.SquadFolderPath = _tempRoot;
            opts.Cwd = _tempRoot;
            opts.AgentFileName = "data";
        });

        var args = GetConnectionArgs(agent);
        AssertContainsAgent(args, "data");
    }

    [Fact]
    public void AddSquadAgent_DoesNotInjectAgent_WhenAgentFileNameIsNull()
    {
        // Opt-out: setting AgentFileName=null disables the auto-inject even if
        // squad.agent.md exists. Used when the consumer wants to drive the
        // session with a custom SystemMessage instead of a charter file.
        ScaffoldAgentFile("squad");

        var agent = CreateAgent(opts =>
        {
            opts.SquadFolderPath = _tempRoot;
            opts.Cwd = _tempRoot;
            opts.AgentFileName = null;
        });

        var args = GetConnectionArgs(agent);
        Assert.DoesNotContain("--agent", args);
    }

    [Fact]
    public void AddSquadAgent_DoesNotInjectAgent_WhenAgentFileNameIsWhitespace()
    {
        ScaffoldAgentFile("squad");

        var agent = CreateAgent(opts =>
        {
            opts.SquadFolderPath = _tempRoot;
            opts.Cwd = _tempRoot;
            opts.AgentFileName = "   ";
        });

        var args = GetConnectionArgs(agent);
        Assert.DoesNotContain("--agent", args);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static SquadAgent CreateAgent(Action<SquadAgentOptions> configure)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddLogging();
        services.AddSquadAgent(opts =>
        {
            opts.CliPath = @"C:\fake-copilot\copilot.exe";
            configure(opts);
        });
        return services.BuildServiceProvider().GetRequiredService<SquadAgent>();
    }

    private static IList<string> GetConnectionArgs(SquadAgent agent)
    {
        var client = GetField<object>(agent, "_copilotClient");
        var clientOptions = GetField<object>(client, "_options");
        var connection = GetProperty<object>(clientOptions, "Connection");
        Assert.NotNull(connection);
        var args = GetProperty<IList<string>>(connection!, "Args");
        Assert.NotNull(args);
        return args!;
    }

    private static void AssertContainsAgent(IList<string> args, string expectedName)
    {
        // CLI args must be a `--agent <name>` adjacent pair, not just two unrelated tokens.
        for (var i = 0; i < args.Count - 1; i++)
        {
            if (string.Equals(args[i], "--agent", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(args[i + 1], expectedName, StringComparison.Ordinal))
            {
                return;
            }
        }
        Assert.Fail($"Expected `--agent {expectedName}` in CLI args; got: [{string.Join(", ", args)}]");
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
