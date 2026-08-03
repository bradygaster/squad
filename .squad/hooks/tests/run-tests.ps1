#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Parity test runner for dispatch-audit.ps1 (and .sh when bash is available).

.DESCRIPTION
    Runs both implementations against every fixture in this directory and diffs
    the JSON output (normalised with ConvertFrom-Json | ConvertTo-Json -Depth 10)
    to prove behavioural parity. Any divergence is a bug — file an issue.

.PARAMETER Mode
    Enforcement mode for all fixture runs. Default: 'warn'.

.PARAMETER Ps1Only
    Only run the PowerShell implementation (skip bash comparison).

.PARAMETER ShOnly
    Only run the bash implementation (requires bash in PATH or WSL).

.PARAMETER ShowOutput
    Print full JSON for every fixture run.

.EXAMPLE
    .\run-tests.ps1
    .\run-tests.ps1 -Mode block
    .\run-tests.ps1 -Ps1Only
#>
[CmdletBinding()]
param(
    [ValidateSet('warn', 'block', 'off')]
    [string]$Mode = 'warn',
    [switch]$Ps1Only,
    [switch]$ShOnly,
    [switch]$ShowOutput
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$HooksDir    = Split-Path -Parent $ScriptDir
$Ps1Script   = Join-Path $HooksDir 'dispatch-audit.ps1'
$ShScript    = Join-Path $HooksDir 'dispatch-audit.sh'
$FixturesDir = $ScriptDir

# Colour helpers
function Write-Pass([string]$msg)  { Write-Host "PASS $msg" -ForegroundColor Green }
function Write-Fail([string]$msg)  { Write-Host "FAIL $msg" -ForegroundColor Red }
function Write-Skip([string]$msg)  { Write-Host "SKIP $msg" -ForegroundColor Yellow }
function Write-Info([string]$msg)  { Write-Host "     $msg" }

# Fixture table: fixture | expected_verdict | expected_exit
$Fixtures = @(
    @{ File='compliant.jsonl';           ExpectedVerdict='ok';            ExpectedExit=0 }
    @{ File='criterion1-triggered.jsonl'; ExpectedVerdict='warn';          ExpectedExit=0 }
    @{ File='criterion2-triggered.jsonl'; ExpectedVerdict='warn';          ExpectedExit=0 }
    @{ File='criterion3-triggered.jsonl'; ExpectedVerdict='warn';          ExpectedExit=0 }
    @{ File='empty.jsonl';               ExpectedVerdict='indeterminate';  ExpectedExit=0 }
    @{ File='malformed.jsonl';           ExpectedVerdict='ok';             ExpectedExit=0 }
    @{ File='mixed-with-verdicts.jsonl'; ExpectedVerdict='warn';           ExpectedExit=0 }
)

# Detect bash
$HaveBash = $false
$BashCmd   = $null
foreach ($candidate in @('bash', 'wsl bash')) {
    try {
        $null = & ($candidate -split ' ')[0] '--version' 2>$null
        $HaveBash = $true
        $BashCmd  = $candidate -split ' '
        break
    } catch { }
}

$RunPs1  = -not $ShOnly.IsPresent
$RunSh   = -not $Ps1Only.IsPresent

if ($RunSh -and -not $HaveBash) {
    Write-Host "INFO: bash not found — bash parity checks will be skipped." -ForegroundColor Yellow
    $RunSh = $false
}

# Semantic comparison: compare verdict, would_block, triggered criteria (id+name), flags (sorted)
# Deliberately excludes turn_snapshot.timestamp (PS1 localizes ISO dates) and
# recommended_action (contains OS-specific paths). These are known platform differences.
function Get-SemanticKey([string]$json) {
    try {
        $obj = $json | ConvertFrom-Json -Depth 20
        $triggered = ($obj.triggered_criteria | Sort-Object { $_.id } |
                      ForEach-Object { "$($_.id):$($_.name)" }) -join ','
        $flags = ($obj.flags | Sort-Object) -join ','
        return "$($obj.verdict)|$($obj.would_block)|$triggered|$flags"
    } catch {
        return "PARSE_ERROR"
    }
}

function Invoke-Ps1([string]$fixture, [string]$mode) {
    $out = ''
    $exitCode = 0
    try {
        $out = & pwsh -NonInteractive -NoProfile -File $Ps1Script `
            -LedgerPath $fixture -Mode $mode 2>$null
        $exitCode = $LASTEXITCODE
    } catch {
        $exitCode = 2
    }
    return @{ Output = ($out -join "`n"); Exit = $exitCode }
}

function Invoke-Sh([string]$fixture, [string]$mode) {
    $out = ''
    $exitCode = 0
    try {
        if ($BashCmd.Count -eq 1) {
            $out = & $BashCmd[0] $ShScript --ledger-path $fixture --mode $mode 2>$null
        } else {
            $out = & $BashCmd[0] $BashCmd[1] $ShScript --ledger-path $fixture --mode $mode 2>$null
        }
        $exitCode = $LASTEXITCODE
    } catch {
        $exitCode = 2
    }
    return @{ Output = ($out -join "`n"); Exit = $exitCode }
}

$Pass = 0; $Fail = 0; $Skip = 0

Write-Host "`n=== dispatch-audit parity tests (mode=$Mode) ===`n"

foreach ($fix in $Fixtures) {
    $file    = $fix.File
    $expV    = $fix.ExpectedVerdict
    $expE    = $fix.ExpectedExit
    $path    = Join-Path $FixturesDir $file

    Write-Host "--- $file ---"

    $ps1Result = $null
    $shResult  = $null

    # --- Run ps1 ---
    if ($RunPs1) {
        $ps1Result = Invoke-Ps1 -fixture $path -mode $Mode
        try {
            $ps1Verdict = ($ps1Result.Output | ConvertFrom-Json -Depth 20).verdict
        } catch {
            $ps1Verdict = 'PARSE_ERROR'
        }

        if ($ps1Result.Exit -eq $expE) {
            Write-Pass "ps1: exit=$($ps1Result.Exit) verdict=$ps1Verdict"
        } else {
            Write-Fail "ps1: expected exit=$expE got=$($ps1Result.Exit) (verdict=$ps1Verdict)"
            $Fail++
            continue
        }

        if ($ps1Verdict -eq $expV) {
            Write-Pass "ps1: verdict=$ps1Verdict matches expected"
            $Pass++
        } else {
            Write-Fail "ps1: expected verdict=$expV got=$ps1Verdict"
            $Fail++
        }

        if ($ShowOutput) { Write-Info ($ps1Result.Output | ConvertFrom-Json -Depth 20 | ConvertTo-Json -Depth 20) }
    }

    # --- Run sh and compare ---
    if ($RunSh) {
        $shResult = Invoke-Sh -fixture $path -mode $Mode
        try {
            $shVerdict = ($shResult.Output | ConvertFrom-Json -Depth 20).verdict
        } catch {
            $shVerdict = 'PARSE_ERROR'
        }

        $ps1Sem = Get-SemanticKey ($ps1Result ? $ps1Result.Output : '')
        $shSem  = Get-SemanticKey $shResult.Output

        if ($ps1Sem -eq $shSem) {
            Write-Pass "parity: ps1 == sh (semantic fields match)"
            $Pass++
        } else {
            Write-Fail "parity: ps1 != sh for $file"
            Write-Info "ps1 semantic: $ps1Sem"
            Write-Info "sh  semantic: $shSem"
            $Fail++
        }
    } else {
        $Skip++
        Write-Skip "parity check skipped (bash not available)"
    }

    Write-Host ""
}

Write-Host "=== Results: $Pass passed, $Fail failed, $Skip skipped ==="
if ($Fail -gt 0) { exit 1 }
