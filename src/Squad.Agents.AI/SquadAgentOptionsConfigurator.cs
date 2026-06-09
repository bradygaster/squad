using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Squad.Agents.AI;

/// <summary>
/// Binds SquadAgentOptions from a configured connection string.
/// Runs before user-supplied configure lambda; user settings always win.
/// </summary>
internal sealed class SquadAgentOptionsConfigurator : IConfigureNamedOptions<SquadAgentOptions>
{
    private readonly IConfiguration _configuration;
    private readonly string _optionsName;
    private readonly string _connectionStringName;

    public SquadAgentOptionsConfigurator(IConfiguration configuration)
        : this(configuration, Options.DefaultName, SquadServiceCollectionExtensions.DefaultConnectionStringName)
    {
    }

    internal SquadAgentOptionsConfigurator(
        IConfiguration configuration,
        string optionsName,
        string connectionStringName)
    {
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        _optionsName = optionsName ?? Options.DefaultName;
        _connectionStringName = connectionStringName ?? throw new ArgumentNullException(nameof(connectionStringName));
    }

    public void Configure(SquadAgentOptions options) => Configure(Options.DefaultName, options);

    public void Configure(string? name, SquadAgentOptions options)
    {
        if (!string.Equals(name ?? Options.DefaultName, _optionsName, StringComparison.Ordinal))
            return;

        var connectionString = _configuration.GetConnectionString(_connectionStringName);

        if (string.IsNullOrWhiteSpace(connectionString))
            return;

        var parsedOptions = SquadConnectionFactory.FromConnectionString(connectionString);

        // Only apply parsed values if user hasn't set them explicitly
        // User callback runs AFTER this configurator, so any null/empty here will be overridden
        if (string.IsNullOrWhiteSpace(options.SquadFolderPath))
            options.SquadFolderPath = parsedOptions.SquadFolderPath;

        if (string.IsNullOrWhiteSpace(options.CliPath))
            options.CliPath = parsedOptions.CliPath;

        if (string.IsNullOrWhiteSpace(options.Cwd))
            options.Cwd = parsedOptions.Cwd;

        // Merge CLI args (append to existing list)
        foreach (var arg in parsedOptions.CliArgs)
        {
            if (!options.CliArgs.Contains(arg))
                options.CliArgs.Add(arg);
        }

        // Merge environment variables (don't overwrite existing)
        foreach (var kvp in parsedOptions.Environment)
        {
            if (!options.Environment.ContainsKey(kvp.Key))
                options.Environment[kvp.Key] = kvp.Value;
        }
    }
}
