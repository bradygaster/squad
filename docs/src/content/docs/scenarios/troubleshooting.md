# Troubleshooting

Common issues and fixes for Squad installation and usage.

---

## Quick fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `squad: command not found` | Squad CLI not installed or not in PATH | Run `npm install -g @bradygaster/squad-cli` |
| `No .squad/ directory found` | Not in a git repo or Squad not initialized | Run `git init` then `squad init` |
| `Cannot find agent "{name}"` | Agent doesn't exist in `.squad/agents/` | Check `.squad/team.md` for roster, or re-run casting |
| `gh: command not found` | GitHub CLI not installed | Install from [cli.github.com](https://cli.github.com/) then `gh auth login` |
| `Node.js version error` | Node.js version below v20 | Upgrade Node.js to v20+ (see below) |

---

## Installing Squad

**Problem:** Unsure how to install Squad.

**Cause:** Squad was previously distributed via multiple channels. It's now exclusively via npm.

**Fix:** Install globally:

```bash
npm install -g @bradygaster/squad-cli
```

Then initialize your project:

```bash
squad init
```

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

## Authentication fails on cross-org repos

**Problem:** Squad agents hit authentication errors when working with repositories across personal GitHub and GitHub Enterprise Managed Users (EMU) organizations.

**Cause:** The `gh` CLI and git credentials are tied to one account at a time. When you switch contexts between personal and EMU repos, the active account may not have access to the target repository.

**Fix:**

1. Use `gh auth switch` to toggle between authenticated accounts:
   ```bash
   gh auth status
   gh auth switch --user <username>
   ```

2. Add account mappings to `.github/copilot-instructions.md` so Squad agents know which account to use for which repos.

3. Configure git credential helpers per host or organization.

See [Cross-organization authentication](./cross-org-auth) for detailed setup instructions.

---

## Node.js version too old

**Problem:** Squad fails with an engine compatibility error, or behaves unexpectedly.

**Cause:** Squad requires Node.js 20.0.0 or later (LTS), enforced via `engines` in `package.json`.

**Fix:**

```bash
node --version
```

If below v20, upgrade to the latest LTS:
- **nvm (macOS/Linux):** `nvm install --lts && nvm use --lts`
- **nvm-windows:** `nvm install lts && nvm use lts`
- **Direct download:** [nodejs.org](https://nodejs.org/)

---

## GitHub Copilot agent not appearing

**Problem:** After install, `squad` doesn't show up in the `/agent` (CLI) or `/agents` (VS Code) list in GitHub Copilot.

**Cause:** The `.github/agents/squad.agent.md` file may not have been created, or Copilot hasn't refreshed its agent list.

**Fix:**

1. Verify the file exists:
   ```bash
   ls .github/agents/squad.agent.md
   ```
   If missing, re-run `squad init`.

2. Restart your Copilot session — close and reopen the terminal or editor.

---

## Upgrade doesn't change anything

**Problem:** Running `squad upgrade` completes but nothing changes.

**Cause:** You may already be on the latest version, or npm cached an old version.

**Fix:**

1. Check current version in `.github/agents/squad.agent.md` (frontmatter `version:` field).

2. Clear npm cache and retry:
   ```bash
   squad upgrade
   ```

---

## Windows-specific issues

**Problem:** Path errors or file operations fail on Windows.

**Cause:** Some shell commands assume Unix-style paths.

**Fix:** Squad's core uses `path.join()` for all file operations and is Windows-safe. If you see path issues:
- Use PowerShell or Git Bash (not cmd.exe)
- Ensure git is in your PATH
- Ensure `gh` CLI is in your PATH
