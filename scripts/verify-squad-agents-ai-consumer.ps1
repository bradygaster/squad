#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Hermetic consumer-level packaging check for Squad.Agents.AI.

.DESCRIPTION
  Restores a scratch consumer project against ONLY the locally-produced Squad.Agents.AI
  nupkg (plus nuget.org for its transitive dependencies), builds it for the current
  runner's default portable RID, and asserts that the native Copilot CLI payload (the
  copilot/copilot.exe executable and its runtime.node-derived native library) actually
  propagated to a REAL PackageReference consumer -- not just to this repo's own
  ProjectReference-based test/sample projects.

  This exists because Microsoft.Agents.AI.GitHub.Copilot ships GitHub.Copilot.SDK's CLI
  download targets to transitive consumers via a buildTransitive/ bridge that -- unless
  overridden -- resolves an OLDER GitHub.Copilot.SDK version (whatever version the adapter
  package itself was built/floor-pinned against) instead of the version Squad.Agents.AI
  actually references. See Directory.Build.props and the GenerateCopilotSdkVersionBridge
  target in src/Squad.Agents.AI/Squad.Agents.AI.csproj for the fix; this script is the
  regression test for it. A green run here is the ONLY thing that proves the fix works for
  real external NuGet consumers, since this repo's own test/sample projects are covered by
  Directory.Build.props alone (a repo-internal mechanism a real external consumer never
  sees).

  Does not execute the downloaded Copilot CLI binary -- only inspects file paths that
  MSBuild's own download/copy targets produced, so it never runs untrusted downloaded
  code. Does not touch package source or TLS/signature verification policy: only two
  well-known, standard sources are used (nuget.org over HTTPS, and the local nupkgs
  folder produced by `dotnet pack` in this same repo checkout).

.PARAMETER NupkgsDir
  Directory containing exactly one packed Squad.Agents.AI .nupkg (e.g. the CI job's
  existing `dotnet pack ... -o nupkgs` output). The package version is parsed from the
  .nupkg filename itself, so it can never drift out of sync with whatever version was
  actually packed.

.PARAMETER ExpectedCopilotCliVersion
  The Copilot CLI version the consumer is expected to download (the CLI version pinned by
  the GitHub.Copilot.SDK version Squad.Agents.AI references), e.g. "1.0.71".

.PARAMETER ForbiddenCopilotCliVersions
  Copilot CLI versions that must NOT appear anywhere in the consumer's build output --
  i.e. the stale versions this script exists to catch a regression to.

.PARAMETER TargetFramework
  Target framework moniker for the scratch consumer project.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$NupkgsDir,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedCopilotCliVersion,

    [string[]]$ForbiddenCopilotCliVersions = @('1.0.67'),

    [string]$TargetFramework = 'net10.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

$nupkgsFull = (Resolve-Path $NupkgsDir).Path
$candidateNupkgs = @(Get-ChildItem -Path $nupkgsFull -Filter "squad.agents.ai.*.nupkg")
if ($candidateNupkgs.Count -eq 0) {
    throw "No 'squad.agents.ai.*.nupkg' found in '$nupkgsFull'. Did the Pack step run before this check?"
}
if ($candidateNupkgs.Count -gt 1) {
    throw "Expected exactly one packed Squad.Agents.AI nupkg in '$nupkgsFull', found $($candidateNupkgs.Count): $($candidateNupkgs.Name -join ', ')"
}

$nupkgMatch = [System.Text.RegularExpressions.Regex]::Match($candidateNupkgs[0].Name, '^squad\.agents\.ai\.(?<version>.+)\.nupkg$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if (-not $nupkgMatch.Success) {
    throw "Could not parse a package version out of nupkg filename '$($candidateNupkgs[0].Name)'."
}
$PackageVersion = $nupkgMatch.Groups['version'].Value
Write-Host "Detected packed Squad.Agents.AI version: $PackageVersion (from $($candidateNupkgs[0].Name))"

$scratchDir = Join-Path ([System.IO.Path]::GetTempPath()) "squad-agents-ai-consumer-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $scratchDir | Out-Null
Write-Host "Scratch consumer project: $scratchDir"

try {
    $csprojPath = Join-Path $scratchDir "ConsumerCheck.csproj"
    $csprojContent = @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>$TargetFramework</TargetFramework>
    <OutputType>Exe</OutputType>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Squad.Agents.AI" Version="$PackageVersion" />
  </ItemGroup>
</Project>
"@
    Set-Content -Path $csprojPath -Value $csprojContent -Encoding utf8

    $programContent = 'System.Console.WriteLine("Squad.Agents.AI consumer packaging check placeholder.");'
    Set-Content -Path (Join-Path $scratchDir "Program.cs") -Value $programContent -Encoding utf8

    # Use a scratch nuget.config instead of repeated `dotnet restore --source` arguments: passing
    # multiple --source values has proven unreliable across platforms when invoked from a PowerShell
    # script (observed producing a bogus combined path on Windows), while an explicit,
    # colocated nuget.config is picked up automatically and unambiguously by both platforms. Only
    # two well-known, standard sources are listed: nuget.org over HTTPS, and the local nupkgs folder
    # this same CI job just produced with `dotnet pack`.
    $nugetConfigPath = Join-Path $scratchDir "nuget.config"
    $nugetConfigContent = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="local-squad-agents-ai" value="$nupkgsFull" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
"@
    Set-Content -Path $nugetConfigPath -Value $nugetConfigContent -Encoding utf8

    Write-Section "Restoring scratch consumer (local nupkg + nuget.org only, via scratch nuget.config)"
    & dotnet restore $csprojPath
    if ($LASTEXITCODE -ne 0) {
        throw "Restore of scratch consumer project failed (exit code $LASTEXITCODE)."
    }

    Write-Section "Building scratch consumer for the current runner's default RID"
    & dotnet build $csprojPath -c Release --no-restore
    if ($LASTEXITCODE -ne 0) {
        throw "Build of scratch consumer project failed (exit code $LASTEXITCODE)."
    }

    $outDir = Join-Path $scratchDir "bin/Release/$TargetFramework"
    if (-not (Test-Path $outDir)) {
        throw "Consumer build output directory '$outDir' does not exist."
    }

    Write-Section "Inspecting consumer build output for the native Copilot payload"
    $nativeRoot = Get-ChildItem -Path $outDir -Directory -Filter "runtimes" -ErrorAction SilentlyContinue
    if (-not $nativeRoot) {
        throw "No 'runtimes' directory found in consumer build output '$outDir'. The Copilot CLI native payload did not propagate to a real PackageReference consumer of Squad.Agents.AI."
    }

    $nativeFiles = Get-ChildItem -Path $outDir -Recurse -File |
        Where-Object { $_.FullName -match '[\\/]runtimes[\\/][^\\/]+[\\/]native[\\/]' }

    if (-not $nativeFiles -or $nativeFiles.Count -eq 0) {
        throw "No files found under runtimes/*/native/ in consumer build output '$outDir'."
    }

    Write-Host "Found native payload files:"
    foreach ($f in $nativeFiles) { Write-Host "  $($f.FullName)" }

    $cliBinary = $nativeFiles | Where-Object { $_.Name -in @('copilot', 'copilot.exe') }
    if (-not $cliBinary) {
        throw "Copilot CLI executable ('copilot' or 'copilot.exe') not found under runtimes/*/native/ in consumer output. Expected the payload from GitHub.Copilot.SDK / Copilot CLI $ExpectedCopilotCliVersion."
    }

    $runtimeLibNames = @('copilot_runtime.dll', 'libcopilot_runtime.so', 'libcopilot_runtime.dylib', 'runtime.node')
    $runtimeLib = $nativeFiles | Where-Object { $_.Name -in $runtimeLibNames }
    if (-not $runtimeLib) {
        throw "No runtime.node-derived native library ($($runtimeLibNames -join ', ')) found under runtimes/*/native/ in consumer output."
    }
    Write-Host "Native Copilot CLI executable: $($cliBinary.FullName)"
    Write-Host "Native runtime.node-derived library: $($runtimeLib.FullName)"

    Write-Section "Proving the downloaded Copilot CLI version"
    # The SDK's build/ targets cache the extracted CLI per-version at
    # obj/{config}/{tfm}/copilot-cli/{CopilotCliVersion}/{platform}/..., so the directory
    # names under copilot-cli/ are a direct, tamper-evident record of which CLI version(s)
    # were actually downloaded for this consumer -- independent of file content inspection,
    # and without ever executing the binary itself.
    $objDir = Join-Path $scratchDir "obj"
    $copilotCliDirs = Get-ChildItem -Path $objDir -Recurse -Directory -Filter "copilot-cli" -ErrorAction SilentlyContinue
    if (-not $copilotCliDirs) {
        throw "No 'copilot-cli' cache directory found under '$objDir'. Cannot verify which Copilot CLI version was downloaded."
    }

    $downloadedVersions = $copilotCliDirs |
        ForEach-Object { Get-ChildItem -Path $_.FullName -Directory } |
        Select-Object -ExpandProperty Name -Unique

    Write-Host "Copilot CLI version(s) downloaded for the consumer: $($downloadedVersions -join ', ')"

    if ($downloadedVersions -notcontains $ExpectedCopilotCliVersion) {
        throw "Expected Copilot CLI version '$ExpectedCopilotCliVersion' was not downloaded for the consumer (found: $($downloadedVersions -join ', ')). The native-payload propagation fix did not take effect."
    }

    foreach ($forbidden in $ForbiddenCopilotCliVersions) {
        if ($downloadedVersions -contains $forbidden) {
            throw "Forbidden stale Copilot CLI version '$forbidden' was downloaded for the consumer. This is the exact regression (Squad.Agents.AI PR #1519 / Reviewer finding #1) this check exists to catch: the Microsoft.Agents.AI.GitHub.Copilot buildTransitive bridge resolved an older GitHub.Copilot.SDK version instead of the one Squad.Agents.AI references."
        }
    }

    Write-Host ""
    Write-Host "PASS: consumer resolved Copilot CLI $ExpectedCopilotCliVersion (not $($ForbiddenCopilotCliVersions -join ', ')); native executable and runtime library both present under runtimes/*/native/." -ForegroundColor Green
}
finally {
    Remove-Item -Path $scratchDir -Recurse -Force -ErrorAction SilentlyContinue
}
