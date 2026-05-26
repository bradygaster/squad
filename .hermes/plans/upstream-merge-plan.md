# Squad Upstream Merge and Validation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Merge all commits from upstream/dev into our local fork branch dev, resolve conflicts, and verify that the fork compiles, passes all unit tests, and retains first-class support for Gemini CLI and Claude Code as well as multi-provider LLM backends (Gemini, Claude, Vertex AI).

**Architecture:** We will create a new tracking/merge branch, run a git merge, resolve all files with specific surgical resolutions, run a full build to verify TypeScript type-safety, run vitest to ensure no unit test regressions, and verify that our custom providers are untouched and fully functional.

**Tech Stack:** TypeScript, Node.js (>= 22.5), vitest, Git.

---

### Task 1: Prepare the Merge Branch and Start the Merge

**Objective:** Checkout a clean branch from `dev` and initiate `git merge upstream/dev`, identifying the conflicts.

**Files:**
- Modify: None (git commands only)

**Steps:**
1. Checkout a clean branch: `git checkout -b merge/upstream-dev`
2. Run the merge: `git merge upstream/dev`
3. Verify that the 10 conflicted files are matched as expected.

---

### Task 2: Resolve CLI Entry

**Objective:** Merge the known flags list in `packages/squad-cli/src/cli-entry.ts`.

**Files:**
- Modify: `packages/squad-cli/src/cli-entry.ts`

**Resolution:**
Keep both upstream's `--board-owner` and our custom `--agent-flags` and `--copilot-flags`.
Combine into:
```typescript
      '--interval', '--agent-flags', '--copilot-flags', '--agent-cmd', '--max-concurrent', '--timeout', '--board-project', '--board-owner', '--auth-user',
```

---

### Task 3: Resolve Doctor Diagnostics

**Objective:** Add the new Copilot CLI check from upstream alongside our custom LLM provider checks.

**Files:**
- Modify: `packages/squad-cli/src/cli/commands/doctor.ts`

**Resolution:**
1. Keep the `checkApiKey` and `detectInstalledAgentClis` helper functions/imports from our fork.
2. Port upstream's `checkCopilotCli` function and add `checks.push(await checkCopilotCli())` to the list of checks run in `runDoctor`.

---

### Task 4: Resolve Watch Execution

**Objective:** Retain the dual-imports needed for watch capabilities in `packages/squad-cli/src/cli/commands/watch/capabilities/execute.ts`.

**Files:**
- Modify: `packages/squad-cli/src/cli/commands/watch/capabilities/execute.ts`

**Resolution:**
Keep both `buildAgentCommand` from our fork and `loadAgentCharter` from upstream.

---

### Task 5: Resolve Package.json and Templates

**Objective:** Keep our customized agent templates while externalizing the after-agent-work block, and standardize on the higher package version numbers from upstream.

**Files:**
- Modify: `packages/squad-cli/package.json`, `package-lock.json`, `templates/squad.agent.md.template`, `packages/squad-cli/templates/squad.agent.md.template`, `packages/squad-sdk/templates/squad.agent.md.template`

**Resolution:**
1. Use upstream's `"version": "0.9.6-build.4"` in package.json files (retaining other dependency updates).
2. Adapt our templates to refer to upstream's new `after-agent-reference.md` while keeping our custom Scribe task templates.

---

### Task 6: Resolve Squad SDK Client

**Objective:** Port upstream's adapter/client updates to `CopilotProvider` while preserving our pluggable provider architecture in `packages/squad-sdk/src/adapter/client.ts`.

**Files:**
- Modify: `packages/squad-sdk/src/adapter/client.ts`, `packages/squad-sdk/src/adapter/providers/copilot-provider.ts`

**Resolution:**
1. Revert `packages/squad-sdk/src/adapter/client.ts` to our fork's pluggable provider-delegated version (which delegates to `this.provider`).
2. Update `packages/squad-sdk/src/adapter/providers/copilot-provider.ts` to include the casting and version compatibility updates that upstream applied to `CopilotClient` inside `client.ts`.

---

### Task 7: Resolve Doctor Unit Tests

**Objective:** Update doctor test expectations to account for both our provider check and upstream's Copilot CLI check.

**Files:**
- Modify: `test/cli/doctor.test.ts`

**Resolution:**
Update `expect(checks.length).toBe(6);` to `7` (or the appropriate count based on the combined active checks).

---

### Task 8: Build and Run the Test Suite

**Objective:** Run the full build and Vitest suite to guarantee 100% type safety and zero regressions.

**Files:**
- Modify: None (build & test validation only)

**Steps:**
1. Run `npm install` to regenerate `package-lock.json` and install any new upstream dependencies.
2. Run `npm run build` to verify compiling.
3. Run `npm run test` to execute vitest and confirm all 300+ unit/integration tests pass.

---

### Task 9: Merge into Local dev Branch

**Objective:** Perform final commit on the merge branch and merge cleanly back into our local `dev` branch.

**Files:**
- Modify: None (git commands only)

**Steps:**
1. Finalize the merge commit on the branch.
2. Checkout `dev` and merge `merge/upstream-dev` fast-forward.
3. Verify git log is clean and has our Joe Shirey commits and upstream's commits unified.
