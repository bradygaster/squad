# GITHUB_TOKEN vs GH_TOKEN: Environment Variable Precedence

**Added:** 2026-04-21 (H-13)  
**Applies to:** `withRoleToken`, `execWithRoleToken`, `spawnAgent`, and `gh` CLI usage  
**Audience:** Squad users, CI/CD operators, and GitHub Actions workflow authors

---

## The Two Environment Variables

| Variable | Primary User | Set By | Lifetime |
|----------|--------------|--------|----------|
| `GITHUB_TOKEN` | GitHub Actions, `git` operations via HTTPS | GitHub Actions runner | Workflow step duration |
| `GH_TOKEN` | `gh` CLI, API calls via SDK | Squad agents, manual `gh auth` | Session or process lifetime |

### What Each Controls

**`GITHUB_TOKEN`** (read by `git`, `gh` CLI as fallback)
- Automatically set by GitHub Actions runners in every workflow step
- Scoped to the workflow job (usually read-only repo + write to issues/PRs)
- Short-lived (workflow step duration)
- Automatically injected by Actions runners; can be overridden via the `permissions:` key or a step-level `env:` variable, but rarely needs to be

**`GH_TOKEN`** (read by `gh` CLI primarily)
- Set explicitly by Squad agents via `withRoleToken()` and `execWithRoleToken()`
- Scoped to GitHub App roles (e.g., `lead`, `backend`) — richer permissions
- Contains GitHub App installation tokens or personal access tokens
- Long-lived; persists for the duration of the process or until cleared

---

## How the SDK and CLI Pick One

### 1. Squad Agent Execution (`spawnAgent` in `packages/squad-cli/src/cli/shell/spawn.ts`)

When an agent is spawned:

1. **Resolve role identity** → looks up the agent's role from `.squad/agents/{name}.charter.md`
2. **Get role-scoped token** → calls `resolveToken(teamRoot, slug)` (from SDK identity system)
3. **Set `GH_TOKEN`** → `process.env['GH_TOKEN'] = injectedToken` (if token was resolved)
4. **Restore on exit** → restores the previous `GH_TOKEN` in a `finally` block

**Precedence for agents:**
```
GH_TOKEN (set by Squad) > GITHUB_TOKEN (ambient, from Actions or user)
```

When an agent spawns a child process (e.g., `git push`, `gh pr create`), that child inherits the `GH_TOKEN` set by Squad. The `gh` CLI will prefer `GH_TOKEN` over `GITHUB_TOKEN`.

### 2. Identity Fallback in `withRoleToken` and `execWithRoleToken` (SDK)

Both functions in `packages/squad-sdk/src/identity/exec.ts`:

1. **Call `resolveTokenWithDiagnostics(teamRoot, roleSlug)`** to get the role's token
2. **If token resolves**, set `process.env['GH_TOKEN'] = token`
3. **If token resolution fails**, **leave `GH_TOKEN` untouched**
   - Child processes see whatever `GH_TOKEN` was already set (could be empty)
   - `gh` CLI will fall back to `GITHUB_TOKEN` if `GH_TOKEN` is not set

This is the **graceful fallback** behavior: if identity isn't configured, the system doesn't break — it just continues with whatever ambient credentials are available.

### 3. GitHub Actions Context

When Squad runs inside GitHub Actions:

- **`GITHUB_TOKEN`** is auto-set by the runner (read-only repo scope by default)
- **`GH_TOKEN`** is **not** set by Actions; Squad agents set it when they spawn
- **Order of precedence:**
  1. `GH_TOKEN` (set by `spawnAgent` or SDK functions) ← **wins if set**
  2. `GITHUB_TOKEN` (auto-set by Actions) ← fallback
  3. Stored `gh auth` credentials (if neither env var is set)

---

## Common Confusion Scenarios

### Scenario 1: GitHub Actions Workflow + Squad Agent

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: squad ask release --mode async
```

**What happens:**
- `GITHUB_TOKEN` is auto-set to workflow token (read-only repo)
- Squad spawns the agent
- `spawnAgent` resolves `GH_TOKEN` from role identity → sets `process.env['GH_TOKEN'] = <app-token>`
- The agent's child processes see `GH_TOKEN` (app token) and prefer it over `GITHUB_TOKEN`
- Git operations use the app token (full permissions per app scope)

**Which wins?** `GH_TOKEN` (the app token) because Squad explicitly sets it, and `gh` CLI reads `GH_TOKEN` first.

---

### Scenario 2: Both `GITHUB_TOKEN` and `GH_TOKEN` are Set to Different Values

```bash
export GITHUB_TOKEN="ghp_my_personal_token"
export GH_TOKEN="ghu_app_installation_token"
gh pr create --title "test"
```

**What happens:**
- `gh` CLI reads `GH_TOKEN` first → uses the app token
- `GITHUB_TOKEN` is ignored by `gh` (though used by git over HTTPS)

**Which wins?** `GH_TOKEN`, because `gh` CLI prioritizes it.

---

### Scenario 3: User Has `gh auth login` Stored Credentials + Env Vars

```bash
# User has previously run: gh auth login
# This stores credentials in ~/.config/gh/hosts.yml

export GH_TOKEN=""  # explicitly empty
gh api user  # which credential is used?
```

**What happens:**
- `gh` CLI checks if `GH_TOKEN` env var is set AND non-empty
- If `GH_TOKEN` is empty string, `gh` treats it as unset
- Falls back to reading from `~/.config/gh/hosts.yml` (stored `gh auth` token)

**Precedence order (as enforced by `gh` CLI):**
1. `GH_TOKEN` env var (if non-empty) ← **wins if set**
2. `GITHUB_TOKEN` env var (if set)
3. Stored auth from `gh auth login` (in `~/.config/gh/hosts.yml`)

---

### Scenario 4: GH_TOKEN is Empty String vs Unset

```bash
# Scenario A: GH_TOKEN is empty string
export GH_TOKEN=""
gh api user
# → gh CLI treats it as unset; falls back to stored credentials

# Scenario B: GH_TOKEN is unset (deleted)
unset GH_TOKEN
gh api user
# → same behavior: gh CLI falls back to stored credentials

# Scenario C: GH_TOKEN is set to a valid token
export GH_TOKEN="ghu_abc123..."
gh api user
# → gh CLI uses this token immediately
```

**Rule:** Empty string and unset are equivalent to `gh` CLI — both trigger fallback.

---

## Recommended Usage

### For Squad Agents

✅ **Do this:**
- Squad agents automatically call `spawnAgent()` which sets `GH_TOKEN` for their spawned children
- Agent authors don't need to worry about token setup — it's handled transparently
- Child processes (shell commands, SDK calls) inherit `GH_TOKEN` automatically

### For CI/CD Workflows (GitHub Actions)

✅ **Do this:**
```yaml
# Option 1: Use the auto-set GITHUB_TOKEN (read-only repo + issues/PRs)
# This is the default; no explicit token needed
# Works for most read-only operations
- run: squad doctor

# Option 2: Use a custom PAT or GitHub App token
# Explicitly set it; unset the Actions auto-token if there's a conflict
env:
  GH_TOKEN: ${{ secrets.CUSTOM_APP_TOKEN }}
  # Optionally unset GITHUB_TOKEN to avoid confusion:
  GITHUB_TOKEN: ""
- run: squad ask release --mode async
```

### For Local Development

✅ **Do this:**
```bash
# Authorize gh CLI once
gh auth login

# Squad will use identity tokens; gh fallback uses stored credentials
squad ask my-task --mode async

# Or explicitly set GH_TOKEN for a single command
export GH_TOKEN="$(gh auth token)"
squad run release
```

---

## Decision Table: Which Token Wins?

| Context | `GH_TOKEN` Set? | `GITHUB_TOKEN` Set? | Stored `gh auth`? | **Token Used** | Notes |
|---------|---|---|---|---|---|
| Local dev | No | No | Yes | Stored `gh auth` | User's personal credentials |
| Local dev | Yes | No | Yes | `GH_TOKEN` | Explicit env var takes precedence |
| Local dev | No | Yes | Yes | `GITHUB_TOKEN` | Fallback to env var |
| GitHub Actions | No | Yes (auto) | No | `GITHUB_TOKEN` | Actions default; read-only |
| GitHub Actions | Yes | Yes (auto) | No | `GH_TOKEN` | Squad agent set it; overrides Actions |
| GitHub Actions | Yes (empty) | Yes (auto) | No | `GITHUB_TOKEN` | Empty env var is treated as unset |
| Squad agent spawn | Yes (set by SDK) | Yes/No | Maybe | `GH_TOKEN` | Always set by SDK; app token |

---

## How to Verify Which Token is Active

Use `squad identity explain <role>` to trace token resolution:

```bash
$ squad identity explain lead
  Config: ✅ found .squad/identity/apps/{slug}.json
  Key: ✅ found {path}/lead.pem
  JWT: ✅ valid RS256 header, no PEM errors
  API response: ✅ 200 OK, token exchange succeeded
  Active token: ghu_abc123... (expires in 8m 42s)
  Exported as: GH_TOKEN
```

The `Exported as: GH_TOKEN` line confirms that Squad is setting the `GH_TOKEN` environment variable for child processes.

For a manually-run command:

```bash
$ env | grep -E 'GITHUB_TOKEN|GH_TOKEN'
GITHUB_TOKEN=ghp_xyz...
GH_TOKEN=ghu_abc123...

$ gh api user --jq '.login' 2>&1 | head -1
# Uses GH_TOKEN (app token) because it's set and gh prefers it
```

---

## Troubleshooting

### Problem: Operations are using the wrong token

**Symptom:** `gh` or `git` commands are failing with permission errors, but you know the correct token is configured.

**Diagnosis:**
```bash
# Check what tokens are set
env | grep -E 'GITHUB_TOKEN|GH_TOKEN'

# Check what gh CLI actually uses
gh auth status
# Output shows: "Logged in to github.com as <login> ..."
# This tells you which token gh CLI picked
```

**Fix:**
- If you want Squad's app token: ensure `squad identity explain <role>` shows a resolved token
- If you want a different token: explicitly set `GH_TOKEN=<token>` before running commands
- If Squad isn't setting a token: check `.squad/identity/apps/` for missing config files

### Problem: Token precedence seems backwards

**Symptom:** `GH_TOKEN` is set but `gh` commands are using `GITHUB_TOKEN` instead.

**Common cause:** `GH_TOKEN` is set to an empty string or contains whitespace.

**Fix:**
```bash
# Verify GH_TOKEN is non-empty
echo "GH_TOKEN length: ${#GH_TOKEN}"

# If empty, unset it
unset GH_TOKEN

# Verify gh auth status again
gh auth status
```

---

## Summary

| Use Case | Primary Token | Fallback | Who Sets It |
|----------|---|---|---|
| Squad agents (`spawnAgent`) | `GH_TOKEN` (app token) | `GITHUB_TOKEN` if unset | SDK automatically |
| GitHub Actions (no Squad) | `GITHUB_TOKEN` | Stored `gh auth` | Actions runner |
| GitHub Actions + Squad | `GH_TOKEN` (app token) | `GITHUB_TOKEN` if unset | SDK during spawn |
| Local development | Stored `gh auth` (when no env vars set) | `GH_TOKEN`, then `GITHUB_TOKEN` | User or script |

**Golden rule:** Squad agents always export `GH_TOKEN` when identity is configured. This token takes precedence over `GITHUB_TOKEN` because the `gh` CLI reads `GH_TOKEN` first.
