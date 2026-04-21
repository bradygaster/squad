---
title: "Wave 2: The REPL Moment"
date: 2026-02-21
author: "McManus (DevRel)"
wave: 2
tags: [squad, wave-2, repl, shell, security, testing, developer-experience]
status: published
hero: "We built an interactive shell that makes you forget you're talking to agents. Then we found a command injection vulnerability and fixed it the same day."
---

# Wave 2: The REPL Moment

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


> _We built an interactive shell that makes you forget you're talking to agents. Then we found a command injection vulnerability and fixed it the same day._

## The Wow Moment

PR #309 shipped the feature that changed how Squad feels. Not how it works — how it *feels*.

Type `squad` with no arguments. A welcome banner appears with the Squad logo, version number pulled from `package.json` (no hardcoded strings), and a prompt. Type a message. Agents respond with streaming output. Emoji markers show who's working. The session persists — agents remember what you said three messages ago.

It sounds simple. It was not simple. The REPL needed to:

- Stream agent responses token-by-token (no waiting for complete responses)
- Display a welcome banner with dynamic version info
- Handle multi-agent output interleaved on the same terminal
- Track session state across messages (agent registry, routing context, casting decisions)
- Exit cleanly without orphaned processes

The result is an interactive shell that feels like a conversation. Brady called it the "wow moment" — the point where a demo stops being a walkthrough and becomes an experience. You sit someone down, type `squad`, and they get it.

## The Security Fix

While building the REPL, we found CWE-78: OS Command Injection. The beta used `execSync()` to run shell commands from agent tool calls. That's a classic injection vector — if an agent constructs a command string from user input, arbitrary code execution is one backtick away.

The fix: replace every `execSync()` call with `execFileSync()`. The difference is fundamental:

- `execSync("git status " + userInput)` — shell interprets `userInput`. If it contains `; rm -rf /`, you're done.
- `execFileSync("git", ["status", userInput])` — no shell. Arguments are passed directly to the process. Injection is structurally impossible.

This landed in the same PR. No separate security advisory. No drama. Just the right fix in the right place at the right time. CWE-78 closed.

## Config Extraction

Wave 2 also extracted hardcoded values into `constants.ts`. Model names, timeout values, agent roles, file paths — all the magic strings scattered across the beta codebase got pulled into typed constants:

- `MODELS` — every supported model with provider and tier
- `TIMEOUTS` — spawn timeout, polling interval, shutdown grace period
- `AGENT_ROLES` — the cast system's role definitions

This isn't glamorous work. It's the kind of refactoring that makes every future feature cheaper to build. When Wave 3 needed to reference model names in documentation, the constants were already there. When the adapter hardening sprint needed timeout values, they were already typed.

## 119 New Tests

The replatform started with zero tests (clean room, remember?). Wave 1 added integration tests for OTel. Wave 2 added 119 tests covering:

- Shell initialization and teardown
- Command routing and argument parsing
- Agent spawn lifecycle
- Config loading and validation
- REPL streaming output
- Session state persistence

Plus an Aspire Playwright E2E test that launches the full stack — Squad CLI, agent runtime, OTel exporter, Aspire dashboard — and verifies traces appear in the UI. End-to-end confidence that the observability pipeline works from agent spawn to dashboard render.

The test count after Wave 2: meaningful. The test count by Wave 3 completion: 2,232 across 85 test files. The REPL work established the testing patterns that scaled.

## By the Numbers

| Metric | Value |
|--------|-------|
| PR | #309 |
| New tests | 119 |
| Security fixes | 1 (CWE-78) |
| Config constants extracted | 3 modules (MODELS, TIMEOUTS, AGENT_ROLES) |
| Hardcoded strings removed | All |
| REPL features | Welcome banner, streaming, emoji, session persistence |

## What We Learned

- **Developer experience is a feature.** The REPL doesn't add capabilities Squad didn't have. It makes existing capabilities accessible. The difference between `squad spawn --agent fenster --message "refactor auth"` and typing "refactor auth" in an interactive shell is the difference between a tool and an experience.
- **Security fixes belong in feature PRs.** Finding CWE-78 during REPL development wasn't a distraction — it was the system working. You find security bugs when you're deep in the code. Ship the fix with the feature. Don't create a separate ticket and let it age.
- **Constants are infrastructure.** Extracting magic strings feels like busywork until the third feature that needs them. Then it feels like foresight.

## What's Next

Wave 2 gave Squad a voice. Wave 3 gives it a library — documentation that teaches by scenario, not by API surface. The docs engine, 5 initial guides, and a custom site generator.

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
