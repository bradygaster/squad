#!/usr/bin/env bash
#
# run-tests.sh -- Parity test runner for dispatch-audit.sh (and .ps1 when available)
#
# Runs both implementations against every fixture and compares their enforcement
# decisions (verdict, triggered_criteria ids, would_block, flags) to prove parity.
#
# NOTE ON KNOWN PLATFORM DIFFERENCES (not bugs):
#   * turn_snapshot.timestamp: PowerShell auto-parses ISO 8601 strings into DateTime
#     objects and re-formats them in locale format ("07/26/2026 20:00:00").
#     The bash implementation preserves the original ISO string. This is a PS1
#     quirk, not intentional -- the enforcement decision is unaffected.
#   * recommended_action: contains the --ledger-path argument verbatim; paths
#     differ between WSL Linux paths and Windows paths. Non-functional.
#   * JSON key order: different JSON libraries produce different key orderings.
#     Normalized by comparing sorted keys.
#
# Usage: ./run-tests.sh [--mode MODE] [--sh-only] [--ps1-only] [--verbose]
#   --mode MODE    Enforcement mode to test (default: warn)
#   --sh-only      Only run the bash implementation (skip ps1 comparison)
#   --ps1-only     Only run the ps1 implementation
#   --verbose      Print full JSON output for every fixture
#   -h, --help     Show this help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(dirname "$SCRIPT_DIR")"
SH_SCRIPT="$HOOKS_DIR/dispatch-audit.sh"
PS1_SCRIPT="$HOOKS_DIR/dispatch-audit.ps1"
FIXTURES_DIR="$SCRIPT_DIR"

MODE="warn"
RUN_SH=true
RUN_PS1=true
VERBOSE=false

# Colour codes (suppressed when not a TTY)
if [[ -t 1 ]]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; RESET=''
fi

_pass() { printf "${GREEN}PASS${RESET} %s\n" "$*"; }
_fail() { printf "${RED}FAIL${RESET} %s\n" "$*"; }
_skip() { printf "${YELLOW}SKIP${RESET} %s\n" "$*"; }
_info() { printf "     %s\n" "$*"; }

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --mode)    MODE="$2"; shift 2 ;;
        --sh-only) RUN_PS1=false; shift ;;
        --ps1-only) RUN_SH=false; shift ;;
        --verbose) VERBOSE=true; shift ;;
        -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
    esac
done

# Dependency checks
if ! command -v jq &>/dev/null; then
    printf 'Error: jq required. Install: apt-get install jq | brew install jq\n' >&2; exit 1
fi

HAVE_PWSH=false
if command -v pwsh &>/dev/null; then HAVE_PWSH=true; fi

if [[ "$RUN_PS1" == "true" ]] && [[ "$HAVE_PWSH" == "false" ]]; then
    printf -- "${YELLOW}INFO${RESET}: pwsh not found -- ps1 comparison will be skipped.\n"
    RUN_PS1=false
fi

# Fixture table: "file|expected_verdict|expected_exit"
FIXTURES=(
    "compliant.jsonl|ok|0"
    "criterion1-triggered.jsonl|warn|0"
    "criterion2-triggered.jsonl|warn|0"
    "criterion3-triggered.jsonl|warn|0"
    "empty.jsonl|indeterminate|0"
    "malformed.jsonl|ok|0"
    "mixed-with-verdicts.jsonl|warn|0"
)

# Extract semantic fields for comparison (ignoring timestamp format and paths)
# Outputs sorted JSON of: verdict, would_block, triggered_criteria[].{id,name}, flags[]
semantic_fields() {
    jq -Sc '{
        verdict: .verdict,
        would_block: .would_block,
        triggered: [ .triggered_criteria[]? | {id: .id, name: .name} ] | sort_by(.id),
        flags: [ .flags[]? ] | sort
    }' 2>/dev/null || printf 'PARSE_ERROR'
}

PASS=0; FAIL=0; SKIP=0

printf '\n=== dispatch-audit parity tests (mode=%s) ===\n\n' "$MODE"

for entry in "${FIXTURES[@]}"; do
    IFS='|' read -r fixture expected_verdict expected_exit <<< "$entry"
    printf -- '--- %s ---\n' "$fixture"

    sh_raw="" sh_exit=0
    if [[ "$RUN_SH" == "true" ]]; then
        sh_raw=$(bash "$SH_SCRIPT" --ledger-path "$FIXTURES_DIR/$fixture" \
            --mode "$MODE" 2>/dev/null) || sh_exit=$?
        sh_verdict=$(printf '%s' "$sh_raw" | jq -r '.verdict' 2>/dev/null || printf 'PARSE_ERROR')

        if [[ "$sh_exit" -eq "$expected_exit" && "$sh_verdict" == "$expected_verdict" ]]; then
            _pass "sh: exit=$sh_exit verdict=$sh_verdict"
            (( PASS++ )) || true
        else
            _fail "sh: expected exit=$expected_exit verdict=$expected_verdict, got exit=$sh_exit verdict=$sh_verdict"
            (( FAIL++ )) || true
        fi

        if [[ "$VERBOSE" == "true" ]]; then
            _info "$(printf '%s' "$sh_raw" | jq -S '.')"
        fi
    fi

    if [[ "$RUN_PS1" == "true" ]]; then
        ps1_raw="" ps1_exit=0
        ps1_raw=$(pwsh -NonInteractive -NoProfile -File "$PS1_SCRIPT" \
            -LedgerPath "$FIXTURES_DIR/$fixture" -Mode "$MODE" 2>/dev/null) || ps1_exit=$?

        sh_sem=$(printf '%s' "$sh_raw"  | semantic_fields)
        ps1_sem=$(printf '%s' "$ps1_raw" | semantic_fields)

        if [[ "$sh_sem" == "$ps1_sem" ]]; then
            _pass "parity: sh == ps1 semantic fields match"
            (( PASS++ )) || true
        else
            _fail "parity: sh != ps1 semantic mismatch for $fixture"
            _info "sh:  $sh_sem"
            _info "ps1: $ps1_sem"
            (( FAIL++ )) || true
        fi
    else
        (( SKIP++ )) || true
        _skip "parity check skipped (pwsh unavailable)"
    fi

    printf '\n'
done

printf '=== Results: %d passed, %d failed, %d skipped ===\n' "$PASS" "$FAIL" "$SKIP"
[[ "$FAIL" -eq 0 ]]