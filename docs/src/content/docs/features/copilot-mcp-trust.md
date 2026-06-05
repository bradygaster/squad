# Copilot CLI Non-Interactive MCP Trust Gate

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

When `squad watch` or another Squad automation spawns `copilot -p` (non-interactive mode), it automatically injects `--yolo --additional-mcp-config @.mcp.json` into every Copilot sub-invocation. This page explains why that injection is mandatory and what to do if `squad_state_*` tools are silently unavailable.

---

## What Is the Trust Gate?

Copilot CLI 1.0.59+ protects against loading arbitrary MCP binaries from workspace files by requiring the user to explicitly trust a folder before its `.mcp.json` is auto-loaded. In **interactive mode** this is a one-time prompt ("Trust this folder?"). In **non-interactive (`-p`) mode** there is no UI, so the gate cannot be satisfied and workspace `.mcp.json` is silently skipped.

This is a security measure (RCE prevention), not a bug.

---

## Empirical Test Matrix

The following was verified against Copilot CLI 1.0.59:

| Invocation | `.mcp.json` loaded? |
|------------|---------------------|
| `copilot -p "..."` | ❌ No |
| `copilot --yolo -p "..."` | ❌ No |
| `copilot --yolo --autopilot -p "..."` | ❌ No |
| `copilot --additional-mcp-config @.mcp.json --yolo -p "..."` | ✅ **Yes** |
| Interactive `copilot` → "Trust folder?" → Yes | ✅ Yes (not automatable) |

The `--additional-mcp-config @<path>` flag bypasses the trust gate for the explicitly named file and is the only proven workaround for non-interactive sessions.

---

## How Squad Handles This Automatically

`squad watch`, the loop command, and any other Squad automation that spawns `copilot` as a subprocess automatically prepend:

```
--yolo --additional-mcp-config @/abs/path/to/.mcp.json
```

before the `-p` prompt and any other flags. You do **not** need to add these flags yourself when using Squad commands.

`--yolo` also suppresses the per-tool-call consent prompt that would cause `copilot -p` to hang waiting for input in non-interactive mode.

---

## Recommended `package.json` Script

If you write your own non-interactive Copilot scripts (CI, cron jobs, shell aliases), use this pattern to ensure `.mcp.json` is loaded:

```json
{
  "scripts": {
    "squad:copilot": "copilot --additional-mcp-config @.mcp.json"
  }
}
```

Then invoke it as:

```bash
npm run squad:copilot -- --yolo -p "Your prompt here"
```

The `--yolo` flag is intentionally omitted from the `package.json` script itself so that interactive runs (`npm run squad:copilot`) still show per-tool consent prompts by default.

---

## Troubleshooting

**`squad_state_*` tools are not available in `squad watch` sessions**

1. Verify `.mcp.json` exists at the repo root: `cat .mcp.json`
2. If missing, run `squad init` or `squad upgrade` to regenerate it
3. Confirm the file has a `squad_state` entry under `mcpServers`

**Squad emits `⚠  .mcp.json not found at <path>`**

This warning appears when Squad tries to inject MCP config but `.mcp.json` is absent. Run `squad init` or `squad upgrade` to create it.

**`.copilot/mcp-config.json` still exists from an older Squad version**

Squad automatically tombstones (removes) the `squad_state` entry from `.copilot/mcp-config.json` during `init` and `upgrade`. Both files can coexist; Squad reads only `.mcp.json` for its own state tools.
