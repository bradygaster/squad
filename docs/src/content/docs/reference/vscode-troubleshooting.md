# VS Code Troubleshooting

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

This page covers known issues and mitigations when running Squad inside VS Code's integrated terminal.

---

## Symptom: VS Code closes unexpectedly during Squad execution

**Reported in:** [Issue #259](https://github.com/bradygaster/squad/issues/259), [Discussion #174](https://github.com/bradygaster/squad/discussions/174)

VS Code (especially Insiders/Nightly builds) may close without a crash dialog while Squad tasks are executing. This is most often caused by resource pressure — not a bug in Squad itself — but Squad's runtime patterns can contribute to the problem.

---

## Root cause analysis

An audit of the Squad codebase (SDK and CLI) identified the following resource-pressure vectors:

### 1. Unbounded in-memory collections (fixed)

**Streaming usage history** (`streaming.ts`) and **telemetry queue** (`telemetry.ts`) previously grew without limit during long-running sessions. In multi-agent sessions with heavy token throughput, these arrays could accumulate tens of thousands of entries over hours.

**Fix applied:** Both collections now enforce FIFO eviction caps — 1,000 events for usage history and 500 for telemetry. This bounds worst-case memory contribution to a predictable ceiling.

### 2. File watcher scope (fixed)

The `SquadObserver` watches the `.squad/` directory with `recursive: true`. On projects with large orchestration logs, this could generate a high volume of `fs.watch` events. Combined with VS Code's own file watchers on the same workspace, the total watcher count can approach OS limits.

**Fix applied:** The observer now filters out `orchestration-log/` and `.git/` subdirectories at the watcher callback level, reducing event volume significantly.

### 3. Stream buffer accumulation (already mitigated)

The CLI shell accumulates per-agent streaming content in `Map<string, string>` buffers. The existing `MemoryManager` enforces a 1 MB per-stream cap and trims the active message list to 200 entries. No additional changes needed.

### 4. Process spawning (no issues found)

All child processes (`node-pty` for Copilot, `devtunnel`, Docker, .NET) are properly tracked and cleaned up via signal handlers (`SIGINT`, `SIGTERM`). No process leak patterns were detected.

### 5. Terminal output rate (low risk)

Squad uses the Ink framework for rendering, which batches React state updates. Direct `process.stdout.write` calls are rate-limited by the model's token generation speed. No fire-hose output patterns were found.

### 6. Synchronous I/O (startup only)

`existsSync` and `readFileSync` calls exist in config loading and shell initialization, but these run only at startup — not in hot paths or event loops.

---

## Recommended mitigations

### For users

1. **Use VS Code Stable instead of Insiders/Nightly.** Nightly builds may have unresolved memory or renderer bugs that amplify resource pressure from terminal-heavy workloads.

2. **Increase the file watcher limit** (Linux/macOS):
   ```bash
   # Check current limit
   cat /proc/sys/fs/inotify/max_user_watches

   # Increase temporarily
   sudo sysctl fs.inotify.max_user_watches=524288

   # Increase permanently
   echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
   ```

3. **Exclude `.squad/orchestration-log/` from VS Code's file watcher** by adding to `.vscode/settings.json`:
   ```json
   {
     "files.watcherExclude": {
       "**/.squad/orchestration-log/**": true
     }
   }
   ```

4. **Monitor resource usage** during Squad sessions:
   - **Windows:** Task Manager → Details tab, watch `node.exe` memory
   - **macOS/Linux:** `top -p $(pgrep -f squad)` or Activity Monitor
   - If memory climbs steadily past 1 GB, restart the Squad shell

5. **Close unused terminals** in VS Code before starting a Squad session. Each terminal consumes renderer memory.

6. **Disable terminal GPU acceleration** if you see flickering (related: [#254](https://github.com/bradygaster/squad/issues/254)):
   ```json
   {
     "terminal.integrated.gpuAcceleration": "off"
   }
   ```

### For developers

- When adding new in-memory collections, enforce size caps with FIFO eviction (see `StreamingPipeline.MAX_USAGE_EVENTS` pattern).
- When adding file watchers, always filter high-churn directories in the callback.
- Prefer `async` file I/O in any code path that runs during active sessions.
- Test long-running sessions (2+ hours) to verify memory stays bounded.

---

## Related issues

| Issue | Description | Status |
|-------|-------------|--------|
| [#259](https://github.com/bradygaster/squad/issues/259) | VS Code crash during Squad execution | This investigation |
| [#254](https://github.com/bradygaster/squad/issues/254) | Terminal flicker in VS Code | Open |
| [Discussion #174](https://github.com/bradygaster/squad/discussions/174) | Original crash report by @diberry | Open |
