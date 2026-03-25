# Frequently asked questions

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Common questions, troubleshooting tips, and clarifications based on community feedback. Can't find your answer? [Open an issue](https://github.com/bradygaster/squad/issues/new).

---

## Which CLI should I use?

**Short answer:** Use **GitHub Copilot CLI** or **Claude Code CLI** for day-to-day work. Use **Squad CLI** for setup, diagnostics, and specific features.

**Why provider CLI (Copilot or Claude Code)?**
- Full agent spawning capabilities
- Access to all Squad features through natural conversation
- Model selection and background execution
- No manual commands — just describe what you need

**When to use Squad CLI:**
- Initial setup: `squad init`
- Diagnostics: `squad doctor`
- Continuous triage: `squad triage --interval 10`
- Aspire dashboard: `squad aspire`
- Export/import: `squad export` and `squad import`
- Remote phone access: `squad start --tunnel`

**Common workflow pattern:**
```bash
# Terminal 1: Run continuous triage
squad triage --interval 10

# Terminal 2: Work with your team (Copilot)
copilot --agent squad

# or (Claude Code)
claude --agent squad
```

For a detailed feature comparison, see [Client Compatibility Matrix](../scenarios/client-compatibility.md).

---

## Why doesn't `gh issue edit --add-assignee "@copilot"` work?

**Problem:** Running `gh issue edit <number> --add-assignee "@copilot"` (or variants like `copilot-swe-agent[bot]`) fails locally, even with a Personal Access Token.

**Why this happens:** The GitHub Copilot coding agent is a bot account. Bot accounts cannot be assigned to issues via the GitHub CLI in the same way as human users — the GitHub API restricts direct assignment of bot accounts through standard endpoints.

**Recommended workaround:** Use **label-based assignment** through the GitHub Actions workflow:

1. Add the `squad:copilot` label to the issue:
   ```bash
   gh issue edit <number> --add-label "squad:copilot"
   ```

2. The auto-assign workflow (`.github/workflows/squad-copilot-auto-assign.yml`) detects the label and assigns @copilot automatically.

**Prerequisites for auto-assign:**
- You must create a **GitHub Classic Personal Access Token** with `repo` scope
- Add it as a repository secret: `gh secret set COPILOT_ASSIGN_TOKEN`
- The workflow uses this token to perform the assignment on your behalf

See [Copilot Coding Agent](../features/copilot-coding-agent.md) for full setup instructions.

---

## I don't see anything on the Aspire dashboard

**Problem:** You ran `squad aspire` and opened the dashboard, but no telemetry is showing up.

**Why this happens:** The Aspire dashboard integration **requires the Squad CLI**. It is not available when using GitHub Copilot CLI directly.

**How to fix:**
1. Ensure you started Aspire with the Squad CLI:
   ```bash
   squad aspire
   ```

2. Confirm the container is running:
   ```bash
   docker ps | grep aspire-dashboard
   ```

3. Look for the dashboard URL in the output (usually `http://localhost:18888`)

4. Run a Squad CLI command that generates telemetry:
   ```bash
   squad doctor
   squad triage
   ```

5. Refresh the Aspire dashboard — you should see traces, metrics, and logs appear

**Note:** Provider CLI sessions (Copilot/Claude) do **not** send telemetry to Aspire. Only Squad CLI commands emit OpenTelemetry data to the dashboard.

See [Using Squad with the Aspire Dashboard](../scenarios/aspire-dashboard.md) for details.

---

## `squad doctor` complains about absolute path for teamRoot

**Problem:** Running `squad doctor` shows a warning like:

```
⚠ teamRoot uses absolute path — consider making it relative
```

**Why this matters:** Absolute paths (e.g., `C:\Users\me\squad\` or `/Users/me/squad/`) break portability. If you share the squad with a teammate or clone it to a new machine, the absolute path won't resolve correctly.

**How to fix:** Make the `teamRoot` path **relative to the project root**.

**Example — Before (absolute):**
```json
{
  "teamRoot": "C:\\Users\\me\\repos\\my-team\\.squad"
}
```

**Example — After (relative):**
```json
{
  "teamRoot": ".squad"
}
```

**For linked teams (dual-root mode):**

If your project links to a remote team repository:

```json
{
  "teamRoot": "../team-repo/.squad"
}
```

The path should be relative to your **project root** (where `.squad/` or `squad.config.ts` lives), not to the `.squad/` directory itself.

**Verify the fix:**
```bash
squad doctor
```

You should see `✓ teamRoot is relative` or no warning.

---

## Can I use Squad CLI with Copilot CLI or Claude Code CLI at the same time?

Yes! They complement each other:

- **Squad CLI** provides infrastructure: triage, Aspire observability, export/import, diagnostics
- **Copilot CLI or Claude Code CLI** provides conversational interface to your team

**Recommended setup:**
- Run `squad triage --interval 10` in a dedicated terminal (or as a cron job / GitHub Action)
- Use `copilot --agent squad` or `claude --agent squad` (or `@squad` in VS Code) for team interactions
- Use `squad doctor` or `squad aspire` for diagnostics when needed

Both CLIs read and write the same `.squad/` directory, so state stays synchronized.

---

## What's the difference between Ralph and triage?

**Ralph** and **triage** are different names for the same functionality:

- **`squad ralph`** is the legacy command name
- **`squad triage`** is the new primary command name (as of v0.8.26)
- Both commands do the same thing: monitor GitHub issues, apply routing rules, and assign work to team members

**Migration path:**
- Existing scripts using `squad ralph` will continue to work (it's an alias)
- New projects should use `squad triage` in documentation and automation
- The `ralph/` directory in `.squad/` remains unchanged for backward compatibility

---

## How do I add a new agent to my squad?

**In conversation (recommended):**

```
copilot --agent squad
> @squad I want to add a new agent
> Role: Security specialist
> Name: Guardian
> Expertise: OWASP, dependency scanning, secrets detection
```

Squad will create the charter, update the team roster, and add routing rules.

**Manual creation:**

1. Create a charter file in `.squad/agents/<name>/charter.md`
2. Update `.squad/team.md` to include the new agent in the roster
3. Add routing rules in `.squad/routing.md` (if applicable)
4. Optionally add a history file in `.squad/agents/<name>/history.md`

See [Team Setup](../features/team-setup.md) for details.

---

## What happens if I run `squad init` twice?

Nothing breaks! `squad init` is **idempotent** — it's safe to run multiple times.

**What it does:**
- Checks if `.squad/` exists; if yes, does nothing
- Copies missing templates to `.squad/`
- Updates `.github/workflows/` with Squad Actions (skips existing files)
- Adds `.github/agents/squad.agent.md` if missing

**Use cases:**
- Recover from partial initialization
- Update workflows after a Squad upgrade
- Add missing templates without overwriting custom changes

---

## Can I use Squad without GitHub Issues?

Yes, but with limitations.

**What works without GitHub Issues:**
- Conversational team interaction (`@squad`, `copilot --agent squad`)
- Agent spawning and parallel execution
- Memory, decisions, and knowledge sharing
- Skills and ceremonies
- Export/import for portability

**What requires GitHub Issues:**
- Ralph/triage auto-assignment
- Issue-driven development workflows
- Project board integration
- Label-based routing
- Copilot coding agent auto-assignment

If you're using GitLab, see [GitLab Issues](../features/gitlab-issues.md) for integration options.

---

## How do I reset my squad without losing decisions?

**Option 1: Archive and start fresh**
```bash
# Export current state
squad export --out backup-$(date +%Y%m%d).json

# Remove .squad/
rm -rf .squad/

# Reinitialize
squad init
```

Manually copy decisions from the backup JSON or `.squad/decisions.md` if you archived it separately.

**Option 2: Selective cleanup**
```bash
# Remove agent state but keep team structure
rm -rf .squad/agents/*/history.md
rm -rf .squad/sessions/

# Keep .squad/decisions.md, .squad/team.md, .squad/routing.md
```

See [Disaster Recovery](../scenarios/disaster-recovery.md) for more recovery patterns.

---

## Where should I report bugs or request features?

[Open an issue on GitHub](https://github.com/bradygaster/squad/issues/new) with:
- **Environment:** OS, Node.js version, Squad version (`squad --version`)
- **Reproduction steps:** What you ran, what happened, what you expected
- **Output:** Copy the full terminal output, including any errors

For questions or discussions, use [GitHub Discussions](https://github.com/bradygaster/squad/discussions).
