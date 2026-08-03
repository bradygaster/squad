### 2026-07-27: Dispatch Enforcement — Stop Coordinator From Doing Domain Work Inline

**Status:** ACCEPTED (empirically validated in tamresearch1 worktree; ported to bradygaster/squad)
**Proposed by:** Picard, Data, Q (review chain)
**Validated by:** Ralph (E2E test report, 2026-07-27)
**PR:** See squad/dispatch-enforcement branch on tamirdresher_microsoft:squad-squad

## Decision

Squad coordinators MUST dispatch all domain work to specialist agents. Inline work by the coordinator is a contract violation. Three enforcement layers are being shipped:

### Layer A — Coordinator Tool Profile Restriction

Apply a `tools:` allowlist in the coordinator agent's frontmatter (`.github/agents/squad.agent.md`). The allowlist contains only dispatch-safe tools:

```yaml
tools:
  - agent
  - read
  - search
  - skill
  - squad_state/*
  - squad_state_c3c25b85/*
  - squad_state_e7f10a1f/*
  - github-mcp-server/*
```

**Effect:** Physical prevention — the Copilot runtime blocks any tool call outside this list with a hard error (`Unknown tool name in the tool allowlist: "create"`). Empirically verified across all 3 Test 1 turns.

**Meta-gap (accepted):** Because `create` and `edit` are blocked at the coordinator level, the DispatchGuard ledger (Layer B) cannot be written by the coordinator itself. Layer B becomes opt-in observation mode when Layer A is active. This is an accepted trade-off per Q Recommendation #6: unverifiable compliance ≠ free pass.

### Layer B — Scribe DispatchGuard Mechanical Audit

Scribe is spawned in DispatchGuard mode at every session start. It reads the coordinator's turn ledger (`.squad/orchestration-log/dispatchguard/ledger-{SESSION_ID}.jsonl`) and audits each turn via `.squad/hooks/dispatch-audit.ps1` / `.squad/hooks/dispatch-audit.sh`. Verdicts are appended to a verdicts file consumed by Ralph.

**Enforcement mode:** `dispatchEnforcement: "warn"` (see `.squad/config.json`). Can be escalated to `"block"` to halt coordinator work on violation.

**Infrastructure:** `.squad/hooks/dispatch-audit.ps1` (Windows/PowerShell 7+), `.squad/hooks/dispatch-audit.sh` (Linux/macOS, requires jq ≥ 1.6), test fixtures in `.squad/hooks/tests/`.

### Layer C v2 — Dispatch Contract Wording

The coordinator prompt (`squad.agent.md`) includes:
- An explicit **Direct-Mode whitelist** (5 exhaustive cases where inline work is permitted)
- The **Domain-Artifact rule** (everything not on the whitelist must dispatch)
- The **Narrow inbox exemption** (≤500-word `.squad/decisions/inbox/*.md` files only)
- **Verb triggers** (explicit list of verbs requiring dispatch when paired with domain-artifact objects)
- The **Read-Only Probe Budget** (max 2 reads before dispatch is required)
- The **Anti-pattern prohibition** (enumerated rationalizations that are explicitly NOT valid overrides)
- The **Session Init DispatchGuard Auto-Bootstrap** (mandatory Scribe spawn every session, first ack turn)
- The **Bootstrap Verification** (coordinator must confirm Scribe DispatchGuard is live before proceeding)

## Empirical Evidence

Tested in tamresearch1 worktree, 2026-07-27 (Ralph report `ralph-e2e-post-layer-a-report.md`):

| Turn | Verb | Pre-Layer-C | Layer-C only | Layer-A+B+C | Result |
|------|------|-------------|--------------|-------------|--------|
| 1 | analyze | drift | drift | DISPATCHED | ✅ Fixed |
| 2 | propose | drift | drift | DISPATCHED | ✅ Fixed |
| 3 | apply | dispatched | drift REGRESSED | DISPATCHED | ✅ Regression reversed |

Verbatim tool-block errors confirming Layer A enforcement:
```
● Unknown tool name in the tool allowlist: "create"
● Unknown tool name in the tool allowlist: "edit"
● Unknown tool name in the tool allowlist: "grep"
```

## Known Limitations

1. **Audit meta-gap** (HIGH): Layer A blocks `create`/`edit` → coordinator can't write DispatchGuard ledger → `dispatch-audit.ps1` always returns `indeterminate` for real sessions. Layer B and Layer A are mutually incompatible in Phase 1. Accepted trade-off.
2. **`grep` tool unintended casualty** (MED): `grep` is the CLI-native search tool, not in the allowlist. `read` and `search` are allowed. Scribe/sub-agents use `grep` from their own (unrestricted) tool context — not blocked.
3. **Coverage gap** (INFO): Layer A only applies when the coordinator is invoked via `agent` tool. External repos without squad routing labels don't trigger SquadShort/Squad coordinator → Layer A doesn't apply.
4. **Verbal override NOT supported**: `dispatchEnforcement: "off"` in `.squad/config.json` (committed diff) is the only valid override. Verbal in-turn overrides are NOT a supported path.

## Override Path

To disable enforcement: commit `dispatchEnforcement: "off"` in `.squad/config.json`. This is the ONLY valid override — a committed, reviewable diff, not a verbal in-session request.

## Files Added/Modified

- `.squad/config.json` — added `dispatchEnforcement: "warn"`
- `.squad/agents/scribe/charter.md` — added Tool Access section + DispatchGuard section
- `.squad/agents/ralph/charter.md` — replaced stub with full charter including Verdict Consumer + Skills
- `.squad/hooks/dispatch-audit.ps1` — 410-line PowerShell audit script
- `.squad/hooks/dispatch-audit.sh` — bash port (parity-verified)
- `.squad/hooks/README.md` — platform guide
- `.squad/hooks/tests/` — 7 JSONL fixtures + 2 parity test runners
- `.squad/templates/orchestration-log.md` — appended DispatchGuard ledger schema
- `.squad/routing.md` — extended Routing Principles with DispatchGuard notes
- `.github/copilot-instructions.md` — added identity lock + routing guard + adversarial input handling
- `.github/instructions/squad-routing-guard.instructions.md` — new file: explicit routing rules
- `.gitignore` — added `.squad/orchestration-log/dispatchguard/`
- `.github/agents/squad.agent.md` — Layer A frontmatter + Layer C v2 body prose
