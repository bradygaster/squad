using System.Text.Json;
using Xunit;

namespace Squad.Agents.AI.Tests;

/// <summary>
/// Validates that <see cref="SquadAgentOptions"/> redacts sensitive values
/// in ToString() and JSON serialization (Worf SC-1, SC-2, SC-7, SC-8).
/// </summary>
public class SquadAgentOptionsSecurityTests
{
    [Fact]
    public void ToString_RedactsGitHubToken()
    {
        var options = new SquadAgentOptions
        {
            GitHubToken = "ghp_super_secret_token_12345"
        };

        var result = options.ToString();

        Assert.DoesNotContain("ghp_super_secret_token", result);
        Assert.Contains("GitHubToken = [REDACTED]", result);
    }

    [Fact]
    public void ToString_RedactsEnvironmentTokenKeys()
    {
        var options = new SquadAgentOptions();
        options.Environment["MY_API_TOKEN"] = "secret-token-value";
        options.Environment["AZURE_SECRET"] = "secret-azure-value";
        options.Environment["HMAC_KEY"] = "hmac-key-value";
        options.Environment["MY_PASSWORD"] = "password-value";
        options.Environment["SERVICE_CREDENTIAL"] = "credential-value";
        options.Environment["SAFE_SETTING"] = "visible-value";

        var result = options.ToString();

        Assert.DoesNotContain("secret-token-value", result);
        Assert.DoesNotContain("secret-azure-value", result);
        Assert.DoesNotContain("hmac-key-value", result);
        Assert.DoesNotContain("password-value", result);
        Assert.DoesNotContain("credential-value", result);
        Assert.Contains("MY_API_TOKEN=[REDACTED]", result);
        Assert.Contains("AZURE_SECRET=[REDACTED]", result);
        Assert.Contains("HMAC_KEY=[REDACTED]", result);
        Assert.Contains("MY_PASSWORD=[REDACTED]", result);
        Assert.Contains("SERVICE_CREDENTIAL=[REDACTED]", result);
        Assert.Contains("SAFE_SETTING=visible-value", result);
    }

    [Fact]
    public void ToString_ShowsNonSensitiveEnvironmentValues()
    {
        var options = new SquadAgentOptions();
        options.Environment["SQUAD_ROUTE"] = "enabled";
        options.Environment["DEBUG_LEVEL"] = "verbose";

        var result = options.ToString();

        Assert.Contains("SQUAD_ROUTE=enabled", result);
        Assert.Contains("DEBUG_LEVEL=verbose", result);
    }

    [Fact]
    public void ToString_EmptyEnvironment_ShowsEmptyBraces()
    {
        var options = new SquadAgentOptions();

        var result = options.ToString();

        Assert.Contains("Environment = {}", result);
    }

    [Fact]
    public void JsonSerialize_ExcludesGitHubToken()
    {
        var options = new SquadAgentOptions
        {
            GitHubToken = "ghp_leaked_token"
        };

        var json = JsonSerializer.Serialize(options);

        Assert.DoesNotContain("ghp_leaked_token", json);
        Assert.DoesNotContain("GitHubToken", json);
    }

    [Fact]
    public void JsonSerialize_ExcludesEnvironment()
    {
        var options = new SquadAgentOptions();
        options.Environment["MY_SECRET_KEY"] = "leaked-secret";
        options.Environment["SAFE_VALUE"] = "safe";

        var json = JsonSerializer.Serialize(options);

        Assert.DoesNotContain("leaked-secret", json);
        Assert.DoesNotContain("MY_SECRET_KEY", json);
        Assert.DoesNotContain("Environment", json);
    }

    [Fact]
    public void JsonSerialize_ExcludesGitHubTokenProvider()
    {
        var options = new SquadAgentOptions
        {
            GitHubTokenProvider = _ => new ValueTask<string?>("provider-secret")
        };

        var json = JsonSerializer.Serialize(options);

        Assert.DoesNotContain("provider-secret", json);
        Assert.DoesNotContain("GitHubTokenProvider", json);
    }

    [Fact]
    public void JsonSerialize_ExcludesConfigureCopilotClient()
    {
        var options = new SquadAgentOptions
        {
            ConfigureCopilotClient = _ => { }
        };

        var json = JsonSerializer.Serialize(options);

        Assert.DoesNotContain("ConfigureCopilotClient", json);
    }

    [Fact]
    public void JsonSerialize_IncludesNonSensitiveProperties()
    {
        var options = new SquadAgentOptions
        {
            SquadFolderPath = @"C:\team",
            AgentName = "TestAgent",
            TraceEvents = true
        };

        var json = JsonSerializer.Serialize(options);

        Assert.Contains("TestAgent", json);
        Assert.Contains(@"C:\\team", json);
    }
}
