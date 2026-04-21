# Maintaining resolve-token.mjs

`resolve-token.mjs` is a standalone, zero-dependency Node.js script that ships
inside every scaffolded squad project. It reads a GitHub App private key +
installation id, signs a JWT, exchanges it for an installation access token,
and prints that token on stdout. It runs **before** the squad SDK is loaded,
so it can only use Node.js built-in modules.

## Single source of truth

```
packages/squad-cli/scripts/resolve-token.source.mjs   ← edit this
```

Four generated copies live under template directories and ship to installed
projects via `squad init` / `squad upgrade`:

| Copy | Purpose |
|------|---------|
| `packages/squad-cli/templates/scripts/resolve-token.mjs` | bundled in the CLI package on npm |
| `packages/squad-sdk/templates/scripts/resolve-token.mjs` | bundled in the SDK package on npm |
| `templates/scripts/resolve-token.mjs` | repo-root template mirror |
| `.squad-templates/scripts/resolve-token.mjs` | canonical template fixture used by tests |

**Do not edit the generated copies.** Each one carries a `// GENERATED FILE
— DO NOT EDIT. Source: …` banner at the top. Edit the source file and
regenerate instead.

## Making a change

1. Edit `packages/squad-cli/scripts/resolve-token.source.mjs`.
2. Run:
   ```bash
   npm run sync:resolve-token
   ```
3. Commit both the source file and the four regenerated copies together.

The generator also runs automatically as part of `npm run prebuild`, so
`npm run build` always ships in-sync copies.

## CI guard

A vitest guard (`test/scripts/resolve-token-sync.test.ts`) runs the generator
in `--check` mode on every PR. If any copy drifts from the canonical source,
the test fails with instructions to run `npm run sync:resolve-token`.

You can run the check locally:

```bash
npm run sync:resolve-token:check
```

## Why this layout

The script cannot be bundled through the SDK because it runs *before* the SDK
is installed. It must be pure Node.js with no npm dependencies. Shipping four
byte-identical copies is intentional — each consumer (CLI tarball, SDK tarball,
repo mirror, template fixture) needs its own copy. The generator pattern
removes the manual-sync burden without changing the runtime layout.

## Related

- `docs/proposals/identity-hardening-roadmap-2026-04-20.md` — original
  canonicalization backlog entry.
- `.copilot/skills/protected-files/SKILL.md` — rules for zero-dependency
  bootstrap files (the `-- zero dependencies --` header marker).
