# Troubleshooting

Common issues and fixes for Squad installation and usage.

---

## `gh` CLI not authenticated

**Problem:** GitHub Issues, PRs, Ralph, or Project Boards commands fail with authentication errors.

**Cause:** The `gh` CLI isn't logged in, or is missing required scopes.

**Fix:**

1. Log in:
   ```bash
   gh auth login
   ```

2. If using Project Boards, add the `project` scope:
   ```bash
   gh auth refresh -s project
   ```

3. Verify:
   ```bash
   gh auth status
   ```

---

## Node.js version too old

**Problem:** Squad fails with an engine compatibility error, or behaves unexpectedly.

**Cause:** Squad requires Node.js 20 or later (enforced via `engines` in `package.json`).

**Fix:**

```bash
node --version
```

If below v20, upgrade Node.js:
- **nvm (macOS/Linux):** `nvm install 20 && nvm use 20`
- **nvm-windows:** `nvm install 20 && nvm use 20`
- **Direct download:** [nodejs.org](https://nodejs.org/)

---

## Squad agent not appearing in Copilot

**Problem:** After install, `squad` doesn't show up in the `/agent` (CLI) or `/agents` (VS Code) list in GitHub Copilot.

**Cause:** The `.github/agents/squad.agent.md` file may not have been created, or Copilot hasn't refreshed its agent list.

**Fix:**

1. Verify the file exists:
   ```bash
   ls .github/agents/squad.agent.md
   ```
   If missing, re-run `squad init` (or `npx @bradygaster/squad-cli init`).

2. Restart your Copilot session — close and reopen the terminal or editor.

---

## Upgrade doesn't change anything

**Problem:** Running `squad upgrade` completes but nothing changes.

**Cause:** You may already be on the latest version, or npm cached an old version.

**Fix:**

1. Check current version:
   ```bash
   squad --version
   ```

2. If stale, clear the npm cache and reinstall:
   ```bash
   npm install -g @bradygaster/squad-cli@latest
   ```

---

## Windows-specific issues

**Problem:** Path errors or file operations fail on Windows.

**Cause:** Some shell commands assume Unix-style paths.

**Fix:** Squad's core uses `path.join()` for all file operations and is Windows-safe. If you see path issues:
- Use PowerShell or Git Bash (not cmd.exe)
- Ensure git is in your PATH
- Ensure `gh` CLI is in your PATH
