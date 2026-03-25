---
title: "How We Tested Our Upgrade Path Against 245 Strangers' Repos"
date: 2026-03-23
author: "Squad Team"
wave: 7
tags: [squad, upgrade, testing, agents, quality]
status: published
hero: "We used Squad's own fan-out capability to clone 23 real-world repos from GitHub and validate our upgrade command in 5 minutes flat."
---

We shipped a big upgrade fix — 10 changes addressing 13 gaps our AI team found during an audit. The automated tests passed. 18 out of 18. Green across the board.

But "tests pass" isn't the same as "this won't break someone's project." We needed a different kind of confidence.

## The Problem with Testing Upgrade Commands

Upgrade commands are uniquely hard to test. Your automated test suite creates pristine fixtures — perfectly structured directories, predictable file contents, known starting states. Real users are messier. They've deleted files they shouldn't have. They're running versions from six months ago. They've added custom files in directories you own. They've got unicode in their team names and hardcoded paths in their configs.

You can write a hundred synthetic tests and still miss the bug that only shows up when someone's `.gitattributes` already has 20 lines of C# rules and your upgrade appends new entries without a blank line separator.

## The Approach: Use Your Own Tool to Test Itself

We build an AI agent framework. Our agents can fan out — multiple agents running in parallel, each with its own task, reporting back independently. So we used the framework to test itself.

**Step 1: Find real-world installs.** We used GitHub's code search API to find every public repo with our tool installed:

```
filename:squad.agent.md path:.github/agents
```

Result: **245 public repositories.** Real projects, real users, real configurations we'd never seen before.

**Step 2: Design a 3-tier testing strategy.**

- **Tier 1 — Synthetic:** 4 agents simulating controlled scenarios (old version, current version, corrupted state, edge cases like unicode and read-only files)
- **Tier 2 — Our repos:** 1 agent cloning 3 of our own projects at different installed versions
- **Tier 3 — Public repos:** 4 agents each cloning 4 public repos, running upgrade, taking before/after snapshots

**Step 3: Fan out.** We launched 9 agents in parallel. Each one:

1. Checked out our fix branch and built the CLI
2. Created an isolated temp directory
3. Ran the upgrade
4. Captured full console output
5. Verified every file that should have changed did
6. Verified every file that shouldn't have changed didn't
7. Ran the upgrade *again* to test idempotency
8. Cleaned up

**Zero impact to any public repo.** Shallow clones to temp directories, tested locally, deleted when done. No pushes, no PRs, no issues, no comments. Read-only interaction with GitHub.

## The Numbers

| Tier | Targets | Checks | Passed | Failed |
|------|---------|--------|--------|--------|
| Synthetic scenarios | 4 | 60 | 59 | 1 |
| Our own repos | 3 | 45 | 45 | 0 |
| Public repos | 16 | 140 | 140 | 0 |
| **Total** | **23** | **245** | **244** | **1** |

**99.6% pass rate.** The one failure was a read-only filesystem edge case — the upgrade threw a raw stack trace instead of a friendly warning. Valid bug, easy fix, and we never would have tested for it with synthetic fixtures alone.

Wall-clock time for all of this: **about 5 minutes.** Nine agents working simultaneously, each taking 3-5 minutes to clone, build, test, and clean up.

## What the Version Span Looked Like

We tested upgrades from every version we encountered in the wild:

| Starting Version | Repos |
|-----------------|-------|
| v0.0.0 (source installs) | 4 |
| v0.3.0 | 1 |
| v0.4.1 | 1 |
| v0.5.x | 6 |
| v0.8.x | 9 |
| "Already current" | 2 |

No version was too old. The oldest repo — installed from source with version `0.0.0` — upgraded cleanly to current. Every version in between worked too.

## What We Actually Checked

Every repo got the same verification checklist. Infrastructure on one side, user state on the other:

**Must change:**
- Config files updated with merge rules and gitignore entries
- Missing directories created (up to 6)
- 28 skills deployed
- 30 template files refreshed
- Version stamp updated

**Must NOT change:**
- Team roster
- Decision log
- Routing rules
- Agent charters and histories
- User configuration

**Must survive a second run:**
- No duplicate entries in any config file
- No errors
- No corruption

Across 23 test targets spanning versions 0.0.0 through 0.8.25, team sizes from 5 to 12 agents, and projects in .NET, Node.js, Python, Flutter, and Rust: **zero user files were modified.**

## What We Found That Surprised Us

The synthetic tests caught the obvious stuff. The real repos caught the stuff you'd never think to test for:

**Smart deduplication works.** One repo had 4 of 5 required `.gitignore` entries from a previous version. The upgrade detected the 4 existing entries and added only the 1 missing one. Not "overwrite all 5" — surgically precise. We didn't specifically test for this. We discovered it was working correctly by running against a real repo that happened to be in that state.

**Custom content survives.** Multiple repos had custom files inside directories we manage — investigation summaries, design specs, audit reports created by agents in past sessions. All of them survived the upgrade untouched. One repo even had a retired agents directory (`_alumni/`). Preserved perfectly.

**Legacy detection is graceful.** One repo was still using our old directory name from months ago. The upgrade detected it, printed a clear deprecation warning with an actionable migration command, and proceeded without crashing. We'd written that code, but we'd never tested it against a real legacy install in the wild.

**Privacy scrubbing works — but contradicts itself.** Two repos had email addresses in their team files from before we added privacy protections. The upgrade correctly scrubbed them. Good feature. But the console output ends with "Never touches user state" — which is technically false when the privacy scrub just modified 5 files. Small messaging fix, but we wouldn't have caught it without testing against repos old enough to have that data.

## The Meta Insight

Here's what made this approach powerful: **the same fan-out capability we build for users is exactly what we needed to validate our own upgrade path.** We didn't write a special testing harness. We didn't set up CI matrices. We told our agents "go clone these repos, run upgrade, tell me what happened" — and they did, in parallel, in minutes.

The three tiers gave us three kinds of confidence:
- **Synthetic** tells you the code handles expected cases correctly
- **Your own repos** tells you the code handles real-but-familiar cases correctly
- **Strangers' repos** tells you the code handles cases you never imagined

That last tier is the one most teams skip. It's also the one that found the most interesting issues.

## The Takeaway

If your tool has a public footprint — if real people have installed it and configured it and built things on top of it — you have a free test corpus sitting on GitHub. Clone it, test against it, delete it. Zero impact, maximum confidence.

Your upgrade command's job is to make old installs current without touching what users built on top. That's the contract. Your test suite tells you the code works. Real repos tell you the *contract* holds.

---

*We tested 23 repos in about 5 minutes. Found 3 bugs (1 real, 2 messaging). Fixed them before merging. The upgrade shipped the next morning.*
