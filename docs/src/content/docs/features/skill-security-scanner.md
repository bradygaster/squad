---
title: Skill Security Scanner
description: Markdown-aware security scanner that catches embedded credentials, download-and-execute patterns, and privilege escalation in skill files before they ship.
---

# Skill Security Scanner

The skill security scanner is a markdown-aware safety check that runs as part of `scripts/security-review.mjs` to inspect every SKILL.md file in `.copilot/skills/` and `.squad/skills/`. It catches three classes of problem before a skill gets installed or merged:

1. **Embedded credentials** — API keys, tokens, passwords pasted into skill text
2. **Download-and-execute patterns** — `curl ... | bash`, `Invoke-Expression`, and friends
3. **Privilege escalation commands** — `sudo`, `Set-ExecutionPolicy Bypass`, `chmod 777`, etc.

It ships as Phase 1 — focused on the highest-signal issues with **zero false positives on the existing 35 skill files** at the time of release.

---

## How it integrates

The scanner is invoked by the existing security-review pipeline (`scripts/security-review.mjs`), which is triggered:

- On every PR that touches `.copilot/skills/**` or `.squad/skills/**` (via the Security Review CI workflow)
- Manually: `node scripts/security-review.mjs --scope skills`
- As part of [Plugin Marketplace](/squad/docs/features/plugins/) install (skills from external sources get scanned before landing on disk)

A finding produces a CI failure with the file path, line number, pattern type, and the matched substring (redacted for credentials).

---

## What it catches

### Credentials

| Pattern type | Example match |
|--------------|---------------|
| Generic API key | `API_KEY=<long-secret-token-value>` |
| GitHub PAT | `ghp_<40-character-token>` |
| AWS access key | `AKIA<16-character-key>` |
| Bearer tokens | `Authorization: Bearer <jwt-token>` |
| Database connection strings with embedded passwords | `postgres://user:<password>@host/db` |

### Download-and-execute patterns

| Pattern type | Example match |
|--------------|---------------|
| Curl-to-bash | `curl https://... \| bash`, `curl ... \| sh`, `wget ... \| sh` |
| PowerShell invoke-expression | `iex (irm https://...)`, `Invoke-Expression $downloaded` |
| Unsafe eval | `eval $(curl ...)`, `eval $(wget ...)` |

### Privilege escalation

| Pattern type | Example match |
|--------------|---------------|
| `sudo` invocations | `sudo apt install`, `sudo -i`, `sudo bash` |
| Permissive chmod | `chmod 777`, `chmod a+rwx`, `chmod -R 777` |
| PowerShell policy bypass | `Set-ExecutionPolicy Bypass`, `Set-ExecutionPolicy Unrestricted` |
| Windows admin escalation | `Start-Process ... -Verb RunAs`, `runas /user:Administrator` |

---

## Suppression — the false-positive guardrails

The scanner is markdown-aware, which means it understands when a "dangerous" pattern is actually in a code block being **shown as an anti-pattern** vs. in prose advising users to run something:

| Where pattern appears | Action |
|----------------------|--------|
| Inside a fenced code block (```` ``` ````) | **Suppressed** — treated as documentation, not advice |
| Inside an inline code span (`` ` ``) | **Suppressed** — treated as a reference |
| In prose with a placeholder token (`<your-token>`, `<api-key>`, `xxx`, `***`) | **Suppressed** — clearly an example |
| In prose without any of the above | **Flagged** as a finding |

The placeholder-token list covers common safe markers: `<your-...>`, `<api-key>`, `<token>`, `xxx`, `***`, `placeholder`, `example`, `PLACEHOLDER`.

This is why the existing 35 skill files have zero false positives — most discuss security patterns inside fenced code blocks or with placeholder tokens.

---

## Local invocation

```bash
# Scan all skills in the current repo
node scripts/security-review.mjs --scope skills

# Scan a single skill file
node scripts/security-review.mjs --file .copilot/skills/my-skill/SKILL.md

# JSON output for tooling integration
node scripts/security-review.mjs --scope skills --format json
```

Exit codes:
- `0` — no findings
- `1` — findings detected (CI fails the build)
- `2` — scanner error (couldn't read file, malformed markdown, etc.)

---

## What it doesn't catch

This is **Phase 1**. The scanner is deliberately conservative — it would rather miss something than false-positive a legitimate skill. Things NOT in scope today:

- **Obfuscated patterns** — base64-encoded credentials, character-class regex tricks, etc.
- **Multi-line patterns** — the scanner is line-oriented; a credential split across lines won't match
- **Skill scripts (`.js`/`.mjs` files in `scripts/`)** — only the SKILL.md narrative is scanned; executable handlers need their own audit
- **Semantic context** — the scanner doesn't understand whether a `sudo` example is contextually safe; if it's in prose without a placeholder marker, it flags
- **Hooks beyond `.copilot/skills/` and `.squad/skills/`** — other markdown files (charters, decisions, README) aren't scanned by this rule

Phase 2 work tracked in the issue tracker would extend coverage to scripts and add an LLM-based semantic pass.

---

## See also

- [Skills](/squad/docs/features/skills/) — the broader skills system
- [Plugin Marketplace](/squad/docs/features/plugins/) — how external skills get installed
- [Secret Handling](/squad/docs/features/skills/) — see also the `secret-handling` built-in skill
