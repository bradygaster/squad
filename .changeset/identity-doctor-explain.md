---
"@bradygaster/squad-cli": minor
---

Add `squad identity doctor` and `squad identity explain` subcommands (H-10, H-11).

**`squad identity doctor`** — runs a 9-step live health check for each configured identity role:
config.json presence, app registration files, PEM key existence, PEM permissions (mode 0o600,
Unix/WSL only), PEM crypto validation via `createPrivateKey()`, `.gitignore` coverage, JWT
signing, live installation token fetch, and expected scope verification. Supports `--role <slug>`
to target one role, `--no-network` to skip network steps (offline mode), `--json` for structured
CI output. Exits 1 if any check fails.

**`squad identity explain <role>`** — traces the full token resolution path for a role without
side effects: input key + alias resolution, env var presence (values masked), filesystem file
inventory, token cache state, and the expected resolution source (`env / filesystem / mock /
none`). Use `--live` to actually fetch the token and confirm end-to-end. Always exits 0.

Also adds `peekTokenCache` and `getInstallationPermissions` to the SDK's identity module to
support inspection of cache state and permission verification.

Reference: [H-10](../../docs/proposals/identity-hardening-roadmap-2026-04-20.md#h-10) ·
[H-11](../../docs/proposals/identity-hardening-roadmap-2026-04-20.md#h-11)
