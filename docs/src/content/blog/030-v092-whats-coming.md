---
title: "What's Coming in v0.9.2 — 10 Features, Zero Breaking Changes"
date: 2026-04-04
author: "Tamir"
tags: [squad, release, features, watch, cleanup, fact-checker, external-state, self-upgrade, fleet, verbose, skills, scratch-dir, triage, notifications]
status: draft
hero: "The next Squad release ships 10 new features, 4 bug fixes, and 60+ tests — all backward-compatible. Here's what to expect."
---

# What's Coming in v0.9.2 — 10 Features, Zero Breaking Changes

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _The next Squad release ships 10 new features, 4 bug fixes, and 60+ tests — all backward-compatible. Here's what to expect._

## The Noise Problem

If you've been running `squad watch` in production with output forwarded to Teams or Slack, you've probably noticed this:

```
Squad Monitor Round 158
Squad Monitor Round 159
Squad Monitor Round 160
Squad Monitor Round 161
```

Hundreds of messages. No useful information. No way to tell which machine or repo they came from.

This release fixes that — and ships 9 other features while we're at it.

## New Features

### 1. Quiet Notifications (`--notify-level`)

The biggest quality-of-life improvement: watch rounds are now **silent by default when the board is empty**. Only rounds with actual work produce output.

```bash
squad watch --notify-level important    # default — only meaningful rounds
squad watch --notify-level all          # old behavior (every round)
squad watch --notify-level none         # fully silent
```

Round headers now include **machine name and repo** for attribution:

```
🔄 Ralph — Round 5 (DEVBOX-01 · my-project)
```

Persistent config: `{ "watch": { "notifyLevel": "important" } }` in `.squad/config.json`.

### 2. Fleet Hybrid Dispatch (`--dispatch-mode`)

Parallel issue processing via Copilot CLI `/fleet`. Benchmarked at **2.9x faster** for read-heavy workloads.

```bash
squad watch --execute --dispatch-mode hybrid
```

Issues are auto-classified as read (research, reviews → fleet) or write (implementations, fixes → local). Fleet batches reads in parallel while writes execute sequentially.

### 3. Verbose Debugging (`--verbose`)

When watch seems stuck on "Board is clear" but you know there's work, `--verbose` shows you exactly what's happening:

```bash
squad watch --verbose
```

Prints: issue counts, label matches, auth status, PR review states, round timing, capability execution paths.

### 4. Fact-Checker Agent Role (🔍)

New built-in role for output verification. Validates claims, detects hallucinations, runs counter-hypotheses.

```
squad new agent fact-checker
```

Confidence ratings: ✅ Verified, ⚠️ Unverified, ❌ Contradicted. Routes automatically on "fact-check", "verify", "audit" keywords.

### 5. 8 Built-in Skills

`squad init` and `squad upgrade` now ship 8 curated skills:

| Skill | What it teaches |
|-------|-----------------|
| squad-conventions | Core patterns and file layout |
| error-recovery | Graceful failure handling |
| secret-handling | Credential safety |
| git-workflow | Branch and commit conventions |
| session-recovery | Checkpoint and resume |
| reviewer-protocol | Code review gates |
| test-discipline | Test-first discipline |
| agent-collaboration | Multi-agent handoffs |

### 6. Scratch Directory (`.squad/.scratch/`)

Agents no longer dump temp files in the repo root. The new `scratchDir()` and `scratchFile()` SDK APIs route all ephemeral files to `.squad/.scratch/` — gitignored and auto-cleaned.

### 7. Cleanup Watch Capability

Automated housekeeping during `squad watch`:
- Clears `.squad/.scratch/` every 10 rounds
- Archives orchestration-log and session-log entries older than 30 days
- Warns about stale decision inbox files (>7 days)

### 8. External State Storage

Move `.squad/` state outside the working tree so it survives branch switches:

```bash
squad externalize              # state moves to ~/.squad/projects/{repo}/
squad internalize              # move it back
```

### 9. Self-Upgrade (`squad upgrade --self`)

Update the CLI itself from within squad:

```bash
squad upgrade --self              # latest stable
squad upgrade --self --insider    # latest prerelease
```

Auto-detects npm/pnpm/yarn. After CLI upgrade, automatically runs repo upgrade to apply new templates.

### 10. Triage Label Slug Fix

Multi-word agent names (like "Steve Rogers") now correctly generate `squad:steve-rogers` labels instead of `squad:steve rogers` (which GitHub rejects). Labels are pre-created at watch startup.

## Bug Fixes

- **PR contamination** — Scribe now stages only `.squad/` files, not `git add .` (#783)
- **Outdated review threads** — PR readiness check ignores threads where code changed (#780)
- **Filename uniqueness** — `scratchFile()` uses monotonic counter, not just `Date.now()`
- **Cross-platform paths** — `deriveProjectKey()` handles Windows paths on Linux CI

## By the Numbers

- **10 features** across SDK, CLI, and watch capabilities
- **4 bug fixes** (1 critical — PR contamination)
- **60+ new tests** (scratch: 8, cleanup: 12, fact-checker: 8, skills: 5, external: 12, self-upgrade: 4, notify: 5, triage: 12)
- **4 new feature docs** + 2 updated + README command table (15→17)
- **0 breaking changes** — all opt-in, all backward-compatible
- **1 behavioral change** — notify default flipped from `all` to `important` (use `--notify-level all` to restore)

## Upgrade

```bash
squad upgrade --self              # get the latest CLI
squad upgrade                     # apply new templates to your repo
```

Or if you're on insider:

```bash
squad upgrade --self --insider
```
