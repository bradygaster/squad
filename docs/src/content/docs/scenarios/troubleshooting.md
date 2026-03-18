# Troubleshooting

Common issues and fixes for Squad installation and usage.

---

## Quick fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `squad: command not found` | Squad CLI not installed or not in PATH | Run `npm install -g @bradygaster/squad-cli` or use `npx @bradygaster/squad-cli` |
| `No .squad/ directory found` | Not in a git repo or Squad not initialized | Run `git init` then `npx squad init` |
| `Cannot find agent "{name}"` | Agent doesn't exist in `.squad/agents/` | Check `.squad/team.md` for roster, or re-run casting |
| `gh: command not found` | GitHub CLI not installed | Install from [cli.github.com](https://cli.github.com/) then `gh auth login` |
| `Node.js version error` | Node.js version below v20 | Upgrade Node.js to v20+ (see below) |

---

## `npx github:bradygaster/squad` appears to hang

**Problem:** Running the install command shows a frozen npm spinner. Nothing happens.

**Cause:** npm resolves `github:` package specifiers via `git+ssh://git@github.com/...`. If no SSH agent is running (or your key isn't loaded), git prompts for your passphrase on the TTY — but npm's progress spinner overwrites the prompt, making it invisible. This is an npm TTY handling issue, not a Squad bug.

**Fix (choose one):**

1. **Start your SSH agent first** (recommended):
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add
   ```
   Then re-run `npx github:bradygaster/squad`.

2. **Disable npm's progress spinner** to reveal the prompt:
   ```bash
   npx --progress=false github:bradygaster/squad
   ```

3. **Use HTTPS instead of SSH** by configuring git:
   ```bash
   git config --global url."https://github.com/".insteadOf git@github.com:
   ```

**Reference:** [#30](https://github.com/bradygaster/squad/issues/30)

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

**Problem:** `npx github:bradygaster/squad` fails with an engine compatibility error, or Squad behaves unexpectedly.

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

## Squad agent not appearing in Copilot

**Problem:** After install, `squad` doesn't show up in the `/agent` (CLI) or `/agents` (VS Code) list in GitHub Copilot.

**Cause:** The `.github/agents/squad.agent.md` file may not have been created, or Copilot hasn't refreshed its agent list.

**Fix:**

1. Verify the file exists:
   ```bash
   ls .github/agents/squad.agent.md
   ```
   If missing, re-run `npx github:bradygaster/squad`.

2. Restart your Copilot session — close and reopen the terminal or editor.

---

## Upgrade doesn't change anything

**Problem:** Running `npx github:bradygaster/squad upgrade` completes but nothing changes.

**Cause:** You may already be on the latest version, or npm cached an old version.

**Fix:**

1. Check current version in `.github/agents/squad.agent.md` (frontmatter `version:` field).

2. Clear npm cache and retry:
   ```bash
   npx --yes github:bradygaster/squad upgrade
   ```

---

## `squad doctor` warnings and failures

`squad doctor` validates your `.squad/` setup and reports each check as ✅ pass, ❌ fail, or ⚠️ warn. It always exits 0 — it's a diagnostic tool, not a gate.

Run it any time something feels off:

```bash
squad doctor
```

### Checks and how to fix them

#### ❌ `.squad/` directory not found

**Cause:** No squad has been initialized in this project.

**Fix:** Run `squad init` (or `squad init --mode remote <path>` for dual-root setups).

---

#### ❌ `config.json` — file exists but is not valid JSON

**Cause:** The `.squad/config.json` file is corrupted or was hand-edited with a syntax error.

**Fix:** Open `.squad/config.json` and fix the JSON syntax, or delete it and re-run `squad init`.

---

#### ❌ `config.json` — teamRoot must be a string

**Cause:** The `teamRoot` value in `.squad/config.json` is not a string (e.g., it's a number or object).

**Fix:** Edit `.squad/config.json` so `teamRoot` is a quoted string path:

```json
{ "teamRoot": "../my-team-repo" }
```

---

#### ⚠️ Absolute path warning — teamRoot is absolute

**Cause:** `teamRoot` in `.squad/config.json` uses an absolute path (e.g., `/home/user/team-repo`). This works locally but breaks portability across machines.

**Fix:** Change `teamRoot` to a relative path:

```json
{ "teamRoot": "../my-team-repo" }
```

---

#### ❌ Team root — directory not found

**Cause:** The `teamRoot` path in `.squad/config.json` points to a directory that doesn't exist. The team-root repo may not be cloned, or the relative path is wrong.

**Fix:**
1. Clone the team-root repo to the expected location.
2. Or update `teamRoot` in `.squad/config.json` to the correct relative path.
3. Or re-link with `squad link <correct-path>`.

---

#### ❌ `team.md` — file not found

**Cause:** The `.squad/team.md` file is missing. This file defines your team roster.

**Fix:** Run `squad init` to regenerate it, or create `.squad/team.md` manually with a `## Members` section.

---

#### ⚠️ `team.md` — missing `## Members` header

**Cause:** The file exists but doesn't contain the expected `## Members` markdown header that Squad uses to discover team members.

**Fix:** Add a `## Members` section to `.squad/team.md`:

```markdown
## Members

- **Kaylee** — Engineering Lead
- **Ralph** — GitHub Operations
```

---

#### ❌ `routing.md` — file not found

**Cause:** The `.squad/routing.md` file is missing. This file tells Squad how to route tasks to agents.

**Fix:** Run `squad init` to regenerate it, or create `.squad/routing.md` manually.

---

#### ❌ `agents/` directory — directory not found

**Cause:** No agent definitions exist. Squad needs at least one agent directory under `.squad/agents/`.

**Fix:** Run `squad init` to scaffold the default agents, or create `.squad/agents/<agent-name>/` directories manually.

---

#### ❌ `casting/registry.json` — file not found or invalid JSON

**Cause:** The casting registry is missing or corrupted. This file tracks agent role assignments.

**Fix:** Run `squad init` to regenerate it. If you need to preserve existing casting data, fix the JSON syntax in `.squad/casting/registry.json`.

---

#### ❌ `decisions.md` — file not found

**Cause:** The `.squad/decisions.md` file is missing. This file records team decisions for context continuity.

**Fix:** Create an empty `.squad/decisions.md` file:

```bash
touch .squad/decisions.md
```

---

### Reading the summary

Doctor output ends with a summary line:

```
Summary: 7 passed, 1 failed, 1 warnings
```

- **All passed:** Your setup is healthy.
- **Warnings:** Non-blocking issues worth fixing (e.g., absolute paths).
- **Failures:** Missing or broken files that will affect Squad behavior.

### Modes

Doctor detects three setup modes automatically:

| Mode | Trigger | Meaning |
|------|---------|---------|
| `local` | Default | Single-repo squad, everything in `.squad/` |
| `remote` | `config.json` has `teamRoot` | Dual-root setup with a separate team repo |
| `hub` | `squad-hub.json` exists in cwd | Hub layout for multi-project teams |

---

## Windows-specific issues

**Problem:** Path errors or file operations fail on Windows.

**Cause:** Some shell commands assume Unix-style paths.

**Fix:** Squad's core uses `path.join()` for all file operations and is Windows-safe. If you see path issues:
- Use PowerShell or Git Bash (not cmd.exe)
- Ensure git is in your PATH
- Ensure `gh` CLI is in your PATH
