using Xunit;

namespace Squad.Agents.AI.Tests;

public class SquadConnectionFactoryTests
{
    [Fact]
    public void FromConnectionString_WithPathForm_ParsesPathOnly()
    {
        var connectionString = @"C:\team-root";
        var options = SquadConnectionFactory.FromConnectionString(connectionString);

        Assert.Equal(@"C:\team-root", options.SquadFolderPath);
        Assert.Equal(@"C:\team-root", options.Cwd);
        Assert.Null(options.CliPath);
    }

    [Fact]
    public void FromConnectionString_WithUnixPathForm_ParsesPathOnly()
    {
        var connectionString = "/Users/me/team-root";
        var options = SquadConnectionFactory.FromConnectionString(connectionString);

        Assert.Equal("/Users/me/team-root", options.SquadFolderPath);
        Assert.Equal("/Users/me/team-root", options.Cwd);
        Assert.Null(options.CliPath);
    }

    [Fact]
    public void FromConnectionString_WithUriForm_ParsesPathAndUri()
    {
        var connectionString = "squad://localhost?teamRoot=C:%5Cteam-root&cliPath=C:%5Cbin%5Ccopilot.exe&cwd=C:%5Cwork";
        var options = SquadConnectionFactory.FromConnectionString(connectionString);

        Assert.Equal(@"C:\team-root", options.SquadFolderPath);
        Assert.Equal(@"C:\bin\copilot.exe", options.CliPath);
        Assert.Equal(@"C:\work", options.Cwd);
    }

    [Fact]
    public void FromConnectionString_WithCliArgs_ParsesArgsList()
    {
        var connectionString = "squad://localhost?teamRoot=/team&cliArgs=--verbose;--trace";
        var options = SquadConnectionFactory.FromConnectionString(connectionString);

        Assert.Contains("--verbose", options.CliArgs);
        Assert.Contains("--trace", options.CliArgs);
    }

    [Fact]
    public void FromConnectionString_WithEnvironmentVars_ParsesEnvDict()
    {
        var connectionString = "squad://localhost?teamRoot=/team&env=KEY1=value1;KEY2=value2";
        var options = SquadConnectionFactory.FromConnectionString(connectionString);

        Assert.Equal("value1", options.Environment["KEY1"]);
        Assert.Equal("value2", options.Environment["KEY2"]);
    }

    [Fact]
    public void FromConnectionString_WithEmptyString_ThrowsArgumentException()
    {
        Assert.Throws<ArgumentException>(() => SquadConnectionFactory.FromConnectionString(""));
    }

    [Fact]
    public void FromConnectionString_WithNullString_ThrowsArgumentException()
    {
        Assert.Throws<ArgumentException>(() => SquadConnectionFactory.FromConnectionString(null!));
    }

    [Fact]
    public void FromConnectionString_WithWhitespace_ThrowsArgumentException()
    {
        Assert.Throws<ArgumentException>(() => SquadConnectionFactory.FromConnectionString("   "));
    }
}
