---
"@bradygaster/squad-cli": patch
---

fix(ci): fix multiple CI test failures introduced by PR #1035 coordinator slimming

PR #1035 extracted Scribe and spawn-template content out of `squad.agent.md` into
standalone reference files but did not update the CI tests. Two tests failed:

**`test/ci/scribe-template.test.ts`** — was reading from `squad.agent.md` with anchors
that no longer exist. Fixed to read from `scribe-charter.md` with:
- Number- and format-agnostic end-marker in `extractScribeTaskBlock`
- Numbered-line assertions (verify phrases appear on actual `\d+.` list items)
- Corrected file header comment (HEALTH REPORT and size thresholds ARE present)
- New tests: HEALTH REPORT emission documented, Tier 1 (20KB) and Tier 2 (50KB)
  archival thresholds documented (10 tests total, was 7)

**`test/ci/datetime-template.test.ts`** — was counting `CURRENT_DATETIME:` lines in
`squad.agent.md` only, expecting ≥4. After slimming only 2 remain there; the rest
moved to `spawn-reference.md` and `after-agent-reference.md`. Fixed to combine all
coordinator-owned template files for spawn-template assertions.
