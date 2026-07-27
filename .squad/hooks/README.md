# dispatch-audit — Platform Guide

Audits a coordinator turn against the Squad dispatch contract. Two implementations; identical behaviour.

---

## Which script to use

| Platform           | Script                   | Prerequisite           |
|--------------------|--------------------------|------------------------|
| **Windows**        | `dispatch-audit.ps1`     | PowerShell 7+ (`pwsh`) |
| **Linux / macOS**  | `dispatch-audit.sh`      | `jq` ≥ 1.6             |
| **WSL2**           | Either works             | Both available         |

---

## Prerequisites

### PowerShell (`.ps1`)
```
pwsh --version   # must be 7+
```
No other dependencies — PowerShell's `ConvertFrom-Json` handles parsing.

### Bash (`.sh`)
```bash
jq --version     # must be 1.6+

# Install jq if missing:
apt-get install jq      # Debian/Ubuntu
brew install jq         # macOS
apk add jq              # Alpine
```

---

## Invocation

### PowerShell
```powershell
# Warn mode (default)
.\dispatch-audit.ps1 -LedgerPath ".squad/orchestration-log/ledger-sess-8841.jsonl" -Mode warn

# Block mode with trace
.\dispatch-audit.ps1 -LedgerPath $ledgerPath -Mode block -SessionId $env:COPILOT_SESSION_ID -Trace

# Enforcement disabled
.\dispatch-audit.ps1 -LedgerPath $ledgerPath -Mode off
```

### Bash
```bash
# Warn mode (default)
./dispatch-audit.sh --ledger-path .squad/orchestration-log/ledger-sess-8841.jsonl --mode warn

# Block mode with trace
./dispatch-audit.sh -l "$LEDGER_PATH" -m block -s "$COPILOT_SESSION_ID" --trace

# Short forms
./dispatch-audit.sh -l ledger.jsonl -m warn -s sess-123
```

---

## Output format

Both scripts emit **one JSON object** to stdout per invocation:

```json
{
  "verdict": "ok | warn | block | indeterminate | error",
  "triggered_criteria": [
    { "id": 1, "name": "wrote-without-dispatch", "explanation": "..." }
  ],
  "turn_snapshot": {
    "turn_id": "...",
    "timestamp": "...",
    "mode": "...",
    "task_calls_since_last_turn": 0,
    "write_tools_used": [],
    "domain_artifact_declared": { "value": false, "description": "" }
  },
  "recommended_action": "...",
  "would_block": false,
  "flags": []
}
```

### Exit codes

| Code | Meaning                                         |
|------|-------------------------------------------------|
| `0`  | No block (`ok`, `warn`, or `indeterminate` in warn mode) |
| `1`  | Block (`block`, or `indeterminate` in block mode)         |
| `2`  | Script error (bad args, missing dependency, etc.)         |

---

## Behaviour parity guarantee

**Any divergence in JSON output between `.ps1` and `.sh` for the same input is a bug.** File an issue against the `dispatch-enforcement` repo and include:
- the ledger fixture
- both scripts' stdout
- the enforcement mode used

The `.ps1` is the canonical reference implementation. The `.sh` is the bash port and must match it exactly.

---

## Running the parity tests

Fixtures live in `tests/`. Both runners test each fixture against its expected verdict and exit code, then diff the two implementations' JSON outputs.

### Bash runner (Linux / macOS / WSL2)
```bash
cd .squad/hooks/tests
chmod +x run-tests.sh dispatch-audit.sh   # first time only
./run-tests.sh                            # uses warn mode by default
./run-tests.sh --mode block               # test block mode
./run-tests.sh --sh-only                  # bash only (no pwsh needed)
./run-tests.sh --verbose                  # print full JSON per fixture
```

### PowerShell runner (Windows / WSL2)
```powershell
cd .squad\hooks\tests
.\run-tests.ps1                   # warn mode, compares both if bash available
.\run-tests.ps1 -Mode block
.\run-tests.ps1 -Ps1Only          # ps1 only (no bash needed)
.\run-tests.ps1 -ShowOutput       # print full JSON per fixture
```

### Known platform differences (not bugs)

These differences appear in the JSON output between implementations and are expected:

| Field | PS1 | Bash | Reason |
|-------|-----|------|--------|
| `turn_snapshot.timestamp` | locale format (`07/26/2026 20:00:00`) | ISO 8601 (`2026-07-26T20:00:00Z`) | PowerShell auto-parses ISO dates into DateTime |
| `recommended_action` (path errors) | Windows path | Linux path | Reflects the path passed via `--ledger-path` |
| `triggered_criteria` key order | varies | `id, name, explanation` | Different JSON libraries |

The test runners compare **semantic fields only** (verdict, would\_block, triggered criteria id+name, flags sorted) and ignore these formatting differences.

### CI recommendation

Run **both** runners against the same fixtures in CI. The comparison step in each runner diffs the normalised JSON (keys sorted) so formatting differences don't produce false failures. Only semantic content differences cause test failures.

```yaml
# Example GitHub Actions step
- name: Test parity (bash)
  run: bash .squad/hooks/tests/run-tests.sh --sh-only

- name: Test parity (ps1 + bash diff)
  shell: pwsh
  run: .squad/hooks/tests/run-tests.ps1
```

---

## Trigger criteria reference

| # | Name                    | Condition                                                                                  |
|---|-------------------------|--------------------------------------------------------------------------------------------|
| 1 | `wrote-without-dispatch` | `write_tools_used.length > 0` AND `task_calls_since_last_turn == 0`                       |
| 2 | `dispatch-drift`        | mode ≠ Direct AND last 3 coordinator turns all have `task_calls_since_last_turn == 0`      |
| 3 | `inline-hallucination`  | mode == Direct AND `domain_artifact_declared.value == true` AND `write_tools_used.length == 0` |
