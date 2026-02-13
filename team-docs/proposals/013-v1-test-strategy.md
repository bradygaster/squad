# Proposal 013: V1 Test Strategy

**Status:** Approved ✅ Shipped — 92 tests now; expansion tracked in Proposal 019 Wave 1  
**Authored by:** Hockney (Tester)  
**Date:** 2026-02-08  
**Requested by:** bradygaster

---

## Summary

Squad has zero tests. Zero. We're going v1 with 9 users and a whole division talking about us. That's not experimental anymore — that's a product with people depending on it.

This proposal defines the complete test strategy for Squad v1: what we test, how we test it, what we can't test, and what must pass before we ship. The goal is a test suite meaner than any user could be.

---

## The Honest Assessment

### What We Have Today

- `index.js` — 65 lines of filesystem operations with conditional logic
- Zero test files
- Zero test framework
- Zero CI
- No `engines` field in `package.json` (we don't even declare what Node versions we support)
- No error handling for filesystem failures (raw stack traces)

### What V1 Adds

- `export` subcommand — reads `.ai-team/`, packages to `.squad` JSON
- `import` subcommand — reads `.squad` file, reconstitutes into target directory
- `.squad` file format — a versioned JSON schema we now own
- Argument routing (`process.argv[2]` dispatch)
- `cleanTeamMd` helper — regex-based content stripping
- Collision detection (existing squad → refuse import)
- Skills and preferences (new portable files in agent directories)

Every one of these is testable. Every one of these can break. Every one of these has edge cases a user will hit.

---

## Testing Framework Decision

### Recommendation: `node:test` + `node:assert`

**Why:**

| Option | Deps | Speed | Brady's "thin runtime" | Node 22 support |
|--------|------|-------|----------------------|-----------------|
| `node:test` + `node:assert` | 0 | Fast | ✅ Perfect | ✅ Built-in |
| `tap` | 1 | Fast | ⚠️ Adds dependency | ✅ |
| `jest` | 5+ | Slower | ❌ Heavy | ✅ |
| `vitest` | 3+ | Fast | ❌ Adds dependency | ✅ |

`node:test` is built into Node 22 (which we're running). Zero dependencies. Built-in test runner, describe/it blocks, beforeEach/afterEach hooks, subtests. It does everything we need.

I originally proposed `tap` in my initial assessment. I'm changing that recommendation. Brady values a thin runtime — zero new dependencies is the right call. `node:test` is mature enough now.

**What this looks like:**

```javascript
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('create-squad init', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates squad.agent.md in .github/agents/', () => {
    execSync(`node ${path.join(__dirname, '..', 'index.js')}`, { cwd: tmpDir });
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'agents', 'squad.agent.md')));
  });
});
```

### package.json Changes

```json
{
  "scripts": {
    "test": "node --test test/*.test.js"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

No new dependencies. The `engines` field is overdue regardless.

---

## Test Architecture

### Directory Structure

```
test/
├── init.test.js           # Fresh project initialization
├── init-idempotent.test.js # Re-running init on existing project
├── export.test.js          # Export subcommand
├── import.test.js          # Import subcommand
├── roundtrip.test.js       # Export → import → compare
├── upgrade.test.js         # Forwardability (v0.1 → v0.2)
├── schema.test.js          # .squad file format validation
├── edge-cases.test.js      # Malformed input, missing files, corruption
├── helpers.js              # Shared test utilities (temp dirs, fixtures)
└── fixtures/
    ├── valid.squad          # Well-formed .squad file for import tests
    ├── malformed.squad      # Invalid JSON
    ├── missing-fields.squad # Valid JSON, missing required fields
    ├── v0-history.md        # Pre-split history (no Portable Knowledge section)
    └── mock-ai-team/        # Simulated .ai-team/ directory for export tests
        ├── team.md
        ├── routing.md
        ├── decisions.md
        ├── casting/
        │   ├── registry.json
        │   ├── history.json
        │   └── policy.json
        └── agents/
            ├── keaton/
            │   ├── charter.md
            │   └── history.md
            └── verbal/
                ├── charter.md
                └── history.md
```

### Test Helper: `helpers.js`

Core utilities every test file needs:

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.js');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runSquad(args = '', cwd) {
  return execSync(`node ${INDEX_PATH} ${args}`, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
}

function seedAiTeam(dir, overrides = {}) {
  // Creates a realistic .ai-team/ directory for export/import testing
  const base = path.join(dir, '.ai-team');
  // ... seed casting, agents, team.md, routing.md, etc.
}

module.exports = { createTmpDir, cleanTmpDir, runSquad, seedAiTeam, INDEX_PATH };
```

The `NO_COLOR=1` env var is important — ANSI codes in test output make assertions fragile. `index.js` should respect this. (That's a product fix, not a test fix — tracked below.)

---

## Test Categories

### Category 1: Init Tests (`init.test.js`)

**What:** Run `create-squad` in an empty temp directory. Verify the exact file structure.

| Test | What It Checks |
|------|---------------|
| Creates `.github/agents/squad.agent.md` | File exists and content matches source |
| Creates `.ai-team-templates/` | Directory exists with all template files |
| Creates `.ai-team/decisions/inbox/` | Directory exists |
| Creates `.ai-team/orchestration-log/` | Directory exists |
| Creates `.ai-team/casting/` | Directory exists |
| `squad.agent.md` content matches source | Byte-for-byte comparison with `.github/agents/squad.agent.md` in repo |
| Template files match source | Every file in `templates/` exists in `.ai-team-templates/` |
| Exit code is 0 | Process exits cleanly |
| Output contains "Squad is ready" | User sees success message |
| Output contains next steps | User sees what to do next |

**Edge cases:**
- Target directory is read-only → should error gracefully, not stack trace
- Target directory has no write permission on `.github/` → should error gracefully
- Target directory path contains spaces → should work
- Target directory path contains unicode characters → should work

### Category 2: Idempotency Tests (`init-idempotent.test.js`)

**What:** Run `create-squad` twice. Verify it doesn't break or overwrite.

| Test | What It Checks |
|------|---------------|
| Second run skips `squad.agent.md` | File unchanged, output says "already exists — skipping" |
| Second run skips `.ai-team-templates/` | Directory unchanged, output says "already exists — skipping" |
| Second run still creates directories | `decisions/inbox/`, `orchestration-log/`, `casting/` created if missing |
| Partial prior install handled | `.github/agents/` exists but no `squad.agent.md` → creates it |
| Existing `.ai-team-templates/` preserved | No files overwritten, no files deleted |

**Critical edge case:** User manually edited `squad.agent.md` after init. Second run must NOT overwrite their customizations. Current code handles this (skips if exists) but we need the test to prove it.

### Category 3: Export Tests (`export.test.js`)

*These tests require the export feature from Proposal 008 to be implemented.*

| Test | What It Checks |
|------|---------------|
| Exports valid JSON | Output file is parseable JSON |
| Contains `squad_format_version` | Schema version present |
| Contains `exported_at` | ISO 8601 timestamp |
| Contains `casting` section | `registry`, `history`, `policy` all present |
| Contains all agents | Every agent directory → agent entry in manifest |
| Agent charters included | Full charter markdown preserved |
| Agent histories included | History content present (filtering deferred to user) |
| `decisions.md` excluded | Not in manifest |
| `decisions/inbox/` excluded | Not in manifest |
| `orchestration-log/` excluded | Not in manifest |
| `log/` excluded | Not in manifest |
| No `.ai-team/` → error | Exit code 1, helpful message |
| Custom `--out` path works | File written to specified location |
| Default output location | `squad-export-{timestamp}.squad` in cwd |

**Edge cases:**
- `.ai-team/` exists but `team.md` doesn't → should error with clear message
- Agent directory exists but `charter.md` missing → should error or skip with warning
- `casting/registry.json` is malformed JSON → should error gracefully
- Empty `.ai-team/agents/` (no agents) → should still export (valid but empty)
- Very large history files (>100KB) → should still work, no truncation
- Agent directory name with spaces or special characters → handle or error clearly

### Category 4: Import Tests (`import.test.js`)

*These tests require the import feature from Proposal 008 to be implemented.*

| Test | What It Checks |
|------|---------------|
| Valid `.squad` file → correct structure | All expected files created |
| `squad.agent.md` created | Coordinator agent deployed |
| `.ai-team-templates/` created | Templates deployed |
| Casting state restored | `registry.json`, `history.json`, `policy.json` match manifest |
| Agent charters restored | Every agent has `charter.md` with correct content |
| Agent histories seeded | Portable knowledge present, project context absent |
| `routing.md` restored | Content matches manifest |
| Empty `decisions.md` created | Fresh project decisions |
| `decisions/inbox/` created | Empty directory exists |
| `orchestration-log/` created | Empty directory exists |
| `imported_from` metadata added | `registry.json` has import provenance |
| Exit code is 0 | Clean exit |
| Output shows agent count | "6 agents imported" |
| Output shows universe | "The Usual Suspects" |

**Collision tests:**
- Existing `.ai-team/team.md` → error, exit code 1, message about existing squad
- Existing `.ai-team/` but no `team.md` → should this work or error? (needs decision)

**Malformed input tests:**
- File doesn't exist → error, exit code 1
- File is not JSON → error, exit code 1, "could not parse JSON"
- File is JSON but missing `squad_format_version` → error, exit code 1
- File is JSON but missing `casting` → error, exit code 1
- File is JSON but missing `agents` → error, exit code 1
- File has unknown `squad_format_version` (e.g., "99.0") → error or warning
- File is empty → error
- File is valid JSON but empty object `{}` → error
- File path contains spaces → should work
- File path is relative → should resolve correctly
- File path is absolute → should work

### Category 5: Round-Trip Tests (`roundtrip.test.js`)

**The acid test.** This is where we prove the system works end-to-end.

| Test | What It Checks |
|------|---------------|
| Init → Export → Import → Compare | Charters match. Casting state matches. Routing matches. |
| Skills survive round-trip | If preferences.md exists on export, it exists after import with same content |
| Casting registry round-trips | Agent names, universe, roles preserved exactly |
| Casting policy round-trips | Allowlist universes, capacities preserved exactly |
| Template files present after import | `.ai-team-templates/` populated correctly |
| `squad.agent.md` present after import | Coordinator deployed |

**The round-trip test procedure:**

```
1. Create temp dir A
2. Run `create-squad` in A (init)
3. Seed A/.ai-team/ with realistic agent data (charters, histories, casting)
4. Run `create-squad export` in A → produces .squad file
5. Create temp dir B
6. Run `create-squad import <file>` in B
7. Compare: A's portable state == B's state
   - casting/registry.json (minus import metadata)
   - casting/policy.json
   - agents/*/charter.md
   - agents/*/preferences.md (if exists)
   - routing.md
8. Verify: B has NO project-specific state from A
   - decisions.md is fresh
   - orchestration-log/ is empty
   - history.md has only portable knowledge
```

This test is the most important one in the suite. If this passes, portability works.

### Category 6: Upgrade Tests (`upgrade.test.js`)

*These tests apply if/when Proposal 011 (forwardability) is implemented.*

| Test | What It Checks |
|------|---------------|
| V0.1 project → upgrade → files updated | Templates refreshed, `squad.agent.md` updated |
| Upgrade preserves `.ai-team/` | Agent charters, histories, casting untouched |
| Upgrade preserves custom `squad.agent.md` edits | If user modified coordinator, detect and warn |
| Upgrade adds new templates | Files added in v0.2 templates appear |
| Upgrade doesn't remove old templates | Templates the user might reference still exist |
| Skills/preferences survive upgrade | `preferences.md` files untouched |
| Double upgrade is idempotent | Running upgrade twice produces same result |

**Key principle:** Upgrade touches infrastructure (`squad.agent.md`, `.ai-team-templates/`). It never touches user state (`.ai-team/agents/`, `.ai-team/decisions.md`, `.ai-team/casting/`). Tests must verify this boundary.

### Category 7: Schema Validation Tests (`schema.test.js`)

**What:** Validate the `.squad` file format independently of import/export.

| Test | What It Checks |
|------|---------------|
| Valid manifest passes validation | All required fields present and correct types |
| Missing `squad_format_version` → invalid | Required field |
| Missing `casting` → invalid | Required field |
| Missing `agents` → invalid | Required field |
| `casting.registry` must be object | Type check |
| `casting.policy` must be object | Type check |
| `casting.history` must be object | Type check |
| Each agent must have `charter` (string) | Type check |
| `exported_at` must be ISO 8601 | Format check |
| `squad_format_version` must be "1.0" | Known version check |
| Extra fields are tolerated | Forward compatibility — unknown fields don't cause errors |

**Why separate from import tests:** Schema validation should be a pure function. Import tests exercise the full flow. Schema tests exercise the contract. A broken schema validator fails fast with a clear message; a broken import flow fails late with a confusing state.

### Category 8: Edge Case Tests (`edge-cases.test.js`)

This is the mean test file. Every scenario a user will accidentally hit.

| Test | What It Checks |
|------|---------------|
| **Missing `.ai-team/`** | Export fails gracefully, not stack trace |
| **Corrupted `registry.json`** | Export fails gracefully, message says what's wrong |
| **Corrupted `policy.json`** | Export fails gracefully |
| **Agent dir with no `charter.md`** | Export handles gracefully (skip or error) |
| **Empty agent directory** | No crash |
| **`.squad` file with BOM** | Import handles UTF-8 BOM correctly |
| **`.squad` file with trailing comma** | JSON.parse error is caught, message is helpful |
| **Path with spaces** | `create-squad import "my squad.squad"` works |
| **Path with backslashes (Windows)** | All path joins use `path.join`, not string concatenation |
| **Symlinks in `.ai-team/`** | Follow or error, don't infinite loop |
| **Very long file paths (>260 chars on Windows)** | Error or handle |
| **Empty `.ai-team/agents/` directory** | Export produces valid manifest with no agents |
| **Non-UTF8 content in charter.md** | Handle or error, don't corrupt |
| **Concurrent init (two processes, same dir)** | At least one succeeds, neither corrupts |
| **`index.js` run from different cwd** | `__dirname` vs `process.cwd()` correct |
| **No write permission on target dir** | Helpful error, not EPERM stack trace |
| **Disk full** | Helpful error, not ENOSPC stack trace |
| **`.squad` file is actually a directory** | Error, don't crash |
| **Import with `--force` when no existing squad** | Should just import normally |

### Category 9: Platform-Specific Tests

| Test | Platform | What It Checks |
|------|----------|---------------|
| Path separators | Windows | `path.join` used everywhere, no hardcoded `/` |
| Line endings | Windows | Files created with consistent line endings |
| Case sensitivity | macOS/Windows | Agent dirs `Keaton` vs `keaton` handled consistently |
| Temp dir behavior | All | `os.tmpdir()` works for test isolation |

**Note:** We can't CI-test all platforms from one OS. But we CAN write the tests to be platform-aware and validate on the platform they run on. Cross-platform CI (GitHub Actions matrix: ubuntu, macos, windows) is the right answer here.

---

## Quality Gates for V1 Release

### Gate 1: All Tests Pass (Blocking)

No v1 release if any test fails. Period.

```bash
npm test  # must exit 0
```

### Gate 2: Init Happy Path (Blocking)

A fresh `npx @bradygaster/create-squad` in an empty directory must:
1. Create all expected files
2. Exit cleanly
3. Print correct output

This is the "does the product work at all" gate.

### Gate 3: Export/Import Round-Trip (Blocking)

Export from project A → Import into project B must produce:
1. Identical casting state
2. Identical agent charters
3. Identical portable knowledge
4. Zero project-specific leakage

This is the "does portability work" gate.

### Gate 4: No Raw Stack Traces (Blocking)

Every filesystem error the CLI can encounter must produce a human-readable error message, not a Node.js stack trace. Test by simulating:
- Missing source files
- Permission denied
- Malformed input
- Missing directories

### Gate 5: Idempotency (Blocking)

Running `create-squad` twice in the same directory must not:
- Overwrite existing files
- Corrupt state
- Produce errors

### Gate 6: Schema Validation (Blocking)

Every `.squad` file the CLI produces must pass schema validation. Every malformed `.squad` file the CLI receives must produce a helpful error.

### Gate 7: Cross-Platform CI (Recommended, not blocking for v1.0)

GitHub Actions matrix testing on:
- `ubuntu-latest`
- `macos-latest`
- `windows-latest`

This should be blocking by v1.1. For v1.0, we test on the platform we're building on and accept the risk.

---

## Minimum Coverage Target

**Line coverage target: 90% of `index.js`.**

Not because coverage numbers are inherently meaningful, but because `index.js` is small enough that 90% means "you tested almost everything." The remaining 10% is likely error paths that are hard to simulate (disk full, permission denied at OS level).

**Branch coverage target: 85%.**

Every `if/else` in `index.js` should have both branches tested. The init path, the export path, the import path, the error paths.

**How to measure:** `node --test --experimental-test-coverage test/*.test.js` (built into Node 22).

---

## CI Configuration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm test
```

No install step needed — no dependencies. Just checkout and test.

### Pre-Commit Hook (Recommended)

```bash
# .husky/pre-commit (if we adopt husky — but that's a dependency)
npm test
```

**Alternative without dependencies:** Add a note to CONTRIBUTING.md: "Run `npm test` before pushing." Trust the CI to catch what developers miss. This matches Brady's "no sacred tech decisions" and thin runtime philosophy.

**My recommendation:** No pre-commit hook. CI is the gate. Keep the repo clean.

---

## Testing Skills and Portability Together

### Skills (preferences.md, domain expertise)

Skills manifest as files in agent directories. Testing skills means testing that those files:

1. **Survive init** — if the template includes a skills/preferences scaffold, it's created
2. **Survive export** — `preferences.md` included in `.squad` manifest
3. **Survive import** — `preferences.md` written to correct agent directory
4. **Survive round-trip** — content identical before export and after import
5. **Survive upgrade** — upgrade doesn't touch agent directories

```javascript
it('preferences.md survives export/import round-trip', () => {
  // Seed agent with preferences.md
  const prefsContent = '# Working with Brady\n\n- Prefers explicit error handling\n';
  fs.writeFileSync(
    path.join(tmpA, '.ai-team', 'agents', 'keaton', 'preferences.md'),
    prefsContent
  );

  // Export
  runSquad('export', tmpA);
  const squadFile = findSquadFile(tmpA);

  // Import into fresh dir
  runSquad(`import ${squadFile}`, tmpB);

  // Verify
  const imported = fs.readFileSync(
    path.join(tmpB, '.ai-team', 'agents', 'keaton', 'preferences.md'),
    'utf8'
  );
  assert.equal(imported, prefsContent);
});
```

### Portable Knowledge in History

The history split (Proposal 008) creates `## Portable Knowledge` and `## Project Learnings` sections. Tests must verify:

1. **Export extracts `## Portable Knowledge`** — only this section appears in manifest
2. **Export excludes `## Project Learnings`** — project-specific content stripped
3. **Import seeds history with portable knowledge only** — no project context from source
4. **Unsplit histories handled** — pre-008 histories without sections export cleanly (full content with warning)

### Upgrade and Skills Preservation

```javascript
it('upgrade preserves agent preferences.md', () => {
  // Init v0.1
  runSquad('', tmpDir);

  // Simulate agent work — create preferences
  seedAgentPreferences(tmpDir, 'keaton', '- Brady likes explicit errors\n');

  // Run upgrade
  runSquad('upgrade', tmpDir);

  // Verify preferences untouched
  const prefs = fs.readFileSync(
    path.join(tmpDir, '.ai-team', 'agents', 'keaton', 'preferences.md'),
    'utf8'
  );
  assert.ok(prefs.includes('Brady likes explicit errors'));
});
```

---

## What CANNOT Be Tested (And How We Handle It)

### 1. LLM Behavior (Coordinator Prompt)

`squad.agent.md` is a 32KB prompt. Its behavior depends on the LLM interpreting it. We cannot unit-test whether the coordinator will spawn agents correctly, route work properly, or respect reviewer gates.

**How we handle it:** Test the *inputs* to the LLM, not the *outputs*.
- Test that `squad.agent.md` is deployed correctly (file exists, content matches)
- Test that the file structures agents depend on are valid (casting, routing, templates)
- Test that imported squads have the correct coordinator detection signals (`imported_from` field)

### 2. Agent Spawning

Spawning agents requires a live Copilot session. We can't simulate that.

**How we handle it:** Test the file contracts.
- Each agent directory has `charter.md`
- Each agent's `history.md` has the expected sections
- `routing.md` references valid agent names
- `team.md` roster matches agent directories

### 3. Multi-Agent Coordination

Parallel agent work, decision inbox merging, reviewer gates — these are runtime behaviors.

**How we handle it:** Test the infrastructure that coordination depends on.
- `decisions/inbox/` directory exists and is writable
- `orchestration-log/` directory exists
- Templates for orchestration logs are valid markdown

### 4. User Experience (Interactive Flows)

The casting ceremony, team naming, universe selection — these are conversational.

**How we handle it:** Stress-test with real usage. Log bugs. The squad building itself (Proposal stress-testing) is the best test for UX.

---

## Implementation Priority

### Phase 1: Foundation (Do This First) — ~2 hours

1. Create `test/` directory
2. Create `test/helpers.js` with temp dir utilities
3. Create `test/init.test.js` with happy-path init tests
4. Create `test/init-idempotent.test.js`
5. Add `"test"` script to `package.json`
6. Add `"engines"` field to `package.json`
7. Verify: `npm test` passes

This gives us a test harness and validates the existing product works.

### Phase 2: Edge Cases — ~2 hours

1. Create `test/edge-cases.test.js`
2. Test filesystem errors (permissions, missing dirs)
3. Test path handling (spaces, unicode)
4. Identify product bugs → file issues or fix inline

This hardens the existing code before we add features.

### Phase 3: Export/Import Tests — ~3 hours

*Depends on Fenster implementing export/import from Proposal 008.*

1. Create `test/fixtures/` with valid and malformed `.squad` files
2. Create `test/export.test.js`
3. Create `test/import.test.js`
4. Create `test/schema.test.js`
5. Create `test/roundtrip.test.js`

### Phase 4: CI — ~1 hour

1. Create `.github/workflows/test.yml`
2. Matrix: ubuntu, macos, windows × Node 22
3. Verify all tests pass on all platforms

### Phase 5: Upgrade Tests — ~1 hour

*Depends on Proposal 011 being implemented.*

1. Create `test/upgrade.test.js`

### Total: ~9 hours across all phases.

---

## Product Fixes Required

Testing will expose bugs. Here are the ones I already know about:

### Fix 1: Respect `NO_COLOR` Environment Variable

`index.js` hardcodes ANSI escape codes. It should check `process.env.NO_COLOR` and suppress them. This is a [community standard](https://no-color.org/) and it makes test assertions cleaner.

```javascript
const useColor = !process.env.NO_COLOR;
const GREEN = useColor ? '\x1b[32m' : '';
const DIM = useColor ? '\x1b[2m' : '';
const BOLD = useColor ? '\x1b[1m' : '';
const RESET = useColor ? '\x1b[0m' : '';
```

### Fix 2: Exit Codes

`index.js` currently doesn't call `process.exit()` — it just falls through. This is fine for success but means errors (when added) need explicit exit codes. All error paths should `process.exit(1)`.

### Fix 3: Error Wrapping

All filesystem operations should be wrapped in try-catch with user-friendly messages. No raw `ENOENT`, `EACCES`, or `ENOSPC` stack traces.

### Fix 4: `engines` Field

```json
"engines": {
  "node": ">=22.0.0"
}
```

We use `node:test` which requires Node 22. Declare it.

---

## The Exhaustive Edge Case Catalog

These are the scenarios I'll sleep-test. Some are paranoid. Good.

### Filesystem Edge Cases
- Symlink in `templates/` pointing outside the repo → follows? errors? infinite loop?
- `.ai-team/agents/` contains a file, not a directory (e.g., `agents/keaton` is a file)
- `casting/registry.json` is 0 bytes
- `charter.md` is 0 bytes
- `history.md` is binary data, not text
- `.ai-team/` is a symlink to another directory
- Target directory is root (`/` or `C:\`)
- Target directory is home (`~`)

### JSON Edge Cases
- `.squad` file with duplicate keys → `JSON.parse` takes last value (is that what we want?)
- `.squad` file with numeric version (`1.0` instead of `"1.0"`) → type check catches this
- `.squad` file with `null` values for optional fields → handled or crash?
- `.squad` file with deeply nested objects (>100 levels) → stack overflow?
- `.squad` file with very long strings (1MB charter) → memory?

### Encoding Edge Cases
- Files with Windows line endings (`\r\n`) → preserved or normalized?
- Files with mixed line endings → preserved or normalized?
- UTF-8 BOM (`\xEF\xBB\xBF`) at start of `.squad` file → handled?
- Emoji in agent names (unlikely but possible) → path handling?
- Non-ASCII in directory names → platform-dependent, test on each OS

### Concurrency Edge Cases
- Two `create-squad` processes running simultaneously in same directory
- Export while another process is writing to `.ai-team/`
- Import into a directory being watched by another tool (like `tsc --watch`)

### State Edge Cases
- `.ai-team/` exists but is completely empty
- `.ai-team/team.md` exists but `.ai-team/agents/` doesn't
- `.ai-team/casting/` exists but `registry.json` doesn't
- Import a `.squad` from a newer version of Squad → forward compatibility
- Import a `.squad` with agents that have skills the current Squad version doesn't know about

---

## Success Criteria

1. **`npm test` passes on clean checkout.** Any developer can clone, run tests, see green.
2. **CI runs on every PR.** No code merges without tests passing.
3. **90% line coverage on `index.js`.** Measured by Node's built-in coverage.
4. **Zero raw stack traces.** Every error path produces a human-readable message.
5. **Round-trip fidelity proven.** Export → import produces identical portable state.
6. **Edge cases documented and tested.** The catalog above becomes test code.
7. **Cross-platform validation.** Tests pass on Linux, macOS, and Windows.

---

## Open Questions

1. **Should we test `squad.agent.md` content?** We can't test LLM behavior, but we CAN test that the file contains expected sections (Init Mode, Team Mode, Casting). This is a smoke test, not a behavioral test. Worth doing?

2. **Snapshot testing for output messages?** The console output ("Squad is ready", "Next steps:") is part of the UX. Should we snapshot it and fail if it changes? Pro: catches accidental messaging regressions. Con: makes every output change require a test update.

3. **How to test the `cleanTeamMd` regex?** This is a pure function that strips `## Project Context` from markdown. It should have its own unit tests with various markdown inputs. But it requires `index.js` to export it — which means refactoring to support both `require()` and CLI execution.

4. **Should `index.js` be refactored for testability?** Currently it's a script that runs top-to-bottom. For proper unit testing, the functions should be exported. This is a small refactor: wrap in functions, export for testing, call from `if (require.main === module)` guard. Worth it? I say yes.

5. **Integration tests vs. unit tests — what's the split?** My recommendation: 80% integration (run the CLI in a temp dir, check files), 20% unit (pure functions like schema validation, `cleanTeamMd`). The CLI is small enough that integration tests are fast and high-signal.

---

## My Commitment

I've been flagging "zero tests" since day one. Now it's v1 and there are real users. This is no longer a "we should probably" — it's a "we must."

I will:
1. Write every test in this proposal
2. Run them on every PR I review
3. Block any PR that breaks existing tests
4. Add regression tests for every bug we find
5. Maintain the edge case catalog as features evolve

The test suite should be meaner than any user could be. If a user can break it, I should have broken it first.

— Hockney

---

**Review requested from:** Fenster (testability refactors in `index.js`), Keaton (architecture alignment), bradygaster (quality bar sign-off)  
**Approved by:** [Pending]  
**Implemented:** [Pending]  
**Retrospective:** [Pending]
