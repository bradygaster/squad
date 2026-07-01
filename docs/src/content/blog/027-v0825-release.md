---
title: "v0.8.25: Pre-Publish Quality Gate and CLI Smoke Testing"
date: 2026-03-08
author: "PAO (DevRel)"
wave: 7
tags: [squad, release, v0.8.25, testing, cli, quality, npm]
status: published
hero: "Squad now smoke-tests every CLI command in the packaged npm artifact before publishing."
---
# v0.8.25: Pre-Publish Quality Gate and CLI Smoke Testing
> _This release adds a critical pre-publish quality gate: 32 new tests that pack both `@bradygaster/squad-sdk` and `@bradygaster/squad-cli` into tarballs, install them in a clean temp directory, and verify all 27 CLI commands route correctly through the installed artifact. If a command is missing or broken in the tarball, the release is blocked._
---
## What Shipped
### CLI Packaging Smoke Test
The new test suite (`test/cli-packaging-smoke.test.ts`) simulates the exact npm install experience:
1. **Pack** — Creates tarballs of both packages using `npm pack`
2. **Install** — Installs them in a clean isolated temp directory (just like `npm install -g` would)
3. **Verify routing** — Tests all 27 CLI commands through the installed artifact's bin entry
4. **Test aliases** — Validates 3 command aliases (watch, workstreams, remote-control)
5. **Error handling** — Tests --version, --help, and unknown command behavior
**32 new tests. 3,963+ tests total.**
### Pre-Publish CI Gate
The `publish.yml` workflow now includes a `smoke-test` job that runs BEFORE both npm publish jobs. If the smoke test fails, nothing gets published. This blocks the exact class of bugs that bit us before: MODULE_NOT_FOUND errors, broken package.json exports, and ESM resolution failures.
### Three-Layer Test Matrix
This release completes a three-layer defense:
| Layer | What it catches | Test file |
|-------|----------------|-----------|
| Source wiring | Import exists in code | `cli-command-wiring.test.ts` |
| Packaged artifact | Command works after npm pack + install | `cli-packaging-smoke.test.ts` (NEW) |
| Pre-publish gate | Blocks broken releases in CI | `publish.yml` smoke-test job (NEW) |
Before this release, a command could exist in source code, pass all tests, and still be missing from the published npm package. That gap is now closed.
---
## Why This Matters
npm packages are built artifacts. The code you write isn't always the code users install. This test suite verifies that the packaged tarball — the actual bytes users download — works correctly. The squad's own quality agents (FIDO and EECOM) verified the release and gave unanimous GO.
---
## Quick Stats
- ✅ 32 new CLI packaging smoke tests
- ✅ 3,963+ tests passing, 150 test files
- ✅ Pre-publish CI gate added to `publish.yml`
- ✅ All 27 commands + 3 aliases verified in packaged artifact
---
## What's Next
- **Process template introspection** — auto-detect ADO work item types (#240)
- **Teams webhook adapter** — full CommunicationAdapter implementation (#261)
- **Pre-existing test stabilization** — fix 14 flaky/environment-dependent tests (#273)
