# Decision: Canonicalize resolve-token.mjs — single source + generator

**By:** FIDO (Core Dev)
**Date:** 2026-04-21
**Requested by:** Ahmed
**Status:** DECIDED

## Problem

Four byte-identical copies of `resolve-token.mjs` (283 lines each) existed in
the repo — one per template directory that ships the file to installed
projects. Past sync bugs were real: any hand-edit to one copy silently left
the others stale, and the copies must stay identical because they all land in
the same runtime location (`.squad/scripts/resolve-token.mjs`) inside user
projects.

The file also can't be moved into the SDK — it runs *before* the SDK is
loaded, so it must stay pure Node.js with no npm dependencies.

## Decision

1. Canonical source lives at **`packages/squad-cli/scripts/resolve-token.source.mjs`**.
   It carries a 2-line `// CANONICAL SOURCE …` banner at the top.
2. A generator at **`packages/squad-cli/scripts/sync-resolve-token.mjs`** reads
   the canonical source, strips the banner, prepends a `// GENERATED FILE —
   DO NOT EDIT` header, and writes the result verbatim to the four template
   targets.
3. `npm run sync:resolve-token` runs the generator. `npm run sync:resolve-token:check`
   runs it in `--check` mode (exits 1 if any copy has drifted).
4. `npm run prebuild` chains `sync:resolve-token` so `npm run build` always
   ships in-sync copies.
5. `scripts/sync-templates.mjs` now skips `scripts/resolve-token.mjs` — the
   new generator is the exclusive owner.
6. A vitest CI guard (`test/scripts/resolve-token-sync.test.ts`) fails PRs
   whose copies drift from the canonical source.

## Rationale

- **Source placement.** `packages/squad-cli/scripts/` already hosts sibling
  generator scripts (`patch-esm-imports.mjs`, `patch-ink-rendering.mjs`).
  Keeping the source next to its generator makes the relationship obvious
  and avoids polluting `src/` (which `tsc` compiles) or `.squad-templates/`
  (which is a generated-output directory under the new scheme).
- **Exact-byte preservation.** The generator does no transformation on the
  body — only prepends a header. Runtime behavior across the four copies
  is provably identical.
- **Zero-dependency marker preserved.** The `-- zero dependencies --`
  header marker (scanned by the protected-files / architectural-review
  skills) is retained in the canonical body and carried through to every
  generated copy.
- **CI-enforced.** `--check` mode plus the vitest guard makes drift
  impossible to land silently.

## Impact

- Four copies → one source + a generator. Future edits happen once.
- Drift is a CI failure, not a production bug.
- No SDK change. No runtime change for installed projects — generated
  copies are byte-identical to the pre-canonicalization file content apart
  from the 2-line header swap.

## Related

- `docs/identity/maintaining-resolve-token.md` (new) — developer docs.
- `docs/proposals/identity-hardening-roadmap-2026-04-20.md` — original
  backlog entry where canonicalization was deferred.
- EECOM owns `tokens.ts` / the identity SDK in parallel; this change does
  not touch either.
