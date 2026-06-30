// ============================================================
//  Squad.Agents.AI — Sample application
//
//  Demonstrates five distinct integration patterns:
//    Flow 1 — Basic DI registration and a single prompt
//    Flow 2 — Keyed DI with two agents under different service keys
//    Flow 3 — BYOK / ConfigureCopilotClient delegate
//    Flow 4 — Streaming via RunStreamingAsync
//    Flow 5 — Subagent dispatch + OpenTelemetry observability
//
//  Run: dotnet run --project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/
//  Run one flow: dotnet run --project src/Squad.Agents.AI/samples/Squad.Agents.AI.Sample/ -- --flow=1
// ============================================================

using System.Diagnostics;
using Microsoft.Agents.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Squad.Agents.AI;

// ── Argument parsing ─────────────────────────────────────────────────────────
int? selectedFlow = null;
foreach (var arg in args)
{
    if (arg.StartsWith("--flow=", StringComparison.OrdinalIgnoreCase) &&
        int.TryParse(arg["--flow=".Length..], out var n) &&
        n is >= 1 and <= 5)
    {
        selectedFlow = n;
    }
}

bool RunFlow(int flow) => selectedFlow is null || selectedFlow == flow;

// Squad team root: read from env var or fall back to current directory.
// Real-world usage: set SQUAD_TEAM_ROOT to the path of an initialized Squad team.
var teamRoot = System.Environment.GetEnvironmentVariable("SQUAD_TEAM_ROOT")
               ?? System.IO.Directory.GetCurrentDirectory();
PrintBanner($"Squad.Agents.AI v0.1 — sample run (team root: {teamRoot})");
Console.WriteLine();

// ─────────────────────────────────────────────────────────────────────────────
// Flow 1: Basic DI registration — simplest path to running an agent
// ─────────────────────────────────────────────────────────────────────────────
if (RunFlow(1))
{
    PrintHeader("Flow 1 — Basic DI registration");

    var host1 = Host.CreateApplicationBuilder(args);
    host1.Logging.SetMinimumLevel(LogLevel.Warning); // keep sample output clean
    host1.Services.AddSquadAgent(o =>
    {
        o.SquadFolderPath = @"C:\Users\tamirdresher\source\repos\squad-squad";
        o.AgentName = "SampleSquad";
        o.EmitSubagentActivities = true;
        o.Instructions = "You are a helpful assistant. Respond concisely. and ask each subagent for their input before providing a final answer.";
        o.OnSubagentTrace = evt =>
        {
            switch (evt.Kind)
            {
                case SquadAgentTraceEventKind.SubagentDispatched:
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine($"  [dispatch] persona={evt.DispatchedPersonaName} agent_type={evt.DispatchedAgentType}");
                    Console.WriteLine($"             description={Trim(evt.DispatchedPersonaDescription, 100)}");
                    Console.WriteLine($"             prompt={Trim(evt.DispatchedPrompt, 80)}");
                    Console.ResetColor();
                    break;
                case SquadAgentTraceEventKind.SubagentStarted:
                    Console.WriteLine($"  [started ] {ShortId(evt.SdkAgentId)} catalog_name={evt.SubagentName}");
                    break;
                case SquadAgentTraceEventKind.AssistantMessage when evt.SdkAgentId is not null:
                {
                    var hasText = !string.IsNullOrWhiteSpace(evt.Content);
                    var hasTools = evt.RequestedToolNames.Count > 0;
                    if (!hasText && !hasTools) break; // skip empty SDK chatter
                    var prefix = $"  [reply   ] {ShortId(evt.SdkAgentId)} ";
                    if (hasText)
                    {
                        Console.WriteLine($"{prefix}{Trim(evt.Content, 120)}");
                    }
                    if (hasTools)
                    {
                        Console.ForegroundColor = ConsoleColor.DarkGray;
                        Console.WriteLine($"{prefix}(calls: {string.Join(", ", evt.RequestedToolNames)})");
                        Console.ResetColor();
                    }
                    break;
                }
                case SquadAgentTraceEventKind.SubagentCompleted:
                    Console.WriteLine($"  [done    ] {ShortId(evt.SdkAgentId)}");
                    break;
                case SquadAgentTraceEventKind.SubagentFailed:
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"  [FAILED  ] {ShortId(evt.SdkAgentId)}");
                    Console.ResetColor();
                    break;
            }
        };
    });

    using var app1 = host1.Build();

    var agent1 = app1.Services.GetRequiredService<SquadAgent>();

    Console.WriteLine($"Agent name : {agent1.Name}");
    Console.WriteLine("Sending   : \"What is 2 + 2?\"");

    var result1 = await RunWithErrorHandlingAsync(async () =>
    {
        var session1 = await agent1.CreateSessionAsync();
        return await agent1.RunAsync("What is 2 + 2?", session1);
        //return await agent1.RunAsync("check and review the latest bradygaster/squad repo PR", session1);
    });

    if (result1 is not null)
        Console.WriteLine($"Response  : {result1.Text}");

    await DisposeIfNeeded(agent1);
    PrintDone("Flow 1");
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow 2: Keyed DI — two agents registered under distinct service keys
// ─────────────────────────────────────────────────────────────────────────────
if (RunFlow(2))
{
    PrintHeader("Flow 2 — Keyed DI (two agents)");

    var host2 = Host.CreateApplicationBuilder(args);
    host2.Logging.SetMinimumLevel(LogLevel.Warning);

    // "alpha" agent — focuses on concise answers
    host2.Services.AddKeyedSquadAgent("alpha", o =>
    {
        o.SquadFolderPath = teamRoot;
        o.AgentName = "AlphaSquad";
        o.Instructions = "Be concise. Answer in one sentence.";
    });

    // "beta" agent — verbose mode
    host2.Services.AddKeyedSquadAgent("beta", o =>
    {
        o.SquadFolderPath = teamRoot;
        o.AgentName = "BetaSquad";
        o.Instructions = "Provide a detailed explanation with examples.";
    });

    using var app2 = host2.Build();

    var alphaAgent = app2.Services.GetRequiredKeyedService<SquadAgent>("alpha");
    var betaAgent  = app2.Services.GetRequiredKeyedService<SquadAgent>("beta");

    Console.WriteLine($"[alpha] name: {alphaAgent.Name}");
    Console.WriteLine($"[beta]  name: {betaAgent.Name}");
    Console.WriteLine();

    var alphaResult = await RunWithErrorHandlingAsync(async () =>
    {
        var s = await alphaAgent.CreateSessionAsync();
        return await alphaAgent.RunAsync("Explain the concept of dependency injection.", s);
    });
    if (alphaResult is not null)
        Console.WriteLine($"[alpha] {alphaResult.Text}");

    Console.WriteLine();

    var betaResult = await RunWithErrorHandlingAsync(async () =>
    {
        var s = await betaAgent.CreateSessionAsync();
        return await betaAgent.RunAsync("Explain the concept of dependency injection.", s);
    });
    if (betaResult is not null)
        Console.WriteLine($"[beta]  {betaResult.Text}");

    await DisposeIfNeeded(alphaAgent);
    await DisposeIfNeeded(betaAgent);
    PrintDone("Flow 2");
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow 3: BYOK / ConfigureCopilotClient delegate
//
// ConfigureCopilotClient lets you post-process CopilotClientOptions after
// Squad applies its standard values. The routing gate ensures Cwd/CliPath/
// CliArgs cannot be replaced by accident; everything else is fair game.
// ─────────────────────────────────────────────────────────────────────────────
if (RunFlow(3))
{
    PrintHeader("Flow 3 — BYOK / ConfigureCopilotClient delegate");

    // Simulate a token from a credential store (never hardcode real tokens).
    // In production replace this with Key Vault, managed identity, etc.
    const string simulatedToken = "YOUR_GITHUB_PAT_HERE";

    var host3 = Host.CreateApplicationBuilder(args);
    host3.Logging.SetMinimumLevel(LogLevel.Warning);
    host3.Services.AddSquadAgent(o =>
    {
        o.SquadFolderPath = teamRoot;
        o.AgentName = "BYOKSquad";

        // ConfigureCopilotClient is the BYOK extension point.
        // It runs after Squad populates its own values; use it to inject a
        // custom token or environment variable from your own credential store.
        o.ConfigureCopilotClient = clientOpts =>
        {
            // Inject a token from an external credential store
            clientOpts.GitHubToken = simulatedToken;

            // IReadOnlyDictionary indexer is read-only; always assign a new instance.
            // ⚠️ IMPORTANT: copilot.exe inherits this dictionary verbatim. If you replace
            // it with only your custom vars (no SYSTEMROOT / PATH / TEMP), the native
            // Node process will crash during crypto initialization
            // ("Assertion failed: ncrypto::CSPRNG(nullptr, 0)"). Always MERGE with the
            // current process environment.
            var merged = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                if (entry.Key is string k && entry.Value is string v)
                {
                    merged[k] = v;
                }
            }
            merged["SQUAD_SAMPLE_VAR"] = "demo-value";
            clientOpts.Environment = merged;
        };
    });

    using var app3 = host3.Build();

    var agent3 = app3.Services.GetRequiredService<SquadAgent>();
    Console.WriteLine($"Agent name : {agent3.Name}");
    Console.WriteLine("BYOK delegate registered — custom token + env var will be forwarded to Copilot SDK.");
    Console.WriteLine("Sending   : \"Ping\"");

    var result3 = await RunWithErrorHandlingAsync(async () =>
    {
        var s = await agent3.CreateSessionAsync();
        return await agent3.RunAsync("Ping", s);
    });
    if (result3 is not null)
        Console.WriteLine($"Response  : {result3.Text}");

    await DisposeIfNeeded(agent3);
    PrintDone("Flow 3");
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow 4: Streaming — print each response token as it arrives
// ─────────────────────────────────────────────────────────────────────────────
if (RunFlow(4))
{
    PrintHeader("Flow 4 — Streaming (RunStreamingAsync)");

    var host4 = Host.CreateApplicationBuilder(args);
    host4.Logging.SetMinimumLevel(LogLevel.Warning);
    host4.Services.AddSquadAgent(o =>
    {
        o.SquadFolderPath = teamRoot;
        o.AgentName = "StreamSquad";
    });

    using var app4 = host4.Build();

    var agent4 = app4.Services.GetRequiredService<SquadAgent>();
    Console.WriteLine($"Agent name : {agent4.Name}");
    Console.WriteLine("Streaming  : \"Count to five slowly.\"");
    Console.WriteLine("Tokens     :");
    Console.Write("  ");

    var streamOk = await RunStreamingWithErrorHandlingAsync(async () =>
    {
        var s = await agent4.CreateSessionAsync();
        await foreach (var update in agent4.RunStreamingAsync("Count to five slowly.", s))
        {
            var text = update.Text;
            if (!string.IsNullOrEmpty(text))
                Console.Write(text);
        }
    });

    if (streamOk)
        Console.WriteLine(); // newline after streaming tokens

    await DisposeIfNeeded(agent4);
    PrintDone("Flow 4");
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow 5: Subagent dispatch + OpenTelemetry observability
//
// Demonstrates the two observability surfaces that fire whenever the squad
// coordinator dispatches a subagent through the LLM's `task` tool:
//
//   1. SquadAgentOptions.OnSubagentTrace — typed envelope callback. Receives:
//        - SubagentDispatched     (NEW: carries LLM persona name/description)
//        - SubagentStarted        (catalog identifiers; usually "general-purpose")
//        - AssistantMessage       (subagent reply, streamed)
//        - SubagentCompleted/Failed
//        - ToolStart/ToolComplete (every tool call, including `task`)
//
//   2. ActivitySource "Microsoft.Agents.AI.Squad" — OpenTelemetry spans.
//      One span per subagent dispatch, opened when the LLM calls `task` and
//      tagged with the per-dispatch persona name/description, then closed
//      when the subagent finishes.
//
// In a real app you would hook these into your OpenTelemetry tracer and ship
// them to a dashboard (e.g. Aspire). This sample prints them to stdout so the
// flow is self-contained — no OTel collector needed to verify the SDK is
// emitting what you expect.
// ─────────────────────────────────────────────────────────────────────────────
if (RunFlow(5))
{
    PrintHeader("Flow 5 — Subagent dispatch + OpenTelemetry observability");

    // ── Tap 1: ActivityListener for the squad ActivitySource ────────────────
    // This is what an OpenTelemetry tracer's AddSource call wires up under the
    // hood. We attach a raw ActivityListener so we can prove spans are emitted
    // even without an OTel SDK installed.
    var startedSpans = new System.Collections.Concurrent.ConcurrentBag<Activity>();
    var stoppedSpans = new System.Collections.Concurrent.ConcurrentBag<Activity>();
    using var spanListener = new ActivityListener
    {
        ShouldListenTo = source => source.Name == SquadAgentDiagnostics.ActivitySourceName,
        Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
        ActivityStarted = a =>
        {
            startedSpans.Add(a);
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine($"  [otel] start  {a.DisplayName}  persona={a.GetTagItem("squad.subagent.persona.name") ?? "(none)"}");
            Console.ResetColor();
        },
        ActivityStopped = a =>
        {
            stoppedSpans.Add(a);
            Console.ForegroundColor = ConsoleColor.DarkCyan;
            Console.WriteLine($"  [otel] stop   {a.DisplayName}  status={a.Status}  duration={a.Duration.TotalSeconds:F1}s");
            Console.ResetColor();
        },
    };
    ActivitySource.AddActivityListener(spanListener);

    // ── Tap 2: typed-envelope callback ──────────────────────────────────────
    // OnSubagentTrace runs for every notable session event. The new
    // SubagentDispatched kind is what surfaces the per-dispatch persona that
    // the LLM passed to the `task` tool — name, description, agent_type and
    // prompt — none of which are present on the subsequent SubagentStarted
    // event (it only carries the agent_type's catalog blurb).
    var dispatched = new System.Collections.Concurrent.ConcurrentBag<SquadAgentTraceEvent>();

    var host5 = Host.CreateApplicationBuilder(args);
    host5.Logging.SetMinimumLevel(LogLevel.Warning);
    host5.Services.AddSquadAgent(o =>
    {
        o.SquadFolderPath = teamRoot;
        o.AgentName = "ObservedSquad";
        o.EmitSubagentActivities = true; // default — included for clarity
        o.OnSubagentTrace = evt =>
        {
            switch (evt.Kind)
            {
                case SquadAgentTraceEventKind.SubagentDispatched:
                    dispatched.Add(evt);
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine($"  [dispatch] persona={evt.DispatchedPersonaName} agent_type={evt.DispatchedAgentType}");
                    Console.WriteLine($"             description={Trim(evt.DispatchedPersonaDescription, 100)}");
                    Console.WriteLine($"             prompt={Trim(evt.DispatchedPrompt, 80)}");
                    Console.ResetColor();
                    break;
                case SquadAgentTraceEventKind.SubagentStarted:
                    Console.WriteLine($"  [started ] {ShortId(evt.SdkAgentId)} catalog_name={evt.SubagentName}");
                    break;
                case SquadAgentTraceEventKind.AssistantMessage when evt.SdkAgentId is not null:
                {
                    var hasText = !string.IsNullOrWhiteSpace(evt.Content);
                    var hasTools = evt.RequestedToolNames.Count > 0;
                    if (!hasText && !hasTools) break;
                    var prefix = $"  [reply   ] {ShortId(evt.SdkAgentId)} ";
                    if (hasText)
                    {
                        Console.WriteLine($"{prefix}{Trim(evt.Content, 120)}");
                    }
                    if (hasTools)
                    {
                        Console.ForegroundColor = ConsoleColor.DarkGray;
                        Console.WriteLine($"{prefix}(calls: {string.Join(", ", evt.RequestedToolNames)})");
                        Console.ResetColor();
                    }
                    break;
                }
                case SquadAgentTraceEventKind.SubagentCompleted:
                    Console.WriteLine($"  [done    ] {ShortId(evt.SdkAgentId)}");
                    break;
                case SquadAgentTraceEventKind.SubagentFailed:
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"  [FAILED  ] {ShortId(evt.SdkAgentId)}");
                    Console.ResetColor();
                    break;
            }
        };
    });

    using var app5 = host5.Build();
    var agent5 = app5.Services.GetRequiredService<SquadAgent>();

    Console.WriteLine($"Agent name : {agent5.Name}");
    Console.WriteLine($"Team root  : {teamRoot}");
    Console.WriteLine("Prompt     : ask the coordinator to dispatch two specialists via the task tool");
    Console.WriteLine("Observe    : each [otel] line is a span the Aspire dashboard would render");
    Console.WriteLine("             each [dispatch] line is the LLM's per-call persona identity");
    Console.WriteLine();

    var result5 = await RunWithErrorHandlingAsync(async () =>
    {
        var s = await agent5.CreateSessionAsync();
        return await agent5.RunAsync(
            "Use the task tool to dispatch two specialists in parallel. Each one must " +
            "introduce themselves in a single sentence stating their persona name and " +
            "focus area. Pass distinct `name` and `description` parameters for each call. " +
            "Then return the two intros to the user.",
            s);
    });

    Console.WriteLine();
    if (result5 is not null)
    {
        Console.WriteLine($"Final reply: {Trim(result5.Text, 240)}");
    }

    Console.WriteLine();
    Console.WriteLine("── Flow 5 summary ──");
    Console.WriteLine($"  SubagentDispatched events captured : {dispatched.Count}");
    Console.WriteLine($"  OTel spans opened                  : {startedSpans.Count}");
    Console.WriteLine($"  OTel spans closed                  : {stoppedSpans.Count}");
    if (dispatched.Count == 0)
    {
        Console.ForegroundColor = ConsoleColor.DarkYellow;
        Console.WriteLine("  (No dispatches observed. The coordinator may have answered inline,");
        Console.WriteLine("   or the team root does not have a `.github/agents/squad.agent.md`.)");
        Console.ResetColor();
    }

    await DisposeIfNeeded(agent5);
    PrintDone("Flow 5");
}

Console.WriteLine();
PrintBanner("All requested flows completed.");

static string Trim(string? s, int max) =>
    string.IsNullOrEmpty(s) ? string.Empty :
    s.Length <= max ? s : s.Substring(0, max) + "…";

// Compact rendering of long SDK agent ids like "toolu_vrtx_01H71tFMdJGjCpQF7JomPVsd".
// Keeps the head (prefix discriminator) and tail (the unique suffix) so two concurrent
// subagents are still visually distinct without burning a whole line on the id.
static string ShortId(string? id)
{
    if (string.IsNullOrEmpty(id)) return "(no-id)";
    if (id.Length <= 16) return id;
    return $"{id.Substring(0, 6)}…{id.Substring(id.Length - 6)}";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

static void PrintBanner(string text)
{
    var line = new string('=', Math.Max(50, text.Length + 4));
    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.WriteLine(line);
    Console.WriteLine($"  {text}");
    Console.WriteLine(line);
    Console.ResetColor();
}

static void PrintHeader(string title)
{
    Console.WriteLine();
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine($"── {title} ──");
    Console.ResetColor();
}

static void PrintDone(string flow)
{
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine($"[{flow} ✓]");
    Console.ResetColor();
}

static async Task<AgentResponse?> RunWithErrorHandlingAsync(Func<Task<AgentResponse>> action)
{
    try
    {
        return await action();
    }
    catch (Exception ex) when (IsCliMissingException(ex))
    {
        PrintCliError();
        return null;
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"[ERROR] {ex.GetType().FullName}: {ex.Message}");
        if (ex.InnerException is not null)
            Console.WriteLine($"  inner: {ex.InnerException.GetType().FullName}: {ex.InnerException.Message}");
        Console.WriteLine(ex.StackTrace);
        Console.ResetColor();
        return null;
    }
}

static async Task<bool> RunStreamingWithErrorHandlingAsync(Func<Task> action)
{
    try
    {
        await action();
        return true;
    }
    catch (Exception ex) when (IsCliMissingException(ex))
    {
        PrintCliError();
        return false;
    }
    catch (Exception ex)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine($"\n[ERROR] {ex.GetType().Name}: {ex.Message}");
        Console.ResetColor();
        return false;
    }
}

static bool IsCliMissingException(Exception ex)
{
    // Only treat *startup* failures (CLI binary missing) as the friendly CLI-not-found case.
    // Everything else — auth, RPC, agent runtime errors — should bubble up as a real error
    // so the user can actually see what went wrong instead of a misleading "install copilot" banner.
    return ex is System.ComponentModel.Win32Exception w32 &&
           (w32.NativeErrorCode == 2 /* ERROR_FILE_NOT_FOUND */ ||
            w32.NativeErrorCode == 3 /* ERROR_PATH_NOT_FOUND */);
}

static void PrintCliError()
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine();
    Console.WriteLine("┌─────────────────────────────────────────────────────────┐");
    Console.WriteLine("│  GitHub Copilot CLI was not found on PATH               │");
    Console.WriteLine("│                                                         │");
    Console.WriteLine("│  Install it and sign in before running this sample:     │");
    Console.WriteLine("│    https://github.com/github/copilot-cli                │");
    Console.WriteLine("│                                                         │");
    Console.WriteLine("│  See the sample README.md for full prerequisites.       │");
    Console.WriteLine("└─────────────────────────────────────────────────────────┘");
    Console.ResetColor();
}

static async ValueTask DisposeIfNeeded(SquadAgent agent)
{
    if (agent is IAsyncDisposable d)
        await d.DisposeAsync();
}




