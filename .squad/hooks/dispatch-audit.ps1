#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Audits a single coordinator turn against the Squad dispatch contract.

.DESCRIPTION
    Ralph's DispatchGuard invokes this script once per coordinator turn to detect
    "inline hallucination" — cases where the SquadShort coordinator does domain
    work (writes code/prose/analysis) directly instead of dispatching it to a
    specialist agent via `task` / `runSubagent` / `create_session`.

    The script reads the session's ledger at `.squad/orchestration-log/ledger-{session-id}.jsonl`
    (JSONL — one JSON object per coordinator turn, per Chakotay's finalized schema),
    evaluates the current turn (the last parseable line) plus recent history against
    three violation criteria, and emits a single structured JSON verdict on stdout for
    Ralph to consume or act on. Session identity lives in the ledger filename, not in
    the entry payload.

    Verdict values: "ok" | "warn" | "block" | "indeterminate" | "error".
    "indeterminate" means the ledger was expected but is missing, empty, or otherwise
    cannot be evaluated — this is NOT a clean pass and NOT a confirmed violation; it is
    a state where the audit cannot make a determination (e.g. the coordinator deleted or
    never appended a ledger entry). Enforcement mode maps "indeterminate" to warn/block
    exactly like a real violation, per Q's Recommendation #6 (Wave 3): unverifiable
    compliance must not default to a free pass.

    This script never writes to the ledger, never mutates repo state, and performs no
    network calls. It is a pure read-and-report audit.

.PARAMETER LedgerPath
    Path to the current session's ledger file (JSONL, one turn object per line,
    e.g. ".squad/orchestration-log/ledger-sess-8841.jsonl"). A missing file yields
    verdict "indeterminate" (mapped per -Mode), not "ok" — see .DESCRIPTION.

.PARAMETER Mode
    Enforcement mode, normally sourced from .squad/config.json's
    dispatchEnforcement key. One of 'warn' (default), 'block', 'off'.

.PARAMETER SessionId
    Optional Copilot session ID, used only for logging/tracing. Session
    identity is carried by the ledger filename, so this is never compared
    against ledger contents.

.PARAMETER Trace
    Switch. Emits verbose diagnostic logging to stderr. Never touches stdout,
    so it is always safe to pass without corrupting the JSON contract.

.EXAMPLE
    .\dispatch-audit.ps1 -LedgerPath ".squad/orchestration-log/ledger-sess-8841.jsonl" -Mode warn

.EXAMPLE
    .\dispatch-audit.ps1 -LedgerPath $ledgerPath -Mode block -SessionId $env:COPILOT_SESSION_ID -Trace

.NOTES
    Author: Data (Code Expert)
    Wave: 3 — Layer B (Ralph DispatchGuard audit script), Fix 5 per Q's
    Recommendation #6 (missing/empty ledger → indeterminate, not ok/warn-as-pass).
    Issue: dispatch-enforcement design (coordinator inline-work drift)
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$LedgerPath,

    [Parameter(Mandatory = $false)]
    [ValidateSet('warn', 'block', 'off')]
    [string]$Mode = 'warn',

    [Parameter(Mandatory = $false)]
    [string]$SessionId = '',

    [Parameter(Mandatory = $false)]
    [switch]$Trace
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Logging helper — mirrors the -Verbose/stderr convention used elsewhere in
# .squad/scripts (e.g. log-tool-call.ps1's Write-Verbose usage), but writes
# explicitly to stderr so stdout stays reserved for the single JSON verdict.
# ---------------------------------------------------------------------------
function Write-AuditLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [Parameter(Mandatory = $false)]
        [ValidateSet('info', 'warn', 'error')]
        [string]$Level = 'info'
    )

    if ($Level -eq 'info' -and -not $Trace) {
        return
    }

    $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $prefix = "[dispatch-audit][$Level][$ts]"
    [Console]::Error.WriteLine("$prefix $Message")
}

function Get-FieldOrDefault {
    param($Obj, [string]$Name, $Default)
    if ($Obj.PSObject.Properties.Match($Name).Count -gt 0 -and $null -ne $Obj.$Name) {
        return $Obj.$Name
    }
    return $Default
}

# domain_artifact_declared is object-shaped per Chakotay's schema:
# { value: bool, description: string }. Defensively normalize malformed/legacy
# shapes (e.g. a stray plain bool) to the expected object rather than throwing.
function Get-DomainArtifactDeclared {
    param($Obj)

    $raw = Get-FieldOrDefault -Obj $Obj -Name 'domain_artifact_declared' -Default $null

    if ($null -eq $raw) {
        return @{ value = $false; description = '' }
    }

    if ($raw -is [bool]) {
        # Legacy/malformed shape — tolerate it rather than crash.
        return @{ value = [bool]$raw; description = '' }
    }

    $value = $false
    if ($raw.PSObject.Properties.Match('value').Count -gt 0 -and $null -ne $raw.value) {
        $value = [bool]$raw.value
    }
    $description = ''
    if ($raw.PSObject.Properties.Match('description').Count -gt 0 -and $null -ne $raw.description) {
        $description = [string]$raw.description
    }

    return @{ value = $value; description = $description }
}

function New-Verdict {
    param(
        [string]$Verdict,
        [System.Collections.ArrayList]$TriggeredCriteria,
        [hashtable]$TurnSnapshot,
        [string]$RecommendedAction,
        [bool]$WouldBlock,
        [System.Collections.ArrayList]$Flags
    )

    return [ordered]@{
        verdict              = $Verdict
        triggered_criteria    = @($TriggeredCriteria)
        turn_snapshot         = $TurnSnapshot
        recommended_action    = $RecommendedAction
        would_block           = $WouldBlock
        flags                 = @($Flags)
    }
}

function Write-VerdictAndExit {
    param(
        [hashtable]$VerdictObject,
        [int]$ExitCode
    )

    ($VerdictObject | ConvertTo-Json -Depth 10 -Compress:$false) | Write-Output
    exit $ExitCode
}

# Maps an "indeterminate" condition (missing/empty ledger) to the
# verdict/would_block/exit-code triple per enforcement Mode. Mode is
# guaranteed not to be 'off' here — the off short-circuit returns earlier.
# Per Q's Recommendation #6: unverifiable compliance is never a free pass.
function Resolve-IndeterminateOutcome {
    param([string]$Mode)

    if ($Mode -eq 'block') {
        return @{ Verdict = 'indeterminate'; WouldBlock = $false; ExitCode = 1 }
    }
    # 'warn' (default enforcement mode)
    return @{ Verdict = 'indeterminate'; WouldBlock = $true; ExitCode = 0 }
}

$emptyTurnSnapshot = @{
    turn_id                    = $null
    timestamp                  = $null
    mode                       = $null
    task_calls_since_last_turn = 0
    write_tools_used           = @()
    domain_artifact_declared   = @{ value = $false; description = '' }
}

try {
    Write-AuditLog "Starting dispatch audit. LedgerPath='$LedgerPath' Mode='$Mode' SessionId='$SessionId'"

    # -----------------------------------------------------------------
    # Mode = off short-circuits everything but still parses args and logs once.
    # Indeterminate handling below never applies when enforcement is off.
    # -----------------------------------------------------------------
    if ($Mode -eq 'off') {
        Write-AuditLog "Enforcement mode is 'off' — skipping audit." -Level 'warn'
        $verdict = New-Verdict -Verdict 'ok' `
            -TriggeredCriteria (New-Object System.Collections.ArrayList) `
            -TurnSnapshot $emptyTurnSnapshot `
            -RecommendedAction 'Dispatch enforcement is disabled; no audit performed.' `
            -WouldBlock $false `
            -Flags ([System.Collections.ArrayList]@('enforcement_off'))
        Write-VerdictAndExit -VerdictObject $verdict -ExitCode 0
    }

    # -----------------------------------------------------------------
    # Edge case: no ledger file. Per Q's Recommendation #6 (Wave 3 Fix 5),
    # this is "indeterminate" — audit-cannot-verify — not a clean "ok" pass.
    # A coordinator that deletes/never-writes the ledger must not get a free
    # pass. Mapped to warn/block per -Mode.
    # -----------------------------------------------------------------
    if (-not (Test-Path -LiteralPath $LedgerPath)) {
        Write-AuditLog "Ledger not found at '$LedgerPath' — indeterminate (cannot verify compliance)." -Level 'warn'
        $outcome = Resolve-IndeterminateOutcome -Mode $Mode
        $verdict = New-Verdict -Verdict $outcome.Verdict `
            -TriggeredCriteria (New-Object System.Collections.ArrayList) `
            -TurnSnapshot $emptyTurnSnapshot `
            -RecommendedAction "No ledger found at '$LedgerPath'. In Phase 1 (self-written ledger), this may indicate the coordinator did not append an entry for this turn — audit cannot verify compliance. Provide a valid ledger or explicitly acknowledge the missing entry." `
            -WouldBlock $outcome.WouldBlock `
            -Flags ([System.Collections.ArrayList]@('no_ledger'))
        Write-VerdictAndExit -VerdictObject $verdict -ExitCode $outcome.ExitCode
    }

    # -----------------------------------------------------------------
    # Parse ledger (JSONL). Skip malformed lines rather than crashing.
    # -----------------------------------------------------------------
    $rawLines = Get-Content -LiteralPath $LedgerPath -Encoding UTF8
    $turns = New-Object System.Collections.ArrayList
    $flags = New-Object System.Collections.ArrayList
    $hadCorruptLine = $false

    foreach ($line in $rawLines) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        try {
            $obj = $line | ConvertFrom-Json -ErrorAction Stop
            [void]$turns.Add($obj)
        }
        catch {
            $hadCorruptLine = $true
            Write-AuditLog "Skipping malformed ledger line: $($_.Exception.Message)" -Level 'warn'
        }
    }

    if ($hadCorruptLine) {
        [void]$flags.Add('ledger_corrupt')
    }

    # -----------------------------------------------------------------
    # Ledger file exists but has zero usable entries — either genuinely empty,
    # or every line was corrupt (in which case ledger_corrupt is already set
    # above and cascades into this same indeterminate handling). Per Q's
    # Recommendation #6, this is "indeterminate", mapped to warn/block per Mode
    # — NOT the Wave 2 "warn" default.
    # -----------------------------------------------------------------
    if ($turns.Count -eq 0) {
        Write-AuditLog "Ledger parsed but contained no usable turn records — indeterminate (cannot verify compliance)." -Level 'warn'
        [void]$flags.Add('empty_ledger')
        $outcome = Resolve-IndeterminateOutcome -Mode $Mode
        $verdict = New-Verdict -Verdict $outcome.Verdict `
            -TriggeredCriteria (New-Object System.Collections.ArrayList) `
            -TurnSnapshot $emptyTurnSnapshot `
            -RecommendedAction "Ledger file exists at '$LedgerPath' but has no usable turn entries. Coordinator may have failed to append a self-written entry. Audit cannot verify compliance." `
            -WouldBlock $outcome.WouldBlock `
            -Flags $flags
        Write-VerdictAndExit -VerdictObject $verdict -ExitCode $outcome.ExitCode
    }

    # -----------------------------------------------------------------
    # Filter to coordinator_turn records only (Q's Attack N4 fix). The ledger
    # holds two record kinds: coordinator_turn (what we audit) and
    # audit_verdict (verdicts appended after auditing). A record with no
    # record_type field (legacy/coordinator-not-yet-updated) or an explicit
    # record_type of "coordinator_turn" counts as a coordinator turn.
    # Everything else (audit_verdict, future record types) is excluded from
    # both "current turn" selection and criterion #2's history window.
    # -----------------------------------------------------------------
    $coordinatorTurns = @($turns | Where-Object {
        ($_.PSObject.Properties.Match('record_type').Count -eq 0) -or ($_.record_type -eq 'coordinator_turn')
    })

    if ($coordinatorTurns.Count -eq 0) {
        Write-AuditLog "Ledger parsed but contained no coordinator_turn records (only non-turn records, e.g. audit_verdict) — indeterminate (cannot verify compliance)." -Level 'warn'
        [void]$flags.Add('no_coordinator_turns')
        $outcome = Resolve-IndeterminateOutcome -Mode $Mode
        $verdict = New-Verdict -Verdict $outcome.Verdict `
            -TriggeredCriteria (New-Object System.Collections.ArrayList) `
            -TurnSnapshot $emptyTurnSnapshot `
            -RecommendedAction "Ledger file exists at '$LedgerPath' but has no coordinator_turn entries (only non-turn records, e.g. audit_verdict). Audit cannot verify compliance." `
            -WouldBlock $outcome.WouldBlock `
            -Flags $flags
        Write-VerdictAndExit -VerdictObject $verdict -ExitCode $outcome.ExitCode
    }

    # Current turn = last parseable coordinator_turn entry.
    $currentTurn = $coordinatorTurns[$coordinatorTurns.Count - 1]

    # -----------------------------------------------------------------
    # Normalize the fields this script cares about, defensively.
    # -----------------------------------------------------------------
    $turnId = [string](Get-FieldOrDefault -Obj $currentTurn -Name 'turn_id' -Default '')
    $timestamp = [string](Get-FieldOrDefault -Obj $currentTurn -Name 'timestamp' -Default '')
    $turnMode = [string](Get-FieldOrDefault -Obj $currentTurn -Name 'mode' -Default 'Direct')
    $taskCalls = [int](Get-FieldOrDefault -Obj $currentTurn -Name 'task_calls_since_last_turn' -Default 0)
    $writeToolsRaw = Get-FieldOrDefault -Obj $currentTurn -Name 'write_tools_used' -Default @()
    $writeTools = @($writeToolsRaw)
    $domainArtifact = Get-DomainArtifactDeclared -Obj $currentTurn
    $justification = [string](Get-FieldOrDefault -Obj $currentTurn -Name 'justification' -Default '')

    $turnSnapshot = @{
        turn_id                    = $turnId
        timestamp                  = $timestamp
        mode                       = $turnMode
        task_calls_since_last_turn = $taskCalls
        write_tools_used           = $writeTools
        domain_artifact_declared   = $domainArtifact
    }

    Write-AuditLog "Current turn snapshot: turn_id=$turnId mode=$turnMode task_calls=$taskCalls write_tools=[$($writeTools -join ',')] domain_artifact.value=$($domainArtifact.value)"

    # -----------------------------------------------------------------
    # Schema flag: justification required-but-missing. This is independent of
    # triggered_criteria — it never changes the verdict by itself.
    # -----------------------------------------------------------------
    $justificationRequired = ($turnMode -eq 'Direct') -and ($writeTools.Count -gt 0 -or $domainArtifact.value -eq $true)
    if ($justificationRequired -and [string]::IsNullOrEmpty($justification)) {
        Write-AuditLog "Justification required but missing/empty for this turn." -Level 'warn'
        [void]$flags.Add('justification_missing')
    }

    $triggered = New-Object System.Collections.ArrayList

    # --- Criterion 1: wrote without dispatching ---------------------------
    if ($writeTools.Count -gt 0 -and $taskCalls -eq 0) {
        [void]$triggered.Add(@{
            id          = 1
            name        = 'wrote-without-dispatch'
            explanation = "Coordinator invoked write tool(s) [$($writeTools -join ', ')] but made zero task/dispatch calls this turn."
        })
    }

    # --- Criterion 2: drift / stalling (needs >= 3 turns of history) ------
    if ($coordinatorTurns.Count -lt 3) {
        [void]$flags.Add('insufficient_history')
        Write-AuditLog "Fewer than 3 coordinator turns of history ($($coordinatorTurns.Count)) — skipping criterion #2." -Level 'warn'
    }
    else {
        $lastThree = $coordinatorTurns[($coordinatorTurns.Count - 3)..($coordinatorTurns.Count - 1)]
        $allZeroTaskCalls = $true
        foreach ($t in $lastThree) {
            $tc = [int](Get-FieldOrDefault -Obj $t -Name 'task_calls_since_last_turn' -Default 0)
            if ($tc -ne 0) {
                $allZeroTaskCalls = $false
                break
            }
        }

        if ($turnMode -ne 'Direct' -and $allZeroTaskCalls) {
            [void]$triggered.Add(@{
                id          = 2
                name        = 'dispatch-drift'
                explanation = "Mode is '$turnMode' (not Direct) but the last 3 coordinator turns each had zero task/dispatch calls — possible stalling or silent inline work."
            })
        }
    }

    # --- Criterion 3: inline hallucination (Direct + declared artifact, no write tool) --
    if ($domainArtifact.value -eq $true -and $turnMode -eq 'Direct' -and $writeTools.Count -eq 0) {
        [void]$triggered.Add(@{
            id          = 3
            name        = 'inline-hallucination'
            explanation = "Coordinator declared a domain artifact (code/prose/analysis) in mode 'Direct' with no write tools invoked and no dispatch — content was emitted directly in the message."
        })
    }

    # -----------------------------------------------------------------
    # Map triggered criteria + Mode to verdict / exit code.
    # -----------------------------------------------------------------
    $hasViolation = $triggered.Count -gt 0
    $verdictStr = 'ok'
    $wouldBlock = $false
    $exitCode = 0
    $recommendedAction = 'No dispatch-contract violations detected for this turn.'

    if ($hasViolation) {
        $names = ($triggered | ForEach-Object { $_.name }) -join ', '
        switch ($Mode) {
            'warn' {
                $verdictStr = 'warn'
                $wouldBlock = $true
                $exitCode = 0
                $recommendedAction = "Dispatch contract violation(s) detected ($names). Enforcement mode is 'warn' — turn proceeds, but tell the user this would block under -Mode block."
            }
            'block' {
                $verdictStr = 'block'
                $wouldBlock = $false
                $exitCode = 1
                $recommendedAction = "Dispatch contract violation(s) detected ($names). Enforcement mode is 'block' — abort this turn and require the coordinator to dispatch to the correct specialist."
            }
        }
    }

    Write-AuditLog "Verdict='$verdictStr' would_block=$wouldBlock exit=$exitCode flags=[$($flags -join ',')]"

    $verdict = New-Verdict -Verdict $verdictStr `
        -TriggeredCriteria $triggered `
        -TurnSnapshot $turnSnapshot `
        -RecommendedAction $recommendedAction `
        -WouldBlock $wouldBlock `
        -Flags $flags

    Write-VerdictAndExit -VerdictObject $verdict -ExitCode $exitCode
}
catch {
    Write-AuditLog "Unexpected error: $($_.Exception.Message)" -Level 'error'
    Write-AuditLog ($_.ScriptStackTrace) -Level 'error'
    # Script errors are exit code 2, not part of the normal JSON verdict contract,
    # but we still emit a best-effort JSON so a strict-JSON-only consumer doesn't crash.
    $errorPayload = [ordered]@{
        verdict              = 'error'
        triggered_criteria    = @()
        turn_snapshot         = $emptyTurnSnapshot
        recommended_action    = "Script error: $($_.Exception.Message). Treat as non-authoritative; check stderr trace."
        would_block           = $false
        flags                 = @('script_error')
    }
    ($errorPayload | ConvertTo-Json -Depth 10) | Write-Output
    exit 2
}
