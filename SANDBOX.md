# Sandbox and Permission Profiles

This document explains how Squad chooses an execution sandbox and permission profile for agent runs.

## Why This Exists

Squad supports two execution controls:

- Sandbox provider: where the agent process runs (`copilot` or `sandcastle`)
- Permission profile: how permissive the agent run should be (`interactive`, `yolo`, `autopilot`)

These controls are first-class for watch/triage and loop flows, with deterministic precedence and stable error codes.

## Supported Values

Sandbox providers:

- `copilot` (default)
- `sandcastle`

Permission profiles:

- `interactive`
- `yolo` (default)
- `autopilot`

## Install Sandcastle

Sandcastle is not bundled with Squad. Install it separately and make sure the
`sandcastle` executable is on your PATH.

Project: https://github.com/mattpocock/sandcastle

Verify install:

```bash
sandcastle --help
```

If this command fails, Squad will fail fast with `SQUAD_SANDBOX_UNAVAILABLE`
when `sandcastle` is selected.

## Resolution Precedence

Execution config is resolved in this order:

1. CLI flags
2. Project config (`.squad/config.json`)
3. Environment variables
4. Built-in defaults

Concrete inputs:

- CLI: `--sandbox`, `--permission-profile`
- Config: `sandbox`, `permissionProfile`
- Env: `SQUAD_SANDBOX`, `SQUAD_PERMISSION_PROFILE`, `SQUAD_SANDBOX_FLAGS`
- Defaults: `sandbox=copilot`, `permissionProfile=yolo`

## Validation Rules

- Invalid sandbox value fails fast.
- Invalid permission profile value fails fast.
- `sandcastle` requires a working `sandcastle` binary on PATH.
- Explicit sandbox selection conflicts with `--agent-cmd` override.

## Stable Error Codes

These codes are intentionally stable for automation and CI checks:

- `SQUAD_SANDBOX_UNAVAILABLE`
- `SQUAD_SANDBOX_OVERRIDE_CONFLICT`
- `SQUAD_SANDBOX_INVALID_VALUE`
- `SQUAD_PERMISSION_PROFILE_INVALID_VALUE`

## Permission Profile Behavior

Permission profiles normalize flags passed to Copilot CLI:

- `interactive`: strips `--yolo` and `--autopilot`
- `yolo`: ensures `--yolo`
- `autopilot`: ensures both `--yolo` and `--autopilot`

This makes behavior deterministic even if user-provided extra flags include permission switches.

Note: permission profile flags are a Copilot concern. They are not forwarded to
Sandcastle.

## Using Sandcastle Options from Squad

Current status:

- First-class sandbox selection (`--sandbox sandcastle`) validates and selects
   the sandcastle executable for supported execution paths.
- Provider-specific sandcastle flags are supported via `--sandbox-flags "..."`.
- Prompt arguments are mapped for sandcastle compatibility:
   - `-p <text>` / `--prompt <text>` -> `--prompt <text>`
   - `--prompt-file <path>` is passed through
- Copilot-specific flags (for example `--yolo`, `--autopilot`, MCP-injection flags)
   are not forwarded to sandcastle.

What you can do today:

1. Use first-class sandbox/profile controls for policy and validation:
    - `--sandbox sandcastle`
    - `--sandbox-flags "..."`
    - `--permission-profile <interactive|yolo|autopilot>`
2. Do not combine explicit sandbox selection with `--agent-cmd` in the same
    invocation; that combination is blocked by design (`SQUAD_SANDBOX_OVERRIDE_CONFLICT`).

Example watch invocation with provider flags:

```bash
squad watch --execute \
   --sandbox sandcastle \
   --sandbox-flags "--your-flag value" \
   --permission-profile autopilot
```

## Where It Applies

Primary command paths:

- `squad watch`
- `squad triage` (watch alias)
- `squad loop`

Additional spawn paths also use the same execution resolver for consistency:

- `squad start` (requires `sandbox=copilot`)
- `squad copilot-bridge` (requires `sandbox=copilot`)

## Examples

Watch with Sandcastle + autopilot:

```bash
squad watch --execute --sandbox sandcastle --permission-profile autopilot
```

Loop with interactive profile:

```bash
squad loop --permission-profile interactive
```

Environment-driven defaults:

```bash
export SQUAD_SANDBOX=sandcastle
export SQUAD_PERMISSION_PROFILE=yolo
squad watch --execute
```

## Troubleshooting

If you see sandbox/profile errors:

1. Run `squad watch --help` or `squad loop --help` to verify accepted values.
2. Confirm `sandcastle` is installed and available in PATH if selected.
3. Remove `--agent-cmd` when using explicit sandbox selection.
4. Check for unexpected env vars:
   - `SQUAD_SANDBOX`
   - `SQUAD_PERMISSION_PROFILE`
5. Check `.squad/config.json` for stale values overriding your defaults.
