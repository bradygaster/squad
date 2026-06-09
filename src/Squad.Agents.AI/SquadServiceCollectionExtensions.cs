using Microsoft.Agents.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Squad.Agents.AI;

/// <summary>
/// Extension methods for registering <see cref="SquadAgent"/> in dependency injection.
/// </summary>
public static class SquadServiceCollectionExtensions
{
    internal const string DefaultConnectionStringName = "squad";

    /// <summary>
    /// Registers <see cref="SquadAgent"/> and base <see cref="AIAgent"/> with scoped lifetime.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    /// <example>
    /// <code>
    /// builder.Services.AddSquadAgent(o => o.SquadFolderPath = @"C:\repo");
    /// </code>
    /// </example>
    public static IServiceCollection AddSquadAgent(
        this IServiceCollection services,
        Action<SquadAgentOptions>? configure = null)
        => AddSquadAgentCore(services, name: null, ServiceLifetime.Scoped, configure);

    /// <summary>
    /// Registers <see cref="SquadAgent"/> and base <see cref="AIAgent"/> with scoped lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="name">Logical Squad name. For example, <c>"research"</c> reads <c>ConnectionStrings:squad-research</c>.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddSquadAgent(
        this IServiceCollection services,
        string name,
        Action<SquadAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddSquadAgentCore(services, name, ServiceLifetime.Scoped, configure);
    }

    /// <summary>
    /// Registers <see cref="SquadAgent"/> and base <see cref="AIAgent"/> with the specified lifetime.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="lifetime">Lifetime used for the concrete and base agent registrations.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddSquadAgent(
        this IServiceCollection services,
        ServiceLifetime lifetime,
        Action<SquadAgentOptions>? configure = null)
        => AddSquadAgentCore(services, name: null, lifetime, configure);

    /// <summary>
    /// Registers <see cref="SquadAgent"/> and base <see cref="AIAgent"/> with the specified lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="name">Logical Squad name. For example, <c>"research"</c> reads <c>ConnectionStrings:squad-research</c>.</param>
    /// <param name="lifetime">Lifetime used for the concrete and base agent registrations.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddSquadAgent(
        this IServiceCollection services,
        string name,
        ServiceLifetime lifetime,
        Action<SquadAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddSquadAgentCore(services, name, lifetime, configure);
    }

    // ── Keyed DI overloads ───────────────────────────────────────────────────

    /// <summary>
    /// Registers <see cref="SquadAgent"/> as a keyed service with scoped lifetime. Resolve via
    /// <c>[FromKeyedServices("myKey")] SquadAgent agent</c> or
    /// <c>provider.GetRequiredKeyedService&lt;SquadAgent&gt;("myKey")</c>.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    /// <example>
    /// <code>
    /// builder.Services.AddKeyedSquadAgent("research", o => o.SquadFolderPath = @"C:\research-team");
    /// builder.Services.AddKeyedSquadAgent("platform", o => o.SquadFolderPath = @"C:\platform-team");
    ///
    /// // Resolve in a controller or minimal API:
    /// app.MapGet("/ask", ([FromKeyedServices("research")] SquadAgent agent) => ...);
    /// </code>
    /// </example>
    public static IServiceCollection AddKeyedSquadAgent(
        this IServiceCollection services,
        string serviceKey,
        Action<SquadAgentOptions>? configure = null)
        => AddKeyedSquadAgentCore(services, serviceKey, name: null, ServiceLifetime.Scoped, configure);

    /// <summary>
    /// Registers <see cref="SquadAgent"/> as a keyed service with scoped lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="name">Logical Squad name for connection-string lookup. For example, <c>"research"</c> reads <c>ConnectionStrings:squad-research</c>.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddKeyedSquadAgent(
        this IServiceCollection services,
        string serviceKey,
        string name,
        Action<SquadAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddKeyedSquadAgentCore(services, serviceKey, name, ServiceLifetime.Scoped, configure);
    }

    /// <summary>
    /// Registers <see cref="SquadAgent"/> as a keyed service with the specified lifetime.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="lifetime">Lifetime used for the keyed agent registration.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddKeyedSquadAgent(
        this IServiceCollection services,
        string serviceKey,
        ServiceLifetime lifetime,
        Action<SquadAgentOptions>? configure = null)
        => AddKeyedSquadAgentCore(services, serviceKey, name: null, lifetime, configure);

    /// <summary>
    /// Registers <see cref="SquadAgent"/> as a keyed service with the specified lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="name">Logical Squad name for connection-string lookup.</param>
    /// <param name="lifetime">Lifetime used for the keyed agent registration.</param>
    /// <param name="configure">Optional callback that customizes <see cref="SquadAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddKeyedSquadAgent(
        this IServiceCollection services,
        string serviceKey,
        string name,
        ServiceLifetime lifetime,
        Action<SquadAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddKeyedSquadAgentCore(services, serviceKey, name, lifetime, configure);
    }

    // ── Core implementation (non-keyed) ──────────────────────────────────────

    private static IServiceCollection AddSquadAgentCore(
        IServiceCollection services,
        string? name,
        ServiceLifetime lifetime,
        Action<SquadAgentOptions>? configure)
    {
        ArgumentNullException.ThrowIfNull(services);

        var optionsName = GetOptionsName(name);
        var connectionStringName = GetConnectionStringName(name);

        RegisterOptionsInfrastructure(services, optionsName, connectionStringName, configure);

        // Register SquadAgent with specified lifetime
        services.Add(new ServiceDescriptor(
            typeof(SquadAgent),
            sp =>
            {
                var options = sp.GetRequiredService<IOptionsMonitor<SquadAgentOptions>>().Get(optionsName);
                var loggerFactory = sp.GetService<ILoggerFactory>();
                var folderPath = options.SquadFolderPath;
                if (string.IsNullOrWhiteSpace(folderPath))
                    throw new InvalidOperationException(
                        "SquadAgentOptions.SquadFolderPath must be configured (via configure callback or connection string) before resolving SquadAgent.");
                return new SquadAgent(folderPath, options, loggerFactory);
            },
            lifetime));

        // AIAgent base registration — so consumers can resolve via IEnumerable<AIAgent>
        services.Add(new ServiceDescriptor(
            typeof(AIAgent),
            sp => sp.GetRequiredService<SquadAgent>(),
            lifetime));

        return services;
    }

    // ── Core implementation (keyed) ──────────────────────────────────────────

    private static IServiceCollection AddKeyedSquadAgentCore(
        IServiceCollection services,
        string serviceKey,
        string? name,
        ServiceLifetime lifetime,
        Action<SquadAgentOptions>? configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentException.ThrowIfNullOrWhiteSpace(serviceKey);

        // Use the serviceKey as the options name when no explicit name is given
        var optionsName = GetOptionsName(name ?? serviceKey);
        var connectionStringName = GetConnectionStringName(name ?? serviceKey);

        RegisterOptionsInfrastructure(services, optionsName, connectionStringName, configure);

        // Register keyed SquadAgent
        services.Add(new ServiceDescriptor(
            typeof(SquadAgent),
            serviceKey,
            (sp, _) =>
            {
                var options = sp.GetRequiredService<IOptionsMonitor<SquadAgentOptions>>().Get(optionsName);
                var loggerFactory = sp.GetService<ILoggerFactory>();
                var folderPath = options.SquadFolderPath;
                if (string.IsNullOrWhiteSpace(folderPath))
                    throw new InvalidOperationException(
                        "SquadAgentOptions.SquadFolderPath must be configured (via configure callback or connection string) before resolving SquadAgent.");
                return new SquadAgent(folderPath, options, loggerFactory);
            },
            lifetime));

        // Keyed AIAgent — forwards to keyed SquadAgent
        services.Add(new ServiceDescriptor(
            typeof(AIAgent),
            serviceKey,
            (sp, _) => sp.GetRequiredKeyedService<SquadAgent>(serviceKey),
            lifetime));

        return services;
    }

    // ── Shared options registration ──────────────────────────────────────────

    private static void RegisterOptionsInfrastructure(
        IServiceCollection services,
        string optionsName,
        string connectionStringName,
        Action<SquadAgentOptions>? configure)
    {
        // Register connection string configurator FIRST (runs before user callback)
        services.AddSingleton<IConfigureOptions<SquadAgentOptions>>(sp =>
            new SquadAgentOptionsConfigurator(
                sp.GetRequiredService<IConfiguration>(),
                optionsName,
                connectionStringName));

        if (configure is not null)
        {
            services.Configure(optionsName, configure);
        }

        // TraceEvents=true → warn because verbose traces can contain sensitive details
        services.AddOptions<SquadAgentOptions>(optionsName)
            .PostConfigure<ILoggerFactory>((opts, loggerFactory) =>
            {
                if (opts.TraceEvents)
                {
                    var logger = loggerFactory.CreateLogger("Squad.Agents.AI.Startup");
                    logger.LogWarning(
                        "SquadAgentOptions.TraceEvents=true. Verbose tracing is enabled; " +
                        "not recommended for production use.");
                }
            });
    }

    private static string GetOptionsName(string? name)
    {
        return string.IsNullOrWhiteSpace(name) ? Options.DefaultName : name;
    }

    private static string GetConnectionStringName(string? name)
    {
        return string.IsNullOrWhiteSpace(name) ? DefaultConnectionStringName : $"{DefaultConnectionStringName}-{name}";
    }
}
