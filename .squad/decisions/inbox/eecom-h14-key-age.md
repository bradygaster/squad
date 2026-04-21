# H-14 — Key age warnings in identity doctor/status

**By:** EECOM
**Date:** 2026-04-21
**Roadmap:** `docs/proposals/identity-hardening-roadmap-2026-04-20.md` H-14

## What

New SDK helper `getKeyAgeDays(projectRoot, role)` in
`packages/squad-sdk/src/identity/storage.ts` — returns integer days since the
PEM file's `mtime`, or `null` if the file is missing or `stat` fails.

Wired into CLI identity commands:

- `squad identity status` — shows `key age: Nd` inline per role, coloured dim
  (<60d), yellow (≥60d), red (≥max).
- `squad identity doctor` — new check "keys/{role}.pem age within rotation
  window". ⚠ WARN at ≥60 days, ✗ FAIL at ≥ `SQUAD_IDENTITY_KEY_MAX_AGE_DAYS`
  (default 90). 🟢 OK under 60. Silently skipped when `mtime` is unavailable.

## Why

PEM rotation is best-practice hygiene that nothing in the system nudges the
operator toward. Surfacing age in the two commands operators actually run gives
a zero-cost reminder without being noisy.

## Decisions

- Chose file `mtime` over a `createdAt` JSON field (the roadmap's original
  proposal): mtime is zero-schema-change, works on keys created before this
  feature landed, and cannot drift from the actual file on disk.
- `stat` failures → silent `null`. Mounted volumes and restricted FSes report
  no mtime on WSL drvfs and similar — false-failing operators there would be
  worse than silence.
- Env override named `SQUAD_IDENTITY_KEY_MAX_AGE_DAYS` for consistency with the
  existing `SQUAD_IDENTITY_*` namespace.

## Tests

`test/identity/key-age.test.ts` — 6 tests: mtime-based age, 0 for fresh, null
for missing, threshold semantics, env override honoured.

All 194 identity tests pass.
