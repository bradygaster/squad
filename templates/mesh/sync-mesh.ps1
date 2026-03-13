# sync-mesh.ps1 — Materialize remote squad state locally
#
# Reads mesh.json, fetches remote squads into local directories.
# Run before agent reads. No daemon. No service. ~40 lines.
#
# Usage: .\sync-mesh.ps1 [path-to-mesh.json]
# Requires: git
param([string]$MeshJson = "mesh.json")
$ErrorActionPreference = "Stop"
$config = Get-Content $MeshJson -Raw | ConvertFrom-Json

# Zone 2: Remote-trusted — git clone/pull
foreach ($entry in $config.squads.PSObject.Properties | Where-Object { $_.Value.zone -eq "remote-trusted" }) {
    $squad  = $entry.Name
    $source = $entry.Value.source
    $ref    = if ($entry.Value.ref) { $entry.Value.ref } else { "main" }
    $target = $entry.Value.sync_to

    if (Test-Path "$target/.git") {
        git -C $target pull --rebase --quiet 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Host "⚠ ${squad}: pull failed (using stale)" }
    } else {
        New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
        git clone --quiet --depth 1 --branch $ref $source $target 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Host "⚠ ${squad}: clone failed (unavailable)" }
    }
}

# Zone 3: Remote-opaque — fetch published contracts
foreach ($entry in $config.squads.PSObject.Properties | Where-Object { $_.Value.zone -eq "remote-opaque" }) {
    $squad  = $entry.Name
    $source = $entry.Value.source
    $target = $entry.Value.sync_to
    $auth   = $entry.Value.auth

    New-Item -ItemType Directory -Force -Path $target | Out-Null
    $params = @{ Uri = $source; OutFile = "$target/SUMMARY.md"; UseBasicParsing = $true }
    if ($auth -eq "bearer") {
        $tokenVar = ($squad.ToUpper() -replace '-', '_') + "_TOKEN"
        $token = [Environment]::GetEnvironmentVariable($tokenVar)
        if ($token) { $params.Headers = @{ Authorization = "Bearer $token" } }
    }
    try { Invoke-WebRequest @params -ErrorAction Stop }
    catch { "# ${squad} — unavailable ($(Get-Date))" | Set-Content "$target/SUMMARY.md" }
}

Write-Host "✓ Mesh sync complete"
