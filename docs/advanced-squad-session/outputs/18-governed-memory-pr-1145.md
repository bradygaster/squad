# 1145: Add governed memory model, provider boundaries, diagnostics, and CLI validation
State: MERGED
URL: https://github.com/bradygaster/squad/pull/1145
Head: tamirdresher/squad/memory-governance-provider

## Summary

This PR represents the full memory governance/provider work on `squad/memory-governance-provider`, not just diagnostics config.

It adds:

- Governed memory classes: `TRANSIENT`, `LOCAL`, `DECISION`, `POLICY`, `COPILOT_MEMORY`, `FORBIDDEN`
- Load guidance: `[ALWAYS]`, `[ON-DEMAND]`, `[ARCHIVE]`, `[NEVER]`
- Local memory store with classification, write/search/audit, promotion, deletion, tombstones, and safe audit records
- CLI bridge: `squad memory classify|write|search|audit|provider`
- Honest provider boundaries: local default, `provider=copilot` reported unavailable without a concrete callable API, host-injected adapter opt-in and fail-closed
- Safe diagnostics to stderr with `.squad/config.json` support
- Real Copilot CLI A/B harness with isolated `COPILOT_HOME`
- Deterministic memory-value benchmark for context size, retrieval quality, decision consistency, and stale/unsafe memory exclusion
- Tests, docs, proposals, template guidance, and changeset coverage

This work is based on Tamir Dresher's blog post, [The Ship's Computer Has a Memory Problem — Designing Memory for AI Agent Squads](https://www.tamirdresher.com/blog/2026/05/06/scaling-ai-part13-agent-memory). The core idea is that agent memory is runtime state with lifecycle, governance, and context-budget implications — not just more Markdown in the repo or more text in the prompt.

## Short guide: how to use it

Initialize or upgrade a Squad repo so local governance files are scaffolded:

```bash
squad init
# or, for an existing repo:
squad upgrade
```

By default, governance is local-only:

- memory config lives under `.squad/memory/`
- audit records are written locally
- local `.squad/` memory remains the source of truth
- Copilot Memory provider integration is not assumed or faked

Use the CLI bridge:

```bash
squad memory classify "Always run tests before merge"

squad memory write \
  --content "Use Vitest for SDK regression tests" \
  --class DECISION \
  --author scribe \
  --approved

squad memory search --query "Vitest"
squad memory audit
squad memory provider
```

## Diagnostics and logs

For one command:

```bash
squad memory search --query "Vitest" --log-level info
squad memory provider --verbose
```

For project-level diagnostics, add this to `.squad/config.json`:

```json
{
  "memory": {
    "logLevel": "info"
  }
}
```

Supported levels:

```text
none | error | info | debug
```

Precedence:

1. CLI `--log-level` / `--verbose`
2. `SQUAD_MEMORY_LOG_LEVEL`
3. `.squad/config.json` `memory.logLevel`
4. default `none`

Diagnostics go to stderr; JSON output remains on stdout. Diagnostics include safe metadata such as command name, provider, paths, result counts, load guidance, and timing. They intentionally do not print raw memory content or raw search text.

## How to measure memory value

Run the deterministic benchmark:

```bash
npm run build -w packages/squad-sdk
npm run experiment:memory-value
npm run experiment:memory-value -- --json
```

The benchmark compares naive baseline behavior (`load all memory into context`) against governed retrieval (`ALWAYS` + relevant `ON-DEMAND`, excluding `ARCHIVE`, `NEVER`, deleted, or superseded facts). It measures context payload, estimated token pressure, precision, recall, decision consistency, and stale/unsafe-memory avoidance.

Latest local result from this branch:

```text
Verdict: PASS
Context bytes: baseline=3540, governed=1601
Estimated tokens: baseline=885, governed=401
Context reduction: 54.8%
Precision: baseline=0.16, governed=0.41
Recall: baseline=1.00, governed=1.00
Decision consistency: baseline=0.50, governed=1.00
Stale/unsafe facts avoided: 12/12
```

## Validation evidence

Latest branch validation:

```bash
npm run build -w packages/squad-sdk
npm run lint
npm run test -- test/memory-value-benchmark.test.ts test/memory-governance.test.ts test/real-cli-ab.test.ts test/bench-runner.test.ts
npm run experiment:memory-value
npm run experiment:real-cli-ab -- --repo <repo> --variants memory-governance --dry-run
```

Results:

- SDK build: passed
- TypeScript lint: passed
- Related memory/harness tests: 41 passed
- Deterministic memory-value benchmark: PASS
- Real CLI A/B dry-run plan/artifact path generation: passed
- Previous full GitHub Actions Squad CI before this benchmark commit: passed ([run 26140594530](https://github.com/bradygaster/squad/actions/runs/26140594530))
- Current GitHub Actions Squad CI for head `56bd3136`: passed ([run 26141373561](https://github.com/bradygaster/squad/actions/runs/26141373561))

## Real CLI A/B evidence

The branch includes a real Copilot CLI paired A/B harness and prior reruns across two local Squad repos:

- ADC Squad runner demo:
  - baseline: 0 memory diagnostic events
  - memory-governance variant: 10 memory diagnostic events
- Squad repo:
  - baseline: 0 memory diagnostic events
  - memory-governance variant: 9 memory diagnostic events

This proves the harness, isolated `COPILOT_HOME` runs, memory command invocation diagnostics, and baseline-vs-governance signal separation.

## Current verdict

Stronger than before, but still honest.

This PR now proves:

- governed local memory operations work
- classification/isolation behavior is enforced
- forbidden/transient content is rejected or kept out of durable memory
- provider status is honest
- host-injected provider mode fails closed without a real host client
- diagnostics are configurable and safe
- the real CLI A/B harness can isolate runs and capture evidence
- deterministic governed retrieval can reduce context pressure while preserving recall and improving precision/decision consistency in seeded memory tasks

This PR still does not prove:

- real Copilot Memory provider write/search/delete integration
- statistically significant live-agent quality gains from external semantic memory
- long-run production improvement across many repositories and real issues

The right claim is: this makes the blog-post promise measurable and demonstrates the local governed-memory mechanism can reduce context size and improve memory selection quality in deterministic tests. Full live-agent longitudinal proof still requires repeated real-world paired runs once a callable provider/host adapter exists.


