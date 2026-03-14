# Scrub Emails

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this before sharing your team state:**
```
Scrub email addresses from the team files before sharing
```

**Try this to remove PII from Squad state:**
```
Squad scrub-emails
```

Remove personally identifiable information (email addresses) from Squad state files before sharing or exporting.

---

## Overview

Squad team state includes histories, decisions, and logs — files that may contain email addresses from team members, commit authors, or decision discussions. Before sharing your `.squad/` state publicly or with external teams, you can scrub these emails while keeping the rest of the context intact.

`squad scrub-emails` preserves names while removing email addresses, ensuring your team's knowledge and decisions stay readable without exposing PII.

## Usage

```bash
squad scrub-emails [directory]
```

The directory argument is optional and defaults to `.squad/`:

```bash
squad scrub-emails              # Scrubs .squad/ (default)
squad scrub-emails .squad       # Explicitly scrub .squad/
squad scrub-emails /shared/ai-team  # Scrub a specific directory
```

## What Gets Scrubbed

`squad scrub-emails` targets these files:

**Root team files:**
- `team.md`
- `decisions.md`
- `routing.md`
- `ceremonies.md`

**Agent histories:**
- `.squad/agents/*/history.md`

**Logs:**
- `.squad/log/**/*.md`
- `.squad/log/**/*.txt`
- `.squad/log/**/*.log`
- `*.txt` and `*.log` files in the target directory

## Transformation Patterns

The tool applies two replacement patterns:

| Pattern | Replacement | Example |
|---------|-------------|---------|
| `name (email@example.com)` | `name` | `Alice (alice@corp.com)` → `Alice` |
| Bare email | `[email scrubbed]` | `contact me at bob@example.com` → `contact me at [email scrubbed]` |

The goal: preserve the person's name (context-useful) but remove the email (PII).

## Smart Skipping

`squad scrub-emails` doesn't blindly scrub everything. It skips:

- **URLs** — `https://example.com/contact?email=test@example.com` is left untouched
- **Code blocks** — Text inside ` ``` ` code fences is not scrubbed
- **example.com domains** — Fake emails used in docs/examples (e.g., `user@example.com`) are skipped
- **Comment lines** — Lines starting with `//` or `#` are not scrubbed (code examples)

This prevents breaking URLs, removing documentation examples, and accidentally scrubbing safe mock emails.

## Key Behaviors

- **Only modifies files with emails** — Scans for `@` character; only rewrites files that contain email-like patterns
- **Returns count** — Reports how many files were scrubbed and how many emails were removed
- **Safe on missing directories** — If the directory doesn't exist, returns 0 (no error)
- **Idempotent** — Running twice on the same files produces the same result (second run finds no emails)

## When to Use

- **Before `squad export`** — Sanitize team state before sharing the export file
- **Before sharing `.squad/` publicly** — Remove emails from histories and decisions
- **When onboarding new team members** — Remove previous team member emails from shared state
- **Before publishing team templates** — Ensure example teams have no PII

## Examples

Scrub the default `.squad/` directory:

```bash
squad scrub-emails
```

Scrub a shared team directory:

```bash
squad scrub-emails /shared/teams/engineering-squad
```

Scrub before export:

```bash
squad scrub-emails && squad export --out ./public-export.json
```

## Output Example

```
🧹 Scrub complete
━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 8 files scrubbed
   📄 decisions.md (3 emails removed)
   📄 agents/alice/history.md (5 emails removed)
   📄 agents/bob/history.md (2 emails removed)
   📄 log/2024-01-15.md (1 email removed)
   
0 files skipped (no emails found)
```

If no emails are found:

```
🧹 Scrub complete
━━━━━━━━━━━━━━━━━━━━━━━━━
No emails found. 0 files modified.
```

## Sample Prompts

```
scrub emails from the team state
```

Removes email addresses from `.squad/` files, preserving names and context.

```
scrub-emails before export
```

Sanitizes team state, then exports to `squad-export.json` without PII.

```
what emails would be scrubbed?
```

Shows a dry-run preview of files that contain emails.

```
scrub a specific directory
```

Targets a custom directory instead of the default `.squad/`.
