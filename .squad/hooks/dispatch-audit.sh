#!/usr/bin/env bash
#
# dispatch-audit.sh
#
# SYNOPSIS
#   Audits a single coordinator turn against the Squad dispatch contract.
#   Bash port of dispatch-audit.ps1 -- identical behavior contract.
#
# DESCRIPTION
#   Ralph's DispatchGuard invokes this script once per coordinator turn to detect
#   "inline hallucination" -- cases where the SquadShort coordinator does domain
#   work (writes code/prose/analysis) directly instead of dispatching it to a
#   specialist agent via task / runSubagent / create_session.
#
#   The script reads the session's ledger at the given path (JSONL -- one JSON
#   object per coordinator turn per Chakotay's finalized schema), evaluates the
#   current turn (last parseable line) plus recent history against three violation
#   criteria, and emits a single structured JSON verdict on stdout for Ralph to
#   consume or act on.
#
#   Verdict values: "ok" | "warn" | "block" | "indeterminate" | "error"
#
#   "indeterminate" means the ledger was expected but is missing, empty, or
#   otherwise cannot be evaluated. Per Q's Recommendation #6 (Wave 3):
#   unverifiable compliance must not default to a free pass.
#
#   This script never writes to the ledger, never mutates repo state, and
#   performs no network calls. It is a pure read-and-report audit.
#
# USAGE
#   dispatch-audit.sh --ledger-path PATH --mode MODE [--session-id ID] [--trace]
#   dispatch-audit.sh -l PATH -m MODE [-s ID] [-t]
#
# OPTIONS
#   -l, --ledger-path PATH   Path to coordinator ledger JSONL file (required)
#   -m, --mode MODE          warn | block | off (required)
#   -s, --session-id ID      Session identifier (optional, for logging only)
#   -t, --trace              Enable stderr trace logging (optional, default off)
#   -h, --help               Show this help and exit
#
# EXIT CODES
#   0  No block (verdict: ok, warn, or indeterminate in warn mode)
#   1  Block (verdict: block, or indeterminate in block mode)
#   2  Script error (missing dependency, bad args, unexpected failure)
#
# DEPENDENCIES
#   bash >= 4 (arrays, [[ ]], local)
#   jq >= 1.6 (JSON parsing and generation)
#
# AUTHOR
#   Data (Code Expert), Squad Wave 3
#   Bash port of dispatch-audit.ps1 (PowerShell canonical implementation).
#   Any behavioural divergence between the two is a bug -- file an issue.

set -euo pipefail
set -E  # ERR trap inherited by shell functions

# ---------------------------------------------------------------------------
# Globals / defaults
# ---------------------------------------------------------------------------
LEDGER_PATH=""
MODE="warn"
SESSION_ID=""
TRACE=false

# Empty turn snapshot -- mirrors $emptyTurnSnapshot in ps1 (null values, not "")
readonly _EMPTY_SNAPSHOT='{"turn_id":null,"timestamp":null,"mode":null,"task_calls_since_last_turn":0,"write_tools_used":[],"domain_artifact_declared":{"value":false,"description":""}}'

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
_usage() {
    cat <<'USAGE'
Usage: dispatch-audit.sh --ledger-path PATH --mode MODE [--session-id ID] [--trace]

Audits a coordinator turn against the Squad dispatch contract.
Bash port of dispatch-audit.ps1 -- identical behavior.

Options:
  -l, --ledger-path PATH   Path to coordinator ledger JSONL file (required)
  -m, --mode MODE          warn | block | off (required)
  -s, --session-id ID      Session identifier (optional, for logging)
  -t, --trace              Enable stderr trace logging (optional, default off)
  -h, --help               Show this help

Exit codes:
  0  No block (ok, warn, or indeterminate in warn mode)
  1  Block (block verdict, or indeterminate in block mode)
  2  Script error
USAGE
}

# ---------------------------------------------------------------------------
# jq dependency check
# ---------------------------------------------------------------------------
_require_jq() {
    if ! command -v jq &>/dev/null; then
        printf 'Error: jq is required but not found in PATH. Install with:\n' >&2
        printf '  apt-get install jq    (Debian/Ubuntu)\n' >&2
        printf '  brew install jq       (macOS)\n' >&2
        printf '  apk add jq            (Alpine)\n' >&2
        exit 2
    fi
}

# ---------------------------------------------------------------------------
# Logging -- mirrors Write-AuditLog in ps1.
# Writes to stderr only. Never touches stdout (reserved for JSON verdict).
# info-level messages are suppressed unless --trace is active.
# ---------------------------------------------------------------------------
write_audit_log() {
    local message="$1"
    local level="${2:-info}"
    if [[ "$level" == "info" && "$TRACE" != "true" ]]; then
        return 0
    fi
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || printf '0000-00-00T00:00:00.000Z')
    printf '[dispatch-audit][%s][%s] %s\n' "$level" "$ts" "$message" >&2
}

# ---------------------------------------------------------------------------
# normalize_domain_artifact
# Mirrors Get-DomainArtifactDeclared in ps1.
# Normalizes any shape of domain_artifact_declared to {value:bool, description:str}.
#   null          => {"value":false,"description":""}
#   bool (legacy) => {"value":<bool>,"description":""}
#   object        => {"value":<bool>,"description":"<str>"}
# $1 = raw JSON value of the field (may be "null", a bool, or an object)
# Outputs compact JSON on stdout.
# ---------------------------------------------------------------------------
normalize_domain_artifact() {
    local raw_json="$1"
    printf '%s' "$raw_json" | jq -c '
        if . == null then
            {"value": false, "description": ""}
        elif type == "boolean" then
            {"value": ., "description": ""}
        else
            {
                "value": (if (.value != null) and ((.value | type) == "boolean") then .value else false end),
                "description": (if .description != null then (.description | tostring) else "" end)
            }
        end
    '
}

# ---------------------------------------------------------------------------
# resolve_indeterminate
# Mirrors Resolve-IndeterminateOutcome in ps1.
# Per Q's Recommendation #6: unverifiable compliance is never a free pass.
# Sets globals: _indet_verdict, _indet_would_block (JSON bool string), _indet_exit
# $1 = enforcement mode ("warn" or "block") -- guaranteed not "off"
# ---------------------------------------------------------------------------
resolve_indeterminate() {
    local mode="$1"
    _indet_verdict="indeterminate"
    if [[ "$mode" == "block" ]]; then
        _indet_would_block="false"
        _indet_exit=1
    else
        # warn (default enforcement mode)
        _indet_would_block="true"
        _indet_exit=0
    fi
}

# ---------------------------------------------------------------------------
# build_verdict_json
# Mirrors New-Verdict in ps1. Builds the JSON verdict object (compact).
# Args: verdict triggered_criteria turn_snapshot recommended_action would_block flags
# All array/object args must be valid compact JSON.
# ---------------------------------------------------------------------------
build_verdict_json() {
    local verdict="$1"
    local triggered_criteria="$2"
    local turn_snapshot="$3"
    local recommended_action="$4"
    local would_block="$5"
    local flags="$6"

    jq -cn \
        --arg              verdict             "$verdict" \
        --argjson          triggered_criteria  "$triggered_criteria" \
        --argjson          turn_snapshot       "$turn_snapshot" \
        --arg              recommended_action  "$recommended_action" \
        --argjson          would_block         "$would_block" \
        --argjson          flags               "$flags" \
        '{
            verdict:              $verdict,
            triggered_criteria:   $triggered_criteria,
            turn_snapshot:        $turn_snapshot,
            recommended_action:   $recommended_action,
            would_block:          $would_block,
            flags:                $flags
        }'
}

# ---------------------------------------------------------------------------
# write_verdict_and_exit
# Mirrors Write-VerdictAndExit in ps1.
# Emits the verdict JSON (pretty-printed) to stdout and exits.
# $1 = compact JSON verdict object
# $2 = exit code
# ---------------------------------------------------------------------------
write_verdict_and_exit() {
    local verdict_compact="$1"
    local exit_code="$2"
    printf '%s' "$verdict_compact" | jq '.'
    exit "$exit_code"
}

# ---------------------------------------------------------------------------
# Error handler -- mirrors the catch block in ps1.
# Fires on unexpected ERR (via trap). Emits a best-effort error verdict so
# a strict-JSON-only consumer does not crash.
# ---------------------------------------------------------------------------
_error_handler() {
    local line="${1:-?}"
    printf '[dispatch-audit][error] Unexpected error near line %s\n' "$line" >&2
    local emsg="Script error near line $line. Treat as non-authoritative; check stderr trace."
    local ev
    ev=$(jq -cn --arg msg "$emsg" '{
        verdict:            "error",
        triggered_criteria: [],
        turn_snapshot:      {turn_id:null,timestamp:null,mode:null,task_calls_since_last_turn:0,write_tools_used:[],domain_artifact_declared:{value:false,description:""}},
        recommended_action: $msg,
        would_block:        false,
        flags:              ["script_error"]
    }') || ev='{"verdict":"error","triggered_criteria":[],"turn_snapshot":{},"recommended_action":"Script error","would_block":false,"flags":["script_error"]}'
    printf '%s' "$ev" | jq '.' 2>/dev/null || printf '%s\n' "$ev"
    exit 2
}

trap '_error_handler $LINENO' ERR

# ===========================================================================
# MAIN
# ===========================================================================
main() {

    # -----------------------------------------------------------------------
    # Parse arguments
    # -----------------------------------------------------------------------
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -l|--ledger-path)
                [[ $# -lt 2 ]] && { printf 'Error: %s requires a value\n' "$1" >&2; _usage >&2; exit 2; }
                LEDGER_PATH="$2"; shift 2 ;;
            -m|--mode)
                [[ $# -lt 2 ]] && { printf 'Error: %s requires a value\n' "$1" >&2; _usage >&2; exit 2; }
                MODE="$2"; shift 2 ;;
            -s|--session-id)
                [[ $# -lt 2 ]] && { printf 'Error: %s requires a value\n' "$1" >&2; _usage >&2; exit 2; }
                SESSION_ID="$2"; shift 2 ;;
            -t|--trace)
                TRACE=true; shift ;;
            -h|--help)
                _usage; exit 0 ;;
            --)
                shift; break ;;
            -*)
                printf 'Error: Unknown option: %s\n' "$1" >&2; _usage >&2; exit 2 ;;
            *)
                printf 'Error: Unexpected argument: %s\n' "$1" >&2; _usage >&2; exit 2 ;;
        esac
    done

    [[ -z "$LEDGER_PATH" ]] && { printf 'Error: --ledger-path is required\n' >&2; _usage >&2; exit 2; }
    case "$MODE" in
        warn|block|off) ;;
        *) printf 'Error: --mode must be one of: warn, block, off (got: %s)\n' "$MODE" >&2; _usage >&2; exit 2 ;;
    esac

    _require_jq

    write_audit_log "Starting dispatch audit. LedgerPath='$LEDGER_PATH' Mode='$MODE' SessionId='$SESSION_ID'"

    # -----------------------------------------------------------------------
    # Mode = off short-circuit -- mirrors ps1 exactly.
    # Still parses args and logs once; indeterminate handling never applies.
    # -----------------------------------------------------------------------
    if [[ "$MODE" == "off" ]]; then
        write_audit_log "Enforcement mode is 'off' -- skipping audit." "warn"
        local v
        v=$(build_verdict_json \
            "ok" \
            "[]" \
            "$_EMPTY_SNAPSHOT" \
            "Dispatch enforcement is disabled; no audit performed." \
            "false" \
            '["enforcement_off"]')
        write_verdict_and_exit "$v" 0
    fi

    # -----------------------------------------------------------------------
    # Edge case: ledger file missing => indeterminate.
    # Per Q's Recommendation #6: a coordinator that never writes the ledger
    # must not receive a free pass. Mapped to warn/block per -Mode.
    # -----------------------------------------------------------------------
    if [[ ! -f "$LEDGER_PATH" ]]; then
        write_audit_log "Ledger not found at '$LEDGER_PATH' -- indeterminate (cannot verify compliance)." "warn"
        resolve_indeterminate "$MODE"
        local v
        v=$(build_verdict_json \
            "$_indet_verdict" \
            "[]" \
            "$_EMPTY_SNAPSHOT" \
            "No ledger found at '$LEDGER_PATH'. In Phase 1 (self-written ledger), this may indicate the coordinator did not append an entry for this turn -- audit cannot verify compliance. Provide a valid ledger or explicitly acknowledge the missing entry." \
            "$_indet_would_block" \
            '["no_ledger"]')
        write_verdict_and_exit "$v" "$_indet_exit"
    fi

    # -----------------------------------------------------------------------
    # Parse JSONL -- skip blank and malformed lines, matching ps1 behavior.
    # -----------------------------------------------------------------------
    local -a turns_json=()
    local -a flags_arr=()
    local had_corrupt=false

    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip blank / whitespace-only lines
        if [[ -z "${line//[[:space:]]/}" ]]; then
            continue
        fi
        if printf '%s' "$line" | jq -e . >/dev/null 2>&1; then
            turns_json+=("$line")
        else
            had_corrupt=true
            write_audit_log "Skipping malformed ledger line: invalid JSON" "warn"
        fi
    done < "$LEDGER_PATH"

    if [[ "$had_corrupt" == "true" ]]; then
        flags_arr+=("ledger_corrupt")
    fi

    # -----------------------------------------------------------------------
    # Empty ledger => indeterminate.
    # Mirrors ps1: zero usable entries (or all lines corrupt) => indeterminate.
    # -----------------------------------------------------------------------
    if [[ ${#turns_json[@]} -eq 0 ]]; then
        write_audit_log "Ledger parsed but contained no usable turn records -- indeterminate (cannot verify compliance)." "warn"
        flags_arr+=("empty_ledger")
        resolve_indeterminate "$MODE"
        local fj
        if [[ ${#flags_arr[@]} -eq 0 ]]; then
            fj="[]"
        else
            fj=$(printf '%s\n' "${flags_arr[@]}" | jq -R . | jq -sc .)
        fi
        local v
        v=$(build_verdict_json \
            "$_indet_verdict" \
            "[]" \
            "$_EMPTY_SNAPSHOT" \
            "Ledger file exists at '$LEDGER_PATH' but has no usable turn entries. Coordinator may have failed to append a self-written entry. Audit cannot verify compliance." \
            "$_indet_would_block" \
            "$fj")
        write_verdict_and_exit "$v" "$_indet_exit"
    fi

    # -----------------------------------------------------------------------
    # Filter to coordinator_turn records only -- mirrors Q's Attack N4 fix.
    # Records with no record_type field, or record_type == "coordinator_turn",
    # are audited. audit_verdict and any other types are excluded.
    # -----------------------------------------------------------------------
    local -a coordinator_turns=()
    local turn_str rt
    for turn_str in "${turns_json[@]}"; do
        rt=$(printf '%s' "$turn_str" | jq -r '.record_type // ""')
        if [[ -z "$rt" ]] || [[ "$rt" == "coordinator_turn" ]]; then
            coordinator_turns+=("$turn_str")
        fi
    done

    # -----------------------------------------------------------------------
    # No coordinator turns (only audit_verdict records, etc.) => indeterminate.
    # -----------------------------------------------------------------------
    if [[ ${#coordinator_turns[@]} -eq 0 ]]; then
        write_audit_log "Ledger parsed but contained no coordinator_turn records (only non-turn records, e.g. audit_verdict) -- indeterminate (cannot verify compliance)." "warn"
        flags_arr+=("no_coordinator_turns")
        resolve_indeterminate "$MODE"
        local fj
        if [[ ${#flags_arr[@]} -eq 0 ]]; then
            fj="[]"
        else
            fj=$(printf '%s\n' "${flags_arr[@]}" | jq -R . | jq -sc .)
        fi
        local v
        v=$(build_verdict_json \
            "$_indet_verdict" \
            "[]" \
            "$_EMPTY_SNAPSHOT" \
            "Ledger file exists at '$LEDGER_PATH' but has no coordinator_turn entries (only non-turn records, e.g. audit_verdict). Audit cannot verify compliance." \
            "$_indet_would_block" \
            "$fj")
        write_verdict_and_exit "$v" "$_indet_exit"
    fi

    # Current turn = last parseable coordinator_turn entry
    local current_turn="${coordinator_turns[${#coordinator_turns[@]}-1]}"

    # -----------------------------------------------------------------------
    # Normalize fields from current turn -- mirrors the ps1 normalization block.
    # Defaults: turn_id/timestamp/justification => "", mode => "Direct",
    # task_calls => 0, write_tools_used => [], domain_artifact => {false, ""}.
    # -----------------------------------------------------------------------
    local turn_id timestamp turn_mode task_calls justification
    local write_tools_json domain_artifact_raw domain_artifact_json
    local write_tools_count domain_artifact_value write_tools_list

    turn_id=$(printf '%s' "$current_turn"    | jq -r '.turn_id // ""')
    timestamp=$(printf '%s' "$current_turn"  | jq -r '.timestamp // ""')
    turn_mode=$(printf '%s' "$current_turn"  | jq -r '.mode // "Direct"')
    task_calls=$(printf '%s' "$current_turn" | jq -r '.task_calls_since_last_turn // 0')
    justification=$(printf '%s' "$current_turn" | jq -r '.justification // ""')

    write_tools_json=$(printf '%s' "$current_turn" | jq -c '.write_tools_used // []')
    write_tools_count=$(printf '%s' "$write_tools_json" | jq 'length')

    domain_artifact_raw=$(printf '%s' "$current_turn" | jq -c '.domain_artifact_declared')
    domain_artifact_json=$(normalize_domain_artifact "$domain_artifact_raw")
    domain_artifact_value=$(printf '%s' "$domain_artifact_json" | jq -r '.value')

    write_tools_list=""
    if [[ "$write_tools_count" -gt 0 ]]; then
        write_tools_list=$(printf '%s' "$write_tools_json" | jq -r 'join(", ")')
    fi

    # Build turn_snapshot (passed through to the verdict JSON)
    local turn_snapshot
    turn_snapshot=$(jq -cn \
        --arg    turn_id                    "$turn_id" \
        --arg    timestamp                  "$timestamp" \
        --arg    mode                       "$turn_mode" \
        --argjson task_calls_since_last_turn "$task_calls" \
        --argjson write_tools_used          "$write_tools_json" \
        --argjson domain_artifact_declared  "$domain_artifact_json" \
        '{
            turn_id:                    $turn_id,
            timestamp:                  $timestamp,
            mode:                       $mode,
            task_calls_since_last_turn: $task_calls_since_last_turn,
            write_tools_used:           $write_tools_used,
            domain_artifact_declared:   $domain_artifact_declared
        }')

    write_audit_log "Current turn snapshot: turn_id=$turn_id mode=$turn_mode task_calls=$task_calls write_tools=[$write_tools_list] domain_artifact.value=$domain_artifact_value"

    # -----------------------------------------------------------------------
    # Schema flag: justification required but missing.
    # Independent of triggered_criteria -- never changes verdict by itself.
    # -----------------------------------------------------------------------
    local justification_required=false
    if [[ "$turn_mode" == "Direct" ]]; then
        if [[ "$write_tools_count" -gt 0 ]] || [[ "$domain_artifact_value" == "true" ]]; then
            justification_required=true
        fi
    fi
    if [[ "$justification_required" == "true" ]] && [[ -z "$justification" ]]; then
        write_audit_log "Justification required but missing/empty for this turn." "warn"
        flags_arr+=("justification_missing")
    fi

    local -a triggered_json=()

    # -----------------------------------------------------------------------
    # Criterion 1: wrote without dispatching.
    # write_tools_used.length > 0 AND task_calls_since_last_turn == 0
    # -----------------------------------------------------------------------
    if [[ "$write_tools_count" -gt 0 ]] && [[ "$task_calls" -eq 0 ]]; then
        local crit1_expl crit1
        crit1_expl="Coordinator invoked write tool(s) [$write_tools_list] but made zero task/dispatch calls this turn."
        crit1=$(jq -cn --arg explanation "$crit1_expl" \
            '{"id":1,"name":"wrote-without-dispatch","explanation":$explanation}')
        triggered_json+=("$crit1")
    fi

    # -----------------------------------------------------------------------
    # Criterion 2: dispatch drift / stalling.
    # Requires >= 3 coordinator turns of history. Checks the last 3.
    # -----------------------------------------------------------------------
    if [[ ${#coordinator_turns[@]} -lt 3 ]]; then
        flags_arr+=("insufficient_history")
        write_audit_log "Fewer than 3 coordinator turns of history (${#coordinator_turns[@]}) -- skipping criterion #2." "warn"
    else
        local start_idx=$(( ${#coordinator_turns[@]} - 3 ))
        local all_zero=true
        local i tc
        for (( i=start_idx; i<${#coordinator_turns[@]}; i++ )); do
            tc=$(printf '%s' "${coordinator_turns[$i]}" | jq -r '.task_calls_since_last_turn // 0')
            if [[ "$tc" -ne 0 ]]; then
                all_zero=false
                break
            fi
        done

        if [[ "$turn_mode" != "Direct" ]] && [[ "$all_zero" == "true" ]]; then
            local crit2_expl crit2
            crit2_expl="Mode is '$turn_mode' (not Direct) but the last 3 coordinator turns each had zero task/dispatch calls — possible stalling or silent inline work."
            crit2=$(jq -cn --arg explanation "$crit2_expl" \
                '{"id":2,"name":"dispatch-drift","explanation":$explanation}')
            triggered_json+=("$crit2")
        fi
    fi

    # -----------------------------------------------------------------------
    # Criterion 3: inline hallucination.
    # domain_artifact_declared.value == true AND mode == Direct AND write_tools == 0
    # -----------------------------------------------------------------------
    if [[ "$domain_artifact_value" == "true" ]] && [[ "$turn_mode" == "Direct" ]] && [[ "$write_tools_count" -eq 0 ]]; then
        local crit3_expl crit3
        crit3_expl="Coordinator declared a domain artifact (code/prose/analysis) in mode 'Direct' with no write tools invoked and no dispatch — content was emitted directly in the message."
        crit3=$(jq -cn --arg explanation "$crit3_expl" \
            '{"id":3,"name":"inline-hallucination","explanation":$explanation}')
        triggered_json+=("$crit3")
    fi

    # -----------------------------------------------------------------------
    # Map triggered criteria + Mode to verdict / exit code.
    # Mirrors the switch block in ps1 exactly.
    # -----------------------------------------------------------------------
    local verdict_str="ok"
    local would_block="false"
    local exit_code=0
    local recommended_action="No dispatch-contract violations detected for this turn."

    if [[ ${#triggered_json[@]} -gt 0 ]]; then
        # Build names string (comma-space joined) -- mirrors ($triggered | ForEach... -join ', ')
        local -a names_arr=()
        local t name
        for t in "${triggered_json[@]}"; do
            name=$(printf '%s' "$t" | jq -r '.name')
            names_arr+=("$name")
        done
        local names_str="${names_arr[0]}"
        local k
        for (( k=1; k<${#names_arr[@]}; k++ )); do
            names_str="$names_str, ${names_arr[$k]}"
        done

        case "$MODE" in
            warn)
                verdict_str="warn"
                would_block="true"
                exit_code=0
                recommended_action="Dispatch contract violation(s) detected ($names_str). Enforcement mode is 'warn' — turn proceeds, but tell the user this would block under -Mode block."
                ;;
            block)
                verdict_str="block"
                would_block="false"
                exit_code=1
                recommended_action="Dispatch contract violation(s) detected ($names_str). Enforcement mode is 'block' — abort this turn and require the coordinator to dispatch to the correct specialist."
                ;;
        esac
    fi

    # Build flags log string
    local flags_log=""
    if [[ ${#flags_arr[@]} -gt 0 ]]; then
        flags_log="${flags_arr[0]}"
        local fi
        for (( fi=1; fi<${#flags_arr[@]}; fi++ )); do
            flags_log="$flags_log,${flags_arr[$fi]}"
        done
    fi
    write_audit_log "Verdict='$verdict_str' would_block=$would_block exit=$exit_code flags=[$flags_log]"

    # -----------------------------------------------------------------------
    # Build final JSON arrays and emit verdict
    # -----------------------------------------------------------------------
    local triggered_arr_json fj verdict_json
    if [[ ${#triggered_json[@]} -eq 0 ]]; then
        triggered_arr_json="[]"
    else
        triggered_arr_json=$(printf '%s\n' "${triggered_json[@]}" | jq -sc .)
    fi

    if [[ ${#flags_arr[@]} -eq 0 ]]; then
        fj="[]"
    else
        fj=$(printf '%s\n' "${flags_arr[@]}" | jq -R . | jq -sc .)
    fi

    verdict_json=$(build_verdict_json \
        "$verdict_str" \
        "$triggered_arr_json" \
        "$turn_snapshot" \
        "$recommended_action" \
        "$would_block" \
        "$fj")

    write_verdict_and_exit "$verdict_json" "$exit_code"
}

main "$@"