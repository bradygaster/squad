# Proposal: Waza-Based PR Quality Checks for Squad Skills

**Issue:** bradygaster/squad#812
**Author:** Flight (Lead)
**Date:** 2026-04-08
**Status:** Phase 1 — Informational

---

## Problem Statement

Squad skills are authored, reviewed, and promoted without automated quality checks.
A skill can be merged with broken patterns, mismatched trigger rules, or confidence
levels set by gut feel. With 20+ skills across `.copilot/skills/`, there is no CI gate
to catch regressions before merge.

---

## Viability Assessment

**Tool:** [microsoft/waza](https://github.com/microsoft/waza) — Go CLI for AI agent skill evaluation.

| Criterion          | Status |
|--------------------|--------|
| Public repo?       | ✅ Yes — MIT licensed |
| Active?            | ✅ Updated 2026-04-07, 76 open issues |
| Has releases?      | ✅ v0.23.0 (latest), binary install for linux/darwin/windows |
| Fits Squad needs?  | ✅ `waza check` validates skill structure and readiness |
| CI integration?    | ✅ JSON output, JUnit reporter, GitHub Actions compatible |
| Install in CI?     | ✅ Pre-built binaries via release assets |

**Key limitation:** `go install` does not work (LFS-dependent embedded binaries).
Must use pre-built release binaries.

---

## Approach: Phased Rollout

### Phase 1 (This PR) — Informational Only

- GitHub Actions workflow at `.github/workflows/squad-skill-quality.yml`
- Triggers on PRs modifying `.copilot/skills/**` or `.squad/skills/**`
- Installs waza v0.23.0 from pinned release binary
- Runs `waza check` on changed skill files
- Reports results via GitHub Actions job summary (read-only permissions)
- **Does NOT block merges** — `continue-on-error: true`
- Nightly and manual dispatch modes check all skills

### Phase 2 (Future) — Eval Suites + Gating

- Bootstrap eval suites for high-confidence skills
- Run `waza run` with mock engine on PRs
- Graduate to hard merge gate once baselines established
- Add confidence promotion thresholds (≥80% → medium, ≥95% → high)

### Phase 3 (Future) — Full Evaluation

- Nightly runs with `copilot-sdk` engine (requires API keys)
- Cross-model comparison matrix
- Dashboard integration

---

## Design Decisions

1. **Pinned version, not latest.** CI installs waza v0.23.0 from release assets.
   Prevents drift and ensures reproducible results.

2. **Explicit path allowlist, not `**/SKILL.md`.** Squad has 90+ SKILL.md files
   across templates, test fixtures, and active skills. Only `.copilot/skills/` and
   `.squad/skills/` are governed.

3. **Job summary, not PR comments.** The workflow uses `pull_request` trigger with
   `contents: read` only. No write permissions needed — results appear in the
   Actions job summary tab.

4. **Informational-only in Phase 1.** Squad's SKILL.md frontmatter (domain,
   confidence, source) may not align with waza's spec checker expectations.
   Phase 1 establishes a baseline without blocking PRs.

5. **No `.waza.yaml` in repo root.** Waza's config only supports single-path
   `paths.skills`. Squad's skills live in multiple roots. We pass explicit paths
   instead.

6. **Skip `waza run` in Phase 1.** Zero eval suites exist today. Running
   `waza run` would always be a no-op.

---

## Open Questions

| # | Question | Resolution |
|---|----------|------------|
| 1 | Will Squad's YAML frontmatter pass `waza check`? | Phase 1 will answer this empirically |
| 2 | When to bootstrap eval suites? | After Phase 1 baseline shows which skills need evals |
| 3 | Hard gate timing? | After Phase 1 runs for 2+ weeks with stable results |
| 4 | Token budget enforcement? | Deferred to Phase 3 |
