namespace Squad.Agents.AI;

/// <summary>
/// Parses Squad connection strings into <see cref="SquadAgentOptions"/> instances.
/// </summary>
public static class SquadConnectionFactory
{
    /// <summary>
    /// Parses a Squad connection string into agent options.
    /// </summary>
    /// <param name="connectionString">PATH form or `squad://` URI form connection string.</param>
    /// <returns>Options populated from the supplied connection string.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="connectionString"/> is null, empty, or whitespace.</exception>
    /// <remarks>
    /// PATH form maps the entire value to <see cref="SquadAgentOptions.SquadFolderPath"/> and <see cref="SquadAgentOptions.Cwd"/>.
    /// URI form parses `teamRoot`, `cliPath`, `cwd`, `cliArgs`, and `env` query values; the URI host is reserved.
    /// </remarks>
    /// <example>
    /// <code>
    /// var options = SquadConnectionFactory.FromConnectionString(@"C:\repo");
    /// var advanced = SquadConnectionFactory.FromConnectionString(
    ///     "squad://localhost?teamRoot=C%3A%5Crepo&amp;cliArgs=--yolo");
    /// </code>
    /// </example>
    public static SquadAgentOptions FromConnectionString(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new ArgumentException("Connection string cannot be null or empty.", nameof(connectionString));
        }

        var options = new SquadAgentOptions();

        if (connectionString.StartsWith("squad://", StringComparison.OrdinalIgnoreCase))
        {
            // URI form
            var uri = new Uri(connectionString);
            var query = ParseQueryString(uri.Query);

            if (query.TryGetValue("teamRoot", out var teamRoot))
                options.SquadFolderPath = teamRoot;

            if (query.TryGetValue("cliPath", out var cliPath))
                options.CliPath = cliPath;

            if (query.TryGetValue("cwd", out var cwd))
                options.Cwd = cwd;

            if (query.TryGetValue("cliArgs", out var cliArgsString))
            {
                foreach (var arg in cliArgsString.Split(';', StringSplitOptions.RemoveEmptyEntries))
                {
                    options.CliArgs.Add(arg);
                }
            }

            // Parse environment variables if present (format: key1=val1;key2=val2)
            if (query.TryGetValue("env", out var envString))
            {
                foreach (var pair in envString.Split(';', StringSplitOptions.RemoveEmptyEntries))
                {
                    var parts = pair.Split('=', 2);
                    if (parts.Length == 2)
                    {
                        options.Environment[parts[0]] = parts[1];
                    }
                }
            }
        }
        else
        {
            // PATH form — treat entire string as team root path
            options.SquadFolderPath = connectionString;
            options.Cwd = connectionString;
        }

        return options;
    }

    private static Dictionary<string, string> ParseQueryString(string query)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrEmpty(query))
            return result;

        // Remove leading '?' if present
        if (query.StartsWith('?'))
            query = query.Substring(1);

        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length == 2)
            {
                result[Uri.UnescapeDataString(parts[0])] = Uri.UnescapeDataString(parts[1]);
            }
        }

        return result;
    }
}
